const axios = require('axios');

// WhatsApp messaging providers:
// 1. Twilio WhatsApp API - https://www.twilio.com/whatsapp
// 2. Meta WhatsApp Business API - https://developers.facebook.com/docs/whatsapp
// 3. WhatsApp Business API providers like Gupshup, MSG91, etc.
// 4. Unofficial WhatsApp Web API (use with caution)

/**
 * Send WhatsApp message using Twilio WhatsApp API
 * You'll need to sign up at https://www.twilio.com/whatsapp and get your credentials
 * Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER to your environment variables
 */
const sendWhatsAppTwilio = async (mobile, message) => {
  try {
    const twilio = require('twilio');
    
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.log('Twilio credentials not configured');
      return { success: false, message: 'WhatsApp service not configured' };
    }

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // Format mobile number for WhatsApp
    let whatsappNumber = mobile.replace(/[^\d]/g, '');
    if (whatsappNumber.length === 10) {
      whatsappNumber = '+91' + whatsappNumber;
    } else if (whatsappNumber.length === 12 && whatsappNumber.startsWith('91')) {
      whatsappNumber = '+' + whatsappNumber;
    }
    
    const result = await client.messages.create({
      body: message,
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'}`, // Twilio Sandbox number
      to: `whatsapp:${whatsappNumber}`
    });

    console.log('WhatsApp sent successfully via Twilio:', result.sid);
    return { success: true, data: { sid: result.sid, status: result.status } };
  } catch (error) {
    console.error('Twilio WhatsApp error:', error);
    return { success: false, message: 'WhatsApp service error', error: error.message };
  }
};

/**
 * Send WhatsApp message using MSG91 WhatsApp API
 * You'll need to sign up at https://msg91.com/ and get WhatsApp API access
 * Add MSG91_API_KEY and MSG91_WHATSAPP_TEMPLATE_ID to your environment variables
 */
