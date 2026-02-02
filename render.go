package oni

import (
	"html/template"
	"strings"

	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	json "github.com/go-ap/jsonld"
	"github.com/mariusor/render"
)

var (
	defaultRenderOptions = render.Options{
		Directory:                 "templates",
		Layout:                    "main",
		Extensions:                []string{".html"},
		FileSystem:                TemplateFS,
		IsDevelopment:             false,
		DisableHTTPErrorRendering: true,
		Funcs: []template.FuncMap{{
			"CurrentVersion": func() template.HTMLAttr {
				return template.HTMLAttr(strings.TrimSuffix(Version, "-git"))
			},
			"HTMLAttr": func(n vocab.NaturalLanguageValues) template.HTMLAttr {
				return template.HTMLAttr(n.First())
			},
			"HTML": func(n vocab.NaturalLanguageValues) template.HTML {
				return template.HTML(n.First())
			},
			"oniType": func(i any) template.HTML {
				switch it := i.(type) {
				case vocab.IRI:
					return "iri"
				case vocab.Item:
					t := it.GetType()
					switch {
					case vocab.CollectionOfItems == t:
						return "items"
					case vocab.FollowType == t:
						return "follow"
					case vocab.ActorTypes.Match(t):
						return "actor"
					case vocab.ActivityVocabularyTypes{vocab.CreateType, vocab.UpdateType}.Match(t):
						return "create"
					case vocab.AnnounceType == t:
						return "announce"
					case vocab.ActivityVocabularyTypes{vocab.LikeType, vocab.DislikeType}.Match(t):
						return "appreciation"
					case vocab.ActivityTypes.Match(t), vocab.IntransitiveActivityTypes.Match(t):
						return "activity"
					case vocab.CollectionTypes.Match(t):
						return "collection"
					case vocab.ActivityVocabularyTypes{vocab.ArticleType, vocab.NoteType}.Match(t):
						return template.HTML(vocab.NoteType)
					case vocab.NilType.Match(t):
						return "tag"
					default:
						return template.HTML(strings.ToLower(typeToString(t)))
					}
				case vocab.NaturalLanguageValues:
					return "natural-language-values"
				case vocab.LangRefValue:
					return "natural-language-value"
				case vocab.LangRef:
					return "value"
				case error:
				default:
					return "error"
				}
				return "error"
			},
			"JSON": func(it any) template.JS {
				return template.JS(renderJson(it))
			},
			"JSONAttr": func(it any) template.HTMLAttr {
				return template.HTMLAttr(renderJson(it))
			},
			"HTTPErrors":          errors.HttpErrors,
			"CurrentURL":          func() template.HTMLAttr { return "" },
			"oniCollectionParent": func() vocab.IRI { return "" },
		}},
	}

	renderOptions = render.HTMLOptions{}
	ren           = render.New(defaultRenderOptions)
)

func renderJson(it any) []byte {
	ob, ok := it.(vocab.Item)
	if !ok {
		res, _ := json.Marshal(it)
		return res
	}
	_ = cleanupMediaObjectFromItem(ob)
	_ = sanitizeItem(ob)
	res, _ := json.Marshal(ob)
	return res
}
