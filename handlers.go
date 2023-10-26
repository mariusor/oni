package oni

import (
	"bytes"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"net/url"
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
	"github.com/go-ap/filters"
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
			"URLS":  actorURLs(o.oniActor(r)),
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

	m.Mount("/debug", middleware.Profiler())

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
		w.Header().Set("Vary", "Accept")
		w.Write(raw)
	}
}

func sameishIRI(check, colIRI vocab.IRI) bool {
	uc, _ := check.GetID().URL()
	ui, _ := colIRI.URL()
	uc.RawQuery = ""
	ui.RawQuery = ""
	return strings.EqualFold(uc.String(), ui.String())
}

func loadItemFromStorage(s processing.ReadStore, iri vocab.IRI) (vocab.Item, error) {
	it, err := s.Load(iri)
	if err != nil {
		return nil, err
	}
	if vocab.IsNil(it) {
		return nil, errors.NotFoundf("not found")
	}

	if sameishIRI(it.GetLink(), iri) {
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
			if vocab.ActivityTypes.Contains(o.Type) {
				w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", int(8766*time.Hour.Seconds())))
			}
			return nil
		})
		status := http.StatusOK
		if it.GetType() == vocab.TombstoneType {
			status = http.StatusGone
		}
		w.Header().Set("Content-Type", json.ContentType)
		w.Header().Set("Vary", "Accept")
		w.WriteHeader(status)
		if r.Method == http.MethodGet {
			w.Write(dat)
		}
	}
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

var validActivityTypes = vocab.ActivityVocabularyTypes{
	vocab.CreateType, vocab.UpdateType,
}

var validObjectTypes = vocab.ActivityVocabularyTypes{
	vocab.NoteType, vocab.ArticleType, vocab.ImageType, vocab.AudioType, vocab.VideoType, vocab.DocumentType,
	vocab.EventType, vocab.CollectionOfItems, "",
}

func iriHasTypeFilter(iri vocab.IRI) bool {
	u, err := iri.URL()
	if err != nil {
		return false
	}
	return u.Query().Has("type")
}

func iriHasObjectFilter(iri vocab.IRI) bool {
	u, err := iri.URL()
	if err != nil {
		return false
	}
	return u.Query().Has("object.type")
}

func (o *oni) ActivityPubItem(w http.ResponseWriter, r *http.Request) {
	iri := irif(r)
	colFilters := make(filters.Fns, 0)

	if vocab.ValidCollectionIRI(iri) {
		if r.Method == http.MethodPost {
			o.ProcessActivity().ServeHTTP(w, r)
			return
		}
		_, whichCollection := vocab.Split(iri)

		if (vocab.CollectionPaths{vocab.Outbox, vocab.Inbox}).Contains(whichCollection) {
			if !iriHasTypeFilter(iri) {
				colFilters = append(colFilters, filters.HasType(validActivityTypes...))
			}
			if !iriHasObjectFilter(iri) {
				colFilters = append(colFilters, filters.Object(filters.HasType(validObjectTypes...)))
			}
		}
		iri = colIRI(r)

		if u, err := iri.URL(); err == nil {
			if after := u.Query().Get("after"); after != "" {
				colFilters = append(colFilters, filters.After(vocab.IRI(after)))
			}
			if after := u.Query().Get("before"); after != "" {
				colFilters = append(colFilters, filters.Before(vocab.IRI(after)))
			}
		}

		colFilters = append(colFilters, filters.WithMaxCount(MaxItems))
	}

	it, err := loadItemFromStorage(o.s, iri)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}
	if vocab.ValidCollectionIRI(iri) {
		it, err = PaginateCollection(it, filters.All(colFilters...))
	}
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}

	vocab.OnObject(it, func(o *vocab.Object) error {
		updatedAt := o.Published
		if !o.Updated.IsZero() {
			updatedAt = o.Updated
		}
		if !updatedAt.IsZero() {
			w.Header().Set("Last-Modified", updatedAt.Format(time.RFC1123))
		}
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", int(24*time.Hour.Seconds())))
		return nil
	})
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
			"Title": titleFromActor(oniActor, r),
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
		w.Header().Set("Vary", "Accept")
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

