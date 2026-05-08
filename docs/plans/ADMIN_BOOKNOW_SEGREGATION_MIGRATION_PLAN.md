# Admin And Book Now Segregation Migration Plan

Last Updated: May 6, 2026
Owner: JamRoom Team
Primary Goal: Reduce initial load cost, lower memory/runtime pressure on older phones, and separate high-change/high-weight features into smaller, maintainable surfaces.

## Goal
- Make `public/admin.html` and `public/booking.html` lighter on first load.
- Reduce the amount of JavaScript, CSS, and DOM shipped before the user actually needs it.
- Split overloaded pages into smaller responsibility-based surfaces using SOLID-oriented frontend boundaries.
- Preserve current business behavior while improving responsiveness, startup time, and maintainability.
- Create a migration sequence that can be executed incrementally without breaking booking/admin flows.

## Why This Change Is Needed
- `public/admin.html` is currently a very large multi-surface page with eager loading of multiple domains.
- `public/booking.html` is smaller in markup, but still loads several heavy booking modules even before the user interacts with all features.
- Both pages combine multiple user intents in one initial payload.
- Older phones are more sensitive to:
  - large parse/execute cost
  - large DOM trees
  - eager third-party library loading
  - multi-feature pages that bind many listeners upfront

## Current Baseline

### File Size Snapshot
- `public/admin.html`: 6518 lines, 380.1 KB
- `public/booking.html`: 266 lines, 15.4 KB
- `public/js/admin/admin-bookings.js`: 1323 lines, 73.7 KB
- `public/js/admin/admin-bookings-edit.js`: 532 lines, 31.4 KB
- `public/js/admin/admin-bookings-actions.js`: 396 lines, 18.4 KB
- `public/js/admin/admin-revenue.js`: 349 lines, 15.8 KB
- `public/js/admin/admin-calendar.js`: 117 lines, 5.1 KB
- `public/js/booking/booking-rentals.js`: 1285 lines, 57.5 KB
- `public/js/booking/booking-form.js`: 886 lines, 39.9 KB
- `public/js/booking/booking-bookings.js`: 564 lines, 32.0 KB
- `public/js/booking/booking-availability.js`: 379 lines, 17.6 KB
- `public/js/booking/booking-main.js`: 172 lines, 7.8 KB
- `public/css/pages/admin.css`: 2480 lines, 60.0 KB
- `public/css/pages/booking.css`: 1328 lines, 36.8 KB
- `public/css/shared.css`: 2067 lines, 55.1 KB

### Immediate Interpretation
- The largest single hotspot is `public/admin.html`, which still carries too much inline/UI orchestration responsibility.
- Admin bookings is effectively a subsystem, not a single page feature.
- Book Now is already partially modularized, but it still eagerly loads logic for:
  - booking form
  - rental selection
  - availability timeline
  - payment UI
  - my bookings/history rendering
- CSS is also heavy, especially for admin and booking, which increases style recalculation and render cost on older devices.

## Current State Analysis

### Admin Panel Current Shape
Current entry surface:
- `public/admin.html`

Currently eager-loaded shared assets:
- `public/js/shared/theme.js`
- `public/js/shared/utils.js`
- `public/js/shared/alerts.js`
- `public/js/shared/auth.js`
- `public/js/shared/tabs.js`
- `public/js/shared/data.js`
- `public/js/shared/quotation-billing.js`
- `public/js/shared/navigation.js`
- `public/js/client-pdf-generator.js`
- Flatpickr CDN
- FullCalendar CDN

Currently eager-loaded admin assets:
- `public/js/admin/admin-dashboard.js`
- `public/js/admin/admin-bookings.js`
- `public/js/admin/admin-bookings-actions.js`
- `public/js/admin/admin-bookings-edit.js`
- `public/js/admin/admin-calendar.js`
- `public/js/admin/admin-revenue.js`

Current admin responsibilities on one page:
- dashboard stats
- bookings management
- booking create/edit flows
- calendar view
- revenue analytics
- blocked times
- settings management with multiple inner tabs
- users management
- quotations
- deleted records

Current admin problems:
- too many product domains share one route and one HTML shell
- third-party libraries load even if their tab is never opened
- all tabs live in the same DOM tree
- large inline/admin orchestration increases parse cost and regression surface
- one admin deploy/change can affect unrelated admin areas

### Book Now Current Shape
Current entry surface:
- `public/booking.html`

