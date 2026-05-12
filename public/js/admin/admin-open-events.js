(function adminOpenEventsBootstrap() {
    const API_URL = window.location.origin;

    const formatDateTimeLabel = (event) => `${event.date} | ${event.startTime} - ${event.endTime}`;

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const getToken = () => localStorage.getItem('token') || '';

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
    });

    const showAlert = (message, type = 'success') => {
        if (typeof window.showAlert === 'function') {
            window.showAlert('openEventsAlert', message, type);
            return;
        }

        const alertEl = document.getElementById('openEventsAlert');
        if (!alertEl) return;
        alertEl.textContent = message;
        alertEl.className = `alert alert-${type}`;
        alertEl.style.display = 'block';
        window.setTimeout(() => {
            alertEl.style.display = 'none';
        }, 5000);
    };

    const setLoading = (isLoading) => {
        const loadingEl = document.getElementById('openEventsLoading');
        if (!loadingEl) return;
        loadingEl.classList.toggle('admin-hidden', !isLoading);
        loadingEl.style.display = isLoading ? 'flex' : 'none';
    };

    const toggleSubmit = (isSubmitting) => {
        const button = document.getElementById('openEventCreateSubmit');
        if (!button) return;
        button.disabled = isSubmitting;
        button.textContent = isSubmitting ? 'Creating...' : 'Create Open Event';
    };

    const request = async (path, options = {}) => {
        const response = await fetch(`${API_URL}${path}`, {
            method: options.method || 'GET',
            headers: { ...getHeaders(), ...(options.headers || {}) },
            body: options.body ? JSON.stringify(options.body) : undefined
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.message || 'Request failed');
        }

        return payload;
    };

    const renderEvents = (events) => {
        const container = document.getElementById('openEventsList');
        if (!container) return;

        if (!Array.isArray(events) || events.length === 0) {
            container.innerHTML = '<div class="loading-inline-muted">No open events created yet.</div>';
            return;
        }

        container.innerHTML = events.map((event) => {
            const statusActions = event.status === 'published'
                ? `<button type="button" class="btn btn-danger btn-sm admin-open-event-status-btn" data-event-id="${event.id}" data-status="cancelled">Cancel Event</button>`
                : `<button type="button" class="btn btn-primary btn-sm admin-open-event-status-btn" data-event-id="${event.id}" data-status="published">Publish</button>`;

            return `
                <article class="booking-expand-panel admin-theme-info-card" data-event-id="${event.id}">
                    <h4>${escapeHtml(event.title)}</h4>
                    <p>${escapeHtml(formatDateTimeLabel(event))}</p>
                    <p>${escapeHtml(event.description || 'No description provided.')}</p>
                    <p>Status: <strong>${escapeHtml(event.status)}</strong> | Slots: ${event.slotCount} | Booked: ${event.bookingCount || 0}</p>
                    <div class="booking-table-actions">
                        <button type="button" class="btn btn-secondary btn-sm admin-open-event-details-btn" data-event-id="${event.id}" data-event-title="${escapeHtml(event.title)}">View Slot Bookings</button>
                        ${statusActions}
                    </div>
                </article>
            `;
        }).join('');
    };

    const renderEventDetailsModal = (eventSummary, bookings) => {
        const titleEl = document.getElementById('openEventBookingsModalTitle');
        const bodyEl = document.getElementById('openEventBookingsModalBody');
        const modalEl = document.getElementById('openEventBookingsModal');
        if (!bodyEl || !modalEl) return;

        const detailsRows = Array.isArray(bookings) ? bookings : [];

        if (titleEl) {
            titleEl.textContent = eventSummary?.title
                ? `${eventSummary.title} - Slot Bookings`
                : 'Open Event Slot Bookings';
        }

        bodyEl.innerHTML = `
            <p class="open-event-bookings-summary">${escapeHtml(formatDateTimeLabel(eventSummary || {}))} | Total bookings: ${detailsRows.length}</p>
            <div class="open-event-bookings-list">
                ${detailsRows.length === 0
                    ? '<div class="open-event-booking-empty">No slot bookings yet for this event.</div>'
                    : detailsRows.map((booking) => `
                        <article class="open-event-booking-card">
                            <div class="open-event-booking-slot">
                                <span class="open-event-booking-slot-badge">Slot ${Number(booking.slotIndex) + 1}</span>
                                <span class="open-event-booking-time">${escapeHtml(booking.slotStartTime || '--:--')} - ${escapeHtml(booking.slotEndTime || '--:--')}</span>
                            </div>
                            <p><strong>Full Name:</strong> ${escapeHtml(booking.userFullName || booking.userName || booking.userFirstName || 'User')}</p>
                            <p><strong>Email:</strong> ${escapeHtml(booking.userEmail || 'Not available')}</p>
                            ${booking.userPhone ? `<p><strong>Phone:</strong> ${escapeHtml(booking.userPhone)}</p>` : ''}
                            <p><strong>Booked At:</strong> ${booking.createdAt ? new Date(booking.createdAt).toLocaleString('en-IN') : 'N/A'}</p>
                        </article>
                    `).join('')
                }
            </div>
        `;

        modalEl.classList.add('show');
    };

    const collectFormData = () => ({
        title: document.getElementById('openEventTitle')?.value.trim() || '',
        description: document.getElementById('openEventDescription')?.value.trim() || '',
        date: document.getElementById('openEventDate')?.value.trim() || '',
        startTime: document.getElementById('openEventStartTime')?.value.trim() || '',
        endTime: document.getElementById('openEventEndTime')?.value.trim() || '',
        status: document.getElementById('openEventStatus')?.value || 'draft'
    });

    const resetForm = () => {
        const form = document.getElementById('openEventCreateForm');
        if (form) form.reset();
    };

    const initPickers = () => {
        if (typeof window.flatpickr !== 'function') return;

        window.flatpickr('#openEventDate', {
            dateFormat: 'Y-m-d',
            minDate: 'today'
        });

        const timeOptions = {
            enableTime: true,
            noCalendar: true,
            dateFormat: 'H:i',
            time_24hr: true,
            minuteIncrement: 10
        };

        window.flatpickr('#openEventStartTime', timeOptions);
        window.flatpickr('#openEventEndTime', timeOptions);
    };

    const loadOpenEvents = async () => {
        try {
            setLoading(true);
            const eventResponse = await request('/api/admin/open-events');
            const events = Array.isArray(eventResponse?.events) ? eventResponse.events : [];
            renderEvents(events);
        } catch (error) {
            console.error('Failed to load open events:', error);
            showAlert(error.message || 'Failed to load open events', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadOpenEventDetails = async (eventId) => {
        try {
            const response = await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/bookings`);
            renderEventDetailsModal(response?.event || {}, response?.bookings || []);
        } catch (error) {
            console.error('Failed to load open event booking details:', error);
            showAlert(error.message || 'Failed to load open event details', 'error');
        }
    };

    const createOpenEvent = async (event) => {
        event.preventDefault();
        const payload = collectFormData();

        if (!payload.title || !payload.date || !payload.startTime || !payload.endTime) {
            showAlert('Please fill in title, date, start time, and end time.', 'error');
            return;
        }

        try {
            toggleSubmit(true);
            await request('/api/admin/open-events', {
                method: 'POST',
                body: payload
            });
            resetForm();
            showAlert('Open event created successfully.');
            await loadOpenEvents();
        } catch (error) {
            console.error('Failed to create open event:', error);
            showAlert(error.message || 'Failed to create open event', 'error');
        } finally {
            toggleSubmit(false);
        }
    };

    const updateStatus = async (eventId, status) => {
        try {
            await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/status`, {
                method: 'PATCH',
                body: { status }
            });
            showAlert(`Open event marked as ${status}.`);
            await loadOpenEvents();
        } catch (error) {
            console.error('Failed to update open event status:', error);
            showAlert(error.message || 'Failed to update event status', 'error');
        }
    };

    const bindEvents = () => {
        const form = document.getElementById('openEventCreateForm');
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', createOpenEvent);
            form.dataset.bound = 'true';
        }

        if (!document.body.dataset.adminOpenEventsBound) {
            document.body.addEventListener('click', async (event) => {
                const statusButton = event.target.closest('.admin-open-event-status-btn');
                if (!statusButton) return;

                const { eventId, status } = statusButton.dataset;
                if (!eventId || !status) return;

                const confirmed = window.confirm(`Change this event status to ${status}?`);
                if (!confirmed) return;

                await updateStatus(eventId, status);
            });

            document.body.addEventListener('click', async (event) => {
                const detailsButton = event.target.closest('.admin-open-event-details-btn');
                if (!detailsButton) return;

                const { eventId } = detailsButton.dataset;
                if (!eventId) return;
                await loadOpenEventDetails(eventId);
            });
            document.body.dataset.adminOpenEventsBound = 'true';
        }
    };

    const switchOpenEventsTab = async (tabName, buttonEl) => {
        const root = document.getElementById('openEventsTab');
        if (!root) return;

        root.querySelectorAll('[data-open-events-tab]').forEach((btn) => {
            btn.classList.remove('active');
        });
        root.querySelectorAll('[data-open-events-pane]').forEach((pane) => {
            pane.classList.remove('active');
        });

        const activeButton = buttonEl || root.querySelector(`[data-open-events-tab="${tabName}"]`);
        const activePane = root.querySelector(`[data-open-events-pane="${tabName}"]`);
        if (activeButton) activeButton.classList.add('active');
        if (activePane) activePane.classList.add('active');

        if (tabName === 'existing') {
            await loadOpenEvents();
        }
    };

    const init = () => {
        initPickers();
        bindEvents();
    };

    window.AdminOpenEvents = {
        init,
        loadOpenEvents,
        switchOpenEventsTab
    };

    window.loadOpenEvents = loadOpenEvents;
    window.switchOpenEventsTab = switchOpenEventsTab;

    document.addEventListener('DOMContentLoaded', init);
})();
