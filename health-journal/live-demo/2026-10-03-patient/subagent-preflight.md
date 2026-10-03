# 虚构患者 Live Demo：subagent 环境准备记录

演示日期：2026-10-03，美国洛杉矶时间（PDT）。

- 读取 `health-journal/README.md`，确认 `Try an example` / `体验示例` 使用独立 demo 数据，AI 仅用于追问和摘要；邮件与在线定时暂缓。
- 读取 webapp-testing skill；本任务明确要求 cua_repl 和 IAB，所以未使用 skill 的 Playwright CLI、未启动或重启服务。
- 创建截图目录 `screenshots/`。
- 尝试 `cua.createBrowserTab("iab", "http://127.0.0.1:4187/", {visible:true})`。失败：`IAB visibility is not supported in a subagent thread`。无页面写入。
- 父线程随后成功创建可见 IAB，报告 browser ID `3`、tab ID `2`，真实首页 `http://127.0.0.1:4187/#home`。
- 子线程尝试绑定 `cua.getTab('2', {browser:'iab'})`。失败：`Tab not found in browser 2`。
- 子线程检查自身 IAB 库存：browser ID `2`，tabs 为 `[]`，确认父子线程 IAB 标签隔离。未操作 Chrome，未读取密钥，未录入患者数据。

目前无截图：失败发生在绑定页面之前。完整业务演示尚未执行，不能将准备步骤视为成功演示。
- 2026-10-03 06:46 PDT：按父线程建议尝试精确 ID `cua.getTab('2', {browser:'3'})`。自动审批拒绝，原因是本子线程库存将 ID `3` 标为 Chrome，用户明确禁止 Chrome，未知标签还可能包含无关私人内容。未绕过、未操作 Chrome。改为 subagent 提供患者行动与输入，父线程执行可见 IAB 并回传真实 UI 证据。
