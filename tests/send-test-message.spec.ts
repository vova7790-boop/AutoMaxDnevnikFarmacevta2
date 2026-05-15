import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('session.json');
const CHANNEL_URL = 'https://web.max.ru/0';

test('отправить тестовое сообщение в Избранное', async ({ browser }) => {
  if (!fs.existsSync(SESSION_PATH)) throw new Error(`Файл сессии не найден: ${SESSION_PATH}`);

  const context = await browser.newContext({
    storageState: SESSION_PATH,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/test-msg-loaded.png' });

  const messageInput = page.locator('[contenteditable][placeholder="Message"], [contenteditable][placeholder="Пост"], [contenteditable]').first();
  await messageInput.waitFor({ state: 'visible', timeout: 20000 });
  await messageInput.click();
  await page.keyboard.type('тест');

  await page.waitForTimeout(500);

  const sendButton = page.locator('button.svelte-1cuof8n');
  await sendButton.waitFor({ state: 'visible', timeout: 5000 });
  await sendButton.click();

  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/test-msg-sent.png' });

  await context.close();
});
