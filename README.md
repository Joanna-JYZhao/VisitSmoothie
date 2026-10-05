<div align="center">

# VisitSmoothie

**An agentic outpatient companion.**
**Prepare the story before the visit. Follow the plan after it.**

*Make care make sense.*

**English** · [Read in Chinese](README.zh-CN.md)

[Pitch deck (PDF)](final/VisitSmoothie-final-main-bb27e78/docs/VisitSmoothie_Pitch_Final.pdf) · [Source code](final/VisitSmoothie-final-main-bb27e78) · [Past versions](previous-versions)

</div>

---

## The problem

**The visit is short. The information isn't.**

| | |
|---|---|
| **10.15 billion** | healthcare visits in China in 2024 (National Health Commission, 2024 Statistical Bulletin) |
| **~3 minutes** | average consultation, after about 40 minutes of waiting, in one large tertiary hospital (JMIR, PMC12396732) |
| **11,959 outpatients** | surveyed; communication and time with doctors both shaped their satisfaction |

Interviews with our own families showed the gap from both sides:

- **Before the visit**, the full story is hard to pass on. Symptom progression, medicines, exposure and family history are easy to miss during a short history-taking.
- **After the visit**, the plan is hard to understand. Patients leave with a prescription but still want to know why this drug, for how long, and what to watch for.

## How VisitSmoothie helps

Two jobs, one record.

| Stage | What happens |
|---|---|
| **Before the doctor** | The patient describes the problem by voice, typing, a body map or a photo. The agent compares the profile, similar past visits and what it already knows, then asks **one missing item at a time**. The result is a patient-reviewed page for the doctor, with a rule-based urgency and department hint. |
| **In the room** | **No AI in the room.** The patient shows the page. The doctor decides. |
| **After the doctor** | The patient records the visit, with the doctor's consent, or photographs the record or prescription. VisitSmoothie builds a **Clinical Plan**: diagnosis, medicines, to-dos, cautions and follow-up. Tap any line to ask about it. |
| **At home** | Reminders from the lines the patient chose, "better / same / worse" check-ins, and answers grounded in the patient's own record. |

Every saved visit becomes memory. At the next visit, the agent starts from the last saved plan, the medicines and the profile.

## Features

- **Guided intake.** One question at a time, covering location, character, duration, triggers, associated symptoms, medicines, history and severity.
- **Body map.** Tap where it hurts, with close-ups for the knee, shoulder, back and abdomen.
- **Plain-language confirmation.** Colloquial words are confirmed before they are rewritten in clinical terms, and the patient's own words are kept.
- **Links to past visits.** When the current problem resembles an earlier one, the agent asks what is the same and what is different. It never draws the conclusion itself.
- **Page for the doctor.** A large-print summary first, details folded below. It can be printed, saved as PDF or copied.
- **Clinical Plan.** Built from a photo or a recording, with an explanation and follow-up questions under every line.
- **Reminders and check-ins.** Medicines, follow-up visits and things to prepare.
- **Ask about your record.** For example, "What did the doctor say last time?" Every answer names its source.
- **Emergency card.** Who I am, my conditions, my allergies, my emergency contact, and what to do if I faint.
- **Long-term tracking.** Blood pressure, blood glucose and weight trends, plus a yearly summary.
- **Bilingual.** Chinese and English interface.

## Safety principles

- The AI organises and reminds. **It does not diagnose**, and it never sets or changes doses.
- **Red flags are decided by fixed rules**, not by the model, and trigger an immediate "seek care now" alert.
- The page for the doctor is generated from what the patient actually said. Model output is filtered so it cannot invent facts, guess causes or name diseases.
- Patient data is stored per account, encrypted with AES-256-GCM.
- **All patients in this repository are fictional.**

## How we measure better care

| Dimension | Question |
|---|---|
| Communication and satisfaction | Do patients feel better able to communicate their concerns, and more satisfied with the visit? |
| Understanding and confidence | Do patients understand their treatment plan and feel confident about what to do next? |
| Adherence and follow-through | Do patients follow medicines, tests and follow-up plans more consistently? |
| Patient outcomes | Over time, do patients report better symptom and health outcomes? |

## Demo patient

**Uncle Lin** is a fictional 46-year-old man with hypertension, a shrimp allergy and recurring left-knee pain. His profile holds twelve history entries and ten past visits from November 2025 to October 2026. Open `/demo/lin` to see a patient who has used the app for almost a year, no password needed.

## Repository layout

```
final/
  VisitSmoothie-final-main-bb27e78/    The final app. Identical to main (commit bb27e78)
                                       of the team repository lucasnotfound59/TriMedManagement
  notes/                               Project brief for AI assistants, simplified workflow diagram
previous-versions/
  01-v1-v2-simplified-original-Oct2-3/         First and second versions, with collaboration files
  02-widescreen-polish-round2-Oct3/            Widescreen layout, second design pass
  03-celadon-ui-teammate-Oct3/                 Celadon theme by a teammate
  04-mobile-home-polish-unpushed-draft-Oct4/   Mobile layout plus an unreleased home-screen redesign
  05-teammate-main-before-final-Oct4/          The team main branch just before the final version
  other/                                       Early project overview and screenshots
```

Some file names and much of the app content are in Chinese, the app's primary language.

## Run it

Requires Node.js 24 or later.

```bash
cd final/VisitSmoothie-final-main-bb27e78
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000, or http://localhost:3000/demo/lin for the demo patient.

### API keys are not included

**This repository contains no API keys.** Before running any version, add your own keys to `.env.local`. That file is git-ignored and must never be committed.

| Variable | What to put |
|---|---|
| `GLM_API_KEY` | Your Zhipu GLM key. Also set `GLM_MODEL=glm-5`. |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | Optional. Set `AI_PROVIDER=claude` and your Anthropic key to use Claude instead. |
| `DATA_ENCRYPTION_KEY` | Leave empty. It is generated on first run. |

Without a key the app still runs. Conversations fall back to built-in rules, and photo reading is unavailable.

The versions in `previous-versions/` follow the same steps from their own folders. None of them include `node_modules`, `.next`, `.data` or `.git`.

## How it is built

| Layer | What it does | Built with |
|---|---|---|
| Interface | Capture, review, reminders | Next.js 16, React 19, Tailwind CSS 4 |
| Workflow | Routing, episode state, actions | TypeScript rules |
| Language | Intake, extraction, explanations | Zhipu GLM or Claude, with rule-based fallback |
| Storage | Isolated accounts, encrypted records | SQLite, AES-256-GCM |

## Not ready yet

- Reminders only work while the app is open.
- Voice and photo reading need a configured model key.
- English-mode safety filters are a first version.
- No clinical, usage or revenue results yet.

## Team

**Tri Team**: Joanna (product lead), Ronnie, Nancy, Robin and Lucas (engineers).
