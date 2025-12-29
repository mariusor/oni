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
	iconOni = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132 132">
<path d="M57.51 1q15.179 4.054 11.384 9.266-.542.58-1.626 1.159Q49.38 23.586 43.959 29.957q26.02-5.212 40.655-10.425 2.168-1.158 2.71-1.158 15.178 5.792 15.178 11.583-3.794 3.475-10.299 18.532-5.42 12.741-8.13 16.216-2.711 2.896-5.422-.579-2.168-2.317-3.252-2.317-5.42.58-16.262 2.317-5.963 19.69-21.683 36.487-16.804 16.795-33.066 19.69-5.42.58-2.168-.579 11.925-6.37 25.478-18.532 16.804-14.479 24.934-34.747l-9.215 1.158q0 5.212-2.71 4.633t-4.337-5.791q-.542-1.738-1.084-4.633-5.963-23.166-12.467-28.377-4.337-5.792 11.383-1.738l5.42-1.158q9.216-11.004 14.095-19.112 1.626-2.895 1.626-7.528-.542-2.896 2.168-2.896zm28.73 24.903q-1.084 0-11.383 1.737-9.215 1.158-13.01 1.737l.542.58q4.337 2.895 3.795 5.212 0 .58-1.084 2.896l-1.084 3.474q2.71-.579 5.962-1.737 2.169-.58 3.253-.58 3.794 0 4.878 1.16 1.084 1.737-1.626 2.895-4.879 2.316-13.01 4.054-1.626 6.95-3.794 13.32 5.42-.58 14.636-2.317 1.626 0 3.794.58.542.579 1.084.579 4.879-5.792 8.673-20.85 2.169-12.74-1.626-12.74zm-29.27 4.633q-14.094 2.896-19.515 4.054H36.37l5.42 30.116 11.926-2.316q0-1.159 1.084-2.896 1.626-6.95 2.168-11.004-.542 0-2.168.58-2.71.579-5.42.579-3.795 0-5.421-1.738-1.627-1.158 1.626-1.737 6.505-1.159 11.925-2.896 1.626-8.108-.542-12.74zm31.44 33.01q9.757 2.316 8.13 7.529-4.336 3.474-20.056 22.586l20.057-4.633q0-1.158-.542-2.896-.542-2.316-1.084-2.896 1.084-4.633 11.383 5.792 3.795 7.529-.542 12.74-4.336 1.738-8.13-8.686-.543-1.738-.543-2.317-15.72 7.53-21.683 12.162-3.794 0-5.962-8.108 0-1.158 1.626-1.737 3.252-1.737 4.878-4.054 8.674-12.162 11.384-22.586.542-2.317 1.084-2.896zm-27.648 5.211q.543-4.633 8.131 3.475 0 1.158-1.626 5.791-3.794 12.162-3.794 21.429-1.084 15.057 13.01 19.111 16.261 2.896 33.607-1.158 10.841-2.896 11.384-19.69.542-4.634 1.626-5.792 1.084-.58 1.626 3.474.542 1.738.542 5.213 1.084 6.95 2.71 11.003 3.795 8.108-6.504 11.583-9.758 4.633-30.897 5.792-31.982.583-31.982-26.057 0-5.792 1.626-17.374 1.626-12.741.542-16.795z"/>
</svg>`
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
