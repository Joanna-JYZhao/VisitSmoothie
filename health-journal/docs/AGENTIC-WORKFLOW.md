# Health Journal：受控 Agent 工作流

设计版本 1.0 · 工作流版本 `health-journal-v1` · 2026-10-02

用户选择的架构 A 已应用于现有网站：DeepSeek 从有限动作中提出下一步，服务端验证计划和原文引用，再执行专用工具。每次运行最多一次模型规划、一次选定动作；患者回答或核对摘要后，流程才继续。

## 用户完整流程

1. **建档**：患者保存基本信息和病史，空白字段保留为未知。
2. **随时记录**：先保存患者原文，再按需运行 AI。读取当前记录和相关背景，先检查现有紧急提示规则，再规划、校验并执行一次追问或结束本轮。
3. **就诊前**：患者选择历史、记录问题并请求摘要。模型整理可验证的原文片段，代码模板组成摘要；患者核对并保存后才成为可导出的正式版本。
4. **就诊后**：患者录入医生实际结论、处理和安排，按需归档。
5. **以后复发**：患者选择关联以前的记录；历史背景与本次症状分开呈现，不推断相同诊断。

## 固定执行合同

`保存原文 → 读取上下文 → 本地紧急提示检查 → 模型规划 → 计划/引用校验 → 专用工具 → 保存检查点`

| 模型动作 | 专用工具 | 可用目标 | 结果 |
|---|---|---|---|
| `ask_followup` | `ask_patient` | `reflect` | 一个描述性问题，等待患者的新记录 |
| `finish_tracking` | `save_checkpoint` | `reflect` | 本轮完成，不继续追问 |
| `create_brief` | `compose_brief` | `brief-draft` | 草稿持久化，等待患者核对 |

模型输出必须符合 `{facts, decision:{action,missingDetails}, question?}`。服务端拒绝多余字段、非法动作和不匹配当前患者原文的引用。模型不能自行执行任意代码、发送邮件或给出临床诊断。紧急规则命中时跳过模型，展示就医提示；这些规则不是经过临床验证的分诊系统。

## 状态、暂停与恢复

运行状态包括 `running`、`waiting_patient`、`waiting_review`、`completed`、`urgent`、`failed`、`interrupted`。每次运行持久化唯一 `runId`、目标、语言/时区、来源指纹/版本、步骤状态/时间、输出或安全错误码及重试来源 `parentRunId`；不保存模型隐藏推理。

- 同源重复请求复用结果，避免重复提问。来源版本变化会阻止旧结果直接写回。
- 追问和等待状态在同一数据库事务中保存。
- 草稿保存在运行记录中，可在新页面恢复；恢复不会覆盖当前已编辑的草稿。
- 患者核对保存时再次验证来源，将摘要版本和 `completed` 状态在同一事务中保存，并追加 `patient_review` 步骤。
- 服务重启将遗留的运行标为 `interrupted`。失败或中断后由患者显式重试；新运行关联旧运行，重复重试复用已有结果。
- 运行轨迹独立于临床数据版本。每次病情保留最近 30 次运行；已核对摘要的来源快照独立保留。真实/演示数据隔离，导出和清空均遵循当前数据集。

网站的“助手流程 / Assistant workflow”折叠面板展示上述实际记录，提供刷新、失败重试及草稿恢复入口。设置页提供设计图链接。

## 实现入口

| 文件 | 责任 |
|---|---|
| `server/workflow.mjs` | 有限工具注册、计划验证、执行步骤、复用/重试及检查点 |
| `server/ai.mjs` | DeepSeek 合同、精确引用校验、紧急提示、摘要模板 |
| `server/store.mjs` | SQLite 运行记录、原子保存、中断恢复与数据集边界 |
| `server.mjs` | 原有 AI/摘要端点及新增运行历史 API |
| `public/app.js` | 捕获请求上下文、运行缓存版本、重试和草稿恢复 |
| `public/screens.js`、`public/styles.css` | 中英文运行面板 |
| `tests/workflow.test.mjs`、`tests/frontend.test.mjs` | 分支、恢复、原子性和异步竞态回归 |

API 保留 `/reflect`、`/brief-draft`、`/briefs`，增加 `GET /api/episodes/:id/workflow`。AI 请求可带 `retryRunId`；响应增加 `workflow`、`reused`，草稿携带 `workflowRunId`。旧客户端仍可走原来的版本校验保存路径，但不宣称完成新的工作流。

## 设计图与验证

- 网站入口：`/workflow-design.html`。
- 图源和独立 HTML/SVG：`../../.archify/workflow-health-journal-agentic-20261002-213000/`。
- `health-journal-agentic.html` 内嵌样式和图，可离线查看；SVG 可单独分享。
- A/B/X 是跨区域续接标记，分别表示患者新输入、历史再利用和失败恢复。
- 图为逻辑设计合同，未声称基于 Git HEAD 的源代码认证。Archify 原候选及自动布局失败诊断已保留；最终图由显式 SVG 布局生成，在 Codex 内置浏览器中人工检查。
- 测试与实际浏览器记录见 [VERIFICATION.md](../VERIFICATION.md)；实现者记录见 [WORKFLOW-REPORT.md](../WORKFLOW-REPORT.md)。

邮件发送、关机后的在线定时服务、云同步仍按用户决定暂缓。本地服务需保持运行；使用 AI 需要网络及有效 DeepSeek 配置。
