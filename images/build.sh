#!/usr/bin/env bash

#set -x

_workdir=${1:-../}
_image_name=${2:-oni/builder}

_context=$(realpath "${_workdir}")

_builder=$(buildah from docker.io/library/golang:1.20)

buildah config --env DEBIAN_FRONTEND=noninteractive "${_builder}"
buildah run "${_builder}" /usr/bin/apt-get update -q
buildah run "${_builder}" echo 'APT::Install-Recommends "false";' >> /etc/apt/apt.conf.d/99no-recommended-or-optional
buildah run "${_builder}" echo 'APT::Install-Suggests "false";' >> /etc/apt/apt.conf.d/99no-recommended-or-optional
buildah run "${_builder}" /usr/bin/apt-get install -q -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" yarnpkg

buildah config --env GO111MODULE=on "${_builder}"
buildah config --env GOWORK=off "${_builder}"

buildah copy --ignorefile "${_context}/.containerignore" --contextdir "${_context}" "${_builder}" "${_context}" /go/src/app
buildah config --workingdir /go/src/app "${_builder}"

buildah run "${_builder}" make download && go get oni && go mod vendor

buildah commit "${_builder}" "${_image_name}"
