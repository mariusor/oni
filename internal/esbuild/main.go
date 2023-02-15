package main

import (
	"fmt"
	"os"

	"github.com/evanw/esbuild/pkg/api"
)

func main() {
	buildJS()
	buildCSS()
	copySVG()
}

func buildJS() {
	// JS
	result := api.Build(api.BuildOptions{
		EntryPoints:       []string{"src/js/main.jsx"},
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
