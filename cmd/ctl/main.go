package main

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/url"
	"oni"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	storage "github.com/go-ap/storage-fs"
	"github.com/urfave/cli/v2"
)

type Control struct {
	oni.Control
	Service     vocab.Actor
	StoragePath string
}

var tokenCmd = &cli.Command{
	Name:        "token",
	Usage:       "OAuth2 authorization token management",
	Subcommands: []*cli.Command{tokenAddCmd},
}

var tokenAddCmd = &cli.Command{
	Name:    "add",
	Aliases: []string{"new"},
	Usage:   "Adds an OAuth2 token",
	Flags: []cli.Flag{&cli.StringFlag{
		Name:     "client",
		Required: true,
	}},
	Action: tokenAct(&ctl),
}

var OAuth2Cmd = &cli.Command{
	Name:        "oauth",
	Usage:       "OAuth2 client and access token helper",
	Subcommands: []*cli.Command{tokenCmd},
}

var fixCollectionsCmd = &cli.Command{
	Name:   "fix-collections",
	Usage:  "",
	Action: fixCollectionsAct(&ctl),
}

var rotateKeyCmd = &cli.Command{
	Name:   "rotate-key",
	Usage:  "Rotate the actors' private and public key pair",
	Action: rotateKey(&ctl),
}

var blockInstanceCmd = &cli.Command{
	Name:  "block",
	Usage: "Block instances",
	Flags: []cli.Flag{&cli.StringFlag{
		Name:     "client",
		Required: true,
	}},
	Action: blockInstance(&ctl),
}

var ActorCmd = &cli.Command{
	Name:        "actor",
	Usage:       "Actor helper",
	Subcommands: []*cli.Command{actorAddCmd, actorMoveCmd, rotateKeyCmd},
}

var actorAddCmd = &cli.Command{
	Name:  "add",
	Usage: "Add a new root actor",
	Flags: []cli.Flag{
		&cli.BoolFlag{
			Name:  "with-token",
			Value: true,
		},
		&cli.StringSliceFlag{Name: "pw"},
	},
	Action: addActorAct(&ctl),
}

func addActorAct(ctl *Control) cli.ActionFunc {
	return func(context *cli.Context) error {
		urls := context.Args().Slice()
		pws := context.StringSlice("pw")

		if context.NArg() == 0 {
			ctl.Logger.WithContext(lw.Ctx{"iri": oni.DefaultURL}).Warnf("No arguments received adding actor with default URL")
			urls = append(urls, oni.DefaultURL)
		}
		for i, maybeURL := range urls {
			if _, err := url.ParseRequestURI(maybeURL); err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Received invalid URL")
				continue
			}

			pw := ""
			if i < len(pws)-1 {
				pw = pws[i]
			}

			if _, err := ctl.CreateActor(vocab.IRI(maybeURL), pw, context.Bool("with-token")); err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Unable to create new Actor")
			}
		}
		return nil
	}
}

var actorMoveCmd = &cli.Command{
	Name:   "move",
	Usage:  "Move a root actor to a new IRI",
	Args:   true,
	Action: moveActorAct(&ctl),
}

