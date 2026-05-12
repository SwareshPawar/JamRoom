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
const { buildQuotationEmailHtml } = require('../../utils/templates/email/quotationEmailTemplate');
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
            quotationPresentation,
            recipientName: recipientNameForEmail,
            individualEmail: true,
            appLoginUrl: DEFAULT_APP_LOGIN_URL
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
        html: buildQuotationEmailHtml({
          quotationPresentation,
          recipientName: singleRecipientName,
          appLoginUrl: DEFAULT_APP_LOGIN_URL
        }),
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
