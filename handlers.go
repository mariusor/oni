package oni

import (
	"bytes"
	"context"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"git.sr.ht/~mariusor/cache"
	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/ssm"
	ct "github.com/elnormous/contenttype"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/client"
	"github.com/go-ap/client/s2s"
	"github.com/go-ap/errors"
	"github.com/go-ap/filters"
	"github.com/go-ap/jsonld"
	"github.com/go-ap/processing"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/mariusor/render"
	"github.com/microcosm-cc/bluemonday"
	"golang.org/x/oauth2"
)

// NotFound is a generic method to return an 404 error HTTP handler that
func (o *oni) NotFound(w http.ResponseWriter, r *http.Request) {
	o.Error(errors.NotFoundf("%s not found", r.URL.Path)).ServeHTTP(w, r)
}

func (o *oni) Error(err error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		o.Logger.WithContext(lw.Ctx{"err": err.Error(), "url": irif(r)}).Errorf("Error")
		acceptableMediaTypes := []ct.MediaType{textHTML, applicationJson}
		accepted, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
		if !checkAcceptMediaType(accepted)(textHTML) || errors.IsRedirect(err) {
			errors.HandleError(err).ServeHTTP(w, r)
			return
		}
		errs := errors.HttpErrors(err)
		status := errors.HttpStatus(err)
		if status == 0 {
			status = http.StatusInternalServerError
		}
		oniFn := template.FuncMap{
			"ONI":        func() vocab.Actor { return o.oniActor(r) },
			"URLS":       actorURLs(o.oniActor(r)),
			"Title":      func() string { return http.StatusText(errors.HttpStatus(err)) },
			"CurrentURL": func() template.HTMLAttr { return "" },
		}
		templatePath := "components/errors"
		wrt := bytes.Buffer{}
		if err = ren.HTML(&wrt, status, templatePath, errs, render.HTMLOptions{Funcs: oniFn}); err != nil {
			errors.HandleError(err).ServeHTTP(w, r)
			return
		}
		w.WriteHeader(status)
		_, _ = io.Copy(w, &wrt)
	}
}

func (o *oni) setupOauthRoutes(m chi.Router) {
	m.HandleFunc("/oauth/authorize", o.Authorize)
	m.HandleFunc("/oauth/token", o.Token)
	m.HandleFunc("/oauth/client", HandleOauthClientRegistration(*o))
}

func (o *oni) setupRoutes(actors []vocab.Actor) {
	m := chi.NewMux()

	m.Use(o.OutOfOrderMw)
	m.Use(Log(o.Logger))

	o.setupActivityPubRoutes(m)
	o.setupOauthRoutes(m)
	o.setupStaticRoutes(m)
	o.setupWebfingerRoutes(m)

	m.Mount("/debug", middleware.Profiler())

	o.m = m
}

func (o *oni) setupStaticRoutes(m chi.Router) {
	fsServe := HandleStaticAssets(AssetsFS, o.Error)
	m.Handle("/main.js", fsServe)
	m.Handle("/main.js.map", fsServe)
	m.Handle("/main.css", fsServe)
	m.HandleFunc("/icons.svg", fsServe)
	m.HandleFunc("/robots.txt", fsServe)
	m.HandleFunc("/favicon.ico", o.ServeFavIcon)
}

func (o *oni) setupWebfingerRoutes(m chi.Router) {
	// TODO(marius): we need the nodeinfo handlers also
	m.HandleFunc("/.well-known/webfinger", HandleWebFinger(*o))
	m.HandleFunc("/.well-known/host-meta", HandleHostMeta(*o))
	m.HandleFunc("/.well-known/oauth-authorization-server", HandleOauthAuthorizationServer(*o))
}

type corsLogger func(string, ...any)

func (c corsLogger) Printf(f string, v ...interface{}) {
	c(f, v...)
}

func (o *oni) setupActivityPubRoutes(m chi.Router) {
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"https://*"},
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
		AllowOriginFunc:  checkOriginForBlockedActors,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
		Debug:            IsDev,
	})
	c.Log = corsLogger(o.Logger.WithContext(lw.Ctx{"log": "cors"}).Tracef)
	m.Group(func(m chi.Router) {
		m.Use(c.Handler, o.MaybeCreateRootActor, o.StopBlocked)
		m.HandleFunc("/*", o.ActivityPubItem)
	})
}

