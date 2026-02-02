//go:build ssh

package oni

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"math/rand/v2"
	"strconv"
	"strings"

	"git.sr.ht/~mariusor/lw"
	"git.sr.ht/~mariusor/mask"
	"git.sr.ht/~mariusor/motley"
	m "git.sr.ht/~mariusor/servermux"
	"git.sr.ht/~mariusor/storage-all"
	"github.com/alecthomas/kong"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/ssh"
	"github.com/charmbracelet/wish"
	bm "github.com/charmbracelet/wish/bubbletea"
	"github.com/charmbracelet/wish/logging"
	vocab "github.com/go-ap/activitypub"
	"github.com/muesli/termenv"
	"golang.org/x/crypto/ed25519"
	gossh "golang.org/x/crypto/ssh"
)

func SSHAuthPw(f *oni) ssh.PasswordHandler {
	return func(ctx ssh.Context, pw string) bool {
		acc, ok := pwCheck(f, ctx.User(), []byte(pw))
		if !ok {
			f.Logger.WithContext(lw.Ctx{"iri": ctx.User(), "pw": mask.S(pw)}).Warnf("failed password authentication")
			return false
		}

		ctx.SetValue("actor", acc)
		return true
	}
}

func SSHAuthPublicKey(f *oni) ssh.PublicKeyHandler {
	return func(ctx ssh.Context, key ssh.PublicKey) bool {
		acc, ok := publicKeyCheck(f, ctx.User(), key)
		if !ok {
			f.Logger.WithContext(lw.Ctx{"iri": ctx.User()}).Warnf("failed public key authentication")
			return false
		}

		ctx.SetValue("actor", acc)
		return true
	}
}

var kongDefaultVars = kong.Vars{
	"version":    Version,
	"name":       AppName,
	"defaultEnv": "dev",
}

type SSH struct{}

func runSSHCommand(f *oni, s ssh.Session) error {
	args := s.Command()
	// NOTE(marius): this is not an interactive session, try to run the received command
	if len(args) == 0 {
		return fmt.Errorf("PTY is not interactive and no command was sent")
	}
	ctl := new(oni)
	ctl.Logger = f.Logger
	//ctl.Service = f.Service
	//ctl.ServicePrivateKey = f.ServicePrivateKey
	ctl.Storage = f.Storage
	ctl.pw = f.pw
	ctl.a = f.a
	//ctl.out = s
	//ctl.in = s
	//ctl.err = s.Stderr()

	cmd := new(SSH)
	kongDefaultVars["name"] = "ONI SSH"
	k, err := kong.New(
		cmd,
		kong.UsageOnError(),
		kong.Name(kongDefaultVars["name"]),
		kong.Description("${name} (version ${version}) ${URL}"),
		kong.Writers(s, s.Stderr()),
		kong.Exit(func(_ int) {}),
		kongDefaultVars,
	)
	if err != nil {
		return err
	}
	ctx, err := k.Parse(args)
	if err != nil {
		_ = k.Errorf("%s\n", err)
		return err
	}

	if err = ctx.Run(ctl); err != nil {
		_ = k.Errorf("%s\n", err)
		return err
	}
	_ = k.Printf("OK\n")
	return nil
}

func MainTui(f *oni) wish.Middleware {
	teaHandler := func(s ssh.Session) *tea.Program {
		lwCtx := lw.Ctx{}
		acc, ok := s.Context().Value("actor").(*vocab.Actor)
		if ok {
			lwCtx["actor"] = acc.GetLink()
		}

		_, _, active := s.Pty()
		lwCtx["active"] = active

		f.Logger.WithContext(lwCtx).Infof("opening ssh session")
		// NOTE(marius): this is not an interactive session, try to run the received command
		if len(s.Command()) > 0 {
			if err := runSSHCommand(f, s); err != nil {
				_ = s.Exit(1)
			}
			_ = s.Exit(0)
			return nil
		}

		if !active {
			if len(s.Command()) == 0 {
				_, _ = fmt.Fprintln(s.Stderr(), "PTY is not interactive and no command was sent")
				_ = s.Exit(1)
			}
			return nil
		}

		// Set the global color profile to ANSI256 for Docker compatibility
		lipgloss.SetColorProfile(termenv.ANSI256)

		fullStorage, ok := f.Storage.(storage.FullStorage)
		if !ok {
			_, _ = fmt.Fprintf(s.Stderr(), "Error: storage backend %T is not compatible with Motley", f.Storage)
			_ = s.Exit(1)
		}
		service, err := motley.FedBOX(f.Logger.WithContext(lwCtx), motley.Storage{
			FullStorage: fullStorage,
			Root:        acc,
		})
		if err != nil {
			_, _ = fmt.Fprintf(s.Stderr(), "Error: %s", err)
			_ = s.Exit(1)
		}
		return tea.NewProgram(motley.Model(service), tea.WithFPS(60), tea.WithInput(s), tea.WithOutput(s), tea.WithAltScreen())
	}

	return bm.MiddlewareWithProgramHandler(teaHandler, termenv.ANSI256)
}

