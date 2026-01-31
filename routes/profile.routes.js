const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');

// @route   GET /api/profile
// @desc    Get current user profile
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password -resetToken -resetTokenExpiry');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile || '',
        role: user.role,
        createdAt: user.createdAt,
        whatsappNotifications: user.whatsappNotifications || {
          enabled: false,
          verified: false,
          sandboxJoined: false
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile'
    });
  }
});

// @route   PUT /api/profile
// @desc    Update user profile
// @access  Private
router.put('/', protect, async (req, res) => {
  try {
    const { name, email, mobile } = req.body;
    const userId = req.user._id;

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate input
    const errors = [];

    if (name !== undefined) {
      if (!name || name.trim().length < 2) {
        errors.push('Name must be at least 2 characters long');
      }
    }

    if (email !== undefined) {
      if (!email || !email.match(/^\S+@\S+\.\S+$/)) {
        errors.push('Please provide a valid email');
      } else {
        // Check if email is already taken by another user
        const existingUser = await User.findOne({ 
          email: email.toLowerCase(),
          _id: { $ne: userId }
        });
        if (existingUser) {
          errors.push('Email is already registered with another account');
        }
      }
    }

    if (mobile !== undefined && mobile.trim() !== '') {
      const mobilePattern = /^(\+91[-\s]?)?[6-9]\d{9}$/;
      if (!mobilePattern.test(mobile.trim())) {
        errors.push('Please provide a valid Indian mobile number');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors
      });
    }

    // Update fields
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (email !== undefined) updates.email = email.toLowerCase().trim();
    if (mobile !== undefined) updates.mobile = mobile.trim() || null;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password -resetToken -resetTokenExpiry');

    // Update all existing bookings with new user info
    const bookingUpdates = {};
    if (updates.name) bookingUpdates.userName = updates.name;
    if (updates.email) bookingUpdates.userEmail = updates.email;
    if (updates.mobile !== undefined) bookingUpdates.userMobile = updates.mobile;

    if (Object.keys(bookingUpdates).length > 0) {
      await Booking.updateMany(
        { userId: userId },
        bookingUpdates
      );
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        mobile: updatedUser.mobile || '',
        role: updatedUser.role,
        createdAt: updatedUser.createdAt
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
});

// @route   PUT /api/profile/password
// @desc    Change user password
// @access  Private
router.put('/password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const userId = req.user._id;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current password, new password, and confirmation'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password and confirmation do not match'
      });
    }

    // Find user with password field
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check current password
    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error changing password'
    });
  }
});

// @route   GET /api/profile/bookings
// @desc    Get user's booking history
// @access  Private
router.get('/bookings', protect, async (req, res) => {
  try {
    
    const bookings = await Booking.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({
      success: true,
      bookings: bookings.map(booking => ({
        _id: booking._id,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        duration: booking.duration,
        rentals: booking.rentals,
        price: booking.price,
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        bandName: booking.bandName,
        notes: booking.notes,
        createdAt: booking.createdAt
      }))
    });

  } catch (error) {
    console.error('Get user bookings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching bookings'
    });
  }
});

// @route   DELETE /api/profile
// @desc    Delete user account
// @access  Private
router.delete('/', protect, async (req, res) => {
  try {
    const { password } = req.body;
    const userId = req.user._id;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required to delete account'
      });
    }

    // Find user with password field
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Check for active bookings
    const activeBookings = await Booking.find({
      userId: userId,
      bookingStatus: { $in: ['PENDING', 'CONFIRMED'] },
      date: { $gte: new Date() }
    });

    if (activeBookings.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete account with active or upcoming bookings. Please cancel your bookings first.'
      });
    }

    // Delete user account
    await User.findByIdAndDelete(userId);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting account'
    });
  }
});

// @route   PUT /api/profile/whatsapp
// @desc    Update WhatsApp notification preferences
// @access  Private
router.put('/whatsapp', protect, async (req, res) => {
  try {
    const { enabled, sandboxJoined } = req.body;
    
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has mobile number
    if (!user.mobile && enabled) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number is required for WhatsApp notifications'
      });
    }

    // Update WhatsApp preferences
    if (!user.whatsappNotifications) {
      user.whatsappNotifications = {
        enabled: false,
        verified: false,
        sandboxJoined: false
      };
    }

    user.whatsappNotifications.enabled = enabled || false;
    
    if (sandboxJoined) {
      user.whatsappNotifications.sandboxJoined = true;
      user.whatsappNotifications.verified = true;
      user.whatsappNotifications.verifiedAt = new Date();
    }

    await user.save();

    res.json({
      success: true,
      message: 'WhatsApp preferences updated successfully',
      whatsappNotifications: user.whatsappNotifications
    });
  } catch (error) {
    console.error('Update WhatsApp preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating WhatsApp preferences'
    });
  }
});

// @route   GET /api/profile/whatsapp-setup
// @desc    Get WhatsApp setup instructions
// @access  Private
router.get('/whatsapp-setup', protect, async (req, res) => {
  try {
    const twilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
    const sandboxCode = process.env.TWILIO_SANDBOX_CODE || 'join steel-market';
    
    res.json({
      success: true,
      setupInstructions: {
        step1: `Send a WhatsApp message from your registered mobile number (${req.user.mobile || 'your mobile'})`,
        step2: `Send message: "${sandboxCode}"`,
        step3: `To WhatsApp number: ${twilioNumber}`,
        step4: `Wait for confirmation message from Twilio`,
        step5: `Return here and mark as completed`,
        twilioNumber,
        sandboxCode,
        userMobile: req.user.mobile
      },
      currentStatus: req.user.whatsappNotifications || {
        enabled: false,
        verified: false,
        sandboxJoined: false
      }
    });
  } catch (error) {
    console.error('WhatsApp setup instructions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching setup instructions'
    });
  }
});

module.exports = router;
