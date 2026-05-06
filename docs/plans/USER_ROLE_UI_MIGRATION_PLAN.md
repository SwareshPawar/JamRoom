# User Role And Role-Aware UI Migration Plan

Last Updated: May 6, 2026

## Goal
- Introduce multi-role user profiles so JamRoom can adapt the interface to how a user actually uses the product.
- Keep the current admin authorization model stable while adding a separate role system for user experience, navigation, and account workflows.
- Support role assignment from registration, My Account, and admin tools.
- Make the UI easier for class students, JamRoom booking users, and mixed-use customers without forcing one generic interface on everyone.

## Why This Change Is Needed
- The current user model only supports a single authorization role: `user | admin`.
- The current frontend mostly treats every non-admin user the same.
- JamRoom now supports multiple product experiences in one account:
  - JamRoom bookings
  - music class bookings and lesson tracking
  - per-day equipment rentals
- Class users especially need faster access to lesson tracking and class-related actions, while JamRoom booking users need quicker access to booking, catalog, and payment flows.
- Some users will belong to more than one category at the same time, so a single user type is not enough.

## Current State Analysis

### Current User Data Model
- `models/User.js` stores a single `role` field with `user | admin`.
- That field is currently being used for authorization and coarse UI branching.
- There is no concept of multiple product roles, no primary experience preference, and no assignment metadata.

### Current Auth And Session Surfaces
- `routes/auth.routes.js` returns `role` in login and registration responses.
- `routes/profile.routes.js` returns `role` in the profile payload.
- `public/js/shared/auth.js` caches the current user and derives `isAdmin` from `role === 'admin'`.

### Current Navigation And UI Behavior
- `public/js/shared/navigation.js` shows a mostly common menu for all authenticated users.
- Only admin gets a special navigation branch.
- `public/account.html` uses static tabs: Profile, My Bookings, Password, Settings.
- `public/js/booking/booking-bookings.js` already has class-specific booking rendering and lesson tracker UI, but it is still nested inside the generic booking experience.

### Existing Data We Can Reuse For Migration
- `models/Booking.js` already distinguishes booking patterns we can use for backfill:
  - `classSession.isClassBooking`
  - `bookingMode`
  - `rentals[].rentalType`
  - `bandName`

## Core Design Principle

### Separate Authorization From Experience Roles
- Keep `role` for system authorization in the first migration phase.
- Add a new multi-value role system for product experience.
- Do not overload the existing `role` field with UX behavior.

This avoids breaking current admin middleware and lets us introduce personalized UI in an additive, low-risk way.

## Proposed Role Model

### 1. Authorization Role
- Continue using the existing field for permissions:
  - `user`
  - `admin`

This remains the source of truth for admin access checks during the migration.

### 2. Experience Roles
- Add a new multi-role array on the user record for product behavior.

Recommended initial role set:
- `jamroom_booking`
  - User primarily books JamRoom sessions or in-house studio services.
- `music_class_student`
  - User is enrolled in music classes and needs lesson tracking, weekly schedule visibility, and class-specific shortcuts.
- `equipment_rental_customer`
  - User mainly rents catalog items on a per-day basis and benefits from faster access to rental history and catalog views.
- `band_representative`
  - User often books on behalf of a band/group and benefits from group-oriented shortcuts and future collaboration features.

### 3. Optional Future Roles
- These should not block the first rollout, but the schema should allow adding them later.
- `parent_guardian`
- `teacher`
- `event_client`
- `community_member`

## Recommended Data Model Changes

### User Schema Additions
Add the following fields to `models/User.js`:

- `experienceRoles: [String]`
  - Enum-based array.
  - Supports multiple values on one user.

- `primaryExperienceRole: String`
  - Optional but useful for default landing behavior and tab ordering.

- `roleAssignments: [{ ... }]`
  - Tracks how a role was assigned.
  - Proposed fields:
    - `code`
    - `status: active | pending | removed`
    - `source: self_selected | admin_assigned | inferred | migrated`
    - `assignedByUserId`
    - `assignedAt`
    - `notes`

- `rolePreferences`
  - Proposed nested settings:
    - `defaultLanding`
    - `showRoleQuickLinks`
    - `preferredDashboard`

### Backward Compatibility Rule
- Keep `role` untouched in Phase 1.
- Add `experienceRoles` without removing or renaming any existing auth behavior.
- Only after the new role system is stable should we consider renaming `role` to `systemRole` internally.

## Proposed Assignment Flows

### Registration Flow
Update `public/register.html` and `POST /api/auth/register` to support role selection.

Recommended UX:
- Keep registration simple.
- Ask a short question such as:
  - `How will you use JamRoom?`
- Allow multi-select checkboxes:
  - `JamRoom Booking`
  - `Music Classes`
  - `Equipment Rentals`
  - `Band / Group Bookings`

