package oni

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"time"

	vocab "github.com/go-ap/activitypub"
)

func DefaultValue(name string) vocab.NaturalLanguageValues {
	return vocab.NaturalLanguageValues{vocab.LangRefValueNew(vocab.NilLangRef, name)}
}

func SetPreferredUsername(i vocab.Item, name vocab.NaturalLanguageValues) error {
	return vocab.OnActor(i, func(actor *vocab.Actor) error {
		actor.PreferredUsername = name
		return nil
	})
}

func IRIPath(iri vocab.IRI) (string, bool) {
	u, err := iri.URL()
	if err != nil {
		return "/", false
	}
	if u.Path == "" {
		u.Path = "/"
	}
	return u.Path, true
}

func CollectionExists(ob vocab.Item, col vocab.CollectionPath) bool {
	has := false
	switch col {
	case vocab.Outbox:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Outbox != nil
			return nil
		})
	case vocab.Inbox:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Inbox != nil
			return nil
		})
	case vocab.Liked:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Liked != nil
			return nil
		})
	case vocab.Following:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Following != nil
			return nil
		})
	case vocab.Followers:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Followers != nil
			return nil
		})
	case vocab.Likes:
		vocab.OnObject(ob, func(ob *vocab.Object) error {
			has = ob.Likes != nil
			return nil
		})
	case vocab.Shares:
		vocab.OnObject(ob, func(ob *vocab.Object) error {
			has = ob.Shares != nil
			return nil
		})
	case vocab.Replies:
		vocab.OnObject(ob, func(ob *vocab.Object) error {
			has = ob.Replies != nil
			return nil
		})
	}
	return has
}

func generateRSAKeyPair() (pem.Block, pem.Block) {
	keyPrv, _ := rsa.GenerateKey(rand.Reader, 256)

	keyPub := keyPrv.PublicKey
	pubEnc, err := x509.MarshalPKIXPublicKey(&keyPub)
	if err != nil {
		panic(err)
	}
	prvEnc, err := x509.MarshalPKCS8PrivateKey(keyPrv)
	if err != nil {
		panic(err)
	}
	p := pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubEnc,
	}
	r := pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: prvEnc,
	}
	return p, r
}

func GenerateID(it vocab.Item, col vocab.Item, by vocab.Item) (vocab.ID, error) {
	typ := it.GetType()

	uuid := fmt.Sprintf("%d", time.Now().UTC().UnixMilli())

	if vocab.ActivityTypes.Contains(typ) || vocab.IntransitiveActivityTypes.Contains(typ) {
		err := vocab.OnActivity(it, func(a *vocab.Activity) error {
			author, err := vocab.ToActor(a.Actor)
			if err != nil {
				return err
			}
			a.ID = vocab.Outbox.IRI(author).AddPath(uuid)
			return nil
		})
		return it.GetID(), err
	}

	id := by.GetLink().AddPath("object")
	if it.IsLink() {
		return id, vocab.OnLink(it, func(l *vocab.Link) error {
			l.ID = id
			return nil
		})
	}
	return id, vocab.OnObject(it, func(o *vocab.Object) error {
		o.ID = id
		return nil
	})

	return id, nil
}
