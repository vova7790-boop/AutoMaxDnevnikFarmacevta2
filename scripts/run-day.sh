#!/bin/bash
# ПАРАЛЛЕЛЬНЫЙ режим публикации дня. Используется ТОЛЬКО когда пользователь явно
# просит «генерируй параллельно». По умолчанию — обычный режим «по одному».
#
# usage: bash scripts/run-day.sh post-queue/2026-10-19.json
# 1) параллельно генерирует все картинки дня (scripts/pregen-images.js);
# 2) отправляет заголовок дня «Посты на ДД.ММ.ГГГГ ⬇️» (если header=true и он ещё не отправлен);
# 3) отправляет посты СТРОГО по очереди (send-post.spec.ts с REUSE_IMAGE=1).
# Отправленное пишется в post-queue/done.txt (повторный запуск не дублирует посты).
# При первой ошибке — стоп (exit != 0). Notion этот скрипт НЕ трогает: отметку
# «Опубликовано» Claude ставит через Notion MCP по строкам POST из done.txt.
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
Q="$(realpath "$1")"
DONE="$REPO/post-queue/done.txt"; mkdir -p "$REPO/post-queue/logs"; touch "$DONE"
DATE=$(node -e 'console.log(require(process.argv[1]).date)' "$Q")
HEADER=$(node -e 'console.log(require(process.argv[1]).header?1:0)' "$Q")
N=$(node -e 'console.log(require(process.argv[1]).posts.length)' "$Q")

echo "=== $DATE: параллельная генерация картинок ($N) ==="
node scripts/pregen-images.js "$Q" || { echo "STOP: картинки не готовы"; exit 2; }

unlock() { rm -f browser-profile/SingletonLock browser-profile/SingletonCookie browser-profile/SingletonSocket 2>/dev/null; }

if [ "$HEADER" = 1 ] && ! grep -q "^HEADER $DATE$" "$DONE"; then
  echo "=== $DATE: заголовок дня ==="
  unlock
  OUT=$(HEADER_TEXT="Посты на $DATE ⬇️" xvfb-run --auto-servernum npx playwright test tests/send-header.spec.ts --reporter=line 2>&1)
  echo "$OUT" | grep -E "passed|failed|Error" | tail -5
  echo "$OUT" | grep -q "1 passed" || { echo "STOP: заголовок не отправлен"; exit 3; }
  echo "HEADER $DATE" >> "$DONE"
fi

for i in $(seq 0 $((N-1))); do
  ID=$(node -e 'console.log(require(process.argv[1]).posts[+process.argv[2]].id)' "$Q" "$i")
  TITLE=$(node -e 'console.log(require(process.argv[1]).posts[+process.argv[2]].title)' "$Q" "$i")
  if grep -q "^POST $ID " "$DONE"; then echo "--- уже отправлен: $TITLE"; continue; fi
  echo "=== $DATE пост $((i+1))/$N: $TITLE ==="
  node -e '
    const fs=require("fs");const p=require(process.argv[1]).posts[+process.argv[2]];
    fs.writeFileSync("post-content.json",JSON.stringify({postText:p.postText,imagePrompt:p.imagePrompt,articleTitle:p.title,articleUrl:"",articleDescription:""},null,2));
  ' "$Q" "$i"
  cp "post-queue/img/$ID.png" post-image.png
  unlock
  OUT=$(REUSE_IMAGE=1 xvfb-run --auto-servernum npx playwright test tests/send-post.spec.ts --reporter=line 2>&1)
  echo "$OUT" | grep -E "passed|failed|Error" | tail -5
  if echo "$OUT" | grep -q "1 passed"; then
    echo "POST $ID $DATE $TITLE" >> "$DONE"
  else
    echo "$OUT" > "post-queue/logs/fail-$ID.log"
    echo "STOP: пост не отправлен ($TITLE)"; exit 4
  fi
done
echo "DAY_DONE $DATE"
