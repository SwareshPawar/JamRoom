# Next Gen JamRoom Migration Plan

Last Updated: May 1, 2026

## Goal
- Evolve JamRoom from a booking-only product into a community-driven music platform.
- Add a public community feed, open jam session discovery, approval-based join workflows, richer artist profiles, band creation and band collaboration, and unified notifications.
- Keep the current Node.js + Express + Mongoose + vanilla JS stack unless a later phase proves a stronger architectural need.

## Product Vision
- A registered artist can showcase their skills and profile.
- A registered artist can create an open jam session post for others to discover.
- Other artists can browse the feed, request to join, explain what they will contribute, and wait for approval.
- The creator can approve, reject, and discuss participation through structured in-app messaging.
- Artists can create bands, invite members, and only add them after the invited user approves.
- Bands can collaborate internally, receive shared notifications, and make bookings with band context.
- Admin has full moderation and operational control across posts, comments, jam sessions, bands, messages, and notifications.

## User Experience Summary

### Community Feed
- Lives on the home page below the existing sections.
- Publicly visible for browsing.
- Login required for posting, liking, commenting, joining a jam session, creating a band, or responding to invites.
- Infinite-scroll feed continues loading until no more posts remain.

### Post Types
- Open Jam Session
- Performance Link Post
- Text / Help / Community Post

### Social Interactions
- Likes on eligible posts.
- Comments on posts.
- Creator-owned moderation for their own posts.
- Admin override moderation everywhere.

### Messaging
- Async in-app thread per jam-session join request.
- Async in-app thread per band invite or band activity discussion where relevant.
- No real-time chat requirement in the first implementation.

### Notifications
- In-app notification badge and panel.
- Email notifications for important approval events.
- WhatsApp notifications for important approval events where existing Twilio flow applies.

## Delivery Principles
- Reuse the existing auth system and route style.
- Keep the first release operationally simple: async messaging, not real-time chat.
- Prefer denormalized snapshots where the existing codebase already follows that pattern.
- Keep public browsing separate from authenticated interaction.
- Build admin moderation in the first version, not as a later afterthought.
- Make each phase deployable behind feature flags where practical.

## Phase 1: Platform Foundations And Data Model

### Objectives
- Add the core schemas and route surfaces needed for community, jam participation, messaging, notifications, and bands.
- Extend user profiles so artists can present useful public information.

### Data Model Changes

#### Update `models/User.js`
- Add `bio`
- Add `skills` as free-form tags
- Add `socialLinks` for showcase links
- Add public-profile oriented fields as needed for future expansion:
  - `city`
  - `genres`
  - `instruments`
  - `profileVisibility`

#### New `models/CommunityPost.js`
- `type`: `jam_session | performance_link | text`
- `author`
- `authorSnapshot`
- `title`
- `content`
- `mediaUrl`
- `mediaType`: `youtube | instagram`
- `likes`
- `likesCount`
- `comments`
- `commentsCount`
- `status`
- `createdAt`, `updatedAt`

#### Jam Session Structure Inside `CommunityPost`
- `jamSession.date`
- `jamSession.time`
- `jamSession.locationText`
- `jamSession.genre`
- `jamSession.description`
- `jamSession.maxParticipants`
- `jamSession.status`: `open | full | cancelled | closed`
- `jamSession.participants[]` with:
  - `userId`
  - `name`
  - `skillsSnapshot`
  - `requestMessage`
  - `status`: `pending | approved | rejected | withdrawn`
  - `requestedAt`
  - `respondedAt`

#### New `models/MessageThread.js`
- Used for structured async conversations.
- Covers both jam join requests and band-related discussions.
- Fields:
  - `threadType`: `jam_join | band_invite | band_internal | booking_context`
  - `communityPostId` when tied to a jam session
  - `bandId` when tied to a band
  - `participants`
  - `participantSnapshots`
  - `subject`
  - `messages[]`
  - `status`
  - `createdAt`, `updatedAt`

#### New `models/Notification.js`
- `userId`
- `type`
- `fromUserId`
- `fromUserName`
- `communityPostId`
- `bandId`
- `threadId`
- `text`
- `read`
- `createdAt`

#### New `models/Band.js`
- `name`
- `slug`
- `createdBy`
- `ownerId`
- `bio`
- `genres`
- `city`
- `members[]`
- `memberCount`
- `bookingContactMode`
- `isActive`
- `createdAt`, `updatedAt`

#### New `models/BandInvite.js`
- Approval-based membership is modeled explicitly.
- Fields:
  - `bandId`
  - `invitedUserId`
  - `invitedByUserId`
  - `roleLabel`
  - `inviteMessage`
  - `status`: `pending | approved | rejected | cancelled | expired`
  - `respondedAt`
  - `createdAt`

