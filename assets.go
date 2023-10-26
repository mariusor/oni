package oni

import "embed"

//go:generate go run ./internal/esbuild/main.go

//go:embed templates
var TemplateFS embed.FS

//go:embed static
var AssetsFS embed.FS
