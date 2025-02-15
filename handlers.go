package oni

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"git.sr.ht/~mariusor/cache"
	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/ssm"
	"github.com/go-ap/client/s2s"
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
	"github.com/microcosm-cc/bluemonday"
)

// NotFound is a generic method to return an 404 error HTTP handler that
func (o *oni) NotFound(w http.ResponseWriter, r *http.Request) {
	o.Error(errors.NotFoundf("%s not found", r.URL.Path)).ServeHTTP(w, r)
}

func (o *oni) Error(err error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		acceptableMediaTypes := []ct.MediaType{textHTML, applicationJson}
		accepted, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
		if !checkAcceptMediaType(accepted)(textHTML) || errors.IsRedirect(err) {
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
		_, _ = io.Copy(w, &wrt)
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
	m.HandleFunc("/robots.txt", fsServe)
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
		m.Use(c.Handler, o.StopBlocked)
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
		if !mediaTypes.Contains(ob.Type) {
			return errors.NotSupportedf("invalid object")
		}
		if len(ob.Content) == 0 {
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
		_, _ = w.Write(raw)
	}
}

func sameishIRI(check, colIRI vocab.IRI) bool {
	uc, _ := check.GetID().URL()
	ui, _ := colIRI.URL()
	uc.RawQuery = ""
	ui.RawQuery = ""
	if uc.Path == "/" {
		uc.Path = ""
	}
	if ui.Path == "/" {
		ui.Path = ""
	}
	return strings.EqualFold(uc.String(), ui.String())
}

var orderedCollectionTypes = vocab.ActivityVocabularyTypes{
	vocab.OrderedCollectionPageType, vocab.OrderedCollectionType,
}

func loadItemFromStorage(s processing.ReadStore, iri vocab.IRI, f ...filters.Check) (vocab.Item, error) {
	var isObjProperty bool
	var prop string

	it, err := s.Load(iri, f...)
	if err != nil {
		if !errors.IsNotFound(err) {
			return nil, err
		}

		if isObjProperty, prop = propNameInIRI(iri); isObjProperty {
			it, err = s.Load(vocab.IRI(strings.TrimSuffix(string(iri), prop)), f...)
			if err != nil {
				return nil, err
			}
		}
	}

	if vocab.IsNil(it) {
		return nil, errors.NotFoundf("not found")
	}

	typ := it.GetType()
	switch {
	case orderedCollectionTypes.Contains(typ):
		_ = vocab.OnOrderedCollection(it, func(col *vocab.OrderedCollection) error {
			filtered := make(vocab.ItemCollection, 0, len(col.OrderedItems))
			for _, ob := range col.OrderedItems {
				if ob = filters.Checks(f).Run(ob); !vocab.IsNil(ob) {
					filtered = append(filtered, ob)
				} else {
					ob = nil
				}
			}
			col.OrderedItems = filtered
			return nil
		})
	}

	if sameishIRI(it.GetLink(), iri) {
		return it, nil
	}

	if vocab.ActivityTypes.Contains(typ) {
		err = vocab.OnActivity(it, func(act *vocab.Activity) error {
			switch prop {
			case "object":
				it = act.Object
			case "actor":
				it = act.Actor
			case "target":
				it = act.Target
			default:
				return iriNotFound(it.GetLink())
			}
			return nil
		})
	} else {
		err = vocab.OnObject(it, func(ob *vocab.Object) error {
			switch prop {
			case "icon":
				it = ob.Icon
			case "image":
				it = ob.Image
			case "attachment":
				it = ob.Attachment
			default:
				return iriNotFound(it.GetLink())
			}
			return nil
		})
	}
	if vocab.IsNil(it) {
		return nil, errors.NotFoundf("not found")
	}
	if vocab.IsIRI(it) && !it.GetLink().Equals(iri, true) {
		it, err = loadItemFromStorage(s, it.GetLink())
	}
	if !vocab.IsItemCollection(it) {
		if err != nil {
			return it, errors.NewMovedPermanently(err, it.GetLink().String())
		}
		return it, errors.MovedPermanently(it.GetLink().String())
	}
	return it, err
}

var propertiesThatMightBeObjects = []string{"object", "actor", "target", "icon", "image", "attachment"}

func propNameInIRI(iri vocab.IRI) (bool, string) {
	u, _ := iri.URL()
	base := filepath.Base(u.Path)
	for _, prop := range propertiesThatMightBeObjects {
		if strings.EqualFold(prop, base) {
			return true, prop
		}
	}
	return false, ""
}

var mediaTypes = vocab.ActivityVocabularyTypes{
	vocab.ImageType, vocab.AudioType, vocab.VideoType, vocab.DocumentType,
}

func cleanupMediaObjectFromItem(it vocab.Item) error {
	if it == nil {
		return nil
	}
	if it.IsCollection() {
		return vocab.OnCollectionIntf(it, cleanupMediaObjectsFromCollection)
	}
	if vocab.ActivityTypes.Contains(it.GetType()) {
		return vocab.OnActivity(it, cleanupMediaObjectFromActivity)
	}
	return vocab.OnObject(it, cleanupMediaObject)
}

func cleanupMediaObjectsFromCollection(col vocab.CollectionInterface) error {
	errs := make([]error, 0)
	for _, it := range col.Collection() {
		if err := cleanupMediaObjectFromItem(it); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

func cleanupMediaObjectFromActivity(act *vocab.Activity) error {
	if err := cleanupMediaObjectFromItem(act.Object); err != nil {
		return err
	}
	if err := cleanupMediaObjectFromItem(act.Target); err != nil {
		return err
	}
	return nil
}

func cleanupMediaObject(o *vocab.Object) error {
	if mediaTypes.Contains(o.Type) {
		// NOTE(marius): remove inline content from media ActivityPub objects
		o.Content = o.Content[:0]
		if o.URL == nil {
			// Add an explicit URL if missing.
			o.URL = o.ID
		}
	}
	return cleanupMediaObjectFromItem(o.Attachment)
}

func (o *oni) ServeActivityPubItem(it vocab.Item) http.HandlerFunc {
	_ = cleanupMediaObjectFromItem(it)

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
var audioAny, _ = ct.ParseMediaType("audio/*;q=1.0")
var videoAny, _ = ct.ParseMediaType("video/*;q=1.0")
var pdfDocument, _ = ct.ParseMediaType("application/pdf;q=1.0")

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

	_ = vocab.OnObject(it, func(ob *vocab.Object) error {
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
		_ = vocab.OnItemCollection(act.URL, func(col *vocab.ItemCollection) error {
			for _, u := range *col {
				_ = urls.Append(u.GetLink())
			}
			return nil
		})
	} else if !vocab.IsNil(act.URL) {
		_ = urls.Append(act.URL.GetLink())
	}
	return func() vocab.IRIs {
		return urls
	}
}

var validActivityTypes = vocab.ActivityVocabularyTypes{
	vocab.CreateType, vocab.UpdateType,
}

var validObjectTypes = vocab.ActivityVocabularyTypes{
	vocab.NoteType, vocab.ArticleType, vocab.ImageType, vocab.AudioType, vocab.VideoType, /*vocab.DocumentType,*/
	vocab.EventType, vocab.CollectionOfItems,
}

func filtersCreateUpdate(ff filters.Checks) bool {
	for _, vv := range filters.ToValues(filters.TypeChecks(ff...)...) {
		for _, v := range vv {
			t := vocab.ActivityVocabularyType(v)
			if validActivityTypes.Contains(t) {
				return true
			}
		}
	}
	return false
}

func iriHasTypeFilter(iri vocab.IRI) bool {
	u, err := iri.URL()
	if err != nil {
		return false
	}
	return u.Query().Has("type")
}

func iriHasObjectTypeFilter(iri vocab.IRI) bool {
	u, err := iri.URL()
	if err != nil {
		return false
	}
	return u.Query().Has("object.type")
}

func (o *oni) ServeHTML(it vocab.Item) http.HandlerFunc {
	templatePath := "components/person"
	if !vocab.ActorTypes.Contains(it.GetType()) {
		templatePath = "components/item"
	}

	_ = cleanupMediaObjectFromItem(it)
	return func(w http.ResponseWriter, r *http.Request) {
		oniActor := o.oniActor(r)
		oniFn := template.FuncMap{
			"ONI":   func() vocab.Actor { return oniActor },
			"URLS":  actorURLs(oniActor),
			"Title": titleFromActor(oniActor, r),
		}
		wrt := bytes.Buffer{}
		if err := ren.HTML(&wrt, http.StatusOK, templatePath, it, render.HTMLOptions{Funcs: oniFn}); err != nil {
			o.l.Errorf("unable to render %s: %s", templatePath, err)
			o.Error(err).ServeHTTP(w, r)
			return
		}
		w.Header().Set("Vary", "Accept")
		_, _ = io.Copy(w, &wrt)
	}
}

const authorizedActorCtxKey = "__authorizedActor"

func (o oni) loadAuthorizedActor(r *http.Request, oniActor vocab.Actor, toIgnore ...vocab.IRI) (vocab.Actor, error) {
	if act, ok := r.Context().Value(authorizedActorCtxKey).(vocab.Actor); ok {
		return act, nil
	}

	c := Client(&http.Transport{}, oniActor, o.s, o.l)
	s, err := auth.New(
		auth.WithIRI(oniActor.GetLink()),
		auth.WithStorage(o.s),
		auth.WithClient(c),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "osin"})),
	)
	if err != nil {
		return auth.AnonymousActor, errors.Errorf("OAuth server not initialized")
	}
	return s.LoadActorFromRequest(r, toIgnore...)
}

func (o *oni) StopBlocked(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		oniActor := o.oniActor(r)

		if res, err := o.s.Load(processing.BlockedCollection.IRI(oniActor)); err == nil {
			var blocked vocab.IRIs
			_ = vocab.OnCollectionIntf(res, func(col vocab.CollectionInterface) error {
				blocked = col.Collection().IRIs()
				return nil
			})

			act, _ := o.loadAuthorizedActor(r, oniActor, blocked...)
			if act.ID != vocab.PublicNS {
				for _, blockedIRI := range blocked {
					if blockedIRI.Contains(act.ID, false) {
						o.Error(errors.Gonef("nothing to see here, please move along")).ServeHTTP(w, r)
						return
					}
				}
			}
			r = r.WithContext(context.WithValue(r.Context(), authorizedActorCtxKey, act))
		}

		next.ServeHTTP(w, r)
	})
}

