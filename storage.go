package oni

import (
	"crypto"

	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
)

type localstorage interface {
	processing.Store
	processing.CollectionStore
	osin.Storage
}
type store struct {
	localstorage
}

func Storage(base localstorage) store {
	return store{base}
}

func (s store) LoadKey(vocab.IRI) (crypto.PrivateKey, error) {
	return prvKey, nil
}