### API And Route Changes

#### New `routes/community.routes.js`
- Public feed endpoints.
- Authenticated post creation and interaction endpoints.
- Jam join request endpoints.
- Comment and like endpoints.
- Message thread endpoints.
- Notification endpoints.

#### New `routes/band.routes.js`
- Create band.
- Update own band.
- Invite user to band.
- Approve or reject band invite.
- List my bands.
- Get band details.
- Leave band.
- Remove member from band.
- Band messaging thread access.
- Band-aware booking handoff endpoints.

#### Update `routes/profile.routes.js`
- Accept `bio`, `skills`, `socialLinks`, and band-relevant public profile details.

#### Update `routes/admin.routes.js`
- Add admin community moderation endpoints.
- Add admin band oversight endpoints.

#### Update `server.js`
- Mount `/api/community`
- Mount `/api/bands`

### Operational Notes
- Add indexes for feed ordering, notification unread counts, and pending band invite lookups.
- Add lightweight validation for supported performance links.
- Add feature flags for `communityEnabled` and `bandsEnabled` in admin settings if rollout control is desired.

## Phase 2: Rich Profiles And Artist Identity

### Objectives
- Make user accounts useful for discovery, matching, and collaboration.
- Ensure creators and invitees can evaluate each other before approving jam or band participation.

### Account Experience Changes
- Expand `public/account.html` profile tab to include:
  - Bio
  - Skills tags
  - Genres
  - Instruments / contribution types
  - Showcase links
  - City / location text

### Public Profile Presentation
- Surface profile snapshot data in:
  - Community post cards
  - Jam session participant requests
  - Band member lists
  - Messaging threads

### Band Identity Foundations
- Allow a user to:
  - Create a band
  - Give it a name and description
  - See current members
  - Track pending invites
- Membership is not immediate.
- A band member is only added after explicit approval by the invited user.

### Frontend Work
- Update profile save flow to persist the new fields.
- Add tag-entry UI for skills.
- Add profile summary cards that can later be reused in community and band views.

## Phase 3: Community Feed And Posting System

### Objectives
- Launch the Facebook-style scrollable wall on the home page.
- Support the three initial post types with a stable, paginated feed.

### Feed Placement
- Add the feed below existing home page content in `public/index.html`.

### Post Types

#### Open Jam Session Post
- Creator defines:
  - Title
  - Date / time
  - Location text
  - Genre
  - Description
  - What contributors are needed
  - Maximum participant count

#### Performance Link Post
- Supports recognized embeds for:
  - YouTube
  - Instagram

#### Text / Help Post
- General discussion, help requests, collab notes, or announcements.

### Frontend Work
- New feed renderer.
- Infinite scroll.
- Post creation modal.
- Login-gated interactions.
- Like and comment interactions.
- Own-post controls for edit/delete scope where permitted.

### Backend Work
- Paginated feed endpoint.
- Create post endpoint.
- Single post fetch.
- Like toggle.
- Comment add/remove.
- Post delete rules.

## Phase 4: Open Jam Session Join And Approval Workflow

### Objectives
- Turn open jam posts into structured collaboration requests.
- Give creators approval control and structured discussion before acceptance.

### User Flow
- Logged-in user finds an open jam session.
- User taps request to join.
- User submits what they will contribute.
- System creates:
  - Pending participant record on the jam post
  - Async message thread between creator and requester
  - Notification to creator
- Creator can:
  - Review requester's profile snapshot and skills
  - Discuss contribution through messaging
  - Approve or reject the request
- Requester receives result notifications.

### Notifications In This Phase
- In-app notifications for:
  - New join request
  - Join approved
  - Join rejected
- Email and WhatsApp notifications for the same approval-critical events.

### Frontend Work
- Join-request modal.
- Creator approval controls on own jam posts.
- Request status badges.
- Thread view for jam discussions.

## Phase 5: Messaging And Notifications Layer

### Objectives
- Provide a simple but complete async communication system.
- Centralize alerts for jam sessions, invites, approvals, comments, and band activity.

### Messaging Scope
- Jam join threads
- Band invite threads
- Band internal discussion threads
- Booking-context threads for band coordination if needed

### Notification Scope
- New jam join requests
- Join approval / rejection
- New comments on relevant posts
- Band invite received
- Band invite approved / rejected
- Band booking created or updated
- Important band member changes

### Frontend Work
- Notification bell in shared navigation.
- Notification panel with unread count.
- Messages tab in account page.
- Thread list and thread detail view.

### Backend Work
- Notification creation helpers.
- Mark-as-read endpoints.
- Message thread list and post endpoints.

