import https from 'https';
import http from 'http';
import fs from 'fs';

const API_KEY = '485497e3a8feedb5ebd50d7d124fa034';
const BASE_URL = 'https://api.kie.ai/api/v1/jobs';

function apiRequest(url: string, options: Record<string, unknown> = {}, body?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOptions = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: (options.method as string) || 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
      },
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
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (res) => {
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

async function pollResult(taskId: string, timeoutMs = 300000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await apiRequest(`${BASE_URL}/recordInfo?taskId=${taskId}`) as {
      code: number;
      data: { state: string; resultJson: string; failMsg: string };
    };

    if (res.code === 200) {
      const { state, resultJson, failMsg } = res.data;
      if (state === 'success') {
        const { resultUrls } = JSON.parse(resultJson) as { resultUrls: string[] };
        return resultUrls[0];
      }
      if (state === 'fail') throw new Error(`Generation failed: ${failMsg}`);
    }

    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error('Image generation timed out after 120s');
}

export async function generateImage(prompt: string, outputPath: string): Promise<void> {
  console.log(`Generating image: "${prompt}"`);
  const taskId = await createTask(prompt);
  console.log(`Task created: ${taskId}`);

  const imageUrl = await pollResult(taskId);
  console.log(`Image ready: ${imageUrl}`);

  await downloadFile(imageUrl, outputPath);
  console.log(`Image saved to: ${outputPath}`);
}
