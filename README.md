# 风沙图表工作台

风沙图表工作台是一款本地优先的智能流程图与可视化画布工具。它支持用 Mermaid 源码快速建图，也支持进入可视化画布进行拖拽、连线、排版和交付导出。

## 核心功能

- Mermaid 流程图、泳道图等多种图表编辑与实时预览
- 画布缩放、拖动、文字双击编辑及源码双向同步
- 内置 draw.io v31.1.8，可在离线状态下使用可视化编辑器
- 可选官方在线画布备用，并可在设置中心关闭
- CPA、DeepSeek 和 OpenAI 兼容自定义接口
- AI 生成、修改、修复和解释图表，支持流式输出
- 本地项目、自动保存、版本快照、备份和恢复
- PNG、SVG、PDF、draw.io 源文件等交付格式
- Windows 桌面应用，以及可单独部署的网页版

## 下载桌面版

请从 [GitHub Releases](https://github.com/Fengsha5201314/Codebuddy_001_mermaid-markmap/releases) 下载最新版 Windows 安装程序。桌面版可以在“设置 → 版本与更新”中检查后续版本。

## 本地开发

要求：Node.js 22+、pnpm 10+。

```bash
cd chart-visualizer
pnpm install --frozen-lockfile
pnpm dev
```

构建网页版：

```bash
pnpm build
pnpm preview
```

构建 Windows 桌面安装包：

```bash
pnpm desktop:build
```

运行测试：

```bash
pnpm test
pnpm test:e2e:visual
```

## 数据与隐私

- 图表、工作区设置和版本快照默认保存在本机。
- API Key 仅保存在本机桌面服务端，不应提交到 Git。
- AI 请求只发送当前图表源码和用户本次指令。
- 本地内置画布不依赖 `embed.diagrams.net`；启用在线备用时才可能连接该服务。

## 仓库说明

- 主应用位于 `chart-visualizer/`。
- `vendor/drawio/` 保存固定版本的 draw.io 官方开源资源及许可说明，用于离线画布。
- `node_modules/`、构建产物、安装包、本地备份、缓存和密钥文件不会进入源码仓库。
- Windows 安装包由版本标签触发 GitHub Actions 构建并发布。

## 已知限制

- 当前桌面安装包仅提供 Windows x64 版本。
- 在线自动更新依赖本仓库 GitHub Releases 可访问。
- AI 功能需要用户自行配置可用的 CPA、DeepSeek 或兼容 API。

## 许可证与上游

项目内置画布基于 [jgraph/drawio](https://github.com/jgraph/drawio) 的固定版本构建，上游许可与集成说明保留在 `chart-visualizer/vendor/drawio/` 中。项目名称和“风沙”品牌不代表 draw.io 官方背书。

