#!/usr/bin/env bash
# Build and push the Adminer Cycloid plugin image.
# Run `docker login <registry>` successfully before calling this script.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="${ROOT_DIR}/plugin"
PACKAGE_JSON="${PLUGIN_DIR}/package.json"

if [[ ! -f "${PACKAGE_JSON}" ]]; then
  echo "error: package.json not found at ${PACKAGE_JSON}" >&2
  exit 1
fi

VERSION="$(node -p "require('${PACKAGE_JSON}').version")"
if [[ -z "${VERSION}" ]]; then
  echo "error: could not read version from ${PACKAGE_JSON}" >&2
  exit 1
fi

IMAGE="${IMAGE:-${1:-}}"
if [[ -z "${IMAGE}" ]]; then
  echo "usage: IMAGE=<registry>/<namespace>/cycloid-plugin-adminer ${0}" >&2
  echo "   or: ${0} <registry>/<namespace>/cycloid-plugin-adminer" >&2
  exit 1
fi

# Strip trailing slashes and any accidental :tag suffix from IMAGE.
IMAGE="${IMAGE%/}"
IMAGE="${IMAGE%:*}"

TAG="${IMAGE}:${VERSION}"

echo "==> Building ${TAG}"
docker build -t "${TAG}" "${PLUGIN_DIR}"

echo "==> Pushing ${TAG}"
docker push "${TAG}"

echo "==> Done: ${TAG}"
