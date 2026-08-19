# Figma-to-Code Workflow Reference

Detailed workflow for extracting design tokens from Figma and implementing pixel-perfect UIs.

## Figma Inspection via Playwright MCP

### Step 1: Navigate to Figma

```
1. Open the Figma URL in Playwright browser
2. Wait for the canvas to load completely
3. If login is required, ask the user for credentials or use an existing session
```

### Step 2: Screenshot Target Frames

```
1. Navigate to the specific page/frame in Figma
2. Take a full screenshot of the frame
3. If the frame is large, take section-by-section screenshots
4. Save screenshots for comparison later
```

### Step 3: Inspect Design Properties

For each element in the design, extract:

**Colors:**
- Fill colors (hex/rgba)
- Stroke colors
- Shadow colors
- Gradient stops and directions

**Typography:**
- Font family
- Font weight (400/500/600/700)
- Font size (px → rem conversion: divide by 16)
- Line height
- Letter spacing
- Text alignment

**Spacing:**
- Padding (internal)
- Margin (external)
- Gap (flex/grid gap)
- Auto-layout direction and alignment

**Shape:**
- Border radius (per corner if different)
- Border width and style
- Opacity
- Blur effects

**Layout:**
- Component dimensions (width × height)
- Constraints (fixed/hug/fill)
- Responsive behavior notes

### Step 4: Map to Design Tokens

For each extracted value, find the matching token:

```
Figma color #FFD700 → $brand-400
Figma color #1A1A1E → $surface-card
Figma padding 16px → $spacing-lg
Figma radius 12px → $radius-lg
Figma shadow 0 4px 6px → $shadow-md
Figma font 14px semi → $font-size-sm + $font-weight-semi
```

**Matching rules:**
- Color: exact hex match or within 5% brightness tolerance
- Spacing: round to nearest token value
- Radius: round to nearest token value
- Shadow: use closest shadow token
- Font: map to closest size token

**If no token matches (>10% deviation):**
1. Ask if this is intentional in the design
2. If yes, create a new token in `_variables.scss` following naming convention
3. If no, use the closest existing token

### Step 5: Build Component

Order of implementation:
1. **Structure first** — HTML template with Angular directives, Ionic components
2. **PrimeNG components** — Use existing components for tables, forms, dialogs, etc.
3. **Layout** — Tailwind utilities for flex, grid, padding, margin, gap
4. **Theming** — SCSS tokens for colors, typography, shadows via `_prime-overrides.scss`
5. **Feature styles** — Custom styles in `_[feature].scss` only if needed
6. **Responsive** — Mobile-first adjustments using breakpoint mixins

### Step 6: Visual Comparison

```
1. Take a Playwright screenshot of the implemented component
2. Compare side-by-side with the Figma screenshot
3. Check:
   - Color accuracy (exact hex match)
   - Spacing consistency (padding, margin, gap)
   - Typography match (font, size, weight, line-height)
   - Border radius match
   - Shadow accuracy
   - Responsive behavior at mobile/tablet/desktop
4. Fix discrepancies — adjust tokens or add specific overrides
5. Re-screenshot until match is within acceptable tolerance
```

## Common Figma Patterns → Implementation

### Cards
```
Figma: Auto layout, vertical, padding 20, gap 16, radius 16, fill #1A1A1E, stroke #ffffff14
Implementation: @include card; with token adjustments
```

### Buttons
```
Figma: Primary button, fill #FFD700, text #0D0D0F, radius 8, padding 12 24
Implementation: <p-button label="..." /> — styled via _prime-overrides.scss
```

### Lists/Tables
```
Figma: Rows with dividers, hover state, sortable headers
Implementation: <p-table> — styled via _prime-overrides.scss datatable section
```

### Forms
```
Figma: Input fields, labels, validation states
Implementation: Ionic <ion-input> or PrimeNG <input pInputText> — tokens handle the theme
```

### Navigation
```
Figma: Sidebar, tabs, bottom nav
Implementation: <ion-tabs>, <p-tabview>, or custom sidebar with Ionic
```

## Rem Conversion Table

| Figma (px) | SCSS Token | Rem |
|------------|------------|-----|
| 4 | $spacing-xs | 0.25rem |
| 8 | $spacing-sm | 0.5rem |
| 12 | $spacing-md | 0.75rem |
| 16 | $spacing-lg | 1rem |
| 20 | $spacing-xl | 1.25rem |
| 24 | $spacing-2xl | 1.5rem |
| 32 | $spacing-3xl | 2rem |
| 48 | $spacing-4xl | 3rem |
| 12 | $font-size-xs | 0.75rem |
| 14 | $font-size-sm | 0.875rem |
| 16 | $font-size-base | 1rem |
| 18 | $font-size-lg | 1.125rem |
| 20 | $font-size-xl | 1.25rem |
| 24 | $font-size-2xl | 1.5rem |
| 30 | $font-size-3xl | 1.875rem |
| 36 | $font-size-4xl | 2.25rem |