func titleFromActor(o vocab.Actor, r *http.Request) func() template.HTML {
	username := o.PreferredUsername.First()
	details := "page"
	switch r.URL.Path {
	case "/":
		details = "profile page"
	case "/inbox", "/outbox", "/followers", "/following":
		details = strings.TrimPrefix(r.URL.Path, "/")
	}
	return func() template.HTML {
		return template.HTML(fmt.Sprintf("%s :: fediverse %s", username, details))
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

func colIRI(r *http.Request) vocab.IRI {
	colURL := url.URL{Scheme: "https", Host: r.Host, Path: r.URL.Path}
	c := col(r)
	if vocab.ValidActivityCollection(c) {
		q := r.URL.Query()
		q.Set("object.iri", "!")
		q.Set("actor.iri", "!")
		colURL.RawQuery = q.Encode()
	}
	return vocab.IRI(colURL.String())
}

const MaxItems = 20

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

func filterCollection(col vocab.ItemCollection, fns ...filters.Fn) (vocab.ItemCollection, url.Values, url.Values) {
	if len(col) == 0 {
		return col, nil, nil
	}
	result := make(vocab.ItemCollection, 0, len(col))

	pp := url.Values{}
	np := url.Values{}

invalidItem:
	for _, it := range col {
		for _, fn := range fns {
			if !fn(it) {
				continue invalidItem
			}
		}
		result = append(result, it)
	}

	if len(result) == 0 {
		return result, pp, np
	}
	first := result[0]
	if len(col) > MaxItems {
		firstPage := col[0:MaxItems]
		onFirstPage := false
		for _, top := range firstPage {
			if onFirstPage = first.GetLink().Equals(top.GetLink(), true); onFirstPage {
				break
			}
		}
		if !onFirstPage {
			pp.Add("before", first.GetLink().String())
		}
		if len(result) > 1 && len(col) > MaxItems+1 {
			last := result[len(result)-1]
			bottomPage := col[len(col)-MaxItems-1 : len(col)-1]
			onLastPage := false
			for _, bottom := range bottomPage {
				if onLastPage = last.GetLink().Equals(bottom.GetLink(), true); onLastPage {
					break
				}
			}
			if !onLastPage {
				np.Add("after", last.GetLink().String())
			}
		}
	}
	return result, pp, np
}

func sortItemsByPublishedUpdated(col vocab.ItemCollection) vocab.ItemCollection {
	sort.SliceStable(col, func(i int, j int) bool {
		it1 := col.Collection()[i]
		it2 := col.Collection()[j]
		var (
			p1 time.Time
			p2 time.Time
			u1 time.Time
			u2 time.Time
		)
		vocab.OnObject(it1, func(ob *vocab.Object) error {
			p1 = ob.Published
			u1 = ob.Updated
			return nil
		})
		vocab.OnObject(it2, func(ob *vocab.Object) error {
			p2 = ob.Published
			u2 = ob.Updated
			return nil
		})

		if d1 := u1.Sub(p1); d1 < 0 {
			u1 = p1
		}
		if d2 := u2.Sub(p2); d2 < 0 {
			u2 = p2
		}
		return u2.Sub(u1) < 0
	})
	return col
}

func collectionPageFromItem(it vocab.Item, filters ...filters.Fn) (vocab.CollectionInterface, vocab.Item, vocab.Item) {
	typ := it.GetType()

	if !vocab.CollectionTypes.Contains(typ) {
		return nil, nil, nil
	}

	result, _ := it.(vocab.CollectionInterface)

	var prev url.Values
	var next url.Values

	var prevIRI vocab.IRI
	var nextIRI vocab.IRI

	items := result.Collection()
	switch typ {
	case vocab.OrderedCollectionPageType:
		vocab.OnOrderedCollectionPage(result, func(new *vocab.OrderedCollectionPage) error {
			new.OrderedItems, prev, next = filterCollection(sortItemsByPublishedUpdated(items), filters...)
			if len(prev) > 0 {
				prevIRI = getURL(it.GetLink(), prev)
			}
			if len(next) > 0 {
				nextIRI = getURL(it.GetLink(), next)
			}
			return nil
		})
	case vocab.CollectionPageType:
		vocab.OnCollectionPage(result, func(new *vocab.CollectionPage) error {
			new.Items, prev, next = filterCollection(items, filters...)
			if len(prev) > 0 {
				prevIRI = getURL(it.GetLink(), prev)
			}
			if len(next) > 0 {
				nextIRI = getURL(it.GetLink(), next)
			}
			return nil
		})
	case vocab.OrderedCollectionType:
		result = new(vocab.OrderedCollectionPage)
		old, _ := it.(*vocab.OrderedCollection)
		vocab.OnOrderedCollection(result, func(new *vocab.OrderedCollection) error {
			_, err := vocab.CopyOrderedCollectionProperties(new, old)
			new.Type = vocab.OrderedCollectionPageType
			new.OrderedItems, prev, next = filterCollection(sortItemsByPublishedUpdated(items), filters...)
			if len(prev) > 0 {
				prevIRI = getURL(it.GetLink(), prev)
			}
			if len(next) > 0 {
				nextIRI = getURL(it.GetLink(), next)
			}
			return err
		})
	case vocab.CollectionType:
		result = new(vocab.CollectionPage)
		old, _ := it.(*vocab.Collection)
		vocab.OnCollection(result, func(new *vocab.Collection) error {
			_, err := vocab.CopyCollectionProperties(new, old)
			new.Type = vocab.CollectionPageType
			new.Items, prev, next = filterCollection(items, filters...)
			if len(prev) > 0 {
				prevIRI = getURL(it.GetLink(), prev)
			}
			if len(next) > 0 {
				nextIRI = getURL(it.GetLink(), next)
			}
			return err
		})
	case vocab.CollectionOfItems:
		new := new(vocab.OrderedCollectionPage)
		new.Type = vocab.CollectionPageType
		new.OrderedItems, prev, next = filterCollection(sortItemsByPublishedUpdated(items), filters...)
		if len(prev) > 0 {
			prevIRI = getURL(it.GetLink(), prev)
		}
		if len(next) > 0 {
			nextIRI = getURL(it.GetLink(), next)
		}
		result = new
	}

	return result, prevIRI, nextIRI
}

// PaginateCollection is a function that populates the received collection
func PaginateCollection(it vocab.Item, filters ...filters.Fn) (vocab.CollectionInterface, error) {
	if vocab.IsNil(it) {
		return nil, errors.Newf("unable to paginate nil collection")
	}

	col, prevIRI, nextIRI := collectionPageFromItem(it, filters...)
	if vocab.IsNil(col) {
		return nil, errors.Newf("unable to paginate %T[%s] collection", it, it.GetType())
	}

	curIRI := it.GetID()

	if col.GetType() == vocab.OrderedCollectionPageType {
		vocab.OnOrderedCollectionPage(col, func(c *vocab.OrderedCollectionPage) error {
			c.PartOf = curIRI
			c.Current = curIRI
			c.Next = nextIRI
			c.Prev = prevIRI
			return nil
		})
	}
	if col.GetType() == vocab.CollectionPageType {
		vocab.OnCollectionPage(col, func(c *vocab.CollectionPage) error {
			c.PartOf = curIRI
			c.Current = curIRI
			c.Next = nextIRI
			c.Prev = prevIRI
			return nil
		})
	}

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
	processing.SetIDIfMissing(accept, oniOutbox, nil)
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

		defer logRequest(o, r.Header, body)

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
		if it.GetType() == vocab.UpdateType {
			// NOTE(marius): if we updated one of the main actors, we replace it in the array
			vocab.OnActivity(it, func(upd *vocab.Activity) error {
				ob := upd.Object
				for i, a := range o.a {
					if !a.ID.Equals(ob.GetID(), true) {
						continue
					}
					vocab.OnActor(ob, func(actor *vocab.Actor) error {
						o.a[i] = *actor
						return nil
					})
				}
				return nil
			})
		}

		status := http.StatusCreated
		if it.GetType() == vocab.DeleteType {
			status = http.StatusGone
		}

		return it, status, nil
	}
}
