import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { generateImage } from '../src/generate-image';

const IMAGE_PATH = path.resolve('post-image.png');
const CONTENT_PATH = path.resolve('post-content.json');

// Генерирует картинку с ограничением по времени (по умолчанию 5 минут).
// Если генерация не укладывается в лимит — тест падает, чтобы вызывающий
// код мог упростить промпт и повторить попытку.
test('сгенерировать картинку (с лимитом времени)', async () => {
  const capMs = Number(process.env.IMAGE_TIME_CAP_MS || 300000);
  test.setTimeout(capMs + 30000);

  const { imagePrompt } = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8')) as { imagePrompt: string };
  if (!imagePrompt?.trim()) throw new Error('imagePrompt пустой в post-content.json');

  if (fs.existsSync(IMAGE_PATH)) fs.unlinkSync(IMAGE_PATH);

  let timer: NodeJS.Timeout | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`IMAGE_TIME_CAP: генерация превысила ${Math.round(capMs / 1000)}с`)), capMs);
  });

  try {
    await Promise.race([generateImage(imagePrompt, IMAGE_PATH), cap]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!fs.existsSync(IMAGE_PATH)) throw new Error('Картинка не была сохранена');
});
