# 工作场景图表工具市场研究与产品机会

> 研究日期：2026-08-15  
> 范围：面向工作场景的 Mermaid、文本生成流程图、软件架构图、泳道图工具。仅采用官方产品页、官方文档和官方仓库作为事实来源。

## 一、结论先行

市场上没有一个工具同时把下面五件事做好：

1. **像 Mermaid 一样快**：文本输入、即时排版、方便复制到文档和代码仓库。
2. **像 Visio/draw.io 一样适合办公**：泳道、架构图标、模板、局部微调、Office 级导出。
3. **像 Lucidchart/Miro 一样低门槛**：不懂语法也能通过表单、拖拽或自然语言完成图。
4. **像 Eraser/Structurizr 一样懂工程**：C4、代码库上下文、Git、版本差异和架构一致性。
5. **像 Excalidraw/本地 CLI 一样让人放心**：离线可用、数据默认留在本机、开放文件格式。

因此，本项目最值得占据的位置不是“又一个 Mermaid 编辑器”，也不是“另一个无限白板”，而是：

> **面向中文职场和技术团队的本地优先智能制图工作台：用自然语言、结构化表单或代码快速生成专业流程图、原生泳道图和架构图，保持源代码可编辑，并能一键交付到 Word、PPT、Markdown 和图片。**

商业化前的正确顺序是先完成“产生可交付成果”的闭环：**创建 → 校验 → 编辑 → 美化 → 保存/版本 → 导出/分享**。注册、积分、团队计费都可以后置。

## 二、市场分层

### 1. 文本/模型即图表

