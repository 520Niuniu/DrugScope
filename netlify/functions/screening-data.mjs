import { connectLambda, getStore } from '@netlify/blobs';
import { json, requireSession } from './lib/auth.mjs';

const STORE_NAME = 'drugscope-screening';
const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt', '.xls', '.xlsx']);

function extensionOf(fileName) {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function isAllowedKey(key) {
  return Boolean(key)
    && !key.includes('/')
    && !key.includes('\\')
    && key.length <= 240
    && ALLOWED_EXTENSIONS.has(extensionOf(key));
}

function contentType(fileName) {
  const extension = extensionOf(fileName);
  if (extension === '.csv') return 'text/csv; charset=utf-8';
  if (extension === '.txt') return 'text/plain; charset=utf-8';
  if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/vnd.ms-excel';
}

async function getBlobFile(store, fileName) {
  const options = { type: 'arrayBuffer' };
  let body = await store.get(fileName, options);
  if (body !== null) return body;

  // The Lambda edge endpoint can interpret reserved URL-path characters such
  // as `+` before resolving the Blob key. Retry with the path-safe form while
  // retaining the original file name for validation and the response headers.
  const encodedName = encodeURIComponent(fileName);
  if (encodedName !== fileName) body = await store.get(encodedName, options);
  return body;
}

export async function handler(event) {
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return json(405, { error: 'Method not allowed' }, { allow: 'GET, POST' });
  }
  const auth = requireSession(event);
  if (auth.response) return auth.response;

  let requestedName = '';
  if (event.httpMethod === 'POST') {
    try {
      const requestBody = JSON.parse(event.body || '{}');
      requestedName = String(requestBody.file || '');
    } catch {
      return json(400, { error: 'Invalid request body' });
    }
  } else {
    // Keep query-string support for older deployed clients. New clients use a
    // JSON body so reserved characters such as `+` cannot be decoded as space.
    requestedName = String(event.queryStringParameters?.file || '');
  }

  try {
    // This function uses Netlify's Lambda compatibility handler format.
    // Initialize the request-scoped Blobs credentials before opening a store.
    connectLambda(event);
    // `connectLambda` supplies an edge URL, which supports eventual reads. Do
    // not force strong consistency here: the Lambda context does not include
    // the uncached edge URL required for that mode.
    const store = getStore(STORE_NAME);
    if (requestedName) {
      // This dedicated store contains screening files only. Restrict lookups
      // to a single safe file name and supported extension, then read the key
      // directly so every download does not relist all 1,492 objects.
      if (!isAllowedKey(requestedName)) {
        return json(404, { error: '数据文件不存在' });
      }

      const body = await getBlobFile(store, requestedName);
      if (body === null) return json(404, { error: '数据文件不存在' });

      return {
        statusCode: 200,
        isBase64Encoded: true,
        headers: {
          'content-type': contentType(requestedName),
          'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(requestedName)}`,
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff'
        },
        body: Buffer.from(body).toString('base64')
      };
    }

    const { blobs } = await store.list();
    const files = blobs
      .map(entry => entry.key)
      .filter(isAllowedKey)
      .sort((left, right) => left.localeCompare(right));
    if (!files.length) {
      return json(200, { files: [] });
    }
    return json(200, { files: files.map(name => ({ name })) });
  } catch (error) {
    console.error('Blob data request failed:', error.message);
    return json(500, { error: '无法读取已发布的药筛数据' });
  }
}
