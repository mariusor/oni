package oni

import (
	"bytes"
	"net/http"
	"time"

	"git.sr.ht/~mariusor/lw"
	bfmt "git.sr.ht/~mariusor/sizefmt"
	ct "github.com/elnormous/contenttype"
	"github.com/go-chi/chi/v5/middleware"
)

func Log(l lw.Logger) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			entry := req(l, r)
			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)

			buf := bytes.NewBuffer(make([]byte, 0, 512))
			ww.Tee(buf)

			t1 := time.Now().Truncate(time.Millisecond).UTC()
			defer func() {
				entry.Write(ww.Status(), ww.BytesWritten(), ww.Header(), time.Since(t1), nil)
			}()

			next.ServeHTTP(ww, middleware.WithLogEntry(r, entry))
		}
		return http.HandlerFunc(fn)
	}
}

type reqLogger struct {
	lw.Logger
}

func (r reqLogger) Write(status, bytes int, _ http.Header, elapsed time.Duration, _ interface{}) {
	ctx := lw.Ctx{
		"st":   status,
		"size": bfmt.Size(bytes),
	}
	if elapsed > 0 {
		ctx["elapsed"] = elapsed
	}

	var logFn func(string, ...any)

	switch {
	case status <= 0:
		logFn = r.Logger.WithContext(ctx).Errorf
	case status < 400: // for codes in 100s, 200s, 300s
		logFn = r.Logger.WithContext(ctx).Debugf
	case status < 500:
		logFn = r.Logger.WithContext(ctx).Warnf
	default:
		logFn = r.Logger.WithContext(ctx).Errorf
	}
	logFn(http.StatusText(status))
}

func (r reqLogger) Panic(v interface{}, stack []byte) {
	r.Logger.WithContext(lw.Ctx{"panic": v}).Tracef("")
}

var allMediaTypes = []ct.MediaType{applicationJsonLD, applicationJsonActivity, applicationJson, html, audioAny, videoAny, imageAny, pdfDocument}

func req(l lw.Logger, r *http.Request) reqLogger {
	ctx := lw.Ctx{
		"method": r.Method,
		"iri":    irif(r),
	}

	if acc := r.Header.Get("Accept"); acc != "" {
		want, _, _ := ct.GetAcceptableMediaTypeFromHeader(acc, allMediaTypes)
		switch {
		case want.MatchesAny(applicationJsonActivity):
			ctx["wants"] = "activity-pub"
		case want.MatchesAny(applicationJsonLD):
			ctx["wants"] = "json-ld"
		case want.MatchesAny(applicationJson):
			ctx["wants"] = "json"
		case want.Matches(html):
			ctx["wants"] = "html"
		default:
			ctx["wants"] = want.Type
		}
	}
	if ua := r.Header.Get("User-Agent"); ua != "" {
		ctx["ua"] = ua
	}

	return reqLogger{Logger: l.WithContext(ctx)}
}