Currently eager-loaded shared assets:
- `public/js/shared/theme.js`
- `public/js/shared/utils.js`
- `public/js/shared/alerts.js`
- `public/js/shared/auth.js`
- `public/js/shared/forms.js`
- `public/js/shared/payment.js`
- `public/js/shared/data.js`
- `public/js/shared/navigation.js`
- `public/js/client-pdf-generator.js`
- Flatpickr CDN

Currently eager-loaded booking assets:
- `public/js/booking/booking-availability.js`
- `public/js/booking/booking-rentals.js`
- `public/js/booking/booking-pricing.js`
- `public/js/booking/booking-payment.js`
- `public/js/booking/booking-form.js`
- `public/js/booking/booking-main.js`
- `public/js/booking/booking-bookings.js`

Current Book Now responsibilities on one page:
- catalog search/selection
- hourly booking flow
- per-day booking flow
- class plan booking flow
- date/time availability
- pricing calculation
- payment UI
- my bookings list
- class lesson tracker inside bookings
- PDF actions for booking history

Current booking problems:
- the page serves both booking creation and booking management/history
- booking history code loads even when the user only wants to create a booking
- class/per-day/hourly flows all contribute to initial complexity
- availability, payment, and history features all attach to the same lifecycle
- mobile devices pay cost for features hidden below the fold or not used in the current session

## Root Cause Summary
- The main issue is not only file size. It is responsibility concentration.
- Multiple independent user intents are bundled into single-entry surfaces.
- UI shells are acting as mini-apps without route-level separation.
- Libraries and modules are loaded by page ownership rather than by actual user task.

## SOLID-Oriented Design Principles For The Split

### Single Responsibility Principle
- Each page should serve one dominant user job.
- Example:
  - create booking
  - view my bookings
  - review revenue
  - manage blocked times
- Avoid one page being both a workspace and an archive and a settings console.

### Open/Closed Principle
- New admin domains should be added as isolated pages/modules rather than inflating `admin.html`.
- New booking flows should plug into a booking shell or route group, not expand one monolithic init path.

### Liskov Substitution Principle
- Shared widgets such as tables, filters, cards, modals, loaders, and date pickers should be reusable without requiring page-specific assumptions.

### Interface Segregation Principle
- Do not force a page to depend on APIs/functions for unrelated features.
- Example:
  - Book Now create flow should not require booking history render hooks on startup.
  - Admin revenue should not require booking edit modal logic on load.

### Dependency Inversion Principle
- Page shells should depend on thin feature contracts.
- Heavy feature modules should be loaded only when the route or tab needs them.

## Target Architecture

## Confirmed Decisions
- Admin Phase 1 shape: lightweight admin home plus separate feature pages.
- My Bookings destination: separate top-level page.
- Lesson Tracker destination: dedicated page plus entry from My Bookings.
- First admin extraction wave selected: Bookings, Users, Settings, Quotations, Deleted Records.

## Admin Target Model
Replace one overloaded admin panel with an admin shell plus feature pages.

### Recommended Route Split
- `/admin.html`
  - lightweight admin home
  - summary stats
  - quick links to admin feature pages
- `/admin-bookings.html`
  - bookings list
  - create/edit/delete booking workflows
- `/admin-calendar.html`
  - FullCalendar-only page
- `/admin-revenue.html`
  - revenue filters, exports, analytics
- `/admin-blocked-times.html`
  - block management only
- `/admin-settings.html`
  - settings sections, potentially inner tabs retained initially
- `/admin-users.html`
  - users CRUD, register user, admin grants
- `/admin-quotations.html`
  - saved quotations + quote send workflow
- `/admin-deleted-records.html`
  - deleted items restore/permanent delete flows

### Why This Split
- Most admin tasks are operationally independent.
- Different roles and different sessions use different admin tools.
- FullCalendar and quotation/PDF logic are specialized and should not penalize bookings-only admin users.

## Book Now Target Model
Keep a booking-focused shell but separate creation from management/history.

### Recommended Route Split
- `/booking.html`
  - only new booking creation flows
  - hourly/per-day/class flow selection
  - pricing and payment handoff
- `/my-bookings.html`
  - user booking history
  - cancellation
  - billing/PDF download
  - class lesson tracker
- `/lesson-tracker.html`
  - dedicated tracker route for class users
  - fast entry for scheduled lesson status and follow-up actions
- Optional later split:
  - `/book-equipment.html`
  - `/book-class.html`

