package xdg

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	XdgRuntimeDir = "XDG_RUNTIME_DIR"
	XdgDataDir    = "XDG_DATA_HOME"
	XdgHome       = "HOME"
)

var BaseRuntimeDir = "/var/run"

func DataPath(appName string) string {
	dh := os.Getenv(XdgDataDir)
	if dh == "" {
		if userPath := os.Getenv(XdgHome); userPath == "" {
			dh = "/usr/share"
		} else {
			dh = filepath.Join(userPath, ".local/share")
		}
	}
	return filepath.Join(dh, appName)
}

func RuntimePath() string {
	path := BaseRuntimeDir
	if runtimeDir := os.Getenv(XdgRuntimeDir); runtimeDir != "" {
		path = runtimeDir
	}
	return path
}

func PidPath(appName string) string {
	return filepath.Join(RuntimePath(), strings.ToLower(appName)+".pid")
}

func CleanPid(appName string) error {
	appPid := PidPath(appName)
	if _, err := os.Stat(appPid); err != nil {
		return nil
	}
	return os.RemoveAll(appPid)
}

func WritePid(appName string) error {
	pid := os.Getpid()
	raw := make([]byte, 0)
	raw = strconv.AppendUint(raw, uint64(pid), 10)

	pidPath := PidPath(appName)
	if err := os.MkdirAll(filepath.Dir(pidPath), 0o700); err != nil {
		return err
	}

	return os.WriteFile(pidPath, raw, 0o600)
}

func ReadPid(appName string) (int, error) {
	raw, err := os.ReadFile(PidPath(appName))
	if err != nil {
		return -1, err
	}

	pid, err := strconv.ParseUint(string(raw), 10, 32)
	if err != nil {
		return -1, err
	}
	return int(pid), nil
}
