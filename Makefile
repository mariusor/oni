SHELL := sh
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

PROJECT_NAME ?= oni
APP_HOSTNAME ?= $(PROJECT_NAME)
ENV ?= dev
VERSION ?= HEAD

LDFLAGS ?= -X git.sr.ht/~mariusor/oni.Version=$(VERSION)
BUILDFLAGS ?= -a -ldflags '$(LDFLAGS)' -tags "$(TAGS)"
TEST_FLAGS ?= -count=1

UPX = upx
YARN ?= yarn
GO ?= go

GO_SOURCES := $(wildcard ./*.go)
TS_SOURCES := $(wildcard src/js/*)
CSS_SOURCES := $(wildcard src/css/*)
SVG_SOURCES := $(wildcard src/*.svg)
ROBOTS_TXT := $(wildcard src/robots.txt)

ONI_BIN_SOURCES := $(wildcard ./cmd/oni/*.go)
CTL_BIN_SOURCES := $(wildcard ./cmd/ctl/*.go)

TAGS := $(ENV)

export CGO_ENABLED=0
export GOEXPERIMENT=greenteagc

ifeq ($(shell git describe --always > /dev/null 2>&1 ; echo $$?), 0)
	BRANCH=$(shell git rev-parse --abbrev-ref HEAD | tr '/' '-')
	HASH=$(shell git rev-parse --short HEAD)
	VERSION ?= $(shell printf "%s-%s" "$(BRANCH)" "$(HASH)")
endif
ifeq ($(shell git describe --tags > /dev/null 2>&1 ; echo $$?), 0)
	VERSION ?= $(shell git describe --tags | tr '/' '-')
endif

ifneq ($(ENV), dev)
	LDFLAGS += -s -w -extldflags "-static"
	BUILDFLAGS += -trimpath
endif

BUILD := $(GO) build $(BUILDFLAGS)
TEST := $(GO) test $(BUILDFLAGS)

.PHONY: all assets cert clean test coverage download help

.DEFAULT_GOAL := help

help: ## Help target that shows this message.
	@sed -rn 's/^([^:]+):.*[ ]##[ ](.+)/\1:\2/p' $(MAKEFILE_LIST) | column -ts: -l2

all: $(PROJECT_NAME) $(PROJECT_NAME)ctl

download: go.sum ## Downloads dependencies and tidies the go.mod file.

go.sum: go.mod
	$(GO) mod tidy

$(PROJECT_NAME): bin/$(PROJECT_NAME) ## Builds the ONI service binary.
bin/$(PROJECT_NAME): go.sum $(ONI_BIN_SOURCES) $(GO_SOURCES) assets
	$(BUILD) -o $@ ./cmd/oni
ifneq (,$(findstring $(ENV), "prod qa"))
	$(UPX) -q --mono --no-progress --best $@ || true
endif

$(PROJECT_NAME)ctl: bin/$(PROJECT_NAME)ctl ## Builds the ONI control binary.
bin/$(PROJECT_NAME)ctl: go.sum $(CTL_BIN_SOURCES) $(GO_SOURCES)
	$(BUILD) -o $@ ./cmd/ctl
ifneq (,$(findstring $(ENV), "prod qa"))
	$(UPX) -q --mono --no-progress --best $@ || true
endif

yarn.lock:
	$(YARN) install

assets: yarn.lock ## Builds the static assets.
	go generate -v assets.go

static/main.js: $(TS_SOURCES) yarn.lock
	go generate -v assets.go

static/main.css: $(CSS_SOURCES) yarn.lock
	go generate -v assets.go

static/icons.svg: $(SVG_SOURCES)
	go generate -v assets.go

static/robots.txt: $(ROBOTS_TXT)
	go generate -v assets.go

clean: ## Cleanup the build workspace.
	-$(RM) bin/*
	-$(RM) -r ./node_modules yarn.lock
	-$(RM) static/*.{js,css,map,svg,txt}
	-$(RM) $(PROJECT_NAME).coverprofile
	$(GO) clean
	$(MAKE) -C images $@

images: ## Build podman images.
	$(MAKE) -C images $@

test: TEST_TARGET := ./...
test: go.sum ## Run unit tests for the service.
	$(TEST) $(TEST_FLAGS) $(TEST_TARGET)

coverage: TEST_TARGET := .
coverage: TEST_FLAGS += -covermode=count -coverprofile $(PROJECT_NAME).coverprofile
coverage: test

cert: bin/$(APP_HOSTNAME).pem ## Create a certificate.
bin/$(APP_HOSTNAME).pem: bin/$(APP_HOSTNAME).key bin/$(APP_HOSTNAME).crt
bin/$(APP_HOSTNAME).key bin/$(APP_HOSTNAME).crt:
	./images/gen-certs.sh ./bin/$(APP_HOSTNAME)
