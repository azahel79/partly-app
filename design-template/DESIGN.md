---
name: Tactile Precision
colors:
  surface: '#fbf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#fbf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ee'
  surface-container: '#f0eee9'
  surface-container-high: '#eae8e3'
  surface-container-highest: '#e4e2dd'
  on-surface: '#1b1c19'
  on-surface-variant: '#47464d'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#78767e'
  outline-variant: '#c8c5cd'
  surface-tint: '#5c5c77'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#191930'
  on-primary-container: '#82819e'
  inverse-primary: '#c5c3e3'
  secondary: '#b90042'
  on-secondary: '#ffffff'
  secondary-container: '#e31456'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#2d004f'
  on-tertiary-container: '#a46ad5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c5c3e3'
  on-primary-fixed: '#191930'
  on-primary-fixed-variant: '#45445e'
  secondary-fixed: '#ffd9dc'
  secondary-fixed-dim: '#ffb2bb'
  on-secondary-fixed: '#400011'
  on-secondary-fixed-variant: '#910032'
  tertiary-fixed: '#f2daff'
  tertiary-fixed-dim: '#e0b6ff'
  on-tertiary-fixed: '#2d004f'
  on-tertiary-fixed-variant: '#632892'
  background: '#fbf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e4e2dd'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 56px
    fontWeight: '800'
    lineHeight: 64px
    letterSpacing: -0.03em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 38px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.005em
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system blends the structural clarity, dynamic diagonal gradient backdrops, and technical precision of modern fintech leaders with soft, modern neumorphic extrusions. Designed for sophisticated digital platforms, workflow automation tools, and modern web applications, the interface creates a tangible sense of touch and physical tactility while maintaining uncompromising legibility and digital ergonomics.

The visual direction centers on soft-molded tactile surfaces resting upon a luminous warm cream canvas (`#F6F4EF`), paired with intense brand punctuations: Partly Ink (`#14142B`) and electric Partly Pink (`#FF3168`). By combining Stripe-inspired geometric precision, clear hierarchical column layouts, and soft, dual-light pneumatic extrusions, the aesthetic feels approachable yet industrial, reliable, and premium.

## Colors

The palette leverages a specialized four-point color role architecture calibrated for pneumatic depth:

- **Primary (`#14142B` - Partly Ink):** Used for primary typography, dominant structural indicators, high-contrast actions, and deep shadow casts.
- **Secondary (`#FF3168` - Partly Pink):** High-energy accent reserved for primary action triggers, status highlights, conversion metrics, and active interactive states.
- **Tertiary (`#581C87` - Deep Violet / Magenta):** Bridges the sharp ink tone and electric pink in atmospheric background gradients, mesh glows, and intermediate active fills.
- **Neutral (`#F6F4EF` - Warm Cream Base):** The universal physical surface plane. All extruded surfaces, cards, and canvas backgrounds emerge from this precise hex code to ensure neumorphic light diffusion retains warmth.

### Functional Roles & Gradients
- **Canvas Base:** `#F6F4EF`
- **Surface Extrusion:** `#F6F4EF` (identical to canvas base to achieve true monolithic extrusion)
- **High-Light Source:** Pure white `#FFFFFF` at 70%–90% opacity (angled from top-left: 315° / -45°).
- **Deep Shadow Sink:** Partly Ink (`#14142B`) at 8%–14% opacity (angled bottom-right: 135°).
- **Atmospheric Brand Gradient:** Linear 135deg starting with electric Partly Pink (`#FF3168`), flowing through deep violet/magenta (`#581C87`), terminating in deep Partly Ink (`#14142B`).

## Typography

The type hierarchy relies entirely on **Plus Jakarta Sans**, offering a clean geometric construction with rounded counters that echo the soft pneumatic curves of the UI while maintaining high legibility. 

- **Weight Distinctions:** Headlines utilize Extra Bold (800) and Bold (700) with tight negative tracking to deliver punchy hero headers reminiscent of modern SaaS documentation and marketing platforms.
- **Readability Rules:** Body copy strictly adheres to Partly Ink (`#14142B`) with a secondary reading tier at 65% opacity. Never use low-contrast grey text against extruded surfaces; high typographic contrast counters the softness of the shadows, preventing visual fatigue.
- **Numeric & Metric Displays:** Metric dashboards and volume cards employ tabular numeric positioning with bold weights (700) for instant financial scanning.

## Layout & Spacing

The layout structure takes cues from Stripe's iconic presentation style: broad canvas margins, generous whitespace, and structured 12-column layouts that balance massive hero text blocks on the left with floating, interactive extruded cards on the right.

### Grid & Breakpoints
- **Desktop (>= 1200px):** 12-column fluid grid, max container width of 1280px, 24px (`1.5rem`) gutters, and 32px (`2rem`) margins. Content sections allow hero cards to float across split 6/6 or 7/5 column compositions.
- **Tablet (768px - 1199px):** 8-column layout, 20px gutters, and 24px margins. Slanted gradient backings rescale proportionally to support single-column stacked hierarchy.
- **Mobile (< 768px):** 4-column layout, 16px gutters, and 16px page margins. Multi-layer overlapping cards collapse into vertically ordered stacks with reduced outer shadow spread.

