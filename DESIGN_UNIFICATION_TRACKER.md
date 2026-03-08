# JamRoom Design Unification Tracker

Last Updated: March 8, 2026 (Navigation/header consistency pass completed; QA and final cleanup in progress)
Owner: JamRoom Team
Scope: Unify all user and admin pages to match home page visual language with consistent layout, colors, typography, and theme behavior.
Canonical Source: This file is the single source of truth for UI unification phase status, checklist progress, and UI-specific tracking updates.

## 1. Final Needed (Definition Of Done)

The design unification will be considered complete only when all items below are done:

- All primary pages follow the same visual system as `public/index.html`.
- All pages use the same color system and layout rhythm.
- One unified font system is applied across all pages.
- Light mode and dark mode both work across all pages.
- Theme preference persists and is consistent between pages.
- Mobile-first behavior is implemented and verified on all primary pages.
- Motion is moderate and consistent (not excessive, not static).
- Admin page remains dense/functional but visually aligned with the same design system.
- Shared tokens/components are used from `public/css/shared.css` with minimal duplication in page CSS.
- No functional regressions in booking, auth, account, payment, and admin flows.

## 2. Confirmed Design Decisions

From stakeholder confirmation:

1. Match home page style and structure; add tabs/buttons where needed per page.
2. Keep same layout approach and same color direction across pages.
3. Use one unified font system across the app.
4. Moderate motion, mobile driven.
5. Mobile-first priority.
6. Keep both dark mode and light mode.
7. Migration order can be chosen by implementation team for best outcome.

## 3. Start Baseline (Current State)

What we are starting with:

- `public/css/shared.css` exists but uses older token set and does not provide complete app-wide dark mode.
- Many page CSS files still override shared styles heavily (`login.css`, `register.css`, `account.css`, `admin.css`, `booking.css`).
- Typography is inconsistent (system stacks and page-specific variations).
- Layout and spacing are not fully uniform between auth, booking, account, payment, and admin pages.
- Home page style is currently the preferred visual benchmark.

## 4. Phase Plan And Progress

Status legend: `Not Started` | `In Progress` | `Done` | `Blocked`

### Phase 0: Tracker And Scope Lock
Status: `Done`

Tasks:

- [x] Confirm design direction and constraints.
- [x] Create unified tracking document.
- [x] Define final acceptance criteria.

Output:

- This tracker file created and approved for ongoing updates.

### Phase 1: Design Foundation (Tokens, Typography, Theme)
Status: `Done`

Tasks:

- [x] Refactor `public/css/shared.css` into clear design tokens for layout, color, typography, spacing, radius, shadows, and motion.
- [x] Add unified font system and apply globally.
- [x] Add robust light and dark theme token layers.
- [x] Add theme persistence behavior (read/write theme preference).
- [x] Ensure focus, hover, disabled, and interactive states are theme-safe.

Exit Criteria:

- Shared foundation works without page regressions.
- Theme switch behavior is stable and persistent.

### Phase 2: Shared Components And Patterns
Status: `Done`

Tasks:

- [x] Standardize shell patterns: app container, section blocks, cards, tab bars, header/topbar.
- [x] Standardize form system (inputs, labels, helper text, validation styles).
- [x] Standardize action system (buttons, badge/chip styles, alerts, modals, tables).
- [x] Add mobile-first spacing and breakpoint rules consistently.

Exit Criteria:

- Reusable component classes are available and documented in CSS comments.

### Phase 3: Primary User Journey Migration
Status: `In Progress`

Migration order (best-first):

1. `public/booking.html` + `public/css/pages/booking.css`
2. `public/account.html` + `public/css/pages/account.css`
3. `public/payment-info.html` + `public/css/pages/payment-info.css`

Tasks:

- [x] Move page-specific visuals to shared classes where possible.
- [x] Keep behavior unchanged while aligning visuals.
- [ ] Validate mobile layout first, then desktop refinement.

Exit Criteria:

- End-user journey pages look unified and pass regression checks.

### Phase 4: Auth Page Migration
Status: `In Progress`

Pages:

- `public/login.html`
- `public/register.html`
- `public/reset-password.html`

Tasks:

- [x] Replace duplicated local styles with shared theme system.
- [x] Match home visual language while preserving auth simplicity.
- [ ] Verify mobile keyboard and form usability.

Exit Criteria:

- Auth pages visually and behaviorally align with app design system.

### Phase 5: Admin Page Alignment
Status: `In Progress`

Pages:

- `public/admin.html` + `public/css/pages/admin.css`

Tasks:

- [x] Align with same colors, typography, surfaces, and controls.
- [ ] Keep dense admin workflows and tab-heavy layout functional.
- [ ] Ensure dark/light consistency in tables, modals, charts, and forms.

