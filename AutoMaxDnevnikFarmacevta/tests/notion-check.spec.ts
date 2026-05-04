import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { checkArticleByUrl } from '../src/notion-tracker';

const CHECK_INPUT_PATH = path.resolve('article-check.json');
const CHECK_RESULT_PATH = path.resolve('article-check-result.json');

test('проверить дубликат статьи в Notion', async () => {
  if (!fs.existsSync(CHECK_INPUT_PATH)) {
    throw new Error(`Файл не найден: ${CHECK_INPUT_PATH}. Создай его с полями url и description.`);
  }

  const { url } = JSON.parse(fs.readFileSync(CHECK_INPUT_PATH, 'utf-8')) as {
    url: string;
    description: string;
  };

  if (!url?.trim()) throw new Error('Поле url пустое в article-check.json');

  const result = await checkArticleByUrl(url);

  fs.writeFileSync(CHECK_RESULT_PATH, JSON.stringify(result, null, 2), 'utf-8');

  console.log(`urlMatch: ${result.urlMatch}`);
  console.log(`recentDescriptions (${result.recentDescriptions.length}): записано в ${CHECK_RESULT_PATH}`);
});