- **Mermaid / PlantUML / D2**：优势是文本可版本控制、渲染自动化、适合文档和开发工作流；弱点是语法学习成本、布局微调和非技术用户编辑。
- **Structurizr**：不是普通绘图 DSL，而是“一份架构模型生成多张 C4 视图”；官方强调模型与视图分离、自动与手动布局、Git/AI 友好，同时明确它不是传统拖拽绘图工具。[Structurizr 官方说明](https://docs.structurizr.com/as-code)
- **Kroki**：本质是统一的“文本图表转图片”服务层，官方 API 同时支持 Mermaid、PlantUML、D2、Structurizr、Graphviz、BPMN 等，并可自托管。[Kroki 官方文档](https://docs.kroki.io/kroki/)

### 2. 通用专业绘图

- **draw.io/diagrams.net、Visio、Lucidchart**：强项是大量形状、模板、连接线和手工布局，适合正式交付；短板是图的语义往往埋在画布对象里，代码审查、批量变更和 AI 维护不如文本源自然。
- Visio 的专业护城河尤其体现在流程方法论和 Microsoft 365：官方提供基本流程、跨职能泳道、工作流、BPMN 等模板，且 Data Visualizer 能从 Excel 自动生成基本流程图或水平/垂直跨职能泳道图。[Visio 流程图类型](https://support.microsoft.com/en-us/visio/process-diagrams-in-visio) [Data Visualizer](https://support.microsoft.com/en-us/visio/create-a-data-visualizer-diagram)

### 3. 协作白板

- **Miro、Whimsical、Excalidraw**：强项是上手快、实时协作、评论和自由表达；弱点是严谨的架构模型、可 diff 的图源和大图长期维护。
- Excalidraw 官方仓库明确提供无限画布、PNG/SVG/开放 JSON 导出；官网应用还提供 PWA 离线、实时协作、端到端加密和浏览器本地优先保存，说明“免账号、本地优先、开放格式”本身可以形成很强的产品信任。[Excalidraw 官方仓库](https://github.com/excalidraw/excalidraw/blob/master/README.md)

### 4. AI 原生工程制图

- **Eraser** 是最接近本项目未来商业方向的竞品：自然语言或代码片段生成图，产物仍是可编辑的 diagram-as-code；支持流程图、时序图、ERD、云架构图，也能从代码库生成并通过 CI 监控架构变化。[AI diagrams](https://docs.eraser.io/docs/ai-diagrams) [Codebase diagrams](https://docs.eraser.io/docs/codebase-diagrams) [Eraserbot](https://docs.eraser.io/docs/eraserbot)
- Eraser 的商业分层也很清晰：免费版限制文件、AI 次数和历史；付费解锁无限文件、更长历史、私密文件、API、SSO 和灵活部署。这说明核心绘图、导出和协作可以先成为使用习惯，之后再围绕容量、AI、治理和部署收费。[Eraser 官方价格页](https://www.eraser.io/pricing)

## 三、主要产品能力比较

说明：`原生文本`指图的主要源是可读 DSL；`双向`指文本与可视化修改能够保留同一语义模型，而不是仅把文本渲染为一张不可拆图；`局部`表示仅特定图种或导入路径支持。产品功能会持续变化，以下以研究日期能从官方资料确认的能力为准。

| 产品 | 主要图种/定位 | 文本与可视化 | AI | 导入/导出 | 协作、模板与商业化 | 离线/隐私 |
|---|---|---|---|---|---|---|
| Mermaid Live Editor / Mermaid OSS | 流程、时序、类、状态、ER、旅程、甘特、需求、Git、思维导图、C4、架构、看板、泳道等约 30 类。[图种清单](https://mermaid.ai/open-source/intro/syntax-reference.html) | 原生 Mermaid 文本→实时预览；不是拖拽式结构编辑器 | OSS 内核不负责 AI | Live Editor 导出 PNG、SVG、Markdown；分享 URL 包含压缩图源/配置 | 免费 MIT 开源，无内建团队权限体系 | 图和历史主要存浏览器，可 Docker/静态自托管；构建时能关闭外部渲染、分析和 Mermaid Chart 集成。[官方仓库](https://github.com/mermaid-js/mermaid-live-editor) |
| Mermaid Chart | Mermaid 官方商业工作台 | Visual Editor 当前明确支持流程、类、时序、状态、思维导图、ER、需求共 7 类，文本与视觉同步；不能推断 Architecture/C4/泳道也已双向。[Visual Editor](https://mermaid.ai/docs/build-and-edit/use-the-visual-editor) | 自然语言生成/修改，可用文件、图片、选区和语音 beta，上屏前显示 diff。[AI 编辑](https://mermaid.ai/docs/build-and-edit/add-and-edit-with-ai) | PNG、SVG、PDF、MMD 和自动更新 live SVG | 分享查看/编辑链接、评论；Premium 提供实时共同编辑、组织和 SSO。[分享协作](https://mermaid.ai/docs/share-and-present/share-a-diagram) [SSO](https://mermaid.ai/docs/workspace-and-admin/sso) | 云 SaaS；Basic/Plus/Premium/Enterprise 围绕图数量、AI、协作与治理分层。[套餐说明](https://mermaid.ai/open-source/ecosystem/mermaid-chart.html) |
| diagrams.net / draw.io | 流程、泳道、BPMN、UML、ER、网络、云、机架、电路、平面图、组织图等广谱专业绘图。[功能总览](https://www.drawio.com/docs/features/) | 2026 Mermaid 模式保存源码并生成原生形状；重生成可保留部分样式/标签，但会覆盖手工位置、尺寸和连线路径。[Mermaid 编辑](https://www.drawio.com/docs/manual/mermaid/) | 在线版可用生成能力；离线桌面版不依赖 AI | XML/drawio、Visio、Gliffy、Lucid 等导入；PNG/SVG/PDF 可内嵌源数据继续编辑。[导出](https://www.drawio.com/docs/manual/export/) | 实时协作借助 Drive、OneDrive、Confluence、Nextcloud 等存储；核心编辑器免费，商业收入重点来自 Atlassian 集成。[协作](https://www.drawio.com/docs/manual/collaboration/share-diagrams/) [商业定位](https://www.drawio.com/docs/about/) | 无需账号、可自选存储/自托管；Windows/macOS/Linux 桌面版完全离线。[离线版](https://www.drawio.com/docs/security/diagrams-offline/) |
| Lucidchart | 企业流程、泳道、BPMN、UML、ER、组织、网络、云架构、数据驱动图和 1,000+ 模板。[产品能力](https://lucid.co/lucidchart) | Mermaid 面板实时渲染；粘贴 Mermaid 也可转原生形状，但画布修改不是完整、可靠的源码回写。[Mermaid](https://lucid.co/diagram/mermaid) | AI 可生成并继续修改流程/泳道、思维导图、ERD、BPMN 和 AWS/Azure/GCP 架构等。[AI](https://help.lucid.co/hc/en-us/articles/30324063850516-Generate-a-diagram-with-AI-in-Lucidchart) | Visio、Gliffy、draw.io、OmniGraffle 和表格数据导入；PDF/PNG/JPEG/SVG，付费版可导出 Visio | 实时共同编辑、聊天、元素评论和版本记录；Free/Individual/Team/Enterprise 逐级增加无限内容、协作与治理 | 有受限浏览器离线，但须预先打开文档，离线不能创建/打开其他文档或协作。[离线编辑](https://help.lucid.co/hc/en-us/articles/14756313957268-Edit-offline-in-Lucid) |
| Miro | 无限白板 + 流程、ER、UML、专业云/网络图；AWS/Azure/Cisco/Kubernetes 等专业图库主要在高阶计划。[图表能力](https://miro.com/diagramming/) [专业形状包](https://help.miro.com/hc/en-us/articles/4403634496402-Miro-for-mapping-diagramming) | 2026 Structured Mermaid 以 Mermaid 为 source of truth，代码和画布双向；当前完整视觉编辑仅流程图，时序/类/ER 的视觉编辑仍未完成，转自由画布会失去同步。[Structured Mermaid](https://help.miro.com/hc/en-us/articles/7004628130962-Create-Mermaid-diagrams-Beta) | AI 可生成流程、ER、UML 时序/类等并继续修改。[Miro AI](https://miro.com/ai/diagram-ai/) | 可导入 Lucidchart、draw.io、Visio、OmniGraffle；导出 JPG、SVG、PDF、CSV，VSDX 为 beta。[导出](https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board) | 实时协作、评论、投票、计时器、Talktrack；Free 到 Enterprise 按画板、AI、图库和治理分层。[定价](https://miro.com/pricing/) | 无离线模式，桌面应用也依赖云端；Enterprise 提供 SSO、审计和区域数据驻留。[系统要求](https://help.miro.com/hc/en-us/articles/360017731553-System-requirements) |
| Whimsical | 轻量流程、思维导图、时序、线框、白板和文档 | Mermaid 流程/时序可导入为可编辑图，Whimsical 图也可导回 Mermaid并保留部分颜色/样式/分组；属于 round-trip 而非持续同步双编辑器。[Mermaid 转换](https://whimsical.com/learn/boards/mermaid) | AI 可生成/迭代流程、思维导图、时序和线框，也提供 ChatGPT/Claude/Cursor/Codex/MCP 集成。[AI](https://whimsical.com/ai) | PNG、PDF、SVG、Mermaid；Docs 可导出 Markdown。[导出](https://whimsical.com/learn/imports-exports/exporting-from-whimsical) | 实时多人编辑、评论、跟随、版本回放；Free/Pro/Business 围绕协作 board、历史、SSO/SCIM 分层。[协作](https://whimsical.com/learn/faqs/collaboration) [定价](https://whimsical.com/learn/billing/pricing) | 无离线支持，桌面应用也必须联网。[离线限制](https://whimsical.com/learn/faqs/offline) |
| Eraser | 工程文档 + 无限画布；流程、时序、ERD、云架构 | diagram-as-code 可在代码编辑器维护，画布也可放自由形状；两类对象共存，但不是任意自由画布与 DSL 的完全双向 | 自然语言、代码、图片生成图，并能继续提示或手改图源。[AI diagrams](https://docs.eraser.io/docs/ai-diagrams) | PDF、PNG、SVG、Markdown；GitHub/GitLab/VS Code/Notion/Confluence 集成。[价格与能力](https://www.eraser.io/pricing) | 实时协作、评论、版本历史；免费到企业分层明确 | 企业可选单租户或 BYOC，官方声明用户数据不用于模型训练。[安全说明](https://docs.eraser.io/docs/security) |
| Excalidraw | 手绘风无限白板、线框、自由图解 | 可视化画布；开放 `.excalidraw` JSON，不是 diagram-as-code | AI 不是 OSS 编辑器的核心能力 | PNG、SVG、剪贴板、开放 JSON。[官方仓库](https://github.com/excalidraw/excalidraw/blob/master/README.md) | 开源编辑器 + Excalidraw+ 商业协作 | 官网 PWA 离线、本地优先、实时协作端到端加密。[官方仓库](https://github.com/excalidraw/excalidraw/blob/master/README.md) |
| PlantUML | UML 最全面：时序、类、用例、活动、状态、组件、部署等，也覆盖大量非 UML 图 | 原生文本；没有通用可视化反向编辑 | 不内置 AI，但文本语法天然适合作为模型输出 | CLI 可导出 PNG、SVG、PDF、EPS、LaTeX、文本等。[命令行文档](https://plantuml.com/command-line) | 开源、IDE/文档生态成熟；生成图片归图源作者所有。[官方 FAQ](https://plantuml.com/faq) | 可完全本地运行或用官方 Docker；服务端应配置安全 profile。[快速开始](https://plantuml.com/en/starting) [安全配置](https://plantuml.com/security) |
| Kroki | 一个 API 统一渲染 Mermaid、PlantUML、D2、Structurizr、Graphviz、BPMN、Vega 等；官方列出的图种还覆盖 C4、UML、ERD、甘特、思维导图、机架、时序波形等。[图种清单](https://docs.kroki.io/kroki/diagram-types/) | 接收各引擎文本并返回图片，不提供画布反向编辑 | 不内置 AI | 统一 HTTP API/CLI，输出能力依赖具体引擎 | 开源基础设施，不是终端协作产品 | 官方支持 Docker/Podman/Kubernetes/手工自托管。[安装文档](https://docs.kroki.io/kroki/setup/install/) |
| D2 / Terrastruct | 面向架构的文本图；支持普通关系图、时序、类、SQL 表/ERD、容器嵌套和多画板 composition | 原生文本；自动布局，可切换 Dagre、ELK、面向架构的 TALA。[布局文档](https://d2lang.com/tour/layouts/) | OSS 语言不内置 AI | SVG、PNG、PDF、PPTX、GIF、ASCII 等。[导出文档](https://www.d2lang.com/tour/exports/) | MPL-2.0 开源语言，插件式布局；更像高质量渲染内核 | 安装后可无浏览器、无持续联网、服务端运行。[官方仓库](https://github.com/terrastruct/d2) |
| Structurizr | C4 专用“模型即代码”：系统景观、上下文、容器、组件、动态、部署，一份模型生成多视图。[官方示例](https://docs.structurizr.com/example) | DSL 为真源；浏览器可调整布局并保存布局信息，但不靠拖拽创建任意模型。[本地工作流](https://docs.structurizr.com/local/workflow) | 官方强调模型文本适合 AI 生成、PR 更新、漂移检测。[为何 as-code](https://docs.structurizr.com/as-code) | 可导出 PlantUML、C4-PlantUML、Mermaid、D2、DOT、JSON、静态站点等，但官方提醒不同导出器并不保留全部特性。[CLI 导出](https://docs.structurizr.com/cli/export) | CLI/本地命令多为免费；预构建 Server 需许可证。[官方首页](https://docs.structurizr.com/) | 可本地运行、文件进 Git；适合受控环境 |
| Microsoft Visio | 流程、跨职能泳道、BPMN、UML、网络、Azure/AWS、组织、工程和平面图等。[Web 版概览](https://support.microsoft.com/en-us/visio/overview-of-visio-for-the-web) | 专业可视化编辑；Excel Data Visualizer 可用表格生成并回写流程数据，但不是文本 DSL | 截至可验证的官方支持信息，没有证据表明 Visio 本体已提供完整的自然语言制图 Copilot，应避免把 Microsoft 365 Copilot 泛化为 Visio AI | VSDX/PDF/图片、AutoCAD 和 Excel 数据链路是优势；具体能力随 Plan 变化 | Microsoft 365 实时协作、评论、Teams/OneDrive 体系，按 Plan 1/2 或桌面版商业化 | Plan 2 桌面应用支持离线和本地文件；Web 版为云协作。[Visio 产品页](https://www.microsoft.com/en-us/microsoft-365/visio) |

## 四、影响产品路线的关键市场变化

### 1. Mermaid 已经具备“工作制图内核”的雏形

- Mermaid 11.16.0 起新增原生 `swimlane-beta`，支持横向/纵向、泳道、跨泳道连接、流程图节点形状和无障碍描述；官方同时警告语法仍可能演进。[Mermaid 泳道文档](https://mermaid.js.org/syntax/swimlanes)
- Mermaid 11.1.0 起提供 `architecture-beta`，以 group、service、edge、junction 和图标表达云或 CI/CD 架构。[Mermaid 架构图文档](https://mermaid.js.org/syntax/architecture)
- Mermaid 也有五种 C4 图，但官方仍标记为 experimental，且列出 sprite、tags、link、legend 等未完整支持项，不宜把它当成成熟的企业 C4 模型替代品。[Mermaid C4 文档](https://mermaid.js.org/syntax/c4)
- Block diagram 提供列和空间控制，解决部分“自动布局总把节点挪走”的问题；Kanban 已支持责任人、工单号和优先级等工作元数据。[Block diagram](https://mermaid.js.org/syntax/block.html) [Kanban](https://mermaid.js.org/syntax/kanban.html)

**含义**：第一阶段没必要为了泳道和常见架构图马上引入重型画布或多个 DSL。应先升级 Mermaid、建立兼容测试和图种能力探测，再在其上做更符合办公用户的结构化编辑器。

### 2. “AI 生成一张图”已经迅速商品化

Eraser 已支持自然语言、代码片段、图片和代码库生成；Lucid、Miro、Whimsical、Mermaid Chart 也都把 prompt-to-diagram 作为入口。单纯增加一个聊天框不构成护城河。真正影响复购的是：

- AI 输出是否遵守公司模板、术语、颜色和图例；
- 能否在已有图上进行局部、可预测、可撤销的修改；
- 能否指出语法、流程逻辑、孤立节点、缺少出口、循环和职责不清；
- 能否从 Excel/CSV、会议纪要、SOP、代码仓库生成后继续维护；
- 图是否能稳定导出并进入真实工作成果。

Eraser 已经在用“参考架构、代码库上下文、CI 自动保持图同步”抬高工程制图门槛。[Eraser 企业版](https://www.eraser.io/enterprise) [Eraserbot](https://docs.eraser.io/docs/eraserbot)

### 3. 真正的无损双向编辑仍然稀缺

“支持 Mermaid”经常只代表：把代码渲染成图，或将图导入为一组形状；并不代表任何拖拽修改都能稳定回写原 Mermaid。完全双向很难，原因包括 Mermaid 图种 AST 不统一、自动布局没有唯一逆解、自由位置/样式不能总能映射回 DSL。

2026 年的官方产品变化已经把门槛推高：Miro Structured Mermaid 让流程图实现代码/画布双向，但其他图种尚未完整跟进；draw.io 选择“Mermaid 源码保结构 + 原生形状保表现”，同时明确重生成会覆盖部分手工布局；Mermaid Chart 也只对 7 类图承诺 Visual Editor。[Miro Structured Mermaid](https://help.miro.com/hc/en-us/articles/7004628130962-Create-Mermaid-diagrams-Beta) [draw.io Mermaid 编辑](https://www.drawio.com/docs/manual/mermaid/) [Mermaid Chart Visual Editor](https://mermaid.ai/docs/build-and-edit/use-the-visual-editor)

因此产品不应承诺“所有图种任意拖拽都无损双向”。更可靠的实现是：

- Mermaid 源码仍是真源；
- 对高价值图种提供**语义表单/大纲编辑**，例如泳道、步骤、负责人、条件、系统、组件、关系；
- 表单编辑生成规范化 Mermaid；
- 画布只开放能回写语义的动作（改名、增删、换泳道、改关系、调整顺序）；
- 自由像素级布局作为可选覆盖层，并清晰提示哪些操作不会写回源码。

这会比一开始搭建完整 draw.io 式画布更快达到可商用的稳定度。

## 五、最值得抓住的产品机会

### 机会 A：中文“工作成果”模板，而不是语法示例

现有 Mermaid 工具多按图种组织示例，办公用户却按任务找答案。模板中心应按成果分类：

- 审批流程、采购、报销、请假、合同、售后升级、问题闭环；
- SOP、跨部门泳道、RACI 风格职责、阶段里程碑；
- 系统上下文、三层/微服务、数据流、部署、网络、云资源；
- 项目计划、组织关系、ERD、时序、用户旅程；
- 故障复盘、应急响应、发布流程、CI/CD。

每个模板不仅要有图，还要有“填空式字段、示例数据、使用说明、适合导出到哪里”。Visio 通过方法论模板和泳道容器降低办公用户门槛，[官方流程模板说明](https://support.microsoft.com/en-us/visio/process-diagrams-in-visio)；Structurizr 通过架构 pattern catalog 降低建模门槛，[官方模式库](https://docs.structurizr.com/dsl/patterns/)。本项目可以把这两种方法合并到 Mermaid 上。

### 机会 B：原生泳道“表格编辑器”

泳道是最明显的工作场景缺口，也是目前最适合做差异化的单点：

- 左侧不是先展示语法，而是“泳道 × 步骤”的结构化列表；
- 支持拖动步骤换负责人/部门、调整先后、添加条件和并行分支；
- 一键横向/纵向、按阶段分组、职责颜色、编号、负责人标签；
- 自动检查没有入口/出口、跨泳道交接、重复步骤、悬空节点；
- 随时切到 Mermaid 源码，并保留 `swimlane-beta` 兼容警告和版本标记。

Visio 对泳道的核心体验包括增加、重排、删除泳道，容器内形状随泳道移动，并可加入 phase 分隔线；这应成为交互验收基线。[Visio 跨职能流程图](https://support.microsoft.com/en-US/Visio/create-a-cross-functional-flowchart)

### 机会 C：轻量架构工作台，而不是与专业建模器硬碰硬

近期应覆盖“画清楚”，中后期再做“模型治理”：

- 近期：架构图标库（AWS/Azure/GCP/通用技术）、分组/边界、关系类型、协议/端口标签、图例、主题、C4 快速模板；
- 中期：一份轻量系统模型生成 Context / Container / Deployment 多视图；
- 后期：Git/代码库扫描、架构差异和漂移检测。

Mermaid `architecture-beta` 适合常见云/部署示意，但 C4 仍实验；若后续客户需要严谨 C4，应考虑 Structurizr 互导或独立模型层，而不是不断给 Mermaid 字符串打补丁。Structurizr 官方就是用一份 DSL 模型生成多张架构图，并能导出 Mermaid、PlantUML、D2 等。[Structurizr 首页](https://docs.structurizr.com/) [导出能力](https://docs.structurizr.com/cli/export)

### 机会 D：本地优先与可验证隐私

在没有账号体系时，反而可以把“无需登录、打开即用、数据默认不出本机”做成卖点：

- IndexedDB 自动保存 + `.mmd`/项目 JSON 明文文件；
- PWA 离线缓存；
- AI 默认关闭，用户显式配置服务商/API 地址；
- 发送给 AI 前展示即将上传的内容范围；
- 提供敏感词/密钥扫描和脱敏；
- 将来可提供单机版、内网 Docker、企业 BYOC。

Excalidraw 已证明 PWA 离线、本地优先和开放 JSON 能显著增强信任，[官方仓库](https://github.com/excalidraw/excalidraw/blob/master/README.md)；Eraser 则把单租户/BYOC 留作企业版价值，[安全说明](https://docs.eraser.io/docs/security)。

### 机会 E：一键进入真实办公交付链路

对非程序员用户，SVG 不是终点。核心导出应包括：

- PNG：1×/2×/4×、透明/白底、指定尺寸；
- SVG：保留矢量、字体与链接，提供“兼容 Office”模式；
- PDF：页面尺寸、方向、边距、分页/适配一页；
- PPTX：可编辑文本优先，至少先实现高保真矢量/图片加标题和备注；
- Markdown：代码块 + 预览图；
- 剪贴板：复制图片、SVG、Mermaid 源码；
- URL/嵌入：后续账号和云端分享阶段再做。

D2 已把 PPTX、PDF、GIF、SVG、PNG 作为文本图的正式导出路径，[D2 导出](https://www.d2lang.com/tour/exports/)；Visio 和 Eraser 都把多格式交付纳入产品能力，[Visio 产品页](https://www.microsoft.com/en-us/microsoft-365/visio) [Eraser 价格页](https://www.eraser.io/pricing)。这说明“交付质量”本身就是付费价值，而不是附属功能。

## 六、核心功能优先级

### P0：可作为正式工具使用的基础闭环

目标：不登录、不付费也能稳定完成一次真实工作制图。

1. **内核升级与兼容层**
   - 升级到支持 `swimlane-beta` 的 Mermaid 11.16+；锁定版本，不直接追随 `latest`。
   - 启动时做图种能力检测；实验图种显示版本/兼容提示。
   - 建立每种图至少 3 个 golden samples 的渲染回归测试。
2. **专业代码编辑**
   - 行号、语法高亮、自动缩进、括号匹配、搜索替换、快捷键。
   - 300–500 ms 防抖实时预览；大图可手动渲染。
   - 错误必须定位到行/列，保留上一次成功渲染，不用空白画布惩罚用户。
3. **可靠项目/文件模型**
   - 新建、重命名、复制、删除确认、最近文件。
   - IndexedDB 自动保存，明确显示“已保存/未保存/恢复草稿”。
   - 打开/保存 `.mmd`、导入 Mermaid 文本、项目 JSON；撤销/重做和本地版本快照。
4. **预览与排版**
   - 缩放、平移、适应画布、100%、全屏、小地图（大图）。
   - 方向、主题、字体、背景、间距、曲线/直角线等常用设置可视化，并生成合法 frontmatter/config。
   - 图宽高、节点数、渲染时间和溢出提醒。
5. **导出闭环**
   - PNG/SVG/PDF、复制图片/SVG/源码；高清倍数、透明背景、页面适配。
   - 导出前预览，字体缺失和超画布警告。
6. **模板中心**
   - 至少 30 个可真正用于工作的中文模板，覆盖流程、原生泳道、架构、时序、ERD、甘特、组织/思维导图。
   - 按“我要做什么”搜索，模板可预览、收藏、复制并保留用户自定义模板。

**P0 发布门槛**：离线刷新不丢图；错误图不覆盖好图；20 个主流模板导出 PNG/SVG/PDF 无截断；中文字体在 Windows/浏览器/Office 中可接受；100 节点流程图仍可编辑。

### P1：形成明显差异化的商业核心

1. **原生泳道结构化编辑器**
   - 泳道、阶段、步骤、条件和关系的表单/大纲编辑；拖动换泳道与排序；自动生成规范 Mermaid。
2. **架构图构建器**
   - 系统/分组/服务/关系的结构化面板；通用与 AWS/Azure/GCP 图标；图例和 C4/部署模板。
3. **AI 助手（无需积分系统）**
   - 用户自带 API Key 或配置兼容 API 地址；自然语言/会议纪要/代码片段 → 图。
   - “选中一段源码/一个语义节点再修改”，提供 diff、预览、接受/拒绝和一键撤销。
   - 先做生成、解释、修错、简化、改主题五个高频动作；不要先做开放式聊天。
4. **数据导入**
   - CSV/Excel 表格生成流程/泳道/组织/ERD；提供列映射和导入预览。
   - 这直接对标 Visio Data Visualizer，但以 Mermaid 源码作为可维护产物。[Visio Data Visualizer](https://support.microsoft.com/en-us/visio/create-a-data-visualizer-diagram)
5. **交付增强**
   - PPTX/Word 友好导出、批量导出、品牌主题包、页眉页脚、标题/版本/密级水印。
6. **质量检查器**
   - 孤立节点、重复 ID、无出口决策、无法到达节点、循环、交叉过多、文字过长、泳道职责缺失、架构关系缺少协议/说明。

### P2：验证需求后再投入

- 多页面项目、跨图复用和轻量架构模型；
- PlantUML/D2/Structurizr 导入或通过自托管 Kroki 渲染；
- Git 仓库同步、PR 预览、图表 diff、代码到架构、漂移检测；
- 实时多人协作、评论、权限、团队模板库；
- 桌面端、内网部署、SSO、审计；
- 账号、积分、计费和组织管理。

不建议在 P0/P1 提前做完整自由画布、通用多人白板、所有 DSL 互转或像素级任意双向编辑。draw.io、Miro、Lucidchart 在这些领域已积累多年；它们会显著拖慢“流程/泳道/架构成果闭环”。

## 七、建议的信息架构

```text
首页/最近项目
├─ 新建
│  ├─ 从工作模板
│  ├─ 从空白图种
│  ├─ 从文字/AI
│  └─ 导入文件/表格
├─ 编辑工作台
│  ├─ 源码
│  ├─ 结构（泳道/架构等高价值图种）
│  ├─ 预览
│  ├─ 样式与布局
│  ├─ 检查问题
│  └─ 导出
└─ 模板中心
   ├─ 流程与泳道
   ├─ 软件与云架构
   ├─ 数据与时序
   └─ 项目与业务分析
```

编辑工作台建议采用可切换的三栏，而不是永远固定“左代码、右预览”：

- 新手：结构/模板 + 预览；
- 熟练用户：源码 + 预览；
- 检查和交付：全宽预览 + 问题/导出侧栏。

## 八、推荐的底层产品模型

不要把整个项目状态只存成一段 Mermaid 字符串。建议从一开始保留可演进的文档结构：

```json
{
  "formatVersion": 1,
  "title": "采购审批流程",
  "engine": "mermaid",
  "diagramType": "swimlane",
  "source": "swimlane-beta LR ...",
  "structuredModel": null,
  "config": { "theme": "corporate", "background": "white" },
  "metadata": { "createdAt": "...", "updatedAt": "..." },
  "snapshots": []
}
```

- 普通 Mermaid 图只需要 `source`；
- 原生泳道/架构构建器可以逐步写入 `structuredModel`，由它生成 `source`；
- 每次用户直接改源码后，解析器尝试重建结构模型；解析失败则保留源码模式并说明哪些结构化功能暂不可用；
- `formatVersion` 为未来迁移、桌面端、云同步和商业协作留出空间。

## 九、商业化前应验证的产品指标

当前无需账户和积分，也可以用完全本地、匿名的产品指标验证方向；若启用遥测，必须默认透明并允许关闭。

- 首次进入到成功导出所需时间；
- 新建来源：模板、空白、导入、AI；
- 各图种成功渲染率和错误恢复率；
- 泳道/架构模板使用率；
- 导出格式分布和导出失败率；
- 7 日内本地项目再次打开率；
- AI 结果首次接受率、修改次数、撤销率；
- 大图的节点数、渲染耗时和浏览器崩溃率。

只有在“用户能稳定产出并重复回来修改”之后，账号、团队空间、AI 配额、企业部署才会成为顺理成章的商业层。

## 十、最终建议路线

**第一阶段（核心稳定）**：Mermaid 11.16+、专业编辑器、错误诊断、本地项目、历史、模板、PNG/SVG/PDF、PWA 离线。  
**第二阶段（差异化）**：原生泳道结构化编辑、架构构建器、中文工作模板、Office 友好导出、质量检查。  
**第三阶段（智能化）**：BYOK AI、局部编辑 diff、会议纪要/代码/表格生成、品牌规则。  
**第四阶段（商业协作）**：云同步、团队模板、Git、评论权限、私有部署、SSO，再加入账号、积分和计费。

这条路线避开了与通用白板的正面消耗，利用现有 Mermaid 资产最快做出“能用于工作、能正式交付、能长期维护”的产品核心，同时为后续工程架构和企业商业化保留了模型、隐私和部署空间。
