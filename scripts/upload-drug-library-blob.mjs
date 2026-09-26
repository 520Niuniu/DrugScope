import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process, { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { getStore } from '@netlify/blobs';

const STORE_NAME = 'drugscope-library';
const LIBRARY_KEY = 'FDA-approved-drug-library.xlsx';
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

const fileArgument = process.argv[2];
if (!fileArgument) {
  console.error('Usage: npm run upload:drug-library -- <xlsx-file-outside-repository>');
  process.exit(1);
}

const sourceFile = path.resolve(fileArgument);
if (isInside(root, sourceFile)) {
  console.error('Refusing to upload from inside the Git repository. Keep the licensed workbook outside the repository.');
  process.exit(1);
}

if (path.extname(sourceFile).toLowerCase() !== '.xlsx') {
  console.error('The drug library must be an .xlsx workbook.');
  process.exit(1);
}

const details = await stat(sourceFile).catch(() => null);
if (!details?.isFile()) {
  console.error(`Drug library file does not exist: ${sourceFile}`);
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
  const contents = await readFile(sourceFile);
  const store = getStore({ name: STORE_NAME, siteID, token, consistency: 'strong' });
  await store.set(LIBRARY_KEY, contents, {
    metadata: {
      bytes: details.size,
      sha256: createHash('sha256').update(contents).digest('hex'),
      uploadedAt: new Date().toISOString()
    }
  });
  console.log(`Upload complete: ${LIBRARY_KEY} (${details.size} bytes).`);
  console.log(`Store: ${STORE_NAME}; the source workbook remains outside the repository.`);
} finally {
  token = '';
  process.exitCode ??= 0;
}
