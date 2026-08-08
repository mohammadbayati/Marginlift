---
name: MarginLift
description: A Persian decision system for profitable incentive policies.
colors:
  ink: "#111418"
  ink-soft: "#343A43"
  muted: "#626A76"
  canvas: "#F4F6F8"
  surface: "#FFFFFF"
  surface-subtle: "#ECF0F3"
  line: "#D9DEE5"
  profit: "#007B5E"
  profit-bright: "#57D6AB"
  decision: "#315DDE"
  warning: "#A65A00"
  danger: "#B42318"
typography:
  display:
    fontFamily: "Estedad, Tahoma, sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 1.18
    letterSpacing: "0"
  headline:
    fontFamily: "Estedad, Tahoma, sans-serif"
    fontSize: "32px"
    fontWeight: 800
    lineHeight: 1.35
    letterSpacing: "0"
  title:
    fontFamily: "Estedad, Tahoma, sans-serif"
    fontSize: "20px"
    fontWeight: 750
    lineHeight: 1.5
    letterSpacing: "0"
  body:
    fontFamily: "Estedad, Tahoma, sans-serif"
    fontSize: "15px"
    fontWeight: 450
    lineHeight: 1.85
    letterSpacing: "0"
  label:
    fontFamily: "Estedad, Tahoma, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.6
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px 18px"
    height: "44px"
  input-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "48px"
  panel-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: MarginLift

## Overview

**Creative North Star: "The Profit Control Room"**

MarginLift feels like a calm operating room for consequential budget decisions. The public site is product-led and spacious; the authenticated product is denser, quieter, and optimized for repeated work. The interface uses familiar controls, decisive hierarchy, and real product evidence instead of decoration.

The system borrows Apple's restraint and interaction craft and Quantcast's outcome-oriented workflow, while retaining an independent Iranian B2B identity. It explicitly rejects generic AI dashboard aesthetics, decorative charting, glassmorphism, and marketing-scale typography inside the product.

**Key Characteristics:**

- Restrained neutral surfaces with a rare profit-green signal.
- One Persian sans family across product UI.
- Clear evidence labels attached to every financial estimate.
- Flat-by-default components with structural borders and minimal elevation.
- Responsive RTL layouts built with logical properties.

## Colors

The palette combines neutral operational surfaces, a dark decision anchor, profit green, and separate blue, amber, and red semantic states.

### Primary

- **Decision Ink** (`#111418`): primary actions, executive headings, and the strongest structural regions.
- **Verified Profit** (`#007B5E`): confirmed positive state, active progress, and selected evidence. It must remain rare.

### Secondary

- **Decision Blue** (`#315DDE`): focus rings, informational state, and navigational selection where green would imply financial success.
- **Signal Mint** (`#57D6AB`): highlights on dark surfaces and compact live-status indicators.

### Neutral

- **Operational Canvas** (`#F4F6F8`): application background.
- **Clean Surface** (`#FFFFFF`): primary work surfaces and forms.
- **Quiet Surface** (`#ECF0F3`): secondary navigation and grouped controls.
- **Structural Line** (`#D9DEE5`): dividers and component boundaries.
- **Operational Muted** (`#626A76`): secondary text that still meets contrast requirements.

**The Evidence Color Rule.** Green means verified value or successful readiness. It is never decorative and never applied to an uncertain estimate.

## Typography

**Display Font:** Estedad, backed by Tahoma
**Body Font:** Estedad, backed by Tahoma

**Character:** A single Persian sans family creates continuity across executive summaries, dense tables, forms, and mixed-direction data. Weight and spacing establish hierarchy; letter-spacing always remains zero for Persian text.

### Hierarchy

- **Display** (800, 64px, 1.18): public-site hero only; never used inside the dashboard.
- **Headline** (800, 32px, 1.35): public sections and major page titles.
- **Title** (750, 20px, 1.5): panel and workflow headings.
- **Body** (450, 15px, 1.85): explanatory copy with a maximum reading measure of 68 characters.
- **Label** (700, 13px, 1.6, natural case): controls, status, and compact metadata.

