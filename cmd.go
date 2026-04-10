package oni

import (
	"bytes"
	"context"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/url"
	"strings"
	"syscall"
	"time"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni/internal/xdg"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
	"golang.org/x/term"
)

type SSH struct {
	OAuth2      OAuth2      `cmd:"" name:"oauth" description:"OAuth2 client and access token helper"`
	Actor       ActorCmd    `cmd:"" description:"Actor helper"`
	Block       Block       `cmd:"" description:"Block instances or actors"`
	Debug       Debug       `cmd:"" help:"Toggle debug mode for the running ${name} server."`
	Maintenance Maintenance `cmd:"" help:"Toggle maintenance mode for the running ${name} server."`
	Reload      Reload      `cmd:"" help:"Reload the running ${name} server configuration"`
	Stop        Stop        `cmd:"" help:"Stops the running ${name} server configuration"`
}

var CLI struct {
	SSH
	Path    string `default:"${default_path}" help:"Storage path (or DSN) for the ActivityPub storage. DSN can have the format type:///path/to/storage."`
	Verbose bool   `default:"false" help:"Show verbose log output"`

	Run Run `cmd:"" help:"Run the ${name} instance server (version: ${version})" default:"withargs"`
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
	service := *act

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

		blockedIRI := processing.BlockedCollection.IRI(service)
		col, _ := ctl.Storage.Load(blockedIRI)
		if !vocab.IsObject(col) {
			col = vocab.OrderedCollection{
				ID:        blockedIRI,
				Type:      vocab.OrderedCollectionType,
				To:        vocab.ItemCollection{service.ID},
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

type Run struct {
	Listen string `default:"127.0.0.1:60123" short:"l" help:"Listen socket"`
	URL    string `default:"${default_url}" help:"Default URL for the instance actor"`
	Pw     string `default:"${default_pw}" help:"Default password to use for the instance actor"`
}

func (s Run) Run(ctl *Control) error {
	return Oni(
		WithPassword(s.Pw),
		WithLogger(ctl.Logger),
		WithStorage(ctl.Storage, ctl.StoragePath),
		ListenOn(s.Listen),
	).Run(context.Background())
}

func (c *Control) Close() {
	if _, ok := c.Storage.(interface{ Open() error }); ok {
		_ = c.SendSignal(syscall.SIGUSR1)
	}
	c.Storage.Close()
}

func (c *Control) Open() error {
	if opener, ok := c.Storage.(interface{ Open() error }); ok {
		_ = c.SendSignal(syscall.SIGUSR1)
		return opener.Open()
	}
	return nil
}

type Maintenance struct{}

func (m Maintenance) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGUSR1)
}

type Debug struct{}

func (d Debug) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGUSR2)
}

type Reload struct{}

func (m Reload) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGHUP)
}

type Stop struct{}

func (m Stop) Run(ctl *Control) error {
	return ctl.SendSignal(syscall.SIGTERM)
}

func (c *Control) SendSignal(sig syscall.Signal) error {
	pid, err := xdg.ReadPid(AppName)
	if err != nil {
		return errors.Annotatef(err, "unable to read pid file")
	}
	return syscall.Kill(pid, sig)
}

type FixCollections struct {
	For []string `arg:"" description:"The root actors we want to run the operation for."`
}

