package main

import (
	"context"
	"oni"
	"os"
	"runtime/debug"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
)

var version = "(devel)"

func main() {
	if build, ok := debug.ReadBuildInfo(); ok {
		version = build.Main.Version
	}

	log := lw.Dev()
	iri := vocab.IRI("https://oni.local")
	log = log.WithContext(lw.Ctx{"iri": iri})

	actor := vocab.Actor{
		ID:                iri,
		Type:              vocab.PersonType,
		PreferredUsername: oni.DefaultValue("marius"),
		Inbox:             vocab.Inbox.Of(iri),
		Outbox:            vocab.Outbox.Of(iri),
	}

	err := oni.Oni(
		oni.WithLogger(log),
		oni.Actor(actor),
		oni.ListenOn("127.0.5.1:60123"),
	).Run(context.Background())

	if err != nil {
		log.Errorf("%s", err.Error())
		os.Exit(1)
	}
}
