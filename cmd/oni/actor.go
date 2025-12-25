package main

import (
	"bytes"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"net/url"
	"strings"
	"time"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/oni"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
	"golang.org/x/term"
)

type Actor struct {
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
		a.URL = oni.DefaultURL
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