Exit Criteria:

- Admin is clearly same product family as home/user pages.

### Phase 6: QA, Cleanup, And Sign-off
Status: `In Progress`

Tasks:

- [ ] Full visual QA in light and dark mode.
- [ ] Mobile-first QA for key breakpoints.
- [ ] Remove duplicated or conflicting CSS rules.
- [ ] Regression test critical flows: auth, booking, payment, account, admin.
- [x] Verify high-risk pages have no residual inline `style=` attributes (`admin/account/booking` now `0`).
- [x] Verify booking mode toggles and totals behavior after style and module updates.
- [ ] Final review and sign-off checklist.

Exit Criteria:

- Design is consistent, accessible, and stable across all pages.

## 5. Progress Log

| Date | Phase | Update | By |
|------|-------|--------|----|
| 2026-03-08 | Phase 0 | Scope decisions confirmed and tracker file created. | Copilot |
| 2026-03-08 | Phase 1 | Added shared design tokens, unified font, dark/light token layers, and global theme persistence with toggle wiring on primary pages. | Copilot |
| 2026-03-08 | Phase 1 | Converted `public/css/pages/booking.css` hardcoded colors/surfaces to shared tokens for light/dark consistency with no syntax errors. | Copilot |
| 2026-03-08 | Phase 4 | Converted `public/css/pages/login.css` and `public/css/pages/register.css` to shared theme tokens with no CSS diagnostics. | Copilot |
| 2026-03-08 | Phase 4 | Converted `public/css/pages/reset-password.css` to shared theme tokens and aligned interactions with common button/input/focus patterns. | Copilot |
| 2026-03-08 | Phase 3 | Converted `public/css/pages/payment-info.css` panel, status banner, QR and detail styles to shared tokens for light/dark consistency. | Copilot |
| 2026-03-08 | Phase 3 | Converted `public/css/pages/account.css` tabs, forms, cards, badges, and danger-zone surfaces to shared theme tokens (kept WhatsApp brand green accents). | Copilot |
| 2026-03-08 | Phase 3 | Removed remaining inline styles from `public/account.html` by introducing WhatsApp setup/status utility classes in `public/css/pages/account.css`. | Copilot |
| 2026-03-08 | Phase 5 | Converted `public/css/pages/admin.css` hardcoded colors/surfaces/shadows to shared theme tokens for dark/light readiness, with no CSS diagnostics. | Copilot |
| 2026-03-08 | Phase 5 | Removed remaining inline styles from script-rendered sections in `public/admin.html` (users, blocked-times, typeahead, availability timeline, rental type editor) and added class-based rules in `public/css/pages/admin.css`; diagnostics clean. | Copilot |
| 2026-03-08 | Phase 3 | Removed remaining inline styles from `public/booking.html` and booking script-rendered templates (`booking-bookings.js`, `booking-availability.js`, `booking-rentals.js`) by shifting to class-based markup in `public/css/pages/booking.css`; diagnostics clean. | Copilot |
| 2026-03-08 | Phase 2 | Unified shared navigation/header shell across core pages via `public/js/shared/navigation.js` and `public/css/shared.css`, including consistent link ordering and theme toggle placement. | Copilot |
| 2026-03-08 | Phase 2 | Added authenticated greeting line below brand/subtitle and moved header actions to right-side action group for consistent desktop/mobile hierarchy. | Copilot |
| 2026-03-08 | Phase 3 | Harmonized page spacing rhythm across booking/account/admin and fixed booking width inconsistency by removing booking-only container max-width override. | Copilot |
| 2026-03-08 | Phase 6 | Added mobile constraints for shared payment dialog/toast components to prevent overflow on narrow screens. | Copilot |
| 2026-03-08 | Phase 6 | Re-applied and re-validated key UI changes after accidental undo (header actions placement, greeting line, booking width fix). | Copilot |
| 2026-03-08 | Phase 6 | Confirmed inline `style=` cleanup state remains at zero for `public/admin.html`, `public/account.html`, and `public/booking.html`. | Copilot |

## 6. Risks And Watchouts

- Existing page CSS overrides may conflict with new shared tokens.
- Theme migration can create edge-case contrast issues in admin dense views.
- Service worker/browser cache can hide style changes during verification.
- Large inline legacy styles in some pages can slow migration if not staged.
- In-editor mobile emulation may not always reflect true device viewport behavior; real-device checks are still required before sign-off.

## 7. Update Protocol

When updating this tracker after each implementation step:

1. Update `Last Updated` date.
2. Update phase status.
3. Mark task checkboxes.
4. Add one line to `Progress Log`.
5. Note blockers/risks if discovered.
