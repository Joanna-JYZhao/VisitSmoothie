# 青瓷绿健康手账 — the celadon health notebook

This is the visual direction of the patient app, ported onto the newest functional base
(`e22bcf5` = a sanitized snapshot of `origin/yiban-patient` `e5890ba`: the server-side encrypted
accounts and storage, the auth routes, the newest pages and flows).

**Everything functional comes from that base and is untouched.** This document describes only what
was re-skinned: the token layer, the materials, the brand lockup, and the one screen the user asked
to simplify. No route, form field, validation rule, handler, state machine, storage call, clinical
rule, copy string or DOM order was changed, except the two things the user explicitly authorised:
the left column of 建档 and the header brand.

## 1. The idea

A patient keeps a notebook: what hurts, what the doctor said, what to do next. So the page is
jade-white paper, the text is forest-green ink, the controls are ruled fields, and colour is spent
almost only where it means something (this is urgent / this is done / this is a link).

Three rules hold it together:

1. **One canvas, one ink, one accent.** `#F4F8F5` paper, `#173C35` ink, `#246A57` celadon glaze.
2. **Meaning colours keep their own hue** — crimson, amber, burnt sienna, bamboo, marine — none of
   them celadon, so no message can be mistaken for the brand.
3. **Structure is drawn with hairlines, not boxes.** The one heavy mark is the jade rule (§5).

The base's own design language is kept and re-tinted rather than replaced: the `material` sheets,
the lit `light` surface, the app-icon `tile-*`, the `.glass` header, the staggered `rise-*`
entrances, the `press`/`lift` hand-feel, the skeleton and spinner.

## 2. Palette

| Token | Hex | Where it is used | Measured contrast |
| --- | --- | --- | --- |
| `--color-canvas` | `#F4F8F5` | the page | ink on it: **11.30:1** |
| `--color-canvas-tint` | `#E4F0EA` | the wash behind the top of every page, and the mobile browser bar | — |
| `--color-surface` | `#FFFFFF` | cards, sheets, fields | ink on it: **12.11:1** |
| `--color-surface-2` | `#EAF1EC` | wells: list grounds, segmented tracks, quiet chips | ink-3 on it: **4.83:1** |
| `--color-surface-3` | `#DDE9E2` | the deeper step (segment tracks, skeleton) | — |
| `--color-line` | `#DFEAE4` | hairlines, dividers, card edges | decorative |
| `--color-line-strong` | `#6E9086` | the ruled edge of an input, select, secondary button, toggle track, rail discs | **3.50:1** on white, **3.27:1** on canvas, **3.05:1** on the pale well |
| `--color-ink` | `#173C35` | body text, headings | 12.11:1 / 11.30:1 |
| `--color-ink-2` | `#3D5C54` | supporting sentences, labels | **7.35:1** on white |
| `--color-ink-3` | `#4E6F66` | the quietest text and icons — still a full 4.5:1, never a faint grey | **5.54:1** on white |
| `--color-brand-50 … 800` | `#EFF6F2 … #123B31` | the celadon ramp | below |
| `--color-brand-ink` | `#123B31` | the darkest tiles | — |
| `--color-good` / `-bg` | `#2F6B2E` / `#EAF2E2` | 已完成, success toast | **6.44:1** / **5.61:1** |
| `--color-warn` / `-bg` | `#8A5A0B` / `#FBF0DC` | 待办提醒, caution | **5.92:1** / **5.24:1** |
| `--color-serious` / `-bg` | `#A6501F` / `#FBEEE6` | 尽快处理 | **5.54:1** / **4.88:1** |
| `--color-danger` / `-bg` | `#B2333C` / `#FBEEEE` | 应急, errors, destructive | **6.12:1** / **5.41:1** |
| `--color-info` / `-bg` | `#2C6079` / `#E8F1F4` | neutral notes (sample data, hints) | **6.87:1** / **5.99:1** |
| `--color-series-2` | `#C2632F` | the second line in a chart, beside celadon | hue 24° vs 164° |

Celadon ramp: `50 #EFF6F2` · `100 #DFEDE6` · `200 #C3DCCF` · `300 #9CC6B4` · `400 #5FA88E` ·
`500 #3B8A70` · `600 #246A57` · `650 #1E5A4A` · `700 #1B5346` · `800 #123B31`. White text on the
main gradient is 6.41:1 at its lightest point and 8.03:1 at its darkest; hover deepens to 700
(8.85:1). Tinted chips use 50/100 with 800 text (11.28:1). Hues stay apart on purpose — danger 356°,
serious 22°, warn 37°, good 119°, info 199°, brand 164°.

## 3. Type

