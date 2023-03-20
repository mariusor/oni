package oni

import (
	"bytes"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"git.sr.ht/~mariusor/lw"
	ct "github.com/elnormous/contenttype"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/client"
	"github.com/go-ap/errors"
	json "github.com/go-ap/jsonld"
	"github.com/go-ap/processing"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/mariusor/render"
)

// NotFound is a generic method to return an 404 error HTTP handler that
func (o *oni) NotFound(w http.ResponseWriter, r *http.Request) {
	o.Error(errors.NotFoundf("%s not found", r.URL.Path)).ServeHTTP(w, r)
}

func (o *oni) Error(err error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		acceptableMediaTypes := []ct.MediaType{textHTML, applicationJson}
		accepted, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
		if !checkAcceptMediaType(accepted)(textHTML) {
			errors.HandleError(err).ServeHTTP(w, r)
			return
		}
		errs := errors.HttpErrors(err)
		oniFn := template.FuncMap{
			"ONI":   func() vocab.Actor { return o.oniActor(r) },
			"Title": func() string { return http.StatusText(errors.HttpStatus(err)) },
		}
		templatePath := "components/errors"
		wrt := bytes.Buffer{}
		if err := ren.HTML(&wrt, http.StatusOK, templatePath, errs, render.HTMLOptions{Funcs: oniFn}); err != nil {
			errors.HandleError(err).ServeHTTP(w, r)
			return
		}
		io.Copy(w, &wrt)
	}
}

func (o *oni) setupOauthRoutes(m chi.Router) {
	m.HandleFunc("/oauth/authorize", o.Authorize)
	m.HandleFunc("/oauth/token", o.Token)
}

func (o *oni) setupRoutes(actors []vocab.Actor) {
	m := chi.NewMux()

	if len(actors) == 0 {
		m.HandleFunc("/", o.NotFound)
		return
	}
	m.Use(Log(o.l))
	o.setupActivityPubRoutes(m)
	o.setupOauthRoutes(m)
	o.setupStaticRoutes(m)
	o.setupWebfingerRoutes(m)

	o.m = m
}

func (o *oni) setupStaticRoutes(m chi.Router) {
	var fsServe http.HandlerFunc
	if assetFilesFS, err := fs.Sub(AssetsFS, "static"); err == nil {
		fsServe = func(w http.ResponseWriter, r *http.Request) {
			http.FileServer(http.FS(assetFilesFS)).ServeHTTP(w, r)
		}
	} else {
		fsServe = o.Error(err).ServeHTTP
	}
	m.Handle("/main.js", fsServe)
	m.Handle("/main.js.map", fsServe)
	m.Handle("/main.css", fsServe)
	m.HandleFunc("/icons.svg", fsServe)
	m.HandleFunc("/favicon.ico", o.NotFound)
}

func (o *oni) setupWebfingerRoutes(m chi.Router) {
	// TODO(marius): we need the nodeinfo handlers also
	m.HandleFunc("/.well-known/webfinger", HandleWebFinger(*o))
	m.HandleFunc("/.well-known/host-meta", HandleHostMeta(*o))
}

func (o *oni) setupActivityPubRoutes(m chi.Router) {
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"https://*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
		Debug:            true,
	})
	c.Log, _ = o.l.WithContext(lw.Ctx{"log": "cors"}).(cors.Logger)
	m.Group(func(m chi.Router) {
		m.Use(c.Handler)
		m.HandleFunc("/*", o.ActivityPubItem)
	})
}

func (o *oni) ServeBinData(it vocab.Item) http.HandlerFunc {
	if vocab.IsNil(it) {
		return o.Error(errors.NotFoundf("not found"))
	}
	var contentType string
	var raw []byte
	err := vocab.OnObject(it, func(ob *vocab.Object) error {
		var err error
		if !isData(ob.Content) {
			return errors.NotSupportedf("invalid object")
		}
		if contentType, raw, err = getBinData(ob.Content); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return o.Error(err)
	}
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(raw)))
		w.Write(raw)
	}
}

