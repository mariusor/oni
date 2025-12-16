package oni

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
	"github.com/google/uuid"
	"github.com/openshift/osin"
	"github.com/valyala/fastjson"
)

type handler struct {
	s []processing.ReadStore
	l lw.Logger
}

var actors = vocab.CollectionPath("actors")

func ValueMatchesLangRefs(val vocab.Content, toCheck ...vocab.NaturalLanguageValues) bool {
	for _, lr := range toCheck {
		for _, name := range lr {
			if strings.EqualFold(name.String(), val.String()) {
				return true
			}
		}
	}
	return false
}

func iriMatchesItem(iri vocab.IRI, it vocab.Item) bool {
	if vocab.IsIRI(it) || vocab.IsObject(it) {
		return iri.Equals(it.GetLink(), false)
	}

	match := false
	if vocab.IsItemCollection(it) {
		vocab.OnCollectionIntf(it, func(col vocab.CollectionInterface) error {
			for _, i := range col.Collection() {
				if iri.Equals(i.GetLink(), true) {
					match = true
					break
				}
			}
			return nil
		})
	}
	return match
}

func And(checkFns ...func(actor vocab.Actor) bool) func(actor vocab.Actor) bool {
	return func(actor vocab.Actor) bool {
		for _, checkFn := range checkFns {
			if !checkFn(actor) {
				return false
			}
		}
		return true
	}
}

func AnyTrue(fns ...func(vocab.Actor) bool) func(actor vocab.Actor) bool {
	return func(actor vocab.Actor) bool {
		for _, fn := range fns {
			if fn(actor) {
				return true
			}
		}
		return false
	}
}

func AllTrue(fns ...func(vocab.Actor) bool) func(actor vocab.Actor) bool {
	return func(actor vocab.Actor) bool {
		for _, fn := range fns {
			if !fn(actor) {
				return false
			}
		}
		return true
	}
}

func CheckActorName(name string) func(actor vocab.Actor) bool {
	return func(a vocab.Actor) bool {
		return ValueMatchesLangRefs(vocab.Content(name), a.PreferredUsername, a.Name)
	}
}

func CheckObjectURL(url string) func(actor vocab.Object) bool {
	return func(a vocab.Object) bool {
		return iriMatchesItem(vocab.IRI(url), a.URL)
	}
}

func CheckActorURL(url string) func(actor vocab.Actor) bool {
	return func(a vocab.Actor) bool {
		return iriMatchesItem(vocab.IRI(url), a.URL)
	}
}

func CheckActorHost(host string) func(actor vocab.Actor) bool {
	return func(a vocab.Actor) bool {
		u, err := a.ID.URL()
		if err != nil {
			return false
		}
		return u.Host == host
	}
}

func CheckObjectID(url string) func(ob vocab.Object) bool {
	return func(o vocab.Object) bool {
		return iriMatchesItem(vocab.IRI(url), o.ID)
	}
}

func CheckActorID(url string) func(actor vocab.Actor) bool {
	return func(a vocab.Actor) bool {
		return iriMatchesItem(vocab.IRI(url), a.ID)
	}
}

func LoadIRI(db processing.ReadStore, what vocab.IRI, checkFns ...func(actor vocab.Object) bool) (vocab.Item, error) {
	result, err := db.Load(what)
	if err != nil {
		return nil, errors.NewNotFound(err, "nothing was found at IRI: %s", what)
	}
	var found vocab.Item
	err = vocab.OnObject(result, func(o *vocab.Object) error {
		for _, fn := range checkFns {
			if fn(*o) {
				found = o
			}
		}
		return nil
	})
	return found, err
}

func (o *oni) loadActorFromStorage(checkFns ...func(actor vocab.Actor) bool) (vocab.Item, error) {
	for _, act := range o.a {
		var found *vocab.Actor
		err := vocab.OnActor(act, func(a *vocab.Actor) error {
			for _, fn := range checkFns {
				if fn(*a) {
					found = a
				}
			}
			return nil
		})
		if err != nil {
			return nil, errors.NewNotFound(err, "no matching actor found")
		}
		if !vocab.IsNil(found) {
			return found, nil
		}
	}
	return nil, errors.NotFoundf("no matching actor found")
}

