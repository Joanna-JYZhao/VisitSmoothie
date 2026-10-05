# VisitSmoothie UI

The current visual direction follows the grouped lists of Apple Reminders: neutral gray canvas,
white groups, system typography, compact colored icons, and thin separators. The supplied
VisitSmoothie logo remains the brand asset, and wherever the logo appears the name VisitSmoothie
appears with it; there are no Apple assets or external fonts.

## Tokens

- Canvas: `#F2F2F7`; surfaces: `#FFFFFF`; dividers: `#E2E2E7`.
- Main text: `#1C1C1E`; secondary: `#56565C`; quiet text: `#66666E`.
- Main colour: celadon green from the logo, `#007866` (brand-600, white text 5.4:1; scale
  brand-50 `#EDF7F4` … brand-800 `#024D43`, ink `#0D3B40`). By the human's decision on 2026-10-04 it
  replaces the earlier main-action blue `#0066CC`: no blue anywhere (buttons, switches, links, active
  tabs, focus rings, chat bubbles, info notes). Red stays for 应急 and danger; profile icon: `#7056BF`; post icon: `#B96514`.
- Clinical warnings retain distinct red, amber, and green tones and written labels.
- System sans throughout. Body text is 17px; headings are 24–34px.
- Group radius: 12px; controls: 8–12px. White lists have no decorative shadows or gradients.
- Shared controls retain at least 44px targets, visible keyboard focus, and reduced motion support.

## Layout

- Desktop: compact list navigation at the left; one main reading area at the right.
- Phone: the same destinations form a small top toolbar; the supplied logo sits below it.
- Homepage: short pre/post entries followed by the grouped `to do & tips` list and question input.
- Profile: identity, medical information, contact details, and further actions remain grouped.
- Chat: readable plain bubbles, small suggestions, and a compact typing/voice/photo composer.
- Welcome, login, and onboarding use the same tokens and plain white groups. The optional health
  information hint and account form behavior are preserved.

Routes, account storage, clinical rules, record content, and the first-use guide are unchanged.
