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

  // Session restore from IndexedDB can take several seconds; poll up to ~24s
  // and settle on either the QR sign-in screen or the loaded chat list.
  const evalState = () => page.evaluate(() => {
    const t = document.body.innerText || '';
    // The QR login screen is short and shows ONLY the sign-in prompt; once the
    // app loads its chat list, the same strings may appear in Settings, so we
    // only treat it as the sign-in screen when the page is still short.
    const signInScreen = /Sign in to MAX|Sign in with phone/i.test(t) && t.length < 600;
    return {
      hasInput: !!document.querySelector('[contenteditable]'),
      hasPw: !!document.querySelector('input[type="password"]'),
      hasChatList: /\bChats\b|\bContacts\b|\bSettings\b|\bКаналы\b/.test(t),
      signInScreen,
      len: t.length,
      url: location.href,
      snippet: t.slice(0, 200).replace(/\n+/g, ' | '),
    };
  }).catch((e) => ({ err: e.message }));

  let st = {};
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    st = await evalState();
    if (st.hasPw || st.signInScreen) break;
    if (st.hasChatList || st.hasInput) break;
  }

  await page.screenshot({ path: 'max-access-check.png' }).catch(() => {});
  console.log('RESULT ' + JSON.stringify(st, null, 2));

  let verdict = 'UNKNOWN';
  if (st.hasChatList || st.hasInput) verdict = 'LOGGED_IN';
  else if (st.signInScreen || st.hasPw) verdict = 'NOT_LOGGED_IN';
  console.log('VERDICT ' + verdict);

  await ctx.close();
})().catch((e) => { console.log('FATAL:' + e.message); process.exit(1); });
