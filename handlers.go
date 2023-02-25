package oni

import (
	"bytes"
	"fmt"
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
	"golang.org/x/oauth2"
)

// NotFound is a generic method to return an 404 error HTTP handler that
func (o *oni) NotFound(w http.ResponseWriter, r *http.Request) {
	o.Error(errors.NotFoundf("%s not found", r.URL.Path)).ServeHTTP(w, r)
}

func (o *oni) Error(err error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer o.logRequest(r, errors.HttpStatus(err), time.Now().UTC())
		errors.HandleError(err).ServeHTTP(w, r)
	}
}

func (o *oni) collectionRoutes(collections ...vocab.CollectionPath) {
	actor := o.a
	base, ok := IRIPath(actor.ID)
	for _, collection := range collections {
		path := base + string(collection)
		if !ok {
			o.m.HandleFunc(path, o.NotFound)
			continue
		}
		if !CollectionExists(actor, collection) {
			o.m.HandleFunc(path, o.NotFound)
			continue
		}
		colPath, ok := IRIPath(collection.Of(actor.GetLink()).GetLink())
		if !ok {
			o.m.HandleFunc(path, o.NotFound)
			continue
		}

		o.m.HandleFunc(colPath, o.OnCollectionHandler)
		o.m.HandleFunc(colPath+"/", o.OnItemHandler)
	}
}

func (o *oni) setupOauthRoutes() {
	base, _ := IRIPath(o.a.ID)

	as, err := auth.New(
		auth.WithURL(base),
		auth.WithStorage(o.s),
		auth.WithClient(o.c),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "osin"})),
	)
	if err != nil {
		o.l.Errorf("unable to initialize OAuth2 server")
		return
	}

	h := authService{
		baseIRI: vocab.IRI(base),
		self:    o.a,
		storage: o.s,
		auth:    *as,
		logger:  o.l.WithContext(lw.Ctx{"log": "oauth"}),
	}
	o.m.HandleFunc("/login", h.HandleLogin)
	o.m.HandleFunc("/oauth/authorize", h.Authorize)
	o.m.HandleFunc("/oauth/token", h.Token)

	//o.m.HandleFunc("/login", h.ShowLogin)
	//o.m.HandleFunc("/login", h.HandleLogin)
	//o.m.HandleFunc("/pw", h.ShowChangePw)
	//o.m.HandleFunc("/pw", h.HandleChangePw)
}

func (o *oni) setupRoutes() {
	o.m = http.NewServeMux()

	if o.a.ID == "" {
		o.m.HandleFunc("/", o.NotFound)
		return
	}

	o.setupActorRoutes()
	o.setupWebfingerRoutes()
	o.setupOauthRoutes()
	o.setupStaticRoutes()
}

func (o *oni) setupStaticRoutes() {
	var fsServe http.HandlerFunc
	if assetFilesFS, err := fs.Sub(AssetsFS, "static"); err == nil {
		fsServe = func(w http.ResponseWriter, r *http.Request) {
			st := time.Now().UTC()
			http.FileServer(http.FS(assetFilesFS)).ServeHTTP(w, r)
			o.logRequest(r, http.StatusOK, st)
		}
	} else {
		fsServe = o.Error(err).ServeHTTP
	}
	o.m.Handle("/main.js", fsServe)
	o.m.Handle("/main.js.map", fsServe)
	o.m.Handle("/main.css", fsServe)
	o.m.HandleFunc("/icons.svg", fsServe)
	o.m.HandleFunc("/favicon.ico", o.NotFound)
}

func (o *oni) setupWebfingerRoutes() {
	// TODO(marius): we need the nodeinfo handlers also
	o.m.HandleFunc("/.well-known/webfinger", HandleWebFinger(*o))
	o.m.HandleFunc("/.well-known/host-meta", HandleHostMeta(*o))
}

