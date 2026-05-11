/**
 * Admin Quotation Routes
 * Handles: saved quotation templates CRUD, send quotation email with PDF
 */

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const AdminSettings = require('../../models/AdminSettings');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { generateQuotationPDF, buildQuotationPresentationData } = require('../../utils/billGenerator');
const { sendEmail } = require('../../utils/email');
const { sendWhatsApp } = require('../../utils/whatsapp');
const {
  parseOptionalEmailList,
  isValidEmail,
  normalizeEmail,
  deriveDynamicBookingLabel,
  DEFAULT_APP_LOGIN_URL
} = require('../../utils/adminHelpers');

// ─── Quotation Helpers ────────────────────────────────────────────────────────

const normalizeRentalTypeValue = (value) => {
  const normalized = String(value || 'inhouse').toLowerCase();
  const compact = normalized.replace(/[\s_-]+/g, '');
  if (compact === 'perday') return 'perday';
  if (compact === 'persession' || compact === 'session') return 'persession';
  if (compact === 'pertrack' || compact === 'track') return 'pertrack';
  return 'inhouse';
};

const parseDateAndTime = (dateValue, timeValue) => {
  const safeDate = String(dateValue || '').trim();
  const safeTime = String(timeValue || '').trim();
  if (!safeDate || !safeTime) return null;
  const [hours, minutes] = safeTime.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  const date = new Date(`${safeDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const calculateQuotationTotals = ({ rentals, schedules }) => {
  const safeRentals = Array.isArray(rentals) ? rentals : [];
  const inhouseSchedule = schedules?.inhouse || {};
  const perdaySchedule = schedules?.perday || {};

  const hasInhouse = safeRentals.some((r) => normalizeRentalTypeValue(r?.rentalType) === 'inhouse');
  const hasPerday = safeRentals.some((r) => normalizeRentalTypeValue(r?.rentalType) === 'perday');
  const hasPersession = safeRentals.some((r) => normalizeRentalTypeValue(r?.rentalType) === 'persession');
  const hasPertrack = safeRentals.some((r) => normalizeRentalTypeValue(r?.rentalType) === 'pertrack');

  const inhouseDate = String(inhouseSchedule?.date || '').trim();
  const inhouseStartTime = String(inhouseSchedule?.startTime || '').trim();
  const inhouseEndTime = String(inhouseSchedule?.endTime || '').trim();

  let inhouseDurationHours = 0;
  if (hasInhouse) {
    if (!inhouseDate || !inhouseStartTime || !inhouseEndTime) {
      throw new Error('In-house schedule (date, start time, end time) is required for in-house quotation items.');
    }
    const [startHour, startMinute] = inhouseStartTime.split(':').map(Number);
    const [endHour, endMinute] = inhouseEndTime.split(':').map(Number);
    if (!Number.isInteger(startHour) || !Number.isInteger(startMinute) || !Number.isInteger(endHour) || !Number.isInteger(endMinute)) {
      throw new Error('Invalid in-house start/end time in quotation.');
    }
    const startMinutes = (startHour * 60) + startMinute;
    let endMinutes = (endHour * 60) + endMinute;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    inhouseDurationHours = (endMinutes - startMinutes) / 60;
    if (!(inhouseDurationHours > 0)) {
      throw new Error('In-house end time must be after start time.');
    }
  }

  const perdayStartDate = String(perdaySchedule?.startDate || '').trim();
  const perdayEndDate = String(perdaySchedule?.endDate || '').trim();
  const perdayPickupTime = String(perdaySchedule?.pickupTime || '').trim();
  const perdayReturnTime = String(perdaySchedule?.returnTime || '').trim();

  let perdayDays = 0;
  if (hasPerday) {
    if (!perdayStartDate || !perdayEndDate || !perdayPickupTime || !perdayReturnTime) {
      throw new Error('Per-day schedule (start date, end date, pickup time, return time) is required for per-day quotation items.');
    }
    const startDateTime = parseDateAndTime(perdayStartDate, perdayPickupTime);
    const endDateTime = parseDateAndTime(perdayEndDate, perdayReturnTime);
    if (!startDateTime || !endDateTime) {
      throw new Error('Invalid per-day date/time selection in quotation.');
    }
    const diffMs = endDateTime.getTime() - startDateTime.getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    if (diffMs < dayMs) {
      throw new Error('Per-day return must be at least 24 hours after pickup in quotation.');
    }
    if (diffMs % dayMs !== 0) {
      throw new Error('Per-day return must be in exact 24-hour blocks in quotation.');
    }
    perdayDays = diffMs / dayMs;
  }

  let subtotal = 0;
  for (const rental of safeRentals) {
    const rentalType = normalizeRentalTypeValue(rental?.rentalType);
    const itemPrice = Number(rental?.price || 0);
    const itemQuantity = Math.max(1, Number(rental?.quantity || 1));
    if (rentalType === 'persession' || rentalType === 'pertrack') {
      subtotal += itemPrice * itemQuantity;
    } else if (rentalType === 'perday') {
      subtotal += itemPrice * itemQuantity * perdayDays;
    } else {
      subtotal += itemPrice * itemQuantity * inhouseDurationHours;
    }
  }

  return {
    subtotal,
    hasInhouse,
    hasPerday,
    hasPersession,
    hasPertrack,
    inhouseDurationHours,
    perdayDays,
    schedules: {
      inhouse: { date: inhouseDate, startTime: inhouseStartTime, endTime: inhouseEndTime, durationHours: inhouseDurationHours },
      perday: { startDate: perdayStartDate, endDate: perdayEndDate, pickupTime: perdayPickupTime, returnTime: perdayReturnTime, days: perdayDays }
    }
  };
};

const getQuotationRateKey = (category, name, rentalType) => {
  return [
    String(category || '').trim().toLowerCase(),
    String(name || '').trim().toLowerCase(),
    normalizeRentalTypeValue(rentalType)
  ].join('|');
};

const buildQuotationRateIndex = (settings) => {
  const index = new Map();
  const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];

  rentalTypes.forEach((category) => {
    const categoryName = String(category?.name || '').trim();
    if (!categoryName) return;

    const categoryRentalType = normalizeRentalTypeValue(category?.rentalType);

    if (categoryName === 'JamRoom' && Number(category?.basePrice || 0) > 0) {
      index.set(
        getQuotationRateKey(categoryName, `${categoryName} (Base)`, categoryRentalType),
        Number(category.basePrice || 0)
      );
    }

    const subItems = Array.isArray(category?.subItems) ? category.subItems : [];
    subItems.forEach((subItem) => {
      const itemName = String(subItem?.name || '').trim();
      if (!itemName) return;

      const mode = normalizeRentalTypeValue(subItem?.rentalType || categoryRentalType);
      const resolvedPrice = mode === 'perday'
        ? Number(subItem?.perdayPrice || 0)
        : Number(subItem?.price || 0);

      index.set(getQuotationRateKey(categoryName, itemName, mode), resolvedPrice);
    });

    if (subItems.length === 0 && Number(category?.basePrice || 0) > 0 && categoryName !== 'JamRoom') {
      index.set(
        getQuotationRateKey(categoryName, categoryName, categoryRentalType),
        Number(category.basePrice || 0)
      );
    }
  });

  return index;
};

const sanitizeQuotationRentals = (rawRentals = [], settings = null) => {
  const rateIndex = settings ? buildQuotationRateIndex(settings) : null;
  const sanitizedRentals = [];

  for (const rental of Array.isArray(rawRentals) ? rawRentals : []) {
    const rentalName = String(rental?.name || '').trim();
    const rentalCategory = String(rental?.category || '').trim();
    const rentalDescription = String(rental?.description || '').trim();
    const rentalType = normalizeRentalTypeValue(rental?.rentalType);
    const rentalQuantity = Math.max(1, Number(rental?.quantity || 1));
    const snapshotPrice = Number(rental?.priceSnapshot ?? rental?.price ?? 0);

    if (!rentalName) {
      throw new Error('Each quotation item must have a name');
    }

    if (!Number.isFinite(snapshotPrice) || snapshotPrice < 0) {
      throw new Error(`Invalid price for quotation item: ${rentalName}`);
    }

    let resolvedPrice = snapshotPrice;
    if (rateIndex) {
      const key = getQuotationRateKey(rentalCategory, rentalName, rentalType);
      if (rateIndex.has(key)) {
        resolvedPrice = Number(rateIndex.get(key) || 0);
      }
    }

    sanitizedRentals.push({
      name: rentalName,
      category: rentalCategory,
      description: rentalDescription,
      rentalType,
      quantity: rentalQuantity,
      quantityEnabled: rental?.quantityEnabled === true,
      price: resolvedPrice,
      priceSnapshot: snapshotPrice
    });
  }

  return sanitizedRentals;
};

const sanitizeQuotationPayload = (quotation = {}, settings = null) => {
  const rentalTypeLabel = String(quotation?.rentalType || quotation?.rentalTypeLabel || '').trim();
  const notes = String(quotation?.notes || '').trim();
  const parsedDiscountAmount = Number(quotation?.discountAmount || 0);
  const discountAmount = Number.isFinite(parsedDiscountAmount) && parsedDiscountAmount > 0
    ? parsedDiscountAmount
    : 0;
  const discountNote = String(quotation?.discountNote || '').trim();
  const selectedTypes = Array.isArray(quotation?.selectedTypes)
    ? quotation.selectedTypes.map((type) => normalizeRentalTypeValue(type))
    : [];
  const schedules = {
    inhouse: {
      date: String(quotation?.schedules?.inhouse?.date || '').trim(),
      startTime: String(quotation?.schedules?.inhouse?.startTime || '').trim(),
      endTime: String(quotation?.schedules?.inhouse?.endTime || '').trim()
    },
    perday: {
      startDate: String(quotation?.schedules?.perday?.startDate || '').trim(),
      endDate: String(quotation?.schedules?.perday?.endDate || '').trim(),
      pickupTime: String(quotation?.schedules?.perday?.pickupTime || '').trim(),
      returnTime: String(quotation?.schedules?.perday?.returnTime || '').trim()
    }
  };

  const rentals = sanitizeQuotationRentals(quotation?.rentals || [], settings);
  if (rentals.length === 0) {
    throw new Error('Please include at least one rental item in quotation');
  }

  return {
    rentalTypeLabel,
    notes,
    discountAmount,
    discountNote,
    selectedTypes,
    schedules,
    rentals
  };
};

const toSavedQuotationResponse = (savedQuotation, settings) => {
  const sanitized = sanitizeQuotationPayload({
    rentalType: savedQuotation?.rentalTypeLabel,
    notes: savedQuotation?.notes,
    discountAmount: savedQuotation?.discountAmount,
    discountNote: savedQuotation?.discountNote,
    selectedTypes: savedQuotation?.selectedTypes,
    schedules: savedQuotation?.schedules,
    rentals: savedQuotation?.rentals
  }, settings);

  return {
    id: String(savedQuotation?._id || ''),
    name: String(savedQuotation?.name || '').trim(),
    rentalTypeLabel: sanitized.rentalTypeLabel,
    selectedTypes: sanitized.selectedTypes,
    schedules: sanitized.schedules,
    notes: sanitized.notes,
    discountAmount: sanitized.discountAmount,
    discountNote: sanitized.discountNote,
    rentals: sanitized.rentals,
    createdAt: savedQuotation?.createdAt,
    updatedAt: savedQuotation?.updatedAt,
    deletedAt: savedQuotation?.deletedAt || null
  };
};

// ─── Routes ───────────────────────────────────────────────────────────────────

// @route   GET /api/admin/quotations/saved
// @desc    List saved quotation templates
// @access  Private/Admin
router.get('/quotations/saved', protect, isAdmin, async (req, res) => {
  try {
    const deletedFilter = String(req.query?.deleted || 'active').trim().toLowerCase();
    const includeDeleted = deletedFilter === 'all' || deletedFilter === 'deleted';
    const settings = await AdminSettings.getSettings();
    const savedQuotations = Array.isArray(settings?.savedQuotations)
      ? settings.savedQuotations
      : [];

    const items = savedQuotations
      .filter((item) => {
        const isDeleted = Boolean(item?.deletedAt);
        if (!includeDeleted) return !isDeleted;
        if (deletedFilter === 'deleted') return isDeleted;
        return true;
      })
      .map((item) => toSavedQuotationResponse(item, settings))
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

    res.json({
      success: true,
      count: items.length,
      quotations: items
    });
  } catch (error) {
    console.error('List saved quotations error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to load saved quotations' });
  }
});

// @route   POST /api/admin/quotations/saved
// @desc    Save quotation template for reuse
// @access  Private/Admin
router.post('/quotations/saved', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const templateName = String(req.body?.name || '').trim();
    if (!templateName) {
      return res.status(400).json({ success: false, message: 'Template name is required' });
    }

    const parsed = sanitizeQuotationPayload(req.body?.quotation || {}, settings);
    const savedItem = {
      name: templateName,
      rentalTypeLabel: parsed.rentalTypeLabel,
      selectedTypes: parsed.selectedTypes,
      notes: parsed.notes,
      discountAmount: parsed.discountAmount,
      discountNote: parsed.discountNote,
      schedules: parsed.schedules,
      rentals: parsed.rentals.map((item) => ({
        name: item.name,
        category: item.category,
        description: item.description,
        rentalType: item.rentalType,
        quantity: item.quantity,
        priceSnapshot: item.price
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null
    };

    settings.savedQuotations = Array.isArray(settings.savedQuotations)
      ? settings.savedQuotations
      : [];
    settings.savedQuotations.push(savedItem);
    await settings.save();

    const created = settings.savedQuotations[settings.savedQuotations.length - 1];
    res.json({
      success: true,
      message: 'Quotation template saved',
      quotation: toSavedQuotationResponse(created, settings)
    });
  } catch (error) {
    console.error('Save quotation template error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to save quotation template' });
  }
});

// @route   PUT /api/admin/quotations/saved/:id
// @desc    Update an existing saved quotation template
// @access  Private/Admin
router.put('/quotations/saved/:id', protect, isAdmin, async (req, res) => {
  try {
    const templateId = String(req.params?.id || '').trim();
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'Template id is required' });
    }

    const settings = await AdminSettings.getSettings();
    const currentItems = Array.isArray(settings.savedQuotations) ? settings.savedQuotations : [];
    const targetIndex = currentItems.findIndex((item) => String(item?._id) === templateId);

    if (targetIndex === -1) {
      return res.status(404).json({ success: false, message: 'Saved quotation not found' });
    }

    const templateName = String(req.body?.name || '').trim();
    if (!templateName) {
      return res.status(400).json({ success: false, message: 'Template name is required' });
    }

    const parsed = sanitizeQuotationPayload(req.body?.quotation || {}, settings);
    const existing = currentItems[targetIndex];

    currentItems[targetIndex] = {
      name: templateName,
      rentalTypeLabel: parsed.rentalTypeLabel,
      selectedTypes: parsed.selectedTypes,
      notes: parsed.notes,
      discountAmount: parsed.discountAmount,
      discountNote: parsed.discountNote,
      schedules: parsed.schedules,
      rentals: parsed.rentals.map((item) => ({
        name: item.name,
        category: item.category,
        description: item.description,
        rentalType: item.rentalType,
        quantity: item.quantity,
        priceSnapshot: item.price
      })),
      _id: existing?._id,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
      deletedAt: existing?.deletedAt || null
    };

    settings.savedQuotations = currentItems;
    await settings.save();

    const updated = settings.savedQuotations.find((item) => String(item?._id) === templateId);
    res.json({
      success: true,
      message: 'Quotation template updated',
      quotation: toSavedQuotationResponse(updated, settings)
    });
  } catch (error) {
    console.error('Update quotation template error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to update quotation template' });
  }
});

// @route   DELETE /api/admin/quotations/saved/:id
// @desc    Soft delete saved quotation template
// @access  Private/Admin
router.delete('/quotations/saved/:id', protect, isAdmin, async (req, res) => {
  try {
    const templateId = String(req.params?.id || '').trim();
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'Template id is required' });
    }

    const settings = await AdminSettings.getSettings();
    const currentItems = Array.isArray(settings.savedQuotations) ? settings.savedQuotations : [];
    const target = currentItems.find((item) => String(item?._id) === templateId);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Saved quotation not found' });
    }

    if (target.deletedAt) {
      return res.status(400).json({ success: false, message: 'Saved quotation is already deleted' });
    }

    target.deletedAt = new Date();
    target.updatedAt = new Date();

    await settings.save();

    res.json({ success: true, message: 'Saved quotation moved to deleted records' });
  } catch (error) {
    console.error('Delete quotation template error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to delete saved quotation' });
  }
});

// @route   DELETE /api/admin/quotations/saved/:id/permanent
// @desc    Permanently delete a soft-deleted saved quotation template
// @access  Private/Admin
router.delete('/quotations/saved/:id/permanent', protect, isAdmin, async (req, res) => {
  try {
    const templateId = String(req.params?.id || '').trim();
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'Template id is required' });
    }

    const settings = await AdminSettings.getSettings();
    const currentItems = Array.isArray(settings.savedQuotations) ? settings.savedQuotations : [];
    const target = currentItems.find((item) => String(item?._id) === templateId);

    if (!target || !target.deletedAt) {
      return res.status(404).json({ success: false, message: 'Deleted saved quotation not found' });
    }

    settings.savedQuotations = currentItems.filter((item) => String(item?._id) !== templateId);
    await settings.save();

    res.json({ success: true, message: 'Saved quotation permanently deleted' });
  } catch (error) {
    console.error('Permanent delete quotation template error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to permanently delete saved quotation' });
  }
});

// @route   PUT /api/admin/quotations/saved/:id/restore
// @desc    Restore a soft-deleted saved quotation template
// @access  Private/Admin
router.put('/quotations/saved/:id/restore', protect, isAdmin, async (req, res) => {
  try {
    const templateId = String(req.params?.id || '').trim();
    if (!templateId) {
      return res.status(400).json({ success: false, message: 'Template id is required' });
    }

    const settings = await AdminSettings.getSettings();
    const currentItems = Array.isArray(settings.savedQuotations) ? settings.savedQuotations : [];
    const target = currentItems.find((item) => String(item?._id) === templateId);

    if (!target) {
      return res.status(404).json({ success: false, message: 'Saved quotation not found' });
    }

    if (!target.deletedAt) {
      return res.status(400).json({ success: false, message: 'Saved quotation is not deleted' });
    }

    target.deletedAt = null;
    target.updatedAt = new Date();
    await settings.save();

    res.json({ success: true, message: 'Saved quotation restored successfully' });
  } catch (error) {
    console.error('Restore quotation template error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to restore saved quotation' });
  }
});

// @route   POST /api/admin/quotations/send
// @desc    Generate and send quotation email (with PDF) to selected recipients
// @access  Private/Admin
router.post('/quotations/send', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const recipientUserIdList = Array.isArray(req.body?.recipientUserIds)
      ? req.body.recipientUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : (String(req.body?.recipientUserId || '').trim() ? [String(req.body.recipientUserId).trim()] : []);
    const additionalEmails = parseOptionalEmailList(req.body?.additionalEmails);
    const emailDeliveryMode = String(req.body?.emailDeliveryMode || 'single').trim().toLowerCase() === 'separate'
      ? 'separate'
      : 'single';
    const quotation = req.body?.quotation || {};
    const shouldSaveTemplate = req.body?.saveTemplate === true;
    const saveTemplateName = String(req.body?.templateName || '').trim();
    const updateTemplateId = String(req.body?.updateTemplateId || '').trim();

    const invalidAdditionalEmails = additionalEmails.filter((email) => !isValidEmail(email));
    if (invalidAdditionalEmails.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid additional email address(es): ${invalidAdditionalEmails.join(', ')}`
      });
    }

    const parsedQuotation = sanitizeQuotationPayload(quotation, settings);
    const sanitizedRentals = parsedQuotation.rentals;

    const selectedUsers = recipientUserIdList.length > 0
      ? await User.find({ _id: { $in: recipientUserIdList } }).select('name email mobile')
      : [];
    const userEmailMap = new Map(
      selectedUsers.map((u) => [normalizeEmail(u.email), u.name])
    );

    const recipientSet = new Set();
    selectedUsers.forEach((u) => {
      const email = normalizeEmail(u.email);
      if (isValidEmail(email)) recipientSet.add(email);
    });
    additionalEmails.forEach((email) => { if (isValidEmail(email)) recipientSet.add(email); });

    const recipientEmails = Array.from(recipientSet);
    if (recipientEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Add at least one recipient — select a user from the database or provide additional email addresses'
      });
    }

    const calculation = calculateQuotationTotals({
      rentals: sanitizedRentals,
      schedules: parsedQuotation.schedules || {}
    });

    const gstEnabled = settings?.gstConfig?.enabled || false;
    const gstRate = gstEnabled ? (settings?.gstConfig?.rate || 0.18) : 0;
    const gstDisplayName = settings?.gstConfig?.displayName || 'GST';
    const taxAmount = gstEnabled ? Math.round(calculation.subtotal * gstRate) : 0;
    const rawDiscountAmount = Number(parsedQuotation.discountAmount || 0);
    const discountAmount = Math.min(
      Math.max(0, Number.isFinite(rawDiscountAmount) ? rawDiscountAmount : 0),
      calculation.subtotal + taxAmount
    );
    const totalAmount = Math.max(0, calculation.subtotal + taxAmount - discountAmount);

    const rentalTypeLabel = String(parsedQuotation.rentalTypeLabel || '').trim()
      || deriveDynamicBookingLabel(sanitizedRentals, 'Quotation');
    const quoteNotes = parsedQuotation.notes;
    const generatedAt = new Date();

    const selectedTypeLabels = [];
    if (calculation.hasInhouse) selectedTypeLabels.push('In-house');
    if (calculation.hasPerday) selectedTypeLabels.push('Per-day');
    if (calculation.hasPersession) selectedTypeLabels.push('Per-event');
    if (calculation.hasPertrack) selectedTypeLabels.push('Per-track');

    const quotationPresentation = buildQuotationPresentationData({
      rentalTypeLabel,
      selectedTypeLabels,
      calculation,
      rentals: sanitizedRentals,
      quoteNotes,
      discountAmount,
      discountNote: parsedQuotation.discountNote,
      generatedAt,
      gstEnabled,
      gstRate,
      gstDisplayName,
      taxAmount,
      totalAmount,
      recipientName: selectedUsers[0]?.name || ''
    }, settings);

    const subject = `Quotation from ${settings?.studioName || 'JamRoom'} - ${rentalTypeLabel}`;
    const buildQuotationEmailHtml = ({ recipientName = '', individualEmail = false } = {}) => {
      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2937}
  .eq{max-width:760px;margin:0 auto;padding:12px}
  .card{background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dbe5f0}
  .hdr{background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);color:#fff;padding:20px}
  .hdr-table{width:100%;border-collapse:collapse}
  .hdr-left{vertical-align:top;padding-right:14px}
  .hdr-right{vertical-align:top;width:210px}
  .hdr h2{margin:0 0 8px 0;font-size:24px;color:#fff}
  .hdr .cl{font-size:12px;line-height:1.6;color:rgba(255,255,255,0.88)}
  .order-box{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:12px 14px}
  .order-kicker{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;font-weight:700;margin-bottom:8px}
  .order-line{font-size:12px;line-height:1.7;color:rgba(255,255,255,0.9)}
  .body{padding:20px}
  .two-col{width:100%;border-collapse:collapse;margin:0 0 16px 0}
  .two-col td{vertical-align:top}
  .col-left{padding-right:6px}
  .col-right{padding-left:6px}
  .sc{background:#f8fafc;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px}
  .tc{background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px}
  .sc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:8px}
  .tc-kicker{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#1d4ed8;font-weight:700;margin-bottom:8px}
  .sc-title{font-size:17px;font-weight:800;color:#0f172a;margin-bottom:4px}
  .tc-amount{font-size:30px;font-weight:900;color:#1d4ed8;margin-bottom:6px}
  .sc-sub,.tc-sub{font-size:12px;line-height:1.5;color:#475569}
  .discount-band{margin-top:8px;padding:8px 10px;border-left:3px solid #16a34a;background:#f0fdf4;border-radius:8px}
  .discount-band .label{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#166534;font-weight:800}
  .discount-band .value{font-size:18px;line-height:1.1;color:#15803d;font-weight:900;margin-top:3px}
  .discount-band .note{font-size:11px;line-height:1.4;color:#166534;margin-top:3px}
  .cta{background:linear-gradient(135deg,#eff6ff 0%,#f8fafc 100%);border:1px solid #bfdbfe;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .cta-title{font-size:15px;font-weight:800;color:#0f172a;margin-bottom:8px}
  .cta-body{font-size:13px;line-height:1.8;color:#0f172a}
  .terms{background:#fff5f5;border:1px solid #fca5a5;border-left:4px solid #dc2626;border-radius:12px;padding:14px 16px;margin:0 0 12px 0}
  .terms-hd{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#dc2626;font-weight:800;margin-bottom:8px}
  .terms ul{margin:0;padding-left:16px;color:#7f1d1d}
  .terms li{margin:0 0 6px 0;font-size:13px;line-height:1.6}
  .offer{background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border:2px solid #f59e0b;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .offer-pill{display:inline-block;background:#f59e0b;color:#fff;font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;padding:3px 10px;border-radius:20px;margin-bottom:8px}
  .offer-text{font-size:13px;line-height:1.8;color:#78350f;font-weight:600}
  .offer-note{font-size:13px;line-height:1.7;color:#92400e;margin-top:6px}
  .notes-card{background:#fff;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;margin:0 0 14px 0}
  .notes-hd{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:6px}
  .footer{font-size:11px;line-height:1.8;color:#64748b;border-top:1px solid #e5e7eb;padding-top:12px}
  .breakdown{background:#f8fafc;border:1px solid #dbe5f0;border-radius:12px;padding:14px 16px;margin:0 0 16px 0}
  .breakdown-title{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#64748b;font-weight:700;margin-bottom:10px}
  .breakdown-row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px;color:#374151;border-bottom:1px solid #f1f5f9}
  .breakdown-row:last-child{border-bottom:none}
  .breakdown-discount{color:#15803d;font-weight:700}
  .breakdown-discount strong{color:#15803d}
  .breakdown-total{font-weight:800;font-size:15px;color:#0f172a;margin-top:4px;padding-top:8px;border-top:2px solid #dbe5f0 !important}
  @media only screen and (max-width:520px){
    .eq{padding:8px}
    .hdr{padding:16px}
    .hdr-left,.hdr-right{display:block;width:100% !important;padding:0}
    .hdr-right{margin-top:12px}
    .hdr h2{font-size:20px}
    .body{padding:14px}
    .two-col,.two-col tbody,.two-col tr{display:block}
    .two-col td{display:block;width:100% !important;padding:0 0 10px 0}
    .col-left,.col-right{padding:0 0 10px 0}
    .tc-amount{font-size:26px}
  }
</style>
</head>
<body>
<div class="eq">
  <div class="card">
    <div class="hdr">
      <table class="hdr-table" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="hdr-left">
            ${quotationPresentation.logoImageUrl ? `<img src="${quotationPresentation.logoImageUrl}" alt="Logo" width="48" height="48" style="border-radius:12px;margin-bottom:8px;display:block;">` : ''}
            <h2>${quotationPresentation.studioName}</h2>
            ${quotationPresentation.studioAddress ? `<div class="cl"><strong>Address:</strong> ${quotationPresentation.studioAddress}</div>` : ''}
            <div class="cl"><strong>Phone / WhatsApp:</strong> ${quotationPresentation.studioPhone}</div>
            <div class="cl"><strong>Email:</strong> ${quotationPresentation.studioEmail}</div>
          </td>
          <td class="hdr-right">
            <div class="order-box">
              <div class="order-kicker">Order Summary</div>
              <div class="order-line"><strong>Quotation For:</strong> ${quotationPresentation.serviceTypeLabel}</div>
              <div class="order-line"><strong>Generated On:</strong> ${quotationPresentation.generatedAtLabel}</div>
              ${quotationPresentation.selectedTypeLabels.length > 0 ? `<div class="order-line"><strong>Includes:</strong> ${quotationPresentation.selectedTypeLabels.join(', ')}</div>` : ''}
            </div>
          </td>
        </tr>
      </table>
    </div>
    <div class="body">
      <p style="margin:0 0 10px 0;font-size:15px;color:#0f172a;">Hello${recipientName ? ` ${recipientName}` : ''},</p>
      <p style="margin:0 0 8px 0;font-size:13px;line-height:1.7;color:#475569;">${quotationPresentation.introLine}</p>
      <p style="margin:0 0 16px 0;font-size:13px;line-height:1.7;color:#475569;">The detailed quotation PDF is attached for review and sharing.</p>
      <table class="two-col" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td class="col-left" width="50%">
            <div class="sc">
              <div class="sc-kicker">Service Overview</div>
              <div class="sc-title">${quotationPresentation.serviceTypeLabel}</div>
              <div class="sc-sub">${quotationPresentation.selectedTypeLabels.length > 0 ? `Includes ${quotationPresentation.selectedTypeLabels.join(', ')}.` : ''}</div>
            </div>
          </td>
          <td class="col-right" width="50%">
            <div class="tc">
              <div class="tc-kicker">Estimated Total</div>
              <div class="tc-amount">${quotationPresentation.totalAmountLabel}</div>
              <div class="tc-sub">See attached PDF for full breakdown.</div>
            </div>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:12px;overflow:hidden;margin:0 0 16px 0;background:#0f172a;">
        <tr><td colspan="2" style="padding:14px 20px 8px 20px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;font-weight:700;font-family:Arial,sans-serif;">Pricing Summary</td></tr>
        <tr>
          <td style="padding:8px 20px;font-size:13px;color:#cbd5e1;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">Subtotal</td>
          <td style="padding:8px 20px;font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">${quotationPresentation.subtotalAmountLabel}</td>
        </tr>
        ${quotationPresentation.discountAmountValue > 0
          ? `<tr>
          <td style="padding:8px 20px;font-size:13px;color:#4ade80;font-weight:700;font-family:Arial,sans-serif;border-top:1px solid #1e293b;border-left:3px solid #22c55e;">Discount${quotationPresentation.discountNote ? ` <span style="font-weight:400;color:#86efac;">(${quotationPresentation.discountNote})</span>` : ''}</td>
          <td style="padding:8px 20px;font-size:13px;color:#4ade80;font-weight:700;text-align:right;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">-${quotationPresentation.discountAmountLabel}</td>
        </tr>`
          : ''}
        ${quotationPresentation.taxEnabled
          ? `<tr>
          <td style="padding:8px 20px;font-size:13px;color:#cbd5e1;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">${quotationPresentation.gstDisplayLabel} (${quotationPresentation.gstRateLabel})</td>
          <td style="padding:8px 20px;font-size:13px;color:#e2e8f0;font-weight:600;text-align:right;font-family:Arial,sans-serif;border-top:1px solid #1e293b;">${quotationPresentation.taxAmountLabel}</td>
        </tr>`
          : ''}
        <tr>
          <td style="padding:12px 20px;font-size:15px;color:#ffffff;font-weight:800;font-family:Arial,sans-serif;border-top:2px solid #334155;">Estimated Total</td>
          <td style="padding:12px 20px;font-size:15px;color:#ffffff;font-weight:800;text-align:right;font-family:Arial,sans-serif;border-top:2px solid #334155;">${quotationPresentation.totalAmountLabel}</td>
        </tr>
      </table>
      <div class="cta">
        <div class="cta-title">To confirm your booking</div>
        <div class="cta-body">
          <div>Reply with <strong>CONFIRM</strong>${individualEmail ? ' on this email' : ' on this email thread'}.</div>
          <div>${quotationPresentation.studioWhatsAppLink ? `Or WhatsApp us at <a href="${quotationPresentation.studioWhatsAppLink}" style="color:#1d4ed8;font-weight:700;text-decoration:none;">${quotationPresentation.studioPhone}</a>.` : `Or contact us at <strong>${quotationPresentation.studioPhone}</strong>.`}</div>
        </div>
      </div>
      <div class="terms">
        <div class="terms-hd">⚠ Booking Terms</div>
        <ul>
          ${quotationPresentation.bookingTerms.map((term) => `<li>${term}</li>`).join('')}
        </ul>
      </div>
      <div class="offer">
        <div class="offer-pill">🎁 Special Offer</div>
        <div class="offer-text">${quotationPresentation.offerLine}</div>
        <div class="offer-note">Reach out to us for special packages tailored to your project needs.</div>
      </div>
      ${quotationPresentation.quoteNotes ? `<div class="notes-card"><div class="notes-hd">Additional Notes</div><div style="font-size:13px;line-height:1.7;color:#475569;">${quotationPresentation.quoteNotes}</div></div>` : ''}
      <div class="footer">
        <div style="margin:0 0 4px 0;">Visit JamRoom: <a href="${DEFAULT_APP_LOGIN_URL}" target="_blank" rel="noopener noreferrer" style="color:#1d4ed8;text-decoration:none;">${DEFAULT_APP_LOGIN_URL}</a></div>
        <div>All rights reserved. ${quotationPresentation.studioName}</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
    };

    let pdfBuffer = null;
    const pdfFilename = `Quotation_${(settings?.studioName || 'JamRoom').replace(/[^a-zA-Z0-9]/g, '_')}_${generatedAt.toISOString().split('T')[0]}.pdf`;
    try {
      const pdfRecipientName = recipientEmails.length === 1
        ? (userEmailMap.get(recipientEmails[0]) || '')
        : '';
      pdfBuffer = await generateQuotationPDF({
        rentalTypeLabel, selectedTypeLabels, calculation,
        rentals: sanitizedRentals, quoteNotes, generatedAt,
        gstEnabled, gstRate, gstDisplayName, taxAmount, totalAmount,
        discountAmount, discountNote: parsedQuotation.discountNote,
        recipientName: pdfRecipientName
      }, settings);
    } catch (pdfError) {
      console.error('Quotation PDF generation failed (non-fatal):', pdfError.message);
    }

    const emailAttachments = pdfBuffer
      ? [{ filename: pdfFilename, content: pdfBuffer, contentType: 'application/pdf' }]
      : [];

    if (emailDeliveryMode === 'separate') {
      for (const recipientEmail of recipientEmails) {
        const recipientNameForEmail = userEmailMap.get(recipientEmail) || '';
        await sendEmail({
          to: recipientEmail,
          subject,
          html: buildQuotationEmailHtml({
            recipientName: recipientNameForEmail,
            individualEmail: true
          }),
          attachments: emailAttachments
        });
      }
    } else {
      const singleRecipientName = recipientEmails.length === 1
        ? (userEmailMap.get(recipientEmails[0]) || '')
        : '';
      await sendEmail({
        to: recipientEmails.join(', '),
        subject,
        html: buildQuotationEmailHtml({ recipientName: singleRecipientName }),
        attachments: emailAttachments
      });
    }

    const whatsappRecipients = selectedUsers
      .map((user) => ({
        name: String(user?.name || '').trim(),
        email: normalizeEmail(user?.email),
        mobile: String(user?.mobile || '').trim()
      }))
      .filter((user) => user.mobile);

    const buildQuotationScheduleText = () => {
      const parts = [];

      if (calculation.hasInhouse && calculation.schedules?.inhouse?.date) {
        const inhouse = calculation.schedules.inhouse;
        parts.push(`In-house: ${inhouse.date} ${inhouse.startTime}-${inhouse.endTime}`);
      }

      if (calculation.hasPerday && calculation.schedules?.perday?.startDate) {
        const perday = calculation.schedules.perday;
        parts.push(`Per-day: ${perday.startDate} ${perday.pickupTime} to ${perday.endDate} ${perday.returnTime}`);
      }

      return parts.join('\n');
    };

    const quotationScheduleText = buildQuotationScheduleText();
    const whatsappResults = [];

    for (const recipient of whatsappRecipients) {
      const quotationMessage = `🎵 ${settings?.studioName || 'JamRoom'} Quotation Sent

Hi ${recipient.name || 'there'},
Your quotation has been shared via email.

📌 Type: ${rentalTypeLabel}
💰 Total: ₹${totalAmount}
${discountAmount > 0 ? `🎁 Discount: ₹${discountAmount}\n` : ''}
${quotationScheduleText ? `📅 Schedule:\n${quotationScheduleText}\n` : ''}

To confirm, reply on email or WhatsApp us at ${quotationPresentation.studioPhone}.`;

      const result = await sendWhatsApp(recipient.mobile, quotationMessage);
      whatsappResults.push({
        name: recipient.name,
        email: recipient.email,
        mobile: recipient.mobile,
        success: Boolean(result?.success),
        message: result?.message || result?.error || null,
        data: result?.data || null
      });
    }

    const whatsappSuccessCount = whatsappResults.filter((item) => item.success).length;
    const whatsappFailureCount = whatsappResults.length - whatsappSuccessCount;

    if (whatsappResults.length > 0) {
      console.log(`Quotation WhatsApp notifications result: ${whatsappSuccessCount} success, ${whatsappFailureCount} failed`);
      if (whatsappFailureCount > 0) {
        const failedRecipients = whatsappResults
          .filter((item) => !item.success)
          .map((item) => `${item.mobile}: ${item.message || 'Unknown error'}`);
        console.log('Quotation WhatsApp failed recipients:', failedRecipients.join('; '));
      }
    }

    let savedQuotation = null;
    if (shouldSaveTemplate) {
      const templateName = saveTemplateName || rentalTypeLabel || `Quotation ${generatedAt.toLocaleDateString('en-IN')}`;
      const templatePayload = {
        name: templateName,
        rentalTypeLabel,
        selectedTypes: parsedQuotation.selectedTypes,
        notes: quoteNotes,
        schedules: parsedQuotation.schedules,
        rentals: sanitizedRentals.map((item) => ({
          name: item.name,
          category: item.category,
          description: item.description,
          rentalType: item.rentalType,
          quantity: item.quantity,
          priceSnapshot: item.price
        })),
        createdAt: new Date(),
        updatedAt: new Date()
      };

      settings.savedQuotations = Array.isArray(settings.savedQuotations) ? settings.savedQuotations : [];
      if (updateTemplateId) {
        const targetIndex = settings.savedQuotations.findIndex((item) => String(item?._id) === updateTemplateId);
        if (targetIndex === -1) {
          return res.status(404).json({ success: false, message: 'Loaded quotation template not found for update' });
        }

        const existingTemplate = settings.savedQuotations[targetIndex];
        settings.savedQuotations[targetIndex] = {
          ...templatePayload,
          _id: existingTemplate?._id,
          createdAt: existingTemplate?.createdAt || templatePayload.createdAt,
          updatedAt: new Date()
        };
      } else {
        settings.savedQuotations.push(templatePayload);
      }
      await settings.save();
      const savedTemplate = updateTemplateId
        ? settings.savedQuotations.find((item) => String(item?._id) === updateTemplateId)
        : settings.savedQuotations[settings.savedQuotations.length - 1];
      savedQuotation = toSavedQuotationResponse(savedTemplate, settings);
    }

    console.log(`Quotation sent ${emailDeliveryMode === 'separate' ? 'separately' : 'in one email'} to ${recipientEmails.length} recipient(s), PDF: ${pdfBuffer ? 'attached' : 'skipped'}`);

    res.json({
      success: true,
      message: `Quotation sent ${emailDeliveryMode === 'separate' ? 'separately' : 'in one email'} to ${recipientEmails.length} recipient(s)${pdfBuffer ? ' with PDF attachment' : ''}`,
      recipients: recipientEmails,
      emailDeliveryMode,
      pdfAttached: !!pdfBuffer,
      whatsapp: {
        recipientsAttempted: whatsappResults.length,
        successful: whatsappSuccessCount,
        failed: whatsappFailureCount,
        results: whatsappResults
      },
      quotation: {
        rentalType: rentalTypeLabel,
        schedules: calculation.schedules,
        inhouseDurationHours: calculation.inhouseDurationHours,
        perdayDays: calculation.perdayDays,
        subtotal: calculation.subtotal,
        taxAmount,
        totalAmount
      },
      savedQuotation
    });
  } catch (error) {
    console.error('Send quotation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to send quotation' });
  }
});

module.exports = router;
