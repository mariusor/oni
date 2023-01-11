package oni

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/client"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
)

// NotFound is a generic method to return an 404 error HTTP handler that
func NotFound(l lw.Logger) errors.ErrorHandlerFn {
	return func(w http.ResponseWriter, r *http.Request) error {
		st := http.StatusNotFound
		if l != nil {
			l.Warnf("%s %s %d %s", r.Method, irif(r), st, http.StatusText(st))
		}
		return errors.NotFoundf("%s not found", r.URL.Path)
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
		o.m.Handle(colPath+"/", ServeItem(*o))
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
	o.m.Handle(base, ServeItem(*o))
	o.collectionRoutes(vocab.ActivityPubCollections...)
}

func irif(r *http.Request) vocab.IRI {
	return vocab.IRI(fmt.Sprintf("https://%s%s", r.Host, r.RequestURI))
}

func ServeItem(o oni) processing.ItemHandlerFn {
	return func(r *http.Request) (vocab.Item, error) {
		it, err := o.s.Load(irif(r))
		if err != nil {
			return nil, err
		}
		if vocab.IsNil(it) {
			return nil, errors.NotFoundf("%s not found", r.RequestURI)
		}
		if vocab.IsItemCollection(it) {
			err = vocab.OnItemCollection(it, func(col *vocab.ItemCollection) error {
				if col.Count() == 0 {
					it = nil
					return errors.NotFoundf("%s not found", r.RequestURI)
				}
				if col.Count() == 1 {
					it = col.First()
				}
				return nil
			})
		}
		if vocab.ActorTypes.Contains(it.GetType()) {
			vocab.OnActor(it, func(actor *vocab.Actor) error {
				actor.PublicKey = PublicKey(actor.ID)
				return nil
			})
		}

		if o.l != nil {
			o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		}
		return it, err
	}
}

func ServeCollection(o oni) processing.CollectionHandlerFn {
	return func(typ vocab.CollectionPath, r *http.Request) (vocab.CollectionInterface, error) {
		colIRI := irif(r)
		res := vocab.OrderedCollectionPage{
			ID:   colIRI,
			Type: vocab.OrderedCollectionPageType,
		}
		it, err := o.s.Load(colIRI)
		if err != nil {
			return nil, err
		}
		if vocab.IsItemCollection(it) {
			err = vocab.OnItemCollection(it, func(col *vocab.ItemCollection) error {
				res.OrderedItems = *col
				return nil
			})
		}

		if o.l != nil {
			o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		}
		return &res, err
	}
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

func OnCollectionHandler(o oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodHead, http.MethodGet:
			ServeCollection(o).ServeHTTP(w, r)
		case http.MethodPost:
			ProcessActivity(o).ServeHTTP(w, r)
		}
	}
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func ProcessActivity(o oni) processing.ActivityHandlerFn {
	c := client.New(
		client.WithLogger(o.l.WithContext(lw.Ctx{"log": "client"})),
		client.SkipTLSValidation(true),
	)

	auth, err := auth.New(
		auth.WithStorage(o.s),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "auth"})),
		auth.WithClient(c),
	)
	if err != nil {
		o.l.Errorf("invalid auth mw: %s", err.Error())
		return notAcceptable
	}
	processor, err := processing.New(
		processing.WithIRI(o.a.ID), processing.WithClient(c), processing.WithStorage(o.s),
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

		r.Header.Set("Host", "fedbox.local")
		act, err := auth.LoadActorFromAuthHeader(r)
		if err != nil {
			o.l.Errorf("unable to load an authorized Actor from request: %+s", err)
		}

		if ok, err := ValidateRequest(r); !ok {
			o.l.Errorf("failed request validation: %+s", err)
			return it, errors.HttpStatus(err), err
		}
		body, err := io.ReadAll(r.Body)
		defer func() {
			dir := o.StoragePath
			fn := fmt.Sprintf("%s/%s.req", dir, time.Now().UTC().Format(time.RFC3339))
			all := bytes.Buffer{}
			r.Header.Write(&all)
			all.Write([]byte{'\n', '\n'})
			all.Write(body)
			os.WriteFile(fn, all.Bytes(), 0660)
		}()
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

		status := http.StatusCreated
		if it.GetType() == vocab.DeleteType {
			status = http.StatusGone
		}

		o.l.Infof("All OK!")
		if o.l != nil {
			o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		}
		return it, status, nil
	}
}