Behavior:
- Save selections into `experienceRoles`.
- If nothing is selected, default to `jamroom_booking` or leave empty and prompt later after login.

### My Account Flow
Update `public/account.html` and `PUT /api/profile` so users can manage their own experience roles.

Recommended UX:
- Add a `My Roles` section under Profile or a dedicated `Roles` tab.
- Let users:
  - add or remove supported roles
  - choose a primary role
  - save default landing preferences

Guardrails:
- Users can manage experience roles.
- Users cannot grant themselves `admin`.

### Admin Assignment Flow
Update admin users management so admins can:
- assign roles directly
- remove roles
- set primary role
- review inferred roles created by migration scripts

This should be added to the existing admin user CRUD flow in `routes/admin/users.routes.js` and corresponding admin UI.

## Role-Aware UI Strategy

## Navigation Model
The top navigation should remain stable and recognizable, but add role-aware shortcuts.

### Shared Base Navigation
- Home
- Book Now
- Catalog
- Payment Info
- My Account

### Role-Aware Additions

#### For `music_class_student`
- Add `Lesson Tracker` as a first-class navigation item after `Book Now`.
- Optionally add `My Classes` as the account landing tab.

#### For `equipment_rental_customer`
- Emphasize `Catalog` and `My Rentals` style shortcuts.

#### For `band_representative`
- Add future-ready quick access to band/group bookings when that feature exists.

## Account Page Behavior
Current `public/account.html` is fixed-tab. It should become role-aware.

### Shared Tabs For All Authenticated Users
- Profile
- Password
- Settings

### Role-Driven Tabs

#### For `jamroom_booking`
- `My Bookings`

#### For `music_class_student`
- `My Bookings`
- `Lesson Tracker`
- later optionally `My Classes`

#### For `equipment_rental_customer`
- `My Bookings`
- later optionally `My Rentals`

### Mixed-Role Users
If a user has multiple experience roles:
- Show the union of relevant tabs.
- Order tabs based on `primaryExperienceRole`.
- Do not duplicate the same data surface under multiple names.

Example:
- A user with `jamroom_booking + music_class_student` sees:
  - Profile
  - My Bookings
  - Lesson Tracker
  - Password
  - Settings

## Booking Page Behavior
`public/booking.html` should stay as the booking hub, but its shortcuts and default panels should adapt.

### For `jamroom_booking`
- Default focus remains booking form and my bookings.

### For `music_class_student`
- Add a `Lesson Tracker` entry near or after `Book Now` in main navigation.
- Add class-focused shortcuts in the booking shell if present.
- Prefer class-oriented views when the user navigates from class-related surfaces.

### For Multi-Role Users
- Keep one page, not separate duplicated pages.
- Use tabs, quick links, and default expanded panels instead of fragmenting the app.

## API Changes

### `POST /api/auth/register`
- Accept `experienceRoles`.
- Validate against allowed enums.
- Return `experienceRoles` and `primaryExperienceRole` in the response payload.

### `POST /api/auth/login`
- Return the new role payload alongside the legacy auth role.

### `GET /api/auth/me`
- Include:
  - `role`
  - `experienceRoles`
  - `primaryExperienceRole`
  - `rolePreferences`

### `GET /api/profile`
- Include the same role-aware payload so the account page can render properly.

### `PUT /api/profile`
- Allow self-service updates to experience roles and role preferences.
- Consider server-side restrictions if some roles require admin approval later.

### Admin User Endpoints
Update `routes/admin/users.routes.js` to support:
- create user with initial experience roles
- update user experience roles
- set primary experience role
- audit role assignment source

## Frontend Changes By Surface

### `public/js/shared/auth.js`
- Cache and expose `experienceRoles` and `primaryExperienceRole`.
- Add helpers such as:
  - `hasExperienceRole(code)`
  - `getPrimaryExperienceRole()`

### `public/js/shared/navigation.js`
- Stop treating `role` as the only UI branching input.
- Build navigation from:
  - auth role
  - experience roles
  - page context

### `public/account.html`
- Replace fixed-tab assumptions with role-driven tab rendering.
- Add a role-management section or dedicated roles tab.

### `public/booking.html`
- Add role-aware quick links and tab entries.
- For `music_class_student`, expose `Lesson Tracker` as a first-class path instead of burying it inside booking details.

### `public/js/booking/booking-bookings.js`
- Reuse current lesson tracker rendering for class users.
- Split tracker access from the generic booking-only flow when the user has the class role.

## Data Migration Strategy

## Phase 0: Additive Schema Migration
- Add new fields without deleting or renaming existing ones.
- Deploy schema and response changes first.

## Phase 1: Backfill Existing Users
Create a migration script to infer roles from current data.

