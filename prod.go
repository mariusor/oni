//go:build !dev

package oni

import "github.com/go-ap/errors"

func init() {
	errors.IncludeBacktrace = false
}
