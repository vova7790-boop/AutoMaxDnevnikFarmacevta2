import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.resolve('browser-profile');
// Канал «Избранное» (Saved Messages) — целевой канал автопостинга, URL /0.
// ВНИМАНИЕ: не путать с отдельным каналом «Избранное (крео)» — постим только
// в обычное «Избранное». Запасной клик ниже использует ТОЧНОЕ совпадение имени.
const CHANNEL_URL = 'https://web.max.ru/0';
const CHANNEL_TITLE = 'Избранное';

// Текстовое сообщение-заголовок дня, напр. «Посты на 05.10.2026».
// Передаётся через переменную окружения HEADER_TEXT.
const HEADER_TEXT = process.env.HEADER_TEXT ?? '';

test('отправить текстовый заголовок дня в канал Max', async ({ playwright }) => {
  test.setTimeout(180000); // 3 минуты — только открытие канала и отправка текста
  if (!HEADER_TEXT.trim()) throw new Error('HEADER_TEXT пустой. Передай текст заголовка через переменную окружения HEADER_TEXT.');
  if (!fs.existsSync(PROFILE_DIR)) throw new Error(`Профиль браузера не найден: ${PROFILE_DIR}. Сначала запусти capture-qr-with-password.spec.ts`);

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
    // Запасной путь: если прямой URL не открыл канал (Max снова сменил маршрут),
    // кликаем по элементу списка чатов «Избранное».
    if (!(await messageInput.count().catch(() => 0))) {
      // ТОЧНОЕ совпадение имени — иначе можно случайно открыть «Избранное (крео)».
      const chatItem = page.getByText(CHANNEL_TITLE, { exact: true }).first();
      if (await chatItem.count().catch(() => 0)) {
        await chatItem.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(3000);
      }
    }
    try {
      await messageInput.waitFor({ state: 'visible', timeout: 45000 });
      composerReady = true;
    } catch {
      console.log(`Поле ввода не появилось за 45 сек (попытка ${attempt}/3).`);
      await page.screenshot({ path: `test-results/header-composer-fail-${attempt}.png` }).catch(() => {});
    }
  }
  await page.screenshot({ path: 'test-results/header-after-goto.png' });
  if (!composerReady) throw new Error('Поле ввода Max не появилось после 3 попыток с перезагрузкой');

  // Без картинки: просто печатаем текст заголовка и отправляем.
  await messageInput.click();
  await page.waitForTimeout(300);
  await page.keyboard.type(HEADER_TEXT);

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/header-typed.png' });

  const sendButton = page.locator('button.svelte-1cuof8n');
  await sendButton.waitFor({ state: 'visible', timeout: 5000 });
  await sendButton.click();

  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/header-sent.png' });

  await context.close();
});
