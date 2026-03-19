/**
 * Admin revenue module.
 * Handles revenue fetching, summary rendering, and filter behavior.
 */

(() => {
    const state = {
        filterHandlerBound: false,
        selectedBookingIds: new Set(),
        currentBookings: []
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    };

    const toNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const escapeCsvCell = (value) => {
        const stringValue = String(value ?? '');
        if (/[",\n]/.test(stringValue)) {
            return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
    };

    const getBookingAdjustment = (booking) => {
        const fallbackType = toNumber(booking?.priceAdjustmentValue) < 0
            ? 'discount'
            : toNumber(booking?.priceAdjustmentValue) > 0
                ? 'surcharge'
                : 'none';

        const adjustmentType = ['none', 'discount', 'surcharge'].includes(String(booking?.priceAdjustmentType || '').toLowerCase())
            ? String(booking.priceAdjustmentType).toLowerCase()
            : fallbackType;

        const absoluteAmount = Number.isFinite(Number(booking?.priceAdjustmentAmount))
            ? toNumber(booking.priceAdjustmentAmount)
            : Math.abs(toNumber(booking?.priceAdjustmentValue));

        const signedValue = Number.isFinite(Number(booking?.priceAdjustmentValue))
            ? toNumber(booking.priceAdjustmentValue)
            : (adjustmentType === 'discount' ? -absoluteAmount : adjustmentType === 'surcharge' ? absoluteAmount : 0);

        return {
            type: adjustmentType,
            signedValue,
            note: String(booking?.priceAdjustmentNote || '').trim()
        };
    };

    const getRentalSummary = (booking) => {
        if (Array.isArray(booking?.rentals) && booking.rentals.length > 0) {
            return booking.rentals
                .map((rental) => `${rental?.name || 'Item'} x ${Math.max(1, Number(rental?.quantity) || 1)}`)
                .join('; ');
        }

        return String(booking?.rentalType || 'N/A');
    };

    const refreshRevenueSelectionUi = () => {
        const selectedCountEl = document.getElementById('revenueSelectedCount');
        const exportButton = document.getElementById('exportRevenueCsvBtn');
        const selectAllCheckbox = document.getElementById('revenueSelectAll');
        const rowCheckboxes = Array.from(document.querySelectorAll('.revenue-row-select'));
        const selectedCount = state.selectedBookingIds.size;

        if (selectedCountEl) {
            selectedCountEl.textContent = `${selectedCount} selected`;
        }

        if (exportButton) {
            exportButton.disabled = selectedCount === 0;
        }

        if (selectAllCheckbox && rowCheckboxes.length > 0) {
            const checkedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;
            selectAllCheckbox.checked = checkedCount > 0 && checkedCount === rowCheckboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
        }
    };

    const exportSelectedRevenueCsv = () => {
        const selectedRows = state.currentBookings.filter((booking) => state.selectedBookingIds.has(String(booking._id)));
        if (selectedRows.length === 0) {
            return;
        }

        const headers = [
            'Booking ID',
            'Date',
            'Customer Name',
            'Customer Email',
            'Start Time',
            'End Time',
            'Duration (hours)',
            'Rental Summary',
            'Band Name',
            'Subtotal',
            'Tax',
            'Adjustment Type',
            'Adjustment Value',
            'Adjustment Note',
            'Final Revenue'
        ];

        const rows = selectedRows.map((booking) => {
            const adjustment = getBookingAdjustment(booking);
            return [
                booking._id,
                booking.date ? new Date(booking.date).toISOString().split('T')[0] : '',
                booking.userName || '',
                booking.userEmail || '',
                booking.startTime || '',
                booking.endTime || '',
                booking.duration || '',
                getRentalSummary(booking),
                booking.bandName || '',
                toNumber(booking.subtotal).toFixed(2),
                toNumber(booking.taxAmount).toFixed(2),
                adjustment.type,
                adjustment.signedValue.toFixed(2),
                adjustment.note,
                toNumber(booking.price).toFixed(2)
            ];
        });

        const csvContent = [headers, ...rows]
            .map((row) => row.map(escapeCsvCell).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
        const link = document.createElement('a');
        link.href = url;
        link.download = `jamroom-revenue-selected-${timestamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const bindRevenueSelectionHandlers = () => {
        const selectAllCheckbox = document.getElementById('revenueSelectAll');
        const exportButton = document.getElementById('exportRevenueCsvBtn');
        const rowCheckboxes = Array.from(document.querySelectorAll('.revenue-row-select'));

        rowCheckboxes.forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                const bookingId = String(checkbox.dataset.bookingId || '');
                if (!bookingId) {
                    return;
                }

                if (checkbox.checked) {
                    state.selectedBookingIds.add(bookingId);
                } else {
                    state.selectedBookingIds.delete(bookingId);
                }

                refreshRevenueSelectionUi();
            });
        });

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                rowCheckboxes.forEach((checkbox) => {
                    checkbox.checked = selectAllCheckbox.checked;
                    const bookingId = String(checkbox.dataset.bookingId || '');
                    if (!bookingId) return;

                    if (selectAllCheckbox.checked) {
                        state.selectedBookingIds.add(bookingId);
                    } else {
                        state.selectedBookingIds.delete(bookingId);
                    }
                });

                refreshRevenueSelectionUi();
            });
        }

        if (exportButton) {
            exportButton.addEventListener('click', exportSelectedRevenueCsv);
        }

        refreshRevenueSelectionUi();
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

        state.currentBookings = Array.isArray(bookings) ? bookings : [];

        if (!Array.isArray(bookings) || bookings.length === 0) {
            tableEl.innerHTML = '<p class="loading-inline-muted">No bookings found for the selected period</p>';
            return;
        }

        const tableHtml = `
            <div class="revenue-table-controls">
                <label class="revenue-select-all-control">
                    <input type="checkbox" id="revenueSelectAll">
                    Select all
                </label>
                <span id="revenueSelectedCount" class="revenue-selected-count">0 selected</span>
                <button type="button" id="exportRevenueCsvBtn" class="btn btn-secondary btn-sm" disabled>Export CSV (Selected)</button>
            </div>
            <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Select</th>
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
                            <td>
                                <input
                                    type="checkbox"
                                    class="revenue-row-select"
                                    data-booking-id="${booking._id}"
                                    ${state.selectedBookingIds.has(String(booking._id)) ? 'checked' : ''}
                                >
                            </td>
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
        bindRevenueSelectionHandlers();
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

            state.selectedBookingIds.clear();

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