func binDataFromItem(it vocab.Item, w io.Writer) (contentType ct.MediaType, updatedAt time.Time, err error) {
	updatedAt = time.Now()
	err = vocab.OnObject(it, func(ob *vocab.Object) error {
		if !mediaTypes.Contains(ob.Type) {
			return errors.NotSupportedf("invalid object")
		}
		if len(ob.Content) == 0 {
			return errors.NotSupportedf("invalid object")
		}
		typ, raw, err := getBinData(ob.Content, ob.MediaType)
		if err != nil {
			return err
		}
		_, err = w.Write(raw)
		if err != nil {
			return err
		}
		contentType, err = ct.ParseMediaType(typ)
		if err != nil {
			return err
		}
		updatedAt = ob.Published
		if !ob.Updated.IsZero() {
			updatedAt = ob.Updated
		}
		return nil
	})
	return contentType, updatedAt, err
}

func (o *oni) ServeBinData(it vocab.Item) http.HandlerFunc {
	if vocab.IsNil(it) {
		return o.Error(errors.NotFoundf("not found"))
	}
	buf := bytes.Buffer{}
	contentType, updatedAt, err := binDataFromItem(it, &buf)
	if err != nil {
		return o.Error(err)
	}

	raw := buf.Bytes()
	eTag := fmt.Sprintf(`"%2x"`, md5.Sum(raw))
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType.String())
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(raw)))
		w.Header().Set("Vary", "Accept")
		w.Header().Set("ETag", eTag)
		if vocab.ActivityTypes.Contains(it.GetType()) {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", int(activityCacheDuration.Seconds())))
		} else {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", int(objectCacheDuration.Seconds())))
		}
		if !updatedAt.IsZero() {
			w.Header().Set("Last-Modified", updatedAt.Format(time.RFC1123))
		}

		status := http.StatusOK
		uaHasItem := requestMatchesETag(r.Header, eTag) || requestMatchesLastModified(r.Header, updatedAt)
		if uaHasItem {
			status = http.StatusNotModified
		} else {
			if it.GetType() == vocab.TombstoneType {
				status = http.StatusGone
			}
		}

		w.WriteHeader(status)
		if r.Method == http.MethodGet && !uaHasItem {
			_, _ = w.Write(raw)
		}
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

var collectionTypes = vocab.ActivityVocabularyTypes{
	vocab.CollectionPageType, vocab.CollectionType,
}

