const { chromium } = require('./node_modules/playwright/index');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: {width: 500, height: 500} });
  const page = await context.newPage();
  await page.goto('https://web.max.ru', { timeout: 30000 });
  await page.waitForTimeout(5000);

  const qrEl = await page.$('canvas');
  if (qrEl) {
    await qrEl.screenshot({ path: 'qr-screenshot.png' });
    console.log('canvas captured');
  } else {
    await page.screenshot({ path: 'qr-screenshot.png', fullPage: false });
    console.log('page captured');
  }

  // Ждём сигнала
  console.log('Waiting for scan signal...');
  while (!fs.existsSync('/tmp/qr-ready-scan.flag')) {
    await new Promise(r => setTimeout(r, 1000));
  }

  await new Promise(r => setTimeout(r, 4000));
  await page.screenshot({ path: 'qr-after-scan.png' });
  await context.storageState({ path: 'session.json' });
  console.log('Session saved!');
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
