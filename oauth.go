package oni

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/errors"
	"github.com/go-ap/fedbox/activitypub"
	"github.com/go-ap/processing"
	"github.com/openshift/osin"
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
	// ListClients lists existing clients
	ListClients() ([]osin.Client, error)
	GetClient(id string) (osin.Client, error)
}

type FullStorage interface {
	ClientSaver
	ClientLister
	PasswordChanger
	osin.Storage
	processing.Store
	processing.KeyLoader
}

type PasswordChanger interface {
	PasswordSet(vocab.Item, []byte) error
	PasswordCheck(vocab.Item, []byte) error
}

type authService struct {
	baseIRI vocab.IRI
	self    vocab.Actor
	storage FullStorage
	auth    auth.Server
	logger  lw.Logger
}

const (
	meKey           = "me"
	redirectUriKey  = "redirect_uri"
	clientIdKey     = "client_id"
	responseTypeKey = "response_type"

	ID osin.AuthorizeRequestType = "id"
)

type login struct {
	title   string
	account vocab.Actor
	state   string
	client  string
}

func (l login) Title() string {
	return l.title
}

func (l login) Account() vocab.Actor {
	return l.account
}

func (l login) State() string {
	return l.state
}

func (l login) Client() string {
	return l.client
}

func (l login) Handle() string {
	if len(l.account.PreferredUsername) == 0 {
		return ""
	}
	return l.account.PreferredUsername.First().String()
}

type model interface {
	Title() string
}

type authModel interface {
	model
	Account() vocab.Actor
}

func (i authService) IsValidRequest(r *http.Request) bool {
	clientID, err := url.QueryUnescape(r.FormValue(clientIdKey))
	if err != nil {
		return false
	}
	clURL, err := url.ParseRequestURI(clientID)
	if err != nil || clURL.Host == "" || clURL.Scheme == "" {
		return false
	}
	return true
}

func filters(r *http.Request, baseURL vocab.IRI) *activitypub.Filters {
	f := activitypub.FromRequest(r, baseURL.String())
	f.IRI = f.IRI[:0]
	f.Collection = activitypub.ActorsType
	return f
}

func IndieAuthClientActor(author vocab.Item, url *url.URL) *vocab.Actor {
	now := time.Now().UTC()
	preferredUsername := url.Host
	p := vocab.Person{
		Type:         vocab.ApplicationType,
		AttributedTo: author.GetLink(),
		Audience:     vocab.ItemCollection{vocab.PublicNS},
		Generator:    author.GetLink(),
		Published:    now,
		Summary: vocab.NaturalLanguageValues{
			{vocab.NilLangRef, vocab.Content("IndieAuth generated actor")},
		},
		Updated: now,
		PreferredUsername: vocab.NaturalLanguageValues{
			{vocab.NilLangRef, vocab.Content(preferredUsername)},
		},
		URL: vocab.IRI(url.String()),
	}

	return &p
}

func applicationID(base vocab.IRI) func(it vocab.Item, col vocab.Item, by vocab.Item) (vocab.ID, error) {
	return func(it vocab.Item, col vocab.Item, by vocab.Item) (vocab.ID, error) {
		return by.GetID().AddPath("object"), nil
	}
}
func (i authService) ValidateClient(r *http.Request) (*vocab.Actor, error) {
	r.ParseForm()
	clientID, err := url.QueryUnescape(r.FormValue(clientIdKey))
	if err != nil {
		return nil, err
	}
	if clientID == "" {
		return nil, nil
	}
	clientURL, err := url.Parse(clientID)
	if err != nil {
		return nil, nil
	}

	unescapedUri, err := url.QueryUnescape(r.FormValue(redirectUriKey))
	if err != nil {
		return nil, err
	}
	// load the 'me' value of the actor that wants to authenticate
	me, err := url.QueryUnescape(r.FormValue(meKey))
	if err != nil {
		return nil, err
	}

	// check for existing user actor
	var actor vocab.Item
	if me != "" {
		f := filters(r, i.baseIRI)
		f.Type = activitypub.CompStrs{activitypub.StringEquals(string(vocab.PersonType))}
		f.URL = activitypub.CompStrs{activitypub.StringEquals(me)}
		actor, err = i.storage.Load(f.GetLink())
		if err != nil {
			return nil, err
		}
		if actor == nil {
			return nil, errors.NotFoundf("unknown actor")
		}
	}

	// check for existing application actor
	f := filters(r, i.baseIRI)
	f.Type = activitypub.CompStrs{activitypub.StringEquals(string(vocab.ApplicationType))}
	f.URL = activitypub.CompStrs{activitypub.StringEquals(clientID)}
	clientActor, err := i.storage.Load(f.GetLink())
	if err != nil {
		return nil, err
	}
	if clientActor == nil {
		newClient := IndieAuthClientActor(actor, clientURL)
		if err != nil {
			return nil, err
		}
		if newId, err := applicationID(i.baseIRI)(newClient, vocab.Outbox.IRI(actor), nil); err == nil {
			newClient.ID = newId
		}
		clientActor, err = i.storage.Save(newClient)
		if err != nil {
			return nil, err
		}
	}
	id := path.Base(clientActor.GetID().String())
	// must have a valid client
	if _, err = i.storage.GetClient(id); err != nil {
		if errors.IsNotFound(err) {
			// create client
			newClient := osin.DefaultClient{
				Id:          id,
				Secret:      "",
				RedirectUri: unescapedUri,
				//UserData:    userData,
			}
			if err = i.storage.CreateClient(&newClient); err != nil {
				return nil, err
			}
		} else {
			return nil, err
		}
		r.Form.Set(clientIdKey, id)
		if osin.AuthorizeRequestType(r.FormValue(responseTypeKey)) == ID {
			r.Form.Set(responseTypeKey, "code")
		}
		if act, ok := actor.(*vocab.Actor); ok {
			return act, nil
		}

	}
	return nil, nil
}

