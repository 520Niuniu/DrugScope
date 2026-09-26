import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'drugscope-screening';
const ALLOWED_EXTENSIONS = new Set(['.csv', '.txt', '.xls', '.xlsx']);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function hiddenPrompt(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trimEnd();
  }

  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const onData = character => {
      if (character === '\u0003') {
        stdin.off('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        reject(new Error('Cancelled'));
      } else if (character === '\r' || character === '\n') {
        stdin.off('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
        stdout.write('\n');
        resolve(value);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else if (character >= ' ') {
        value += character;
      }
    };
    stdin.on('data', onData);
  });
}

const args = process.argv.slice(2);
const replace = args.includes('--replace');
const directoryArgument = args.find(argument => argument !== '--replace');

if (!directoryArgument) {
  console.error('Usage: npm run upload:screening-data -- <directory-outside-repository> [--replace]');
  process.exit(1);
}

const sourceDirectory = path.resolve(directoryArgument);
if (isInside(root, sourceDirectory)) {
  console.error('Refusing to upload from inside the Git repository. Keep confidential source files elsewhere.');
  process.exit(1);
}

const directoryStats = await stat(sourceDirectory).catch(() => null);
if (!directoryStats?.isDirectory()) {
  console.error(`Source directory does not exist: ${sourceDirectory}`);
  process.exit(1);
}

const entries = (await readdir(sourceDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
  .filter(entry => Buffer.byteLength(entry.name, 'utf8') <= 240)
  .sort((left, right) => left.name.localeCompare(right.name));

if (entries.length === 0) {
  console.error('No supported .csv, .txt, .xls, or .xlsx files were found.');
  process.exit(1);
}

const prompt = createInterface({ input: stdin, output: stdout });
const siteID = String(await prompt.question('Netlify Project ID: ')).trim();
prompt.close();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteID)) {
  console.error('The Netlify Project ID must be a UUID from Project configuration > General.');
  process.exit(1);
}

let token = String(await hiddenPrompt('Netlify Personal Access Token (hidden): ')).trim();
if (token.length < 20) {
  console.error('The access token is missing or invalid.');
  process.exit(1);
}

try {
  const store = getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
  let uploaded = 0;
  let skipped = 0;

  for (const entry of entries) {
    const fullPath = path.join(sourceDirectory, entry.name);
    const details = await stat(fullPath);
    const contents = await readFile(fullPath);
    const metadata = {
      bytes: details.size,
      sha256: createHash('sha256').update(contents).digest('hex'),
      uploadedAt: new Date().toISOString()
    };
    const options = { metadata };
    if (!replace) options.onlyIfNew = true;

    const result = await store.set(entry.name, contents, options);
    if (result.modified) uploaded += 1;
    else skipped += 1;
  }

  console.log(`Upload complete: ${uploaded} added or replaced, ${skipped} already existed.`);
  console.log(`Store: ${STORE_NAME}; source files remain outside the repository.`);
} finally {
  // The token is intentionally never persisted.
  token = '';
  process.exitCode ??= 0;
}
