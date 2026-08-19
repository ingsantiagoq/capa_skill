# SCSS Architecture Reference

Complete design token system and patterns for Angular + Ionic + PrimeNG projects.

## Table of Contents
1. [Variables Template](#variables-template)
2. [Mixins Library](#mixins-library)
3. [PrimeNG Override Patterns](#primeng-override-patterns)
4. [Typography Setup](#typography-setup)
5. [Utilities & Tailwind Integration](#utilities)
6. [Animations](#animations)
7. [Feature SCSS Guidelines](#feature-scss)

## Variables Template

This is the canonical `_variables.scss` template. Adapt brand colors per project.

```scss
// ============================================
// DESIGN TOKENS - Single Source of Truth
// ============================================

// --- Brand Palette (10-step scale) ---
// Replace $brand with project name prefix (e.g., $enf, $bks, $rt, $lqnd)
$brand-50:  #FFF9E6;
$brand-100: #FFF3CC;
$brand-200: #FFE799;
$brand-300: #FFDB66;
$brand-400: #FFD700;  // Primary
$brand-500: #E6C200;
$brand-600: #CCB000;
$brand-700: #998400;
$brand-800: #665800;
$brand-900: #332C00;

// --- Semantic Colors ---
$success:  #22C55E;
$success-light: #4ADE80;
$success-dark: #16A34A;
$warning:  #F59E0B;
$warning-light: #FBBF24;
$warning-dark: #D97706;
$error:    #EF4444;
$error-light: #F87171;
$error-dark: #DC2626;
$info:     #3B82F6;
$info-light: #60A5FA;
$info-dark: #2563EB;

// --- Surface System (Dark Theme) ---
$surface-bg:       #0D0D0F;
$surface-card:     #1A1A1E;
$surface-elevated: #222226;
$surface-input:    #16161A;
$surface-border:   rgba(255, 255, 255, 0.08);
$surface-hover:    rgba(255, 255, 255, 0.05);
$surface-active:   rgba(255, 255, 255, 0.1);
$surface-overlay:  rgba(0, 0, 0, 0.7);

// --- Text Hierarchy ---
$text-primary:   #FFFFFF;
$text-secondary: #A1A1AA;
$text-muted:     #71717A;
$text-disabled:  #52525B;
$text-inverse:   #0D0D0F;
$text-link:      $brand-400;

// --- Spacing Scale ---
$spacing-xs:   0.25rem;  // 4px
$spacing-sm:   0.5rem;   // 8px
$spacing-md:   0.75rem;  // 12px
$spacing-lg:   1rem;     // 16px
$spacing-xl:   1.25rem;  // 20px
$spacing-2xl:  1.5rem;   // 24px
$spacing-3xl:  2rem;     // 32px
$spacing-4xl:  3rem;     // 48px

// --- Border Radius ---
$radius-sm:  0.25rem;  // 4px
$radius-md:  0.5rem;   // 8px
$radius-lg:  0.75rem;  // 12px
$radius-xl:  1rem;     // 16px
$radius-2xl: 1.5rem;   // 24px
$radius-full: 9999px;

// --- Shadows ---
$shadow-sm:   0 1px 2px 0 rgba(0, 0, 0, 0.5);
$shadow-md:   0 4px 6px -1px rgba(0, 0, 0, 0.5);
$shadow-lg:   0 10px 15px -3px rgba(0, 0, 0, 0.5);
$shadow-xl:   0 20px 25px -5px rgba(0, 0, 0, 0.5);
$shadow-card: 0 2px 8px rgba(0, 0, 0, 0.4);
$shadow-glow: 0 0 20px rgba($brand-400, 0.15);

// --- Breakpoints ---
$bp-xs:  375px;
$bp-sm:  640px;
$bp-md:  768px;
$bp-lg:  1024px;
$bp-xl:  1280px;

// --- Z-Index Layers ---
$z-dropdown:  1000;
$z-sticky:    1020;
$z-fixed:     1030;
$z-modal-bg:  1040;
$z-modal:     1050;
$z-popover:   1060;
$z-tooltip:   1070;
$z-toast:     1080;

// --- Transitions ---
$transition-fast:   150ms ease;
$transition-normal: 250ms ease;
$transition-slow:   350ms ease;

// --- Typography ---
$font-display: 'Playfair Display', serif;
$font-body:    'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

$font-size-xs:   0.75rem;   // 12px
$font-size-sm:   0.875rem;  // 14px
$font-size-base: 1rem;      // 16px
$font-size-lg:   1.125rem;  // 18px
$font-size-xl:   1.25rem;   // 20px
$font-size-2xl:  1.5rem;    // 24px
$font-size-3xl:  1.875rem;  // 30px
$font-size-4xl:  2.25rem;   // 36px

$font-weight-normal:  400;
$font-weight-medium:  500;
$font-weight-semi:    600;
$font-weight-bold:    700;

$line-height-tight:   1.25;
$line-height-normal:  1.5;
$line-height-relaxed: 1.75;

// --- CSS Custom Properties (runtime theming) ---
:root {
  --app-primary: #{$brand-400};
  --app-primary-light: #{$brand-300};
  --app-primary-dark: #{$brand-600};
  --app-surface-bg: #{$surface-bg};
  --app-surface-card: #{$surface-card};
  --app-surface-elevated: #{$surface-elevated};
  --app-surface-border: #{$surface-border};
  --app-text-primary: #{$text-primary};
  --app-text-secondary: #{$text-secondary};
  --app-font-display: #{$font-display};
  --app-font-body: #{$font-body};

  // Safe areas
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}
```

## Mixins Library

Standard `_mixins.scss`:

```scss
@use 'variables' as *;

// --- Responsive Breakpoints ---
@mixin mobile {
  @media (max-width: #{$bp-sm - 1px}) { @content; }
}
@mixin tablet {
  @media (min-width: $bp-sm) and (max-width: #{$bp-lg - 1px}) { @content; }
}
@mixin desktop {
  @media (min-width: $bp-lg) { @content; }
}
@mixin breakpoint-up($bp) {
  @media (min-width: $bp) { @content; }
}
@mixin breakpoint-down($bp) {
  @media (max-width: #{$bp - 1px}) { @content; }
}

// --- Component Mixins ---
@mixin card {
  background: $surface-card;
  border: 1px solid $surface-border;
  border-radius: $radius-lg;
  padding: $spacing-lg;
  box-shadow: $shadow-card;
  transition: all $transition-normal;
}

@mixin card-elevated {
  background: $surface-elevated;
  border: 1px solid $surface-border;
  border-radius: $radius-lg;
  padding: $spacing-lg;
  box-shadow: $shadow-md;
}

@mixin card-hover {
  &:hover {
    border-color: rgba($brand-400, 0.3);
    box-shadow: $shadow-glow;
    transform: translateY(-1px);
  }
}

// --- Text Utilities ---
@mixin text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@mixin text-truncate-lines($lines: 2) {
  display: -webkit-box;
  -webkit-line-clamp: $lines;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

// --- Scrollbar ---
@mixin scrollbar-dark {
  &::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: $radius-full;
    &:hover {
      background: rgba(255, 255, 255, 0.25);
    }
  }
}

// --- Effects ---
@mixin glow($color: $brand-400, $intensity: 0.15) {
  box-shadow: 0 0 20px rgba($color, $intensity);
  border-color: rgba($color, 0.3);
}

@mixin glass($blur: 10px, $opacity: 0.1) {
  background: rgba(255, 255, 255, $opacity);
  backdrop-filter: blur($blur);
  -webkit-backdrop-filter: blur($blur);
}

@mixin gradient-text($from: $brand-400, $to: $brand-200) {
  background: linear-gradient(135deg, $from, $to);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

// --- Layout ---
@mixin flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

@mixin flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

@mixin absolute-fill {
  position: absolute;
  inset: 0;
}

// --- Safe Area ---
@mixin safe-padding-top {
  padding-top: calc(#{$spacing-lg} + var(--safe-area-top, 0px));
}

@mixin safe-padding-bottom {
  padding-bottom: calc(#{$spacing-lg} + var(--safe-area-bottom, 0px));
}
```

## PrimeNG Override Patterns

Standard `_prime-overrides.scss`:

```scss
@use 'variables' as *;

// --- Global PrimeNG Theme Variables ---
:root {
  // Content
  --p-content-background: #{$surface-card};
  --p-content-hover-background: #{$surface-hover};
  --p-content-border-color: #{$surface-border};
  --p-content-color: #{$text-primary};

  // Primary
  --p-primary-color: #{$brand-400};
  --p-primary-contrast-color: #{$surface-bg};

  // Surface
  --p-surface-0: #{$surface-bg};
  --p-surface-50: #{$surface-card};
  --p-surface-100: #{$surface-elevated};
  --p-surface-200: #{$surface-border};

  // Text
  --p-text-color: #{$text-primary};
  --p-text-muted-color: #{$text-muted};

  // Focus
  --p-focus-ring-color: #{$brand-400};
}

// --- Buttons ---
.p-button {
  font-family: $font-body;
  font-weight: $font-weight-semi;
  border-radius: $radius-md;
  transition: all $transition-fast;

  &.p-button-primary {
    background: $brand-400;
    border-color: $brand-400;
    color: $surface-bg;

    &:hover {
      background: $brand-500;
      border-color: $brand-500;
    }
  }

  &.p-button-outlined {
    border-color: $surface-border;
    color: $text-primary;

    &:hover {
      background: $surface-hover;
      border-color: $brand-400;
      color: $brand-400;
    }
  }

  &.p-button-text {
    color: $text-secondary;
    &:hover {
      background: $surface-hover;
      color: $text-primary;
    }
  }
}

// --- Inputs ---
.p-inputtext,
.p-textarea,
.p-select {
  background: $surface-input;
  border: 1px solid $surface-border;
  color: $text-primary;
  border-radius: $radius-md;
  font-family: $font-body;

  &:focus,
  &.p-focus {
    border-color: $brand-400;
    box-shadow: 0 0 0 2px rgba($brand-400, 0.15);
  }

  &::placeholder {
    color: $text-muted;
  }
}

// --- DataTable ---
.p-datatable {
  .p-datatable-header {
    background: $surface-card;
    border-color: $surface-border;
    color: $text-primary;
  }
  .p-datatable-thead > tr > th {
    background: $surface-elevated;
    border-color: $surface-border;
    color: $text-secondary;
    font-weight: $font-weight-semi;
    font-size: $font-size-sm;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .p-datatable-tbody > tr {
    background: $surface-card;
    border-color: $surface-border;
    color: $text-primary;
    transition: background $transition-fast;

    &:hover {
      background: $surface-hover;
    }
    &.p-highlight {
      background: rgba($brand-400, 0.1);
      color: $brand-400;
    }
  }
}

// --- Dialog ---
.p-dialog {
  background: $surface-card;
  border: 1px solid $surface-border;
  border-radius: $radius-xl;
  box-shadow: $shadow-xl;

  .p-dialog-header {
    background: transparent;
    border-bottom: 1px solid $surface-border;
    color: $text-primary;
    padding: $spacing-lg $spacing-2xl;
  }
  .p-dialog-content {
    background: transparent;
    color: $text-primary;
    padding: $spacing-2xl;
  }
  .p-dialog-footer {
    background: transparent;
    border-top: 1px solid $surface-border;
    padding: $spacing-lg $spacing-2xl;
  }
}

// --- Toast ---
.p-toast {
  .p-toast-message {
    border-radius: $radius-lg;
    backdrop-filter: blur(10px);
  }
}

// --- Tabs ---
.p-tabview {
  .p-tabview-nav {
    background: transparent;
    border-bottom: 1px solid $surface-border;

    li.p-highlight .p-tabview-nav-link {
      color: $brand-400;
      border-color: $brand-400;
    }
  }
}

// --- Menu/Sidebar ---
.p-menu {
  background: $surface-card;
  border: 1px solid $surface-border;
  border-radius: $radius-lg;

  .p-menuitem-link {
    color: $text-secondary;
    &:hover {
      background: $surface-hover;
      color: $text-primary;
    }
  }
  .p-menuitem-link.p-highlight {
    color: $brand-400;
    background: rgba($brand-400, 0.1);
  }
}

// --- Badge ---
.p-badge {
  font-family: $font-body;
  font-weight: $font-weight-semi;
  &.p-badge-success { background: $success; }
  &.p-badge-warning { background: $warning; color: $surface-bg; }
  &.p-badge-danger  { background: $error; }
  &.p-badge-info    { background: $info; }
}

// --- Skeleton ---
.p-skeleton {
  background: $surface-elevated;
  &::after {
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
  }
}
```

## Typography Setup

Standard `_typography.scss`:

```scss
@use 'variables' as *;

// --- Font Import (also add <link> in index.html for performance) ---
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

// --- Base Typography ---
body {
  font-family: $font-body;
  font-size: $font-size-base;
  font-weight: $font-weight-normal;
  line-height: $line-height-normal;
  color: $text-primary;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

// --- Heading Hierarchy ---
h1, .h1 { font-size: $font-size-4xl; font-weight: $font-weight-bold; line-height: $line-height-tight; }
h2, .h2 { font-size: $font-size-3xl; font-weight: $font-weight-bold; line-height: $line-height-tight; }
h3, .h3 { font-size: $font-size-2xl; font-weight: $font-weight-semi; line-height: $line-height-tight; }
h4, .h4 { font-size: $font-size-xl;  font-weight: $font-weight-semi; line-height: $line-height-normal; }
h5, .h5 { font-size: $font-size-lg;  font-weight: $font-weight-medium; line-height: $line-height-normal; }
h6, .h6 { font-size: $font-size-base; font-weight: $font-weight-medium; line-height: $line-height-normal; }

// --- Text Classes ---
.text-display { font-family: $font-display; }
.text-body    { font-family: $font-body; }
.text-xs      { font-size: $font-size-xs; }
.text-sm      { font-size: $font-size-sm; }
.text-base    { font-size: $font-size-base; }
.text-lg      { font-size: $font-size-lg; }
.text-primary   { color: $text-primary; }
.text-secondary { color: $text-secondary; }
.text-muted     { color: $text-muted; }
.text-brand     { color: $brand-400; }
```

## Utilities

Standard `_utilities.scss`:

```scss
@use 'variables' as *;
@use 'mixins' as *;

// --- Layout Utilities ---
.container {
  width: 100%;
  max-width: $bp-xl;
  margin: 0 auto;
  padding: 0 $spacing-lg;
}

.page-content {
  padding: $spacing-2xl $spacing-lg;
  @include safe-padding-bottom;
}

// --- Status Badges ---
.badge {
  display: inline-flex;
  align-items: center;
  padding: $spacing-xs $spacing-sm;
  border-radius: $radius-full;
  font-size: $font-size-xs;
  font-weight: $font-weight-semi;

  &--success { background: rgba($success, 0.15); color: $success-light; }
  &--warning { background: rgba($warning, 0.15); color: $warning-light; }
  &--error   { background: rgba($error, 0.15);   color: $error-light; }
  &--info    { background: rgba($info, 0.15);    color: $info-light; }
  &--neutral { background: $surface-elevated;     color: $text-secondary; }
}

// --- Divider ---
.divider {
  height: 1px;
  background: $surface-border;
  margin: $spacing-lg 0;
}

// --- Scrollable Container ---
.scrollable {
  @include scrollbar-dark;
  overflow-y: auto;
}

// --- Empty State ---
.empty-state {
  @include flex-center;
  flex-direction: column;
  padding: $spacing-4xl $spacing-2xl;
  text-align: center;
  color: $text-muted;

  &__icon {
    font-size: 3rem;
    margin-bottom: $spacing-lg;
    opacity: 0.5;
  }
  &__title {
    font-size: $font-size-lg;
    font-weight: $font-weight-semi;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
  }
  &__description {
    font-size: $font-size-sm;
    max-width: 300px;
  }
}

// --- Keyboard Handling ---
body.keyboard-is-open {
  ion-fab,
  .floating-action {
    display: none !important;
  }
}

// --- Modal Awareness ---
body:has(.p-overlay-mask) {
  .floating-action {
    display: none !important;
  }
}
```

## Animations

Standard `_animations.scss`:

```scss
@use 'variables' as *;

// --- Keyframes ---
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}

@keyframes shimmer {
  0%   { background-position: -200px 0; }
  100% { background-position: calc(200px + 100%) 0; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

// --- Animation Classes ---
.animate-fade-in     { animation: fadeIn $transition-normal; }
.animate-fade-in-up  { animation: fadeInUp $transition-normal; }
.animate-fade-in-down { animation: fadeInDown $transition-normal; }
.animate-slide-right { animation: slideInRight $transition-normal; }
.animate-pulse       { animation: pulse 2s infinite; }
.animate-spin        { animation: spin 1s linear infinite; }

// --- Stagger Support ---
@for $i from 1 through 10 {
  .animate-delay-#{$i} {
    animation-delay: #{$i * 50}ms;
    animation-fill-mode: both;
  }
}

// --- Skeleton Loading ---
.skeleton {
  background: linear-gradient(90deg, $surface-elevated 25%, $surface-card 50%, $surface-elevated 75%);
  background-size: 200px 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: $radius-md;
}
```

## Feature SCSS Guidelines

Only create a `_[feature].scss` file when:
1. The feature has 5+ unique layout rules not covered by existing tokens/mixins
2. The styles are truly feature-specific and would never apply elsewhere
3. The feature has complex nested layouts that benefit from a dedicated file

Naming convention: `_feature-name.scss` (kebab-case, prefixed with underscore)

Scoping pattern:
```scss
@use 'variables' as *;
@use 'mixins' as *;

// Feature: Emotion Card Creator
.creator {
  &-container { }
  &-category-grid { }
  &-text-input { }
  &-preview { }
  &-actions { }
}
```

Always import in `styles.scss` with `@use`:
```scss
@use 'styles/creator';
```
