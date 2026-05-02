/**
 * Admin User Management Routes
 * Handles: user CRUD, make-admin, reset-password
 */

const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const AdminSettings = require('../../models/AdminSettings');
const Booking = require('../../models/Booking');
const { protect } = require('../../middleware/auth');
const { isAdmin } = require('../../middleware/admin');
const { sendEmail } = require('../../utils/email');
const {
  normalizeEmail,
  normalizeIndianMobile,
  isValidIndianMobile,
  DEFAULT_ADMIN_CREATED_USER_PASSWORD,
  DEFAULT_APP_LOGIN_URL,
  ADMIN_DELETE_OWNER_EMAIL
} = require('../../utils/adminHelpers');

// @route   GET /api/admin/users
// @desc    Get all registered users
// @access  Private/Admin
router.get('/users', protect, isAdmin, async (req, res) => {
  try {
    const { q = '', limit = 100 } = req.query;
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const query = {};
    if (q && q.trim()) {
      const regex = new RegExp(q.trim(), 'i');
      query.$or = [
        { name: regex },
        { email: regex },
        { mobile: regex }
      ];
    }

    const users = await User.find(query)
      .select('name email mobile role createdAt')
      .sort({ createdAt: -1 })
      .limit(safeLimit);

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching users'
    });
  }
});

// @route   POST /api/admin/users
// @desc    Create a user from admin panel for immediate booking
// @access  Private/Admin
router.post('/users', protect, isAdmin, async (req, res) => {
  try {
    const { name, email, mobile } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name and email'
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email is already registered'
      });
    }

    const normalizedMobile = normalizeIndianMobile(mobile);
    if (normalizedMobile && !isValidIndianMobile(normalizedMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Indian mobile number'
      });
    }

    const userPayload = {
      name: name.trim(),
      email: normalizedEmail,
      password: DEFAULT_ADMIN_CREATED_USER_PASSWORD,
      role: 'user',
      forcePasswordReset: true,
      tempPasswordSetAt: new Date()
    };

    if (normalizedMobile) {
      userPayload.mobile = normalizedMobile;
    }

    const user = await User.create(userPayload);

    let inviteEmailSent = false;
    try {
      const settings = await AdminSettings.getSettings();
      await sendEmail({
        to: user.email,
        subject: `Your ${settings.studioName || 'JamRoom'} Account Invite`,
        html: `
          <h2>Welcome to ${settings.studioName || 'JamRoom'}</h2>
          <p>Hi ${user.name},</p>
          <p>An admin created your account so you can access JamRoom services.</p>
          <h3>Login Details</h3>
          <ul>
            <li><strong>Login URL:</strong> <a href="${DEFAULT_APP_LOGIN_URL}">${DEFAULT_APP_LOGIN_URL}</a></li>
            <li><strong>Email:</strong> ${user.email}</li>
            <li><strong>Temporary Password:</strong> ${DEFAULT_ADMIN_CREATED_USER_PASSWORD}</li>
          </ul>
          <p><strong>Security Notice:</strong> You must reset your password on first login before continuing.</p>
          <p>This is an account invite email only. No booking has been created from this action.</p>
        `
      });
      inviteEmailSent = true;
    } catch (inviteEmailError) {
      console.log('Admin user invite email failed:', inviteEmailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile || '',
        role: user.role,
        createdAt: user.createdAt
      },
      temporaryPassword: DEFAULT_ADMIN_CREATED_USER_PASSWORD,
      inviteEmailSent,
      inviteMessage: inviteEmailSent
        ? 'Account invite email sent successfully'
        : 'User created, but invite email could not be sent'
    });
  } catch (error) {
    console.error('Create admin user error:', error);

    if (error && error.name === 'ValidationError') {
      const firstValidationError = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: firstValidationError?.message || 'Validation failed while creating user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error creating user'
    });
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Update registered user details from admin panel
// @access  Private/Admin
router.put('/users/:id', protect, isAdmin, async (req, res) => {
  try {
    const { name, email, mobile } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name and email'
      });
    }

    const user = await User.findById(req.params.id).select('name email mobile role createdAt');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const normalizedEmailValue = normalizeEmail(email);
    if (!normalizedEmailValue) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email'
      });
    }

    if (normalizedEmailValue !== normalizeEmail(user.email)) {
      const duplicateUser = await User.findOne({ email: normalizedEmailValue, _id: { $ne: user._id } }).select('_id');
      if (duplicateUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already registered'
        });
      }
    }

    const previousEmail = normalizeEmail(user.email);
    const normalizedMobile = normalizeIndianMobile(mobile);
    if (normalizedMobile && !isValidIndianMobile(normalizedMobile)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Indian mobile number'
      });
    }

    user.name = String(name).trim();
    user.email = normalizedEmailValue;
    user.mobile = normalizedMobile || undefined;

    await user.save();

    if (user.role === 'admin' && previousEmail !== normalizedEmailValue) {
      const settings = await AdminSettings.getSettings();
      if (Array.isArray(settings.adminEmails) && settings.adminEmails.length > 0) {
        settings.adminEmails = settings.adminEmails.map((adminEmail) => {
          const normalizedAdminEmail = normalizeEmail(adminEmail);
          return normalizedAdminEmail === previousEmail ? normalizedEmailValue : adminEmail;
        });

        await settings.save();
      }
    }

    res.json({
      success: true,
      message: 'User details updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile || '',
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Update admin user error:', error);

    if (error && error.name === 'ValidationError') {
      const firstValidationError = Object.values(error.errors || {})[0];
      return res.status(400).json({
        success: false,
        message: firstValidationError?.message || 'Validation failed while updating user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error updating user'
    });
  }
});

