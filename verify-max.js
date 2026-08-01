const { chromium } = require('playwright');
const path = require('path');
const PROFILE_DIR = path.resolve('browser-profile');
const PROXY = process.env.MAX_PROXY || process.env.HTTPS_PROXY || 'http://127.0.0.1:32797';
(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false, executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox','--disable-setuid-sandbox'],
    proxy: { server: PROXY }, ignoreHTTPSErrors: true, viewport:{width:1280,height:720},
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://web.max.ru/0', { waitUntil:'domcontentloaded', timeout:45000 });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout:40000 }).catch(()=>{});
  await page.waitForTimeout(4000);
  await page.screenshot({ path:'verify-max.png' });
  const st = await page.evaluate(() => ({
    len: (document.body.innerText||'').length,
    input: document.querySelectorAll('[contenteditable]').length,
    hasQR: /Sign in to MAX|QR code|QR-код|Войдите/i.test(document.body.innerText||''),
    sample: (document.body.innerText||'').replace(/\s+/g,' ').slice(0,140),
  }));
  console.log('VERIFY ' + JSON.stringify(st));
  await ctx.close();
})().catch(e=>{ console.log('VERIFY_ERR:'+e.message); process.exit(1); });
