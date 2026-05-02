/**
 * Admin WhatsApp Settings Routes
 * Handles: WhatsApp notification config CRUD, test notification
 */

const express = require('express');
const router = express.Router();
const AdminSettings = require('../../models/AdminSettings');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { sendWhatsApp } = require('../../utils/whatsapp');

// @route   GET /api/admin/whatsapp-settings
// @desc    Get WhatsApp notification settings
// @access  Private/Admin
router.get('/whatsapp-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();

    res.json({
      success: true,
      whatsappSettings: settings.whatsappNotifications || {
        enabled: true,
        businessNumber: '+919172706306',
        notificationNumbers: [],
        businessNotifications: {
          bookingRequests: true,
          bookingConfirmations: true,
          paymentUpdates: true,
          cancellations: true
        }
      }
    });
  } catch (error) {
    console.error('Get WhatsApp settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching WhatsApp settings'
    });
  }
});

// @route   PUT /api/admin/whatsapp-settings
// @desc    Update WhatsApp notification settings
// @access  Private/Admin
router.put('/whatsapp-settings', protect, isAdmin, async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();

    if (req.body.whatsappNotifications) {
      settings.whatsappNotifications = {
        ...settings.whatsappNotifications,
        ...req.body.whatsappNotifications
      };
    }

    await settings.save();

    res.json({
      success: true,
      message: 'WhatsApp settings updated successfully',
      whatsappSettings: settings.whatsappNotifications
    });
  } catch (error) {
    console.error('Update WhatsApp settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating WhatsApp settings'
    });
  }
});

// @route   POST /api/admin/whatsapp-settings/add-contact
// @desc    Add a new WhatsApp notification contact
// @access  Private/Admin
router.post('/whatsapp-settings/add-contact', protect, isAdmin, async (req, res) => {
  try {
    const { number, role, notifications } = req.body;

    if (!number || !role) {
      return res.status(400).json({
        success: false,
        message: 'Number and role are required'
      });
    }

    const mobilePattern = /^(\+91[-\s]?)?[6-9]\d{9}$/;
    if (!mobilePattern.test(number.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Indian mobile number'
      });
    }

    const settings = await AdminSettings.getSettings();

    if (!settings.whatsappNotifications) {
      settings.whatsappNotifications = {
        enabled: true,
        businessNumber: '+919172706306',
        notificationNumbers: [],
        businessNotifications: {
          bookingRequests: true,
          bookingConfirmations: true,
          paymentUpdates: true,
          cancellations: true
        }
      };
    }

    const existingContact = settings.whatsappNotifications.notificationNumbers.find(
      contact => contact.number === number.trim()
    );

    if (existingContact) {
      return res.status(400).json({
        success: false,
        message: 'This number is already added'
      });
    }

    settings.whatsappNotifications.notificationNumbers.push({
      number: number.trim(),
      role: role.trim(),
      notifications: notifications || {
        bookingRequests: true,
        bookingConfirmations: true,
        paymentUpdates: false,
        cancellations: true
      }
    });

    await settings.save();

    res.json({
      success: true,
      message: 'WhatsApp contact added successfully',
      contact: settings.whatsappNotifications.notificationNumbers[settings.whatsappNotifications.notificationNumbers.length - 1]
    });
  } catch (error) {
    console.error('Add WhatsApp contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error adding WhatsApp contact'
    });
  }
});

// @route   PUT /api/admin/whatsapp-settings/update-contact/:index
// @desc    Update a WhatsApp notification contact
// @access  Private/Admin
router.put('/whatsapp-settings/update-contact/:index', protect, isAdmin, async (req, res) => {
  try {
    const { index } = req.params;
    const { number, role, notifications } = req.body;

    const settings = await AdminSettings.getSettings();

    if (!settings.whatsappNotifications || !settings.whatsappNotifications.notificationNumbers) {
      return res.status(404).json({
        success: false,
        message: 'WhatsApp settings not found'
      });
    }

    const contactIndex = parseInt(index);
    if (contactIndex < 0 || contactIndex >= settings.whatsappNotifications.notificationNumbers.length) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    if (number) {
      const mobilePattern = /^(\+91[-\s]?)?[6-9]\d{9}$/;
      if (!mobilePattern.test(number.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid Indian mobile number'
        });
      }
    }

    if (number) settings.whatsappNotifications.notificationNumbers[contactIndex].number = number.trim();
    if (role) settings.whatsappNotifications.notificationNumbers[contactIndex].role = role.trim();
    if (notifications) settings.whatsappNotifications.notificationNumbers[contactIndex].notifications = notifications;

    await settings.save();

    res.json({
      success: true,
      message: 'WhatsApp contact updated successfully',
      contact: settings.whatsappNotifications.notificationNumbers[contactIndex]
    });
  } catch (error) {
    console.error('Update WhatsApp contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating WhatsApp contact'
    });
  }
});

// @route   DELETE /api/admin/whatsapp-settings/remove-contact/:index
// @desc    Remove a WhatsApp notification contact
// @access  Private/Admin
router.delete('/whatsapp-settings/remove-contact/:index', protect, isAdmin, async (req, res) => {
  try {
    const { index } = req.params;

    const settings = await AdminSettings.getSettings();

    if (!settings.whatsappNotifications || !settings.whatsappNotifications.notificationNumbers) {
      return res.status(404).json({
        success: false,
        message: 'WhatsApp settings not found'
      });
    }

    const contactIndex = parseInt(index);
    if (contactIndex < 0 || contactIndex >= settings.whatsappNotifications.notificationNumbers.length) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    const removedContact = settings.whatsappNotifications.notificationNumbers.splice(contactIndex, 1)[0];

    await settings.save();

    res.json({
      success: true,
      message: 'WhatsApp contact removed successfully',
      removedContact
    });
  } catch (error) {
    console.error('Remove WhatsApp contact error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error removing WhatsApp contact'
    });
  }
});

// @route   POST /api/admin/whatsapp-settings/test-notification
// @desc    Send test WhatsApp notification to verify setup
// @access  Private/Admin
router.post('/whatsapp-settings/test-notification', protect, isAdmin, async (req, res) => {
  try {
    const { number, message } = req.body;

    if (!number) {
      return res.status(400).json({
        success: false,
        message: 'Number is required'
      });
    }

    const testMessage = message || `🧪 JamRoom WhatsApp Test

This is a test message from JamRoom booking system.
If you received this, WhatsApp notifications are working correctly! ✅

Sent at: ${new Date().toLocaleString('en-IN')}`;

    const result = await sendWhatsApp(number, testMessage);

    res.json({
      success: result.success,
      message: result.success ? 'Test notification sent successfully' : 'Test notification failed',
      details: result
    });
  } catch (error) {
    console.error('Test WhatsApp notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error sending test notification'
    });
  }
});

module.exports = router;
