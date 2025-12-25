package main

import (
	"syscall"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
)

type Maintenance struct{}

func (m Maintenance) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGUSR1)
}

type Debug struct{}

func (d Debug) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGUSR2)
}

type Reload struct{}

func (m Reload) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGHUP)
}

type Stop struct{}

func (m Stop) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGTERM)
}

func (c *Control) SendSignal(sig syscall.Signal) error {
	pid, err := xdg.ReadPid(oni.AppName)
	if err != nil {
		return errors.Annotatef(err, "unable to read pid file")
	}
	return syscall.Kill(pid, sig)
}

type FixCollections struct {
	For []string `arg:"" description:"The root actors we want to run the operation for."`
}

func (f FixCollections) Run(ctl *Control) error {
	if len(f.For) == 0 {
		ctl.Logger.WithContext(lw.Ctx{"iri": oni.DefaultURL}).Warnf("No arguments received adding actor with default URL")
		f.For = append(f.For, oni.DefaultURL)
	}
	for _, u := range f.For {
		it, err := ctl.Storage.Load(vocab.IRI(u))
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Invalid actor URL")
			continue
		}
		actor, err := vocab.ToActor(it)
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Invalid actor found for URL")
			continue
		}
		_, err = ctl.Storage.Save(actor)
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Unable to save main Actor")
			continue
		}
		err = tryCreateCollection(ctl, actor.Outbox.GetLink())
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": actor.ID, "err": err.Error()}).Errorf("Unable to save Outbox collection for main Actor")
			continue
		}
	}
	return nil
}
