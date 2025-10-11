package oni

import (
	"bytes"
	"crypto/rsa"
	"fmt"
	"html/template"
	"os"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/errors"
)

var (
	iconOni            = `<svg aria-hidden="true" name="icon-oni" width="192" height="192"><use href="/icons.svg#icon-oni"><title>Oni</title></use></svg>`
	nameOni            = "Oni"
	descriptionOni     = `Single user ActivityPub service.`
	contentOniTemplate = template.Must(
		template.New("content").
			Parse(`<h1>Congratulations!</h1>
<p>You have successfully started your default <strong>Oni</strong> server.<br/>
You're currently running version <code>{{ .Version }}</code>.<br/>
The server can be accessed at <a href="{{ .URL }}">{{ .URL }}</a>.<br/>
<hr/>
In order to interact with your instance, you need to use the <a href="https://git.sr.ht/~mariusor/box">BOX</a> CLI helper.<br/>
More details can be found on the <a href="https://man.sr.ht/~mariusor/go-activitypub/oni/index.md">official wiki</a>.
</p>`))
)

func DefaultActor(iri vocab.IRI) vocab.Actor {
	contentOni := bytes.Buffer{}
	_ = contentOniTemplate.Execute(&contentOni, struct {
		Version string
		URL     string
	}{Version: Version, URL: iri.String()})

	actor := vocab.Actor{
		ID:                iri,
		Type:              vocab.ApplicationType,
		PreferredUsername: DefaultValue(nameOni),
		Summary:           DefaultValue(descriptionOni),
		Content:           DefaultValue(contentOni.String()),
		Inbox:             vocab.Inbox.Of(iri),
		Outbox:            vocab.Outbox.Of(iri),
		Audience:          vocab.ItemCollection{vocab.PublicNS},
		Icon: vocab.Object{
			Type:      vocab.ImageType,
			MediaType: "image/svg+xml",
			Content:   DefaultValue(iconOni),
		},
		// NOTE(marius): we create a blank PublicKey so the server doesn't have outbound federation enabled.
		PublicKey: PublicKey(iri, nil),
	}

	return actor
}

func PublicKey(iri vocab.IRI, prvKey *rsa.PrivateKey) vocab.PublicKey {
	return vocab.PublicKey{
		ID:           vocab.IRI(fmt.Sprintf("%s#main", iri)),
		Owner:        iri,
		PublicKeyPem: pemEncodePublicKey(prvKey),
	}
}

func CreateBlankActor(o *oni, id vocab.IRI) vocab.Actor {
	blank, err := o.Control.CreateActor(id, o.pw)
	if err != nil {
		if errors.Is(err, os.ErrExist) && blank != nil {
			return *blank
		}
		o.Logger.WithContext(lw.Ctx{"err": err.Error(), "iri": id}).Warnf("unable to create root actor")
		return auth.AnonymousActor
	}
	o.Logger.WithContext(lw.Ctx{"iri": id}).Infof("Created new root actor")
	return *blank
}
