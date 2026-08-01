#!/bin/bash
# Генерирует картинку с лимитом 5 минут; при таймауте упрощает промпт
# (imagePromptSimple из post-content.json) и пробует ещё раз.
# Затем публикует пост в Max, ПЕРЕИСПОЛЬЗУЯ уже готовую картинку (REUSE_IMAGE=1),
# чтобы не генерировать её повторно.
set -u
cd "$(dirname "$0")/.."

CAP_MS=300000

gen() {
  IMAGE_TIME_CAP_MS=$CAP_MS npx playwright test tests/gen-image-only.spec.ts --reporter=line
}

echo "=== Генерация картинки: попытка 1 (лимит 5 мин) ==="
if ! gen; then
  echo "=== Картинка не готова за 5 мин. Упрощаю промпт и пробую снова ==="
  node -e '
    const fs=require("fs");
    const c=JSON.parse(fs.readFileSync("post-content.json","utf-8"));
    if(c.imagePromptSimple){c.imagePrompt=c.imagePromptSimple;}
    fs.writeFileSync("post-content.json",JSON.stringify(c,null,2));
    console.log("Промпт упрощён до:",c.imagePrompt);
  '
  echo "=== Генерация картинки: попытка 2 (лимит 5 мин) ==="
  if ! gen; then
    echo "!!! Картинка так и не сгенерирована. Останавливаюсь."
    exit 2
  fi
fi

echo "=== Картинка готова. Публикую пост в Max (переиспользую картинку) ==="
REUSE_IMAGE=1 xvfb-run --auto-servernum npx playwright test tests/send-post.spec.ts --reporter=line
