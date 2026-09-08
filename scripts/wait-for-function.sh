#!/usr/bin/env bash
set -euo pipefail

URL=${1:?"Usage: $0 <function-url> <expected-status> <expected-body>"}
EXPECTED_STATUS=${2:?"Usage: $0 <function-url> <expected-status> <expected-body>"}
EXPECTED_BODY=${3:?"Usage: $0 <function-url> <expected-status> <expected-body>"}
DEADLINE=$((SECONDS + 120))
BODY=$(mktemp)
trap 'rm -f "$BODY"' EXIT

echo "Waiting for the expected function response at $URL..."
while ((SECONDS < DEADLINE)); do
  timeout=$((DEADLINE - SECONDS))
  if ((timeout > 15)); then timeout=15; fi
  status=$(curl --silent --show-error --max-time "$timeout" --output "$BODY" --write-out '%{http_code}' "$URL" 2>/dev/null || true)
  if [[ "$status" == "$EXPECTED_STATUS" ]] && grep -Fq -- "$EXPECTED_BODY" "$BODY"; then
    echo "Function server is ready (HTTP $status with the expected response)."
    exit 0
  fi
  sleep 0.5
done

echo "TIMEOUT: Function server did not return HTTP $EXPECTED_STATUS with the expected response at $URL after 120s" >&2
echo "Last response: HTTP ${status:-none}" >&2
cat "$BODY" >&2
exit 1
