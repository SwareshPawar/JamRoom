# Open Event Feature Plan

Created: May 12, 2026

## Implementation Status

- Started: May 12, 2026
- Completed in this start phase:
  - New public page: `/open-event.html`
  - New navigation entry: **Open Events**
  - New backend foundations: `OpenEvent`, `OpenEventBooking`, public and admin Open Event routes
  - Admin Open Events tab added to `admin.html` for creating, listing, publishing, and cancelling events
  - Homepage entry point added so users can discover Open Events directly from `index.html`
  - Login/register return flow now supports `?redirect=` so users are taken back to the Open Event page after auth
  - Shared page direction established: `/open-event.html` now serves as the combined discovery page for Open Events now and Open JamRoom Sessions next
- Next implementation phase:
  - Replace the current Open JamRoom Sessions scaffold block on `/open-event.html` with live booking-backed session data
  - Add session cards, detail expansion, comments, and presence interactions

## Overview

An **Open Event** is a free public performance event created by admin. Admin defines the event (date, start time, duration). The system automatically derives 10-minute performance slots. Any registered user can claim one slot to perform. The feature lives on a standalone shareable page that handles the full experience including login and registration without leaving.

This feature is additive and isolated from existing booking/slot logic. It follows SOLID principles with dedicated models, routes, and frontend.

The public discovery direction is now:
- `/open-event.html` is the shared entry page for both Open Events and upcoming Open JamRoom Sessions.
- Open Events are implemented first.
- Open JamRoom Sessions will be added as the second content block on the same page rather than splitting discovery across multiple public pages.

---

## User Flows

### Public Visitor (not logged in)
1. Lands on `/open-event.html` via a shared link.
2. Sees upcoming Open Event details: title, date, time window, description.
3. Sees a grid/list of 10-minute performance slots with their times.
4. Slots already booked show the performer's first name and are marked unavailable.
5. Past slots (current time has passed the slot start) are dimmed and unselectable.
6. Clicking "Book this slot" redirects to login/register only when needed.
7. After login or registration, user returns to the same Open Event URL via `?redirect=` and can complete booking.

### Logged-in User
1. Lands on `/open-event.html`.
2. Sees the same slot grid — their own booked slot (if any) is highlighted.
3. Clicks an available slot → confirm dialog → booking confirmed instantly.
4. A user may only hold **one slot per event** (enforced at API level).
5. A user can cancel their own slot up until the slot start time.

### Admin
1. Admin creates an Open Event from `/admin.html` (new "Open Events" section).
2. Admin provides:
   - Title
   - Date (same date picker pattern as Book Now)
   - Start time (same time picker pattern as Book Now)
   - End time (defines duration; must be > start time; must be a multiple of 10 mins or system rounds down)
   - Description (optional)
3. System derives slot count: `floor((endMinutes - startMinutes) / 10)`.
4. Admin can publish (live) or keep draft (hidden from public page).
5. Admin can cancel an event (all slot bookings notified).
6. Admin can view who has booked each slot.

---

## Slot Availability Rules

- Slots are computed on-the-fly from event `startTime` and `endTime` — **no slot rows stored** in the database.
- A slot is identified by: `eventId` + `slotIndex` (0-based), where `slotStartTime = startTime + (slotIndex × 10 mins)`.
- Slot bookings are stored in `OpenEventBooking` model (`eventId` + `slotIndex` + `userId`).
- A slot is **unavailable** if:
  - An `OpenEventBooking` record exists for `eventId + slotIndex`, OR
  - The slot's computed start time is in the past (current IST time ≥ slotStartTime on the event date).
- Availability is checked in real-time; the public API returns the computed slot list with booking status merged in.

---

## Data Models (New Only — no existing models modified)

### `models/OpenEvent.js`

```
OpenEventSchema {
  title:        String, required
  description:  String, optional
  date:         String, YYYY-MM-DD, required
  startTime:    String, HH:MM (24-hr), required
  endTime:      String, HH:MM (24-hr), required
  slotDuration: Number, default 10 (minutes, fixed for now)
  status:       String, enum ['draft', 'published', 'cancelled'], default 'draft'
  createdBy:    ObjectId → User
  cancelledAt:  Date, nullable
  createdAt:    Date
  updatedAt:    Date
}
```

Virtuals (not stored, computed in app layer):
- `slotCount`: `floor((endMinutes - startMinutes) / slotDuration)`
- `slots[]`: Array of `{ index, startTime, endTime }` for API consumers

Indexes:
- `{ date: 1, status: 1 }` — for home page and public event page queries

---

