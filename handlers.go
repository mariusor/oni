package oni

import (
	"fmt"
	"net/http"

	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
)

func (o *oni) collectionRoutes(collections ...vocab.CollectionPath) {
	actor := o.a
	base, ok := IRIPath(actor.ID)
	for _, collection := range collections {
		path := base + string(collection)
		if !ok {
			o.m.Handle(path, http.NotFoundHandler())
			continue
		}
		if !CollectionExists(actor, collection) {
			o.m.Handle(path, http.NotFoundHandler())
			continue
		}
		colPath, ok := IRIPath(collection.Of(actor.GetLink()).GetLink())
		if !ok {
			o.m.Handle(path, http.NotFoundHandler())
			continue
		}

		o.m.Handle(colPath, ServeCollection(*o))
		o.m.Handle(colPath+"/", ServeItem(*o))
	}
}

func (o *oni) setupRoutes() {
	o.m = http.NewServeMux()

	if o.a.ID == "" {
		o.m.Handle("/", http.NotFoundHandler())
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

		o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
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

		o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		return &res, err
	}
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func ProcessActivity(o oni) processing.ActivityHandlerFn {
	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		o.l.Debugf("%s %s %d %s", r.Method, irif(r), http.StatusOK, http.StatusText(http.StatusOK))
		return nil, http.StatusNotAcceptable, nil
	}
}
