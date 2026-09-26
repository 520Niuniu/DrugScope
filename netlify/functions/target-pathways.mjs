import { json, requireSession } from './lib/auth.mjs';

const REACTOME_SEARCH_URL = 'https://reactome.org/ContentService/search/query';
const MAX_TARGET_LENGTH = 80;
const MAX_PATHWAYS = 8;
const REQUEST_TIMEOUT_MS = 10000;
const ALLOWED_TARGET = /^[\p{L}\p{N}\s._()+,\/:'’;&\-]+$/u;

function normalizeText(value, maxLength = 400) {
  const source = Array.isArray(value) ? value.join(' ') : String(value || '');
  const text = source
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export function normalizeTarget(value) {
  const rawTarget = String(value || '');
  if (/[\u0000-\u001f\u007f]/.test(rawTarget)) return '';
  const target = rawTarget.replace(/\s+/g, ' ').trim();
  if (!target || target.length > MAX_TARGET_LENGTH || !ALLOWED_TARGET.test(target)) return '';
  return target;
}

export function normalizeReactomePayload(payload) {
  const clusters = Array.isArray(payload?.results) ? payload.results : [];
  const seen = new Set();
  const pathways = [];

  for (const cluster of clusters) {
    const entries = Array.isArray(cluster?.entries)
      ? cluster.entries
      : Array.isArray(cluster?.rows) ? cluster.rows : [];

    for (const entry of entries) {
      const id = String(entry?.stId || '').trim();
      const species = (Array.isArray(entry?.species) ? entry.species : [])
        .map(item => normalizeText(typeof item === 'string' ? item : item?.displayName || item?.name, 80))
        .filter(Boolean);
      const isHuman = species.some(item => item.toLowerCase() === 'homo sapiens') || /^R-HSA-\d+$/.test(id);
      const isPathway = String(entry?.type || cluster?.typeName || '').toLowerCase() === 'pathway';
      if (!isPathway || !isHuman || !/^R-HSA-\d+$/.test(id) || seen.has(id)) continue;

      seen.add(id);
      pathways.push({
        id,
        name: normalizeText(entry?.name, 180) || id,
        species: species.length ? species : ['Homo sapiens'],
        summary: normalizeText(entry?.summation, 400),
        isDisease: Boolean(entry?.isDisease),
        url: `https://reactome.org/content/detail/${id}`
      });
      if (pathways.length >= MAX_PATHWAYS) break;
    }
    if (pathways.length >= MAX_PATHWAYS) break;
  }

  const reportedTotal = Number(payload?.numberOfMatches ?? payload?.found);
  return {
    total: Number.isFinite(reportedTotal) && reportedTotal >= pathways.length ? reportedTotal : pathways.length,
    pathways
  };
}

async function requestReactome(target) {
  const params = new URLSearchParams({
    query: target,
    species: 'Homo sapiens',
    types: 'Pathway',
    cluster: 'true'
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${REACTOME_SEARCH_URL}?${params}`, {
        headers: { accept: 'application/json' },
        signal: controller.signal
      });
      if (response.ok) return response.json();
      if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
      throw new Error(`Reactome returned HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 0) continue;
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Reactome request failed');
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' }, { allow: 'POST' });
  }

  const auth = requireSession(event);
  if (auth.response) return auth.response;

  let target;
  try {
    target = normalizeTarget(JSON.parse(event.body || '{}')?.target);
  } catch {
    return json(400, { error: 'Invalid request body' });
  }
  if (!target) {
    return json(400, { error: '靶点格式无效或过长' });
  }

  try {
    const normalized = normalizeReactomePayload(await requestReactome(target));
    return json(200, { target, source: 'Reactome', ...normalized });
  } catch (error) {
    console.error('Reactome pathway request failed:', error?.name || 'Error');
    return json(502, { error: 'Reactome 通路服务暂时无法访问，请稍后重试' });
  }
}