No font is downloaded. Two roles, both system faces:

- **Body — `--font-sans`**, the base's system stack (SF Pro Text / PingFang SC / Microsoft YaHei …),
  unchanged. The base's five-step scale is kept: `.t-display`, `.t-title`, `.t-heading`, `.t-lead`,
  `.t-body`, `.t-number`. Nothing a patient reads is under 1rem (17px); `.t-number` stays tabular.
- **Display — `--font-serif`** (Georgia / Times New Roman for Latin, then Songti SC / STSong /
  Noto Serif SC / SimSun / 宋体 for Chinese; the browser picks per character). Applied to the two
  steps that are titles — `.t-display` and `.t-title` — and nowhere else, so `.t-heading` (45 uses:
  section titles, rows) and everything below stays in the body face. That is the whole rule: *the
  serif speaks in titles, the sans does the work.* Since §11 there is one more serif step, the small
  `.name-title` (1.5rem, 1.625rem from 640px) that sets the person's own name on the 我的档案 card.

## 4. Surfaces, edges, radii, elevation

- **Radius**: cards `--radius-card` 22px, sheets `--radius-sheet` 28px, fields 16px, pills full — the
  base's geometry, kept. The home entries are the exceptions §11 sets: the to-do card 28px, and the
  two entry rows 20px (they were 32px hero cards before that pass).
- **Edge**: 1px `--color-line` for cards and dividers; `--color-line-strong` for anything you can
  type in or press, so a control's boundary is never below 3:1 against what is behind it.
- **Elevation** — soft, green-tinted, never grey-blue: `--shadow-card`, `--shadow-card-hover`,
  `--shadow-float`, `--shadow-pill`, `--shadow-edge`, `--shadow-btn`, `--shadow-hero`,
  `--shadow-glow`, plus the base's `--shadow-inset-top` / `--shadow-raised` materials. `.material`
  is white paper with a hairline highlight on its top edge and a celadon-cooled foot;
  `.material-raised` is the one sheet that matters most on a screen; `.light` is a soft brand light
  from the top-left corner; `.tile-brand` / `.tile-ink` / `.tile-danger` are the glossy app-icon
  tiles, now celadon, deep jade and crimson.
- **Paper**: no texture and no pattern; the only background is the celadon wash that fades out
  within the first screen. Nothing is laid over text.

## 5. The signature: the jade rule

One detail, three quiet appearances — a 3px rule, gradient `brand-400 → brand-600`, always inlaid on
an edge, never a frame:

1. `.jade-edge` on the two home doors and on the 建档 registration card (its leading edge).
2. The same 2px inlay run down the inside edge of the desktop rail (`≥768px`), the notebook margin.
3. The ledger rule under the app header (`border-b border-ink/15`) and under the shared onboarding
   header (hairline + a 1px jade line).

The home to-do rows and the rail reuse the idea at their own scale, so a list reads as ruled lines of
a checklist rather than as cards inside cards.

## 6. The brand

The header lockup is the user's own artwork — `public/visit-smoothie-logo.png` (2172×724), used
exactly as supplied: never redrawn, recoloured or re-encoded. It is rendered with `next/image` and
sized by **width** — 17.5rem (≈298px) on a desktop, 12rem (≈204px) at ≤760px, 11rem (≈187px) at
≤430px (§11 shrank the two phone steps; the desktop one is unchanged) — with `height: auto`, so the
3:1 proportions hold at every width and the artwork is never stretched. Both brand anchors are
shrinkable (`min-width: 0`, no `flex: none`) and the image carries `max-width: 100%`, so where the
column is narrower than the artwork the artwork follows the column instead of widening the header;
the anchors keep a ≥44px hit height. `next/image` gets a matching `sizes`, so a phone fetches a
~240px rendition instead of the 740KB original.

`mix-blend-mode: multiply` lets the white ground take on the paper behind it instead of showing as a
white plate — and that is why the shared onboarding header carries **no entrance animation**: an
animated (filling) element is a stacking context, and a stacking context isolates blending, which
would bring the white ground back. The rest of the page still animates in.