func (f FixCollections) Run(ctl *Control) error {
	if len(f.For) == 0 {
		ctl.Logger.WithContext(lw.Ctx{"iri": DefaultURL}).Warnf("No arguments received adding actor with default URL")
		f.For = append(f.For, DefaultURL)
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
		err = tryCreateCollection(ctl, actor.Outbox.GetLink(), actor)
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": actor.ID, "err": err.Error()}).Errorf("Unable to save Outbox collection for main Actor")
			continue
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

type ActorCmd struct {
	Add            AddActor       `cmd:"" description:"Add a new root actor"`
	Move           Move           `cmd:"" description:"Move an existing actor to a new URL"`
	FixCollections FixCollections `cmd:"" description:"Fix a root actor's collections"`
	RotateKey      RotateKey      `cmd:"" description:"Rotate the public/private key pair for an actor"`
	ChangePassword ChangePassword `cmd:"" description:"Change the password for the actor"`
}

type AddActor struct {
	URL       string `description:"The URL for the new actor."`
	Pw        string `default:"${default_pw}" description:"The password for the new actor."`
	WithToken bool   `negatable:"without-token" description:"Create an OAuth2 token that can be used immediately."`
}

func (a AddActor) Run(ctl *Control) error {
	if len(a.URL) == 0 {
		a.URL = DefaultURL
	}
	urls := []string{a.URL}
	for _, maybeURL := range urls {
		if _, err := url.ParseRequestURI(maybeURL); err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Received invalid URL")
			continue
		}

		actor, err := ctl.CreateActor(vocab.IRI(maybeURL), a.Pw)
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Unable to create new Actor")
		}
		if actor == nil {
			// NOTE(marius): this is not going to happen
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL}).Errorf("Unable to create new Actor, nil returned")
			continue
		}
		u, err := actor.ID.URL()
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("New Actor has an invalid ID")
			continue
		}
		if !a.WithToken {
			continue
		}
		tok, err := ctl.GenAccessToken(u.Hostname(), string(actor.ID), nil)
		if err != nil {
			ctl.Logger.WithContext(lw.Ctx{"iri": maybeURL, "err": err.Error()}).Errorf("Unable to generate OAuth2 token")
			continue
		}
		fmt.Printf("    Authorization: Bearer %s\n", tok)
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

type ChangePassword struct {
	IRI vocab.IRI `arg:"" optional:"" name:"for" help:"The actor IRI to change the password for."`
}

func loadPwFromStdin(confirm bool, prompt string) ([]byte, error) {
	fmt.Printf("%s pw: ", prompt)
	pw1, _ := term.ReadPassword(0)
	fmt.Println()
	if confirm {
		fmt.Printf("pw again: ")
		pw2, _ := term.ReadPassword(0)
		fmt.Println()
		if !bytes.Equal(pw1, pw2) {
			return nil, errors.Errorf("Passwords do not match")
		}
	}
	return pw1, nil
}

func (c ChangePassword) Run(ctl *Control) error {
	actors, err := ctl.Storage.Load(c.IRI)
	if err != nil {
		return err
	}
	actor, err := vocab.ToActor(actors)
	if err != nil {
		return err
	}
	pw, err := loadPwFromStdin(true, fmt.Sprintf("%s's", vocab.PreferredNameOf(actor)))
	if err != nil {
		return err
	}
	if pw == nil {
		return errors.Errorf("empty password")
	}

	if client, err := ctl.Storage.GetClient(string(c.IRI)); err == nil {
		toUpdate := osin.DefaultClient{
			Id:          client.GetId(),
			Secret:      string(pw),
			RedirectUri: client.GetRedirectUri(),
			UserData:    client.GetUserData(),
		}
		if err := ctl.Storage.UpdateClient(&toUpdate); err != nil {
			return err
		}
	}

	return ctl.Storage.PasswordSet(c.IRI, pw)
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
		ctl.Logger.WithContext(lw.Ctx{"iri": DefaultURL}).Warnf("No arguments received adding actor with default URL")
		r.URL = append(r.URL, DefaultURL)
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

func newOrderedCollection(id vocab.IRI, base vocab.IRI) *vocab.OrderedCollection {
	return &vocab.OrderedCollection{
		ID:        id,
		Type:      vocab.OrderedCollectionType,
		Generator: base,
		Published: time.Now().UTC(),
	}
}

func tryCreateCollection(ctl *Control, colIRI vocab.IRI, author vocab.Item) error {
	var collection *vocab.OrderedCollection
	items, err := ctl.Storage.Load(colIRI.GetLink())
	if err != nil {
		if !errors.IsNotFound(err) {
			ctl.Logger.Errorf("Unable to load %s: %s", colIRI, err)
			return err
		}
		it, err := ctl.Storage.Save(newOrderedCollection(colIRI.GetLink(), author.GetLink()))
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
