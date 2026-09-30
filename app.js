const GROUP_LABEL_MAP = {
  '单药': '单药',
  'drug': '单药',
  'single': '单药',
  'single drug': '单药',
  'drug alone': '单药',
  'drug only': '单药',
  '无糖': '无糖共处理',
  '无糖共处理': '无糖共处理',
  'no sugar': '无糖共处理',
  'nonsugar': '无糖共处理',
  'sugar free': '无糖共处理',
  'KL11743': 'KL11743共处理',
  'kl11743': 'KL11743共处理',
  'kl-11743': 'KL11743共处理',
  'copper': '铜死亡诱导剂共处理',
  'copper death': '铜死亡诱导剂共处理',
  'copper inducer': '铜死亡诱导剂共处理',
  '铜诱导剂': '铜死亡诱导剂共处理',
  '铜死亡': '铜死亡诱导剂共处理'
};

const DEFAULT_ANALYSIS_CONFIG = Object.freeze({
  madK: 3.0,
  minReplicates: 4,
  log2FcCutoff: 0.585,
  minAbsoluteInteractionDifference: 10,
  directDecreaseRatio: 0.80,
  directIncreaseRatio: 1.20,
  pCutoff: 0.05,
  tierAFdrCutoff: 0.10
});

// These session-scoped thresholds are intentionally mutable through the analysis
// settings panel. Import QC parameters remain fixed so changing a candidate cutoff
// never silently changes which wells were retained.
const ANALYSIS_CONFIG = { ...DEFAULT_ANALYSIS_CONFIG };

const SCREENING_CONCENTRATIONS = Object.freeze([0.1, 1, 10]);
const CONDITION_GROUPS = Object.freeze(['无糖共处理', 'KL11743共处理', '铜死亡诱导剂共处理']);
const VALID_EXPERIMENT_GROUPS = new Set(['单药', ...CONDITION_GROUPS]);

const demoDrugKnowledgeBase = {
  'QSI-01': {
    code: 'QSI-01',
    name: 'QSI-01',
    fullName: 'QSI-01（模拟药物，非真实 FDA 记录）',
    category: '模拟演示数据',
    disease: '虚构字段，仅用于界面演示',
    sensitivity: '模拟结果',
    conclusion: '该结论仅由模拟细胞活性数值生成，不代表真实药物效应。',
    mechanism: '虚构机制字段，仅用于演示信息卡布局；不得作为科研证据引用。',
    targets: '模拟靶点：DEMO-TARGET-1',
    papers: '无真实文献记录。',
    score: 74,
    disulfidptosis: true,
    cuproptosis: false,
    evidence: '模拟演示数据，不对应真实化合物、FDA 记录或内部研究报告。',
    isDemo: true
  },
  'NPR-02': {
    code: 'NPR-02',
    name: 'NPR-02',
    fullName: 'NPR-02（模拟药物，非真实 FDA 记录）',
    category: '模拟演示数据',
    disease: '虚构字段，仅用于界面演示',
    sensitivity: '模拟结果',
    conclusion: '该结论仅由模拟细胞活性数值生成，不代表真实药物效应。',
    mechanism: '虚构机制字段，仅用于演示信息卡布局；不得作为科研证据引用。',
    targets: '模拟靶点：DEMO-TARGET-2',
    papers: '无真实文献记录。',
    score: 88,
    disulfidptosis: false,
    cuproptosis: true,
    evidence: '模拟演示数据，不对应真实化合物、FDA 记录或合作实验。',
    isDemo: true
  },
  'KLG-11743': {
    code: 'KLG-11743',
    name: 'KL11743',
    fullName: 'KL11743（模拟流程标签）',
    category: '模拟演示数据',
    disease: '虚构字段，仅用于界面演示',
    sensitivity: '模拟结果',
    conclusion: '该字段仅用于演示共处理组标签，不代表真实候选物结论。',
    mechanism: '虚构机制字段，仅用于界面演示。',
    targets: '模拟靶点：DEMO-TARGET-3',
    papers: '无真实文献记录。',
    score: 91,
    disulfidptosis: true,
    cuproptosis: true,
    evidence: '模拟演示数据，不对应可核验的真实研究证据。',
    isDemo: true
  }
};

const drugKnowledgeBase = {};
let dataMode = 'empty';
let drugSearchRecords = [];
const pubmedCache = new Map();
let pubmedController = null;
const PUBMED_REQUEST_INTERVAL_MS = 350;
const PUBMED_MAX_429_RETRIES = 2;
let pubmedRequestQueue = Promise.resolve();
let pubmedLastRequestStartedAt = 0;
const clinicalTrialsCache = new Map();
let clinicalTrialsController = null;
const pathwayCache = new Map();
let pathwayController = null;
let activeDrugCode = '';
let activeCellDeathKey = 'ferroptosis';
let cellDeathEvidenceFilter = 'all';
let cellDeathDrugQuery = '';

function normalizeDrugSearchTerm(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\s_\-(),.\/\\;:]+/g, '');
}

function extractDrugAliases(name, explicitAliases = '') {
  const aliases = String(explicitAliases || '').split(/[;|、]/);
  const nameText = String(name || '');
  const bracketMatches = [...nameText.matchAll(/[（(\[]([^）)\]]+)[）)\]]/g)].map(match => match[1]);
  const separated = nameText.split(/[;|、/]/);
  return [...new Set([...aliases, ...bracketMatches, ...separated].map(value => value.trim()).filter(Boolean))];
}

function repairDrugLibraryText(value) {
  let text = String(value || '');
  const replacements = [
    [/C14��/gi, 'C14α'],
    [/NF-��B/gi, 'NF-κB'],
    [/I��B/g, 'IκB'],
    [/TGF-��/gi, 'TGF-β'],
    [/TNF-��/gi, 'TNF-α'],
    [/PPAR��/gi, 'PPARγ'],
    [/RAR�� and RAR��/gi, 'RARα and RARγ'],
    [/PI3K-��\/PI3K-��/gi, 'PI3K-α/PI3K-δ'],
    [/Selective PI3K�� inhibitor/gi, 'Selective PI3Kδ inhibitor'],
    [/PDGFR-��/gi, 'PDGFR-β'],
    [/PDGFR��/gi, 'PDGFRβ'],
    [/Amyloid ��/gi, 'Amyloid β'],
    [/Dopamine ��-hydroxylase/gi, 'Dopamine β-hydroxylase'],
    [/��-secretase/gi, 'γ-secretase'],
    [/��-lactamase/gi, 'β-lactamase'],
    [/��-lactam/gi, 'β-lactam'],
    [/��-glucosid/gi, 'α-glucosid'],
    [/��-\(1,3\)-D-glucan/gi, 'β-(1,3)-D-glucan'],
    [/��\(1,3\)-D-Glucan/gi, 'β(1,3)-D-Glucan'],
    [/11-�� hydroxylase/gi, '11-β hydroxylase'],
    [/11��-HSD/gi, '11β-HSD'],
    [/3��-HSD/gi, '3β-HSD'],
    [/5��-reductase/gi, '5α-reductase'],
    [/��v��3/g, 'αvβ3'],
    [/��v��5/g, 'αvβ5'],
    [/F2�� receptor/gi, 'F2α receptor'],
    [/��5 site of the 20S proteasome/gi, 'β5 site of the 20S proteasome'],
    [/GSK-3��/gi, 'GSK-3β'],
    [/I1R\/��2AR/gi, 'I1R/α2AR'],
    [/��2A-adrenoceptor/gi, 'α2A-adrenoceptor'],
    [/��2B-adrenoceptor/gi, 'α2B-adrenoceptor'],
    [/��1B-/gi, 'α1B-'],
    [/��2C-adrenergic/gi, 'α2C-adrenergic'],
    [/��4��2 nicotinic/gi, 'α4β2 nicotinic'],
    [/��1 opioid receptor/gi, 'μ1 opioid receptor'],
    [/\(6-\)��-\?Aminocaproic acid/gi, 'ε-Aminocaproic acid'],
    [/DL-��-Difluoromethylornithine/gi, 'DL-α-Difluoromethylornithine'],
    [/25��:/g, '25°C:'],
    [/��(?=\d+(?:\.\d+)?\s*mg\/mL)/gi, '≥'],
    [/DMF����������/g, 'DMF'],
    [/inhibitor��synthetic/gi, 'inhibitor; synthetic'],
    [/agent��\s*(?=[a-z])/gi, 'agent; '],
    [/drug��\s*(?=[a-z])/gi, 'drug; '],
    [/analgesic��antipyretic/gi, 'analgesic; antipyretic'],
    [/tranquilizer��antipsychotic/gi, 'tranquilizer; antipsychotic'],
    [/inhibitor��\s*(?=[a-z])/gi, 'inhibitor; '],
    [/ppar inhibitor��\s*/gi, 'PPAR inhibitor; ']
  ];
  replacements.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
  return text;
}

function rebuildDrugSearchIndex() {
  drugSearchRecords = Object.values(drugKnowledgeBase).map(drug => {
    const aliases = [...new Set([...(drug.aliases || []), drug.name, drug.fullName].filter(Boolean))];
    return { drug, fields: [drug.code, drug.name, drug.fullName, ...aliases].filter(Boolean), aliases };
  });

  const datalist = document.getElementById('drugSearchOptions');
  if (!datalist) return;
  datalist.replaceChildren();
  drugSearchRecords.forEach(({ drug, aliases }) => {
    const option = document.createElement('option');
    option.value = drug.name || drug.fullName || drug.code;
    option.label = `${drug.code}${aliases.length ? ` · ${aliases.slice(0, 2).join(' / ')}` : ''}`;
    datalist.appendChild(option);
  });
}

function findDrugMatches(query, limit = 8) {
  const normalizedQuery = normalizeDrugSearchTerm(query);
  if (!normalizedQuery) return [];
  return drugSearchRecords.map(record => {
    let score = 0;
    record.fields.forEach((field, index) => {
      const normalizedField = normalizeDrugSearchTerm(field);
      if (normalizedField === normalizedQuery) score = Math.max(score, index === 0 ? 100 : 95);
      else if (normalizedField.startsWith(normalizedQuery)) score = Math.max(score, index === 0 ? 85 : 75);
      else if (normalizedField.includes(normalizedQuery)) score = Math.max(score, 55);
    });
    return { ...record, score };
  }).filter(record => record.score > 0).sort((a, b) => b.score - a.score || a.drug.code.localeCompare(b.drug.code)).slice(0, limit);
}

function loadDrugLibraryWorkbook() {
  const url = '/.netlify/functions/drug-library';
  return fetch(url, { cache: 'no-store' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`FDA library request failed: ${response.status}`);
      }
      return response.arrayBuffer();
    })
    .then(buffer => {
      if (typeof XLSX === 'undefined' || typeof XLSX.read !== 'function') {
        throw new Error('XLSX parser is not loaded');
      }
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames.includes('Chemical Data') ? 'Chemical Data' : workbook.SheetNames[workbook.SheetNames.length - 1];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error('FDA workbook does not contain a readable drug data sheet');
      const text = XLSX.utils.sheet_to_csv(sheet);
      const rows = csvToRows(text);
      if (rows.length < 2) return;

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const normalizedHeaders = headers.map(h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));

      const findHeaderByAliases = (aliases) => {
        const aliasSet = aliases.map(a => String(a).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        return normalizedHeaders.findIndex(h => aliasSet.some(alias => h === alias || h.includes(alias)));
      };

      const codeIndex = findHeaderByAliases(['catalog number', 'catalognumber', 'drug code', 'drugcode', 'drug id', 'drugid', 'code']);
      const nameIndex = findHeaderByAliases(['item name', 'itemname', 'drug name', 'drugname', 'name']);
      const targetsIndex = findHeaderByAliases(['drug targets', 'target', 'targets', 'targets info']);
      const diseaseIndex = findHeaderByAliases(['disease', 'disease area', 'indication', 'indications']);
      const mechanismIndex = findHeaderByAliases(['primary mechanism', 'primarymechanism', 'mechanism', 'mechanism pathway', 'mechanism and pathway', 'pathway']);
      const paperIndex = findHeaderByAliases(['paper evidence', 'paperevidence', 'paper', 'information', 'infos']);
      const categoryIndex = findHeaderByAliases(['drug category', 'drugcategory', 'category', 'classification', 'pathway']);
      const disulfidptosisIndex = findHeaderByAliases(['disulfidptosisevidence', 'disulfidptosis evidence', 'disulfidptosis']);
      const cuproptosisIndex = findHeaderByAliases(['cuproptosisevidence', 'cuproptosis evidence', 'cuproptosis']);
      const clinicalStatusIndex = findHeaderByAliases(['clinical status', 'clinicalstatus', 'clinical', 'status']);
      const notesIndex = findHeaderByAliases(['notes', 'note', 'comment']);
      const urlIndex = findHeaderByAliases(['url', 'website', 'link']);
      const aliasesIndex = findHeaderByAliases(['alias', 'aliases', 'synonym', 'synonyms', 'common name', 'other name']);

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        const cleanValue = index => index >= 0 ? repairDrugLibraryText(row[index]) : '';

        const code = cleanValue(codeIndex).trim();
        if (!code) continue;

        const codeKey = code.toUpperCase();
        const drug = {
          code: codeKey,
          name: cleanValue(nameIndex).trim() || code,
          fullName: cleanValue(nameIndex).trim() || code,
          category: cleanValue(categoryIndex).trim() || 'FDA drug library',
          disease: cleanValue(diseaseIndex).trim() || 'Not specified',
          mechanism: cleanValue(mechanismIndex).trim() || 'Mechanism not specified',
          targets: cleanValue(targetsIndex).trim() || 'Not specified',
          papers: cleanValue(paperIndex).trim() || 'No paper record found',
          clinicalStatus: cleanValue(clinicalStatusIndex).trim() || 'Not specified',
          notes: cleanValue(notesIndex).trim() || 'No additional drug information',
          evidence: cleanValue(paperIndex).trim() || 'No paper record found',
          url: cleanValue(urlIndex).trim(),
          aliases: extractDrugAliases(cleanValue(nameIndex), cleanValue(aliasesIndex)),
          sensitivity: cleanValue(disulfidptosisIndex).trim() || cleanValue(cuproptosisIndex).trim() || 'Not evaluated',
          conclusion: `药物库注释：${cleanValue(paperIndex).trim() || '暂无整合文献证据'}`,
          score: 75,
          disulfidptosis: ['yes', 'strong', 'potential', 'moderate'].some(term => cleanValue(disulfidptosisIndex).trim().toLowerCase().includes(term)),
          cuproptosis: ['yes', 'strong', 'moderate'].some(term => cleanValue(cuproptosisIndex).trim().toLowerCase().includes(term))
        };

        drugKnowledgeBase[codeKey] = drug;
      }
      rebuildDrugSearchIndex();
    })
    .catch(error => {
      console.warn('FDA drug library workbook failed to load:', error);
    });
}

function getCellDeathKnowledgeApi() {
  return globalThis.CellDeathKnowledge || null;
}

function appendDeathEmptyState(host, message) {
  const empty = document.createElement('div');
  empty.className = 'death-empty-state';
  empty.textContent = message;
  host.appendChild(empty);
}

function renderDeathSummary(definition) {
  const host = document.getElementById('deathSummary');
  if (!host) return;
  host.replaceChildren();
  host.style.setProperty('--death-accent', definition.accent);

  const titleWrap = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'death-summary-kicker';
  kicker.textContent = definition.englishName;
  const title = document.createElement('h3');
  title.textContent = definition.name;
  titleWrap.append(kicker, title);

  const text = document.createElement('p');
  text.textContent = definition.summary;
  host.append(titleWrap, text);
}

function renderDeathModules(definition) {
  const host = document.getElementById('deathModuleList');
  const heading = document.getElementById('deathPathwayHeading');
  const count = document.getElementById('deathModuleCount');
  if (!host || !heading || !count) return;
  host.replaceChildren();
  heading.textContent = `${definition.name}核心通路模块`;
  count.textContent = `${definition.modules.length} 个模块`;

  definition.modules.forEach((module, index) => {
    const item = document.createElement('article');
    item.className = 'death-module-item';

    const number = document.createElement('span');
    number.className = 'death-module-number';
    number.textContent = String(index + 1).padStart(2, '0');

    const content = document.createElement('div');
    const titleRow = document.createElement('div');
    titleRow.className = 'death-module-title-row';
    const title = document.createElement('h4');
    title.textContent = module.title;
    const role = document.createElement('span');
    role.textContent = module.role;
    titleRow.append(title, role);

    const description = document.createElement('p');
    description.textContent = module.description;
    const markers = document.createElement('div');
    markers.className = 'death-marker-list';
    module.markers.forEach(marker => {
      const chip = document.createElement('span');
      chip.textContent = marker;
      markers.appendChild(chip);
    });
    content.append(titleRow, description, markers);
    item.append(number, content);
    host.appendChild(item);
  });
}

function renderDeathReferences(definition) {
  const host = document.getElementById('deathReferenceList');
  if (!host) return;
  host.replaceChildren();

  definition.references.forEach(reference => {
    const link = document.createElement('a');
    link.className = 'death-reference-link';
    link.href = `https://pubmed.ncbi.nlm.nih.gov/${reference.pmid}/`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const citation = document.createElement('span');
    citation.textContent = `${reference.year} · PMID ${reference.pmid}`;
    const title = document.createElement('b');
    title.textContent = reference.title;
    link.append(citation, title);
    host.appendChild(link);
  });

  definition.databaseLinks.forEach(reference => {
    const link = document.createElement('a');
    link.className = 'death-reference-link is-database';
    link.href = reference.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const citation = document.createElement('span');
    citation.textContent = '通路数据库';
    const title = document.createElement('b');
    title.textContent = reference.label;
    link.append(citation, title);
    host.appendChild(link);
  });
}

function renderDeathDrugMatches(definition) {
  const api = getCellDeathKnowledgeApi();
  const host = document.getElementById('deathDrugList');
  const heading = document.getElementById('deathDrugHeading');
  const count = document.getElementById('deathDrugCount');
  if (!api || !host || !heading || !count) return;
  host.replaceChildren();
  heading.textContent = `${definition.name}关联药物`;

  const drugs = Object.values(drugKnowledgeBase).filter(drug => !drug.isDemo);
  if (!drugs.length) {
    count.textContent = '药物库未就绪';
    appendDeathEmptyState(host, '正在加载 FDA 药物库，或药物库暂时不可用。');
    return;
  }

  const allMatches = api.matchDrugs(drugs, definition.key);
  const literatureCount = allMatches.filter(match => match.level === 'literature').length;
  const annotatedCount = allMatches.filter(match => match.level === 'annotated').length;
  const pathwayCount = allMatches.filter(match => match.level === 'pathway').length;
  const query = normalizeDrugSearchTerm(cellDeathDrugQuery);
  const filtered = allMatches.filter(match => {
    if (cellDeathEvidenceFilter !== 'all' && match.level !== cellDeathEvidenceFilter) return false;
    if (!query) return true;
    return normalizeDrugSearchTerm([
      match.drug.code,
      match.drug.name,
      match.drug.fullName,
      ...(match.drug.aliases || [])
    ].join(' ')).includes(query);
  });
  const visible = filtered.slice(0, 200);
  count.textContent = `共 ${allMatches.length} 种 · 文献 ${literatureCount} · 库注释 ${annotatedCount} · 通路 ${pathwayCount} · 当前 ${filtered.length}`;

  if (!filtered.length) {
    appendDeathEmptyState(host, allMatches.length
      ? '没有符合当前筛选条件的药物。'
      : definition.noMatchNote || '当前药物库字段没有匹配到该死亡类型；这不等于不存在相关药物或研究证据。');
    return;
  }

  visible.forEach(match => {
    const item = document.createElement('article');
    item.className = `death-drug-item is-${match.level}`;

    const header = document.createElement('div');
    header.className = 'death-drug-item-head';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'death-drug-name';
    button.dataset.drugCode = match.drug.code;
    button.textContent = match.drug.name || match.drug.fullName || match.drug.code;
    button.title = `打开 ${match.drug.code} 药物详情`;
    const badge = document.createElement('span');
    badge.className = 'death-evidence-badge';
    badge.textContent = match.level === 'literature'
      ? 'PubMed 明确关联'
      : match.level === 'annotated' ? '药物库明确注释' : '靶点/机制关联';
    header.append(button, badge);

    const code = document.createElement('div');
    code.className = 'death-drug-code';
    code.textContent = match.drug.code;
    const reasons = document.createElement('div');
    reasons.className = 'death-match-reasons';
    match.reasons.forEach(reason => {
      const chip = document.createElement('span');
      chip.textContent = reason;
      reasons.appendChild(chip);
    });
    item.append(header, code, reasons);
    host.appendChild(item);
  });

  if (filtered.length > visible.length) {
    appendDeathEmptyState(host, `为保持页面流畅，当前显示前 ${visible.length} 种；请使用名称或代号继续筛选。`);
  }
}

