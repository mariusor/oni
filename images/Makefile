SHELL := sh
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

ENV ?= dev
APP_HOSTNAME ?= oni
PORT ?= 4000
TAG ?= $(ENV)
VERSION ?= HEAD

TAG_CMD=podman tag
PUSH_CMD=podman push

ifeq ($(shell git describe --always > /dev/null 2>&1 ; echo $$?), 0)
	BRANCH=$(shell git rev-parse --abbrev-ref HEAD | tr '/' '-')
	HASH=$(shell git rev-parse --short HEAD)
	VERSION = $(shell printf "%s-%s" "$(BRANCH)" "$(HASH)")
endif
ifeq ($(shell git describe --tags > /dev/null 2>&1 ; echo $$?), 0)
	VERSION = $(shell git describe --tags | tr '/' '-')
endif

.PHONY: clean images cert build builder push

build:
	ENV=$(ENV) VERSION=$(VERSION) PORT=$(PORT) HOSTNAME=$(APP_HOSTNAME) ./image.sh $(APP_HOSTNAME)/app:$(TAG)

push: build
	$(TAG_CMD) "$(APP_HOSTNAME)/app:$(TAG)" "quay.io/go-ap/oni:$(TAG)"
	$(PUSH_CMD) "quay.io/go-ap/oni:$(TAG)"
ifeq ($(TAG),dev)
	$(TAG_CMD) "$(APP_HOSTNAME)/app:$(TAG)" "quay.io/go-ap/oni:latest" || true
	$(PUSH_CMD) "quay.io/go-ap/oni:latest" || true
endif
ifneq ($(VERSION),HEAD)
	$(TAG_CMD) "$(APP_HOSTNAME)/app:$(TAG)" "quay.io/go-ap/oni:$(VERSION)-$(TAG)" || true
	$(PUSH_CMD) "quay.io/go-ap/oni:$(VERSION)-$(TAG)" || true
endif
