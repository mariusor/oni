package oni

import (
	"encoding/pem"
	"fmt"

	vocab "github.com/go-ap/activitypub"
)

var (
	pubB, prvB = generateRSAKeyPair()
	privateKey = pem.EncodeToMemory(&prvB)
	publicKey  = pem.EncodeToMemory(&pubB)

	description = `Single actor ActivityPub service.
Version %s`
)

func LoadActor(iri vocab.IRI, version string) vocab.Actor {
	pub := vocab.PublicKey{}
	if len(pubB.Bytes) > 0 {
		pub.ID = vocab.IRI(fmt.Sprintf("%s#main", iri))
		pub.Owner = iri
		pub.PublicKeyPem = string(publicKey)
	}

	actor := vocab.Actor{
		ID:                iri,
		Type:              vocab.PersonType,
		PreferredUsername: DefaultValue("marius"),
		Summary:           DefaultValue(fmt.Sprintf(description, version)),
		Inbox:             vocab.Inbox.Of(iri),
		Outbox:            vocab.Outbox.Of(iri),
		PublicKey:         pub,
	}

	return actor
}
