# CSS Migration Plan

## Goal
- Centralize styling into shared tokens and reusable shared patterns.
- Reduce duplication across page CSS files.
- Keep mobile and desktop behavior stable while improving load performance.

## Scope Map
- Core shared system: public/css/shared.css
- Main pages: public/css/pages/index.css, public/css/pages/booking.css, public/css/pages/admin.css, public/css/pages/account.css, public/css/pages/payment-info.css
- Auth pages: public/css/pages/login.css, public/css/pages/register.css, public/css/pages/reset-password.css
- Test pages (isolate from production refactor): public/css/pages/test.css, public/css/pages/test-modules.css, public/css/pages/test-pdf-working.css, public/css/pages/whatsapp-test.css

## Phases

### Phase 1 (Started)
Expand shared CSS variable system without changing component behavior.

Planned tokens added in this phase:
- Layout container widths and paddings
- Header action button sizing
- Auth card sizing and radius
- Standard control height and touch target height
- Motion/timing aliases for common transitions

### Phase 2 (Completed)
Create shared auth primitives and migrate login/register/reset-password to consume shared classes/tokens.

Completed in this phase:
- Added shared auth primitives in `public/css/shared.css`:
	- `.auth-page`
	- `.auth-card`
	- scoped auth form, input, button, links, and mobile behavior rules
- Updated auth HTML pages to opt in via classes:
	- `public/login.html` -> `body.auth-page`, `.login-container.auth-card`
	- `public/register.html` -> `body.auth-page`, `.register-container.auth-card`
	- `public/reset-password.html` -> `body.auth-page`, `.reset-container.auth-card`
- Reduced duplication in auth page CSS files by keeping only page-unique style deltas:
	- `public/css/pages/login.css`
	- `public/css/pages/register.css`
	- `public/css/pages/reset-password.css`

### Phase 3 (Completed)
Normalize button and form sizing usage in admin/account/booking to reduce per-page overrides.

**Mobile button size constraint (DO NOT CHANGE):**
- `≤768px`: `.btn { padding: 12px 16px; font-size: 0.9em }` — intentionally compact on mobile.
- `≤480px`: `.btn { padding: 10px 14px }` — even more compact on small phones.
- These are defined in `shared.css` responsive block. Per-page CSS must never override these upward.

Completed in this phase:
- `public/css/pages/account.css`: Removed large blocks of duplicated `shared.css` rules:
  - Removed duplicate `.btn`, `.btn:hover`, `.btn:disabled`, `.btn-danger`, `.btn-danger:hover`, `.btn-secondary`, `.btn-secondary:hover` — all now inherit from shared.
  - Removed duplicate `input:focus, textarea:focus` — identical to shared.
  - Slimmed `input, textarea` override to padding-only delta (`12px` compact vs shared `14px 16px`).
  - Slimmed `input[type='checkbox']` to `accent-color` only (shared covers `width/padding/border`).
  - Slimmed `label` to `margin-bottom` delta only (`8px` vs shared `10px`).
- `public/css/pages/admin.css` and `public/css/pages/booking.css`: Reviewed — already component-scoped with no generic selector duplicates. No changes needed.

### Phase 4 (Completed)
Booking responsive hardening cleanup (simplify breakpoints, remove redundant declarations, preserve current behavior).

Completed in this phase:
- `public/css/pages/booking.css`:
  - **Fixed indentation**: Entire file was indented 8 spaces (leftover from inline `<style>` tag origin). Normalized to standard 0-indent.
  - **Removed duplicate `@keyframes spin`**: Already defined in `shared.css`.
  - **Removed duplicate `.section-header { cursor: default; }`**: Identical to `shared.css`, adds nothing.
  - **Removed duplicate `.loader` base definition**: `shared.css` covers the 20px spinner. Replaced with scoped deltas only:
    - `.timeline-loading .loader, .loading-text .loader { margin-right: 10px }` for inline spacing.
    - `.loading-content .loader` resize override (40px) retained as booking-specific.

### Phase 5 (Completed)
Performance trim pass: dead selector removal, transition tightening, duplicate declaration cleanup.

Completed in this phase:
- **Transition tightening** across `booking.css` and `account.css`:
  - Replaced 7 hardcoded `transition: all 0.3s ease` literals with `transition: var(--transition-normal)` — functionally identical but token-driven for future global tuning.
  - Affected rules: `.rental-option`, `.quantity-btn`, `.rental-checkbox`, `.payment-method`, `.payment-btn`, `.booking-card` in booking.css; `.whatsapp-btn` in account.css.
- **`index.css` indentation fixed**: Entire file was indented 8 spaces (same inline `<style>` tag origin as booking.css). Normalized to standard 0-indent.
- **Dead selectors**: None found across production CSS files.

## Regression Guardrails
- Validate widths: 360, 390, 480, 768, 900, 1200.
- Validate pages: home, booking, admin, account, login, register, reset-password, payment-info.
- Ensure no horizontal overflow in booking form date/time/select controls.
- Ensure nav/header actions remain aligned and usable on mobile.
- Verify both light and dark themes.

## Phase 1 Change Log
- Added new shared tokens in public/css/shared.css for layout, controls, header actions, and auth cards.
- No selector behavior changes in Phase 1.

## Phase 2 Change Log
- Shared auth patterns are now centralized in `public/css/shared.css`.
- Auth pages migrated to shared class-based styling.
- Auth page CSS duplication significantly reduced while preserving page-specific text/layout differences.

## Phase 4 Change Log
- booking.css: fixed indentation, removed 3 duplicate blocks (@keyframes spin, .section-header, .loader base).
- No layout or visual behavior changes.

## Phase 5 Change Log
- booking.css + account.css: 7 `transition: all 0.3s ease` replaced with `var(--transition-normal)`.
- index.css: fixed 8-space indentation.
- No dead selectors found in production CSS.

## Migration Complete
All 5 phases done. CSS is now token-driven, deduplicated, and consistently indented.
