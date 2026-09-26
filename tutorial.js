/**
 * DrugScope 简明交互教程
 * 使用小型浮动卡片和区域描边，避免遮挡页面内容。
 */

class DrugScopeTutorial {
  constructor() {
    this.currentStep = 0;
    this.isActive = false;
    this.tooltip = null;
    this.highlightedElement = null;
    this.steps = [
      {
        target: '.topbar',
        title: '欢迎使用 DrugScope',
        content: '用几步快速了解内嵌数据状态、药物查询、结果分析与导出。'
      },
      {
        target: '.embedded-data-status',
        title: '1. 数据已安全加载',
        content: '登录后，系统会从受保护的 Netlify Blobs 自动加载已发布实验数据。这里显示加载进度和已导入药物数量。'
      },
      {
        target: '#knowledgeSection',
        title: '2. 查询药物信息',
        content: '点击候选列表中的药物代号或名称，或在此搜索，即可直接查看具体靶点的 Reactome 人类通路，以及 PubMed、Google Scholar 和 ClinicalTrials.gov 信息。'
      },
      {
        target: '#resultsSection',
        title: '3. 查看分析结果',
        content: '在结果报告中查看热图、火山图、增敏统计和候选药物列表；候选列表可直接打开对应药物详情。'
      },
      {
        target: '.header-actions',
        title: '4. 导出或重新加载',
        content: '使用顶部按钮导出图表或报告；点击“重新加载数据”可重新读取最新发布的数据。'
      },
      {
        target: null,
        title: '教程完成',
        content: '现在可以开始分析了。需要再次查看时，点击左下角“帮助/教程”。'
      }
    ];
  }

  start() {
    this.end();
    this.isActive = true;
    this.currentStep = 0;
    this.showStep();
  }

  showStep() {
    if (!this.isActive) return;
    if (this.currentStep >= this.steps.length) {
      this.complete();
      return;
    }

    this.tooltip?.remove();
    this.tooltip = null;
    this.clearHighlight();
    const step = this.steps[this.currentStep];
    const target = step.target ? document.querySelector(step.target) : null;

    if (target) {
      const rect = target.getBoundingClientRect();
      const isVisible = rect.bottom > 24 && rect.top < window.innerHeight - 24;
      if (!isVisible) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('tutorial-highlight');
      this.highlightedElement = target;
    }

    window.setTimeout(() => this.showTooltip(step, target), target ? 320 : 0);
  }

  showTooltip(step, target) {
    if (!this.isActive) return;
    this.tooltip?.remove();

    const tooltip = document.createElement('aside');
    tooltip.className = 'tutorial-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-label', 'DrugScope 简明教程');
    tooltip.innerHTML = `
      <div class="tutorial-step-counter">${this.currentStep + 1} / ${this.steps.length}</div>
      <h2 class="tutorial-tooltip-title">${step.title}</h2>
      <p class="tutorial-tooltip-content">${step.content}</p>
      <div class="tutorial-tooltip-actions">
        <button class="btn tutorial-exit" type="button">关闭</button>
        <button class="btn tutorial-previous" type="button" ${this.currentStep === 0 ? 'disabled' : ''}>上一步</button>
        <button class="btn btn-primary tutorial-next" type="button">${this.currentStep === this.steps.length - 1 ? '完成' : '下一步'}</button>
      </div>
    `;

    document.body.appendChild(tooltip);
    this.tooltip = tooltip;
    this.placeTooltip(target);

    tooltip.querySelector('.tutorial-exit').addEventListener('click', () => this.end());
    tooltip.querySelector('.tutorial-previous').addEventListener('click', () => this.previousStep());
    tooltip.querySelector('.tutorial-next').addEventListener('click', () => this.nextStep());
    tooltip.querySelector('.tutorial-next').focus({ preventScroll: true });
  }

  placeTooltip(target) {
    if (!this.tooltip) return;

    const gap = 18;
    const sidebar = document.querySelector('.sidebar');
    const leftInset = window.innerWidth > 720 && sidebar
      ? Math.round(sidebar.getBoundingClientRect().right + gap)
      : gap;
    const cardWidth = this.tooltip.offsetWidth;
    const cardHeight = this.tooltip.offsetHeight;
    const rightLeft = Math.max(gap, window.innerWidth - cardWidth - gap);
    const bottomTop = Math.max(gap, window.innerHeight - cardHeight - gap);
    const candidates = [
      { left: leftInset, top: gap },
      { left: rightLeft, top: gap },
      { left: leftInset, top: bottomTop },
      { left: rightLeft, top: bottomTop }
    ];

    const targetRect = target?.getBoundingClientRect();
    const score = candidate => {
      if (!targetRect) return candidate.left === rightLeft && candidate.top === bottomTop ? -1 : 0;
      const right = candidate.left + cardWidth;
      const bottom = candidate.top + cardHeight;
      const overlapWidth = Math.max(0, Math.min(right, targetRect.right) - Math.max(candidate.left, targetRect.left));
      const overlapHeight = Math.max(0, Math.min(bottom, targetRect.bottom) - Math.max(candidate.top, targetRect.top));
      const overlapArea = overlapWidth * overlapHeight;
      const cardCenterX = candidate.left + cardWidth / 2;
      const cardCenterY = candidate.top + cardHeight / 2;
      const targetCenterX = targetRect.left + targetRect.width / 2;
      const targetCenterY = targetRect.top + targetRect.height / 2;
      const distance = Math.hypot(cardCenterX - targetCenterX, cardCenterY - targetCenterY);
      return overlapArea * 1000 - distance;
    };

    const best = candidates.reduce((current, candidate) => score(candidate) < score(current) ? candidate : current);
    this.tooltip.style.left = `${best.left}px`;
    this.tooltip.style.top = `${best.top}px`;
  }

  nextStep() {
    this.currentStep += 1;
    this.showStep();
  }

  previousStep() {
    if (this.currentStep === 0) return;
    this.currentStep -= 1;
    this.showStep();
  }

  complete() {
    this.end();
    const message = document.createElement('div');
    message.className = 'tutorial-completion-message';
    message.textContent = '教程完成，可以开始使用 DrugScope 了。';
    document.body.appendChild(message);
    window.setTimeout(() => message.remove(), 2600);
  }

  clearHighlight() {
    this.highlightedElement?.classList.remove('tutorial-highlight');
    this.highlightedElement = null;
  }

  end() {
    this.isActive = false;
    this.tooltip?.remove();
    this.tooltip = null;
    this.clearHighlight();
  }
}

function initTutorial() {
  const tutorial = new DrugScopeTutorial();
  const helpBtn = document.getElementById('helpBtn');
  helpBtn?.addEventListener('click', event => {
    event.stopPropagation();
    tutorial.start();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTutorial);
} else {
  initTutorial();
}