**The Persian Integrity Rule.** Use correct half-spaces, Persian display digits, `lang="fa"`, `dir="rtl"`, and `<bdi>` or an LTR boundary for identifiers and technical fields.

## Elevation

The product is flat by default. Depth comes from tonal layers and borders. Shadows appear only for floating navigation, dialogs, menus, and active drag or hover states.

### Shadow Vocabulary

- **Floating low** (`0 2px 8px rgba(17,20,24,.08)`): menus and sticky mobile controls.
- **Modal** (`0 16px 40px rgba(17,20,24,.16)`): dialogs only.

**The Structural Depth Rule.** A component uses a border or a shadow, not both as decoration.

## Motion

Motion explains hierarchy, progress, and system response. It never implies that an unverified estimate is more certain than it is.

- **Fast feedback:** 160ms for hover, press, and focus response.
- **Interface transition:** 320ms for forms, messages, and state changes.
- **Section reveal:** 520ms with a 45ms stagger, limited to six-item groups.
- **Data movement:** bars grow from the RTL origin only when their data is ready.
- **Loading:** continuous animation is reserved for operations that are actively waiting on the server.
- **Reduced motion:** all entrance transforms, smooth scrolling, and spinning indicators collapse to an immediate readable state.

The public site may use restrained section reveals to establish narrative rhythm. The authenticated product uses motion only for state change, progress, navigation, and fresh data. Financial numbers do not count up theatrically.

## Components

### Buttons

- **Shape:** compact rectangle with a 6px radius.
- **Primary:** Decision Ink background, white text, 44px minimum height.
- **Hover / Focus:** subtle tonal shift; a 3px Decision Blue focus ring remains visible.
- **Secondary:** white or transparent surface with one structural border.

### Chips

- **Style:** compact labels for evidence, status, or filters only.
- **State:** semantic color is tied to verified, estimated, warning, or review state; chips are not decorative categories.

### Cards / Containers

- **Corner Style:** 8px maximum.
- **Background:** Clean Surface or Quiet Surface.
- **Shadow Strategy:** flat at rest.
- **Border:** one Structural Line where separation is necessary.
- **Internal Padding:** 16px for compact panels, 24px for primary panels.

### Inputs / Fields

- **Style:** 48px minimum height, 6px radius, visible label, white background.
- **Focus:** Decision Blue border and a restrained focus halo.
- **Error / Disabled:** errors state the repair action; disabled fields retain readable contrast.

### Navigation

Desktop uses a compact right-side rail with text and familiar icons. Mobile uses a dismissible drawer and a fixed page header. Active navigation is indicated by contrast and position, never by saturated decoration.

### Decision Brief

The signature product component combines one recommended action, its expected financial effect, evidence level, and one primary next step. It is compact enough to remain above the fold.

## Do's and Don'ts

### Do:

- **Do** put the decision, financial consequence, evidence level, and next action in the first product viewport.
- **Do** use `#007B5E` only for verified value, readiness, or positive progress.
- **Do** keep dashboard cards at 8px radius or less and controls at a 44px minimum hit area.
- **Do** isolate email, CSV fields, IDs, formulas, and API terms from RTL reordering.
- **Do** keep scientific diagnostics one level below the executive summary.

### Don't:

- **Don't** build a generic AI marketing dashboard made from oversized KPI cards, purple gradients, glass surfaces, and decorative charts.
- **Don't** create a Dribbble-style e-commerce admin that prioritizes visual density over a clear decision workflow.
- **Don't** lead with Qini, CATE, model names, or statistical jargon before business impact.
- **Don't** clone Apple motifs; translate restraint, purpose, and craft into MarginLift's own system.
- **Don't** ship broken half-spaces, Latin digits in executive metrics, mirrored LTR identifiers, or inconsistent RTL alignment.
- **Don't** place a marketing hero inside the authenticated product.
- **Don't** nest cards, use side-stripe accents, gradient text, or rounded containers larger than 8px.
