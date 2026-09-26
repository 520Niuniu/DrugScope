import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workbookArgument = process.argv[2];

if (!workbookArgument) {
  console.error('Usage: node scripts/audit-cell-death-library.mjs <drug-library.xlsx-outside-repository>');
  process.exit(1);
}

const workbookPath = path.resolve(workbookArgument);
const relativeWorkbookPath = path.relative(repositoryRoot, workbookPath);
if (relativeWorkbookPath === '' || (!relativeWorkbookPath.startsWith('..') && !path.isAbsolute(relativeWorkbookPath))) {
  console.error('Refusing to read a licensed drug library from inside the Git repository.');
  process.exit(1);
}
const context = vm.createContext({
  console,
  Buffer,
  Uint8Array,
  ArrayBuffer,
  TextDecoder,
  TextEncoder,
  setTimeout,
  clearTimeout
});
context.globalThis = context;
context.window = context;
context.self = context;

const xlsxSource = await readFile(new URL('lib/xlsx.full.min.js', root), 'utf8');
vm.runInContext(xlsxSource, context, { filename: 'xlsx.full.min.js' });
const knowledgeSource = await readFile(new URL('cell-death-knowledge.js', root), 'utf8');
vm.runInContext(knowledgeSource, context, { filename: 'cell-death-knowledge.js' });

if (!context.XLSX || !context.CellDeathKnowledge) throw new Error('Unable to load local workbook parser or pathway matcher');

const workbookBytes = await readFile(workbookPath);
const workbook = context.XLSX.read(new Uint8Array(workbookBytes), { type: 'array' });
const sheetName = workbook.SheetNames.includes('Chemical Data') ? 'Chemical Data' : workbook.SheetNames.at(-1);
const records = context.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
const headers = Object.keys(records[0] || {});
const normalizeHeader = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const findHeader = aliases => headers.find(header => {
  const normalized = normalizeHeader(header);
  return aliases.some(alias => normalized === normalizeHeader(alias) || normalized.includes(normalizeHeader(alias)));
});

const fields = {
  code: findHeader(['catalog number', 'drug code', 'drug id', 'code']),
  name: findHeader(['item name', 'drug name', 'name']),
  targets: findHeader(['drug targets', 'target', 'targets info']),
  mechanism: findHeader(['primary mechanism', 'mechanism pathway', 'pathway']),
  category: findHeader(['drug category', 'category', 'classification']),
  papers: findHeader(['paper evidence', 'paper', 'information']),
  notes: findHeader(['notes', 'note', 'comment']),
  disulfidptosis: findHeader(['disulfidptosis evidence', 'disulfidptosis']),
  cuproptosis: findHeader(['cuproptosis evidence', 'cuproptosis'])
};

const positive = value => ['yes', 'strong', 'potential', 'moderate'].some(term => String(value || '').toLowerCase().includes(term));
const drugs = records.map(record => ({
  code: String(record[fields.code] || '').trim().toUpperCase(),
  name: String(record[fields.name] || '').trim(),
  fullName: String(record[fields.name] || '').trim(),
  targets: String(record[fields.targets] || '').trim(),
  mechanism: String(record[fields.mechanism] || '').trim(),
  category: String(record[fields.category] || '').trim(),
  papers: String(record[fields.papers] || '').trim(),
  evidence: String(record[fields.papers] || '').trim(),
  notes: String(record[fields.notes] || '').trim(),
  sensitivity: [record[fields.disulfidptosis], record[fields.cuproptosis]].filter(Boolean).join(' '),
  disulfidptosis: positive(record[fields.disulfidptosis]),
  cuproptosis: positive(record[fields.cuproptosis])
})).filter(drug => drug.code);

console.log(`Workbook: ${sheetName}; drugs: ${drugs.length}`);
console.log('Resolved fields:', fields);
for (const deathKey of Object.keys(context.CellDeathKnowledge.knowledge)) {
  const matches = context.CellDeathKnowledge.matchDrugs(drugs, deathKey);
  const literature = matches.filter(match => match.level === 'literature');
  const annotated = matches.filter(match => match.level === 'annotated');
  const pathway = matches.filter(match => match.level === 'pathway');
  console.log(`${deathKey}: total=${matches.length}; literature=${literature.length}; annotated=${annotated.length}; pathway=${pathway.length}`);
  console.log(matches.slice(0, 12).map(match => `${match.drug.code}:${match.drug.name} [${match.level}]`).join(' | '));
}

const auditNames = ['sulfasalazine', 'sorafenib', 'deferoxamine', 'disulfiram', 'elesclomol', 'penicillamine', 'trientine', '2-deoxy', 'lonidamine', 'erastin', 'ferrostatin', 'vitamin e', 'tocopherol'];
for (const query of auditNames) {
  const hits = drugs.filter(drug => drug.name.toLowerCase().includes(query));
  if (hits.length) console.log(`name=${query}: ${hits.map(drug => `${drug.code}:${drug.name}`).join(' | ')}`);
}
