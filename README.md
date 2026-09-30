# DrugScope

**Disulfidptosis / Cuproptosis Sensitizer Screening Platform**

一个专业的生物医学研究工具，用于快速筛选和分析潜在的Disulfidptosis（双硫死亡）和Cuproptosis（铜死亡）敏感剂。平台支持批量药物实验数据分析、FDA药物库查询、文献检索，帮助研究人员加速新药筛选。

🔗 **在线站点**: [DrugScope 私有平台](https://drugscope-private.netlify.app/)

---

## ⚡ 主要功能

| 功能 | 描述 |
|------|------|
| **实验数据分析** | 登录后从受保护的 Netlify Blobs 自动加载 CON/CHU 原始数据并完成解析与统计 |
| **结果可视化** | 热图、火山图、Venn交集图、靶点分布等多维度数据展示 |
| **药物知识库** | 点击候选药物即可查看药物库靶点/功能类别，并在卡片内直接展示 Reactome 人类通路 |
| **文献与临床检索** | 查询 PubMed、Google Scholar 和 ClinicalTrials.gov，辅助核验研究证据 |
| **数据导出** | 支持导出高清图表和完整分析报告（PDF）|
| **隐私保护** | 实验文件存放于受保护的 Netlify Blobs，登录后在浏览器内解析；外部查询不发送实验数据 |

## 🎓 交互式教程

首次访问网站时，系统会自动启动一个 **5 分钟的交互式教程**，逐步引导你了解所有核心功能：

- 📁 导入实验数据
- 🔥 查看热图分析
- 🌋 理解火山图
- 🔍 使用药物知识库
- 📊 导出分析结果

**随时可重新开始**：点击左侧边栏的 **"❓ 帮助/教程"** 按钮随时重新启动教程。

---

### 方式一：在线使用（推荐）
直接访问: [https://drugscope-private.netlify.app/](https://drugscope-private.netlify.app/)

### 方式二：本地部署
直接双击项目根目录中的 `preview.cmd`。脚本会启动本地服务器、打开浏览器，并加载带明确警示的虚构示例数据。

也可以在 PowerShell 中运行：

```powershell
.\preview.ps1
```

默认地址为 `http://127.0.0.1:8765/?demo=1`，按 `Ctrl+C` 停止服务器。端口被占用时可运行 `.\preview.ps1 -Port 8766`。

**注意**: 必须通过 `http://` 或 `https://` 访问，不能直接双击 `index.html`，否则浏览器会阻止FDA工作簿读取和API请求。

---

## 📊 使用流程

### 1️⃣ 登录并自动加载数据
- 使用管理员配置的授权账号登录
- 页面从受保护的 Netlify Blobs 自动加载已发布的 CON/CHU 文件
- 首页状态区显示加载进度、已导入药物数与离群孔处理结果；普通用户无需手动上传

### 2️⃣ 数据自动处理
- 系统自动识别分组（单药、无糖共处理、铜死亡诱导剂等）
- 计算统计量和敏感性指标
- 生成多维度分析结果

### 3️⃣ 查看分析报告
**结果报告** 包含:
- **热图**: 药物效应的直观展示
- **火山图**: 差异倍数与显著性分析
- **效应类型统计**: 区分增敏、直接救援和仅相对拮抗
- **靶点分布**: 导入药物的FDA靶点汇总
- **增敏交集分析**: Venn图展示多药物的共同靶向效果
- **候选列表**: 可切换查看并排序增敏、直接救援或仅相对拮抗候选

### 4️⃣ 查询药物信息
- 点击候选列表中的药物代号或名称，或在“药物知识库”中搜索
- 查看本次实验结论、药物库靶点/功能类别和通路分类
- 仅当药物库 `Target` 字段含具体靶点时，在药物信息卡内自动展示 Reactome 人类通路；空值、`NA`、`Others` 和宽泛功能类别不发起查询
- 查看 PubMed 文献和 ClinicalTrials.gov 临床试验，或主动跳转 Google Scholar 扩展检索

### 5️⃣ 导出结果
- **导出图表**: 下载高清PNG格式的所有可视化图表
- **导出报告**: 生成完整的PDF分析报告（含数据、图表、总结）

---

## 📋 数据格式说明

### 原始 96 孔板文件（推荐）

每个药物对应同时导入两个 Excel 文件，文件名必须能识别板型和两个药物代号：

```text
CON-Drug1+Drug2.xlsx
CHU-Drug1+Drug2.xlsx
```

系统按以下版式解析第一个工作表：

| 板/区域 | 药物处理臂 | Drug1 行 | Drug2 行 | 本板未处理基线 | 诱导条件单独对照 |
|---|---|---|---|---|---|
| CON 1–6 列 | 有糖/单药 | B–D | F–H | A 行 + E 行 | 不适用 |
| CON 7–12 列 | 无糖 | B–D | F–H | A 行 | E 行（单纯无糖） |
| CHU 1–6 列 | KL11743 | B–D | F–H | A 行 | E 行（单纯 KL11743） |
| CHU 7–12 列 | ES + CuCl₂ | B–D | F–H | A 行 | E 行（单纯 ES + CuCl₂） |

- CON、CHU 两张板的整条 A 行均为有糖、无药、无诱导剂的本板未处理基线；A 行不按所在列半区解释为无糖、KL11743 或 ES + CuCl₂。
- Drug1：B/C/D 行分别为 0.1/1/10 µM；Drug2：F/G/H 行分别为 0.1/1/10 µM。
- E 行的含义随半区变化：CON 左半区 E 行同样是有糖无药基线；CON 右半区 E 行为单纯无糖；CHU 左半区 E 行为单纯 KL11743；CHU 右半区 E 行为单纯 ES + CuCl₂。
- 各实验臂先除以本板同半区未处理基线；CON 左半区的单药臂使用 A+E 行，其余三个诱导臂使用各自半区 A 行。不同板的 A 行不直接混合平均。
- Excel 空孔或非数值孔作为缺失值排除，不替换为 0。
- 板内归一化：`Viability(%) = OD孔 / 本板同实验臂未处理基线OD均值 × 100`。E 行诱导条件单独对照也按相同本板基线归一化，供直接效应比较。

### 已整理长表（CSV/TXT/XLS/XLSX）

长表至少包含 `DrugCode`、`Group`、`Concentration`、`Viability`，可选 `Well`。`Viability` 应已除以所在板、所在实验臂的未处理 A 行基线（CON 有糖单药臂为 A+E 行）。若要进行双重判定，每种诱导条件还必须提供浓度为 0 的 E 行条件单独对照归一化值，并在 MAD 筛选后保留至少 4 个值；该组均值不要求为 100。缺少该对照时仍可显示交互效应，但不列为三类候选。支持的分组标签包括：

- `单药` / `drug` / `single`
- `无糖共处理` / `no sugar`
- `KL11743共处理` / `kl-11743`
- `铜死亡诱导剂共处理` / `copper`

### 示例数据
首页首次打开保持空白。只有用户主动点击“加载模拟数据”，或通过本地预览脚本打开 `?demo=1` 地址后，才会加载 QSI-01、NPR-02 等虚构代号；页面会持续显示“模拟演示数据”警示。这些代号、数值、机制、靶点和结论均不对应真实 FDA 药物或文献证据。

### 统计方法与判定标准

- 对照孔和每个“药物 × 浓度 × 条件 × 药物对”分别进行 MAD 筛选：`|x - median| / MAD ≤ 3`；当重复数不超过 2 或 MAD=0 时不剔除。
- 数据始终在同一药物对内配对，不把不同板对中同代号药物的重复孔混合。
- 实验设计为每组 6 个技术重复孔；MAD 筛选后，共处理组、对应单药组和诱导条件单独组必须各保留至少 4 个有效孔，才进行完整的双重判定。
- 跨板交互效应：每个实验臂先除以自己的本板未处理基线，再计算 `交互 log₂FC = log₂(诱导条件+药物归一化活力 / 有糖单药归一化活力)`。这样可抵消两张板的整体信号尺度差异，并与师弟主火山图的“比值之比”口径一致。
- 增敏候选：直接活力比 `≤ 0.80`、直接 Welch `p < 0.05`，同时交互 `log₂FC ≤ -0.585`、交互 Welch `p < 0.05`。
- 直接救援候选：直接活力比 `≥ 1.20`、直接 Welch `p < 0.05`，同时交互 `log₂FC ≥ 0.585`、交互 Welch `p < 0.05`。
- 仅相对拮抗：交互 `log₂FC ≥ 0.585` 且交互 `p < 0.05`，但直接活力未达到上述直接救援的效应量或显著性标准。这类结果不能解释为已经提高了相对诱导条件单独组的细胞活力。
- 多重检验：在无糖、KL11743、ES + CuCl₂ 三种诱导条件内，分别对全部可计算的直接检验和交互检验进行 Benjamini–Hochberg 校正。增敏/直接救援的两项 `q ≤ 0.10` 才标为 A 级；仅相对拮抗按交互 `q ≤ 0.10` 分为 A 级；达到原始候选阈值但未达到相应 FDR 标准的为 B 级。
- 排序分数：`|交互 log₂FC| × -log₁₀(交互 p)`。
- 这里的 p 值来自同一板内 6 个技术重复，只反映板内技术稳定性。A/B 级都是复筛优先级，不能据此确认双硫死亡或铜死亡机制；候选药物必须通过独立生物学重复、剂量梯度和相应死亡通路的救援/机制实验验证。

---

## 🌐 云部署指南

### 带登录保护部署到 Netlify（推荐）

受保护版本使用 Netlify Functions 和 Edge Functions。`netlify.toml` 已包含构建命令、发布目录和路由保护，不要在 Netlify 控制台中把发布目录改回项目根目录。

1. 使用**私有 Git 仓库**连接 Netlify，但真实药筛数据不得提交到 Git。数据文件应保存在仓库外部。
2. 在 Netlify 的 Data & Storage → Blobs 中使用站点级 store `drugscope-screening`。本项目提供安全上传脚本：

   ```powershell
   npm run upload:screening-data -- C:\DrugScopePrivateData
   ```

   脚本只接受 `.csv`、`.txt`、`.xls`、`.xlsx`，拒绝从 Git 仓库内部上传，并隐藏输入 Netlify Personal Access Token。默认不覆盖同名对象；确认需要替换时追加 `--replace`。
3. 本地安装 Node.js 20 或更新版本，为每位用户生成密码哈希：

   ```powershell
   node scripts/hash-password.mjs user@example.com
   ```

4. 在 Netlify 的 Site configuration → Environment variables 中配置：

   - `DRUGSCOPE_USERS_JSON`：由上一步结果组成的 JSON 数组，例如 `[用户1的JSON, 用户2的JSON]`
   - `DRUGSCOPE_SESSION_SECRET`：至少 32 字符的高强度随机字符串

5. 触发部署。未登录用户访问站点页面或静态资源时会跳转到 `/login.html`；登录后，受保护函数从 Netlify Blobs 加载药筛文件。数据接口会独立校验会话，并且不会接受任意 Blob key。

需要撤销用户时，从 `DRUGSCOPE_USERS_JSON` 删除对应邮箱并重新部署；页面守卫和数据接口都会重新核对白名单。已登录会话最长 8 小时，修改某个用户的密码不会主动注销该邮箱已有的短期会话。

本地调试完整登录流程请使用 `netlify dev`。`python -m http.server` 仍可调试原有静态分析功能，但不会启用登录和私有数据接口。

> 安全提示：Vercel、Cloudflare Pages 和 GitHub Pages 的纯静态部署不包含这套登录后端。`vercel.json` 只保证构建时不会把 `private/` 发布出去，不能提供受保护的数据访问；保密部署请使用上述 Netlify 流程。

---

## 🔐 数据与隐私

- ✅ **管理员发布的实验表格** 保存在受保护的 Netlify Blobs 中，登录后才由鉴权接口返回，并在浏览器内解析
- ✅ **FDA 药物库** 作为站点静态资源加载
- ✅ **PubMed 与 ClinicalTrials.gov 查询** 由访问者浏览器直接请求官方 API，只使用当前药物名称，不发送原始实验表格、候选列表或统计结果
- ✅ **Reactome 通路查询** 通过登录会话保护的 Netlify Function 发起，只发送 FDA 药物库公开的具体 `Target`，并将结果直接展示在药物信息卡；不会发送药物名、实验表格、候选列表或统计结果
- ✅ **Google Scholar** 仅在用户主动点击后接收页面明确显示的药物名与死亡类型检索词，不会收到实验表格、候选列表或统计结果
- ✅ **PubMed 请求限流** 使用串行队列并保持至少 350 ms 的请求间隔；遇到 HTTP 429 时遵循 `Retry-After` 或采用指数退避重试
- ✅ **已发布药筛数据** 保存在 Netlify Blobs，仅通过鉴权函数返回；登录会话使用签名的 `HttpOnly`、`Secure`、`SameSite=Strict` Cookie
- ✅ **指定用户白名单** 由 Netlify 环境变量管理，仓库中不保存明文密码
- ✅ `.gitignore` 会拒绝跟踪 `private/screening-data/` 中除说明文件外的内容；推荐把源数据完全保存在仓库外部
- ⚠️ Netlify Blobs 会加密传输和静态存储，但 Netlify 项目管理员及取得有效令牌者仍可访问；该服务当前不属于 Netlify 的 HIPAA 合规托管方案

---

## 📁 项目结构

```
.
├── index.html           # 主页面 (HTML 结构)
├── styles.css           # 样式表 (UI 设计)
├── app.js               # 核心应用 (解析、统计、交互逻辑)
├── login.html           # 授权用户登录页
├── data/
│   └── fda_drug_library.csv    # FDA 批准药物库
├── private/screening-data/      # 仅保留说明；真实数据存放于 Netlify Blobs
├── netlify/
│   ├── edge-functions/auth-guard.js  # 页面会话保护
│   └── functions/                    # 登录、退出和私有数据接口
├── scripts/              # 静态构建和密码哈希工具
├── lib/
│   └── xlsx.full.min.js         # 浏览器端 Excel 解析库
├── vercel.json          # Vercel 部署配置
├── netlify.toml         # Netlify 部署配置
└── .nojekyll            # GitHub Pages 兼容文件
```

---

## ❓ 常见问题 (FAQ)

**Q: 为什么无法双击打开index.html?**  
A: 浏览器的跨域限制会阻止本地文件读取CSV数据库和API请求。必须通过 `http://` 或 `https://` 服务访问。

**Q: 已发布数据如何保护?**
A: 数据保存在 Netlify Blobs，通过登录会话保护的函数按白名单读取，且不会被构建进公开静态文件。任何云服务都不能承诺“绝对不会泄露”；应继续保护 Netlify/GitHub 管理员账号、Personal Access Token 和环境变量，并定期撤销不再使用的访问权限。

**Q: 支持多大的数据文件?**  
A: 取决于你的浏览器内存，通常可处理数千行的实验数据。如遇到性能问题，建议分批导入。

**Q: 为什么搜不到某个药物?**  
A: FDA药物库定期更新。如需添加新药物，可编辑 `data/fda_drug_library.csv` 后重新部署。

**Q: 能否离线使用?**  
A: 可以。下载所有文件后在本地运行Python Web服务即可。但PubMed和ClinicalTrials查询需要网络连接。

**Q: 如何导出数据为Excel?**  
A: 当前版本支持导出图表(PNG)和报告(PDF)。可从导出的PDF中复制数据表。

---

## 🔧 技术栈

- **前端框架**: Vanilla JavaScript (无依赖)
- **UI 设计**: CSS3 (Grid + Flexbox)
- **数据处理**: Browser Excel 解析库 (XLSX)
- **可视化**: Canvas/SVG (图表绘制)
- **部署**: 静态资源托管 (无后端数据库)

---

## 📖 功能详细说明

### 热图 (Heatmap)
展示所有样本在不同处理条件下的细胞活力变化，色彩渐变直观反映敏感程度。

### 火山图 (Volcano Plot)
横轴为相对单药组的交互 log₂FC，纵轴为 -log₁₀(交互原始 p 值)。蓝色圆点为增敏、红色方块为直接救援、橙色三角为仅相对拮抗，灰色点为未达到双重判定；悬浮信息同时显示直接效应、两类 p/q 值、有效孔数和 A/B 分级。

### Venn 交集图
显示不同诱导条件下共同出现的增敏候选，帮助安排后续复筛优先级。

### 靶点分布
统计导入药物的FDA靶点信息，展示研究焦点和靶点覆盖范围。

---

## 📝 更新日志

**v1.1 (2026-09-15)**
- 对齐已逐孔核对的 CON/CHU 板内对照定义
- 增加 MAD=3 异常孔筛选，空孔作为缺失值处理
- 改为在同一药物对内进行归一化和 Welch t 检验
- 每组按 6 个技术重复设计，MAD 筛选后至少保留 4 个有效孔
- 候选效应量阈值统一为 `|log₂FC| ≥ 0.585`，并按诱导条件进行 BH-FDR 校正和 A/B 分级
- 增加直接效应与交互效应双重判定，将正向交互拆分为“直接救援”和“仅相对拮抗”

**v1.0 (2026-08-31)**
- ✨ 核心功能完成：数据导入、分析、可视化
- ✨ FDA药物库查询
- ✨ PubMed/ClinicalTrials 文献检索
- ✨ 多平台部署支持

---

## 📧 反馈与建议

如有问题或功能建议，欢迎反馈。

---

**在线私有版本使用 Netlify Functions、Edge Functions 与 Netlify Blobs 提供登录和受保护的数据访问。**

🎉 **现已在线**: [https://drugscope-private.netlify.app/](https://drugscope-private.netlify.app/)

---

## 💡 如何贡献

欢迎通过以下方式参与项目：
- 提交问题 (Issue) 报告 bug 或功能建议
- 提交拉取请求 (PR) 改进代码或文档
- 扩展 FDA 药物库数据

## 方法工具参考

Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). *Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents*. arXiv:2609.00065. https://doi.org/10.48550/arXiv.2609.00065

## 📄 许可证

MIT License - 自由使用、修改和分发

---

**Designed and validated by Jie Lu | XJTU | Version 1.1 | For research use only**  
**最后更新**: 2026年9月15日
