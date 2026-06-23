#!/bin/bash
# Запускает send-post.spec.ts и возвращает код:
#   0 = успех
#   2 = ошибка kie.ai (нет смысла продолжать)
#   1 = другая ошибка

set -euo pipefail

STATUS_FILE="kie-ai-status.json"
rm -f "$STATUS_FILE"

xvfb-run npx playwright test tests/send-post.spec.ts
EXIT=$?

if [ $EXIT -ne 0 ]; then
  if [ -f "$STATUS_FILE" ]; then
    OK=$(node -e "const s=require('./$STATUS_FILE'); process.stdout.write(String(s.ok))")
    ERR=$(node -e "const s=require('./$STATUS_FILE'); process.stdout.write(s.error||'')" 2>/dev/null || true)
    if [ "$OK" = "false" ]; then
      echo ""
      echo "❌ KIE.AI НЕДОСТУПЕН: $ERR"
      echo "Публикация остановлена. Повторите попытку позже."
      exit 2
    fi
  fi
  exit 1
fi

exit 0