function renderCellDeathKnowledge() {
  const api = getCellDeathKnowledgeApi();
  const definition = api?.knowledge?.[activeCellDeathKey];
  if (!definition) return;

  document.querySelectorAll('[data-death-key]').forEach(button => {
    const selected = button.dataset.deathKey === activeCellDeathKey;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  renderDeathSummary(definition);
  renderDeathModules(definition);
  renderDeathDrugMatches(definition);
  renderDeathReferences(definition);
}

const sampleRows = [
  ['ID', 'DrugCode', 'Group', 'Concentration', 'Viability'],
  ['1', 'QSI-01', '单药', '0', '100'],
  ['2', 'QSI-01', '单药', '0.1', '95'],
  ['3', 'QSI-01', '单药', '1', '88'],
  ['4', 'QSI-01', '单药', '10', '60'],
  ['5', 'QSI-01', '无糖共处理', '0', '100'],
  ['6', 'QSI-01', '无糖共处理', '0.1', '90'],
  ['7', 'QSI-01', '无糖共处理', '1', '74'],
  ['8', 'QSI-01', '无糖共处理', '10', '42'],
  ['9', 'QSI-01', 'KL11743共处理', '0', '100'],
  ['10', 'QSI-01', 'KL11743共处理', '0.1', '87'],
  ['11', 'QSI-01', 'KL11743共处理', '1', '69'],
  ['12', 'QSI-01', 'KL11743共处理', '10', '34'],
  ['13', 'QSI-01', '铜死亡诱导剂共处理', '0', '100'],
  ['14', 'QSI-01', '铜死亡诱导剂共处理', '0.1', '96'],
  ['15', 'QSI-01', '铜死亡诱导剂共处理', '1', '80'],
  ['16', 'QSI-01', '铜死亡诱导剂共处理', '10', '63'],

  ['17', 'NPR-02', '单药', '0', '100'],
  ['18', 'NPR-02', '单药', '0.1', '98'],
  ['19', 'NPR-02', '单药', '1', '88'],
  ['20', 'NPR-02', '单药', '10', '62'],
  ['21', 'NPR-02', '无糖共处理', '0', '100'],
  ['22', 'NPR-02', '无糖共处理', '0.1', '91'],
  ['23', 'NPR-02', '无糖共处理', '1', '72'],
  ['24', 'NPR-02', '无糖共处理', '10', '55'],
  ['25', 'NPR-02', 'KL11743共处理', '0', '100'],
  ['26', 'NPR-02', 'KL11743共处理', '0.1', '89'],
  ['27', 'NPR-02', 'KL11743共处理', '1', '70'],
  ['28', 'NPR-02', 'KL11743共处理', '10', '40'],
  ['29', 'NPR-02', '铜死亡诱导剂共处理', '0', '100'],
  ['30', 'NPR-02', '铜死亡诱导剂共处理', '0.1', '85'],
  ['31', 'NPR-02', '铜死亡诱导剂共处理', '1', '56'],
  ['32', 'NPR-02', '铜死亡诱导剂共处理', '10', '14']
];

let drugData = [];

function csvToRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const firstNonEmptyLine = String(text || '').split(/\r?\n/).find(line => line.trim()) || '';
  const delimiter = (firstNonEmptyLine.match(/\t/g) || []).length > (firstNonEmptyLine.match(/,/g) || []).length ? '\t' : ',';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      row.push(field.trim().replace(/"/g, ''));
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') {
        i += 1;
      }
      row.push(field.trim().replace(/"/g, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim().replace(/"/g, ''));
    rows.push(row);
  }

  return rows;
}

function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    const lowerName = String(file.name || '').toLowerCase();

    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      if (typeof XLSX === 'undefined' || typeof XLSX.read !== 'function') {
        reject(new Error('XLSX parser is not loaded'));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const workbook = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheetName]);
          resolve({ fileName: file.name, csv, workbook });
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve({ fileName: file.name, csv: reader.result, workbook: null });
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function normalizeHeader(header) {
  return String(header || '').replace(/^\uFEFF/, '').normalize('NFKC').trim().toLowerCase().replace(/\s/g, '_');
}

function findHeaderIndex(headers, aliases) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex(header => normalizedAliases.has(header));
}

function supportedConcentration(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return [0, ...SCREENING_CONCENTRATIONS].find(expected => Math.abs(parsed - expected) < 1e-9) ?? null;
}

function rejectImportedRow(diagnostics, reason) {
  if (!diagnostics) return;
  diagnostics.rejectedRows += 1;
  diagnostics.rejectedReasons[reason] = (diagnostics.rejectedReasons[reason] || 0) + 1;
}

function extractPlateFileMeta(fileName) {
  const baseName = String(fileName || '')
    .replace(/\.(csv|txt|xls|xlsx)$/i, '')
    .replace(/\(\d+\)$/, '')
    .trim();
  // 兼容“药物对_CHU-药物对”和标准“CHU-药物对”；以下划线后的最后一段为准。
  const explicitSegment = baseName.match(/(?:^|_)(CON|CHU)[-_](.+)$/i);
  if (explicitSegment) {
    return {
      plateType: explicitSegment[1].toUpperCase(),
      drugPair: explicitSegment[2].trim(),
      normalizedName: `${explicitSegment[1].toUpperCase()}-${explicitSegment[2].trim()}`
    };
  }

  const leadingType = baseName.match(/^(CON|CHU)(?:[-_]|$)/i);
  const plateType = leadingType ? leadingType[1].toUpperCase() : 'CON';
  const drugPair = baseName.replace(/^(CON|CHU)[-_]*/i, '').trim();
  return { plateType, drugPair, normalizedName: `${plateType}-${drugPair}` };
}

function derivePlateType(fileName) {
  return extractPlateFileMeta(fileName).plateType;
}

function extractDrugCodesFromFileName(fileName) {
  const cleanBase = extractPlateFileMeta(fileName).drugPair;

  const candidate = cleanBase.split(/[+]/).map(part => part.trim().replace(/[_-]+/g, '-'));
  const drugCodes = candidate
    .map(item => {
      const cleaned = item.replace(/^(CON|CHU)[-_]*/i, '');
      return cleaned ? cleaned.toUpperCase() : null;
    })
    .filter(Boolean);

  return drugCodes.length ? drugCodes : ['UNKNOWN_DRUG'];
}

function extractDrugCodeFromFileName(fileName) {
  const codes = extractDrugCodesFromFileName(fileName);
  return codes[0] || 'UNKNOWN_DRUG';
}

function wellToColumn(well) {
  if (!well) return null;
  const match = String(well).trim().match(/^[A-H]([1-9]|1[0-2])$/i);
  if (!match) return null;
  return Number(String(well).trim().match(/([1-9]|1[0-2])$/)[1]);
}

function wellToRow(well) {
  const match = String(well || '').trim().match(/^([A-H])(?:[1-9]|1[0-2])$/i);
  return match ? match[1].toUpperCase() : null;
}

function parseRawPlateWorkbook(workbook, fileName) {
  if (!workbook || !workbook.Sheets) return [];

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];

  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });
  const matrix = rawRows.map(row => row.map(value => value === undefined || value === null ? '' : String(value).trim()));

  const plateType = derivePlateType(fileName).toUpperCase();
  const pairCodes = extractDrugCodesFromFileName(fileName);
  const validPairCodes = pairCodes.filter(code => code && !['无', 'NONE'].includes(String(code).toUpperCase()));
  const platePair = validPairCodes.join('+');

  const startRowInfo = matrix.findIndex((row, rIdx) => {
    const rowText = row.map(cell => String(cell || '').trim());
    const required = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    return required.every(v => rowText.some(cell => cell === v || cell === Number(v)));
  });

  if (startRowInfo < 0) return [];

  const headerRow = matrix[startRowInfo];
  const startCol = headerRow.findIndex(cell => String(cell || '').trim() === '1');
  if (startCol < 0) return [];

  const startRow = startRowInfo + 1;
  const odMatrix = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 12; c++) {
      const cellValue = matrix[startRow + r] && matrix[startRow + r][startCol + c];
      const normalizedCell = String(cellValue ?? '').trim().replace(/[^0-9.eE+\-]/g, '');
      const number = normalizedCell === '' ? NaN : Number(normalizedCell);
      row.push(Number.isFinite(number) ? number : null);
    }
    odMatrix.push(row);
  }

  const rowLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const concByRow = {
    'B': 0.1,
    'C': 1.0,
    'D': 10.0,
    'F': 0.1,
    'G': 1.0,
    'H': 10.0
  };

  const parsed = [];

  for (let r = 0; r < odMatrix.length; r++) {
    const rowLabel = rowLabels[r];
    const drugSlot = ['A', 'B', 'C', 'D'].includes(rowLabel) ? 1 : 2;
    const currId = drugSlot === 1 ? pairCodes[0] : pairCodes[1];
    if (!currId || ['无', 'NONE'].includes(String(currId).toUpperCase())) continue;

    const conc = concByRow[rowLabel] || 0;

    for (let c = 0; c < 12; c++) {
      const od = odMatrix[r][c];
      if (!Number.isFinite(od)) continue;

      const col = c + 1;
      const halfCondition = plateType === 'CHU'
        ? (col <= 6 ? 'KL11743' : 'ES+CuCl2')
        : (col <= 6 ? 'Normal_Medium' : 'Sugar_Free');
      const condition = rowLabel === 'A' ? 'Normal_Medium' : halfCondition;

      const group = condition === 'Normal_Medium'
        ? '单药'
        : condition === 'Sugar_Free'
          ? '无糖共处理'
          : condition === 'KL11743'
            ? 'KL11743共处理'
            : '铜死亡诱导剂共处理';

      const isNormalizationControl = rowLabel === 'A'
        || (plateType === 'CON' && col <= 6 && rowLabel === 'E');
      const isConditionControl = rowLabel === 'E' && halfCondition !== 'Normal_Medium';
      const isControl = isNormalizationControl || isConditionControl;

      parsed.push({
        drugCode: currId,
        group,
        concentration: conc,
        viability: null,
        plateType,
        platePair,
        well: `${rowLabel}${col}`,
        originalOD: od,
        condition,
        armCondition: halfCondition,
        row: rowLabel,
        col,
        drugSlot,
        isControl,
        isNormalizationControl,
        isConditionControl,
        rawPlate: true,
        file: fileName
      });
    }
  }

  return parsed;
}

