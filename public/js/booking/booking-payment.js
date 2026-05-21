/**
 * Booking payment UI module.
 * Renders a payment modal after booking creation and wires payment actions.
 */

const PAYMENT_SECTION_HTML = `
<div id="bookingPaymentModal" class="booking-payment-modal" role="dialog" aria-modal="true" aria-labelledby="bookingPaymentTitle" hidden>
    <div id="bookingPaymentBackdrop" class="booking-payment-backdrop"></div>
    <div class="booking-payment-dialog">
        <div class="booking-payment-header">
            <h3 id="bookingPaymentTitle">Payment Options</h3>
            <button id="closeUpiSection" class="booking-payment-close" type="button" aria-label="Close payment popup">×</button>
        </div>

        <p class="booking-payment-subtitle">Your booking request is saved. Complete payment using any option below.</p>

        <div class="booking-payment-summary">
            <div class="payment-summary-item">
                <span class="payment-summary-label">Booking ID</span>
                <strong id="bookingPaymentId">-</strong>
            </div>
            <div class="payment-summary-item">
                <span class="payment-summary-label">Amount</span>
                <strong id="upiAmountCopy">₹0</strong>
            </div>
        </div>

        <div class="payment-methods">
            <div class="payment-method">
                <h4>Pay by UPI</h4>
                <div class="payment-info">
                    <span class="payment-info-label">UPI ID</span>
                    <span id="upiId" class="payment-info-value"></span>
                </div>
                <div class="payment-info">
                    <span class="payment-info-label">Payee Name</span>
                    <span id="upiName" class="payment-info-value"></span>
                </div>
                <div class="payment-actions">
                    <a id="payNowBtn" class="payment-btn primary" href="#" target="_blank" rel="noopener noreferrer">Open UPI App</a>
                    <button id="copyUpiId" class="payment-btn copy" type="button">Copy UPI ID</button>
                    <button id="copyAmount" class="payment-btn copy" type="button">Copy Amount</button>
                </div>
            </div>

            <div class="payment-method qr-panel">
                <h4>Scan QR</h4>
                <div class="qr-section">
                    <img id="upiQR" alt="UPI QR Code">
                    <small class="payment-note-text">Scan with any UPI app</small>
                </div>
            </div>
        </div>

        <div class="booking-payment-footer">
            <a id="notifyApprovalBtn" href="#" target="_blank" rel="noopener noreferrer" class="btn btn-secondary payment-notify-btn" hidden>Notify for Approval on WhatsApp</a>
            <a id="paymentGuideLink" href="/payment-info.html" class="btn btn-primary payment-guide-btn">Open Payment Guide</a>
            <button id="paymentDoneBtn" class="btn btn-secondary payment-close-btn" type="button">Done</button>
        </div>
    </div>
</div>`;

const sanitizeWhatsappNumber = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return digits;
};

const buildWhatsappLink = (phone, message) => {
    const normalizedPhone = sanitizeWhatsappNumber(phone);
    if (!normalizedPhone) return '';
    return `https://wa.me/${encodeURIComponent(normalizedPhone)}?text=${encodeURIComponent(String(message || '').trim())}`;
};

let cachedPaymentContactInfo = null;

const resolvePaymentContactInfo = async () => {
    if (cachedPaymentContactInfo) {
        return cachedPaymentContactInfo;
    }

    const inMemoryContactInfo = window.adminSettings?.contactInfo || null;
    if (inMemoryContactInfo && String(inMemoryContactInfo.whatsappNumber || '').trim()) {
        cachedPaymentContactInfo = inMemoryContactInfo;
        return cachedPaymentContactInfo;
    }

    try {
        const response = await fetch('/api/bookings/settings', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
            return inMemoryContactInfo || {};
        }

        const resolvedContactInfo = payload?.settings?.contactInfo || {};
        if (resolvedContactInfo && String(resolvedContactInfo.whatsappNumber || '').trim()) {
            cachedPaymentContactInfo = resolvedContactInfo;
        }

        return resolvedContactInfo;
    } catch (_error) {
        return inMemoryContactInfo || {};
    }
};

const injectPaymentSection = () => {
    if (document.getElementById('bookingPaymentModal')) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = PAYMENT_SECTION_HTML.trim();
    const section = wrapper.firstElementChild;
    document.body.appendChild(section);

    const closeModal = () => {
        section.hidden = true;
        document.body.classList.remove('booking-payment-open');
    };

    const openModal = () => {
        section.hidden = false;
        document.body.classList.add('booking-payment-open');
    };

    section.querySelector('#closeUpiSection')?.addEventListener('click', closeModal);
    section.querySelector('#paymentDoneBtn')?.addEventListener('click', closeModal);
    section.querySelector('#bookingPaymentBackdrop')?.addEventListener('click', closeModal);

    document.addEventListener('keydown', (event) => {
        if (!section.hidden && event.key === 'Escape') {
            closeModal();
        }
    });

    section._openBookingPaymentModal = openModal;
};

const renderBookingPaymentSection = async (bookingResponse) => {
    injectPaymentSection();

    if (!bookingResponse || !bookingResponse.upiDetails) {
        return;
    }

    const { upiId, amount, upiName } = bookingResponse.upiDetails;
    const bookingId = bookingResponse.booking && bookingResponse.booking._id ? bookingResponse.booking._id : '-';
    const contactInfo = await resolvePaymentContactInfo();
    const businessWhatsapp = String(contactInfo.whatsappNumber || '').trim();
    const customerName = String(bookingResponse?.booking?.userName || window.currentUser?.name || 'Customer').trim();

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    };

    setText('upiId', upiId);
    setText('upiAmountCopy', `₹${amount}`);
    setText('upiName', upiName);
    setText('bookingPaymentId', bookingId);

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

    const bindClick = (id, handler) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.onclick = handler;
    };

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

    const payNowBtn = document.getElementById('payNowBtn');
    if (payNowBtn) {
        payNowBtn.href = upiLink;
    }

    const paymentGuideLink = document.getElementById('paymentGuideLink');
    if (paymentGuideLink) {
        paymentGuideLink.href = `/payment-info.html?bookingId=${encodeURIComponent(String(bookingId))}&amount=${encodeURIComponent(String(amount))}`;
    }

    const notifyApprovalBtn = document.getElementById('notifyApprovalBtn');
    if (notifyApprovalBtn) {
        const approvalMessage = `Hi SwarJRS, I have completed payment for booking request ${bookingId}. Please review and approve. Name: ${customerName}. Amount: INR ${amount}.`;
        const notifyLink = buildWhatsappLink(businessWhatsapp, approvalMessage);

        if (notifyLink) {
            notifyApprovalBtn.href = notifyLink;
            notifyApprovalBtn.hidden = false;
        } else {
            notifyApprovalBtn.href = '#';
            notifyApprovalBtn.hidden = true;
        }
    }

    const upiSection = document.getElementById('bookingPaymentModal');
    if (upiSection && typeof upiSection._openBookingPaymentModal === 'function') {
        upiSection._openBookingPaymentModal();
    }
};

window.renderBookingPaymentSection = renderBookingPaymentSection;