func moveActorAct(ctl *Control) cli.ActionFunc {
	return func(context *cli.Context) error {
		if context.NArg() < 2 {
			return errors.Newf("expected two arguments: <from-IRI> <to-IRI>")
		}
		from := vocab.IRI(context.Args().Get(0))
		to := vocab.IRI(context.Args().Get(1))
		if from == vocab.EmptyIRI {
			return errors.Newf("expected argument is missing: <from-IRI>")
		}
		it, err := ctl.Storage.Load(from)
		if err != nil {
			return errors.Newf("unable to load root actor with IRI: %s", from)
		}
		fromActor, err := vocab.ToActor(it)
		if err != nil {
			return errors.Annotatef(err, "invalid root actor at IRI: %s", from)
		}
		if to == vocab.EmptyIRI {
			return errors.Newf("expected argument is missing: <to-IRI>")
		}
		toActor := new(vocab.Actor)
		toActor.ID = fromActor.ID
		_, err = vocab.CopyItemProperties(toActor, fromActor)
		if err != nil {
			return errors.Annotatef(err, "unable to clone from actor")
		}
		toActor.ID = to
		if fromActor.Inbox != nil {
			toActor.Inbox = vocab.Inbox.IRI(to)
		}
		if fromActor.Outbox != nil {
			toActor.Outbox = vocab.Outbox.IRI(to)
		}
		if fromActor.Followers != nil {
			toActor.Followers = vocab.Followers.IRI(to)
		}
		if fromActor.Following != nil {
			toActor.Following = vocab.Following.IRI(to)
		}
		if fromActor.Liked != nil {
			toActor.Liked = vocab.Liked.IRI(to)
		}
		if fromActor.Likes != nil {
			toActor.Likes = vocab.Likes.IRI(to)
		}
		if fromActor.Shares != nil {
			toActor.Shares = vocab.Shares.IRI(to)
		}
		if fromActor.PublicKey.ID != "" {
			toActor.PublicKey.ID = vocab.IRI(strings.Replace(
				string(toActor.PublicKey.ID),
				string(from),
				string(to),
				1,
			))
		}
		if toActor.PublicKey.Owner != "" {
			toActor.PublicKey.Owner = vocab.IRI(strings.Replace(
				string(toActor.PublicKey.Owner),
				string(from),
				string(to),
				1,
			))
		}

		pp := processing.New(
			processing.WithStorage(ctl.Storage),
			processing.WithLogger(ctl.Logger),
		)
		move := new(vocab.Activity)
		move.Type = vocab.MoveType
		move.Actor = fromActor
		move.Origin = fromActor
		move.Object = fromActor
		move.Target = toActor
		_, err = pp.ProcessClientActivity(move, *fromActor, vocab.Outbox.Of(fromActor).GetLink())
		if err != nil {
			return errors.Annotatef(err, "unable to move actor from %s to %s", from, to)
		}
		return nil
	}
}

func dataPath() string {
	dh := os.Getenv("XDG_DATA_HOME")
	if dh == "" {
		if userPath := os.Getenv("HOME"); userPath == "" {
			dh = "/usr/share"
		} else {
			dh = filepath.Join(userPath, ".local/share")
		}
	}
	return filepath.Join(dh, "oni")
}

func newOrderedCollection(id vocab.IRI) *vocab.OrderedCollection {
	return &vocab.OrderedCollection{
		ID:        id,
		Type:      vocab.OrderedCollectionType,
		Generator: ctl.Service.GetLink(),
		Published: time.Now().UTC(),
	}
}

func tryCreateCollection(storage oni.FullStorage, colIRI vocab.IRI) error {
	var collection *vocab.OrderedCollection
	items, err := ctl.Storage.Load(colIRI.GetLink())
	if err != nil {
		if !errors.IsNotFound(err) {
			ctl.Logger.Errorf("Unable to load %s: %s", colIRI, err)
			return err
		}
		colSaver, ok := storage.(processing.CollectionStore)
		if !ok {
			return errors.Newf("Invalid storage type %T. Unable to handle collection operations.", storage)
		}
		it, err := colSaver.Create(newOrderedCollection(colIRI.GetLink()))
		if err != nil {
			ctl.Logger.Errorf("Unable to create collection %s: %s", colIRI, err)
			return err
		}
		collection, err = vocab.ToOrderedCollection(it)
		if err != nil {
			ctl.Logger.Errorf("Saved object is not a valid OrderedCollection, but %s: %s", it.GetType(), err)
			return err
		}
	}

	if vocab.IsNil(items) {
		return nil
	}

	if !items.IsCollection() {
		if _, err := storage.Save(items); err != nil {
			ctl.Logger.Errorf("Unable to save object %s: %s", items.GetLink(), err)
			return err
		}
	}
	collection, err = vocab.ToOrderedCollection(items)
	if err != nil {
		ctl.Logger.Errorf("Saved object is not a valid OrderedCollection, but %s: %s", items.GetType(), err)
		return err
	}
	_ = vocab.OnCollectionIntf(items, func(col vocab.CollectionInterface) error {
		collection.TotalItems = col.Count()
		for _, it := range col.Collection() {
			// Try saving objects in collection, which would create the collections if they exist
			if _, err := storage.Save(it); err != nil {
				ctl.Logger.Errorf("Unable to save object %s: %s", it.GetLink(), err)
			}
		}
		return nil
	})

	collection.OrderedItems = nil
	_, err = storage.Save(collection)
	if err != nil {
		ctl.Logger.Errorf("Unable to save collection with updated totalItems", err)
		return err
	}

	return nil
}

