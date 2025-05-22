package oni

import (
	"bytes"
	"crypto/rsa"
	"fmt"
	"html/template"

	vocab "github.com/go-ap/activitypub"
)

var (
	iconOni            = `<svg aria-hidden="true" name="icon-oni"> <use href="/icons.svg#icon-oni"><title>Oni</title></use> </svg>`
	nameOni            = "<strong>Oni</strong>"
	descriptionOni     = `Single actor ActivityPub service.`
	contentOniTemplate = template.Must(
		template.New("content").
			Parse(`<h1>Congratulations!</h1>
<p>You have successfully started your default Oni server.<br/>
You're currently running version <code>{{ .Version }}</code>.<br/>
The server can be accessed at <a href="{{ .URL }}">{{ .URL }}</a>.<br/>
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
