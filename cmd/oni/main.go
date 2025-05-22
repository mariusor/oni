package main

import (
	"context"
	"flag"
	"fmt"
	"io/fs"
	"oni"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
)

var dataPath = func() string {
	dh := os.Getenv("XDG_DATA_HOME")
	if dh == "" {
		if userPath := os.Getenv("HOME"); userPath == "" {
			dh = "/usr/share"
		} else {
			dh = filepath.Join(userPath, ".local/share")
		}
	}
	return filepath.Join(dh, "oni")
}()

func loadAccountsFromStorage(base string) (vocab.ItemCollection, error) {
	urls := make(vocab.ItemCollection, 0)
	err := filepath.WalkDir(base, func(file string, d fs.DirEntry, err error) error {
		if maybeActor, ok := maybeLoadServiceActor(path, file); ok {
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

var (
	version = "HEAD"

	listen  string
	path    string
	verbose bool
)

func main() {
	flag.StringVar(&listen, "listen", "127.0.0.1:60123", "Listen socket")
	flag.StringVar(&path, "path", dataPath, "Path for ActivityPub storage")
	flag.BoolVar(&verbose, "verbose", false, "Show verbose ll output")
	flag.Parse()

	if build, ok := debug.ReadBuildInfo(); ok && version == "HEAD" {
		if build.Main.Version != "(devel)" {
			version = build.Main.Version
		}
		for _, bs := range build.Settings {
			if bs.Key == "vcs.revision" {
				version = bs.Value[:8]
			}
			if bs.Key == "vcs.modified" {
				version += "-git"
			}
		}
	}

	oni.Version = version
	oni.ListenSocket = listen
	lvl := lw.DebugLevel
	if verbose {
		lvl = lw.TraceLevel
	}

	ll := lw.Dev(lw.SetLevel(lvl))

	err := mkDirIfNotExists(path)
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to create path")
		os.Exit(1)
	}

	urls, err := loadAccountsFromStorage(path)
	if err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to load accounts from storage")
		os.Exit(1)
	}

	err = oni.Oni(
		oni.WithLogger(ll),
		oni.WithStoragePath(path),
		oni.LoadActor(urls...),
		oni.ListenOn(listen),
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
