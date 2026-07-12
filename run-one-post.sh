#!/bin/bash
# Генерирует картинку с лимитом 5 минут; при таймауте/ошибке упрощает промпт
# (берёт поле imagePromptSimple из post-content.json) и пробует ещё раз.
# После готовой картинки публикует пост в Max (без повторной генерации).
set -u
cd "$(dirname "$0")"

CAP_MS=300000
CONTENT=post-content.json

gen() {
  IMAGE_TIME_CAP_MS=$CAP_MS npx playwright test tests/gen-image-only.spec.ts --reporter=line
}

echo "=== Попытка 1: генерация картинки (лимит 5 мин) ==="
if ! gen; then
  echo "=== Картинка не готова за 5 мин или ошибка. Упрощаю промпт и пробую снова ==="
  node -e '
    const fs=require("fs");
    const c=JSON.parse(fs.readFileSync("post-content.json","utf-8"));
    if(c.imagePromptSimple){c.imagePrompt=c.imagePromptSimple;}
    fs.writeFileSync("post-content.json",JSON.stringify(c,null,2));
    console.log("Промпт упрощён до:",c.imagePrompt);
  '
  echo "=== Попытка 2: генерация упрощённой картинки (лимит 5 мин) ==="
  if ! gen; then
    echo "!!! Картинка так и не сгенерирована. Останавливаюсь."
    exit 2
  fi
fi

echo "=== Картинка готова. Публикую пост в Max ==="
SKIP_IMAGE_GEN=1 xvfb-run --auto-servernum npx playwright test tests/send-post.spec.ts --reporter=line
