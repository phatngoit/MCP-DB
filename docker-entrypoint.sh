#!/bin/sh
set -e

# Cloud/container platforms (Smithery.ai, Railway, Render, Fly.io, ...) commonly
# assign a port via $PORT and expect the process to serve HTTP on it. Auto-switch
# from the default stdio "start" command to "serve-http" when that's the case,
# without touching an explicit "serve-http" (or any other) invocation.
if [ "$1" = "start" ] && [ -n "$PORT" ]; then
  shift
  exec node dist/cli.js serve-http --host 0.0.0.0 --port "$PORT" "$@"
fi

exec node dist/cli.js "$@"
