import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { generateImage } from '../src/generate-image';

const SESSION_PATH = path.resolve('session.json');
const IMAGE_PATH = path.resolve('test-image.png');

const IMAGE_PROMPT = 'Medical illustration showing healthy heart, blood pressure monitor, fresh vegetables and herbs on clean white background, modern flat design, blue and green tones, health and wellness concept';

// HTML с форматированием: заголовок жирным, пустые строки между абзацами
const MESSAGE_HTML = [
  '<b>🫀 Давление скачет? Вот что реально работает — без таблеток</b>',
  '<br><br>',
  'Современные кардиологи говорят прямо: при умеренном давлении (до 150/90) начинать надо не с таблеток, а с образа жизни. И это не просто слова — есть конкретные цифры и методы, которые дают измеримый результат.',
  '<br><br>',
  'Например, убрать из рациона лишнюю соль — и верхнее давление падает на 2–8 мм рт. ст. Добавить 5 г клетчатки в день (пара ложек отрубей или горсть чечевицы) — ещё минус 3 мм. Всего пару изменений в еде — и эффект уже виден.',
  '<br><br>',
  'А если давление поднялось прямо сейчас: опусти ноги в горячую воду на 10–15 минут и подышите медленно — вдох на 5 счётов, выдох на 5. Уже через 3–5 минут такого дыхания сосуды расслабятся и станет легче. Главное — при 170/100 и выше это не замена врачу, а первая помощь до него.',
  '<br><br>',
  'Используешь какой-нибудь домашний способ контролировать давление?<br>',
  '👍 — да, есть свой метод<br>',
  '❤️ — нет, только таблетки',
].join('');

test('отправить фото с текстом в канал тест', async ({ browser }) => {
  if (!fs.existsSync(SESSION_PATH)) throw new Error(`Файл сессии не найден: ${SESSION_PATH}`);
  // Генерируем картинку через kie.ai API
  await generateImage(IMAGE_PROMPT, IMAGE_PATH);

  const context = await browser.newContext({
    storageState: SESSION_PATH,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  await page.goto('https://web.max.ru/-74167276777563', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const messageInput = page.locator('[contenteditable][placeholder="Пост"]');
  await messageInput.waitFor({ state: 'visible', timeout: 20000 });

  // Открываем меню прикрепления
  const attachButton = page.locator('button.button--neutral-link.button--link').first();
  await attachButton.click();

  // Кликаем "Фото или видео" и перехватываем file chooser
  const photoMenuItem = page.locator('button.actionsMenuItem', { hasText: 'Фото или видео' });
  await photoMenuItem.waitFor({ state: 'visible', timeout: 5000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    photoMenuItem.click(),
  ]);
  await fileChooser.setFiles(IMAGE_PATH);

  // Ждём появления превью
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/image-attached.png' });

  // Вводим текст поста с клавиатуры
  // Shift+Enter = новая строка без пустой строки
  // Shift+Enter дважды = пустая строка между абзацами
  await messageInput.click();
  await page.waitForTimeout(300);

  // Заголовок жирным
  await page.keyboard.press('Control+b');
  await page.keyboard.type('🫀 Давление скачет? Вот что реально работает — без таблеток');
  await page.keyboard.press('Control+b');

  // Пустая строка после заголовка
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');

  await page.keyboard.type('Современные кардиологи говорят прямо: при умеренном давлении (до 150/90) начинать надо не с таблеток, а с образа жизни. И это не просто слова — есть конкретные цифры и методы, которые дают измеримый результат.');

  // Пустая строка между абзацами
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');

  await page.keyboard.type('Например, убрать из рациона лишнюю соль — и верхнее давление падает на 2–8 мм рт. ст. Добавить 5 г клетчатки в день (пара ложек отрубей или горсть чечевицы) — ещё минус 3 мм. Всего пару изменений в еде — и эффект уже виден.');

  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');

  await page.keyboard.type('А если давление поднялось прямо сейчас: опусти ноги в горячую воду на 10–15 минут и подышите медленно — вдох на 5 счётов, выдох на 5. Уже через 3–5 минут такого дыхания сосуды расслабятся и станет легче. Главное — при 170/100 и выше это не замена врачу, а первая помощь до него.');

  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');

  // Вопрос — перед ним пустая строка уже есть, после него одинарный перенос
  await page.keyboard.type('Используешь какой-нибудь домашний способ контролировать давление?');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('👍 — да, есть свой метод');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('❤️ — нет, только таблетки');

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/message-typed.png' });

  // Кнопка отправки
  const sendButton = page.locator('button.svelte-1cuof8n');
  await sendButton.waitFor({ state: 'visible', timeout: 5000 });
  await sendButton.click();

  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/message-sent.png' });

  await expect(page.locator('text=Давление скачет').first()).toBeVisible({ timeout: 10000 });

  await context.close();
});
