import { chromium } from '@playwright/test';
import path from 'path';

const SESSION_PATH = path.resolve('session.json');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  await page.goto('https://web.max.ru/-74167276777563');

  console.log('Войдите в аккаунт Max (отсканируйте QR или войдите через телефон).');
  console.log('После успешного входа и загрузки чата нажмите Enter в этом терминале...');

  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  await context.storageState({ path: SESSION_PATH });
  console.log(`Сессия сохранена в ${SESSION_PATH}`);

  await browser.close();
})();
