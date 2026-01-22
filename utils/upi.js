/**
 * Generate UPI payment link
 * @param {Object} options - UPI options
 * @param {string} options.upiId - UPI ID
 * @param {string} options.name - Recipient name
 * @param {number} options.amount - Amount to pay
 * @param {string} options.transactionNote - Transaction note/description
 * @returns {string} UPI payment URL
 */
const generateUPILink = (options) => {
  const { upiId, name, amount, transactionNote = 'JamRoom Booking Payment' } = options;

  // UPI URL format: upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&tn=<NOTE>&cu=INR
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount}&tn=${encodeURIComponent(transactionNote)}&cu=INR`;

  return upiUrl;
};

/**
 * Generate UPI QR code data
 * @param {Object} options - UPI options
 * @returns {Object} UPI details for QR generation
 */
const generateUPIQRData = (options) => {
  const { upiId, name, amount, transactionNote } = options;

  return {
    upiLink: generateUPILink(options),
    displayData: {
      upiId,
      name,
      amount: `₹${amount}`,
      note: transactionNote
    },
    // For frontend QR code generation using libraries like qrcode.js
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(generateUPILink(options))}`
  };
};

/**
 * Parse UPI ID and validate
 * @param {string} upiId - UPI ID to validate
 * @returns {boolean} Whether UPI ID is valid
 */
const validateUPIId = (upiId) => {
  // Basic UPI ID validation: username@bankname
  const upiRegex = /^[\w.-]+@[\w.-]+$/;
  return upiRegex.test(upiId);
};

/**
 * Format amount for display
 * @param {number} amount - Amount in rupees
 * @returns {string} Formatted amount
 */
const formatAmount = (amount) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0
  }).format(amount);
};

module.exports = {
  generateUPILink,
  generateUPIQRData,
  validateUPIId,
  formatAmount
};
