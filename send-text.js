// Быстрая отправка ТОЛЬКО текста в канал «Избранное» (web.max.ru/0).
// Использует постоянный профиль browser-profile (авторизация в IndexedDB).
// Текст берётся из переменной окружения MSG (по умолчанию "проверка").
const { chromium } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.resolve('browser-profile');
const CHANNEL_URL = 'https://web.max.ru/0';
const MSG = process.env.MSG || 'проверка';

(async () => {
  const proxyServer = process.env.MAX_PROXY || process.env.HTTPS_PROXY;
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    // --ssl-version-max=tls1.2 обязателен: егресс-прокси сбрасывает большой TLS 1.3 ClientHello.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ssl-version-max=tls1.2'],
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const messageInput = page.locator('[contenteditable][placeholder="Message"], [contenteditable][placeholder="Пост"], [contenteditable]').first();

  let ready = false;
  for (let attempt = 1; attempt <= 3 && !ready; attempt++) {
    console.log(`Открываю канал (попытка ${attempt}/3)...`);
    if (attempt === 1) await page.goto(CHANNEL_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    else await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(3000);
    try { await messageInput.waitFor({ state: 'visible', timeout: 45000 }); ready = true; }
    catch { console.log(`Поле ввода не появилось (попытка ${attempt}/3).`); }
  }
  if (!ready) { console.log('FAIL: поле ввода не появилось'); await ctx.close(); process.exit(1); }

  await messageInput.click();
  await page.waitForTimeout(300);
  await page.keyboard.type(MSG);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/send-text-ready.png' }).catch(() => {});

  const sendButton = page.locator('button.svelte-1cuof8n').first();
  await sendButton.waitFor({ state: 'visible', timeout: 8000 });
  await sendButton.click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/send-text-sent.png' }).catch(() => {});
  console.log('SENT: ' + MSG);
  await ctx.close();
})().catch((e) => { console.log('ERROR:' + e.message); process.exit(1); });
