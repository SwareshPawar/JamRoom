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

const resolveDeletedFilterMode = (value) => {
  const normalized = String(value || 'active').trim().toLowerCase();
  if (normalized === 'deleted') return 'deleted';
  if (normalized === 'all') return 'all';
  return 'active';
};

const applyDeletedFilter = (items, mode) => {
  const list = Array.isArray(items) ? items : [];
  if (mode === 'all') return list;
  if (mode === 'deleted') return list.filter((item) => Boolean(item?.deletedAt));
  return list.filter((item) => !item?.deletedAt);
};

const filterSettingsForClient = (settingsDoc, mode) => {
  const settings = settingsDoc?.toObject ? settingsDoc.toObject() : (settingsDoc || {});
  const rentalTypeSource = Array.isArray(settings.rentalTypes) ? settings.rentalTypes : [];
  const rentalTypes = mode === 'deleted'
    ? rentalTypeSource
      .map((category) => ({
        ...category,
        subItems: applyDeletedFilter(category?.subItems, mode)
      }))
      .filter((category) => Boolean(category?.deletedAt) || (Array.isArray(category?.subItems) && category.subItems.length > 0))
    : applyDeletedFilter(rentalTypeSource, mode).map((category) => ({
      ...category,
      subItems: applyDeletedFilter(category?.subItems, mode)
    }));

  const bindingPairs = applyDeletedFilter(settings?.bookingCategoryBindings?.pairs, mode);
  const instagramEmbeds = applyDeletedFilter(settings.instagramEmbeds, mode);
  const savedQuotations = applyDeletedFilter(settings.savedQuotations, mode);

  return {
    ...settings,
    rentalTypes,
    bookingCategoryBindings: {
      ...(settings.bookingCategoryBindings || {}),
      pairs: bindingPairs
    },
    instagramEmbeds,
    savedQuotations
  };
};

const mergePreservingDeleted = (incomingItems, existingItems) => {
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const existing = Array.isArray(existingItems) ? existingItems : [];
  const existingDeleted = existing.filter((item) => Boolean(item?.deletedAt));
  return [...incoming, ...existingDeleted];
};

const mergeRentalTypesPreservingDeletedSubItems = (incomingItems, existingItems) => {
  const incoming = Array.isArray(incomingItems) ? incomingItems : [];
  const existing = Array.isArray(existingItems) ? existingItems : [];

  const existingDeletedCategories = existing.filter((item) => Boolean(item?.deletedAt));
  const mergedActive = incoming.map((category) => {
    const incomingId = String(category?._id || '').trim();
    if (!incomingId) return category;

    const existingCategory = existing.find((entry) => String(entry?._id || '') === incomingId);
    if (!existingCategory) return category;

    const incomingSubItems = Array.isArray(category?.subItems) ? category.subItems : [];
    const existingSubItems = Array.isArray(existingCategory?.subItems) ? existingCategory.subItems : [];
    const deletedSubItems = existingSubItems.filter((item) => Boolean(item?.deletedAt));

    return {
      ...category,
      subItems: [...incomingSubItems, ...deletedSubItems]
    };
  });

  return [...mergedActive, ...existingDeletedCategories];
};

