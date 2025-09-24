package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
	"github.com/go-ap/errors"
)

func main() {
	env := os.Getenv("ENV")
	isProd := strings.HasPrefix(strings.ToLower(env), "prod") || strings.HasPrefix(strings.ToLower(env), "qa")

	if err := buildJS(isProd); err != nil {
		os.Exit(1)
	}
	if err := buildCSS(isProd); err != nil {
		os.Exit(1)
	}
	copyOthers()
}

func buildJS(prod bool) error {
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
		errs := make([]error, 0, len(result.Errors))
		for _, msg := range result.Errors {
			errs = append(errs, errors.Newf("%s: %s %s:%d", msg.PluginName, msg.Text, msg.Location.File, msg.Location.Line))
		}
		return errors.Join(errs...)
	}
	return nil
}

func buildCSS(prod bool) error {
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
		errs := make([]error, 0, len(result.Errors))
		for _, msg := range result.Errors {
			errs = append(errs, errors.Newf("%s: %s %s:%d", msg.PluginName, msg.Text, msg.Location.File, msg.Location.Line))
		}
		return errors.Join(errs...)
	}
	return nil
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
