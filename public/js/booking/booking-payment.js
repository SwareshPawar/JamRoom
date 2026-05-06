/**
 * Booking payment UI module.
 * Renders UPI details and wires payment action buttons.
 * B3: Payment section HTML is injected on-demand — it does not exist in the
 * initial DOM, keeping the booking-create page lighter on first load.
 */

const PAYMENT_SECTION_HTML = `
<div id="upiSection" class="upi-section">
    <h3>💳 Payment Options</h3>
    <div class="payment-methods">
        <div class="payment-method">
            <h4>📱 Pay with UPI App</h4>
            <p><strong>Amount:</strong> <span id="upiAmount"></span></p>
            <button id="payWithUPI" class="payment-btn primary">Open UPI App &amp; Pay</button>
            <button id="payWithPhonePe" class="payment-btn secondary">Open PhonePe</button>
            <button id="payWithGPay" class="payment-btn secondary">Copy UPI Link</button>
            <small class="payment-note-text">PhonePe and universal UPI launch supported, with copy/share and QR fallback.</small>
        </div>
        <div class="payment-method">
            <h4>📋 Copy Payment Details</h4>
            <div class="payment-info">
                <strong>UPI ID:</strong> <span id="upiId"></span>
                <button id="copyUpiId" class="payment-btn copy">Copy UPI ID</button>
            </div>
            <div class="payment-info">
                <strong>Amount:</strong> <span id="upiAmountCopy"></span>
                <button id="copyAmount" class="payment-btn copy">Copy Amount</button>
            </div>
            <div class="payment-info">
                <strong>Name:</strong> <span id="upiName"></span>
            </div>
        </div>
        <div class="payment-divider">
            <span>or scan QR code (for desktop users)</span>
        </div>
        <div class="qr-section">
            <img id="upiQR" alt="UPI QR Code">
            <small class="payment-note-text payment-note-tight">Scan with any UPI app</small>
        </div>
    </div>
    <button id="closeUpiSection" class="btn btn-secondary payment-close-btn">Close</button>
    <a id="paymentGuideLink" href="/payment-info.html" class="btn btn-primary payment-guide-btn">Open Payment Guide</a>
</div>`;

const injectPaymentSection = () => {
    if (document.getElementById('upiSection')) return;

    const container = document.querySelector('.section-content') || document.querySelector('.main-content') || document.body;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = PAYMENT_SECTION_HTML.trim();
    const section = wrapper.firstElementChild;
    container.appendChild(section);

    section.querySelector('#closeUpiSection')?.addEventListener('click', () => {
        section.classList.remove('show');
    });
};

const renderBookingPaymentSection = (bookingResponse) => {
    injectPaymentSection();

    if (!bookingResponse || !bookingResponse.upiDetails) {
        return;
    }

    const { upiId, amount, upiName } = bookingResponse.upiDetails;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    };

    setText('upiId', upiId);
    setText('upiAmount', `₹${amount}`);
    setText('upiAmountCopy', `₹${amount}`);
    setText('upiName', upiName);

    const paymentManager = window.PaymentManager
        ? new window.PaymentManager({ upiId, upiName, amount })
        : null;

    const upiLink = paymentManager
        ? paymentManager.createUPILink(String(amount))
        : `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${encodeURIComponent(String(amount))}&cu=INR`;

    const copyValue = (value, successMessage) => {
        if (paymentManager) {
            paymentManager.copyToClipboard(value, successMessage);
            return;
        }

        navigator.clipboard.writeText(value).then(() => {
            showAlert(successMessage, 'success');
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = value;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showAlert(successMessage, 'success');
        });
    };

    const sharePaymentLink = async () => {
        if (paymentManager && navigator.share) {
            paymentManager.sharePaymentLink(upiLink, 'UPI app');
            return;
        }

        const shareText = `UPI payment for JamRoom booking\nUPI ID: ${upiId}\nAmount: ₹${amount}\nLink: ${upiLink}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'JamRoom UPI Payment',
                    text: shareText
                });
                return;
            } catch (error) {
                if (error && error.name === 'AbortError') {
                    return;
                }
            }
        }
        copyValue(upiLink, 'UPI payment link copied to clipboard!');
    };

    const bindClick = (id, handler) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.onclick = handler;
    };

    bindClick('payWithUPI', () => {
        if (paymentManager && typeof paymentManager.tryOpenUPIApp === 'function') {
            paymentManager.tryOpenUPIApp(upiLink, 'UPI app');
            return;
        }

        window.location.href = upiLink;
    });

    bindClick('payWithPhonePe', () => {
        if (paymentManager && typeof paymentManager.openPhonePe === 'function') {
            paymentManager.openPhonePe(upiLink);
            return;
        }

        sharePaymentLink();
    });

    bindClick('payWithGPay', () => {
        copyValue(upiLink, 'UPI payment link copied to clipboard!');
    });

    bindClick('copyUpiId', () => {
        copyValue(upiId, 'UPI ID copied to clipboard!');
    });

    bindClick('copyAmount', () => {
        copyValue(String(amount), 'Amount copied to clipboard!');
    });

    const qr = document.getElementById('upiQR');
    if (qr) {
        qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
    }

    const upiSection = document.getElementById('upiSection');
    if (upiSection) {
        upiSection.classList.add('show');
    }

    const paymentGuideLink = document.getElementById('paymentGuideLink');
    if (paymentGuideLink) {
        const bookingId = bookingResponse.booking && bookingResponse.booking._id ? bookingResponse.booking._id : '';
        paymentGuideLink.href = `/payment-info.html?bookingId=${encodeURIComponent(String(bookingId))}&amount=${encodeURIComponent(String(amount))}`;
    }
};

window.renderBookingPaymentSection = renderBookingPaymentSection;
