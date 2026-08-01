#!/usr/bin/env bash
# Снимает свежий снимок авторизации Max (browser-profile) в browser-profile.tar.gz.
# Запускать ПОСЛЕ успешного (пере)входа в Max, затем закоммитить архив:
#   bash scripts/save-max-profile.sh && git add browser-profile.tar.gz && \
#   git commit -m "chore: обновить снимок авторизации Max" && git push
set -euo pipefail
cd "$(dirname "$0")/.."

PROFILE_DIR="browser-profile"
ARCHIVE="browser-profile.tar.gz"

if [ ! -d "$PROFILE_DIR/Default/IndexedDB" ]; then
  echo "Нет валидного $PROFILE_DIR — сначала выполните вход: node max-qr-login.js"
  exit 1
fi

tar czf "$ARCHIVE" "$PROFILE_DIR"
echo "Снимок сохранён в $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))."
echo "Далее: git add $ARCHIVE && git commit -m 'chore: обновить снимок авторизации Max' && git push"
