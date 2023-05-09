package oni

import (
	"crypto/rsa"
	"fmt"

	vocab "github.com/go-ap/activitypub"
)

var description = `Single actor ActivityPub service.
Version: %s`

func PublicKey(iri vocab.IRI, prvKey *rsa.PrivateKey) vocab.PublicKey {
	if prvKey == nil {
		return vocab.PublicKey{}
	}
	return vocab.PublicKey{
		ID:           vocab.IRI(fmt.Sprintf("%s#main", iri)),
		Owner:        iri,
		PublicKeyPem: pemEncodePublicKey(prvKey),
	}
}

func DefaultActor(iri vocab.IRI) vocab.Actor {
	actor := vocab.Actor{
		ID:                iri,
		Type:              vocab.ApplicationType,
		PreferredUsername: DefaultValue("oni"),
		Summary:           DefaultValue(fmt.Sprintf(description, Version)),
		Inbox:             vocab.Inbox.Of(iri),
		PublicKey:         PublicKey(iri, nil),
	}

	return actor
}