## Phase 6: Band Creation, Membership Approval, And Collaboration

### Objectives
- Let artists form bands inside the platform.
- Keep membership approval-based.
- Allow a band to coordinate and act as a collaborative booking unit.

### Band Creation Flow
- Any logged-in eligible user can create a band.
- Creator sets:
  - Band name
  - Description
  - Genres
  - City
  - Initial identity / showcase details

### Approval-Based Member Add Flow
- Creator or authorized band manager selects a registered user to invite.
- Invited user gets:
  - In-app notification
  - Optional email / WhatsApp notification
  - Invite thread context showing who invited them and why
- Invited user approves or rejects.
- Only after approval:
  - User is added to `Band.members`
  - All members are notified

### Band Collaboration Features
- Band detail page / panel shows:
  - Member list
  - Pending invites
  - Internal message thread
  - Shared updates
- Band members can talk internally through async band threads.
- Band-level activity notifications go to all current members.

### Booking With Band Context
- Add a booking option for:
  - Booking as an individual
  - Booking on behalf of a band
- Band booking captures:
  - `bandId`
  - `bandNameSnapshot`
  - who created the booking
  - which members were notified
- All current band members receive band-booking notifications.
- Creator/admin can later decide whether band bookings require explicit member confirmation before final submission.

### Data / API Changes In This Phase
- Extend booking model and booking routes to support optional band-linked bookings.
- Add band thread endpoints.
- Add membership and invite management endpoints.

## Phase 7: Admin Moderation And Operational Control

### Objectives
- Ensure admins can control all user-generated and collaborative activity.

### Admin Capabilities
- View and moderate all community posts.
- Remove any comment.
- View jam session participation requests.
- Override jam request approval decisions if needed.
- View all bands, members, and pending invites.
- Cancel abusive or invalid band invites.
- Remove users from bands administratively.
- Review message thread metadata when required for moderation or support.
- Audit notification and approval flows.

### Admin UI Work
- New admin community management section.
- New admin band management section.
- Filters for post type, status, band status, invite status, and date.

## Phase 8: Rollout, Hardening, And Quality Gates

### Technical Validation
- Pagination correctness.
- Feed performance on long scroll sessions.
- Notification unread count accuracy.
- Authorization rules for post ownership, band ownership, and admin overrides.
- Validation of supported media URLs.
- Booking flow regression tests with and without `bandId`.

### UX Validation
- Public users can browse but cannot interact.
- Logged-in users can clearly understand pending vs approved states.
- Band invite and jam join approval states are unambiguous.
- Mobile layouts remain usable at 360, 390, 480, 768 widths.

### Operational Guardrails
- Rate-limit post creation, comments, likes, invites, and messaging.
- Add abuse controls for spammy band invites and spammy jam posts.
- Add future-ready hooks for reporting and blocking if community activity grows.

## New Files Expected
- `models/CommunityPost.js`
- `models/MessageThread.js`
- `models/Notification.js`
- `models/Band.js`
- `models/BandInvite.js`
- `routes/community.routes.js`
- `routes/band.routes.js`
- `public/js/community/community-feed.js`
- `public/js/community/community-post-create.js`
- `public/js/community/community-messages.js`
- `public/js/community/community-notifications.js`
- `public/js/bands/band-main.js`
- `public/js/bands/band-invites.js`
- `public/js/admin/admin-community.js`
- `public/js/admin/admin-bands.js`
- `public/css/pages/community.css`
- `public/css/pages/bands.css`

## Existing Files Expected To Change
- `models/User.js`
- `models/Booking.js`
- `server.js`
- `routes/profile.routes.js`
- `routes/admin.routes.js`
- `routes/booking.routes.js`
- `public/index.html`
- `public/account.html`
- `public/admin.html`
- `public/booking.html`
- `public/js/shared/navigation.js`

## Release Order Recommendation
- Release 1:
  - Phases 1 and 2
- Release 2:
  - Phases 3 and 4
- Release 3:
  - Phase 5
- Release 4:
  - Phase 6
- Release 5:
  - Phases 7 and 8

## Scope Boundaries For First Version
- No real-time websocket chat.
- No follower graph.
- No direct messages outside jam / band / booking contexts.
- No media upload pipeline for images or audio in v1.
- No threaded nested comments in v1.
- No public reporting workflow in v1 unless moderation load demands it.

## Success Criteria
- Artists can discover and join open jam sessions through a feed.
- Creators can review, discuss, and approve participants.
- Users can present a richer skill-based identity.
- Bands can be created with approval-based membership.
- Bands can coordinate internally and book with shared awareness.
- Admin can moderate and override the full system safely.