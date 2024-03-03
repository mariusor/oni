SHELL := sh
.ONESHELL:
.SHELLFLAGS := -eu -o pipefail -c
.DELETE_ON_ERROR:
MAKEFLAGS += --warn-undefined-variables
MAKEFLAGS += --no-builtin-rules

ENV ?= prod
APP_HOSTNAME ?= oni
PORT ?= 4000
TAG ?= $(ENV)
VERSION ?= HEAD

BUILD_CMD=buildah bud
RUN_CMD=podman run
TAG_CMD=podman tag
PUSH_CMD=podman push

.PHONY: clean build builder run push cert

$(APP_HOSTNAME).pem:
	./gen-certs.sh $(APP_HOSTNAME)

cert: $(APP_HOSTNAME).pem

clean:
	@-$(RM) $(APP_HOSTNAME).{key,crt,pem}

builder:
	./build.sh .. oni/builder

build:
	ENV=$(ENV) VERSION=$(VERSION) PORT=$(PORT) HOSTNAME=$(APP_HOSTNAME) ./image.sh $(APP_HOSTNAME)/app:$(TAG)

push: build
	$(TAG_CMD) $(APP_HOSTNAME)/app:$(TAG) quay.io/go-ap/oni:$(TAG)
	$(PUSH_CMD) quay.io/go-ap/oni:$(TAG)
ifeq ($(TAG),dev)
	$(TAG_CMD) $(APP_HOSTNAME)/app:$(TAG) quay.io/go-ap/oni:latest || true
	$(PUSH_CMD) quay.io/go-ap/oni:latest || true
endif
ifneq ($(VERSION),)
	$(TAG_CMD) $(APP_HOSTNAME)/app:$(TAG) quay.io/go-ap/oni:$(VERSION)-$(TAG) || true
	$(PUSH_CMD) quay.io/go-ap/oni:$(VERSION)-$(TAG) || true
endif
