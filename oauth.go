package oni

import (
	"crypto"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/url"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/errors"
	"github.com/go-ap/fedbox/activitypub"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
	"golang.org/x/oauth2"
)

type ClientSaver interface {
	// UpdateClient updates the client (identified by it's id) and replaces the values with the values of client.
	UpdateClient(c osin.Client) error
	// CreateClient stores the client in the database and returns an error, if something went wrong.
	CreateClient(c osin.Client) error
	// RemoveClient removes a client (identified by id) from the database. Returns an error if something went wrong.
	RemoveClient(id string) error
}

type ClientLister interface {
	GetClient(id string) (osin.Client, error)
}

type KeySaver interface {
	SaveKey(vocab.IRI, crypto.PrivateKey) (vocab.Item, error)
}

type FullStorage interface {
	ClientSaver
	ClientLister
	PasswordChanger
	KeySaver
	osin.Storage
	processing.Store
	processing.KeyLoader
}

type PasswordChanger interface {
	PasswordSet(vocab.Item, []byte) error
	PasswordCheck(vocab.Item, []byte) error
}

type authModel struct {
	AuthorizeURL string `json:"authorizeURL"`
	State        string `json:"state"`
}

func AuthorizeURL(actor vocab.Actor, state string) string {
	u, _ := actor.ID.URL()
	config := oauth2.Config{ClientID: u.Host}
	if !vocab.IsNil(actor) && actor.Endpoints != nil {
		if actor.Endpoints.OauthTokenEndpoint != nil {
			config.Endpoint.TokenURL = actor.Endpoints.OauthTokenEndpoint.GetLink().String()
		}
		if actor.Endpoints.OauthAuthorizationEndpoint != nil {
			config.Endpoint.AuthURL = actor.Endpoints.OauthAuthorizationEndpoint.GetLink().String()
		}
	}
	return config.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

func (o *oni) loadAccountFromPost(actor vocab.Actor, r *http.Request) error {
	pw := r.PostFormValue("_pw")

	o.l.WithContext(lw.Ctx{"pass": pw}).Infof("received")

	return o.s.PasswordCheck(actor, []byte(pw))
}

func actorIRIFromRequest(r *http.Request) vocab.IRI {
	rr := *r
	rr.RequestURI = "/"
	return irif(&rr)
}

func loadBaseActor(o *oni, r *http.Request) (vocab.Actor, error) {
	result, err := o.s.Load(actorIRIFromRequest(r))
	if err != nil {
		return auth.AnonymousActor, err
	}
	actor := auth.AnonymousActor
	err = vocab.OnActor(result, func(act *vocab.Actor) error {
		actor = *act
		return nil
	})
	return actor, err
}

func (o *oni) Authorize(w http.ResponseWriter, r *http.Request) {
	a, err := loadBaseActor(o, r)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}
	as, err := auth.New(
		auth.WithURL(a.ID.String()),
		auth.WithStorage(o.s),
		auth.WithClient(o.c),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "osin"})),
	)
	if err != nil {
		o.l.Errorf("unable to initialize OAuth2 server")
		return
	}
	o.o = as

	if r.Method == http.MethodGet {
		state := base64.URLEncoding.EncodeToString(authKey())
		m := authModel{
			AuthorizeURL: AuthorizeURL(a, state),
			State:        state,
		}

		json.NewEncoder(w).Encode(m)
		return
	}

	s := o.o
	resp := s.NewResponse()
	defer resp.Close()

	if ar := s.HandleAuthorizeRequest(resp, r); ar != nil {
		if err := o.loadAccountFromPost(a, r); err != nil {
			o.l.WithContext(lw.Ctx{"err": err}).Errorf("wrong password")
			errors.HandleError(errors.Unauthorizedf("Wrong password")).ServeHTTP(w, r)
			return
		}
		ar.Authorized = true
		ar.UserData = a.ID
		s.FinishAuthorizeRequest(resp, r, ar)
	}
	resp.Type = osin.DATA
	redirectOrOutput(resp, w, r)
}

var (
	errUnauthorized = errors.Unauthorizedf("Invalid username or password")
	errNotFound     = activitypub.ErrNotFound("actor not found")
)

