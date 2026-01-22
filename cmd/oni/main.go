package main

import (
	"context"
	"fmt"
	"os"
	"runtime/debug"
	"slices"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	"git.sr.ht/~mariusor/storage-all"
	"github.com/alecthomas/kong"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
)

func main() {
	if build, ok := debug.ReadBuildInfo(); ok && oni.Version == "HEAD" {
		if build.Main.Version != "(devel)" {
			oni.Version = build.Main.Version
		}
		for _, bs := range build.Settings {
			if bs.Key == "vcs.revision" {
				oni.Version = bs.Value[:8]
			}
			if bs.Key == "vcs.modified" {
				oni.Version += "-git"
			}
		}
	}

	ctx := kong.Parse(&CLI,
		kong.Name(oni.AppName),
		kong.Description("CLI helper to manage and run ${name} instances, version ${version}."),
		kong.UsageOnError(),
		kong.Vars{
			"name":         oni.AppName,
			"version":      oni.Version,
			"default_path": xdg.DataPath(oni.AppName),
			"default_pw":   oni.DefaultOAuth2ClientPw,
			"default_url":  oni.DefaultURL,
		},
		kong.ConfigureHelp(kong.HelpOptions{Compact: true, Summary: true}),
	)

	storageType := storage.Default
	typ, path := oni.ParseStorageDSN(CLI.Path)
	if slices.Contains(oni.ValidStorageTypes, string(typ)) {
		storageType = typ
		CLI.Path = path
	}

	ll := lw.Dev()
	if CLI.Verbose {
		ll = lw.Dev(lw.SetLevel(lw.DebugLevel))
	}
	ll = ll.WithContext(lw.Ctx{"path": CLI.Path})
	ctl, err := setupCtl(CLI.Path, ll, storageType)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "Error: %+v\n", err)
		os.Exit(1)
	}
	if err = ctl.Open(); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "Error: %+v\n", err)
		os.Exit(1)
	}
	defer ctl.Close()

	if err = ctx.Run(ctl); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "Error: %+v\n", err)
		os.Exit(1)
	}
}

type Run struct {
	Listen string `default:"127.0.0.1:60123" short:"l" help:"Listen socket"`
	URL    string `default:"${default_url}" help:"Default URL for the instance actor"`
	Pw     string `default:"${default_pw}" help:"Default password to use for the instance actor"`
}

func (s Run) Run(ctl *Control) error {
	return oni.Oni(
		oni.WithPassword(s.Pw),
		oni.WithLogger(ctl.Logger),
		oni.WithStorage(ctl.Storage),
		oni.ListenOn(s.Listen),
	).Run(context.Background())
}

type Control struct {
	oni.Control

	Service vocab.Actor
}

func (c *Control) Close() {
	if _, ok := c.Storage.(interface{ Open() error }); ok {
		_ = c.SendSignal(syscall.SIGUSR1)
	}
	c.Storage.Close()
}

func (c *Control) Open() error {
	if opener, ok := c.Storage.(interface{ Open() error }); ok {
		_ = c.SendSignal(syscall.SIGUSR1)
		return opener.Open()
	}
	return nil
}

var CLI struct {
	Path    string `default:"${default_path}" help:"Storage path (or DSN) for the ActivityPub storage. DSN can have the format type:///path/to/storage."`
	Verbose bool   `default:"false" help:"Show verbose log output"`

	Run         Run         `cmd:"" help:"Run the ${name} instance server (version: ${version})" default:"withargs"`
	OAuth2      OAuth2      `cmd:"" name:"oauth" description:"OAuth2 client and access token helper"`
	Actor       Actor       `cmd:"" description:"Actor helper"`
	Block       Block       `cmd:"" description:"Block instances or actors"`
	Debug       Debug       `cmd:"" help:"Toggle debug mode for the running ${name} server."`
	Maintenance Maintenance `cmd:"" help:"Toggle maintenance mode for the running ${name} server."`
	Reload      Reload      `cmd:"" help:"Reload the running ${name} server configuration"`
	Stop        Stop        `cmd:"" help:"Stops the running ${name} server configuration"`
}

type Block struct {
	For string   `description:"Which root actor to block for."`
	URL []string `arg:"" description:"The URL of the instances or actors we want to block."`
}

func (b Block) Run(ctl *Control) error {
	if b.For == "" {
		return errors.Newf("Need to provide the client id")
	}
	cl, err := ctl.Storage.Load(vocab.IRI(b.For))
	if err != nil {
		return err
	}
	act, err := vocab.ToActor(cl)
	if err != nil {
		return errors.Annotatef(err, "unable to load actor from the client IRI")
	}
	ctl.Service = *act

	for _, u := range b.URL {
		toBlock, _ := ctl.Storage.Load(vocab.IRI(u))
		if vocab.IsNil(toBlock) {
			// NOTE(marius): if we don't have a local representation of the blocked item
			// we invent an empty object that we can block.
			// This probably needs more investigation to check if we should at least try to remote load.
			ctl.Logger.Warnf("Unable to load instance to block %s: %s", u, err)
			if toBlock, err = ctl.Storage.Save(vocab.Object{ID: vocab.IRI(u)}); err != nil {
				ctl.Logger.Warnf("Unable to save locally the instance to block %s: %s", u, err)
			}
		}

		blockedIRI := processing.BlockedCollection.IRI(ctl.Service)
		col, _ := ctl.Storage.Load(blockedIRI)
		if !vocab.IsObject(col) {
			col = vocab.OrderedCollection{
				ID:        blockedIRI,
				Type:      vocab.OrderedCollectionType,
				To:        vocab.ItemCollection{ctl.Service.ID},
				Published: time.Now().UTC(),
			}

			if col, err = ctl.Storage.Save(col); err != nil {
				ctl.Logger.Warnf("Unable to save the blocked collection %s: %s", blockedIRI, err)
			}
		}
		if err := ctl.Storage.AddTo(blockedIRI, vocab.IRI(u)); err != nil {
			ctl.Logger.Warnf("Unable to block instance %s: %s", u, err)
		}
	}
	return nil
}

func setupCtl(storagePath string, ll lw.Logger, typ storage.Type) (*Control, error) {
	ctl := new(Control)
	ctl.Logger = ll

	initFns := []storage.InitFn{
		storage.WithPath(storagePath),
		storage.WithType(typ),
		storage.WithLogger(ll),
		storage.WithCache(true),
	}
	if err, exists := oni.MkDirIfNotExists(storagePath); err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to create path")
		return nil, err
	} else if !exists {
		if err := storage.Bootstrap(initFns...); err != nil {
			ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to bootstrap storage")
			os.Exit(1)
		}
	}

	st, err := storage.New(initFns...)
	if err != nil {
		ctl.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to initialize storage")
		return nil, err
	}

	ctl.Storage = st
	return ctl, nil
}
