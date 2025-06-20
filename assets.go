package oni

import (
	"crypto/md5"
	"embed"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"runtime/debug"
	"time"

	"github.com/go-ap/errors"
)

// NOTE(marius): this generates the files in the "./static" folder
//go:generate go run ./internal/esbuild/main.go

//go:embed templates
var TemplateFS embed.FS

//go:embed static
var AssetsFS embed.FS

type assetData struct {
	raw       []byte
	updatedAt time.Time
	hash      string
}

func HandleStaticAssets(s fs.FS, errFn func(error) http.HandlerFunc) http.HandlerFunc {
	const cacheTime = 8766 * time.Hour

	_ = mime.AddExtensionType(".ico", "image/vnd.microsoft.icon")
	_ = mime.AddExtensionType(".txt", "text/plain; charset=utf-8")

	updated := time.Time{}
	if build, ok := debug.ReadBuildInfo(); ok {
		for _, bs := range build.Settings {
			if bs.Key == "vcs.time" {
				updated, _ = time.Parse("2006-01-02T15:04:05Z07", bs.Value)
			}
		}
	}
	assetMap := make(map[string]assetData)
	return func(w http.ResponseWriter, r *http.Request) {
		assetPath := filepath.Join("static", r.RequestURI)
		mimeType := mime.TypeByExtension(filepath.Ext(assetPath))

		asset, ok := assetMap[assetPath]
		if !ok {
			raw, err := fs.ReadFile(s, assetPath)
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					err = errors.NewNotFound(err, "%s", r.RequestURI)
				}
				errFn(err).ServeHTTP(w, r)
				return
			}
			asset = assetData{
				raw:       raw,
				hash:      fmt.Sprintf(`"%2x"`, md5.Sum(raw)),
				updatedAt: updated,
			}
		}
		assetMap[assetPath] = asset

		w.Header().Set("Cache-Control", fmt.Sprintf("public,max-age=%d", int(cacheTime.Seconds())))
		if !asset.updatedAt.IsZero() {
			w.Header().Set("Last-Modified", asset.updatedAt.Format(time.RFC1123))
		}
		if asset.hash != "" {
			w.Header().Set("ETag", asset.hash)
		}
		if mimeType != "" {
			w.Header().Set("Content-Type", mimeType)
		}
		if requestMatchesETag(r.Header, asset.hash) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(asset.raw)
	}
}
