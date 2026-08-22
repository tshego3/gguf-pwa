#!/usr/bin/env bash
# "No telemetry, no API key" is the product's central claim, so it is
# enforced rather than asserted. Fails if the production build gains an
# analytics endpoint, a beacon call, or a connect-src wide enough to allow
# one.
#
# The optional online API (src/engine/remote.ts, off by default) adds two
# keyless inference hosts to the allow-list below. They are inference
# endpoints the user switches on knowingly, not telemetry: nothing is sent
# unless the user selects that backend and types a message. Adding a host
# here without adding it to REMOTE_API_HOSTS in src/types/remote.ts, or the
# reverse, must fail this check.
#
# Run against dist/, not src/: a transitive dependency can add a phone-home
# without any source file changing (vite-plugin-pwa pulls in
# workbox-google-analytics, for instance - unused here, and this proves it
# stays that way).
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d dist ]; then
  echo "ERROR: dist/ not found - run 'npm run build' first." >&2
  exit 1
fi

fail=0

# Case-sensitive and host-shaped on purpose. A bare case-insensitive
# "analytics" matches base64 payload noise inside the WASM glue and reports
# a false positive.
hosts=(
  'google-analytics.com'
  'googletagmanager.com'
  'analytics.google.com'
  'api.segment.io'
  'cdn.segment.com'
  'sentry.io'
  'bugsnag.com'
  'datadoghq.com'
  'amplitude.com'
  'mixpanel.com'
  'posthog.com'
  'plausible.io'
  'browser-intake'
)

for host in "${hosts[@]}"; do
  if grep -rqF "$host" dist/ 2>/dev/null; then
    echo "ERROR: analytics host '$host' found in dist/" >&2
    grep -rlF "$host" dist/ >&2
    fail=1
  fi
done

# sendBeacon exists only to post data on unload. There is no legitimate use
# for it in an app that makes no outbound request after the weights land.
if grep -rqF 'sendBeacon' dist/ 2>/dev/null; then
  echo "ERROR: navigator.sendBeacon present in dist/" >&2
  grep -rlF 'sendBeacon' dist/ >&2
  fail=1
fi

# connect-src is the backstop: even a phone-home that slipped past the
# checks above cannot reach a host this does not list.
# Anchored on "connect-src 'self'" rather than the bare directive name:
# index.html also carries a prose comment explaining the CSP, and matching
# that would lint English words as if they were hosts.
csp=$(grep -o "connect-src 'self'[^;]*" dist/index.html || true)
if [ -z "$csp" ]; then
  echo "ERROR: no connect-src directive in dist/index.html" >&2
  fail=1
else
  for token in $csp; do
    case "$token" in
      connect-src|\'self\'|https://huggingface.co|https://*.hf.co|https://cdn-lfs.huggingface.co|https://cdn-lfs-us-1.huggingface.co) ;;
      https://text.pollinations.ai|https://prexzyapis.com) ;;
      *)
        echo "ERROR: unexpected connect-src entry '$token' - only the weight hosts and the declared online API hosts are allowed." >&2
        fail=1
        ;;
    esac
  done
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi

echo "OK: no analytics endpoints, no beacons, connect-src limited to the weight hosts and the declared online API hosts"
