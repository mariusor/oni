#!/usr/bin/env sh

#set -x

_workdir=${1:-../}
_image_name=${2:-oni/builder}
_go_version=${GO_VERSION:-1.24}

_context=$(realpath "${_workdir}")

_builder=$(buildah from docker.io/library/golang:${_go_version})

buildah run "${_builder}" /sbin/apk update
buildah run "${_builder}" /sbin/apk add yarn make bash openssl upx

buildah config --env GO111MODULE=on "${_builder}"
buildah config --env GOWORK=off "${_builder}"
buildah config --env YARN=yarnpkg "${_builder}"

buildah copy --ignorefile "${_context}/.containerignore" --contextdir "${_context}" "${_builder}" "${_context}" /go/src/app
buildah config --workingdir /go/src/app "${_builder}"

buildah run "${_builder}" make go.sum yarn.lock
buildah run "${_builder}" go mod vendor

buildah commit "${_builder}" "${_image_name}"