var (
	scopeAnonymousUserCreate = "anonUserCreate"

	errUnauthorized = errors.Unauthorizedf("Invalid username or password")
	errNotFound     = activitypub.ErrNotFound("actor not found")
)

type account struct {
	username string
	pw       string
	actor    *vocab.Actor
}

func (a account) IsLogged() bool {
	return a.actor != nil && a.actor.PreferredUsername.First().Value.String() == a.username
}

func (a *account) FromActor(p *vocab.Actor) {
	a.username = p.PreferredUsername.First().String()
	a.actor = p
}

func (i *authService) loadAccountByID(id string) (*vocab.Actor, error) {
	f := activitypub.FiltersNew()

	a := activitypub.Self(i.baseIRI)

	f.IRI = activitypub.ActorsType.IRI(a).AddPath(id)
	actors, err := i.storage.Load(f.GetLink())
	if err != nil {
		return nil, err
	}
	if actors == nil {
		return nil, errNotFound
	}

	var actor *vocab.Actor
	err = vocab.OnActor(actors, func(act *vocab.Actor) error {
		actor = act
		return nil
	})
	if err != nil || actor == nil {
		return nil, errNotFound
	}
	return actor, nil
}

func (i *authService) loadAccountFromPost(actor vocab.Actor, r *http.Request) error {
	pw := r.PostFormValue("_pw")

	i.logger.WithContext(lw.Ctx{"pass": pw}).Infof("received")

	return i.storage.PasswordCheck(actor, []byte(pw))
}

func (i *authService) renderTemplate(r *http.Request, w http.ResponseWriter, name string, m authModel) {
	if err := ren.HTML(w, http.StatusOK, name, m); err != nil {
		new := errors.Annotatef(err, "failed to render template")
		i.logger.WithContext(lw.Ctx{"template": name, "model": fmt.Sprintf("%T", m)}).Errorf(new.Error())
		errRenderer.HTML(w, http.StatusInternalServerError, "error", new)
	}
}

func (i *authService) Authorize(w http.ResponseWriter, r *http.Request) {
	s := i.auth
	resp := s.NewResponse()
	defer resp.Close()

	if ar := s.HandleAuthorizeRequest(resp, r); ar != nil {
		ar.Authorized = true
		ar.UserData = i.self.GetID()
		s.FinishAuthorizeRequest(resp, r, ar)
	}
	resp.Type = osin.DATA
	redirectOrOutput(resp, w, r)
}

func (i *authService) Token(w http.ResponseWriter, r *http.Request) {
	s := i.auth
	resp := s.NewResponse()
	defer resp.Close()

	actor := &auth.AnonymousActor
	if ar := s.HandleAccessRequest(resp, r); ar != nil {
		actorFilters := activitypub.FiltersNew()
		switch ar.Type {
		case osin.PASSWORD:
			if u, _ := url.ParseRequestURI(ar.Username); u != nil {
				// NOTE(marius): here we send the full actor IRI as a username to avoid handler collisions
				actorFilters.IRI = vocab.IRI(ar.Username)
			} else {
				actorFilters.IRI = activitypub.ActorsType.IRI(i.baseIRI)
				actorFilters.Name = activitypub.CompStrs{activitypub.StringEquals(ar.Username)}
			}
		case osin.AUTHORIZATION_CODE:
			if iri, ok := ar.UserData.(string); ok {
				actorFilters.IRI = vocab.IRI(iri)
			}
		}
		it, err := i.storage.Load(actorFilters.GetLink())
		if err != nil {
			i.logger.Errorf("%s", errUnauthorized)
			errors.HandleError(errUnauthorized).ServeHTTP(w, r)
			return
		}

		err = vocab.OnActor(it, func(act *vocab.Actor) error {
			actor = act
			return nil
		})
		if err != nil {
			i.logger.Errorf("%s", errUnauthorized)
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
							if err := i.storage.PasswordCheck(act, []byte(ar.Password)); err != nil {
								return err
							}
							actor = act
							return nil
						})
						if err != nil {
							i.logger.WithContext(lw.Ctx{"actor": it.GetID(), "err": err}).
								Errorf("password check failed")
						}
					}
					return errors.Newf("No actor matched the password")
				})
			} else {
				err = i.storage.PasswordCheck(actor, []byte(ar.Password))
			}
			if err != nil {
				if err != nil {
					i.logger.Errorf("%s", err)
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
