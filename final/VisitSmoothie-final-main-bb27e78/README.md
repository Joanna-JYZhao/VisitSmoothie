# VisitSmoothie（医伴）

**An agentic outpatient companion: prepare the story before the visit, follow the plan after it.**

> 说不清的，我帮你说清楚；记不住的，我帮你记住。

📄 Pitch deck: [docs/VisitSmoothie_Pitch_Final.pdf](docs/VisitSmoothie_Pitch_Final.pdf)

## The problem

The visit is short. The information isn't.

- China handled about **10.15 billion** healthcare visits in 2024 (National Health Commission, 2024 Statistical Bulletin).
- In one large tertiary hospital, patients waited about **40 minutes** for a consultation of about **3 minutes** (JMIR, PMC12396732, 2019–2022 data; one hospital, not a national average).
- In a survey of **11,959** outpatients, communication with doctors and time with doctors both shaped satisfaction.

Our interviews with our own families showed the same gap from both sides:

- **Before the visit**, the full story is hard to pass on. Symptom progression, medicines, exposure and family history get missed during short history-taking.
- **After the visit**, the plan is hard to understand. Patients leave with a prescription but still want to know why this drug, for how long, and what to watch for.

## What VisitSmoothie does

Two jobs, one record.

| Stage | What happens |
|---|---|
| **Before the doctor** | The patient describes the problem by voice, typing, a body map or a photo. The agent compares the profile, similar past visits and what it already knows, then asks **one missing item at a time**. The result is a patient-reviewed page for the doctor, plus a rule-based urgency and department hint. |
| **The visit** | **No AI in the room.** The patient shows the page. The doctor decides. |
| **After the doctor** | The patient records the visit (with the doctor's consent) or photographs the record or prescription. VisitSmoothie builds a **Clinical Plan**: diagnosis, medicines, to-dos, cautions and follow-up. Tap any line to ask about it. |
| **At home** | Reminders from the lines the patient chose, "better / same / worse" check-ins, and questions answered from the patient's own record. |

Every saved visit becomes memory. At the next visit, the agent starts from the last saved plan, medicines and profile.

Also included: body map, plain-language confirmation of colloquial terms, red-flag alerts, follow-up tracking, visit timeline, long-term tracking, emergency card, bilingual interface (中文 / English) and a first-use tutorial.

## How we measure better care

| Dimension | Question |
|---|---|
| Communication and satisfaction | Do patients feel better able to communicate their concerns, and more satisfied with the visit? |
| Understanding and confidence | Do patients understand their treatment plan and feel confident about what to do next? |
| Adherence and follow-through | Do patients follow medicines, tests and follow-up plans more consistently? |
| Patient outcomes | Over time, do patients report better symptom and health outcomes? |

## Safety principles

- The AI organises and reminds. It **does not diagnose**, and it never sets or changes doses.
- **Red flags are decided by fixed rules**, not by the model, and trigger an immediate "seek care now" alert.
- The doctor page is generated from what the patient actually said. The model's text is filtered so it cannot invent facts, guess causes or name diseases.
- All patients in this repository, including the demo patient "Uncle Lin", are **fictional**.

## Try it

Requires Node.js 24 or later.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. To see a patient with a full history, open http://localhost:3000/demo/lin (no password needed).

### API keys are not included

This repository contains **no API keys**. Before running, add your own keys to `.env.local`, which is git-ignored and must never be committed:

| Variable | What to put |
|---|---|
| `GLM_API_KEY` | Your Zhipu GLM key. Set `GLM_MODEL=glm-5`. |
| `AI_PROVIDER` and `ANTHROPIC_API_KEY` | Optional. Set `AI_PROVIDER=claude` and your Anthropic key to use Claude instead. |
| `DATA_ENCRYPTION_KEY` | Leave empty. It is generated on first run. |

Without a key the app still runs: conversations fall back to built-in rules, and photo reading is unavailable.

## How it is built

| Layer | What it does | Built with |
|---|---|---|
| Interface | Capture, review, reminders | Next.js 16, React 19, Tailwind CSS 4 |
| Workflow | Routing, episode state, actions | TypeScript rules |
| Language | Intake, extraction, explanations | Zhipu GLM or Claude, with rule-based fallback |
| Storage | Isolated accounts, encrypted records | SQLite, AES-256-GCM |

### Not ready yet

- Reminders only work while the app is open.
- Voice and photo reading need a configured model key.
- English-mode safety filters are a first version.
- No clinical, usage or revenue results yet.

## Team

**Tri Team**: Joanna (product lead), Ronnie, Nancy, Robin and Lucas (engineers).

*Make care make sense.*

---

# 开发说明（中文）

> 说不清的，我帮你说清楚；记不住的，我帮你记住。

医伴帮患者把病情记下来，看病时把整理好的内容直接给医生看。它只做记录、整理和提醒，不做诊断，不给用药剂量；遇到危险情况直接建议就医。

`main` 是整合入口，包含患者主应用、最新版手机 UI、身体图问诊、Clinical Plan 及逐条追问、AI 提供商切换、新手引导、加密存储，以及独立账号和语音转写模块。来源分支、冲突处理和本次验证见 [docs/MAIN-INTEGRATION.md](docs/MAIN-INTEGRATION.md)。

## 版本控制

当前发布版本：**`2026-10-04-01.34`**。

- 版本格式：`YYYY-MM-DD-HH.mm`，即日期 + 24 小时制的小时.分钟，各字段补零。
- 时间统一使用 `America/Los_Angeles`（洛杉矶时间），避免队友所在时区不同导致版本不一致。
- 根目录 [VERSION](VERSION) 保存当前发布版本；`main` 的每次验收发布同步更新此文件、README 当前版本及下方版本记录。
- 每个发布提交创建带注释的 Git tag：`v<版本号>`，本次为 `v2026-10-04-01.34`。通过 tag 可定位对应代码。
- 同一分钟只创建一个发布版本；已发布的 tag 保留，不覆盖。下个版本使用下次发布时的日期与时间。

| 版本 | 更新 |
| --- | --- |
| `2026-10-04-01.34` | 新增 VERSION、README 版本记录及对应 Git tag。 |

查看历史版本：

```sh
git tag --list 'v20*' --sort=-refname
```

## 双击启动（macOS）

在 Finder 中双击项目根目录的 **启动 VisitSmoothie.command**。入口会自动找到 Node.js 24+，首次缺少依赖时安装依赖，启动当前代码的网页，并在网页准备好后打开默认浏览器。若本项目已经启动，会直接打开已有网页；其他项目占用端口时会自动在 3000–3020 范围内选择空闲端口。

保留启动时打开的终端窗口。需要停止时，在该窗口按 **Ctrl+C** 或关闭窗口。API 配置沿用项目现有的 `.env.local`；双击入口不修改配置或账号资料。

## 接手的队友先看这里

完整的交接说明在 [docs/交接说明.md](docs/交接说明.md)：怎么运行、目前有什么、还缺什么、设计规范在哪、产品上的规矩。最快的看法：

1. `npm install && npm run dev`，打开 http://localhost:3000 。
2. 打开 `/demo/lin` 看虚构病人林叔的完整记录（不用密码）。
3. 想跳过注册的必填项，在底栏「set」里打开「开发者」开关。
4. 设计规范在 `src/app/globals.css`（颜色、字号、材质）和 `src/components/ui.tsx`（公共组件）。手机版各界面截图在 `docs/手机版截图/`。

## 页面

| 页面 | 做什么 | 路径 |
|---|---|---|
| 欢迎页 | Visit Smoothie 欢迎页（照队友 `codex/visit-smoothie-onboarding` 的界面）：「开始我的健康旅程」或「已有账号？登录」 | `/welcome` |
| 注册 | 七项资料（姓名、出生日期、性别、学历必填；基础病、家族遗传病、过敏史选填）加登录密码。也可以拍体检报告自动填 | `/onboarding` |
| 登录 | 姓名和密码 | `/login` |
| 首页 | to do & tips 与问 AI；底栏进入 pre、post、report、set，顶部进入应急 | `/` |
| 看医生之前 | 说或打一句哪里不舒服，AI 一次问一个问题，问完生成给医生看的描述和就医建议 | `/pre` |
| 看完医生 | 录音或拍病历、处方，生成 Clinical Plan；勾选待办、逐条解释和追问，再确认保存 | `/post` |
| 给医生看 | 第一屏是大字一眼版，细节折叠，可打印、复制文字 | `/doctor/[id]` |
| 就诊记录 | 查看历史就诊、摘要和诊后记录 | `/report` |
| 个人中心 | 个人资料、设置、开发者开关与退出登录 | `/set` |

## 账号与安全存储

- 账号、档案和每一次就诊记录都保存在**服务端加密存储**里（`.data/visitsmoothie.sqlite`），不再放在浏览器 localStorage。换浏览器、换电脑，连上同一个服务登录就能取回。
- **每个患者的数据互相隔开**：数据库里每行患者数据以账号 UUID 为主键；所有读取都经过登录会话（httpOnly Cookie）解析出"你是谁"，接口上根本不存在"指定别人 id 查数据"的入口，未登录一律 401。
- **加密落盘**：档案与就诊记录整体用 AES-256-GCM 加密后写入数据库，数据库文件里查不到任何明文（姓名作为登录用户名除外，它是登录标识）。主密钥只来自环境变量 `DATA_ENCRYPTION_KEY`，首次运行自动生成并写入 `.env.local`；`.env*` 和 `.data/` 都被 gitignore，永远不会进入 GitHub。**密钥丢失则已有数据无法解密**，备份时请同时备份 `.env.local`。
- **密码**：15 到 128 个字，服务端 scrypt 加盐哈希，不存明文；登录连续错 5 次锁定 60 秒；姓名或密码错误时提示相同，不暴露是哪个错了。
- **会话**：32 字节随机令牌，httpOnly + SameSite=Lax Cookie，数据库只存 SHA-256 哈希，7 天过期，退出登录立即撤销。
- **并发**：每次写入带版本号（乐观并发），另一个标签页/设备写过之后旧草稿不会静默覆盖，会以服务端为准重新加载。
- 想清空本机所有演示数据：停服务后删除 `.data/` 目录即可。
- 上线公网前还需要：HTTPS、把 `.data/` 放进系统级加密卷或换托管数据库、密钥改由密钥管理服务下发。本仓库当前的边界是本机回环地址。

## 演示病人：林叔（虚构）

打开 `/demo/lin`，不用密码直接进入。也可以在登录页点「林叔」。

林叔照队友的剧本《虚构患者资料_中英双语》建档：46 岁男，自述高血压但药名剂量待核对，父亲高血压、母亲 2 型糖尿病，吃虾起风团。档案里有 5 月 12 日一次左膝不适（没有明确诊断），以及这次左膝内侧酸痛的问诊、骨科医嘱（原因待查，不加药，不做检查，一周后复诊）和两个单次提醒（复诊前一晚 20:00 准备病历和药盒、复诊当天 8:30 复诊准备）。日期以打开演示的这一天为「看病那天」。

## 开发者开关

在底栏「set」里的「开发者」，点一下开、再点一下关，默认关，只记在这台浏览器里。开着时注册七项和密码都可以不填，登录可以不输密码，方便演示和测试时一路往下走。

## 快速开始

整合版需要 Node.js 24 以上（服务端用了 `node:sqlite`，独立模块也以 Node.js 24 为运行环境）。

```bash
npm install
cp .env.example .env.local   # 填入智谱或 Anthropic 的 API Key（可以不填）
npm run dev
```

打开 http://localhost:3000 。

| 变量 | 说明 | 默认 |
|---|---|---|
| `AI_PROVIDER` | 对话、整理和识别照片用哪家：`glm`（智谱）或 `claude`（Anthropic） | 有 `ANTHROPIC_API_KEY` 时 `claude`，否则 `glm` |
| `GLM_API_KEY` | 智谱开放平台的 API Key。`glm` 时对话、整理、照片都用它；语音转文字总是用它。留空时语音不可用 | 空 |
| `GLM_MODEL` | `glm` 时对话和整理用的模型 | `glm-5` |
| `GLM_VISION_MODEL` | `glm` 时识别照片用的模型 | `glm-4.6v` |
| `GLM_ASR_MODEL` | 语音转文字用的模型 | `glm-asr-2512` |
| `GLM_BASE_URL` | OpenAI 兼容接口地址 | `https://open.bigmodel.cn/api/paas/v4` |
| `ANTHROPIC_API_KEY` | Anthropic 的 API Key，`claude` 时用 | 空 |
| `CLAUDE_MODEL` | `claude` 时对话、整理和识别照片用的模型 | `claude-opus-5-5` |

两家都没有 Key 时用内置规则引擎回答，拍照不可用。

Key 只在服务端的 `/api` 路由里使用，不会进入浏览器，也不在仓库里。没有 Key 或接口出错时自动改用内置规则。

## 检查

```bash
npm run lint
npm run typecheck
npm test            # 患者应用、独立账号模块、独立语音模块
npm run build
```

`npm run test:rules` 通过实际 HTTP 接口检查无 Key 的规则流程；先启动没有 `GLM_API_KEY` 和 `ANTHROPIC_API_KEY` 的服务，再用 `BASE=http://127.0.0.1:端口 npm run test:rules` 指向它。

## 独立模块

- [visit-smoothie/README.md](visit-smoothie/README.md)：账号、昵称、资料、登录与退出，默认 `http://127.0.0.1:4190`，使用自己的 SQLite 数据库。
- [patient-dictation/README.md](patient-dictation/README.md)：可复用的音频转文字函数和 CLI；调用方传入音频及供应商配置，返回文字供原有分析接口使用。

主应用从根目录运行，默认端口为 3000。两个独立模块保留各自的调用方式及数据约定。

`scripts/fixtures/` 里的两套旧演示数据只给单元检查用，App 里已经没有。

## 文档

`docs/` 里有第三版方案、功能说明、流程思维导图（PDF 和 HTML）和简化方案。

## 边界

可信优先：给医生看的第一屏和时间线由记录按规则生成；是否提示就医、危险信号由本地规则判断，不依赖模型；模型输出都经过过滤（不编没说过的话，不猜原因，不点名疾病）。所有患者都是虚构的。
