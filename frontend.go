package oni

import "embed"

//go:embed templates
var TemplateFS embed.FS

//go:embed assets
var AssetsFS embed.FS
