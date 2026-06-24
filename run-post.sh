#!/usr/bin/env bash
# Запускает send-post.spec.ts через TLS-strip proxy, чтобы обойти
# несовместимость Chromium ECH с egress-прокси Anthropic.
set -e

PROXY_PORT=42308
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Запускаем TLS-strip proxy в фоне
node "$SCRIPT_DIR/tls-strip-proxy.js" &
PROXY_PID=$!

cleanup() {
  kill "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT

sleep 1

# Запускаем тест с прокси-обёрткой
HTTPS_PROXY="http://127.0.0.1:$PROXY_PORT" \
  xvfb-run --auto-servernum npx playwright test tests/send-post.spec.ts "$@"