function median(values) {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function filterRowsByMad(rows, valueFor, k = ANALYSIS_CONFIG.madK) {
  const finiteRows = rows.filter(row => Number.isFinite(valueFor(row)));
  if (finiteRows.length <= 2) return { kept: finiteRows, dropped: [] };
  const values = finiteRows.map(valueFor);
  const center = median(values);
  const mad = median(values.map(value => Math.abs(value - center)));
  if (mad === 0) return { kept: finiteRows, dropped: [] };
  const kept = [], dropped = [];
  finiteRows.forEach(row => {
    (Math.abs(valueFor(row) - center) / mad <= k ? kept : dropped).push(row);
  });
  return { kept, dropped };
}

function groupRows(rows, keyFor) {
  const groups = new Map();
  rows.forEach(row => {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return groups;
}

function prepareRawPlateRows(rows) {
  const normalizationControlGroups = groupRows(
    rows.filter(row => row.isNormalizationControl),
    row => `${row.platePair}\u0000${row.armCondition}`
  );
  const normalizationMeans = new Map();
  const conditionControlGroups = groupRows(
    rows.filter(row => row.isConditionControl),
    row => `${row.platePair}\u0000${row.armCondition}`
  );
  const retainedConditionControls = new Map();
  let excludedControls = 0;
  normalizationControlGroups.forEach((group, key) => {
    const filtered = filterRowsByMad(group, row => row.originalOD);
    excludedControls += filtered.dropped.length;
    if (filtered.kept.length >= ANALYSIS_CONFIG.minReplicates) {
      normalizationMeans.set(key, average(filtered.kept.map(row => row.originalOD)));
    }
  });
  conditionControlGroups.forEach((group, key) => {
    const filtered = filterRowsByMad(group, row => row.originalOD);
    excludedControls += filtered.dropped.length;
    if (filtered.kept.length >= ANALYSIS_CONFIG.minReplicates) {
      retainedConditionControls.set(key, filtered.kept);
    }
  });

  const treatmentGroups = groupRows(
    rows.filter(row => !row.isControl && row.concentration > 0),
    row => `${row.platePair}\u0000${row.drugCode}\u0000${row.condition}\u0000${row.concentration}`
  );
  const prepared = [];
  const conditionGroupLabels = {
    Normal_Medium: '单药',
    Sugar_Free: '无糖共处理',
    KL11743: 'KL11743共处理',
    'ES+CuCl2': '铜死亡诱导剂共处理'
  };
  const drugCodesByPair = groupRows(rows, row => row.platePair);
  retainedConditionControls.forEach((controlRows, key) => {
    const [platePair, armCondition] = key.split('\u0000');
    const normalizationMean = normalizationMeans.get(key);
    if (!Number.isFinite(normalizationMean) || normalizationMean <= 0) return;
    const drugCodes = [...new Set((drugCodesByPair.get(platePair) || []).map(row => row.drugCode).filter(Boolean))];
    drugCodes.forEach(drugCode => controlRows.forEach(row => prepared.push({
      ...row,
      drugCode,
      group: conditionGroupLabels[armCondition] || row.group,
      concentration: 0,
      viability: row.originalOD / normalizationMean * 100,
      controlOD: normalizationMean,
      isConditionControl: true,
      rawPlate: false
    })));
  });
  let excludedTreatments = 0;
  treatmentGroups.forEach(group => {
    const filtered = filterRowsByMad(group, row => row.originalOD);
    excludedTreatments += filtered.dropped.length;
    filtered.kept.forEach(row => {
      const normalizationMean = normalizationMeans.get(`${row.platePair}\u0000${row.armCondition}`);
      if (!Number.isFinite(normalizationMean) || normalizationMean <= 0) return;
      prepared.push({
        ...row,
        viability: row.originalOD / normalizationMean * 100,
        controlOD: normalizationMean,
        rawPlate: false
      });
    });
  });

  return { rows: prepared, excludedControls, excludedTreatments };
}

function prepareImportedRows(rows) {
  const rawRows = rows.filter(row => row.rawPlate);
  const longRows = rows.filter(row => !row.rawPlate);
  const rawResult = prepareRawPlateRows(rawRows);
  const preparedLongRows = [];
  let excludedLongRows = 0;
  groupRows(
    longRows,
    row => `${row.platePair || '__unpaired__'}\u0000${row.drugCode}\u0000${row.group}\u0000${row.concentration}`
  ).forEach(group => {
    const filtered = filterRowsByMad(group, row => row.viability);
    preparedLongRows.push(...filtered.kept);
    excludedLongRows += filtered.dropped.length;
  });
  return {
    rows: [...rawResult.rows, ...preparedLongRows],
    excluded: rawResult.excludedControls + rawResult.excludedTreatments + excludedLongRows
  };
}

function parseExperimentCsv(csvText, fileName, diagnostics = null) {
  const rows = csvToRows(csvText);
  if (rows.length < 2) {
    diagnostics?.errors.push('没有表头或数据行');
    return [];
  }

  const normalizedHeaders = rows[0].map(normalizeHeader);

  const codeIndex = findHeaderIndex(normalizedHeaders, ['DrugCode', 'Drug Code', 'Code', '药物代号', '代号']);
  const groupIndex = findHeaderIndex(normalizedHeaders, ['Group', 'Condition', 'Treatment', '组', '分组', '处理组']);
  const concentrationIndex = findHeaderIndex(normalizedHeaders, ['Concentration', 'Dose', '浓度', '剂量']);
  const viabilityIndex = findHeaderIndex(normalizedHeaders, ['Viability', 'Cell Viability', 'CCK', 'CCK8', 'Value', '细胞活性', '活性']);
  const wellIndex = findHeaderIndex(normalizedHeaders, ['Well', 'Well ID', '孔', '孔位', '位置']);

  const missingColumns = [];
  if (codeIndex < 0) missingColumns.push('DrugCode');
  if (groupIndex < 0) missingColumns.push('Group');
  if (concentrationIndex < 0) missingColumns.push('Concentration');
  if (viabilityIndex < 0) missingColumns.push('Viability');
  if (missingColumns.length) {
    diagnostics?.errors.push(`缺少必需列：${missingColumns.join('、')}`);
    return [];
  }

  const plateType = derivePlateType(fileName);
  const platePair = extractPlateFileMeta(fileName).drugPair.toUpperCase() || fileName;

  const parsed = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 1 || row.every(cell => !String(cell || '').trim())) continue;
    if (diagnostics) diagnostics.dataRows += 1;

    const viabilityText = String(row[viabilityIndex] ?? '').trim();
    const viability = viabilityText === '' ? NaN : Number(viabilityText);
    const concentration = supportedConcentration(row[concentrationIndex]);
    const drugCode = String(row[codeIndex] || '').trim();

    if (!drugCode) {
      rejectImportedRow(diagnostics, 'DrugCode 为空');
      continue;
    }
    if (concentration === null) {
      rejectImportedRow(diagnostics, '浓度为空、非数值或不是 0/0.1/1/10 µM');
      continue;
    }
    if (!Number.isFinite(viability)) {
      rejectImportedRow(diagnostics, 'Viability 为空或非数值');
      continue;
    }

    let group = '';

    if (row[groupIndex]) {
      const groupRaw = String(row[groupIndex] || '').trim();
      group = GROUP_LABEL_MAP[groupRaw] || GROUP_LABEL_MAP[groupRaw.toLowerCase()] || groupRaw;
    }
    if (!VALID_EXPERIMENT_GROUPS.has(group)) {
      rejectImportedRow(diagnostics, 'Group 为空或不是支持的分组标签');
      continue;
    }

    parsed.push({
      drugCode,
      group,
      concentration,
      viability,
      plateType,
      platePair,
      rawPlate: false,
      file: fileName,
      well: row[wellIndex] || ''
    });
    if (diagnostics) diagnostics.acceptedRows += 1;
  }

  return parsed;
}

let heatmapViewMode = 'all';
let heatmapMetric = 'log2fc';
let heatmapSortMode = 'signal';
let heatmapQuery = '';

const HEATMAP_STATUS_LABELS = Object.freeze({
  synergy: '增敏候选',
  rescue: '直接救援候选',
  relativeAntagonism: '仅相对拮抗',
  stable: '未达双重判定'
});

function getHeatmapGroups(mode = heatmapViewMode) {
  const groups = {
    all: [
      ['无糖共处理', '无糖共处理'],
      ['KL11743共处理', 'KL11743 共处理'],
      ['铜死亡诱导剂共处理', 'ES + CuCl₂ 共处理']
    ],
    glucose: [['无糖共处理', '无糖共处理']],
    kl11743: [['KL11743共处理', 'KL11743 共处理']],
    copper: [['铜死亡诱导剂共处理', 'ES + CuCl₂ 共处理']],
    disulfidptosis_collage: [['无糖共处理', '无糖共处理'], ['KL11743共处理', 'KL11743 共处理']]
  };
  return groups[mode] || groups.glucose;
}

function heatmapPlatePair(row) {
  return row?.platePair || '__unpaired__';
}

function heatmapUnitKey(row) {
  return `${heatmapPlatePair(row)}\u0000${row.drugCode}`;
}

function heatmapCellKey(platePair, drugCode, group, concentration) {
  return `${platePair}\u0000${drugCode}\u0000${group}\u0000${concentration}`;
}

function buildHeatmapUnits(data, stats, groups, query = heatmapQuery, sortMode = heatmapSortMode) {
  const units = new Map();
  data.forEach(row => {
    if (!row?.drugCode) return;
    const platePair = heatmapPlatePair(row);
    const key = `${platePair}\u0000${row.drugCode}`;
    if (!units.has(key)) units.set(key, { key, platePair, drugCode: row.drugCode });
  });
  const statsByUnit = groupRows(stats || [], heatmapUnitKey);
  const visibleConditions = new Set(groups.map(([group]) => group));
  const normalizedQuery = normalizeDrugSearchTerm(query);
  const rows = [...units.values()].filter(unit => {
    if (!normalizedQuery) return true;
    const info = drugKnowledgeBase[unit.drugCode] || {};
    return [unit.drugCode, info.fullName, info.name, unit.platePair]
      .filter(Boolean)
      .some(value => normalizeDrugSearchTerm(value).includes(normalizedQuery));
  });

  rows.forEach(unit => {
    const relevantStats = (statsByUnit.get(unit.key) || [])
      .filter(row => visibleConditions.has(row.condition));
    unit.tierRank = relevantStats.some(row => row.tier === 'A')
      ? 0
      : relevantStats.some(row => row.tier === 'B') ? 1 : 2;
    const candidateStats = relevantStats.filter(row => row.tier === 'A' || row.tier === 'B');
    unit.signalScore = Math.max(
      0,
      ...(candidateStats.length ? candidateStats : relevantStats)
        .map(row => Number.isFinite(row.score) ? row.score : Math.abs(row.log2FC || 0))
    );
  });

  rows.sort((a, b) => {
    const byName = a.drugCode.localeCompare(b.drugCode, 'zh-CN') || a.platePair.localeCompare(b.platePair, 'zh-CN');
    if (sortMode === 'name') return byName;
    return a.tierRank - b.tierRank || b.signalScore - a.signalScore || byName;
  });
  return rows;
}

function buildHeatmapDataIndex(data, stats = latestVolcanoStats) {
  const values = new Map();
  data.forEach(row => {
    if (!Number.isFinite(row.viability)) return;
    const key = heatmapCellKey(heatmapPlatePair(row), row.drugCode, row.group, row.concentration);
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(row.viability);
  });
  const statsByCell = new Map();
  (stats || []).forEach(row => {
    statsByCell.set(heatmapCellKey(heatmapPlatePair(row), row.drugCode, row.condition, row.concentration), row);
  });
  return { values, statsByCell };
}

function heatmapUnitLabels(units) {
  const counts = new Map();
  units.forEach(unit => counts.set(unit.drugCode, (counts.get(unit.drugCode) || 0) + 1));
  return new Map(units.map(unit => {
    const fullName = drugKnowledgeBase[unit.drugCode]?.fullName;
    const drugLabel = fullName ? `${unit.drugCode} · ${fullName}` : unit.drugCode;
    const label = counts.get(unit.drugCode) > 1 ? `${drugLabel} · 板对 ${unit.platePair}` : drugLabel;
    return [unit.key, label];
  }));
}

function relativeLuminanceFromRgb(color) {
  const channels = (String(color).match(/\d+/g) || []).slice(0, 3).map(Number);
  if (channels.length !== 3) return 1;
  const linear = channels.map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function heatmapTextColor(background) {
  const luminance = relativeLuminanceFromRgb(background);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkLuminance = relativeLuminanceFromRgb('rgb(32, 59, 70)');
  const darkContrast = (Math.max(luminance, darkLuminance) + 0.05) / (Math.min(luminance, darkLuminance) + 0.05);
  return whiteContrast > darkContrast ? '#ffffff' : '#203b46';
}

function heatmapCellDetails(unit, group, concentration, value, samples, controls, stat) {
  const base = [`${unit.drugCode}`, `板对 ${unit.platePair}`, group, `${concentration} µM`];
  if (heatmapMetric === 'viability') {
    return [...base, `平均细胞活性 ${value.toFixed(2)}%`, `n=${samples.length}`].join('｜');
  }
  const status = HEATMAP_STATUS_LABELS[stat.status] || HEATMAP_STATUS_LABELS.stable;
  return [
    ...base,
    `交互 log₂FC ${value.toFixed(3)}`,
    `处理均值 ${stat.meanTreated.toFixed(2)}%`,
    `单药均值 ${stat.meanControl.toFixed(2)}%`,
    `绝对活力差 ${stat.interactionDifference.toFixed(2)} 个百分点`,
    `P=${stat.pValue < 0.001 ? stat.pValue.toExponential(2) : stat.pValue.toFixed(3)}`,
    `FDR q=${Number.isFinite(stat.qValue) ? (stat.qValue < 0.001 ? stat.qValue.toExponential(2) : stat.qValue.toFixed(3)) : 'NA'}`,
    `${status}${stat.tier === 'A' || stat.tier === 'B' ? `（${stat.tier}级）` : ''}`,
    `处理 n=${samples.length}`,
    `单药 n=${controls.length}`
  ].join('｜');
}

function buildHeatmap(data, stats = latestVolcanoStats) {
  const concentrations = SCREENING_CONCENTRATIONS;
  const groups = getHeatmapGroups();
  const units = buildHeatmapUnits(data, stats, groups);
  const labels = heatmapUnitLabels(units);
  const { values: groupedValues, statsByCell } = buildHeatmapDataIndex(data, stats);
  const table = document.createElement('table');
  const caption = document.createElement('caption');
  caption.textContent = heatmapMetric === 'log2fc'
    ? `每格在同一板对内比较共处理组与同药物、同浓度单药组；至少各 ${ANALYSIS_CONFIG.minReplicates} 个有效重复孔才显示交互 log₂FC。颜色只表示方向，A/B 边框表示结合绝对活力差、直接效应及多重校正后的候选等级；色标在 ±1.5 截断。`
    : '每格是在同一板对内汇总的重复孔平均细胞活性（%）；颜色以 100% 为参照并在 0–150% 截断，候选结论仍需查看交互效应和统计检验。';
  table.appendChild(caption);

  const groupHeader = document.createElement('tr');
  const drugHeader = document.createElement('th');
  drugHeader.rowSpan = 2;
  drugHeader.className = 'heatmap-drug-header';
  drugHeader.textContent = '药物';
  groupHeader.appendChild(drugHeader);
  groups.forEach(([, label]) => {
    const th = document.createElement('th');
    th.colSpan = concentrations.length;
    th.scope = 'colgroup';
    th.textContent = label;
    groupHeader.appendChild(th);
  });
  table.appendChild(groupHeader);

  const concentrationHeader = document.createElement('tr');
  groups.forEach(() => concentrations.forEach(concentration => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = `${concentration} µM`;
    concentrationHeader.appendChild(th);
  }));
  table.appendChild(concentrationHeader);

  units.forEach(unit => {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'heatmap-drug-name';
    th.textContent = labels.get(unit.key);
    th.title = th.textContent;
    row.appendChild(th);

    groups.forEach(([group]) => concentrations.forEach(concentration => {
      const cell = document.createElement('td');
      cell.className = 'heatmap-cell';
      const values = groupedValues.get(heatmapCellKey(unit.platePair, unit.drugCode, group, concentration)) || [];
      const controlValues = groupedValues.get(heatmapCellKey(unit.platePair, unit.drugCode, '单药', concentration)) || [];
      const stat = statsByCell.get(heatmapCellKey(unit.platePair, unit.drugCode, group, concentration));
      const treatedMean = values.length ? average(values) : null;
      const value = heatmapMetric === 'log2fc' ? stat?.log2FC ?? null : treatedMean;

      if (value !== null) {
        cell.textContent = heatmapMetric === 'log2fc' ? value.toFixed(2) : value.toFixed(1);
        const background = heatmapColor(value, heatmapMetric);
        cell.style.background = background;
        cell.style.color = heatmapTextColor(background);
        if (heatmapMetric === 'log2fc' && (stat?.tier === 'A' || stat?.tier === 'B')) {
          cell.classList.add(stat.tier === 'A' ? 'heatmap-tier-a' : 'heatmap-tier-b');
          const marker = document.createElement('span');
          marker.className = 'heatmap-tier-marker';
          marker.setAttribute('aria-hidden', 'true');
          marker.textContent = stat.tier;
          cell.appendChild(marker);
        }
        const details = heatmapCellDetails(unit, group, concentration, value, values, controlValues, stat);
        cell.title = details;
        cell.setAttribute('aria-label', details);
        cell.tabIndex = 0;
      } else {
        cell.textContent = '--';
        cell.classList.add('heatmap-missing');
        const reason = heatmapMetric === 'log2fc'
          ? `${unit.drugCode}｜板对 ${unit.platePair}｜${group}｜${concentration} µM｜不可计算：共处理组和单药组至少各需 ${ANALYSIS_CONFIG.minReplicates} 个有效重复孔且均值需大于 0`
          : `${unit.drugCode}｜板对 ${unit.platePair}｜${group}｜${concentration} µM｜缺失`;
        cell.title = reason;
        cell.setAttribute('aria-label', reason);
        cell.tabIndex = 0;
      }
      row.appendChild(cell);
    }));
    table.appendChild(row);
  });

  return table;
}

function heatmapColor(value, metric = 'viability') {
  if (metric === 'log2fc') {
    const normalized = clamp(value, -1.5, 1.5) / 1.5;
    return normalized <= 0
      ? interpolateColor([49, 130, 189], [247, 247, 247], normalized + 1)
      : interpolateColor([247, 247, 247], [203, 24, 29], normalized);
  }
  const clamped = clamp(value, 0, 150);
  if (clamped <= 100) {
    const ratio = clamped / 100;
    return interpolateColor([49, 130, 189], [247, 251, 255], ratio);
  }
  return interpolateColor([255, 245, 240], [203, 24, 29], (clamped - 100) / 50);
}

function interpolateColor(from, to, ratio) {
  const channels = from.map((value, index) => Math.round(value + (to[index] - value) * ratio));
  return `rgb(${channels.join(', ')})`;
}

function colorScale(value) {
  const c = Math.max(0, Math.min(1, 1 - value / 100));
  const r = Math.round(218 + c * 25);
  const g = Math.round(117 - c * 20);
  const b = Math.round(117 - c * 20);
  return `rgb(${r}, ${g}, ${b})`;
}

function renderHeatmap(data) {
  const heatmapHost = document.getElementById('heatmapChart');
  heatmapHost.replaceChildren();
  const title = document.getElementById('heatmapTitle');
  if (title) {
    title.textContent = heatmapMetric === 'log2fc'
      ? '热图：相对单药组的交互效应'
      : '热图：共处理组平均细胞活性';
  }
  if (!data.length) {
    heatmapHost.appendChild(createEmptyState('导入数据后生成热图'));
    return;
  }
  const table = buildHeatmap(data);
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  const scale = document.createElement('div');
  scale.className = `heatmap-scale ${heatmapMetric === 'viability' ? 'viability' : 'log2fc'}`;
  scale.setAttribute('role', 'img');
  scale.setAttribute('aria-label', heatmapMetric === 'log2fc'
    ? '交互 log₂FC 色标：小于等于负 1.5 为深蓝，0 为白色，大于等于正 1.5 为深红'
    : '平均细胞活性色标：0% 为深蓝，100% 为白色，大于等于 150% 为深红');
  const labels = heatmapMetric === 'log2fc'
    ? ['≤−1.5', '0', '≥1.5']
    : ['0%', '100%', '≥150%'];
  scale.innerHTML = `<span class="heatmap-scale-bar" aria-hidden="true"></span><span class="heatmap-scale-labels"><span>${labels[0]}</span><span>${labels[1]}</span><span>${labels[2]}</span></span>`;
  legend.appendChild(scale);
  if (heatmapMetric === 'log2fc') {
    [['tier-a', 'A级候选（实线）'], ['tier-b', 'B级候选（虚线）']].forEach(([className, label]) => {
      const item = document.createElement('span');
      item.className = 'heatmap-tier-legend';
      item.innerHTML = `<i class="heatmap-tier-swatch ${className}" aria-hidden="true"></i>${label}`;
      legend.appendChild(item);
    });
  }
  const missing = document.createElement('span');
  missing.className = 'heatmap-tier-legend';
  missing.innerHTML = '<i class="heatmap-missing-swatch" aria-hidden="true"></i>缺失 / 不可计算';
  legend.appendChild(missing);
  heatmapHost.appendChild(legend);
  heatmapHost.appendChild(table);
}

let volcanoZoom = 1;
let volcanoLabelFontSize = 10;
let latestVolcanoStats = [];
let volcanoViewMode = 'all';

function applyVolcanoZoom() {
  const label = document.getElementById('volcanoZoomValue');
  if (label) label.textContent = `${Math.round(volcanoZoom * 100)}%`;
}

function renderVolcano(data, precomputedPoints = null) {
  const host = document.getElementById('volcanoChart');
  host.replaceChildren();
  const basePoints = precomputedPoints || calculateVolcanoData(data);
  const viewConfig = getVolcanoViewConfig(data, basePoints, volcanoViewMode);
  const points = viewConfig.points;
  if (!points.length) {
    host.appendChild(createEmptyState(`暂无可计算的火山图数据；MAD 筛选后共处理组和单药组至少各需要 ${ANALYSIS_CONFIG.minReplicates} 个有效重复孔`));
    return;
  }

  const conditions = viewConfig.conditions;
  const conditionLabels = viewConfig.labels;
  const concentrations = SCREENING_CONCENTRATIONS;
  const cellW = 290 * volcanoZoom, cellH = 190 * volcanoZoom, left = 66, top = 82, right = 66;
  const width = left + cellW * concentrations.length + right;
  const height = top + cellH * conditions.length + 55;
  const svg = createSvg(width, height);
  svg.style.width = `${width}px`;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '按处理条件和浓度分面的增敏、直接救援与仅相对拮抗初筛火山图');

  const xLimit = Math.min(5, Math.max(1, Math.ceil(Math.max(...points.map(p => Math.abs(p.log2FC))) * 2) / 2));
  const yLimit = Math.max(2, Math.min(12, Math.ceil(Math.max(...points.map(p => p.negLog10P)) + 0.5)));
  const thresholdY = -Math.log10(ANALYSIS_CONFIG.pCutoff);
  const colors = { synergy: '#3182bd', rescue: '#de2d26', relativeAntagonism: '#d97706', stable: '#8b98a0' };
  const appendStatusMarker = (parent, status, x, y, size = 4, tier = 'none') => {
    let marker;
    if (status === 'rescue') {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x: x - size, y: y - size, width: size * 2, height: size * 2, rx: 1 }).forEach(([name, value]) => marker.setAttribute(name, value));
    } else if (status === 'relativeAntagonism') {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      marker.setAttribute('d', `M ${x} ${y - size - 1} L ${x + size + 1} ${y + size} L ${x - size - 1} ${y + size} Z`);
    } else {
      marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      marker.setAttribute('cx', x);
      marker.setAttribute('cy', y);
      marker.setAttribute('r', size);
    }
    if (tier === 'B') {
      marker.setAttribute('fill', '#fff');
      marker.setAttribute('stroke', colors[status]);
      marker.setAttribute('stroke-width', '1.8');
    } else {
      marker.setAttribute('fill', colors[status]);
      if (tier === 'A') {
        marker.setAttribute('stroke', colors[status]);
        marker.setAttribute('stroke-width', '1');
      }
    }
    parent.appendChild(marker);
    return marker;
  };

  [['synergy', '增敏'], ['rescue', '直接救援'], ['relativeAntagonism', '仅相对拮抗'], ['stable', '其他']]
    .forEach(([status, label], index) => {
      const legendX = left + 105 + index * 170;
      appendStatusMarker(svg, status, legendX, 12, 4, status === 'stable' ? 'none' : 'A');
      appendSvgText(svg, legendX + 8, 15, label, 'start', 9, '#445b66', '600');
    });

  appendStatusMarker(svg, 'synergy', left + 300, 34, 4, 'A');
  appendSvgText(svg, left + 309, 37, 'A级：通过相应 FDR（实心）', 'start', 8, '#445b66', '600');
  appendStatusMarker(svg, 'synergy', left + 490, 34, 4, 'B');
  appendSvgText(svg, left + 499, 37, 'B级：仅原始 p 达标（空心）', 'start', 8, '#445b66', '600');

  concentrations.forEach((concentration, col) => appendSvgText(svg, left + col * cellW + cellW / 2, 59, `${concentration} µM`, 'middle', 12, '#445b66', '700'));
  conditions.forEach((condition, row) => {
    appendSvgText(svg, left + cellW * concentrations.length + 32, top + row * cellH + cellH / 2, conditionLabels[condition], 'middle', 11, '#445b66', '700', -90);
    concentrations.forEach((concentration, col) => {
      const x0 = left + col * cellW, y0 = top + row * cellH;
      const pad = { left: 34, right: 12, top: 12, bottom: 28 };
      const plotW = cellW - pad.left - pad.right, plotH = cellH - pad.top - pad.bottom;
      const sx = value => x0 + pad.left + ((value + xLimit) / (2 * xLimit)) * plotW;
      const sy = value => y0 + pad.top + plotH - (Math.min(value, yLimit) / yLimit) * plotH;
      const panel = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x: x0 + pad.left, y: y0 + pad.top, width: plotW, height: plotH, fill: '#fff', stroke: '#dce7ea' }).forEach(([key, value]) => panel.setAttribute(key, value));
      svg.appendChild(panel);
      [-ANALYSIS_CONFIG.log2FcCutoff, ANALYSIS_CONFIG.log2FcCutoff]
        .forEach(value => appendSvgLine(svg, sx(value), y0 + pad.top, sx(value), y0 + pad.top + plotH, '#9aa9b0', '4 4'));
      appendSvgLine(svg, x0 + pad.left, sy(thresholdY), x0 + pad.left + plotW, sy(thresholdY), '#9aa9b0', '4 4');
      appendSvgLine(svg, sx(0), y0 + pad.top, sx(0), y0 + pad.top + plotH, '#e7edef');
      [-xLimit, 0, xLimit].forEach(value => appendSvgText(svg, sx(value), y0 + cellH - 9, String(value), 'middle', 8));
      [0, yLimit / 2, yLimit].forEach(value => appendSvgText(svg, x0 + pad.left - 6, sy(value) + 3, value.toFixed(value % 1 ? 1 : 0), 'end', 8));

      const facetPoints = points.filter(p => p.condition === condition && p.concentration === concentration);
      facetPoints.forEach(p => {
        const marker = appendStatusMarker(svg, p.status, sx(clamp(p.log2FC, -xLimit, xLimit)), sy(p.negLog10P), 3, p.tier);
        marker.setAttribute('opacity', p.status === 'stable' ? '0.45' : '0.88');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        const tierLabel = p.tier === 'none' ? '未达初筛阈值' : `${p.tier}级候选`;
        const statusLabel = { synergy: '增敏候选', rescue: '直接救援候选', relativeAntagonism: '仅相对拮抗', stable: '未达双重判定' }[p.status];
        const directText = Number.isFinite(p.directRatio)
          ? `\n直接活力比: ${p.directRatio.toFixed(3)}\n直接p: ${formatStatisticalValue(p, 'directPValue', 'directTestValid')}\n直接BH-FDR q: ${formatStatisticalValue(p, 'directQValue', 'directTestValid')}\n直接比较n: ${p.nTreated} vs ${p.nConditionControl}`
          : '\n缺少足够的诱导条件单独对照孔';
        title.textContent = `${p.drugName} (${p.drugCode})\n${statusLabel}\n交互log₂FC: ${p.log2FC.toFixed(3)}\n交互绝对活力差: ${p.interactionDifference.toFixed(1)} 个百分点\n交互p: ${formatStatisticalValue(p, 'pValue', 'interactionTestValid')}\n交互BH-FDR q: ${formatStatisticalValue(p, 'qValue', 'interactionTestValid')}${directText}\n${tierLabel}\nScore: ${p.score.toFixed(3)}`;
        marker.appendChild(title);
      });
      const labelBounds = {
        left: x0 + pad.left + 4,
        right: x0 + pad.left + plotW - 4,
        top: y0 + pad.top + 10,
        bottom: y0 + pad.top + plotH - 5
      };
      placeVolcanoLabels(
        svg,
        facetPoints.sort((a, b) => b.score - a.score).slice(0, 5),
        p => sx(clamp(p.log2FC, -xLimit, xLimit)),
        p => sy(p.negLog10P),
        labelBounds
      );
    });
  });
  appendSvgText(svg, left + cellW * 1.5, height - 8, '交互 log₂FC', 'middle', 11, '#445b66', '600');
  appendSvgText(svg, 14, top + cellH * conditions.length / 2, '-log₁₀(交互 p 值)', 'middle', 11, '#445b66', '600', -90);

  host.appendChild(svg);
  applyVolcanoZoom();
}

function getVolcanoViewConfig(data, basePoints, mode) {
  const labels = {
    无糖共处理: '无糖共处理',
    KL11743共处理: 'KL11743 共处理',
    铜死亡诱导剂共处理: 'ES + CuCl₂ 共处理',
  };
  const modeConditions = {
    all: ['无糖共处理', 'KL11743共处理', '铜死亡诱导剂共处理'],
    glucose: ['无糖共处理'],
    kl11743: ['KL11743共处理'],
    copper: ['铜死亡诱导剂共处理']
  };
  if (mode === 'disulfidptosis_collage') {
    const conditions = ['无糖共处理', 'KL11743共处理'];
    return { points: basePoints.filter(point => conditions.includes(point.condition)), conditions, labels };
  }
  const conditions = modeConditions[mode] || modeConditions.all;
  return { points: basePoints.filter(point => conditions.includes(point.condition)), conditions, labels };
}

function assignBenjaminiHochbergField(rows, pField, qField, validField) {
  groupRows(rows, row => row.condition).forEach(group => {
    const sorted = group
      .filter(row => Number.isFinite(row[pField]) && (!validField || row[validField] !== false))
      .sort((a, b) => a[pField] - b[pField]);
    let runningMinimum = 1;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const rank = index + 1;
      runningMinimum = Math.min(runningMinimum, sorted[index][pField] * sorted.length / rank);
      sorted[index][qField] = Math.min(1, runningMinimum);
    }
  });
}

const DATA_FILE_CONCURRENCY = 4;

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  const runners = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  let lastResponse;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      lastResponse = response;
      if (response.ok || (response.status !== 429 && response.status < 500)) return response;
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) {
      await new Promise(resolve => window.setTimeout(resolve, 300 * (2 ** attempt)));
    }
  }
  if (lastResponse) return lastResponse;
  throw lastError || new Error('网络请求失败');
}

function assignBenjaminiHochbergFdr(rows) {
  assignBenjaminiHochbergField(rows, 'pValue', 'qValue', 'interactionTestValid');
  assignBenjaminiHochbergField(rows, 'directPValue', 'directQValue', 'directTestValid');
  rows.forEach(row => {
    if (row.status === 'stable') {
      row.tier = 'none';
      return;
    }
    const interactionPassesFdr = row.qValue <= ANALYSIS_CONFIG.tierAFdrCutoff;
    const directPassesFdr = row.directQValue <= ANALYSIS_CONFIG.tierAFdrCutoff;
    const needsDirectEvidence = row.status === 'synergy' || row.status === 'rescue';
    row.tier = interactionPassesFdr && (!needsDirectEvidence || directPassesFdr) ? 'A' : 'B';
  });
  return rows;
}

function formatStatisticalValue(row, field, validField, digits = 3) {
  if (row?.[validField] === false || !Number.isFinite(row?.[field])) return '不可计算（零方差）';
  return row[field].toExponential(digits);
}

function calculateVolcanoData(data, conditionDefinitions = null) {
  const conditions = conditionDefinitions || [
    { name: '无糖共处理', sources: ['无糖共处理'] },
    { name: 'KL11743共处理', sources: ['KL11743共处理'] },
    { name: '铜死亡诱导剂共处理', sources: ['铜死亡诱导剂共处理'] }
  ];
  const concentrations = SCREENING_CONCENTRATIONS;
  const results = [];
  const groupedValues = new Map();

  data.forEach(row => {
    if (!Number.isFinite(row.viability)) return;
    const platePair = row.platePair || '__unpaired__';
    const key = `${platePair}\u0000${row.drugCode}\u0000${row.concentration}\u0000${row.group}`;
    if (!groupedValues.has(key)) groupedValues.set(key, []);
    groupedValues.get(key).push(row.viability);
  });
  const analysisUnits = [...new Set(data.map(row => `${row.platePair || '__unpaired__'}\u0000${row.drugCode}`))];
  const valuesFor = (platePair, drugCode, concentration, condition) => groupedValues.get(`${platePair}\u0000${drugCode}\u0000${concentration}\u0000${condition}`) || [];

  analysisUnits.forEach(unit => {
    const [platePair, drugCode] = unit.split('\u0000');
    concentrations.forEach(concentration => {
      const control = valuesFor(platePair, drugCode, concentration, '单药');
      if (control.length < ANALYSIS_CONFIG.minReplicates) return;
      conditions.forEach(conditionDefinition => {
        const condition = conditionDefinition.name;
        const treated = conditionDefinition.sources.flatMap(source => valuesFor(platePair, drugCode, concentration, source));
        if (treated.length < ANALYSIS_CONFIG.minReplicates) return;
        const conditionControl = conditionDefinition.sources.flatMap(source => valuesFor(platePair, drugCode, 0, source));
        const hasDirectControl = conditionControl.length >= ANALYSIS_CONFIG.minReplicates;
        const meanControl = average(control), meanTreated = average(treated);
        if (meanControl <= 0 || meanTreated <= 0) return;
        const log2FC = Math.log2(meanTreated / meanControl);
        const interactionDifference = meanTreated - meanControl;
        const calculatedPValue = welchTTestPValue(treated, control);
        const interactionTestValid = Number.isFinite(calculatedPValue) && calculatedPValue >= 0;
        const pValue = interactionTestValid ? calculatedPValue : 1;
        const meanConditionControl = hasDirectControl ? average(conditionControl) : null;
        const directRatio = meanConditionControl > 0 ? meanTreated / meanConditionControl : null;
        const directLog2FC = directRatio > 0 ? Math.log2(directRatio) : null;
        const calculatedDirectPValue = hasDirectControl ? welchTTestPValue(treated, conditionControl) : null;
        const directTestValid = hasDirectControl && Number.isFinite(calculatedDirectPValue) && calculatedDirectPValue >= 0;
        const directPValue = hasDirectControl ? (directTestValid ? calculatedDirectPValue : 1) : null;
        const negLog10P = -Math.log10(Math.max(pValue, 1e-300));
        const interactionDown = interactionTestValid
          && log2FC <= -ANALYSIS_CONFIG.log2FcCutoff
          && interactionDifference <= -ANALYSIS_CONFIG.minAbsoluteInteractionDifference
          && pValue < ANALYSIS_CONFIG.pCutoff;
        const interactionUp = interactionTestValid
          && log2FC >= ANALYSIS_CONFIG.log2FcCutoff
          && interactionDifference >= ANALYSIS_CONFIG.minAbsoluteInteractionDifference
          && pValue < ANALYSIS_CONFIG.pCutoff;
        const directDown = directTestValid
          && directRatio <= ANALYSIS_CONFIG.directDecreaseRatio && directPValue < ANALYSIS_CONFIG.pCutoff;
        const directUp = directTestValid
          && directRatio >= ANALYSIS_CONFIG.directIncreaseRatio && directPValue < ANALYSIS_CONFIG.pCutoff;
        const status = interactionDown && directDown
          ? 'synergy'
          : interactionUp && directUp
            ? 'rescue'
            : interactionUp && directTestValid
              ? 'relativeAntagonism'
              : 'stable';
        results.push({
          platePair, drugCode, drugName: drugKnowledgeBase[drugCode]?.fullName || drugCode,
          condition, concentration, log2FC, interactionDifference, pValue, negLog10P,
          score: Math.abs(log2FC) * negLog10P, status,
          nTreated: treated.length, nControl: control.length,
          nConditionControl: conditionControl.length,
          meanTreated, meanControl, meanConditionControl,
          directRatio, directLog2FC, directPValue, interactionTestValid, directTestValid,
          qValue: null, directQValue: null, tier: 'none'
        });
      });
    });
  });
  return assignBenjaminiHochbergFdr(results);
}

