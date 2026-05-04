import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: path.resolve('session.json'),
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto('https://web.max.ru/-74167276777563', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(4000);

  // Скроллим вниз в правой панели до последнего сообщения
  await page.evaluate(() => {
    const scrollable = document.querySelector('[class*="messages"], [class*="feed"], [class*="scroll"]');
    if (scrollable) scrollable.scrollTop = scrollable.scrollHeight;
  });
  await page.waitForTimeout(1000);

  // Скриншот правой панели целиком
  await page.screenshot({ path: 'test-results/last-message.png', clip: { x: 475, y: 0, width: 805, height: 900 } });

  await browser.close();
})();
