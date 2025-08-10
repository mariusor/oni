package oni

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	w "git.sr.ht/~mariusor/wrapper"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	storage "github.com/go-ap/storage-fs"
)

var (
	Version    = "(devel)"
	ProjectURL = "https://git.sr.ht/~mariusor/oni"
	DefaultURL = "https://oni.local"
)

type oni struct {
	Control

	Listen      string
	StoragePath string
	TimeOut     time.Duration
	PwHash      []byte

	a  []vocab.Actor
	pw string
	m  http.Handler
}

type optionFn func(o *oni)

func (c *Control) UpdateActorKey(actor *vocab.Actor) (*vocab.Actor, error) {
	st := c.Storage
	l := c.Logger

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return actor, errors.Annotatef(err, "unable to save Private Key")
	}

	typ := actor.GetType()
	if !vocab.ActorTypes.Contains(typ) {
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

	cl := Client(*actor, st, l.WithContext(lw.Ctx{"log": "client"}))
	p := processing.New(
		processing.Async, processing.WithIDGenerator(GenerateID),
		processing.WithLogger(l.WithContext(lw.Ctx{"log": "processing"})),
		processing.WithIRI(actor.ID), processing.WithClient(cl), processing.WithStorage(st),
		processing.WithLocalIRIChecker(IRIsContain(vocab.IRIs{actor.ID})),
	)

	followers := vocab.Followers.IRI(actor)
	outbox := vocab.Outbox.IRI(actor)
	upd := new(vocab.Activity)
	upd.Type = vocab.UpdateType
	upd.Actor = actor.GetLink()
	upd.Object = actor
	upd.Published = time.Now().UTC()
	upd.To = vocab.ItemCollection{vocab.PublicNS}
	upd.CC = vocab.ItemCollection{followers}

	_, err = p.ProcessClientActivity(upd, *actor, outbox)
	if err != nil {
		return actor, err
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

func CreateBlankInstance(o *oni) *vocab.Actor {
	blankIRI := vocab.IRI(DefaultURL)
	if it, err := o.Storage.Load(blankIRI); err == nil {
		if blank, err := vocab.ToActor(it); err == nil {
			return blank
		} else {
			o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Warnf("Invalid type %T for expected blank actor", it)
		}
	}

	pw := DefaultOAuth2ClientPw
	if o.pw != "" {
		pw = o.pw
	}

	blank, err := o.CreateActor(blankIRI, pw, true)
	if err != nil {
		o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Warnf("Unable to create Actor")
	}
	return blank
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

func Oni(initFns ...optionFn) *oni {
	o := new(oni)

	for _, fn := range initFns {
		fn(o)
	}

	if opener, ok := o.Storage.(interface{ Open() error }); ok {
		if err := opener.Open(); err != nil {
			o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Unable to open storage")
			return o
		}
	}

	if len(o.a) == 0 {
		if blank := CreateBlankInstance(o); blank != nil {
			o.a = append(o.a, *blank)
		}
	}
	localURLs := make(vocab.IRIs, 0, len(o.a))
	for i, act := range o.a {
		it, err := o.Storage.Load(act.GetLink())
		if err != nil {
			o.Logger.WithContext(lw.Ctx{"err": err, "id": act.GetLink()}).Errorf("Unable to find Actor")
			continue
		}
		actor, err := vocab.ToActor(it)
		if err != nil || actor == nil {
			o.Logger.WithContext(lw.Ctx{"err": err, "id": act.GetLink()}).Errorf("Unable to load Actor")
			continue
		}
		_ = localURLs.Append(actor.GetLink())

		if err = o.CreateOAuth2ClientIfMissing(actor.ID, o.pw); err != nil {
			o.Logger.WithContext(lw.Ctx{"err": err, "id": actor.ID}).Errorf("Unable to save OAuth2 Client")
		}

		if actor.PublicKey.ID == "" {
			iri := actor.ID
			if actor, err = o.UpdateActorKey(actor); err != nil {
				o.Logger.WithContext(lw.Ctx{"err": err, "id": iri}).Errorf("Unable to generate Private Key")
			}
		}

		if actor != nil {
			o.a[i] = *actor
		}
	}

	o.setupRoutes(o.a)
	return o
}

func WithLogger(l lw.Logger) optionFn {
	return func(o *oni) { o.Logger = l }
}

func WithPassword(pw string) optionFn {
	// TODO(marius): this needs a password mechanism per IRI
	return func(o *oni) { o.pw = pw }
}

func LoadActor(items ...vocab.Item) optionFn {
	a := make([]vocab.Actor, 0)
	for _, it := range items {
		if act, err := vocab.ToActor(it); err == nil {
			a = append(a, *act)
			continue
		}
		if vocab.IsIRI(it) {
			a = append(a, DefaultActor(it.GetLink()))
		}
	}
	return Actor(a...)
}

func Actor(a ...vocab.Actor) optionFn {
	return func(o *oni) {
		o.a = a
	}
}

func ListenOn(listen string) optionFn {
	return func(o *oni) {
		o.Listen = listen
	}
}

func emptyLogFn(_ string, _ ...any) {}

func WithStoragePath(st string) optionFn {
	conf := storage.Config{Path: st, UseIndex: false}

	return func(o *oni) {
		o.StoragePath = st
		if o.Logger != nil {
			conf.Logger = o.Logger
		}
		o.Logger.WithContext(lw.Ctx{"path": st}).Debugf("Using storage")
		st, err := storage.New(conf)
		if err != nil {
			o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Unable to initialize storage")
			return
		}
		o.Storage = st
	}
}

func iris(list ...vocab.Actor) vocab.IRIs {
	urls := make(vocab.ItemCollection, 0, len(list))
	for _, a := range list {
		urls = append(urls, a)
	}
	return urls.IRIs()
}

// Run is the wrapper for starting the web-server and handling signals
func (o *oni) Run(c context.Context) error {
	// Create a deadline to wait for.
	ctx, cancelFn := context.WithCancel(c)

	sockType := ""
	setters := []w.SetFn{w.Handler(o.m)}

	if os.Getenv("LISTEN_FDS") != "" {
		sockType = "Systemd"
		setters = append(setters, w.OnSystemd())
	} else if filepath.IsAbs(o.Listen) {
		dir := filepath.Dir(o.Listen)
		if _, err := os.Stat(dir); err == nil {
			sockType = "socket"
			setters = append(setters, w.OnSocket(o.Listen))
			defer func() { _ = os.RemoveAll(o.Listen) }()
		}
	} else {
		sockType = "TCP"
		setters = append(setters, w.OnTCP(o.Listen))
	}
	logCtx := lw.Ctx{
		"version": Version,
		"socket":  o.Listen,
		"hosts":   iris(o.a...),
	}
	if sockType != "" {
		logCtx["socket"] = o.Listen + "[" + sockType + "]"
	}

	// Get start/stop functions for the http server
	srvRun, srvStop := w.HttpServer(setters...)
	if o.Logger != nil {
		o.Logger.WithContext(logCtx).Infof("Started")
	}

	stopFn := func(ctx context.Context) {
		if closer, ok := o.Storage.(interface{ Close() }); ok {
			closer.Close()
		}
		err := srvStop(ctx)
		if o.Logger != nil {
			ll := o.Logger.WithContext(logCtx)
			if err != nil {
				ll.Errorf("%+v", err)
			} else {
				ll.Infof("Stopped")
			}
		}
		cancelFn()
	}
	defer stopFn(ctx)

	err := w.RegisterSignalHandlers(w.SignalHandlers{
		syscall.SIGHUP: func(_ chan<- error) {
			if o.Logger != nil {
				o.Logger.Debugf("SIGHUP received, reloading configuration")
			}
		},
		syscall.SIGUSR1: func(_ chan<- error) {
			InMaintenanceMode = !InMaintenanceMode
			if o.Logger != nil {
				o.Logger.WithContext(lw.Ctx{"maintenance": InMaintenanceMode}).Debugf("SIGUSR1 received")
			}
		},
		syscall.SIGINT: func(exit chan<- error) {
			if o.Logger != nil {
				o.Logger.Debugf("SIGINT received, stopping")
			}
			exit <- nil
		},
		syscall.SIGTERM: func(exit chan<- error) {
			if o.Logger != nil {
				o.Logger.Debugf("SIGTERM received, force stopping")
			}
			exit <- nil
		},
		syscall.SIGQUIT: func(exit chan<- error) {
			if o.Logger != nil {
				o.Logger.Debugf("SIGQUIT received, force stopping with core-dump")
			}
			cancelFn()
			exit <- nil
		},
	}).Exec(ctx, srvRun)
	if o.Logger != nil {
		o.Logger.Infof("Shutting down")
	}
	return err
}
