# Health Journal agentic workflow v1

用户已选择：受控总控 Agent + 专用工具。目标是在现有本机网站中真正运行、追踪和恢复工作流，并保存设计图。PDF《AI就医助手_项目概述(1).pdf》是需求参考；会话中关于随时记录、邮件延期和患者审阅的决定优先。

## 工作流合同

采用有边界的 observe → plan → act → verify → checkpoint 循环。Agent 使用已有 DeepSeek；工具运行和状态转移由服务器控制。模型不能调用任意 URL、修改病史、作诊断、开药或发送邮件。

每次患者记录先独立持久化，再可选启动工作流。读取当前事件、患者档案及明确区分的历史；先执行本地紧急提示检查；调用模型提取有原文来源的事实、判断缺少哪些描述信息，并提出允许的下一步。代码校验计划和引用，再执行一种工具：提出一个问题、结束本轮等待后续记录，或生成患者要求的摘要。摘要必须经患者核对后保存和导出。诊后患者录入结果，后续事件可显式关联旧记录。

## 运行状态和工具

运行记录包含 schemaVersion、workflowVersion、runId、episodeId、goal、sourceFingerprint、sourceRevision、parentRunId（重试时）、status、startedAt、finishedAt、steps、decision、可恢复输出或安全错误码。只保存外部动作和结果，不保存模型隐式推理。

状态：running → waiting_patient / waiting_review / completed / urgent / failed / interrupted；waiting_review → completed 需要患者保存版本。失败与中断可由用户重试，创建有关联的新运行。新的患者回答保存后启动下一轮，读取最新记录。对于未变化的数据重复请求，不重复写入追问；返回已有结果或明确提示本轮已完成。

标准步骤：load_context、safety_check、agent_plan、verify_sources、execute_tool、checkpoint。每步保存开始/完成状态、时间及简短结果代码。前端展示真实运行结果，不以计时动画假装步骤已完成。

允许模型动作：ask_followup、finish_tracking、create_brief。reflect 目标允许前两者；brief-draft 目标只允许 create_brief。安全检查发现当前保守规则命中时，优先显示紧急专业帮助提示，不等待模型返回；它不是经过验证的诊断或完整分诊。

工具：read_context、check_urgent_guidance、extract_and_plan、verify_quotes、ask_patient、compose_brief、save_checkpoint、save_reviewed_brief。病史引用和患者陈述始终区分。诊后人工记录与 PDF 导出通过已有经过验证的接口；无对外发送工具。

## 数据与兼容性

SQLite 单独持久化运行记录；运行追踪写入不应令临床记录 revision 无故变化。旧数据库自动增量兼容。真实/虚构数据集隔离，清空某数据集同时清除其运行记录，备份包含运行轨迹。运行 ID 和来源指纹用于幂等和过期检查。最多保留每事件最近 30 次运行，保存摘要的来源快照不受清理影响。

服务器重启将遗留 running 标为 interrupted。人工确认保存必须验证草稿来源未改变。AI 超时、格式错误、无来源引用和非法动作均失败关闭，保存患者原文，提供重试入口。邮件发送和电脑关机后的定时任务仍按此前决定延期。

## 网站

保留温暖简洁的界面；每个症状事件增加可折叠的“助手流程”面板，显示目标、状态、真实步骤、缺失信息、下一步和运行历史。失败显示重试；待核对显示恢复草稿。偏好设置提供设计图入口。UI 英文默认，可切换中文。

## 验收

验证智能动作选择、问题停止条件、精确引用、安全提示优先、幂等、重试来源、重启恢复、审阅状态转移、真实/示例隔离及来源修改失效。运行现有回归测试；以虚构数据实际调用 DeepSeek 并在浏览器走通记录→追问→摘要→核对。保存独立 HTML/SVG 工作流设计图和可编辑源，标注其为逻辑设计合同，而非对未提交 Git HEAD 的来源认证。
