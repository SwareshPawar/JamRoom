'use strict';

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const AdminSettings = require('../../models/AdminSettings');
const {
  DEFAULT_LATEST_FILENAME,
  extractCatalogPayload,
  readCatalogBackupFile,
  summarizeCatalogPayload
} = require('../../utils/catalogBackup');

const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2).filter((arg) => arg !== '--apply');
const inputPath = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(process.cwd(), 'backups', 'catalog', DEFAULT_LATEST_FILENAME);

const printSummary = (payload, sourcePath) => {
  const summary = summarizeCatalogPayload(payload);
  console.log(`Backup file: ${sourcePath}`);
  console.log(`Rental types: ${summary.rentalTypeCount}`);
  console.log(`Saved quotations: ${summary.savedQuotationCount}`);
  console.log(`Binding pairs: ${summary.bindingPairCount}`);
  console.log(`Instagram embeds: ${summary.instagramEmbedCount}`);
  console.log(`Admin emails: ${summary.adminEmailCount}`);
  console.log(`WhatsApp contacts: ${summary.whatsappContactCount}`);
};

const applyPayloadToSettings = (settings, payload) => {
  settings.studioName = payload.studioName;
  settings.studioAddress = payload.studioAddress;
  settings.studioPhone = payload.studioPhone;
  settings.businessHours = payload.businessHours;
  settings.slotDuration = payload.slotDuration;
  settings.upiId = payload.upiId;
  settings.upiName = payload.upiName;
  settings.gstConfig = payload.gstConfig;
  settings.adminEmails = payload.adminEmails;
  settings.rentalTypes = payload.rentalTypes;
  settings.bookingCategoryBindings = payload.bookingCategoryBindings;
  settings.savedQuotations = payload.savedQuotations;
  settings.instagramEmbeds = payload.instagramEmbeds;
  settings.whatsappNotifications = payload.whatsappNotifications;
};

const run = async () => {
  const backup = readCatalogBackupFile(inputPath);
  const payload = extractCatalogPayload(backup);

  printSummary(payload, inputPath);

  if (!APPLY) {
    console.log('Preview only. Re-run with --apply to restore this catalog into MongoDB.');
    return;
  }

  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI is not set in environment');
  }

  await mongoose.connect(mongoUri);
  const settings = await AdminSettings.getSettings();
  applyPayloadToSettings(settings, payload);
  await settings.save();

  console.log('Catalog restored successfully.');
  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Catalog restore failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});