const EFFECT_COUNT_CONDITIONS = Object.freeze([
  ['无糖共处理', '无糖共处理'],
  ['KL11743共处理', 'KL11743 共处理'],
  ['铜死亡诱导剂共处理', 'ES + CuCl₂ 共处理']
]);

function summarizeEffectCandidates(stats, statuses) {
  return EFFECT_COUNT_CONDITIONS.map(([condition, label]) => {
    const rows = stats.filter(row => row.condition === condition);
    const counts = { condition, label };
    statuses.forEach(({ key }) => {
      const matching = rows.filter(row => row.status === key);
      counts[key] = new Set(matching.map(row => row.drugCode)).size;
      counts[`${key}A`] = new Set(matching.filter(row => row.tier === 'A').map(row => row.drugCode)).size;
      counts[`${key}B`] = new Set(matching.filter(row => row.tier === 'B').map(row => row.drugCode)).size;
    });
    return counts;
  });
}

function renderCandidateCountChart(hostId, data, precomputedStats, statuses, ariaLabel) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.replaceChildren();
  const stats = precomputedStats || calculateVolcanoData(data);
  if (!stats.length) {
    host.appendChild(createEmptyState(`MAD 筛选后，共处理组和单药组至少各需 ${ANALYSIS_CONFIG.minReplicates} 个有效重复孔；完整分类还需足够的诱导条件单独对照孔`));
    return;
  }

  const summary = summarizeEffectCandidates(stats, statuses);
  const width = 820, height = 320;
  const margin = { left: 62, right: 24, top: 54, bottom: 58 };
  const plotH = height - margin.top - margin.bottom;
  const maxCount = Math.max(1, ...summary.flatMap(row => statuses.map(({ key }) => row[key])));
  const yMax = Math.max(5, Math.ceil(maxCount / 5) * 5);
  const svg = createSvg(width, height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', ariaLabel);

  [0, yMax / 2, yMax].forEach(value => {
    const y = margin.top + plotH - value / yMax * plotH;
    appendSvgLine(svg, margin.left, y, width - margin.right, y, '#e7edef');
    appendSvgText(svg, margin.left - 10, y + 4, String(Math.round(value)), 'end', 10);
  });
  const groupW = (width - margin.left - margin.right) / summary.length;
  summary.forEach((row, index) => {
    const center = margin.left + groupW * (index + 0.5);
    const barW = statuses.length === 1 ? 70 : 54;
    const totalBarWidth = statuses.length * barW + Math.max(0, statuses.length - 1) * 10;
    statuses.forEach(({ key, color }, barIndex) => {
      const value = row[key];
      const x = center - totalBarWidth / 2 + barIndex * (barW + 10);
      const barH = value / yMax * plotH;
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x, y: margin.top + plotH - barH, width: barW, height: barH, rx: 4, fill: color }).forEach(([name, attr]) => rect.setAttribute(name, attr));
      svg.appendChild(rect);
      appendSvgText(svg, x + barW / 2, margin.top + plotH - barH - 8,
        `${value} (A${row[`${key}A`]}/B${row[`${key}B`]})`, 'middle', 10, color, '700');
    });
    appendSvgText(svg, center, height - 25, row.label, 'middle', 11, '#445b66', '600');
  });
  const legendWidth = 190;
  const legendStart = width / 2 - statuses.length * legendWidth / 2;
  statuses.forEach(({ color, label }, index) => {
    const x = legendStart + index * legendWidth;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x, y: 15, width: 14, height: 10, rx: 2, fill: color }).forEach(([name, attr]) => marker.setAttribute(name, attr));
    svg.appendChild(marker);
    appendSvgText(svg, x + 21, 24, label, 'start', 10, '#445b66', '600');
  });
  appendSvgText(svg, 14, margin.top + plotH / 2, '药物数量', 'middle', 11, '#445b66', '600', -90);
  host.appendChild(svg);

  const detailGrid = document.createElement('div');
  detailGrid.className = 'effect-drug-grid';
  EFFECT_COUNT_CONDITIONS.forEach(([condition, conditionLabel]) => statuses.forEach(({ key, label: statusLabel }) => {
    const candidateRows = stats.filter(row => row.condition === condition && row.status === key);
    const tiersByCode = new Map();
    candidateRows.forEach(row => {
      if (!tiersByCode.has(row.drugCode) || row.tier === 'A') tiersByCode.set(row.drugCode, row.tier);
    });
    const codes = [...tiersByCode.keys()].sort();
    const aCount = [...tiersByCode.values()].filter(tier => tier === 'A').length;
    const bCount = [...tiersByCode.values()].filter(tier => tier === 'B').length;
    const details = document.createElement('details');
    details.className = 'effect-drug-details';
    const heading = document.createElement('summary');
    heading.textContent = `${conditionLabel} ${statusLabel}（A级 ${aCount} / B级 ${bCount}）`;
    details.appendChild(heading);
    if (codes.length) {
      const list = document.createElement('ul');
      codes.forEach(code => {
        const item = document.createElement('li');
        const name = drugKnowledgeBase[code]?.fullName;
        item.textContent = name ? `[${tiersByCode.get(code)}级] ${code} — ${name}` : `[${tiersByCode.get(code)}级] ${code}`;
        list.appendChild(item);
      });
      details.appendChild(list);
    } else {
      const empty = document.createElement('p');
      empty.textContent = `未检出达到初筛阈值的${statusLabel}候选。`;
      details.appendChild(empty);
    }
    detailGrid.appendChild(details);
  }));
  host.appendChild(detailGrid);
}

function renderEffectCounts(data, precomputedStats = null) {
  renderCandidateCountChart(
    'effectCountChart', data, precomputedStats,
    [{ key: 'synergy', label: '增敏候选', color: '#3182bd' }],
    '各处理条件下 A/B 级增敏候选药物数量柱状图'
  );
}

let antagonismBarCondition = '无糖共处理';
let antagonismBarConcentration = 1;

function describeValues(values) {
  const finite = values.filter(Number.isFinite);
  const mean = finite.length ? average(finite) : null;
  const sd = finite.length > 1 ? Math.sqrt(sampleVariance(finite)) : 0;
  return { values: finite, mean, sd, n: finite.length };
}

function statisticalSignificance(pValue, valid = true) {
  if (!valid || !Number.isFinite(pValue)) return 'NA';
  if (pValue < 0.001) return '***';
  if (pValue < 0.01) return '**';
  if (pValue < 0.05) return '*';
  return 'ns';
}

function buildAntagonismBarData(data, stats, condition, concentration) {
  const candidatesByDrug = new Map();
  stats
    .filter(row => row.condition === condition
      && Math.abs(row.concentration - concentration) < 1e-9
      && (row.status === 'rescue' || row.status === 'relativeAntagonism'))
    .forEach(row => {
      const current = candidatesByDrug.get(row.drugCode);
      if (!current || row.score > current.score) candidatesByDrug.set(row.drugCode, row);
    });

  const valuesFor = (candidate, group, dose) => data
    .filter(row => (row.platePair || '__unpaired__') === candidate.platePair
      && row.drugCode === candidate.drugCode
      && row.group === group
      && Math.abs(row.concentration - dose) < 1e-9)
    .map(row => row.viability)
    .filter(Number.isFinite);

  return [...candidatesByDrug.values()]
    .map(candidate => ({
      ...candidate,
      displayName: drugKnowledgeBase[candidate.drugCode]?.name
        || drugKnowledgeBase[candidate.drugCode]?.fullName
        || candidate.drugCode,
      single: describeValues(valuesFor(candidate, '单药', concentration)),
      conditionOnly: describeValues(valuesFor(candidate, condition, 0)),
      combination: describeValues(valuesFor(candidate, condition, concentration))
    }))
    .filter(row => row.single.n && row.conditionOnly.n && row.combination.n)
    .sort((left, right) => right.score - left.score || left.drugCode.localeCompare(right.drugCode));
}

function appendSignificanceBracket(svg, x1, x2, y, label, color = '#445b66') {
  appendSvgLine(svg, x1, y + 5, x1, y, color);
  appendSvgLine(svg, x1, y, x2, y, color);
  appendSvgLine(svg, x2, y, x2, y + 5, color);
  appendSvgText(svg, (x1 + x2) / 2, y - 4, label, 'middle', 8, color, '700');
}

function formatMeanSd(group) {
  return Number.isFinite(group?.mean) ? `${group.mean.toFixed(1)} ± ${group.sd.toFixed(1)} (n=${group.n})` : '--';
}

function renderAntagonismCounts(data, precomputedStats = null) {
  renderCandidateCountChart(
    'antagonismCountChart', data, precomputedStats,
    [
      { key: 'rescue', label: '直接救援', color: '#de2d26' },
      { key: 'relativeAntagonism', label: '仅相对拮抗', color: '#d97706' }
    ],
    '各处理条件下 A/B 级直接救援和仅相对拮抗候选药物数量柱状图'
  );
}

function renderAntagonismViability(data, precomputedStats = null) {
  const host = document.getElementById('antagonismViabilityChart');
  if (!host) return;
  host.replaceChildren();
  const stats = precomputedStats || calculateVolcanoData(data);
  const candidates = buildAntagonismBarData(data, stats, antagonismBarCondition, antagonismBarConcentration);
  const conditionLabel = EFFECT_COUNT_CONDITIONS.find(([condition]) => condition === antagonismBarCondition)?.[1] || antagonismBarCondition;
  const title = document.getElementById('antagonismBarTitle');
  if (title) title.textContent = `抑制/拮抗候选细胞活性 · ${conditionLabel} · ${antagonismBarConcentration} µM`;

  if (!data.length) {
    host.appendChild(createEmptyState('导入实验数据后生成抑制/拮抗候选细胞活性柱状图'));
    return;
  }
  if (!candidates.length) {
    host.appendChild(createEmptyState(`${conditionLabel}、${antagonismBarConcentration} µM 下没有直接救援或仅相对拮抗候选`));
    return;
  }

  const groupWidth = 188;
  const width = Math.max(860, 90 + candidates.length * groupWidth + 30);
  const height = 510;
  const margin = { left: 72, right: 24, top: 76, bottom: 150 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const observedMaximum = Math.max(...candidates.flatMap(candidate => [
    candidate.single.mean + candidate.single.sd,
    candidate.conditionOnly.mean + candidate.conditionOnly.sd,
    candidate.combination.mean + candidate.combination.sd
  ]));
  const yMax = Math.max(125, Math.ceil(observedMaximum * 1.35 / 25) * 25);
  const yFor = value => margin.top + plotHeight - clamp(value, 0, yMax) / yMax * plotHeight;
  const svg = createSvg(width, height);
  svg.style.width = `${width}px`;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${conditionLabel} ${antagonismBarConcentration} µM 抑制和拮抗候选的单药、条件单独与共处理细胞活性均值加减标准差柱状图`);

  const barDefinitions = [
    ['single', '单药', '#64748b'],
    ['conditionOnly', '条件单独', '#d6a84b'],
    ['combination', '共处理', '#238b83']
  ];
  const legendStart = width / 2 - 210;
  barDefinitions.forEach(([, label, color], index) => {
    const x = legendStart + index * 145;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x, y: 16, width: 15, height: 11, rx: 2, fill: color }).forEach(([name, value]) => marker.setAttribute(name, value));
    svg.appendChild(marker);
    appendSvgText(svg, x + 22, 25, label, 'start', 10, '#445b66', '700');
  });
  appendSvgText(svg, width / 2, 48, '误差线：SD；交互=共处理 vs 单药；直接=共处理 vs 条件单独', 'middle', 9, '#647782', '500');

  for (let tick = 0; tick <= 4; tick += 1) {
    const value = yMax * tick / 4;
    const y = yFor(value);
    appendSvgLine(svg, margin.left, y, width - margin.right, y, tick === 0 ? '#72838a' : '#e2eaed');
    appendSvgText(svg, margin.left - 10, y + 4, String(Math.round(value)), 'end', 9, '#536d78');
  }
  appendSvgText(svg, 17, margin.top + plotHeight / 2, '归一化细胞活性（%）', 'middle', 11, '#314b55', '700', -90);

  const actualGroupWidth = plotWidth / candidates.length;
  candidates.forEach((candidate, candidateIndex) => {
    const center = margin.left + actualGroupWidth * (candidateIndex + 0.5);
    const barWidth = Math.min(34, actualGroupWidth / 5);
    const gap = Math.min(9, actualGroupWidth / 16);
    const totalWidth = barWidth * 3 + gap * 2;
    const startX = center - totalWidth / 2;
    const positions = [];

    barDefinitions.forEach(([key, label, color], barIndex) => {
      const group = candidate[key];
      const x = startX + barIndex * (barWidth + gap);
      const top = yFor(group.mean);
      const baseline = yFor(0);
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      Object.entries({ x, y: top, width: barWidth, height: Math.max(0, baseline - top), rx: 2, fill: color, stroke: '#203b46', 'stroke-width': 0.8 }).forEach(([name, value]) => rect.setAttribute(name, value));
      const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      tooltip.textContent = `${candidate.displayName} (${candidate.drugCode})\n${label}: ${formatMeanSd(group)}`;
      rect.appendChild(tooltip);
      svg.appendChild(rect);

      const errorTop = yFor(group.mean + group.sd);
      const errorBottom = yFor(Math.max(0, group.mean - group.sd));
      const errorX = x + barWidth / 2;
      appendSvgLine(svg, errorX, errorTop, errorX, errorBottom, '#203b46');
      appendSvgLine(svg, errorX - 5, errorTop, errorX + 5, errorTop, '#203b46');
      appendSvgLine(svg, errorX - 5, errorBottom, errorX + 5, errorBottom, '#203b46');
      positions.push(errorX);
    });

    const peak = Math.max(
      candidate.single.mean + candidate.single.sd,
      candidate.conditionOnly.mean + candidate.conditionOnly.sd,
      candidate.combination.mean + candidate.combination.sd
    );
    appendSignificanceBracket(
      svg, positions[0], positions[2], yFor(peak + yMax * 0.055),
      `交互 ${statisticalSignificance(candidate.pValue, candidate.interactionTestValid)}`
    );
    appendSignificanceBracket(
      svg, positions[1], positions[2], yFor(peak + yMax * 0.13),
      `直接 ${statisticalSignificance(candidate.directPValue, candidate.directTestValid)}`
    );

    appendSvgText(svg, center, margin.top + plotHeight + 24, truncateLabel(candidate.displayName, 24), 'end', 9, '#203b46', '700', -38);
    appendSvgText(svg, center, height - 30,
      `${candidate.drugCode} · ${candidate.status === 'rescue' ? '直接救援' : '仅相对拮抗'}`,
      'middle', 8, candidate.status === 'rescue' ? '#b42318' : '#a15c00', '700');
  });
  host.appendChild(svg);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'antagonism-stat-table';
  const table = document.createElement('table');
  table.className = 'data-table';
  const caption = document.createElement('caption');
  caption.textContent = `${conditionLabel} ${antagonismBarConcentration} µM 抑制/拮抗候选统计明细`;
  table.appendChild(caption);
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['药物', '类型', '单药 mean ± SD', '条件单独 mean ± SD', '共处理 mean ± SD', '交互 p / q', '直接 p / q'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  candidates.forEach(candidate => {
    const row = document.createElement('tr');
    const values = [
      `${candidate.drugCode} · ${candidate.displayName}`,
      candidate.status === 'rescue' ? '直接救援' : '仅相对拮抗',
      formatMeanSd(candidate.single),
      formatMeanSd(candidate.conditionOnly),
      formatMeanSd(candidate.combination),
      `${formatStatisticalValue(candidate, 'pValue', 'interactionTestValid')} / ${formatStatisticalValue(candidate, 'qValue', 'interactionTestValid')}`,
      `${formatStatisticalValue(candidate, 'directPValue', 'directTestValid')} / ${formatStatisticalValue(candidate, 'directQValue', 'directTestValid')}`
    ];
    values.forEach(value => {
      const td = document.createElement('td');
      td.textContent = value;
      row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  host.appendChild(tableWrap);
}

function splitDrugTargets(targetText) {
  const target = String(targetText || '').trim().replace(/\s+/g, ' ');
  if (!target || /^(not specified|unknown|n\/a|na)$/i.test(target)) return [];
  // FDA 原始表的 Target 单元格本身就是规范分类；括号内逗号和斜杠均属于靶点名称。
  return [target];
}

function renderTargetAnalysis(data) {
  const host = document.getElementById('targetCountChart');
  if (!host) return;
  host.replaceChildren();
  const importedCodes = [...new Set(data.map(row => row.drugCode))];
  const targetMap = new Map();

  importedCodes.forEach(code => {
    const drug = drugKnowledgeBase[code];
    if (!drug) return;
    splitDrugTargets(drug.targets).forEach(target => {
      if (!targetMap.has(target)) targetMap.set(target, new Set());
      targetMap.get(target).add(code);
    });
  });

  const targetRows = [...targetMap.entries()]
    .map(([target, codes]) => ({ target, codes: [...codes].sort(), count: codes.size }))
    .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target));
  if (!targetRows.length) {
    host.appendChild(createEmptyState('导入药物尚未匹配到 FDA 药物库靶点信息'));
    return;
  }

  const barSlot = 92;
  const width = Math.max(900, 90 + targetRows.length * barSlot);
  const height = 430;
  const margin = { left: 58, right: 24, top: 34, bottom: 150 };
  const plotH = height - margin.top - margin.bottom;
  const maxCount = Math.max(...targetRows.map(row => row.count));
  const yMax = Math.max(1, maxCount);
  const svg = createSvg(width, height);
  svg.style.width = `${width}px`;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '用户导入药物的 FDA 靶点分布柱状图');

  [0, Math.ceil(yMax / 2), yMax].forEach(value => {
    const y = margin.top + plotH - value / yMax * plotH;
    appendSvgLine(svg, margin.left, y, width - margin.right, y, '#e2eaed');
    appendSvgText(svg, margin.left - 9, y + 4, String(value), 'end', 10);
  });

  const availableW = width - margin.left - margin.right;
  targetRows.forEach((row, index) => {
    const centerX = margin.left + availableW / targetRows.length * (index + 0.5);
    const barW = Math.min(48, availableW / targetRows.length * 0.58);
    const barH = row.count / yMax * plotH;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: centerX - barW / 2, y: margin.top + plotH - barH, width: barW, height: barH, rx: 4, fill: '#235b9b' }).forEach(([name, value]) => rect.setAttribute(name, value));
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${row.target}：${row.count} 种药物\n${row.codes.join('、')}`;
    rect.appendChild(title);
    svg.appendChild(rect);
    appendSvgText(svg, centerX, margin.top + plotH - barH - 8, String(row.count), 'middle', 11, '#235b9b', '800');
    appendSvgText(svg, centerX - 3, margin.top + plotH + 15, truncateLabel(row.target, 28), 'end', 9, '#445b66', '600', -48);
  });
  appendSvgText(svg, 14, margin.top + plotH / 2, '已导入药物数量', 'middle', 11, '#445b66', '600', -90);
  host.appendChild(svg);

  const detailsSection = document.createElement('section');
  detailsSection.className = 'target-details-section';
  const toolbar = document.createElement('div');
  toolbar.className = 'target-details-toolbar';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '搜索靶点或药物名称…';
  search.setAttribute('aria-label', '搜索靶点或药物');
  const limitSelect = document.createElement('select');
  limitSelect.setAttribute('aria-label', '选择显示的靶点数量');
  [[15, '前 15 个靶点'], [30, '前 30 个靶点'], [0, '全部靶点']].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = label;
    limitSelect.appendChild(option);
  });
  const resultCount = document.createElement('span');
  resultCount.className = 'target-result-count';
  toolbar.append(search, limitSelect, resultCount);
  const detailsGrid = document.createElement('div');
  detailsGrid.className = 'target-drug-grid';

  const appendTargetRow = (row, index) => {
    const details = document.createElement('details');
    details.className = 'target-drug-details';
    const summary = document.createElement('summary');
    const rank = document.createElement('span');
    rank.className = 'target-rank';
    rank.textContent = String(index + 1).padStart(2, '0');
    const targetName = document.createElement('span');
    targetName.className = 'target-name';
    targetName.textContent = row.target;
    const count = document.createElement('span');
    count.className = 'target-count-badge';
    count.textContent = `${row.count} 种药物`;
    summary.append(rank, targetName, count);
    details.appendChild(summary);
    const list = document.createElement('ul');
    row.codes.forEach(code => {
      const item = document.createElement('li');
      const name = drugKnowledgeBase[code]?.fullName;
      item.textContent = name ? `${code} — ${name}` : code;
      list.appendChild(item);
    });
    details.appendChild(list);
    detailsGrid.appendChild(details);
  };

  const renderTargetDetails = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const limit = Number(limitSelect.value);
    const matched = targetRows.filter(row => {
      if (!query) return true;
      if (row.target.toLocaleLowerCase().includes(query)) return true;
      return row.codes.some(code => {
        const name = drugKnowledgeBase[code]?.fullName || '';
        return code.toLocaleLowerCase().includes(query) || name.toLocaleLowerCase().includes(query);
      });
    });
    const visible = limit > 0 && !query ? matched.slice(0, limit) : matched;
    detailsGrid.replaceChildren();
    visible.forEach((row, index) => appendTargetRow(row, targetRows.indexOf(row)));
    resultCount.textContent = query
      ? `找到 ${matched.length} 个靶点`
      : `显示 ${visible.length} / ${targetRows.length}`;
    if (!visible.length) detailsGrid.appendChild(createEmptyState('没有匹配的靶点或药物'));
  };
  search.addEventListener('input', renderTargetDetails);
  limitSelect.addEventListener('change', renderTargetDetails);
  detailsSection.append(toolbar, detailsGrid);
  host.appendChild(detailsSection);
  renderTargetDetails();
}

