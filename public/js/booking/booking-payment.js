/**
 * Booking payment UI module.
 * Renders UPI details and wires payment action buttons.
 */

const renderBookingPaymentSection = (bookingResponse) => {
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
        window.location.href = upiLink;
    });

    bindClick('payWithPhonePe', () => {
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
