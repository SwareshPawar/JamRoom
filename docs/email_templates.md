# Email Templates Inventory

Last audited: 2026-05-14

This document is the source of truth for all emails sent to users/admins from backend flows. Use it before changing email copy/design so no template is missed.

## Core Mail Sender

- Mail utility: `utils/email.js`
- Primary API: `sendEmail({ to, subject, text, html, attachments })`
- Bulk API: `sendBulkEmails(emails)`
- Behavior note: if `html` is a fragment (not full HTML), it gets wrapped using `wrapEmailHtml(...)` in `utils/email.js`.

## Template Sources

- Reusable invoice-style template: `utils/templates/email/invoiceStyleEmailTemplate.js` (`buildInvoiceStyleEmail`)
- Booking eBill template: `utils/templates/email/ebillEmailTemplate.js` (`buildEbillEmailHtml`)
- Quotation template: `utils/templates/email/quotationEmailTemplate.js` (`buildQuotationEmailHtml`)
- Open-event campaign template: `routes/admin/open-events.routes.js` (via `buildInvoiceStyleEmail`)

## Email Trigger Inventory (User + Admin)

1. Area: Auth
- Trigger / Endpoint: `POST /api/auth/register`
- Recipient Type: User
- Subject: `Welcome to ${studioName}!`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/auth.routes.js`

2. Area: Auth
- Trigger / Endpoint: `POST /api/auth/forgot-password`
- Recipient Type: User
- Subject: `Password Reset Request - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/auth.routes.js`

3. Area: Booking
- Trigger / Endpoint: `POST /api/bookings`
- Recipient Type: User
- Subject: `Booking Request Received - SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/booking.routes.js`

4. Area: Booking
- Trigger / Endpoint: `POST /api/bookings`
- Recipient Type: Admin(s)
- Subject: `New Booking Request - SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/booking.routes.js`

5. Area: Booking (Class)
- Trigger / Endpoint: `POST /api/bookings/:id/class-lessons/:lessonId/request-slot`
- Recipient Type: User
- Subject: `Slot Request Submitted - SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/booking.routes.js`

6. Area: Booking (Class)
- Trigger / Endpoint: `POST /api/bookings/:id/class-lessons/:lessonId/request-slot`
- Recipient Type: Admin(s)
- Subject: `New Class Slot Request - SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/booking.routes.js`

7. Area: Booking
- Trigger / Endpoint: `PUT /api/bookings/:id/cancel`
- Recipient Type: User
- Subject: `Booking Cancelled - SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `booking-cancelled.ics` when applicable
- Path: `routes/booking.routes.js`

8. Area: Booking
- Trigger / Endpoint: `PUT /api/bookings/:id/cancel`
- Recipient Type: Admin/staff recipients
- Subject: `Booking Cancelled - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `booking-cancelled.ics`
- Path: `routes/booking.routes.js`

9. Area: Admin Booking
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/approve` (conflict side-effect)
- Recipient Type: User (other pending booking auto-rejected)
- Subject: `Booking Request Update - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/admin/bookings.routes.js`

10. Area: Admin Booking
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/approve`
- Recipient Type: User
- Subject: `Booking Confirmed - ${studioName}`
- Template Source: `buildInvoiceStyleEmail` (via helper)
- Attachments: `booking.ics` when applicable
- Path: `utils/adminHelpers.js`

11. Area: Admin Booking
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/approve`
- Recipient Type: Admin/staff recipients
- Subject: `Booking Approved - ${studioName}`
- Template Source: `buildInvoiceStyleEmail` (via helper)
- Attachments: `booking.ics` when applicable
- Path: `utils/adminHelpers.js`

12. Area: Admin Booking
- Trigger / Endpoint: `POST /api/admin/bookings`
- Recipient Type: User
- Subject: `Booking Confirmed - ${studioName}`
- Template Source: `buildInvoiceStyleEmail` (via helper)
- Attachments: `booking.ics`
- Path: `routes/admin/bookings.routes.js` + `utils/adminHelpers.js`

13. Area: Admin Booking
- Trigger / Endpoint: `POST /api/admin/bookings`
- Recipient Type: Admin/staff recipients
- Subject: `Booking Approved - ${studioName}`
- Template Source: `buildInvoiceStyleEmail` (via helper)
- Attachments: `booking.ics`
- Path: `routes/admin/bookings.routes.js` + `utils/adminHelpers.js`

