package oni

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"git.sr.ht/~mariusor/cache"
	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/client"
	"github.com/go-ap/client/debug"
	"github.com/go-ap/client/s2s"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
)

type Control struct {
	Storage FullStorage
	Logger  lw.Logger

	StoragePath string
}

func MkDirIfNotExists(p string) (err error, exists bool) {
	p, err = filepath.Abs(p)
	if err != nil {
		return err, exists
	}
	fi, err := os.Stat(p)
	if err != nil && os.IsNotExist(err) {
		if err = os.MkdirAll(p, os.ModeDir|os.ModePerm|0700); err != nil {
			return err, exists
		}
		fi, err = os.Stat(p)
	} else {
		exists = fi != nil
	}
	if err != nil {
		return err, exists
	}
	if !fi.IsDir() {
		return fmt.Errorf("path exists, and is not a folder %s", p), true
	}
	return nil, exists
}

func (c *Control) Client(actor vocab.Actor, lctx lw.Ctx) *client.C {
	lctx["log"] = "client"
	st := c.Storage
	l := c.Logger.WithContext(lctx)

	cachePath, err := os.UserCacheDir()
	if err != nil {
		cachePath = os.TempDir()
	}

	ua := fmt.Sprintf("%s@%s (+%s)", ProjectURL, Version, actor.GetLink())
	tr := client.UserAgentTransport(ua, cache.Private(http.DefaultTransport, cache.FS(filepath.Join(cachePath, "oni"))))
	if !vocab.PublicNS.Equals(actor.ID, true) {
		if prv, _ := st.LoadKey(actor.ID); prv != nil {
			tr = s2s.New(s2s.WithTransport(tr), s2s.WithActor(&actor, prv), s2s.WithLogger(l.WithContext(lw.Ctx{"log": "HTTP-Sig"})))
			lctx["transport"] = "HTTP-Sig"
			lctx["actor"] = actor.GetLink()
		}
	}

	if InDebugMode.Load() {
		tr = debug.New(debug.WithTransport(tr), debug.WithPath(c.StoragePath))
	}

	baseClient := Client(tr)
	return client.New(
		client.WithLogger(l.WithContext(lctx)),
		client.WithHTTPClient(baseClient),
		client.SkipTLSValidation(IsDev),
	)
}

func (c *Control) CreateActor(iri vocab.IRI, pw string) (*vocab.Actor, error) {
	it, err := c.Storage.Load(iri)
	if err != nil {
		if !errors.IsNotFound(err) {
			return nil, err
		}
	}
	if it != nil && !vocab.IsNil(it) && it.GetLink().Equals(iri, true) {
		act, err := vocab.ToActor(it)
		if err != nil {
			return nil, err
		}
		c.Logger.WithContext(lw.Ctx{"iri": iri}).Warnf("Actor already exists")
		return act, errors.Annotatef(os.ErrExist, "actor exists")
	}

	o := DefaultActor(iri)
	iri = o.GetLink()
	o.Followers = vocab.Followers.Of(iri)
	o.Following = vocab.Following.Of(iri)
	o.Endpoints = &vocab.Endpoints{
		OauthAuthorizationEndpoint: iri.AddPath("oauth", "authorize"),
		OauthTokenEndpoint:         iri.AddPath("oauth", "token"),
		ProxyURL:                   iri.AddPath("proxyUrl"),
	}

	actor := &o
	actor, err = c.AddActorWithPassword(actor, []byte(pw), o)
	if err != nil {
		c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Errorf("Unable to save instance actor")
		return nil, err
	}

	u, _ := actor.ID.URL()
	if err = c.CreateOAuth2ClientAlways(actor.ID, pw); err != nil {
		c.Logger.WithContext(lw.Ctx{"host": u.Hostname(), "err": err.Error()}).Errorf("Unable to save OAuth2 Client")
		return nil, err
	}
	c.Logger.WithContext(lw.Ctx{"ClientID": actor.ID}).Debugf("Created OAuth2 Client")

	if actor, err = c.GenKeyPair(actor); err != nil {
		c.Logger.WithContext(lw.Ctx{"err": err, "id": o.ID}).Errorf("Unable to generate Private/Public key pair")
	}
	c.Logger.WithContext(lw.Ctx{"id": o.ID}).Debugf("Created Private/Public key pair")

	// NOTE(marius): a second save to update the public key
	if it, err = c.Storage.Save(actor); err != nil {
		c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Errorf("Unable to save main actor")
		return nil, err
	}

	if actor, err = vocab.ToActor(it); err != nil {
		c.Logger.WithContext(lw.Ctx{"iri": iri, "err": err.Error()}).Errorf("Invalid actor type %T", it)
		return nil, err
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

	u, err := url.Parse(actorIdentifier)
	if err != nil {
		return "", err
	}
	u.Scheme = "https"
	list, err := c.Storage.Load(vocab.IRI(u.String()))
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

func (c *Control) GenKeyPair(actor *vocab.Actor) (*vocab.Actor, error) {
	st := c.Storage
	l := c.Logger

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return actor, errors.Annotatef(err, "unable to save Private Key")
	}

	typ := actor.GetType()
	if !vocab.ActorTypes.Match(typ) {
		return actor, errors.Newf("trying to generate keys for invalid ActivityPub object type: %s", typ)
	}

	iri := actor.ID

	m := new(auth.Metadata)
	if err = st.LoadMetadata(iri, m); err != nil && !errors.IsNotFound(err) {
		return actor, err
	}
	if m.PrivateKey != nil {
		l.WithContext(lw.Ctx{"iri": iri}).Debugf("Actor already has a private key")
	}

	prvEnc, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		l.WithContext(lw.Ctx{"key": key, "iri": iri}).Errorf("Unable to x509.MarshalPKCS8PrivateKey()")
		return actor, err
	}

	pub := key.Public()
	pubEnc, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		l.WithContext(lw.Ctx{"pubKey": pub, "iri": iri}).Errorf("Unable to x509.MarshalPKIXPublicKey()")
		return actor, err
	}
	pubEncoded := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubEnc,
	})

	actor.PublicKey = vocab.PublicKey{
		ID:           vocab.IRI(fmt.Sprintf("%s#main", iri)),
		Owner:        iri,
		PublicKeyPem: string(pubEncoded),
	}
	m.PrivateKey = pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: prvEnc,
	})

	if err = st.SaveMetadata(iri, m); err != nil {
		l.WithContext(lw.Ctx{"key": key, "iri": iri}).Errorf("Unable to save the private key")
		return actor, err
	}

	return actor, nil
}

