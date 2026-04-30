# Catalog Backup Workflow

## Purpose
- Keep a repo-local, commit-friendly snapshot of all `AdminSettings` catalog data.
- Make it easy to restore rental catalog, saved quotations, bindings, Instagram embeds, billing metadata, and WhatsApp notification settings after accidental edits or environment rebuilds.

## What Gets Backed Up
- `rentalTypes`
- `savedQuotations`
- `bookingCategoryBindings`
- `instagramEmbeds`
- `upiId`, `upiName`
- `adminEmails`
- `whatsappNotifications`
- `studioName`, `studioAddress`, `studioPhone`
- `businessHours`
- `slotDuration`
- `gstConfig`

## Backup File Location
- Latest stable snapshot:
  - `backups/catalog/latest-admin-settings-catalog.json`
- Timestamped archive snapshots:
  - `backups/catalog/catalog-backup-<timestamp>.json`

## How To Create A Backup

### Option 1: Admin Panel Button
- Open `admin.html`
- Go to `Admin Settings`
- Click `Export Catalog Backup`
- This writes both:
  - latest file
  - timestamped archive file

### Option 2: CLI
```bash
npm run catalog:backup
```

Equivalent direct command:
```bash
node scripts/catalog/exportAdminSettingsCatalog.js
```

## How To Preview A Restore
```bash
npm run catalog:restore:preview
```

Or against a specific file:
```bash
node scripts/catalog/restoreAdminSettingsCatalog.js backups/catalog/catalog-backup-2026-04-30T20-33-37-716Z.json
```

## How To Apply A Restore
```bash
npm run catalog:restore:apply
```

Or against a specific file:
```bash
node scripts/catalog/restoreAdminSettingsCatalog.js backups/catalog/latest-admin-settings-catalog.json --apply
```

## Team Workflow
1. Change catalog/settings in admin panel.
2. Click `Export Catalog Backup`.
3. Review the updated `backups/catalog/latest-admin-settings-catalog.json` diff.
4. Commit the backup file together with any code/config changes.
5. Keep timestamped archives in the repo until you intentionally prune old history.

## Notes
- The restore script supports both the new structured backup format and older flat backup JSON files.
- This backup covers the settings-backed catalog only. It does not back up bookings, users, or other collections.
- Treat the backup files as operational configuration snapshots, not as a complete database backup strategy.