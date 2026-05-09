# JamRoom Lightweight Performance Execution Plan

## Goal
Reduce initial page load time and interaction delay across Book Now, Admin, My Bookings, Account, and related pages while keeping all existing functionality intact.

## Current Architecture Findings (from code scan)

### 1. Render-blocking JS/CSS on critical pages
- Key pages load many scripts in sequence without defer, causing parse/execute blocking before interaction.
- Admin page is especially heavy due to multiple large modules and calendar libraries loaded up front.
- My Bookings and Account include large booking modules even when some views do not need all logic immediately.

### 2. Cross-page CSS is heavier than needed
- Some pages import booking page CSS even when they only need a subset of shared booking-history styles.
- This creates unnecessary CSS transfer and style calculation work.

### 3. API payload size can be larger than required
- GET /api/bookings/my-bookings currently returns full booking documents for all user bookings with no paging/field projection.
- GET /api/admin/bookings returns full booking documents in list mode, which can be costly for large history.
- List screens should receive only list fields; details should be fetched on demand.

### 4. Static delivery and caching are under-optimized
- Server currently serves static files via express.static defaults with no compression middleware.
- No explicit long-lived cache policy for stable JS/CSS assets.

### 5. Third-party libraries loaded globally even when feature is not active
- Flatpickr and FullCalendar are loaded on page load even if user never opens calendar/date-heavy flows.
- This raises JS parse and startup cost.

## Optimization Strategy

## Phase 0 - Baseline and guardrails (no behavior changes)
Objective: measure before changing.

Status: In progress (started on 2026-05-09).

Implemented baseline hooks:
- Client telemetry capture wired on major pages via /js/shared/perf-baseline.js:
  - /booking.html
  - /admin.html
  - /my-bookings.html
  - /account.html
- Server payload-size capture for list endpoints:
  - /api/bookings/my-bookings
  - /api/admin/bookings
- Metrics API for baseline snapshots:
  - POST /api/test/perf-metrics
  - GET /api/test/perf-baseline
  - DELETE /api/test/perf-baseline

How to collect baseline now:
1. Reset previous samples: DELETE /api/test/perf-baseline
2. Visit each target page (hard refresh once per page, then normal refresh)
3. Exercise list APIs by opening My Bookings and Admin Bookings
4. Fetch summary: GET /api/test/perf-baseline
5. Optional page-specific summary: GET /api/test/perf-baseline?page=booking

Tasks:
- Add simple performance telemetry for each major page:
  - FCP, LCP, TTI proxy (DOMContentLoaded + first user interaction readiness), transferred KB.
- Capture API payload sizes for:
  - /api/bookings/my-bookings
  - /api/admin/bookings
- Set target budgets:
  - Book Now JS (initial critical): <= 180 KB gzipped
  - My Bookings JS (initial critical): <= 140 KB gzipped
  - Admin JS (initial critical dashboard): <= 220 KB gzipped
  - CSS per page initial: <= 90 KB gzipped

Acceptance:
- Baseline numbers documented.
- Functional smoke tests unchanged.

## Phase 1 - Static delivery optimization (high ROI, low risk)
Objective: reduce transfer + parse time without functional changes.

Status: In progress (started on 2026-05-09).

Implemented so far:
- Added compression middleware in server startup pipeline.
- Added explicit static cache headers:
  - HTML: no-cache
  - JS/CSS/images/fonts and similar static assets: public, max-age=2592000, immutable
- Kept ETag/Last-Modified enabled for static responses.

Tasks:
- Add compression middleware (gzip + brotli where available).
- Add explicit cache policy for static assets:
  - HTML: no-cache
  - JS/CSS/images/fonts: long max-age with cache-busting version query or filename versioning.
- Keep ETag enabled.

Files:
- server.js
- Optional helper for asset versioning in HTML templates

Acceptance:
- Reduced transferred bytes for repeat visits.
- No route/function behavior changes.

## Phase 2 - Script loading model (defer + route/lazy loading)
Objective: remove render-blocking and load only what each page needs initially.

Status: In progress (step 1 started on 2026-05-09).

Implemented in step 1:
- Booking page now lazy-loads Flatpickr instead of eager script load.
- Admin page now lazy-loads FullCalendar JS/CSS only when Calendar flow initializes.
- My Bookings page no longer eagerly loads Flatpickr; slot date-pickers lazy-load it when needed.
- Account page now lazy-loads booking-related modules only when the My Bookings tab is opened.

