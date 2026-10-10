// ПАРАЛЛЕЛЬНАЯ генерация картинок для всех постов дня через kie.ai.
// Используется ТОЛЬКО когда пользователь явно просит «генерируй параллельно»
// (по умолчанию картинки генерируются по одному внутри send-post.spec.ts).
//
// usage: node scripts/pregen-images.js post-queue/2026-10-19.json
// Картинки сохраняются в post-queue/img/<id>.png; уже готовые пропускаются,
// поэтому скрипт можно перезапускать. При ответе 429 (лимит частоты) — ждёт и повторяет.
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Тот же ключ, что и в src/generate-image.ts.
const API_KEY = process.env.KIE_API_KEY || '485497e3a8feedb5ebd50d7d124fa034';
const BASE = 'https://api.kie.ai/api/v1/jobs';
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const agent = PROXY ? new HttpsProxyAgent(PROXY) : undefined;
const IMG_DIR = path.resolve(__dirname, '..', 'post-queue', 'img');

function req(url, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, agent,
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/7.88.1', Accept: '*/*' } },
      (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); });
    r.on('error', reject); r.setTimeout(60000, () => r.destroy(new Error('req timeout')));
    if (body) r.write(body); r.end();
  });
}
function download(url, dest, n = 5) {
  return new Promise((resolve, reject) => {
    const isH = url.startsWith('https');
    (isH ? https : http).get(url, isH && agent ? { agent } : {}, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (n <= 0) return reject(new Error('Too many redirects'));
        return resolve(download(res.headers.location, dest, n - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const f = fs.createWriteStream(dest); res.pipe(f); f.on('finish', () => f.close(resolve)); f.on('error', reject);
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attempt(prompt, tag) {
  let c;
  for (let k = 0; k < 20; k++) {
    c = await req(`${BASE}/createTask`, 'POST', JSON.stringify({ model: 'gpt-image-2-text-to-image', input: { prompt, aspect_ratio: '4:3' } }));
    if (!c || c.code !== 429) break;
    await sleep(20000 + Math.random() * 20000); // лимит частоты — ждём и повторяем
  }
  if (!c || c.code !== 200) throw new Error('createTask: ' + JSON.stringify(c).slice(0, 200));
  const id = c.data.taskId; const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    await sleep(10000);
    let r; try { r = await req(`${BASE}/recordInfo?taskId=${id}`); } catch { continue; }
    if (r && r.code === 200) {
      if (r.data.state === 'success') return JSON.parse(r.data.resultJson).resultUrls[0];
      if (r.data.state === 'fail') throw new Error('fail: ' + r.data.failMsg);
    }
  }
  throw new Error('timeout ' + tag);
}

async function one(p) {
  const dest = path.join(IMG_DIR, p.id + '.png');
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10000) { console.log(`SKIP ${p.id} (уже есть)`); return true; }
  // Попытка 1 — основной промпт, 2–3 — упрощённый (imagePromptSimple), если он задан.
  const prompts = [p.imagePrompt, p.imagePromptSimple || p.imagePrompt, p.imagePromptSimple || p.imagePrompt];
  for (let i = 0; i < prompts.length; i++) {
    try {
      const url = await attempt(prompts[i], `${p.id}#${i + 1}`);
      await download(url, dest);
      console.log(`OK ${p.id} (попытка ${i + 1}) ${p.title}`);
      return true;
    } catch (e) { console.log(`ERR ${p.id} попытка ${i + 1}: ${e.message}`); }
  }
  return false;
}

(async () => {
  if (!process.argv[2]) { console.error('usage: node scripts/pregen-images.js post-queue/<YYYY-MM-DD>.json'); process.exit(1); }
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const q = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));
  // Небольшой разнос стартов, чтобы не упереться в лимит частоты kie.ai.
  const res = await Promise.all(q.posts.map((p, i) => sleep(i * 3000).then(() => one(p))));
  const bad = q.posts.filter((_, i) => !res[i]).map((p) => p.id);
  if (bad.length) { console.log('PREGEN_FAILED ' + bad.join(',')); process.exit(2); }
  console.log('PREGEN_ALL_OK');
})();
