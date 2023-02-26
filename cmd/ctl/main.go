package main

import (
	"fmt"
	"net/url"
	"oni"
	"os"
	"path"
	"runtime/debug"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/filters"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
	"github.com/urfave/cli/v2"
)

type Control struct {
	Service vocab.Actor
	Storage oni.FullStorage
}

var token = &cli.Command{
	Name:        "token",
	Usage:       "OAuth2 authorization token management",
	Subcommands: []*cli.Command{tokenAdd},
}

var tokenAdd = &cli.Command{
	Name:    "add",
	Aliases: []string{"new", "get"},
	Usage:   "Adds an OAuth2 token",
	Action:  tokenAct(&ctl),
}

var OAuth2Cmd = &cli.Command{
	Name:  "oauth",
	Usage: "OAuth2 client and access token helper",
	Subcommands: []*cli.Command{
		token,
	},
}

func tokenAct(ctl *Control) cli.ActionFunc {
	return func(c *cli.Context) error {
		clientID := c.String("client")
		if clientID == "" {
			return errors.Newf("Need to provide the client id")
		}
		actor := c.String("actor")
		if clientID == "" {
			return errors.Newf("Need to provide the actor identifier (ID)")
		}
		tok, err := ctl.GenAuthToken(clientID, actor, nil)
		if err == nil {
			fmt.Printf("Authorization: Bearer %s\n", tok)
		}
		return err
	}
}

func (c *Control) GenAuthToken(clientID, actorIdentifier string, dat interface{}) (string, error) {
	if u, err := url.Parse(clientID); err == nil {
		clientID = path.Base(u.Path)
	}
	cl, err := c.Storage.GetClient(clientID)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	var f processing.Filterable
	if u, err := url.Parse(actorIdentifier); err == nil {
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
		Expiration:    86400,
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
	if c.Command != nil {
		fields["cli"] = c.Command.Name
	}

	ctl = Control{
		Service: vocab.Actor{},
		Storage: nil,
	}

	return nil
}

var version = "HEAD"

func main() {
	app := cli.App{}
	app.Name = "onictl"
	app.Usage = "helper utility to manage an ONI instance"
	if build, ok := debug.ReadBuildInfo(); ok && version == "HEAD" {
		app.Version = build.Main.Version
	}
	app.Before = Before
	app.Flags = []cli.Flag{
		&cli.StringFlag{
			Name:  "url",
			Usage: "The url used by the application",
		},
	}
	app.Commands = []*cli.Command{OAuth2Cmd}

	if err := app.Run(os.Args); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
