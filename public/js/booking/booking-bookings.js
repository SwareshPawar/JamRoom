/**
 * Booking history and billing actions module.
 */

// Load user's bookings
const loadMyBookings = async () => {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/my-bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        document.getElementById('bookingsLoading').style.display = 'none';
        document.getElementById('bookingsList').style.display = 'block';

        if (data.bookings.length === 0) {
            document.getElementById('bookingsList').innerHTML =
                '<p style="text-align:center; color:#666;">No bookings yet</p>';
            return;
        }

        let html = '';
        data.bookings.forEach(booking => {
            // Skip old bookings that don't have the new schema
            if (!booking.startTime || !booking.endTime || !booking.duration) {
                console.log('Skipping old booking:', booking._id);
                return;
            }

            const statusClass = booking.bookingStatus.toLowerCase();
            const date = new Date(booking.date);
            const rentalsDisplay = booking.rentals && booking.rentals.length > 0
                ? booking.rentals.filter(r => r && r.name && r.quantity !== undefined && r.price !== undefined)
                    .map(r => `<li>${r.name} × ${r.quantity} - ₹${r.price * r.quantity * booking.duration}</li>`).join('')
                : `<li>${booking.rentalType || 'Unknown rental'}</li>`;
            html += `
                <div class="booking-card ${statusClass}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                        <h4 style="font-size: 1.25em; font-weight: 700; color: #2c3e50; margin: 0; letter-spacing: -0.01em;">
                            ${booking.rentals && booking.rentals.length > 0 ? `${booking.rentals.filter(r => r && r.name).length} Rental(s)` : (booking.rentalType || 'Booking')}
                        </h4>
                        <span class="status-badge status-${statusClass}">${booking.bookingStatus}</span>
                    </div>
                    <p><strong>📝 Items:</strong></p>
                    <ul style="margin: 5px 0 10px 20px; color: #555;">${rentalsDisplay}</ul>
                    <p><strong>📅 Date:</strong> ${formatDate(booking.date)}</p>
                    <p><strong>🕐 Time:</strong> ${formatTime(booking.startTime)} - ${formatTime(booking.endTime)} (${booking.duration}h)</p>
                    <p><strong>💰 Total:</strong> ₹${booking.price}
                        ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                        ? `<small>(Subtotal: ₹${booking.subtotal} + Tax: ₹${booking.taxAmount})</small>` : ''}
                    </p>
                    ${booking.bandName ? `<p><strong>🎵 Band:</strong> ${booking.bandName}</p>` : ''}
                    <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
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

        document.getElementById('bookingsList').innerHTML = html || '<p style="text-align:center; color:#666;">No valid bookings found</p>';
    } catch (error) {
        console.error('Load bookings error:', error);
        document.getElementById('bookingsList').innerHTML =
            '<p style="color: #dc3545;">Failed to load bookings: ' + error.message + '</p>';
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
