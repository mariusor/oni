//go:build ssh && !tui

package oni

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/ssh"
)

func wishTUI(s ssh.Session, _ *oni) *tea.Program {
	_, _ = fmt.Fprintln(s.Stderr(), "This server does not support an interactive interface")
	_ = s.Exit(1)
	return nil
}
