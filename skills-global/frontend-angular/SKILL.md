---
name: frontend-angular
description: "This skill MUST be used whenever creating, modifying, or styling ANY frontend code in Angular + Ionic + Capacitor projects. This includes when the user asks to 'create a page', 'style a component', 'fix the design', 'make it look better', 'add a form', 'create a modal', 'build the UI', 'design the frontend', 'use Figma', 'implement a design', 'add styles', 'fix SCSS', 'create a component', or ANY task involving HTML templates, SCSS files, Angular components, Ionic pages, PrimeNG components, or Tailwind classes. ALWAYS trigger this skill for frontend work - never write frontend code without it."
version: 1.0.0
---

# Frontend Angular - Design System & Architecture Controller

This skill enforces a unified, centralized design system across all Angular + Ionic + Capacitor projects. It prevents style fragmentation, ensures SCSS reuse, and produces visually polished, production-grade interfaces.

## Critical Rules

1. **ONE SCSS library per project** - All styles flow from a single `src/styles/` directory. NEVER create component-level `.scss` files with standalone styles that duplicate what exists in the shared library.
2. **NEVER import external CSS/SCSS libraries** beyond the approved stack (PrimeNG, Tailwind, Ionic). No Bootstrap, no Material, no Bulma, no custom CDN fonts beyond the project's chosen typeface.
3. **All colors, spacing, radii, shadows, and typography use design tokens** from `_variables.scss`. NEVER hardcode hex values, pixel sizes, or font names directly in component SCSS.
4. **Figma is the source of truth** for design. When a Figma file/URL is provided, extract exact values (colors, spacing, typography, border-radius) and map them to existing design tokens. Create new tokens only if no match exists.
5. **PrimeNG components are the UI library**. Do not recreate components that PrimeNG already provides (tables, dialogs, buttons, inputs, calendars, dropdowns, etc.).
6. **Tailwind is for utilities only** — layout, spacing, flex, grid. Never for colors, typography, or component styling (those go through SCSS tokens and PrimeNG overrides).

## Approved Tech Stack

- Angular 21 (standalone components)
- Ionic 8 + Capacitor 7
- PrimeNG 21
- Tailwind CSS 3.4 (utilities only, preflight disabled)
- SCSS with `@use` module syntax
- RxJS BehaviorSubjects (state management)
- Google Fonts (one display + one body font per project)

## SCSS Architecture (Mandatory)

Every frontend project MUST follow this structure:

```
src/
├── styles/
│   ├── _variables.scss        # Design tokens (colors, spacing, typography, shadows, radii, breakpoints)
│   ├── _mixins.scss           # Responsive mixins, card mixins, effects, scrollbar, truncate
│   ├── _theme.scss            # Ionic theme overrides (--ion-* variables)
│   ├── _prime-overrides.scss  # PrimeNG component theming via CSS variables
│   ├── _utilities.scss        # Custom utility classes + @tailwind components/utilities
│   ├── _animations.scss       # Shared keyframes and transition classes
│   ├── _typography.scss       # Font imports, text hierarchy classes
│   └── _[feature].scss        # Feature-specific styles (ONLY when complexity warrants)
├── styles.scss                # Entry point: @use imports ONLY, no direct styles
└── global.scss                # Ionic global (imports styles.scss)
```

### styles.scss Entry Point Pattern

```scss
@use 'styles/variables' as *;
@use 'styles/mixins' as *;
@use 'styles/typography';
@use 'styles/theme';
@use 'styles/prime-overrides';
@use 'styles/animations';
@use 'styles/utilities';

// Tailwind layers (AFTER all SCSS imports)
@tailwind components;
@tailwind utilities;
```

### Design Token System (references/_variables.scss)

Read `references/scss-architecture.md` for the complete token system including:
- Color palette (10-step scale per brand color + semantic colors)
- Surface system (bg, card, elevated, input, border, hover)
- Text hierarchy (primary, secondary, muted)
- Spacing scale (xs through xxxl)
- Border radius scale
- Shadow system (sm, md, lg, card, glow)
- Breakpoints (xs, sm, md, lg, xl)
- Z-index layers
- Transition speeds

### Component Styling Rules

1. **Use PrimeNG CSS variables for overrides**, not `!important` hacks:
   ```scss
   // CORRECT: Override via CSS variable
   --p-button-primary-background: #{$primary-400};

   // WRONG: Force override
   .p-button { background: #FFD700 !important; }
   ```

2. **Component SCSS files should only contain layout-specific styles**, referencing tokens:
   ```scss
   // component.scss - CORRECT
   @use 'styles/variables' as *;

   :host {
     display: block;
     padding: $spacing-md;
   }

   .feature-card {
     @include card;  // Use mixin from _mixins.scss
   }
   ```

3. **NEVER duplicate styles** — if a pattern appears in 2+ components, extract to `_mixins.scss` or `_utilities.scss`.

## Figma-to-Code Workflow

When working with Figma designs:

1. **Use Playwright MCP** to navigate and inspect the Figma file in the browser
2. **Extract design tokens**: colors, fonts, spacing, border-radius, shadows
3. **Map to existing tokens** in `_variables.scss` — find the closest match
4. **Create new tokens** ONLY if no existing token matches (within 10% tolerance)
5. **Build with PrimeNG components first** — customize via `_prime-overrides.scss`
6. **Add layout with Tailwind utilities** — flex, grid, padding, margin
7. **Add feature-specific styles** in `_[feature].scss` only for truly custom layouts
8. **Verify visually** using Playwright screenshots comparing Figma vs implementation

### Figma Inspection Commands

When inspecting Figma via browser:
- Navigate to the Figma URL
- Take screenshots of target frames/components
- Extract: fill colors, stroke colors, font family/size/weight, padding, margin, border-radius, shadows, opacity
- Map each value to the closest design token

