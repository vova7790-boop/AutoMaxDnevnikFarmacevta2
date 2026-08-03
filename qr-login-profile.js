// Логин в Max через QR прямо в ПОСТОЯННЫЙ профиль browser-profile,
// который использует send-post.spec.ts (авторизация хранится в IndexedDB профиля).
// Снимает свежий QR в qr-screenshot.png, после сканирования при появлении
// экрана пароля вводит пароль из /tmp/max-password.txt.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE_DIR = path.resolve('browser-profile');
const QR_PATH = path.resolve('qr-screenshot.png');
const PW_PATH = '/tmp/max-password.txt';
const STATUS = '/tmp/qr-login-status.txt';
const DONE = '/tmp/qr-login-done.flag';

function status(s) { try { fs.appendFileSync(STATUS, s + '\n'); } catch {} console.log(s); }

(async () => {
  try { fs.writeFileSync(STATUS, ''); } catch {}
  if (fs.existsSync(DONE)) { try { fs.unlinkSync(DONE); } catch {} }

  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--ssl-version-max=tls1.2'],
    proxy: { server: process.env.HTTPS_PROXY || 'http://127.0.0.1:46877' },
    ignoreHTTPSErrors: true,
    viewport: { width: 900, height: 820 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://web.max.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await page.waitForFunction(() => document.body.innerText.length > 30, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(4000);

  async function snapQR() {
    const c = await page.$('canvas');
    if (c) { try { await c.screenshot({ path: QR_PATH }); return 'canvas'; } catch {} }
    await page.screenshot({ path: QR_PATH });
    return 'page';
  }
  await snapQR();
  status('QR_CAPTURED');

  let pwSubmitted = false;
  async function tryPw() {
    const pw = await page.$('input[type="password"]');
    if (!pw || pwSubmitted) return;
    if (!fs.existsSync(PW_PATH)) { status('PW_WAIT_FILE'); return; }
    const v = fs.readFileSync(PW_PATH, 'utf-8').trim();
    if (!v) { status('PW_EMPTY'); return; }
    await pw.fill(v);
    await page.waitForTimeout(400);
    const btn = await page.$('button:has-text("Continue"), button:has-text("Продолжить"), button:has-text("Далее"), button:has-text("Войти"), button[type="submit"]');
    if (btn) await btn.click(); else await page.keyboard.press('Enter');
    pwSubmitted = true;
    status('PW_SUBMITTED');
    await page.waitForTimeout(4000);
  }

  const deadline = Date.now() + 8 * 60 * 1000; // ждём вход до 8 минут
  let ok = false, streak = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000);
    try { await tryPw(); } catch (e) { status('PW_ERR:' + e.message); }
    let st;
    try {
      st = await page.evaluate(() => {
        const t = document.body.innerText || '';
        return {
          hasInput: !!document.querySelector('[contenteditable]'),
          hasPw: !!document.querySelector('input[type="password"]'),
          hasSignIn: /Sign in to MAX|QR code|QR-код|Войдите|Sign in with phone/i.test(t) && t.length < 400,
          len: t.length,
          snip: t.replace(/\s+/g, ' ').slice(0, 120),
          url: location.href,
        };
      });
    } catch { continue; }
    try { await page.screenshot({ path: path.resolve('live-screen.png') }); } catch {}

    if (st.hasSignIn && !st.hasPw) { await snapQR(); status('QR_REFRESHED | ' + st.snip); streak = 0; continue; }
    if (st.hasPw) { status('PW_SCREEN | ' + st.snip); streak = 0; continue; }
    if (st.url.includes('web.max.ru')) {
      streak++;
      status('MAYBE_IN streak=' + streak + ' input=' + st.hasInput + ' len=' + st.len);
      if (streak >= 2 && (st.hasInput || st.len > 200)) { ok = true; break; }
    }
  }

  if (ok) { await page.waitForTimeout(3000); try { await page.screenshot({ path: path.resolve('qr-after-scan.png') }); } catch {} status('LOGGED_IN'); }
  else status('TIMEOUT_NO_LOGIN');
  await ctx.close();
  fs.writeFileSync(DONE, ok ? 'ok' : 'timeout');
})().catch((e) => { status('ERROR:' + e.message); try { fs.writeFileSync(DONE, 'error'); } catch {} process.exit(1); });
