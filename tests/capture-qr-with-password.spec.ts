import { test } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.resolve('browser-profile');
const QR_PATH = path.resolve('qr-screenshot.png');
const PASSWORD = process.env.MAX_PASSWORD || '';

test('capture QR and save session with password', async ({ playwright }) => {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    proxy: { server: 'http://127.0.0.1:46877' },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  await page.goto('https://web.max.ru/-74167276777563', { waitUntil: 'domcontentloaded', timeout: 30000 });
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

  // После сканирования QR ждём появления поля для пароля
  console.log('Проверяю наличие поля для пароля...');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: QR_PATH });

  // Ищем поле ввода пароля
  const passwordInput = page.locator('input[type="password"]');
  const passwordVisible = await passwordInput.isVisible().catch(() => false);

  if (passwordVisible) {
    console.log('Найдено поле для пароля, ввожу пароль...');
    await passwordInput.fill(PASSWORD);
    await page.waitForTimeout(500);
    await passwordInput.press('Enter');
    await page.waitForTimeout(3000);
    console.log('Пароль введён.');
  } else {
    console.log('Поле пароля не найдено, продолжаю...');
  }

  await page.waitForTimeout(5000);
  await page.screenshot({ path: QR_PATH });
  console.log(`Профиль браузера сохранён: ${PROFILE_DIR}`);

  await context.close();
});
