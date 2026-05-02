# SOLID Principles Analysis — JamRoom

> **Date:** May 2, 2026  
> **Scope:** Full backend (`server.js`, `routes/`, `models/`, `middleware/`, `utils/`) + shared JS utilities  
> **Status:** Issues documented inline; flagged items marked `⚠️ ISSUE`

---

## Overview

SOLID is a set of five object-oriented design principles. While JamRoom is a Node.js/Express app (not strictly OOP), the principles apply equally to modules, functions, and route handlers. The app is functional and working, but several patterns create maintenance risk as the codebase grows.

| Principle | Status |
|-----------|--------|
| S — Single Responsibility | ⚠️ Multiple issues |
| O — Open/Closed | ⚠️ Multiple issues |
| L — Liskov Substitution | ✅ Not applicable (no class hierarchy) |
| I — Interface Segregation | ⚠️ Minor issue |
| D — Dependency Inversion | ⚠️ Multiple issues |

---

## S — Single Responsibility Principle

> *A module/function should have one, and only one, reason to change.*

### ✅ Following SRP

- `middleware/auth.js` — only verifies JWT and attaches user to request.
- `middleware/admin.js` — only checks admin role.
- `utils/email.js` — only handles email transport (send single / bulk).
- `utils/calendar.js` — only generates iCal invites.
- `models/User.js` — only defines the user schema + password hashing hook.
- `models/Booking.js` — only defines the booking schema.
- `models/Slot.js` / `models/BlockedTime.js` — single-purpose data models.

---

### ⚠️ ISSUE S-1: `admin.routes.js` is a god file (4,241 lines, ~150 KB)

**File:** `routes/admin.routes.js`

`admin.routes.js` is one massive file that handles:
- Dashboard stats and revenue calculation
- Booking CRUD (create, read, update, delete, approve, reject, edit)
- Email notifications for bookings
- PDF eBill generation and download
- User management (create, update, delete, reset password, make admin)
- Admin settings CRUD
- Catalog export
- Slot blocking
- WhatsApp notifications
- Quotation management
- Calendar data0....................................................................................................................................................................................................................................................................

**Why it's a problem:** Any change to booking approval logic, user management, or settings risks breaking unrelated routes in the same 4,241-line file. Testing becomes guesswork.

**Recommended split:**
```
routes/
  admin/
    admin-bookings.routes.js     (booking CRUD, approve/reject, eBill, download)
    admin-users.routes.js        (user management, make-admin)
    admin-settings.routes.js     (settings, catalog export)
    admin-stats.routes.js        (revenue, stats, dashboard)
    admin-slots.routes.js        (block/unblock times)
    admin-quotations.routes.js   (quotation CRUD, PDF)
```

---

### ⚠️ ISSUE S-2: Route files contain business logic

**Files:** `routes/booking.routes.js`, `routes/admin.routes.js`, `routes/auth.routes.js`

Route handlers are mixing HTTP request parsing, business logic, database queries, and notification dispatch in a single function body. A single `approve booking` handler does all of:
1. Parse request
2. Find booking in DB
3. Check for slot conflicts
4. Update booking status
5. Auto-reject conflicting bookings
6. Send confirmation emails (with inline HTML templates)
7. Send WhatsApp notifications
8. Generate iCal attach

**Recommended pattern:** Extract business logic into service modules:
```
services/
  booking.service.js     (booking domain logic)
  notification.service.js  (email + WhatsApp orchestration)
  pdf.service.js         (PDF generation orchestration)
```

---

### ⚠️ ISSUE S-3: `formatTime12Hour` duplicated in 3 files

**Files affected:**
- `routes/booking.routes.js` (line 16)
- `routes/admin.routes.js` (line 39)
- `utils/pdfHTMLTemplate.js` (line 13)

Each copy is slightly different. A bug fix in one doesn't propagate to others.

**Fix:** Move to a single shared utility:
```js
// utils/timeFormat.js
const formatTime12Hour = (time24) => { ... };
const formatTimeRange12Hour = (start, end) => { ... };
module.exports = { formatTime12Hour, formatTimeRange12Hour };
```
Then `require` it in all three places.