func (o *oni) Token(w http.ResponseWriter, r *http.Request) {
	s := o.o
	resp := s.NewResponse()
	defer resp.Close()

	as, err := auth.New(
		auth.WithURL(fmt.Sprintf("https://%s", r.URL.Host)),
		auth.WithStorage(o.s),
		auth.WithClient(o.c),
		auth.WithLogger(o.l.WithContext(lw.Ctx{"log": "osin"})),
	)
	if err != nil {
		o.l.Errorf("unable to initialize OAuth2 server")
		return
	}
	o.o = as

	actor := &auth.AnonymousActor
	if ar := s.HandleAccessRequest(resp, r); ar != nil {
		actorFilters := activitypub.FiltersNew()
		switch ar.Type {
		case osin.PASSWORD:
			if u, _ := url.ParseRequestURI(ar.Username); u != nil {
				// NOTE(marius): here we send the full actor IRI as a username to avoid handler collisions
				actorFilters.IRI = vocab.IRI(ar.Username)
			} else {
				actorFilters.Name = activitypub.CompStrs{activitypub.StringEquals(ar.Username)}
			}
		case osin.AUTHORIZATION_CODE:
			if iri, ok := ar.UserData.(string); ok {
				actorFilters.IRI = vocab.IRI(iri)
			}
		}
		it, err := o.s.Load(actorFilters.GetLink())
		if err != nil {
			o.l.Errorf("%s", errUnauthorized)
			errors.HandleError(errUnauthorized).ServeHTTP(w, r)
			return
		}

		err = vocab.OnActor(it, func(act *vocab.Actor) error {
			actor = act
			return nil
		})
		if err != nil {
			o.l.Errorf("%s", errUnauthorized)
			errors.HandleError(errUnauthorized).ServeHTTP(w, r)
			return
		}

		isLogged := !actor.GetID().Equals(auth.AnonymousActor.ID, true)
		if ar.Type == osin.PASSWORD {
			if actor.IsCollection() {
				err = vocab.OnCollectionIntf(actor, func(col vocab.CollectionInterface) error {
					// NOTE(marius): This is a stupid way of doing pw authentication, as it will produce collisions
					//  for users with the same handle/pw and it will login the first in the collection.
					for _, it := range col.Collection() {
						err := vocab.OnActor(it, func(act *vocab.Actor) error {
							if err := o.s.PasswordCheck(act, []byte(ar.Password)); err != nil {
								return err
							}
							actor = act
							return nil
						})
						if err != nil {
							o.l.WithContext(lw.Ctx{"actor": it.GetID(), "err": err}).
								Errorf("password check failed")
						}
					}
					return errors.Newf("No actor matched the password")
				})
			} else {
				err = o.s.PasswordCheck(actor, []byte(ar.Password))
			}
			if err != nil {
				if err != nil {
					o.l.Errorf("%s", err)
				}
				errors.HandleError(errUnauthorized).ServeHTTP(w, r)
				return
			}
			ar.Authorized = isLogged
			ar.UserData = actor.GetLink()
		}
		if ar.Type == osin.AUTHORIZATION_CODE {
			vocab.OnActor(actor, func(p *vocab.Actor) error {
				ar.Authorized = isLogged
				ar.UserData = actor.GetLink()
				return nil
			})
		}
		s.FinishAccessRequest(resp, r, ar)
	}
	redirectOrOutput(resp, w, r)
}

func annotatedRsError(status int, old error, msg string, args ...interface{}) error {
	var err error
	switch status {
	case http.StatusForbidden:
		err = errors.NewForbidden(old, msg, args...)
	case http.StatusUnauthorized:
		err = errors.NewUnauthorized(old, msg, args...)
	case http.StatusInternalServerError:
		fallthrough
	default:
		err = errors.Annotatef(old, msg, args...)
	}

	return err
}

func redirectOrOutput(rs *osin.Response, w http.ResponseWriter, r *http.Request) {
	if rs.IsError {
		err := annotatedRsError(rs.StatusCode, rs.InternalError, "Error processing OAuth2 request: %s", rs.StatusText)
		errors.HandleError(err).ServeHTTP(w, r)
		return
	}
	// Add headers
	for i, k := range rs.Headers {
		for _, v := range k {
			w.Header().Add(i, v)
		}
	}

	if rs.Type == osin.REDIRECT {
		// Output redirect with parameters
		url, err := rs.GetRedirectUrl()
		if err != nil {
			err := annotatedRsError(http.StatusInternalServerError, err, "Error getting OAuth2 redirect URL")
			errors.HandleError(err).ServeHTTP(w, r)
			return
		}

		http.Redirect(w, r, url, http.StatusFound)
	} else {
		// set content type if the response doesn't already have one associated with it
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", "application/json")
		}
		w.WriteHeader(rs.StatusCode)

		if err := json.NewEncoder(w).Encode(rs.Output); err != nil {
			errors.HandleError(err).ServeHTTP(w, r)
			return
		}
	}
}

const defaultOAuth2ClientPw = "NotSoSecretPassword"

func saveOauth2Client(s FullStorage, i vocab.IRI) error {
	u, _ := i.URL()
	c, err := s.GetClient(u.Host)
	if err == nil {
		return nil
	}
	c = &osin.DefaultClient{
		Id:          u.Host,
		Secret:      defaultOAuth2ClientPw,
		RedirectUri: u.String(),
		UserData:    i,
	}
	return s.CreateClient(c)
}

var authKey = func() []byte {
	v1 := rand.Int()
	v2 := rand.Int()
	b := [16]byte{
		byte(0xff & v1),
		byte(0xff & v2),
		byte(0xff & (v1 >> 8)),
		byte(0xff & (v2 >> 8)),
		byte(0xff & (v1 >> 16)),
		byte(0xff & (v2 >> 16)),
		byte(0xff & (v1 >> 24)),
		byte(0xff & (v2 >> 24)),
		byte(0xff & (v1 >> 32)),
		byte(0xff & (v2 >> 32)),
		byte(0xff & (v1 >> 40)),
		byte(0xff & (v2 >> 40)),
		byte(0xff & (v1 >> 48)),
		byte(0xff & (v2 >> 48)),
		byte(0xff & (v1 >> 56)),
		byte(0xff & (v2 >> 56)),
	}
	return b[:]
}
