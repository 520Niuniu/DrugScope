(function registerCellDeathKnowledge(root) {
  const knowledge = Object.freeze({
    ferroptosis: {
      key: 'ferroptosis',
      name: '铁死亡',
      englishName: 'Ferroptosis',
      accent: '#b96c32',
      summary: '一种由铁依赖性磷脂过氧化驱动的调控性细胞死亡。细胞是否进入铁死亡，取决于易氧化 PUFA-磷脂的形成、游离铁与自由基来源，以及 GPX4、FSP1、DHODH、GCH1 等防御轴之间的平衡。',
      directTerms: ['ferroptosis', 'ferroptotic', '铁死亡'],
      curatedDrugs: [
        { aliases: ['Sulfasalazine'], role: 'System xc⁻ 抑制剂；综述归纳为铁死亡诱导相关药物', pmids: ['26794443'] },
        { aliases: ['Sorafenib'], role: '与 System xc⁻ 抑制及铁死亡诱导相关', pmids: ['26794443'] },
        { aliases: ['Deferoxamine'], role: '铁螯合剂；常作为铁死亡抑制/验证对照', pmids: ['26794443'] }
      ],
      modules: [
        {
          title: 'System xc⁻–GSH–GPX4 防御轴',
          role: '核心抗氧化防线',
          description: 'SLC7A11/SLC3A2 输入胱氨酸，支持 GSH 合成；GPX4 使用 GSH 还原磷脂氢过氧化物。抑制胱氨酸摄取、耗竭 GSH 或抑制 GPX4 均可提高铁死亡易感性。',
          markers: ['SLC7A11', 'SLC3A2', 'GCLC', 'GSS', 'GPX4'],
          matchTerms: ['SLC7A11', 'SLC3A2', 'GCLC', 'GSS', 'GPX4', 'system xc', 'glutathione peroxidase 4']
        },
        {
          title: 'PUFA-磷脂重塑与脂质过氧化',
          role: '执行底物与氧化过程',
          description: 'ACSL4 和 LPCAT3 促进 PUFA 并入膜磷脂；POR、脂氧合酶及自由基反应推动磷脂过氧化，最终造成膜损伤。',
          markers: ['ACSL4', 'LPCAT3', 'POR', 'ALOX15'],
          matchTerms: ['ACSL4', 'LPCAT3', 'POR', 'ALOX15', 'lipid peroxidation', 'lipoxygenase']
        },
        {
          title: '铁摄取、储存与铁蛋白自噬',
          role: '铁稳态',
          description: 'TFRC 介导铁摄取，FTH1/FTL 储存铁，NCOA4 介导铁蛋白自噬并释放可反应铁；这些过程共同改变脂质自由基反应所需的铁池。',
          markers: ['TFRC', 'FTH1', 'FTL', 'NCOA4'],
          matchTerms: ['TFRC', 'FTH1', 'FTL', 'NCOA4', 'ferritinophagy', 'iron chelator']
        },
        {
          title: 'FSP1–CoQ 与 GCH1–BH4 防御轴',
          role: 'GPX4 非依赖防御',
          description: 'FSP1/AIFM2 维持膜侧 CoQ 抗氧化能力；GCH1–BH4 通过自由基捕获和脂质重塑抑制脂质过氧化，可在部分环境中补充 GPX4 防线。',
          markers: ['AIFM2/FSP1', 'COQ2', 'GCH1', 'BH4'],
          matchTerms: ['AIFM2', 'FSP1', 'COQ2', 'GCH1', 'tetrahydrobiopterin', 'BH4']
        },
        {
          title: '线粒体 DHODH–CoQ 防御',
          role: '线粒体膜保护',
          description: 'DHODH 在线粒体内膜维持还原型 CoQ，与线粒体 GPX4 平行限制线粒体脂质过氧化；其重要性依赖细胞代谢状态。',
          markers: ['DHODH', 'CoQ', 'mitochondrial GPX4'],
          matchTerms: ['DHODH', 'dihydroorotate dehydrogenase', 'mitochondrial GPX4']
        }
      ],
      references: [
        { pmid: '22632970', year: '2012', title: 'Ferroptosis: an iron-dependent form of nonapoptotic cell death.' },
        { pmid: '24439385', year: '2014', title: 'Regulation of ferroptotic cancer cell death by GPX4.' },
        { pmid: '26794443', year: '2016', title: 'Ferroptosis: process and function.' },
        { pmid: '31634899', year: '2019', title: 'FSP1 is a glutathione-independent ferroptosis suppressor.' },
        { pmid: '33981038', year: '2021', title: 'DHODH-mediated ferroptosis defence is a targetable vulnerability in cancer.' },
        { pmid: '38366038', year: '2024', title: 'The cell biology of ferroptosis.' }
      ],
      databaseLinks: [
        { label: 'Reactome：Regulated Necrosis', url: 'https://reactome.org/content/detail/R-HSA-5218859' }
      ]
    },
    disulfidptosis: {
      key: 'disulfidptosis',
      name: '双硫死亡',
      englishName: 'Disulfidptosis',
      accent: '#278a78',
      summary: '在 SLC7A11 高表达且葡萄糖/NADPH 供应受限的背景下，过量胱氨酸产生二硫键压力，引起肌动蛋白骨架蛋白异常二硫键化和骨架塌陷。该概念仍较新，以下模块主要依据原始定义研究及后续综述。',
      noMatchNote: '当前 FDA 药物库未发现达到本栏目证据规则的双硫死亡关联药物。KL-11743 等常见实验工具化合物不属于当前 FDA 药物库，因此不会为了填充列表而纳入。',
      directTerms: ['disulfidptosis', 'disulfide stress', '双硫死亡', '二硫键应激', '二硫化物应激'],
      curatedDrugs: [],
      modules: [
        {
          title: 'SLC7A11 依赖的胱氨酸输入',
          role: '底物入口',
          description: 'SLC7A11 高表达细胞持续摄取胱氨酸；当还原力不足时，胱氨酸及其他二硫化物不能被充分还原，形成二硫键压力。',
          markers: ['SLC7A11', 'SLC3A2', 'cystine'],
          matchTerms: ['SLC7A11', 'SLC3A2', 'system xc', 'cystine transporter']
        },
        {
          title: '葡萄糖摄取–磷酸戊糖途径–NADPH',
          role: '还原力供给',
          description: 'GLUT1/SLC2A1 介导的葡萄糖摄取和磷酸戊糖途径维持 NADPH；葡萄糖饥饿或抑制葡萄糖转运会降低二硫键还原能力。',
          markers: ['SLC2A1/GLUT1', 'G6PD', 'PGD', 'NADPH'],
          matchTerms: ['SLC2A1', 'GLUT1', 'G6PD', 'PGD', 'glucose transporter', 'pentose phosphate pathway']
        },
        {
          title: '肌动蛋白骨架二硫键化',
          role: '执行阶段',
          description: '二硫键压力促进肌动蛋白骨架相关蛋白之间的异常二硫键形成，造成 F-actin 收缩和骨架崩解。',
          markers: ['ACTB', 'F-actin'],
          matchTerms: ['ACTB', 'beta-actin', 'F-actin', 'actin cytoskeleton']
        },
        {
          title: 'RAC–WAVE 调控复合体',
          role: '骨架易感性调节',
          description: 'RAC1–WAVE regulatory complex 参与肌动蛋白网络重塑；NCKAP1 等组分的状态会改变细胞对二硫键压力的敏感性。',
          markers: ['RAC1', 'NCKAP1', 'WASF2', 'CYFIP1', 'ABI2', 'BRK1'],
          matchTerms: ['RAC1', 'NCKAP1', 'WASF2', 'CYFIP1', 'ABI2', 'BRK1', 'WAVE regulatory complex']
        }
      ],
      references: [
        { pmid: '36747082', year: '2023', title: 'Actin cytoskeleton vulnerability to disulfide stress mediates disulfidptosis.' },
        { pmid: '38886311', year: '2024', title: 'Disulfidptosis: A new type of cell death.' }
      ],
      databaseLinks: []
    },
    cuproptosis: {
      key: 'cuproptosis',
      name: '铜死亡',
      englishName: 'Cuproptosis',
      accent: '#a66a24',
      summary: '铜在依赖线粒体呼吸的细胞中与脂酰化 TCA 循环蛋白结合，促使脂酰化蛋白聚集并伴随铁硫簇蛋白丢失，形成蛋白毒性应激。FDX1 和蛋白脂酰化机器是经典定义中的关键决定因素。',
      directTerms: ['cuproptosis', 'copper-dependent cell death', '铜死亡'],
      curatedDrugs: [
        { aliases: ['Disulfiram'], role: '已有研究直接作为铜死亡相关诱导剂评估', pmids: ['38186308'] }
      ],
      modules: [
        {
          title: '铜摄取、外排与铜离子载体',
          role: '铜稳态与递送',
          description: 'SLC31A1/CTR1 参与铜摄取，ATP7A/ATP7B 参与外排；铜离子载体可提高细胞内可利用铜，但其作用仍受细胞代谢背景影响。',
          markers: ['SLC31A1/CTR1', 'ATP7A', 'ATP7B'],
          matchTerms: ['SLC31A1', 'CTR1', 'ATP7A', 'ATP7B', 'copper ionophore', 'copper chelator']
        },
        {
          title: 'FDX1 与蛋白脂酰化机器',
          role: '核心决定轴',
          description: 'FDX1 参与铜价态和蛋白脂酰化调控；LIAS、LIPT1、DLD 等脂酰化相关蛋白决定脂酰化 TCA 蛋白的形成。',
          markers: ['FDX1', 'LIAS', 'LIPT1', 'DLD'],
          matchTerms: ['FDX1', 'LIAS', 'LIPT1', 'DLD', 'protein lipoylation', 'protein lipoylated']
        },
        {
          title: '脂酰化 TCA 蛋白聚集',
          role: '执行阶段',
          description: '铜直接结合 DLAT 等脂酰化 TCA 循环蛋白，促进其异常聚集，是经典铜死亡模型中的核心蛋白毒性事件。',
          markers: ['DLAT', 'DLST', 'PDHA1', 'PDHB'],
          matchTerms: ['DLAT', 'DLST', 'PDHA1', 'PDHB', 'lipoylated TCA', 'TCA cycle protein']
        },
        {
          title: '铁硫簇蛋白丢失与蛋白毒性应激',
          role: '伴随损伤',
          description: '铜负荷伴随铁硫簇蛋白下降和急性蛋白毒性应激；这一过程与线粒体代谢依赖共同决定易感性。',
          markers: ['Fe–S proteins', 'ACO2', 'SDHB'],
          matchTerms: ['ACO2', 'SDHB', 'iron-sulfur cluster', 'Fe-S cluster', 'proteotoxic stress']
        },
        {
          title: '线粒体呼吸与 TCA 循环依赖',
          role: '代谢背景',
          description: '高度依赖氧化磷酸化和 TCA 循环的细胞通常更易受经典铜死亡过程影响；糖酵解优势细胞可能相对耐受。',
          markers: ['TCA cycle', 'OXPHOS', 'mitochondrial respiration'],
          matchTerms: ['oxidative phosphorylation', 'mitochondrial respiration', 'TCA cycle']
        }
      ],
      references: [
        { pmid: '35298263', year: '2022', title: 'Copper induces cell death by targeting lipoylated TCA cycle proteins.' },
        { pmid: '38186308', year: '2024', title: 'Combination of the cuproptosis inducer disulfiram and anti-PD-L1 abolishes NSCLC resistance by ATP7B to regulate the HIF-1 signaling pathway.' },
        { pmid: '37150036', year: '2023', title: 'The molecular mechanisms of cuproptosis and its relevance to cardiovascular disease.' }
      ],
      databaseLinks: []
    }
  });

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase();
  }

  function containsTerm(text, term) {
    const haystack = normalize(text);
    const needle = normalize(term).trim();
    if (!needle) return false;
    if (/^[a-z0-9]+$/i.test(needle)) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
    }
    return haystack.includes(needle);
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function matchDrug(drug, deathKey) {
    const definition = knowledge[deathKey];
    if (!definition || !drug || drug.isDemo) return null;

    const evidenceText = [drug.papers, drug.evidence, drug.notes, drug.sensitivity, drug.conclusion].join(' ');
    const pathwayText = [drug.targets, drug.mechanism, drug.category].join(' ');
    const drugName = [drug.name, drug.fullName, ...(drug.aliases || [])].join(' ');
    const explicitFlag = deathKey === 'disulfidptosis'
      ? drug.disulfidptosis === true
      : deathKey === 'cuproptosis' ? drug.cuproptosis === true : false;
    const literatureHits = (definition.curatedDrugs || []).filter(entry => entry.aliases.some(alias => containsTerm(drugName, alias)));
    const directHits = definition.directTerms.filter(term => containsTerm(evidenceText, term));
    const moduleHits = definition.modules.filter(module => module.matchTerms.some(term => containsTerm(pathwayText, term)));
    if (!literatureHits.length && !explicitFlag && !directHits.length && !moduleHits.length) return null;

    const level = literatureHits.length ? 'literature' : explicitFlag || directHits.length ? 'annotated' : 'pathway';
    const reasons = unique([
      ...literatureHits.map(entry => `${entry.role}（PMID ${entry.pmids.join(', ')}）`),
      ...(explicitFlag ? ['药物库专用证据字段'] : []),
      ...directHits.map(term => `文献/备注含“${term}”`),
      ...moduleHits.map(module => module.title)
    ]);
    return {
      drug,
      level,
      reasons,
      moduleTitles: moduleHits.map(module => module.title)
    };
  }

  function matchDrugs(drugs, deathKey) {
    return (Array.isArray(drugs) ? drugs : Object.values(drugs || {}))
      .map(drug => matchDrug(drug, deathKey))
      .filter(Boolean)
      .sort((left, right) => {
        const levelOrder = { literature: 0, annotated: 1, pathway: 2 };
        return levelOrder[left.level] - levelOrder[right.level]
          || String(left.drug.name || left.drug.fullName || left.drug.code).localeCompare(String(right.drug.name || right.drug.fullName || right.drug.code));
      });
  }

  root.CellDeathKnowledge = Object.freeze({ knowledge, containsTerm, matchDrug, matchDrugs });
})(globalThis);
