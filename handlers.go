package oni

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path/filepath"
	"sort"
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
)

// NotFound is a generic method to return an 404 error HTTP handler that
func NotFound(l lw.Logger) errors.ErrorHandlerFn {
	return func(w http.ResponseWriter, r *http.Request) error {
		st := http.StatusNotFound
		defer l.Infof("%s %s %d %s", r.Method, irif(r), st, http.StatusText(st))
		return errors.NotFoundf("%s not found", r.URL.Path)
	}
}

func Error(l lw.Logger, err error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if l != nil {
			st := errors.HttpStatus(err)
			defer l.Infof("%s %s %d %s", r.Method, irif(r), st, http.StatusText(st))
		}
		errors.HandleError(err).ServeHTTP(w, r)
	}
}

func (o *oni) collectionRoutes(collections ...vocab.CollectionPath) {
	actor := o.a
	base, ok := IRIPath(actor.ID)
	for _, collection := range collections {
		path := base + string(collection)
		if !ok {
			o.m.Handle(path, NotFound(o.l))
			continue
		}
		if !CollectionExists(actor, collection) {
			o.m.Handle(path, NotFound(o.l))
			continue
		}
		colPath, ok := IRIPath(collection.Of(actor.GetLink()).GetLink())
		if !ok {
			o.m.Handle(path, NotFound(o.l))
			continue
		}

		o.m.HandleFunc(colPath, OnCollectionHandler(*o))
		o.m.HandleFunc(colPath+"/", OnItemHandler(*o))
	}
}

func (o *oni) setupRoutes() {
	o.m = http.NewServeMux()

	if o.a.ID == "" {
		o.m.Handle("/", NotFound(o.l))
		return
	}

	o.setupActivityPubRoutes()
	o.setupWebfingerRoutes()
}

func (o *oni) setupWebfingerRoutes() {
	o.m.HandleFunc("/.well-known/webfinger", HandleWebFinger(*o))
	o.m.HandleFunc("/.well-known/host-meta", HandleHostMeta(*o))
}

func (o *oni) setupActivityPubRoutes() {
	base, ok := IRIPath(o.a.ID)
	if !ok {
		return
	}
	o.m.HandleFunc(base, OnItemHandler(*o))
	o.collectionRoutes(vocab.ActivityPubCollections...)

	var fsServe http.Handler
	if assetFilesFS, err := fs.Sub(AssetsFS, "assets"); err == nil {
		fsServe = http.FileServer(http.FS(assetFilesFS))
	} else {
		fsServe = Error(o.l, err)
	}
	o.m.Handle("/main.js", fsServe)
	o.m.Handle("/main.css", fsServe)
	o.m.Handle("/favicon.ico", NotFound(o.l))
}

func ServeBinData(it vocab.Item) http.HandlerFunc {
	if vocab.IsNil(it) {
		return errors.HandleError(errors.NotFoundf("not found")).ServeHTTP
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
		return errors.HandleError(err).ServeHTTP
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
				return errors.NotFoundf("%s not found", iri)
			}
			it = col.First()
			if !it.GetID().Equals(iri, true) {
				it = nil
				return errors.NotFoundf("%s not found", iri)
			}
			return nil
		})
	}
	if !tryInActivity {
		return it, err
	}
	u, _ := iri.URL()
	u.Path = filepath.Clean(filepath.Join(u.Path, "../"))
	act, err := s.Load(vocab.IRI(u.String()))
	if err != nil {
		return nil, err
	}
	if vocab.ActivityTypes.Contains(act.GetType()) {
		err = vocab.OnActivity(act, func(act *vocab.Activity) error {
			if prop == "object" {
				it = act.Object
			}
			if prop == "actor" {
				it = act.Actor
			}
			return nil
		})
	} else {
		err = vocab.OnObject(act, func(ob *vocab.Object) error {
			if prop == "icon" {
				it = ob.Icon
			}
			if prop == "image" {
				it = ob.Image
			}
			return nil
		})
	}
	if vocab.IsIRI(it) {
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

func ServeActivityPub(it vocab.Item) http.HandlerFunc {
	dat, err := json.WithContext(json.IRI(vocab.ActivityBaseURI), json.IRI(vocab.SecurityContextURI)).Marshal(it)
	if err != nil {
		return errors.HandleError(err).ServeHTTP
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

func notAcceptable(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
	return nil, http.StatusNotAcceptable, errors.MethodNotAllowedf("current instance does not federate")
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

var jsonLD, _ = ct.ParseMediaType(client.ContentTypeJsonLD)
var activityJson, _ = ct.ParseMediaType(client.ContentTypeActivityJson)
var applicationJson, _ = ct.ParseMediaType("application/json")
var textHTML, _ = ct.ParseMediaType("text/html")
var imageAny, _ = ct.ParseMediaType("image/*")

func checkAcceptMediaType(accepted ct.MediaType) func(check ...ct.MediaType) bool {
	return func(check ...ct.MediaType) bool {
		for _, c := range check {
			if accepted.Type == c.Type && (c.Subtype == "*" || accepted.Subtype == c.Subtype) {
				return true
			}
		}
		return false
	}
}

func getItemAcceptedContentType(it vocab.Item, r *http.Request) func(check ...ct.MediaType) bool {
	acceptableMediaTypes := []ct.MediaType{jsonLD, activityJson, applicationJson}

	vocab.OnObject(it, func(ob *vocab.Object) error {
		if ob.MediaType != "" {
			mt, _ := ct.ParseMediaType(string(ob.MediaType))
			acceptableMediaTypes = append([]ct.MediaType{mt}, acceptableMediaTypes...)
		} else {
			acceptableMediaTypes = append(acceptableMediaTypes, textHTML)
		}
		return nil
	})

	accepted, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
	if accepted.Type == "" {
		accepted = textHTML
	}
	return checkAcceptMediaType(accepted)
}

func OnItemHandler(o oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if o.l != nil {
			defer o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		}

		iri := irif(r)
		it, err := loadItemFromStorage(o.s, iri)
		if err != nil {
			errors.HandleError(err)
			return
		}
		if vocab.IsNil(it) {
			errors.HandleError(errors.NotFoundf("%s not found", iri))
			return
		}

		accepts := getItemAcceptedContentType(it, r)
		switch {
		case accepts(jsonLD, activityJson, applicationJson):
			ServeActivityPub(it).ServeHTTP(w, r)
		case accepts(imageAny):
			ServeBinData(it).ServeHTTP(w, r)
		case accepts(textHTML):
			fallthrough
		default:
			f, err := TemplateFS.Open("templates/main.html")
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, "%+s", err)
				return
			}
			w.WriteHeader(http.StatusOK)
			io.Copy(w, f)
		}
	}
}

func OnCollectionHandler(o oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if o.l != nil {
			defer o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		}
		if r.Method == http.MethodPost {
			ProcessActivity(o).ServeHTTP(w, r)
			return
		}

		colIRI := irif(r)
		res := vocab.OrderedCollectionPage{
			ID:   colIRI,
			Type: vocab.OrderedCollectionPageType,
		}
		it, err := o.s.Load(colIRI)
		if err != nil {
			errors.HandleError(err)
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
			errors.HandleError(err)
			return
		}

		it = res
		accepts := getItemAcceptedContentType(it, r)
		switch {
		case accepts(jsonLD, activityJson, applicationJson):
			ServeActivityPub(it).ServeHTTP(w, r)
		case accepts(imageAny):
			ServeBinData(it).ServeHTTP(w, r)
		case accepts(textHTML):
			fallthrough
		default:
			f, err := TemplateFS.Open("templates/main.html")
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, "%+s", err)
				return
			}
			w.WriteHeader(http.StatusOK)
			io.Copy(w, f)
		}
	}
}

