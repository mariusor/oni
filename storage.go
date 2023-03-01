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

func (s store) LoadKey(i vocab.IRI) (crypto.PrivateKey, error) {
	if ks, ok := s.localstorage.(processing.KeyLoader); ok {
		if k, _ := ks.LoadKey(i); k != nil {
			return k, nil
		}
	}
	return prvKey, nil
}
