package oni

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
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

var Version = "(devel)"
var ProjectURL = "https://git.sr.ht/~mariusor/oni"

type oni struct {
	Listen      string
	StoragePath string
	TimeOut     time.Duration
	PwHash      []byte

	a []vocab.Actor
	s FullStorage
	l lw.Logger
	m http.Handler
}

type optionFn func(o *oni)

func UpdateActorKey(st FullStorage, l lw.Logger, actor *vocab.Actor) (*vocab.Actor, error) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return actor, errors.Annotatef(err, "unable to save Private Key")
	}

	typ := actor.GetType()
	if !vocab.ActorTypes.Contains(typ) {
		return actor, errors.Newf("trying to generate keys for invalid ActivityPub object type: %s", typ)
	}

	iri := actor.ID

	m, err := st.LoadMetadata(iri)
	if err != nil && !errors.IsNotFound(err) {
		return actor, err
	}
	if m == nil {
		m = new(auth.Metadata)
	}
	if m.PrivateKey != nil {
		l.Debugf("actor %s already has a private key", iri)
	}

	prvEnc, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		l.Errorf("unable to x509.MarshalPKCS8PrivateKey() the private key %T for %s", key, iri)
		return actor, err
	}

	pub := key.Public()
	pubEnc, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		l.Errorf("unable to x509.MarshalPKIXPublicKey() the private key %T for %s", pub, iri)
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

	c := Client(*actor, st, l.WithContext(lw.Ctx{"log": "client"}))
	p := processing.New(
		processing.Async, processing.WithIDGenerator(GenerateID),
		processing.WithLogger(l.WithContext(lw.Ctx{"log": "processing"})),
		processing.WithIRI(actor.ID), processing.WithClient(c), processing.WithStorage(st),
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

	if err = st.SaveMetadata(*m, iri); err != nil {
		l.Errorf("unable to save the private key %T for %s", key, iri)
		return actor, err
	}

	return actor, nil
}

func Oni(initFns ...optionFn) *oni {
	o := new(oni)

	for _, fn := range initFns {
		fn(o)
	}

	if opener, ok := o.s.(interface{ Open() error }); ok {
		if err := opener.Open(); err != nil {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("unable to open storage")
			return o
		}
	}

	localURLs := make(vocab.IRIs, 0, len(o.a))
	for i, act := range o.a {
		it, err := o.s.Load(act.GetLink())
		if err != nil {
			o.l.WithContext(lw.Ctx{"err": err, "id": act.GetLink()}).Errorf("unable to find Actor")
			continue
		}
		actor, err := vocab.ToActor(it)
		if err != nil || actor == nil {
			o.l.WithContext(lw.Ctx{"err": err, "id": act.GetLink()}).Errorf("unable to load Actor")
			continue
		}
		_ = localURLs.Append(actor.GetLink())

		if err := CreateOauth2ClientIfMissing(o.s, actor.ID, DefaultOAuth2ClientPw); err != nil {
			o.l.WithContext(lw.Ctx{"err": err, "id": actor.ID}).Errorf("unable to save OAuth2 Client")
		}

		if actor.PublicKey.PublicKeyPem == "" {
			iri := actor.ID
			if actor, err = UpdateActorKey(o.s, o.l, actor); err != nil {
				o.l.WithContext(lw.Ctx{"err": err, "id": iri}).Errorf("unable to generate Private Key")
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
	return func(o *oni) { o.l = l }
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
		if o.l != nil {
			conf.Logger = o.l
		}
		o.l.WithContext(lw.Ctx{"path": st}).Debugf("Using storage")
		st, err := storage.New(conf)
		if err != nil {
			o.l.Errorf("%s", err.Error())
			return
		}
		o.s = st
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
	if o.l != nil {
		o.l.WithContext(logCtx).Infof("Started")
	}

	stopFn := func(ctx context.Context) {
		o.s.Close()
		err := srvStop(ctx)
		if o.l != nil {
			ll := o.l.WithContext(logCtx)
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
			if o.l != nil {
				o.l.Debugf("SIGHUP received, reloading configuration")
			}
		},
		syscall.SIGUSR1: func(_ chan<- error) {
			InMaintenanceMode = !InMaintenanceMode
			if o.l != nil {
				o.l.WithContext(lw.Ctx{"maintenance": InMaintenanceMode}).Debugf("SIGUSR1 received")
			}
		},
		syscall.SIGINT: func(exit chan<- error) {
			if o.l != nil {
				o.l.Debugf("SIGINT received, stopping")
			}
			exit <- nil
		},
		syscall.SIGTERM: func(exit chan<- error) {
			if o.l != nil {
				o.l.Debugf("SIGTERM received, force stopping")
			}
			exit <- nil
		},
		syscall.SIGQUIT: func(exit chan<- error) {
			if o.l != nil {
				o.l.Debugf("SIGQUIT received, force stopping with core-dump")
			}
			cancelFn()
			exit <- nil
		},
	}).Exec(ctx, srvRun)
	if o.l != nil {
		o.l.Infof("Shutting down")
	}
	return err
}
