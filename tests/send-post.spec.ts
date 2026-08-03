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

  // REUSE_IMAGE=1 — переиспользовать уже сгенерированную post-image.png (не звать kie.ai).
  // Полезно при повторе, когда картинка уже есть, а упал только постинг в Max.
  const STATUS_PATH = path.resolve('kie-ai-status.json');
  const reuseImage = process.env.REUSE_IMAGE === '1' && fs.existsSync(IMAGE_PATH);
  if (reuseImage) {
    console.log('REUSE_IMAGE=1: использую уже сгенерированную post-image.png, пропускаю kie.ai');
  } else {
    if (fs.existsSync(IMAGE_PATH)) fs.unlinkSync(IMAGE_PATH);
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
  }

  // Используем постоянный профиль браузера (сохраняет IndexedDB с авторизацией)
  const proxyServer = process.env.MAX_PROXY || process.env.HTTPS_PROXY;
  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    // --ssl-version-max=tls1.2 обязателен: егресс-прокси сбрасывает большой
    // TLS 1.3 ClientHello Chromium (пост-квантовый keyshare) → web.max.ru не грузится.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ssl-version-max=tls1.2'],
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  const messageInput = page.locator('[contenteditable][placeholder="Message"], [contenteditable][placeholder="Пост"], [contenteditable]').first();

  // Max — SPA, поле ввода иногда появляется не сразу (медленная сеть/загрузка бандла).
  // Делаем до 3 попыток с перезагрузкой и увеличенными таймаутами.
  let composerReady = false;
  for (let attempt = 1; attempt <= 3 && !composerReady; attempt++) {
    console.log(`Открываю канал Max (попытка ${attempt}/3)...`);
    if (attempt === 1) {
      await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    } else {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    }
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    try {
      await messageInput.waitFor({ state: 'visible', timeout: 45000 });
      composerReady = true;
    } catch {
      console.log(`Поле ввода не появилось за 45 сек (попытка ${attempt}/3).`);
      await page.screenshot({ path: `test-results/composer-fail-${attempt}.png` }).catch(() => {});
    }
  }
  await page.screenshot({ path: 'test-results/after-goto.png' });
  if (!composerReady) throw new Error('Поле ввода Max не появилось после 3 попыток с перезагрузкой');

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
