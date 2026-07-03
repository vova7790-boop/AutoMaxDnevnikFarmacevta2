import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { generateImage } from '../src/generate-image';

const PROFILE_DIR = path.resolve('browser-profile');
const IMAGE_PATH = path.resolve('post-image.png');
const CONTENT_PATH = path.resolve('post-content.json');
const CHANNEL_URL = 'https://web.max.ru/0';

test('отправить пост с картинкой в канал Max', async ({ playwright }) => {
  test.setTimeout(600000); // 10 минут — генерация картинки через kie.ai может занять до 5 мин
  if (!fs.existsSync(PROFILE_DIR)) throw new Error(`Профиль браузера не найден: ${PROFILE_DIR}. Сначала запусти capture-qr-with-password.spec.ts`);
  if (!fs.existsSync(CONTENT_PATH)) throw new Error(`Файл контента не найден: ${CONTENT_PATH}. Сначала сгенерируй пост.`);

  const { postText, imagePrompt } = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf-8')) as {
    postText: string;
    imagePrompt: string;
  };

  if (!imagePrompt?.trim()) throw new Error('imagePrompt пустой в post-content.json');

  // Всегда генерируем новую картинку для каждого поста
  if (fs.existsSync(IMAGE_PATH)) fs.unlinkSync(IMAGE_PATH);
  const STATUS_PATH = path.resolve('kie-ai-status.json');
  try {
    await generateImage(imagePrompt, IMAGE_PATH);
    fs.writeFileSync(STATUS_PATH, JSON.stringify({ ok: true, ts: Date.now() }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('KIE_AI_')) {
      fs.writeFileSync(STATUS_PATH, JSON.stringify({ ok: false, error: msg, ts: Date.now() }));
      console.error(`\n❌ KIE.AI ERROR: ${msg}`);
      console.error('Статус записан в kie-ai-status.json. Остановите публикацию и повторите позже.\n');
    }
    throw err;
  }

  // Используем постоянный профиль браузера (сохраняет IndexedDB с авторизацией)
  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    proxy: { server: 'http://127.0.0.1:46877' },
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/after-goto.png' });

  const messageInput = page.locator('[contenteditable][placeholder="Message"], [contenteditable][placeholder="Пост"], [contenteditable]').first();
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

  // Ждём появления превью прикреплённой картинки (до 15 сек)
  await page.waitForSelector('img[src*="blob:"], .attachment-preview, .media-preview, img.thumb', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/after-file-attach.png' });

  // Набираем текст поста (если есть)
  if (postText?.trim()) {
    await messageInput.click();
    await page.waitForTimeout(300);

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

        const isBold = line.startsWith('**') && line.endsWith('**');
        const cleanLine = line.replace(/^\*\*|\*\*$/g, '');

        if (isBold) {
          await page.keyboard.press('Control+b');
          await page.keyboard.type(cleanLine);
          await page.keyboard.press('Control+b');
        } else {
          await page.keyboard.type(cleanLine);
        }

        isFirstLine = false;
      }

      isFirstParagraph = false;
    }
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/post-ready.png' });

  const sendButton = page.locator('button.svelte-1cuof8n');
  await sendButton.waitFor({ state: 'visible', timeout: 5000 });
  await sendButton.click();

  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/post-sent.png' });

  await context.close();
});
