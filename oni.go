package oni

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	w "git.sr.ht/~mariusor/wrapper"
	vocab "github.com/go-ap/activitypub"
	storage "github.com/go-ap/storage-fs"
)

var (
	AppName    = "oni"
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

	mu *sync.Mutex
	a  []vocab.Actor
	pw string
	m  http.Handler
}

type optionFn func(o *oni)

func Oni(initFns ...optionFn) *oni {
	o := new(oni)

	for _, fn := range initFns {
		fn(o)
	}

	o.mu = &sync.Mutex{}
	if opener, ok := o.Storage.(interface{ Open() error }); ok {
		if err := opener.Open(); err != nil {
			o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Unable to open storage")
			return o
		}
	}

	if len(o.a) == 0 {
		o.Logger.Warnf("Storage does not contain any actors.")
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
				o.Logger.WithContext(lw.Ctx{"err": err, "id": iri}).Errorf("Unable to generate Private/Public key pair")
			}
		}

		if actor != nil {
			o.a[i] = *actor
		}
	}

	o.setupRoutes()
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

	if err := xdg.WritePid(AppName); err != nil {
		o.Logger.Warnf("Unable to write pid file: %s", err)
		o.Logger.Warnf("Some CLI commands relying on it will not work")
	}
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
		syscall.SIGUSR2: func(_ chan<- error) {
			InDebugMode = !InDebugMode
			if o.Logger != nil {
				o.Logger.WithContext(lw.Ctx{"debug": InDebugMode}).Debugf("SIGUSR2 received")
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
