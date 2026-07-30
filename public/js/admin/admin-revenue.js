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

    const getCollectedAmount = (booking) => {
        if (Number.isFinite(Number(booking?.collectedAmount))) {
            return toNumber(booking.collectedAmount);
        }

        const total = toNumber(booking?.price);
        const status = String(booking?.paymentStatus || '').toUpperCase();
        const amountPaid = toNumber(booking?.amountPaid);

        if (status === 'PAID') return total;
        if (status === 'PARTIAL') return Math.min(total, amountPaid);
        return 0;
    };

    const formatCurrency = (value) => {
        const amount = Math.max(0, toNumber(value));
        return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    };

    const getMonthBucket = (dateValue) => {
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const year = date.getFullYear();
        const monthIndex = date.getMonth();
        const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('en-IN', {
            month: 'short',
            year: '2-digit'
        });

        return {
            key,
            label,
            order: year * 12 + monthIndex
        };
    };

    const buildMonthlyTrendFromBookings = (bookings = []) => {
        const monthMap = new Map();
        (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
            const bucket = getMonthBucket(booking?.date);
            if (!bucket) {
                return;
            }

            const current = monthMap.get(bucket.key) || {
                ...bucket,
                amount: 0,
                bookings: 0
            };

            current.amount += getCollectedAmount(booking);
            current.bookings += 1;
            monthMap.set(bucket.key, current);
        });

        return [...monthMap.values()].sort((a, b) => a.order - b.order);
    };

    const normalizeMonthlyTrend = (monthlyTrend = []) => {
        return (Array.isArray(monthlyTrend) ? monthlyTrend : [])
            .map((point) => {
                const key = String(point?.key || point?.monthKey || '').trim();
                if (!key) return null;

                const [yearToken, monthToken] = key.split('-');
                const year = Number(yearToken);
                const month = Number(monthToken);
                const order = Number.isFinite(year) && Number.isFinite(month)
                    ? (year * 12) + (month - 1)
                    : 0;

                return {
                    key,
                    label: String(point?.label || point?.monthLabel || key),
                    amount: Math.max(0, toNumber(point?.amount ?? point?.collectedRevenue)),
                    bookings: Math.max(0, Number(point?.bookings ?? point?.bookingCount) || 0),
                    order
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.order - b.order);
    };

    const bindRevenueTrendPointerDrag = (container) => {
        if (!container) {
            return;
        }

        let isDragging = false;
        let startX = 0;
        let startScrollLeft = 0;
        let pointerId = null;

        const beginDrag = (event) => {
            if (event.target.closest('.revenue-trend-point-hit')) {
                return;
            }

            isDragging = true;
            pointerId = event.pointerId;
            startX = event.clientX;
            startScrollLeft = container.scrollLeft;
            container.setPointerCapture?.(pointerId);
            container.classList.add('is-dragging');
        };

        const moveDrag = (event) => {
            if (!isDragging || event.pointerId !== pointerId) {
                return;
            }

            const deltaX = event.clientX - startX;
            container.scrollLeft = startScrollLeft - deltaX;
            event.preventDefault();
        };

        const endDrag = (event) => {
            if (!isDragging || event.pointerId !== pointerId) {
                return;
            }

            isDragging = false;
            pointerId = null;
            container.releasePointerCapture?.(event.pointerId);
            container.classList.remove('is-dragging');
        };

        container.addEventListener('pointerdown', beginDrag);
        container.addEventListener('pointermove', moveDrag);
        container.addEventListener('pointerup', endDrag);
        container.addEventListener('pointercancel', endDrag);
        container.addEventListener('pointerleave', (event) => {
            if (isDragging && event.pointerId === pointerId) {
                endDrag(event);
            }
        });
    };

    const renderMonthlyRevenueTrend = ({ monthlyTrend = [], bookings = [], trendSource = '' } = {}) => {
        const chartHost = document.getElementById('revenueMonthlyChart');
        if (!chartHost) {
            return;
        }

        const normalizedTrend = normalizeMonthlyTrend(monthlyTrend);
        const series = normalizedTrend.length > 0
            ? normalizedTrend
            : buildMonthlyTrendFromBookings(bookings);

        if (series.length === 0) {
            chartHost.innerHTML = '<p class="loading-inline-muted">No paid bookings available for monthly trend.</p>';
            return;
        }

        const minimumPointSpacing = 92;
        const width = Math.max(1000, 56 + 18 + (Math.max(1, series.length - 1) * minimumPointSpacing));
        const height = 300;
        const leftPad = 56;
        const rightPad = 18;
        const topPad = 20;
        const bottomPad = 54;
        const chartWidth = width - leftPad - rightPad;
        const chartHeight = height - topPad - bottomPad;
        const maxValue = Math.max(...series.map((point) => point.amount), 1);
        const yTickCount = 4;

        const xStep = series.length > 1 ? chartWidth / (series.length - 1) : 0;
        const points = series.map((point, index) => {
            const x = leftPad + (index * xStep);
            const yRatio = point.amount / maxValue;
            const y = topPad + chartHeight - (yRatio * chartHeight);
            return { ...point, x, y };
        });

        const polylinePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
        const gridLines = Array.from({ length: yTickCount + 1 }, (_, idx) => {
            const ratio = idx / yTickCount;
            const y = topPad + (chartHeight * ratio);
            const value = maxValue * (1 - ratio);
            return `
                <g>
                    <line x1="${leftPad}" y1="${y.toFixed(2)}" x2="${(width - rightPad).toFixed(2)}" y2="${y.toFixed(2)}" class="revenue-trend-grid-line"></line>
                    <text x="${(leftPad - 8).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end" class="revenue-trend-axis-label">${formatCurrency(value)}</text>
                </g>
            `;
        }).join('');

        const pointMarkers = points.map((point, index) => {
            const pointLabel = `${point.label}: ${formatCurrency(point.amount)} (${point.bookings} booking${point.bookings !== 1 ? 's' : ''})`;
            return `
                <g class="revenue-trend-point-hit" data-point-index="${index}" tabindex="0" role="button" aria-label="${pointLabel}">
                    <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.5" class="revenue-trend-point"></circle>
                    <text x="${point.x.toFixed(2)}" y="${(height - 26).toFixed(2)}" text-anchor="middle" class="revenue-trend-axis-label">${point.label}</text>
                </g>
            `;
        }).join('');

        const peakMonth = [...series].sort((a, b) => b.amount - a.amount)[0];
        const sourceLabel = String(trendSource || '').toUpperCase() === 'LIVE_BOOKINGS'
            ? 'Live booking aggregate'
            : String(trendSource || '').toUpperCase() === 'SYNTHETIC_SPREAD'
                ? 'Synthetic spread snapshot'
                : String(trendSource || '').toUpperCase() === 'BOOKING_ROLLUP'
                    ? 'Monthly rollup snapshot'
                    : normalizedTrend.length > 0
                        ? 'Snapshot'
                        : 'Live booking aggregate';

        chartHost.innerHTML = `
            <div class="revenue-trend-meta">
                <span>Months plotted: <strong>${series.length}</strong></span>
                <span>Peak month: <strong>${peakMonth.label}</strong> (${formatCurrency(peakMonth.amount)})</span>
                <span>Source: <strong>${sourceLabel}</strong></span>
            </div>
            <div class="revenue-trend-scroll" aria-label="Drag horizontally to explore earlier months">
                <svg viewBox="0 0 ${width} ${height}" class="revenue-trend-svg" style="width:${width}px" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
                    ${gridLines}
                    <polyline points="${polylinePoints}" fill="none" class="revenue-trend-line"></polyline>
                    ${pointMarkers}
                </svg>
            </div>
            <p class="revenue-trend-click-hint">Click or tap a point to view month details.</p>
            <div class="revenue-trend-point-details" data-revenue-trend-details aria-live="polite"></div>
        `;

        const detailHost = chartHost.querySelector('[data-revenue-trend-details]');
        const trendScrollHost = chartHost.querySelector('.revenue-trend-scroll');
        const pointTargets = Array.from(chartHost.querySelectorAll('.revenue-trend-point-hit'));
        bindRevenueTrendPointerDrag(trendScrollHost);

        const setSelectedPoint = (index) => {
            const pointData = points[index];
            if (!pointData || !detailHost) {
                return;
            }

            pointTargets.forEach((target, targetIndex) => {
                if (targetIndex === index) {
                    target.classList.add('is-active');
                } else {
                    target.classList.remove('is-active');
                }
            });

            detailHost.innerHTML = `
                <span class="revenue-trend-point-month">${pointData.label}</span>
                <span class="revenue-trend-point-amount">${formatCurrency(pointData.amount)}</span>
                <span class="revenue-trend-point-bookings">${pointData.bookings} booking${pointData.bookings !== 1 ? 's' : ''}</span>
            `;
        };

        pointTargets.forEach((pointTarget) => {
            const pointIndex = Number(pointTarget.dataset.pointIndex);
            if (!Number.isFinite(pointIndex)) {
                return;
            }

            pointTarget.addEventListener('click', () => {
                setSelectedPoint(pointIndex);
            });

            pointTarget.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedPoint(pointIndex);
                }
            });
        });

        if (trendScrollHost) {
            // double-rAF: first frame schedules layout; second fires after paint/measure
            requestAnimationFrame(() => requestAnimationFrame(() => {
                trendScrollHost.scrollLeft = Math.max(0, trendScrollHost.scrollWidth - trendScrollHost.clientWidth);
            }));
        }

        setSelectedPoint(points.length - 1);
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
            'Collected Revenue',
            'Outstanding Amount',
            'Payment Status',
            'Amount Received'
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
                getCollectedAmount(booking).toFixed(2),
                Math.max(0, toNumber(booking.price) - getCollectedAmount(booking)).toFixed(2),
                String(booking.paymentStatus || 'PENDING').toUpperCase(),
                toNumber(booking.amountPaid).toFixed(2)
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
                                <strong>₹${getCollectedAmount(booking)} collected</strong>
                                <br><small>Due: ₹${Math.max(0, toNumber(booking.price) - getCollectedAmount(booking))}</small>
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
            const filter = document.getElementById('revenueFilter')?.value || 'month';
            let url = `${apiUrl}/api/admin/revenue?filter=${encodeURIComponent(filter)}&trendScope=filtered&trendSource=LIVE_BOOKINGS`;
            const trendUrl = `${apiUrl}/api/admin/revenue?filter=all&trendScope=all&trendSource=LIVE_BOOKINGS`;

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
            const [res, trendRes] = await Promise.all([
                fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(trendUrl, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            if (!res.ok) {
                throw new Error('Failed to load revenue data');
            }

            const data = await res.json();
            const revenue = data.revenue || {};
            const trendData = trendRes.ok ? await trendRes.json() : null;
            const trendRevenue = trendData?.revenue || {};

            state.selectedBookingIds.clear();

            setText('revenueTotal', `₹${revenue.totalRevenue || 0}`);
            setText('revenueBookings', revenue.totalBookings || 0);
            setText('revenueAvg', `₹${revenue.avgBookingValue || 0}`);

            updateRevenueCharts(revenue);
            renderMonthlyRevenueTrend({
                monthlyTrend: trendRevenue.monthlyTrend || revenue.monthlyTrend || [],
                trendSource: trendRevenue.monthlyTrendSource || revenue.monthlyTrendSource || '',
                bookings: trendData?.bookings || data.bookings || []
            });
            updateRevenueTable({ bookings: data.bookings || [], formatDate, formatTime });
        } catch (error) {
            console.error('Failed to load revenue:', error);
            const tableEl = document.getElementById('revenueTable');
            if (tableEl) {
                tableEl.innerHTML = '<p class="loading-inline-muted">Failed to load revenue data. Please retry.</p>';
            }
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