Recommended inference rules:
- If a user has any booking with `classSession.isClassBooking === true`, add `music_class_student`.
- If a user has any booking with non-class bookings or standard JamRoom bookings, add `jamroom_booking`.
- If a user has bookings with `rentals[].rentalType === 'perday'`, add `equipment_rental_customer`.
- If a user has repeated `bandName` usage, flag for admin review before assigning `band_representative` automatically.

### Migration Source Attribution
- Backfilled roles should use:
  - `source: migrated`
  - or `source: inferred`

### Manual Review Bucket
- Any uncertain assignments should be reported rather than silently applied.
- This is especially important for `band_representative`.

## Delivery Phases

## Phase 1: Schema And API Foundation
Deliverables:
- Add `experienceRoles`, `primaryExperienceRole`, and `roleAssignments` to `User`.
- Update auth/profile/admin responses.
- Preserve all legacy admin auth behavior.

## Phase 2: Assignment Workflows
Deliverables:
- Registration multi-select role input.
- My Account role management UI.
- Admin user role assignment UI and endpoints.

## Phase 3: Session And Navigation Personalization
Deliverables:
- Update session payload usage in `auth.js`.
- Update `navigation.js` to inject role-based links and ordering.
- Add role-aware landing rules.

## Phase 4: Account And Booking UI Personalization
Deliverables:
- Role-based account tabs.
- Dedicated `Lesson Tracker` access for class users.
- Better shortcuts for JamRoom bookings and equipment rental users.

## Phase 5: Migration Cleanup And Optimization
Deliverables:
- Run backfill scripts.
- Review uncertain assignments.
- Add analytics or logs to understand role adoption.
- Decide whether the legacy `role` naming should remain as-is or be renamed to `systemRole` later.

## Recommended Tab And Landing Rules

### Primary Landing Selection
Use the following default order when `primaryExperienceRole` is absent:
1. `music_class_student`
2. `jamroom_booking`
3. `equipment_rental_customer`
4. `band_representative`

Reason:
- Class students have the strongest repeated tracking need.
- JamRoom booking users still need the booking flow prominently.

### Default Tab Behavior
- If user has `music_class_student`, prefer a direct route to lesson tracking from the main nav.
- If user only has `jamroom_booking`, keep `Book Now` as the core entry.
- If user has multiple roles, keep shared navigation but add role-relevant shortcuts.

## Risks And Guardrails

### Risk: Breaking Admin Auth
- Guardrail: keep `role` for permission logic in the first rollout.

### Risk: Over-personalizing Too Early
- Guardrail: keep a stable base navigation and add role-specific shortcuts rather than replacing the whole information architecture.

### Risk: Incorrect Auto-Assignment
- Guardrail: use conservative backfill logic and admin review for ambiguous roles.

### Risk: Frontend Drift Across Pages
- Guardrail: centralize role-aware rendering in shared auth/navigation helpers and shared booking/account modules.

## Testing Plan

### Backend Tests
- Registration with one experience role.
- Registration with multiple experience roles.
- Login response includes roles.
- `GET /api/auth/me` includes role-aware payload.
- Profile update persists role changes safely.
- Admin can assign and edit roles.

### Migration Tests
- Users with class bookings receive `music_class_student`.
- Users with standard bookings receive `jamroom_booking`.
- Users with per-day rental history receive `equipment_rental_customer`.
- Admin accounts retain admin permissions after migration.

### Frontend Tests
- Guest navigation remains unchanged.
- Admin navigation remains unchanged except for added role-aware fields.
- JamRoom-only user sees booking-focused experience.
- Class user sees lesson tracker tab/link.
- Multi-role user sees merged tabs in sensible order.

## Recommended First Implementation Scope
- Do not try to redesign the whole product in one pass.
- First implementation should deliver:
  - additive DB fields
  - registration + account + admin assignment
  - role-aware `auth.js` and `navigation.js`
  - `Lesson Tracker` tab/link for class users
  - role-aware account tab ordering

This is the minimum slice that creates visible value without destabilizing the rest of the app.

## Open Decisions
- Should self-selected `music_class_student` be immediately active, or require admin confirmation?
- Should `band_representative` be self-selectable in Phase 1 or admin-only?
- Should a user with no roles be auto-assigned `jamroom_booking` by default?
- Should Lesson Tracker be a main nav item, an account tab, or both for class users?
- Should primary role drive redirect after login, or only reorder UI within the same pages?

## Recommendation
- Proceed with a two-layer role system:
  - keep `role` for authorization
  - add `experienceRoles[]` for personalized UI
- Start with four experience roles:
  - `jamroom_booking`
  - `music_class_student`
  - `equipment_rental_customer`
  - `band_representative`
- Ship the first visible experience win as:
  - registration role selection
  - My Account role management
  - admin role assignment
  - `Lesson Tracker` top-level access for class users
  - role-aware account tabs and landing order

This gives JamRoom a scalable user-personalization model without breaking the existing admin/user security model.