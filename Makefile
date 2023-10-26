SHELL := bash
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:

PROJECT_NAME ?= oni
ENV ?= dev
LDFLAGS =

GO_SOURCES := $(wildcard ./*.go)
TS_SOURCES := $(wildcard src/js/*)
CSS_SOURCES := $(wildcard src/css/*)
SVG_SOURCES := $(wildcard src/*.svg)

GO ?= go
YARN ?= yarn

export CGO_ENABLED=0
export VERSION=HEAD

TAGS := $(ENV)

BUILDFLAGS ?= -tags "$(TAGS)"
TEST_FLAGS ?= -count=1 -v

ifneq ($(ENV), dev)
	LDFLAGS += -s -w -extldflags "-static"
	BUILDFLAGS += -ldflags '$(LDFLAGS)' -trimpath
endif

BUILD := $(GO) build $(BUILDFLAGS)
TEST := $(GO) test $(BUILDFLAGS)

.PHONY: all assets test coverage download clean

all: $(PROJECT_NAME) ctl

download:
	$(GO) mod download all
	$(GO) mod tidy
	$(GO) get oni

oni: go.mod bin/$(PROJECT_NAME)
bin/$(PROJECT_NAME): cmd/oni/main.go $(GO_SOURCES) go.mod static/main.css static/main.js
	$(BUILD) -o $@ cmd/oni/main.go

ctl: go.mod bin/ctl
bin/ctl: cmd/ctl/main.go $(GO_SOURCES) go.mod
	$(BUILD) -o $@ cmd/ctl/main.go

fdeps:
	$(YARN) install

assets: static/main.css static/main.js static/icons.svg

generate:
	go generate -v assets.go

static/main.js: fdeps $(TS_SOURCES) generate

static/main.css: $(CSS_SOURCES) generate

static/icons.svg: $(SVG_SOURCES) generate

test: TEST_TARGET := ./...
test:
	$(TEST) $(TEST_FLAGS) $(TEST_TARGET)

coverage: TEST_TARGET := .
coverage: TEST_FLAGS += -covermode=count -coverprofile $(PROJECT_NAME).coverprofile
coverage: test

clean:
	rm -f bin/{$(PROJECT_NAME),ctl} \
	      static/*.{js,css,map,svg} \
	      $(PROJECT_NAME).coverprofile