## Visual Quality Standards

### Dark Theme (Default for most projects)
- Background: deep dark (#0D0D0F to #1A1A1A range)
- Cards: slightly elevated (#1F1F1F to #2A2A2A)
- Primary accent: project-specific (gold, violet, teal, etc.)
- Text: white primary, gray-400 secondary, gray-600 muted
- Borders: subtle (rgba white 5-10%)

### Typography
- Choose ONE display font + ONE body font from Google Fonts
- Define in `_typography.scss`, import via `<link>` in index.html
- Use font scale tokens, never hardcode sizes

### Spacing & Layout
- Mobile-first responsive design
- Ionic grid for page layout
- Tailwind flex/grid for component internals
- Consistent padding using spacing tokens
- Safe area handling for mobile (notch, home indicator)

### Animations
- Subtle and purposeful — no gratuitous motion
- Page transitions via Ionic navigation
- Micro-interactions: button press, card hover, skeleton loading
- Define shared keyframes in `_animations.scss`

## Tailwind Configuration (Mandatory)

```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  corePlugins: {
    preflight: false, // CRITICAL: Prevents breaking PrimeNG/Ionic
  },
  theme: {
    extend: {
      colors: {
        // Mirror SCSS tokens for Tailwind utility use
        primary: 'var(--app-primary)',
        surface: {
          bg: 'var(--app-surface-bg)',
          card: 'var(--app-surface-card)',
        }
      }
    }
  }
}
```

## Mobile/Ionic Patterns

### Safe Area Handling
```scss
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
}
```

### Keyboard Handling
```scss
body.keyboard-is-open {
  ion-fab, .floating-action { display: none !important; }
}
```

### Modal/Overlay Awareness
```scss
body:has(.p-overlay-mask) {
  .floating-action { display: none !important; }
}
```

## Additional Resources

### Reference Files
- **`references/scss-architecture.md`** — Complete design token system, variable definitions, mixin library, and PrimeNG override patterns
- **`references/figma-workflow.md`** — Detailed Figma inspection and token extraction workflow with Playwright MCP

### Quality Checklist

Before completing any frontend task, verify:
- [ ] No hardcoded colors, sizes, or font names
- [ ] All styles use design tokens from `_variables.scss`
- [ ] No duplicate styles across components
- [ ] PrimeNG components used where available
- [ ] Tailwind used only for layout utilities
- [ ] Mobile responsive with safe area handling
- [ ] Dark theme consistency maintained
- [ ] SCSS imports use `@use` syntax (not `@import`)
- [ ] No new external CSS/SCSS libraries added
- [ ] SonarQube compliance (see section below)

## SonarQube Compliance (Mandatory)

Every frontend change MUST comply with these rules to prevent SonarQube regressions.

### TypeScript Rules

| Rule | What | How |
|------|------|-----|
| S3776 | Cognitive complexity ≤ 15 | Extract logic to private methods |
| S3358 | No nested ternaries | Use if/else or extract to method |
| S1128 | No unused imports | Remove immediately |
| S1854 | No dead assignments | Remove `x = value` if `x` never read after |
| S6571 | Use optional chaining | `obj?.prop` not `obj && obj.prop` |
| S4325 | No unnecessary type assertions | Don't `as Type` if already that type. Keep `!` when type is `T \| undefined` but runtime guarantees non-null |
| S7773 | Use Number.parseInt/parseFloat/isNaN | Not global parseInt/parseFloat/isNaN |
| S7764 | Use globalThis | Not `window.` |
| S7781 | Use .replaceAll() for literals | Not `.replace(/literal/g, ...)` |
| S7735 | No negated ternary conditions | `!x ? a : b` → `x ? b : a` |
| S7758 | Use codePointAt/fromCodePoint | Not charCodeAt/fromCharCode |
| S2004 | No nested functions | Extract to class methods |
| S1871 | No duplicate branch code | Merge identical if/else branches |

### HTML Template Rules

| Rule | What | How |
|------|------|-----|
| MouseEvent | `(click)` needs keyboard equiv | Add `(keydown.enter)="handler()"` ONLY |
| S6819 | No `role="button"` on divs | Use `<button>` instead. NEVER add role="button" |
| S6845 | No `tabindex` on non-interactive | NEVER add `tabindex="0"` to fix accessibility |
| S6842 | No interactive roles on non-interactive | Use semantic HTML elements |
| S6853 | Form labels must be associated | Use `<label for="">` or `aria-label`. PrimeNG/Ionic: suppress in sonar-project.properties |
| S1135 | No TODO comments in templates | Remove or convert to issue tracker ticket |

### SCSS Rules

| Rule | What | How |
|------|------|-----|
| S7924 | No empty selectors | Delete `selector { }` entirely |
| S7924 | Contrast issues | Suppress via sonar-project.properties (NOSONAR doesn't work) |
| S4666 | Valid CSS properties | Check property names and values |

### Suppression in Frontend

- **TypeScript**: `// NOSONAR` at end of line
- **HTML**: `<!-- NOSONAR -->` on same line
- **SCSS**: `/* NOSONAR */` (limited effectiveness)
- **Bulk**: `front/sonar-project.properties` with `sonar.issue.ignore.multicriteria`

### Common Traps to Avoid

1. Adding `role="button"` to fix MouseEvent → creates S6819 (37 new issues in V1!)
2. Adding `tabindex="0"` to fix MouseEvent → creates S6845 (73 new issues in V1!)
3. Using `/* NOSONAR */` for CSS contrast → doesn't work, use sonar-project.properties
4. Removing `!` assertions after `.filter()` → breaks `ng build --production` with TS2322
5. Adding `(keydown.enter)` is sufficient alone for MouseEvent compliance
