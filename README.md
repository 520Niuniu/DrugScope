# DrugScope

**双硫死亡 / 铜死亡药物效应筛选与细胞死亡知识平台**

**Disulfidptosis / Cuproptosis Drug-effect Screening Platform**

DrugScope 用于整理 CON/CHU 96 孔板细胞活性数据，比较药物单药、诱导条件单独和药物共处理三类信号，筛选增敏、直接救援及仅相对拮抗候选，并结合 FDA 药物库、PubMed、Reactome 和 ClinicalTrials.gov 提供可追溯的背景资料。

在线私有站点：<https://fdadrugscreen.netlify.app/>

> 本项目仅用于探索性科研筛选。页面结果不能替代原始孔板审阅、独立生物学重复、正式药物协同模型、机制实验、统计学复核或临床判断。

## 当前网站包含什么

| 模块 | 当前实现 |
|---|---|
| 私有访问 | Netlify Edge Function 保护页面，授权用户使用邮箱和密码登录，会话最长 8 小时 |
| 私有数据发布 | 原始药筛文件和授权药物库分别存放在站点级 Netlify Blobs，不写入 GitHub 或公开静态目录 |
| 原始数据解析 | 支持标准 CON/CHU 96 孔板 Excel 和已整理长表；读取工作簿第一个工作表 |
| 数据质控 | 空孔不补 0；按板对、药物、条件和浓度执行 MAD=3 筛选并报告异常孔、缺失组和重复不足 |
| 双重效应判定 | 同时计算相对同浓度单药组的交互效应，以及相对诱导条件单独组的直接效应 |
| 候选类型 | 增敏、直接救援、仅相对拮抗；按处理条件统计并按 0.1、1、10 µM 查看排名 |
| 可视化 | 热图、分面火山图、增敏数量图、抑制/拮抗数量图、抑制/拮抗细胞活性柱状图、靶点分布、Venn 交集和候选表 |
| 药物知识库 | 按代号、名称或别名搜索 FDA 药物，展示分类、适应症、Target、机制、实验结果和来源 |
| 外部证据 | PubMed、Reactome 人类通路、ClinicalTrials.gov，以及用户主动打开的 Google Scholar 检索 |
| 死亡通路知识栏 | 汇总铁死亡、双硫死亡和铜死亡的代表性网络、标志物、PubMed 证据及当前药物库关联药物 |
| 导出 | 图表支持 PNG、JPEG、WebP、SVG、PDF 和 96–600 DPI；报告可通过打印页面保存为 PDF |

## 数据和代码如何分开

```text
公开 GitHub 仓库
  └─ 页面、统计代码、登录函数和部署说明（不含授权数据）
                    │ Netlify 构建
                    ▼
              DrugScope 私有网站
                    ▲
                    │ 登录后的鉴权函数读取
站点级 Netlify Blobs
  ├─ drugscope-screening：CON/CHU/长表药筛文件
  └─ drugscope-library：授权药物库工作簿
```

- GitHub 只部署网站代码；Netlify Blobs 单独发布实验文件和授权药物库。
- 新建或迁移到另一个 Netlify 项目时，代码可以从 GitHub 自动部署，但旧站点的环境变量和 Blobs 不会自动迁移。
- 每个新站点都需要重新配置登录变量，并把实验文件和药物库上传到该站点自己的 Blob stores。
- Blobs 上传完成后不需要重新构建网站，登录后点击“重新加载数据”或刷新页面即可。

## 使用流程

1. 使用管理员配置的授权账号登录。
2. 页面从 Netlify Blobs 获取文件清单，并以最多 4 个并发请求安全加载已发布文件。
3. 浏览器解析原始孔板或长表，完成质控、归一化、统计检验和候选分类。
4. 在“实验分析”查看图表、候选数量和候选排名。
5. 点击候选药物或在“药物知识库”搜索，核对 FDA 药物资料及外部证据。
6. 在“死亡通路与药物”查看铁死亡、双硫死亡、铜死亡的代表性通路及药物库映射。
7. 按需要导出图表或 PDF 报告。

左下角“帮助/教程”可随时打开简明交互教程。教程不会在每次访问时自动弹出。

## 输入数据

### 标准 CON/CHU 96 孔板

