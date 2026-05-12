# 🎸 JamRoom Booking System - Complete System Documentation

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture & Technology Stack](#architecture--technology-stack)
3. [Database Models](#database-models)
4. [API Endpoints](#api-endpoints)
5. [Frontend Structure](#frontend-structure)
6. [Backend Structure](#backend-structure)
7. [Key Variables & Configurations](#key-variables--configurations)
8. [Process Flows](#process-flows)
9. [File Structure](#file-structure)
10. [Environment Variables](#environment-variables)
11. [Recent Changes & Modifications](#recent-changes--modifications)

---

## 🎯 System Overview

**JamRoom Booking System** is a full-stack web application for managing music studio/jam room rentals. It provides:
- User registration and authentication
- Booking management with approval workflow
- Admin panel for booking management
- Email notifications with calendar invites
- Revenue tracking and analytics
- Time slot blocking functionality

### Core Features
- **User Features**: Register, login, book sessions, view bookings, cancel bookings
- **Admin Features**: Approve/reject bookings, edit/delete bookings, block time slots, manage settings, revenue analytics
- **System Features**: Email notifications, calendar invites (.ics files), UPI payment integration
- **Enhanced Rental System**: Hierarchical categories, dual pricing models, smart quantity controls

### 🆕 Enhanced Rental System (Latest Update)

**Overview**: The rental system has been completely overhauled to support complex instrument rental scenarios with sophisticated pricing logic and user experience improvements.

**Key Features**:
1. **Hierarchical Categories**: 
   - JamRoom (base room + add-ons)
   - Instrument Rentals (guitars, keyboards, etc.)
   
2. **Dual Pricing Models**:
   - **In-house Rentals**: Price scales with session duration (₹/hour)
   - **Per-day Rentals**: Flat rate regardless of session duration
   
3. **Smart Quantity Controls**:
   - Fixed quantities for certain items (JamRoom base: always 1)
   - Limited quantities for free add-ons (mics/jacks: max 4 each)
   - Flexible quantities for per-day rentals
   - Special case handling (IEM: quantity-based but duration-tied)
   
4. **UI/UX Enhancements**:
   - Collapsible category sections
   - Visual indicators for rental types (emojis, colors)
   - Real-time price calculations
   - Context-aware controls

---

## 🏗️ Architecture & Technology Stack

### Backend
- **Framework**: Node.js with Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Email**: Nodemailer with SMTP
- **Calendar**: ical-generator for .ics files
- **File Upload**: None (forms only)

### Frontend
- **Technology**: Plain HTML, CSS, JavaScript (No frameworks)
- **UI Library**: None (Custom CSS with responsive design)
- **Calendar UI**: FullCalendar.js (Admin panel only)
- **Icons**: Emoji-based icons

### Deployment
- **Platform**: Vercel (configured)
- **Environment**: Production/Development support
- **Database**: MongoDB Atlas

---

## 🗄️ Database Models

### 1. User Model (`/models/User.js`)
```javascript
{
  name: String (required),
  email: String (required, unique, lowercase),
  password: String (required, hashed),
  role: String (default: 'user', enum: ['user', 'admin']),
  createdAt: Date (default: Date.now)
}
```

### 2. Booking Model (`/models/Booking.js`)
```javascript
{
  userId: ObjectId (ref: 'User', required),
  bookingMode: String (enum: ['hourly', 'perday']),
  date: Date (required),
  startTime: String (required, format: 'HH:MM'),
  endTime: String (required, format: 'HH:MM'),
  duration: Number (required, in hours),
  perDayStartDate: Date (optional),
  perDayEndDate: Date (optional),
  perDayDays: Number (optional),
  rentalType: String (required),
  rentals: [
    {
      name: String,
      description: String,
      price: Number,
      quantity: Number,
      rentalType: String (optional)
    }
  ],
  subtotal: Number (required),
  taxAmount: Number (required),
  price: Number (required, final total),
  priceAdjustmentType: String (enum: ['none', 'discount', 'surcharge']),
  priceAdjustmentAmount: Number (absolute value),
  priceAdjustmentValue: Number (signed: discount negative, surcharge positive),
  priceAdjustmentNote: String (optional),
  bookingStatus: String (enum: ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED']),
  paymentStatus: String (enum: ['PENDING', 'PARTIAL', 'PAID', 'REFUNDED']),
  userName: String (required),
  userEmail: String (required),
  userMobile: String (optional),
  bandName: String (optional),
  notes: String (optional),
  createdAt: Date (default: Date.now),
  updatedAt: Date
}
```

### 3. AdminSettings Model (`/models/AdminSettings.js`)
```javascript
{
  rentalTypes: [{ 
    name: String (required),
    description: String,
    basePrice: Number (required, min: 0),
    // ENHANCED: New fields for hierarchical rental system
    subItems: [{
      name: String,
      price: Number (min: 0),
      rentalType: String (enum: ['inhouse', 'perday'], default: 'inhouse'),
      perdayPrice: Number (default: 0)
    }]
  }],
  prices: {
    hourlyRate: Number (default: 500),
    instrumentsRate: Number (default: 300),
    soundSystemRate: Number (default: 400)
  },
  upiId: String (default: 'swareshpawar@okicici'),
  upiName: String (default: 'Swar JamRoom & Music Studio (SwarJRS)'),
  adminEmails: [String] (lowercase, trim),
  studioName: String (default: 'Swar JamRoom & Music Studio (SwarJRS)'),
  studioAddress: String (default: 'Zen Business Center - 202, Bhumkar Chowk Rd...'),
  businessHours: {
    startTime: String (default: '09:00'),
    endTime: String (default: '22:00')
  },
  createdAt: Date (default: Date.now),
  updatedAt: Date (default: Date.now)
}
```

**Enhanced Rental System Schema Explanation**:
- `rentalType`: Determines pricing model ('inhouse' = hourly, 'perday' = flat)
- `perdayPrice`: Used when rentalType is 'perday', overrides hourly calculation
- `subItems`: Hierarchical structure supporting complex rental categories

### 4. BlockedTime Model (`/models/BlockedTime.js`)
```javascript
{
  date: Date (required),
  startTime: String (required),
  endTime: String (required),
  reason: String (default: 'Blocked by admin'),
  blockedBy: ObjectId (ref: 'User', required),
  createdAt: Date (default: Date.now)
}
```

### 5. Slot Model (`/models/Slot.js`)
```javascript
{
  date: Date (required),
  startTime: String (required),
  endTime: String (required),
  isBlocked: Boolean (default: false),
  createdAt: Date (default: Date.now)
}
```

---

## 🔌 API Endpoints

### Authentication Routes (`/routes/auth.routes.js`)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Booking Routes (`/routes/booking.routes.js`)
- `POST /api/bookings` - Create new booking
- `GET /api/bookings/my-bookings` - Get user's bookings
- `PUT /api/bookings/:id/cancel` - Cancel booking
- `GET /api/bookings/settings` - Get public settings (rental types)
- `GET /api/bookings/availability/:date` - Get availability for specific date
- `GET /api/bookings/:id` - Get single booking

### Admin Routes (`/routes/admin.routes.js`)
- `GET /api/admin/revenue` - Get revenue analytics
- `GET /api/admin/bookings/calendar` - Get calendar formatted bookings
- `GET /api/admin/bookings` - Get bookings with filters + pagination/search/sort
- `POST /api/admin/bookings` - Create confirmed/paid booking for registered user
- `PUT /api/admin/bookings/:id/approve` - Approve booking
- `PUT /api/admin/bookings/:id/reject` - Reject booking
- `POST /api/admin/bookings/:id/send-ebill` - Send eBill to selected recipients
- `DELETE /api/admin/bookings/:id` - Delete booking *(NEW)*
- `PUT /api/admin/bookings/:id/edit` - Edit booking *(NEW)*
- `GET /api/admin/users` - Fetch users for admin booking/create-user flows
- `POST /api/admin/users` - Create user from admin panel
- `PUT /api/admin/users/:id` - Update user details from admin panel
- `POST /api/admin/users/:id/reset-default-password` - Reset user temporary password
- `DELETE /api/admin/users/:id` - Delete user and related bookings
- `GET /api/admin/stats` - Get dashboard statistics
- `GET /api/admin/settings` - Get admin settings
- `PUT /api/admin/settings` - Update admin settings
- `POST /api/admin/make-admin` - Grant admin privileges
- `POST /api/admin/block-time` - Block time slot
- `GET /api/admin/blocked-times` - Get blocked times
- `DELETE /api/admin/blocked-times/:id` - Remove blocked time
- `GET /api/admin/debug-settings` - Debug settings (temporary)

### Slot Routes (`/routes/slot.routes.js`)
- `GET /api/slots` - Get available slots
- `POST /api/slots` - Create slot (Admin)
- `PUT /api/slots/:id` - Update slot (Admin)

---

## 🎨 Frontend Structure

### Pages & Files
1. **`/public/index.html`** - Landing page
2. **`/public/login.html`** - User login page
3. **`/public/register.html`** - User registration page
4. **`/public/booking.html`** - User booking interface
5. **`/public/admin.html`** - Admin dashboard
6. **`/public/reset-password.html`** - Password reset page
7. **`/public/manifest.webmanifest`** - PWA install metadata
8. **`/public/sw-booking.js`** - Booking page service worker

### Key Frontend Variables & Functions

#### Global Variables (All Pages)
```javascript
const API_URL = window.location.origin;
let currentUser = null;
let settings = null;
```

#### Booking Page (`booking.html`)
```javascript
// Key Functions:
- checkAuth() - Verify user authentication
- loadSettings() - Load booking settings from API
- populateRentalTypes() - Fill rental type dropdown
- updatePrice() - Calculate booking price
- bookSlot() - Submit booking form
- loadMyBookings() - Load user's booking history
- loadAvailability() - Check time slot availability

// Key Variables:
- currentUser: Current logged-in user object
- settings: System settings (rental types, prices)
```

**Mobile Behavior:**
- Booking now uses `/booking.html` directly for both desktop and mobile (no iframe shell)
- Responsive styles are handled by `public/css/pages/booking.css` and shared shell rules

#### Admin Page (`admin.html`)
```javascript
// Key Functions:
- loadStats() - Load dashboard statistics
- loadBookings() - Load all bookings table
- approveBooking() - Approve booking
- rejectBooking() - Reject booking
- editBooking() - Edit booking (NEW)
- deleteBooking() - Delete booking (NEW)
- initCalendar() - Initialize FullCalendar
- loadRevenue() - Load revenue analytics
- loadBlockedTimes() - Load blocked time slots

// Key Variables:
- calendar: FullCalendar instance
- currentEditingBookingId: ID of booking being edited
```

---

## 🔧 Backend Structure

### Core Files
1. **`server.js`** - Main application entry point
2. **`config/db.js`** - MongoDB connection configuration
3. **`middleware/auth.js`** - JWT authentication middleware
4. **`middleware/admin.js`** - Admin role verification middleware

### Utility Files
1. **`utils/email.js`** - Email sending functionality
2. **`utils/calendar.js`** - Calendar invite generation
3. **`utils/upi.js`** - UPI payment utilities

### Key Backend Functions

#### Email Utils (`/utils/email.js`)
```javascript
// sendEmail(options) - Send email with attachments
// Options: { to, subject, html, attachments }
```

#### Calendar Utils (`/utils/calendar.js`)
```javascript
// generateCalendarInvite(options) - Generate .ics file
// generateMultipleEvents(events, studioName) - Multiple events
```

#### Authentication Flow
```javascript
// 1. protect middleware - Verify JWT token
// 2. isAdmin middleware - Check admin role
// 3. Token format: "Bearer <token>"
```

---

## 🔧 Key Variables & Configurations

### Environment Variables
```bash
# Database
MONGODB_URI=mongodb+srv://...
DB_NAME=jamroom_booking

# Authentication
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRE=30d

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=swarjrs@gmail.com
EMAIL_PASS=your_app_password

# Application
PORT=5000
NODE_ENV=production
BASE_URL=https://jam-room-mu.vercel.app

# Admin booking workflow toggles
ENABLE_DEFAULT_ADMIN_SEED=false
ALWAYS_NOTIFY_BOOKING_CONFIRM_EMAILS=owner@example.com,accounts@example.com
```

### Default System Settings
```javascript
// Studio Information
studioName: "Swar JamRoom & Music Studio (SwarJRS)"
studioAddress: "Zen Business Center - 202, Bhumkar Chowk Rd, above Cafe Coffee Day, Shankar Kalat Nagar, Wakad, Pune, Pimpri-Chinchwad, Maharashtra 411057"

// Business Hours
businessHours: { startTime: "09:00", endTime: "22:00" }

// Payment Info
upiId: "swareshpawar@okicici"
upiName: "Swar JamRoom & Music Studio (SwarJRS)"

// Default Rental Types
rentalTypes: [
  { name: 'JamRoom', basePrice: 500 },
  { name: 'Instruments', basePrice: 300 },
  { name: 'Sound System', basePrice: 400 },
  { name: 'JamRoom + Instruments', basePrice: 700 },
  { name: 'Full Package', basePrice: 1000 }
]
```

---

## 🔄 Process Flows

### 1. User Booking Flow
```
1. User registers/logs in → JWT token stored
2. User accesses booking page → Load settings & rental types
3. User selects date/time → Check availability
4. User fills form → Calculate price
5. User submits → Create booking (PENDING status)
6. System sends notification to admin emails
7. System shows UPI payment details to user
```

### 2. Admin Approval Flow
```
1. Admin logs in → Access admin panel
2. Admin views pending bookings → Booking table/calendar
3. Admin approves booking:
   - Status: PENDING → CONFIRMED
   - Auto-reject conflicting PENDING bookings
   - Generate calendar invite (.ics)
   - Send confirmation email to user
   - Send notification to admin emails
```

### 3. Admin Create Booking Flow
```
1. Admin opens create booking modal
2. Admin selects registered user (or creates user inline)
3. Admin selects date/time/rentals and optional price override, then submits:
  - Enforced status: bookingStatus = CONFIRMED
  - Enforced payment: paymentStatus = PAID
  - Optional override: discount/surcharge amount and note
  - Final amount formula: subtotal + taxAmount + signedAdjustment
4. If override mode enabled (`overrideDateTime=true`):
  - Conflict and blocked-time checks are bypassed
  - Booking note is tagged with admin override marker
5. Unified confirmation emails + calendar invite are sent
```

### 4. Email & Calendar Flow
```
1. Booking approved → Generate calendar invite
2. Calendar contains:
   - Title: "{StudioName} Booking - {RentalType}"
   - Location: {StudioAddress} (exact address for directions)
   - Organizer: {StudioName} <{EmailUser}>
   - Attendees: User email + Admin emails
3. Email sent with .ics attachment
```

### 5. Edit/Delete Booking Flow *(NEW)*
```
Edit Flow:
1. Admin clicks "Edit" → Open edit modal
2. Form pre-populated with current values
3. Admin modifies fields (including optional discount/surcharge) → Validate & submit
4. System updates booking → Send notification email
5. Refresh admin table

Delete Flow:
1. Admin clicks "Delete" → Confirmation modal
2. Admin confirms → DELETE API call
3. System deletes booking → Send notification email
4. Refresh admin table & stats
```

### 6. Navigation/Auth/Draft Resilience Flow
```
1. Page loads shared navigation shell
2. If auth check is delayed/interrupted, guest nav fallback renders automatically
3. Auth manager applies timeout + cached-session fallback for smoother startup
4. Booking/admin form drafts autosave in localStorage during entry
5. On refresh/reopen, draft fields are restored and then cleared after successful submit
```

---

## 📁 File Structure

```
JamRoom/
├── 📄 server.js                 # Main app entry
├── 📄 package.json             # Dependencies
├── 📄 vercel.json              # Vercel config
├── 📄 README.md                # Project overview
├── 📁 docs/
│   ├── 📁 guides/
│   │   ├── DEPLOYMENT.md       # Deployment guide
│   │   ├── SETUP_GUIDE.md      # Setup instructions
│   │   └── WHATSAPP_SETUP.md   # WhatsApp setup
│   ├── 📁 operations/
│   │   └── CATALOG_BACKUP_WORKFLOW.md
│   ├── 📁 plans/
│   │   ├── CSS_MIGRATION_PLAN.md
│   │   ├── DESIGN_UNIFICATION_TRACKER.md
│   │   ├── NEXT_GEN_JAMROOM_MIGRATION_PLAN.md
│   │   └── RESTRUCTURING_PLAN.md
│   ├── 📁 reference/
│   │   ├── API_DOCUMENTATION.md
│   │   ├── DEVELOPER_REFERENCE.md
│   │   ├── SYSTEM_DOCUMENTATION.md
│   │   └── TESTING_CHECKLIST.md
└── 📁 reports/
  └── SOLID_ANALYSIS.md
│
├── 📁 config/
│   └── db.js                   # MongoDB connection
│
├── 📁 models/
│   ├── User.js                 # User schema
│   ├── Booking.js              # Booking schema
│   ├── AdminSettings.js        # Settings schema
│   ├── BlockedTime.js          # Blocked time schema
│   └── Slot.js                 # Time slot schema
│
├── 📁 routes/
│   ├── auth.routes.js          # Authentication
│   ├── booking.routes.js       # Booking management
│   ├── slot.routes.js          # Slot management
│   └── admin.routes.js         # Admin operations
│
├── 📁 middleware/
│   ├── auth.js                 # JWT verification
│   └── admin.js                # Admin check
│
├── 📁 utils/
│   ├── email.js                # Email sending
│   ├── calendar.js             # Calendar generation
│   ├── upi.js                  # UPI utilities
│   └── catalogBackup.js        # Catalog backup helper
│
├── 📁 public/                  # Frontend files
│   ├── index.html              # Landing page
│   ├── login.html              # Login page
│   ├── register.html           # Registration
│   ├── booking.html            # User booking
│   ├── admin.html              # Admin panel
│   ├── reset-password.html     # Password reset
│   ├── manifest.webmanifest    # PWA manifest
│   ├── sw-booking.js           # Service worker for booking assets
│   └── icons/                  # PWA app icons
├── 📁 scripts/
│   ├── 📁 assets/
│   │   └── generateIcons.js
│   ├── 📁 catalog/
│   │   ├── exportAdminSettingsCatalog.js
│   │   └── restoreAdminSettingsCatalog.js
│   ├── 📁 db/
│   │   ├── clearDatabase.js
│   │   └── checkDatabase.js
│   ├── 📁 setup/
│   │   ├── createAdmin.js
│   │   ├── createEnvFile.js
│   │   └── createTestUsers.js
│   └── 📁 tests/
│       └── admin_booking_smoke_test.ps1
└── 📁 backups/
  └── 📁 catalog/
    └── latest-admin-settings-catalog.json
```

---

## 🌍 Environment Variables

### Required Variables
```bash
# Core Application
NODE_ENV=production|development
PORT=5000
BASE_URL=https://your-domain.com

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
DB_NAME=jamroom_booking

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=30d

# Email (Gmail SMTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-specific-password
```

### Optional Variables
```bash
# Development
DEBUG=true
LOG_LEVEL=debug

# Additional Email Settings
EMAIL_FROM_NAME=JamRoom Studio
EMAIL_REPLY_TO=support@jamroom.com
```

---

## 📝 Recent Changes & Modifications

### Latest Changes (March 2026)

#### 0. UI Tracking Single Source Clarification
**Updated**:
- UI unification phase status/checklist tracking is maintained in `docs/plans/DESIGN_UNIFICATION_TRACKER.md`.
- `docs/reference/SYSTEM_DOCUMENTATION.md` remains canonical for architecture, APIs, models, and system behavior.

#### 1. Multi-Recipient eBill Delivery
**Added**:
- `POST /api/admin/bookings/:id/send-ebill` supports customer + custom recipient delivery
- Recipient validation, normalization, and deduplication
- Response now includes final `recipients` list

#### 2. Admin Item-Level Booking Edit
**Updated**:
- `PUT /api/admin/bookings/:id/edit` supports full `rentals[]` updates
- Server-side subtotal/tax/total recalculation for edit safety
- Backward-compatible path retained for legacy subtotal/tax/total payloads

#### 3. Admin Booking Workflow Hardening
**Updated**:
- Admin create booking requires registered user selection (`userId`)
- Inline user create/reset/delete flows added to support create-booking pipeline
- Admin-created bookings are enforced as `CONFIRMED` with payment tracking (`PENDING|PARTIAL|PAID`) supported on create/edit
- Historical override mode allows bypassing date/time conflict checks for missed-bill backfill entries
- Confirmation recipients are merged from always-notify list, settings admin emails, and admin users

#### 4. Direct Mobile Booking Flow
**Updated**:
- Mobile flow now uses `/booking.html` directly (legacy booking-mobile shell removed)
- `/manifest.webmanifest` and `/sw-booking.js` remain for installability/performance support
- Responsive behavior is handled through shared and page-level CSS without iframe embedding

#### 5. Rental UX Consistency and Defaults
**Updated**:
- Booking rental list now matches admin-style base/child row alignment and controls
- Default base selection standardized: only `JamRoom (Base)` auto-selected

#### 6. UPI Launch Compatibility Update
**Updated**:
- Replaced app-specific deep-link dependence (`phonepe://`, `tez://`, etc.) in user flows
- Standardized to universal `upi://pay` with share/copy/QR fallback actions

#### 7. Shared Navigation And Header Consistency
**Updated**:
- Unified shared `app-header` and `main-nav` behavior through `public/js/shared/navigation.js`.
- Standardized navigation ordering and active-link treatment across core pages.
- Moved header actions (theme/logout/tests) into right-side header action area.
- Added authenticated greeting line below brand/subtitle.

#### 8. Booking Width And Mobile Payment UI Hardening
**Updated**:
- Removed booking-specific container width override so booking page matches shared shell width.
- Added mobile-safe constraints for payment toast/dialog components in shared CSS.
- Verified key pages `public/admin.html`, `public/account.html`, and `public/booking.html` have `style=` count `0`.

#### 9. Undo Recovery Validation
**Updated**:
- Re-applied and validated key UI changes after accidental undo (header action placement, greeting line, booking width consistency).

#### 10. Navigation Fallback Hardening
**Updated**:
- Shared navigation adds delayed fallback rendering so menu does not remain stuck on loading.
- Fallback guest navigation is rendered when auth bootstrap is delayed or interrupted.

#### 11. Auth Timeout + Cached Session Fallback
**Updated**:
- Auth check now uses abort timeout protection.
- Cached user (`jamroom_user` / legacy `user`) can be used for safe UI continuity during transient network failures.

#### 12. Refresh-Safe Draft Persistence
**Updated**:
- User booking form now autosaves/restores mode/date/time/rentals/notes and clears draft after successful booking submit.
- Admin create-booking and user-management forms now autosave/restore drafts and clear drafts on successful submit.

#### 13. Admin Special Price Override
**Updated**:
- Admin create/edit booking supports `priceAdjustmentType` (`none|discount|surcharge`), `priceAdjustmentAmount`, and optional `priceAdjustmentNote`.
- Signed value is persisted as `priceAdjustmentValue` and final total is computed as `subtotal + taxAmount + signedAdjustment`.
- Adjustment details are shown in admin booking detail/table views and included in PDF/eBill summaries.

---

### Latest Changes (May 2026)

#### 0. Booking + Payment UX/Status Parity Updates
**Updated**:
- Hourly bookings use explicit start/end selections in UI and compute duration from selected range for pricing/payload.
- Flat-rate session/track categories (`persession`, `pertrack`) bypass hourly scheduling UI and run start-date-only booking flow.
- Per-day return-date changes no longer reset selected pickup time.
- Post-booking payment options are shown in a modal popup (`booking-payment.js`) instead of inline page section.
- My Bookings now shows payment progress (paid vs remaining) and supports Details popup per booking.
- Rejected bookings in Admin Manage Bookings and My Bookings hide payment-pending badge and show rejected status only.

#### 1. Book Now / My Bookings / Lesson Tracker — Route Segregation (Phase 1 Complete)
**Goal**: Reduce initial load cost of `booking.html` by removing embedded booking history and class tracker. Separate creation intent from management intent at the route level.

**New Pages Added**:
| Page | Path | Responsibility |
|---|---|---|
| My Bookings | `/my-bookings.html` | Booking history, billing/PDF actions, class tracker entry |
| Lesson Tracker | `/lesson-tracker.html` | Class-only filtered booking view, lesson status and follow-up actions |

**New JS Modules Added**:
- `public/js/booking/my-bookings-main.js` — bootstrap for My Bookings page; calls `window.loadMyBookings()`.
- `public/js/booking/lesson-tracker-main.js` — bootstrap for Lesson Tracker page; calls `window.loadLessonTrackerBookings()`.

**New CSS Added**:
- `public/css/pages/my-bookings.css` — page-scoped layout styles for My Bookings.

**Changes to Existing Files**:
- `public/booking.html`: removed My Bookings section markup and `booking-bookings.js` include; updated to single-column creation-only layout.
- `public/js/booking/booking-bookings.js`: hardened to be context-safe — exits gracefully when booking-form DOM elements are absent; safe to reuse on Account, My Bookings, and Lesson Tracker pages without Book Now context.
- `public/js/booking/booking-bookings.js`: added `loadMyBookings(options)` with optional class-only filter for Lesson Tracker use.
- `public/js/shared/navigation.js`: added `/my-bookings.html` route detection and active-link support.

**Architecture Rule**:
- `booking.html` owns: booking create form, availability, pricing preview, payment reveal after submit.
- `my-bookings.html` owns: history list, booking actions (cancel/pay/bill), class tracker entry.
- `lesson-tracker.html` owns: class-only bookings, lesson status, follow-up actions.
- Neither `my-bookings.html` nor `lesson-tracker.html` should load booking-creation dependencies.

**Phase 2+ (Pending)**:
- Admin route segregation: `admin.html` → lightweight dashboard shell + dedicated feature pages (`admin-bookings.html`, `admin-users.html`, `admin-settings.html`, etc.).
- Book Now internal split: defer per-day/class/payment modules until the relevant flow is active.
- Full plan: `docs/plans/ADMIN_BOOKNOW_SEGREGATION_MIGRATION_PLAN.md`.

---

#### 2. User Role And Role-Aware UI — Migration Plan Established
**Goal**: Introduce multi-value experience roles so the UI can adapt to class students, JamRoom booking users, per-day renters, and band representatives without changing the existing authorization model.

**Model Design**:
- `role` field (`user | admin`) on `User` model is unchanged and remains the source of auth authorization.
- New fields proposed to add to `User` model:
  - `experienceRoles: [String]` — multi-value, enum-based (e.g. `jamroom_booking`, `music_class_student`, `equipment_rental_customer`, `band_representative`).
  - `primaryExperienceRole: String` — optional; drives default landing and tab ordering.
  - `roleAssignments: [{ code, status, source, assignedAt, notes }]` — tracks how roles were assigned.
  - `rolePreferences: { defaultLanding, showRoleQuickLinks, preferredDashboard }` — optional personalization settings.

**Assignment Flows Planned**:
- Registration: optional role self-selection.
- My Account: role update UI.
- Admin Users: admin role assignment.
- Backfill: infer from existing booking data (`classSession.isClassBooking`, `bookingMode`, `rentals[].rentalType`).

**Implementation Status**: Plan established, implementation not yet started. Full plan: `docs/plans/USER_ROLE_UI_MIGRATION_PLAN.md`.

**Key Constraint**: Keep `role` untouched for auth in Phase 1. Add `experienceRoles` additively without renaming or removing existing auth fields.

---

#### 3. Per-Track Booking Category — No Date/Time/Availability Flow
**Added**:
- Categories with `rentalType: 'pertrack'` that have **no binding** to a session/inhouse category now skip the hourly scheduling UI entirely.
- Added `isPerTrackBookingCategory(categoryName)` in `booking-rentals.js` — returns `true` only when the category is `pertrack` AND is not bound to any `persession`/`inhouse` category via `bookingCategoryBindings.pairs`.
- Added `refreshHourlySchedulingVisibility()` — hides `#hourlyDateGroup`, `#hourlyAvailabilityView`, `#hourlyTimeContainer` and clears required/disabled states when per-track applies.
- `populateStartTimeSlots()`, `loadAvailability()`, `displayAvailability()` all short-circuit for per-track with a "No schedule needed" message.
- `buildBookingFormPayload()` skips date/time validation for per-track; sends backend-safe fallbacks (`date=today`, `startTime='09:00'`).
- `bindBookingDateChange()` skips availability loading for per-track.
- Added IDs to booking.html hourly blocks: `hourlyDateGroup`, `hourlyAvailabilityView`, `hourlyTimeContainer`.

**Rule**: If a per-track category is bound to a session/inhouse category in a binding pair (either side), it operates within that session context and **still requires date/time**.

#### 2. Time Slot Unification — Single Source of Truth
**Updated**:
- Removed duplicate `slotRequestTimeSlots` array from `booking-bookings.js` (was identical to `allTimeSlots` in `booking-availability.js`).
- Replaced static `allTimeSlots` array in `booking-availability.js` with `buildTimeSlots(startHour, endHour)` generator function.
- Default call `buildTimeSlots()` produces 09:00–23:00 hourly slots — matches previous static array exactly.
- `buildTimeSlots` exposed as `window.buildTimeSlots`; allows future studio-hours-driven slot generation.
- `booking-bookings.js` now reads via `getSlotRequestTimeSlots()` → `window.allTimeSlots`.
- Added `booking-availability.js` load before `booking-bookings.js` on `account.html` and `my-bookings.html` to ensure `window.allTimeSlots` is defined.
- Past-time filtering, availability filtering, class/per-track short-circuits all unchanged.

#### 3. Custom Time Dropdown for `#startTime` — Viewport-Safe
**Added**:
- Native `<select id="startTime">` popup cannot be constrained via CSS (browser-controlled); it was overflowing the viewport on mobile.
- Implemented custom dropdown overlay in `booking-main.js` (`initStartTimeCustomDropdown()`):
  - Native select kept but hidden (`opacity:0; pointer-events:none`) — all existing JS (`.innerHTML`, `.value`, `.disabled`, `.required`, `change` events) works unchanged.
  - Visible trigger button (`#startTimeTrigger`) shows current value and caret.
  - Dropdown panel appended to `document.body` with `position: fixed`.
  - Positions below the trigger; auto-flips above if more space is available above.
  - `max-height` capped at 260px with scroll; never overflows viewport.
  - `MutationObserver` syncs disabled state and option repopulation from existing JS.
  - `change` events on the hidden select keep `display` text in sync.
- Styled via `.time-custom-select`, `.time-custom-trigger`, `.time-custom-panel`, `.time-custom-option` in `booking.css`.

**Pattern**: For any `<select>` whose native popup overflows viewport on mobile, use this hidden-select + fixed-panel overlay pattern rather than `size` attribute (which renders as a list box, not a dropdown).

#### 4. Per-Day Pickup Time — Scrollable List Box
**Updated**:
- `#perdayPickupTime` has 16 static options; on small screens the native popup also overflowed.
- Added `size="5"` attribute to render it as a visible scrollable list instead of a popup dropdown.
- CSS `#perdayPickupTime[size]` caps height at 160px, sets `width:100%`, `box-sizing:border-box`, `overflow-y:auto`.
- Past-time disabling from `setPerDayInputConstraints()` continues to work (disabled options appear greyed in the list).

#### 1. Calendar Location Fix
**Issue**: Calendar invites showing "Your Studio Address Here" instead of actual address
**Fix**: 
- Updated `routes/admin.routes.js` line 355
- Changed location from concatenated string to just `settings.studioAddress`
- Updated AdminSettings default address to exact specification

#### 2. Studio Name Standardization  
**Issue**: Inconsistent fallback names showing "JamRoom Studio" instead of "Swar JamRoom"
**Fix**:
- Updated all fallback names in `routes/admin.routes.js`
- Changed from `'JamRoom Studio'` to `'Swar JamRoom'`
- Affects all email subjects and organizer names

#### 3. Admin Edit/Delete Functionality *(NEW)*
**Added**:
- `DELETE /api/admin/bookings/:id` route
- `PUT /api/admin/bookings/:id/edit` route  
- Edit booking modal in admin.html
- Delete confirmation with email notifications
- Form validation and error handling

#### 4. Loading State Improvements
**Added**:
- Loading overlay for booking form submission
- Button loading states with disabled state
- Better error messages for API failures
- Responsive loading indicators

#### 5. Database Schema Updates
**Modified**:
- AdminSettings studioAddress default value
- All booking-related email templates
- Calendar invite generation parameters

### Development Notes

#### Current Issues Fixed
- ✅ Calendar location showing placeholder text
- ✅ Studio name inconsistency  
- ✅ Missing admin edit/delete functionality
- ✅ Unresponsive booking form during submission
- ✅ Settings loading errors

#### Pending Items
- 🔄 Server restart port conflicts (intermittent)
- 🔄 MongoDB index creation warnings (non-critical)

#### Testing Completed
- ✅ Booking creation flow
- ✅ Admin approval/rejection
- ✅ Calendar invite generation
- ✅ Email notifications
- ✅ Edit/Delete functionality

---

## 🔍 Debugging & Troubleshooting

### Common Issues

#### 1. Server Won't Start
```bash
# Check for running processes
Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force

# Clear port and restart
taskkill /f /im node.exe
node server.js
```

#### 2. Database Connection Issues
```javascript
// Check MongoDB URI in config/db.js
// Verify network access to MongoDB Atlas
// Check IP whitelist in MongoDB Atlas
```

#### 3. Email Not Sending
```javascript
// Verify EMAIL_* environment variables
// Check Gmail app password (not regular password)
// Ensure less secure apps enabled (if using regular Gmail)
```

#### 4. Calendar Invites Issues
```javascript
// Check settings.studioAddress is not empty
// Verify studioName fallback values
// Test calendar generation with debug logs
```

### Debug Commands
```bash
# Check settings
curl -H "Authorization: Bearer <token>" http://localhost:5000/api/admin/debug-settings

# Test email
curl -X POST -H "Content-Type: application/json" -d '{"to":"test@example.com","subject":"Test","html":"Test"}' http://localhost:5000/api/test-email

# Check booking creation
curl -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"date":"2026-01-25","startTime":"14:00","duration":2,"rentalType":"JamRoom"}' http://localhost:5000/api/bookings
```

---

## � Enhanced Rental System - Technical Implementation

### Database Migration (December 2024)
The rental system was enhanced with the following database changes:

**Migration Script**: `updateInstrumentRentals.js`
- Updated AdminSettings to include hierarchical rental structure
- Added rentalType enum: ['inhouse', 'perday']
- Added perdayPrice field for flat-rate rentals
- Created sub-items for JamRoom category (mics, jacks, IEM)
- Created dual variants for Instrument Rentals (in-house vs per-day)

**Example Data Structure**:
```javascript
// JamRoom Category
{
  name: "JamRoom",
  basePrice: 300,
  subItems: [
    { name: "Microphone", price: 0, rentalType: "inhouse" },
    { name: "Audio Jacks", price: 0, rentalType: "inhouse" },
    { name: "IEM", price: 50, rentalType: "inhouse" }
  ]
}

// Instrument Rentals Category
{
  name: "Instrument Rentals",
  basePrice: 0,
  subItems: [
    { name: "Guitar (In-house)", price: 200, rentalType: "inhouse" },
    { name: "Guitar (Per-day)", price: 0, rentalType: "perday", perdayPrice: 800 },
    { name: "Keyboard (In-house)", price: 300, rentalType: "inhouse" },
    { name: "Keyboard (Per-day)", price: 0, rentalType: "perday", perdayPrice: 800 }
  ]
}
```

### Frontend Implementation Details

**Key Files Modified**:
1. `public/booking.html` - Complete UI overhaul with collapsible categories
2. `public/admin.html` - Enhanced rental type management interface
3. `routes/booking.routes.js` - Fixed validation for price=0 items

**Critical UI Logic**:
```javascript
// Smart Quantity Control Logic
function updateQuantity(itemId, change) {
    const item = document.getElementById(itemId);
    // JamRoom base: always fixed at 1
    if (itemId === 'jamroom-base-quantity') return;
    
    // Free items: limit to 4
    if (isFreeItem(itemId) && currentQty >= 4 && change > 0) return;
    
    // Per-day items: allow quantities
    if (isPerDayItem(itemId)) {
        // Allow quantity changes
    }
    
    // In-house instruments: typically fixed at 1
    // Exception: IEM can have quantities
}

// Price Calculation Logic
function calculatePrice(item, quantity, duration) {
    if (item.rentalType === 'perday') {
        return item.perdayPrice * quantity; // No duration factor
    } else {
        return item.price * quantity * duration; // Duration-based
    }
}
```

### Testing & Quality Assurance

**Module Test Page**: `public/test-modules.html`
- Shared module loading checks (`utils`, `alerts`, `auth`, `tabs`, `payment`, `data`)
- UI component rendering checks against shared CSS tokens
- Quick sanity checks for common client-side helpers
- Lightweight browser smoke validation before deeper flow tests

**Comprehensive Test Suite**: `public/test.html`
- API endpoint testing
- Frontend function validation
- Integration test scenarios
- Enhanced rental system verification

**Key Test Cases**:
1. JamRoom base fixed quantity behavior
2. Free add-ons quantity limits (max 4)
3. IEM special case (quantity + duration-tied)
4. In-house vs per-day pricing differences
5. Collapsible category functionality
6. Real-time price updates
7. Complex booking scenarios

### Utility Scripts Documentation

**Environment & Setup**:
- `createEnvFile.js` - Interactive environment variable setup with secure defaults
- `.env.example` - Template file for manual environment configuration

**Database Management**:
- `clearDatabase.js` - Selective or complete database clearing
- `checkDatabase.js` - Database status and health verification
- `updateInstrumentRentals.js` - Rental system migration/enhancement

**User Management**:
- `createAdmin.js` - Default admin account creation
- `createTestUsers.js` - Test account generation for automated testing
- Admin Users tab (`POST /api/admin/make-admin`) - User privilege elevation

**Usage Patterns**:
```bash
# First-time setup
node scripts/setup/createEnvFile.js            # Setup environment variables
node scripts/db/clearDatabase.js --all         # Complete reset
node scripts/setup/createAdmin.js              # Setup admin
node scripts/catalog/updateInstrumentRentals.js  # Apply enhancements

# Development cycle
node scripts/db/clearDatabase.js              # Clear bookings only
node scripts/db/checkDatabase.js              # Verify clean state
# Run tests and development
node scripts/catalog/updateInstrumentRentals.js  # Apply enhancements

# Testing preparation
node scripts/setup/createTestUsers.js         # Create test accounts
# Access test pages: /test.html, /test-modules.html
```

## �📚 Additional Resources

### Documentation Files
- `README.md` - Project overview and quick start
- `docs/reference/API_DOCUMENTATION.md` - Detailed API reference
- `docs/guides/SETUP_GUIDE.md` - Environment setup instructions
- `docs/reference/TESTING_CHECKLIST.md` - Testing procedures
- `docs/guides/DEPLOYMENT.md` - Deployment instructions
- `docs/plans/DESIGN_UNIFICATION_TRACKER.md` - Canonical UI design-unification phase and progress tracker

### External Dependencies
- **FullCalendar.js**: Calendar UI in admin panel
- **ical-generator**: Calendar invite generation
- **Nodemailer**: Email sending
- **bcryptjs**: Password hashing
- **jsonwebtoken**: JWT tokens
- **mongoose**: MongoDB ODM

---

## 🔄 Update Instructions

**When making changes to this system:**

1. **Update this document** with:
   - New API endpoints
   - Modified database schemas
   - New environment variables
   - Process flow changes
   - Bug fixes and solutions

2. **Test changes** with:
   - All affected user flows
   - Email notifications
   - Calendar invite generation
   - Admin functionality

3. **Document in Recent Changes** section:
   - Date of change
   - Issue description
   - Solution implemented
   - Files modified

**Single source ownership:**
- `docs/reference/SYSTEM_DOCUMENTATION.md`: Architecture, APIs, models, and runtime behavior.
- `docs/reference/DEVELOPER_REFERENCE.md`: Coding standards, naming conventions, and implementation patterns.
- `docs/plans/DESIGN_UNIFICATION_TRACKER.md`: UI unification progress, phases, and checklist status.

---

## 🚀 SYSTEM CLEANUP & OPTIMIZATION (January 2026)

### Complete Application Cleanup Summary

The JamRoom application underwent a comprehensive cleanup to eliminate redundancies, standardize naming conventions, and create a unified, maintainable codebase.

#### **MAJOR ISSUES RESOLVED**

**🔴 REDUNDANT SERVERS ELIMINATED**
- ❌ **Before**: Multiple conflicting servers (Node.js Port 5000, Python HTTP Port 8080, Obsolete backend Port 5000)
- ✅ **After**: Single unified Node.js server (`server.js`) on Port 5000
- ✅ **Result**: Eliminated port conflicts and deployment confusion

**🔴 PDF GENERATION SYSTEM UNIFIED**  
- ❌ **Before**: Duplicate HTML templates, inconsistent styling, manual time conversions, pricing calculation duplicated
- ✅ **After**: Unified PDF template system with shared HTML template
- ✅ **Files Created**: 
  - `utils/pdfHTMLTemplate.js` - Server-side unified template
  - `public/js/pdfHTMLTemplate.js` - Client-side unified template
- ✅ **Result**: Consistent PDF generation across server and client

**🔴 NAMING INCONSISTENCIES STANDARDIZED**
- ❌ **Before**: `rentalType` vs `rentals` confusion, `price` vs `totalAmount` mismatches, mixed time formats
- ✅ **After**: Standardized variable names across all files
- ✅ **Result**: Consistent codebase with clear variable meanings

**🔴 TEST FILE REDUNDANCY REMOVED**
- ❌ **Before**: Multiple test files with overlapping functionality
- ✅ **After**: Streamlined to essential test files only
- ✅ **Result**: Clear testing strategy with no duplicate tests

#### **CLEANUP IMPLEMENTATION DETAILS**

**PDF System Unification**:
- Created shared HTML template with consistent styling
- Unified time formatting using 12-hour format throughout
- Standardized pricing display with ₹ symbol and proper decimals
- Eliminated duplicate PDF generation logic

**Server Consolidation**:
- Deprecated `backend/index.js` with clear warning messages
- Consolidated all functionality to main `server.js`
- Updated all documentation to reference single server
- Removed Python HTTP server dependencies

**Variable Standardization**:
- `rentalType` → Consistent usage for rental category selection
- `price` fields → Standardized to `totalAmount` where appropriate
- `bookingStatus` → Clear distinction from `paymentStatus`
- Time formats → Consistent 12-hour format (HH:MM AM/PM)

**Code Quality Improvements**:
- Added comprehensive error handling
- Implemented consistent logging
- Standardized API response formats
- Enhanced input validation

#### **FINAL SYSTEM STATE**

**✅ UNIFIED ARCHITECTURE**
- Single Node.js server handling all requests
- Unified PDF generation system with shared templates  
- Consistent variable naming across all components
- Streamlined file structure with clear separation of concerns

**✅ PRODUCTION-READY CODEBASE**
- Eliminated all redundancies and conflicts
- Consistent error handling and logging
- Unified styling and user experience
- Clear documentation and comments

**✅ MAINTENANCE BENEFITS**
- Single source of truth for all functionality
- Consistent development patterns
- Reduced cognitive overhead for developers
- Easier to extend and modify

**✅ TESTING & VERIFICATION**
- Comprehensive test suite covering all functionality
- Unified test approach with clear scenarios
- Verified PDF generation works correctly
- All server endpoints tested and working

This cleanup transformed the JamRoom application from a collection of redundant components into a unified, professional, production-ready booking system.

---

*Document Version: 2.1 | Last Updated: March 8, 2026 (Includes UI tracking ownership and shared nav/header consistency updates)*

---

## 🛠 PDF BILL SECTIONS — ADMIN-MANAGED GROUPING (May 2026)

### Overview

PDF bills are now fully driven by admin-configured section assignments rather than hardcoded keyword rules. Admins can define sections (e.g., "Studio Usage", "Music Classes"), assign catalog items to each section, and all generated PDFs — quotations, booking bills, and admin downloads — will respect those assignments.

---

### New Admin UI: PDF Bill Sections Tab

**Location:** Admin → Settings → 📄 PDF Sections tab

**Features:**
- Create/remove sections with key, icon, title, subtitle, and sort order
- Assign catalog items (whole categories or individual sub-items) to each section
- No duplication: once a category or sub-item is assigned to a section it is hidden from all other pickers
- Category↔sub-item conflict prevention: assigning a whole category hides its sub-items and vice versa
- Default section selector for items that don't match any assignment

**Stored in:** `AdminSettings.serviceGroupingConfig` — fields: `defaultGroupKey`, `groups[]`, `categoryRules[]`, `catalogAssignments[]`

---

### Schema — `catalogAssignments` (added to `AdminSettings`)

```js
catalogAssignments: [{
  groupKey: String,          // section key, e.g. 'studio'
  assignmentType: String,    // 'category' | 'subitem'
  categoryName: String,      // catalog rental type name
  itemName: String           // sub-item name (only for assignmentType='subitem')
}]
```

---

### Classification Priority

`classifyServiceItem()` in both `utils/shared/quotationBilling.js` and `public/js/shared/quotation-billing.js` applies rules in this order:

1. **Explicit catalog assignments** (`catalogAssignments`) — highest priority, admin-managed
2. **Legacy keyword rules** (`categoryRules`) — fallback if no assignment matches
3. **`rentalType`-based default** — `persession`/`pertrack` → `production`, else `defaultGroupKey`

---

### Rental Item Enrichment (Booking Bills)

Booking rental items stored in MongoDB carry only `name`, `price`, `quantity`, `rentalType` — no `category` field. Without `category`, catalog assignment matching would silently fail.

**Fix in `utils/billGenerator.js`:**
- Added `buildCatalogItemCategoryMap(settings)` — maps item name (lowercase) → parent catalog category name
- `enrichBookingRentalsWithCatalogTypes()` now also populates `category` on each rental item from this map before the HTML template is called
- Applied to all server-side PDF paths: user download, admin download, email-attached bill

---

### Class Plan Booking Category Resolution

Class plan bookings build a synthetic service item from `classSession`. Previously the item always had `category: 'Class Plans'` (a hardcoded string that never exists in the catalog), causing it to always fall into the default section.

**Fix in `utils/pdfHTMLTemplate.js` and `public/js/pdfHTMLTemplate.js`:**
- Added `resolveClassItemCategory(itemName)` — searches `settings.rentalTypes` for the catalog category that contains the class item name (e.g. "Keyboard" resolves to its parent category)
- Class plan item now uses the resolved category, so PDF section assignments on catalog items apply correctly to class bookings

**Resolution order:**
1. `classSession.itemCategory` (if stored)
2. Catalog lookup by `selectedClassItemName || instrument`
3. Fallback: `'Class Plans'`

---

### `showAlert` Arrow Function Fix

**File:** `public/admin.html` (~line 1210)

**Bug:** `showAlert` was an arrow function using `arguments.length` to detect whether it was called as `showAlert(elementId, message, type)` (3-arg legacy) or `showAlert(message, type)` (2-arg). Arrow functions do not bind `arguments` — this threw `ReferenceError: arguments is not defined` on every settings save.

**Fix:** Renamed third param to `typeArg` (no default). Detection now uses `typeArg !== undefined`:
```js
const showAlert = (elementIdOrMessage, messageOrType, typeArg) => {
    const isThreeArg = typeArg !== undefined;
    const message = isThreeArg ? messageOrType : elementIdOrMessage;
    const alertType = isThreeArg ? (typeArg || 'info') : (messageOrType || 'info');
    if (window.alertManager) {
        window.alertManager.show(String(message || ''), String(alertType || 'info'));
    }
};
```

---

### Files Changed

| File | Change |
|---|---|
| `public/admin.html` | Added 📄 PDF Sections settings tab; fixed `showAlert` arrow function |
| `models/AdminSettings.js` | Added `catalogAssignments` subdoc to `serviceGroupingConfig` schema |
| `utils/shared/quotationBilling.js` | `classifyServiceItem` uses catalog assignments as priority 1 |
| `public/js/shared/quotation-billing.js` | Same as server version (UMD browser build kept in sync) |
| `utils/billGenerator.js` | `buildCatalogItemCategoryMap` + enriches rental `category` field before PDF generation |
| `utils/pdfHTMLTemplate.js` | Class plan item resolves category from catalog instead of hardcoded `'Class Plans'` |
| `public/js/pdfHTMLTemplate.js` | Same fix as server template |
| `public/css/pages/admin.css` | Added PDF Sections tab styles using design system tokens |

---

*Document Version: 2.2 | Last Updated: May 6, 2026 (PDF Bill Sections admin UI, catalog-driven grouping, booking/class enrichment, showAlert fix)*