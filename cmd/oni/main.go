package main

import (
	"context"
	"flag"
	"fmt"
	"oni"
	"os"
	"path/filepath"
	"runtime/debug"

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

var listen string
var path string

func main() {
	flag.StringVar(&listen, "listen", "127.0.0.1:60123", "Listen socket")
	flag.StringVar(&path, "path", dataPath, "Path for ActivityPub storage")
	flag.Parse()

	urls := make(vocab.ItemCollection, 0)
	if flag.NArg() == 0 {
		urls = append(urls, vocab.IRI("https://oni.local"))
	} else {
		for _, arg := range flag.Args() {
			urls = append(urls, vocab.IRI(arg))
		}
	}

	if build, ok := debug.ReadBuildInfo(); ok && build.Main.Version != "" {
		oni.Version = build.Main.Version
	}
	log := lw.Dev()

	err := mkDirIfNotExists(path)
	if err != nil {
		log.Errorf("%s", err.Error())
		os.Exit(1)
	}

	err = oni.Oni(
		oni.WithLogger(log),
		oni.LoadActor(urls...),
		oni.WithStoragePath(path),
		oni.ListenOn(listen),
	).Run(context.Background())

	if err != nil {
		log.Errorf("%s", err.Error())
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