### Why This Split
- “Create booking” and “manage past/current bookings” are distinct user intents.
- A user opening Book Now should not pay initial JS cost for expandable booking cards, tracker tabs, and PDF actions.

## Performance Strategy

### 1. Route-Level Segregation First
- Highest return, lowest conceptual ambiguity.
- Move independent features onto their own pages before micro-optimizing internals.

### 2. Lazy Load Heavy Libraries
- Load `FullCalendar` only on calendar page.
- Load `flatpickr` only on pages with date-picker needs.
- Load `client-pdf-generator.js` only when invoice/PDF actions are visible.
- Load quotation billing helpers only on quotation/admin billing surfaces.

### 3. Lazy Load Feature Modules By Page Intent
- Admin home should not load bookings edit logic.
- Booking create page should not load booking history renderer.

### 4. Reduce Initial DOM Weight
- Separate hidden tabs into their own documents instead of keeping everything in one page.
- Keep the initial page tree small.

### 5. Separate Data Fetching By Task
- Avoid fetching data for tabs the user never opens.
- Fetch on route entry or explicit feature activation.

### 6. CSS Segregation
- Move page-specific CSS to route-specific files.
- Keep `shared.css` for primitives and shared shells only.
- Avoid admin and booking CSS drift inside global/shared layers.

## Recommended Migration Sequence

## Phase 0: Baseline And Instrumentation
Deliverables:
- document current route/page ownership
- define page-level performance budgets
- log current startup/loading behaviors for admin and booking
- identify libraries safe for lazy loading

Success criteria:
- baselines captured for current load path
- target split approved before implementation

## Phase 1: Book Now Segregation
Deliverables:
- keep `public/booking.html` focused on booking creation only
- move My Bookings rendering from `public/booking.html` to new `public/my-bookings.html`
- move `public/js/booking/booking-bookings.js` loading to the new page
- add `public/lesson-tracker.html` as a dedicated class-user route
- load PDF/history-only dependencies on the new page only

Expected impact:
- lower startup JS on booking page
- smaller DOM and fewer listeners on booking create flow

Dependencies:
- shared auth/navigation support for new route
- booking history entry point that can mount independently

## Phase 2: Book Now Internal Split Refinement
Deliverables:
- isolate hourly/per-day/class flow adapters behind one booking page shell
- defer class-specific controls until a class category is selected
- defer per-day inventory logic until per-day mode is active
- defer payment UI logic until after successful booking creation

Expected impact:
- lower interactive cost for default booking path
- fewer unnecessary listeners and DOM updates on first render

## Phase 3: Admin Shell Extraction
Deliverables:
- reduce `public/admin.html` to a lightweight admin dashboard shell
- move current tab content into dedicated pages
- replace tab navigation with route navigation or admin subnav links

Expected impact:
- biggest structural win in maintainability and startup cost
- cleaner ownership per admin domain

## Phase 4: Admin Feature Page Rollout
Deliverables:
- create dedicated pages for:
  - bookings
  - users
  - settings
  - quotations
  - deleted records
  - calendar
  - revenue
  - blocked times
- move each page to feature-owned JS bootstrap

Expected impact:
- heavy libraries only load where used
- lower failure blast radius
- easier team iteration by subsystem

## Phase 5: Shared Contract Cleanup
Deliverables:
- replace cross-page globals with explicit shared helpers
- reduce inline wrappers inside html files
- standardize feature bootstrap contracts
- remove obsolete compatibility glue after routes stabilize

Expected impact:
- lower regression risk
- better testability and clearer boundaries

## Phase 6: CSS And Asset Budget Cleanup
Deliverables:
- split oversized route CSS further if still needed
- remove dead selectors from old combined pages
- tighten shared.css to primitives/tokens/layouts only

Expected impact:
- faster style work
- lower CSS parse/recalc cost

## Migration Tracking Board

### Track A: Book Now Route Segregation
- [ ] A1. Define final route plan for booking create vs booking history
- [ ] A2. Create `my-bookings` page shell
- [ ] A3. Move booking history bootstrapping off `booking.html`
- [ ] A4. Create dedicated `lesson-tracker` page and add entry from My Bookings
- [ ] A5. Defer PDF generation loading to booking history page only
- [ ] A6. Verify booking creation still works without history modules loaded

### Track B: Book Now Runtime Optimization
- [x] B1. Defer per-day flow logic until per-day mode selected
- [x] B2. Defer class flow UI until class category selected
- [x] B3. Defer payment UI activation until booking response returns
- [x] B4. Audit shared libs loaded on booking page for necessity