每个药物对推荐使用两个文件，文件名需包含板型和两个药物代号：

```text
CON-Drug1+Drug2.xlsx
CHU-Drug1+Drug2.xlsx
```

也兼容文件名前有药物对、下划线后再出现 `CON-` 或 `CHU-` 的现有命名方式。系统读取第一个工作表，并从文件名提取板型、药物对和药物代号。

当前实验设计假设：

- 没有复测板；
- 同一个药物不会出现在多个板对；
- 每个实验组计划有 6 个技术重复孔；
- 药物浓度固定为 0.1、1、10 µM。

系统仍保留 `板对 × 药物` 作为独立分析单位，避免意外把不同板对的数据混合。

| 板与区域 | 药物处理臂 | Drug1 | Drug2 | 本板未处理基线 | 诱导条件单独组 |
|---|---|---|---|---|---|
| CON 1–6 列 | 有糖单药 | B/C/D = 0.1/1/10 µM | F/G/H = 0.1/1/10 µM | A 行 + E 行 | 不适用 |
| CON 7–12 列 | 无糖共处理 | B/C/D | F/G/H | A 行 | E 行单纯无糖 |
| CHU 1–6 列 | KL11743 共处理 | B/C/D | F/G/H | A 行 | E 行单纯 KL11743 |
| CHU 7–12 列 | ES + CuCl₂ 共处理 | B/C/D | F/G/H | A 行 | E 行单纯 ES + CuCl₂ |

关键解释：

- CON 和 CHU 的整条 A 行始终表示有糖、无药、无诱导剂的本板未处理孔，不因所在半区改变含义。
- CON 左半区 E 行也是有糖无药基线，因此单药臂使用 A+E 行归一化。
- 其余三个诱导臂使用各自半区 A 行归一化；E 行作为该诱导条件的条件单独对照。
- Excel 空单元格或非数值单元格作为缺失值排除，绝不转换成 0。

### 已整理长表

支持 `.csv`、`.txt`、`.xls`、`.xlsx`。必需字段：

| 字段 | 含义 |
|---|---|
| `DrugCode` | 药物代号 |
| `Group` | 单药或诱导共处理组 |
| `Concentration` | `0`、`0.1`、`1` 或 `10` µM |
| `Viability` | 已按所在板和实验臂基线归一化的细胞活性百分比 |
| `Well` | 可选，原始孔位 |

可识别的组名包括中文及常见英文别名：

- `单药` / `drug` / `single`
- `无糖共处理` / `no sugar`
- `KL11743共处理` / `kl-11743`
- `铜死亡诱导剂共处理` / `copper`

要完成双重判定，每个诱导条件还必须提供 `Concentration = 0` 的条件单独对照。缺少条件单独对照时可以计算相对单药的交互效应，但不会被归入三类候选。

## 数据处理方法

### 1. 板内归一化

每个实验臂先使用自己的本板未处理基线：

```text
Viability (%) = OD孔 ÷ 本板同实验臂未处理基线OD均值 × 100
```

E 行诱导条件单独组也使用相同本板基线归一化。不同板的 A 行不直接混合平均。

### 2. MAD 异常孔筛选

归一化对照、诱导条件单独组以及每个 `板对 × 药物 × 条件 × 浓度` 分别筛选：

```text
|x − median| / MAD ≤ 3
```

- 一组只有 1–2 个数值时不剔除。
- `MAD = 0` 时不剔除，避免所有读数相同时误删数据。
- 计划每组 6 个技术孔；MAD 后共处理组、对应单药组和条件单独组各至少保留 4 个有效孔，才可完成完整双重判定。

### 3. 交互效应和直接效应

对每个药物、浓度和诱导条件分别计算：

```text
交互 log₂FC = log₂(共处理组平均归一化活力 ÷ 同药同浓度单药组平均归一化活力)

交互绝对活力差 = 共处理组平均归一化活力 − 同药同浓度单药组平均归一化活力

直接活力比 = 共处理组平均归一化活力 ÷ 诱导条件单独组平均归一化活力
```

- 交互效应回答“诱导条件是否改变了该药相对单药时的表现”。
- 绝对活力差以百分点表示，用于排除低基线下倍数较大但绝对变化很小的结果。
- 直接效应回答“加药后是否真的比诱导条件单独组更高或更低”。
- 正向交互本身不能证明发生了实际救援，因此必须区分直接救援和仅相对拮抗。

