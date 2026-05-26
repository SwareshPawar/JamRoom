# Contact, Email, and Phone Source Audit (2026-05-26)

## Scope
This audit tracks contact-source cleanup for email and phone/WhatsApp usage across JamRoom.

Included:
- Runtime backend/frontend code
- Models and defaults
- Setup/test scripts
- Environment variables used by code

Separated reference-only scope:
- Documentation examples
- Backup JSON snapshots

## Current Status Snapshot
As of 2026-05-26, Phase 1 runtime cleanup is completed for core production paths.

Temporary operational decision:
- WhatsApp sending is disabled globally until provider integration is revisited.

Canonical source-of-truth targets:
- User-facing WhatsApp CTA: settings.publicContact.whatsappNumber
- Public phone: settings.publicContact.phone
- Public contact email: settings.publicContact.email
- Admin notification emails: settings.adminEmails
- Provider sender channel (infra): process.env.TWILIO_WHATSAPP_NUMBER

## Progress Tracker

### Phase 1: Runtime hardcoded/fallback cleanup
Status: Completed

Completed items:
1. Removed hardcoded defaults in settings model/bootstrap
- models/AdminSettings.js

2. Removed provider number hardcoded fallbacks
- utils/whatsapp.js

3. Removed booking/public contact fallback chain to non-canonical sources
- routes/booking.routes.js

4. Removed hardcoded defaults in admin WhatsApp settings route
- routes/admin/whatsapp.routes.js

5. Removed hardcoded owner admin email checks
- routes/admin/users.routes.js
- utils/adminHelpers.js
- public/admin.html

6. Removed hardcoded admin seed email
- server.js

7. Removed hardcoded WhatsApp setup link number in account UI
- public/js/account/account-main.js

8. Removed hardcoded quote phone fallback and aligned WhatsApp source
- utils/billGenerator.js

9. Updated test-route fallbacks to use configured/admin settings values
- routes/test.routes.js
- routes/profile.routes.js

10. Updated admin form placeholders to generic format
- public/admin.html

Verification done:
- Targeted hardcoded-value scans on runtime folders (server.js, models, routes, utils, public/js) no longer show prior production literals.
- Error checks for edited files show no syntax/lint issues.

### Phase 1B: Non-production cleanup (setup/test/demo/docs)
Status: In Progress

Open residuals intentionally left outside production runtime:
1. Demo/test page literals
- public/whatsapp-test.html

2. Documentation examples still contain historical/sample contacts
- docs/guides/WHATSAPP_SETUP.md
- docs/guides/SETUP_GUIDE.md
- README.md

3. Backup snapshots contain historical values (expected)
- backups/catalog/*.json

Completed in Phase 1B so far:
1. Setup script neutralization
- scripts/setup/createAdmin.js now uses env-driven values:
  - DEFAULT_ADMIN_NAME
  - DEFAULT_ADMIN_EMAIL
  - DEFAULT_ADMIN_PASSWORD
- scripts/setup/createTestUsers.js now uses env-driven values:
  - TEST_USER_EMAIL, TEST_USER_MOBILE, TEST_USER_PASSWORD
  - TEST_ADMIN_EMAIL, TEST_ADMIN_MOBILE, TEST_ADMIN_PASSWORD
- Removed personal hardcoded email literals from setup scripts.

2. WhatsApp sending rollback (temporary)
- utils/whatsapp.js converted to no-op responses so no provider calls are made.
- routes/test.routes.js WhatsApp test/config endpoints now return disabled status.
- public/whatsapp-test.html updated to disabled state UI.
- routes/profile.routes.js WhatsApp preference/setup endpoints now return disabled behavior.
- public/js/account/account-main.js WhatsApp setup controls disabled in account UI.

## Next Steps (Started)

### Immediate next execution batch
Status: Ready to execute next

1. Setup script neutralization
- Replace personal/hardcoded setup emails with placeholders/env-driven values in:
  - scripts/setup/createAdmin.js
  - scripts/setup/createTestUsers.js
Status: Completed

2. Demo/test page sanitization
- Replace hardcoded phone defaults in:
  - public/whatsapp-test.html
Status: Completed

3. Docs consistency update
- Update setup/deployment docs to reflect DEFAULT_ADMIN_EMAIL and settings-driven contact flow:
  - docs/guides/SETUP_GUIDE.md
  - docs/guides/DEPLOYMENT.md
  - docs/guides/WHATSAPP_SETUP.md
  - README.md
Status: Next

### Phase 2 preparation (after Phase 1B)
Status: Planned

Note:
- Re-enabling WhatsApp later will require restoring provider integration in utils/whatsapp.js and reactivating profile/test UI flows.

1. Introduce centralized resolver
- Add utils/contactResolver.js with:
  - getPublicContact(settings)
  - getOwnerAdminEmail(settings)

2. Migrate route/template callsites to resolver
- Replace repeated inline contact derivation logic.

3. Add save-time validation guardrails
- Enforce publicContact data quality in admin settings update flow.

## Risks and Notes
1. Some setup/test scripts may still intentionally use sample literals for local onboarding; convert them to placeholders without breaking local DX.
2. TWILIO sender now requires explicit env configuration; environments without TWILIO_WHATSAPP_NUMBER will fail fast (intended behavior).
3. Backups and docs should remain auditable but clearly marked as examples/non-runtime.

## Verification Checklist
1. Runtime files do not contain previous hardcoded production phone/email literals.
2. User-facing WhatsApp CTA in email templates resolves from settings.publicContact.whatsappNumber.
3. Booking/public contact APIs expose publicContact values as canonical source.
4. Admin-delete owner gating derives from admin settings, not personal hardcoded email.
5. Syntax/error checks pass for edited runtime files.
