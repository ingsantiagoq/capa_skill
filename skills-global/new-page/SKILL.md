---
name: new-page
description: "This skill should be used when the user asks to 'create a page', 'add a new page', 'new screen', 'scaffold a page', 'add a view', 'create a route', 'new Angular page', 'new Ionic page', or needs to create a new page/screen in an Angular + Ionic frontend project. Ensures standalone components, proper routing, API service integration, SCSS token usage, and PrimeNG components following the centralized design system."
version: 1.0.0
---

# New Page Scaffolding (Angular 21 + Ionic 8)

This skill creates a complete Angular + Ionic page following the established frontend architecture.

## What Gets Created

1. Standalone Angular component (page)
2. HTML template with Ionic layout + PrimeNG components
3. SCSS file using only design tokens (no hardcoded values)
4. API service (or method in existing service)
5. Route registration in app.routes.ts
6. Guard integration (if protected)

## Required Input

1. **Page name** (e.g., `create`, `feed`, `admin-moderation`)
2. **Module/feature** (e.g., `pages/create`, `pages/admin`)
3. **Route path** (e.g., `/create`, `/admin/moderation`)
4. **Protected?** (guest, authenticated, admin role?)
5. **Data source** (which API service/endpoints does it consume?)
6. **Key UI elements** (list, form, table, cards, modal, etc.)

## File Structure

```
src/app/pages/{feature}/
├── {feature}.component.ts       # Standalone component
├── {feature}.component.html     # Template
├── {feature}.component.scss     # Styles (tokens only)
└── {feature}.component.spec.ts  # Tests (optional)
```

## Component Template

```typescript
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { RouterModule } from '@angular/router';
// PrimeNG imports as needed
// import { ButtonModule } from 'primeng/button';
// import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-{feature}',
  standalone: true,
  imports: [
    CommonModule,
    IonicModule,
    RouterModule,
    // PrimeNG modules here
  ],
  templateUrl: './{feature}.component.html',
  styleUrls: ['./{feature}.component.scss']
})
export class {Feature}Component implements OnInit {
  private readonly api = inject({Feature}Service);

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    // Subscribe to API service
  }
}
```

## HTML Template Pattern

```html
<ion-header>
  <ion-toolbar>
    <ion-buttons slot="start">
      <ion-back-button defaultHref="/"></ion-back-button>
    </ion-buttons>
    <ion-title>{Page Title}</ion-title>
  </ion-toolbar>
</ion-header>

<ion-content class="ion-padding">
  <div class="page-content">
    <!-- Content here using PrimeNG + Ionic components -->
    <!-- Use design tokens via SCSS, Tailwind for layout only -->
  </div>
</ion-content>

<!-- Optional FAB -->
<ion-fab slot="fixed" vertical="bottom" horizontal="end">
  <ion-fab-button (click)="onAction()">
    <ion-icon name="add"></ion-icon>
  </ion-fab-button>
</ion-fab>
```

## SCSS Rules (CRITICAL)

```scss
// {feature}.component.scss
@use 'styles/variables' as *;
@use 'styles/mixins' as *;

// ONLY use tokens - NEVER hardcode values
:host {
  display: block;
}

.{feature}-container {
  padding: $spacing-lg;
}

.{feature}-card {
  @include card;
  @include card-hover;
  margin-bottom: $spacing-md;
}

// Responsive
@include mobile {
  .{feature}-container {
    padding: $spacing-sm;
  }
}
```

**Forbidden in component SCSS:**
- Hardcoded hex colors (`#FFD700` → use `$brand-400`)
- Hardcoded pixel sizes (`16px` → use `$spacing-lg`)
- Hardcoded font names (`'Inter'` → use `$font-body`)
- Hardcoded shadows → use `$shadow-*` tokens
- Hardcoded border-radius → use `$radius-*` tokens
- Importing external CSS libraries
- Duplicating styles that exist in global SCSS

## Route Registration

Add to `app.routes.ts`:

```typescript
// Public page
{
  path: '{route}',
  loadComponent: () => import('./pages/{feature}/{feature}.component')
    .then(m => m.{Feature}Component)
},

// Protected page (authenticated)
{
  path: '{route}',
  loadComponent: () => import('./pages/{feature}/{feature}.component')
    .then(m => m.{Feature}Component),
  canActivate: [authGuard]
},

// Admin page
{
  path: 'admin/{route}',
  loadComponent: () => import('./pages/admin/{feature}/{feature}.component')
    .then(m => m.{Feature}Component),
  canActivate: [authGuard, adminGuard]
},
```

## API Service Pattern

Create or extend in `src/app/core/services/`:

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class {Feature}Service {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/{endpoint}`;

  getAll(params?: any): Observable<any[]> {
    return this.http.get<any[]>(this.baseUrl, { params });
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/${id}`);
  }

  create(data: any): Observable<any> {
    return this.http.post<any>(this.baseUrl, data);
  }

  update(id: string, data: any): Observable<any> {
    return this.http.put<any>(`${this.baseUrl}/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
```

## Common Page Types

### List Page (PrimeNG Table)
- `<p-table>` with sorting, filtering, pagination
- Loading skeleton while fetching
- Empty state component
- Action buttons per row

### Form Page (Reactive Forms)
- `FormGroup` with validators
- PrimeNG inputs (`pInputText`, `p-dropdown`, `p-calendar`)
- Inline validation messages
- Submit button with loading state

### Detail Page
- Header with back button and actions
- Card sections for grouped data
- Related data in tabs (`p-tabview`)

### Dashboard Page
- Grid of metric cards
- Charts (if needed)
- Recent activity list

## Checklist

- [ ] Component created as standalone
- [ ] Template uses Ionic layout + PrimeNG components
- [ ] SCSS uses only design tokens (no hardcoded values)
- [ ] Route registered in app.routes.ts with lazy loading
- [ ] Guard applied if page is protected
- [ ] API service created/extended
- [ ] Responsive design (mobile-first)
- [ ] Loading states (skeleton/spinner)
- [ ] Empty states handled
- [ ] Error handling in API calls
