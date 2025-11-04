package oni

import (
	vocab "github.com/go-ap/activitypub"
	"github.com/microcosm-cc/bluemonday"
)

var (
	// NOTE(marius): for inline svg images like, the default icon
	svgRelatedTags  = []string{"svg", "use"}
	svgRelatedAttrs = []string{"aria-hidden", "name", "href", "width", "height"}

	extraAllowedTags  = []string{"style", "nav", "aside", "bandcamp-embed", "iframe"}
	extraAllowedAttrs = []string{"class", "rel", "src", "url", "style"}

	defaultSanitizePolicy = func() *bluemonday.Policy {
		p := bluemonday.UGCPolicy().
			AllowUnsafe(true).
			AllowElements(append(svgRelatedTags, extraAllowedTags...)...).
			AllowAttrs(append(svgRelatedAttrs, extraAllowedAttrs...)...).Globally()

		return p
	}()
)

func sanitizeNaturalLanguageValues(val vocab.NaturalLanguageValues) vocab.NaturalLanguageValues {
	for k, v := range val {
		val[k] = defaultSanitizePolicy.SanitizeBytes(v)
	}

	return val
}

func sanitizeActor(act *vocab.Actor) error {
	act.PreferredUsername = sanitizeNaturalLanguageValues(act.PreferredUsername)
	_ = vocab.OnObject(act, sanitizeObject)
	return nil
}

func sanitizeIntransitiveActivity(act *vocab.IntransitiveActivity) error {
	_ = sanitizeItem(act.Actor)
	_ = sanitizeItem(act.Target)
	_ = vocab.OnObject(act, sanitizeObject)
	return nil
}

func sanitizeActivity(act *vocab.Activity) error {
	_ = sanitizeItem(act.Object)
	_ = vocab.OnIntransitiveActivity(act, sanitizeIntransitiveActivity)
	return nil
}

func sanitizeOrderedCollectionPage(col *vocab.OrderedCollectionPage) error {
	_ = vocab.OnItemCollection(col.OrderedItems, sanitizeItemCollection)
	_ = vocab.OnObject(col, sanitizeObject)
	return nil
}

func sanitizeItemCollection(col *vocab.ItemCollection) error {
	for _, it := range *col {
		_ = vocab.OnItem(it, sanitizeItem)
	}
	return nil
}

func sanitizeCollectionPage(col *vocab.CollectionPage) error {
	_ = vocab.OnItemCollection(col.Items, sanitizeItemCollection)
	_ = vocab.OnObject(col, sanitizeObject)
	return nil
}

func sanitizeObject(ob *vocab.Object) error {
	ob.Name = sanitizeNaturalLanguageValues(ob.Name)
	ob.Summary = sanitizeNaturalLanguageValues(ob.Summary)
	ob.Content = sanitizeNaturalLanguageValues(ob.Content)
	ob.Source.Content = sanitizeNaturalLanguageValues(ob.Source.Content)
	_ = sanitizeItem(ob.Icon)
	_ = sanitizeItem(ob.Image)
	_ = sanitizeItem(ob.Preview)
	_ = sanitizeItem(ob.Attachment)
	_ = sanitizeItem(ob.Generator)
	return nil
}

func sanitizeLink(l *vocab.Link) error {
	l.Name = sanitizeNaturalLanguageValues(l.Name)
	return nil
}

func sanitizeItem(it vocab.Item) error {
	if vocab.IsNil(it) {
		return nil
	}
	switch {
	case vocab.IsItemCollection(it):
		_ = vocab.OnItemCollection(it, sanitizeItemCollection)
	case vocab.IsLink(it):
		_ = vocab.OnLink(it, sanitizeLink)
	case vocab.IsObject(it):
		switch {
		case orderedCollectionTypes.Contains(it.GetType()):
			_ = vocab.OnOrderedCollectionPage(it, sanitizeOrderedCollectionPage)
		case collectionTypes.Contains(it.GetType()):
			_ = vocab.OnCollectionPage(it, sanitizeCollectionPage)
		case vocab.ActivityTypes.Contains(it.GetType()):
			_ = vocab.OnActivity(it, sanitizeActivity)
		case vocab.IntransitiveActivityTypes.Contains(it.GetType()):
			_ = vocab.OnIntransitiveActivity(it, sanitizeIntransitiveActivity)
		case vocab.ActorTypes.Contains(it.GetType()):
			_ = vocab.OnActor(it, sanitizeActor)
		default:
			_ = vocab.OnObject(it, sanitizeObject)
		}
	}
	return nil
}
