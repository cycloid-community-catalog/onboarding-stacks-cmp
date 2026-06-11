#!/bin/sh
set -eu

ADMINER_PORT="${ADMINER_PORT:-8081}"
export ADMINER_PORT

php -S "127.0.0.1:${ADMINER_PORT}" -t /plugin /plugin/adminer-router.php &
PHP_PID=$!

cleanup() {
  kill "$PHP_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec node --experimental-strip-types /plugin/server.ts
