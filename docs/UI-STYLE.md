# 青瓷绿健康手账 — the celadon health notebook

The visual direction for the patient app: a quiet jade-white notebook kept in forest-green ink, with
celadon glaze where the app needs to point at something. This file records the system — palette,
type, surfaces, the one signature detail — and the reasoning behind it. It replaces nothing: the
information architecture, wording, routes, forms, handlers and data are exactly as they were.

## 1. The idea

A patient writes down what hurts, what the doctor said, and what to do next; the app is the kept
notebook, not a dashboard. So the page is paper, the text is ink, the controls are ruled fields, and
colour is used almost only to mean something (this is urgent / this is done / this is a link).

Three rules hold the whole thing together:

1. **One canvas, one ink, one accent.** Jade-white paper (`#F4F8F5`), forest-green ink (`#173C35`),
   celadon glaze (`#246A57`). Everything else is a tint of those or a meaning colour.
2. **Meaning colours keep their own hue.** Danger, warning, success, serious and info are never
   celadon, so a red thing always reads as urgent, and a green thing never reads as "brand".
3. **Structure is drawn with hairlines, not with boxes.** Dividers, card edges and control edges are
   1px; the only heavy mark is the jade rule (below).

## 2. Palette

| Token | Hex | Where it is used | Measured contrast |
| --- | --- | --- | --- |
| `--color-canvas` | `#F4F8F5` | the page | ink on it: **11.30:1** |
| `--color-canvas-tint` | `#E4F0EA` | the wash behind the top of every page, and the mobile browser bar | — |
| `--color-surface` | `#FFFFFF` | cards, rail, fields | ink on it: **12.11:1** |
| `--color-surface-2` | `#EAF1EC` | wells: segmented tracks, quote blocks, quiet chips | ink-3 on it: **4.83:1** |
| `--color-line` | `#DFEAE4` | hairlines, dividers, card edges | decorative |
| `--color-line-strong` | `#6E9086` | the ruled edge of an input, select, secondary button, toggle track and the rail's profile/report discs | **3.50:1** on white, **3.27:1** on canvas, **3.05:1** on the pale well |
| `--color-ink` | `#173C35` | body text, headings | 12.11:1 / 11.30:1 |
| `--color-ink-2` | `#3D5C54` | supporting sentences, labels | **7.35:1** on white |
| `--color-ink-3` | `#4E6F66` | the quietest text and icons — still a full 4.5:1, never a faint grey | **5.54:1** on white |
| `--color-brand-50 … 800` | `#EFF6F2 … #123B31` | the celadon ramp (below) | see the ramp |
| `--color-good` / `-bg` | `#2F6B2E` / `#EAF2E2` | 已完成, success toast | **6.44:1** / **5.61:1** |
| `--color-warn` / `-bg` | `#8A5A0B` / `#FBF0DC` | 待办提醒, caution | **5.92:1** / **5.24:1** |
| `--color-serious` / `-bg` | `#A6501F` / `#FBEEE6` | 尽快处理 | **5.54:1** / **4.88:1** |
| `--color-danger` / `-bg` | `#B2333C` / `#FBEEEE` | 应急, errors, destructive | **6.12:1** / **5.41:1** |
| `--color-info` / `-bg` | `#2C6079` / `#E8F1F4` | neutral notes (sample data, hints) | **6.87:1** / **5.99:1** |
| `--color-series-2` | `#C2632F` | the second line in a chart, beside celadon | hue 24° vs 164° |

Every ratio above is calculated (WCAG 2.x relative luminance), not estimated; the check is
reproducible with the pair list in section 7.

**The celadon ramp.** `50 #EFF6F2` · `100 #DFEDE6` · `200 #C3DCCF` · `300 #9CC6B4` · `400 #5FA88E` ·
`500 #3B8A70` · `600 #246A57` · `650 #1E5A4A` · `700 #1B5346` · `800 #123B31`. The main button's
gradient runs 600 → 650, so white text on it is 6.41:1 at its lightest point and 8.03:1 at its
darkest; hover deepens to 700 (8.85:1). Tinted cards and chips use 50/100 with 800 text (11.28:1).
`200` is the soft focus halo; it never carries text.