### `models/OpenEventBooking.js`

```
OpenEventBookingSchema {
  eventId:       ObjectId → OpenEvent, required
  slotIndex:     Number, required (0-based; maps to a time deterministically)
  userId:        ObjectId → User, required
  userFirstName: String (snapshot at booking time)
  status:        String, enum ['confirmed', 'cancelled'], default 'confirmed'
  cancelledAt:   Date, nullable
  createdAt:     Date
}
```

Unique index: `{ eventId: 1, slotIndex: 1, status: 1 }` — prevents double booking a slot.
Index: `{ eventId: 1, userId: 1 }` — allows quick "has this user booked this event" check.

> **Why no separate Slot rows?**
> Slots are deterministic from the event definition. Materializing them would create N rows per event that are always in sync with the event's time range. Compute-and-merge is simpler, keeps the model lean, and is easy to understand.

---

## API Routes (New Only — new file `routes/open-event.routes.js`)

### Public Endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/open-events` | List all published, non-cancelled Open Events (upcoming or current day) |
| `GET` | `/api/open-events/:id` | Get a single Open Event with full slot list and booking status merged in |

Response for `GET /api/open-events/:id` includes:
```json
{
  "event": { ...eventFields },
  "slots": [
    {
      "index": 0,
      "startTime": "18:00",
      "endTime": "18:10",
      "status": "available | booked | past",
      "bookedByFirstName": "Rahul"   // only when status = "booked"
    }
  ]
}
```

### Authenticated Endpoints (require `protect` middleware)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/open-events/:id/book` | Book a slot. Body: `{ slotIndex }` |
| `DELETE` | `/api/open-events/:id/book` | Cancel own booking for this event |

### Admin Endpoints (require `protect` + `isAdmin` middleware)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/open-events` | Create a new Open Event |
| `PATCH` | `/api/admin/open-events/:id` | Update event (title, description, status draft→published, etc.) |
| `PATCH` | `/api/admin/open-events/:id/status` | Change event status (`draft`, `published`, `cancelled`) |
| `GET` | `/api/admin/open-events` | List all Open Events (all statuses) with booking counts |
| `GET` | `/api/admin/open-events/:id/bookings` | List all slot bookings for an event |

Admin routes live in `routes/admin/open-event.routes.js` to mirror the existing `routes/admin/bookings.routes.js` pattern.

---

## Frontend (New Files Only)

### `public/open-event.html`

Standalone shareable page. Full self-contained experience:
- Navigation bar (shared `NavigationManager` from `/js/shared/navigation.js`)
- Event header: title, date, time window, description
- Slot grid: responsive grid of 10-min slots showing time + status
- Inline auth section: shown at bottom when user not logged in and tries to interact
  - Tabs: Login / Register
  - On success: page re-hydrates (no full reload needed)
  - Supports `?event=<id>` query param so a direct link always loads the right event
  - If no `?event=` param, shows the next/current published event automatically
- Booking confirmation toast
- Cancellation button on user's own booked slot

**Time/Date display follows existing IST formatting conventions from `booking.routes.js`.**

---

### `public/js/open-event/open-event-page.js`

Single-responsibility module for the open-event page. Responsibilities:
- On load: read `?event=` param, fetch event + slots from `/api/open-events/:id` (or list if no id)
- Render slot grid
- Handle slot click (auth check → booking API call → re-render slot)
- Handle cancel (API call → re-render)
- Inline auth: lightweight login/register forms that call existing `/api/auth/login` and `/api/auth/register` endpoints, store token the same way `login.html` does, then re-hydrate

**SOLID compliance — this file is split into logical internal sections:**
- `OpenEventApi` — all fetch calls (S: only handles data fetching)
- `OpenEventRenderer` — DOM rendering (S: only handles UI)
- `OpenEventBookingController` — user interaction and state (S: orchestration only)
- `InlineAuthController` — inline login/register form logic (S: auth UX only)

---

### `public/css/pages/open-event.css`

Styles for the open event page:
- Slot grid layout (CSS Grid, responsive)
- Slot card states: available (clickable), booked (greyed with first name), past (dimmed), mine (highlighted)
- Inline auth card
- Event header section

---

### `public/js/admin/admin-open-events.js`

Admin section for managing Open Events. Responsibilities:
- List all Open Events with status badges and slot booking counts
- Create event form (date picker + time pickers matching Book Now pattern using flatpickr)
- Publish / Cancel event controls
- Drill-down: click event → view slot bookings list (who booked which slot)

---

## Open Event Section on Home Page and Open Sessions Page

