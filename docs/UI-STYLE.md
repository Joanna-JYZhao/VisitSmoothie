# VisitSmoothie UI

The current visual direction follows the grouped lists of Apple Reminders: neutral gray canvas,
white groups, system typography, compact colored icons, and thin separators. The supplied
VisitSmoothie logo remains the brand asset; there are no Apple assets or external fonts.

## Tokens

- Canvas: `#F2F2F7`; surfaces: `#FFFFFF`; dividers: `#E2E2E7`.
- Main text: `#1C1C1E`; secondary: `#56565C`; quiet text: `#66666E`.
- Main action: `#0066CC`; profile icon: `#7056BF`; post icon: `#B96514`.
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
