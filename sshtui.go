//go:build ssh && tui

package oni

import (
	"fmt"

	tea "charm.land/bubbletea/v2"
	"git.sr.ht/~mariusor/motley"
	"github.com/charmbracelet/colorprofile"
	"github.com/charmbracelet/ssh"
	vocab "github.com/go-ap/activitypub"
)

func wishTUI(s ssh.Session, o *oni) *tea.Program {
	env := "prod"
	if IsDev {
		env = "dev"
	}
	acc, ok := s.Context().Value("actor").(*vocab.Actor)
	if !ok {
		_, _ = fmt.Fprintln(s.Stderr(), "invalid actor for TUI")
		_ = s.Exit(1)
		return nil
	}
	opts := []tea.ProgramOption{tea.WithInput(s), tea.WithOutput(s), tea.WithColorProfile(colorprofile.ANSI256)}
	st := motley.WithStore(o.Storage, acc, env)
	return tea.NewProgram(motley.Model(o.Logger, st), opts...)
}
