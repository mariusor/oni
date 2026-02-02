//go:build !ssh

package oni

import m "git.sr.ht/~mariusor/servermux"

func initSSHServer(app *Control) (m.Server, error) {
	return nil, nil
}
