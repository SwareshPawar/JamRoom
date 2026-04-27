/**
 * Admin booking actions module.
 * Handles delete booking, send eBill, and PDF download actions.
 */

(() => {
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
    let sendEBillSearchDebounceTimer = null;
    let sendEBillSearchRequestSeq = 0;

    const parseEmailListInput = (inputValue) => {
        return String(inputValue || '')
            .split(/[\s,;]+/)
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean);
    };

    const escapeHtml = (value) => {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const hideSendEBillTypeahead = () => {
        const typeahead = document.getElementById('sendEBillUserTypeahead');
        if (!typeahead) return;

        typeahead.innerHTML = '';
        typeahead.style.display = 'none';
        typeahead.classList.add('admin-hidden');
    };

    const showSendEBillTypeahead = () => {
        const typeahead = document.getElementById('sendEBillUserTypeahead');
        if (!typeahead) return;

        typeahead.style.display = 'block';
        typeahead.classList.remove('admin-hidden');
    };

    const addSendEBillEmailToTextarea = (email) => {
        const normalizedEmail = String(email || '').trim().toLowerCase();
        if (!isValidEmail(normalizedEmail)) return;

        const textarea = document.getElementById('sendEBillAdditionalEmails');
        if (!textarea) return;

        const existingEmails = parseEmailListInput(textarea.value);
        if (existingEmails.includes(normalizedEmail)) {
            return;
        }

        const prefix = textarea.value.trim() ? ', ' : '';
        textarea.value = `${textarea.value.trim()}${prefix}${normalizedEmail}`;
        textarea.focus();
    };

    const renderSendEBillTypeaheadResults = (users) => {
        const typeahead = document.getElementById('sendEBillUserTypeahead');
        if (!typeahead) return;

        if (!Array.isArray(users) || users.length === 0) {
            typeahead.innerHTML = '<div class="typeahead-empty">No matching user found.</div>';
            showSendEBillTypeahead();
            return;
        }

        typeahead.innerHTML = users.slice(0, 15).map((user) => {
            const safeName = escapeHtml(user.name || 'User');
            const safeEmail = escapeHtml((user.email || '').toLowerCase());
            const safeMobile = escapeHtml(user.mobile || '');
            const mobileText = safeMobile ? ` | ${safeMobile}` : '';

            return `
                <button
                    type="button"
                    class="typeahead-option-btn"
                    data-send-ebill-email="${safeEmail}"
                >
                    <div class="typeahead-option-name">${safeName}</div>
                    <div class="typeahead-option-meta">${safeEmail}${mobileText}</div>
                </button>
            `;
        }).join('');

        showSendEBillTypeahead();
    };

    const searchSendEBillUsers = async (query) => {
        const trimmedQuery = String(query || '').trim();
        if (!trimmedQuery) {
            hideSendEBillTypeahead();
            return;
        }

        const requestId = ++sendEBillSearchRequestSeq;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users?q=${encodeURIComponent(trimmedQuery)}&limit=20`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to search users');
            }

            const result = await response.json();
            if (requestId !== sendEBillSearchRequestSeq) {
                return;
            }

            const users = Array.isArray(result.users)
                ? result.users.filter((user) => isValidEmail(user.email || ''))
                : [];

            renderSendEBillTypeaheadResults(users);
        } catch (error) {
            if (requestId !== sendEBillSearchRequestSeq) {
                return;
            }

            const typeahead = document.getElementById('sendEBillUserTypeahead');
            if (!typeahead) return;

            typeahead.innerHTML = '<div class="typeahead-empty">Unable to load user suggestions.</div>';
            showSendEBillTypeahead();
        }
    };

    const setupSendEBillUserTypeahead = () => {
        const searchInput = document.getElementById('sendEBillUserSearch');
        const typeahead = document.getElementById('sendEBillUserTypeahead');
        if (!searchInput || !typeahead || searchInput.getAttribute('data-send-ebill-setup') === 'true') {
            return;
        }

        const handleSearch = () => {
            const query = searchInput.value || '';
            if (sendEBillSearchDebounceTimer) {
                clearTimeout(sendEBillSearchDebounceTimer);
            }

            sendEBillSearchDebounceTimer = setTimeout(() => {
                searchSendEBillUsers(query);
            }, 220);
        };

        searchInput.addEventListener('input', handleSearch);
        searchInput.addEventListener('focus', handleSearch);

        typeahead.addEventListener('click', (event) => {
            const option = event.target.closest('[data-send-ebill-email]');
            if (!option) return;

            const email = option.getAttribute('data-send-ebill-email');
            addSendEBillEmailToTextarea(email);
            hideSendEBillTypeahead();
            searchInput.value = '';
        });

        document.addEventListener('click', (event) => {
            if (!event.target.closest('#sendEBillUserSearch') && !event.target.closest('#sendEBillUserTypeahead')) {
                hideSendEBillTypeahead();
            }
        });

        searchInput.setAttribute('data-send-ebill-setup', 'true');
    };

    const deleteBooking = async (bookingId, deps) => {
        const {
            apiUrl,
            showConfirmationModal,
            showLoading,
            hideLoading,
            showAlert,
            refreshStats,
            refreshBookings
        } = deps;

        showConfirmationModal(
            'Delete Booking',
            'Are you sure you want to delete this booking? This action cannot be undone and will notify the customer.',
            'Delete',
            async () => {
                try {
                    showLoading('Deleting booking...');

                    const token = localStorage.getItem('token');
                    const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!res.ok) {
                        throw new Error('Failed to delete booking');
                    }

                    showAlert('bookingAlert', 'Booking deleted successfully', 'success');
                    await refreshStats();
                    await refreshBookings();
                } catch (error) {
                    showAlert('bookingAlert', error.message, 'error');
                } finally {
                    hideLoading();
                }
            }
        );
    };

    const openSendEBillModal = (bookingId) => {
        const bookingIdInput = document.getElementById('sendEBillBookingId');
        const includeCustomerInput = document.getElementById('sendEBillIncludeCustomer');
        const additionalEmailsInput = document.getElementById('sendEBillAdditionalEmails');
        const userSearchInput = document.getElementById('sendEBillUserSearch');
        const modal = document.getElementById('sendEBillModal');

        if (bookingIdInput) bookingIdInput.value = bookingId;
        if (includeCustomerInput) includeCustomerInput.checked = true;
        if (additionalEmailsInput) additionalEmailsInput.value = '';
        if (userSearchInput) userSearchInput.value = '';
        hideSendEBillTypeahead();
        if (modal) modal.classList.add('show');
    };

    const submitSendEBill = async (deps) => {
        const { apiUrl, closeModal, showLoading, hideLoading, showAlert } = deps;

        const bookingId = document.getElementById('sendEBillBookingId')?.value;
        const includeCustomer = document.getElementById('sendEBillIncludeCustomer')?.checked === true;
        const additionalEmails = parseEmailListInput(document.getElementById('sendEBillAdditionalEmails')?.value || '');

        const invalidEmails = additionalEmails.filter((email) => !isValidEmail(email));
        if (invalidEmails.length > 0) {
            showAlert('bookingAlert', `Invalid email address(es): ${invalidEmails.join(', ')}`, 'error');
            return;
        }

        if (!includeCustomer && additionalEmails.length === 0) {
            showAlert('bookingAlert', 'Select customer email or provide at least one additional email address.', 'error');
            return;
        }

        try {
            closeModal('sendEBillModal');
            showLoading('Generating and sending eBill...');

            const token = localStorage.getItem('token');
            const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/send-ebill`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ includeCustomer, additionalEmails })
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || 'Failed to send eBill');
            }

            const result = await res.json();
            const recipientsText = Array.isArray(result.recipients) && result.recipients.length > 0
                ? `\nRecipients: ${result.recipients.join(', ')}`
                : '';
            showAlert('bookingAlert', `${result.message || 'eBill sent successfully!'}${recipientsText}`, 'success');
        } catch (error) {
            console.error('Send eBill error:', error);

            let userMessage = error.message;

            if (error.message.includes('Daily user sending limit exceeded')) {
                userMessage = 'Gmail daily sending limit reached. Wait up to 24 hours and try again.';
            } else if (error.message.includes('Authentication failed') || error.message.includes('invalid credentials')) {
                userMessage = 'Email authentication failed. Check EMAIL_USER, EMAIL_PASS, and app password setup.';
            } else if (error.message.includes('Recipient address rejected') || error.message.includes('Invalid recipients')) {
                userMessage = 'One or more recipient email addresses are invalid. Please verify and retry.';
            } else if (error.message.includes('Network')) {
                userMessage = 'Network issue while contacting email service. Check connectivity and retry.';
            }

            showAlert('bookingAlert', userMessage, 'error');
        } finally {
            hideLoading();
        }
    };

    const downloadPDF = async (bookingId, deps) => {
        const { apiUrl, showLoading, hideLoading, showAlert } = deps;

        try {
            showLoading('Generating PDF bill...');
            const token = localStorage.getItem('token');

            try {
                const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/download-pdf`, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `jamroom-bill-${bookingId}.pdf`;
                    document.body.appendChild(a);
                    a.click();

                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);

                    showAlert('bookingAlert', 'PDF bill downloaded successfully!', 'success');
                    return;
                }

                const error = await res.json();
                throw new Error(error.message || 'Server-side PDF generation failed');
            } catch (serverError) {
                showLoading('Server unavailable, generating PDF locally...');

                const [bookingRes, settingsRes] = await Promise.all([
                    fetch(`${apiUrl}/api/bookings/${bookingId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    fetch(`${apiUrl}/api/admin/debug-settings`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                ]);

                if (!bookingRes.ok) {
                    throw new Error('Could not fetch booking data for PDF generation');
                }

                const bookingData = await bookingRes.json();
                let settingsData = null;

                if (settingsRes.ok) {
                    const settings = await settingsRes.json();
                    settingsData = settings.settings;
                }

                if (typeof generatePDFClient !== 'function') {
                    throw new Error('generatePDFClient is not defined');
                }

                await generatePDFClient(bookingData.booking, settingsData);
                showAlert('bookingAlert', 'PDF bill downloaded successfully! (Generated locally)', 'success');
            }
        } catch (error) {
            console.error('Download PDF error:', error);

            let userMessage = error.message;
            if (error.message.includes('Booking not found')) {
                userMessage = 'Booking not found. Refresh and try again.';
            } else if (error.message.includes('PDF generation failed')) {
                userMessage = 'PDF generation failed. Try again in a moment.';
            } else if (error.message.includes('generatePDFClient is not defined')) {
                userMessage = 'PDF generation library not loaded. Please refresh the page and try again.';
            } else {
                userMessage = 'Unable to generate PDF. Please try again or contact support if the problem persists.';
            }

            showAlert('bookingAlert', userMessage, 'error');
        } finally {
            hideLoading();
        }
    };

    window.AdminBookingActions = window.AdminBookingActions || {};
    window.AdminBookingActions.deleteBooking = deleteBooking;
    window.AdminBookingActions.openSendEBillModal = openSendEBillModal;
    window.AdminBookingActions.submitSendEBill = submitSendEBill;
    window.AdminBookingActions.downloadPDF = downloadPDF;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupSendEBillUserTypeahead);
    } else {
        setupSendEBillUserTypeahead();
    }
})();