func rotateKey(ctl *Control) cli.ActionFunc {
	printKey := func(u string) {
		pk, _ := ctl.Storage.LoadKey(vocab.IRI(u))
		if pk != nil {
			pkEnc, _ := x509.MarshalPKCS8PrivateKey(pk)
			if pkEnc != nil {
				pkPem := pem.EncodeToMemory(&pem.Block{
					Type:  "PRIVATE KEY",
					Bytes: pkEnc,
				})
				fmt.Printf("Private Key: %s\n", pkPem)
			}
		}
	}
	return func(context *cli.Context) error {
		urls := context.Args().Slice()

		if context.NArg() == 0 {
			ctl.Logger.WithContext(lw.Ctx{"iri": oni.DefaultURL}).Warnf("No arguments received adding actor with default URL")
			urls = append(urls, oni.DefaultURL)
		}
		for _, u := range urls {
			it, err := ctl.Storage.Load(vocab.IRI(u))
			if err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Invalid actor URL")
				continue
			}
			actor, err := vocab.ToActor(it)
			if err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Invalid actor found for URL")
				continue
			}

			if actor, err = ctl.UpdateActorKey(actor); err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Unable to update main Actor key")
				continue
			}
			printKey(u)
		}
		return nil
	}
}

func fixCollectionsAct(ctl *Control) cli.ActionFunc {
	return func(context *cli.Context) error {
		urls := context.Args().Slice()

		if context.NArg() == 0 {
			ctl.Logger.WithContext(lw.Ctx{"iri": oni.DefaultURL}).Warnf("No arguments received adding actor with default URL")
			urls = append(urls, oni.DefaultURL)
		}
		for _, u := range urls {
			it, err := ctl.Storage.Load(vocab.IRI(u))
			if err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Invalid actor URL")
				continue
			}
			actor, err := vocab.ToActor(it)
			if err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Invalid actor found for URL")
				continue
			}
			_, err = ctl.Storage.Save(actor)
			if err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": u, "err": err.Error()}).Errorf("Unable to save main Actor")
				continue
			}
			err = tryCreateCollection(ctl.Storage, actor.Outbox.GetLink())
			if err != nil {
				ctl.Logger.WithContext(lw.Ctx{"iri": actor.ID, "err": err.Error()}).Errorf("Unable to save Outbox collection for main Actor")
				continue
			}
		}
		return nil
	}
}

func blockInstance(ctl *Control) cli.ActionFunc {
	return func(ctx *cli.Context) error {
		actorID := ctx.String("client")
		if actorID == "" {
			return errors.Newf("Need to provide the client id")
		}
		cl, err := ctl.Storage.Load(vocab.IRI(actorID))
		if err != nil {
			return err
		}
		act, err := vocab.ToActor(cl)
		if err != nil {
			return errors.Annotatef(err, "unable to load actor from the client IRI")
		}
		ctl.Service = *act

		urls := ctx.Args()
		for _, u := range urls.Slice() {
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
}

func tokenAct(ctl *Control) cli.ActionFunc {
	return func(c *cli.Context) error {
		clientID := c.String("client")
		if clientID == "" {
			return errors.Newf("Need to provide the client id")
		}

		actor := clientID
		tok, err := ctl.GenAccessToken(clientID, actor, nil)
		if err == nil {
			fmt.Printf("Authorization: Bearer %s\n", tok)
		}
		return err
	}
}

var ctl Control

func Before(c *cli.Context) error {
	storagePath := c.Path("path")
	fields := lw.Ctx{"path": storagePath}

	ll := lw.Dev().WithContext(fields)
	ctl.Logger = ll

	if err := mkDirIfNotExists(storagePath); err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to create path")
		return err
	}

	conf := storage.Config{CacheEnable: true, Path: storagePath, Logger: ctl.Logger}
	st, err := storage.New(conf)
	if err != nil {
		ctl.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to initialize storage")
		return err
	}

	ctl.Storage = st
	if opener, ok := ctl.Storage.(interface{ Open() error }); ok {
		return opener.Open()
	}
	return nil
}

func After(c *cli.Context) error {
	defer ctl.Storage.Close()
	return nil
}

var version = "HEAD"

func main() {
	app := cli.App{}
	app.Name = "onictl"
	app.Usage = "helper utility to manage an ONI instance"

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
	app.Version = version

	app.Before = Before
	app.After = After
	app.Flags = []cli.Flag{
		&cli.PathFlag{
			Name:  "path",
			Value: dataPath(),
		},
	}
	app.Commands = []*cli.Command{ActorCmd, OAuth2Cmd, fixCollectionsCmd, blockInstanceCmd}

	if err := app.Run(os.Args); err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "Error: %+s", err)
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
