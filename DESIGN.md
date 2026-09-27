---
name: Partly
description: Confianza en movimiento para compartir suscripciones con claridad.
colors:
  protection-navy: "#14142b"
  protection-navy-surface: "#1b1b36"
  trust-green: "#059669"
  trust-green-deep: "#047857"
  trust-green-dark: "#064e3b"
  warm-cream: "#f6f4ef"
  warm-cream-dim: "#f2f1ee"
  clear-white: "#ffffff"
  warm-border: "#e4e1d7"
  muted-slate: "#62616d"
  night-forest: "#04100e"
  night-surface: "#0a1d19"
  night-text: "#eaf5f1"
  night-mint: "#34d399"
typography:
  display:
    fontFamily: "Bricolage Grotesque, Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(3.625rem, 5vw, 4.9375rem)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Bricolage Grotesque, Plus Jakarta Sans, sans-serif"
    fontSize: "clamp(2.6875rem, 4vw, 4.125rem)"
    fontWeight: 800
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Bricolage Grotesque, Plus Jakarta Sans, sans-serif"
    fontSize: "1.3125rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.5
  label:
    fontFamily: "Plus Jakarta Sans, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  showcase: "24px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.trust-green}"
    textColor: "{colors.clear-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.trust-green-deep}"
  button-landing-cta:
    backgroundColor: "{colors.trust-green}"
    textColor: "{colors.clear-white}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-secondary:
    backgroundColor: "{colors.warm-cream}"
    textColor: "{colors.protection-navy}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
  input-default:
    backgroundColor: "{colors.clear-white}"
    textColor: "{colors.protection-navy}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "48px"
  card-default:
    backgroundColor: "{colors.clear-white}"
    textColor: "{colors.protection-navy}"
    rounded: "{rounded.lg}"
    padding: "24px"
  chip-trust:
    backgroundColor: "{colors.warm-cream-dim}"
    textColor: "{colors.trust-green-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
---

# Design System: Partly

## Overview

**Creative North Star: "Confianza en movimiento"**

Partly combines the steadiness of a protected service with the energy of people sharing something useful. Deep navy anchors important decisions, green signals progress and trust, and warm cream keeps the experience approachable. The landing may be expressive and persuasive; authenticated surfaces become calmer and more operational while retaining the same recognizable identity.

The system is clear, agile, close, and secure. It uses confident typography, practical hierarchy, moderate rounding, and ambient depth to guide attention without appearing like a cold bank, an infantilized marketplace, or a visually saturated promotion. Motion supports comprehension and perceived responsiveness; it never obscures content or becomes the product's personality by itself.

**Key Characteristics:**

- Protective navy foundations with purposeful green signals.
- Warm, readable surfaces rather than clinical white expanses.
- Expressive marketing compositions paired with restrained product UI.
- Moderate corners by default; fully rounded shapes only when function calls for them.
- Visible focus, clear states, and reduced-motion support.

## Colors

The palette pairs protective dark neutrals with a focused trust accent and warm supporting surfaces.

### Primary

- **Trust Green** (`trust-green`): Primary actions, verified states, active navigation, progress, and positive emphasis.
- **Deep Trust Green** (`trust-green-deep`): Hover and pressed states where the primary accent needs more weight.
- **Dark Trust Green** (`trust-green-dark`): High-contrast green text and restrained dark-accent applications.

### Secondary

- **Protection Navy** (`protection-navy`): Headings, high-priority controls, brand authority, and dark action surfaces.
- **Protection Navy Surface** (`protection-navy-surface`): Secondary dark surfaces and tonal differentiation within navy areas.

### Neutral

- **Warm Cream** (`warm-cream`): Default light background and the main source of visual warmth.
- **Dimmed Cream** (`warm-cream-dim`): Recessed regions, subtle groups, and supporting surfaces.
- **Clear White** (`clear-white`): Cards, inputs, and focused content surfaces.
- **Warm Border** (`warm-border`): Quiet dividers and boundaries on light surfaces.
- **Muted Slate** (`muted-slate`): Secondary copy, metadata, and inactive navigation.
- **Night Forest**, **Night Surface**, and **Night Text**: Dark-mode foundation, raised surface, and primary text roles.
- **Night Mint** (`night-mint`): Dark-mode action and verification accent.