func loadItemFromStorage(s processing.ReadStore, iri vocab.IRI) (vocab.Item, error) {
	it, err := s.Load(iri)
	if err != nil {
		return nil, err
	}

	if it.GetID().Equals(iri, true) {
		return it, nil
	}

	tryInActivity, prop := propNameInIRI(iri)
	u, _ := iri.URL()
	if !tryInActivity || u.Path == "/" {
		return it, err
	}
	u.Path = filepath.Clean(filepath.Join(u.Path, "../"))
	actIRI := vocab.IRI(u.String())
	if iri.Equals(actIRI, true) {
		return nil, errors.Errorf("bu %s : %s", iri, actIRI)
	}
	act, err := s.Load(actIRI)
	if err != nil {
		return nil, err
	}
	if vocab.ActivityTypes.Contains(act.GetType()) {
		err = vocab.OnActivity(act, func(act *vocab.Activity) error {
			if prop == "object" {
				it = act.Object
			} else if prop == "actor" {
				it = act.Actor
			} else {
				return iriNotFound(actIRI)
			}
			return nil
		})
	} else {
		err = vocab.OnObject(act, func(ob *vocab.Object) error {
			if prop == "icon" {
				it = ob.Icon
			} else if prop == "image" {
				it = ob.Image
			} else {
				return iriNotFound(actIRI)
			}

			return nil
		})
	}
	if vocab.IsIRI(it) && !it.GetLink().Equals(iri, true) {
		return loadItemFromStorage(s, it.GetLink())
	}

	return it, err
}

var propertiesThatMightBeObjects = []string{"object", "actor", "target", "icon", "image"}

func propNameInIRI(iri vocab.IRI) (bool, string) {
	u, _ := iri.URL()
	base := filepath.Base(u.Path)
	for _, prop := range propertiesThatMightBeObjects {
		if strings.ToLower(prop) == strings.ToLower(base) {
			return true, prop
		}
	}
	return false, ""
}

func (o *oni) ServeActivityPubItem(it vocab.Item) http.HandlerFunc {
	dat, err := json.WithContext(json.IRI(vocab.ActivityBaseURI), json.IRI(vocab.SecurityContextURI)).Marshal(it)
	if err != nil {
		return o.Error(err)
	}

	return func(w http.ResponseWriter, r *http.Request) {
		vocab.OnObject(it, func(o *vocab.Object) error {
			updatedAt := o.Published
			if !o.Updated.IsZero() {
				updatedAt = o.Updated
			}
			if !updatedAt.IsZero() {
				w.Header().Set("Last-Modified", updatedAt.Format(time.RFC1123))
			}
			if vocab.ActivityTypes.Contains(o.Type) {
				w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", int(8766*time.Hour.Seconds())))
			} else {
				w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", int(24*time.Hour.Seconds())))
			}
			return nil
		})
		status := http.StatusOK
		if it.GetType() == vocab.TombstoneType {
			status = http.StatusGone
		}
		w.Header().Set("Content-Type", json.ContentType)
		w.WriteHeader(status)
		if r.Method == http.MethodGet {
			w.Write(dat)
		}
	}
}

func orderItems(col vocab.ItemCollection) vocab.ItemCollection {
	sort.SliceStable(col, func(i, j int) bool {
		return vocab.ItemOrderTimestamp(col[i], col[j])
	})
	return col
}

func notAcceptable(err error) func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		return nil, http.StatusNotAcceptable, errors.NewMethodNotAllowed(err, "current instance does not federate")
	}
}

func validContentType(c string) bool {
	if c == client.ContentTypeActivityJson || c == client.ContentTypeJsonLD {
		return true
	}

	return false
}

var validActivityCollections = vocab.CollectionPaths{vocab.Outbox, vocab.Inbox}

func validActivityCollection(r *http.Request) bool {
	return validActivityCollections.Contains(processing.Typer.Type(r))
}

func ValidateRequest(r *http.Request) (bool, error) {
	contType := r.Header.Get("Content-Type")
	if r.Method != http.MethodPost {
		return false, errors.MethodNotAllowedf("invalid HTTP method")
	}
	if !validContentType(contType) {
		return false, errors.NotValidf("invalid content type")
	}
	if !validActivityCollection(r) {
		return false, errors.NotValidf("invalid collection")
	}

	return true, nil
}

var jsonLD, _ = ct.ParseMediaType(fmt.Sprintf("%s;q=0.8", client.ContentTypeJsonLD))
var activityJson, _ = ct.ParseMediaType(fmt.Sprintf("%s;q=0.8", client.ContentTypeActivityJson))
var applicationJson, _ = ct.ParseMediaType("application/json;q=0.8")
var textHTML, _ = ct.ParseMediaType("text/html;q=1.0")
var imageAny, _ = ct.ParseMediaType("image/*;q=1.0")

