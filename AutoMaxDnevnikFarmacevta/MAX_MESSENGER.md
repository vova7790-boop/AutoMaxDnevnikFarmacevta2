# Автоматизация Max Messenger (web.max.ru)

## Генерация картинки через kie.ai

Модуль: `src/generate-image.ts`

```typescript
import { generateImage } from '../src/generate-image';

await generateImage('prompt на английском', 'test-image.png');
```

**API flow:**
1. `POST https://api.kie.ai/api/v1/jobs/createTask` → получаем `taskId`
2. `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...` → polling каждые 10 сек
3. Когда `data.state === 'success'` → парсим `data.resultJson` → берём `resultUrls[0]`
4. Скачиваем картинку по URL

**Параметры:** model `gpt-image-2-text-to-image`, aspect_ratio `4:3`

---

## Авторизация

Сессия хранится в `session.json` (localStorage, без cookies).

Ключевые поля в localStorage:
- `__oneme_auth` — JWT-токен авторизации
- `__oneme_device_id` — идентификатор устройства

Для обновления сессии запустить локально (нужен дисплей):
```bash
npx ts-node tests/save-session.ts
```
Отсканировать QR в приложении Max, нажать Enter — файл `session.json` сохранится.

## Отправка сообщения в канал

```typescript
const context = await browser.newContext({
  storageState: 'session.json',
  ignoreHTTPSErrors: true,   // обязательно, у web.max.ru проблемы с сертификатом
  viewport: { width: 1280, height: 720 },
});
const page = await context.newPage();

await page.goto('https://web.max.ru/<chat_id>', { waitUntil: 'domcontentloaded' });

// Ждём загрузки SPA (занимает ~3–8 сек)
await page.waitForFunction(() => document.body.innerText.length > 50, { timeout: 30000 });
await page.waitForTimeout(3000);

// 1. Поле ввода поста — contenteditable с placeholder="Пост"
const messageInput = page.locator('[contenteditable][placeholder="Пост"]');
await messageInput.waitFor({ state: 'visible', timeout: 20000 });
await messageInput.click();

// Для текста с эмодзи и переносами строк — только через execCommand, не keyboard.type()
await page.evaluate((text) => {
  const el = document.querySelector('[contenteditable][placeholder="Пост"]') as HTMLElement;
  el.focus();
  document.execCommand('insertText', false, text);
}, 'текст сообщения');

// 2. Кнопка отправки — синий круг со стрелкой вверх, правый нижний угол
const sendButton = page.locator('button.svelte-1cuof8n');
await sendButton.waitFor({ state: 'visible', timeout: 5000 });
await sendButton.click();
```

## Отправка фото с текстом

```typescript
// 1. Открыть меню прикрепления (скрепка, левый нижний угол поля ввода)
const attachButton = page.locator('button.button--neutral-link.button--link').first();
await attachButton.click();

// 2. Выбрать "Фото или видео" из меню и передать файл
const photoMenuItem = page.locator('button.actionsMenuItem', { hasText: 'Фото или видео' });
await photoMenuItem.waitFor({ state: 'visible', timeout: 5000 });

const [fileChooser] = await Promise.all([
  page.waitForEvent('filechooser', { timeout: 5000 }),
  photoMenuItem.click(),
]);
await fileChooser.setFiles('/абсолютный/путь/к/файлу.png');

// 3. Ввести текст с форматированием через клавиатуру (после attach — только keyboard, не insertHTML)
await messageInput.click();
await page.waitForTimeout(300);

// Жирный заголовок
await page.keyboard.press('Control+b');
await page.keyboard.type('🫀 Заголовок поста');
await page.keyboard.press('Control+b');

// Пустая строка между абзацами — двойной Shift+Enter
await page.keyboard.press('Shift+Enter');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('Текст первого абзаца.');

await page.keyboard.press('Shift+Enter');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('Текст второго абзаца.');

// Перед вопросом — пустая строка (двойной Shift+Enter)
await page.keyboard.press('Shift+Enter');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('Вопрос к аудитории?');

// Ответы — одинарный Shift+Enter (новая строка, без пустой строки)
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('👍 — да');
await page.keyboard.press('Shift+Enter');
await page.keyboard.type('❤️ — нет');

// 4. Отправить
const sendButton = page.locator('button.svelte-1cuof8n');
await sendButton.waitFor({ state: 'visible', timeout: 5000 });
await sendButton.click();
```

### Правила форматирования

| Действие | Клавиши |
|---|---|
| Жирный текст | `Ctrl+B` (включить) → текст → `Ctrl+B` (выключить) |
| Пустая строка между абзацами | `Shift+Enter` дважды |
| Новая строка без пустой строки | `Shift+Enter` один раз |

> После прикрепления файла `insertHTML` не работает — использовать только `keyboard.type()` / `keyboard.press()`.

### Селекторы (актуальны на апрель 2026)

| Элемент | Селектор |
|---|---|
| Поле ввода поста | `[contenteditable][placeholder="Пост"]` |
| Кнопка прикрепления файла | `button.button--neutral-link.button--link` (первая) |
| Пункт меню "Фото или видео" | `button.actionsMenuItem` с текстом `Фото или видео` |
| Кнопка отправки | `button.svelte-1cuof8n` |

> Svelte-классы могут измениться после обновления сайта. Если кнопка не найдена — перепроверить через `page.evaluate` все `button` на странице после набора текста.

## ID каналов

| Название | URL |
|---|---|
| тест | `https://web.max.ru/-74167276777563` |