// @route   GET /api/admin/settings
// @desc    Get admin settings
// @access  Private/Admin
router.get('/settings', protect, isAdmin, async (req, res) => {
  try {
    const deletedFilterMode = resolveDeletedFilterMode(req.query?.deleted);
    const settings = await AdminSettings.getSettings();
    res.json({
      success: true,
      settings: filterSettingsForClient(settings, deletedFilterMode)
    });
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
      classConfig,
      serviceGroupingConfig,
      instagramEmbeds
    } = req.body;

    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create(req.body);
    } else {
      if (rentalTypes) {
        settings.rentalTypes = mergeRentalTypesPreservingDeletedSubItems(rentalTypes, settings.rentalTypes);
      }
      if (bookingCategoryBindings) {
        const incomingPairs = Array.isArray(bookingCategoryBindings?.pairs)
          ? bookingCategoryBindings.pairs
          : [];
        const existingPairs = Array.isArray(settings?.bookingCategoryBindings?.pairs)
          ? settings.bookingCategoryBindings.pairs
          : [];

        settings.bookingCategoryBindings = {
          ...(settings.bookingCategoryBindings || {}),
          ...bookingCategoryBindings,
          pairs: mergePreservingDeleted(incomingPairs, existingPairs)
        };
      }
      if (upiId) settings.upiId = upiId;
      if (upiName) settings.upiName = upiName;
      if (adminEmails) settings.adminEmails = adminEmails;
      if (businessHours) settings.businessHours = businessHours;
      if (slotDuration) settings.slotDuration = slotDuration;
      if (studioName) settings.studioName = studioName;
      if (studioAddress) settings.studioAddress = studioAddress;
      if (gstConfig) settings.gstConfig = gstConfig;
      if (classConfig) settings.classConfig = classConfig;
      if (serviceGroupingConfig) settings.serviceGroupingConfig = serviceGroupingConfig;
      if (instagramEmbeds !== undefined) {
        settings.instagramEmbeds = mergePreservingDeleted(instagramEmbeds, settings.instagramEmbeds);
      }

      await settings.save();
    }

    res.json({ success: true, message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Server error updating settings' });
  }
});

// @route   GET /api/admin/settings/deleted-summary
// @desc    Get all deleted records from settings-managed collections
// @access  Private/Admin
router.get('/settings/deleted-summary', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const rentalTypes = Array.isArray(settings.rentalTypes) ? settings.rentalTypes : [];
    const bindingPairs = Array.isArray(settings?.bookingCategoryBindings?.pairs) ? settings.bookingCategoryBindings.pairs : [];
    const instagramEmbeds = Array.isArray(settings.instagramEmbeds) ? settings.instagramEmbeds : [];
    const savedQuotations = Array.isArray(settings.savedQuotations) ? settings.savedQuotations : [];

    const deletedRentalTypes = rentalTypes.filter((item) => Boolean(item?.deletedAt));
    const deletedRentalSubItems = rentalTypes.flatMap((category) => {
      const categoryId = String(category?._id || '');
      const categoryName = String(category?.name || '').trim();
      const subItems = Array.isArray(category?.subItems) ? category.subItems : [];
      return subItems
        .filter((sub) => Boolean(sub?.deletedAt))
        .map((sub) => ({
          _id: sub._id,
          name: sub.name,
          description: sub.description,
          deletedAt: sub.deletedAt,
          categoryId,
          categoryName
        }));
    });

    const deletedBindings = bindingPairs.filter((item) => Boolean(item?.deletedAt));
    const deletedHighlights = instagramEmbeds.filter((item) => Boolean(item?.deletedAt));
    const deletedQuotations = savedQuotations.filter((item) => Boolean(item?.deletedAt));

    res.json({
      success: true,
      deleted: {
        rentalTypes: deletedRentalTypes,
        rentalSubItems: deletedRentalSubItems,
        bindings: deletedBindings,
        highlights: deletedHighlights,
        quotations: deletedQuotations
      }
    });
  } catch (error) {
    console.error('Deleted settings summary error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching deleted settings records' });
  }
});

const markSettingsSubdocDeleted = async (collectionKey, id, req, res) => {
  try {
    const itemId = String(id || '').trim();
    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item id is required' });
    }

    const settings = await AdminSettings.getSettings();
    const targetList = collectionKey === 'pairs'
      ? (settings.bookingCategoryBindings?.pairs || [])
      : (settings[collectionKey] || []);
    const item = targetList.find((entry) => String(entry?._id) === itemId);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (item.deletedAt) {
      return res.status(400).json({ success: false, message: 'Item is already deleted' });
    }

    item.deletedAt = new Date();
    await settings.save();
    return res.json({ success: true, message: 'Item moved to deleted records' });
  } catch (error) {
    console.error('Soft delete settings item error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting item' });
  }
};

