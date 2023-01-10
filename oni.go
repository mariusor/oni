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
)

type oni struct {
	Secure   bool
	CertPath string
	KeyPath  string
	Listen   string
	TimeOut  time.Duration

	v string
	l lw.Logger
	m *http.ServeMux
}

type optionFn func(o *oni)

func Oni(initFns ...optionFn) oni {
	o := oni{}
	for _, fn := range initFns {
		fn(&o)
	}
	return o
}

func WithLogger(l lw.Logger) optionFn {
	return func(o *oni) { o.l = l }
}

func Actor(a vocab.Actor) optionFn {
	return func(o *oni) {
		o.m = ActorRoutes(a)
	}
}

func ListenOn(listen string) optionFn {
	return func(o *oni) {
		o.Listen = listen
	}
}

// Run is the wrapper for starting the web-server and handling signals
func (o oni) Run(c context.Context) error {
	// Create a deadline to wait for.
	ctx, cancelFn := context.WithTimeout(c, o.TimeOut)
	defer cancelFn()

	sockType := ""
	setters := []w.SetFn{w.Handler(o.m)}

	if o.Secure {
		if len(o.CertPath)+len(o.KeyPath) > 0 {
			setters = append(setters, w.WithTLSCert(o.CertPath, o.KeyPath))
		} else {
			o.Secure = false
		}
	}

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
		"version":  o.v,
		"listenOn": o.Listen,
		"TLS":      o.Secure,
	}
	if sockType != "" {
		logCtx["listenOn"] = o.Listen + "[" + sockType + "]"
	}

	// Get start/stop functions for the http server
	srvRun, srvStop := w.HttpServer(setters...)
	o.l.Infof("Started")

	stopFn := func() {
		if err := srvStop(ctx); err != nil {
			o.l.Errorf(err.Error())
		}
	}

	exit := w.RegisterSignalHandlers(w.SignalHandlers{
		syscall.SIGHUP: func(_ chan int) {
			o.l.Infof("SIGHUP received, reloading configuration")
			/*
				if err := f.reload(); err != nil {
					logger.Errorf("Failed: %+s", err.Error())
				}
			*/
		},
		syscall.SIGINT: func(exit chan int) {
			o.l.Infof("SIGINT received, stopping")
			exit <- 0
		},
		syscall.SIGTERM: func(exit chan int) {
			o.l.Infof("SIGITERM received, force stopping")
			exit <- 0
		},
		syscall.SIGQUIT: func(exit chan int) {
			o.l.Infof("SIGQUIT received, force stopping with core-dump")
			exit <- 0
		},
	}).Exec(func() error {
		if err := srvRun(); err != nil {
			o.l.Errorf(err.Error())
			return err
		}
		var err error
		// Doesn't block if no connections, but will otherwise wait until the timeout deadline.
		go func(e error) {
			o.l.Errorf(err.Error())
			stopFn()
		}(err)
		return err
	})
	if exit == 0 {
		o.l.Infof("Shutting down")
	}
	return nil
}