func getWeight(m ct.MediaType) int {
	q, ok := m.Parameters["q"]
	if !ok {
		return 0
	}
	w, err := strconv.ParseFloat(q, 32)
	if err != nil {
		return 0
	}
	return int(w * 1000)
}

func checkAcceptMediaType(accepted ct.MediaType) func(check ...ct.MediaType) bool {
	return func(check ...ct.MediaType) bool {
		for _, c := range check {
			if accepted.Type == c.Type && (c.Subtype == "*" || accepted.Subtype == c.Subtype) {
				return getWeight(c) >= getWeight(accepted)
			}
		}
		return false
	}
}

var iriNotFound = func(iri vocab.IRI) error {
	return errors.NotFoundf("%s not found", iri)
}

func getItemAcceptedContentType(it vocab.Item, r *http.Request) func(check ...ct.MediaType) bool {
	acceptableMediaTypes := make([]ct.MediaType, 0)

	vocab.OnObject(it, func(ob *vocab.Object) error {
		if ob.MediaType != "" {
			if mt, err := ct.ParseMediaType(string(ob.MediaType)); err == nil {
				mt.Parameters["q"] = "1.0"
				acceptableMediaTypes = append([]ct.MediaType{mt}, acceptableMediaTypes...)
			}
		} else {
			acceptableMediaTypes = append(acceptableMediaTypes, textHTML)
		}
		return nil
	})
	acceptableMediaTypes = append(acceptableMediaTypes, jsonLD, activityJson, applicationJson)

	accepted, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
	if accepted.Type == "" {
		accepted = textHTML
	}
	return checkAcceptMediaType(accepted)
}

