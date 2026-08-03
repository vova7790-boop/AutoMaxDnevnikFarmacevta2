import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf-8').split('\n')) {
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0 && !line.trimStart().startsWith('#')) {
      const key = line.slice(0, eqIndex).trim();
      const value = line.slice(eqIndex + 1).trim();
      if (key) process.env[key] = value;
    }
  }
}

const proxyServer = process.env.MAX_PROXY || process.env.HTTPS_PROXY;

export default defineConfig({
  testDir: './tests',
  timeout: 180000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    ignoreHTTPSErrors: true,
    // Прокси для fixture-тестов (browser/page). Задаётся, только если есть
    // MAX_PROXY/HTTPS_PROXY — иначе Playwright пытается ходить напрямую.
    ...(proxyServer ? { proxy: { server: proxyServer } } : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: '/opt/pw-browsers/chromium',
          headless: false,
          // --ssl-version-max=tls1.2 обязателен: егресс-прокси сбрасывает большой
          // TLS 1.3 ClientHello Chromium (пост-квантовый keyshare).
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--ssl-version-max=tls1.2'],
        },
      },
    },
  ],
});
