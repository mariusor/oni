package main

import (
	"context"
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

func main() {
	if build, ok := debug.ReadBuildInfo(); ok && build.Main.Version != "" {
		oni.Version = build.Main.Version
	}

	// TODO(marius): add command line arguments for:
	//   * the IRI of the main actor
	//   * for the listen string
	//   * for the path to load from(?). Should we use XDG_DATA
	iri := vocab.IRI("https://oni.local")

	log := lw.Dev()

	err := oni.Oni(
		oni.WithLogger(log),
		oni.LoadActor(iri),
		oni.WithStoragePath(dataPath),
		oni.ListenOn("127.0.5.1:60123"),
	).Run(context.Background())

	if err != nil {
		log.Errorf("%s", err.Error())
		os.Exit(1)
	}
}