func acceptFollows(o oni, f vocab.Follow) error {
	accept := new(vocab.Accept)
	accept.Type = vocab.AcceptType
	accept.CC = append(accept.CC, vocab.PublicNS)
	accept.Actor = o.a
	accept.InReplyTo = f.GetID()
	accept.Object = f.GetID()

	o.c.SignFn(s2sSignFn(o))

	_, _, err := o.c.ToCollection(vocab.Inbox.IRI(f.Actor), accept)
	if err != nil {
		o.l.Errorf("Failed accepting follow: %+s", err)
	}
	return err
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func ProcessActivity(o oni) processing.ActivityHandlerFn {
	auth, err := auth.New(
		auth.WithStorage(o.s),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "auth"})),
		auth.WithClient(o.c),
	)
	if err != nil {
		o.l.Errorf("invalid auth mw: %s", err.Error())
		return notAcceptable
	}
	processor, err := processing.New(
		processing.WithIRI(o.a.ID), processing.WithClient(o.c), processing.WithStorage(o.s),
		processing.WithLogger(o.l.WithContext(lw.Ctx{"log": "processing"})), processing.WithIDGenerator(GenerateID),
		processing.WithLocalIRIChecker(func(i vocab.IRI) bool {
			return i.Contains(o.a.ID, true)
		}),
	)
	if err != nil {
		o.l.Errorf("invalid processing mw: %s", err.Error())
		return notAcceptable
	}

	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		var it vocab.Item
		o.l.Infof("received req %s: %s", r.Method, r.RequestURI)

		act, err := auth.LoadActorFromAuthHeader(r)
		if err != nil {
			o.l.Errorf("unable to load an authorized Actor from request: %+s", err)
		}

		if ok, err := ValidateRequest(r); !ok {
			o.l.Errorf("failed request validation: %+s", err)
			return it, errors.HttpStatus(err), err
		}
		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) == 0 {
			o.l.Errorf("failed loading body: %+s", err)
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to read request body")
		}
		if it, err = vocab.UnmarshalJSON(body); err != nil {
			o.l.Errorf("failed unmarshaling jsonld body: %+s", err)
			return it, http.StatusInternalServerError, errors.NewNotValid(err, "unable to unmarshal JSON request")
		}

		if err != nil {
			o.l.Errorf("failed initializing the Activity processor: %+s", err)
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
			o.l.Errorf("failed processing activity: %+s", err)
			return it, errors.HttpStatus(err), errors.Annotatef(err, "Can't save activity %s to %s", it.GetType(), receivedIn)
		}

		if it.GetType() == vocab.FollowType {
			err := vocab.OnActivity(it, func(a *vocab.Activity) error {
				return acceptFollows(o, *a)
			})
			if err != nil {
				o.l.Errorf("unable to automatically accept follow: %+s", err)
			}
		}

		status := http.StatusCreated
		if it.GetType() == vocab.DeleteType {
			status = http.StatusGone
		}

		if o.l != nil {
			o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		}
		return it, status, nil
	}
}
