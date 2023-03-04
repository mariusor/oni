package oni

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"git.sr.ht/~mariusor/lw"
	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/go-ap/processing"
)

type handler struct {
	s []processing.ReadStore
	l lw.Logger
}

func webFingerHandler(l lw.Logger, db ...processing.ReadStore) handler {
	return handler{s: db, l: l}
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

func loadActorFromStorage(o oni, checkFns ...func(actor vocab.Actor) bool) (vocab.Item, error) {
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
		if !vocab.IsNil(found) {
			return found, err
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
func HandleWebFinger(o oni) func(w http.ResponseWriter, r *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		res := r.URL.Query().Get("resource")
		if res == "" {
			handleErr(o.l)(r, errors.NotFoundf("resource not found %s", res)).ServeHTTP(w, r)
			return
		}

		host := r.Host
		typ, handle := splitResourceString(res)
		if typ == "" || handle == "" {
			handleErr(o.l)(r, errors.BadRequestf("invalid resource %s", res)).ServeHTTP(w, r)
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
		if typ == "acct" {
			maybeUrl := fmt.Sprintf("https://%s", host)
			a, err := loadActorFromStorage(o, CheckActorName(handle), CheckActorURL(maybeUrl), CheckActorID(maybeUrl))
			if err != nil {
				handleErr(o.l)(r, errors.NewNotFound(err, "resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			if vocab.IsNil(a) {
				handleErr(o.l)(r, errors.NotFoundf("resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			result = a
		}
		if typ == "https" {
			ob, err := LoadIRI(o.s, vocab.IRI(res), CheckObjectURL(res), CheckObjectID(res))
			if err != nil {
				handleErr(o.l)(r, errors.NewNotFound(err, "resource not found %s", res)).ServeHTTP(w, r)
				return
			}
			if vocab.IsNil(ob) {
				handleErr(o.l)(r, errors.NotFoundf("resource not found %s", res)).ServeHTTP(w, r)
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
		vocab.OnObject(result, func(ob *vocab.Object) error {
			if vocab.IsNil(ob.URL) {
				return nil
			}
			urls := make(vocab.IRIs, 0)
			if vocab.IsItemCollection(ob.URL) {
				vocab.OnItemCollection(ob.URL, func(col *vocab.ItemCollection) error {
					for _, it := range col.Collection() {
						urls.Append(it.GetLink())
					}
					return nil
				})
			} else {
				urls.Append(ob.URL.GetLink())
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
		w.Write(dat)
		o.l.Debugf("%s %s%s %d %s", r.Method, r.Host, r.RequestURI, http.StatusOK, http.StatusText(http.StatusOK))
	}
}

// HandleHostMeta serves /.well-known/host-meta
func HandleHostMeta(o oni) func(w http.ResponseWriter, r *http.Request) {
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
		w.Write(dat)
		o.l.Debugf("%s %s%s %d %s", r.Method, r.Host, r.RequestURI, http.StatusOK, http.StatusText(http.StatusOK))
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