---

### ⚠️ ISSUE S-4: `deriveDynamicBookingLabel` duplicated across routes

**Files affected:**
- `routes/booking.routes.js` (line 60)
- `routes/admin.routes.js` (line 100)

Same function, same body, in two route files. Any change needs to be made twice.

**Fix:** Move to `utils/bookingHelpers.js` and import where needed.

---

### ⚠️ ISSUE S-5: `buildHourlySlotModeFilter` and `buildPerdayInventoryModeFilter` duplicated

**Files affected:**
- `routes/booking.routes.js` (lines 183, 275)
- `routes/admin.routes.js` (line 69)

These MongoDB query filter builders encode shared business rules (how to identify hourly vs. per-day bookings). Duplicating them means a schema change breaks both files independently.

**Fix:** Move to `utils/bookingFilters.js`.

---

### ⚠️ ISSUE S-6: `server.js` contains seeding logic

**File:** `server.js` (lines 55–110)

`seedDatabase()` — which creates admin users and default settings — lives directly in `server.js`. Entry-point files should only wire up the app, not contain database seeding scripts.

**Fix:** Move to `scripts/setup/seedDatabase.js` and call it conditionally on startup.

---

### ⚠️ ISSUE S-7: `billGenerator.js` handles environment detection, DB reconnect, and PDF generation

**File:** `utils/billGenerator.js`

`generateBillForDownload` manually reconnects to MongoDB (`mongoose.connect(...)`) when the connection is stale, detects serverless vs. local environment (`isServerless`), and also drives Puppeteer. Three distinct concerns in one utility.

**Fix:** Move DB reconnect logic to `config/db.js` as an `ensureConnection()` helper. Keep environment detection in a shared `utils/environment.js`.

---

### ⚠️ ISSUE S-8: `AdminSettings` model carries too many unrelated concerns

**File:** `models/AdminSettings.js`

A single Mongoose document stores:
- Rental catalog (`rentalTypes[]`)
- Saved quotations (`savedQuotations[]`)
- Booking category bindings
- Instagram embeds (`instagramEmbeds[]`)
- UPI payment info
- Admin email list
- Business hours / slot duration
- GST configuration
- WhatsApp settings

These are logically independent concerns. A change to quotation schema risks corrupting rental catalog migrations.

**Recommended split (gradual):**
```
AdminSettings      → core app settings (hours, UPI, GST, adminEmails)
RentalCatalog      → rentalTypes, category bindings
QuotationTemplate  → savedQuotations
InstagramSettings  → instagramEmbeds
```

---

## O — Open/Closed Principle

> *A module should be open for extension but closed for modification.*

### ✅ Following OCP

- `utils/email.js` — `sendEmail` accepts an `options` object; adding new mail fields doesn't require modifying the function signature.
- `models/Booking.js` — new fields can be added to the schema without changing existing field behavior.
- `middleware/auth.js` and `middleware/admin.js` — are composable; you can layer more role checks without touching existing middleware.

---

### ⚠️ ISSUE O-1: WhatsApp provider switching requires modifying `whatsapp.js`

**File:** `utils/whatsapp.js`

Three provider implementations exist in the same file (`sendWhatsAppTwilio`, `sendWhatsAppMSG91`, `sendWhatsAppMeta`). The active provider is selected by checking which env vars are set, inside the `sendWhatsApp` function body. Adding a 4th provider means editing this file directly.

**Fix:** Use a strategy pattern or factory function:
```js
// utils/whatsapp/index.js
const getProvider = () => {
  if (process.env.TWILIO_ACCOUNT_SID) return require('./providers/twilio');
  if (process.env.MSG91_API_KEY)       return require('./providers/msg91');
  if (process.env.META_WHATSAPP_TOKEN) return require('./providers/meta');
  return require('./providers/noop');
};

const sendWhatsApp = async (mobile, message) => getProvider().send(mobile, message);
```
Each provider file exports `{ send }`. New providers are added as new files, not as edits.

---

### ⚠️ ISSUE O-2: Email template content is hardcoded inline in route handlers