const restoreSettingsSubdoc = async (collectionKey, id, res) => {
  try {
    const itemId = String(id || '').trim();
    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item id is required' });
    }

    const settings = await AdminSettings.getSettings();
    const targetList = collectionKey === 'pairs'
      ? (settings.bookingCategoryBindings?.pairs || [])
      : (settings[collectionKey] || []);
    const item = targetList.find((entry) => String(entry?._id) === itemId);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    if (!item.deletedAt) {
      return res.status(400).json({ success: false, message: 'Item is not deleted' });
    }

    item.deletedAt = null;
    await settings.save();
    return res.json({ success: true, message: 'Item restored successfully' });
  } catch (error) {
    console.error('Restore settings item error:', error);
    return res.status(500).json({ success: false, message: 'Server error restoring item' });
  }
};

const permanentlyDeleteSettingsSubdoc = async (collectionKey, id, res) => {
  try {
    const itemId = String(id || '').trim();
    if (!itemId) {
      return res.status(400).json({ success: false, message: 'Item id is required' });
    }

    const settings = await AdminSettings.getSettings();
    if (collectionKey === 'pairs') {
      const currentItems = Array.isArray(settings?.bookingCategoryBindings?.pairs)
        ? settings.bookingCategoryBindings.pairs
        : [];
      const target = currentItems.find((entry) => String(entry?._id) === itemId && Boolean(entry?.deletedAt));
      if (!target) {
        return res.status(404).json({ success: false, message: 'Deleted item not found' });
      }

      settings.bookingCategoryBindings.pairs = currentItems.filter((entry) => String(entry?._id) !== itemId);
      await settings.save();
      return res.json({ success: true, message: 'Item permanently deleted' });
    }

    const currentItems = Array.isArray(settings[collectionKey]) ? settings[collectionKey] : [];
    const target = currentItems.find((entry) => String(entry?._id) === itemId && Boolean(entry?.deletedAt));
    if (!target) {
      return res.status(404).json({ success: false, message: 'Deleted item not found' });
    }

    settings[collectionKey] = currentItems.filter((entry) => String(entry?._id) !== itemId);
    await settings.save();
    return res.json({ success: true, message: 'Item permanently deleted' });
  } catch (error) {
    console.error('Permanent delete settings item error:', error);
    return res.status(500).json({ success: false, message: 'Server error permanently deleting item' });
  }
};

router.delete('/settings/rental-types/:id', protect, isAdmin, async (req, res) => (
  markSettingsSubdocDeleted('rentalTypes', req.params.id, req, res)
));

router.delete('/settings/rental-types/:id/permanent', protect, isAdmin, async (req, res) => (
  permanentlyDeleteSettingsSubdoc('rentalTypes', req.params.id, res)
));

router.put('/settings/rental-types/:id/restore', protect, isAdmin, async (req, res) => (
  restoreSettingsSubdoc('rentalTypes', req.params.id, res)
));

router.delete('/settings/bindings/:id', protect, isAdmin, async (req, res) => (
  markSettingsSubdocDeleted('pairs', req.params.id, req, res)
));

router.delete('/settings/bindings/:id/permanent', protect, isAdmin, async (req, res) => (
  permanentlyDeleteSettingsSubdoc('pairs', req.params.id, res)
));

router.put('/settings/bindings/:id/restore', protect, isAdmin, async (req, res) => (
  restoreSettingsSubdoc('pairs', req.params.id, res)
));

router.delete('/settings/instagram-embeds/:id', protect, isAdmin, async (req, res) => (
  markSettingsSubdocDeleted('instagramEmbeds', req.params.id, req, res)
));

router.delete('/settings/instagram-embeds/:id/permanent', protect, isAdmin, async (req, res) => (
  permanentlyDeleteSettingsSubdoc('instagramEmbeds', req.params.id, res)
));

router.put('/settings/instagram-embeds/:id/restore', protect, isAdmin, async (req, res) => (
  restoreSettingsSubdoc('instagramEmbeds', req.params.id, res)
));

