package main

import (
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

var token = &cli.Command{
	Name:        "token",
	Usage:       "OAuth2 authorization token management",
	Subcommands: []*cli.Command{tokenAdd},
}

var tokenAdd = &cli.Command{
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
	Name:  "oauth",
	Usage: "OAuth2 client and access token helper",
	Flags: []cli.Flag{
		&cli.PathFlag{
			Name:  "path",
			Value: dataPath(),
		},
	},
	Subcommands: []*cli.Command{
		token,
	},
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

func tokenAct(ctl *Control) cli.ActionFunc {
	return func(c *cli.Context) error {
		clientID := c.String("client")
		if clientID == "" {
			return errors.Newf("Need to provide the client id")
		}
		conf := storage.Config{CacheEnable: true, Path: c.Path("path"), ErrFn: ctl.Logger.Errorf, LogFn: ctl.Logger.Infof}
		st, err := storage.New(conf)
		if err != nil {
			ctl.Logger.Errorf("%s", err.Error())
			return err
		}
		ctl.Storage = st

		actor := clientID
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
