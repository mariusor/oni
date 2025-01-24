package oni

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"os"
	"path/filepath"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	w "git.sr.ht/~mariusor/wrapper"
	vocab "github.com/go-ap/activitypub"
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

func Oni(initFns ...optionFn) *oni {
	o := new(oni)

	for _, fn := range initFns {
		fn(o)
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
			// NOTE(marius): this generates a new key pair for every run of the service
			prvKey, err := rsa.GenerateKey(rand.Reader, 2048)
			if err != nil {
				o.l.WithContext(lw.Ctx{"err": err, "id": actor.ID}).Errorf("unable to save Private Key")
				continue
			}

			// NOTE(marius): even though we generate the keys, we don't save them if storage reports they exist
			it, err = o.s.SaveKey(actor.GetLink(), prvKey)
			if err != nil {
				o.l.WithContext(lw.Ctx{"err": err, "id": actor.ID}).Errorf("unable to save Private Key")
				continue
			}

			actor, err = vocab.ToActor(it)
			if err != nil {
				o.l.WithContext(lw.Ctx{"err": err, "id": actor.ID}).Errorf("unable to convert saved Item to Actor")
				continue
			}
		}

		o.a[i] = *actor
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
		o.l.Infof("Using storage: %s", st)
		st, err := storage.New(conf)
		if err != nil {
			o.l.Errorf("%s", err.Error())
			return
		}
		o.s = st
	}
}

func iris(list ...vocab.Actor) vocab.IRIs {
	urls := vocab.IRIs{}
	for _, a := range list {
		urls = append(urls, a.GetLink())
	}
	return urls
}

// Run is the wrapper for starting the web-server and handling signals
func (o *oni) Run(c context.Context) error {
	// Create a deadline to wait for.
	ctx, cancelFn := context.WithTimeout(c, o.TimeOut)
	defer cancelFn()

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
			defer func() { os.RemoveAll(o.Listen) }()
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

	stopFn := func() {
		if err := srvStop(ctx); err != nil {
			o.l.WithContext(logCtx).Errorf("%+v", err)
		}
	}
	defer stopFn()

	err := w.RegisterSignalHandlers(w.SignalHandlers{
		syscall.SIGHUP: func(_ chan<- error) {
			if o.l != nil {
				o.l.Infof("SIGHUP received, reloading configuration")
			}
		},
		syscall.SIGINT: func(exit chan<- error) {
			if o.l != nil {
				o.l.Infof("SIGINT received, stopping")
			}
			exit <- nil
		},
		syscall.SIGTERM: func(exit chan<- error) {
			if o.l != nil {
				o.l.Infof("SIGITERM received, force stopping")
			}
			exit <- nil
		},
		syscall.SIGQUIT: func(exit chan<- error) {
			if o.l != nil {
				o.l.Infof("SIGQUIT received, force stopping with core-dump")
			}
			exit <- nil
		},
	}).Exec(ctx, srvRun)
	if o.l != nil {
		o.l.Infof("Shutting down")
	}
	return err
}