// @route   DELETE /api/admin/settings/rental-types/:rentalTypeId/sub-items/:subItemId
// @desc    Soft delete a rental sub-item
// @access  Private/Admin
router.delete('/settings/rental-types/:rentalTypeId/sub-items/:subItemId', protect, isAdmin, async (req, res) => {
  try {
    const rentalTypeId = String(req.params?.rentalTypeId || '').trim();
    const subItemId = String(req.params?.subItemId || '').trim();
    if (!rentalTypeId || !subItemId) {
      return res.status(400).json({ success: false, message: 'Rental type id and sub-item id are required' });
    }

    const settings = await AdminSettings.getSettings();
    const category = (Array.isArray(settings.rentalTypes) ? settings.rentalTypes : [])
      .find((item) => String(item?._id) === rentalTypeId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Rental category not found' });
    }

    const subItems = Array.isArray(category.subItems) ? category.subItems : [];
    const subItem = subItems.find((item) => String(item?._id) === subItemId);
    if (!subItem) {
      return res.status(404).json({ success: false, message: 'Rental sub-item not found' });
    }

    if (subItem.deletedAt) {
      return res.status(400).json({ success: false, message: 'Rental sub-item is already deleted' });
    }

    subItem.deletedAt = new Date();
    await settings.save();

    return res.json({ success: true, message: 'Rental sub-item moved to deleted records' });
  } catch (error) {
    console.error('Soft delete rental sub-item error:', error);
    return res.status(500).json({ success: false, message: 'Server error deleting rental sub-item' });
  }
});

// @route   DELETE /api/admin/settings/rental-types/:rentalTypeId/sub-items/:subItemId/permanent
// @desc    Permanently delete a soft-deleted rental sub-item
// @access  Private/Admin
router.delete('/settings/rental-types/:rentalTypeId/sub-items/:subItemId/permanent', protect, isAdmin, async (req, res) => {
  try {
    const rentalTypeId = String(req.params?.rentalTypeId || '').trim();
    const subItemId = String(req.params?.subItemId || '').trim();
    if (!rentalTypeId || !subItemId) {
      return res.status(400).json({ success: false, message: 'Rental type id and sub-item id are required' });
    }

    const settings = await AdminSettings.getSettings();
    const category = (Array.isArray(settings.rentalTypes) ? settings.rentalTypes : [])
      .find((item) => String(item?._id) === rentalTypeId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Rental category not found' });
    }

    const subItems = Array.isArray(category.subItems) ? category.subItems : [];
    const subItem = subItems.find((item) => String(item?._id) === subItemId && Boolean(item?.deletedAt));
    if (!subItem) {
      return res.status(404).json({ success: false, message: 'Deleted rental sub-item not found' });
    }

    category.subItems = subItems.filter((item) => String(item?._id) !== subItemId);
    await settings.save();

    return res.json({ success: true, message: 'Rental sub-item permanently deleted' });
  } catch (error) {
    console.error('Permanent delete rental sub-item error:', error);
    return res.status(500).json({ success: false, message: 'Server error permanently deleting rental sub-item' });
  }
});

// @route   PUT /api/admin/settings/rental-types/:rentalTypeId/sub-items/:subItemId/restore
// @desc    Restore a soft-deleted rental sub-item
// @access  Private/Admin
router.put('/settings/rental-types/:rentalTypeId/sub-items/:subItemId/restore', protect, isAdmin, async (req, res) => {
  try {
    const rentalTypeId = String(req.params?.rentalTypeId || '').trim();
    const subItemId = String(req.params?.subItemId || '').trim();
    if (!rentalTypeId || !subItemId) {
      return res.status(400).json({ success: false, message: 'Rental type id and sub-item id are required' });
    }

    const settings = await AdminSettings.getSettings();
    const category = (Array.isArray(settings.rentalTypes) ? settings.rentalTypes : [])
      .find((item) => String(item?._id) === rentalTypeId);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Rental category not found' });
    }

    const subItems = Array.isArray(category.subItems) ? category.subItems : [];
    const subItem = subItems.find((item) => String(item?._id) === subItemId);
    if (!subItem) {
      return res.status(404).json({ success: false, message: 'Rental sub-item not found' });
    }

    if (!subItem.deletedAt) {
      return res.status(400).json({ success: false, message: 'Rental sub-item is not deleted' });
    }

    subItem.deletedAt = null;
    await settings.save();

    return res.json({ success: true, message: 'Rental sub-item restored successfully' });
  } catch (error) {
    console.error('Restore rental sub-item error:', error);
    return res.status(500).json({ success: false, message: 'Server error restoring rental sub-item' });
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
