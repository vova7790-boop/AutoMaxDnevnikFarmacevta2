import { test } from '@playwright/test';
import path from 'path';

const PROFILE_DIR = path.resolve('browser-profile');
const CHANNEL_URL = 'https://web.max.ru/0';

test('probe max connectivity + auth', async ({ playwright }) => {
  test.setTimeout(90000);
  const proxyServer = process.env.MAX_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:36531';
  console.log(`Using proxy: ${proxyServer}`);

  const context = await playwright.chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    proxy: { server: proxyServer },
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/probe-max.png', fullPage: false });

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 400));
  const hasInput = await page.locator('[contenteditable]').count();
  console.log(`BODY_LEN=${bodyText.length} CONTENTEDITABLE_COUNT=${hasInput}`);
  console.log(`BODY_SAMPLE: ${bodyText.replace(/\n/g, ' | ')}`);

  await context.close();
});
