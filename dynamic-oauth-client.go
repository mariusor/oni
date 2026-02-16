package oni

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/auth"
	"github.com/go-ap/client/debug"
	"github.com/go-ap/errors"
	"github.com/go-ap/filters"
	"github.com/google/uuid"
	"github.com/openshift/osin"
	"github.com/valyala/fastjson"
)

const (
	clientIdKey    = "client_id"
	redirectUriKey = "redirect_uri"
)

func IsValidAuthorizationRequest(r *http.Request) bool {
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

func (o *oni) ValidateOrCreateClient(r *http.Request, oniActor vocab.Actor) (*vocab.Actor, error) {
	// NOTE(marius): we should try to use Evan's diagram:
	// https://github.com/swicg/activitypub-api/issues/1#issuecomment-3708524521
	_ = r.ParseForm()
	clientURL, err := url.QueryUnescape(r.FormValue(clientIdKey))
	if err != nil {
		return nil, err
	}
	if clientURL == "" {
		return nil, nil
	}
	clientID := vocab.IRI(clientURL)

	repo := o.Storage

	// check for existing application actor
	clientActor, err := LoadClientActorByID(repo, oniActor, clientID)
	if err != nil && errors.IsNotFound(err) {
		if err != nil {
			return nil, err
		}
	}

	var userData []byte
	var redirect []string

	unescapedUri, err := url.QueryUnescape(r.FormValue(redirectUriKey))
	if err != nil {
		return nil, err
	}
	if len(unescapedUri) > 0 {
		redirect = append(redirect, unescapedUri)
	}

	if vocab.IsNil(clientActor) {
		// NOTE(marius): if we were unable to find any local client matching ClientID,
		// we attempt a OAuth Client ID Metadata Document based client registration mechanism.
		res, err := o.FetchClientMetadata(clientID, oniActor)
		if err != nil {
			return nil, err
		}

		redirect = res.RedirectUris
		userData, err = json.Marshal(res)
		if err != nil {
			return nil, err
		}

		res.ClientID = clientURL
		newClient := GeneratedClientActor(oniActor, res)
		clientActor, err = o.AddActorWithPassword(newClient, nil, oniActor)
		if err != nil {
			return nil, err
		}
		if vocab.IsNil(clientActor) {
			return nil, errors.Newf("unable to generate OAuth2 client")
		}
	}

	// must have a valid client
	id := string(clientActor.ID)
	if _, err = repo.GetClient(id); err != nil {
		if errors.IsNotFound(err) {
			if _, err = CreateOAuthClient(repo, clientActor, redirect, nil, userData); err != nil {
				return nil, errors.Newf("unable to save OAuth2 client")
			}
		} else {
			return nil, err
		}
	}

	r.Form.Set(clientIdKey, id)

	return clientActor, nil
}

func GeneratedClientActor(author vocab.Item, clientRequest *ClientMetadata) *vocab.Actor {
	now := time.Now().Truncate(time.Second).UTC()

	// NOTE(marius): when we create a new Application client actor based on Dynamic Metadata Document the
	// client ID we loaded from there will not correspond to the local generated Application Actor ID, but
	// we still add it to the list of URLs of the actor.
	notTheClientID := vocab.IRI(clientRequest.ClientID)
	urls := make(vocab.ItemCollection, 0, 3)
	_ = urls.Append(vocab.IRI(clientRequest.ClientURI))
	if !vocab.EmptyIRI.Equal(notTheClientID) {
		_ = urls.Append(notTheClientID)
	}
	for _, redir := range clientRequest.RedirectUris {
		_ = urls.Append(vocab.IRI(redir))
	}

	clientActor := vocab.Application{
		Type:              vocab.ApplicationType,
		Audience:          vocab.ItemCollection{vocab.PublicNS},
		Published:         now,
		Updated:           now,
		PreferredUsername: vocab.DefaultNaturalLanguage(clientRequest.ClientName),
		Summary:           vocab.DefaultNaturalLanguage("Generated actor"),
		URL:               urls,
	}
	if !vocab.IsNil(author) {
		clientActor.AttributedTo = author.GetLink()
		clientActor.Generator = author.GetLink()
	}

	if newId, err := generateClientID(author, clientRequest.SoftwareID); err == nil {
		clientActor.ID = newId
	}

	// TODO(marius): generate a template file for client actor content
	//   which shows the rest of the client request provided info (links to tos, policy, scopes, grant types etc).
	if clientRequest.LogoURI != "" {
		clientActor.Icon = vocab.IRI(clientRequest.LogoURI)
	}

	return &clientActor
}

// GenerateID creates an IRI that can be used to uniquely identify the "it" item, based on the collection "col" and
// its creator "by"
func generateClientID(by vocab.Item, uid *uuid.UUID) (vocab.ID, error) {
	return by.GetLink().AddPath("clients").AddPath(uid.String()), nil
}

func LoadClientActorByID(repo FullStorage, app vocab.Actor, clientID vocab.IRI) (*vocab.Actor, error) {
	// check for existing application actor
	clientActorItem, err := repo.Load(clientID)
	if err == nil || !errors.IsNotFound(err) {
		return vocab.ToActor(clientActorItem)
	}
	// NOTE(marius): fallback to searching for the OAuth2 application by URL
	actorCol, err := repo.Load(vocab.Outbox.IRI(app), filters.HasType(vocab.CreateType), filters.Object(filters.SameURL(clientID), filters.HasType(vocab.ApplicationType)))
	if err != nil && !errors.IsNotFound(err) {
		return nil, err
	}
	err = vocab.OnCollectionIntf(actorCol, func(col vocab.CollectionInterface) error {
		for _, it := range col.Collection() {
			_ = vocab.OnActivity(it, func(act *vocab.Activity) error {
				clientActorItem = act.Object
				return nil
			})
			if !vocab.IsNil(clientActorItem) {
				break
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return vocab.ToActor(clientActorItem)
}

func (o *oni) SetupAuthServerWithDynamicClientData(r *http.Request, oniActor vocab.Actor, s *auth.Server) error {
	if id := r.FormValue(clientIdKey); id != "" {
		client, err := url.QueryUnescape(id)
		if err != nil {
			return err
		}
		cl, err := o.Storage.GetClient(client)
		if err != nil {
			return err
		}

		s.Config.AllowClientSecretInParams = true
		if vocab.IRI(client).Contains(oniActor.ID, false) && r.FormValue("client_secret") == "" {
			// NOTE(marius): client ID and current server are on the same host
			r.Form.Set("client_secret", cl.GetSecret())
		}
	} else {
		auth, err := osin.CheckBasicAuth(r)
		if err != nil {
			return err
		}

		// check for existing application actor
		clientActor, _ := LoadClientActorByID(o.Storage, oniActor, vocab.IRI(auth.Username))
		if vocab.IsNil(clientActor) {
			// NOTE(marius): if we were unable to find any local client matching ClientID,
			// we attempt a OAuth Client ID Metadata Document based client registration mechanism.
			res, _ := o.FetchClientMetadata(vocab.IRI(auth.Username), oniActor)
			if res != nil {
				if clientID, err := generateClientID(oniActor, res.SoftwareID); err == nil {
					clientActor, err = LoadClientActorByID(o.Storage, oniActor, clientID)
					if err != nil && errors.IsNotFound(err) {
						return err
					}
				}
			}
		}
		if vocab.IsNil(clientActor) {
			return errors.NotFoundf("unable to find a valid client actor based on client metadata")
		}

		cl, err := o.Storage.GetClient(string(clientActor.ID))
		if err != nil {
			return err
		}
		r.SetBasicAuth(url.QueryEscape(cl.GetId()), cl.GetSecret())
	}
	return nil
}

// ValidateClientMetadata
// https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-00.html#name-client-metadata
func ValidateClientMetadata(c ClientMetadata, clientID string) error {
	if !strings.EqualFold(c.ClientID, clientID) {
		return errors.Newf("client_id does not match the URL of the document")
	}
	if strings.Contains(c.TokenEndpointAuthMethod, "client_secret_post") {
		return errors.Newf("client_secret_post is not a valid token_endpoint_auth_method")
	}
	return nil
}

type ClientMetadata struct {
	ClientID string `json:"client_id"`
	IssuedAt int64  `json:"client_id_issued_at"`
	ClientRegistrationRequest
}

func (c *ClientMetadata) UnmarshalJSON(data []byte) error {
	v, err := fastjson.ParseBytes(data)
	if err != nil {
		return err
	}
	if cn := v.Get("client_id"); cn != nil {
		_ = loadString(cn, &c.ClientID)
	}
	if issued := v.Get("issued_at"); issued != nil {
		_ = loadEpochSeconds(issued, &c.IssuedAt)
	}
	return c.ClientRegistrationRequest.UnmarshalJSON(data)
}

func Client(tr http.RoundTripper) *http.Client {
	cl := &http.Client{}
	if tr == nil {
		tr = http.DefaultTransport
	}
	cl.Transport = tr
	return cl
}

func (o *oni) FetchClientMetadata(clientID vocab.IRI, oniActor vocab.Actor) (*ClientMetadata, error) {
	var tr http.RoundTripper = &http.Transport{}
	if IsDev {
		tr = debug.New(debug.WithTransport(tr), debug.WithPath(os.TempDir()))
	}

	ctx := context.Background()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, clientID.String(), nil)
	if err != nil {
		return nil, err
	}

	// TODO(marius): Accept mime-type for Client Metadata Document is application/json
	// https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-00.html#section-4.1-3

	cl := o.Client(oniActor, lw.Ctx{"log": "client_metadata"})
	res, err := cl.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	c := ClientMetadata{}
	if err := json.NewDecoder(res.Body).Decode(&c); err != nil {
		return nil, err
	}

	if err := ValidateClientMetadata(c, string(clientID)); err != nil {
		return nil, err
	}
	return &c, nil
}

func CreateOAuthClient(st FullStorage, clientActor *vocab.Actor, redirect []string, pw, userData []byte) (osin.Client, error) {
	id := string(clientActor.GetID())
	if id == "" {
		return nil, errors.Newf("invalid actor saved, id is null")
	}

	if err := AddKeyToItem(st, clientActor, "RSA"); err != nil {
		return nil, errors.Annotatef(err, "Error saving metadata for application %s", vocab.NameOf(clientActor))
	}

	d := &osin.DefaultClient{
		Id:          id,
		Secret:      string(pw),
		RedirectUri: strings.Join(redirect, "\n"),
		UserData:    userData,
	}

	if err := st.CreateClient(d); err != nil {
		return nil, errors.Annotatef(err, "unable to save OAuth2 client application")
	}
	return d, nil
}
