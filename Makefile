SHELL := sh
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

PROJECT_NAME ?= oni
ENV ?= dev

LDFLAGS ?= -X main.version=$(VERSION)
BUILDFLAGS ?= -a -ldflags '$(LDFLAGS)' -tags "$(TAGS)"
TEST_FLAGS ?= -count=1 -v
GO ?= go
YARN ?= yarn

GO_SOURCES := $(wildcard ./*.go)
TS_SOURCES := $(wildcard src/js/*)
CSS_SOURCES := $(wildcard src/css/*)
SVG_SOURCES := $(wildcard src/*.svg)

TAGS := $(ENV)

export CGO_ENABLED=0

ifneq ($(ENV), dev)
	LDFLAGS += -s -w -extldflags "-static"
	BUILDFLAGS += -trimpath
endif

ifeq ($(shell git describe --always > /dev/null 2>&1 ; echo $$?), 0)
	BRANCH=$(shell git rev-parse --abbrev-ref HEAD | tr '/' '-')
	HASH=$(shell git rev-parse --short HEAD)
	VERSION ?= $(shell printf "%s-%s" "$(BRANCH)" "$(HASH)")
endif
ifeq ($(shell git describe --tags > /dev/null 2>&1 ; echo $$?), 0)
	VERSION ?= $(shell git describe --tags | tr '/' '-')
endif

BUILD := $(GO) build $(BUILDFLAGS)
TEST := $(GO) test $(BUILDFLAGS)

.PHONY: all assets test coverage download clean

all: $(PROJECT_NAME) ctl

download: go.sum

go.sum: go.mod
	$(GO) mod download all
	$(GO) mod tidy
	$(GO) get oni

$(PROJECT_NAME): go.mod bin/$(PROJECT_NAME)
bin/$(PROJECT_NAME): cmd/oni/main.go $(GO_SOURCES) go.mod go.sum static/main.css static/main.js static/icons.svg
	$(BUILD) -o $@ cmd/oni/main.go

ctl: bin/ctl
bin/ctl: go.mod go.sum cmd/ctl/main.go $(GO_SOURCES)
	$(BUILD) -o $@ cmd/ctl/main.go

yarn.lock:
	$(YARN) install

assets: static/main.css static/main.js static/icons.svg

static/main.js: $(TS_SOURCES) yarn.lock
	go generate -v assets.go

static/main.css: $(CSS_SOURCES) yarn.lock
	go generate -v assets.go

static/icons.svg: $(SVG_SOURCES) yarn.lock
	go generate -v assets.go

images:
	$(MAKE) -C images $@

clean:
	-$(RM) bin/*
	-$(RM) ./node_modules yarn.lock
	-$(RM) static/*.{js,css,map,svg}
	-$(RM) $(PROJECT_NAME).coverprofile
	$(GO) build clean
	$(MAKE) -C images $@

test: TEST_TARGET := ./...
test:
	$(TEST) $(TEST_FLAGS) $(TEST_TARGET)

coverage: TEST_TARGET := .
coverage: TEST_FLAGS += -covermode=count -coverprofile $(PROJECT_NAME).coverprofile
coverage: test