**Files:** `routes/auth.routes.js`, `routes/booking.routes.js`, `routes/admin.routes.js`

HTML email bodies are built as template-literal strings directly inside route handler functions. To change the design of a confirmation email, you must edit a route file.

**Fix:** Move email templates to `utils/emailTemplates.js` (or a `templates/` folder) with functions like:
```js
exports.welcomeEmail = (name) => ({ subject: '...', html: `...` });
exports.bookingConfirmEmail = (booking, settings) => ({ ... });
```

---

## L — Liskov Substitution Principle

> *Subtypes must be substitutable for their base types without breaking the program.*

### ✅ Not Applicable

JamRoom does not use class inheritance hierarchies. There are no subclasses extending base classes. Mongoose schemas are composed independently. This principle is not violated because it does not apply.

---

## I — Interface Segregation Principle

> *Clients should not be forced to depend on interfaces they don't use.*

### ✅ Generally Followed

- `middleware/auth.js` and `middleware/admin.js` are separate — a route that needs auth but not admin-check only imports `protect`.
- `utils/email.js` exports only `sendEmail` and `sendBulkEmails`; callers import what they need.

---

### ⚠️ ISSUE I-1: `utils/whatsapp.js` exports a large undifferentiated surface

**File:** `utils/whatsapp.js`

The module exports 9 functions:
```
sendWhatsApp, sendWhatsAppTwilio, sendWhatsAppMSG91, sendWhatsAppMeta,
sendCustomerBookingRequestWhatsApp, sendBookingRequestNotifications,
sendBookingConfirmationNotifications, sendPaymentUpdateNotifications,
sendCancellationNotifications
```

Route files import the full destructured bundle even when only 2–3 functions are needed. The low-level provider functions (`sendWhatsAppTwilio`, etc.) should not be exported at all — they are implementation details.

**Fix:** Export only the public-facing notification functions; internalize provider calls.

---

## D — Dependency Inversion Principle

> *High-level modules should not depend on low-level modules. Both should depend on abstractions.*

### ✅ Partially Followed

- `utils/billGenerator.js` depends on `utils/pdfHTMLTemplate.js` via `require` — this is a reasonable static dependency.
- `middleware/auth.js` depends on `User` model directly, but since auth is the single boundary for user lookup, this is acceptable.

---

### ⚠️ ISSUE D-1: Route files directly `require` all Mongoose models

**Files:** All route files

Every route file hard-imports concrete Mongoose models:
```js
const Booking = require('../models/Booking');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
```

This means route handlers are tightly coupled to the MongoDB/Mongoose layer. Unit testing requires either mocking Mongoose or spinning up a real database.

**Recommended improvement:** Introduce a thin repository/service layer:
```js
// services/bookingService.js
const Booking = require('../models/Booking');
const findBookingById = (id) => Booking.findById(id).populate('userId', 'name email');
module.exports = { findBookingById, ... };
```
Routes then depend on `bookingService`, not directly on Mongoose models.

---

### ⚠️ ISSUE D-2: `billGenerator.js` inlines `mongoose.connect()` for serverless reconnect

**File:** `utils/billGenerator.js` (lines 141, 258)

```js
const mongoose = require('mongoose');
if (mongoose.connection.readyState !== 1) {
  await mongoose.connect(process.env.MONGO_URI, { ... });
}
```

A PDF-generation utility should not be responsible for managing the database connection. This is a cross-cutting infrastructure concern.

**Fix:** Add `ensureConnection()` to `config/db.js` and call it from the entry point or a shared request-scoped middleware. `billGenerator.js` should assume the connection exists.

---

### ⚠️ ISSUE D-3: `utils/pdfHTMLTemplate.js` depends on a client-side shared module

**File:** `utils/pdfHTMLTemplate.js` (line 6)

```js
const { buildServiceGroupSummary } = require('../public/js/shared/quotation-billing');
```

A server-side utility (`utils/`) depends on a `public/js/shared/` file — a module that was designed for browser consumption. This is a boundary violation. If `quotation-billing.js` ever needs a browser-only API, the server-side code breaks silently.

