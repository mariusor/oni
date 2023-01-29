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