**The Trust Signal Rule.** Green communicates action, verified progress, protection, or a selected state; it is not general decoration.

**The Navy Anchor Rule.** Every dense or persuasive composition needs a stable navy anchor so cream and green never become visually weightless.

## Typography

**Display Font:** Bricolage Grotesque (with Plus Jakarta Sans fallback)

**Body Font:** Plus Jakarta Sans (with sans-serif fallback)

**Character:** Bricolage Grotesque gives Partly its confident, friendly voice in headings. Plus Jakarta Sans keeps product data, forms, navigation, and explanations compact and highly readable.

### Hierarchy

- **Display** (800, fluid 58–79px, 0.96 line-height): Reserved for primary landing statements and major campaign moments; tracking never exceeds `-0.04em`.
- **Headline** (800, fluid 43–66px, 0.96 line-height): Section openings and persuasive transitions.
- **Title** (800, 21px, 1.2 line-height): Card titles, product modules, and important page subsections.
- **Body** (500, 16px, 1.5 line-height): Explanations and reading copy; keep longer lines near 65–75 characters.
- **Label** (700, 12px, 0.04em letter-spacing): Controls, compact metadata, badges, and short status language.

**The Two-Voice Rule.** Bricolage speaks for meaning and momentum; Plus Jakarta Sans handles interaction and detail. Do not introduce a third UI typeface.

**The Weight Before Size Rule.** In operational screens, establish hierarchy with weight, grouping, and spacing before increasing type size.

## Layout

Marketing surfaces use a fluid centered canvas up to approximately 1480px, generous desktop gutters, asymmetrical hero compositions, and alternating light and dark sections. Authenticated product surfaces use a tighter centered canvas around 1152px so controls, status, and financial information remain scannable.

The base rhythm follows 4px increments, with 8px, 12px, 16px, 24px, and 32px as the recurring steps. Desktop sections may use substantially larger vertical intervals to separate the landing narrative. On narrow screens, multi-column scenes collapse into one readable flow, gutters reduce to 16–20px, touch targets stay at least 44px, and horizontal navigation may scroll rather than compress labels beyond recognition.

**The Two-Density Rule.** Landing pages earn generous space and composition; panel and admin pages prioritize task density without becoming cramped.

**The One-Focus Rule.** Each viewport region should have one obvious primary message or action, supported by secondary information rather than competing with it.

## Elevation & Depth

Partly uses a hybrid depth system. Marketing surfaces can use ambient gradients, soft floating layers, and selective shadows to create momentum. Product surfaces remain flatter: a fine border or tonal shift defines most containers, and stronger elevation appears only for overlays, dropdowns, active controls, or hover feedback.

### Shadow Vocabulary

- **Soft Raised:** A balanced light-and-navy shadow for small controls on cream surfaces.
- **Ambient Card:** A low, diffuse shadow paired with a one-pixel boundary for cards and grouped content.
- **Trust Lift:** A restrained green-tinted shadow for a selected or interactive card.
- **Overlay:** A deeper downward shadow for menus, dialogs, and notification panels that must clearly sit above the workspace.
- **Night Glow:** A mint border and compact glow that replaces heavy shadow on dark-mode active elements.

**The Flat-by-Default Rule.** Product cards are quiet at rest; elevation is evidence of hierarchy or interaction, not permanent decoration.

**The Ambient Marketing Rule.** Landing-page shadows should feel like atmosphere around the composition, never gray boxes stacked on gray boxes.

## Shapes

The form language is softly geometric rather than fully pill-shaped. Standard controls use gently curved 8–12px corners, product cards use confident 16px corners, and only showcase compositions may reach 24px. Circles and pills are reserved for avatars, compact chips, filters, segmented navigation, icon-only actions, and intentionally prominent landing CTAs.

Borders are generally one pixel and low contrast. Organic background shapes may be irregular, but information containers remain orderly so the product still feels dependable.

**The Necessary Circle Rule.** Use a pill or circle only when the component's behavior benefits from a compact continuous silhouette; do not round every card, field, and button to the maximum.