### Pneumatic Breathing Space
Because extruded elements depend on dual-shadow diffusion to define their boundaries, spacing tokens (`space-md`, `space-lg`, `space-xl`) must be enforced cleanly without visual crowding. Extruded surfaces require a minimum clearance of `space-md` (16px) between adjacent boundaries to keep highlights and shadows from muddying each other.

## Elevation & Depth

Elevation in this design system is driven by soft-mold neumorphic extrusions rather than hard borderlines or floating drop shadows. Depth operates along a dual axis: **Raised (Extruded)** and **Sunken (Inset)**, each tied to a fixed top-left light source.

### Light Direction Standard
- **Light Angle:** -45° (top-left to bottom-right).
- **Highlight (Top-Left):** `#FFFFFF`
- **Lowlight Shadow (Bottom-Right):** `#14142B` (Partly Ink)

### Elevation Tokens
- **Elevation Level 1 (Subtle Convex Card / Container):**
  `box-shadow: -6px -6px 16px rgba(255, 255, 255, 0.9), 6px 6px 16px rgba(20, 20, 43, 0.06);`
- **Elevation Level 2 (Floating Action Unit / Interactive Card):**
  `box-shadow: -10px -10px 24px rgba(255, 255, 255, 0.95), 10px 10px 24px rgba(20, 20, 43, 0.1);`
- **Elevation Level 3 (Hero Floating Module / Popover):**
  `box-shadow: -16px -16px 36px rgba(255, 255, 255, 1.0), 16px 16px 36px rgba(20, 20, 43, 0.14);`
- **Inset Sunken (Inputs, Depressed Buttons, Track Wells):**
  `box-shadow: inset -3px -3px 8px rgba(255, 255, 255, 0.8), inset 3px 3px 8px rgba(20, 20, 43, 0.08);`

### Dynamic Hover & State Transitions
Interactive elements elevate from Level 1 to Level 2 on pointer hover with a subtle 2px upward physical translation, then smoothly collapse into an Inset Sunken state upon active click (`:active`), creating a tactile click sensation.

## Shapes

The shape system is defined by soft, organic, continuous curvatures that feel sculpted directly into the canvas. 

- **Containers & Major Cards:** Standardize on large curvatures (`rounded-xl` or 20px–24px). Sharp angles conflict with neumorphic light gradients, whereas sweeping radii catch the directional highlight evenly along the perimeter.
- **Controls & Form Elements:** Standardize on 12px–16px corner radii to balance structural form utility with physical curvature.
- **Buttons & Tags:** Employ either soft pill profiles (`9999px`) or refined 12px radii.
- **Geometric Accents:** Small illustrative elements, toggles, and glyph nodes retain smooth teardrop or curved triangular geometries, drawing directly from the fluid rounded triangle form of the brand emblem.

## Components

### 1. Buttons
- **Primary Action Button:** Partly Ink (`#14142B`) solid fill with crisp white text (`#FFFFFF`), rounded-pill shape, padded with `12px 28px`. Hover: dynamic transform elevation and subtle Partly Pink glow accent. Active: scaled slightly (0.98).
- **Secondary Tactile Button:** Base surface color (`#F6F4EF`) with Level 1 neumorphic dual-shadows and Partly Ink label. Hover: elevates to Level 2. Active: snaps to Inset Sunken state with no upward translation.
- **Accent Button:** Solid Partly Pink (`#FF3168`) background with crisp white typography, paired with a soft magenta shadow `0px 10px 24px rgba(255, 49, 104, 0.35)`.

### 2. Form Inputs & Text Fields
- **Container:** Inset sunken neumorphic cavity (`inset -3px -3px 7px #FFFFFF, inset 3px 3px 7px rgba(20,20,43,0.08)`), surface tinted slightly to `#F1EFE9`.
- **Text & Placeholder:** Partly Ink text with 40% opacity placeholder.
- **Focus State:** Retains the inset cavity while adding a sharp 1.5px Partly Pink (`#FF3168`) border ring to satisfy clear WCAG accessibility and input clarity.

### 3. Cards & Modular Blocks
- **Dashboard / Feature Containers:** Built on Level 1 elevation with a continuous background of `#F6F4EF`.
- **Hero Floating Modals:** Multi-tiered cards featuring internal light badges, micro-metric graphs, and tabular checkout previews. Overlaid over vibrant slanted backdrop gradients with Level 3 elevation.

### 4. Chips & Category Badges
- **Tactile Filter Pill:** Extruded surface pill with high-contrast Partly Ink text.
- **Active Pill:** Inset cavity profile with solid Partly Pink text or inverted solid Partly Pink pill with inset white text.
- **Notification Badges:** Circular or pill shapes using deep magenta or pink tinted backgrounds (`rgba(255, 49, 104, 0.12)`) and saturated ink/pink text.

### 5. Checkboxes & Switches
- **Checkboxes:** 20px × 20px sunken square container (4px border-radius). Checked state fills with Partly Ink and displays a sharp white checkmark.
- **Toggle Switches:** Elongated sunken track (`44px × 24px`) with a floating circular knob (`18px`) that is extruded in Level 1 elevation. Active state moves the knob smoothly to the right while tinting the track with Partly Pink.

### 6. Data Visualizations & Trend Lines
- **Sparklines:** Fluid single-stroke curves using Partly Pink (`#FF3168`) with an ambient gradient area fill dropping to zero opacity.
- **Stat Metric Cards:** Large display numbers in Partly Ink paired with green/pink micro-pills indicating growth margins.