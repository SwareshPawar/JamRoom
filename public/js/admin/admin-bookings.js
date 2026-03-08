/**
 * Admin bookings module.
 * Handles bookings table rendering and approve/reject flows.
 */

(() => {
    const setBookingsError = (message) => {
        const table = document.getElementById('bookingsTable');
        if (table) {
            table.innerHTML = `<p class="text-danger">Failed to load bookings: ${message}</p>`;
        }
    };

    const renderBookingsTable = ({ bookings, formatDate, formatTime }) => {
        const loadingEl = document.getElementById('bookingsLoading');
        const tableEl = document.getElementById('bookingsTable');

        if (loadingEl) {
            loadingEl.style.display = 'none';
        }

        if (!tableEl) {
            return;
        }

        if (!Array.isArray(bookings) || bookings.length === 0) {
            tableEl.innerHTML = '<p class="text-center-muted-padded">No bookings found</p>';
            return;
        }

        const sortedBookings = [...bookings].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        let html = '<div class="table-container"><table><thead><tr><th>#</th><th>User</th><th>Date</th><th>Time</th><th>Duration</th><th>Type</th><th>Price</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>';

        let serialNo = 1;
        sortedBookings.forEach((booking) => {
            const isPerday = booking.bookingMode === 'perday';
            const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
            const dateText = isPerday && booking.perDayStartDate && booking.perDayEndDate
                ? `${formatDate(booking.perDayStartDate)}<br><small>to ${formatDate(booking.perDayEndDate)}</small>`
                : formatDate(booking.date);
            const timeText = isPerday
                ? `${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}<br><small>JamRoom open unless manually blocked</small>`
                : `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`;
            const durationText = isPerday
                ? `${perDayDays} day(s)`
                : `${booking.duration} hour(s)`;

            const statusClass = String(booking.bookingStatus || '').toLowerCase();
            const userName = booking.userId?.name || booking.userName || 'N/A';
            const userEmail = booking.userId?.email || booking.userEmail || 'N/A';
            const createdDate = booking.createdAt
                ? new Date(booking.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : 'N/A';

            html += `
                <tr>
                    <td class="table-serial-cell">${serialNo++}</td>
                    <td>${userName}<br><small>${userEmail}</small></td>
                    <td>${dateText}</td>
                    <td>${timeText}</td>
                    <td>${durationText}</td>
                    <td>
                        ${booking.rentals && booking.rentals.length > 0
                            ? booking.rentals.map((r) => `${r.name} x ${r.quantity}`).join('<br>')
                            : (booking.rentalType || 'N/A')}
                    </td>
                    <td>
                        ₹${booking.price}
                        ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                            ? `<br><small>Subtotal: ₹${booking.subtotal}<br>Tax: ₹${booking.taxAmount}</small>`
                            : ''}
                    </td>
                    <td><span class="status-badge status-${statusClass}">${booking.bookingStatus}</span></td>
                    <td><small>${createdDate}</small></td>
                    <td>
                        ${booking.bookingStatus === 'PENDING'
                            ? `<button onclick="approveBooking('${booking._id}')" class="btn btn-success btn-sm">Approve</button>
                               <button onclick="rejectBooking('${booking._id}')" class="btn btn-danger btn-sm">Reject</button>`
                            : ''}
                        ${booking.bookingStatus === 'CONFIRMED'
                            ? `<button onclick="sendEBill('${booking._id}')" class="btn btn-primary btn-sm" title="Send eBill to customer and/or custom recipients">📧 Send eBill</button>
                               <button onclick="downloadPDF('${booking._id}')" class="btn btn-secondary btn-sm" title="Download PDF Bill">📄 Download PDF</button>`
                            : ''}
                        <button onclick="editBooking('${booking._id}', ${JSON.stringify(booking).replace(/"/g, '&quot;')})" class="btn btn-warning btn-sm">Edit</button>
                        <button onclick="deleteBooking('${booking._id}')" class="btn btn-danger btn-sm">Delete</button>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        tableEl.innerHTML = html;
    };

    const normalizeBookingActionError = ({ errorMessage, mode }) => {
        let userMessage = errorMessage;

        if (errorMessage.includes('Daily user sending limit exceeded')) {
            userMessage = mode === 'approve'
                ? 'Gmail daily limit reached. Booking was approved, but notification email failed. Inform customer manually and retry after 24 hours.'
                : 'Gmail daily limit reached. Booking was rejected, but notification email failed. Inform customer manually and retry after 24 hours.';
        } else if (errorMessage.includes('Authentication failed') || errorMessage.includes('invalid credentials')) {
            userMessage = mode === 'approve'
                ? 'Booking approved, but notification email failed due to email configuration. Check EMAIL_USER/EMAIL_PASS and app password.'
                : 'Booking rejected, but notification email failed due to email configuration. Check EMAIL_USER/EMAIL_PASS and app password.';
        }

        return userMessage;
    };

    const loadBookings = async ({ apiUrl, showSectionLoading, formatDate, formatTime }) => {
        try {
            showSectionLoading('bookingsTable', 'Loading bookings...');

            const token = localStorage.getItem('token');
            const res = await fetch(`${apiUrl}/api/admin/bookings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load bookings');
            }

            const data = await res.json();
            renderBookingsTable({ bookings: data.bookings || [], formatDate, formatTime });
        } catch (error) {
            console.error('Load bookings error:', error);
            setBookingsError(error.message);
        }
    };

    const approveBooking = async (bookingId, deps) => {
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
            'Approve Booking',
            'Are you sure you want to approve this booking? This will confirm the reservation and send a notification to the customer.',
            'Approve',
            async () => {
                try {
                    showLoading('Approving booking...');

                    const token = localStorage.getItem('token');
                    const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/approve`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!res.ok) {
                        throw new Error('Failed to approve booking');
                    }

                    showAlert('bookingAlert', 'Booking approved successfully!', 'success');
                    await refreshStats();
                    await refreshBookings();
                } catch (error) {
                    console.error('Approve booking error:', error);
                    const normalized = normalizeBookingActionError({ errorMessage: error.message, mode: 'approve' });
                    showAlert('bookingAlert', normalized, normalized === error.message ? 'error' : 'warning');
                } finally {
                    hideLoading();
                }
            }
        );
    };

    const rejectBooking = async (bookingId, deps) => {
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
            'Reject Booking',
            'Are you sure you want to reject this booking? This will notify the customer that their booking has been declined.',
            'Reject',
            async () => {
                const reason = document.getElementById('rejectionReason')?.value.trim();

                try {
                    showLoading('Rejecting booking...');

                    const token = localStorage.getItem('token');
                    const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/reject`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ reason: reason || undefined })
                    });

                    if (!res.ok) {
                        throw new Error('Failed to reject booking');
                    }

                    showAlert('bookingAlert', 'Booking rejected', 'info');
                    await refreshStats();
                    await refreshBookings();
                } catch (error) {
                    console.error('Reject booking error:', error);
                    const normalized = normalizeBookingActionError({ errorMessage: error.message, mode: 'reject' });
                    showAlert('bookingAlert', normalized, normalized === error.message ? 'error' : 'warning');
                } finally {
                    hideLoading();
                }
            },
            true
        );
    };

    window.AdminBookings = window.AdminBookings || {};
    window.AdminBookings.loadBookings = loadBookings;
    window.AdminBookings.approveBooking = approveBooking;
    window.AdminBookings.rejectBooking = rejectBooking;
})();
