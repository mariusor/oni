package oni

import (
	"net/http"

	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/processing"
)

func collectionRoutes(m *http.ServeMux, actor vocab.Actor, collections ...vocab.CollectionPath) {
	if m == nil {
		return
	}
	base, ok := IRIPath(actor.ID)
	for _, collection := range collections {
		path := base + string(collection)
		if !ok {
			m.Handle(path, http.NotFoundHandler())
			continue
		}
		if !CollectionExists(actor, collection) {
			m.Handle(path, http.NotFoundHandler())
			continue
		}
		colPath, ok := IRIPath(collection.Of(actor.GetLink()).GetLink())
		if !ok {
			m.Handle(path, http.NotFoundHandler())
			continue
		}

		m.Handle(colPath, ServeCollection(actor))
		m.Handle(colPath+"/", ServeObject(actor))
	}
}

func ActorRoutes(actor vocab.Actor) *http.ServeMux {
	m := http.NewServeMux()

	base, ok := IRIPath(actor.ID)
	if !ok {
		m.Handle("/", http.NotFoundHandler())
		return m
	}

	m.Handle(base, ServeActor(actor))
	collectionRoutes(m, actor, vocab.ActivityPubCollections...)

	return m
}

func ServeActor(actor vocab.Actor) processing.ItemHandlerFn {
	return func(request *http.Request) (vocab.Item, error) {
		return actor, nil
	}
}

func ServeObject(actor vocab.Actor) processing.ItemHandlerFn {
	return func(request *http.Request) (vocab.Item, error) {
		return nil, nil
	}
}

func ServeCollection(actor vocab.Actor) processing.CollectionHandlerFn {
	return func(typ vocab.CollectionPath, r *http.Request) (vocab.CollectionInterface, error) {
		return &vocab.OrderedCollection{
			ID: typ.Of(actor).GetLink(),
		}, nil
	}
}

// ProcessActivity handles POST requests to an ActivityPub actor's inbox/outbox, based on the CollectionType
func ProcessActivity(actor vocab.Actor) processing.ActivityHandlerFn {
	return func(receivedIn vocab.IRI, r *http.Request) (vocab.Item, int, error) {
		return nil, http.StatusNotAcceptable, nil
	}
}
