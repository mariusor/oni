package oni

import (
	"encoding/pem"
	"fmt"

	vocab "github.com/go-ap/activitypub"
)

var (
	pubB, prvB = generateRSAKeyPair()
	//privateKey = pem.EncodeToMemory(&prvB)

	description = `Single actor ActivityPub service.
Version: %s`
)

func PublicKey(iri vocab.IRI) vocab.PublicKey {
	return vocab.PublicKey{
		ID:           vocab.IRI(fmt.Sprintf("%s#main", iri)),
		Owner:        iri,
		PublicKeyPem: string(pem.EncodeToMemory(&pubB)),
	}
}

func defaultActor(iri vocab.IRI) vocab.Actor {
	actor := vocab.Actor{
		ID:                iri,
		Type:              vocab.ApplicationType,
		PreferredUsername: DefaultValue("oni"),
		Summary:           DefaultValue(fmt.Sprintf(description, Version)),
		Inbox:             vocab.Inbox.Of(iri),
		PublicKey:         PublicKey(iri),
	}

	return actor
}