func loadItemMetadataFromStorage(s MetadataStorage, it vocab.Item) (interface{ AddETag(w http.ResponseWriter) }, error) {
	var (
		m   any
		iri = it.GetLink()
	)
	m = new(auth.Metadata)
	if err := s.LoadMetadata(iri, m); err != nil {
		return nil, err
	}
	etagMeta, ok := m.(interface{ AddETag(w http.ResponseWriter) })
	if !ok {
		return nil, errors.Newf("unsupported metadata type: %T", m)
	}
	return etagMeta, nil
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
		propIRI := it.GetLink()
		if propIRI != "" {
			return it, errors.MovedPermanently(it.GetLink().String())
		} else {
			return it, nil
		}
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

func contentHasBinaryData(nlv vocab.NaturalLanguageValues) bool {
	for _, nv := range nlv {
		if bytes.HasPrefix(nv.Value, []byte("data:")) {
			return true
		}
	}
	return false
}

func cleanupMediaObject(o *vocab.Object) error {
	if contentHasBinaryData(o.Content) {
		// NOTE(marius): remove inline content from media ActivityPub objects
		o.Content = o.Content[:0]
		if o.URL == nil {
			// Add an explicit URL if missing.
			o.URL = o.ID
		}
	}
	return cleanupMediaObjectFromItem(o.Attachment)
}

const (
	activityCacheDuration = 8766 * time.Hour // 1 year
	objectCacheDuration   = 168 * time.Hour  // 7 days
)

func (o *oni) ServeActivityPubItem(it vocab.Item) http.HandlerFunc {
	_ = cleanupMediaObjectFromItem(it)

	dat, err := jsonld.WithContext(jsonld.IRI(vocab.ActivityBaseURI), jsonld.IRI(vocab.SecurityContextURI)).Marshal(it)
	if err != nil {
		return o.Error(err)
	}

	eTag := fmt.Sprintf(`"%2x"`, md5.Sum(dat))
	updatedAt := time.Now()
	_ = vocab.OnObject(it, func(o *vocab.Object) error {
		updatedAt = o.Published
		if !o.Updated.IsZero() {
			updatedAt = o.Updated
		}
		return nil
	})
	return func(w http.ResponseWriter, r *http.Request) {
		if vocab.ActivityTypes.Contains(it.GetType()) {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", int(activityCacheDuration.Seconds())))
		} else {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", int(objectCacheDuration.Seconds())))
		}
		w.Header().Set("Content-Type", jsonld.ContentType)
		w.Header().Set("Vary", "Accept")
		w.Header().Set("ETag", eTag)
		if !updatedAt.IsZero() {
			w.Header().Set("Last-Modified", updatedAt.Format(time.RFC1123))
		}

		status := http.StatusOK
		uaHasItem := requestMatchesETag(r.Header, eTag) || requestMatchesLastModified(r.Header, updatedAt)
		if uaHasItem {
			status = http.StatusNotModified
		} else {
			if it.GetType() == vocab.TombstoneType {
				status = http.StatusGone
			}
		}

		w.WriteHeader(status)
		if r.Method == http.MethodGet && !uaHasItem {
			_, _ = w.Write(dat)
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

func (o *oni) ValidateRequest(r *http.Request) (bool, error) {
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

	baseIRIs := make(vocab.IRIs, 0)
	for _, act := range o.a {
		_ = baseIRIs.Append(act.GetID())
	}

	isLocalIRI := func(iri vocab.IRI) bool {
		return baseIRIs.Contains(iri)
	}

	var logFn auth.LoggerFn = func(ctx lw.Ctx, msg string, p ...interface{}) {
		o.Logger.WithContext(lw.Ctx{"log": "auth"}, ctx).Debugf(msg, p...)
	}

	var author vocab.Actor
	if loaded, ok := r.Context().Value(authorizedActorCtxKey).(vocab.Actor); ok {
		author = loaded
	} else {
		solver := auth.ClientResolver(Client(auth.AnonymousActor, o.Storage, o.Logger.WithContext(lw.Ctx{"log": "keyfetch"})),
			auth.SolverWithStorage(o.Storage), auth.SolverWithLogger(logFn),
			auth.SolverWithLocalIRIFn(isLocalIRI),
		)

		author, _ = solver.LoadActorFromRequest(r)
		*r = *r.WithContext(context.WithValue(r.Context(), authorizedActorCtxKey, author))
	}

	if auth.AnonymousActor.ID.Equals(author.ID, true) {
		return false, errors.Unauthorizedf("authorized Actor is invalid")
	}

	return true, nil
}

var jsonLD, _ = ct.ParseMediaType(fmt.Sprintf("%s;q=0.8", client.ContentTypeJsonLD))
var activityJson, _ = ct.ParseMediaType(fmt.Sprintf("%s;q=0.8", client.ContentTypeActivityJson))
var applicationJson, _ = ct.ParseMediaType("application/json;q=0.8")
var textHTML, _ = ct.ParseMediaType("text/html;q=1.0")
var imageAny, _ = ct.ParseMediaType("image/*;q=1.0")
var imageIco, _ = ct.ParseMediaType("image/vnd.microsoft.icon")
var imageJpeg, _ = ct.ParseMediaType("image/jpeg")
var imagePng, _ = ct.ParseMediaType("image/png")
var imageGif, _ = ct.ParseMediaType("image/gif")
var imageSvg, _ = ct.ParseMediaType("image/svg+xml")
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

func getRequestAcceptedContentType(r *http.Request) func(...ct.MediaType) bool {
	acceptableMediaTypes := []ct.MediaType{textHTML, jsonLD, activityJson, applicationJson}
	accepted, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
	return checkAcceptMediaType(accepted)
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
	vocab.NoteType, vocab.ArticleType, vocab.ImageType, vocab.AudioType, vocab.VideoType,
	vocab.EventType, /*vocab.DocumentType, vocab.CollectionOfItems,*/
}

func filtersCreateUpdate(ff filters.Checks) bool {
	if len(ff) == 0 {
		return true
	}
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

func iriHasObjectTypeFilter(iri vocab.IRI) bool {
	u, err := iri.URL()
	if err != nil {
		return false
	}
	return u.Query().Has("object.type")
}

func requestMatchesLastModified(h http.Header, updated time.Time) bool {
	modifiedSince := h.Get("If-Modified-Since")
	modSinceTime, err := time.Parse(time.RFC1123, modifiedSince)
	if err != nil {
		return false
	}
	return modSinceTime.Equal(updated) || modSinceTime.After(updated)
}

func requestMatchesETag(h http.Header, eTag string) bool {
	noneMatchValues, ok := h["If-None-Match"]
	if !ok {
		return false
	}

	for _, ifNoneMatch := range noneMatchValues {
		if ifNoneMatch == eTag {
			return true
		}
	}
	return false
}

func (o *oni) ServeHTML(it vocab.Item) http.HandlerFunc {
	templatePath := "components/item"

	_ = cleanupMediaObjectFromItem(it)
	_ = sanitizeItem(it)
	updatedAt := time.Now()
	_ = vocab.OnObject(it, func(o *vocab.Object) error {
		updatedAt = o.Published
		if !o.Updated.IsZero() {
			updatedAt = o.Updated
		}
		return nil
	})
	return func(w http.ResponseWriter, r *http.Request) {
		oniActor := o.oniActor(r)
		oniFn := template.FuncMap{
			"ONI":   func() vocab.Actor { return oniActor },
			"URLS":  actorURLs(oniActor),
			"Title": titleFromItem(oniActor, it, r),
			"CurrentURL": func() template.HTMLAttr {
				return template.HTMLAttr(fmt.Sprintf("https://%s%s", r.Host, r.RequestURI))
			},
		}
		wrt := bytes.Buffer{}
		if err := ren.HTML(&wrt, http.StatusOK, templatePath, it, render.HTMLOptions{Funcs: oniFn}); err != nil {
			o.Logger.Errorf("Unable to render %s: %s", templatePath, err)
			o.Error(err).ServeHTTP(w, r)
			return
		}

		eTag := fmt.Sprintf(`"%2x"`, md5.Sum(wrt.Bytes()))
		if vocab.ActivityTypes.Contains(it.GetType()) {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", int(activityCacheDuration.Seconds())))
		} else {
			w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", int(objectCacheDuration.Seconds())))
		}
		w.Header().Set("Vary", "Accept")
		w.Header().Set("ETag", eTag)
		if !updatedAt.IsZero() {
			w.Header().Set("Last-Modified", updatedAt.Format(time.RFC1123))
		}

		status := http.StatusOK
		uaHasItem := requestMatchesETag(r.Header, eTag) || requestMatchesLastModified(r.Header, updatedAt)
		if uaHasItem {
			status = http.StatusNotModified
		} else {
			if it.GetType() == vocab.TombstoneType {
				status = http.StatusGone
			}
		}

		w.WriteHeader(status)
		if r.Method == http.MethodGet && !uaHasItem {
			_, _ = io.Copy(w, &wrt)
		}
	}
}

type _ctxKey string

const authorizedActorCtxKey _ctxKey = "__authorizedActor"
const blockedActorsCtxKey _ctxKey = "__blockedActors"

func (o oni) loadAuthorizedActor(r *http.Request, oniActor vocab.Actor, toIgnore ...vocab.IRI) (vocab.Actor, error) {
	act, ok := r.Context().Value(authorizedActorCtxKey).(vocab.Actor)
	if ok && !auth.AnonymousActor.Equals(act) {
		return act, nil
	}
	if cookieAuth, _ := r.Cookie("auth"); cookieAuth != nil {
		// NOTE(marius): try to load from encoded token cookie - this happens in the login-link success path
		if rawJson, err := url.QueryUnescape(cookieAuth.Value); err == nil {
			tok := new(oauth2.Token)
			if err := json.Unmarshal([]byte(rawJson), tok); err == nil {
				if act, err := auth.LoadActorFromOAuthToken(o.Storage, tok); err == nil && !auth.AnonymousActor.Equals(act) {
					return act, nil
				}
			}
		}
	}

	c := Client(auth.AnonymousActor, o.Storage, o.Logger)
	s, err := auth.New(
		auth.WithIRI(oniActor.GetLink()),
		auth.WithStorage(o.Storage),
		auth.WithClient(c),
		auth.WithLogger(o.Logger.WithContext(lw.Ctx{"log": "osin"})),
	)
	if err != nil {
		return auth.AnonymousActor, errors.Errorf("OAuth server not initialized")
	}
	return s.LoadActorFromRequest(r, toIgnore...)
}

func checkOriginForBlockedActors(r *http.Request, origin string) bool {
	blocked, ok := r.Context().Value(blockedActorsCtxKey).(vocab.IRIs)
	if ok {
		oIRI := vocab.IRI(origin)
		for _, b := range blocked {
			if b.Contains(oIRI, false) {
				return false
			}
		}
	}
	return true
}

func (o *oni) loadBlockedActors(of vocab.Item) vocab.IRIs {
	var blocked vocab.IRIs
	if res, err := o.Storage.Load(processing.BlockedCollection.IRI(of)); err == nil {
		_ = vocab.OnCollectionIntf(res, func(col vocab.CollectionInterface) error {
			blocked = col.Collection().IRIs()
			return nil
		})
	}
	return blocked
}

func rootIRI(r *http.Request) vocab.IRI {
	return vocab.IRI("https://" + r.Host)
}

func (o *oni) MaybeCreateRootActor(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if actor := o.oniActor(r); actor.Equals(auth.AnonymousActor) {
			if actor = CreateBlankActor(o, rootIRI(r)); !actor.Equals(auth.AnonymousActor) {
				o.mu.Lock()
				o.a = append(o.a, actor)
				o.mu.Unlock()
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (o *oni) StopBlocked(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		oniActor := o.oniActor(r)

		if !oniActor.Equals(auth.AnonymousActor) {
			blocked := o.loadBlockedActors(oniActor)
			act, _ := o.loadAuthorizedActor(r, auth.AnonymousActor, blocked...)
			ctx := r.Context()
			ctx = context.WithValue(ctx, authorizedActorCtxKey, act)
			ctx = context.WithValue(ctx, blockedActorsCtxKey, blocked)
			r = r.WithContext(ctx)
			if !act.Equals(auth.AnonymousActor) {
				for _, blockedIRI := range blocked {
					if blockedIRI.Contains(act.ID, false) {
						o.Logger.WithContext(lw.Ctx{"actor": act.ID, "by": oniActor.ID}).Warnf("Blocked")
						next = o.Error(errors.Gonef("nothing to see here, please move along"))
					}
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func hasPath(iri vocab.IRI) bool {
	u, _ := iri.URL()
	if u != nil {
		return u.Path != "" && u.Path != "/"
	}
	return false
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
			accepts := getRequestAcceptedContentType(r)

			if accepts(textHTML) && (vocab.CollectionPaths{vocab.Outbox, vocab.Inbox}).Contains(whichCollection) {
				obFilters := make(filters.Checks, 0)
				obFilters = append(obFilters, filters.Not(filters.NilID))
				if vocab.Outbox == whichCollection {
					obFilters = append(obFilters, filters.NilInReplyTo)
				}
				if filtersCreateUpdate(colFilters) && !iriHasObjectTypeFilter(iri) {
					obFilters = append(obFilters, filters.HasType(validObjectTypes...))
				}
				colFilters = append(colFilters, filters.HasType(vocab.CreateType, vocab.AnnounceType))
				if len(obFilters) > 0 {
					colFilters = append(colFilters, filters.Object(obFilters...))
				}
				colFilters = append(colFilters, filters.Actor(filters.Not(filters.NilID)))
			}
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
	if authActor, _ := o.loadAuthorizedActor(r, auth.AnonymousActor); authActor.ID != "" {
		colFilters = append(colFilters, filters.Authorized(authActor.ID))
	}

	it, err := loadItemFromStorage(o.Storage, iri, colFilters...)
	if err != nil {
		if errors.IsNotFound(err) && len(o.a) == 1 && !hasPath(iri) {
			if a := o.a[0]; !a.ID.Equals(iri, true) {
				if _, cerr := checkIRIResolvesLocally(a.ID); cerr == nil {
					err = errors.NewTemporaryRedirect(err, a.ID.String())
				}
			}
		}
		o.Error(err).ServeHTTP(w, r)
		return
	}
	it = vocab.CleanRecipients(it)
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

var createTypes = vocab.ActivityVocabularyTypes{vocab.CreateType, vocab.UpdateType}

func titleFromItem(actor vocab.Actor, m vocab.Item, r *http.Request) func() template.HTML {
	title := bluemonday.StripTagsPolicy().Sanitize(vocab.NameOf(m))
	details := ""
	name := bluemonday.StripTagsPolicy().Sanitize(vocab.PreferredNameOf(actor))
	path := filepath.Base(r.URL.Path)
	switch {
	case path == "/":
		if vocab.ActorTypes.Contains(m.GetType()) {
			details = "profile page"
			title = fmt.Sprintf("%s :: fediverse %s", name, details)
		}
	default:
		currentName := vocab.NameOf(m)
		if currentName != "" {
			details = currentName
		} else {
			details = string(m.GetType())
			if vocab.ActivityPubCollections.Contains(vocab.CollectionPath(path)) {
				details = "fediverse " + strings.TrimPrefix(r.URL.Path, "/")
			} else if createTypes.Contains(m.GetType()) {
				_ = vocab.OnActivity(m, func(act *vocab.Activity) error {
					if act.Object == nil {
						return nil
					}
					currentName = vocab.NameOf(act.Object)
					if currentName == "" {
						currentName = string(act.Object.GetType())
					}
					return nil
				})
				if currentName != "" {
					details += ": " + currentName
				}
			}
			title = fmt.Sprintf("%s :: %s", name, details)
		}
	}

	return func() template.HTML {
		return template.HTML(title)
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
	var accepter vocab.Actor
	for _, act := range o.a {
		if toBeFollowed := f.Object.GetID(); act.ID.Equals(toBeFollowed, true) {
			accepter = act
			break
		}
	}

	follower := f.Actor.GetID()
	if vocab.IsNil(accepter) {
		o.Logger.Warnf("Follow object does not match any root actor on this ONI instance")
		return errors.NotFoundf("Follow object Actor not found")
	}

	if blocks := o.loadBlockedActors(accepter); len(blocks) > 0 {
		// NOTE(marius): this should not happen as the StopBlock middleware has kicked in before
		if blocks.Contains(f.Actor) {
			o.Logger.WithContext(lw.Ctx{"blocked": follower}).Warnf("Follow actor is blocked")
			return errors.NotFoundf("Follow object Actor not found")
		}
	}

	accept := new(vocab.Accept)
	accept.Type = vocab.AcceptType
	_ = accept.To.Append(follower)
	accept.InReplyTo = f.GetID()
	accept.Object = f.GetID()

	l := lw.Ctx{"from": follower.GetLink(), "to": accepter.GetLink()}

	f.AttributedTo = accepter.GetLink()
	accept.Actor = accepter
	oniOutbox := vocab.Outbox.IRI(accepter)
	_, err := p.ProcessClientActivity(accept, accepter, oniOutbox)
	if err != nil {
		o.Logger.WithContext(l).Errorf("Failed processing %T[%s]: %s: %+s", accept, accept.Type, accept.ID, err)
		return err
	}
	o.Logger.WithContext(l).Infof("Accepted Follow: %s", f.ID)
	return nil
}

func IRIsContain(iris vocab.IRIs) func(i vocab.IRI) bool {
	return func(i vocab.IRI) bool {
		return iris.Contains(i)
	}
}

func Client(actor vocab.Actor, st processing.KeyLoader, l lw.Logger) *client.C {
	var tr http.RoundTripper = &http.Transport{}
	cachePath, err := os.UserCacheDir()
	if err != nil {
		cachePath = os.TempDir()
	}

	lctx := lw.Ctx{"log": "client"}
	if !vocab.PublicNS.Equals(actor.ID, true) {
		if prv, _ := st.LoadKey(actor.ID); prv != nil {
			tr = s2s.New(s2s.WithTransport(tr), s2s.WithActor(&actor, prv), s2s.WithLogger(l.WithContext(lw.Ctx{"log": "HTTP-Sig"})))
			lctx["transport"] = "HTTP-Sig"
			lctx["actor"] = actor.GetLink()
		}
	}

	ua := fmt.Sprintf("%s/%s (+%s)", ProjectURL, Version, actor.GetLink())
	baseClient := &http.Client{
		Transport: client.UserAgentTransport(ua, cache.Private(tr, cache.FS(filepath.Join(cachePath, "oni")))),
	}

	return client.New(
		client.WithLogger(l.WithContext(lctx)),
		client.WithHTTPClient(baseClient),
		client.SkipTLSValidation(IsDev),
	)
}

const (
	jitterDelay = 50 * time.Millisecond

	baseWaitTime = time.Second
	multiplier   = 1.4

	retries = 5
)

func runWithRetry(fn ssm.Fn) ssm.Fn {
	return ssm.After(300*time.Millisecond, ssm.Retry(retries, ssm.BackOff(baseWaitTime, ssm.Jitter(jitterDelay, ssm.Linear(multiplier)), fn)))
}

// actorsCacheClean replaces the matching actor in the cached list oni uses
func (o *oni) actorsCacheClean(which vocab.Item) error {
	for i, a := range o.a {
		if !a.ID.Equals(which.GetID(), true) {
			continue
		}
		return vocab.OnActor(which, func(actor *vocab.Actor) error {
			o.a[i] = *actor
			return nil
		})
	}
	return nil
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func (o *oni) ProcessActivity() processing.ActivityHandlerFn {
	baseIRIs := make(vocab.IRIs, 0)
	for _, act := range o.a {
		_ = baseIRIs.Append(act.GetID())
	}

	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		var it vocab.Item
		lctx := lw.Ctx{}

		actor := o.oniActor(r)
		lctx["oni"] = actor.GetLink()

		author := auth.AnonymousActor
		if ok, err := o.ValidateRequest(r); !ok {
			lctx["err"] = err.Error()
			o.Logger.WithContext(lctx).Errorf("Failed request validation")
			return it, errors.HttpStatus(err), err
		} else {
			if stored, ok := r.Context().Value(authorizedActorCtxKey).(vocab.Actor); ok {
				author = stored
			}
		}

		c := Client(actor, o.Storage, o.Logger.WithContext(lctx, lw.Ctx{"log": "client"}))
		processor := processing.New(
			processing.Async,
			processing.WithLogger(o.Logger.WithContext(lctx, lw.Ctx{"log": "processing"})),
			processing.WithIRI(baseIRIs...), processing.WithClient(c), processing.WithStorage(o.Storage),
			processing.WithIDGenerator(GenerateID), processing.WithLocalIRIChecker(IRIsContain(baseIRIs)),
		)

		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) == 0 {
			lctx["err"] = err.Error()
			o.Logger.WithContext(lctx).Errorf("Failed loading body")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to read request body")
		}

		defer logRequest(o, r.Header, body)

		if it, err = vocab.UnmarshalJSON(body); err != nil {
			lctx["err"] = err.Error()
			o.Logger.WithContext(lctx).Errorf("Failed unmarshalling jsonld body")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to unmarshal JSON request")
		}
		if vocab.IsNil(it) {
			return it, http.StatusInternalServerError, errors.BadRequestf("unable to unmarshal JSON request")
		}

		if err != nil {
			lctx["err"] = err.Error()
			o.Logger.WithContext(lctx).Errorf("Failed initializing the Activity processor")
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to initialize processor")
		}
		if it, err = processor.ProcessActivity(it, author, receivedIn); err != nil {
			lctx["err"] = err.Error()
			o.Logger.WithContext(lctx).Errorf("Failed processing activity")
			err = errors.Annotatef(err, "Can't save %q activity to %s", it.GetType(), receivedIn)
			return it, errors.HttpStatus(err), err
		}

		if it.GetType() == vocab.FollowType {
			defer func() {
				go ssm.Run(context.Background(), runWithRetry(func(ctx context.Context) ssm.Fn {
					l := lw.Ctx{}
					err := vocab.OnActivity(it, func(a *vocab.Activity) error {
						l["from"] = a.Actor.GetLink()
						l["to"] = a.Object.GetLink()
						return acceptFollows(*o, *a, processor)
					})
					if err != nil {
						l["err"] = err.Error()
						o.Logger.WithContext(lctx, l).Errorf("Unable to automatically accept follow")
					}
					return ssm.End
				}))
			}()
		}
		if it.GetType() == vocab.UpdateType {
			// NOTE(marius): if we updated one of the main actors, we replace it in the array
			_ = vocab.OnActivity(it, func(upd *vocab.Activity) error {
				return o.actorsCacheClean(upd.Object)
			})
		}

		status := http.StatusCreated
		if it.GetType() == vocab.DeleteType {
			status = http.StatusGone
		}

		return it, status, nil
	}
}

var InMaintenanceMode bool = false

func (o *oni) OutOfOrderMw(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if InMaintenanceMode {
			o.Error(errors.ServiceUnavailablef("temporarily out of order")).ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}
