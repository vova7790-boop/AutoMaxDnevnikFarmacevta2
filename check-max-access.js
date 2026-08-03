// Быстрая проверка доступа к Max: открывает web.max.ru с профилем browser-profile
// и определяет, залогинены мы или показывается экран входа.
const { chromium } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.resolve('browser-profile');

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ssl-version-max=tls1.2'],
    proxy: { server: process.env.MAX_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:46877' },
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://web.max.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('GOTO_ERR:' + e.message));
  await page.waitForFunction(() => document.body.innerText.length > 30, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);

  const st = await page.evaluate(() => {
    const t = document.body.innerText || '';
    return {
      hasInput: !!document.querySelector('[contenteditable]'),
      hasPw: !!document.querySelector('input[type="password"]'),
      hasSignIn: /Sign in to MAX|QR code|QR-код|Войдите|Sign in with phone/i.test(t),
      len: t.length,
      url: location.href,
      snippet: t.slice(0, 200).replace(/\n+/g, ' | '),
    };
  }).catch((e) => ({ err: e.message }));

  await page.screenshot({ path: 'max-access-check.png' }).catch(() => {});
  console.log('RESULT ' + JSON.stringify(st, null, 2));

  let verdict = 'UNKNOWN';
  if (st.hasSignIn || st.hasPw) verdict = 'NOT_LOGGED_IN';
  else if (st.hasInput || (st.url && st.url.includes('web.max.ru') && st.len > 200)) verdict = 'LOGGED_IN';
  console.log('VERDICT ' + verdict);

  await ctx.close();
})().catch((e) => { console.log('FATAL:' + e.message); process.exit(1); });
