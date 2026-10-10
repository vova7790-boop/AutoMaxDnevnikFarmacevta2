#!/bin/bash
# Журнал публикаций в Max, который хранится в git (journal/published.txt) и сразу
# пушится в текущую ветку — чтобы он не пропал вместе с контейнером сессии.
# Служит для доотметки «Опубликовано» в Notion после сбоя (см. CLAUDE.md).
#
# usage:
#   bash scripts/journal.sh HEADER <ДД.ММ.ГГГГ>
#   bash scripts/journal.sh POST <id страницы Notion без дефисов> <ДД.ММ.ГГГГ> "<Заголовок>"
#
# Строки: «HEADER <дата> <время UTC>» и «POST <id> <дата> <время UTC> <заголовок>».
# Запись в файл делается всегда; если push не удался (сеть) — коммит остаётся
# локально и уйдёт со следующим вызовом. Скрипт никогда не валит публикацию.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
J=journal/published.txt
mkdir -p journal; touch "$J"

KIND="${1:-}"; TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
case "$KIND" in
  HEADER) LINE="HEADER $2 $TS"; MSG="journal: заголовок дня $2" ;;
  POST)   LINE="POST $2 $3 $TS ${4:-}"; MSG="journal: пост $3 — ${4:-$2}" ;;
  *) echo "usage: journal.sh HEADER <дата> | POST <id> <дата> <заголовок>" >&2; exit 1 ;;
esac
echo "$LINE" >> "$J"
echo "JOURNAL: $LINE"

BRANCH=$(git rev-parse --abbrev-ref HEAD)
git add "$J"
git commit -q --only "$J" -m "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || { echo "JOURNAL: commit не удался" >&2; exit 0; }

for delay in 0 2 4 8 16; do
  sleep $delay
  if git push -q -u origin "$BRANCH" 2>/dev/null; then echo "JOURNAL: запушено в $BRANCH"; exit 0; fi
  # удалённая ветка ушла вперёд (другая сессия) — подтянуть и повторить
  git pull -q --rebase --autostash origin "$BRANCH" 2>/dev/null || git rebase --abort 2>/dev/null
done
echo "JOURNAL: push не удался — коммит сохранён локально, уйдёт со следующей записью" >&2
exit 0