func handleErr(l lw.Logger) func(r *http.Request, e error) errors.ErrorHandlerFn {
	return func(r *http.Request, e error) errors.ErrorHandlerFn {
		defer func(r *http.Request, e error) {
			st := errors.HttpStatus(e)
			l.Warnf("%s %s %d %s", r.Method, irif(r), st, http.StatusText(st))
		}(r, e)
		return errors.HandleError(e)
	}
}

func (h handler) findMatchingStorage(hosts ...string) (vocab.Actor, processing.ReadStore, error) {
	var app vocab.Actor
	for _, db := range h.s {
		for _, host := range hosts {
			host = "https://" + host + "/"
			res, err := db.Load(vocab.IRI(host))
			if err != nil {
				continue
			}
			err = vocab.OnActor(res, func(actor *vocab.Actor) error {
				app = *actor
				return nil
			})
			if err != nil {
				continue
			}
			if app.ID != "" {
				return app, db, nil
			}
		}
	}
	return app, nil, fmt.Errorf("unable to find storage")
}

// HandleWebFinger serves /.well-known/webfinger/
func HandleWebFinger(o *oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		res := r.URL.Query().Get("resource")
		if res == "" {
			handleErr(o.Logger)(r, errors.NotFoundf("resource not found %s", res)).ServeHTTP(w, r)
			return
		}

		host := r.Host
		typ, handle := splitResourceString(res)
		if typ == "" || handle == "" {
			handleErr(o.Logger)(r, errors.BadRequestf("invalid resource %s", res)).ServeHTTP(w, r)
			return
		}
		if typ == "acct" {
			if strings.Contains(handle, "@") {
				handle, host = func(s string) (string, string) {
					split := "@"
					ar := strings.Split(s, split)
					if len(ar) != 2 {
						return "", ""
					}
					return ar[0], ar[1]
				}(handle)
			}
		}

		wf := node{}
		subject := res

		var result vocab.Item
		maybeUrl := fmt.Sprintf("https://%s", host)
		filterFn := AnyTrue(CheckActorURL(maybeUrl), CheckActorID(maybeUrl))
		if host != handle {
			filterFn = AllTrue(CheckActorName(handle), filterFn)
		}
		if typ == "acct" {
			a, err := o.loadActorFromStorage(filterFn)
			if err != nil {
				handleErr(o.Logger)(r, errors.NewNotFound(err, "resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			if vocab.IsNil(a) {
				handleErr(o.Logger)(r, errors.NotFoundf("resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			result = a
		}
		if typ == "https" {
			ob, err := LoadIRI(o.Storage, vocab.IRI(res), CheckObjectURL(res), CheckObjectID(res))
			if err != nil {
				handleErr(o.Logger)(r, errors.NewNotFound(err, "resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			if vocab.IsNil(ob) {
				handleErr(o.Logger)(r, errors.NotFoundf("resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			result = ob
		}

		id := result.GetID()
		wf.Subject = subject
		wf.Links = []link{
			{
				Rel:  "self",
				Type: "application/activity+json",
				Href: id.String(),
			},
		}
		_ = vocab.OnObject(result, func(ob *vocab.Object) error {
			if vocab.IsNil(ob.URL) {
				return nil
			}
			urls := make(vocab.IRIs, 0)
			if vocab.IsItemCollection(ob.URL) {
				_ = vocab.OnItemCollection(ob.URL, func(col *vocab.ItemCollection) error {
					for _, it := range col.Collection() {
						_ = urls.Append(it.GetLink())
					}
					return nil
				})
			} else {
				_ = urls.Append(ob.URL.GetLink())
			}

			for _, u := range urls {
				if u.Equals(id, true) {
					continue
				}
				url := u.String()
				wf.Aliases = append(wf.Aliases, url)
				wf.Links = append(wf.Links, link{
					Rel:  "https://webfinger.net/rel/profile-page",
					Type: "text/html",
					Href: url,
				})
			}

			wf.Aliases = append(wf.Aliases, id.String())
			return nil
		})

		dat, _ := json.Marshal(wf)
		w.Header().Set("Content-Type", "application/jrd+json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dat)
		o.Logger.Debugf("%s %s%s %d %s", r.Method, r.Host, r.RequestURI, http.StatusOK, http.StatusText(http.StatusOK))
	}
}

type ClientRegistrationRequest struct {
	// RedirectUris Array of redirection URI strings for use in redirect-based flows
	// such as the authorization code and implicit flows.  As required by
	// Section 2 of OAuth 2.0 [RFC6749], clients using flows with
	// redirection MUST register their redirection URI values.
	// Authorization servers that support dynamic registration for
	// redirect-based flows MUST implement support for this metadata
	// value.
	RedirectUris []string `json:"redirect_uris"`

	// ClientName
	// Human-readable string name of the client to be presented to the
	// end-user during authorization.  If omitted, the authorization
	// server MAY display the raw "client_id" value to the end-user
	// instead.  It is RECOMMENDED that clients always send this field.
	// The value of this field MAY be internationalized, as described in
	// Section 2.2.
	ClientName string `json:"client_name"`

	// TokenEndpointAuthMethod
	// String indicator of the requested authentication method for the
	// token endpoint.  Values defined by this specification are:
	// *  "none": The client is a public client as defined in OAuth 2.0,
	//    Section 2.1, and does not have a client secret.
	// *  "client_secret_post": The client uses the HTTP POST parameters
	//    as defined in OAuth 2.0, Section 2.3.1.
	// *  "client_secret_basic": The client uses HTTP Basic as defined in
	//    OAuth 2.0, Section 2.3.1.
	// Additional values can be defined via the IANA "OAuth Token
	// Endpoint Authentication Methods" registry established in
	// Section 4.2.  Absolute URIs can also be used as values for this
	// parameter without being registered.  If unspecified or omitted,
	// the default is "client_secret_basic", denoting the HTTP Basic
	// authentication scheme as specified in Section 2.3.1 of OAuth 2.0.
	TokenEndpointAuthMethod string `json:"token_endpoint_auth_method"`

	// GrantTypes
	// Array of OAuth 2.0 grant type strings that the client can use at
	// the token endpoint.  These grant types are defined as follows:
	// *  "authorization_code": The authorization code grant type defined
	//    in OAuth 2.0, Section 4.1.
	// *  "implicit": The implicit grant type defined in OAuth 2.0,
	//    Section 4.2.
	// *  "password": The resource owner password credentials grant type
	//    defined in OAuth 2.0, Section 4.3.
	// *  "client_credentials": The client credentials grant type defined
	//    in OAuth 2.0, Section 4.4.
	// *  "refresh_token": The refresh token grant type defined in OAuth
	//    2.0, Section 6.
	// *  "urn:ietf:params:oauth:grant-type:jwt-bearer": The JWT Bearer
	//    Token Grant Type defined in OAuth JWT Bearer Token Profiles
	//    [RFC7523].
	// *  "urn:ietf:params:oauth:grant-type:saml2-bearer": The SAML 2.0
	//    Bearer Assertion Grant defined in OAuth SAML 2 Bearer Token
	//    Profiles [RFC7522].
	// If the token endpoint is used in the grant type, the value of this
	// parameter MUST be the same as the value of the "grant_type"
	// parameter passed to the token endpoint defined in the grant type
	// definition.  Authorization servers MAY allow for other values as
	// defined in the grant type extension process described in OAuth
	// 2.0, Section 4.5.  If omitted, the default behavior is that the
	// client will use only the "authorization_code" Grant Type.
	GrantTypes []string `json:"grant_types"`

	// ResponseTypes
	// Array of the OAuth 2.0 response type strings that the client can
	// use at the authorization endpoint.  These response types are
	// defined as follows:
	// *  "code": The authorization code response type defined in OAuth
	//    2.0, Section 4.1.
	// *  "token": The implicit response type defined in OAuth 2.0,
	//    Section 4.2.
	//  If the authorization endpoint is used by the grant type, the value
	// of this parameter MUST be the same as the value of the
	// "response_type" parameter passed to the authorization endpoint
	// defined in the grant type definition.  Authorization servers MAY
	// allow for other values as defined in the grant type extension
	// process is described in OAuth 2.0, Section 4.5.  If omitted, the
	// default is that the client will use only the "code" response type.
	ResponseTypes []string `json:"response_types,omitempty"`

	// ClientURI
	// URL string of a web page providing information about the client.
	// If present, the server SHOULD display this URL to the end-user in
	// a clickable fashion.  It is RECOMMENDED that clients always send
	// this field.  The value of this field MUST point to a valid web
	// page.  The value of this field MAY be internationalized, as
	// described in Section 2.2.
	ClientURI string `json:"client_uri,omitempty"`

	// LogoURI
	// URL string that references a logo for the client.  If present, the
	// server SHOULD display this image to the end-user during approval.
	// The value of this field MUST point to a valid image file.  The
	// value of this field MAY be internationalized, as described in
	// Section 2.2.
	LogoURI string `json:"logo_uri,omitempty"`

	// Scope
	// String containing a space-separated list of scope values (as
	// described in Section 3.3 of OAuth 2.0 [RFC6749]) that the client
	// can use when requesting access tokens.  The semantics of values in
	// this list are service specific.  If omitted, an authorization
	// server MAY register a client with a default set of scopes.
	Scope string `json:"scope,omitempty"`

	// Contacts
	// Array of strings representing ways to contact people responsible
	// for this client, typically email addresses.  The authorization
	// server MAY make these contact addresses available to end-users for
	// support requests for the client.  See Section 6 for information on
	// Privacy Considerations.
	Contacts []string `json:"contacts,omitempty"`

	// TosURI
	// URL string that points to a human-readable terms of service
	// document for the client that describes a contractual relationship
	// between the end-user and the client that the end-user accepts when
	// authorizing the client.  The authorization server SHOULD display
	// this URL to the end-user if it is provided.  The value of this
	// field MUST point to a valid web page.  The value of this field MAY
	// be internationalized, as described in Section 2.2.
	TosURI string `json:"tos_uri,omitempty"`

	// PolicyURI
	// URL string that points to a human-readable privacy policy document
	// that describes how the deployment organization collects, uses,
	// retains, and discloses personal data.  The authorization server
	// SHOULD display this URL to the end-user if it is provided.  The
	// value of this field MUST point to a valid web page.  The value of
	// this field MAY be internationalized, as described in Section 2.2.
	PolicyURI string `json:"policy_uri,omitempty"`

	// JwksURI
	// URL string referencing the client's JSON Web Key (JWK) Set
	// [RFC7517] document, which contains the client's public keys.  The
	// value of this field MUST point to a valid JWK Set document.  These
	// keys can be used by higher-level protocols that use signing or
	// encryption.  For instance, these keys might be used by some
	// applications for validating signed requests made to the token
	// endpoint when using JWTs for client authentication [RFC7523].  Use
	// of this parameter is preferred over the "jwks" parameter, as it
	// allows for easier key rotation.  The "jwks_uri" and "jwks"
	// parameters MUST NOT both be present in the same request or
	// response.
	JwksURI string `json:"jwks_uri,omitempty"`

	// Jwks
	// Client's JSON Web Key Set [RFC7517] document value, which contains
	// the client's public keys.  The value of this field MUST be a JSON
	// object containing a valid JWK Set.  These keys can be used by
	// higher-level protocols that use signing or encryption.  This
	// parameter is intended to be used by clients that cannot use the
	// "jwks_uri" parameter, such as native clients that cannot host
	// public URLs.  The "jwks_uri" and "jwks" parameters MUST NOT both
	// be present in the same request or response.
	Jwks json.RawMessage `json:"jwks,omitempty"`

	// SoftwareID
	// A unique identifier string (e.g., a Universally Unique Identifier
	// (UUID)) assigned by the client developer or software publisher
	// used by registration endpoints to identify the client software to
	// be dynamically registered.  Unlike "client_id", which is issued by
	// the authorization server and SHOULD vary between instances, the
	// "software_id" SHOULD remain the same for all instances of the
	// client software.  The "software_id" SHOULD remain the same across
	SoftwareID *uuid.UUID `json:"software_id,omitempty"`
}

func loadString(r *fastjson.Value, s *string) error {
	if r == nil {
		return nil
	}
	*s = r.String()
	if ls := len(*s); ls > 0 && (*s)[0] == '"' && (*s)[ls-1] == '"' {
		*s = (*s)[1 : ls-1]
	}
	*s = strings.ReplaceAll(*s, "\\/", "/")
	return nil
}

func loadStringArray(r *fastjson.Value, st *[]string) error {
	if r == nil {
		return nil
	}
	switch r.Type() {
	case fastjson.TypeArray:
		arr, err := r.Array()
		if err != nil {
			return err
		}
		for _, vv := range arr {
			s := ""
			if _ = loadString(vv, &s); s != "" {
				*st = append(*st, s)
			}
		}
	case fastjson.TypeString:
		s := ""
		if _ = loadString(r, &s); s != "" {
			*st = append(*st, s)
		}
	}
	return nil
}

func (c *ClientRegistrationRequest) UnmarshalJSON(data []byte) error {
	v, err := fastjson.ParseBytes(data)
	if err != nil {
		return err
	}
	if cn := v.Get("client_name"); cn != nil {
		_ = loadString(cn, &c.ClientName)
	}
	if ci := v.Get("client_uri"); ci != nil {
		_ = loadString(ci, &c.ClientURI)
	}
	if cl := v.Get("logo_uri"); cl != nil {
		_ = loadString(cl, &c.LogoURI)
	}
	if ta := v.Get("token_endpoint_auth_method"); ta != nil {
		_ = loadString(ta, &c.TokenEndpointAuthMethod)
	}
	if s := v.Get("scope"); s != nil {
		_ = loadString(s, &c.Scope)
	}
	if tu := v.Get("tos_uri"); tu != nil {
		_ = loadString(tu, &c.TosURI)
	}
	if pu := v.Get("policy_uri"); pu != nil {
		_ = loadString(pu, &c.PolicyURI)
	}
	if ju := v.Get("jwks_uri"); ju != nil {
		_ = loadString(ju, &c.JwksURI)
	}
	if si := v.Get("software_id"); si != nil {
		i := ""
		_ = loadString(si, &i)
		if u, err := uuid.Parse(i); err == nil {
			c.SoftwareID = &u
		}
	}

	c.RedirectUris = make([]string, 0)
	if err = loadStringArray(v.Get("redirect_uris"), &c.RedirectUris); err != nil {
		return err
	}
	c.GrantTypes = make([]string, 0)
	if err = loadStringArray(v.Get("grant_types"), &c.GrantTypes); err != nil {
		return err
	}
	c.ResponseTypes = make([]string, 0)
	if err = loadStringArray(v.Get("response_types"), &c.ResponseTypes); err != nil {
		return err
	}
	c.Contacts = make([]string, 0)
	if err = loadStringArray(v.Get("contacts"), &c.Contacts); err != nil {
		return err
	}
	return nil
}

type ClientRegistrationResponse struct {
	// ClientID REQUIRED. OAuth 2.0 client identifier string.  It SHOULD NOT be
	//	currently valid for any other registered client, though an
	//	authorization server MAY issue the same client identifier to
	//	multiple instances of a registered client at its discretion.
	ClientID string `json:"client_id"`

	// ClientSecret
	// OPTIONAL.  OAuth 2.0 client secret string.  If issued, this MUST
	// be unique for each "client_id" and SHOULD be unique for multiple
	// instances of a client using the same "client_id".  This value is
	// used by confidential clients to authenticate to the token
	// endpoint, as described in OAuth 2.0 [RFC6749], Section 2.3.1.
	ClientSecret string `json:"client_secret"`

	// IssuedAt OPTIONAL.  Time at which the client identifier was issued.  The
	// time is represented as the number of seconds from
	// 1970-01-01T00:00:00Z as measured in UTC until the date/time of
	// issuance.
	IssuedAt int64 `json:"client_id_issued_at"`

	// Expires REQUIRED if "client_secret" is issued.  Time at which the client
	// secret will expire or 0 if it will not expire.  The time is
	// represented as the number of seconds from 1970-01-01T00:00:00Z as
	// measured in UTC until the date/time of expiration.
	Expires int64 `json:"client_secret_expires_at"`
}

func (o *oni) AddActor(p *vocab.Person, pw []byte, author vocab.Actor) (*vocab.Person, error) {
	if o.Storage == nil {
		return nil, errors.Errorf("invalid storage backend")
	}
	if author.GetLink().Equals(auth.AnonymousActor.GetLink(), false) {
		return nil, errors.Errorf("invalid parent actor")
	}

	createdAt := time.Now().UTC()
	create := vocab.Activity{
		Type:    vocab.CreateType,
		To:      vocab.ItemCollection{vocab.PublicNS},
		Actor:   author,
		Updated: createdAt,
		Object:  p,
	}
	if create.AttributedTo == nil {
		create.AttributedTo = author.GetLink()
	}
	if !create.CC.Contains(author.GetLink()) {
		_ = create.CC.Append(author.GetLink())
	}

	outbox := vocab.Outbox.Of(author)
	if vocab.IsNil(outbox) {
		return nil, errors.Newf("unable to find Actor's outbox: %s", author)
	}

	alwaysLocal := func(_ vocab.IRI) bool {
		return true
	}
	ap := processing.New(
		processing.WithStorage(o.Storage),
		processing.WithIDGenerator(GenerateID),
		processing.WithLocalIRIChecker(alwaysLocal),
	)
	if _, err := ap.ProcessClientActivity(create, author, outbox.GetLink()); err != nil {
		return nil, err
	}

	return p, o.Storage.PasswordSet(p.GetLink(), pw)
}

func HandleOAuthClientRegistration(o *oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			o.Error(errors.MethodNotAllowedf("HTTP method not allowed")).ServeHTTP(w, r)
			return
		}

		self := o.oniActor(r)
		if self.Equals(auth.AnonymousActor) {
			o.Error(errors.NotFoundf("not found")).ServeHTTP(w, r)
			return
		}

		body, err := io.ReadAll(r.Body)
		if err != nil || len(body) == 0 {
			o.Logger.WithContext(lw.Ctx{"err": err.Error()}).Errorf("Failed loading body")
			o.Error(errors.NewNotValid(err, "unable to read request body")).ServeHTTP(w, r)
			return
		}

		regReq := ClientRegistrationRequest{}
		if err := json.Unmarshal(body, &regReq); err != nil {
			o.Error(errors.NewBadRequest(err, "invalid RFC7591 payload")).ServeHTTP(w, r)
			return
		}

		var id string
		var d osin.Client
		var status int

		now := time.Now().UTC()
		name := regReq.ClientName
		urls := make(vocab.ItemCollection, 0)

		redirect := make([]string, 0, len(regReq.RedirectUris))
		for _, redirectUrl := range regReq.RedirectUris {
			u, err := url.ParseRequestURI(redirectUrl)
			if err != nil {
				continue
			}
			if cleanPath := path.Clean(u.Path); cleanPath != "." {
				u.Path = cleanPath
			}
			if name == "" {
				name = u.Host
			}
			curURL := u.String()

			u.Path = ""
			_ = urls.Append(vocab.IRI(u.String()), vocab.IRI(curURL))
			redirect = append(redirect, curURL)
		}
		if regReq.ClientURI != "" {
			urls = append(urls, vocab.IRI(regReq.ClientURI))
		}

		clientID := self.GetLink().AddPath("client")
		if regReq.SoftwareID != nil {
			clientID = clientID.AddPath(regReq.SoftwareID.String())
		} else {
			clientID = clientID.AddPath(uuid.New().String())
		}

		clientActor := &vocab.Application{
			ID:                clientID,
			Type:              vocab.ApplicationType,
			AttributedTo:      self.GetLink(),
			Audience:          vocab.ItemCollection{vocab.PublicNS},
			Generator:         self.GetLink(),
			Published:         now,
			Updated:           now,
			PreferredUsername: vocab.DefaultNaturalLanguage(name),
			Summary:           vocab.DefaultNaturalLanguage("Generated actor"),
			URL:               urls,
		}
		if regReq.LogoURI != "" {
			clientActor.Icon = vocab.IRI(regReq.LogoURI)
		}

		maybeExists, err := o.Storage.Load(clientActor.ID)
		if err == nil {
			clientActor, err = vocab.ToActor(maybeExists)
			if err != nil {
				o.Error(errors.Conflictf("existing item at IRI %s but is not an actor %s", clientActor.ID, maybeExists.GetType())).ServeHTTP(w, r)
				return
			}

			d, err = o.Storage.GetClient(clientActor.ID.String())
			if err != nil {
				o.Error(errors.Newf("unable to load existing OAuth2 client application")).ServeHTTP(w, r)
				return
			}
			status = http.StatusOK
		} else {
			// TODO(marius): use some valid pw generation here
			pw := []byte(DefaultOAuth2ClientPw)

			app, err := o.AddActor(clientActor, pw, self)
			if err != nil {
				o.Error(err).ServeHTTP(w, r)
				return
			}
			if metaSaver, ok := o.Storage.(MetadataStorage); ok {
				if err := AddKeyToItem(metaSaver, clientActor, "RSA"); err != nil {
					o.Error(errors.Annotatef(err, "Error saving metadata for application %s", name)).ServeHTTP(w, r)
					return
				}
			}

			// TODO(marius): allow for updates of the application actor with incoming parameters for Icon, Summary, samd.

			id = app.GetID().String()
			if id == "" {
				o.Error(errors.Newf("invalid actor saved, id is null")).ServeHTTP(w, r)
				return
			}

			// TODO(marius): add a local Client struct that implements Client and ClientSecretMatcher interfaces with bcrypt support
			//   It could even be a struct composite from an activitypub.Application + secret and callback properties
			userData, _ := json.Marshal(regReq)
			d = &osin.DefaultClient{
				Id:          id,
				Secret:      string(pw),
				RedirectUri: strings.Join(redirect, "\n"),
				UserData:    userData,
			}

			if err = o.Storage.CreateClient(d); err != nil {
				o.Error(errors.Newf("unable to save OAuth2 client application")).ServeHTTP(w, r)
				return
			}
			status = http.StatusCreated
		}

		resp := ClientRegistrationResponse{
			ClientID:     d.GetId(),
			ClientSecret: d.GetSecret(),
			IssuedAt:     clientActor.Published.Unix(),
			Expires:      0,
		}
		w.Header().Add("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(resp)
		o.Logger.Debugf("%s %s%s %d %s", r.Method, r.Host, r.RequestURI, http.StatusOK, http.StatusText(http.StatusOK))
	}
}

type MetadataStorage interface {
	LoadMetadata(vocab.IRI, any) error
	SaveMetadata(vocab.IRI, any) error
}

func GenerateRSAKeyPair() (pem.Block, pem.Block) {
	keyPrv, _ := rsa.GenerateKey(rand.Reader, 2048)

	keyPub := keyPrv.PublicKey
	pubEnc, err := x509.MarshalPKIXPublicKey(&keyPub)
	if err != nil {
		panic(err)
	}
	prvEnc, err := x509.MarshalPKCS8PrivateKey(keyPrv)
	if err != nil {
		panic(err)
	}
	p := pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubEnc,
	}
	r := pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: prvEnc,
	}
	return p, r
}

func publicKeyFrom(prvBytes []byte) pem.Block {
	prv, _ := pem.Decode(prvBytes)
	var pubKey crypto.PublicKey
	if key, _ := x509.ParseECPrivateKey(prvBytes); key != nil {
		pubKey = key.PublicKey
	}
	if key, _ := x509.ParsePKCS8PrivateKey(prv.Bytes); pubKey == nil && key != nil {
		switch k := key.(type) {
		case *rsa.PrivateKey:
			pubKey = k.PublicKey
		case *ecdsa.PrivateKey:
			pubKey = k.PublicKey
		case ed25519.PrivateKey:
			pubKey = k.Public()
		}
	}
	pubEnc, err := x509.MarshalPKIXPublicKey(pubKey)
	if err != nil {
		return pem.Block{}
	}
	return pem.Block{Type: "PUBLIC KEY", Bytes: pubEnc}
}

func AddKeyToPerson(metaSaver MetadataStorage, typ string) func(act *vocab.Actor) error {
	// TODO(marius): add a way to pass if we should overwrite the keys
	//  for now we'll assume that if we're calling this, we want to do it
	overwriteKeys := true
	return func(act *vocab.Actor) error {
		if !vocab.ActorTypes.Contains(act.Type) {
			return nil
		}

		m := new(auth.Metadata)
		_ = metaSaver.LoadMetadata(act.ID, m)
		var pubB, prvB pem.Block
		if m.PrivateKey == nil || overwriteKeys {
			pubB, prvB = GenerateRSAKeyPair()
			m.PrivateKey = pem.EncodeToMemory(&prvB)
			if err := metaSaver.SaveMetadata(act.ID, m); err != nil {
				return errors.Annotatef(err, "failed saving metadata for actor: %s", act.ID)
			}
		} else {
			pubB = publicKeyFrom(m.PrivateKey)
		}
		if len(pubB.Bytes) > 0 {
			act.PublicKey = vocab.PublicKey{
				ID:           vocab.IRI(fmt.Sprintf("%s#main", act.ID)),
				Owner:        act.ID,
				PublicKeyPem: string(pem.EncodeToMemory(&pubB)),
			}
		}
		return nil
	}
}

func AddKeyToItem(metaSaver MetadataStorage, it vocab.Item, typ string) error {
	if err := vocab.OnActor(it, AddKeyToPerson(metaSaver, typ)); err != nil {
		return errors.Annotatef(err, "failed to process actor: %s", it.GetID())
	}
	st, ok := metaSaver.(processing.Store)
	if !ok {
		return errors.Newf("invalid item store, failed to save actor: %s", it.GetID())
	}
	if _, err := st.Save(it); err != nil {
		return errors.Annotatef(err, "failed to save actor: %s", it.GetID())
	}
	return nil
}

// OauthAuthorizationMetadata is the metadata returned by RFC8414 well known oauth-authorization-server end-point
//
// https://datatracker.ietf.org/doc/html/rfc8414#section-3.2
type OauthAuthorizationMetadata struct {
	Issuer                                     string                   `json:"issuer"`
	AuthorizationEndpoint                      string                   `json:"authorization_endpoint"`
	TokenEndpoint                              string                   `json:"token_endpoint"`
	TokenEndpointAuthMethodsSupported          []string                 `json:"token_endpoint_auth_methods_supported,omitempty"`
	TokenEndpointAuthSigningAlgValuesSupported []string                 `json:"token_endpoint_auth_signing_alg_values_supported,omitempty"`
	RegistrationEndpoint                       string                   `json:"registration_endpoint"`
	GrantTypesSupported                        []osin.AccessRequestType `json:"grant_types_supported,omitempty"`
	ScopesSupported                            []string                 `json:"scopes_supported,omitempty"`
	ResponseTypesSupported                     []string                 `json:"response_types_supported,omitempty"`
}

func defaultGrantTypes() []osin.AccessRequestType {
	grants := make([]osin.AccessRequestType, 0, len(auth.DefaultAccessTypes))
	for _, typ := range auth.DefaultAccessTypes {
		if typ == osin.IMPLICIT {
			typ = "implicit"
		}
		grants = append(grants, typ)
	}
	return grants
}

func HandleOauthAuthorizationServer(o *oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		actor := o.oniActor(r)
		if actor.Equals(auth.AnonymousActor) {
			o.Error(errors.NotFoundf("not found")).ServeHTTP(w, r)
			return
		}
		meta := OauthAuthorizationMetadata{
			Issuer:                            actor.ID.String(),
			AuthorizationEndpoint:             actor.Endpoints.OauthAuthorizationEndpoint.GetID().String(),
			TokenEndpoint:                     actor.Endpoints.OauthTokenEndpoint.GetID().String(),
			GrantTypesSupported:               defaultGrantTypes(),
			TokenEndpointAuthMethodsSupported: []string{"client_secret_basic"},
			RegistrationEndpoint:              actor.ID.AddPath("oauth/client").String(),
			TokenEndpointAuthSigningAlgValuesSupported: []string{},
			ResponseTypesSupported:                     nil,
		}
		data, _ := json.Marshal(meta)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(data)
		o.Logger.Debugf("%s %s%s %d %s", r.Method, r.Host, r.RequestURI, http.StatusOK, http.StatusText(http.StatusOK))
	}
}

// HandleHostMeta serves /.well-known/host-meta
func HandleHostMeta(o *oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		hm := node{
			Subject: "",
			Aliases: nil,
			Links: []link{
				{
					Rel:      "lrdd",
					Type:     "application/xrd+json",
					Template: fmt.Sprintf("https://%s/.well-known/node?resource={uri}", r.Host),
				},
			},
		}
		dat, _ := json.Marshal(hm)

		w.Header().Set("Content-Type", "application/jrd+json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(dat)
		o.Logger.Debugf("%s %s%s %d %s", r.Method, r.Host, r.RequestURI, http.StatusOK, http.StatusText(http.StatusOK))
	}
}

type link struct {
	Rel      string `json:"rel,omitempty"`
	Type     string `json:"type,omitempty"`
	Href     string `json:"href,omitempty"`
	Template string `json:"template,omitempty"`
}

type node struct {
	Subject string   `json:"subject"`
	Aliases []string `json:"aliases"`
	Links   []link   `json:"links"`
}

func splitResourceString(res string) (string, string) {
	split := ":"
	if strings.Contains(res, "://") {
		split = "://"
	}
	ar := strings.Split(res, split)
	if len(ar) != 2 {
		return "", ""
	}
	typ := ar[0]
	handle := ar[1]
	if len(handle) > 1 && handle[0] == '@' {
		handle = handle[1:]
	}
	return typ, handle
}