### 4. Welch t 检验

每个分析单位执行两项双侧 Welch t 检验：

1. 共处理组 vs 同药同浓度单药组：交互 p 值；
2. 共处理组 vs E 行诱导条件单独组：直接 p 值。

Welch 检验不要求两组方差相等。这里的样本单位是同一板内的技术孔，因此 p/q 值用于描述板内测量一致性和本次初筛中的多重比较控制，不支持基于独立生物学重复的验证性推断。若比较双方方差都为 0，标准误为 0，推断 p 值不可可靠计算；系统保留效应量，但按 `p = 1` 保守处理、标记“不可计算（零方差）”，且不列为候选。

### 5. 候选定义

| 类型 | 必须同时满足的条件 |
|---|---|
| 增敏 | 直接活力比 `≤ 0.80` 且直接 `p < 0.05`；交互 `log₂FC ≤ −0.585`、绝对活力差 `≤ −10` 个百分点且交互 `p < 0.05` |
| 直接救援 | 直接活力比 `≥ 1.20` 且直接 `p < 0.05`；交互 `log₂FC ≥ 0.585`、绝对活力差 `≥ 10` 个百分点且交互 `p < 0.05` |
| 仅相对拮抗 | 正向交互同时达到 `log₂FC ≥ 0.585`、绝对活力差 `≥ 10` 个百分点和交互 `p < 0.05`，但直接效应没有同时达到救援所需的幅度和显著性 |

“仅相对拮抗”只表示共处理相对该药单药组更高，不能表述为相对诱导条件单独组已经发生实际救援。

以上是默认初筛阈值。结果区提供会话级阈值调整，可用于敏感性检查；调整会重新计算候选分类、图表和排名，但不会修改原始数据或 MAD 质控结果。

### 6. BH-FDR 与 A/B 级

- 在无糖、KL11743、ES + CuCl₂ 三种诱导条件内，分别对全部可计算的交互检验和直接检验执行 Benjamini–Hochberg 校正。
- 增敏或直接救援：交互 q 值和直接 q 值均 `≤ 0.10` 时为 A 级。
- 仅相对拮抗：交互 q 值 `≤ 0.10` 时为 A 级。
- 达到原始效应量和 `p < 0.05` 阈值，但未满足对应 FDR 条件时为 B 级。

A/B 级只是复筛优先级，不是机制或临床证据。

### 7. 排序分数

```text
Score = |交互 log₂FC| × −log₁₀(交互 p)
```

该分数同时考虑交互幅度和原始显著性，只用于同类候选内部排序。

## 图表和结果解释

### 热图

- 默认同时展示无糖、KL11743、ES + CuCl₂ 三种处理条件，也可单独筛选条件和 0.1、1、10 µM 浓度。
- 可显示相对单药的交互 `log₂FC` 或平均细胞活性；完整色标会注明数值范围和截断值。
- A/B 级候选使用独立边框标识，不与数值颜色混用；搜索和排序不会打乱板对内的聚合关系。
- 支持键盘浏览、动态标题和 SVG 导出，导出内容与页面当前筛选和显示状态一致。

### 火山图

- 横轴：交互 `log₂FC`。
- 纵轴：`−log₁₀(交互原始 p)`。
- 按处理条件和 0.1、1、10 µM 分面。
- 分别标识增敏、直接救援、仅相对拮抗和未达阈值结果；实心点为 A 级、空心点为 B 级，悬浮信息包含绝对活力差、直接效应、p/q 值、有效孔数和 A/B 级。

### 候选数量图

- 增敏候选单独统计。
- 抑制/拮抗图并列显示直接救援和仅相对拮抗。
- 数量按诱导条件统计唯一药物，并显示 A/B 数量；下方可展开药物明细。

### 抑制/拮抗细胞活性柱状图

- 横轴为候选药物名称，纵轴为归一化细胞活性（%）。
- 可按无糖、KL11743、ES + CuCl₂ 和 0.1、1、10 µM 筛选。
- 每个药物并列显示单药、诱导条件单独和共处理三组的 `mean ± SD`。
- 图中分别标记交互检验和直接检验的显著性，明细表同时列出 p/q 值。

