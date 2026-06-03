const { chromium } = require('playwright');
const fs = require('fs');

const QR_PATH = 'qr-screenshot.png';
const SESSION_PATH = 'session.json';
const DONE_FLAG = '/tmp/qr-login-done.flag';
const STATUS_FILE = '/tmp/qr-login-status.txt';

function setStatus(s) {
  try { fs.writeFileSync(STATUS_FILE, s + '\n', { flag: 'a' }); } catch {}
  console.log(s);
}

(async () => {
  if (fs.existsSync(DONE_FLAG)) fs.unlinkSync(DONE_FLAG);
  try { fs.writeFileSync(STATUS_FILE, ''); } catch {}

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 800 } });
  const page = await context.newPage();

  await page.goto('https://web.max.ru/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);

  // Снимаем QR (canvas, если есть, иначе всю страницу)
  async function snapQR() {
    const canvas = await page.$('canvas');
    if (canvas) {
      try { await canvas.screenshot({ path: QR_PATH }); return 'canvas'; } catch {}
    }
    await page.screenshot({ path: QR_PATH, fullPage: false });
    return 'page';
  }

  const kind = await snapQR();
  setStatus('QR_CAPTURED:' + kind);

  // Признак успешного входа: исчезает QR canvas И появляется список чатов / поле ввода
  function loggedInCheck() {
    return page.evaluate(() => {
      const hasInput = !!document.querySelector('[contenteditable]');
      const text = document.body.innerText || '';
      const hasChats = text.length > 400;
      const hasCanvas = !!document.querySelector('canvas');
      return { hasInput, hasChats, hasCanvas, url: location.href };
    });
  }

  const PW_PATH = '/tmp/max-password.txt';
  let pwSubmitted = false;

  // Пытается заполнить экран доп.пароля, если он появился
  async function tryPassword() {
    const pwInput = await page.$('input[type="password"]');
    if (!pwInput) return false;
    if (pwSubmitted) return true;
    if (!fs.existsSync(PW_PATH)) { setStatus('PASSWORD_SCREEN_WAITING_FILE'); return true; }
    const pw = fs.readFileSync(PW_PATH, 'utf-8').trim();
    if (!pw) { setStatus('PASSWORD_FILE_EMPTY'); return true; }
    await pwInput.fill(pw);
    await page.waitForTimeout(500);
    const btn = await page.$('button:has-text("Continue"), button:has-text("Продолжить"), button[type="submit"]');
    if (btn) { await btn.click(); } else { await page.keyboard.press('Enter'); }
    pwSubmitted = true;
    setStatus('PASSWORD_SUBMITTED');
    await page.waitForTimeout(4000);
    return true;
  }

  const deadline = Date.now() + 5 * 60 * 1000; // ждём вход до 5 минут
  let loggedIn = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000);

    // Сначала проверяем экран доп.пароля
    try { if (await tryPassword()) { /* возможно ещё грузится */ } } catch (e) { setStatus('PW_ERR:' + e.message); }

    let st;
    try { st = await loggedInCheck(); } catch { continue; }
    const hasPwScreen = await page.$('input[type="password"]').then(Boolean).catch(() => false);
    // Пока не вошёл (есть QR-экран, нет поля ввода и нет экрана пароля) — обновляем QR, он протухает
    if (!st.hasInput && !hasPwScreen && st.url.includes('web.max.ru') && !st.hasChats) {
      await snapQR();
      setStatus('QR_REFRESHED:' + Date.now());
      continue;
    }
    if (st.hasInput || st.hasChats) {
      // Двойная проверка через 4с, чтобы не словить переходный экран
      await page.waitForTimeout(4000);
      const st2 = await loggedInCheck();
      if (st2.hasInput || (!st2.hasCanvas && st2.hasChats)) {
        loggedIn = true;
        break;
      }
    }
  }

  if (loggedIn) {
    await page.waitForTimeout(3000);
    await context.storageState({ path: SESSION_PATH });
    try { await page.screenshot({ path: 'qr-after-scan.png' }); } catch {}
    setStatus('SESSION_SAVED');
  } else {
    setStatus('TIMEOUT_NO_LOGIN');
  }

  await browser.close();
  fs.writeFileSync(DONE_FLAG, loggedIn ? 'ok' : 'timeout');
})().catch((e) => {
  setStatus('ERROR:' + e.message);
  try { fs.writeFileSync(DONE_FLAG, 'error'); } catch {}
  process.exit(1);
});
