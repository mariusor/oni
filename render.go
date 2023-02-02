package oni

import (
	vocab "github.com/go-ap/activitypub"
	json "github.com/go-ap/jsonld"
	"github.com/mariusor/render"
	"html/template"
)

var ren = render.New(render.Options{
	Directory:                 "templates",
	Layout:                    "main",
	Extensions:                []string{".html"},
	FileSystem:                TemplateFS,
	IsDevelopment:             false,
	DisableHTTPErrorRendering: true,
	Funcs: []template.FuncMap{{
		"HTML": func(n vocab.NaturalLanguageValues) template.HTML {
			return template.HTML(n.First().Value)
		},
		"oniType": func(i any) template.HTML {
			switch it := i.(type) {
			case vocab.Item:
				t := it.GetType()
				switch {
				case vocab.ActorTypes.Contains(t):
					return "actor"
				case vocab.ActivityTypes.Contains(t), vocab.IntransitiveActivityTypes.Contains(t):
					return "activity"
				case vocab.CollectionTypes.Contains(t):
					return "collection"
				default:
					return "object"
				}
			case vocab.IRI:
				return "iri"
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
		"JSON": func(it any) template.HTMLAttr {
			var res []byte
			switch o := it.(type) {
			case vocab.Item:
				res, _ = vocab.MarshalJSON(o)
			case vocab.NaturalLanguageValues:
				res, _ = o.MarshalJSON()
			default:
				res, _ = json.Marshal(o)
			}
			return template.HTMLAttr(res)
		},
	}},
})
