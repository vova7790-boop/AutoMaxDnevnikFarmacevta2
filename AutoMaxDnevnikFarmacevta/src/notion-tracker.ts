import https from 'https';

const NOTION_TOKEN = process.env.NOTION_TOKEN ?? '';
const DATABASE_ID = '91afb55f97924f8382e79852e67aee07';
const NOTION_VERSION = '2022-06-28';

function notionRequest(method: string, path: string, body?: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'api.notion.com',
        path: `/v1${path}`,
        method,
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
          ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      }
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function checkArticleByUrl(
  url: string
): Promise<{ urlMatch: boolean; recentDescriptions: string[] }> {
  const urlCheckRes = (await notionRequest('POST', `/databases/${DATABASE_ID}/query`, {
    filter: { property: 'URL', url: { equals: url } },
    page_size: 1,
  })) as { results: unknown[] };

  const urlMatch = urlCheckRes.results.length > 0;

  const recentRes = (await notionRequest('POST', `/databases/${DATABASE_ID}/query`, {
    sorts: [{ property: 'Дата', direction: 'descending' }],
    page_size: 20,
  })) as {
    results: Array<{
      properties: {
        'Краткое но точное описание сути статьи': { rich_text: Array<{ plain_text: string }> };
      };
    }>;
  };

  const recentDescriptions = recentRes.results
    .map((page) => {
      const rt = page.properties['Краткое но точное описание сути статьи']?.rich_text;
      return rt?.map((t) => t.plain_text).join('') ?? '';
    })
    .filter(Boolean);

  return { urlMatch, recentDescriptions };
}

export async function saveArticle(params: {
  title: string;
  url: string;
  date: string;
  description: string;
}): Promise<void> {
  const res = (await notionRequest('POST', '/pages', {
    parent: { database_id: DATABASE_ID },
    properties: {
      Заголовок: { title: [{ text: { content: params.title } }] },
      URL: { url: params.url },
      Дата: { date: { start: params.date } },
      'Краткое но точное описание сути статьи': {
        rich_text: [{ text: { content: params.description } }],
      },
    },
  })) as { object: string; id?: string; message?: string };

  if (res.object !== 'page') {
    throw new Error(`Notion saveArticle failed: ${JSON.stringify(res)}`);
  }
}
