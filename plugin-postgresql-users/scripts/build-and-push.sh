#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${ROOT_DIR}/plugin"
PACKAGE_JSON="${PLUGIN_DIR}/package.json"

VERSION="$(node -p "require('${PACKAGE_JSON}').version")"
IMAGE="${IMAGE:-${1:-}}"

if [[ -z "${IMAGE}" ]]; then
  echo "usage: IMAGE=<registry>/<namespace>/cycloid-plugin-postgresql-users ${0}" >&2
  echo "   or: ${0} <registry>/<namespace>/cycloid-plugin-postgresql-users" >&2
  exit 1
fi

IMAGE="${IMAGE%/}"
IMAGE="${IMAGE%:*}"
TAG="${IMAGE}:${VERSION}"

echo "==> Building ${TAG}"
docker build -t "${TAG}" "${PLUGIN_DIR}"

echo "==> Pushing ${TAG}"
docker push "${TAG}"

echo "==> Done: ${TAG}"