### Venn、靶点和候选排名

- Venn 图可查看双硫死亡相关交集，或各处理条件下三个浓度的增敏交集。
- 靶点图统计本次导入药物在 FDA 药物库中的 Target/功能类别。
- 候选表可切换增敏、直接救援、仅相对拮抗及死亡类型，并按全部浓度、0.1、1、10 µM 筛选。
- 点击候选代号或药名可跳转到药物详情。

## 药物知识库和外部资源

- FDA 药物库由登录后的 `/.netlify/functions/drug-library` 接口从私有 `drugscope-library` Blob store 加载，支持代号、名称、别名的精确或模糊检索。
- 当前药物库包含第三方供应商目录字段，不随本仓库公开分发；使用者必须自行确认其数据授权和使用范围。
- Reactome 查询仅发送药物库中公开且具体的 Target；空值、`NA`、`Others` 和宽泛功能类别不发起查询。
- PubMed 和 ClinicalTrials.gov 查询只发送当前药物名称，不发送实验表格、候选列表或统计结果。
- Google Scholar 只有在用户主动点击时才接收页面显示的检索词。
- 外部数据库结果用于证据检索，不会被当成本实验自动生成的结论。

## 铁死亡、双硫死亡和铜死亡知识栏

知识栏展示代表性核心分子模块、关键标志物和已核对的 PubMed 记录，并扫描当前 FDA 药物库的名称、Target、机制、备注和专用证据字段。关联结果分为：

1. PubMed 明确关联；
2. 药物库明确注释；
3. 靶点/机制关联。

截至 2026-09-25 的当前药物库审计结果：

- 铁死亡：7 种关联药物，其中 4 种有 PubMed 明确关联，3 种属于靶点/机制关联；
- 铜死亡：1 种，Disulfiram；
- 双硫死亡：当前 FDA 药物库中没有符合现有证据规则的药物。KL-11743 等工具化合物不在当前 FDA 库中，因此不强行填充。

代表性 PMID：

- 铁死亡：22632970、24439385、26794443、31634899、33981038、38366038；
- 双硫死亡：36747082、38886311；
- 铜死亡：35298263、37150036、38186308。

Reactome 可将铁死亡关联到较宽泛的 `Regulated Necrosis`（R-HSA-5218859），但整理时未检索到以 disulfidptosis 或 cuproptosis 命名的人类通路。页面因此展示文献归纳的代表性模块，而不是声称存在对应的完整 Reactome 通路。

药物库字段或靶点匹配不等于因果证明，也不代表药物已被证实能够诱导或抑制该死亡方式。

## 管理员：Netlify 私有部署

### 1. 部署网站代码

把私有 GitHub 仓库连接到 Netlify。项目中的 `netlify.toml` 已定义：

- 构建命令：`node scripts/build-static.mjs`
- 发布目录：`dist`
- Functions：`netlify/functions`
- 全站 Edge Function：`auth-guard`

不要把发布目录改为仓库根目录，也不要把真实药筛文件提交到 Git。

### 2. 首次创建登录用户

Node.js 20+：

```powershell
npm run hash-password -- user@example.com
```

没有 npm 时可使用 Python 3：

```powershell
python scripts/hash-password.py user@example.com
```

密码输入时不会显示字符。输出必须是以 `{` 开头、以 `}` 结尾的 JSON；不要把终端中的 `Password:` 提示文字复制进 Value。

在 Netlify **Project configuration → Environment variables** 中添加：

| Key | Value |
|---|---|
| `DRUGSCOPE_USERS_JSON` | 上一步生成的用户对象 |
| `DRUGSCOPE_SESSION_SECRET` | 至少 32 字符的高强度随机字符串，不能与用户 JSON 或登录密码相同 |

生成会话密钥示例：

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

变量至少应用到 Production，并允许 Functions/Runtime 和 Edge Functions 使用。保存后触发一次新部署。

### 3. 添加更多网站用户

每位用户必须独立生成密码哈希。为新用户运行：

```powershell
python scripts/hash-password.py new-user@example.com
```

假设现有用户对象为：

```json
{"email":"first@example.com","name":"first@example.com","passwordHash":"scrypt$..."}
```

