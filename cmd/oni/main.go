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

	ll := lw.Dev()
	if oni.CLI.Verbose {
		ll = lw.Dev(lw.SetLevel(lw.DebugLevel))
	}
	ll = ll.WithContext(lw.Ctx{"path": oni.CLI.Path})
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
