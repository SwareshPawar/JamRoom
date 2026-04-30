'use strict';

const fs = require('fs');
const path = require('path');

const CATALOG_BACKUP_VERSION = 1;
const DEFAULT_LATEST_FILENAME = 'latest-admin-settings-catalog.json';

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeSettingsObject = (settings) => {
  if (!settings) {
    return {};
  }

  if (typeof settings.toObject === 'function') {
    return settings.toObject({ depopulate: true, versionKey: false });
  }

  return clone(settings);
};

const buildCatalogSnapshot = (settings) => {
  const source = normalizeSettingsObject(settings);
  const exportedAt = new Date().toISOString();

  return {
    version: CATALOG_BACKUP_VERSION,
    source: 'AdminSettings',
    exportedAt,
    settingsUpdatedAt: source.updatedAt || null,
    catalog: {
      studio: {
        studioName: source.studioName || '',
        studioAddress: source.studioAddress || '',
        studioPhone: source.studioPhone || '',
        businessHours: clone(source.businessHours || {}),
        slotDuration: source.slotDuration || 60
      },
      billing: {
        upiId: source.upiId || '',
        upiName: source.upiName || '',
        gstConfig: clone(source.gstConfig || {}),
        adminEmails: clone(source.adminEmails || [])
      },
      rentals: {
        rentalTypes: clone(source.rentalTypes || []),
        bookingCategoryBindings: clone(source.bookingCategoryBindings || { pairs: [] }),
        savedQuotations: clone(source.savedQuotations || [])
      },
      marketing: {
        instagramEmbeds: clone(source.instagramEmbeds || [])
      },
      notifications: {
        whatsappNotifications: clone(source.whatsappNotifications || {})
      }
    }
  };
};

const extractCatalogPayload = (input) => {
  const source = clone(input || {});

  if (source.catalog) {
    return {
      studioName: source.catalog?.studio?.studioName || '',
      studioAddress: source.catalog?.studio?.studioAddress || '',
      studioPhone: source.catalog?.studio?.studioPhone || '',
      businessHours: clone(source.catalog?.studio?.businessHours || {}),
      slotDuration: source.catalog?.studio?.slotDuration || 60,
      upiId: source.catalog?.billing?.upiId || '',
      upiName: source.catalog?.billing?.upiName || '',
      gstConfig: clone(source.catalog?.billing?.gstConfig || {}),
      adminEmails: clone(source.catalog?.billing?.adminEmails || []),
      rentalTypes: clone(source.catalog?.rentals?.rentalTypes || []),
      bookingCategoryBindings: clone(source.catalog?.rentals?.bookingCategoryBindings || { pairs: [] }),
      savedQuotations: clone(source.catalog?.rentals?.savedQuotations || []),
      instagramEmbeds: clone(source.catalog?.marketing?.instagramEmbeds || []),
      whatsappNotifications: clone(source.catalog?.notifications?.whatsappNotifications || {})
    };
  }

  return {
    studioName: source.studioName || '',
    studioAddress: source.studioAddress || '',
    studioPhone: source.studioPhone || '',
    businessHours: clone(source.businessHours || {}),
    slotDuration: source.slotDuration || 60,
    upiId: source.upiId || '',
    upiName: source.upiName || '',
    gstConfig: clone(source.gstConfig || {}),
    adminEmails: clone(source.adminEmails || []),
    rentalTypes: clone(source.rentalTypes || []),
    bookingCategoryBindings: clone(source.bookingCategoryBindings || { pairs: [] }),
    savedQuotations: clone(source.savedQuotations || []),
    instagramEmbeds: clone(source.instagramEmbeds || []),
    whatsappNotifications: clone(source.whatsappNotifications || {})
  };
};

const summarizeCatalogPayload = (payload) => ({
  rentalTypeCount: Array.isArray(payload?.rentalTypes) ? payload.rentalTypes.length : 0,
  savedQuotationCount: Array.isArray(payload?.savedQuotations) ? payload.savedQuotations.length : 0,
  bindingPairCount: Array.isArray(payload?.bookingCategoryBindings?.pairs)
    ? payload.bookingCategoryBindings.pairs.length
    : 0,
  instagramEmbedCount: Array.isArray(payload?.instagramEmbeds) ? payload.instagramEmbeds.length : 0,
  adminEmailCount: Array.isArray(payload?.adminEmails) ? payload.adminEmails.length : 0,
  whatsappContactCount: Array.isArray(payload?.whatsappNotifications?.notificationNumbers)
    ? payload.whatsappNotifications.notificationNumbers.length
    : 0
});

const ensureDirectory = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const safeTimestamp = (isoString) => String(isoString).replace(/[:.]/g, '-');

const exportCatalogBackup = (settings, options = {}) => {
  const snapshot = buildCatalogSnapshot(settings);
  const backupDir = options.backupDir || path.join(process.cwd(), 'backups', 'catalog');
  const latestFileName = options.latestFileName || DEFAULT_LATEST_FILENAME;
  const timestampFileName = `catalog-backup-${safeTimestamp(snapshot.exportedAt)}.json`;
  const latestPath = path.join(backupDir, latestFileName);
  const timestampPath = path.join(backupDir, timestampFileName);

  ensureDirectory(backupDir);

  const fileContents = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(timestampPath, fileContents, 'utf8');
  fs.writeFileSync(latestPath, fileContents, 'utf8');

  const payload = extractCatalogPayload(snapshot);

  return {
    snapshot,
    latestPath,
    timestampPath,
    summary: summarizeCatalogPayload(payload)
  };
};

const readCatalogBackupFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

module.exports = {
  CATALOG_BACKUP_VERSION,
  DEFAULT_LATEST_FILENAME,
  buildCatalogSnapshot,
  extractCatalogPayload,
  summarizeCatalogPayload,
  exportCatalogBackup,
  readCatalogBackupFile
};