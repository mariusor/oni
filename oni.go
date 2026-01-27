package oni

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	m "git.sr.ht/~mariusor/servermux"
	"git.sr.ht/~mariusor/storage-all"
	w "git.sr.ht/~mariusor/wrapper"
	vocab "github.com/go-ap/activitypub"
)

var (
	AppName    = "oni"
	Version    = "HEAD"
	ProjectURL = "https://git.sr.ht/~mariusor/oni"
	DefaultURL = "https://oni.local"
)

type oni struct {
	Control

	Listen  string
	TimeOut time.Duration

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

		if err = o.CreateOAuth2ClientAlways(actor.ID, o.pw); err != nil {
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

	// NOTE(marius): we set the debug mode value based on static IsDev
	InDebugMode.Store(IsDev)

	o.setupRoutes()
	return o
}

func WithLogger(l lw.Logger) optionFn {
	return func(o *oni) { o.Control.Logger = l }
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

var ValidStorageTypes = []string{
	string(storage.FS), string(storage.BoltDB), string(storage.Badger), string(storage.Sqlite),
}

func ParseStorageDSN(s string) (storage.Type, string) {
	r := regexp.MustCompile(fmt.Sprintf(`(%s):\/\/(.+)`, strings.Join(ValidStorageTypes, "|")))
	found := r.FindAllSubmatch([]byte(s), -1)
	if len(found) == 0 {
		return storage.Default, s
	}
	sto := found[0]
	if len(sto) == 1 {
		return storage.Default, string(sto[1])
	}
	return storage.Type(sto[1]), string(sto[2])
}

func WithStorage(st FullStorage) optionFn {
	return func(o *oni) {
		o.Storage = st
	}
}

func (o *oni) Pause() error {
	if InMaintenanceMode.Load() {
		// restart everything
		o.Storage.Close()
	} else {
		if storageWithOpen, ok := o.Storage.(interface{ Open() error }); ok {
			return storageWithOpen.Open()
		}
	}
	return nil
}

const defaultGraceWait = 1500 * time.Millisecond

// Run is the wrapper for starting the web-server and handling signals
func (o *oni) Run(c context.Context) error {
	// Create a deadline to wait for.
	ctx, cancelFn := context.WithCancel(c)
	defer cancelFn()

	if err := xdg.WritePid(AppName); err != nil {
		o.Logger.Warnf("Unable to write pid file: %s", err)
		o.Logger.Warnf("Some CLI commands relying on it will not work")
	}
	sockType := ""
	setters := []m.SetFn{m.Handler(o.m)}

	if os.Getenv("LISTEN_FDS") != "" {
		sockType = "Systemd"
		setters = append(setters, m.OnSystemd())
	} else if filepath.IsAbs(o.Listen) {
		dir := filepath.Dir(o.Listen)
		if _, err := os.Stat(dir); err == nil {
			sockType = "socket"
			setters = append(setters, m.OnSocket(o.Listen))
			defer func() { _ = os.RemoveAll(o.Listen) }()
		}
	} else {
		sockType = "TCP"
		setters = append(setters, m.OnTCP(o.Listen))
	}
	logCtx := lw.Ctx{
		"version": Version,
		"socket":  o.Listen,
	}
	if sockType != "" {
		logCtx["socket"] = o.Listen + "[" + sockType + "]"
	}

	// Get start/stop functions for the http server
	httpSrv, err := m.HttpServer(setters...)
	if err != nil {
		return err
	}
	s, err := m.Mux(m.WithServer(httpSrv), m.GracefulWait(defaultGraceWait))
	if err != nil {
		return err
	}
	if o.Logger != nil {
		o.Logger.WithContext(logCtx).Infof("Started")
	}

	stopFn := func(ctx context.Context) error {
		if closer, ok := o.Storage.(interface{ Close() }); ok {
			closer.Close()
		}
		defer func() {
			if err := xdg.CleanPid(AppName); err != nil {
				o.Logger.Errorf("%+v", err)
			}
		}()
		return s.Stop(ctx)
	}

	exitWithErrOrInterrupt := func(err error, exit chan<- error) {
		if err == nil {
			err = w.Interrupt
		}
		exit <- err
	}

	err = w.RegisterSignalHandlers(w.SignalHandlers{
		syscall.SIGUSR1: func(_ chan<- error) {
			maintenance := InMaintenanceMode.Load()
			InMaintenanceMode.Store(!maintenance)
			logFn := o.Logger.WithContext(lw.Ctx{"maintenance": !maintenance}).Debugf
			if err := o.Pause(); err != nil {
				logFn = o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Warnf
			}
			if o.Logger != nil {
				logFn("SIGUSR1 received")
			}
		},
		syscall.SIGUSR2: func(_ chan<- error) {
			debug := InDebugMode.Load()
			InDebugMode.Store(!debug)
			if o.Logger != nil {
				o.Logger.WithContext(lw.Ctx{"debug": !debug}).Debugf("SIGUSR2 received")
			}
		},
		syscall.SIGINT: func(exit chan<- error) {
			o.Logger.WithContext(lw.Ctx{"wait": defaultGraceWait}).Debugf("SIGINT received, interrupted")
			exitWithErrOrInterrupt(stopFn(ctx), exit)
		},
		syscall.SIGTERM: func(exit chan<- error) {
			o.Logger.WithContext(lw.Ctx{"wait": defaultGraceWait}).Debugf("SIGTERM received, stopping with cleanup")
			exitWithErrOrInterrupt(stopFn(ctx), exit)
		},
		syscall.SIGQUIT: func(exit chan<- error) {
			o.Logger.Debugf("SIGQUIT received, ungraceful force stopping")
			// NOTE(marius): to skip any graceful wait on the listening server, cancel the context first
			cancelFn()
			exitWithErrOrInterrupt(stopFn(ctx), exit)
		},
	}).Exec(ctx, s.Start)
	if o.Logger != nil {
		o.Logger.Infof("Stopped")
	}
	return err
}
