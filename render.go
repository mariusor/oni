package oni

import (
	vocab "github.com/go-ap/activitypub"
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
	}},
})
