#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

command="${1:-build}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command" in
  build)
    node scripts/build.mjs
    ;;
  serve)
    exec node scripts/server.mjs "$@" "${PORT:-8000}"
    ;;
  preview)
    node scripts/build.mjs
    exec python3 -m http.server "${PORT:-8000}" --directory _site
    ;;
  -h|--help)
    cat <<'USAGE'
Usage: build.sh [command]
  build    build the read-only published site into _site/
  serve    run a local read-only server at http://127.0.0.1:8000
  serve --edit
           run a local edit server at http://127.0.0.1:8000
  preview  build, then serve the read-only _site/ output
  -h       show this help

Env:
  PORT     serve or preview port. Default: 8000.
USAGE
    ;;
  *)
    echo "unknown command: $command" >&2
    exit 1
    ;;
esac
