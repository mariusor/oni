# Oni

Is a single instance ActivityPub server compatible with Mastodon and the rest of the Fediverse.


## Getting the source

```sh
$ git clone https://git.sr.ht/~mariusor/oni
$ cd oni
```

## Compiling

```sh
$ go mod tidy
$ go build -trimpath -a -ldflags '-s -w -extldflags "-static"' -o $(go env GOPATH)/bin/oni ./cmd/oni/main.go
```

## Run

```sh
# -listen can be a tcp socket, a domain socket, or the magic string "systemd"
# The later should be used if running as a systemd service with socket activation
$ oni -listen 127.0.4.2:4567 -path ~/.cache/oni https://social.example.com
```
