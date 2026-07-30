# Quotation to Booking Conversion Plan

Date: 2026-07-30
Owner: Admin + Booking flows

## Goal
Convert an editable quotation into a real booking record so it is treated exactly like any admin-created booking for totals, billing, calendar, booking list, revenue rollups, and notifications.

## Scope
- Add conversion action in quotation workflow.
- Reuse existing booking creation API (`POST /api/admin/bookings`) so all booking rules and side effects stay consistent.
- Allow edits before conversion by converting from current quotation form state.

## Implemented Flow
1. Open quotation modal via new quotation or saved template.
2. Adjust items, schedule, discount, notes, and selected user.
3. Click `Convert to Booking`.
4. Frontend maps quotation payload to booking payload and calls existing admin booking API.
5. Booking is saved as `CONFIRMED` with normal payment tracking defaults (`PENDING`, amount paid `0`) unless later edited in booking tools.

## Mapping Rules
- User requirement: exactly one selected registered user for conversion.
- Booking mode:
  - Per-day only rentals -> `bookingMode = perday`.
  - In-house rentals present -> `bookingMode = hourly` with in-house date/start/end.
  - Flat-rate only (per-session/per-track) -> hourly placeholder time (`09:00` to `09:00`) with `overrideDateTime=true` so slot checks are bypassed.
- Pricing:
  - `subtotal` comes from quotation calculation.
  - Quotation discount maps to booking `priceAdjustmentType=discount` and `priceAdjustmentAmount`.
  - Final total/tax are computed server-side by existing booking API logic.
- Notes:
  - Preserves quotation notes and appends conversion marker timestamp.

## UX Additions
- Quotation modal action button: `Convert to Booking`.
- Saved quotations table action: `Convert` (loads template into modal ready for conversion).
- After sending quotation, modal remains open and prompts user to convert when ready.

## Why This Design
- Avoids duplicate backend booking logic.
- Ensures converted quotes appear automatically in all booking-driven views and reports.
- Keeps admin flexibility to modify quotation before final conversion.

## Validation Checklist
- Convert with in-house items only.
- Convert with per-day items only.
- Convert with mixed in-house + per-session/per-track items.
- Convert with flat-rate-only (per-session/per-track) items.
- Confirm booking appears in:
  - Admin bookings list
  - Calendar/timeline behavior (non-slot bookings excluded where expected)
  - Revenue/rollup screens
  - User booking history
- Confirm discount mapping and final total.
- Confirm one-user constraint and error messaging.

## Follow-up Enhancements (Optional)
- Add dedicated booking conversion modal to set initial payment status/reference during conversion.
- Persist a formal source link (`convertedFromQuotation`) on booking schema for traceability/audits.
- Add API-level conversion endpoint if backend traceability is required without relying on frontend mapping.
