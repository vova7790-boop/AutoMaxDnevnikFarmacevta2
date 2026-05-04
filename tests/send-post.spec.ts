import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { generateImage } from '../src/generate-image';

const SESSION_PATH = path.resolve('session.json');
const IMAGE_PATH = path.resolve('post-image.png');
const CONTENT_PATH = path.resolve('post-content.json');
const CHANNEL_URL = 'https://web.max.ru/0';

test('отправить пост с картинкой в канал Max', async ({ browser }) => {
  test.setTimeout(300000); // 5 минут — генерация картинки через kie.ai занимает до 120 сек
  if (!fs.existsSync(SESSION_PATH)) throw new Error(`Файл сессии не найден: ${SESSION_PATH}`);
  if (!fs.existsSync(CONTENT_PATH)) throw new Error(`Файл контента не найден: ${CONTENT_PATH}. Сначала сгенерируй пост.`);

  const { postText, imagePrompt } = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8')) as {
    postText: string;
    imagePrompt: string;
  };

  if (!postText?.trim()) throw new Error('postText пустой в post-content.json');
  if (!imagePrompt?.trim()) throw new Error('imagePrompt пустой в post-content.json');

  // Генерируем картинку через kie.ai (пропускаем, если уже скачана)
  if (!fs.existsSync(IMAGE_PATH)) {
    await generateImage(imagePrompt, IMAGE_PATH);
  } else {
    console.log(`Image already exists at ${IMAGE_PATH}, skipping generation`);
  }

  const context = await browser.newContext({
    storageState: SESSION_PATH,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const messageInput = page.locator('[contenteditable][placeholder="Message"], [contenteditable][placeholder="Пост"]').first();
  await messageInput.waitFor({ state: 'visible', timeout: 20000 });

  // Прикрепляем картинку через меню
  const attachButton = page.locator('button[aria-label="Upload file"], button.button--neutral-link.button--link').first();
  await attachButton.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/after-attach-click.png' });

  const photoMenuItem = page.locator('button:has-text("Photo or video"), button:has-text("Фото или видео")').first();
  await photoMenuItem.waitFor({ state: 'visible', timeout: 10000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 10000 }),
    photoMenuItem.click(),
  ]);
  await fileChooser.setFiles(IMAGE_PATH);
  await page.waitForTimeout(2000);

  // Набираем текст поста с форматированием
  await messageInput.click();
  await page.waitForTimeout(300);

  // Делим на абзацы по \n\n, внутри абзаца строки — одинарный Shift+Enter,
  // между абзацами — двойной Shift+Enter (одна пустая строка)
  const paragraphs = postText.split('\n\n');
  let isFirstParagraph = true;

  for (const paragraph of paragraphs) {
    if (!isFirstParagraph) {
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.press('Shift+Enter');
    }

    const lines = paragraph.split('\n');
    let isFirstLine = true;

    for (const line of lines) {
      if (!isFirstLine) {
        await page.keyboard.press('Shift+Enter');
      }

      if (isFirstParagraph && isFirstLine) {
        // Заголовок — жирным
        await page.keyboard.press('Control+b');
        await page.keyboard.type(line);
        await page.keyboard.press('Control+b');
      } else {
        await page.keyboard.type(line);
      }

      isFirstLine = false;
    }

    isFirstParagraph = false;
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/post-ready.png' });

  const sendButton = page.locator('button.svelte-1cuof8n');
  await sendButton.waitFor({ state: 'visible', timeout: 5000 });
  await sendButton.click();

  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/post-sent.png' });

  // Проверяем что первая строка заголовка появилась в чате
  const firstLine = paragraphs[0].split('\n')[0].replace(/^[^\wЀ-ӿ]+/, '').substring(0, 15);
  if (firstLine) {
    await expect(page.locator(`text=${firstLine}`).first()).toBeVisible({ timeout: 10000 });
  }

  await context.close();
});
