package main

import (
	"context"
	"fmt"
	"io/fs"
	"oni"
	"oni/internal/xdg"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"

	"git.sr.ht/~mariusor/lw"
	"github.com/alecthomas/kong"
	vocab "github.com/go-ap/activitypub"
)

func loadAccountsFromStorage(base string) (vocab.ItemCollection, error) {
	urls := make(vocab.ItemCollection, 0)
	err := filepath.WalkDir(base, func(file string, d fs.DirEntry, err error) error {
		if maybeActor, ok := maybeLoadServiceActor(CLI.Path, file); ok {
			urls = append(urls, maybeActor)
		}
		return nil
	})
	return urls, err
}

func maybeLoadServiceActor(base, path string) (*vocab.Actor, bool) {
	if base[len(base)-1] != '/' {
		base = base + "/"
	}
	pieces := strings.Split(strings.Replace(path, base, "", 1), string(filepath.Separator))
	if len(pieces) == 2 && pieces[1] == "__raw" {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, false
		}
		it, err := vocab.UnmarshalJSON(raw)
		if err != nil || vocab.IsNil(it) {
			return nil, false
		}
		act, err := vocab.ToActor(it)
		if err != nil {
			return nil, false
		}
		return act, true
	}
	return nil, false
}

var CLI struct {
	Listen  string `default:"127.0.0.1:60123" short:"l" help:"Listen socket"`
	Path    string `default:"${default_path}" help:"Path for ActivityPub storage"`
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

	err := mkDirIfNotExists(CLI.Path)
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to create path")
		os.Exit(1)
	}

	urls, err := loadAccountsFromStorage(CLI.Path)
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to load accounts from storage")
		os.Exit(1)
	}

	err = oni.Oni(
		oni.WithPassword(CLI.Pw),
		oni.WithLogger(ll),
		oni.WithStoragePath(CLI.Path),
		oni.LoadActor(urls...),
		oni.ListenOn(CLI.Listen),
	).Run(context.Background())
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to start server")
		os.Exit(1)
	}
}

func mkDirIfNotExists(p string) (err error) {
	p, err = filepath.Abs(p)
	if err != nil {
		return err
	}
	fi, err := os.Stat(p)
	if err != nil && os.IsNotExist(err) {
		if err = os.MkdirAll(p, os.ModeDir|os.ModePerm|0700); err != nil {
			return err
		}
		fi, err = os.Stat(p)
	}
	if err != nil {
		return err
	}
	if !fi.IsDir() {
		return fmt.Errorf("path exists, and is not a folder %s", p)
	}
	return nil
}