### Track C: Admin Route Segregation
- [ ] C1. Create lightweight admin home/dashboard page
- [ ] C2. Create admin bookings page
- [ ] C3. Create admin users page
- [ ] C4. Create admin settings page
- [ ] C5. Create admin quotations page
- [ ] C6. Create admin deleted records page
- [ ] C7. Create admin calendar page
- [ ] C8. Create admin revenue page
- [ ] C9. Create admin blocked times page

### Track D: Admin Runtime Optimization
- [ ] D1. Remove eager FullCalendar loading from admin home/bookings pages
- [ ] D2. Remove eager PDF/quotation dependencies from unrelated admin pages
- [ ] D3. Extract remaining inline admin orchestration from `admin.html`
- [ ] D4. Bind data loading on page entry instead of tab existence

### Track E: Shared Foundation Cleanup
- [ ] E1. Define shared page bootstrap pattern
- [ ] E2. Define shared feature contract for auth/navigation/loading/alerts
- [ ] E3. Reduce global mutable state shared across unrelated features
- [ ] E4. Remove obsolete tab-only routing assumptions from admin shell

## Page Ownership Proposal

### Admin Home
Owns:
- summary stats
- quick access tiles
- recent operational shortcuts

Must not own:
- bookings CRUD implementation
- calendar rendering
- revenue exports
- settings forms

### Admin Bookings
Owns:
- bookings list
- create/edit booking flows
- approve/reject/delete actions
- send bill

Must not own:
- full calendar
- revenue analytics
- deleted records aggregation

### Admin Calendar
Owns:
- FullCalendar
- month/week/day navigation
- event loading

Must not own:
- bookings edit modal
- revenue filters

### Admin Revenue
Owns:
- revenue filters
- summary panels
- CSV export

Must not own:
- booking edit logic
- quotation templates

### Booking Create
Owns:
- new booking form
- availability lookup
- pricing preview
- payment reveal after submit

Must not own:
- booking history
- lesson tracker
- PDF/history actions

### My Bookings
Owns:
- booking list
- class tracker
- booking actions
- PDF download/history support

Must not own:
- new booking creation form state
- catalog/rental selection

## API And Data Loading Guidance
- Keep API endpoints as-is during the first route split where possible.
- Separate frontend route split from backend API redesign to reduce risk.
- Only redesign API aggregation after frontend ownership is stabilized.
- Prefer page-specific fetches instead of one mega-loader per shell.

## Non-Regression Rules
- Do not change business rules while splitting page ownership unless required by a bug.
- Preserve existing URLs until replacement routes are live and linked.
- Keep old entry points functional until each new page is verified.
- Maintain shared auth and navigation consistency across newly created pages.

## Performance Targets
- Reduce Book Now initial JS execution cost by removing booking history code from initial load.
- Reduce Admin initial JS/CSS and DOM cost by moving non-dashboard domains off `admin.html`.
- Avoid loading third-party libraries on pages that do not render them.
- Improve first usable interaction on older Android phones.

## Success Metrics
- `public/admin.html` reduced to dashboard-shell scale rather than full admin workspace scale.
- Book Now initial route no longer loads booking history subsystem.
- Calendar library loads only on admin calendar surface.
- PDF generation loads only where billing/PDF actions exist.
- Shared/global dependencies reduced on both routes.
- No functional regressions in:
  - booking create
  - booking history actions
  - admin bookings CRUD
  - admin users/settings/revenue/calendar workflows

## Risks And Guardrails

### Risk: Breaking Existing Navigation Habits
- Guardrail: keep a lightweight admin home and strong cross-links between new admin pages.

### Risk: Duplicating Shared Logic Across New Pages
- Guardrail: centralize shared contracts in common bootstraps/helpers before copying feature code.

### Risk: Too Many New Pages Too Quickly
- Guardrail: split by highest-value domains first.
- Recommended order:
  - My Bookings
  - Lesson Tracker
  - Admin Bookings
  - Admin Users
  - Admin Settings
  - Admin Quotations
  - Admin Deleted Records
  - Remaining admin domains

### Risk: Hidden Coupling Through Globals
- Guardrail: document required globals/bootstraps before moving any feature module.

## Recommended First Implementation Scope For Today
- Finalize route split decisions.
- Start with the highest-leverage separation:
  - move My Bookings out of `booking.html`
  - add dedicated Lesson Tracker route for class users
  - reduce `admin.html` to dashboard + navigation intent