let vennViewMode = 'disulfidptosis';

function renderVennAnalysis(data, precomputedStats = null) {
  const host = document.getElementById('vennCharts');
  if (!host) return;
  host.replaceChildren();
  const stats = precomputedStats || calculateVolcanoData(data);
  if (!stats.length) {
    host.appendChild(createEmptyState('暂无可用于交集分析的增敏候选药物'));
    return;
  }

  const synergySet = (condition, concentration = null) => new Set(stats
    .filter(row => row.condition === condition && row.status === 'synergy' && (concentration === null || row.concentration === concentration))
    .map(row => row.drugCode));

  const views = {
    disulfidptosis: {
      title: '双硫死亡增敏交集',
      entries: [['KL11743 共处理', synergySet('KL11743共处理')], ['无糖共处理', synergySet('无糖共处理')]]
    },
    glucose: {
      title: '无糖共处理：浓度交集',
      entries: [['0.1 µM', synergySet('无糖共处理', 0.1)], ['1 µM', synergySet('无糖共处理', 1)], ['10 µM', synergySet('无糖共处理', 10)]]
    },
    kl11743: {
      title: 'KL11743：浓度交集',
      entries: [['0.1 µM', synergySet('KL11743共处理', 0.1)], ['1 µM', synergySet('KL11743共处理', 1)], ['10 µM', synergySet('KL11743共处理', 10)]]
    },
    copper: {
      title: 'ES + CuCl₂：浓度交集',
      entries: [['0.1 µM', synergySet('铜死亡诱导剂共处理', 0.1)], ['1 µM', synergySet('铜死亡诱导剂共处理', 1)], ['10 µM', synergySet('铜死亡诱导剂共处理', 10)]]
    }
  };
  const selectedView = views[vennViewMode] || views.disulfidptosis;
  host.appendChild(createVennCard(selectedView.title, selectedView.entries));
}

function createVennCard(title, entries) {
  const card = document.createElement('section');
  card.className = 'venn-card';
  const heading = document.createElement('h3');
  heading.textContent = title;
  card.appendChild(heading);
  const svg = entries.length === 2 ? drawTwoSetVenn(entries) : drawThreeSetVenn(entries);
  card.appendChild(svg);
  const commonDrugs = setIntersection(...entries.map(([, set]) => set));
  const details = document.createElement('details');
  details.className = 'venn-drug-details';
  details.open = commonDrugs.size > 0 && commonDrugs.size <= 12;
  const summary = document.createElement('summary');
  summary.textContent = `${entries.length === 2 ? '两组' : '三个浓度'}共同增敏药物（${commonDrugs.size}）`;
  details.appendChild(summary);
  if (commonDrugs.size) {
    const list = document.createElement('ul');
    [...commonDrugs].sort().forEach(code => {
      const item = document.createElement('li');
      const name = drugKnowledgeBase[code]?.fullName;
      item.textContent = name ? `${code} — ${name}` : code;
      list.appendChild(item);
    });
    details.appendChild(list);
  } else {
    const empty = document.createElement('p');
    empty.textContent = '没有同时达到原始 p 值与 log₂FC 初筛阈值的共同候选药物。';
    details.appendChild(empty);
  }
  card.appendChild(details);
  return card;
}

function setIntersection(...sets) {
  if (!sets.length) return new Set();
  return new Set([...sets[0]].filter(value => sets.slice(1).every(set => set.has(value))));
}

function setDifference(source, ...excluded) {
  return new Set([...source].filter(value => excluded.every(set => !set.has(value))));
}

function drawTwoSetVenn(entries) {
  const [[labelA, a], [labelB, b]] = entries;
  const svg = createSvg(390, 245);
  const overlap = setIntersection(a, b);
  const unionSize = new Set([...a, ...b]).size || 1;
  appendVennCircle(svg, 155, 125, 78, '#6baed6');
  appendVennCircle(svg, 235, 125, 78, '#3182bd');
  appendSvgText(svg, 115, 32, labelA, 'middle', 11, '#315b72', '700');
  appendSvgText(svg, 275, 32, labelB, 'middle', 11, '#315b72', '700');
  appendVennCount(svg, 125, 128, setDifference(a, b).size, unionSize);
  appendVennCount(svg, 195, 128, overlap.size, unionSize);
  appendVennCount(svg, 265, 128, setDifference(b, a).size, unionSize);
  appendSvgText(svg, 195, 226, `交集：${overlap.size} 个药物`, 'middle', 10, '#445b66', '600');
  return svg;
}

function drawThreeSetVenn(entries) {
  const [[labelA, a], [labelB, b], [labelC, c]] = entries;
  const svg = createSvg(390, 285);
  const unionSize = new Set([...a, ...b, ...c]).size || 1;
  appendVennCircle(svg, 155, 120, 76, '#6baed6');
  appendVennCircle(svg, 235, 120, 76, '#74c69d');
  appendVennCircle(svg, 195, 185, 76, '#f4a261');
  appendSvgText(svg, 95, 30, labelA, 'middle', 10, '#315b72', '700');
  appendSvgText(svg, 295, 30, labelB, 'middle', 10, '#315b72', '700');
  appendSvgText(svg, 195, 278, labelC, 'middle', 10, '#315b72', '700');
  const triple = setIntersection(a, b, c);
  appendVennCount(svg, 112, 112, setDifference(a, b, c).size, unionSize);
  appendVennCount(svg, 278, 112, setDifference(b, a, c).size, unionSize);
  appendVennCount(svg, 195, 230, setDifference(c, a, b).size, unionSize);
  appendVennCount(svg, 195, 91, setDifference(setIntersection(a, b), c).size, unionSize);
  appendVennCount(svg, 151, 175, setDifference(setIntersection(a, c), b).size, unionSize);
  appendVennCount(svg, 239, 175, setDifference(setIntersection(b, c), a).size, unionSize);
  appendVennCount(svg, 195, 151, triple.size, unionSize);
  return svg;
}

function appendVennCircle(svg, cx, cy, r, fill) {
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  Object.entries({ cx, cy, r, fill, stroke: fill, 'fill-opacity': 0.35, 'stroke-width': 2 }).forEach(([name, value]) => circle.setAttribute(name, value));
  svg.appendChild(circle);
}

function appendVennCount(svg, x, y, count, unionSize) {
  appendSvgText(svg, x, y, String(count), 'middle', 15, '#203b46', '800');
  appendSvgText(svg, x, y + 14, `${(count / unionSize * 100).toFixed(1)}%`, 'middle', 8, '#536d78', '500');
}

function sampleVariance(values) {
  if (values.length < 2) return NaN;
  const mean = average(values);
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function welchTTestPValue(a, b) {
  if (a.length < 2 || b.length < 2) return NaN;
  const varianceA = sampleVariance(a), varianceB = sampleVariance(b);
  // With no variance in either group, Welch's standard error is zero and the
  // inferential p value is undefined. Do not turn a rounded constant signal
  // into p=0; callers retain the effect size but conservatively treat p as 1.
  if (varianceA === 0 && varianceB === 0) return NaN;
  const termA = varianceA / a.length, termB = varianceB / b.length;
  const standardError = Math.sqrt(termA + termB);
  if (!Number.isFinite(standardError) || standardError === 0) return NaN;
  const t = Math.abs((average(a) - average(b)) / standardError);
  const df = ((termA + termB) ** 2) / ((termA ** 2) / (a.length - 1) + (termB ** 2) / (b.length - 1));
  return regularizedIncompleteBeta(df / (df + t * t), df / 2, 0.5);
}

function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? front * betaFraction(x, a, b) / a : 1 - front * betaFraction(1 - x, b, a) / b;
}

function betaFraction(x, a, b) {
  const tiny = 1e-30;
  let c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let result = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; result *= d * c;
    aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < 3e-12) break;
  }
  return result;
}

