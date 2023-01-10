package oni

import (
	vocab "github.com/go-ap/activitypub"
)

func DefaultValue(name string) vocab.NaturalLanguageValues {
	return vocab.NaturalLanguageValues{vocab.LangRefValueNew(vocab.NilLangRef, name)}
}

func SetPreferredUsername(i vocab.Item, name vocab.NaturalLanguageValues) error {
	return vocab.OnActor(i, func(actor *vocab.Actor) error {
		actor.PreferredUsername = name
		return nil
	})
}

func IRIPath(iri vocab.IRI) (string, bool) {
	u, err := iri.URL()
	if err != nil {
		return "/", false
	}
	if u.Path == "" {
		u.Path = "/"
	}
	return u.Path, true
}

func CollectionExists(ob vocab.Item, col vocab.CollectionPath) bool {
	has := false
	switch col {
	case vocab.Outbox:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Outbox != nil
			return nil
		})
	case vocab.Inbox:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Inbox != nil
			return nil
		})
	case vocab.Liked:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Liked != nil
			return nil
		})
	case vocab.Following:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Following != nil
			return nil
		})
	case vocab.Followers:
		vocab.OnActor(ob, func(actor *vocab.Actor) error {
			has = actor.Followers != nil
			return nil
		})
	case vocab.Likes:
		vocab.OnObject(ob, func(ob *vocab.Object) error {
			has = ob.Likes != nil
			return nil
		})
	case vocab.Shares:
		vocab.OnObject(ob, func(ob *vocab.Object) error {
			has = ob.Shares != nil
			return nil
		})
	case vocab.Replies:
		vocab.OnObject(ob, func(ob *vocab.Object) error {
			has = ob.Replies != nil
			return nil
		})
	}
	return has
}