- first extracted admin pages after shell split:
  - `admin-bookings.html`
  - `admin-users.html`
  - `admin-settings.html`
  - `admin-quotations.html`
  - `admin-deleted-records.html`
- Do not attempt all pages in one pass.
- Treat today as architecture-finalization plus first migration slice approval.

## Phase 1 Execution Tracker (Detailed)

Status legend:
- `NS` = Not started
- `IP` = In progress
- `BL` = Blocked
- `DN` = Done

### Critical Path (Implementation Order)
1. P1-01 Shared bootstrap extraction
2. P1-02 Create My Bookings page shell
3. P1-03 Move booking history UI bootstrap to My Bookings page
4. P1-04 Remove My Bookings section and history module load from Book Now
5. P1-05 Add Lesson Tracker page and route link entry
6. P1-06 Regression validation and fallback hardening

### Work Packages

#### P1-01 `NS` Shared bootstrap extraction for booking-history surfaces
Outcome:
- Create a shared bootstrap for history/tracker page contexts so logic is not duplicated.

Primary files:
- `public/js/booking/booking-bookings.js`
- `public/js/booking/booking-main.js`
- `public/account.html`

Changes:
- Ensure `booking-bookings.js` can initialize without Book Now form dependencies.
- Keep existing `window.loadMyBookings` compatibility for Account page.
- Add lightweight guard checks for DOM elements specific to Book Now only.

Depends on:
- None

Acceptance checks:
- Account bookings tab still loads using existing wiring.
- No console errors when `booking-bookings.js` runs in a page without booking form.

Rollback:
- Revert only bootstrapping changes; no route/page rollback needed.

Status update:
- `DN` Completed on May 6, 2026.
- `public/js/booking/booking-bookings.js` now has safe local fallbacks for:
  - API base URL resolution
  - alert display
  - date/time formatting
  - loading overlay show/hide
  - client-side PDF generator access
- Module now exits gracefully when booking containers are absent, allowing safe reuse in route-specific pages.

#### P1-02 `NS` Create My Bookings route shell
Outcome:
- New dedicated page for booking history and class tracker.

Primary files:
- `public/my-bookings.html` (new)
- `public/css/pages/my-bookings.css` (new or reuse booking/account styles)
- `public/js/shared/navigation.js`

Changes:
- Build page shell with:
  - navigation container
  - bookings loading container
  - bookings list container
  - shared loading overlay
- Add nav entry and active-route support.

Depends on:
- P1-01

Acceptance checks:
- Route loads for authenticated users.
- Navigation highlight works for new route.

Rollback:
- Keep page file but remove nav link until ready.

Status update:
- `DN` Completed on May 6, 2026.
- Added `public/my-bookings.html` with dedicated booking-history containers.
- Added `public/js/booking/my-bookings-main.js` bootstrap.
- Added `public/css/pages/my-bookings.css` page-scoped layout styling.

#### P1-03 `NS` Move booking history module loading to new page
Outcome:
- Booking history JS, PDF actions, and class tracker load only on My Bookings route.

Primary files:
- `public/my-bookings.html`
- `public/js/booking/booking-bookings.js`
- `public/js/client-pdf-generator.js` (load location changes only)

Changes:
- Load `booking-bookings.js` on My Bookings page.
- Keep `booking-bookings.js` globally compatible for Account page reusability.
- Call `window.loadMyBookings()` on My Bookings page init.

Depends on:
- P1-01, P1-02

Acceptance checks:
- Booking history list renders and actions work on My Bookings route.
- Class tracker tab/actions render correctly.
- PDF download action works from My Bookings route.

Rollback:
- Temporarily restore `booking-bookings.js` include in `booking.html` while debugging.

Status update:
- `DN` Completed on May 6, 2026.
- `public/my-bookings.html` now loads `booking-bookings.js` and initializes via `my-bookings-main.js`.
- History render path remains compatible with `account.html` via `window.loadMyBookings`.

#### P1-04 `NS` Strip Book Now of embedded history section
Outcome:
- Book Now page focuses only on booking creation flow.

Primary files:
- `public/booking.html`
- `public/js/booking/booking-main.js`
- `public/css/pages/booking.css`

Changes:
- Remove My Bookings section markup from `booking.html`.
- Remove `booking-bookings.js` include from `booking.html`.
- Remove dead styles tied only to embedded My Bookings block.

Depends on:
- P1-03

