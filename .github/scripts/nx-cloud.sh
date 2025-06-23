#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == "start" ]]; then
  pnpm dlx nx-cloud start-ci-run \
    --distribute-on="2 linux-medium-js" \
    --stop-agents-after="build"
elif [[ "$1" == "stop" ]]; then
  pnpm dlx nx-cloud stop-all-agents
fi