14. Area: Admin Booking (Class)
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/class-lessons/:lessonId/approve-slot`
- Recipient Type: User
- Subject: `Class Slot Approved - ${classItem} | SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `class-slot.ics`
- Path: `routes/admin/bookings.routes.js`

15. Area: Admin Booking (Class)
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/class-lessons/:lessonId/approve-slot`
- Recipient Type: Admin/staff recipients
- Subject: `Class Slot Approved - ${studentName} | SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `class-slot.ics`
- Path: `routes/admin/bookings.routes.js`

16. Area: Admin Booking (Class)
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/class-lessons/:lessonId/book-slot`
- Recipient Type: User
- Subject: `Class Slot Booked - ${classItem} | SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `class-slot.ics`
- Path: `routes/admin/bookings.routes.js`

17. Area: Admin Booking (Class)
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/class-lessons/:lessonId/book-slot`
- Recipient Type: Admin/staff recipients
- Subject: `Class Slot Booked - ${studentName} | SwarJRS`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `class-slot.ics`
- Path: `routes/admin/bookings.routes.js`

18. Area: Admin Booking
- Trigger / Endpoint: `POST /api/admin/bookings/:id/send-ebill`
- Recipient Type: User and/or additional recipients
- Subject: `Invoice for Your ${studioName} Booking - ${displayDate}`
- Template Source: `buildEbillEmailHtml`
- Attachments: Booking PDF when generated
- Path: `routes/admin/bookings.routes.js`

19. Area: Admin Booking
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/reject`
- Recipient Type: User
- Subject: `Booking Update - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/admin/bookings.routes.js`

20. Area: Admin Booking
- Trigger / Endpoint: `DELETE /api/admin/bookings/:id`
- Recipient Type: User
- Subject: `Booking Deleted - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/admin/bookings.routes.js`

21. Area: Admin Booking
- Trigger / Endpoint: `PUT /api/admin/bookings/:id/edit`
- Recipient Type: User
- Subject: `Booking Updated - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `booking-updated.ics` when timing changed
- Path: `routes/admin/bookings.routes.js`

22. Area: Open Event
- Trigger / Endpoint: `POST /api/open-event/:id/book`
- Recipient Type: User
- Subject: `Open Event Slot Confirmed - ${event.title}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: `open-event-slot.ics`
- Path: `routes/open-event.routes.js`

23. Area: Open Event Admin
- Trigger / Endpoint: `POST /api/admin/open-events/:id/notify-users`
- Recipient Type: All users with email
- Subject: `Open Event: ${title} (${date})`
- Template Source: `buildOpenEventNotificationEmailHtml`
- Attachments: `open-event.ics`
- Path: `routes/admin/open-events.routes.js`

24. Area: Open Event Admin
- Trigger / Endpoint: `POST /api/admin/open-events/:id/test-email`
- Recipient Type: Admin recipients
- Subject: `[TEST] Open Event: ${title} (${date})`
- Template Source: `buildOpenEventNotificationEmailHtml`
- Attachments: `open-event.ics`
- Path: `routes/admin/open-events.routes.js`