**Fix:** Extract `buildServiceGroupSummary` into a truly isomorphic module that can safely run in both environments:
```
utils/shared/quotationBilling.js   (pure function, no DOM dependencies)
public/js/shared/quotation-billing.js  → re-exports from utils/shared/
```

---

## Summary of Issues

| ID | Principle | File(s) | Issue | Priority |
|----|-----------|---------|-------|----------|
| S-1 | SRP | `routes/admin.routes.js` | 4,241-line god file mixing 10+ responsibilities | 🔴 High |
| S-2 | SRP | `routes/*.routes.js` | Business logic, email HTML, notifications inside route handlers | 🔴 High |
| S-3 | SRP | `booking.routes.js`, `admin.routes.js`, `pdfHTMLTemplate.js` | `formatTime12Hour` duplicated 3 times | 🟡 Medium |
| S-4 | SRP | `booking.routes.js`, `admin.routes.js` | `deriveDynamicBookingLabel` duplicated | 🟡 Medium |
| S-5 | SRP | `booking.routes.js`, `admin.routes.js` | Query filter builders duplicated | 🟡 Medium |
| S-6 | SRP | `server.js` | Seeding logic embedded in entry point | 🟢 Low |
| S-7 | SRP | `utils/billGenerator.js` | DB reconnect + env detection + PDF generation mixed | 🟡 Medium |
| S-8 | SRP | `models/AdminSettings.js` | One document stores 8+ unrelated concerns | 🟡 Medium |
| O-1 | OCP | `utils/whatsapp.js` | Adding a new WhatsApp provider requires modifying the file | 🟡 Medium |
| O-2 | OCP | `routes/auth.routes.js`, `routes/admin.routes.js` | Email HTML inline; must modify routes to change email design | 🟡 Medium |
| I-1 | ISP | `utils/whatsapp.js` | Exports internal provider functions that callers shouldn't touch | 🟢 Low |
| D-1 | DIP | All route files | Routes directly depend on concrete Mongoose models (no service layer) | 🟡 Medium |
| D-2 | DIP | `utils/billGenerator.js` | PDF utility manages database connection | 🟡 Medium |
| D-3 | DIP | `utils/pdfHTMLTemplate.js` | Server utility requires a client-facing `public/js/` module | 🔴 High |

---

## Recommended Refactor Roadmap

### Phase 1 — Quick wins (no behavior change, low risk)

1. **Create `utils/timeFormat.js`** — consolidate `formatTime12Hour` and `formatTimeRange12Hour` from the 3 files that duplicate them.
2. **Create `utils/bookingHelpers.js`** — move `deriveDynamicBookingLabel` out of both route files.
3. **Create `utils/bookingFilters.js`** — move `buildHourlySlotModeFilter`, `buildPerdayInventoryModeFilter`.
4. **Move seeding out of `server.js`** — relocate to `scripts/setup/seedDatabase.js`.
5. **Internalize WhatsApp provider functions** — don't export `sendWhatsAppTwilio` etc. from `utils/whatsapp.js`.

### Phase 2 — Boundary fixes (moderate effort)

6. **Fix `utils/pdfHTMLTemplate.js`** — extract `buildServiceGroupSummary` to `utils/shared/quotationBilling.js`.
7. **Move email templates** — create `utils/emailTemplates.js` with named template functions.
8. **Add `config/db.js#ensureConnection()`** — remove inline `mongoose.connect` from `billGenerator.js`.
9. **Apply WhatsApp provider pattern** — separate each provider into its own file under `utils/whatsapp/providers/`.

### Phase 3 — Service layer (high effort, high reward)

10. **Create `services/bookingService.js`** — extract booking domain logic from `admin.routes.js` and `booking.routes.js`.
11. **Create `services/notificationService.js`** — orchestrate email + WhatsApp in one place instead of route handlers.
12. **Split `routes/admin.routes.js`** — break into 6+ domain-specific admin route files.
13. **Gradual `AdminSettings` split** — separate rental catalog, quotations, and settings into distinct collections as traffic permits.

---

*Document auto-generated by full codebase scan. All line numbers reference the state of the code as of May 2, 2026.*