## 3. Type

No font is downloaded. Two roles, both system faces:

- **Body — `--font-sans`**, the existing system stack (SF Pro Text / PingFang SC / Microsoft YaHei
  …), unchanged. Body size is unchanged too: 17px root, `text-base` for reading, `text-lg` for
  anything that must not be missed, all tap targets ≥ 48px tall.
- **Display — `--font-serif`** (Georgia / Times New Roman for Latin, then Songti SC / STSong /
  Noto Serif SC / SimSun / 宋体 for Chinese; the browser picks per character). Used with restraint,
  and only in three places: (a) the top of a page — `PageTitle`, `PageHeader`, dialog titles, the
  welcome hero and the registration card's heading; (b) the two doors of the home screen, `pre` and
  `post`. Everything below a page title — section headings, card titles, rows, buttons — stays sans
  and semibold, so the serif keeps its meaning: *this is the top of a page*. The brand itself is not
  type at all any more: it is the user's own logo artwork (see §5).

Scale in use: page title 1.65rem display semibold · hero `clamp(68px, 7.4vw, 105px)` · section 1.125rem
sans semibold · body 1rem · dense UI 0.9rem · micro labels 0.65–0.8rem. Weights: 400 body, 550–600 for
labels and headings; no black weights, no all-caps except the small Latin eyebrows that were already
in the onboarding copy.

## 4. Surfaces, edges, radii, elevation

- **Radius**: cards 20px (`--radius-card`), fields and buttons 16px, small tiles 12px, pills full.
  The welcome sheet keeps its inherited asymmetric corners (`30px 46px 32px 42px`); the login and
  registration cards now match the app's 24px → 20px card radius.
- **Edge**: 1px `--color-line` for cards and dividers; `--color-line-strong` for anything you can
  type in or press (2px in the app's fields and buttons, 1px on the rail's discs), so a control's
  boundary is never below 3:1 against what is behind it.
- **Elevation** — soft, green-tinted, never grey-black:
  - `--shadow-card`: an inset white highlight on the top edge (the glaze) plus a wide, shallow green
    shadow. The highlight is the second half of the signature: every white surface catches the light
    once, on its top edge.
  - `--shadow-float` for dialogs and toasts, `--shadow-edge` for white buttons, `--shadow-pill` for
    the selected segment, `--shadow-well` (an inset shadow) so a field reads as a shallow well in
    the paper, `--shadow-btn` / `--shadow-hero` for celadon buttons (top highlight + coloured glow).
- **Paper**: no texture image, no pattern. The only background is the celadon wash that fades out
  within the first screen. Nothing is ever laid over text.

## 5. The signature: the jade rule

One detail, repeated in exactly three ways — a 3px celadon rule, gradient from `brand-400` to
`brand-600`, always inlaid on an edge rather than framing anything:

1. **The bound edge of a surface** (`.jade-edge::before`): the two home doors and the *to do & tips*
   sheet carry it on their left edge; the welcome sheet and the registration card carry it inside
   `smoothie.css`. It is inset ~20% from each end and rounded, like the bound edge of a page.
2. **The margin of the notebook**: the right rail is the notebook's margin — a hairline border with a
   2px jade inlay just inside it, so profile / report / 应急 / 退出登录 sit in the margin the way a
   checklist sits beside a page.
3. **The ledger rule**: the app header and the onboarding header use a hairline plus a 1px jade line
   under it, instead of the old heavy black bar.

Nothing else is decorated. The list items on the home sheet reuse the rule idea at 3px in their own
meaning colour (danger / warn / celadon), so a to-do reads as a ruled line of a checklist.

