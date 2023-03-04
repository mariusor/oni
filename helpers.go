package oni

import (
	"bytes"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/http"
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

func pemEncodePublicKey(prvKey *rsa.PrivateKey) string {
	pubKey := prvKey.PublicKey
	pubEnc, err := x509.MarshalPKIXPublicKey(&pubKey)
	if err != nil {
		panic(err)
	}
	p := pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubEnc,
	}

	return string(pem.EncodeToMemory(&p))
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

func getBinData(nlVal vocab.NaturalLanguageValues) (string, []byte, error) {
	val := nlVal.First().Value

	contentType := "application/octet-stream"
	colPos := bytes.Index(val, []byte{':'})
	if colPos < 0 {
		colPos = 0
	}

	semicolPos := bytes.Index(val, []byte{';'})
	if semicolPos > 0 {
		contentType = string(val[colPos+1 : semicolPos])
	}
	comPos := bytes.Index(val, []byte{','})
	decType := val[semicolPos+1 : comPos]

	var raw []byte
	switch string(decType) {
	case "base64":
		data := val[comPos+1:]

		dec := base64.RawStdEncoding
		raw = make([]byte, dec.DecodedLen(len(data)))
		cnt, err := dec.Decode(raw, data)
		if err != nil {
			return contentType, raw, err
		}
		if cnt != len(data) {
			// something wrong
		}
	}

	return contentType, raw, nil
}

func isData(nlVal vocab.NaturalLanguageValues) bool {
	return nlVal != nil && bytes.Equal(nlVal.First().Value[:4], []byte("data"))
}

func irif(r *http.Request) vocab.IRI {
	return vocab.IRI(fmt.Sprintf("https://%s%s", r.Host, r.RequestURI))
}
