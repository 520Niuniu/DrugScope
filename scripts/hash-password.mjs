import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/hash-password.mjs user@example.com');
  process.exit(1);
}

async function hiddenPrompt(label) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8').trimEnd();
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  return new Promise((resolve, reject) => {
    let value = '';
    const onData = character => {
      if (character === '\u0003') {
        process.stdin.setRawMode(false);
        reject(new Error('Cancelled'));
      } else if (character === '\r' || character === '\n') {
        process.stdin.off('data', onData);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(value);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else if (character >= ' ') {
        value += character;
      }
    };
    process.stdin.on('data', onData);
  });
}

const password = await hiddenPrompt('Password: ');
if (password.length < 12) {
  console.error('Password must contain at least 12 characters.');
  process.exit(1);
}
const salt = randomBytes(16).toString('base64url');
const derived = await scrypt(password, salt, 64);
console.log(JSON.stringify({ email, name: email, passwordHash: `scrypt$${salt}$${derived.toString('base64url')}` }, null, 2));