**The Moderate Corner Rule.** New operational components start at 12px for controls and 16px for cards unless an existing neighboring pattern establishes otherwise.

## Components

### Buttons

Buttons are direct and confident, with a stable silhouette and visible state changes.

- **Shape:** Standard product buttons and primary landing CTAs use moderate corners (12px); pills are reserved for compact controls and segmented navigation.
- **Primary:** Trust green with white text, semibold-to-bold labeling, and compact 12px × 20px padding.
- **Hover / Focus:** Deepen the green on hover, compress subtly on active, and show the established three-pixel green focus ring for keyboard navigation.
- **Secondary:** Warm cream or white with navy text and a quiet border; never compete with the primary action through equal saturation.

### Chips

- **Style:** Compact cream or pale-green surfaces with green or navy text and a fully rounded silhouette.
- **State:** Selected chips may use a stronger green tint or solid accent; pair color with text, icon, check, or count when meaning matters.

### Cards / Containers

- **Corner Style:** Moderate 16px corners for product cards; larger 18–24px corners are limited to landing showcases.
- **Background:** White over cream in light mode; forest-toned layered surfaces in dark mode.
- **Shadow Strategy:** Border-first and flat at rest in the app, ambient lift in marketing, stronger overlay shadow only when stacking is real.
- **Border:** One-pixel neutral or translucent green boundary.
- **Internal Padding:** Usually 16–24px in the app and 24–35px in larger marketing cards.

### Inputs / Fields

- **Style:** White or subtly tinted field, one-pixel border, 12–15px corners, and at least 44px height.
- **Focus:** Green border plus a soft translucent green ring; preserve a distinct text cursor and never remove the outline without replacement.
- **Error / Disabled:** Pair color with concise text or an icon; disabled states reduce emphasis but remain legible.

### Navigation

Navigation uses Plus Jakarta Sans, compact bold labels, and quiet default states. The active destination receives green color or a green-tinted surface plus a non-color cue. Public navigation may use rounded segmented links; panel navigation favors compactness, scrolling horizontally on smaller widths rather than hiding core destinations.

All public pages share one navigation and footer shell. The landing, payment guide, comparison, security, terms, and privacy routes may vary their content density, but they must keep the same brand entry points and authentication actions. Authenticated panel and administration layouts remain independent operational shells.

### Trust and Status Patterns

Verification, Partly Shield, payment review, and credential protection use a consistent combination of meaningful icon, plain-language label, and state color. Green is for safe or completed states; amber, red, blue, and neutral slate retain their semantic meanings and always include text.

### Landing Proof Pattern

The interactive product tour and five-state payment journey are the primary proof surfaces. The payment sequence is: calculated amount, direct transfer, uploaded receipt, holder review, and enabled access. Surround these with one concise explanation, one comparison, one operational trust section, representative scenarios, and one final registration CTA. Illustrative inventory, balances, prices, files, and scenarios must carry a visible demonstration label. Registration CTAs always route to account creation; they must never behave like an unlabeled waitlist.

The landing separates the buyer and plan-holder journeys before presenting detailed proof. Catalog availability and the savings calculator prefer active API data, with explicit loading, error, retry, and empty states. Static examples remain permitted only when they are visibly identified as demonstrations. Contextual links connect payment, comparison, security, and legal explanations to their dedicated public routes.

## Do's and Don'ts

### Do:

- **Do** preserve the approved Partly wordmark proportions and provide breathing room around it.
- **Do** use navy as the visual anchor and green as a purposeful trust or action signal.
- **Do** keep product cards mostly flat, with a 16px default radius and restrained borders.
- **Do** preserve visible keyboard focus, 44px touch targets, responsive reflow, and reduced-motion behavior.
- **Do** distinguish demonstrative landing content from verified product data.

### Don't:

- **Don't** turn every button, input, or card into an exaggerated pill.
- **Don't** introduce unrelated accent colors or another UI typeface.
- **Don't** rely on green alone to explain verification, payment, protection, success, or selection.
- **Don't** use heavy permanent shadows across operational screens.
- **Don't** make Partly feel like a cold bank, a childish marketplace, or a visually saturated promotion.
