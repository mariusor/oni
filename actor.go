package oni

import (
	"crypto/rsa"
	"fmt"

	vocab "github.com/go-ap/activitypub"
)

var description = `Single actor ActivityPub service.
Version: %s`

func PublicKey(iri vocab.IRI, prvKey *rsa.PrivateKey) vocab.PublicKey {
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
		Outbox:            vocab.Outbox.Of(iri),
		Audience:          vocab.ItemCollection{vocab.PublicNS},
		// NOTE(marius): we create a blank PublicKey so the server doesn't have outbound federation enabled.
		PublicKey: PublicKey(iri, nil),
	}

	return actor
}