**The brand.** The header lockup is the user's own artwork — `public/visit-smoothie-logo.png`
(2172×724), used exactly as supplied: never redrawn, recoloured or re-encoded. It is rendered with
`next/image` and sized by **width** — 17.5rem (≈298px) on a desktop, 15rem (≈256px) at ≤760px, 14rem (≈238px) at
≤430px — with `height: auto`, so the 3:1 proportions hold at every width and the artwork is never
stretched. Both brand anchors are shrinkable (`min-width: 0`, no `flex: none`) and the image carries
`max-width: 100%`, so where the column is narrower than the artwork — the app column is about 250px
at 390px and narrower at 320px — the artwork follows the column instead of widening the header, and
the anchors keep a ≥44px hit height. `next/image` gets a matching `sizes`, so a phone fetches a
~240px rendition rather than the 740KB original. `mix-blend-mode: multiply` lets its white ground
take on the paper behind it (the jade-white canvas, or the celadon wash at the head of a page)
instead of showing as a white rectangle, and is a no-op on white. The link keeps its `href` and its
accessible name (`aria-label="Visit Smoothie"` in the shared header, the image's `alt="VisitSmoothie"`
in the app header) and keeps its keyboard focus ring. The header's 登录 button is the one thing that
never yields: it is `flex-shrink: 0` with `white-space: nowrap`, so at 320px the logo gives up the
width (≈196px there) rather than the label breaking into 登 / 录. How large the lettering finally reads is the
browser's business: it is not asserted here.

## 6. Layout and responsive treatment

Structure is untouched: the shell is still the same flex row (main column + right rail), the home
screen is still two entry cards above the *to do & tips* sheet with the ask box under it, and the
rail still holds profile (round), report (square), 应急 and 退出登录 in that order.

**The rail never shrinks its words.** It is a patient-facing control, so its labels keep the 17.85px
they have on the desktop at every width and the margin widens instead — an earlier pass that took the
labels down to 12px on a phone was wrong and is reverted. The margin is 11rem at ≥1025px, 9.5rem at
≤1024px, 8rem at ≤760px and 6.5rem at ≤430px; “profile”, “report”, 应急 and 退出登录 each fit on one
line inside those widths, and every control stays ≥44px in both directions.

| Width | Main padding | Rail | Profile / report | Rail label type |
| --- | --- | --- | --- | --- |
| ≥ 1025px | `1.5rem 2rem 2.5rem` | 11rem | 7rem / 7×6rem | 1.05rem |
| ≤ 1024px | same | 9.5rem | 6.5rem / 6.5×5.75rem | 1.05rem |
| ≤ 760px | `1.25rem 1.25rem 2rem` | 8rem | 5.75rem / 5.75×5.25rem | 1.05rem |
| ≤ 430px | `1rem 0.85rem 1.75rem` | 6.5rem | 5rem / 5×4.5rem | 1.05rem |

**The home to-do row wraps instead of squeezing.** The single line (checkbox 3rem + sentence +
reminder switch ~7.5rem) left the sentence about two characters of room on a phone. Below 680px —
Tailwind's `sm`, 40rem at the 106.25% root — `.todo-row` becomes a two-column grid and `.todo-switch`
drops to its own row under the checkbox and the sentence. Only placement changes: markup, order,
handlers and the 19px text are untouched and the checkbox and switch keep their 51px hit areas. At
390px the sentence has ~160px, about eight characters per line.

**The onboarding column is deliberately minimal (user-requested).** The client asked for the left
introduction to go: the “先认识一下你” headline, the PATIENT PROFILE kicker, the numbered steps and
the repeated explanatory prose are removed. What is left is one quiet hint — 健康信息可跳过，之后可以
补充。 — and the two existing ways out (直接登录 / 林叔：一次左膝痛（虚构）) as compact underlined links
with 44px hit areas. Desktop: a 180–200px column against a form capped at 740px, with
`justify-content: space-between` inside the existing 1240px sheet, so the leftover width becomes
quiet space rather than a wider form. ≤1050px: 180px. ≤760px: one column, the hint becomes a single
row above the form (the tiny 个人档案 label steps out) and costs about two lines.

