package main

import (
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/url"
	"oni"
	"os"
	"path"
	"path/filepath"
	"runtime/debug"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/filters"
	"github.com/go-ap/processing"
	storage "github.com/go-ap/storage-fs"
	"github.com/openshift/osin"
	"github.com/urfave/cli/v2"
)

type Control struct {
	Service     vocab.Actor
	Storage     oni.FullStorage
	StoragePath string
	Logger      lw.Logger
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
	Subcommands: []*cli.Command{actorAddCmd, rotateKeyCmd},
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
		urls := context.Args()
		pws := context.StringSlice("pw")

		for i, maybeURL := range urls.Slice() {
			u, err := url.ParseRequestURI(maybeURL)
			if err != nil {
				ctl.Logger.Errorf("Received invalid URL %s: %s", maybeURL, err)
				continue
			}

			iri := vocab.IRI(maybeURL)
			pw := oni.DefaultOAuth2ClientPw
			if i < len(pws)-1 {
				pw = pws[i]
			}

			it, err := ctl.Storage.Load(iri)
			if err == nil || (!vocab.IsNil(it) && it.GetLink().Equals(iri, true)) {
				if err != nil && !errors.IsNotFound(err) {
					ctl.Logger.Warnf("Actor already exists at URL %s: %s", iri, err)
				} else {
					ctl.Logger.Warnf("Actor already exists at URL %s", iri)
				}
				continue
			}

			o := oni.DefaultActor(iri)
			o.Outbox = vocab.Outbox.Of(iri)
			o.Followers = vocab.Followers.Of(iri)
			o.Following = vocab.Following.Of(iri)

			if it, err = ctl.Storage.Save(o); err != nil {
				ctl.Logger.Errorf("Unable to save main actor %s: %s", maybeURL, err)
				continue
			} else {
				ctl.Logger.Infof("Created root actor: %s", it.GetID())
			}

			actor, err := vocab.ToActor(it)
			if err != nil {
				ctl.Logger.Errorf("Invalid actor type saved for %s: %s", maybeURL, err)
				continue
			}

			if err = oni.CreateOauth2ClientIfMissing(ctl.Storage, actor.ID, pw); err != nil {
				ctl.Logger.Errorf("Unable to save OAuth2 Client %s: %s", u.Hostname(), err)
				continue
			} else {
				ctl.Logger.Infof("Created OAuth2 Client: %s", actor.ID)
			}

			if context.Bool("with-token") {
				clientID := u.Hostname()
				tok, err := ctl.GenAccessToken(clientID, actor.ID.String(), nil)
				if err == nil {
					ctl.Logger.Infof("\tAuthorization: Bearer %s\n", tok)
				}
			}
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
		urls := context.Args()

		for _, u := range urls.Slice() {
			it, err := ctl.Storage.Load(vocab.IRI(u))
			if err != nil {
				ctl.Logger.Errorf("Invalid actor url %s: %s", u, err)
				continue
			}
			actor, err := vocab.ToActor(it)
			if err != nil {
				ctl.Logger.Errorf("Invalid actor found for url %s: %s", u, err)
				continue
			}
			printKey(u)

			if actor, err = oni.GenPrivateKey(ctl.Storage, actor); err != nil {
				ctl.Logger.Errorf("Invalid actor found for url %s: %s", u, err)
				continue
			}
			printKey(u)
		}
		return nil
	}
}

