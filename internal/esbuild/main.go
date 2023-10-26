package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

func main() {
	env := os.Getenv("ENV")
	prod := strings.HasPrefix(strings.ToLower(env), "prod")

	buildJS(prod)
	buildCSS(prod)
	copySVG()
}

func buildJS(prod bool) {
	opt := api.BuildOptions{
		LogLevel:    api.LogLevelDebug,
		EntryPoints: []string{"src/js/main.jsx"},
		Bundle:      true,
		Platform:    api.PlatformBrowser,
		Write:       true,
		Outfile:     "static/main.js",
	}
	if prod {
		opt.LogLevel = api.LogLevelInfo
		opt.MinifyWhitespace = true
		opt.MinifyIdentifiers = true
		opt.MinifySyntax = true
		opt.Sourcemap = api.SourceMapLinked
	}
	// JS
	result := api.Build(opt)

	if len(result.Errors) > 0 {
		fmt.Fprintf(os.Stderr, "%v", result.Errors)
	}
}

func buildCSS(prod bool) {
	opt := api.BuildOptions{
		LogLevel:    api.LogLevelDebug,
		EntryPoints: []string{"src/css/main.css"},
		Bundle:      true,
		Platform:    api.PlatformBrowser,
		Write:       true,
		Outfile:     "static/main.css",
	}
	if prod {
		opt.LogLevel = api.LogLevelInfo
		opt.MinifyWhitespace = true
		opt.MinifyIdentifiers = true
		opt.MinifySyntax = true
		opt.Sourcemap = api.SourceMapLinked
	}
	// CSS
	result := api.Build(opt)

	if len(result.Errors) > 0 {
		fmt.Fprintf(os.Stderr, "%v", result.Errors)
	}
}

func copySVG() {
	svg, err := os.ReadFile("src/icons.svg")
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v", err)
		return
	}

	err = os.WriteFile("static/icons.svg", svg, 0600)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v", err)
	}
}
