import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const SESSION_PATH = path.resolve('session.json');
const QR_PATH = path.resolve('qr-screenshot.png');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  await page.goto('https://web.max.ru/-74167276777563', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: QR_PATH, fullPage: false });
  console.log(`Скриншот сохранён: ${QR_PATH}`);

  // Ждём сигнала из файла ready.txt
  console.log('Ожидаю файл ready.txt...');
  while (!fs.existsSync('ready.txt')) {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: QR_PATH });
  }
  fs.unlinkSync('ready.txt');

  await context.storageState({ path: SESSION_PATH });
  console.log(`Сессия сохранена: ${SESSION_PATH}`);
  await browser.close();
})();