function logGamma(z) {
  const coefficients = [676.5203681218851, -1259.1392167224028, 771.3234287776531, -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let value = 0.9999999999998099;
  coefficients.forEach((coefficient, index) => { value += coefficient / (z + index + 1); });
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(value);
}

function appendSvgLine(svg, x1, y1, x2, y2, stroke, dash = '') {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  Object.entries({ x1, y1, x2, y2, stroke }).forEach(([key, value]) => line.setAttribute(key, value));
  if (dash) line.setAttribute('stroke-dasharray', dash);
  svg.appendChild(line);
}

function appendSvgText(svg, x, y, content, anchor = 'start', size = 9, fill = '#647782', weight = '400', rotate = 0) {
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  Object.entries({ x, y, fill, 'font-size': size, 'font-weight': weight, 'text-anchor': anchor }).forEach(([key, value]) => text.setAttribute(key, value));
  if (rotate) text.setAttribute('transform', `rotate(${rotate} ${x} ${y})`);
  text.textContent = content;
  svg.appendChild(text);
  return text;
}

function truncateLabel(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function placeVolcanoLabels(svg, points, getX, getY, bounds) {
  const placed = [];
  const offsets = [
    [0, -15], [42, -20], [-42, -20], [52, 4], [-52, 4],
    [38, 25], [-38, 25], [0, 34], [70, -34], [-70, -34]
  ];

  points.forEach(point => {
    const pointX = getX(point);
    const pointY = getY(point);
    const label = truncateLabel(point.drugName || point.drugCode, 18);
    const fontScale = volcanoLabelFontSize / 10;
    const labelWidth = Math.min(190, [...label].reduce((width, char) => width + (/[^\x00-\xff]/.test(char) ? 10 : 6.2), 0) * fontScale);
    const labelHeight = volcanoLabelFontSize + 3;
    let selected = null;

    for (const [dx, dy] of offsets) {
      const x = clamp(pointX + dx, bounds.left + labelWidth / 2, bounds.right - labelWidth / 2);
      const y = clamp(pointY + dy, bounds.top, bounds.bottom);
      const box = { left: x - labelWidth / 2, right: x + labelWidth / 2, top: y - labelHeight, bottom: y + 2 };
      if (!placed.some(other => volcanoLabelBoxesOverlap(box, other))) {
        selected = { x, y, box };
        break;
      }
    }

    if (!selected) {
      const fallbackY = clamp(bounds.top + placed.length * (volcanoLabelFontSize + 7), bounds.top, bounds.bottom);
      const fallbackX = clamp(pointX, bounds.left + labelWidth / 2, bounds.right - labelWidth / 2);
      selected = {
        x: fallbackX,
        y: fallbackY,
        box: { left: fallbackX - labelWidth / 2, right: fallbackX + labelWidth / 2, top: fallbackY - labelHeight, bottom: fallbackY + 2 }
      };
    }

    placed.push(selected.box);
    appendSvgLine(svg, pointX, pointY, selected.x, selected.y + 2, '#8da0a8');
    const text = appendSvgText(svg, selected.x, selected.y, label, 'middle', volcanoLabelFontSize, '#29444f', '700');
    text.setAttribute('paint-order', 'stroke');
    text.setAttribute('stroke', '#ffffff');
    text.setAttribute('stroke-width', '3');
    text.setAttribute('stroke-linejoin', 'round');
  });
}

function volcanoLabelBoxesOverlap(a, b) {
  const gap = 4;
  return !(a.right + gap < b.left || a.left - gap > b.right || a.bottom + gap < b.top || a.top - gap > b.bottom);
}

function createSvg(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  return svg;
}

function drawAxis(svg, xMin, xMax, yMin, yMax, margins, width, height) {
  const plotW = width - margins.left - margins.right;
  const plotH = height - margins.top - margins.bottom;

  const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  axis.setAttribute('x1', margins.left);
  axis.setAttribute('x2', width - margins.right);
  axis.setAttribute('y1', height - margins.bottom);
  axis.setAttribute('y2', height - margins.bottom);
  axis.setAttribute('stroke', '#7a8490');
  svg.appendChild(axis);

  const axisY = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  axisY.setAttribute('x1', margins.left);
  axisY.setAttribute('x2', margins.left);
  axisY.setAttribute('y1', margins.top);
  axisY.setAttribute('y2', height - margins.bottom);
  axisY.setAttribute('stroke', '#7a8490');
  svg.appendChild(axisY);

  for (let i = 0; i <= 4; i++) {
    const xVal = xMin + ((xMax - xMin) / 4) * i;
    const px = margins.left + (plotW / 4) * i;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', px);
    text.setAttribute('y', height - margins.bottom + 20);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '8');
    text.textContent = Math.round(xVal * 100) / 100;
    svg.appendChild(text);
  }

  for (let i = 0; i <= 3; i++) {
    const yVal = yMin + ((yMax - yMin) / 3) * i;
    const py = height - margins.bottom - (plotH / 3) * i;

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', margins.left - 12);
    text.setAttribute('y', py + 3);
    text.setAttribute('text-anchor', 'end');
    text.setAttribute('font-size', '8');
    text.textContent = Math.round(yVal * 10) / 10;
    svg.appendChild(text);
  }
}

function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createEmptyState(message) {
  const state = document.createElement('div');
  state.className = 'empty-state';
  state.textContent = message;
  return state;
}

function renderAnalysis(data) {
  const volcanoStats = calculateVolcanoData(data);
  latestVolcanoStats = volcanoStats;
  renderSummary(data, volcanoStats);
  renderHeatmap(data);
  renderVolcano(data, volcanoStats);
  renderEffectCounts(data, volcanoStats);
  renderAntagonismCounts(data, volcanoStats);
  renderAntagonismViability(data, volcanoStats);
  renderTargetAnalysis(data);
  renderVennAnalysis(data, volcanoStats);
  renderRanking(data, volcanoStats);
}

const ANALYSIS_SETTING_FIELDS = Object.freeze([
  { id: 'log2FcCutoffInput', key: 'log2FcCutoff', min: 0, max: 5 },
  { id: 'absoluteDifferenceInput', key: 'minAbsoluteInteractionDifference', min: 0, max: 200 },
  { id: 'directDecreaseRatioInput', key: 'directDecreaseRatio', min: 0.01, max: 1 },
  { id: 'directIncreaseRatioInput', key: 'directIncreaseRatio', min: 1, max: 10 },
  { id: 'pCutoffInput', key: 'pCutoff', min: 0.000001, max: 1 },
  { id: 'fdrCutoffInput', key: 'tierAFdrCutoff', min: 0.000001, max: 1 }
]);

function updateAnalysisThresholdSummary() {
  const summary = document.getElementById('analysisThresholdSummary');
  if (!summary) return;
  summary.textContent = `当前阈值：|log₂FC| ≥ ${ANALYSIS_CONFIG.log2FcCutoff}；|绝对活力差| ≥ ${ANALYSIS_CONFIG.minAbsoluteInteractionDifference} 个百分点；直接活力比 ≤ ${ANALYSIS_CONFIG.directDecreaseRatio} 或 ≥ ${ANALYSIS_CONFIG.directIncreaseRatio}；p < ${ANALYSIS_CONFIG.pCutoff}；A级 FDR q ≤ ${ANALYSIS_CONFIG.tierAFdrCutoff}。`;
}

function syncAnalysisSettingsForm() {
  ANALYSIS_SETTING_FIELDS.forEach(({ id, key }) => {
    const input = document.getElementById(id);
    if (input) input.value = ANALYSIS_CONFIG[key];
  });
  updateAnalysisThresholdSummary();
}

function applyAnalysisSettingsFromForm() {
  const nextConfig = {};
  ANALYSIS_SETTING_FIELDS.forEach(({ id, key, min, max }) => {
    const input = document.getElementById(id);
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${input?.labels?.[0]?.textContent?.trim() || key}超出允许范围`);
    }
    nextConfig[key] = value;
  });
  Object.assign(ANALYSIS_CONFIG, nextConfig);
  updateAnalysisThresholdSummary();
  renderAnalysis(drugData);
}

function resetAnalysisSettings() {
  Object.assign(ANALYSIS_CONFIG, DEFAULT_ANALYSIS_CONFIG);
  syncAnalysisSettingsForm();
  renderAnalysis(drugData);
}

let rankingFilterMode = 'all';
let rankingConcentrationMode = 'all';

function filterStatsByConcentration(rows, concentrationMode) {
  if (concentrationMode === 'all') return rows;
  const concentration = Number(concentrationMode);
  if (!SCREENING_CONCENTRATIONS.includes(concentration)) return rows;
  return rows.filter(row => Math.abs(row.concentration - concentration) < 1e-9);
}

function renderRanking(data, precomputedStats = null) {
  const tbody = document.getElementById('rankingTable');
  tbody.replaceChildren();

  const isRescueView = rankingFilterMode.startsWith('antagonism_');
  const isRelativeAntagonismView = rankingFilterMode.startsWith('relative_antagonism_');
  const effectStatus = isRescueView ? 'rescue' : isRelativeAntagonismView ? 'relativeAntagonism' : 'synergy';
  const effectLabel = isRescueView ? '直接救援' : isRelativeAntagonismView ? '仅相对拮抗' : '增敏';
  const effectClass = effectStatus === 'relativeAntagonism' ? 'relative-antagonism' : effectStatus;
  const filterScope = isRescueView
    ? rankingFilterMode.replace(/^antagonism_/, '')
    : isRelativeAntagonismView
      ? rankingFilterMode.replace(/^relative_antagonism_/, '')
      : rankingFilterMode;
  const title = document.getElementById('rankingTitle');
  const caption = document.getElementById('rankingCaption');
  const scoreHeader = document.getElementById('rankingScoreHeader');
  const strongestHeader = document.getElementById('rankingStrongestHeader');
  const concentrationLabel = rankingConcentrationMode === 'all' ? '全部浓度' : `${rankingConcentrationMode} µM`;
  if (title) title.textContent = `药物${effectLabel}候选列表 · ${concentrationLabel}`;
  if (caption) caption.textContent = `药物${effectLabel}候选排名（${concentrationLabel}）`;
  if (scoreHeader) scoreHeader.textContent = `${effectLabel}评分`;
  if (strongestHeader) strongestHeader.textContent = `最强${effectLabel}效应`;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'table-empty';
    td.textContent = '导入实验数据后生成候选排名';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const drugs = [...new Set(data.map(d => d.drugCode))];
  const stats = precomputedStats || calculateVolcanoData(data);
  const tierPriority = { A: 0, B: 1, none: 2 };
  const bestCandidate = rows => rows.reduce((current, row) => {
    if (!current) return row;
    const tierDifference = tierPriority[row.tier] - tierPriority[current.tier];
    return tierDifference < 0 || (tierDifference === 0 && row.score > current.score) ? row : current;
  }, null);

  const allCandidateScores = drugs.map(drug => {
    const drugStats = stats.filter(row => row.drugCode === drug);
    const effectStats = filterStatsByConcentration(
      drugStats.filter(row => row.status === effectStatus),
      rankingConcentrationMode
    );
    const best = bestCandidate(effectStats);
    const bestDisulfidptosis = bestCandidate(effectStats
      .filter(row => row.condition === '无糖共处理' || row.condition === 'KL11743共处理'));
    const bestCuproptosis = bestCandidate(effectStats
      .filter(row => row.condition === '铜死亡诱导剂共处理'));

    return {
      code: drug,
      name: drugKnowledgeBase[drug]?.fullName || drug,
      bestDisulfidptosis,
      bestCuproptosis,
      score: best?.score || 0,
      best
    };
  }).filter(row => row.best);

  const drugScores = allCandidateScores.filter(row => {
    if (filterScope === 'disulfidptosis') return Boolean(row.bestDisulfidptosis);
    if (filterScope === 'cuproptosis') return Boolean(row.bestCuproptosis);
    if (filterScope === 'both') return Boolean(row.bestDisulfidptosis && row.bestCuproptosis);
    return true;
  });

  if (!drugScores.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'table-empty';
    const absoluteDifference = `${ANALYSIS_CONFIG.minAbsoluteInteractionDifference} 个百分点`;
    const threshold = isRescueView
      ? `交互 log₂FC ≥ ${ANALYSIS_CONFIG.log2FcCutoff}、绝对活力差 ≥ ${absoluteDifference}、直接活力比 ≥ ${ANALYSIS_CONFIG.directIncreaseRatio}`
      : isRelativeAntagonismView
        ? `交互 log₂FC ≥ ${ANALYSIS_CONFIG.log2FcCutoff}、绝对活力差 ≥ ${absoluteDifference}、但未达到直接救援标准`
        : `交互 log₂FC ≤ -${ANALYSIS_CONFIG.log2FcCutoff}、绝对活力差 ≤ -${absoluteDifference}、直接活力比 ≤ ${ANALYSIS_CONFIG.directDecreaseRatio}`;
    const emptyLabels = {
      all: `当前数据中没有达到 ${threshold} 且 p < ${ANALYSIS_CONFIG.pCutoff} 的${effectLabel}候选`,
      disulfidptosis: `没有检出双硫死亡${effectLabel}候选`,
      cuproptosis: `没有检出铜死亡${effectLabel}候选`,
      both: `没有检出同时作用于双硫死亡和铜死亡的${effectLabel}候选`
    };
    td.textContent = `${emptyLabels[filterScope] || emptyLabels.all}（${concentrationLabel}）`;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const maxScore = Math.max(0, ...drugScores.map(row => row.score));
  const conditionLabels = { 无糖共处理: '无糖共处理', KL11743共处理: 'KL11743 共处理', 铜死亡诱导剂共处理: 'ES + CuCl₂ 共处理' };
  const deathLabels = { 无糖共处理: '双硫死亡', KL11743共处理: '双硫死亡', 铜死亡诱导剂共处理: '铜死亡' };

  drugScores
    .sort((a, b) => tierPriority[a.best.tier] - tierPriority[b.best.tier] || b.score - a.score)
    .forEach(row => {
      const tr = document.createElement('tr');
      const codeCell = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = 'status-dot';
      dot.dataset.effect = row.best?.status || 'stable';
      const codeLink = document.createElement('a');
      codeLink.className = 'ranking-drug-link';
      codeLink.href = '#knowledgeSection';
      codeLink.dataset.drugCode = row.code;
      codeLink.textContent = row.code;
      codeCell.append(dot, codeLink);

      const nameCell = document.createElement('td');
      const nameLink = document.createElement('a');
      nameLink.className = 'ranking-drug-link';
      nameLink.href = '#knowledgeSection';
      nameLink.dataset.drugCode = row.code;
      nameLink.textContent = row.name;
      nameCell.appendChild(nameLink);
      const createDeathCell = (result, type) => {
        const td = document.createElement('td');
        const badge = document.createElement('span');
        badge.className = `ranking-effect-badge ${result ? `is-${effectClass}` : 'is-none'}`;
        badge.textContent = result ? `${result.tier}级${type}${effectLabel}候选` : `未检出${type}${effectLabel}候选`;
        td.appendChild(badge);
        if (result) {
          const directText = Number.isFinite(result.directRatio)
            ? `；直接活力比=${result.directRatio.toFixed(3)}，直接p=${formatStatisticalValue(result, 'directPValue', 'directTestValid')}，直接q=${formatStatisticalValue(result, 'directQValue', 'directTestValid')}`
            : '；缺少足够的诱导条件单独对照孔';
          td.title = `${conditionLabels[result.condition]}，${result.concentration} µM；交互log₂FC=${result.log2FC.toFixed(3)}，绝对活力差=${result.interactionDifference.toFixed(1)}个百分点，交互p=${formatStatisticalValue(result, 'pValue', 'interactionTestValid')}，交互q=${formatStatisticalValue(result, 'qValue', 'interactionTestValid')}${directText}，${result.tier}级`;
        }
        return td;
      };
      const disulfidptosisCell = createDeathCell(row.bestDisulfidptosis, '双硫死亡');
      const cuproptosisCell = createDeathCell(row.bestCuproptosis, '铜死亡');

      const scoreCell = document.createElement('td');
      const scorebar = document.createElement('span');
      const scoreFill = document.createElement('span');
      scorebar.className = `scorebar is-${effectClass}`;
      scoreFill.style.width = `${maxScore > 0 ? row.score / maxScore * 100 : 0}%`;
      scorebar.appendChild(scoreFill);
      scoreCell.append(scorebar, document.createTextNode(row.score.toFixed(3)));
      if (row.best) {
        const directText = Number.isFinite(row.best.directRatio) ? `，直接活力比=${row.best.directRatio.toFixed(3)}` : '';
        scoreCell.title = `评分=|交互log₂FC| × -log₁₀(交互p)；交互log₂FC=${row.best.log2FC.toFixed(3)}，绝对活力差=${row.best.interactionDifference.toFixed(1)}个百分点，交互p=${formatStatisticalValue(row.best, 'pValue', 'interactionTestValid')}，交互q=${formatStatisticalValue(row.best, 'qValue', 'interactionTestValid')}${directText}，${row.best.tier}级`;
      }

      const signalCell = document.createElement('td');
      signalCell.textContent = row.best
        ? `${row.best.tier}级${deathLabels[row.best.condition]}${effectLabel}候选 · ${conditionLabels[row.best.condition]} · ${row.best.concentration} µM`
        : '数据不足';
      tr.append(codeCell, nameCell, disulfidptosisCell, cuproptosisCell, scoreCell, signalCell);
      tr.className = 'ranking-row-link';
      tr.dataset.drugCode = row.code;
      tr.tabIndex = 0;
      tr.setAttribute('role', 'button');
      tr.setAttribute('aria-label', `查看 ${row.code} ${row.name} 的药物信息`);
      tr.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectDrugForDetails(row.code);
        }
      });
      tbody.appendChild(tr);
    });
}

function renderSummary(data, precomputedStats = null) {
  const drugCodes = [...new Set(data.map(d => d.drugCode))];
  const drugCount = document.getElementById('drugCount');
  if (drugCount) drugCount.textContent = String(drugCodes.length);
  const stats = precomputedStats || calculateVolcanoData(data);
  const candidates = new Set(stats.filter(row => row.status === 'synergy').map(row => row.drugCode));
  const candidateCount = document.getElementById('candidateCount');
  if (candidateCount) candidateCount.textContent = String(candidates.size);
}

const NON_SPECIFIC_DRUG_TARGETS = new Set([
  '', 'na', 'n/a', 'none', 'unknown', 'unspecified', 'not specified', 'not specific',
  'other', 'others', 'antibiotic', 'antifungal', 'antimalaria', 'antioxidants',
  'apoptosis inducers', 'autophagy', 'alzheimer', 'calcimimetic agent',
  'cholesterol absorption', 'dna alkylating', 'dna synthesis', 'folate analogue',
  'gap junction', 'glycoprotein', 'hbv', 'hcv', 'hiv', 'hsv', 'influenza a virus',
  'nature products', 'neuroscience', 'nucleoside antimetabolite/analogue',
  'raas', 'reagents', 'saccharometabolism', 'ssris', 'transferase',
  'dehydrogenase', 'hydroxylases', 'reductases', 'serine protease'
]);

function getSpecificDrugTarget(value) {
  const target = String(value || '').replace(/\s+/g, ' ').trim();
  const normalized = target.toLowerCase();
  if (!target || NON_SPECIFIC_DRUG_TARGETS.has(normalized) || normalized.startsWith('other ') || /^(?:n\.?a\.?|not[\s-]*(?:specified|specific))$/i.test(normalized)) return '';
  return target;
}

function renderScholarLink(info, enabled) {
  const scholarLink = document.getElementById('googleScholarLink');
  if (!scholarLink) return;
  scholarLink.hidden = true;
  scholarLink.removeAttribute('href');
  if (!enabled) return;

  const drugName = String(info.fullName || info.name || info.code || '').trim();
  const scholarQuery = `"${drugName}" (disulfidptosis OR cuproptosis OR ferroptosis)`;
  scholarLink.href = `https://scholar.google.com/scholar?q=${encodeURIComponent(scholarQuery)}`;
  scholarLink.hidden = false;
}

function renderPathwayMessage(message) {
  const host = document.getElementById('pathwayResults');
  if (!host) return;
  host.replaceChildren();
  const text = document.createElement('div');
  text.className = 'pathway-message';
  text.textContent = message;
  host.appendChild(text);
}

function renderPathwayResults(payload) {
  const host = document.getElementById('pathwayResults');
  const summary = document.getElementById('pathwayResourceSummary');
  if (!host || !summary) return;
  host.replaceChildren();

  const pathways = Array.isArray(payload?.pathways) ? payload.pathways : [];
  summary.textContent = `FDA 药物库 Target：${payload.target} · Reactome 共匹配 ${Number(payload.total) || pathways.length} 条，当前展示前 ${pathways.length} 条。`;
  if (!pathways.length) {
    renderPathwayMessage('Reactome 暂未返回该靶点相关的人类通路。请核对 FDA 药物库 Target，或稍后刷新。');
    return;
  }

  pathways.forEach(pathway => {
    const item = document.createElement('article');
    item.className = 'pathway-item';

    const title = document.createElement('a');
    title.className = 'pathway-title';
    title.href = pathway.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = pathway.name || pathway.id;

    const meta = document.createElement('div');
    meta.className = 'pathway-meta';
    const id = document.createElement('span');
    id.textContent = pathway.id;
    const species = document.createElement('span');
    species.textContent = (pathway.species || []).join(' / ') || 'Homo sapiens';
    meta.append(id, species);
    if (pathway.isDisease) {
      const badge = document.createElement('span');
      badge.className = 'pathway-disease-badge';
      badge.textContent = '疾病通路';
      meta.appendChild(badge);
    }

    item.append(title, meta);
    if (pathway.summary) {
      const description = document.createElement('p');
      description.className = 'pathway-summary';
      description.textContent = pathway.summary;
      item.appendChild(description);
    }
    host.appendChild(item);
  });
}

async function fetchPathwaysForDrug(drug, force = false) {
  const summary = document.getElementById('pathwayResourceSummary');
  const refreshButton = document.getElementById('refreshPathwaysBtn');
  if (!summary || !refreshButton) return;

  const requestCode = String(drug?.code || '');
  const rawTarget = String(drug?.targets || '').replace(/\s+/g, ' ').trim();
  const specificTarget = getSpecificDrugTarget(rawTarget);
  refreshButton.disabled = !specificTarget || Boolean(drug?.isDemo);

  if (!drug) {
    summary.textContent = '选择药物后自动查询通路。';
    renderPathwayMessage('选择真实药物后显示其具体靶点相关的人类通路。');
    return;
  }
  if (drug.isDemo) {
    summary.textContent = '模拟药物不执行真实数据库查询。';
    renderPathwayMessage('模拟药物没有可核验的 Reactome 通路。');
    return;
  }
  if (!specificTarget) {
    summary.textContent = rawTarget && !/^(not specified|未录入)$/i.test(rawTarget)
      ? `FDA 药物库 Target 为“${rawTarget}”，它属于宽泛功能类别，不作为具体分子靶点查询。`
      : 'FDA 药物库未提供具体分子靶点，因此不查询通路。';
    renderPathwayMessage('未向 Reactome 发送请求。');
    return;
  }

  const cacheKey = specificTarget.toLocaleLowerCase();
  if (!force && pathwayCache.has(cacheKey)) {
    renderPathwayResults(pathwayCache.get(cacheKey));
    return;
  }

  if (pathwayController) pathwayController.abort();
  const requestController = new AbortController();
  pathwayController = requestController;
  summary.textContent = `FDA 药物库 Target：${specificTarget}`;
  renderPathwayMessage('正在安全查询 Reactome 人类通路…');

  try {
    const response = await fetch('/.netlify/functions/target-pathways', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: specificTarget }),
      signal: requestController.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
    pathwayCache.set(cacheKey, payload);
    if (activeDrugCode === requestCode) renderPathwayResults(payload);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (activeDrugCode === requestCode) renderPathwayMessage(`通路查询暂时失败：${error.message}`);
  }
}

function renderDrugInfo(code) {
  const knownInfo = drugKnowledgeBase[code];
  const info = knownInfo || {
    code,
    name: code,
    fullName: '未录入药物名称',
    category: '未录入',
    disease: '未录入',
    sensitivity: '未判定',
    conclusion: '实验中未发现该药物在当前数据库中的信息。',
    mechanism: '未录入作用机制与信号通路信息。',
    targets: '未录入',
    papers: '未录入数据库记录',
    score: 0,
    disulfidptosis: false,
    cuproptosis: false
  };

  document.getElementById('drugInfoCard').classList.remove('is-empty');
  document.getElementById('drugCode').textContent = code;
  document.getElementById('drugName').textContent = info.name;
  document.getElementById('drugFullName').textContent = info.fullName;
  document.getElementById('drugCategory').textContent = info.category;
  document.getElementById('drugDisease').textContent = info.disease;
  const experimentRows = latestVolcanoStats.filter(row => row.drugCode === code);
  const tierPriority = { A: 0, B: 1, none: 2 };
  const bestByTierThenScore = rows => rows.reduce((current, row) => {
    if (!current) return row;
    const tierDifference = tierPriority[row.tier] - tierPriority[current.tier];
    return tierDifference < 0 || (tierDifference === 0 && row.score > current.score) ? row : current;
  }, null);
  const bestExperiment = bestByTierThenScore(experimentRows);
  const conditionLabels = { 无糖共处理: '无糖共处理', KL11743共处理: 'KL11743 共处理', 铜死亡诱导剂共处理: 'ES + CuCl₂ 共处理' };
  const deathLabels = { 无糖共处理: '双硫死亡', KL11743共处理: '双硫死亡', 铜死亡诱导剂共处理: '铜死亡' };
  const effectLabels = { synergy: '增敏候选', rescue: '直接救援候选', relativeAntagonism: '仅相对拮抗', stable: '未达双重初筛阈值' };
  const describeExperimentEffect = row => row.status === 'stable'
    ? '未达到增敏、直接救援或仅相对拮抗阈值'
    : `${row.tier}级${effectLabels[row.status]}${deathLabels[row.condition]}`;
  const deathTypeDefinitions = [
    { label: '双硫死亡', conditions: ['无糖共处理', 'KL11743共处理'] },
    { label: '铜死亡', conditions: ['铜死亡诱导剂共处理'] }
  ];
  const experimentSummary = experimentRows.length
    ? `本次实验分类型结论：${deathTypeDefinitions.map(({ label, conditions }) => {
      const typeRows = experimentRows.filter(row => conditions.includes(row.condition));
      if (!typeRows.length) return `${label}：当前导入数据无可用统计`;
      // 优先展示该死亡类型的最强增敏候选；没有增敏候选时再展示最强总体效应。
      const representative = bestByTierThenScore(typeRows.filter(row => row.status === 'synergy')) || bestByTierThenScore(typeRows);
      const outcome = representative.status === 'stable'
        ? '未达到双重初筛阈值'
        : `${representative.tier}级${effectLabels[representative.status]}`;
      const directResult = Number.isFinite(representative.directRatio)
        ? `，直接活力比=${representative.directRatio.toFixed(3)}，直接p=${formatStatisticalValue(representative, 'directPValue', 'directTestValid')}，直接q=${formatStatisticalValue(representative, 'directQValue', 'directTestValid')}`
        : '，缺少足够的诱导条件单独对照孔';
      return `${label}：${outcome}（${conditionLabels[representative.condition]}，${representative.concentration} µM），交互log₂FC=${representative.log2FC.toFixed(3)}，交互p=${formatStatisticalValue(representative, 'pValue', 'interactionTestValid')}，交互q=${formatStatisticalValue(representative, 'qValue', 'interactionTestValid')}${directResult}，评分=${representative.score.toFixed(3)}`;
    }).join('；')}。`
    : '';
  document.getElementById('drugConclusion').textContent = experimentSummary ? `${experimentSummary} ${info.conclusion}` : info.conclusion;
  document.getElementById('drugMechanism').textContent = info.mechanism;
  document.getElementById('drugTargets').textContent = info.targets;
  renderScholarLink(info, Boolean(knownInfo && !info.isDemo));
  const sourceBlock = document.getElementById('drugSourceBlock');
  const sourceLink = document.getElementById('drugSourceUrl');
  let safeSourceUrl = '';
  try {
    const parsedUrl = new URL(String(info.url || '').trim());
    if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') safeSourceUrl = parsedUrl.href;
  } catch (error) {
    safeSourceUrl = '';
  }
  sourceBlock.hidden = !safeSourceUrl;
  if (safeSourceUrl) {
    sourceLink.href = safeSourceUrl;
    sourceLink.title = safeSourceUrl;
  } else {
    sourceLink.removeAttribute('href');
    sourceLink.removeAttribute('title');
  }
  document.getElementById('drugNotes').textContent = info.notes || info.evidence || '未录入';

  const evidenceStatus = document.getElementById('drugEvidenceStatus');
  if (info.isDemo) {
    evidenceStatus.className = 'evidence-note is-demo';
    evidenceStatus.textContent = '模拟演示数据｜该药物代号、资料字段和结果均为虚构，不是 FDA 药物记录，也不对应真实文献。';
  } else if (knownInfo) {
    evidenceStatus.className = 'evidence-note is-source';
    evidenceStatus.textContent = '知识库注释｜机制、靶点和适应症来自静态药物库，不由本次实验推断；请通过来源链接和文献原文核验。';
  } else {
    evidenceStatus.className = 'evidence-note is-unknown';
    evidenceStatus.textContent = '未匹配药物库｜仅展示本次导入数据的统计结果；没有可核验的机制、靶点或适应症注释。';
  }

  const tag = document.getElementById('drugSensitivity');
  tag.className = 'tag tag-signal';
  const significantSynergyTypes = [...new Set(experimentRows
    .filter(row => row.status === 'synergy')
    .map(row => deathLabels[row.condition]))];
  tag.textContent = significantSynergyTypes.length
    ? `${significantSynergyTypes.join(' / ')}增敏候选`
    : bestExperiment ? describeExperimentEffect(bestExperiment) : info.sensitivity || '未判定';

  if (!significantSynergyTypes.length && (['rescue', 'relativeAntagonism'].includes(bestExperiment?.status) || (!bestExperiment && info.disulfidptosis === false && info.cuproptosis === false))) {
    tag.className = bestExperiment?.status === 'relativeAntagonism' ? 'tag tag-caution' : 'tag tag-risk';
    if (!bestExperiment) tag.textContent = '未判定';
  }
  activeDrugCode = code;
  if (knownInfo) {
    Promise.resolve(fetchPathwaysForDrug(info)).catch(error => {
      renderPathwayMessage(`Reactome 自动查询失败：${error.message}`);
    });
  } else {
    document.getElementById('refreshPathwaysBtn').disabled = true;
    document.getElementById('pathwayResourceSummary').textContent = '当前药物未匹配到 FDA 药物库。';
    renderPathwayMessage('没有可靠的 FDA 药物库 Target，因此未向 Reactome 发送请求。');
  }
  document.getElementById('refreshPubmedBtn').disabled = !knownInfo || info.isDemo;
  document.getElementById('refreshClinicalTrialsBtn').disabled = !knownInfo || info.isDemo;
  if (info.isDemo) {
    document.getElementById('pubmedQuery').textContent = '模拟药物不执行文献检索';
    document.getElementById('clinicalTrialsQuery').textContent = '模拟药物不执行临床试验检索';
    renderPubmedMessage('QSI-01 / NPR-02 为虚构演示代号，因此不应将“无检索结果”解释为真实药物证据。');
    renderClinicalTrialsMessage('模拟药物不查询 ClinicalTrials.gov。');
  } else if (knownInfo) {
    Promise.resolve(fetchPubmedForDrug(info)).catch(error => {
      renderPubmedMessage(`PubMed 自动检索失败：${error.message}`);
    });
    Promise.resolve(fetchClinicalTrialsForDrug(info)).catch(error => {
      renderClinicalTrialsMessage(`ClinicalTrials.gov 自动检索失败：${error.message}`);
    });
  } else {
    renderPubmedMessage('未匹配到 FDA 药物，无法生成 PubMed 检索词。');
    renderClinicalTrialsMessage('未匹配到 FDA 药物，无法生成临床试验检索词。');
  }
}

function setDataMode(mode) {
  dataMode = mode;
  document.body.dataset.dataMode = mode;
  const demoBanner = document.getElementById('demoBanner');
  if (demoBanner) demoBanner.hidden = mode !== 'demo';
}

function enableDemoKnowledgeBase() {
  Object.assign(drugKnowledgeBase, demoDrugKnowledgeBase);
  rebuildDrugSearchIndex();
}

function disableDemoKnowledgeBase() {
  Object.keys(demoDrugKnowledgeBase).forEach(code => {
    if (drugKnowledgeBase[code]?.isDemo) delete drugKnowledgeBase[code];
  });
  rebuildDrugSearchIndex();
}

function clearDrugInfo() {
  activeDrugCode = '';
  if (pubmedController) pubmedController.abort();
  if (clinicalTrialsController) clinicalTrialsController.abort();
  if (pathwayController) pathwayController.abort();
  document.getElementById('drugInfoCard').classList.add('is-empty');
  document.getElementById('drugSearch').value = '';
  document.getElementById('drugCode').textContent = '--';
  document.getElementById('drugName').textContent = '尚未选择药物';
  ['drugFullName', 'drugCategory', 'drugDisease', 'drugConclusion', 'drugMechanism', 'drugTargets', 'drugNotes'].forEach(id => {
    document.getElementById(id).textContent = '--';
  });
  document.getElementById('drugSensitivity').textContent = '待分析';
  document.getElementById('drugSensitivity').className = 'tag';
  document.getElementById('drugEvidenceStatus').className = 'evidence-note';
  document.getElementById('drugEvidenceStatus').textContent = '尚未选择药物。药物资料与实验统计将分开标注来源。';
  document.getElementById('drugSourceBlock').hidden = true;
  renderScholarLink(null, false);
  fetchPathwaysForDrug(null);
  document.getElementById('pubmedQuery').textContent = '选择真实药物后检索';
  document.getElementById('clinicalTrialsQuery').textContent = '选择真实药物后检索';
  renderPubmedMessage('选择真实药物后自动检索 PubMed。');
  renderClinicalTrialsMessage('选择真实药物后自动检索 ClinicalTrials.gov。');
  document.getElementById('refreshPubmedBtn').disabled = true;
  document.getElementById('refreshClinicalTrialsBtn').disabled = true;
}

function renderPubmedMessage(message) {
  const host = document.getElementById('pubmedResults');
  if (!host) return;
  host.replaceChildren();
  const text = document.createElement('div');
  text.className = 'pubmed-message';
  text.textContent = message;
  host.appendChild(text);
}

function createPubmedAbortError() {
  const error = new Error('PubMed request aborted');
  error.name = 'AbortError';
  return error;
}

function waitForPubmedDelay(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(createPubmedAbortError());
  if (delayMs <= 0) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(createPubmedAbortError());
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function enqueuePubmedRequest(url, signal) {
  const request = pubmedRequestQueue.then(async () => {
    if (signal?.aborted) throw createPubmedAbortError();
    const elapsed = Date.now() - pubmedLastRequestStartedAt;
    await waitForPubmedDelay(Math.max(0, PUBMED_REQUEST_INTERVAL_MS - elapsed), signal);
    if (signal?.aborted) throw createPubmedAbortError();
    pubmedLastRequestStartedAt = Date.now();
    return fetch(url, { signal });
  });

  // 失败不能阻塞后续请求；调用方仍通过 request 收到原始异常。
  pubmedRequestQueue = request.then(() => undefined, () => undefined);
  return request;
}

function getPubmedRetryDelay(response, retryIndex) {
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(PUBMED_REQUEST_INTERVAL_MS, seconds * 1000);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.max(PUBMED_REQUEST_INTERVAL_MS, retryAt - Date.now());
    }
  }
  return 1000 * (2 ** retryIndex);
}

async function requestPubmedJson(url, failureLabel, signal) {
  for (let attempt = 0; attempt <= PUBMED_MAX_429_RETRIES; attempt++) {
    const response = await enqueuePubmedRequest(url, signal);
    if (response.status === 429) {
      if (attempt === PUBMED_MAX_429_RETRIES) {
        throw new Error(`${failureLabel}（429，延迟重试后仍被限流）`);
      }
      await waitForPubmedDelay(getPubmedRetryDelay(response, attempt), signal);
      continue;
    }
    if (!response.ok) throw new Error(`${failureLabel}（${response.status}）`);
    return response.json();
  }
  throw new Error(`${failureLabel}（请求失败）`);
}

async function fetchPubmedForDrug(drug, force = false) {
  const host = document.getElementById('pubmedResults');
  if (!host || !drug?.code) return;
  const requestCode = drug.code;
  document.getElementById('pubmedQuery').textContent = `${drug.fullName || drug.name || drug.code} × 双硫死亡 / 铜死亡 / 铁死亡（多词扩展）`;

  if (!force && pubmedCache.has(requestCode)) {
    renderPubmedResults(pubmedCache.get(requestCode));
    return;
  }

  if (pubmedController) pubmedController.abort();
  const requestController = new AbortController();
  pubmedController = requestController;
  renderPubmedMessage('正在检索 PubMed…');

  const rawTerms = [drug.fullName, drug.name, ...(drug.aliases || [])]
    .map(value => String(value || '').trim())
    .filter(value => value && value.toLowerCase() !== drug.code.toLowerCase());
  const terms = [...new Set(rawTerms)].slice(0, 4);
  if (!terms.length) terms.push(drug.code);
  const drugQuery = terms.map(term => `"${term.replace(/"/g, '')}"[Title/Abstract]`).join(' OR ');
  const deathQueries = [
    {
      type: '双硫死亡',
      terms: ['disulfidptosis', 'disulfide stress', 'disulfide-induced cell death', 'SLC7A11 NADPH depletion', 'actin cytoskeleton disulfide']
    },
    {
      type: '铜死亡',
      terms: ['cuproptosis', 'copper-dependent cell death', 'copper-induced cell death', 'FDX1 lipoylation', 'copper DLAT']
    },
    {
      type: '铁死亡',
      terms: ['ferroptosis', 'ferroptotic cell death', 'iron-dependent cell death', 'GPX4 lipid peroxidation', 'SLC7A11 ferroptosis']
    }
  ];

  try {
    const searches = [];
    for (const definition of deathQueries) {
      const deathQuery = definition.terms.map(term => `"${term}"[Title/Abstract]`).join(' OR ');
      const searchParams = new URLSearchParams({ db: 'pubmed', retmode: 'json', retmax: '12', sort: 'relevance', term: `(${drugQuery}) AND (${deathQuery})`, tool: 'DrugScope' });
      const result = await requestPubmedJson(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`,
        `PubMed ${definition.type}检索失败`,
        requestController.signal
      );
      searches.push({ type: definition.type, ids: result?.esearchresult?.idlist || [] });
    }
    const articleTypes = new Map();
    searches.forEach(result => result.ids.forEach(id => {
      if (!articleTypes.has(id)) articleTypes.set(id, new Set());
      articleTypes.get(id).add(result.type);
    }));
    const ids = [...articleTypes.keys()].slice(0, 24);
    if (!ids.length) {
      pubmedCache.set(requestCode, []);
      if (activeDrugCode === requestCode) renderPubmedResults([]);
      return;
    }

    const summaryParams = new URLSearchParams({ db: 'pubmed', retmode: 'json', id: ids.join(','), tool: 'DrugScope' });
    const summaryData = await requestPubmedJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`,
      'PubMed 文献摘要请求失败',
      requestController.signal
    );
    const articles = (summaryData?.result?.uids || []).map(id => ({
      ...summaryData.result[id],
      deathTypes: [...(articleTypes.get(id) || [])]
    })).filter(article => article.uid);
    pubmedCache.set(requestCode, articles);
    if (activeDrugCode === requestCode) renderPubmedResults(articles);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (activeDrugCode === requestCode) renderPubmedMessage(`PubMed 暂时无法访问：${error.message}`);
  }
}

function renderPubmedResults(articles) {
  const host = document.getElementById('pubmedResults');
  if (!host) return;
  host.replaceChildren();
  if (!articles.length) {
    renderPubmedMessage('暂未检索到该药物与双硫死亡、铜死亡或铁死亡相关的 PubMed 文献。');
    return;
  }

  articles.forEach(article => {
    const item = document.createElement('article');
    item.className = 'pubmed-item';
    const title = document.createElement('a');
    title.className = 'pubmed-title';
    title.href = `https://pubmed.ncbi.nlm.nih.gov/${article.uid}/`;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = article.title || `PubMed ${article.uid}`;
    const authors = (article.authors || []).slice(0, 3).map(author => author.name).filter(Boolean);
    if ((article.authors || []).length > 3) authors.push('et al.');
    const meta = document.createElement('div');
    meta.className = 'pubmed-meta';
    meta.textContent = [authors.join(', '), article.fulljournalname || article.source, article.pubdate, `PMID: ${article.uid}`].filter(Boolean).join(' · ');
    const typeBadges = document.createElement('div');
    typeBadges.className = 'pubmed-type-badges';
    (article.deathTypes || []).forEach(type => {
      const badge = document.createElement('span');
      badge.textContent = type;
      badge.dataset.type = type;
      typeBadges.appendChild(badge);
    });
    item.append(title, typeBadges, meta);
    host.appendChild(item);
  });
}

function renderClinicalTrialsMessage(message) {
  const host = document.getElementById('clinicalTrialsResults');
  if (!host) return;
  host.replaceChildren();
  const text = document.createElement('div');
  text.className = 'pubmed-message';
  text.textContent = message;
  host.appendChild(text);
}

async function fetchClinicalTrialsForDrug(drug, force = false) {
  const host = document.getElementById('clinicalTrialsResults');
  if (!host || !drug?.code) return;
  const requestCode = drug.code;
  document.getElementById('clinicalTrialsQuery').textContent = `${drug.fullName || drug.name || drug.code} 相关临床研究`;

  if (!force && clinicalTrialsCache.has(requestCode)) {
    renderClinicalTrialsResults(clinicalTrialsCache.get(requestCode));
    return;
  }

  if (clinicalTrialsController) clinicalTrialsController.abort();
  clinicalTrialsController = new AbortController();
  renderClinicalTrialsMessage('正在检索 ClinicalTrials.gov…');

  const rawTerms = [drug.fullName, drug.name, ...(drug.aliases || [])]
    .map(value => String(value || '').trim())
    .filter(value => value && value.toLowerCase() !== drug.code.toLowerCase());
  const terms = [...new Set(rawTerms)].slice(0, 3);
  if (!terms.length) terms.push(drug.code);
  const query = terms.map(term => `"${term.replace(/"/g, '')}"`).join(' OR ');

  try {
    const params = new URLSearchParams({ format: 'json', pageSize: '6', 'query.intr': query });
    const response = await fetch(`https://clinicaltrials.gov/api/v2/studies?${params}`, { signal: clinicalTrialsController.signal });
    if (!response.ok) throw new Error(`ClinicalTrials.gov 请求失败（${response.status}）`);
    const data = await response.json();
    const studies = data?.studies || [];
    clinicalTrialsCache.set(requestCode, studies);
    if (activeDrugCode === requestCode) renderClinicalTrialsResults(studies);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if (activeDrugCode === requestCode) renderClinicalTrialsMessage(`ClinicalTrials.gov 暂时无法访问：${error.message}`);
  }
}

function renderClinicalTrialsResults(studies) {
  const host = document.getElementById('clinicalTrialsResults');
  if (!host) return;
  host.replaceChildren();
  if (!studies.length) {
    renderClinicalTrialsMessage('暂未检索到该药物相关的 ClinicalTrials.gov 注册研究。');
    return;
  }

  const statusLabels = {
    RECRUITING: '招募中', NOT_YET_RECRUITING: '尚未开始招募', ACTIVE_NOT_RECRUITING: '进行中，停止招募',
    COMPLETED: '已完成', ENROLLING_BY_INVITATION: '邀请入组', SUSPENDED: '暂停', TERMINATED: '提前终止',
    WITHDRAWN: '已撤回', UNKNOWN: '状态未知'
  };
  studies.forEach(study => {
    const protocol = study.protocolSection || {};
    const identification = protocol.identificationModule || {};
    const status = protocol.statusModule || {};
    const design = protocol.designModule || {};
    const conditions = protocol.conditionsModule?.conditions || [];
    const interventions = protocol.armsInterventionsModule?.interventions || [];
    const nctId = identification.nctId;
    const item = document.createElement('article');
    item.className = 'clinical-trial-item';
    const title = document.createElement('a');
    title.className = 'pubmed-title';
    title.href = `https://clinicaltrials.gov/study/${nctId}`;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = identification.briefTitle || identification.officialTitle || nctId;

    const badges = document.createElement('div');
    badges.className = 'clinical-trial-badges';
    const badgeValues = [statusLabels[status.overallStatus] || String(status.overallStatus || '').replaceAll('_', ' '), ...(design.phases || []).map(formatClinicalPhase)].filter(Boolean);
    badgeValues.forEach(value => {
      const badge = document.createElement('span');
      badge.textContent = value;
      badges.appendChild(badge);
    });

    const meta = document.createElement('div');
    meta.className = 'pubmed-meta';
    const interventionNames = interventions.map(intervention => intervention.name).filter(Boolean).slice(0, 4);
    meta.textContent = [nctId, conditions.slice(0, 3).join(' / '), interventionNames.length ? `干预：${interventionNames.join(' / ')}` : ''].filter(Boolean).join(' · ');
    item.append(title, badges, meta);
    host.appendChild(item);
  });
}

function formatClinicalPhase(phase) {
  const labels = { EARLY_PHASE1: '早期 I 期', PHASE1: 'I 期', PHASE2: 'II 期', PHASE3: 'III 期', PHASE4: 'IV 期', NA: '不适用' };
  return labels[phase] || String(phase || '').replaceAll('_', ' ');
}

function selectDrugForDetails(code) {
  const normalizedCode = String(code || '').toUpperCase();
  const search = document.getElementById('drugSearch');
  if (search) search.value = normalizedCode;

  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    const selected = link.dataset.section === 'knowledgeSection';
    link.classList.toggle('active', selected);
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  const knowledgeSection = document.getElementById('knowledgeSection');
  window.history.replaceState(null, '', '#knowledgeSection');
  if (knowledgeSection) {
    knowledgeSection.scrollIntoView({ behavior: 'auto', block: 'start' });
    window.scrollTo({ top: Math.max(0, knowledgeSection.getBoundingClientRect().top + window.scrollY - 20), behavior: 'auto' });
  }

  // 先完成模块跳转，再执行详情渲染和两个远程检索；后者异常也不会阻断定位。
  window.setTimeout(() => {
    renderDrugInfo(normalizedCode);
    knowledgeSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);

  const infoCard = document.getElementById('drugInfoCard');
  infoCard?.classList.remove('drug-card-highlight');
  window.requestAnimationFrame(() => infoCard?.classList.add('drug-card-highlight'));
}

function createFileImportReport(fileName) {
  return {
    fileName,
    format: '',
    dataRows: 0,
    acceptedRows: 0,
    rejectedRows: 0,
    rejectedReasons: {},
    warnings: [],
    errors: []
  };
}

function collectImportQualityIssues(rows) {
  const issues = [];
  const expectedByGroup = new Map([
    ['单药', SCREENING_CONCENTRATIONS],
    ...CONDITION_GROUPS.map(group => [group, [0, ...SCREENING_CONCENTRATIONS]])
  ]);
  const units = groupRows(rows, row => `${row.platePair || '__unpaired__'}\u0000${row.drugCode}`);

  units.forEach((unitRows, key) => {
    const [platePair, drugCode] = key.split('\u0000');
    const unitIssues = [];
    expectedByGroup.forEach((concentrations, group) => {
      concentrations.forEach(concentration => {
        const count = unitRows.filter(row => row.group === group && Math.abs(row.concentration - concentration) < 1e-9).length;
        const label = `${group} ${concentration} µM`;
        if (count === 0) unitIssues.push(`${label} 缺失`);
        else if (count < ANALYSIS_CONFIG.minReplicates) unitIssues.push(`${label} 仅 ${count} 孔（不可分析）`);
        else if (count < 6) unitIssues.push(`${label} 剩余 ${count}/6 孔`);
        else if (count > 6) unitIssues.push(`${label} 有 ${count} 孔（预期 6，检查重复导入）`);
      });
    });
    if (unitIssues.length) issues.push(`${platePair}｜${drugCode}：${unitIssues.join('；')}`);
  });
  return issues;
}

function renderImportQualityReport(host, { totalFiles, successfulFiles, drugCount, excluded, fileReports, qualityIssues }) {
  const rejectedRows = fileReports.reduce((sum, report) => sum + report.rejectedRows, 0);
  const fileProblems = fileReports.flatMap(report => {
    const messages = [
      ...report.errors.map(message => `错误：${message}`),
      ...report.warnings.map(message => `警告：${message}`),
      ...Object.entries(report.rejectedReasons).map(([reason, count]) => `拒绝 ${count} 行：${reason}`)
    ];
    return messages.map(message => `${report.fileName}｜${message}`);
  });
  const details = [...fileProblems, ...qualityIssues];
  host.className = details.length ? 'import-log has-warnings' : 'import-log';
  host.replaceChildren();

  const summary = document.createElement('div');
  summary.textContent = `数据解析完成：成功 ${successfulFiles}/${totalFiles} 个文件，${drugCount} 种药物；MAD 剔除 ${excluded} 个离群孔；拒绝 ${rejectedRows} 行非法记录。`;
  host.appendChild(summary);

  if (details.length) {
    const disclosure = document.createElement('details');
    disclosure.className = 'import-quality-details';
    const heading = document.createElement('summary');
    heading.textContent = `查看 ${details.length} 项导入/完整性质控提示`;
    disclosure.appendChild(heading);
    const list = document.createElement('ul');
    const displayLimit = 100;
    details.slice(0, displayLimit).forEach(message => {
      const item = document.createElement('li');
      item.textContent = message;
      list.appendChild(item);
    });
    if (details.length > displayLimit) {
      const item = document.createElement('li');
      item.textContent = `另有 ${details.length - displayLimit} 项未展开，请先处理以上问题后重新导入。`;
      list.appendChild(item);
    }
    disclosure.appendChild(list);
    host.appendChild(disclosure);
  }
}

function handleDataFiles(files) {
  const selectedFiles = Array.from(files || []);
  const totalFiles = selectedFiles.length;
  const importLog = document.getElementById('importLog');
  const allowedFile = /\.(csv|txt|xls|xlsx)$/i;

  if (!selectedFiles.length) return;
  importLog.className = 'import-log';
  importLog.hidden = false;
  if (selectedFiles.some(file => !allowedFile.test(file.name))) {
    importLog.textContent = '导入失败：仅支持 CSV、TXT、XLS 或 XLSX 文件';
    return;
  }

  importLog.textContent = `正在解析 ${selectedFiles.length} 个表格…`;
  const all = [];
  const fileReports = new Array(totalFiles);
  let parsedCount = 0;
  runWithConcurrency(selectedFiles, DATA_FILE_CONCURRENCY, async (file, index) => {
    const report = createFileImportReport(file.name);
    fileReports[index] = report;
    try {
      const result = await readCsvFile(file);
      if (result.workbook) {
        const rawRows = parseRawPlateWorkbook(result.workbook, result.fileName);
        if (rawRows.length > 0) {
          report.format = '96孔原始板';
          report.dataRows = rawRows.length;
          report.acceptedRows = rawRows.length;
          if (rawRows.length !== 96) report.warnings.push(`识别到 ${rawRows.length}/96 个数值孔，请检查空孔和板式`);
          all.push(...rawRows);
        } else {
          report.format = '长表';
          const rows = parseExperimentCsv(result.csv, result.fileName, report);
          if (rows.length > 0) {
            all.push(...rows);
          }
        }
      } else {
        report.format = '长表';
        const rows = parseExperimentCsv(result.csv, result.fileName, report);
        if (rows.length > 0) {
          all.push(...rows);
        }
      }
      if (!report.acceptedRows && !report.errors.length) report.errors.push('没有可识别的有效实验记录');
    } catch (error) {
      report.errors.push(error.message || '文件读取失败');
    } finally {
      selectedFiles[index] = null;
      parsedCount += 1;
      if (parsedCount === totalFiles || parsedCount % 10 === 0) {
        importLog.textContent = `正在解析表格 ${parsedCount}/${totalFiles}…`;
      }
    }
    })
    .then(() => {

      if (!all.length) throw new Error('表格中没有可识别的实验记录');
      const prepared = prepareImportedRows(all);
      if (!prepared.rows.length) {
        throw new Error('实验记录缺少有效的条件对照孔或处理孔');
      }

      drugData = prepared.rows;
      disableDemoKnowledgeBase();
      setDataMode('uploaded');
      renderAnalysis(drugData);

      const uploadList = document.getElementById('uploadList');
      uploadList.replaceChildren();
      const filesLoaded = [...new Set(drugData.map(d => d.drugCode))];
      const successfulFiles = fileReports.filter(report => report.acceptedRows > 0).length;
      const summaryChip = document.createElement('span');
      summaryChip.className = 'upload-chip';
      summaryChip.textContent = `已导入 ${successfulFiles}/${totalFiles} 个药筛文件 · ${filesLoaded.length} 种药物`;
      uploadList.appendChild(summaryChip);

      clearDrugInfo();
      renderDrugInfo(filesLoaded[0]);

      renderImportQualityReport(importLog, {
        totalFiles,
        successfulFiles,
        drugCount: filesLoaded.length,
        excluded: prepared.excluded,
        fileReports,
        qualityIssues: collectImportQualityIssues(drugData)
      });
      importLog.hidden = false;
    })
    .catch(error => {
      importLog.textContent = `导入失败：${error.message || '无法读取该表格文件'}`;
      console.error(error);
    });
}

function loadSampleData() {
  enableDemoKnowledgeBase();
  setDataMode('demo');
  const expandedSampleRows = [sampleRows[0]];
  sampleRows.slice(1).forEach((row, index) => {
    const baseViability = Number(row[4]);
    const spread = 0.35 + (index % 3) * 0.15;
    [-1.2, -0.7, -0.25, 0.25, 0.7, 1.2].forEach((multiplier, replicateIndex) => {
      expandedSampleRows.push([
        String(index * 6 + replicateIndex + 1),
        ...row.slice(1, 4),
        (baseViability + spread * multiplier).toFixed(2)
      ]);
    });
  });
  const text = expandedSampleRows.map(row => row.join(',')).join('\n');
  const rows = parseExperimentCsv(text, 'QSI-01.csv');
  drugData = prepareImportedRows(rows).rows;

  renderAnalysis(drugData);

  const uploadList = document.getElementById('uploadList');
  uploadList.replaceChildren();
  const sampleDrugs = [...new Set(drugData.map(d => d.drugCode))];
  const summaryChip = document.createElement('span');
  summaryChip.className = 'upload-chip is-demo';
  summaryChip.textContent = `模拟演示数据 · ${sampleDrugs.length} 种虚构药物`;
  uploadList.appendChild(summaryChip);

  const importLog = document.getElementById('importLog');
  importLog.hidden = false;
  importLog.className = 'import-log is-demo';
  importLog.textContent = '已主动加载模拟示例；所有代号、数值和结论均不可作为真实科研证据。';

  renderDrugInfo('QSI-01');
}

async function initializeAuthenticatedSession() {
  const userLabel = document.getElementById('sessionUser');
  const logoutButton = document.getElementById('logoutBtn');

  try {
    const response = await fetch('/.netlify/functions/auth-session', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    // Keep the plain static development server usable. Netlify Dev supplies this endpoint locally.
    if (response.status === 404) return false;
    if (response.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      return true;
    }
    if (!response.ok) throw new Error(`Session request failed: ${response.status}`);
    const result = await response.json();
    userLabel.textContent = result.user?.name || result.user?.email || '已登录';
    userLabel.hidden = false;
    logoutButton.hidden = false;
    logoutButton.addEventListener('click', async () => {
      logoutButton.disabled = true;
      try {
        await fetch('/.netlify/functions/auth-logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' }
        });
      } finally {
        location.replace('/login.html');
      }
    });
    return true;
  } catch (error) {
    console.error('Unable to initialize authenticated session:', error);
    return false;
  }
}

async function loadPublishedScreeningData() {
  const importLog = document.getElementById('importLog');
  try {
    const manifestResponse = await fetch('/.netlify/functions/screening-data', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (manifestResponse.status === 401) {
      location.replace(`/login.html?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
      return;
    }
    if (!manifestResponse.ok) throw new Error(`数据清单请求失败（${manifestResponse.status}）`);
    const manifest = await manifestResponse.json();
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      importLog.hidden = false;
      importLog.textContent = '当前账号暂无已发布的药筛文件，请由站点管理员上传数据后重新加载。';
      return;
    }

    importLog.hidden = false;
    importLog.textContent = `正在安全加载 ${manifest.files.length} 个已发布药筛文件…`;
    const files = new Array(manifest.files.length);
    let loadedCount = 0;
    await runWithConcurrency(manifest.files, DATA_FILE_CONCURRENCY, async (entry, index) => {
      const response = await fetchWithRetry('/.netlify/functions/screening-data', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: entry.name })
      });
      if (!response.ok) throw new Error(`无法加载 ${entry.name}（HTTP ${response.status}）`);
      files[index] = new File([await response.blob()], entry.name);
      loadedCount += 1;
      if (loadedCount === manifest.files.length || loadedCount % 10 === 0) {
        importLog.textContent = `正在安全加载文件 ${loadedCount}/${manifest.files.length}…`;
      }
    });
    handleDataFiles(files);
  } catch (error) {
    console.error('Unable to load published screening data:', error);
    importLog.hidden = false;
    importLog.textContent = `已发布数据加载失败：${error.message}`;
  }
}

const exportChartNames = {
  heatmapChart: 'Drug_Activity_Heatmap',
  volcanoChart: 'Interaction_Dual_Effect_Volcano_Plot',
  effectCountChart: 'Sensitizing_Candidate_Counts',
  antagonismCountChart: 'Direct_Rescue_Relative_Antagonism_Counts',
  antagonismViabilityChart: 'Antagonism_Candidate_Cell_Viability',
  targetCountChart: 'FDA_Drug_Target_Distribution',
  vennCharts: 'Sensitizer_Venn_Analysis'
};

function collectPageCss() {
  return [...document.styleSheets].map(sheet => {
    try {
      return [...sheet.cssRules].map(rule => rule.cssText).join('\n');
    } catch (error) {
      return '';
    }
  }).join('\n');
}

function buildChartExportSvg(target) {
  if (target.id === 'heatmapChart') return buildHeatmapExportSvg();
  if (target.id === 'vennCharts') return buildVennExportSvg(target);
  return buildNativeSvgExport(target);
}

function buildNativeSvgExport(target) {
  const source = target.querySelector('svg');
  if (!source) throw new Error('该图表尚未生成');
  const clone = source.cloneNode(true);
  const viewBox = (clone.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  const width = viewBox[2] || Number(clone.getAttribute('width')) || 900;
  const height = viewBox[3] || Number(clone.getAttribute('height')) || 600;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', width);
  clone.setAttribute('height', height);
  clone.removeAttribute('style');
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  Object.entries({ x: 0, y: 0, width, height, fill: '#ffffff' }).forEach(([name, value]) => background.setAttribute(name, value));
  clone.insertBefore(background, clone.firstChild);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = 'text{font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif}';
  clone.insertBefore(style, clone.firstChild);
  return { svg: new XMLSerializer().serializeToString(clone), width, height };
}

function buildHeatmapExportSvg() {
  const concentrations = SCREENING_CONCENTRATIONS;
  const groups = getHeatmapGroups();
  const units = buildHeatmapUnits(drugData, latestVolcanoStats, groups);
  const labels = heatmapUnitLabels(units);
  const { values, statsByCell } = buildHeatmapDataIndex(drugData, latestVolcanoStats);
  const left = 240, cellW = 82, headerTop = 104, groupH = 34, doseH = 30, rowH = 28;
  const width = left + groups.length * concentrations.length * cellW + 20;
  const height = headerTop + groupH + doseH + units.length * rowH + 24;
  const scaleCenter = heatmapMetric === 'log2fc' ? 0.5 : 2 / 3;
  const scaleMiddleX = 12 + 200 * scaleCenter;
  const gradientStops = heatmapMetric === 'log2fc'
    ? '<stop offset="0%" stop-color="rgb(49,130,189)"/><stop offset="50%" stop-color="rgb(247,247,247)"/><stop offset="100%" stop-color="rgb(203,24,29)"/>'
    : '<stop offset="0%" stop-color="rgb(49,130,189)"/><stop offset="66.667%" stop-color="rgb(247,251,255)"/><stop offset="100%" stop-color="rgb(203,24,29)"/>';
  const scaleLabels = heatmapMetric === 'log2fc' ? ['≤−1.5', '0', '≥1.5'] : ['0%', '100%', '≥150%'];
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="heatmapColorScale" x1="0" x2="1">${gradientStops}</linearGradient><pattern id="heatmapMissing" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#f7f9fa"/><rect width="4" height="8" fill="#e7edef"/></pattern></defs>`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    '<style>text{font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif}.grid{stroke:#dce7ea;stroke-width:1}</style>',
    `<text x="12" y="24" font-size="16" font-weight="700" fill="#1d2b36">${heatmapMetric === 'log2fc' ? '相对单药组的交互效应热图' : '共处理组平均细胞活性热图'}</text>`,
    `<text x="12" y="44" font-size="10" fill="#647782">${heatmapMetric === 'log2fc' ? '同一板对内计算交互 log₂FC；颜色表示方向，候选等级由边框表示' : '同一板对内计算重复孔平均细胞活性（%）；100% 为色标参照'}</text>`,
    '<rect x="12" y="55" width="200" height="10" rx="2" fill="url(#heatmapColorScale)"/>',
    `<text x="12" y="79" font-size="9" fill="#647782">${scaleLabels[0]}</text>`,
    `<text x="${scaleMiddleX}" y="79" text-anchor="middle" font-size="9" fill="#647782">${scaleLabels[1]}</text>`,
    `<text x="212" y="79" text-anchor="end" font-size="9" fill="#647782">${scaleLabels[2]}</text>`,
    ...(heatmapMetric === 'log2fc' ? [
      '<rect x="240" y="54" width="20" height="14" fill="#fff" stroke="#173b48" stroke-width="3"/><text x="267" y="65" font-size="9" fill="#647782">A级候选</text>',
      '<rect x="330" y="54" width="20" height="14" fill="#fff" stroke="#7a4d00" stroke-width="2" stroke-dasharray="4 2"/><text x="357" y="65" font-size="9" fill="#647782">B级候选</text>'
    ] : []),
    '<rect x="430" y="54" width="20" height="14" fill="url(#heatmapMissing)" stroke="#dce7ea"/><text x="457" y="65" font-size="9" fill="#647782">缺失 / 不可计算</text>',
    `<rect class="grid" x="10" y="${headerTop}" width="${left - 10}" height="${groupH + doseH}" fill="#eef8f8"/>`,
    `<text x="20" y="${headerTop + 38}" font-size="11" font-weight="700" fill="#1d2b36">药物</text>`];

  groups.forEach(([, label], groupIndex) => {
    const x = left + groupIndex * concentrations.length * cellW;
    parts.push(`<rect class="grid" x="${x}" y="${headerTop}" width="${cellW * 3}" height="${groupH}" fill="#eef8f8"/>`);
    parts.push(`<text x="${x + cellW * 1.5}" y="${headerTop + 22}" text-anchor="middle" font-size="11" font-weight="700" fill="#1d2b36">${escapeXml(label)}</text>`);
    concentrations.forEach((concentration, index) => {
      const doseX = x + index * cellW;
      parts.push(`<rect class="grid" x="${doseX}" y="${headerTop + groupH}" width="${cellW}" height="${doseH}" fill="#f5fafb"/>`);
      parts.push(`<text x="${doseX + cellW / 2}" y="${headerTop + groupH + 20}" text-anchor="middle" font-size="10" fill="#445b66">${concentration} µM</text>`);
    });
  });

  units.forEach((unit, rowIndex) => {
    const y = headerTop + groupH + doseH + rowIndex * rowH;
    const label = labels.get(unit.key);
    parts.push(`<rect class="grid" x="10" y="${y}" width="${left - 10}" height="${rowH}" fill="#f8fbfc"/>`);
    parts.push(`<text x="18" y="${y + 18}" font-size="9" fill="#1d2b36">${escapeXml(truncateLabel(label, 34))}</text>`);
    groups.forEach(([group], groupIndex) => concentrations.forEach((concentration, doseIndex) => {
      const x = left + (groupIndex * 3 + doseIndex) * cellW;
      const samples = values.get(heatmapCellKey(unit.platePair, unit.drugCode, group, concentration)) || [];
      const stat = statsByCell.get(heatmapCellKey(unit.platePair, unit.drugCode, group, concentration));
      const treatedMean = samples.length ? average(samples) : null;
      const mean = heatmapMetric === 'log2fc' ? stat?.log2FC ?? null : treatedMean;
      const fill = mean === null ? 'url(#heatmapMissing)' : heatmapColor(mean, heatmapMetric);
      const color = mean === null ? '#647782' : heatmapTextColor(fill);
      const tier = heatmapMetric === 'log2fc' && (stat?.tier === 'A' || stat?.tier === 'B') ? stat.tier : null;
      const tierStyle = tier === 'A'
        ? ' stroke="#173b48" stroke-width="3"'
        : tier === 'B' ? ' stroke="#7a4d00" stroke-width="2" stroke-dasharray="4 2"' : '';
      parts.push(`<rect class="grid" x="${x}" y="${y}" width="${cellW}" height="${rowH}" fill="${fill}"${tierStyle}/>`);
      parts.push(`<text x="${x + cellW / 2}" y="${y + 18}" text-anchor="middle" font-size="9" fill="${color}">${mean === null ? '--' : mean.toFixed(heatmapMetric === 'log2fc' ? 2 : 1)}</text>`);
      if (tier) parts.push(`<text x="${x + cellW - 5}" y="${y + 10}" text-anchor="end" font-size="7" font-weight="700" fill="${color}">${tier}</text>`);
    }));
  });
  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}

function buildVennExportSvg(target) {
  const cards = [...target.querySelectorAll('.venn-card')];
  if (!cards.length) throw new Error('韦恩图尚未生成');
  const cardW = 420, cardH = 335, columns = Math.min(2, cards.length);
  const width = cardW * columns;
  const height = Math.ceil(cards.length / columns) * cardH;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff"/><style>text{font-family:"Segoe UI","Microsoft YaHei",Arial,sans-serif}</style>`];
  cards.forEach((card, index) => {
    const x = index % columns * cardW, y = Math.floor(index / columns) * cardH;
    const title = card.querySelector('h3')?.textContent || '';
    const source = card.querySelector('svg');
    const inner = source ? source.innerHTML : '';
    parts.push(`<rect x="${x + 6}" y="${y + 6}" width="${cardW - 12}" height="${cardH - 12}" rx="12" fill="#f9fbfc" stroke="#dce7ea"/>`);
    parts.push(`<text x="${x + cardW / 2}" y="${y + 27}" text-anchor="middle" font-size="13" font-weight="700" fill="#14394b">${escapeXml(title)}</text>`);
    parts.push(`<svg x="${x + 15}" y="${y + 34}" width="390" height="285" viewBox="0 0 390 285">${inner}</svg>`);
  });
  parts.push('</svg>');
  return { svg: parts.join(''), width, height };
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportChartImage(target, chartName, format, dpi) {
  const { svg, width, height } = buildChartExportSvg(target);
  if (format === 'svg') {
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${chartName}.svg`);
    return;
  }

  const scale = dpi / 96;
  const outputWidth = Math.round(width * scale);
  const outputHeight = Math.round(height * scale);
  if (outputWidth > 30000 || outputHeight > 30000 || outputWidth * outputHeight > 140000000) {
    throw new Error('所选分辨率超过浏览器画布限制，请降低 DPI，或改用 SVG/PDF');
  }

  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = svgUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.drawImage(image, 0, 0, outputWidth, outputHeight);
    const mimeType = `image/${format}`;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, format === 'jpeg' ? 0.95 : undefined));
    if (!blob) throw new Error('浏览器无法生成该图片格式');
    downloadBlob(blob, `${chartName}_${dpi}dpi.${format === 'jpeg' ? 'jpg' : format}`);
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function exportChartPdf(target, chartName) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('浏览器阻止了打印窗口，请允许本站弹出窗口');
  const css = collectPageCss();
  printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${chartName}</title><style>${css}\n@page{size:landscape;margin:10mm}body{margin:0;padding:16px;background:#fff}.sidebar,.topbar,.segmented,.volcano-toolbar{display:none!important}#${target.id}{max-height:none!important;overflow:visible!important;width:max-content!important;min-width:100%!important}.venn-grid{grid-template-columns:repeat(2,1fr)!important}</style></head><body>${target.outerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.addEventListener('load', () => window.setTimeout(() => printWindow.print(), 250));
}

async function runChartExport() {
  const chartId = document.getElementById('exportChartSelect').value;
  const format = document.getElementById('exportFormatSelect').value;
  const dpi = Number(document.getElementById('exportDpiSelect').value);
  const status = document.getElementById('exportStatus');
  const target = document.getElementById(chartId);
  if (!target || !target.children.length) {
    status.textContent = '请先导入数据并生成图表。';
    return;
  }

  status.textContent = format === 'pdf' ? '正在打开 PDF 打印页面…' : '正在生成文件…';
  const originalVolcanoMode = volcanoViewMode;
  const requestedVolcanoMode = document.getElementById('exportVolcanoViewSelect').value;
  const temporaryVolcanoView = chartId === 'volcanoChart' && requestedVolcanoMode !== 'current' && requestedVolcanoMode !== originalVolcanoMode;
  const originalHeatmapMode = heatmapViewMode;
  const originalHeatmapMetric = heatmapMetric;
  const requestedHeatmapMode = document.getElementById('exportHeatmapViewSelect').value;
  const requestedHeatmapMetric = document.getElementById('exportHeatmapMetricSelect').value;
  const exportHeatmapMode = requestedHeatmapMode === 'current' ? originalHeatmapMode : requestedHeatmapMode;
  const exportHeatmapMetric = requestedHeatmapMetric === 'current' ? originalHeatmapMetric : requestedHeatmapMetric;
  const temporaryHeatmapView = chartId === 'heatmapChart' && (exportHeatmapMode !== originalHeatmapMode || exportHeatmapMetric !== originalHeatmapMetric);
  try {
    if (temporaryVolcanoView) {
      volcanoViewMode = requestedVolcanoMode;
      renderVolcano(drugData, latestVolcanoStats);
    }
    if (temporaryHeatmapView) {
      heatmapViewMode = exportHeatmapMode;
      heatmapMetric = exportHeatmapMetric;
      renderHeatmap(drugData);
    }
    const viewSuffix = chartId === 'volcanoChart'
      ? `_${requestedVolcanoMode === 'current' ? volcanoViewMode : requestedVolcanoMode}`
      : chartId === 'heatmapChart' ? `_${exportHeatmapMode}_${exportHeatmapMetric}` : '';
    const chartName = `${exportChartNames[chartId]}${viewSuffix}`;
    if (format === 'pdf') exportChartPdf(target, chartName);
    else await exportChartImage(target, chartName, format, dpi);
    status.textContent = format === 'pdf' ? '请在打印窗口中选择“另存为 PDF”。' : '导出完成。';
  } catch (error) {
    status.textContent = `导出失败：${error.message}`;
    console.error(error);
  } finally {
    if (temporaryVolcanoView) {
      volcanoViewMode = originalVolcanoMode;
      renderVolcano(drugData, latestVolcanoStats);
    }
    if (temporaryHeatmapView) {
      heatmapViewMode = originalHeatmapMode;
      heatmapMetric = originalHeatmapMetric;
      renderHeatmap(drugData);
    }
  }
}

function setupUI() {
  const fileInput = document.getElementById('fileInput');
  fileInput?.addEventListener('change', (event) => {
    handleDataFiles(event.target.files);
  });

  const dropZone = document.getElementById('dropZone');

  const exportDialog = document.getElementById('exportDialog');
  const exportFormat = document.getElementById('exportFormatSelect');
  const exportChartSelect = document.getElementById('exportChartSelect');
  const updateExportFields = () => {
    document.getElementById('exportVolcanoViewField').hidden = exportChartSelect.value !== 'volcanoChart';
    document.getElementById('exportHeatmapFields').hidden = exportChartSelect.value !== 'heatmapChart';
  };
  document.getElementById('exportChartsBtn').addEventListener('click', () => {
    document.getElementById('exportStatus').textContent = '';
    updateExportFields();
    exportDialog.showModal();
  });
  const loadSampleButton = document.getElementById('loadSampleBtn');
  if (loadSampleButton) {
    loadSampleButton.hidden = !['127.0.0.1', 'localhost', ''].includes(window.location.hostname);
    loadSampleButton.addEventListener('click', loadSampleData);
  }
  const analysisSettingsForm = document.getElementById('analysisSettingsForm');
  const analysisSettingsStatus = document.getElementById('analysisSettingsStatus');
  syncAnalysisSettingsForm();
  analysisSettingsForm?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      applyAnalysisSettingsFromForm();
      if (analysisSettingsStatus) analysisSettingsStatus.textContent = '阈值已应用，全部候选图表和排名已重新计算。';
    } catch (error) {
      if (analysisSettingsStatus) analysisSettingsStatus.textContent = `无法应用：${error.message}`;
    }
  });
  document.getElementById('resetAnalysisSettings')?.addEventListener('click', () => {
    resetAnalysisSettings();
    if (analysisSettingsStatus) analysisSettingsStatus.textContent = '已恢复默认初筛阈值，并重新计算全部结果。';
  });
  exportChartSelect.addEventListener('change', updateExportFields);
  exportFormat.addEventListener('change', () => {
    document.getElementById('resolutionField').hidden = exportFormat.value === 'svg' || exportFormat.value === 'pdf';
  });
  document.getElementById('confirmChartExport').addEventListener('click', runChartExport);
  document.getElementById('refreshPubmedBtn').addEventListener('click', () => {
    const drug = drugKnowledgeBase[activeDrugCode];
    if (drug) fetchPubmedForDrug(drug, true);
  });
  document.getElementById('refreshClinicalTrialsBtn').addEventListener('click', () => {
    const drug = drugKnowledgeBase[activeDrugCode];
    if (drug) fetchClinicalTrialsForDrug(drug, true);
  });
  document.getElementById('refreshPathwaysBtn').addEventListener('click', () => {
    const drug = drugKnowledgeBase[activeDrugCode];
    if (drug) fetchPathwaysForDrug(drug, true);
  });
  document.querySelectorAll('[data-death-key]').forEach(button => {
    button.addEventListener('click', () => {
      activeCellDeathKey = button.dataset.deathKey;
      cellDeathEvidenceFilter = 'all';
      cellDeathDrugQuery = '';
      const evidenceFilter = document.getElementById('deathDrugEvidenceFilter');
      const drugSearch = document.getElementById('deathDrugSearch');
      if (evidenceFilter) evidenceFilter.value = 'all';
      if (drugSearch) drugSearch.value = '';
      renderCellDeathKnowledge();
    });
  });
  document.getElementById('deathDrugEvidenceFilter')?.addEventListener('change', event => {
    cellDeathEvidenceFilter = event.target.value;
    renderCellDeathKnowledge();
  });
  document.getElementById('deathDrugSearch')?.addEventListener('input', event => {
    cellDeathDrugQuery = event.target.value;
    renderCellDeathKnowledge();
  });
  document.getElementById('deathDrugList')?.addEventListener('click', event => {
    const button = event.target.closest('button[data-drug-code]');
    if (button?.dataset.drugCode) selectDrugForDetails(button.dataset.drugCode);
  });

  const updateVolcanoZoom = nextZoom => {
    volcanoZoom = clamp(nextZoom, 0.75, 2.5);
    renderVolcano(drugData, latestVolcanoStats);
  };
  document.getElementById('volcanoZoomOut').addEventListener('click', () => updateVolcanoZoom(volcanoZoom - 0.25));
  document.getElementById('volcanoZoomIn').addEventListener('click', () => updateVolcanoZoom(volcanoZoom + 0.25));
  document.getElementById('volcanoZoomReset').addEventListener('click', () => updateVolcanoZoom(1));
  document.getElementById('volcanoViewSelect').addEventListener('change', event => {
    volcanoViewMode = event.target.value;
    renderVolcano(drugData, latestVolcanoStats);
  });
  document.getElementById('volcanoLabelSizeSelect').addEventListener('change', event => {
    volcanoLabelFontSize = Number(event.target.value) || 10;
    renderVolcano(drugData, latestVolcanoStats);
  });
  document.getElementById('heatmapViewSelect').addEventListener('change', event => {
    heatmapViewMode = event.target.value;
    renderHeatmap(drugData);
  });
  document.getElementById('heatmapMetricSelect').addEventListener('change', event => {
    heatmapMetric = event.target.value;
    renderHeatmap(drugData);
  });
  document.getElementById('heatmapSortSelect').addEventListener('change', event => {
    heatmapSortMode = event.target.value;
    renderHeatmap(drugData);
  });
  document.getElementById('heatmapSearchInput').addEventListener('input', event => {
    heatmapQuery = event.target.value;
    renderHeatmap(drugData);
  });
  document.getElementById('antagonismConditionSelect').addEventListener('change', event => {
    antagonismBarCondition = event.target.value;
    renderAntagonismViability(drugData, latestVolcanoStats);
  });
  document.getElementById('antagonismConcentrationSelect').addEventListener('change', event => {
    antagonismBarConcentration = Number(event.target.value) || 1;
    renderAntagonismViability(drugData, latestVolcanoStats);
  });
  document.getElementById('vennViewSelect').addEventListener('change', event => {
    vennViewMode = event.target.value;
    renderVennAnalysis(drugData, latestVolcanoStats);
  });
  document.getElementById('rankingFilterSelect').addEventListener('change', event => {
    rankingFilterMode = event.target.value;
    renderRanking(drugData, latestVolcanoStats);
  });
  document.getElementById('rankingConcentrationSelect').addEventListener('change', event => {
    rankingConcentrationMode = event.target.value;
    renderRanking(drugData, latestVolcanoStats);
  });

  // 使用表格级事件代理，列表重新渲染后仍然可以可靠跳转。
  document.getElementById('rankingTable').addEventListener('click', event => {
    const link = event.target.closest('a[data-drug-code]');
    const row = event.target.closest('tr[data-drug-code]');
    const code = link?.dataset.drugCode || row?.dataset.drugCode;
    if (!code) return;
    // 链接自身的 #knowledgeSection 原生跳转作为保底；查询在当前事件中立即启动。
    selectDrugForDetails(code);
  });

  document.querySelectorAll('.nav-submenu a').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.nav-submenu a').forEach(item => item.classList.toggle('active', item === link));
    });
  });

  document.querySelectorAll('.nav-link[data-section]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const target = document.getElementById(link.dataset.section);
      if (!target) return;

      document.querySelectorAll('.nav-link[data-section]').forEach(item => {
        const active = item === link;
        item.classList.toggle('active', active);
        if (active) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });

      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${target.id}`);

      if (target.id === 'knowledgeSection') {
        window.setTimeout(() => document.getElementById('drugSearch').focus(), 350);
      }
    });
  });

  if (dropZone && fileInput) {
    dropZone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragover');
      handleDataFiles(event.dataTransfer.files);
    });

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });
  }

  const searchBtn = document.getElementById('searchBtn');
  const drugSearch = document.getElementById('drugSearch');

  function lookupDrugFromSearchBox() {
    const query = drugSearch.value.trim();
    if (!query) return;
    const match = findDrugMatches(query, 1)[0];
    if (match) {
      drugSearch.value = match.drug.code;
      renderDrugInfo(match.drug.code);
    } else {
      renderDrugInfo(query.toUpperCase());
    }
  }

  searchBtn.addEventListener('click', lookupDrugFromSearchBox);

  drugSearch.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      lookupDrugFromSearchBox();
    }
  });

  let searchTimer;
  drugSearch.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    if (drugSearch.value.trim().length >= 2) {
      searchTimer = window.setTimeout(() => {
        const exactMatch = findDrugMatches(drugSearch.value.trim(), 1)[0];
        if (exactMatch?.score >= 95) renderDrugInfo(exactMatch.drug.code);
      }, 180);
    }
  });

  document.querySelectorAll('[data-chart]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-chart]').forEach(x => {
        const selected = x === btn;
        x.classList.toggle('active', selected);
        x.setAttribute('aria-pressed', String(selected));
      });
      const chartMap = {
        heatmap: 'heatmapChart',
        volcano: 'volcanoChart'
      };
      const target = document.getElementById(chartMap[btn.dataset.chart]);
      target?.closest('article')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  document.getElementById('exportReportBtn').addEventListener('click', () => window.print());
  document.getElementById('newExperimentBtn').addEventListener('click', () => {
    window.location.reload();
  });
}

async function init() {
  setupUI();
  setDataMode('empty');
  renderAnalysis([]);
  renderCellDeathKnowledge();
  clearDrugInfo();
  rebuildDrugSearchIndex();
  await loadDrugLibraryWorkbook();
  renderCellDeathKnowledge();
  const authenticationEnabled = await initializeAuthenticatedSession();
  const demoRequested = new URLSearchParams(window.location.search).get('demo') === '1';
  if (demoRequested) loadSampleData();
  else if (authenticationEnabled) await loadPublishedScreeningData();
}

let resizeTimer;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderVolcano(drugData);
  }, 160);
});

window.addEventListener('DOMContentLoaded', init);
