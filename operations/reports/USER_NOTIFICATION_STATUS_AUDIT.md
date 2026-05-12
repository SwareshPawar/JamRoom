# User Notification Status Audit

Date: 2026-05-12
Scope: Customer-facing email status labels shown in invoice-style and eBill templates.

## Objective

Ensure user-visible status text is explicit and state-based (for example: Pending, Confirmed, Deleted) instead of generic labels (for example: Admin Action, Student Notification).

## Primary Fixes Applied

1. Booking deleted email status changed to `Deleted`.
2. Booking updated email status changed to `Updated`.
3. Class slot approved email status changed to `Approved`.
4. Class slot booked email status changed to `Booked`.

## Customer-Facing Paths (Current)

| Flow | File | Current Label | Notes |
|---|---|---|---|
| Booking request submitted by customer | `routes/booking.routes.js` | `Received` | Clear and state-like |
| Class slot request submitted by customer | `routes/booking.routes.js` | `Submitted` | Clear and state-like |
| Booking cancelled by customer | `routes/booking.routes.js` | `Booking Cancelled` | Acceptable (can be shortened to `Cancelled` if desired) |
| Booking request auto-rejected due to conflict | `routes/admin/bookings.routes.js` | `Rejected` | Clear and state-like |
| Booking declined by admin | `routes/admin/bookings.routes.js` | `Declined` | Clear and state-like |
| Booking deleted by admin | `routes/admin/bookings.routes.js` | `Deleted` | Updated in this pass |
| Booking edited/updated by admin | `routes/admin/bookings.routes.js` | `Updated` | Updated in this pass |
| Class slot approved by admin | `routes/admin/bookings.routes.js` | `Approved` | Updated in this pass |
| Class slot booked by admin | `routes/admin/bookings.routes.js` | `Booked` | Updated in this pass |
| Booking confirmation helper mail | `utils/adminHelpers.js` | dynamic (`Pending`, `Confirmed`, etc.) | Uses normalized booking status label |
| eBill status card | `utils/templates/email/ebillEmailTemplate.js` | dynamic (`PENDING`, `CONFIRMED`, etc.) | Uses booking status + description mapping |

## Remaining Standardization Candidates

These are not incorrect, but can be normalized for consistency:

1. `Booking Cancelled` -> `Cancelled` (shorter format)
2. `Declined` vs `Rejected` (pick one term globally)
3. `Submitted` vs `Received` (pick one term for request-created states)

## Recommended Standard Status Set

Use this set for all customer-facing status badges/cards:

- `Pending`
- `Confirmed`
- `Cancelled`
- `Rejected`
- `Declined` (optional; otherwise merge into `Rejected`)
- `Updated`
- `Deleted`
- `Approved`
- `Booked`

## Admin-Only Labels

Labels like `Admin Notification`, `Admin Review`, and `Admin Action` are still valid for admin-recipient emails and do not affect customer-facing status cards.
