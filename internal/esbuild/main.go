package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

func main() {
	env := os.Getenv("ENV")
	isProd := strings.HasPrefix(strings.ToLower(env), "prod") || strings.HasPrefix(strings.ToLower(env), "qa")

	buildJS(isProd)
	buildCSS(isProd)
	copyOthers()
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
		opt.TreeShaking = api.TreeShakingTrue
	}
	// JS
	result := api.Build(opt)

	if len(result.Errors) > 0 {
		_, _ = fmt.Fprintf(os.Stderr, "%v", result.Errors)
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
		_, _ = fmt.Fprintf(os.Stderr, "%v", result.Errors)
	}
}

var others = []string{
	"src/icons.svg",
	"src/robots.txt",
}

func copyOthers() {
	for _, other := range others {
		ff, err := os.ReadFile(other)
		if err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "%v", err)
			return
		}

		err = os.WriteFile(strings.Replace(other, "src", "static", 1), ff, 0600)
		if err != nil {
			_, _ = fmt.Fprintf(os.Stderr, "%v", err)
		}
	}
}