func pwCheck(f *oni, id string, pw []byte) (*vocab.Actor, bool) {
	maybeActor, err := f.Storage.Load(vocab.IRI(id))
	if err != nil {
		return nil, false
	}
	actor, err := vocab.ToActor(maybeActor)
	if err != nil {
		return nil, false
	}
	err = f.Storage.PasswordCheck(actor.ID, pw)
	if err != nil {
		return nil, false
	}
	return actor, true
}

func publicKeyCheck(f *oni, id string, sessKey ssh.PublicKey) (*vocab.Actor, bool) {
	actorIRI := vocab.IRI(id)
	maybeActor, err := f.Storage.Load(actorIRI)
	if err != nil {
		// TODO(marius): see what we can do about allowing access when server in maintenance
		return nil, false
	}
	actorKey, err := f.Storage.LoadKey(actorIRI)
	if err != nil {
		return nil, false
	}
	var key crypto.PublicKey
	var actor *vocab.Actor
	err = vocab.OnActor(maybeActor, func(act *vocab.Actor) error {
		servicePubKey := act.PublicKey.PublicKeyPem
		actor = act
		if pubBytes, _ := pem.Decode([]byte(servicePubKey)); pubBytes != nil {
			key, _ = x509.ParsePKIXPublicKey(pubBytes.Bytes)
			if key != nil {
				return nil
			}
			key, err = x509.ParsePKCS1PublicKey(pubBytes.Bytes)
		}
		return err
	})
	if err != nil {
		return nil, false
	}
	sessPubKey, ok := sessKey.(gossh.CryptoPublicKey)
	if !ok {
		return nil, false
	}
	switch prv := actorKey.(type) {
	case *rsa.PrivateKey:
		if !prv.PublicKey.Equal(key) {
			f.Logger.WithContext(lw.Ctx{"actor": actorIRI}).Warnf("Actor's public key doesn't match the private key any more")
		}
		return actor, prv.PublicKey.Equal(sessPubKey.CryptoPublicKey())
	case *ecdsa.PrivateKey:
		if !prv.PublicKey.Equal(key) {
			f.Logger.WithContext(lw.Ctx{"actor": actorIRI}).Warnf("Actor's public key doesn't match the private key any more")
		}
		return actor, prv.PublicKey.Equal(sessPubKey.CryptoPublicKey())
	case ed25519.PrivateKey:
		pub, ok := prv.Public().(ed25519.PublicKey)
		if !pub.Equal(key) {
			f.Logger.WithContext(lw.Ctx{"actor": actorIRI}).Warnf("Actor's public key doesn't match the private key any more")
		}
		return actor, ok && pub.Equal(sessPubKey.CryptoPublicKey())
	default:
		return nil, false
	}
}

var defaultSSHPort = 1024 + rand.IntN(65536-1024)

type justPrintLogger func(string, ...any)

func (c justPrintLogger) Printf(f string, v ...interface{}) {
	c(strings.TrimSpace(f), v...)
}

func initSSHServer(ctl *oni) (m.Server, error) {
	initFns := []m.SSHSetFn{
		wish.WithPublicKeyAuth(SSHAuthPublicKey(ctl)),
		wish.WithPasswordAuth(SSHAuthPw(ctl)),
		wish.WithMiddleware(
			logging.MiddlewareWithLogger(justPrintLogger(ctl.Logger.Debugf)),
			MainTui(ctl),
		),
	}

	sshListen := "127.0.0.1:" + strconv.Itoa(defaultSSHPort)
	if strings.Index(ctl.Listen, ":") >= 0 {
		listenPices := strings.Split(ctl.Listen, ":")
		var listenHost string
		var listenPort int
		if len(listenPices) == 1 || len(listenPices) == 2 {
			if len(listenPices) == 1 {
				if maybePort, err := strconv.Atoi(listenPices[1]); err == nil {
					listenPort = maybePort + 1
				}
			}
			if len(listenPices) == 2 {
				listenHost = listenPices[0]
				if maybePort, err := strconv.Atoi(listenPices[1]); err == nil {
					listenPort = maybePort + 1
				}
			}
			sshListen = listenHost + ":" + strconv.Itoa(listenPort)
		}
	}
	initFns = append(initFns, wish.WithAddress(sshListen))
	ctl.Logger.WithContext(lw.Ctx{"socket": sshListen}).Debugf("Accepting SSH requests")
	//if ctl.ServicePrivateKey != nil {
	//	// NOTE(marius): use the service private key as a host key
	//	if prvEnc, err := x509.MarshalPKCS8PrivateKey(ctl.ServicePrivateKey); err == nil {
	//		r := pem.Block{Type: "PRIVATE KEY", Bytes: prvEnc}
	//		initFns = append(initFns, wish.WithHostKeyPEM(pem.EncodeToMemory(&r)))
	//	}
	//}
	return m.SSHServer(initFns...)
}
