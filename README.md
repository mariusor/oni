# Oni

Is a single instance ActivityPub server compatible with Mastodon and the rest of the Fediverse.


## Getting the source

```sh
$ git clone https://git.sr.ht/~mariusor/oni
$ cd oni
```

## Features

Posting to an ONI instance is done using Client to Server ActivityPub.

The application supports text posts, image, audio and video uploads.

## Compiling

```sh
# We need to download the JavaScript dependencies, using yarn or npm
# yarn install
# npm install 
$ go mod tidy
$ go generate frontend.go
$ go build -trimpath -a -ldflags '-s -w -extldflags "-static"' -o $(go env GOPATH)/bin/oni ./cmd/oni/main.go
```

## Run server

```sh
# -listen can be a tcp socket, a domain socket, or the magic string "systemd"
# The later should be used if running as a systemd service with socket activation
$ oni -listen 127.0.4.2:4567 -path ~/.cache/oni 
```

## Add root actor 

```sh
# Creates an actor for URL https://johndoe.example.com and adds an OAuth2 client application with name 'johndoe.example.com'
# with OAuth2 client password 'SuperSecretOAuth2ClientPassword'. 
# The --with-token boolean flag can make the application generate an Authorization header containing a Bearer token 
# usable directly in an ActivityPub client.
$ onictl actor add --pw SuperSecretOAuth2ClientPassword https://johndoe.example.com
```