新用户对象为：

```json
{"email":"second@example.com","name":"second@example.com","passwordHash":"scrypt$..."}
```

把 `DRUGSCOPE_USERS_JSON` 改成一个合法 JSON 数组：

```json
[
  {"email":"first@example.com","name":"first@example.com","passwordHash":"scrypt$..."},
  {"email":"second@example.com","name":"second@example.com","passwordHash":"scrypt$..."}
]
```

操作步骤：

1. 在本地文本编辑器中保留原有用户对象；
2. 为新用户生成新的完整对象；
3. 用方括号组成数组，并在相邻对象之间添加英文逗号；
4. 使用 JSON 校验器或本地脚本确认格式有效；
5. 在 Netlify 编辑 `DRUGSCOPE_USERS_JSON`，完整替换 Value；
6. 保存后执行 **Deploys → Trigger deploy → Deploy site**；
7. 等待状态变为 Published，再使用新账号登录验证。

不要把明文密码写入 JSON，也不要把用户对象填进 `DRUGSCOPE_SESSION_SECRET`。

Netlify 将 Secret 保存后不会在网页、API 或 CLI 中重新显示真实 Value。管理员应把当前完整用户数组保存在受控的密码管理器或加密文件中；如果没有任何可用备份，就无法从 Netlify 恢复旧 `passwordHash`，必须为所有需要保留的用户重新生成对象并整体替换数组。

### 4. 修改密码或撤销用户

- 修改密码：使用同一邮箱重新生成对象，用新的 `passwordHash` 替换该用户对象，再重新部署。
- 撤销用户：从 JSON 数组中删除该用户对象，确认逗号和方括号仍构成合法 JSON，再重新部署。
- 页面守卫和数据接口会在后续请求中重新检查用户白名单。
- 已签发会话最长 8 小时；仅修改密码不会立即注销该用户已有会话。需要立即使所有已有会话失效时，同时轮换 `DRUGSCOPE_SESSION_SECRET`，这会注销全部用户。
- 用户 JSON、明文密码和会话密钥都不得提交到 Git 或发送到聊天、邮件和截图中。

### 5. 保密上传授权药物库

先把有权使用的 `.xlsx` 药物库工作簿放在 Git 仓库外，再创建一个临时 Netlify Personal Access Token 并运行：

```powershell
npm run upload:drug-library -- "D:\PrivateData\FDA-approved-drug-library.xlsx"
```

脚本会询问目标 Netlify Project ID 和 Token，将工作簿以固定键名上传到 `drugscope-library`。源文件必须位于 Git 仓库外；Token 输入时隐藏且不会保存。上传完成后应撤销临时 Token。

网站不会从公开静态目录读取该文件。只有通过 DrugScope 登录校验的会话才能调用药物库接口。

### 6. 保密上传药筛文件

真实源文件必须位于 Git 仓库外。创建一个临时 Netlify Personal Access Token 后运行：

```powershell
npm run upload:screening-data -- "D:\DrugScopePrivateData"
```

脚本会询问目标 Netlify Project ID 和 Token，并上传到该项目的 `drugscope-screening` store。

- 只接受 `.csv`、`.txt`、`.xls`、`.xlsx`；
- 拒绝从 Git 仓库内部上传；
- Token 输入时隐藏且不会保存；
- 默认不覆盖同名对象，中断后可重新运行并跳过已存在文件；
- 确认需要替换同名文件时追加 `--replace`；
- 当前脚本在全部完成后才显示汇总，中间没有逐文件进度；大量文件可能需要数分钟；
- 上传完成后应撤销临时 Personal Access Token。

上传完成提示示例：

```text
Upload complete: 1492 added or replaced, 0 already existed.
Store: drugscope-screening; source files remain outside the repository.
```

可在 Netlify **Data & storage → Blobs → drugscope-screening** 查看对象列表。上传数据后无需重新部署代码。

### 7. 新站点迁移清单

更换 Netlify 账号或创建新项目时，逐项完成：

