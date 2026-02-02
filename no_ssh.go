//go:build !ssh

package oni

import m "git.sr.ht/~mariusor/servermux"

func initSSHServer(app *oni) (m.Server, error) {
	return nil, nil
}
