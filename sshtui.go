//go:build ssh && tui

package oni

import (
	"fmt"
	"io"
	"log/slog"

	tea "charm.land/bubbletea/v2"
	"charm.land/wish/v2/bubbletea"
	"git.sr.ht/~mariusor/motley"
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
	st := motley.WithStore(o.Storage, acc, env)
	ll := slog.New(slog.NewTextHandler(io.Discard, nil))
	initFns := []tea.ProgramOption{tea.WithoutSignalHandler()}
	initFns = append(initFns, bubbletea.MakeOptions(s)...)
	return tea.NewProgram(motley.Model(ll, st), initFns...)
}
