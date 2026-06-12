#!/bin/sh
set -eu
exec node --experimental-strip-types /plugin/server.ts
