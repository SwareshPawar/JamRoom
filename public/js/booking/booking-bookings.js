/**
 * Booking history and billing actions module.
 */

// Load user's bookings
const loadMyBookings = async () => {
    const loadingEl = document.getElementById('bookingsLoading');
    const bookingsEl = document.getElementById('bookingsList');

    if (loadingEl) {
        loadingEl.style.display = 'none';
    }

    if (bookingsEl) {
        bookingsEl.style.display = 'block';
        bookingsEl.innerHTML = window.JamRoomUtils?.getSectionLoaderMarkup
            ? window.JamRoomUtils.getSectionLoaderMarkup('Loading bookings...')
            : '<div class="loading-text">Loading bookings...</div>';
    }

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/my-bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (data.bookings.length === 0) {
            document.getElementById('bookingsList').innerHTML =
                '<p class="booking-empty-message">No bookings yet</p>';
            return;
        }

        let html = '';
        data.bookings.forEach(booking => {
            const isPerday = booking.bookingMode === 'perday';
            const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
            const perDayRange = (booking.perDayStartDate && booking.perDayEndDate)
                ? `${formatDate(booking.perDayStartDate)} to ${formatDate(booking.perDayEndDate)}`
                : formatDate(booking.date);
            const perDayTimeRange = `${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}`;

            const statusClass = booking.bookingStatus.toLowerCase();
            const rentalsDisplay = booking.rentals && booking.rentals.length > 0
                ? booking.rentals.filter(r => r && r.name && r.quantity !== undefined && r.price !== undefined)
                    .map(r => {
                        const rentalType = String(r.rentalType || 'inhouse').toLowerCase();
                        const days = isPerday ? perDayDays : 1;
                        const amount = (isPerday || rentalType === 'perday')
                            ? (r.price * r.quantity * days)
                            : (r.price * r.quantity * (booking.duration || 1));
                        return `<li>${r.name} × ${r.quantity} - ₹${amount}</li>`;
                    }).join('')
                : `<li>${booking.rentalType || 'Unknown rental'}</li>`;

            const bookingDateLine = isPerday
                ? `<p><strong>📅 Per-day Range:</strong> ${perDayRange} (${perDayDays} day(s))</p>`
                : `<p><strong>📅 Date:</strong> ${formatDate(booking.date)}</p>`;

            const bookingTimeLine = isPerday
                ? `<p><strong>🕐 Pick-up/Return:</strong> ${perDayTimeRange}</p>`
                : `<p><strong>🕐 Time:</strong> ${formatTime(booking.startTime)} - ${formatTime(booking.endTime)} (${booking.duration}h)</p>`;

            html += `
                <div class="booking-card ${statusClass}">
                    <div class="booking-card-header">
                        <h4 class="booking-card-title">
                            ${booking.rentals && booking.rentals.length > 0 ? `${booking.rentals.filter(r => r && r.name).length} Rental(s)` : (booking.rentalType || 'Booking')}
                        </h4>
                        <span class="status-badge status-${statusClass}">${booking.bookingStatus}</span>
                    </div>
                    <p><strong>📝 Items:</strong></p>
                    <ul class="booking-rentals-list">${rentalsDisplay}</ul>
                    ${bookingDateLine}
                    ${bookingTimeLine}
                    <p><strong>💰 Total:</strong> ₹${booking.price}
                        ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                        ? `<small>(Subtotal: ₹${booking.subtotal} + Tax: ₹${booking.taxAmount})</small>` : ''}
                    </p>
                    ${booking.bandName ? `<p><strong>🎵 Band:</strong> ${booking.bandName}</p>` : ''}
                    <div class="booking-actions-row">
                        ${booking.bookingStatus === 'PENDING'
                        ? `<button onclick="cancelBooking('${booking._id}')" class="btn btn-danger">Cancel Booking</button>`
                        : ''}
                        ${(booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'COMPLETED')
                        ? `<button onclick="downloadUserPDF('${booking._id}')" class="btn btn-secondary" title="Download Bill PDF">📄 Download Bill</button>`
                        : ''}
                    </div>
                </div>
            `;
        });

        document.getElementById('bookingsList').innerHTML = html || '<p class="booking-empty-message">No valid bookings found</p>';
    } catch (error) {
        console.error('Load bookings error:', error);

        if (loadingEl) {
            loadingEl.style.display = 'none';
        }

        if (bookingsEl) {
            bookingsEl.style.display = 'block';
            bookingsEl.innerHTML = '<p class="text-danger">Failed to load bookings: ' + error.message + '</p>';
        }
    }
};

// Cancel booking
const cancelBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/${bookingId}/cancel`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to cancel booking');

        showAlert('Booking cancelled successfully', 'success');
        await loadMyBookings();
    } catch (error) {
        showAlert(error.message, 'error');
    }
};

// Download PDF bill for user
const downloadUserPDF = async (bookingId) => {
    try {
        showLoadingOverlay('Generating your bill PDF...');

        const token = localStorage.getItem('token');

        // First, try server-side PDF generation
        try {
            console.log('Attempting server-side PDF generation...');
            const res = await fetch(`${API_URL}/api/bookings/${bookingId}/download-pdf`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                // Server-side generation successful
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `jamroom-booking-${bookingId}.pdf`;
                document.body.appendChild(a);
                a.click();

                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                showAlert('Your bill PDF has been downloaded successfully!', 'success');
                return; // Success, exit early
            }

            const error = await res.json();
            console.log('Server-side PDF failed:', error.message);
            throw new Error(error.message || 'Server-side PDF generation failed');

        } catch (serverError) {
            console.log('Server-side PDF generation failed, trying client-side...', serverError.message);

            // Fallback to client-side PDF generation
            showLoadingOverlay('Server unavailable, generating PDF locally...');

            // Get booking data and admin settings for client-side generation
            const [bookingRes, settingsRes] = await Promise.all([
                fetch(`${API_URL}/api/bookings/${bookingId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${API_URL}/api/admin/debug-settings`, {
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

            // Generate PDF on client-side
            await generatePDFClient(bookingData.booking, settingsData);
            showAlert('Your bill PDF has been downloaded successfully! (Generated locally)', 'success');
        }

    } catch (error) {
        console.error('PDF download error:', error);

        let userMessage = error.message;

        if (error.message.includes('Booking not found')) {
            userMessage = 'Booking not found. It may have been cancelled or removed.';
        } else if (error.message.includes('PDF generation failed')) {
            userMessage = 'Unable to generate PDF at this time. Please try again later or contact support.';
        } else if (error.message.includes('Not authorized')) {
            userMessage = 'You are not authorized to download this bill. Please make sure you are logged in.';
        } else if (error.message.includes('generatePDFClient is not defined')) {
            userMessage = 'PDF generation library not loaded. Please refresh the page and try again.';
        } else {
            userMessage = 'Unable to generate PDF. Please try again or contact support if the problem persists.';
        }

        showAlert(userMessage, 'error');
    } finally {
        hideLoadingOverlay();
    }
};

// Expose for inline handlers and cross-file calls.
window.loadMyBookings = loadMyBookings;
window.cancelBooking = cancelBooking;
window.downloadUserPDF = downloadUserPDF;
