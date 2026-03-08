/**
 * Admin revenue module.
 * Handles revenue fetching, summary rendering, and filter behavior.
 */

(() => {
    const state = {
        filterHandlerBound: false
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    };

    const updateRevenueCharts = (revenue = {}) => {
        const revenueByType = revenue.revenueByType || {};
        const bookingsByType = revenue.bookingsByType || {};

        const revenueByTypeHtml = Object.entries(revenueByType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, amount]) => `
                <div class="revenue-breakdown-row">
                    <span>${type}</span>
                    <strong>₹${amount}</strong>
                </div>
            `)
            .join('') || '<p class="loading-inline-muted">No data available</p>';

        const bookingsByTypeHtml = Object.entries(bookingsByType)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => `
                <div class="revenue-breakdown-row">
                    <span>${type}</span>
                    <strong>${count} booking${count !== 1 ? 's' : ''}</strong>
                </div>
            `)
            .join('') || '<p class="loading-inline-muted">No data available</p>';

        const revenueByTypeEl = document.getElementById('revenueByType');
        const bookingsByTypeEl = document.getElementById('bookingsByType');

        if (revenueByTypeEl) {
            revenueByTypeEl.innerHTML = revenueByTypeHtml;
        }

        if (bookingsByTypeEl) {
            bookingsByTypeEl.innerHTML = bookingsByTypeHtml;
        }
    };

    const updateRevenueTable = ({ bookings = [], formatDate, formatTime }) => {
        const tableEl = document.getElementById('revenueTable');
        if (!tableEl) {
            return;
        }

        if (!Array.isArray(bookings) || bookings.length === 0) {
            tableEl.innerHTML = '<p class="loading-inline-muted">No bookings found for the selected period</p>';
            return;
        }

        const tableHtml = `
            <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Time</th>
                        <th>Duration</th>
                        <th>Type</th>
                        <th>Band</th>
                        <th>Revenue</th>
                    </tr>
                </thead>
                <tbody>
                    ${bookings.map((booking) => `
                        <tr>
                            <td>${formatDate(booking.date)}</td>
                            <td>${booking.userName}<br><small>${booking.userEmail}</small></td>
                            <td>${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}</td>
                            <td>${booking.duration}h</td>
                            <td>
                                ${booking.rentals && booking.rentals.length > 0
                                    ? booking.rentals.map((r) => `${r.name} × ${r.quantity}`).join('<br>')
                                    : booking.rentalType
                                }
                            </td>
                            <td>${booking.bandName || 'N/A'}</td>
                            <td>
                                <strong>₹${booking.price}</strong>
                                ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                                    ? `<br><small>Subtotal: ₹${booking.subtotal}<br>Tax: ₹${booking.taxAmount}</small>`
                                    : ''}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>
        `;

        tableEl.innerHTML = tableHtml;
    };

    const loadRevenue = async ({ apiUrl, showSectionLoading, showAlert, formatDate, formatTime }) => {
        try {
            if (typeof showSectionLoading === 'function') {
                showSectionLoading('revenueTable', 'Loading revenue data...');
            }

            const filter = document.getElementById('revenueFilter')?.value || 'month';
            let url = `${apiUrl}/api/admin/revenue?filter=${filter}`;

            if (filter === 'range') {
                const startDate = document.getElementById('revenueStartDate')?.value;
                const endDate = document.getElementById('revenueEndDate')?.value;

                if (!startDate || !endDate) {
                    if (typeof showAlert === 'function') {
                        showAlert('revenueAlert', 'Please select both start and end dates for custom range', 'error');
                    }
                    return;
                }

                url += `&startDate=${startDate}&endDate=${endDate}`;
            }

            const token = localStorage.getItem('token');
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load revenue data');
            }

            const data = await res.json();
            const revenue = data.revenue || {};

            setText('revenueTotal', `₹${revenue.totalRevenue || 0}`);
            setText('revenueBookings', revenue.totalBookings || 0);
            setText('revenueAvg', `₹${revenue.avgBookingValue || 0}`);

            updateRevenueCharts(revenue);
            updateRevenueTable({ bookings: data.bookings || [], formatDate, formatTime });
        } catch (error) {
            console.error('Failed to load revenue:', error);
            if (typeof showAlert === 'function') {
                showAlert('revenueAlert', 'Failed to load revenue data', 'error');
            }
        }
    };

    const bindRevenueFilterChange = ({ onFilterChange }) => {
        if (state.filterHandlerBound) {
            return;
        }

        const revenueFilter = document.getElementById('revenueFilter');
        if (!revenueFilter) {
            return;
        }

        revenueFilter.addEventListener('change', (e) => {
            const customRangeInputs = document.getElementById('customRangeInputs');
            if (customRangeInputs) {
                customRangeInputs.style.display = e.target.value === 'range' ? 'block' : 'none';
            }

            if (e.target.value !== 'range' && typeof onFilterChange === 'function') {
                onFilterChange();
            }
        });

        state.filterHandlerBound = true;
    };

    window.AdminRevenue = window.AdminRevenue || {};
    window.AdminRevenue.loadRevenue = loadRevenue;
    window.AdminRevenue.bindRevenueFilterChange = bindRevenueFilterChange;
})();
