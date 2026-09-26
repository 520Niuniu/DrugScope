import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadAppFunctions() {
  const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    console,
    URL,
    URLSearchParams,
    AbortController,
    window: {
      addEventListener() {},
      clearTimeout,
      setTimeout
    }
  });
  vm.runInContext(source, context, { filename: 'app.js' });
  return context;
}

test('long-table parser rejects invalid concentrations instead of converting them to zero', async () => {
  const app = await loadAppFunctions();
  const report = app.createFileImportReport('screen.csv');
  const rows = app.parseExperimentCsv([
    'DrugCode,Group,Concentration,Viability',
    'D1,无糖共处理,,75',
    'D1,无糖共处理,not-a-dose,70',
    'D1,无糖共处理,0,80',
    'D1,无糖共处理,0.1,60'
  ].join('\n'), 'screen.csv', report);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].concentration, 0);
  assert.equal(rows[1].concentration, 0.1);
  assert.equal(report.rejectedRows, 2);
  assert.equal(report.rejectedReasons['浓度为空、非数值或不是 0/0.1/1/10 µM'], 2);
});

test('TXT long tables accept tab delimiters and require the documented schema', async () => {
  const app = await loadAppFunctions();
  const validReport = app.createFileImportReport('screen.txt');
  const rows = app.parseExperimentCsv(
    'DrugCode\tGroup\tConcentration\tViability\nD1\tdrug\t1\t82',
    'screen.txt',
    validReport
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].group, '单药');

  const invalidReport = app.createFileImportReport('missing-group.csv');
  const invalidRows = app.parseExperimentCsv(
    'DrugCode,Concentration,Viability\nD1,1,82',
    'missing-group.csv',
    invalidReport
  );
  assert.equal(invalidRows.length, 0);
  assert.match(invalidReport.errors[0], /Group/);
});

test('zero-variance technical replicates are retained conservatively and never become candidates', async () => {
  const app = await loadAppFunctions();
  const data = [];
  for (let index = 0; index < 6; index += 1) {
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '单药', concentration: 1, viability: 100 });
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '无糖共处理', concentration: 0, viability: 100 });
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '无糖共处理', concentration: 1, viability: 50 });
  }

  const rows = app.calculateVolcanoData(data);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].interactionTestValid, false);
  assert.equal(rows[0].directTestValid, false);
  assert.equal(rows[0].pValue, 1);
  assert.equal(rows[0].directPValue, 1);
  assert.equal(rows[0].status, 'stable');
  assert.equal(rows[0].tier, 'none');
});

test('non-zero-variance dual-comparison sensitization remains an A-tier candidate', async () => {
  const app = await loadAppFunctions();
  const data = [];
  const single = [98, 99, 100, 100, 101, 102];
  const conditionOnly = [78, 79, 80, 80, 81, 82];
  const treated = [38, 39, 40, 40, 41, 42];
  for (let index = 0; index < 6; index += 1) {
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '单药', concentration: 1, viability: single[index] });
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '无糖共处理', concentration: 0, viability: conditionOnly[index] });
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '无糖共处理', concentration: 1, viability: treated[index] });
  }

  const rows = app.calculateVolcanoData(data);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].interactionTestValid, true);
  assert.equal(rows[0].directTestValid, true);
  assert.equal(rows[0].status, 'synergy');
  assert.equal(rows[0].tier, 'A');
});

test('MAD filtering drops an isolated outlier while retaining the other technical wells', async () => {
  const app = await loadAppFunctions();
  const rows = [100, 101, 99, 100.5, 98.5, 500].map(value => ({ value }));
  const filtered = app.filterRowsByMad(rows, row => row.value);
  assert.equal(filtered.kept.length, 5);
  assert.equal(filtered.dropped.length, 1);
  assert.equal(filtered.dropped[0].value, 500);
});

test('quality checks report missing doses and insufficient replicate counts', async () => {
  const app = await loadAppFunctions();
  const issues = app.collectImportQualityIssues([
    { platePair: 'D1+D2', drugCode: 'D1', group: '单药', concentration: 0.1, viability: 90 },
    { platePair: 'D1+D2', drugCode: 'D1', group: '单药', concentration: 0.1, viability: 91 }
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /仅 2 孔（不可分析）/);
  assert.match(issues[0], /单药 1 µM 缺失/);
  assert.match(issues[0], /无糖共处理 0 µM 缺失/);
});

test('candidate ranking concentration filter keeps only the selected dose', async () => {
  const app = await loadAppFunctions();
  const rows = [
    { concentration: 0.1, drugCode: 'D1' },
    { concentration: 1, drugCode: 'D2' },
    { concentration: 10, drugCode: 'D3' }
  ];
  assert.equal(app.filterStatsByConcentration(rows, 'all').length, 3);
  const oneMicromolar = app.filterStatsByConcentration(rows, '1');
  assert.equal(oneMicromolar.length, 1);
  assert.equal(oneMicromolar[0].drugCode, 'D2');
});

test('sensitizing and antagonistic count summaries remain separate', async () => {
  const app = await loadAppFunctions();
  const stats = [
    { condition: '无糖共处理', status: 'synergy', tier: 'A', drugCode: 'D1' },
    { condition: '无糖共处理', status: 'synergy', tier: 'B', drugCode: 'D2' },
    { condition: '无糖共处理', status: 'rescue', tier: 'A', drugCode: 'D3' },
    { condition: '无糖共处理', status: 'relativeAntagonism', tier: 'B', drugCode: 'D4' }
  ];
  const sensitizing = app.summarizeEffectCandidates(stats, [{ key: 'synergy' }]);
  const antagonistic = app.summarizeEffectCandidates(stats, [{ key: 'rescue' }, { key: 'relativeAntagonism' }]);
  assert.equal(sensitizing[0].synergy, 2);
  assert.equal(sensitizing[0].synergyA, 1);
  assert.equal(sensitizing[0].synergyB, 1);
  assert.equal(antagonistic[0].rescue, 1);
  assert.equal(antagonistic[0].relativeAntagonism, 1);
  assert.equal('rescue' in sensitizing[0], false);
});

test('antagonism viability chart data contains single, condition-only and combination summaries', async () => {
  const app = await loadAppFunctions();
  const data = [];
  const single = [48, 49, 50, 50, 51, 52];
  const conditionOnly = [38, 39, 40, 40, 41, 42];
  const combination = [78, 79, 80, 80, 81, 82];
  for (let index = 0; index < 6; index += 1) {
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '单药', concentration: 1, viability: single[index] });
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '无糖共处理', concentration: 0, viability: conditionOnly[index] });
    data.push({ platePair: 'D1+D2', drugCode: 'D1', group: '无糖共处理', concentration: 1, viability: combination[index] });
  }
  const stats = [{
    platePair: 'D1+D2', drugCode: 'D1', condition: '无糖共处理', concentration: 1,
    status: 'rescue', score: 10, pValue: 0.001, qValue: 0.002,
    directPValue: 0.001, directQValue: 0.002,
    interactionTestValid: true, directTestValid: true
  }];

  const rows = app.buildAntagonismBarData(data, stats, '无糖共处理', 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].single.n, 6);
  assert.equal(rows[0].conditionOnly.mean, 40);
  assert.equal(rows[0].combination.mean, 80);
  assert.ok(rows[0].combination.sd > 0);
  assert.equal(app.statisticalSignificance(0.001, true), '**');
  assert.equal(app.statisticalSignificance(0.2, true), 'ns');
});
