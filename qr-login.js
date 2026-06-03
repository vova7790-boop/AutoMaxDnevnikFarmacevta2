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

  const deadline = Date.now() + 5 * 60 * 1000; // ждём вход до 5 минут
  let loggedIn = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(4000);
    let st;
    try { st = await loggedInCheck(); } catch { continue; }
    // Пока не вошёл (есть QR-экран, нет поля ввода) — обновляем картинку QR, он протухает
    if (!st.hasInput && st.url.includes('web.max.ru') && !st.hasChats) {
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