func (o *oni) setupActorRoutes() {
	base, ok := IRIPath(o.a.ID)
	if !ok {
		return
	}
	o.m.HandleFunc(base, o.OnItemHandler)
	o.collectionRoutes(vocab.ActivityPubCollections...)
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
	tryInActivity, prop := propNameInIRI(iri)
	if vocab.IsItemCollection(it) {
		err = vocab.OnItemCollection(it, func(col *vocab.ItemCollection) error {
			tryInActivity = tryInActivity && col.Count() == 0
			if col.Count() != 1 {
				it = nil
				return iriNotFound(iri)
			}
			it = col.First()
			if !it.GetID().Equals(iri, true) {
				it = nil
				return iriNotFound(iri)
			}
			return nil
		})
	}
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

func (o *oni) OnItemHandler(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()

	iri := irif(r)
	it, err := loadItemFromStorage(o.s, iri)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}
	if vocab.IsNil(it) {
		o.Error(iriNotFound(iri)).ServeHTTP(w, r)
		return
	}
	if vocab.ActorTypes.Contains(it.GetType()) && it.GetID().Equals(o.a.ID, true) {
		vocab.OnActor(it, func(act *vocab.Actor) error {
			act.PublicKey = PublicKey(act.ID)
			return nil
		})
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
		wrt := bytes.Buffer{}
		if err := ren.HTML(&wrt, http.StatusOK, "components/person", it); err != nil {
			o.Error(err).ServeHTTP(w, r)
			return
		}
		io.Copy(w, &wrt)
	}
	o.logRequest(r, http.StatusOK, now)
}

func (o *oni) logRequest(r *http.Request, st int, rt time.Time) {
	if o.l == nil {
		return
	}

	ctx := lw.Ctx{
		"method": r.Method,
		"iri":    irif(r),
		"status": st,
		"accept": r.Header.Get("Accept"),
	}
	if !rt.IsZero() {
		ctx["duration"] = fmt.Sprintf("%0.3fms", float64(time.Now().UTC().Sub(rt).Microseconds())/1000)
	}
	if ua := r.Header.Get("User-Agent"); r.Method == http.MethodPost && ua != "" {
		ctx["ua"] = ua
	}

	var logFn func(string, ...any)
	if st == http.StatusOK {
		logFn = o.l.WithContext(ctx).Debugf
	} else {
		logFn = o.l.WithContext(ctx).Infof
	}
	logFn(http.StatusText(st))
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

func colIRI(r *http.Request) vocab.IRI {
	colURL := url.URL{Scheme: "https", Host: r.Host, Path: r.RequestURI}
	c := col(r)
	if vocab.ValidActivityCollection(c) {
		q := url.Values{}
		q.Set("object.iri", "!")
		q.Set("actor.iri", "!")
		q.Set("type", string(vocab.CreateType))
		colURL.RawQuery = q.Encode()
	}
	return vocab.IRI(colURL.String())
}

func (o *oni) OnCollectionHandler(w http.ResponseWriter, r *http.Request) {
	now := time.Now().UTC()
	if r.Method == http.MethodPost {
		o.ProcessActivity().ServeHTTP(w, r)
		return
	}

	// NOTE(marius): the IRI of the Collection is w/o the filters to load the Actor and Object
	res := vocab.OrderedCollectionPage{
		ID:   irif(r),
		Type: vocab.OrderedCollectionPageType,
	}
	it, err := o.s.Load(colIRI(r))
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}
	if vocab.IsItemCollection(it) {
		err = vocab.OnItemCollection(it, func(col *vocab.ItemCollection) error {
			res.OrderedItems = *col
			return nil
		})
	}
	err = vocab.OnCollectionIntf(it, func(items vocab.CollectionInterface) error {
		res.OrderedItems = orderItems(items.Collection())
		res.TotalItems = res.OrderedItems.Count()
		return nil
	})
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}

	it = res
	accepts := getItemAcceptedContentType(it, r)
	switch {
	case accepts(jsonLD, activityJson, applicationJson):
		o.ServeActivityPubItem(it).ServeHTTP(w, r)
	case accepts(imageAny):
		o.ServeBinData(it).ServeHTTP(w, r)
	case accepts(textHTML):
		fallthrough
	default:
		wrt := bytes.Buffer{}
		if err := ren.HTML(w, http.StatusOK, "components/item", it); err != nil {
			o.Error(err).ServeHTTP(w, r)
			return
		}
		io.Copy(w, &wrt)
	}
	o.logRequest(r, http.StatusOK, now)
}

