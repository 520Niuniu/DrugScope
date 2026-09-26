import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadKnowledge() {
  const source = await readFile(new URL('../cell-death-knowledge.js', import.meta.url), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'cell-death-knowledge.js' });
  return context.CellDeathKnowledge;
}

test('cell-death knowledge exposes curated pathway modules and verified PubMed identifiers', async () => {
  const api = await loadKnowledge();
  assert.equal(api.knowledge.ferroptosis.modules.length, 5);
  assert.equal(api.knowledge.disulfidptosis.references[0].pmid, '36747082');
  assert.equal(api.knowledge.cuproptosis.references[0].pmid, '35298263');
});

test('drug matching separates direct annotations from target or mechanism associations', async () => {
  const api = await loadKnowledge();
  const annotated = api.matchDrug({
    code: 'D1', name: 'Annotated drug', papers: 'Reported in a ferroptosis study', targets: 'Other'
  }, 'ferroptosis');
  const pathway = api.matchDrug({
    code: 'D2', name: 'GPX4 drug', targets: 'GPX4', mechanism: 'Enzyme inhibitor'
  }, 'ferroptosis');
  assert.equal(annotated.level, 'annotated');
  assert.equal(pathway.level, 'pathway');
  assert.match(pathway.reasons[0], /GPX4/);
});

test('curated drug names are separated as PubMed literature associations', async () => {
  const api = await loadKnowledge();
  const result = api.matchDrug({
    code: 'D3', name: 'Disulfiram', targets: 'ALDH', mechanism: 'Enzyme inhibitor'
  }, 'cuproptosis');
  assert.equal(result.level, 'literature');
  assert.match(result.reasons[0], /PMID 38186308/);
});

test('gene-symbol matching uses token boundaries and excludes demo drugs', async () => {
  const api = await loadKnowledge();
  assert.equal(api.containsTerm('Targets: GPX4; ACSL4', 'GPX4'), true);
  assert.equal(api.containsTerm('Targets: GPX40', 'GPX4'), false);
  assert.equal(api.matchDrug({ code: 'DEMO', targets: 'GPX4', isDemo: true }, 'ferroptosis'), null);
});
