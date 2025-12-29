//go:build !(prod || qa)

package oni

import "github.com/go-ap/errors"

func init() {
	errors.SetIncludeBacktrace(false)
}

const IsDev = true
