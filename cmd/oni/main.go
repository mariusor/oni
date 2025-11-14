package main

import (
	"context"
	"os"
	"runtime/debug"
	"slices"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	"git.sr.ht/~mariusor/storage-all"
	"github.com/alecthomas/kong"
)

var CLI struct {
	Listen  string `default:"127.0.0.1:60123" short:"l" help:"Listen socket"`
	Path    string `default:"${default_path}" help:"Storage path (or DSN) for the ActivityPub storage. DSN can have the format type:///path/to/storage."`
	URL     string `default:"${default_url}" help:"Default URL for the instance actor"`
	Pw      string `default:"${default_pw}" help:"Default password to use for the instance actor"`
	Verbose bool   `default:"false" help:"Show verbose log output"`
}

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

	_ = kong.Parse(&CLI,
		kong.Name(oni.AppName),
		kong.Description("Run the ${name} server, version ${version}."),
		kong.UsageOnError(),
		kong.Vars{
			"name":         oni.AppName,
			"version":      oni.Version,
			"default_path": xdg.DataPath(oni.AppName),
			"default_url":  oni.DefaultURL,
			"default_pw":   oni.DefaultOAuth2ClientPw,
		},
		kong.ConfigureHelp(kong.HelpOptions{
			Compact: true,
			Summary: true,
		}),
	)

	lvl := lw.DebugLevel
	if CLI.Verbose {
		lvl = lw.TraceLevel
	}

	ll := lw.Dev(lw.SetLevel(lvl))

	storageType := storage.FS
	if typ, path := oni.ParseStorageDSN(CLI.Path); slices.Contains(oni.ValidStorageTypes, string(typ)) {
		storageType = typ
		CLI.Path = path
	}
	ll.WithContext(lw.Ctx{"path": CLI.Path, "typ": storageType}).Debugf("Using storage")

	initFns := []storage.InitFn{storage.WithPath(CLI.Path), storage.WithType(storageType), storage.UseIndex(false), storage.WithLogger(ll)}
	err, exists := oni.MkDirIfNotExists(CLI.Path)
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to create path")
		os.Exit(1)
	} else if !exists {
		if err := storage.Bootstrap(initFns...); err != nil {
			ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to bootstrap storage")
			os.Exit(1)
		}
	}

	st, err := storage.New(initFns...)
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Unable to initialize storage")
		os.Exit(1)
	}
	if closer, ok := st.(interface{ Close() }); ok {
		defer closer.Close()
	}

	err = oni.Oni(
		oni.WithPassword(CLI.Pw),
		oni.WithLogger(ll),
		oni.WithStorage(st),
		oni.ListenOn(CLI.Listen),
	).Run(context.Background())
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to start server")
		os.Exit(1)
	}
}