Tasks:
- Convert non-critical scripts to defer on core pages.
- Split critical vs deferred bootstrap in each page:
  - Critical: theme, auth state bootstrap, nav shell, page skeleton.
  - Deferred: heavy feature modules after first paint.
- Lazy-load heavy libraries:
  - FullCalendar only when Calendar tab/view opens in admin.
  - Flatpickr only for views using date pickers at that moment.
- Ensure module init guards remain context-safe.

Candidate pages:
- public/admin.html
- public/booking.html
- public/my-bookings.html
- public/account.html

Acceptance:
- First paint and interaction become noticeably faster.
- No missing handlers in tab transitions.

## Phase 3 - CSS consolidation and right-sizing
Objective: reduce CSS bytes and style recalculation cost.

Tasks:
- Extract common booking-history and modal styles from booking.css into a lighter shared bookings-common.css.
- Stop loading booking.css on pages that do not need booking-create styles.
- Keep page CSS scoped and minimal:
  - booking.css for booking-create page
  - my-bookings.css + bookings-common.css for My Bookings
  - account.css + bookings-common.css for Account if needed
- Remove duplicate/unused selectors after extraction.

Acceptance:
- My Bookings and Account CSS payload reduced.
- No visual regressions in booking cards, status badges, modals.

## Phase 4 - API payload shaping and progressive data loading
Objective: cut network and JSON parse cost.

Tasks:
- Add list-mode projection and pagination to user bookings endpoint.
- Keep details endpoint (existing single booking route) for full payload modal fetch.
- For admin bookings list endpoint:
  - Return only list fields for table.
  - Fetch full booking details only when opening details/payment modal.
- Add optional query flags:
  - includeLessons=false by default for lists
  - includePricingBreakdown=false by default for lists
- Preserve backward compatibility via versioned/default-safe behavior.

Server candidates:
- routes/booking.routes.js
- routes/admin/bookings.routes.js

Client candidates:
- public/js/booking/booking-bookings.js
- public/js/admin/admin-bookings.js

Acceptance:
- List API response size reduced significantly.
- Detail modal still shows complete data via on-demand fetch.

## Phase 5 - Admin page decomposition (largest long-term gain)
Objective: reduce admin startup parse/execute cost.

Tasks:
- Move remaining large inline admin logic into route-specific modules (if any remains).
- Load feature bundles only when corresponding tab is opened:
  - bookings
  - users
  - revenue
  - settings
  - calendar
- Keep dashboard shell lightweight.

Acceptance:
- Admin first load improves even with full feature parity.
- No regressions in cross-tab actions.

## Phase 6 - Data freshness with cache safety
Objective: keep speed gains without stale-data bugs.

Tasks:
- Use stale-while-revalidate strategy for low-risk public settings reads.
- Keep auth-sensitive calls strict no-store where required.
- Add cache invalidation hooks after admin setting changes.

Acceptance:
- Fast follow-up loads.
- Updated settings reflected predictably after admin edits.

## Functional Safety Rules (must keep behavior intact)
- Do not remove booking validations, status transitions, payment tracking, or notification logic.
- Keep existing role checks and auth middleware unchanged.
- Keep current booking mode semantics:
  - hourly: start/end and duration logic
  - perday: pickup/return flow
  - flat-rate session/track: no hourly range UI
- Keep rejected status payment-visibility behavior as currently implemented.

## Recommended Execution Order
1. Phase 0 baseline
2. Phase 1 static compression/cache
3. Phase 2 defer/lazy script loading
4. Phase 3 CSS extraction/right-sizing
5. Phase 4 API payload shaping
6. Phase 5 admin decomposition
7. Phase 6 cache freshness tuning

## Verification Matrix for each phase
- Smoke tests:
  - Booking create (hourly/perday/flat-rate categories)
  - Payment popup actions and close behavior
  - My Bookings details modal
  - Admin approve/reject/edit/payment update flows
- Performance checks:
  - transferred KB
  - FCP/LCP
  - time to first interactive action
- Regression checks:
  - status and payment status display rules
  - no missing controls after deferred/lazy load

## Expected Outcome
- Faster initial render and earlier interactivity on all major pages.
- Lower bandwidth and lower JS/CSS parse cost.
- Preserved full functionality and behavior parity.
