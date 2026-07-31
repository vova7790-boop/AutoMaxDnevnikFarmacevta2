// QR-логин в Max с сохранением авторизации в постоянный профиль (browser-profile),
// который использует send-post.spec.ts. Прокси берём из окружения (актуальный порт сессии).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const PROFILE_DIR = path.resolve('browser-profile');
const PROXY = process.env.MAX_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:32797';
const QR_PATH = path.resolve('qr-current.png');
const PW_PATH = '/tmp/max-password.txt';
const DONE = '/tmp/max-login-done.flag';
const STATUS = '/tmp/max-login-status.txt';

function log(s) { try { fs.appendFileSync(STATUS, s + '\n'); } catch {} console.log(s); }

(async () => {
  try { fs.writeFileSync(STATUS, ''); } catch {}
  if (fs.existsSync(DONE)) { try { fs.unlinkSync(DONE); } catch {} }

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    proxy: { server: PROXY },
    ignoreHTTPSErrors: true,
    viewport: { width: 820, height: 820 },
  });
  log('PROXY=' + PROXY);
  const page = context.pages()[0] || await context.newPage();

  await page.goto('https://web.max.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);

  async function snapQR() {
    try { await page.screenshot({ path: QR_PATH }); } catch (e) { log('SNAP_ERR:' + e.message); }
  }
  await snapQR();
  log('QR_CAPTURED');

  let pwSubmitted = false;
  async function tryPassword() {
    const pw = await page.$('input[type="password"]');
    if (!pw || pwSubmitted) return;
    if (!fs.existsSync(PW_PATH)) { log('PW_WAIT_FILE'); return; }
    const val = fs.readFileSync(PW_PATH, 'utf-8').trim();
    if (!val) return;
    await pw.fill(val);
    await page.waitForTimeout(500);
    const btn = await page.$('button:has-text("Continue"), button:has-text("Продолжить"), button:has-text("Далее"), button:has-text("Войти"), button[type="submit"]');
    if (btn) { await btn.click(); } else { await page.keyboard.press('Enter'); }
    pwSubmitted = true;
    log('PASSWORD_SUBMITTED');
    await page.waitForTimeout(5000);
  }

  async function check() {
    return page.evaluate(() => {
      const t = document.body.innerText || '';
      return {
        hasInput: !!document.querySelector('[contenteditable]'),
        hasPw: !!document.querySelector('input[type="password"]'),
        hasCanvas: !!document.querySelector('canvas'),
        len: t.length,
        url: location.href,
        snippet: t.replace(/\s+/g, ' ').slice(0, 130),
      };
    });
  }

  const deadline = Date.now() + 10 * 60 * 1000; // ждём вход до 10 минут
  let ok = 0, loggedIn = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000);
    try { await tryPassword(); } catch (e) { log('PWERR:' + e.message); }
    let st;
    try { st = await check(); } catch { continue; }
    try { await page.screenshot({ path: 'max-login-live.png' }); } catch {}

    if (st.hasPw) { log('PW_SCREEN | ' + st.snippet); ok = 0; continue; }
    if (st.hasCanvas) { await snapQR(); log('QR_REFRESHED | ' + st.snippet); ok = 0; continue; }
    if (st.url.includes('web.max.ru') && (st.hasInput || st.len > 200)) {
      ok++;
      log('MAYBE_IN streak=' + ok + ' input=' + st.hasInput + ' len=' + st.len + ' | ' + st.snippet);
      if (ok >= 2) { loggedIn = true; break; }
    } else {
      // экран входа без canvas (возможно QR как img) — тоже обновим снимок
      await snapQR();
      log('LOGIN_SCREEN | ' + st.snippet);
    }
  }

  if (loggedIn) {
    await page.waitForTimeout(3000);
    try { await page.screenshot({ path: 'max-login-after.png' }); } catch {}
    log('LOGGED_IN');
  } else {
    log('TIMEOUT_NO_LOGIN');
  }
  await context.close();
  fs.writeFileSync(DONE, loggedIn ? 'ok' : 'timeout');
})().catch((e) => {
  log('FATAL:' + e.message);
  try { fs.writeFileSync(DONE, 'error'); } catch {}
  process.exit(1);
});