The link keeps its `href` and its accessible name (`aria-label="Visit Smoothie"` in the shared
header, the image's `alt="VisitSmoothie"` in the app header) and keeps its keyboard focus ring. The
header's 登录 is the one element that never yields: it is `flex-shrink: 0` with `white-space: nowrap`,
so at 320px the logo gives up the width rather than the label breaking into 登 / 录.

Where the app needs a small square mark (splash, conversation, episode rows, the login card) the
celadon `LogoMark` tile is used — one mark, one meaning, instead of a second fragment of the old
wordmark next to the new lockup.

## 7. The 建档 left column (user-requested simplification)

The client asked for the whole left introduction to go. Removed: the “先认识一下你” headline, the
PATIENT PROFILE kicker, the two-step list with its tiles, and the two explanatory notes. What is left
is one quiet hint — 健康信息可跳过，之后可以补充。 — under a small 个人档案 label, and the two
existing ways out (直接登录 / 林叔：一次左膝痛（虚构）) as underlined links with 48px hit areas.

Desktop: a 180–200px column against a form capped at 740px, `justify-content: space-between` inside
the base's 1240px sheet, so the leftover width becomes quiet space rather than a wider form. ≤1050px:
180px. ≤760px: one column, and the hint becomes a single compact row above the form (the label steps
out), costing about two lines. The form, its fields, validation, the report shortcut and every
handler are the base's, untouched.

## 8. Layout and responsive behaviour

The shell is the base's: main column plus the right rail, which on phones becomes a compact row
above the content (`order-first`) and switches back to the right column at ≥768px. Its labels are
never scaled down — profile / report / 应急 / 退出登录 keep `text-base` (17px) or more and stay
≥44px tall — and the row may wrap rather than overflow at 320px. §11 narrowed the desktop column
from 238px to 170px and its two doors from 128s to ~102×102 / 102×85, which is what lets the phone
header and the phone bar give the first screen back to the page.

The base already solves the two mobile problems this project had complained about earlier: the home
to-do row wraps its reminder switch under the text on phones (`max-sm:basis-…` + `max-sm:ml-…`), and
the rail is no longer a squeezed column of tiny type. Nothing there needed re-doing.

This port adds only: the brand's width-driven sizing (above), `flex-wrap` on the header and on the
phone bar so a narrow column wraps instead of overflowing, and `.brand-logo`'s own width steps.
Everything else scales exactly as the base scales it. At 390px the phone bar fits in one row; at
320px the logo and the header wrap first, never the layout.

## 9. Accessibility, states, motion, print

- **Focus**: one rule gives every focusable element a 3px `brand-600` outline 2px clear of the
  control — **6.41:1** on white, **5.98:1** on the canvas. The base's pale `ring-brand-200` halo is
  kept *behind* it rather than replacing it: the base's `outline: none` suppression for ring users is
  deliberately gone from `globals.css`. In the logged-out screens the same crisp outline is applied
  twice over: once for every link and button, and once for the ruled fields, because the field rule
  itself carries `outline: none` at a higher specificity (0,2,1) than a shell-level focus rule
  (0,1,1) — the later `:focus-visible` rule for `:is(.onboarding-shell, .smoothie-scope) .field`
  out-specifies it (0,3,1), so a field you tab to keeps the outline; only `outline` is set there, so
  the border and halo the mouse-focus look is built from, and the layout, are untouched.
- **Tap targets**: everything tappable is at least 44px tall, and most of it is at least 48px. The
  one deliberate step down is §11's: the rail's phone pills, 应急 and 退出登录 went from 51px to
  46.75px so the phone bar stops eating the first screen — still above the 44px floor, with the type
  left at 17px. `.brand-logo` anchors stay 44px+.
- **Contrast**: the 30 representative token pairs in §2 were recomputed by hand from the tokens in
  `src/app/globals.css` with the WCAG relative-luminance formula; all meet 4.5:1 for text and 3:1 for
  edges, focus and large display glyphs.
- **States**: danger crimson, warning amber, success bamboo, info marine; disabled controls dim;
  emergency red keeps its own tile gradient.
- **Reduced motion / print**: the base's rules are kept; the jade rule is removed on paper, shadows
  are flattened, and `print-only` / `no-print` behave as before.

## 10. Scope, and what was verified

Changed for this port (presentation only): `src/app/globals.css`, `src/app/welcome/smoothie.css`,
`src/components/Logo.tsx`, `src/components/Smoothie.tsx`, `src/components/AppShell.tsx`,
`src/app/onboarding/page.tsx` (the left column and one class), `src/app/page.tsx` (one class),
`src/components/ui.tsx` (two hover hexes, one inset shadow), `src/components/chat/BodyMap.tsx`
(colour constants), `src/app/layout.tsx` (`themeColor`), `src/app/icon.svg`, the new
`public/visit-smoothie-logo.png`, and this file. **Nothing under `src/lib/`, `src/app/api/` or any
route's logic was touched.**

Verified: `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run test:unit` → **exit 0, 1485
assertions passing, 0 failing** · `npm run build` → 0 (all routes present, including the new auth
and data routes).

**Limits, stated plainly:** no browser was available in this environment, so nothing here is a claim
about how it looks — the responsive numbers are arithmetic and the values read back from the built
stylesheets. The visual result is for the reviewer's browser check. The clinical rule suite
(`test:rules`, keyless) was not re-run for this port: no file it exercises was touched.

## 11. Revision — the density pass (comfortable daily use)

The direction above is kept: the same palette, the same serif headings, the user's own lockup, the
same page order, navigation, routes, form fields, copy and clinical content. What changed is scale and
spacing only, because the first pass read as oversized in daily use: a phone spent its first screen on
the header, and the two home entries pushed the to-do list under the fold. Nothing was re-architected,
renamed, collapsed or hidden; no handler, condition, `href`, API or store call was touched, and the
home entries keep their two destinations (`/pre`, `/post`), their order, their words `pre` / `post`
and their two sentences word for word.

Values read back from the built stylesheets (1rem = 17px; Tailwind's spacing unit = 4.25px):

| Element | Before | After |
| --- | --- | --- |
| **home entries** — one compact row each, icon left / text / chevron | 32px-radius hero card, centred column, `min-h-64 sm:min-h-80`, `py-12` (272 / 340px floor, ~363px on a 390px phone and ~341px on a desktop by content) | **20px row, `min-h-25 sm:min-h-28`, `px-4 py-3.5` / `sm:px-5 sm:py-5`: ~114px at 390px, ~106px on a wider phone, 119px from 640px up** |
| home entry tile + word + sentence + arrow | 102px tile, 51px glyph, 55.25–63.75px centred word, 20.4px sentence, 25.5px corner arrow | **46.75px tile, 21.25px glyph, 25.5px word, 17px sentence, 21.25px trailing chevron** |
| home entry surface | `material-raised`, `rounded-[32px]`, 288px pool of brand light behind the tile | **`material` (thin sheet, hairline, `--shadow-card`), `rounded-[20px]`; the pool is gone from these rows** |
| desktop rail `md:w-56 → md:w-40` | 238px | **170px** |
| rail doors (`md:h-32/w-32`, `md:h-28/w-32`) | 136×136, 136×119 | **102×102 (profile), 102×85 (report)** |
| mobile bar pills / 应急 / 退出登录 (`min-h-12 → min-h-11`) | 51px | **46.75px** (still above the 44px floor, type untouched) |
| phone lockup (≤760 / ≤430) | 255px / 238px wide | **204px / 187px** (3:1 kept; desktop stays 297.5px, the PNG untouched) |
| shell main top/bottom padding (`pt-4 pb-16`) and header bottom margin (`mb-7`) | 17 / 68 / 29.75px | **12.75 / 51 / 17px** (header margin 25.5px from 640px) |
| to-do card (`min-h-48 p-5 sm:p-8`, `mt-7 pt-7`) | 204px floor, 34px inner gap | **no floor, `p-4 sm:p-6`, 21.25px** |
| /me avatar (`h-18 sm:h-20`) | 76.5 / 85px | **55.25px** (52–56px) |
| /me name (`t-display`) | 38.25–51px | **25.5 / 27.6px** via the new `.name-title`, with `overflow-wrap: anywhere` |
| /me card padding, fact rows (`px-5 py-4`) | 29.75 / 25.5, 17px rows | **21.25 / 17, 12.75px rows** |
| /me section gap (`space-y-8`) | 34px | **21.25px** (25.5px from 640px) |
| onboarding header / form card / sections | 96px header, 40–44px card padding | **84px, 32–36px, sections 24px** |
| card / hover / float / button / hero / tile glows | alpha 0.12–0.65 | **0.08–0.42 (≈30–50% lighter, hue and direction unchanged)** |

The jade rule, the palette, the three tile gradients, the type steps and the 3px celadon focus outline
are unchanged, as are the deliberate 17px+ body size and 44px+ targets. `.name-title` is a dedicated
class rather than an override of `.t-display`: `globals.css` is unlayered, so its custom classes
out-rank Tailwind utilities, and a utility could not have shrunk that heading reliably.

With the entries ~114px instead of ~363px, the to-do card starts about **429px** from the top of a
390×844 screen (bar 60.5 + header 102.7 + two rows 244.8 + the 21.25px gap), so the list and its
heading sit well inside the first viewport, and both entries still do.

Verified in this revision: `npm run typecheck` → 0 · `npm run lint` → 0 · `npm run build` → 0 (all
routes present) · `npm run test:unit` → exit 0, **1485 assertions passing, 0 failing** ·
`git diff --check` → clean.

**Not verified here:** no browser was available to me, so nothing above is a claim about how it looks.
The numbers are arithmetic on the built stylesheets; the 320 / 390 / 587 / desktop rendering is for
the reviewer's own browser pass.
