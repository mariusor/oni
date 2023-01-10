package main

import (
	"context"
	"flag"
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

	url := "https://oni.local"
	if flag.NArg() > 0 {
		url = flag.Arg(0)
	}

	if build, ok := debug.ReadBuildInfo(); ok && build.Main.Version != "" {
		oni.Version = build.Main.Version
	}

	// TODO(marius): add command line arguments for:
	//   * for the path to load from(?). Should we use XDG_DATA

	log := lw.Dev()

	err := oni.Oni(
		oni.WithLogger(log),
		oni.LoadActor(vocab.IRI(url)),
		oni.WithStoragePath(path),
		oni.ListenOn(listen),
	).Run(context.Background())

	if err != nil {
		log.Errorf("%s", err.Error())
		os.Exit(1)
	}
}