func loadResultIntoCollectionPage(iri vocab.IRI, it vocab.ItemCollection) (vocab.CollectionInterface, error) {
	// NOTE(marius): the IRI of the Collection is w/o the filters to load the Actor and Object
	res := vocab.OrderedCollectionPage{
		ID:   iri,
		Type: vocab.OrderedCollectionPageType,
	}
	var err error
	if vocab.IsItemCollection(it) {
		err = vocab.OnItemCollection(it, func(col *vocab.ItemCollection) error {
			res.OrderedItems = *col
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	err = vocab.OnCollectionIntf(it, func(items vocab.CollectionInterface) error {
		res.OrderedItems = orderItems(items.Collection())
		res.TotalItems = res.OrderedItems.Count()
		return nil
	})
	if err != nil {
		return nil, err
	}
	return PaginateCollection(&res)
}

func actorURLs(act vocab.Actor) func() vocab.IRIs {
	urls := make(vocab.IRIs, 0)
	if vocab.IsItemCollection(act.URL) {
		vocab.OnItemCollection(act.URL, func(col *vocab.ItemCollection) error {
			for _, u := range *col {
				urls.Append(u.GetLink())
			}
			return nil
		})
	} else if !vocab.IsNil(act.URL) {
		urls.Append(act.URL.GetLink())
	}
	return func() vocab.IRIs {
		return urls
	}
}

func (o *oni) ActivityPubItem(w http.ResponseWriter, r *http.Request) {
	iri := irif(r)
	if vocab.ValidCollectionIRI(iri) {
		if r.Method == http.MethodPost {
			o.ProcessActivity().ServeHTTP(w, r)
			return
		}

		types := make(vocab.ActivityVocabularyTypes, 0)
		_, whichCollection := vocab.Split(iri)
		if (vocab.CollectionPaths{vocab.Outbox, vocab.Inbox}).Contains(whichCollection) {
			types = append(types, vocab.CreateType)
		}
		iri = colIRI(r, types...)
	}

	it, err := loadItemFromStorage(o.s, iri)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}
	if vocab.IsNil(it) {
		o.Error(iriNotFound(iri)).ServeHTTP(w, r)
		return
	}

	accepts := getItemAcceptedContentType(it, r)
	switch {
	case accepts(jsonLD, activityJson, applicationJson):
		o.ServeActivityPubItem(it).ServeHTTP(w, r)
	case accepts(imageAny):
		o.ServeBinData(it).ServeHTTP(w, r)
	case accepts(textHTML):
		fallthrough
	default:
		oniActor := o.oniActor(r)
		oniFn := template.FuncMap{
			"ONI":   func() vocab.Actor { return oniActor },
			"URLS":  actorURLs(oniActor),
			"Title": titleFromActor(oniActor),
		}
		templatePath := "components/person"
		if !vocab.ActorTypes.Contains(it.GetType()) {
			templatePath = "components/item"
		}
		wrt := bytes.Buffer{}
		if err := ren.HTML(&wrt, http.StatusOK, templatePath, it, render.HTMLOptions{Funcs: oniFn}); err != nil {
			o.Error(err).ServeHTTP(w, r)
			return
		}
		io.Copy(w, &wrt)
	}
}

func (o *oni) oniActor(r *http.Request) vocab.Actor {
	reqIRI := irif(r)
	for _, a := range o.a {
		if reqIRI.Contains(a.ID, false) {
			return a
		}
	}
	return auth.AnonymousActor
}

func titleFromActor(o vocab.Actor) func() template.HTML {
	return func() template.HTML {
		return template.HTML(o.PreferredUsername.First().String())
	}
}

func col(r *http.Request) vocab.CollectionPath {
	if r.URL == nil || len(r.URL.Path) == 0 {
		return vocab.Unknown
	}
	col := vocab.Unknown
	pathElements := strings.Split(r.URL.Path[1:], "/") // Skip first /
	for i := len(pathElements) - 1; i >= 0; i-- {
		col = vocab.CollectionPath(pathElements[i])
		if vocab.ValidObjectCollection(col) || vocab.ValidActivityCollection(col) {
			return col
		}
	}

	return col
}

func colIRI(r *http.Request, types ...vocab.ActivityVocabularyType) vocab.IRI {
	colURL := url.URL{Scheme: "https", Host: r.Host, Path: r.URL.Path}
	c := col(r)
	if vocab.ValidActivityCollection(c) {
		q := r.URL.Query()
		q.Set("object.iri", "!")
		q.Set("actor.iri", "!")
		for _, t := range types {
			q.Add("type", string(t))
		}
		q.Set("maxItems", "20")
		colURL.RawQuery = q.Encode()
	}
	return vocab.IRI(colURL.String())
}

const MaxItems = 20

func paginateItems(col vocab.ItemCollection, count int) (vocab.ItemCollection, vocab.IRI, vocab.IRI, error) {
	var prev, next vocab.IRI
	if vocab.IsNil(col) {
		return nil, prev, next, nil
	}
	if count == 0 {
		count = MaxItems
	}

	start := 0
	cnt := len(col)
	prev = col[start].GetLink()
	next = col[cnt-1].GetLink()
	return col, prev, next, nil
}

func getURL(i vocab.IRI, f url.Values) vocab.IRI {
	if f == nil {
		return i
	}
	if u, err := i.URL(); err == nil {
		u.RawQuery = f.Encode()
		i = vocab.IRI(u.String())
	}
	return i
}

// PaginateCollection is a function that populates the received collection
func PaginateCollection(col vocab.CollectionInterface) (vocab.CollectionInterface, error) {
	if col == nil {
		return col, errors.Newf("unable to paginate nil collection")
	}

	u, _ := col.GetLink().URL()
	u.User = nil
	q := u.Query()
	u.RawQuery = ""
	baseURL := vocab.IRI(u.String())
	curURL := getURL(baseURL, q)

	var haveItems bool
	var prev, next vocab.IRI // IRIs

	mi, _ := strconv.ParseInt(q.Get("maxItems"), 10, 32)
	maxItems := int(mi)
	haveItems = col.Count() > 0

	ordered := vocab.ActivityVocabularyTypes{
		vocab.OrderedCollectionPageType,
		vocab.OrderedCollectionType,
	}
	unOrdered := vocab.ActivityVocabularyTypes{
		vocab.CollectionPageType,
		vocab.CollectionType,
	}

	// TODO(marius): refactor this with OnCollection functions
	if haveItems {
		var firstURL vocab.IRI

		fp := u.Query()

		firstURL = getURL(baseURL, fp)
		if col.GetType() == vocab.CollectionOfItems {
			err := vocab.OnItemCollection(col, func(items *vocab.ItemCollection) error {
				*items, _, _, _ = paginateItems(items.Collection(), maxItems)
				return nil
			})
			return col, err
		}
		if ordered.Contains(col.GetType()) {
			vocab.OnOrderedCollection(col, func(oc *vocab.OrderedCollection) error {
				if len(firstURL) > 0 {
					oc.First = firstURL
				}
				oc.Current = curURL
				oc.OrderedItems, prev, next, _ = paginateItems(oc.OrderedItems, maxItems)
				return nil
			})
		}
		if unOrdered.Contains(col.GetType()) {
			vocab.OnCollection(col, func(c *vocab.Collection) error {
				c.Current = curURL
				if len(firstURL) > 0 {
					c.First = firstURL
				}
				c.Items, prev, next, _ = paginateItems(c.Items, maxItems)

				return nil
			})
		}
		var nextURL, prevURL vocab.IRI
		if len(next) > 0 {
			np := u.Query()
			np.Add("after", next.String())
			nextURL = getURL(baseURL, np)
		}
		if len(prev) > 0 {
			pp := u.Query()
			pp.Add("before", prev.String())
			prevURL = getURL(baseURL, pp)
		}

		if col.GetType() == vocab.OrderedCollectionPageType {
			vocab.OnOrderedCollectionPage(col, func(c *vocab.OrderedCollectionPage) error {
				c.PartOf = baseURL
				if len(nextURL) > 0 {
					c.Next = nextURL
				}
				if len(prevURL) > 0 {
					c.Prev = prevURL
				}
				return nil
			})
		}
		if col.GetType() == vocab.CollectionPageType {
			vocab.OnCollectionPage(col, func(c *vocab.CollectionPage) error {
				c.PartOf = baseURL
				if len(nextURL) > 0 {
					c.Next = nextURL
				}
				if len(prevURL) > 0 {
					c.Prev = prevURL
				}
				return nil
			})
		}
	}
	updatedAt := time.Time{}
	for _, it := range col.Collection() {
		vocab.OnObject(it, func(o *vocab.Object) error {
			if o.Published.Sub(updatedAt) > 0 {
				updatedAt = o.Published
			}
			if o.Updated.Sub(updatedAt) > 0 {
				updatedAt = o.Updated
			}
			return nil
		})
	}
	vocab.OnObject(col, func(o *vocab.Object) error {
		o.Updated = updatedAt
		return nil
	})

	return col, nil
}

func acceptFollows(o oni, f vocab.Follow, p *processing.P) error {
	accept := new(vocab.Accept)
	accept.Type = vocab.AcceptType
	accept.CC = append(accept.CC, vocab.PublicNS)
	accept.InReplyTo = f.GetID()
	accept.Object = f.GetID()

	for _, act := range o.a {
		if act.ID.Equals(f.Object.GetID(), true) {
			accept.Actor = act
			o.c.SignFn(s2sSignFn(act, o))
		}
	}

	oniOutbox := vocab.Outbox.IRI(accept.Actor)
	processing.SetID(accept, oniOutbox, nil)
	if _, err := o.s.Save(accept); err != nil {
		o.l.Errorf("Failed saving activity %T[%s]: %+s", accept, accept.Type, err)
		return err
	}
	_, err := processing.AcceptActivity(*p, accept, oniOutbox)
	if err != nil {
		o.l.Errorf("Failed processing %T[%s]: %s: %+s", accept, accept.Type, accept.ID, err)
		return err
	}
	o.l.Infof("Accepted Follow: %s", f.ID)
	return nil
}

func IRIsContain(iris vocab.IRIs) func(i vocab.IRI) bool {
	return func(i vocab.IRI) bool {
		return iris.Contains(i)
	}
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func (o *oni) ProcessActivity() processing.ActivityHandlerFn {
	auth, err := auth.New(
		auth.WithStorage(o.s),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "auth"})),
		auth.WithClient(o.c),
	)
	if err != nil {
		o.l.WithContext(lw.Ctx{"err": err}).Errorf("invalid authorization mw")
		return notAcceptable(err)
	}

	baseIRIs := make(vocab.IRIs, 0)
	for _, act := range o.a {
		baseIRIs.Append(act.GetID())
	}
	processor, err := processing.New(
		processing.WithIRI(baseIRIs...), processing.WithClient(o.c), processing.WithStorage(o.s),
		processing.WithLogger(o.l.WithContext(lw.Ctx{"log": "processing"})), processing.WithIDGenerator(GenerateID),
		processing.WithLocalIRIChecker(IRIsContain(baseIRIs)),
	)
	if err != nil {
		o.l.WithContext(lw.Ctx{"err": err}).Errorf("invalid processing mw")
		return notAcceptable(err)
	}

	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		var it vocab.Item

		act, err := auth.LoadActorFromAuthHeader(r)
		if err != nil {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("unable to load an authorized Actor from request")
		}

		if ok, err := ValidateRequest(r); !ok {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed request validation")
			return it, errors.HttpStatus(err), err
		}
		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) == 0 {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed loading body")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to read request body")
		}
		defer func() {
			fn := fmt.Sprintf("%s/%s.req", o.StoragePath, time.Now().UTC().Format(time.RFC3339))
			all := bytes.Buffer{}
			r.Header.Write(&all)
			all.Write([]byte{'\n', '\n'})
			all.Write(body)
			os.WriteFile(fn, all.Bytes(), 0660)
		}()
		if it, err = vocab.UnmarshalJSON(body); err != nil {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed unmarshalling jsonld body")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to unmarshal JSON request")
		}

		if err != nil {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed initializing the Activity processor")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to initialize processor")
		}
		processor.SetActor(&act)

		vocab.OnActivity(it, func(a *vocab.Activity) error {
			// TODO(marius): this should be handled in the processing package
			if a.AttributedTo == nil {
				a.AttributedTo = act
			}
			return nil
		})
		if it, err = processor.ProcessActivity(it, receivedIn); err != nil {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed processing activity")
			err = errors.Annotatef(err, "Can't save %q activity to %s", it.GetType(), receivedIn)
			return it, errors.HttpStatus(err), err
		}

		if it.GetType() == vocab.FollowType {
			defer func() {
				go func() {
					time.Sleep(300 * time.Millisecond)

					err := vocab.OnActivity(it, func(a *vocab.Activity) error {
						return acceptFollows(*o, *a, processor)
					})
					if err != nil {
						o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("unable to automatically accept follow")
					}
				}()
			}()
		}

		status := http.StatusCreated
		if it.GetType() == vocab.DeleteType {
			status = http.StatusGone
		}

		return it, status, nil
	}
}