const sendWhatsAppMSG91 = async (mobile, message) => {
  try {
    if (!process.env.MSG91_API_KEY) {
      console.log('MSG91 API key not configured');
      return { success: false, message: 'WhatsApp service not configured' };
    }

    // Format mobile number
    let whatsappNumber = mobile.replace(/[^\d]/g, '');
    if (whatsappNumber.length === 10) {
      whatsappNumber = '91' + whatsappNumber;
    } else if (whatsappNumber.length === 12 && whatsappNumber.startsWith('91')) {
      // Already formatted
    } else if (whatsappNumber.startsWith('+91')) {
      whatsappNumber = whatsappNumber.substring(1);
    }

    const response = await axios.post('https://api.msg91.com/api/v5/whatsapp/', {
      integrated_number: process.env.MSG91_WHATSAPP_NUMBER || '919172706306',
      content_type: 'text',
      payload: {
        text: message
      },
      recipient_whatsapp: whatsappNumber
    }, {
      headers: {
        'Authkey': process.env.MSG91_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.type === 'success') {
      console.log('WhatsApp sent successfully via MSG91:', response.data);
      return { success: true, data: response.data };
    } else {
      console.log('WhatsApp failed via MSG91:', response.data);
      return { success: false, message: 'WhatsApp sending failed', data: response.data };
    }
  } catch (error) {
    console.error('MSG91 WhatsApp error:', error.response?.data || error.message);
    return { success: false, message: 'WhatsApp service error', error: error.message };
  }
};

/**
 * Send WhatsApp message using Meta WhatsApp Business API
 * You'll need to set up WhatsApp Business API and get access token
 * Add META_WHATSAPP_TOKEN, META_WHATSAPP_PHONE_ID, and META_WHATSAPP_VERSION to your environment variables
 */
const sendWhatsAppMeta = async (mobile, message) => {
  try {
    if (!process.env.META_WHATSAPP_TOKEN || !process.env.META_WHATSAPP_PHONE_ID) {
      console.log('Meta WhatsApp credentials not configured');
      return { success: false, message: 'WhatsApp service not configured' };
    }

    // Format mobile number
    let whatsappNumber = mobile.replace(/[^\d]/g, '');
    if (whatsappNumber.length === 10) {
      whatsappNumber = '91' + whatsappNumber;
    } else if (whatsappNumber.length === 12 && whatsappNumber.startsWith('91')) {
      // Already formatted
    }

    const version = process.env.META_WHATSAPP_VERSION || 'v18.0';
    const phoneId = process.env.META_WHATSAPP_PHONE_ID;
    
    const response = await axios.post(
      `https://graph.facebook.com/${version}/${phoneId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: whatsappNumber,
        type: 'text',
        text: { body: message }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.META_WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('WhatsApp sent successfully via Meta:', response.data);
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Meta WhatsApp error:', error.response?.data || error.message);
    return { success: false, message: 'WhatsApp service error', error: error.message };
  }
};

/**
 * Main WhatsApp sending function - tries multiple providers
 * @param {string} mobile - Mobile number (with or without +91)
 * @param {string} message - WhatsApp message content
 * @param {string} provider - Preferred provider ('twilio', 'msg91', 'meta')
 */
const sendWhatsApp = async (mobile, message, provider = 'twilio') => {
  if (!mobile || !message) {
    return { success: false, message: 'Mobile number and message are required' };
  }

  // Clean and format mobile number
  let cleanMobile = mobile.replace(/[^\d]/g, '');
  if (cleanMobile.length === 10) {
    cleanMobile = '+91' + cleanMobile;
  } else if (cleanMobile.length === 12 && cleanMobile.startsWith('91')) {
    cleanMobile = '+' + cleanMobile;
  }

  console.log(`Sending WhatsApp to ${cleanMobile} via ${provider}`);

  try {
    let result;
    
    switch (provider) {
      case 'msg91':
        result = await sendWhatsAppMSG91(cleanMobile, message);
        break;
      case 'meta':
        result = await sendWhatsAppMeta(cleanMobile, message);
        break;
      case 'twilio':
      default:
        result = await sendWhatsAppTwilio(cleanMobile, message);
        break;
    }

    // If primary provider fails, try alternatives
    if (!result.success && provider !== 'twilio') {
      console.log(`${provider} failed, trying Twilio as fallback`);
      result = await sendWhatsAppTwilio(cleanMobile, message);
    }

    return result;
  } catch (error) {
    console.error('WhatsApp sending error:', error);
    return { success: false, message: 'WhatsApp service error', error: error.message };
  }
};

/**
 * Send booking request confirmation to customer
 */
const sendCustomerBookingRequestWhatsApp = async (mobile, bookingDetails) => {
  if (!mobile) {
    return { success: false, message: 'No mobile number provided' };
  }

  const message = `🎵 JamRoom Booking Request Received! 🎵

Hi ${bookingDetails.userName}!
Your booking request has been submitted successfully.

📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.startTime}-${bookingDetails.endTime}
⏱️ Duration: ${bookingDetails.duration} hour(s)
💰 Total: ₹${bookingDetails.totalAmount}

💳 Payment Details:
UPI ID: ${bookingDetails.upiId}
Name: ${bookingDetails.upiName}

📋 Status: Pending Admin Approval
We'll notify you once approved! ✅

Thank you for choosing JamRoom! 🎸🥁`;

  return await sendWhatsApp(mobile, message);
};

/**
 * Send booking confirmation WhatsApp message to customer
 */
const sendBookingConfirmationWhatsApp = async (mobile, bookingDetails) => {
  if (!mobile) {
    return { success: false, message: 'No mobile number provided' };
  }

  let message;
  
  if (bookingDetails.status === 'CONFIRMED' || bookingDetails.status === 'confirmed') {
    message = `✅ JamRoom Booking Confirmed! ✅

Hi! Your booking is now confirmed.

📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.startTime}-${bookingDetails.endTime}
💰 Total: ₹${bookingDetails.totalAmount}
🆔 Booking ID: ${bookingDetails.bookingId}
📊 Payment Status: ${bookingDetails.paymentStatus || 'Pending'}

${bookingDetails.rentals ? `🎸 Items:\n${bookingDetails.rentals}` : ''}

Thank you for choosing JamRoom! 🎵🎸🥁`;
  } else {
    message = `🎵 JamRoom Booking Request Received! 🎵

Hi! Your booking request has been submitted.

📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.startTime}-${bookingDetails.endTime}
💰 Total: ₹${bookingDetails.totalAmount}
📊 Status: Pending Approval

We'll notify you once it's approved!
Thank you for choosing JamRoom! 🎸🥁`;
  }

  return await sendWhatsApp(mobile, message);
};

/**
 * Send WhatsApp notifications to multiple recipients based on notification type
 */
const sendBulkWhatsAppNotifications = async (recipients, message, notificationType) => {
  const results = [];
  
  for (const recipient of recipients) {
    try {
      const result = await sendWhatsApp(recipient.number, message);
      results.push({
        number: recipient.number,
        role: recipient.role || 'Unknown',
        success: result.success,
        message: result.message,
        data: result.data
      });
      
      // Add small delay between messages to avoid rate limiting
      if (recipients.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      results.push({
        number: recipient.number,
        role: recipient.role || 'Unknown',
        success: false,
        message: error.message
      });
    }
  }
  
  return results;
};

/**
 * Get WhatsApp notification recipients based on settings and notification type
 */
const getNotificationRecipients = (whatsappSettings, notificationType) => {
  if (!whatsappSettings || !whatsappSettings.enabled) {
    return [];
  }

  const recipients = [];

  // Add business number if enabled for this notification type
  if (whatsappSettings.businessNotifications?.[notificationType]) {
    recipients.push({
      number: whatsappSettings.businessNumber,
      role: 'Business Admin'
    });
  }

  // Add notification numbers based on their preferences
  if (whatsappSettings.notificationNumbers) {
    whatsappSettings.notificationNumbers.forEach(contact => {
      if (contact.notifications?.[notificationType]) {
        recipients.push({
          number: contact.number,
          role: contact.role
        });
      }
    });
  }

  return recipients;
};

/**
 * Send booking request WhatsApp message to all configured notification recipients
 */
const sendBookingRequestNotifications = async (bookingDetails, whatsappSettings) => {
  const recipients = getNotificationRecipients(whatsappSettings, 'bookingRequests');
  
  if (recipients.length === 0) {
    return { success: false, message: 'No WhatsApp notification recipients configured' };
  }

  const message = `🔔 New JamRoom Booking Request!

👤 Customer: ${bookingDetails.userName}
📧 Email: ${bookingDetails.userEmail}
📱 Mobile: ${bookingDetails.userMobile || 'Not provided'}
📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.startTime}-${bookingDetails.endTime}
💰 Amount: ₹${bookingDetails.totalAmount}
${bookingDetails.bandName ? `🎸 Band: ${bookingDetails.bandName}` : ''}

Please check admin panel to approve. 📋`;

  return await sendBulkWhatsAppNotifications(recipients, message, 'bookingRequests');
};

/**
 * Send booking confirmation WhatsApp notifications to staff
 */
const sendBookingConfirmationNotifications = async (bookingDetails, whatsappSettings) => {
  const recipients = getNotificationRecipients(whatsappSettings, 'bookingConfirmations');
  
  if (recipients.length === 0) {
    return { success: false, message: 'No WhatsApp notification recipients configured' };
  }

  const message = `✅ JamRoom Booking Confirmed!

👤 Customer: ${bookingDetails.userName}
📱 Mobile: ${bookingDetails.userMobile || 'Not provided'}
📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.startTime}-${bookingDetails.endTime}
💰 Amount: ₹${bookingDetails.totalAmount}
🆔 Booking ID: ${bookingDetails.bookingId}
${bookingDetails.bandName ? `🎸 Band: ${bookingDetails.bandName}` : ''}

