/**
 * Admin Settings Routes
 * Handles: admin settings CRUD, catalog export
 */

const express = require('express');
const path = require('path');
const router = express.Router();
const AdminSettings = require('../../models/AdminSettings');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { exportCatalogBackup } = require('../../utils/catalogBackup');

// @route   GET /api/admin/settings
// @desc    Get admin settings
// @access  Private/Admin
router.get('/settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching settings' });
  }
});

// @route   PUT /api/admin/settings
// @desc    Update admin settings
// @access  Private/Admin
router.put('/settings', protect, isAdmin, async (req, res) => {
  try {
    const {
      rentalTypes,
      bookingCategoryBindings,
      upiId,
      upiName,
      adminEmails,
      businessHours,
      slotDuration,
      studioName,
      studioAddress,
      gstConfig,
      instagramEmbeds
    } = req.body;

    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create(req.body);
    } else {
      if (rentalTypes) settings.rentalTypes = rentalTypes;
      if (bookingCategoryBindings) settings.bookingCategoryBindings = bookingCategoryBindings;
      if (upiId) settings.upiId = upiId;
      if (upiName) settings.upiName = upiName;
      if (adminEmails) settings.adminEmails = adminEmails;
      if (businessHours) settings.businessHours = businessHours;
      if (slotDuration) settings.slotDuration = slotDuration;
      if (studioName) settings.studioName = studioName;
      if (studioAddress) settings.studioAddress = studioAddress;
      if (gstConfig) settings.gstConfig = gstConfig;
      if (instagramEmbeds !== undefined) settings.instagramEmbeds = instagramEmbeds;

      await settings.save();
    }

    res.json({ success: true, message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
});

// @route   POST /api/admin/settings/export-catalog
// @desc    Export current AdminSettings-backed catalog to repo-local backup files
// @access  Private/Admin
router.post('/settings/export-catalog', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const result = exportCatalogBackup(settings);

    res.json({
      success: true,
      message: 'Catalog backup exported successfully',
      files: {
        latest: path.relative(process.cwd(), result.latestPath),
        archive: path.relative(process.cwd(), result.timestampPath)
      },
      summary: result.summary
    });
  } catch (error) {
    console.error('Export catalog backup error:', error);
    res.status(500).json({ success: false, message: 'Server error exporting catalog backup' });
  }
});

module.exports = router;