25. Area: Admin Users
- Trigger / Endpoint: `POST /api/admin/users`
- Recipient Type: User
- Subject: `Your ${studioName} Account Invite`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/admin/users.routes.js`

26. Area: Admin Users
- Trigger / Endpoint: `POST /api/admin/make-admin`
- Recipient Type: User (new admin)
- Subject: `Admin Access Granted - ${studioName}`
- Template Source: `buildInvoiceStyleEmail`
- Attachments: None
- Path: `routes/admin/users.routes.js`

27. Area: Quotations
- Trigger / Endpoint: `POST /api/admin/quotations/send`
- Recipient Type: User(s)
- Subject: `Quotation from ${studioName} - ${rentalTypeLabel}`
- Template Source: `buildQuotationEmailHtml`
- Attachments: Quotation PDF when generated
- Path: `routes/admin/quotations.routes.js`

## Open Event + Booking Coverage Notes

- Booking creation emails are in `routes/booking.routes.js` (user + admin) and use `buildInvoiceStyleEmail`.
- Booking confirmation emails are centralized in `sendUnifiedBookingConfirmationEmails(...)` in `utils/adminHelpers.js`.
- Open-event slot booking confirmation email is in `routes/open-event.routes.js`.
- Open-event campaign emails to all users/admin test recipients are in `routes/admin/open-events.routes.js` and use `buildInvoiceStyleEmail`.

## Admin Email Testing Tab (QA)

Purpose:
- Provide admin-only QA tooling to validate visual rendering and content for each email template independently.

UI location:
- Admin panel tab: `Email Testing` in `public/admin.html`.
- Frontend controller: `public/js/admin/admin-email-testing.js`.

Current behavior:
- Setup fixture user + booking (`swareshpawar@gmail.com`) without overwriting existing account role or profile fields.
- Load template catalog and render separated per-template actions.
- Each template card has:
	- `Send to Admins` (single-template dispatch)
	- `Raw Data` (single-template payload generation)
- Batch raw-data generation is available for all templates.

Security/recipient guardrails:
- All testing sends are restricted to admin recipients from settings (+ logged-in admin fallback).
- No test email from this tab is sent to customer/user addresses.

Backend endpoints:
- `GET /api/admin/email-testing/status`
- `POST /api/admin/email-testing/setup-fixture`
- `GET /api/admin/email-testing/templates`
- `POST /api/admin/email-testing/raw-data`
- `POST /api/admin/email-testing/send`
- `POST /api/admin/email-testing/send-all` (legacy bulk helper retained)

## Script-by-Script Verification (2026-05-13)

Method used:
- Repo-wide scan on `**/*.js` for `sendEmail(`, `sendBulkEmails(`, `transporter.sendMail(`, and template builders.
- Result: only the scripts below send email for user/admin flows.

Verified scripts and findings:

- `utils/email.js`
	- Contains low-level sender (`transporter.sendMail`) and wrappers.
	- Status: tracked in Core Mail Sender section.

- `routes/auth.routes.js`
	- Sends welcome and password-reset emails.
	- Status: tracked.

- `routes/booking.routes.js`
	- Sends booking-request, class-slot-request, and cancellation emails (user/admin).
	- Status: tracked.

- `utils/adminHelpers.js`
	- Sends unified booking confirmation emails (`Booking Confirmed`, `Booking Approved`).
	- Status: tracked.

- `routes/admin/bookings.routes.js`
	- Sends rejection/update/delete/eBill/class-slot emails and calls unified confirmation helper.
	- Status: tracked (including admin-created booking trigger).

- `routes/open-event.routes.js`
	- Sends open-event slot confirmation to user.
	- Status: tracked.

- `routes/admin/open-events.routes.js`
	- Sends open-event campaign emails to users and test emails to admins.
	- Status: tracked.

- `routes/admin/users.routes.js`
	- Sends account invite and admin-access-granted emails.
	- Status: tracked.

- `routes/admin/quotations.routes.js`
	- Sends quotation emails (single or bulk recipients).
	- Status: tracked.

Scripts checked with no direct email sending:

- Other route files and frontend/public scripts have no direct `sendEmail`/`sendBulkEmails` usage for backend user/admin delivery.
- PDF/email template files define HTML builders only; they do not dispatch mail directly.

## Current Gaps / Watchlist

- No email is sent when a user cancels their open-event slot (`DELETE /api/open-event/:id/book`).
- No email is sent when admin rejects a class slot request (`PUT /api/admin/bookings/:id/class-lessons/:lessonId/reject-slot`).

## Update Checklist (When Changing Email Design)

1. Update shared template(s): invoice/eBill/quotation/open-event custom HTML.
2. Validate subject lines and placeholders in all trigger points listed above.
3. Verify attachment behavior for `.ics` and PDF cases.
4. Test at least one flow per area: auth, booking, admin booking, open-event, admin users, quotations.

## Dark Theme Unification Migration Plan

Goal:
- Rework all production email templates to closely match the provided premium dark theme sample while preserving each flow's business content and improving mobile readability on iOS and Android.

Design direction to unify across all emails:
- Deep navy dark background, gold accent highlights, violet accent for status/action emphasis.
- Strong brand header block with logo, studio details, and contextual status card.
- Modular content cards with clear hierarchy: summary card, detail rows, action card, terms card, footer.
- Consistent spacing scale, border radii, icon treatment, and typography rhythm.
- Accessible contrast and tap targets for mobile-first rendering.

Technical constraints for email-client compatibility:
- Table-first layout for critical structure where needed.
- Inline-safe styling and conservative CSS (avoid unsupported modern selectors in critical blocks).
- Fallback-safe rendering for Gmail, Apple Mail (iOS), Outlook Web, and Android clients.
- Controlled media queries for narrow widths only.
- Respect plain-text fallback from sender utility.

Migration phases:

1. Foundation System
- Create shared dark-theme tokens and reusable block helpers (header, status chip, key-value rows, CTA strip, terms, footer).
- Normalize logo/address/contact region and safe fallback behavior.
- Define responsive breakpoints and typography scale for mobile readability.

2. Core Template Refactor
- Rebuild `buildInvoiceStyleEmail` to become the base design system template.
- Refactor `buildEbillEmailHtml` to same visual language and spacing rules.
- Refactor `buildQuotationEmailHtml` to same visual language and spacing rules.

3. Inline Template Consolidation
- Replace custom inline Open Event campaign HTML with shared dark-theme components (or move to dedicated template file).
- Ensure all route-level email builders use unified wrappers/components.

4. Flow-by-Flow Content Mapping
- Map every trigger row in "Email Trigger Inventory" to final card structure.
- Redesign subject lines with SwarJRS branding while preserving trigger intent clarity.
- Preserve all legal/payment/booking terms and action instructions.

5. Compatibility + QA
- Snapshot testing across major clients and mobile widths.
- Manual checks for iOS Mail and Android Gmail readability.
- Verify all links, attachments, and dynamic placeholders.

6. Rollout
- Phase rollout by area: booking + auth first, then admin booking/class flows, then quotations + open event, then admin user emails.
- Keep rollback path by retaining previous template versions until sign-off.

## Progress Tracker

Status legend:
- TODO: not started
- IN_PROGRESS: active
- DONE: completed and verified

Current overall status: IN_PROGRESS (template migration complete, API-level parity validation complete, mobile client QA pending)

1. Workstream: Inventory and trigger verification
- Status: DONE
- Owner: Copilot
- Notes: All current sender scripts verified and tracked in this file.

2. Workstream: Theme spec extraction from sample
- Status: DONE
- Owner: Copilot + User
- Notes: Direction finalized: one unified dark theme, sample-style CTA usage, simplified non-payment layout, hybrid typography.

3. Workstream: Shared dark design system for email blocks
- Status: DONE
- Owner: Copilot
- Notes: Implemented in `buildInvoiceStyleEmail` as the base dark visual system reused by dependent templates.

4. Workstream: Invoice-style template migration
- Status: DONE
- Owner: Copilot
- Notes: Migrated to premium dark theme system with improved mobile behavior.

5. Workstream: eBill template migration
- Status: DONE
- Owner: Copilot
- Notes: Refactored to reuse dark base system while preserving all payment attributes and invoice details.

6. Workstream: Quotation template migration
- Status: DONE
- Owner: Copilot
- Notes: Refactored to reuse dark base system with pricing summary, CTA, terms, and offer blocks.

7. Workstream: Open-event campaign template migration
- Status: DONE
- Owner: Copilot
- Notes: Migrated to shared dark base template system for consistent visuals and mobile readability.

8. Workstream: Content parity validation for all flows
- Status: DONE
- Owner: Copilot
- Notes: Completed API-level parity smoke check via Email Testing endpoints. Verified 23/23 templates returned raw payloads with valid subjects, expected migrated base markers (`mail-shell`, `hero`, `status-card`), and no short/empty HTML payloads.

9. Workstream: Mobile QA (iOS + Android)
- Status: IN_PROGRESS
- Owner: Copilot + User
- Notes: Pending inbox rendering checks on iOS Mail + Android Gmail for representative templates (auth, booking, billing, open-event, quotation).

10. Workstream: Final rollout and sign-off
- Status: TODO
- Owner: Copilot + User
- Notes: Controlled release after approval.

11. Workstream: Subject-line SwarJRS rebrand
- Status: DONE
- Owner: Copilot
- Notes: Updated major user/admin email subjects from JamRoom token usage to SwarJRS-default branding.

12. Workstream: Admin all-email QA tab + test harness
- Status: DONE
- Owner: Copilot
- Notes: Added admin-only testing tab with fixture setup, separated per-template buttons, single-template send, and raw payload generation for visual QA.

13. Workstream: Sample-style template alignment refresh
- Status: DONE
- Owner: Copilot
- Notes: Re-migrated shared `buildInvoiceStyleEmail` shell to match premium sample style (hero header, status card, intro card, modern dark panels) so all separated template tests render the updated format.

## Migration Execution Log

1. Date: 2026-05-14
- Phase: Core Template Refactor
- Status: DONE
- Updated files:
	- `utils/templates/email/invoiceStyleEmailTemplate.js`
	- `utils/templates/email/ebillEmailTemplate.js`
	- `utils/templates/email/quotationEmailTemplate.js`
- Notes:
	- Implemented unified premium dark theme foundation.
	- Applied hybrid typography and stronger mobile readability behavior.
	- Preserved all dynamic data attributes used by existing flows.

2. Date: 2026-05-14
- Phase: Open Event Template + Subject Rebrand
- Status: DONE
- Updated files:
	- `routes/admin/open-events.routes.js`
	- `routes/auth.routes.js`
	- `routes/booking.routes.js`
	- `routes/admin/bookings.routes.js`
	- `routes/admin/users.routes.js`
	- `routes/admin/quotations.routes.js`
	- `utils/adminHelpers.js`
- Notes:
	- Open-event campaign template moved to shared dark theme builder.
	- Email subjects updated to SwarJRS branding defaults for consistency.

3. Date: 2026-05-14
- Phase: Admin Email Testing Tooling
- Status: DONE
- Updated files:
	- `routes/admin/email-testing.routes.js`
	- `routes/admin.routes.js`
	- `public/admin.html`
	- `public/js/admin/admin-email-testing.js`
- Notes:
	- Added `GET /api/admin/email-testing/status`, `POST /api/admin/email-testing/setup-fixture`, `GET /api/admin/email-testing/templates`, `POST /api/admin/email-testing/raw-data`, and `POST /api/admin/email-testing/send`.
	- Added new Admin tab with separated per-template test actions and raw-data generation.
	- All test dispatch is restricted to admin recipients only.

4. Date: 2026-05-14
- Phase: Shared Template Alignment Refresh
- Status: DONE
- Updated files:
	- `utils/templates/email/invoiceStyleEmailTemplate.js`
- Notes:
	- Updated base shared template shell to match image-guided dark premium design.
	- Verified raw payload output from Email Testing endpoints contains migrated structure markers.

5. Date: 2026-05-14
- Phase: Content Parity Validation (API Smoke)
- Status: DONE
- Updated files:
	- `docs/email_templates.md`
- Notes:
	- Executed parity check using `GET /api/admin/email-testing/templates` + `POST /api/admin/email-testing/raw-data`.
	- Result: 23 template definitions and 23 raw payloads.
	- No missing subjects, no undersized payloads, and no missing migrated base markers in generated HTML.
	- Type distribution validated: `admin:2`, `auth:2`, `billing:1`, `booking:10`, `class:4`, `openEvent:3`, `quotation:1`.

## Next Step (Immediate)

1. Run inbox-level Mobile QA using Email Testing tab on these template keys:
- `welcome-user` (auth)
- `booking-request-user` (booking)
- `ebill` (billing)
- `open-event-slot-confirmed` (open-event)
- `quotation` (quotation)

2. Validate on:
- iOS Mail (latest)
- Android Gmail (latest)

3. Sign-off criteria:
- Header/logo/status card visual fidelity
- Summary rows readable without clipping
- CTA and terms blocks legible and tappable
- No horizontal scroll, broken spacing, or overflow

## Decisions Needed Before Implementation

Resolved on 2026-05-13:

- Subject lines: redesign allowed; replace generic JamRoom-only naming with SwarJRS branding direction.
- Theme model: one unified dark theme for all email categories.
- CTA policy: use sample-style labels where applicable.
- Non-payment emails: use simplified variant (avoid payment/progress strip where not relevant).
- Typography: hybrid stack (brand-like with safe fallbacks).
- Mobile QA priority: Gmail Android and iOS Mail first.

Open clarification:

- Brand token confirmed for subject standardization: `SwarJRS`.