Per the earlier Open JamRoom Session plan, the Open Sessions page (`/open-sessions.html`) also surfaces Open Events:
- A separate card group titled "Open Events" is shown above Open Jam Sessions (or merged in same section)
- Cards link through to `/open-event.html?event=<id>`

---

## Login/Register Redirect Handling

The page uses redirect-based auth handoff:
- If user is not logged in and tries to book a slot, they are sent to `/login.html?redirect=<open-event-url>`.
- Register link also carries forward the same redirect value.
- After successful login/register, user is taken back to the exact Open Event URL and can continue booking.

This required a small enhancement in both `login.html` and `register.html` to honor safe same-origin redirect targets.

---

## SOLID Principles Compliance

| Principle | How It Is Applied |
|-----------|------------------|
| **S – Single Responsibility** | `OpenEvent` model owns event definition only. `OpenEventBooking` model owns slot claim records only. Page JS split into Api / Renderer / BookingController / InlineAuthController classes. Admin JS separate from public JS. |
| **O – Open/Closed** | Existing `Booking`, `Slot`, `booking.routes.js`, `slot.routes.js`, `admin.routes.js` are **not modified**. New routes and models are additive. |
| **L – Liskov** | No inheritance hierarchies introduced. All new modules are self-contained. |
| **I – Interface Segregation** | Public API only exposes what a public page needs. Admin API is separate and gated. Page JS modules only expose what the controller needs. |
| **D – Dependency Inversion** | Routes depend on models via `require`, not on specific implementations. `OpenEventApi` in the frontend depends on URL contracts, not implementation details. Middleware (`protect`, `isAdmin`) is injected per-route, same as all other routes. |

---

## New Files (Complete List)

### Backend
- `models/OpenEvent.js`
- `models/OpenEventBooking.js`
- `routes/open-event.routes.js` — public + authenticated user endpoints
- `routes/admin/open-event.routes.js` — admin endpoints

### Frontend
- `public/open-event.html`
- `public/js/open-event/open-event-page.js`
- `public/js/admin/admin-open-events.js`
- `public/css/pages/open-event.css`

---

## Existing Files With Integration Changes

| File | Change |
|------|--------|
| `server.js` | Mount `/api/open-events` (public) and `/api/admin/open-events` (admin) — append-only |
| `routes/admin.routes.js` | Mount new admin Open Event sub-router — append-only |
| `public/js/shared/navigation.js` | Add Open Events nav link and page detection |
| `public/login.html` | Add safe redirect handling so login can return to shared Open Event URL |
| `public/register.html` | Add safe redirect handling so registration can return to shared Open Event URL |
| `public/index.html` | Add Open Events card/link in the upcoming events section — append-only |
| `public/open-sessions.html` (new in Open Session plan) | Include upcoming Open Events in the same page — part of that page's build |
| `public/admin.html` | Add "Open Events" nav tab/section — append-only |

Current implementation remains additive with low-risk integration points, and existing booking behavior is unchanged.

---

## Slot Booking Business Rules (Summary)

1. Only registered (logged-in) users can book a slot.
2. A user may hold at most **one confirmed slot per event**.
3. A slot is bookable only if:
   - It is `available` (no confirmed booking exists for `eventId + slotIndex`).
   - The slot's computed start time is **in the future** in IST (or equal to current minute).
4. Cancellation is allowed at any time before the slot starts.
5. Admin cancelling an event sets all its confirmed `OpenEventBooking` records to `cancelled`.
6. Slot duration is fixed at 10 minutes for now; the `slotDuration` field on `OpenEvent` is reserved for future flexibility.

---

## Date and Time Handling

- All dates stored as `YYYY-MM-DD` strings (matching `Slot` model convention).
- All times stored as `HH:MM` 24-hour strings (matching `Slot` model convention).
- All IST comparisons done server-side using the existing `process.env.TZ = 'Asia/Kolkata'` server setting.
- Frontend date/time pickers use **flatpickr** (already available as `/css/vendor/flatpickr.min.css` and the vendor JS bundle) matching the Book Now page pattern.

---

## Success Criteria

- Admin can create an Open Event with a date, start time, and end time; correct number of 10-min slots are derived.
- Published event page is accessible via a shareable link without login.
- Available and unavailable slots are visually distinct; past slots are not bookable.
- A logged-in user can book one slot; booking is reflected immediately without page reload.
- A user who is not logged in can complete login/register and return to the same Open Event URL, then book.
- A user cannot book a second slot in the same event.
- Admin can view who booked each slot.
- Admin can cancel an event.
- No existing booking, slot, or admin functionality is affected.
