# WhatsApp Notification System Setup

JamRoom now supports comprehensive WhatsApp notifications for bookings, confirmations, and updates. This system can send notifications to:
- Business admin number
- Sound engineer
- Maintenance person
- Additional staff members
- Customers who book

## 🔧 Environment Configuration

Add these environment variables to your `.env` file:

### Twilio WhatsApp API (Recommended)
```env
# Sign up at https://www.twilio.com/whatsapp
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=+14155238886
# For production, get your own WhatsApp Business number from Twilio
```

### MSG91 WhatsApp API (Indian Provider)
```env
# Sign up at https://msg91.com/
MSG91_API_KEY=your_msg91_api_key
MSG91_WHATSAPP_NUMBER=919172706306
```

### Meta WhatsApp Business API (Official)
```env
# Set up at https://developers.facebook.com/docs/whatsapp
META_WHATSAPP_TOKEN=your_meta_access_token
META_WHATSAPP_PHONE_ID=your_phone_number_id
META_WHATSAPP_VERSION=v18.0
```

## 📱 Notification Recipients Management

### Default Configuration
The system comes with default settings for:
- **Business Number**: +919172706306 (receives all notifications)
- **Sound Engineer**: Configurable number for booking-related alerts
- **Maintenance Person**: Configurable number for setup notifications

### Admin API Endpoints

#### Get WhatsApp Settings
```
GET /api/admin/whatsapp-settings
```

#### Update WhatsApp Settings
```
PUT /api/admin/whatsapp-settings
Body: {
  "whatsappNotifications": {
    "enabled": true,
    "businessNumber": "+919172706306",
    "businessNotifications": {
      "bookingRequests": true,
      "bookingConfirmations": true,
      "paymentUpdates": true,
      "cancellations": true
    }
  }
}
```

#### Add New Contact
```
POST /api/admin/whatsapp-settings/add-contact
Body: {
  "number": "+919876543210",
  "role": "Sound Engineer",
  "notifications": {
    "bookingRequests": true,
    "bookingConfirmations": true,
    "paymentUpdates": false,
    "cancellations": true
  }
}
```

#### Update Contact
```
PUT /api/admin/whatsapp-settings/update-contact/0
Body: {
  "number": "+919876543210",
  "role": "Senior Sound Engineer",
  "notifications": {
    "bookingRequests": true,
    "bookingConfirmations": true,
    "paymentUpdates": true,
    "cancellations": true
  }
}
```

#### Remove Contact
```
DELETE /api/admin/whatsapp-settings/remove-contact/0
```

#### Test Notifications
```
POST /api/admin/whatsapp-settings/test-notification
Body: {
  "number": "+919876543210",
  "message": "Custom test message (optional)"
}
```

## 🎯 Notification Types

### 1. Booking Requests
Sent when customer creates a new booking request:
- Business admin
- Sound engineer (if enabled)
- Maintenance person (if enabled)

### 2. Booking Confirmations
Sent when admin approves a booking:
- Customer (if mobile provided)
- Business admin
- All staff with confirmation notifications enabled

### 3. Payment Updates
Sent when payment status changes:
- Business admin
- Staff with payment notification enabled

### 4. Cancellations/Rejections
Sent when bookings are cancelled or rejected:
- Customer (if mobile provided)
- All staff with cancellation notifications enabled

## 🚀 Quick Start Guide

### 1. Choose a Provider
For quick testing: **Twilio Sandbox** (requires users to send "join" message first)
For production: **Meta WhatsApp Business API** or **MSG91**

### 2. Configure Environment Variables
Add your chosen provider's credentials to `.env`

### 3. Set Up Notification Contacts
Use the admin API endpoints or admin panel to add:
- Sound engineer contact
- Maintenance person contact
- Additional staff members

### 4. Test the System
Use the test notification endpoint to verify setup:
```bash
POST /api/admin/whatsapp-settings/test-notification
{
  "number": "+919172706306"
}
```

## 📋 Features

✅ **Multiple Recipients**: Send to business, staff, and customers
✅ **Role-based Notifications**: Different notifications for different roles
✅ **Selective Notifications**: Enable/disable by notification type
✅ **Customer Notifications**: Automatic booking confirmations to customers
✅ **Fallback System**: Multiple providers with automatic fallback
✅ **Test System**: Test notifications before going live
✅ **Mobile Validation**: Indian mobile number validation
✅ **Admin Management**: Full CRUD for notification contacts

## ⚠️ Important Notes

### WhatsApp Policies
- WhatsApp has strict policies about message content
- For business use, you need approved templates for certain message types
- Sandbox/test numbers have limitations

### Rate Limiting
- System includes small delays between bulk messages
- Consider SMS as fallback if WhatsApp fails

### Production Considerations
1. Get WhatsApp Business API approval from Meta
2. Use dedicated WhatsApp Business number
3. Create message templates for compliance
4. Monitor notification delivery rates
5. Have SMS backup system ready