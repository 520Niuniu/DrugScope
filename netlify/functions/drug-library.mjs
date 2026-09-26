import { connectLambda, getStore } from '@netlify/blobs';
import { json, requireSession } from './lib/auth.mjs';

const STORE_NAME = 'drugscope-library';
const LIBRARY_KEY = 'FDA-approved-drug-library.xlsx';
const CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' }, { allow: 'GET' });
  }

  const auth = requireSession(event);
  if (auth.response) return auth.response;

  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const body = await store.get(LIBRARY_KEY, { type: 'arrayBuffer' });
    if (body === null) {
      return json(404, { error: '药物知识库尚未发布' });
    }

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': CONTENT_TYPE,
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(LIBRARY_KEY)}`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff'
      },
      body: Buffer.from(body).toString('base64')
    };
  } catch (error) {
    console.error('Drug library request failed:', error.message);
    return json(500, { error: '无法读取药物知识库' });
  }
}
