package oni

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"strings"

	"git.sr.ht/~mariusor/lw"
	ct "github.com/elnormous/contenttype"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/errors"
	"github.com/go-ap/filters"
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

type FullStorage interface {
	ClientSaver
	ClientLister
	PasswordChanger
	osin.Storage
	processing.Store
	processing.KeyLoader
	MetadataStorage
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
	config := oauth2.Config{ClientID: u.Host, RedirectURL: actor.ID.String()}
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

	o.Logger.WithContext(lw.Ctx{"pass": pw}).Infof("Received")

	return o.Storage.PasswordCheck(actor, []byte(pw))
}

func actorIRIFromRequest(r *http.Request) vocab.IRI {
	rr := *r
	rr.RequestURI = "/"
	return irif(&rr)
}

func loadBaseActor(o *oni, r *http.Request) (vocab.Actor, error) {
	result, err := o.Storage.Load(actorIRIFromRequest(r))
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

func authServer(o *oni, oniActor vocab.Actor) (*auth.Server, error) {
	return auth.New(
		auth.WithIRI(oniActor.GetLink()),
		auth.WithStorage(o.Storage),
		auth.WithClient(Client(oniActor, o.Storage, o.Logger)),
		auth.WithLogger(o.Logger.WithContext(lw.Ctx{"log": "osin"})),
	)
}

func (o *oni) Authorize(w http.ResponseWriter, r *http.Request) {
	a, err := loadBaseActor(o, r)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}

	acceptableMediaTypes := []ct.MediaType{textHTML, applicationJson}
	acc, _, _ := ct.GetAcceptableMediaType(r, acceptableMediaTypes)
	if r.Method == http.MethodGet && !acc.EqualsMIME(textHTML) {
		state := base64.URLEncoding.EncodeToString(authKey())
		m := authModel{
			AuthorizeURL: AuthorizeURL(a, state),
			State:        state,
		}

		_ = json.NewEncoder(w).Encode(m)
		return
	}

	s, err := authServer(o, a)
	if err != nil {
		o.Error(errors.Annotatef(err, "Unable to initialize OAuth2 server"))
		return
	}
	resp := s.NewResponse()

	if ar := s.HandleAuthorizeRequest(resp, r); ar != nil {
		if r.Method == http.MethodGet {
			// this is basically the login page, with client being set
			m := login{title: "Login"}
			m.backURL = backURL(r)

			clientIRI := vocab.IRI(fmt.Sprintf("https://%s", ar.Client.GetId()))
			it, err := o.Storage.Load(clientIRI)
			if err != nil {
				o.Logger.WithContext(lw.Ctx{"err": err, "iri": clientIRI}).Errorf("Invalid client")
				errors.HandleError(errors.Unauthorizedf("Invalid client")).ServeHTTP(w, r)
				return
			}
			if !vocab.IsNil(it) {
				m.client = it
				m.state = ar.State
			} else {
				resp.SetError(osin.E_INVALID_REQUEST, fmt.Sprintf("Invalid client: %+s", err))
				o.redirectOrOutput(resp, w, r)
				return
			}

			o.renderTemplate(r, w, "login", m)
			return
		} else {
			if err := o.loadAccountFromPost(a, r); err != nil {
				o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("wrong password")
				errors.HandleError(errors.Unauthorizedf("Wrong password")).ServeHTTP(w, r)
				return
			}
			ar.Authorized = true
			ar.UserData = a.ID
			s.FinishAuthorizeRequest(resp, r, ar)
		}
	}
	if !acc.Equal(textHTML) {
		resp.Type = osin.DATA
	}
	o.redirectOrOutput(resp, w, r)
}

var (
	errUnauthorized = errors.Unauthorizedf("Invalid username or password")
	errNotFound     = filters.ErrNotFound("actor not found")
)

