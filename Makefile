SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:

PROJECT_NAME := oni
ENV ?= dev
LDFLAGS =
BUILDFLAGS ?= -a -ldflags '$(LDFLAGS)'
TEST_FLAGS ?= -count=1 -v

APPSOURCES := $(wildcard ./*.go)
TS_SOURCES := $(wildcard src/js/*)
CSS_SOURCES := $(wildcard src/css/*)
SVG_SOURCES := $(wildcard src/*.svg)

GO ?= go
YARN ?= yarn

export CGO_ENABLED=0
export VERSION=HEAD

TAGS := $(ENV)

ifneq ($(ENV), dev)
	LDFLAGS += -s -w -extldflags "-static"
	BUILDFLAGS += -trimpath
endif

BUILD := $(GO) build $(BUILDFLAGS)
TEST := $(GO) test $(BUILDFLAGS)

.PHONY: all assets test coverage download clean

all: oni ctl

download:
	$(GO) mod download all
	$(GO) mod tidy

oni: go.mod bin/oni
bin/oni: cmd/oni/main.go $(APPSOURCES) go.mod static/main.css static/main.js
	$(BUILD) -tags "$(TAGS)" -o $@ cmd/oni/main.go

ctl: go.mod bin/ctl
bin/ctl: cmd/ctl/main.go $(APPSOURCES) go.mod
	$(BUILD) -tags "$(TAGS)" -o $@ cmd/ctl/main.go

fdeps:
	$(YARN) install

assets: static/main.css static/main.js static/icons.svg

static/main.js: fdeps $(TS_SOURCES)
	go generate -v frontend.go

static/main.css: $(CSS_SOURCES)
	go generate -v frontend.go

static/icons.svg: $(SVG_SOURCES)
	go generate -v frontend.go

test: TEST_TARGET := ./...
test:
	$(TEST) $(TEST_FLAGS) $(TEST_TARGET)

coverage: TEST_TARGET := .
coverage: TEST_FLAGS += -covermode=count -coverprofile $(PROJECT_NAME).coverprofile
coverage: test

clean:
	rm -f static/*.js static/*.css static/*.map static/*.svg
