package oni

import (
	"bytes"
	"crypto/rsa"
	"fmt"
	"html/template"
	"net/url"
	"path/filepath"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/filters"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
)

var (
	iconOni            = `<svg aria-hidden="true" name="icon-oni" width="192" height="192"><use href="/icons.svg#icon-oni"><title>Oni</title></use></svg>`
	nameOni            = "Oni"
	descriptionOni     = `Single user ActivityPub service.`
	contentOniTemplate = template.Must(
		template.New("content").
			Parse(`<h1>Congratulations!</h1>
<p>You have successfully started your default Oni server.<br/>
You're currently running version <code>{{ .Version }}</code>.<br/>
The server can be accessed at <a href="{{ .URL }}">{{ .URL }}</a>.<br/>
<hr/>
In order to interact with your instance, you need to use the <a href="https://git.sr.ht/~mariusor/box">BOX</a> CLI helper.<br/>
Some more help can be found on the <a href="https://man.sr.ht/~mariusor/go-activitypub/oni/index.md">official wiki</a>.
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

type Control struct {
	Storage FullStorage
	Logger  lw.Logger
}

func (c *Control) CreateActor(iri vocab.IRI, pw string) (*vocab.Actor, error) {
	it, err := c.Storage.Load(iri)
	if err == nil || (it != nil && !vocab.IsNil(it) && it.GetLink().Equals(iri, true)) {
		if err != nil && !errors.IsNotFound(err) {
			c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Warnf("Actor already exists")
		} else {
			c.Logger.WithContext(lw.Ctx{"iri": iri}).Warnf("Actor already exists")
		}
		if err != nil {
			return nil, err
		}
		return vocab.ToActor(it)
	}

	o := DefaultActor(iri)
	o.Followers = vocab.Followers.Of(iri)
	o.Following = vocab.Following.Of(iri)
	o.Endpoints = &vocab.Endpoints{
		OauthAuthorizationEndpoint: o.GetLink().AddPath("oauth", "authorize"),
		OauthTokenEndpoint:         o.GetLink().AddPath("oauth", "token"),
	}

	if it, err = c.Storage.Save(o); err != nil {
		c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Errorf("Unable to save main actor")
		return nil, err
	} else {
		c.Logger.WithContext(lw.Ctx{"iri": it.GetID()}).Debugf("Created root actor")
	}

	actor, err := vocab.ToActor(it)
	if err != nil {
		c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Errorf("Invalid actor type %T", it)
		return nil, err
	}

	if err = c.Storage.PasswordSet(actor, []byte(pw)); err != nil {
		c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Errorf("Unable to set password for actor")
		return nil, err
	} else {
		c.Logger.Infof("    Successfully set password: %s", pw)
	}
	u, _ := actor.ID.URL()
	if err = c.CreateOAuth2ClientIfMissing(actor.ID, pw); err != nil {
		c.Logger.WithContext(lw.Ctx{"host": u.Hostname(), "err": err.Error()}).Errorf("Unable to save OAuth2 Client")
		return nil, err
	} else {
		c.Logger.WithContext(lw.Ctx{"ClientID": actor.ID}).Debugf("Created OAuth2 Client")
	}

	if addr, err := checkIRIResolvesLocally(actor.ID); err != nil {
		c.Logger.WithContext(lw.Ctx{"err": err.Error()}).Warnf("Unable to resolve actor's hostname to a valid address")
		c.Logger.WithContext(lw.Ctx{"host": u.Host}).Warnf("Please make sure your DNS is configured correctly to point the hostname to the socket oni listens to")
	} else {
		c.Logger.WithContext(lw.Ctx{"host": u.Host, "addr": addr.String()}).Debugf("Successfully resolved hostname to a valid address")
	}

	return actor, nil
}

func (c *Control) GenAccessToken(clientID, actorIdentifier string, dat interface{}) (string, error) {
	if u, err := url.Parse(clientID); err == nil {
		clientID = filepath.Base(u.Path)
		if clientID == "." {
			clientID = u.Host
		}
	}
	cl, err := c.Storage.GetClient(clientID)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	var f processing.Filterable
	if u, err := url.Parse(actorIdentifier); err == nil {
		u.Scheme = "https"
		f = vocab.IRI(u.String())
	} else {
		f = filters.FiltersNew(filters.Name(actorIdentifier), filters.Type(vocab.ActorTypes...))
	}
	list, err := c.Storage.Load(f.GetLink())
	if err != nil {
		return "", err
	}
	if vocab.IsNil(list) {
		return "", errors.NotFoundf("not found")
	}
	var actor vocab.Item
	if list.IsCollection() {
		err = vocab.OnCollectionIntf(list, func(c vocab.CollectionInterface) error {
			f := c.Collection().First()
			if f == nil {
				return errors.NotFoundf("no actor found %s", c.GetLink())
			}
			actor, err = vocab.ToActor(f)
			return err
		})
	} else {
		actor, err = vocab.ToActor(list)
	}
	if err != nil {
		return "", err
	}

	aud := &osin.AuthorizeData{
		Client:      cl,
		CreatedAt:   now,
		ExpiresIn:   86400,
		RedirectUri: cl.GetRedirectUri(),
		State:       "state",
	}

	// generate token code
	aud.Code, err = (&osin.AuthorizeTokenGenDefault{}).GenerateAuthorizeToken(aud)
	if err != nil {
		return "", err
	}

	// generate token directly
	ar := &osin.AccessRequest{
		Type:          osin.AUTHORIZATION_CODE,
		AuthorizeData: aud,
		Client:        cl,
		RedirectUri:   cl.GetRedirectUri(),
		Scope:         "scope",
		Authorized:    true,
		Expiration:    -1,
	}

	ad := &osin.AccessData{
		Client:        ar.Client,
		AuthorizeData: ar.AuthorizeData,
		AccessData:    ar.AccessData,
		ExpiresIn:     ar.Expiration,
		Scope:         ar.Scope,
		RedirectUri:   cl.GetRedirectUri(),
		CreatedAt:     now,
		UserData:      actor.GetLink(),
	}

	// generate access token
	ad.AccessToken, ad.RefreshToken, err = (&osin.AccessTokenGenDefault{}).GenerateAccessToken(ad, ar.GenerateRefresh)
	if err != nil {
		return "", err
	}
	// save authorize data
	if err = c.Storage.SaveAuthorize(aud); err != nil {
		return "", err
	}
	// save access token
	if err = c.Storage.SaveAccess(ad); err != nil {
		return "", err
	}

	return ad.AccessToken, nil
}
