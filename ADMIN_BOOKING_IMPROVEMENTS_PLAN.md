# Admin Booking Improvements Plan

Date: 2026-03-07
Owner: Admin Booking Workflow
Scope: Admin-created bookings in `public/admin.html` and `routes/admin.routes.js`

## Goal
Build a reliable admin-first booking workflow where:
1. Admin creates bookings only for users from a selectable list.
2. Admin can register a new user from admin panel, then create booking for that user.
3. Admin-created bookings are always `CONFIRMED` and trigger confirmation notifications.
4. Known frontend bugs are fixed.
5. Per-day and in-house rental behavior matches normal booking flow.

## Confirmed Decisions (2026-03-07)
- Admin booking is strict registered-user only. No guest fallback.
- Admin can add a new user inline from create-booking flow.
- Temporary password for admin-created users: `Qwerty123`.
- Admin-created bookings are always `PAID` and `CONFIRMED`.
- User selector UX: searchable typeahead.
- Create booking form should reset after each successful booking.

## Current State Summary
- Admin create form currently accepts manual `userName` and `userEmail` fields.
- Admin create supports selecting rentals, but pricing behavior is simplified compared to `public/booking.html`.
- Admin create endpoint allows `bookingStatus` from request body (default is confirmed, but not strictly enforced).
- Post-create UI refresh check references missing selector `[data-tab="bookings"]`.
- Create flow uses `showLoading(false)` instead of `hideLoading()`.

## Requirements Breakdown

### R1. User must be selected from list
- Replace free text customer fields with a required user selector.
- User selector should support search by name/email/mobile.
- Booking submit should send `selectedUserId` only.
- Server should derive name/email/mobile from DB user record.

### R2. Admin can register user, then book
- Add an inline action in Create Booking modal: `+ Register New User`.
- Registration modal collects at least: `name`, `email`, optional `mobile`, temporary password strategy.
- After successful registration:
  - newly created user appears in dropdown,
  - auto-selected in booking form,
  - admin can continue booking without page reload.

### R3. Admin-created booking always confirmed and notification behavior
- Enforce `bookingStatus = 'CONFIRMED'` on server.
- Keep notification path aligned with confirmed flow:
  - customer email confirmation,
  - optional customer WhatsApp,
  - staff/admin WhatsApp confirmation notifications.
- Ignore any client-side `bookingStatus` field for admin create route.

### R4. Fix known frontend issues
- Fix missing selector refresh logic after successful admin booking create.
- Fix loading overlay call in create booking `finally` block.
- Verify modal open/close behavior is consistent for create modal.

### R5. Match normal booking rental behavior (per-day vs in-house)
- Align admin rental selection and pricing rules with `public/booking.html` logic:
  - per-day rentals are independent flat/day pricing,
  - in-house paid rentals are duration-linked,
  - free add-ons and per-day items can have quantity behavior similar to normal booking.
- Keep rental payload fields consistent (`rentalType`, `price`, `perdayPrice`, `quantity`, `description`).
- Ensure backend calculation stays authoritative and settings-driven.

## Proposed Implementation Steps

### Step 1. API and data contract updates (backend)
Files:
- `routes/admin.routes.js`
- `models/Booking.js` (enum alignment check)
- optional: `routes/admin.routes.js` new user list/register endpoints

Tasks:
1. Add endpoint: `GET /api/admin/users` (admin-only, searchable list).
2. Add endpoint: `POST /api/admin/users` (admin-only user registration).
3. Update admin booking create route to require `userId` instead of free text fields.
4. Fetch user by `userId` and copy snapshot fields to booking (`userName`, `userEmail`, `userMobile`).
5. Hard-set `bookingStatus = 'CONFIRMED'` in route.
6. Keep `paymentStatus` validation aligned with `Booking` schema.
7. Keep conflict checks and blocked-time checks unchanged.

Acceptance criteria:
- Admin cannot create booking without selecting an existing user.
- Admin-created booking is always confirmed regardless of payload.
- Notification path uses confirmation flow.

### Step 2. Admin create booking UI changes
Files:
- `public/admin.html`

Tasks:
1. Replace name/email/mobile inputs with `user` dropdown (searchable).
2. Add `Register User` modal and button inside Create Booking modal.
3. Load user options when create modal opens.
4. After creating a user, append and auto-select that user.
5. Submit payload with `userId` and booking details.
6. Remove/disable booking status selector from admin create form.

Acceptance criteria:
- Admin selects user from dropdown and can proceed.
- New user registration and immediate booking works without page reload.

### Step 3. Rental logic parity with normal booking
Files:
- `public/admin.html`
- optional shared utility extraction later

Tasks:
1. Port pricing logic rules from `public/booking.html` to admin create flow.
2. Preserve per-day/in-house distinctions and quantity behavior.
3. Use GST config from settings in UI display only; keep server as source of truth.
4. Send rental payload in same structure as normal booking.

Acceptance criteria:
- Calculated subtotal/tax/total for admin and normal flow match for same selection.
- Backend stored rentals include correct `rentalType` and pricing fields.

### Step 4. Bug fixes and stabilization
Files:
- `public/admin.html`

Tasks:
1. Replace missing selector post-create refresh logic with active tab check that exists.
2. Replace `showLoading(false)` with `hideLoading()`.
3. Normalize modal close behavior for create modal (`show` class vs inline `display` usage).
4. Verify alert target IDs are valid for create flow.

Acceptance criteria:
- Booking list refreshes after create when bookings tab is visible.
- Loading overlay always closes after success/failure.
- Create modal reliably opens and closes.

### Step 5. Validation and testing
Files:
- `TESTING_CHECKLIST.md` (add cases)
- manual + API tests

Test scenarios:
1. Register new user from admin modal, then create booking.
2. Select existing user and create confirmed booking.
3. Confirm email and WhatsApp triggers for confirmed admin create.
4. Validate conflict rejection for overlapping confirmed booking.
5. Validate blocked slot rejection.
6. Compare rental totals against normal booking behavior for per-day/in-house combinations.
7. Validate loading/modal/refresh bug fixes.

## Suggested Execution Order
1. Backend user list/register + booking route hardening.
2. Admin UI user dropdown + register modal.
3. Rental parity logic update.
4. Frontend bug fixes.
5. End-to-end testing and doc updates.

## Risks and Notes
- `paymentStatus` currently allows `PARTIAL` in admin UI but schema enum may reject it. Decide whether to support `PARTIAL` in schema or remove from UI.
- Booking schema requires `userId`; admin route currently has fallback behavior that can fail if not aligned.
- Prefer server-side authority for tax and total; frontend totals are preview only.

## Open Questions (Need Confirmation)
1. Do we want to force password reset on first login for admin-created users?
2. Should admin-created users receive an automatic onboarding email with credentials?

## Implementation Checklist
- [x] Step 1 backend APIs and admin route hardening
- [x] Step 2 admin user selection and registration UX
- [x] Step 3 rental parity logic for per-day/in-house
- [x] Step 4 frontend bug fixes
- [x] Step 5 testing and documentation updates