func fixCollectionsAct(ctl *Control) cli.ActionFunc {
	return func(context *cli.Context) error {
		urls := context.Args()

		for _, u := range urls.Slice() {
			it, err := ctl.Storage.Load(vocab.IRI(u))
			if err != nil {
				ctl.Logger.Errorf("Invalid actor url %s: %s", u, err)
				continue
			}
			actor, err := vocab.ToActor(it)
			if err != nil {
				ctl.Logger.Errorf("Invalid actor found for url %s: %s", u, err)
				continue
			}
			_, err = ctl.Storage.Save(actor)
			if err != nil {
				ctl.Logger.Errorf("Unable to save main actor %s: %s", actor.ID, err)
				continue
			}
			err = tryCreateCollection(ctl.Storage, actor.Outbox.GetLink())
			if err != nil {
				ctl.Logger.Errorf("Unable to save Outbox collection for main actor %s: %s", actor.ID, err)
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

func (c *Control) GenAccessToken(clientID, actorIdentifier string, dat interface{}) (string, error) {
	if u, err := url.Parse(clientID); err == nil {
		clientID = path.Base(u.Path)
		if clientID == "." {
			clientID = u.Host
		}
	}
	cl, err := c.Storage.GetClient(clientID)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	var f processing.Filterable
	if u, err := url.Parse(actorIdentifier); err == nil {
		u.Scheme = "https"
		f = vocab.IRI(u.String())
	} else {
		f = filters.FiltersNew(filters.Name(actorIdentifier), filters.Type(vocab.ActorTypes...))
	}
	list, err := c.Storage.Load(f.GetLink())
	if err != nil {
		return "", err
	}
	if vocab.IsNil(list) {
		return "", errors.NotFoundf("not found")
	}
	var actor vocab.Item
	if list.IsCollection() {
		err = vocab.OnCollectionIntf(list, func(c vocab.CollectionInterface) error {
			f := c.Collection().First()
			if f == nil {
				return errors.NotFoundf("no actor found %s", c.GetLink())
			}
			actor, err = vocab.ToActor(f)
			return err
		})
	} else {
		actor, err = vocab.ToActor(list)
	}
	if err != nil {
		return "", err
	}

	aud := &osin.AuthorizeData{
		Client:      cl,
		CreatedAt:   now,
		ExpiresIn:   86400,
		RedirectUri: cl.GetRedirectUri(),
		State:       "state",
	}

	// generate token code
	aud.Code, err = (&osin.AuthorizeTokenGenDefault{}).GenerateAuthorizeToken(aud)
	if err != nil {
		return "", err
	}

	// generate token directly
	ar := &osin.AccessRequest{
		Type:          osin.AUTHORIZATION_CODE,
		AuthorizeData: aud,
		Client:        cl,
		RedirectUri:   cl.GetRedirectUri(),
		Scope:         "scope",
		Authorized:    true,
		Expiration:    -1,
	}

	ad := &osin.AccessData{
		Client:        ar.Client,
		AuthorizeData: ar.AuthorizeData,
		AccessData:    ar.AccessData,
		ExpiresIn:     ar.Expiration,
		Scope:         ar.Scope,
		RedirectUri:   cl.GetRedirectUri(),
		CreatedAt:     now,
		UserData:      actor.GetLink(),
	}

	// generate access token
	ad.AccessToken, ad.RefreshToken, err = (&osin.AccessTokenGenDefault{}).GenerateAccessToken(ad, ar.GenerateRefresh)
	if err != nil {
		return "", err
	}
	// save authorize data
	if err = c.Storage.SaveAuthorize(aud); err != nil {
		return "", err
	}
	// save access token
	if err = c.Storage.SaveAccess(ad); err != nil {
		return "", err
	}

	return ad.AccessToken, nil
}

var ctl Control

func Before(c *cli.Context) error {
	fields := lw.Ctx{}
	ctl = Control{Logger: lw.Dev().WithContext(fields)}

	storagePath := c.Path("path")
	conf := storage.Config{CacheEnable: true, Path: storagePath, Logger: ctl.Logger}
	st, err := storage.New(conf)
	if err != nil {
		ctl.Logger.Errorf("%s", err.Error())
		return err
	}
	ctl.Storage = st

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
	app.Flags = []cli.Flag{
		&cli.PathFlag{
			Name:  "path",
			Value: dataPath(),
		},
	}
	app.Commands = []*cli.Command{ActorCmd, OAuth2Cmd, fixCollectionsCmd, blockInstanceCmd}

	if err := app.Run(os.Args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
