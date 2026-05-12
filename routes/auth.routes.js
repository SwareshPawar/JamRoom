const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AdminSettings = require('../models/AdminSettings');
const { sendEmail } = require('../utils/email');
const { buildInvoiceStyleEmail } = require('../utils/templates/email/invoiceStyleEmailTemplate');

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: 'user'
    });

    // Send welcome email
    try {
      const settings = await AdminSettings.getSettings();
      await sendEmail({
        to: email,
        subject: `Welcome to ${settings?.studioName || 'JamRoom'}!`,
        html: buildInvoiceStyleEmail({
          brandName: settings?.studioName || 'JamRoom',
          studioAddress: settings?.studioAddress || '',
          studioPhone: settings?.studioPhone || '',
          studioEmail: settings?.adminEmails?.[0] || '',
          title: 'Welcome Email',
          label: 'Account Created',
          greeting: `Hi ${name},`,
          introLines: [
            'Thank you for registering with JamRoom. Your account is ready and you can now explore available slots and book studio time.'
          ],
          summaryTitle: 'Account Details',
          summaryRows: [
            { label: 'Email', value: email },
            { label: 'Status', value: 'Registered' },
            { label: 'Next Step', value: 'Log in to explore available slots' }
          ],
          ctaTitle: 'Get Started',
          ctaHtml: `<p>Visit the JamRoom portal to browse slots, manage bookings, and complete your profile.</p>`,
          footerLines: ['This is an automated account welcome email.']
        })
      });
    } catch (emailError) {
      console.log('Welcome email failed:', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Check user exists (include password field)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordMatch = await user.comparePassword(password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Force password reset for admin-created temporary-password users.
    if (user.forcePasswordReset) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.resetTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes
      await user.save();

      return res.status(403).json({
        success: false,
        requiresPasswordReset: true,
        message: 'Password reset required before first login',
        resetToken,
        resetPath: `/reset-password.html?token=${resetToken}&force=1`
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      token: generateToken(user._id),
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email'
      });
    }

    const user = await User.findOne({ email }).select('+resetToken +resetTokenExpiry');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with this email'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetTokenExpiry = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.BASE_URL}/reset-password.html?token=${resetToken}`;

    // Send email
    try {
      const settings = await AdminSettings.getSettings();
      await sendEmail({
        to: email,
        subject: `Password Reset Request - ${settings?.studioName || 'JamRoom'}`,
        html: buildInvoiceStyleEmail({
          brandName: settings?.studioName || 'JamRoom',
          studioAddress: settings?.studioAddress || '',
          studioPhone: settings?.studioPhone || '',
          studioEmail: settings?.adminEmails?.[0] || '',
          title: 'Security Link',
          label: 'Password Reset',
          greeting: 'Hello,',
          introLines: [
            'You requested a password reset. Use the secure link below to set a new password for your JamRoom account.',
            'This link expires in 30 minutes. If you did not request this change, you can safely ignore this email.'
          ],
          summaryTitle: 'Reset Details',
          summaryRows: [
            { label: 'Reset Link', value: resetUrl },
            { label: 'Valid For', value: '30 minutes' }
          ],
          ctaTitle: 'Reset Password',
          ctaHtml: `<p><a href="${resetUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;">Reset Password</a></p>`,
          footerLines: ['If you did not request this reset, no action is needed.']
        })
      });

      res.json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (emailError) {
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/auth/validate-reset-token/:token
// @desc    Check if a reset token is valid before user fills out the form
// @access  Public
router.get('/validate-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const tokenExists = await User.findOne({ resetToken: hashedToken }).select('+resetToken +resetTokenExpiry');
    if (!tokenExists) {
      return res.status(400).json({ success: false, message: 'Invalid reset link. Please request a new password reset.' });
    }
    if (tokenExists.resetTokenExpiry < new Date()) {
      return res.status(400).json({ success: false, message: 'Reset link has expired. Please request a new password reset.' });
    }
    return res.json({ success: true, message: 'Token is valid' });
  } catch (error) {
    console.error('Validate reset token error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide token and new password'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Hash token to compare
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // First check if the token exists at all (regardless of expiry)
    const tokenExists = await User.findOne({ resetToken: hashedToken }).select('+resetToken +resetTokenExpiry');
    if (!tokenExists) {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset link. Please request a new password reset.'
      });
    }

    // Now check if it is still valid (not expired)
    const user = await User.findOne({
      resetToken: hashedToken,
      resetTokenExpiry: { $gt: new Date() }
    }).select('+resetToken +resetTokenExpiry');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Reset link has expired. Please request a new password reset.'
      });
    }

    // Set new password
    user.password = password;
    user.forcePasswordReset = false;
    user.tempPasswordSetAt = undefined;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful',
      token: generateToken(user._id)
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(401).json({
      success: false,
      message: 'Not authorized'
    });
  }
});

module.exports = router;