func (o *oni) ActivityPubItem(w http.ResponseWriter, r *http.Request) {
	iri := irif(r)
	colFilters := make(filters.Checks, 0)

	if vocab.ValidCollectionIRI(iri) {
		if r.Method == http.MethodPost {
			o.ProcessActivity().ServeHTTP(w, r)
			return
		}
		_, whichCollection := vocab.Split(iri)

		colFilters = filters.FromValues(r.URL.Query())
		if vocab.ValidActivityCollection(whichCollection) {
			obFilters := make(filters.Checks, 0)
			obFilters = append(obFilters, filters.Not(filters.NilID))
			if (vocab.CollectionPaths{vocab.Outbox, vocab.Inbox}).Contains(whichCollection) {
				if filtersCreateUpdate(colFilters) && !iriHasObjectTypeFilter(iri) {
					obFilters = append(obFilters, filters.HasType(validObjectTypes...))
				}
			}
			if len(obFilters) > 0 {
				colFilters = append(colFilters, filters.Object(obFilters...))
			}
			colFilters = append(colFilters, filters.Actor(filters.Not(filters.NilID)))
		}

		if u, err := iri.URL(); err == nil {
			if after := u.Query().Get("after"); after != "" {
				colFilters = append(colFilters, filters.After(filters.SameID(vocab.IRI(after))))
			}
			if after := u.Query().Get("before"); after != "" {
				colFilters = append(colFilters, filters.Before(filters.SameID(vocab.IRI(after))))
			}
		}
		colFilters = append(colFilters, filters.WithMaxCount(MaxItems))
	}
	if authActor, _ := o.loadAuthorizedActor(r, o.oniActor(r)); authActor.ID != "" {
		colFilters = append(colFilters, filters.Authorized(authActor.ID))
	}

	it, err := loadItemFromStorage(o.s, iri, colFilters...)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}

	_ = vocab.OnObject(it, func(o *vocab.Object) error {
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
	case accepts(imageAny), accepts(audioAny), accepts(videoAny), accepts(pdfDocument):
		o.ServeBinData(it).ServeHTTP(w, r)
	case accepts(textHTML):
		fallthrough
	default:
		o.ServeHTML(it).ServeHTTP(w, r)
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
	sanitized := bluemonday.StripTagsPolicy().Sanitize(string(username.Value))
	return func() template.HTML {
		return template.HTML(fmt.Sprintf("%s :: fediverse %s", sanitized, details))
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

const MaxItems = 20

func acceptFollows(o oni, f vocab.Follow, p processing.P) error {
	accept := new(vocab.Accept)
	accept.Type = vocab.AcceptType
	_ = accept.To.Append(f.Actor.GetID())
	accept.InReplyTo = f.GetID()
	accept.Object = f.GetID()

	var actor vocab.Actor
	for _, act := range o.a {
		if act.ID.Equals(f.Object.GetID(), true) {
			actor = act
			accept.Actor = act
			break
		}
	}

	oniOutbox := vocab.Outbox.IRI(accept.Actor)
	_, err := p.ProcessClientActivity(accept, actor, oniOutbox)
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

func Client(tr http.RoundTripper, actor vocab.Actor, st processing.KeyLoader, l lw.Logger) *client.C {
	cachePath, err := os.UserCacheDir()
	if err != nil {
		cachePath = os.TempDir()
	}
	if tr == nil {
		tr = &http.Transport{}
	}
	if prv, _ := st.LoadKey(actor.ID); prv != nil {
		tr = &s2s.HTTPSignatureTransport{Base: tr, Key: prv, Actor: &actor}
	}

	client.UserAgent = fmt.Sprintf("%s/%s (+%s)", actor.GetLink(), Version, ProjectURL)
	baseClient := &http.Client{
		Transport: cache.Private(tr, cache.FS(filepath.Join(cachePath, "oni"))),
	}

	return client.New(
		client.WithLogger(l.WithContext(lw.Ctx{"log": "client"})),
		client.WithHTTPClient(baseClient),
		client.SkipTLSValidation(true),
		client.SetDefaultHTTPClient(),
	)
}

const (
	jitterDelay = 50 * time.Millisecond

	baseWaitTime = time.Second
	multiplier   = 1.4

	retries = 5
)

func runWithRetry(fn ssm.Fn) ssm.Fn {
	return ssm.After(300*time.Millisecond, ssm.Retry(retries, ssm.BackOff(ssm.Jitter(jitterDelay, ssm.Linear(baseWaitTime, multiplier)), fn)))
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func (o *oni) ProcessActivity() processing.ActivityHandlerFn {
	baseIRIs := make(vocab.IRIs, 0)
	for _, act := range o.a {
		_ = baseIRIs.Append(act.GetID())
	}

	isLocalIRI := func(iri vocab.IRI) bool {
		return baseIRIs.Contains(iri)
	}

	var logFn auth.LoggerFn = func(ctx lw.Ctx, msg string, p ...interface{}) {
		o.l.WithContext(lw.Ctx{"log": "auth"}, ctx).Debugf(msg, p...)
	}

	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		var it vocab.Item

		actor := o.oniActor(r)

		c := Client(&http.Transport{}, actor, o.s, o.l)

		solver := auth.ClientResolver(c,
			auth.SolverWithStorage(o.s), auth.SolverWithLogger(logFn),
			auth.SolverWithLocalIRIFn(isLocalIRI),
		)

		processor := processing.New(
			processing.Async,
			processing.WithLogger(o.l.WithContext(lw.Ctx{"log": "processing"})),
			processing.WithIRI(baseIRIs...), processing.WithClient(c), processing.WithStorage(o.s),
			processing.WithIDGenerator(GenerateID), processing.WithLocalIRIChecker(IRIsContain(baseIRIs)),
		)

		act, err := solver.LoadActorFromRequest(r)
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
		if vocab.IsNil(it) {
			return it, http.StatusInternalServerError, errors.BadRequestf("unable to unmarshal JSON request")
		}

		if err != nil {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed initializing the Activity processor")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to initialize processor")
		}
		_ = vocab.OnActivity(it, func(a *vocab.Activity) error {
			// TODO(marius): this should be handled in the processing package
			if a.AttributedTo == nil {
				a.AttributedTo = act
			}
			return nil
		})
		if it, err = processor.ProcessActivity(it, act, receivedIn); err != nil {
			o.l.WithContext(lw.Ctx{"err": err.Error()}).Errorf("failed processing activity")
			err = errors.Annotatef(err, "Can't save %q activity to %s", it.GetType(), receivedIn)
			return it, errors.HttpStatus(err), err
		}

		if it.GetType() == vocab.FollowType {
			defer func() {
				go ssm.Run(context.Background(), runWithRetry(func(ctx context.Context) ssm.Fn {
					l := lw.Ctx{}
					err := vocab.OnActivity(it, func(a *vocab.Activity) error {
						l["from"] = a.Actor.GetLink()
						return acceptFollows(*o, *a, processor)
					})
					if err != nil {
						l["err"] = err.Error()
						o.l.WithContext(l).Errorf("unable to automatically accept follow")
					}
					return ssm.End
				}))
			}()
		}
		if it.GetType() == vocab.UpdateType {
			// NOTE(marius): if we updated one of the main actors, we replace it in the array
			_ = vocab.OnActivity(it, func(upd *vocab.Activity) error {
				ob := upd.Object
				for i, a := range o.a {
					if !a.ID.Equals(ob.GetID(), true) {
						continue
					}
					_ = vocab.OnActor(ob, func(actor *vocab.Actor) error {
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
