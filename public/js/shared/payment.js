/**
 * JamRoom Payment Module
 * Handles UPI payment functionality, QR code generation, and app integration
 */

class PaymentManager {
    constructor(config = {}) {
        this.upiId = config.upiId || '';
        this.upiName = config.upiName || 'JamRoom Studio';
        this.amount = config.amount || '';
        this.currency = config.currency || 'INR';
        this.notificationDuration = config.notificationDuration || 3000;
    }

    /**
     * Update payment configuration
     */
    updateConfig(config) {
        Object.assign(this, config);
    }

    /**
     * Generate QR code for UPI payment
     * @param {string} elementId - ID of img element to display QR code
     * @param {string} amount - Payment amount (optional)
     */
    generateQRCode(elementId, amount = '') {
        if (!this.upiId || !this.upiName) {
            console.error('PaymentManager: UPI ID and name are required for QR generation');
            return;
        }

        const paymentAmount = amount || this.amount;
        let upiLink = `upi://pay?pa=${encodeURIComponent(this.upiId)}&pn=${encodeURIComponent(this.upiName)}&cu=${this.currency}`;
        
        if (paymentAmount) {
            upiLink += `&am=${encodeURIComponent(paymentAmount)}`;
        }

        // Generate QR code using external API
        const qrCodeURL = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiLink)}`;
        
        const qrImage = document.getElementById(elementId);
        if (qrImage) {
            qrImage.src = qrCodeURL;
            qrImage.style.display = 'block';
            qrImage.onerror = () => {
                console.error('PaymentManager: Failed to load QR code');
                this.showNotification('❌ Failed to generate QR code', 'error');
            };
        } else {
            console.error(`PaymentManager: Element with ID '${elementId}' not found`);
        }
    }

    /**
     * Setup payment buttons with event listeners
     * @param {Object} buttonConfig - Configuration for button IDs
     */
    setupPaymentButtons(buttonConfig = {}) {
        const {
            upiBtn = 'payWithUPI',
            phonePeBtn = 'payWithPhonePe', 
            gPayBtn = 'payWithGPay',
            paytmBtn = 'payWithPaytm'
        } = buttonConfig;

        if (!this.upiId || !this.upiName) {
            console.error('PaymentManager: UPI ID and name are required for payment buttons');
            return;
        }

        // Generic UPI payment button
        this.setupButton(upiBtn, () => {
            const upiLink = this.createUPILink();
            this.tryOpenUPIApp(upiLink, 'any UPI app');
        });

        // PhonePe button - now shows share dialog
        this.setupButton(phonePeBtn, () => {
            const upiLink = this.createUPILink();
            this.sharePaymentLink(upiLink, 'PhonePe');
        });

        // Google Pay button - now copies UPI link
        this.setupButton(gPayBtn, () => {
            const upiLink = this.createUPILink();
            this.copyToClipboard(upiLink, '📋 UPI payment link copied to clipboard!');
        });

        // Paytm button - now copies UPI ID
        this.setupButton(paytmBtn, () => {
            this.copyToClipboard(this.upiId, '📋 UPI ID copied to clipboard!');
        });
    }

    /**
     * Create UPI payment link
     * @param {string} amount - Payment amount (optional)
     */ 
    createUPILink(amount = '') {
        const paymentAmount = amount || this.amount;
        let upiLink = `upi://pay?pa=${encodeURIComponent(this.upiId)}&pn=${encodeURIComponent(this.upiName)}&cu=${this.currency}`;
        
        if (paymentAmount) {
            upiLink += `&am=${encodeURIComponent(paymentAmount)}`;
        }
        
        return upiLink;
    }

    /**
     * Setup individual button with error handling
     */ 
    setupButton(buttonId, clickHandler) {
        const button = document.getElementById(buttonId);
        if (button) {
            // Remove existing event listeners
            button.replaceWith(button.cloneNode(true));
            const newButton = document.getElementById(buttonId);
            newButton.addEventListener('click', clickHandler);
        }
    }

    /**
     * Try to open UPI app with fallback mechanisms
     * @param {string} upiLink - UPI payment link
     * @param {string} appName - Name of the app being opened
     */
    tryOpenUPIApp(upiLink, appName = 'UPI app') {
        let appOpened = false;
        
        // Create hidden iframe to attempt deep link
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = upiLink;
        document.body.appendChild(iframe);
        
        // Remove iframe after attempt
        setTimeout(() => {
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
        }, 1000);
        
        // Set up detection for app launch failure
        const startTime = Date.now();
        
        // Check if app opened (user left the page)
        const checkAppLaunch = () => {
            const timeDiff = Date.now() - startTime;
            if (document.hidden || timeDiff > 2000) {
                appOpened = true;
                return;
            }
        };
        
        // Listen for visibility change (app opened)
        document.addEventListener('visibilitychange', checkAppLaunch, { once: true });
        
        // Fallback after 3 seconds if app didn't open
        setTimeout(() => {
            if (!appOpened) {
                this.showAppNotFoundDialog(appName);
            }
        }, 3000);
    }

    /**
     * Share payment link using Web Share API  
     * @param {string} upiLink - UPI payment link
     * @param {string} appName - Name of preferred app
     */
    sharePaymentLink(upiLink, appName = 'UPI app') {
        if (navigator.share) {
            const shareData = {
                title: 'JamRoom UPI Payment',
                text: `UPI payment for JamRoom booking\nUPI ID: ${this.upiId}\nAmount: ${this.amount ? '₹' + this.amount : 'Enter amount'}\nLink: ${upiLink}`,
                url: upiLink
            };
            
            navigator.share(shareData).catch(err => {
                console.log('Share failed:', err);
                this.copyToClipboard(upiLink, '📋 UPI payment link copied to clipboard!');
            });
        } else {
            // Fallback to copying
            this.copyToClipboard(upiLink, '📋 UPI payment link copied to clipboard!');
        }
    }

    /**
     * Copy text to clipboard with notification
     * @param {string} text - Text to copy
     * @param {string} message - Success message
     */
    copyToClipboard(text, message = '✅ Copied to clipboard!') {
        if (!text) {
            this.showNotification('❌ Nothing to copy', 'error');
            return;
        }

        if (navigator.clipboard && window.isSecureContext) {
            // Modern clipboard API
            navigator.clipboard.writeText(text)
                .then(() => this.showNotification(message, 'success'))
                .catch(err => {
                    console.error('Clipboard write failed:', err);
                    this.fallbackCopy(text, message);
                });
        } else {
            // Fallback for older browsers
            this.fallbackCopy(text, message);
        }
    }

    /**
     * Fallback copy method for older browsers
     */
    fallbackCopy(text, message) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            this.showNotification(message, 'success');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            this.showNotification('❌ Copy failed - please copy manually', 'error');
        } finally {
            document.body.removeChild(textarea);
        }
    }

    /**
     * Show dialog when UPI app is not found
     */
    showAppNotFoundDialog(appName) {
        const message = `
            <div class="payment-dialog-content">
                <p><strong>${appName} not found or couldn't be opened.</strong></p>
                <p>Here are alternative ways to pay:</p>
                <ul class="payment-dialog-list">
                    <li><strong>Copy UPI ID:</strong> ${this.upiId}</li>
                    <li><strong>Open any UPI app manually</strong> (PhonePe, GPay, Paytm, etc.)</li>
                    <li><strong>Scan the QR code</strong> above</li>
                </ul>
                <div class="payment-dialog-actions">
                    <button onclick="window.paymentManager?.copyToClipboard('${this.upiId}', '📋 UPI ID copied!'); this.closest('[data-dialog]')?.remove();" 
                            class="payment-dialog-btn payment-dialog-btn-success">
                        📋 Copy UPI ID
                    </button>
                    <button onclick="this.closest('[data-dialog]')?.remove();" 
                            class="payment-dialog-btn payment-dialog-btn-secondary">
                        ✕ Close
                    </button>
                </div>
            </div>
        `;
        
        this.showCustomDialog('Payment App Not Found', message, 'warning');
    }

    /**
     * Show custom dialog
     */
    showCustomDialog(title, message, type = 'info') {
        const overlay = document.createElement('div');
        overlay.setAttribute('data-dialog', 'true');
        overlay.className = 'payment-dialog-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'payment-dialog-box';
        
        const iconMap = {
            'info': '💡',
            'warning': '⚠️',
            'error': '❌',
            'success': '✅'
        };
        
        dialog.innerHTML = `
            <div class="payment-dialog-header">
                <span class="payment-dialog-icon">${iconMap[type] || '💡'}</span>
                <h3 class="payment-dialog-title">${title}</h3>
            </div>
            <div class="payment-dialog-body">
                ${message}
            </div>
        `;
        
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
        
        // Auto-remove after 15 seconds if not manually closed
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 15000);
    }

    /**
     * Show notification messages
     */
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.innerHTML = message;
        const normalizedType = type === 'success' || type === 'error' ? type : 'info';
        notification.className = `payment-toast payment-toast-${normalizedType}`;
        
        document.body.appendChild(notification);
        
        // Fade out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, this.notificationDuration);
    }
}

/**
 * Convenience functions for direct use without class instantiation
 */
const PaymentUtils = {
    /**
     * Copy UPI ID with notification
     */
    copyUpiId(upiId, message = '📋 UPI ID copied to clipboard!') {
        const manager = new PaymentManager({ upiId });
        manager.copyToClipboard(upiId, message);
    },

    /**
     * Copy UPI name with notification  
     */
    copyUpiName(upiName, message = '📋 UPI Name copied to clipboard!') {
        const manager = new PaymentManager({ upiName });
        manager.copyToClipboard(upiName, message);
    },

    /**
     * Generate QR code quickly
     */
    generateQR(elementId, upiId, upiName, amount = '') {
        const manager = new PaymentManager({ upiId, upiName, amount });
        manager.generateQRCode(elementId);
    }
};

// Make available globally for backwards compatibility
window.PaymentManager = PaymentManager;
window.PaymentUtils = PaymentUtils;

console.log('💳 payment.js: Payment manager loaded');