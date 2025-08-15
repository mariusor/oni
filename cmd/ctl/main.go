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
	"github.com/alecthomas/kong"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	storage "github.com/go-ap/storage-fs"
)

type Control struct {
	oni.Control
	Service     vocab.Actor
	StoragePath string
}

var CLI struct {
	Path           string         `default:"${default_path}" help:"Path for the ActivityPub storage"`
	Verbose        bool           `default:"false" help:"Show verbose log output"`
	OAuth2         OAuth2         `cmd:"" name:"oauth" description:"OAuth2 client and access token helper"`
	Actor          Actor          `cmd:"" description:"Actor helper"`
	FixCollections FixCollections `cmd:"" description:"Fix a root actor's collections"`
	Block          Block          `cmd:"" description:"Block instances or actors"`
}

type FixCollections struct {
	For []string `arg:"" description:"The root actors we want to run the operation for."`
}

func (f FixCollections) Run(ctl *Control) error {
	if len(f.For) == 0 {
		ctl.Logger.WithContext(lw.Ctx{"iri": oni.DefaultURL}).Warnf("No arguments received adding actor with default URL")
		f.For = append(f.For, oni.DefaultURL)
	}
	for _, u := range f.For {
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
		err = tryCreateCollection(ctl, actor.Outbox.GetLink())
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": actor.ID, "err": err.Error()}).Errorf("Unable to save Outbox collection for main Actor")
			continue
		}
	}
	return nil
}

type Block struct {
	For string   `description:"Which root actor to block for."`
	URL []string `arg:"" description:"The URL of the instances or actors we want to block."`
}

func (b Block) Run(ctl *Control) error {
	if b.For == "" {
		return errors.Newf("Need to provide the client id")
	}
	cl, err := ctl.Storage.Load(vocab.IRI(b.For))
	if err != nil {
		return err
	}
	act, err := vocab.ToActor(cl)
	if err != nil {
		return errors.Annotatef(err, "unable to load actor from the client IRI")
	}
	ctl.Service = *act

	for _, u := range b.URL {
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

type OAuth2 struct {
	Token Token `cmd:"" name:"token" description:"OAuth2 authorization token management"`
}

type Token struct {
	Add Add `cmd:"" description:"Adds an OAuth2 authorization token" alias:"new"`
}

type Add struct {
	For string `required:"" description:"Which ONI root actor to create the authorization token for."`
}

func (a Add) Run(c *Control) error {
	clientID := a.For
	if clientID == "" {
		return errors.Newf("Need to provide the root actor URL")
	}

	actor := clientID
	tok, err := c.GenAccessToken(clientID, actor, nil)
	if err == nil {
		fmt.Printf("Authorization: Bearer %s\n", tok)
	}
	return err
}

type Actor struct {
	Add       AddActor  `cmd:"" description:"Add a new root actor"`
	Move      Move      `cmd:"" description:"Move an existing actor to a new URL"`
	RotateKey RotateKey `cmd:"" description:"Rotate the public/private key pair for an actor"`
}

type AddActor struct {
	URL       string `description:"The URL for the new actor."`
	Pw        string `default:"${default_pw}" description:"The password for the new actor."`
	WithToken bool   `default:"true" description:"Create an OAuth2 token that can be used immediately."`
}

func (a AddActor) Run(ctl *Control) error {
	if len(a.URL) == 0 {
		a.URL = oni.DefaultURL
	}
	urls := []string{a.URL}
	for _, maybeURL := range urls {
		if _, err := url.ParseRequestURI(maybeURL); err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Received invalid URL")
			continue
		}

		if _, err := ctl.CreateActor(vocab.IRI(maybeURL), a.Pw, a.WithToken); err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Unable to create new Actor")
		}
	}
	return nil
}

type Move struct {
	FromURL string `arg:""`
	ToURL   string `arg:""`
}

func (m Move) Run(ctl *Control) error {
	from := vocab.IRI(m.FromURL)
	to := vocab.IRI(m.ToURL)
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

type RotateKey struct {
	URL []string `arg:""`
}

func (r RotateKey) Run(ctl *Control) error {
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

	if len(r.URL) == 0 {
		ctl.Logger.WithContext(lw.Ctx{"iri": oni.DefaultURL}).Warnf("No arguments received adding actor with default URL")
		r.URL = append(r.URL, oni.DefaultURL)
	}
	for _, u := range r.URL {
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

func newOrderedCollection(id vocab.IRI, base vocab.IRI) *vocab.OrderedCollection {
	return &vocab.OrderedCollection{
		ID:        id,
		Type:      vocab.OrderedCollectionType,
		Generator: base,
		Published: time.Now().UTC(),
	}
}

func tryCreateCollection(ctl *Control, colIRI vocab.IRI) error {
	var collection *vocab.OrderedCollection
	items, err := ctl.Storage.Load(colIRI.GetLink())
	if err != nil {
		if !errors.IsNotFound(err) {
			ctl.Logger.Errorf("Unable to load %s: %s", colIRI, err)
			return err
		}
		it, err := ctl.Storage.Create(newOrderedCollection(colIRI.GetLink(), ctl.Service.GetLink()))
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
		if _, err := ctl.Storage.Save(items); err != nil {
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
			if _, err := ctl.Storage.Save(it); err != nil {
				ctl.Logger.Errorf("Unable to save object %s: %s", it.GetLink(), err)
			}
		}
		return nil
	})

	collection.OrderedItems = nil
	_, err = ctl.Storage.Save(collection)
	if err != nil {
		ctl.Logger.Errorf("Unable to save collection with updated totalItems", err)
		return err
	}

	return nil
}

func setupCtl(storagePath string, verbose bool) (*Control, error) {
	fields := lw.Ctx{"path": storagePath}

	ctl := new(Control)
	ll := lw.Dev().WithContext(fields)
	ctl.Logger = ll

	if err := mkDirIfNotExists(storagePath); err != nil {
		ll.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to create path")
		return nil, err
	}

	conf := storage.Config{CacheEnable: true, Path: storagePath, Logger: ctl.Logger}
	st, err := storage.New(conf)
	if err != nil {
		ctl.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed to initialize storage")
		return nil, err
	}

	ctl.Storage = st
	if opener, ok := ctl.Storage.(interface{ Open() error }); ok {
		err = opener.Open()
	}
	return ctl, nil
}

var version = "HEAD"

func main() {
	ctx := kong.Parse(&CLI,
		kong.Name("onictl"),
		kong.Description("CLI helper to manage an ONI instances"),
		kong.UsageOnError(),
		kong.Vars{
			"default_path": dataPath(),
			"default_pw":   oni.DefaultOAuth2ClientPw,
		},
		kong.ConfigureHelp(kong.HelpOptions{Compact: true, Summary: true}),
	)

	ctl, err := setupCtl(CLI.Path, CLI.Verbose)
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "Error: %+s", err)
		os.Exit(1)
	}

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

	if err = ctx.Run(ctl); err != nil {
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
