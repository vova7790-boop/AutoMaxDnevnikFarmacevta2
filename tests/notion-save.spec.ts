import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { saveArticle } from '../src/notion-tracker';

const CONTENT_PATH = path.resolve('post-content.json');

test('сохранить статью в Notion', async () => {
  if (!fs.existsSync(CONTENT_PATH)) {
    throw new Error(`Файл не найден: ${CONTENT_PATH}`);
  }

  const { articleTitle, articleUrl, articleDescription } = JSON.parse(
    fs.readFileSync(CONTENT_PATH, 'utf-8')
  ) as {
    articleTitle: string;
    articleUrl: string;
    articleDescription: string;
  };

  if (!articleTitle?.trim()) throw new Error('Поле articleTitle пустое в post-content.json');
  if (!articleUrl?.trim()) throw new Error('Поле articleUrl пустое в post-content.json');
  if (!articleDescription?.trim()) throw new Error('Поле articleDescription пустое в post-content.json');

  const date = new Date().toISOString().split('T')[0];

  await saveArticle({
    title: articleTitle,
    url: articleUrl,
    date,
    description: articleDescription,
  });

  console.log(`✅ Сохранено в Notion: "${articleTitle}" (${date})`);
});