- GitHub 仓库连接到正确的 `main` 分支；
- `DRUGSCOPE_USERS_JSON` 重新创建或重新生成；
- `DRUGSCOPE_SESSION_SECRET` 重新生成；
- 授权药物库上传到新项目的 `drugscope-library`；
- 原始药筛文件上传到新项目的 `drugscope-screening`；
- 访问保护、自定义域名等站点设置按需重新配置；
- 部署成功后分别验证登录、文件清单、单个文件读取和分析页面。

## 安全与隐私边界

- 登录 Cookie 使用 HMAC 签名，并设置 `HttpOnly`、`Secure`、`SameSite=Strict`。
- 页面守卫和数据函数都会再次核对白名单；仅隐藏前端页面并不被视为安全控制。
- 药筛接口只允许单层安全文件名和四种支持的扩展名，不接受任意 Blob key 或路径；药物库接口只读取服务端固定键名。
- 私有文件响应使用 `Cache-Control: private, no-store`。
- Personal Access Token、环境变量、明文密码、授权药物库和真实实验文件均不得提交到 Git。
- `.gitignore` 排除 `data` 下的工作簿/CSV、`private/screening-data/`、`.private-data/`、`.netlify-private-upload/`、`.env*`、`.netlify/` 和 `.tools/`。
- Netlify Blobs 提供传输中和静态存储保护，但 Netlify 项目管理员及持有有效 Token 的人员仍可访问；该架构不是端到端加密，也不应被描述为 HIPAA 合规托管。

## 常见问题

### 登录页提示“登录服务尚未正确配置”

打开 **Cloud compute → Functions → auth-login → Function log**，在登录页重试一次并查看最新错误：

- `DRUGSCOPE_USERS_JSON is not configured`：变量未配置到当前项目或 Production；
- `Unexpected token 'P', "Password:" ... is not valid JSON`：误把密码提示文字复制进用户 JSON；
- `contains an invalid passwordHash`：Value 不是密码工具生成的完整 `scrypt$...` 对象；
- `DRUGSCOPE_SESSION_SECRET must contain at least 32 characters`：会话密钥缺失或过短。

Netlify 的 **Audit log** 是另一项付费功能，排查登录不需要购买它。

### 登录后提示“暂无已发布的药筛文件”

登录已经成功，但当前项目的 `drugscope-screening` 为空。请确认：

- 文件是否上传到当前站点的 Project ID，而不是旧项目；
- Data & storage → Blobs 中是否存在 `drugscope-screening`；
- 上传源目录是否在 Git 仓库外；
- 上传脚本最终是否显示 `Upload complete`。

### 药物名称、靶点和死亡通路关联没有显示

登录已经成功，但当前项目可能尚未发布授权药物库。请确认：

- Data & storage → Blobs 中存在 `drugscope-library`；
- store 内存在 `FDA-approved-drug-library.xlsx`；
- 工作簿已上传到当前站点的 Project ID；
- `drug-library` Function log 没有 Blob 读取错误。

### 为什么新 Netlify 账号看不到旧站点数据

Blobs、环境变量和访问设置都属于具体 Netlify 项目，不会随 GitHub 仓库连接自动复制。必须按“新站点迁移清单”重新配置。

### 为什么不能双击 `index.html`

`file://` 会受到浏览器跨域和资源读取限制。静态预览至少应通过本地 HTTP 服务打开；完整的登录、Functions 和 Blobs 流程需要 Netlify 环境。

### 本地静态预览为什么没有私有数据

直接双击项目根目录中的 `preview.cmd`，或在 PowerShell 中运行：

```powershell
.\preview.ps1
```

脚本会打开 `http://127.0.0.1:8765/?demo=1` 并加载带明确提示的虚构示例数据；端口被占用时可运行 `.\preview.ps1 -Port 8766`。按 `Ctrl+C` 停止服务。

该方式只预览前端和模拟示例，不提供 Netlify 登录、Blobs、私有药物库或受保护的 Reactome Function。完整本地流程应安装 Netlify CLI 后使用 `netlify dev`。

## 开发与验证

要求 Node.js 20 或更高版本：

```powershell
npm install
npm test
npm run build
```

- `npm test` 运行统计、解析、隐私边界和死亡通路知识库测试。
- `npm run build` 将允许发布的静态资源复制到 `dist/`；授权药物库和真实药筛文件都不会进入构建目录。

## 项目结构