func acceptFollows(o oni, f vocab.Follow) error {
	accept := new(vocab.Accept)
	accept.Type = vocab.AcceptType
	accept.CC = append(accept.CC, vocab.PublicNS)
	accept.Actor = o.a
	accept.InReplyTo = f.GetID()
	accept.Object = f.GetID()

	o.c.SignFn(s2sSignFn(o))

	processing.SetID(accept, vocab.Outbox.IRI(o.a), nil)
	if _, err := o.s.Save(accept); err != nil {
		o.l.Errorf("Failed saving activity %T[%s]: %+s", accept, accept.Type, err)
	}

	iri, _, err := o.c.ToCollection(vocab.Inbox.IRI(f.Actor), accept)
	if err != nil {
		o.l.Errorf("Failed federating %T[%s]: %s: %+s", accept, accept.Type, accept.ID, err)
		return err
	}
	o.l.Infof("Accepted Follow: %s", iri)
	return nil
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
	processor, err := processing.New(
		processing.WithIRI(o.a.ID), processing.WithClient(o.c), processing.WithStorage(o.s),
		processing.WithLogger(o.l.WithContext(lw.Ctx{"log": "processing"})), processing.WithIDGenerator(GenerateID),
		processing.WithLocalIRIChecker(func(i vocab.IRI) bool {
			return i.Contains(o.a.ID, true)
		}),
	)
	if err != nil {
		o.l.WithContext(lw.Ctx{"err": err}).Errorf("invalid processing mw")
		return notAcceptable(err)
	}

	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		var it vocab.Item
		now := time.Now().UTC()

		act, err := auth.LoadActorFromAuthHeader(r)
		if err != nil {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("unable to load an authorized Actor from request")
		}

		if ok, err := ValidateRequest(r); !ok {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("failed request validation")
			return it, errors.HttpStatus(err), err
		}
		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) == 0 {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("failed loading body")
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
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("failed unmarshalling jsonld body")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to unmarshal JSON request")
		}

		if err != nil {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("failed initializing the Activity processor")
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
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("failed processing activity")
			err = errors.Annotatef(err, "Can't save %q activity to %s", it.GetType(), receivedIn)
			return it, errors.HttpStatus(err), err
		}

		if it.GetType() == vocab.FollowType {
			defer func() {
				go func() {
					time.Sleep(300 * time.Millisecond)

					err := vocab.OnActivity(it, func(a *vocab.Activity) error {
						return acceptFollows(*o, *a)
					})
					if err != nil {
						o.l.WithContext(lw.Ctx{"err": err}).Errorf("unable to automatically accept follow")
					}
				}()
			}()
		}

		status := http.StatusCreated
		if it.GetType() == vocab.DeleteType {
			status = http.StatusGone
		}

		o.logRequest(r, status, now)
		return it, status, nil
	}
}

// HandleLogin handles POST /login requests
func (i *authService) HandleLogin(w http.ResponseWriter, r *http.Request) {
	state := r.PostFormValue("state")
	if err := i.loadAccountFromPost(i.self, r); err != nil {
		errors.HandleError(err).ServeHTTP(w, r)
		return
	}

	endpoints := vocab.Endpoints{
		OauthAuthorizationEndpoint: vocab.IRI(fmt.Sprintf("%s/oauth/authorize", i.self.ID)),
		OauthTokenEndpoint:         vocab.IRI(fmt.Sprintf("%s/oauth/token", i.self.ID)),
	}
	actor := i.self
	if !vocab.IsNil(actor) && actor.Endpoints != nil {
		if actor.Endpoints.OauthTokenEndpoint != nil {
			endpoints.OauthTokenEndpoint = actor.Endpoints.OauthTokenEndpoint
		}
		if actor.Endpoints.OauthAuthorizationEndpoint != nil {
			endpoints.OauthAuthorizationEndpoint = actor.Endpoints.OauthAuthorizationEndpoint
		}
	}
	config := oauth2.Config{
		ClientID: "self",
		Endpoint: oauth2.Endpoint{
			AuthURL:  endpoints.OauthAuthorizationEndpoint.GetLink().String(),
			TokenURL: endpoints.OauthTokenEndpoint.GetLink().String(),
		},
	}
	//i.logRequest(r, status, now)
	http.Redirect(w, r, config.AuthCodeURL(state, oauth2.AccessTypeOnline), http.StatusPermanentRedirect)
}
