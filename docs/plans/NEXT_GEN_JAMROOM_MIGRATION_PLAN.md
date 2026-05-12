# Next Gen JamRoom Migration Plan

Last Updated: May 12, 2026

## Goal
Evolve JamRoom from a booking-only product into a community-aware music platform — starting with a single, focused feature: **Open JamRoom Sessions**.

The first release is deliberately minimal. Bands, artist profiles, a standalone community feed, and messaging are deferred to later phases once the Open Session feature is stable and well-used.

## Product Vision (Long-term)
- Artists can mark a booking as an open jam session so others can discover it.
- A scrollable session/community wall lives on the home page.
- Users can create bands, invite members with approval-based flows, and book as a band.
- Admin has full moderation control over all user-generated content.

The current work covers **Phase 1 only**.

---

## Phase 1: Open JamRoom Session (Current MVP)

### Overview
When a user creates a booking, they can optionally flag it as an **Open JamRoom Session**. Once admin approves the booking, this session is surfaced on the home page and on a dedicated sessions page. Other logged-in users can interact with it.

This is a booking-integrated feature — it does not require a separate community post model. The open session data lives on the `Booking` model.

---

### User Experience

#### Booking Creation
- During booking, the user sees an optional toggle: **"Make this an Open JamRoom Session"**.
- When toggled on, the user can optionally provide:
  - A short caption / description (what the session is about)
  - A media URL (YouTube or Instagram link) — auto-detected and embedded, Facebook wall-style
- Everything else (date, time, studio, duration) is already captured by the booking form.

#### Home Page — Open Sessions Section
- If at least one approved open session exists, a section titled **"Open JamRoom Sessions"** appears on the home page **above** the Instagram showcase.
- If no approved open sessions exist, the section is completely hidden — no empty state shown.
- Each session is shown as a compact card displaying:
  - Session date and time
  - Booked-by user's **first name** (shown only after admin approval)
  - Short caption (if provided)
  - Auto-embedded video preview thumbnail if a media URL was provided
- Cards are clickable to expand inline or navigate to the session detail page.

#### Session Detail Page (`/open-sessions.html`)
- Independent page listing all active approved open sessions.
- Each session shows the full detail:
  - Date, time, studio name
  - Booker's first name
  - Caption
  - Embedded video (YouTube iframe or Instagram embed auto-detected from URL)
  - Comments and presence markers from other users

#### Session Interactions (logged-in users only)
- **Mark Presence**: a logged-in user can tap "I'll be there" or similar to indicate they plan to attend/participate.
- **Comment**: a short comment can be posted under the session.
- Presence markers and comment authors show the user's first name only.
- No approval workflow required for presence/comments in Phase 1.

#### Admin Approval
- When a booking with `isOpenSession: true` is approved by admin, the session automatically becomes visible on the home page and sessions page.
- Admin can see all open session bookings in the admin panel (filtered view).
- Admin can remove the open session flag or hide a session independently of the booking status if needed.

---

### Data Model Changes

#### Update `models/Booking.js`
Add the following fields:
- `isOpenSession`: Boolean, default `false`
- `openSession.caption`: String (optional short description from user)
- `openSession.mediaUrl`: String (optional YouTube or Instagram URL)
- `openSession.mediaType`: String, enum `['youtube', 'instagram', null]` — auto-detected from URL on save
- `openSession.comments`: Array of `{ userId, firstName, text, createdAt }`
- `openSession.presenceMarkers`: Array of `{ userId, firstName, markedAt }`
- `openSession.hiddenByAdmin`: Boolean, default `false` — allows admin to hide without cancelling booking

---

### API Changes

#### Update `routes/booking.routes.js`
- Accept `isOpenSession`, `openSession.caption`, `openSession.mediaUrl` in the booking creation payload.
- Auto-detect and set `openSession.mediaType` from the URL on save.

#### New endpoints in `routes/booking.routes.js` (or a new `routes/openSession.routes.js`)
- `GET /api/open-sessions` — returns all approved, non-hidden open sessions (public, no auth required)
- `POST /api/open-sessions/:bookingId/presence` — toggle presence marker (auth required)
- `POST /api/open-sessions/:bookingId/comments` — add a comment (auth required)
- `DELETE /api/open-sessions/:bookingId/comments/:commentId` — delete own comment (auth required)

#### Update `routes/admin/bookings.routes.js`
- Add `PATCH /api/admin/bookings/:id/hide-session` — admin toggle to hide/show an open session independently.

---

### Frontend Changes

#### `public/booking.html` + `public/js/booking/`
- Add optional toggle UI for "Make this an Open JamRoom Session".
- Conditionally show caption and media URL fields when toggled on.

#### `public/index.html`
- Add `<section id="openSessionsSection">` placed **before** the Instagram showcase section.
- Section is rendered only when at least one approved open session is returned from the API.

