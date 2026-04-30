'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

const AdminSettings = require('../../models/AdminSettings');
const { exportCatalogBackup } = require('../../utils/catalogBackup');

const run = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI is not set in environment');
  }

  await mongoose.connect(mongoUri);

  const settings = await AdminSettings.getSettings();
  const result = exportCatalogBackup(settings);

  console.log('Catalog backup exported successfully.');
  console.log(`Latest: ${result.latestPath}`);
  console.log(`Archive: ${result.timestampPath}`);
  console.log(`Rental types: ${result.summary.rentalTypeCount}`);
  console.log(`Saved quotations: ${result.summary.savedQuotationCount}`);
  console.log(`Binding pairs: ${result.summary.bindingPairCount}`);
  console.log(`Instagram embeds: ${result.summary.instagramEmbedCount}`);
  console.log(`WhatsApp contacts: ${result.summary.whatsappContactCount}`);

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error('Catalog export failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect errors on failure path
  }
  process.exit(1);
});