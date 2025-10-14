//go:build prod

package oni

import "github.com/go-ap/errors"

func init() {
	errors.IncludeBacktrace = false
}

const IsDev = false
