package oni

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	w "git.sr.ht/~mariusor/wrapper"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/client"
	storage "github.com/go-ap/storage-fs"
)

var Version = "(devel)"

type oni struct {
	Listen      string
	StoragePath string
	TimeOut     time.Duration
	PwHash      []byte

	c *client.C
	a []vocab.Actor
	s FullStorage
	l lw.Logger
	m http.Handler
	o *auth.Server
}

type optionFn func(o *oni)

func Oni(initFns ...optionFn) *oni {
	o := new(oni)

	for _, fn := range initFns {
		fn(o)
	}

	o.c = client.New(
		client.WithLogger(o.l.WithContext(lw.Ctx{"log": "client"})),
		client.SkipTLSValidation(true),
	)

	for _, actor := range o.a {
		if err := saveOauth2Client(o.s, actor.ID); err != nil {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("unable to save OAuth2 client")
		}

		if actor.ID != "" && o.s != nil {
			it, err := o.s.Load(actor.ID)
			if err != nil {
				o.l.Errorf("%s", err.Error())
			}
			err = vocab.OnItemCollection(it, func(col *vocab.ItemCollection) error {
				if col.Count() == 0 {
					actor.PublicKey = vocab.PublicKey{}
					it, err := o.s.Save(actor)
					if err != nil {
						return err
					}
					return vocab.OnActor(it, func(act *vocab.Actor) error {
						o.l.Infof("Persisted default actor")
						actor = *act
						return nil
					})
				}
				return vocab.OnActor(col.First(), func(act *vocab.Actor) error {
					actor = *act
					return nil
				})
			})
			if err != nil {
				o.l.Errorf("%s", err.Error())
			}
			o.setupRoutes(o.a)
		}
	}
	return o
}

func WithLogger(l lw.Logger) optionFn {
	return func(o *oni) { o.l = l }
}

func LoadActor(items ...vocab.Item) optionFn {
	a := make([]vocab.Actor, 0)
	for _, it := range items {
		if vocab.IsIRI(it) {
			a = append(a, defaultActor(it.GetLink()))
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
	conf := storage.Config{CacheEnable: true, Path: st, ErrFn: emptyLogFn, LogFn: emptyLogFn}

	return func(o *oni) {
		o.StoragePath = st
		if o.l != nil {
			conf.LogFn = o.l.Infof
			conf.ErrFn = o.l.Errorf
		}
		conf.LogFn("Using storage: %s", st)
		st, err := storage.New(conf)
		if err != nil {
			conf.ErrFn("%s", err.Error())
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

	if o.Listen == "systemd" {
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
			o.l.WithContext(logCtx).Errorf(err.Error())
		}
	}

	exit := w.RegisterSignalHandlers(w.SignalHandlers{
		syscall.SIGHUP: func(_ chan int) {
			if o.l != nil {
				o.l.Infof("SIGHUP received, reloading configuration")
			}
		},
		syscall.SIGINT: func(exit chan int) {
			if o.l != nil {
				o.l.Infof("SIGINT received, stopping")
			}
			exit <- 0
		},
		syscall.SIGTERM: func(exit chan int) {
			if o.l != nil {
				o.l.Infof("SIGITERM received, force stopping")
			}
			exit <- 0
		},
		syscall.SIGQUIT: func(exit chan int) {
			if o.l != nil {
				o.l.Infof("SIGQUIT received, force stopping with core-dump")
			}
			exit <- 0
		},
	}).Exec(func() error {
		if err := srvRun(); err != nil {
			if o.l != nil {
				o.l.Errorf(err.Error())
			}
			return err
		}
		var err error
		// Doesn't block if no connections, but will otherwise wait until the timeout deadline.
		go func(e error) {
			if o.l != nil {
				o.l.Errorf(err.Error())
			}
			stopFn()
		}(err)
		return err
	})
	if exit == 0 {
		if o.l != nil {
			o.l.Infof("Shutting down")
		}
	}
	return nil
}
