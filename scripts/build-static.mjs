import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, 'dist');

if (path.dirname(output) !== root || path.basename(output) !== 'dist') {
  throw new Error(`Refusing to clean unexpected output directory: ${output}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of ['index.html', 'login.html', 'styles.css', 'app.js', 'cell-death-knowledge.js', 'tutorial.js', '.nojekyll', 'lib']) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}

console.log(`Static site staged in ${output}`);
