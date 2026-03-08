/**
 * Admin bookings module.
 * Handles bookings table rendering and approve/reject flows.
 */

(() => {
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatCurrency = (value) => {
        const numeric = Number(value || 0);
        return `₹${Number.isFinite(numeric) ? numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'}`;
    };

    const formatDateTime = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/A';

        return parsed.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatSimpleDate = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/A';

        return parsed.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const state = {
        bookingsById: new Map(),
        allBookings: [],
        formatDate: null,
        formatTime: null,
        searchTerm: '',
        sortBy: 'created_desc',
        pageSize: 5,
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false,
        searchDebounceTimer: null,
        loadDeps: null
    };

    const getRentalLineTotal = (booking, rental) => {
        const quantity = Math.max(1, Number(rental?.quantity) || 1);
        const unitPrice = Number(rental?.price || 0);
        const isPerday = String(rental?.rentalType || booking?.bookingMode || '').toLowerCase() === 'perday';
        const isBaseRental = /\(base\)/i.test(String(rental?.name || '')) || rental?.isRequired === true;
        const duration = Math.max(1, Number(booking?.duration) || 1);

        if (isPerday) {
            return unitPrice * quantity;
        }

        if (isBaseRental || unitPrice === 0 || /iem/i.test(String(rental?.name || ''))) {
            return unitPrice * quantity * duration;
        }

        return unitPrice * duration;
    };

    const buildRentalsMarkup = (booking) => {
        const rentals = Array.isArray(booking?.rentals) ? booking.rentals : [];
        if (rentals.length === 0) {
            return '<p class="booking-meta-empty">No rental items provided.</p>';
        }

        const lines = rentals.map((rental) => {
            const quantity = Math.max(1, Number(rental?.quantity) || 1);
            const name = escapeHtml(rental?.name || 'Unnamed item');
            const unitPrice = formatCurrency(rental?.price || 0);
            const lineTotal = formatCurrency(getRentalLineTotal(booking, rental));
            return `
                <li>
                    <span>${name} x ${quantity}</span>
                    <span>${unitPrice} each | ${lineTotal}</span>
                </li>
            `;
        }).join('');

        return `<ul class="booking-meta-list">${lines}</ul>`;
    };

    const buildRequirementsMarkup = (booking) => {
        const rentals = Array.isArray(booking?.rentals) ? booking.rentals : [];
        const equipmentMap = new Map();

        rentals.forEach((rental) => {
            const name = String(rental?.name || '').trim();
            if (!name || /\(base\)/i.test(name)) {
                return;
            }

            const key = name.toLowerCase();
            const quantity = Math.max(1, Number(rental?.quantity) || 1);
            const existing = equipmentMap.get(key);

            if (!existing) {
                equipmentMap.set(key, { name, quantity });
                return;
            }

            existing.quantity += quantity;
        });

        const requirementParts = [];

        if (equipmentMap.size > 0) {
            const equipmentItems = [...equipmentMap.values()]
                .map((item) => `${escapeHtml(item.name)} - ${item.quantity}`)
                .join(',<br>');

            requirementParts.push(`<p><strong>Equipment:</strong> ${equipmentItems}</p>`);
        }

        if (booking?.bandName) {
            requirementParts.push(`<p><strong>Band Name:</strong> ${escapeHtml(booking.bandName)}</p>`);
        }

        if (booking?.notes) {
            requirementParts.push(`<p><strong>Notes:</strong> ${escapeHtml(booking.notes)}</p>`);
        }

        if (requirementParts.length === 0) {
            return '<p class="booking-meta-empty">No additional requirements shared by user.</p>';
        }

        return `<div class="booking-requirements">${requirementParts.join('')}</div>`;
    };

    const buildBookingActionsMarkup = (booking, { context = 'table', includeView = false } = {}) => {
        const status = String(booking?.bookingStatus || '').toUpperCase();
        const serializedBooking = JSON.stringify(booking || {}).replace(/"/g, '&quot;');
        const stopOrClose = context === 'modal'
            ? "closeModal('bookingActionModal'); "
            : 'event.stopPropagation(); ';
        const actionClass = context === 'modal' ? 'booking-expand-actions' : 'booking-table-actions';

        return `
            <div class="${actionClass}">
                ${includeView
                    ? `<button onclick="event.stopPropagation(); openBookingDetailsModal('${booking._id}')" class="btn btn-primary btn-sm">View</button>`
                    : ''}
                ${status === 'PENDING'
                    ? `<button onclick="${stopOrClose}approveBooking('${booking._id}')" class="btn btn-success btn-sm">Approve</button>
                       <button onclick="${stopOrClose}rejectBooking('${booking._id}')" class="btn btn-danger btn-sm">Reject</button>`
                    : ''}
                ${status === 'CONFIRMED'
                    ? `<button onclick="${stopOrClose}sendEBill('${booking._id}')" class="btn btn-primary btn-sm" title="Send eBill to customer and/or custom recipients">Send eBill</button>
                       <button onclick="${stopOrClose}downloadPDF('${booking._id}')" class="btn btn-secondary btn-sm" title="Download PDF Bill">Download PDF</button>`
                    : ''}
                <button onclick="${stopOrClose}editBooking('${booking._id}', ${serializedBooking})" class="btn btn-warning btn-sm">Edit</button>
                <button onclick="${stopOrClose}deleteBooking('${booking._id}')" class="btn btn-danger btn-sm">Delete</button>
            </div>
        `;
    };

    const buildBookingDetailsMarkup = ({ booking, formatDate, formatTime, includeActions = true, context = 'modal' }) => {
        const isPerday = booking.bookingMode === 'perday';
        const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
        const userName = booking.userId?.name || booking.userName || 'N/A';
        const userEmail = booking.userId?.email || booking.userEmail || 'N/A';
        const userMobile = booking.userMobile || 'N/A';

        const dateText = isPerday && booking.perDayStartDate && booking.perDayEndDate
            ? `${formatDate(booking.perDayStartDate)} to ${formatDate(booking.perDayEndDate)}`
            : formatDate(booking.date);
        const timeText = isPerday
            ? `${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}`
            : `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`;
        const durationText = isPerday ? `${perDayDays} day(s)` : `${booking.duration} hour(s)`;
        const modeText = isPerday ? 'Per-day' : 'Hourly';

        return `
            <div class="booking-expand-body booking-modal-body">
                <div class="booking-expand-grid">
                    <section class="booking-expand-panel admin-theme-info-card admin-theme-info-card-accent">
                        <h4>Booking Details</h4>
                        <div class="booking-kv-grid">
                            <p><strong>Booking ID:</strong> ${escapeHtml(booking._id || 'N/A')}</p>
                            <p><strong>Mode:</strong> ${modeText}</p>
                            <p><strong>Date/Range:</strong> ${dateText}</p>
                            <p><strong>Time:</strong> ${timeText}</p>
                            <p><strong>Duration:</strong> ${durationText}</p>
                            <p><strong>Created:</strong> ${formatDateTime(booking.createdAt)}</p>
                            <p><strong>Updated:</strong> ${formatDateTime(booking.updatedAt)}</p>
                            <p><strong>Booking Status:</strong> ${escapeHtml(booking.bookingStatus || 'N/A')}</p>
                            <p><strong>Payment Status:</strong> ${escapeHtml(booking.paymentStatus || 'N/A')}</p>
                            <p><strong>Payment Ref:</strong> ${escapeHtml(booking.paymentReference || 'N/A')}</p>
                        </div>
                    </section>

                    <section class="booking-expand-panel admin-theme-info-card admin-theme-info-card-muted">
                        <h4>Customer Details</h4>
                        <div class="booking-kv-grid">
                            <p><strong>Name:</strong> ${escapeHtml(userName)}</p>
                            <p><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
                            <p><strong>Mobile:</strong> ${escapeHtml(userMobile)}</p>
                        </div>
                    </section>

                    <section class="booking-expand-panel admin-theme-info-card booking-modal-theme-pricing">
                        <h4>Rentals & Pricing</h4>
                        ${buildRentalsMarkup(booking)}
                        <div class="booking-kv-grid booking-kv-grid-price">
                            <p><strong>Subtotal:</strong> ${formatCurrency(booking.subtotal)}</p>
                            <p><strong>Tax:</strong> ${formatCurrency(booking.taxAmount)}</p>
                            <p><strong>Total:</strong> ${formatCurrency(booking.price)}</p>
                        </div>
                    </section>

                    <section class="booking-expand-panel admin-theme-info-card booking-modal-theme-requirements">
                        <h4>Requirements</h4>
                        ${buildRequirementsMarkup(booking)}
                    </section>
                </div>

                ${includeActions ? buildBookingActionsMarkup(booking, { context }) : ''}
            </div>
        `;
    };

    const openBookingDetailsModal = (bookingId) => {
        const booking = state.bookingsById.get(String(bookingId || ''));
        if (!booking) return;

        const modal = document.getElementById('bookingActionModal');
        const titleEl = document.getElementById('modalTitle');
        const detailsEl = document.getElementById('modalBookingDetails');
        const rejectReasonGroup = document.getElementById('rejectReasonGroup');
        const confirmButton = document.getElementById('confirmActionBtn');
        const secondaryButton = modal?.querySelector('.modal-actions-row .btn-secondary');

        if (!modal || !titleEl || !detailsEl) return;

        if (rejectReasonGroup) {
            rejectReasonGroup.classList.add('admin-hidden');
        }

        if (confirmButton) {
            confirmButton.style.display = 'none';
        }

        if (secondaryButton) {
            secondaryButton.textContent = 'Close';
        }

        titleEl.textContent = 'Booking Details';
        detailsEl.innerHTML = buildBookingDetailsMarkup({
            booking,
            formatDate: state.formatDate || formatSimpleDate,
            formatTime: state.formatTime || ((time) => time || 'N/A'),
            includeActions: true,
            context: 'modal'
        });

        modal.classList.add('show');
    };

    const buildPaginationMarkup = () => {
        const totalPages = Math.max(1, Number(state.totalPages) || 1);
        const currentPage = Math.max(1, Math.min(Number(state.currentPage) || 1, totalPages));

        return `
            <div class="bookings-pagination-controls">
                <button type="button" id="bookingsPageFirst" class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''}>First</button>
                <button type="button" id="bookingsPagePrev" class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
                <span class="bookings-page-meta">Page ${currentPage} of ${totalPages}</span>
                <button type="button" id="bookingsPageNext" class="btn btn-sm btn-secondary" ${!state.hasNextPage ? 'disabled' : ''}>Next</button>
                <button type="button" id="bookingsPageLast" class="btn btn-sm btn-secondary" ${!state.hasNextPage ? 'disabled' : ''}>Last</button>
            </div>
        `;
    };

    const buildTableControlsMarkup = (pageCount) => {
        const totalCount = Number(state.totalCount) || 0;
        const pageStart = totalCount === 0
            ? 0
            : ((Math.max(1, state.currentPage) - 1) * Math.max(1, state.pageSize)) + 1;
        const pageEnd = totalCount === 0 ? 0 : Math.min(totalCount, pageStart + Math.max(0, pageCount - 1));

        return `
            <div class="bookings-table-controls">
                <input
                    type="text"
                    id="bookingsSearchInput"
                    class="bookings-search-input"
                    placeholder="Search by user, booking ID, status, equipment"
                    value="${escapeHtml(state.searchTerm)}"
                >
                <select id="bookingsSortSelect" class="bookings-sort-select">
                    <option value="created_desc" ${state.sortBy === 'created_desc' ? 'selected' : ''}>Created: Latest First</option>
                    <option value="created_asc" ${state.sortBy === 'created_asc' ? 'selected' : ''}>Created: Oldest First</option>
                    <option value="date_desc" ${state.sortBy === 'date_desc' ? 'selected' : ''}>Booking Date: Newest First</option>
                    <option value="date_asc" ${state.sortBy === 'date_asc' ? 'selected' : ''}>Booking Date: Oldest First</option>
                    <option value="price_desc" ${state.sortBy === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
                    <option value="price_asc" ${state.sortBy === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
                    <option value="status_asc" ${state.sortBy === 'status_asc' ? 'selected' : ''}>Status: A to Z</option>
                </select>
                <select id="bookingsPageSize" class="bookings-limit-select">
                    <option value="5" ${state.pageSize === 5 ? 'selected' : ''}>Show 5</option>
                    <option value="10" ${state.pageSize === 10 ? 'selected' : ''}>Show 10</option>
                    <option value="25" ${state.pageSize === 25 ? 'selected' : ''}>Show 25</option>
                    <option value="50" ${state.pageSize === 50 ? 'selected' : ''}>Show 50</option>
                </select>
                <div class="bookings-table-meta">Showing ${pageStart}-${pageEnd} of ${totalCount}</div>
            </div>
        `;
    };

    const bindTableControls = () => {
        const searchInput = document.getElementById('bookingsSearchInput');
        const sortSelect = document.getElementById('bookingsSortSelect');
        const pageSizeSelect = document.getElementById('bookingsPageSize');
        const firstButton = document.getElementById('bookingsPageFirst');
        const prevButton = document.getElementById('bookingsPagePrev');
        const nextButton = document.getElementById('bookingsPageNext');
        const lastButton = document.getElementById('bookingsPageLast');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                state.searchTerm = searchInput.value || '';

                if (state.searchDebounceTimer) {
                    clearTimeout(state.searchDebounceTimer);
                }

                state.searchDebounceTimer = setTimeout(() => {
                    loadBookings({ page: 1, showLoader: false });
                }, 250);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                state.sortBy = sortSelect.value || 'created_desc';
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => {
                state.pageSize = Math.max(1, Number(pageSizeSelect.value) || 5);
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (firstButton) {
            firstButton.addEventListener('click', () => {
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                loadBookings({ page: Math.max(1, state.currentPage - 1), showLoader: false });
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (!state.hasNextPage) return;
                loadBookings({ page: state.currentPage + 1, showLoader: false });
            });
        }

        if (lastButton) {
            lastButton.addEventListener('click', () => {
                loadBookings({ page: Math.max(1, state.totalPages), showLoader: false });
            });
        }
    };

    const renderBookingsTableView = () => {
        const tableEl = document.getElementById('bookingsTable');
        if (!tableEl) {
            return;
        }

        const visible = Array.isArray(state.allBookings) ? state.allBookings : [];
        let html = buildTableControlsMarkup(visible.length);

        if ((Number(state.totalCount) || 0) === 0) {
            html += '<p class="text-center-muted-padded">No bookings found</p>';
            tableEl.innerHTML = html;
            bindTableControls();
            return;
        }

        if (visible.length === 0) {
            html += '<p class="text-center-muted-padded">No bookings match current search/filter.</p>';
            tableEl.innerHTML = html;
            bindTableControls();
            return;
        }

        html += '<div class="table-container"><table><thead><tr><th>#</th><th>User</th><th>Date</th><th>Time</th><th>Duration</th><th>Type</th><th>Price</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>';

        let serialNo = ((Math.max(1, state.currentPage) - 1) * Math.max(1, state.pageSize)) + 1;
        visible.forEach((booking) => {
            const isPerday = booking.bookingMode === 'perday';
            const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
            const dateText = isPerday && booking.perDayStartDate && booking.perDayEndDate
                ? `${formatSimpleDate(booking.perDayStartDate)}<br><small>to ${formatSimpleDate(booking.perDayEndDate)}</small>`
                : formatSimpleDate(booking.date);
            const timeText = isPerday
                ? `${state.formatTime(booking.startTime)} to ${state.formatTime(booking.endTime)}`
                : `${state.formatTime(booking.startTime)} - ${state.formatTime(booking.endTime)}`;
            const durationText = isPerday
                ? `${perDayDays} day(s)`
                : `${booking.duration} hour(s)`;

            const statusClass = String(booking.bookingStatus || '').toLowerCase();
            const userName = booking.userId?.name || booking.userName || 'N/A';
            const userEmail = booking.userId?.email || booking.userEmail || 'N/A';
            const createdDate = booking.createdAt ? formatDateTime(booking.createdAt) : 'N/A';
            const rentalSummary = booking.rentals && booking.rentals.length > 0
                ? booking.rentals.map((r) => `${escapeHtml(r.name)} x ${Math.max(1, Number(r.quantity) || 1)}`).join('<br>')
                : escapeHtml(booking.rentalType || 'N/A');

            html += `
                <tr class="booking-row-clickable" onclick="openBookingDetailsModal('${booking._id}')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openBookingDetailsModal('${booking._id}'); }" tabindex="0">
                    <td class="table-serial-cell">${serialNo++}</td>
                    <td>${escapeHtml(userName)}<br><small>${escapeHtml(userEmail)}</small></td>
                    <td>${dateText}</td>
                    <td>${timeText}</td>
                    <td>${durationText}</td>
                    <td>${rentalSummary}</td>
                    <td>
                        ${formatCurrency(booking.price)}
                        ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                            ? `<br><small>Subtotal: ${formatCurrency(booking.subtotal)}<br>Tax: ${formatCurrency(booking.taxAmount)}</small>`
                            : ''}
                    </td>
                    <td><span class="status-badge status-${statusClass}">${escapeHtml(booking.bookingStatus)}</span></td>
                    <td><small>${escapeHtml(createdDate)}</small></td>
                    <td>${buildBookingActionsMarkup(booking, { context: 'table', includeView: true })}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        html += buildPaginationMarkup();
        tableEl.innerHTML = html;
        bindTableControls();
    };

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

        state.bookingsById.clear();
        state.allBookings = Array.isArray(bookings) ? bookings : [];
        state.formatDate = formatDate;
        state.formatTime = formatTime;

        state.allBookings.forEach((booking) => {
            state.bookingsById.set(String(booking._id), booking);
        });

        if (state.searchTerm === undefined || state.searchTerm === null) {
            state.searchTerm = '';
        }
        if (!state.sortBy) {
            state.sortBy = 'created_desc';
        }
        if (!state.pageSize || state.pageSize < 1) {
            state.pageSize = 5;
        }

        renderBookingsTableView();
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

    const loadBookings = async (depsOrOptions = {}, maybeOptions = {}) => {
        try {
            let deps = state.loadDeps;
            let options = depsOrOptions || {};

            if (depsOrOptions && typeof depsOrOptions === 'object' && Object.prototype.hasOwnProperty.call(depsOrOptions, 'apiUrl')) {
                deps = depsOrOptions;
                state.loadDeps = depsOrOptions;
                options = maybeOptions || {};
            }

            if (!deps || !deps.apiUrl) {
                throw new Error('Missing bookings loader dependencies');
            }

            const {
                apiUrl,
                showSectionLoading,
                formatDate,
                formatTime
            } = deps;

            const requestedPage = Math.max(1, Number(options.page) || state.currentPage || 1);

            if (options.showLoader !== false) {
                showSectionLoading('bookingsTable', 'Loading bookings...');
            }

            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            params.set('page', String(requestedPage));
            params.set('limit', String(Math.max(1, Number(state.pageSize) || 5)));
            params.set('sortBy', String(state.sortBy || 'created_desc'));

            const normalizedSearch = String(state.searchTerm || '').trim();
            if (normalizedSearch) {
                params.set('q', normalizedSearch);
            }

            const res = await fetch(`${apiUrl}/api/admin/bookings?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load bookings');
            }

            const data = await res.json();
            const pagination = data?.pagination || {};

            state.currentPage = Math.max(1, Number(pagination.page) || requestedPage);
            state.totalPages = Math.max(0, Number(pagination.totalPages) || 0);
            state.totalCount = Math.max(0, Number(pagination.totalCount ?? data.count) || 0);
            state.hasNextPage = Boolean(pagination.hasNextPage);
            state.hasPrevPage = Boolean(pagination.hasPrevPage);

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
    window.AdminBookings.openBookingDetailsModal = openBookingDetailsModal;
    window.openBookingDetailsModal = openBookingDetailsModal;
})();