func (o *oni) Token(w http.ResponseWriter, r *http.Request) {
	a, err := loadBaseActor(o, r)
	if err != nil {
		o.Error(err).ServeHTTP(w, r)
		return
	}

	s, err := authServer(o, a)
	if err != nil {
		o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Unable to initialize OAuth2 server")
		o.Error(err).ServeHTTP(w, r)
		return
	}

	resp := s.NewResponse()

	actor := &auth.AnonymousActor
	if ar := s.HandleAccessRequest(resp, r); ar != nil {
		actorIRI := a.ID
		if iri, ok := ar.UserData.(string); ok {
			actorIRI = vocab.IRI(iri)
		}
		it, err := o.Storage.Load(actorIRI)
		if err != nil {
			o.Logger.Errorf("%s", errUnauthorized)
			errors.HandleError(errUnauthorized).ServeHTTP(w, r)
			return
		}

		if actor, err = vocab.ToActor(it); err != nil {
			o.Logger.Errorf("%s", errUnauthorized)
			errors.HandleError(errUnauthorized).ServeHTTP(w, r)
			return
		}

		ar.Authorized = !actor.GetID().Equals(auth.AnonymousActor.ID, true)
		ar.UserData = actor.GetLink()
		s.FinishAccessRequest(resp, r, ar)
	}

	acc, _, _ := ct.GetAcceptableMediaType(r, []ct.MediaType{textHTML, applicationJson})
	if !acc.Equal(textHTML) {
		resp.Type = osin.DATA
	}
	o.redirectOrOutput(resp, w, r)
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

func (o *oni) redirectOrOutput(rs *osin.Response, w http.ResponseWriter, r *http.Request) {
	if rs.IsError {
		err := annotatedRsError(rs.StatusCode, rs.InternalError, "Error processing OAuth2 request: %s", rs.StatusText)
		o.Error(err).ServeHTTP(w, r)
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
		u, err := rs.GetRedirectUrl()
		if err != nil {
			err := annotatedRsError(http.StatusInternalServerError, err, "Error getting OAuth2 redirect URL")
			o.Error(err).ServeHTTP(w, r)
			return
		}

		http.Redirect(w, r, u, http.StatusFound)
	} else {
		// set content type if the response doesn't already have one associated with it
		if w.Header().Get("Content-Type") == "" {
			w.Header().Set("Content-Type", "application/json")
		}
		w.WriteHeader(rs.StatusCode)

		if err := json.NewEncoder(w).Encode(rs.Output); err != nil {
			o.Error(err).ServeHTTP(w, r)
			return
		}
	}
}

const (
	DefaultOAuth2ClientPw = "NotSoSecretPassword"
	// DefaultOniAppRedirectURL is the default redirect URL used by the OAuth2 mechanism in the
	// Flutter ONI Application: https://git.sr.ht/~mariusor/oni-app
	// It makes use of the custom URI scheme 'org.oni.app://'
	DefaultOniAppRedirectURL = "org.oni.app://oauth2redirect"
)

func (c *Control) CreateOAuth2ClientIfMissing(i vocab.IRI, pw string) error {
	u, _ := i.URL()

	cl, err := c.Storage.GetClient(u.Host)
	if err == nil {
		return nil
	}
	uris := []string{u.String(), DefaultOniAppRedirectURL}
	cl = &osin.DefaultClient{
		Id:          u.Host,
		Secret:      pw,
		RedirectUri: strings.Join(uris, "\n"),
		UserData:    i,
	}
	return c.Storage.CreateClient(cl)
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

func backURL(r *http.Request) template.URL {
	if r.URL == nil || r.URL.Query() == nil {
		return ""
	}
	q := make(url.Values)
	q.Set("error", osin.E_UNAUTHORIZED_CLIENT)
	q.Set("error_description", "user denied authorization request")
	u, _ := url.QueryUnescape(r.URL.Query().Get("redirect_uri"))
	u = fmt.Sprintf("%s?%s", u, q.Encode())
	return template.URL(u)
}

func (o *oni) renderTemplate(r *http.Request, w http.ResponseWriter, name string, m model) {
	wrt := bytes.Buffer{}

	actor := o.oniActor(r)
	renderOptions.Funcs = template.FuncMap{
		"ONI":   func() vocab.Actor { return actor },
		"URLS":  actorURLs(actor),
		"Title": m.Title,
		"CurrentURL": func() template.URL {
			return template.URL(fmt.Sprintf("https://%s%s", r.Host, r.RequestURI))
		},
	}

	err := ren.HTML(&wrt, http.StatusOK, name, m, renderOptions)
	if err == nil {
		_, _ = io.Copy(w, &wrt)
		return
	}
	o.Error(errors.Annotatef(err, "failed to render template"))(w, r)
}

type login struct {
	title   string
	state   string
	client  vocab.Item
	backURL template.URL
}

func (l login) Title() string {
	return l.title
}

func (l login) BackURL() template.URL {
	return l.backURL
}

func (l login) State() string {
	return l.state
}

func (l login) Client() vocab.Item {
	return l.client
}

type model interface {
	Title() string
}