At 390px the rail plus padding leaves ~250px of content; the two doors are ~120px each and their
sentences wrap (CJK breaks anywhere, and `overflow-wrap: break-word` is on the body). The header may
wrap the “回首页” link under the logo rather than overflow. Desktop max-width stays `max-w-6xl` with
the rail at 11rem, so 1365px looks as before, only celadon. Long Chinese and English wrap instead of
clipping; nothing is ever `overflow: hidden` horizontally.

## 7. Accessibility, states, and what was deliberately kept

- **Focus**: one rule in `globals.css` gives every focusable element a 3px `brand-600` outline with a
  2px offset — **6.41:1** on white, **5.98:1** on the canvas, so it survives the red 应急 button and
  the celadon primary button alike. The components' existing soft `ring-brand-200` halo still fires
  behind it. Nothing was made `outline-none` without a replacement.
- **Tap targets**: ≥ 48px preferred and kept — buttons `min-h-11` (46.75px) and up, inputs 55px,
  onboarding inputs raised from 44px to 48px, and the language pill, back link and the onboarding
  column's two links all at 44px minimum height, and the app header's 回首页 keeps a 46.75px hit
  height (it measured 25.5px in the final visual check — the one control that had been left to its
  bare line box). The 应急 link stays 46.75px tall and at least 49px wide even though the red pill
  inside it is smaller, and the rail's four controls never drop below 44px in either direction.
- **Label size floor**: navigation labels are never scaled down on small screens — the rail's
  profile / report / 应急 / 退出登录, the app's 回首页, the onboarding 返回 and the header's 登录 stay
  at 1rem (17px) or more.
- **States**: danger stays crimson, warning amber, success bamboo, info marine; empty states use the
  `Notice` card, disabled controls use `opacity-50` / `bg-surface-2`, and the disabled login button
  is at 60% instead of full strength. Toasts inherit the tokens (`bg-ink`, `bg-good`, `bg-danger`).
- **Reduced motion**: `fade-up` and both pulse animations are switched off, and transitions collapse
  to 0.01ms. **Print**: the jade rule is removed, the shadows are removed, `print-only` /
  `no-print` behave exactly as before, and the printed sheet is plain ink on white.
- **Validation limit**: the responsive numbers above are read from the stylesheets the dev server
  actually serves; no browser was available in this environment, so 390px and intermediate-width
  rendering is **not** visually verified here and is left to the reviewer's browser check.
  `typecheck`, `lint` and the 1485 unit assertions are re-run after each revision; the production
  build was verified green before these presentation-only edits and is not re-run while a dev
  preview serves this worktree.
- **Unchanged on purpose**: every string, every route, every field and option, every handler, the
  localStorage data and the demo personas; the old wireframe's own distinctions (round profile vs
  square report, the black-bar layout) are kept as celadon structure rather than removed.

## 8. Reproducing the contrast check

Ratios were computed from the tokens in `src/app/globals.css` with the WCAG relative-luminance
formula, over this pair list: ink/canvas, ink/surface, ink-2/surface, ink-3/surface, ink-3/surface-2,
white/brand-600, white/brand-650, white/brand-700, brand-800/brand-50, brand-700/surface,
danger/surface, danger/danger-bg, white/danger, warn/surface, warn/warn-bg, good/surface,
good/good-bg, white/good, serious/surface, serious/serious-bg, info/surface, info/info-bg,
line-strong/surface, line-strong/canvas, line-strong/surface-2, brand-600/surface, brand-600/canvas,
brand-600/brand-50, white/ink. All 30 pairs meet their target (4.5:1 for text, 3:1 for edges, focus
and large display glyphs).
