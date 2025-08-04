package oni

import (
	"bytes"
	"io"
	"net/http"
	"time"

	"git.sr.ht/~mariusor/lw"
	bfmt "git.sr.ht/~mariusor/sizefmt"
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

			t1 := time.Now()
			defer func() {
				var respBody []byte
				if ww.Status() >= 400 {
					respBody, _ = io.ReadAll(buf)
				}
				entry.Write(ww.Status(), ww.BytesWritten(), ww.Header(), time.Since(t1), respBody)
			}()

			next.ServeHTTP(ww, middleware.WithLogEntry(r, entry))
		}
		return http.HandlerFunc(fn)
	}
}

type reqLogger struct {
	lw.Logger
}

func (r reqLogger) Write(status, bytes int, header http.Header, elapsed time.Duration, extra interface{}) {
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
		logFn = r.Logger.WithContext(ctx).Infof
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

func req(l lw.Logger, r *http.Request) reqLogger {
	ctx := lw.Ctx{
		"method": r.Method,
		"iri":    irif(r),
	}

	if acc := r.Header.Get("Accept"); acc != "" {
		ctx["accept"] = acc
	}
	if ua := r.Header.Get("User-Agent"); ua != "" {
		ctx["ua"] = ua
	}

	return reqLogger{Logger: l.WithContext(ctx)}
}
