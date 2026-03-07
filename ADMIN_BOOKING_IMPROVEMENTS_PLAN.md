# Admin Booking Improvements Plan

Date: 2026-03-07
Owner: Admin Booking Workflow
Scope: Admin booking flows in `public/admin.html`, `routes/admin.routes.js`, and startup behavior in `server.js`

## Goal
Maintain one reliable admin-first booking flow where admin can:
1. Create confirmed/paid bookings only for registered users.
2. Register a user inline, then continue booking immediately.
3. Use the same availability, pricing, notification, and email logic across admin create and admin approve flows.
4. Optionally override date/time checks for historical missed-bill entries.

## Current Implemented State

### 1. User selection and user management
- Admin create booking is registered-user-only with searchable typeahead.
- Inline user creation from create-booking modal is available.
- Users tab supports create, search, reset-default-password, and delete.
- Admin delete permission is owner-restricted for admin accounts.

### 2. Booking status policy
- Admin-created bookings are enforced as:
  - `bookingStatus = CONFIRMED`
  - `paymentStatus = PAID`

### 3. Availability parity in admin create flow
- Admin create modal now mirrors normal booking availability behavior:
  - availability timeline for selected date,
  - dynamic start/end dropdown filtering,
  - auto duration calculation.

### 4. Rental behavior and UI
- Per-day vs in-house pricing behavior aligned with normal booking rules.
- Rentals panel is responsive and scrollable for smaller screens.

### 5. Unified confirmation notifications
- Both `PUT /api/admin/bookings/:id/approve` and `POST /api/admin/bookings` call one shared confirmation email flow.
- Customer email and admin/staff emails use consistent templates.
- Calendar invite attachment (`booking.ics`) is included for both customer and admin/staff confirmation emails.
- Email time format is standardized to 12-hour AM/PM.

### 6. Universal confirmation recipient logic
Recipients are merged and deduplicated from:
1. `ALWAYS_NOTIFY_BOOKING_CONFIRM_EMAILS`
2. `settings.adminEmails`
3. all users with role `admin`
4. owner fallback email
5. WhatsApp booking-confirm contacts that can be mapped to a user email by mobile match

### 7. Historical booking override mode
- Admin create booking includes `Override date/time checks (history mode)` checkbox.
- When enabled:
  - past date/time can be selected,
  - frontend availability conflict filtering is bypassed,
  - backend conflict and blocked-time checks are bypassed,
  - booking note is tagged with `[Admin Override] Date/time checks bypassed for historical booking entry.`

### 8. Default admin auto-seed behavior
- Automatic creation of `admin@jamroom.com` during startup is disabled by default.
- Startup now seeds default admin only when `ENABLE_DEFAULT_ADMIN_SEED=true`.

## Key Files
- `public/admin.html`
- `routes/admin.routes.js`
- `routes/booking.routes.js`
- `server.js`
- `models/AdminSettings.js`

## Validation Checklist
1. Admin create booking works for existing users and confirms as paid.
2. Inline user create then booking works without page reload.
3. Confirmed booking emails are sent to:
   - customer,
   - always-notify list,
   - admin users,
   - configured admin emails.
4. Confirmation emails show AM/PM time and include calendar invite attachment.
5. Override mode allows historical booking creation even when slot is past/blocked/conflicting.
6. Without override mode, standard conflict and blocked-time validations still apply.

## Known Operational Notes
- Twilio error `63038` indicates daily WhatsApp quota exhausted; booking and email flow continue.
- WhatsApp contacts receive email only if their mobile maps to a user record that has an email.

## Next Optional Improvements
1. Move `ALWAYS_NOTIFY_BOOKING_CONFIRM_EMAILS` to environment/config instead of hardcoded values.
2. Add explicit email field per WhatsApp notification contact to avoid mobile-to-user mapping dependency.
3. Add a lightweight audit field (separate from notes) for override-created historical bookings.
