import https from 'https';
import http from 'http';
import fs from 'fs';
import { HttpsProxyAgent } from 'https-proxy-agent';

const API_KEY = '485497e3a8feedb5ebd50d7d124fa034';
const BASE_URL = 'https://api.kie.ai/api/v1/jobs';
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';

function apiRequest(url: string, options: Record<string, unknown> = {}, body?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions: https.RequestOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: (options.method as string) || 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'curl/7.88.1',
        'Accept': '*/*',
        ...(options.headers as Record<string, string> || {}),
      },
      ...(PROXY ? { agent: new HttpsProxyAgent(PROXY) } : {}),
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function downloadFile(url: string, dest: string, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const protocol = isHttps ? https : http;
    const getOptions: https.RequestOptions = PROXY && isHttps ? { agent: new HttpsProxyAgent(PROXY) } : {};
    protocol.get(url, getOptions, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects <= 0) return reject(new Error('Too many redirects'));
        return resolve(downloadFile(res.headers.location, dest, redirects - 1));
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} downloading image`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function createTask(prompt: string): Promise<string> {
  const body = JSON.stringify({
    model: 'gpt-image-2-text-to-image',
    input: { prompt, aspect_ratio: '4:3' },
  });
  const res = await apiRequest(`${BASE_URL}/createTask`, { method: 'POST' }, body) as { code: number; data: { taskId: string } };
  if (res.code !== 200) throw new Error(`Task creation failed: ${JSON.stringify(res)}`);
  return res.data.taskId;
}

async function pollResult(taskId: string, timeoutMs: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const elapsed = Math.round((Date.now() - start) / 1000);
    const res = await apiRequest(`${BASE_URL}/recordInfo?taskId=${taskId}`) as {
      code: number;
      data: { state: string; resultJson: string; failMsg: string };
    };

    if (res.code === 200) {
      const { state, resultJson, failMsg } = res.data;
      console.log(`[${elapsed}s] Image state: ${state}`);
      if (state === 'success') {
        const { resultUrls } = JSON.parse(resultJson) as { resultUrls: string[] };
        return resultUrls[0];
      }
      if (state === 'fail') throw new Error(`KIE_AI_GENERATION_FAILED: ${failMsg || 'unknown error from kie.ai'}`);
    } else {
      console.log(`[${elapsed}s] API response code: ${res.code}`);
    }

    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error('KIE_AI_TIMEOUT');
}

function simplifyPrompt(prompt: string): string {
  // Keep only the first sentence and add a minimal style directive
  const first = prompt.split(/[.;]/)[0].trim();
  return `${first}. Flat design, white background, minimal detail.`;
}

export async function generateImage(prompt: string, outputPath: string): Promise<void> {
  console.log(`Generating image: "${prompt}"`);
  const FIVE_MIN = 300000;

  let taskId = await createTask(prompt);
  console.log(`Task created: ${taskId}`);

  let imageUrl: string;
  try {
    imageUrl = await pollResult(taskId, FIVE_MIN);
  } catch (err) {
    if (err instanceof Error && err.message === 'KIE_AI_TIMEOUT') {
      const simplified = simplifyPrompt(prompt);
      console.log(`\n⚠️ Таймаут 5 мин. Упрощаю промт и повторяю: "${simplified}"`);
      taskId = await createTask(simplified);
      console.log(`Retry task created: ${taskId}`);
      try {
        imageUrl = await pollResult(taskId, FIVE_MIN);
      } catch (retryErr) {
        throw new Error('KIE_AI_TIMEOUT_AFTER_RETRY: генерация не завершилась за 10 минут даже с упрощённым промтом');
      }
    } else {
      throw err;
    }
  }

  console.log(`Image ready: ${imageUrl}`);
  await downloadFile(imageUrl, outputPath);
  console.log(`Image saved to: ${outputPath}`);
}
