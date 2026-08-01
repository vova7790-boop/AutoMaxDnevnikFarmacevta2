#!/usr/bin/env bash
# SessionStart-хук: восстанавливает авторизацию Max (browser-profile)
# из закоммиченного архива, если в свежем контейнере профиля ещё нет.
# Идемпотентно: если профиль на месте — ничего не делает.
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE_DIR="browser-profile"
ARCHIVE="browser-profile.tar.gz"

if [ -d "$PROFILE_DIR/Default/IndexedDB" ]; then
  echo "[max-profile] Профиль на месте — восстановление не требуется."
  exit 0
fi

if [ -f "$ARCHIVE" ]; then
  echo "[max-profile] Профиль отсутствует — распаковываю $ARCHIVE ..."
  tar xzf "$ARCHIVE"
  echo "[max-profile] Готово: авторизация Max восстановлена из архива."
else
  echo "[max-profile] Архив $ARCHIVE не найден — потребуется QR-логин: node max-qr-login.js"
fi