Studio is booked and ready! 🎵`;

  return await sendBulkWhatsAppNotifications(recipients, message, 'bookingConfirmations');
};

/**
 * Send payment update notifications
 */
const sendPaymentUpdateNotifications = async (bookingDetails, whatsappSettings) => {
  const recipients = getNotificationRecipients(whatsappSettings, 'paymentUpdates');
  
  if (recipients.length === 0) {
    return { success: false, message: 'No WhatsApp notification recipients configured' };
  }

  const message = `💳 Payment Update - JamRoom

👤 Customer: ${bookingDetails.userName}
🆔 Booking ID: ${bookingDetails.bookingId}
📅 Date: ${bookingDetails.date}
💰 Amount: ₹${bookingDetails.totalAmount}
📊 Status: ${bookingDetails.paymentStatus}

${bookingDetails.paymentStatus === 'PAID' ? '✅ Payment received!' : '⏳ Payment pending'}`;

  return await sendBulkWhatsAppNotifications(recipients, message, 'paymentUpdates');
};

/**
 * Send cancellation notifications
 */
const sendCancellationNotifications = async (bookingDetails, whatsappSettings) => {
  const recipients = getNotificationRecipients(whatsappSettings, 'cancellations');
  
  if (recipients.length === 0) {
    return { success: false, message: 'No WhatsApp notification recipients configured' };
  }

  const message = `❌ JamRoom Booking Cancelled

👤 Customer: ${bookingDetails.userName}
📅 Date: ${bookingDetails.date}
⏰ Time: ${bookingDetails.startTime}-${bookingDetails.endTime}
🆔 Booking ID: ${bookingDetails.bookingId}
💰 Amount: ₹${bookingDetails.totalAmount}

Slot is now available for booking.`;

  return await sendBulkWhatsAppNotifications(recipients, message, 'cancellations');
};

/**
 * Send payment reminder WhatsApp message
 */
const sendPaymentReminderWhatsApp = async (mobile, bookingDetails) => {
  const message = `💳 JamRoom Payment Reminder

🆔 Booking ID: ${bookingDetails.bookingId}
📅 Date: ${bookingDetails.date}
💰 Amount: ₹${bookingDetails.totalAmount}
💸 UPI: ${bookingDetails.upiId}

Please complete payment soon to confirm your booking. ⏰`;

  return await sendWhatsApp(mobile, message);
};

module.exports = {
  sendWhatsApp,
  sendCustomerBookingRequestWhatsApp,
  sendBookingConfirmationWhatsApp,
  sendBulkWhatsAppNotifications,
  getNotificationRecipients,
  sendBookingRequestNotifications,
  sendBookingConfirmationNotifications,
  sendPaymentUpdateNotifications,
  sendCancellationNotifications,
  sendPaymentReminderWhatsApp
};