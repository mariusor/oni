package main

import (
	"fmt"
	"os"
	"runtime/debug"
	"slices"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	"git.sr.ht/~mariusor/storage-all"
	"github.com/alecthomas/kong"
)

var DefaultLogLevel = lw.WarnLevel

func main() {
	if build, ok := debug.ReadBuildInfo(); ok && oni.Version == "HEAD" && build.Main.Version != "(devel)" {
		oni.Version = build.Main.Version
	}

	ctx := kong.Parse(&oni.CLI,
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
	typ, path := oni.ParseStorageDSN(oni.CLI.Path)
	if slices.Contains(oni.ValidStorageTypes, string(typ)) {
		storageType = typ
		oni.CLI.Path = path
	}

	// NOTE(marius): no verbosity means show only warnings and errors
	// verbosity = 1 means show info messages
	// verbosity = 2 debug messages
	// verbosity = 3 tracing messages
	ll := lw.Dev(lw.SetLevel(DefaultLogLevel - lw.Level(oni.CLI.Verbose)))
	ctl, err := oni.SetupCtl(oni.CLI.Path, ll, storageType)
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