```text
.
├─ index.html                         主页面和方法说明
├─ login.html                         授权用户登录页
├─ styles.css                         页面和图表样式
├─ app.js                             解析、统计、图表、检索与数据加载
├─ cell-death-knowledge.js            三类细胞死亡知识和证据配置
├─ tutorial.js                        交互式帮助教程
├─ data/
│  └─ README.md                       私有药物库边界说明（不含工作簿）
├─ lib/
│  └─ xlsx.full.min.js                浏览器端 Excel 解析器
├─ netlify/
│  ├─ edge-functions/auth-guard.js    全站会话守卫
│  └─ functions/                      登录、会话、私有数据和通路接口
├─ scripts/
│  ├─ build-static.mjs                安全静态构建
│  ├─ hash-password.mjs               Node 密码哈希工具
│  ├─ hash-password.py                Python 密码哈希工具
│  ├─ upload-drug-library-blob.mjs    私有药物库上传器
│  ├─ upload-screening-blobs.mjs      私有数据上传器
│  └─ audit-cell-death-library.mjs    死亡通路药物库审计
├─ tests/                             自动化测试
├─ private/screening-data/            仅保留说明，不存放真实数据
├─ LICENSE                            代码查看和协作许可边界
├─ THIRD_PARTY_NOTICES.md             第三方组件与许可证说明
├─ netlify.toml                       Netlify 构建、函数和安全响应头
└─ package.json                       Node 脚本与依赖
```

## 科学解释限制

- 本项目使用归一化活力比和 Welch t 检验进行探索性初筛，不是 Bliss、Loewe 或 ZIP 药物协同模型。
- 技术孔只反映同一板内测量稳定性，不能替代独立生物学重复。
- A/B 级和 Score 是复筛优先级，不是双硫死亡、铜死亡、铁死亡机制或临床有效性的证明。
- 外部文献和数据库会持续更新；“未检索到”不等于不存在证据。
- 候选必须回看原始孔和批次信息，并通过独立重复、完整剂量反应、诱导剂/抑制剂救援以及靶向机制实验验证。

方法说明的科学写作与不确定性表述参考：Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). *Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents*. arXiv:2609.00065. https://doi.org/10.48550/arXiv.2609.00065。该文献仅说明文档工作流，不是本项目阈值的证据来源。

## 版本记录

### v1.5 — 2026-09-30

- 重做热图条件筛选、色标、A/B 候选边框、搜索排序、键盘操作和 SVG 导出；
- 修正跨板数据聚合边界，避免不同板对的同名药物被错误合并；
- 新增 `preview.cmd` 和 `preview.ps1`，用于一键启动带虚构示例数据的本地预览。

### v1.4 — 2026-09-26

- 将授权药物库从 Git 和静态构建中移出，改由登录保护的 Netlify Blob 接口加载；
- 增加药物库保密上传工具、忽略规则和公开仓库边界说明；
- 明确公开代码不等于公开授权目录、实验数据、账号配置或部署密钥。

### v1.3 — 2026-09-26

- 更新新私有站点地址和完整部署架构说明；
- 补充新增、修改、撤销网站用户的完整流程；
- 补充新 Netlify 项目的环境变量、Blob 迁移、保密上传和故障排查流程；
- 完整记录当前孔板布局、归一化、MAD、双重 Welch 检验、BH-FDR 和三类候选定义；
- 补充浓度筛选、抑制/拮抗细胞活性柱状图和候选数量图说明；
- 统一死亡通路知识栏、药物证据映射和隐私边界口径。

### v1.2 — 2026-09-25

- 新增铁死亡、双硫死亡、铜死亡的代表性通路知识栏；
- 新增当前 FDA 药物库相关药物的动态匹配、证据分级、筛选和详情跳转。

### v1.1 — 2026-09-15

- 对齐 CON/CHU 板内对照定义；
- 增加 MAD=3、双重效应判定、Welch t 检验、BH-FDR 和 A/B 分级；
- 增加直接救援与仅相对拮抗的解释区分。

## 方法工具参考

Kassis, T., Agarwal, V., He, Y., Patel, D., & Brueckner, A. M. (2026). *Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents*. arXiv:2609.00065. <https://doi.org/10.48550/arXiv.2609.00065>

---

**For research use only · Last updated 2026-09-30**