// @route   POST /api/admin/users/:id/reset-default-password
// @desc    Reset a user's password to the default admin-created password
// @access  Private/Admin
router.post('/users/:id/reset-default-password', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('+password +resetToken +resetTokenExpiry');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot reset your own password from this action'
      });
    }

    user.password = DEFAULT_ADMIN_CREATED_USER_PASSWORD;
    user.forcePasswordReset = true;
    user.tempPasswordSetAt = new Date();
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset to default successfully',
      temporaryPassword: DEFAULT_ADMIN_CREATED_USER_PASSWORD,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error resetting user password'
    });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user and their associated bookings
// @access  Private/Admin
router.delete('/users/:id', protect, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
    }

    const requesterEmail = (req.user.email || '').trim().toLowerCase();
    const canDeleteAdminUsers = requesterEmail === ADMIN_DELETE_OWNER_EMAIL;

    if (user.role === 'admin' && !canDeleteAdminUsers) {
      return res.status(403).json({
        success: false,
        message: 'Only owner admin can delete admin users'
      });
    }

    if (user.role === 'admin') {
      const settings = await AdminSettings.getSettings();
      if (Array.isArray(settings.adminEmails)) {
        const targetEmail = (user.email || '').trim().toLowerCase();
        settings.adminEmails = settings.adminEmails.filter((email) => (email || '').trim().toLowerCase() !== targetEmail);
        await settings.save();
      }
    }

    const deletedBookings = await Booking.deleteMany({ userId: user._id });
    await User.deleteOne({ _id: user._id });

    res.json({
      success: true,
      message: 'User deleted successfully',
      deletedBookings: deletedBookings.deletedCount || 0,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting user'
    });
  }
});

// @route   POST /api/admin/make-admin
// @desc    Grant admin privileges to a user
// @access  Private/Admin
router.post('/make-admin', protect, isAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide user email'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.role === 'admin') {
      return res.status(400).json({
        success: false,
        message: 'User is already an admin'
      });
    }

    user.role = 'admin';
    await user.save();

    const settings = await AdminSettings.getSettings();
    if (!settings.adminEmails.includes(email)) {
      settings.adminEmails.push(email);
      await settings.save();
    }

    try {
      await sendEmail({
        to: email,
        subject: `Admin Access Granted - ${settings.studioName || 'Swar JamRoom Studio'}`,
        html: `
          <h2>Admin Access Granted</h2>
          <p>Hi ${user.name},</p>
          <p>You have been granted admin privileges for JamRoom booking system.</p>
          <p>You can now access the admin panel to manage bookings and settings.</p>
        `
      });
    } catch (emailError) {
      console.log('Admin notification email failed:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Admin privileges granted successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error granting admin privileges'
    });
  }
});

module.exports = router;
