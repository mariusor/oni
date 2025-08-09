package oni

import (
	"bytes"
	"crypto/md5"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"time"

	vocab "github.com/go-ap/activitypub"
	"github.com/go-ap/errors"
	"github.com/nfnt/resize"
	"github.com/sergeymakinen/go-ico"
	"github.com/srwiley/oksvg"
	"github.com/srwiley/rasterx"
)

func svgDecode(in io.Reader) (image.Image, error) {
	icon, err := oksvg.ReadIconStream(in)
	if err != nil {
		return nil, err
	}

	w := int(icon.ViewBox.W)
	h := int(icon.ViewBox.H)

	icon.SetTarget(0, 0, icon.ViewBox.W, icon.ViewBox.H)

	rgba := image.NewRGBA(image.Rect(0, 0, w, h))
	icon.Draw(rasterx.NewDasher(w, h, rasterx.NewScannerGV(w, h, rgba, rgba.Bounds())), 1)

	return rgba, nil
}

const maxFaviconSize = 192

func (o *oni) ServeFavIcon() http.HandlerFunc {
	favicons := make(map[string][]byte)

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			o.Error(errors.MethodNotAllowedf("invalid %s", r.Method)).ServeHTTP(w, r)
			return
		}

		authActor, err := loadBaseActor(o, r)
		if err != nil {
			o.Error(err).ServeHTTP(w, r)
			return
		}

		if vocab.IsNil(authActor) {
			o.Error(errors.NotFoundf("not found")).ServeHTTP(w, r)
			return
		}

		it := authActor.Icon
		if vocab.IsNil(it) {
			o.Error(errors.NotFoundf("not found")).ServeHTTP(w, r)
			return
		}
		if vocab.IsIRI(it) || (vocab.IsObject(it) && len(vocab.ContentOf(it)) == 0) {
			if it, err = o.Storage.Load(it.GetLink()); err != nil {
				o.Error(err).ServeHTTP(w, r)
				return
			}
		}
		if vocab.IsNil(it) {
			o.Error(errors.NotFoundf("not found")).ServeHTTP(w, r)
			return
		}

		f := bytes.Buffer{}
		contentType, updatedAt, err := binDataFromItem(it, &f)
		if err != nil {
			o.Error(err).ServeHTTP(w, r)
			return
		}
		var orig image.Image
		switch {
		case contentType.Matches(imageJpeg):
			orig, err = jpeg.Decode(&f)
		case contentType.Matches(imagePng):
			orig, err = png.Decode(&f)
		case contentType.Matches(imageGif):
			orig, err = gif.Decode(&f)
		case contentType.Matches(imageSvg):
			orig, err = svgDecode(&f)
		default:
		}
		if err != nil {
			o.Error(errors.NotFoundf("failed to open image: %s", err)).ServeHTTP(w, r)
			return
		}

		if m := orig.Bounds().Max; m.X > maxFaviconSize || m.Y > maxFaviconSize {
			var sw uint = maxFaviconSize
			var sh uint = 0
			if m.X < m.Y {
				// NOTE(marius): if the height is larger than the width, we use that as the main resize axis
				sw = 0
				sh = maxFaviconSize
			}
			orig = resize.Resize(sw, sh, orig, resize.MitchellNetravali)
		}

		raw := make([]byte, 0)
		buf := bytes.NewBuffer(raw)
		if err = ico.Encode(buf, orig); err != nil {
			o.Error(errors.NotFoundf("failed to create favicon: %s", err)).ServeHTTP(w, r)
			return
		}

		raw = buf.Bytes()
		eTag := fmt.Sprintf(`"%2x"`, md5.Sum(raw))
		favicons[eTag] = raw

		w.Header().Set("Content-Type", contentType.MIME())
		w.Header().Set("Content-Length", fmt.Sprintf("%d", len(raw)))
		w.Header().Set("Vary", "Accept")
		w.Header().Set("ETag", eTag)
		w.Header().Set("Cache-Control", fmt.Sprintf("public, max-age=%d", int(objectCacheDuration.Seconds())))
		if !updatedAt.IsZero() {
			w.Header().Set("Last-Modified", updatedAt.Format(time.RFC1123))
		}

		status := http.StatusOK
		uaHasItem := requestMatchesETag(r.Header, eTag) || requestMatchesLastModified(r.Header, updatedAt)
		if uaHasItem {
			status = http.StatusNotModified
		}

		w.WriteHeader(status)
		if r.Method == http.MethodGet && !uaHasItem {
			_, _ = w.Write(raw)
		}
	}
}