Acceptance checks:
- Book Now create flow still works for hourly, per-day, and class booking.
- No runtime errors due to missing bookings list elements.

Rollback:
- Restore My Bookings block and script include if regressions are found.

Status update:
- `DN` Completed on May 6, 2026.
- Removed My Bookings markup block from `public/booking.html`.
- Removed `booking-bookings.js` include from `public/booking.html`.
- Updated `public/css/pages/booking.css` to single-column main layout.

#### P1-05 `NS` Lesson Tracker dedicated route
Outcome:
- Dedicated class tracker page exists, plus discoverability via My Bookings.

Primary files:
- `public/lesson-tracker.html` (new)
- `public/js/shared/navigation.js`
- `public/js/booking/booking-bookings.js` or `public/js/booking/lesson-tracker.js` (new if split)

Changes:
- Create dedicated tracker page shell.
- Reuse tracker rendering path with filtered class bookings.
- Add entry links from My Bookings and (optionally) top nav based on class-role logic.

Depends on:
- P1-03

Acceptance checks:
- Tracker page loads class bookings only.
- Tracker actions do not require Book Now page context.

Rollback:
- Keep link hidden while retaining page implementation.

Status update:
- `DN` Completed on May 6, 2026.
- Added `public/lesson-tracker.html` route shell.
- Added `public/js/booking/lesson-tracker-main.js` bootstrap.
- Added class-only filter support in `loadMyBookings(options)` and exposed `window.loadLessonTrackerBookings`.
- Added discoverability entry from My Bookings page (`Open Lesson Tracker`).

#### P1-06 `NS` Validation and hardening pass
Outcome:
- Stabilize migration slice and reduce deployment risk.

Primary files:
- `public/booking.html`
- `public/my-bookings.html`
- `public/lesson-tracker.html`
- `public/js/booking/booking-main.js`
- `public/js/booking/booking-bookings.js`
- `public/js/shared/navigation.js`

Changes:
- Null-guard any optional DOM hooks.
- Remove orphaned listeners and dead selectors.
- Confirm service-worker cache behavior does not mask moved assets.

Depends on:
- P1-04, P1-05

Acceptance checks:
- Manual smoke tests pass on:
  - Book Now create booking
  - My Bookings list/actions
  - Lesson Tracker route
  - Account bookings tab
- No new editor diagnostics in touched files.

Rollback:
- Roll back only the failing work package and keep already-stable packages.

Status update:
- `DN` Completed on May 6, 2026.
- Hardened `booking-bookings.js` to be context-safe across Book Now/Account/My Bookings/Lesson Tracker pages.
- Added route detection and nav link support for `/my-bookings.html` in `navigation.js`.
- Ran editor diagnostics on all touched files with no reported errors.

### Phase 1 Tracking Checklist
- [x] P1-01 shared bootstrap extraction
- [x] P1-02 create My Bookings page shell
- [x] P1-03 move booking history loading to My Bookings page
- [x] P1-04 remove embedded history from Book Now
- [x] P1-05 create Lesson Tracker page
- [x] P1-06 validation and hardening

### Phase 1 Exit Criteria
- `booking.html` does not include `booking-bookings.js` or My Bookings markup.
- `my-bookings.html` is the primary history surface.
- `lesson-tracker.html` is functional and discoverable.
- Account bookings tab continues to work.
- No runtime or diagnostics regressions in touched files.

## Remaining Open Decisions
- Should Lesson Tracker also appear in the top navigation immediately, or only after My Bookings is live?
- Should Admin Calendar and Revenue wait until after the first admin extraction wave, or be pulled forward if older-phone performance is still not acceptable?
- Should Book Now later split again into dedicated booking-type routes such as `book-class` and `book-equipment`, or remain one create-booking page after My Bookings is removed?

## Recommendation
- Move forward with route-level segregation rather than continuing to optimize overloaded single pages.
- Prioritize user-task separation over tab cleanup.
- Recommended first split:
  - `booking.html` for create booking only
  - `my-bookings.html` for booking history and lesson tracking
  - `lesson-tracker.html` as a dedicated class-user route
  - `admin.html` as admin home/dashboard only
  - first admin extraction wave:
    - `admin-bookings.html`
    - `admin-users.html`
    - `admin-settings.html`
    - `admin-quotations.html`
    - `admin-deleted-records.html`
- After those are stable, extract calendar and revenue next because they are strong candidates for isolated library loading.

This plan creates a simpler, faster frontend architecture without trying to redesign the product all at once.