#### New `public/js/home/open-sessions.js`
- Fetches `GET /api/open-sessions` on page load.
- If response is empty, hides the section entirely.
- Renders compact session cards.
- Handles click-to-expand and link to `/open-sessions.html`.
- Auto-detects YouTube / Instagram media URL and renders embedded preview.

#### New `public/open-sessions.html`
- Independent page listing all approved open sessions.
- Full card layout: date/time, first name, caption, embedded media, comments, presence.
- Logged-in users can post comments and mark presence directly on this page.

#### New `public/js/open-sessions/open-sessions-page.js`
- Drives the `/open-sessions.html` page.
- Fetches session list, renders full cards.
- Handles comment submission and presence toggle with auth check.

#### New `public/css/pages/open-sessions.css`
- Card styles, embedded media container, comment thread styles, presence badge.

#### `public/admin.html` + `public/js/admin/`
- Add a filter/view in admin bookings to show only open session bookings.
- Show session caption and media URL in admin booking detail.
- Add hide/show toggle for admin to control session visibility independently.

---

### New Files (Phase 1)
- `public/open-sessions.html`
- `public/js/home/open-sessions.js`
- `public/js/open-sessions/open-sessions-page.js`
- `public/css/pages/open-sessions.css`

### Existing Files Changed (Phase 1)
- `models/Booking.js` — add `isOpenSession` and `openSession` subdocument fields
- `routes/booking.routes.js` — accept open session fields at creation
- `routes/admin/bookings.routes.js` — add admin hide/show endpoint
- `public/booking.html` — open session toggle UI
- `public/index.html` — open sessions section before Instagram
- `public/admin.html` — open session filter and controls

### Scope Boundaries For Phase 1
- No separate CommunityPost model — open session data lives on Booking.
- No artist profile expansion.
- No bands.
- No in-app messaging or notification panel.
- No likes — only presence markers and comments.
- No media upload — URL paste only (YouTube / Instagram auto-embed).
- No nested/threaded comments — flat list only.
- No real-time updates — standard page load/submit.
- Admin approves the booking as normal; session visibility is automatic on booking approval.

### Success Criteria For Phase 1
- User can mark a booking as an open session during creation.
- Approved open sessions appear on the home page above Instagram when at least one exists.
- Sessions page shows full detail with embedded media, comments, and presence.
- Logged-in users can comment and mark presence.
- Admin can hide individual sessions independently.

---

## Phase 2: Rich Artist Profiles (Deferred)

### Objectives
- Expand user accounts with bio, skills tags, genres, instruments, and showcase links.
- Surface profile snapshots on open session cards and future community posts.

*Details to be defined when Phase 1 is stable.*

---

## Phase 3: Standalone Community Feed And Post Types (Deferred)

### Objectives
- Launch a Facebook-style scrollable wall on the home page beyond open sessions.
- Support multiple post types: performance link posts and text/community posts in addition to open jam sessions.
- Introduce a standalone `CommunityPost` model separate from bookings.
- Infinite-scroll paginated feed.

*Details to be defined when Phase 2 is stable.*

---

## Phase 4: Open Jam Session Join And Approval Workflow (Deferred)

### Objectives
- Allow other users to formally request to join an open session with a message.
- Give the session creator approval control.
- Introduce async message threads per join request.

*Details to be defined when Phase 3 is stable.*

---

## Phase 5: Messaging And Notifications Layer (Deferred)

### Objectives
- In-app notification panel and badge in shared navigation.
- Async message threads for jam join requests and band coordination.
- Email and WhatsApp notifications for approval-critical events.

*Details to be defined when Phase 4 is stable.*

---

## Phase 6: Band Creation, Membership, And Collaboration (Deferred)

### Objectives
- Artists can form bands inside the platform.
- Approval-based membership: invitees must accept before being added.
- Bands can coordinate internally and make bookings with band context.

*Details to be defined when Phase 5 is stable.*

---

## Phase 7: Admin Moderation And Operational Control (Deferred)

### Objectives
- Full admin moderation across all community posts, comments, bands, invites, and messages.
- Override and audit capabilities for every approval flow.

*Details to be defined as community features are built out.*

---

## Long-term Scope Boundaries
- No real-time websocket chat.
- No follower graph.
- No direct messages outside jam/band/booking contexts.
- No media upload pipeline — URL paste only.
- No threaded nested comments.
- No public reporting workflow unless moderation load demands it.

## Overall Success Criteria
- Phase 1: Open sessions are discoverable on the home page and can be interacted with.
- Phase 3+: Artists can discover and join open jam sessions through a richer community feed.
- Phase 6: Bands can be created with approval-based membership and book with shared awareness.
- All phases: Admin can moderate and override the full system safely.