func (c *Control) UpdateActorKey(actor *vocab.Actor) (*vocab.Actor, error) {
	// NOTE(marius): we initialize the client that we're going to use for Update
	// dissemination with an HTTP-Signature based on the current private key.
	cl := c.Client(*actor, lw.Ctx{"log": "client"})

	st := c.Storage
	l := c.Logger

	p := processing.New(
		processing.WithIDGenerator(GenerateID),
		processing.WithLogger(l.WithContext(lw.Ctx{"log": "processing"})),
		processing.WithIRI(actor.ID), processing.WithClient(cl), processing.WithStorage(st),
		processing.WithLocalIRIChecker(c.IRIHasLocalParent()),
	)

	var err error
	if actor, err = c.GenKeyPair(actor); err != nil {
		return actor, err
	}

	followers := vocab.Followers.IRI(actor)
	outbox := vocab.Outbox.IRI(actor)
	upd := new(vocab.Activity)
	upd.Type = vocab.UpdateType
	upd.Actor = actor.GetLink()
	upd.Object = actor
	upd.Published = time.Now().UTC()
	upd.To = vocab.ItemCollection{vocab.PublicNS}
	upd.CC = vocab.ItemCollection{followers}

	if _, err = p.ProcessClientActivity(upd, *actor, outbox); err != nil {
		return actor, err
	}

	return actor, nil
}

func checkIRIResolvesLocally(iri vocab.IRI) (*net.TCPAddr, error) {
	uu, err := iri.URL()
	if err != nil {
		return nil, err
	}

	host := uu.Host
	if strings.LastIndexByte(host, ':') < 0 {
		if uu.Scheme == "https" {
			host += ":443"
		} else {
			host += ":80"
		}
	}
	return net.ResolveTCPAddr("tcp", host)
}

func (c *Control) CreateOAuth2ClientAlways(i vocab.IRI, pw string) error {
	u, _ := i.URL()
	if pw == "" {
		pw = DefaultOAuth2ClientPw
	}

	id := string(uriRootIRI(u))
	uris := append(
		[]string{id, DefaultOniAppRedirectURL, DefaultBOXAppRedirectURL, processing.OAuthOOBRedirectURN},
		strings.Split(ExtraRedirectURL, "\n")...,
	)
	cl := &osin.DefaultClient{
		Id:          id,
		Secret:      pw,
		RedirectUri: strings.Join(uris, "\n"),
		UserData:    i,
	}
	return c.Storage.CreateClient(cl)
}

func (c *Control) AddActorWithPassword(p *vocab.Person, pw []byte, author vocab.Actor) (*vocab.Person, error) {
	if c.Storage == nil {
		return nil, errors.Errorf("invalid storage backend")
	}
	if author.GetLink().Equals(auth.AnonymousActor.GetLink(), false) {
		return nil, errors.Errorf("invalid parent actor")
	}

	createdAt := time.Now().UTC()
	create := vocab.Activity{
		Type:    vocab.CreateType,
		To:      vocab.ItemCollection{vocab.PublicNS},
		Actor:   author,
		Updated: createdAt,
		Object:  p,
	}
	if create.AttributedTo == nil {
		create.AttributedTo = author.GetLink()
	}
	if !create.CC.Contains(author.GetLink()) {
		_ = create.CC.Append(author.GetLink())
	}

	outbox := vocab.Outbox.Of(author)
	if vocab.IsNil(outbox) {
		return nil, errors.Newf("unable to find Actor's outbox: %s", author)
	}

	lwCtx := lw.Ctx{"op": "bootstrap"}
	ap := processing.New(
		processing.WithLogger(c.Logger.WithContext(lwCtx)),
		processing.WithClient(c.Client(author, lwCtx)),
		processing.WithStorage(c.Storage),
		processing.WithIDGenerator(GenerateID),
		processing.WithIRI(author.ID),
	)
	if _, err := ap.ProcessClientActivity(create, author, outbox.GetLink()); err != nil {
		return nil, err
	}

	var err error
	if pw != nil {
		err = c.Storage.PasswordSet(p.GetLink(), pw)
	}
	return p, err
}
