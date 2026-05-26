const WHATSAPP_DISABLED_MESSAGE = 'WhatsApp notifications are currently disabled';

const buildDisabledResult = () => ({
  success: false,
  disabled: true,
  message: WHATSAPP_DISABLED_MESSAGE
});

const sendWhatsApp = async () => buildDisabledResult();

const sendCustomerBookingRequestWhatsApp = async () => buildDisabledResult();

const sendBookingConfirmationWhatsApp = async () => buildDisabledResult();

const sendBulkWhatsAppNotifications = async () => [];

const getNotificationRecipients = () => [];

const sendBookingRequestNotifications = async () => buildDisabledResult();

const sendBookingConfirmationNotifications = async () => buildDisabledResult();

const sendPaymentUpdateNotifications = async () => buildDisabledResult();

const sendCancellationNotifications = async () => buildDisabledResult();

const sendPaymentReminderWhatsApp = async () => buildDisabledResult();

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