package main

import (
	"fmt"
	"github.com/evanw/esbuild/pkg/api"
	"os"
)

func main() {
	buildJS()
	buildCSS()
}

func buildJS() {
	// JS
	result := api.Build(api.BuildOptions{
		EntryPoints:       []string{"src/ts/main.jsx"},
		Bundle:            true,
		MinifyWhitespace:  true,
		MinifyIdentifiers: true,
		MinifySyntax:      true,
		Platform:          api.PlatformBrowser,
		Write:             true,
		Sourcemap:         api.SourceMapExternal,
		Outfile:           "static/main.js",
	})

	if len(result.Errors) > 0 {
		fmt.Fprintf(os.Stderr, "%v", result.Errors)
	}
}

func buildCSS() {
	// CSS
	result := api.Build(api.BuildOptions{
		EntryPoints:       []string{"src/css/main.css"},
		Bundle:            true,
		MinifyWhitespace:  true,
		MinifyIdentifiers: true,
		MinifySyntax:      true,
		Platform:          api.PlatformBrowser,
		Write:             true,
		Outfile:           "static/main.css",
	})

	if len(result.Errors) > 0 {
		fmt.Fprintf(os.Stderr, "%v", result.Errors)
	}
}
