# VisitSmoothie（医伴）

**An agentic outpatient companion: prepare the story before the visit, follow the plan after it.**

> 说不清的，我帮你说清楚；记不住的，我帮你记住。

📄 Pitch deck: [docs/VisitSmoothie_Pitch_Final.pdf](final/VisitSmoothie-final-main-bb27e78/docs/VisitSmoothie_Pitch_Final.pdf)

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
cd "final/VisitSmoothie-final-main-bb27e78"
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

# 项目整理（中文）

这个分支是整个项目的归档，只用来保存和查阅，不参与开发。正式开发请用 `main` 分支。

## 目录

| 文件夹 | 内容 |
|---|---|
| `final/VisitSmoothie-final-main-bb27e78/` | 最终版代码，和团队仓库 lucasnotfound59/TriMedManagement 的 main（提交 bb27e78）完全一致 |
| `final/notes/` | 给 AI 的项目说明、Workflow 简化版流程图 |
| `previous-versions/01-v1-v2-simplified-original-Oct2-3/` | 第一、二版网站，以及当时的协作文件和素材 |
| `previous-versions/02-widescreen-polish-round2-Oct3/` | 宽屏 VisitSmoothie 布局，美化第二轮 |
| `previous-versions/03-celadon-ui-teammate-Oct3/` | 队友做的青瓷绿界面 |
| `previous-versions/04-mobile-home-polish-unpushed-draft-Oct4/` | 手机版结构，加上没推到 main 的首页美化草稿 |
| `previous-versions/05-teammate-main-before-final-Oct4/` | 最终版之前，队友推到 main 的版本 |
| `previous-versions/other/` | 项目介绍 PDF 和早期截图 |

## 运行前必须填入 API Key

为了安全，这里所有的 API Key 都已经去掉。想运行任何一个版本，先进入它的文件夹，再按下面做：

1. 复制示例配置：`cp .env.example .env.local`
2. 打开 `.env.local`，填入你自己的 Key：
   - 用智谱 GLM：填 `GLM_API_KEY=你的智谱Key`，并设置 `GLM_MODEL=glm-5`。
   - 用 Claude：填 `AI_PROVIDER=claude` 和 `ANTHROPIC_API_KEY=你的Anthropic Key`。
   - 语音转文字走智谱，想用的话 `GLM_API_KEY` 也要填。
   - `DATA_ENCRYPTION_KEY` 留空即可，第一次运行时会自动生成。
3. 安装依赖并启动：`npm install && npm run dev`，然后打开 http://localhost:3000 。

不填 Key 也能打开网站，但对话、整理会退回内置规则，拍照识别用不了。

**`.env.local` 永远不要提交到 GitHub。**本分支的 `.gitignore` 已经排除了它。

## 说明

- 每个版本文件夹里都没有带 `node_modules`、`.next`、`.data` 和 `.git`，运行前需要 `npm install`。
- 所有病人数据都是虚构的。