func Log(l lw.Logger) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			entry := req(l, r)
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			buf := bytes.NewBuffer(make([]byte, 0, 512))
			ww.Tee(buf)

			t1 := time.Now()
			defer func() {
				var respBody []byte
				if ww.Status() >= 400 {
					respBody, _ = io.ReadAll(buf)
				}
				entry.Write(ww.Status(), ww.BytesWritten(), ww.Header(), time.Since(t1), respBody)
			}()

			next.ServeHTTP(ww, middleware.WithLogEntry(r, entry))
		}
		return http.HandlerFunc(fn)
	}
}

type reqLogger struct {
	lw.Logger
}

func (r reqLogger) Write(status, bytes int, header http.Header, elapsed time.Duration, extra interface{}) {
	ctx := lw.Ctx{
		"st":   status,
		"size": bytes,
	}
	if elapsed > 0 {
		ctx["elapsed"] = elapsed
	}

	var logFn func(string, ...any)

	switch {
	case status <= 0:
		logFn = r.Logger.WithContext(ctx).Warnf
	case status < 400: // for codes in 100s, 200s, 300s
		logFn = r.Logger.WithContext(ctx).Infof
	case status >= 400 && status < 500:
		logFn = r.Logger.WithContext(ctx).Warnf
	case status >= 500:
		logFn = r.Logger.WithContext(ctx).Errorf
	default:
		logFn = r.Logger.WithContext(ctx).Infof
	}
	logFn(http.StatusText(status))
}

func (r reqLogger) Panic(v interface{}, stack []byte) {
	r.Logger.WithContext(lw.Ctx{"panic": v}).Tracef("")
}

func req(l lw.Logger, r *http.Request) reqLogger {
	ctx := lw.Ctx{
		"method": r.Method,
		"iri":    irif(r),
	}

	if acc := r.Header.Get("Accept"); acc != "" {
		ctx["accept"] = acc
	}
	if ua := r.Header.Get("User-Agent"); ua != "" {
		ctx["ua"] = ua
	}

	return reqLogger{l.WithContext(ctx)}
}
