# Archify 对风沙图表工作台的借鉴分析

> 研究日期：2026-08-28  
> 文章入口：[《别再手动画架构图了，这个 skills 一句话搞定》](https://mp.weixin.qq.com/s/GMJoqNV9YxqTHOSmwW_Vig?scene=1)  
> 文章介绍的项目：[tt-a1i/archify](https://github.com/tt-a1i/archify)  
> 官方源码核对版本：[`12106be58b34f94b108ab30f6ac0eb37c16a8f71`](https://github.com/tt-a1i/archify/tree/12106be58b34f94b108ab30f6ac0eb37c16a8f71)

## 结论

Archify 最值得风沙学习的，不是视觉皮肤，也不是“用一句话画图”这个宣传点，而是它把 Agent 制图做成了一条**可验证、可修复、可回退、可证明**的交付流水线：

1. AI 只负责生成有约束的 Typed JSON IR，确定性代码负责校验和渲染；
2. 每个错误都有稳定代码、具体对象、测量证据和受支持修复方式，Agent 可以局部修复；
3. 候选先写入临时文件，完整检查通过后才原子替换正式成品；
4. 实时预览只加载最新已验证版本，半写入或错误输入不会让画面消失；
5. 自动化检查与人工视觉审查明确分层，不把“程序校验通过”误报成“视觉效果满意”；
6. Agent Skill、CLI、文档、示例、诊断协议和发布测试被当作同一个产品面交付。

风沙已经具备 Mermaid、draw.io、AI 候选、CLI、高清导出和本地校验，技术基础并不弱。下一步最有价值的升级，是把这些能力用统一的**候选规范、诊断协议和交付回执**串成闭环，而不是再增加一种绘图语法或重写渲染器。

## 一、官方事实核验

### 1. 产品定位与边界

Archify 是 Node.js 渲染与校验系统，同时以 Agent Skill 支持 Cursor、Claude Code、Codex CLI、OpenCode 和 Raven。Agent 生成 Typed JSON IR，Archify 再确定性编译为独立 HTML/SVG。官方当前开发版本为 `2.16.0-dev.0`，仓库采用 MIT 许可证。[官方 README](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/README.md) · [package.json](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/package.json) · [LICENSE](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/LICENSE)

官方支持五种有类型的技术图：

| 类型 | 结构化事实 |
|---|---|
| Architecture | 组件、边界、连接 |
| Workflow | 泳道、阶段、分组、主路径、节点、边 |
| Sequence | 参与者、区段、消息、激活 |
| Data Flow | 阶段、节点、数据流 |
| Lifecycle | 泳道、状态、转换 |

这些类型分别有 JSON Schema，所有层级默认拒绝未知属性；`schema_version` 固定为 `1`，破坏性变更必须升级版本，避免升级后静默改变旧图含义。[Schema 官方说明](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/schemas/README.md)

Archify 明确不把自己定位为通用拖拽编辑器或 Mermaid 主题；自动 Mermaid 解析、通用自动布局、托管分享和 WYSIWYG 编辑都在当前范围外。它认为“语义化布局判断”是产品差异点，Mermaid 输入只用于让 Agent 读取拓扑后重新编写 JSON IR，并非机械转换。[官方 README 的范围说明](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/README.md#reference-and-scope) · [设计决策](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/DESIGN.md)

### 2. Agent 与 CLI 设计

官方 CLI 提供 `render`、`validate`、`deliver`、`preview`、`visual-check`、`compare`、`inspect`、`guide`、`brands`、`doctor`、`demo` 等命令，而不是只提供一个渲染入口。[CLI 源码](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/bin/archify.mjs)

其中最重要的不是命令数量，而是 Agent 契约：

- 每次候选编辑后都运行 `validate --json`；
- 展示级候选要求 9 项 artifact checks、0 composition errors、0 warnings；
- 错误回执包含 `code`、`subject`、`evidence`、`supportedFixes`；
- Agent 只修改诊断点名的对象，不应整图重写；
- 连续两轮修复没有降低最优错误数，就停止并如实报告；
- 最终验证后冻结候选，禁止再编辑后直接交付。

这些约束写进 Agent Skill，而不是只放在面向人的帮助页。[官方 SKILL.md](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/SKILL.md) · [Authoring Contract](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/references/authoring-contract.md)

### 3. 原子交付与最后有效预览

`deliver` 的官方契约是：读取一次输入，把相同字节写入同目录私有候选快照，渲染并执行完整 artifact checker；只有全部通过才原子替换目标文件。任何渲染、检查、回执或提交失败都会清理私有状态，并保留上一份可信成品。回执记录规范和成品的 SHA-256 与字节数。[Delivery Contract](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/references/delivery-contract.md)

`preview` 只监听一个明确指定的 JSON 文件，仅绑定 `127.0.0.1` 和随机端口。它对稳定输入摘要生成私有快照，只有候选通过既有交付流水线才刷新；半写入、删除、错误或被新保存覆盖的输入，都继续显示上一份已验证版本。[Preview 源码](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/bin/preview.mjs) · [Delivery Contract](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/references/delivery-contract.md#last-good-live-preview)

这正面解决了 AI 写到一半、格式暂时不完整、用户切页回来任务或画面丢失的问题。

### 4. 验证与视觉审查分层

Archify 将检查分为不同证据等级：

1. Schema：字段、类型、枚举、范围和未知属性；
2. 语义引用：重复 ID、目标不存在、关系 ID 冲突等；
3. 几何与构图：节点重叠、文字溢出、边穿节点、边线冲突、标签碰撞等；
4. 成品检查：SVG 块、非有限坐标、危险斜线、图例碰撞等；
5. 浏览器自动证据：多个桌面尺寸下的溢出测量、明暗主题截图、接触表和 JSON 回执；
6. 人工感知审查：真实阅读画面是否清楚、平衡、专业。

官方明确指出：确定性回执和自动截图**不能证明视觉审查已经完成**；自动 `visual-check` 的回执保持 `visualReview: "pending"`。这是非常重要的诚实边界。[Delivery Contract](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/references/delivery-contract.md#automated-visual-evidence)

文字适配也被抽成共享算法：用统一文字宽度单位、首选字号、最小可读字号和内部留白共同判断；能缩小时确定性缩小，缩到可读下限仍容不下就校验失败，而不是让文本溢出后仍返回成功。[共享文字适配源码](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/renderers/shared/text-fit.mjs) · [Schema 中的 CJK 与校验说明](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/schemas/README.md#error-format)

### 5. 交互和导出

生成的 HTML 是自包含阅读成品。官方 Viewer 支持：

- 节点搜索与稳定 ID；
- 节点语义信息卡；
- 作者定义的上游/下游可达范围；
- 两点之间按真实有向关系寻找路径；
- 语义角色对比；
- 最多五个引导章节、有限播放和演示模式；
- 深浅主题、四套视觉预设、缩放和阅读层级；
- 可恢复的 `#focus`、`#route`、`#lens`、`#view` 等深链接。

这些交互只读取作者提供的节点和关系，不从几何位置推断新的拓扑或运行因果。[Viewer Runtime](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/references/viewer-runtime.md)

官方导出面包括完整图 PNG、JPEG、WebP、双主题 SVG、启用 trace 时的 WebM，以及 1200×630 分享卡片。导出前会克隆规范 SVG 并清除搜索、聚焦、路径、故事、镜头、演示和临时覆盖层等 Viewer 状态，避免当前浏览动作污染正式交付。[Viewer Runtime 的 Canonical Exports](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/references/viewer-runtime.md#canonical-exports) · [导出实现](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/assets/template.html)

### 6. 代码证据与架构变更审查

Architecture 模式可以选择性记录公开 GitHub 仓库、完整提交 SHA、相对路径和行号。渲染时必须提供本地仓库根目录，Git 证明 origin、commit、blob 和行范围一致后，证据才会进入交互信息卡；普通图和视觉导出不会携带仓库路径。[Schema 的 Repository Evidence](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/schemas/README.md#runtime-validation)

`compare architecture` 可把两份已经校验的快照生成 Before / Delta / After，区分新增、删除、语义变化、移动和重路由；它只报告作者输入的事实，不推断风险或合并安全性。[官方 README](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/README.md) · [Architecture Delta 源码](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/archify/delta/architecture-delta.mjs)

### 7. 发布与回归保障

官方 CI：

- Node 18/20/22/24 矩阵运行 golden、schema 和单元测试；
- 使用真实 Chrome 和 FFmpeg 验证 WebM 不是静态重复帧；
- 验证桌面尺寸、国际化和 Viewer 布局；
- 检查 ZIP 确定性重建后的字节完全一致；
- 在 Linux、macOS、Windows 对无依赖安装包做 smoke test。

Release 在测试通过后核对 Git tag 与 `package.json` 版本，重建并验证 ZIP，再发布到 GitHub Release。[CI 工作流](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/.github/workflows/ci.yml) · [Release 工作流](https://github.com/tt-a1i/archify/blob/12106be58b34f94b108ab30f6ac0eb37c16a8f71/.github/workflows/release.yml)

## 二、与风沙现状的对照

风沙当前已经具备这些良好基础：

- Mermaid 实时预览和源码编辑；
- draw.io 可视化编辑与结构化计划编译；
- AI 候选、修复候选、应用前快照和并发变更保护；
- 桌面端与 CLI 共用渲染、标签修复和导出内核；
- CLI 支持校验、SVG/PNG/JPG/PDF 渲染、draw.io 编译、标准输入、JSON 返回和退出码；
- 1～4 倍 PNG、兼容 SVG 和本地优先运行。

依据：[风沙用户手册](../user-guide.md) · [风沙 CLI 手册](../cli-guide.md) · [风沙架构说明](../architecture.md)

| 维度 | 风沙已有 | Archify 的额外价值 | 建议 |
|---|---|---|---|
| AI 中间表示 | draw.io 已有结构化计划；Mermaid 仍以代码为主 | 五种 Typed JSON IR、严格 schema、版本契约 | 建立风沙统一候选协议，但保留 Mermaid 和 draw.io 作为成品格式 |
| 校验结果 | CLI 有成功/失败、类别、消息和退出码 | 稳定规则码、对象、证据、支持修复项 | 优先升级诊断协议，直接提高 Agent 自动修复成功率 |
| 成品提交 | AI 候选通过后应用，已有快照保护 | 同目录私有候选、完整检查、原子替换、哈希回执 | CLI 导出和桌面应用统一进入原子交付函数 |
| 实时预览 | Mermaid 实时渲染；AI 候选可切换 | 无效输入继续显示最后有效版本，并显示当前失败诊断 | 桌面两种画布都引入“最后有效成品”状态机 |
| 质量证明 | 已有 E2E、高清尺寸和导出测试 | 自动构图检查、浏览器多尺寸证据、人工审查分层 | 增加 `visual-check` 和“待人工确认”字段 |
| Agent 接入 | 已有可安装 CLI 和图文调用说明 | 可安装 Skill，把约束、例子和修复循环直接交给 Agent | 发布官方 `fengsha-diagram` Agent Skill |
| 交互成品 | 桌面内可编辑和预览 | 自包含 HTML、搜索、路径、章节、深链接 | 作为可选“交互式 HTML 交付”，不替代当前编辑器 |
| 协作 | 本地单用户、文件导出 | Archify 也没有托管协作或多人共编 | 不应把它误当协作方案；多人协作需独立产品设计 |

## 三、建议落地优先级

### P0：统一机器诊断协议

把当前 CLI 的 `error.category` / `error.message` 扩展为：

```json
{
  "ok": false,
  "diagnostics": [
    {
      "code": "layout/text-overflow",
      "severity": "error",
      "subject": { "nodeId": "approval", "field": "label" },
      "evidence": { "requiredWidth": 216, "availableWidth": 164 },
      "supportedFixes": ["wrap-label", "grow-node", "shorten-label"]
    }
  ]
}
```

规则码必须稳定；`subject` 指向节点、边、泳道或源码位置；`evidence` 提供真实测量；`supportedFixes` 只列本地编译器真正支持的操作。桌面“修复候选”和 CLI Agent 调用共用该结构。

**直接收益：** Agent 不再靠猜测重写整张图，失败重试次数和业务内容漂移都会下降。

### P0：原子交付与最后有效版本

统一桌面和 CLI 的交付状态机：

```text
输入快照 → 临时候选 → 语法/结构校验 → 渲染 → 文字/几何检查
        → 成品检查 → 原子替换 → SHA-256/尺寸/规则回执
```

任何阶段失败都保留旧成品。UI 同时显示：

- 当前输入：正在检查 / 需要修复 / 已验证；
- 正在展示：已验证版本号与时间；
- 失败诊断：不遮挡旧成品，可复制给 Agent。

这项机制应同时覆盖 Mermaid 预览、AI 候选、draw.io XML 候选和 CLI 输出。

### P0：确定性检查与视觉验收分开

新增只读命令，例如：

```powershell
fengsha-diagram visual-check process.mmd --output-dir evidence --json
```

建议生成：

- 多个典型视口/缩放的 PNG；
- 明暗或纸张主题截图；
- 节点文字溢出、节点重叠、边穿节点、标签碰撞、画布裁切的测量结果；
- 接触表和 JSON 回执；
- `visualReview: "pending"`，由人或有图像能力的 Agent 审看后再改为通过。

不能因为 Mermaid 能渲染、PNG 文件存在或 SVG XML 合法，就宣称图已经“专业可用”。

### P1：风沙候选规范 `fengsha.plan/v1`

不建议废弃 Mermaid 或 draw.io。建议在 AI 与成品格式之间增加统一的、有版本的候选规范：

- `schemaVersion`、`diagramType`、`meta`；
- 稳定节点 ID、边 ID；
- 节点、关系、泳道、阶段、主路径、异常路径；
- 文本换行与最小可读尺寸约束；
- 可选布局提示，而不是自由生成 draw.io XML；
- `additionalProperties: false`，拒绝模型臆造字段；
- 规范 → Mermaid、规范 → draw.io 由本地确定性编译器完成。

风沙目前已经有 draw.io 计划编译器，可以从现有计划升级，而不是重新起炉灶。第一阶段只覆盖最常用的业务流程图；架构、时序、数据流、生命周期以后再按真实需求扩展。

### P1：正式发布 Agent Skill

仅提供 CLI 手册还不够。应发布可以被 Codex、Claude Code、Cursor、OpenCode 安装或复制的 `fengsha-diagram` Skill，至少包含：

- 何时使用风沙；
- 首选图类型和布局范围；
- `validate → 局部修复 → render/deliver` 强制流程；
- JSON 诊断字段解释；
- 两轮无改进就停止的重试预算；
- 禁止跳过验证、禁止整图无依据重写；
- 中文业务流程、审批泳道、异常闭环等通过验证的示例。

Skill 只编排现有 CLI，不重复实现渲染逻辑。

### P1：质量档位

可以借鉴 `standard` / `showcase`，但应改成符合风沙用户语言的档位：

- `standard`：语法、结构、引用、文字不溢出、导出完整；
- `professional`：再要求主路径清晰、异常闭环、线不穿节点、有限交叉、统一字号和多尺寸验收。

AI 生成默认使用 `professional`；用户手工编辑时可以先允许 `standard`，避免每次轻微调整都被强阻断。

### P2：可选交互式 HTML 交付

在不影响 PNG/SVG/PDF/draw.io 的前提下，可增加一个独立 HTML 导出：

- 自包含、离线可打开；
- 节点搜索和聚焦；
- 上下游高亮；
- 精确路径阅读；
- 分章节讲解；
- 深链接恢复阅读状态；
- 导出时清除临时阅读状态。

它适合培训、架构说明和长流程讲解，但不应成为普通办公流程图的默认格式。

### P2：证据绑定与版本差异

对软件架构图可选支持“仓库 URL + commit + 文件/行号”证据；对业务流程图可选支持“来源文档 + 页码/段落”。必须明确它证明的是“图中某个事实来自哪里”，而不是证明线上系统真实运行状态。

版本差异可先从稳定 ID 开始，显示新增、删除、文案变化、移动和重连，服务于 AI 修改前后的审查。

## 四、不建议照搬的部分

1. **不要放弃可视化编辑。** Archify 主动不做 WYSIWYG，而风沙的核心用户需要 draw.io 自由编辑和办公交付，两者定位不同。
2. **不要强制所有图手工坐标。** Archify 把 Agent 布局判断当作护城河；风沙应保留 Mermaid 自动布局和 draw.io 自动布局，再对关键问题做确定性修复。
3. **不要一次实现五套 Typed IR。** 先把“业务流程/泳道/审批/异常闭环”这一条做到稳定，再扩类型。
4. **不要把动画和复杂交互放在稳定性之前。** WebM、故事播放、语义镜头很亮眼，但不是当前“稳定、可靠、专业生成流程图”的首要瓶颈。
5. **不要把 Archify 当多人协作方案。** 官方明确没有托管分享和协作后端；风沙若做多人协作，需要账户、权限、服务端存储、冲突合并和审计独立设计。
6. **不要用自动校验替代人工审美判断。** 这恰恰是 Archify 官方自己明确禁止的错误表述。

## 五、建议验收标准

完成上述 P0 后，建议用以下门槛验收，而不是只看测试是否变绿：

1. 同一坏图连续运行三次，返回相同规则码、对象和测量证据；
2. Agent 根据 `supportedFixes` 修复时，只修改诊断对象，未涉及业务内容保持字节或语义不变；
3. 输入半写入、语法错误、切换页面或应用重载时，最后有效图仍可见；
4. CLI 交付失败不会覆盖已有 PNG/SVG/PDF/draw.io；
5. 成功回执包含输入哈希、输出哈希、尺寸、检查项、耗时和版本；
6. Mermaid 与可视化画布在同一组导出检查下表现一致；
7. 中文、英文、数字、标点、长文本和多行文本都通过屏幕与导出一致性测试；
8. 自动证据与人工视觉结论分开记录；
9. 安装后的 Agent Skill 能在新会话中按“生成—校验—局部修复—交付”闭环完成真实案例；
10. 所有新增能力进入 Windows 安装包、桌面快捷方式版本和 GitHub Release 的同一发布闭环。

## 最终判断

Archify 证明了一个重要方向：AI 制图的可靠性并不主要来自“更强模型”或“更长提示词”，而来自把模型限制在一个有类型的事实层，再让确定性程序承担校验、布局约束、交付、回退和证据记录。

风沙不需要复制 Archify 的产品形态。最合适的路线是保留现有 Mermaid + draw.io 双画布优势，吸收它的三项底层能力：

1. **统一候选规范；**
2. **机器可修复诊断；**
3. **原子、可证明的交付流水线。**

这三项做好后，Agent CLI、桌面 AI、高清导出和可视化画布会自然收敛成同一个稳定系统。
