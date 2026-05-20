(function adminOpenEventsBootstrap() {
    const API_URL = window.location.origin;
    let openEventsCache = [];
    let editingOpenEventId = '';
    let draftStatusPending = false;
    let openEventUsersCache = [];
    let currentViewingEventId = '';
    let eventListSearchTerm = '';
    let eventListStatusFilter = 'all';
    let eventListSort = 'date_desc';

    const formatDateTimeLabel = (event) => `${event.date} | ${event.startTime} - ${event.endTime}`;

    const getTodayYmd = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const hasBulletLines = (value) => String(value || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .some(Boolean);

    const renderBulletListMarkup = (value) => {
        const lines = String(value || '')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        if (lines.length === 0) {
            return '';
        }

        return `<ul class="admin-open-event-bullet-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
    };

    const renderEventCopySection = (title, value) => {
        if (!hasBulletLines(value)) {
            return '';
        }

        return `
            <div class="admin-open-event-copy-block">
                <p class="admin-open-event-copy-title">${escapeHtml(title)}</p>
                ${renderBulletListMarkup(value)}
            </div>
        `;
    };

    const getToken = () => localStorage.getItem('token') || '';

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
    });

    const showAlert = (message, type = 'success') => {
        // Global signature: showAlert(message, type, title)
        if (typeof window.showAlert === 'function') {
            window.showAlert(message, type, 'Open Events');
            return;
        }

        // Fallback alert display
        const alertEl = document.getElementById('openEventsAlert');
        if (!alertEl) return;
        alertEl.textContent = message;
        alertEl.className = `alert alert-${type}`;
        alertEl.style.display = 'block';
        alertEl.style.opacity = '1';
        alertEl.style.visibility = 'visible';
        
        if (type !== 'error') {
            window.setTimeout(() => {
                alertEl.style.display = 'none';
            }, 5000);
        }
    };

    const setLoading = (isLoading) => {
        const loadingEl = document.getElementById('openEventsLoading');
        if (!loadingEl) return;
        loadingEl.classList.toggle('admin-hidden', !isLoading);
        loadingEl.style.display = isLoading ? 'flex' : 'none';
    };

    const syncModalActions = () => {
        const titleEl = document.getElementById('openEventModalTitle');
        const submitButton = document.getElementById('openEventCreateSubmit');
        const draftButton = document.getElementById('openEventSaveDraftBtn');
        const moveToDraftButton = document.getElementById('openEventMoveToDraftBtn');
        const editingEvent = editingOpenEventId
            ? openEventsCache.find((eventItem) => String(eventItem.id) === String(editingOpenEventId))
            : null;
        const isEditing = Boolean(editingEvent);
        const canMoveToDraft = isEditing && String(editingEvent?.status || '').toLowerCase() !== 'draft';

        if (titleEl) {
            titleEl.textContent = isEditing ? 'Edit Open Event' : 'Create Open Event';
        }

        if (submitButton) {
            submitButton.textContent = isEditing ? 'Update Open Event' : 'Create Open Event';
        }

        if (draftButton) {
            draftButton.classList.toggle('admin-hidden', isEditing);
        }

        if (moveToDraftButton) {
            moveToDraftButton.classList.toggle('admin-hidden', !canMoveToDraft);
        }
    };

    const openOpenEventModal = () => {
        draftStatusPending = false;
        editingOpenEventId = '';
        resetForm();
        const modal = document.getElementById('openEventModal');
        if (modal) {
            modal.classList.add('show');
        }
        syncModalActions();
        document.body.style.overflow = 'hidden';
    };

    const closeOpenEventModal = () => {
        const modal = document.getElementById('openEventModal');
        if (modal) {
            modal.classList.remove('show');
        }
        document.body.style.overflow = '';
        resetForm();
        draftStatusPending = false;
        editingOpenEventId = '';
    };

    const submitOpenEventWithStatus = (status) => {
        if (editingOpenEventId) {
            return;
        }

        draftStatusPending = true;
        const form = document.getElementById('openEventCreateForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    };

    const toggleSubmit = (isSubmitting) => {
        const button = document.getElementById('openEventCreateSubmit');
        const draftButton = document.getElementById('openEventSaveDraftBtn');
        const moveToDraftButton = document.getElementById('openEventMoveToDraftBtn');
        if (!button) return;
        
        button.disabled = isSubmitting;
        if (draftButton) draftButton.disabled = isSubmitting;
        if (moveToDraftButton) moveToDraftButton.disabled = isSubmitting;
        
        if (editingOpenEventId) {
            button.textContent = isSubmitting ? 'Updating...' : 'Update Open Event';
        } else {
            button.textContent = isSubmitting ? 'Creating...' : 'Create Open Event';
        }
    };

    const buildTimeSlots = (startHour = 9, endHour = 23) => {
        const slots = [];
        for (let hour = startHour; hour <= endHour; hour += 1) {
            const hh = String(hour).padStart(2, '0');
            const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
            const period = hour >= 12 ? 'PM' : 'AM';
            slots.push({
                value: `${hh}:00`,
                label: `${displayHour}:00 ${period}`,
                hour
            });
        }
        return slots;
    };

    const openEventTimeSlots = buildTimeSlots();

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

    const formatEventTimestamp = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/A';
        return parsed.toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const buildStatusActionMarkup = (event) => (String(event?.status || '').toLowerCase() === 'published'
        ? `<button type="button" class="btn btn-danger btn-sm admin-open-event-status-btn" data-event-id="${event.id}" data-status="draft" title="Move this event back to draft">Move to Draft</button>`
        : `<button type="button" class="btn btn-primary btn-sm admin-open-event-status-btn" data-event-id="${event.id}" data-status="published" title="Publish this event">Publish</button>`);

    const isFuturePublishedEvent = (event) => {
        if (String(event?.status || '').toLowerCase() !== 'published') {
            return false;
        }

        return String(event?.date || '') >= getTodayYmd();
    };

    const getFuturePublishedEvents = (events) => (Array.isArray(events) ? events : [])
        .filter((event) => isFuturePublishedEvent(event))
        .sort((left, right) => formatDateTimeLabel(left).localeCompare(formatDateTimeLabel(right)));

    const getEventListEvents = (events) => {
        const normalizedSearch = String(eventListSearchTerm || '').trim().toLowerCase();
        const safeEvents = (Array.isArray(events) ? events : []).filter((event) => !isFuturePublishedEvent(event));
        const filtered = safeEvents.filter((event) => {
            const normalizedStatus = String(event?.status || '').toLowerCase();
            if (eventListStatusFilter !== 'all' && normalizedStatus !== eventListStatusFilter) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const haystack = [
                event?.title,
                event?.date,
                event?.status,
                event?.quickFacts,
                event?.description,
                event?.notes
            ].map((value) => String(value || '').toLowerCase()).join(' ');

            return haystack.includes(normalizedSearch);
        });

        const sorted = [...filtered];
        sorted.sort((left, right) => {
            switch (eventListSort) {
                case 'date_asc':
                    return formatDateTimeLabel(left).localeCompare(formatDateTimeLabel(right));
                case 'title_asc':
                    return String(left?.title || '').localeCompare(String(right?.title || ''));
                case 'status_asc':
                    return String(left?.status || '').localeCompare(String(right?.status || '')) || formatDateTimeLabel(right).localeCompare(formatDateTimeLabel(left));
                case 'updated_desc':
                    return new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime();
                case 'date_desc':
                default:
                    return formatDateTimeLabel(right).localeCompare(formatDateTimeLabel(left));
            }
        });

        return sorted;
    };

    const renderEventCopyPreviewItems = (event) => {
        const items = [];

        if (hasBulletLines(event?.quickFacts)) items.push('Quick facts available');
        if (hasBulletLines(event?.description)) items.push('Description added');
        if (hasBulletLines(event?.notes)) items.push('Notes added');
        if (items.length === 0) items.push('No extra notes');

        return `<ul class="admin-open-event-mini-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    };

    const renderCompactEventRow = (event) => {
        const statusClass = `status-${String(event?.status || 'draft').toLowerCase()}`;

        return `
            <article class="admin-open-event-row" data-event-id="${event.id}">
                <div class="admin-open-event-row-main">
                    <div class="admin-open-event-row-head">
                        <h4>${escapeHtml(event.title || 'Untitled Event')}</h4>
                        <span class="status-badge ${statusClass}">${escapeHtml(event.status || 'draft')}</span>
                    </div>
                    <p class="admin-open-event-row-meta">${escapeHtml(formatDateTimeLabel(event))}</p>
                    <p class="admin-open-event-row-submeta">Slots: ${Number(event.slotCount || 0)} | Booked: ${Number(event.bookingCount || 0)}</p>
                    ${renderEventCopyPreviewItems(event)}
                </div>
                <div class="admin-open-event-row-actions">
                    <button type="button" class="btn btn-secondary btn-sm admin-open-event-view-btn" data-event-id="${event.id}">Details</button>
                    <button type="button" class="btn btn-info btn-sm admin-open-event-details-btn" data-event-id="${event.id}" data-event-title="${escapeHtml(event.title)}" title="View slot bookings">Bookings</button>
                    <button type="button" class="btn btn-warning btn-sm admin-open-event-edit-btn" data-event-id="${event.id}" title="Edit this event">Edit</button>
                </div>
            </article>
        `;
    };

    const closeOpenEventInfoModal = () => {
        const modal = document.getElementById('openEventInfoModal');
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = '';
    };

    const renderEventInfoModal = (event) => {
        const titleEl = document.getElementById('openEventInfoModalTitle');
        const bodyEl = document.getElementById('openEventInfoModalBody');
        const modal = document.getElementById('openEventInfoModal');
        if (!bodyEl || !modal) return;

        if (titleEl) {
            titleEl.textContent = event?.title ? `${event.title} - Details` : 'Open Event Details';
        }

        bodyEl.innerHTML = `
            <div class="admin-open-event-info-sheet">
                <div class="admin-open-event-info-grid">
                    <div class="admin-open-event-info-item">
                        <span class="admin-open-event-info-label">Date & Time</span>
                        <span class="admin-open-event-info-value">${escapeHtml(formatDateTimeLabel(event || {}))}</span>
                    </div>
                    <div class="admin-open-event-info-item">
                        <span class="admin-open-event-info-label">Status</span>
                        <span class="admin-open-event-info-value">${escapeHtml(event?.status || 'draft')}</span>
                    </div>
                    <div class="admin-open-event-info-item">
                        <span class="admin-open-event-info-label">Slots</span>
                        <span class="admin-open-event-info-value">${Number(event?.slotCount || 0)}</span>
                    </div>
                    <div class="admin-open-event-info-item">
                        <span class="admin-open-event-info-label">Booked</span>
                        <span class="admin-open-event-info-value">${Number(event?.bookingCount || 0)}</span>
                    </div>
                    <div class="admin-open-event-info-item">
                        <span class="admin-open-event-info-label">Created</span>
                        <span class="admin-open-event-info-value">${escapeHtml(formatEventTimestamp(event?.createdAt))}</span>
                    </div>
                    <div class="admin-open-event-info-item">
                        <span class="admin-open-event-info-label">Updated</span>
                        <span class="admin-open-event-info-value">${escapeHtml(formatEventTimestamp(event?.updatedAt))}</span>
                    </div>
                </div>
                ${renderEventCopySection('Quick Facts', event?.quickFacts)}
                ${renderEventCopySection('Description', event?.description)}
                ${renderEventCopySection('Notes', event?.notes)}
                <div class="booking-table-actions admin-open-event-info-actions">
                    <button type="button" class="btn btn-warning btn-sm admin-open-event-edit-btn" data-event-id="${event.id}">Edit</button>
                    <button type="button" class="btn btn-secondary btn-sm admin-open-event-copy-btn" data-event-id="${event.id}">Copy</button>
                    <button type="button" class="btn btn-info btn-sm admin-open-event-details-btn" data-event-id="${event.id}" data-event-title="${escapeHtml(event.title)}">Bookings</button>
                    <button type="button" class="btn btn-success btn-sm admin-open-event-notify-btn" data-event-id="${event.id}">Notify</button>
                    <button type="button" class="btn btn-secondary btn-sm admin-open-event-test-email-btn" data-event-id="${event.id}">Test</button>
                    <button type="button" class="btn btn-danger btn-sm admin-open-event-delete-btn" data-event-id="${event.id}">Delete</button>
                    ${buildStatusActionMarkup(event)}
                </div>
            </div>
        `;

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    const renderEventListMarkup = (events, emptyMessage) => {
        if (!Array.isArray(events) || events.length === 0) {
            return `<div class="loading-inline-muted">${escapeHtml(emptyMessage)}</div>`;
        }

        return `<div class="admin-open-event-row-list">${events.map((event) => renderCompactEventRow(event)).join('')}</div>`;
    };

    const renderDraftTemplates = (events) => {
        const panelEl = document.getElementById('openEventDraftPanel');
        if (!panelEl) return;

        panelEl.innerHTML = renderEventListMarkup(
            getEventListEvents(events),
            'No events match the current search or filter.'
        );
    };

    const renderEvents = (events) => {
        const container = document.getElementById('openEventsList');
        if (!container) return;

        const safeEvents = Array.isArray(events) ? events : [];
        renderDraftTemplates(safeEvents);
        container.innerHTML = renderEventListMarkup(
            getFuturePublishedEvents(safeEvents),
            'No future published open events yet.'
        );
    };

    const renderEventDetailsModal = (eventSummary, slots, users) => {
        const titleEl = document.getElementById('openEventBookingsModalTitle');
        const bodyEl = document.getElementById('openEventBookingsModalBody');
        const modalEl = document.getElementById('openEventBookingsModal');
        if (!bodyEl || !modalEl) return;

        const allSlots = Array.isArray(slots) ? slots : [];
        const bookedCount = allSlots.filter((s) => s.booked).length;

        if (titleEl) {
            titleEl.textContent = eventSummary?.title
                ? `${eventSummary.title} - Slot Bookings`
                : 'Open Event Slot Bookings';
        }

        const usersSelectOptions = Array.isArray(users) && users.length > 0
            ? `<option value="">Select user...</option>${users.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join('')}`
            : '<option value="">No users available</option>';

        bodyEl.innerHTML = `
            <p class="open-event-bookings-summary">${escapeHtml(formatDateTimeLabel(eventSummary || {}))} | Booked: ${bookedCount} / ${allSlots.length}</p>
            <div class="open-event-bookings-list">
                ${allSlots.length === 0
                    ? '<div class="open-event-booking-empty">No slots configured for this event.</div>'
                    : allSlots.map((slot) => {
                        if (slot.booked) {
                            return `
                                <article class="open-event-booking-card open-event-slot-booked">
                                    <div class="open-event-booking-slot">
                                        <span class="open-event-booking-slot-badge">Slot ${Number(slot.slotIndex) + 1}</span>
                                        <span class="open-event-booking-time">${escapeHtml(slot.slotStartTime || '--:--')} - ${escapeHtml(slot.slotEndTime || '--:--')}</span>
                                    </div>
                                    <p><strong>Full Name:</strong> ${escapeHtml(slot.userFullName || slot.userName || slot.userFirstName || 'User')}</p>
                                    <p><strong>Email:</strong> ${escapeHtml(slot.userEmail || 'Not available')}</p>
                                    ${slot.userPhone ? `<p><strong>Phone:</strong> ${escapeHtml(slot.userPhone)}</p>` : ''}
                                    <p><strong>Booked At:</strong> ${slot.createdAt ? new Date(slot.createdAt).toLocaleString('en-IN') : 'N/A'}</p>
                                    <div class="booking-table-actions" style="margin-top:8px;">
                                        <button type="button" class="btn btn-danger btn-sm admin-open-event-free-slot-btn"
                                            data-event-id="${escapeHtml(currentViewingEventId)}"
                                            data-booking-id="${escapeHtml(String(slot.id || ''))}"
                                            title="Free this slot (cancel booking)">🗑️ Free Slot</button>
                                    </div>
                                </article>`;
                        }
                        return `
                            <article class="open-event-booking-card open-event-slot-free">
                                <div class="open-event-booking-slot">
                                    <span class="open-event-booking-slot-badge open-event-slot-badge-free">Slot ${Number(slot.slotIndex) + 1}</span>
                                    <span class="open-event-booking-time">${escapeHtml(slot.slotStartTime || '--:--')} - ${escapeHtml(slot.slotEndTime || '--:--')}</span>
                                    <span style="color:#16a34a;font-weight:600;margin-left:8px;">Free</span>
                                </div>
                                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;">
                                    <select id="open-event-slot-user-${slot.slotIndex}" class="form-control" style="flex:1;min-width:180px;max-width:320px;">
                                        ${usersSelectOptions}
                                    </select>
                                    <button type="button" id="open-event-slot-book-btn-${slot.slotIndex}" class="btn btn-primary btn-sm admin-open-event-book-slot-btn"
                                        data-event-id="${escapeHtml(currentViewingEventId)}"
                                        data-slot-index="${slot.slotIndex}"
                                        title="Book this slot for the selected user">Book Slot</button>
                                </div>
                            </article>`;
                    }).join('')
                }
            </div>
        `;

        modalEl.classList.add('show');
    };

    const showOpenEventDetailsLoading = (eventTitle = '') => {
        const titleEl = document.getElementById('openEventBookingsModalTitle');
        const bodyEl = document.getElementById('openEventBookingsModalBody');
        const modalEl = document.getElementById('openEventBookingsModal');
        if (!bodyEl || !modalEl) return;

        if (titleEl) {
            titleEl.textContent = eventTitle
                ? `${eventTitle} - Slot Bookings`
                : 'Open Event Slot Bookings';
        }

        bodyEl.innerHTML = '<div class="open-event-booking-empty">Loading slot bookings...</div>';
        modalEl.classList.add('show');
    };

    const collectFormData = () => ({
        title: document.getElementById('openEventTitle')?.value.trim() || '',
        quickFacts: document.getElementById('openEventQuickFacts')?.value.trim() || '',
        description: document.getElementById('openEventDescription')?.value.trim() || '',
        notes: document.getElementById('openEventNotes')?.value.trim() || '',
        date: document.getElementById('openEventDate')?.value.trim() || '',
        startTime: document.getElementById('openEventStartTime')?.value.trim() || '',
        endTime: document.getElementById('openEventEndTime')?.value.trim() || ''
    });

    const applyFormData = (eventData = {}) => {
        const titleInput = document.getElementById('openEventTitle');
        const quickFactsInput = document.getElementById('openEventQuickFacts');
        const descriptionInput = document.getElementById('openEventDescription');
        const notesInput = document.getElementById('openEventNotes');
        const dateInput = document.getElementById('openEventDate');
        const startSelect = document.getElementById('openEventStartTime');
        const endSelect = document.getElementById('openEventEndTime');

        if (titleInput) titleInput.value = eventData.title || '';
        if (quickFactsInput) quickFactsInput.value = eventData.quickFacts || '';
        if (descriptionInput) descriptionInput.value = eventData.description || '';
        if (notesInput) notesInput.value = eventData.notes || '';
        if (dateInput) dateInput.value = eventData.date || '';
        if (startSelect) startSelect.value = eventData.startTime || '';
        populateOpenEventEndOptions();
        if (endSelect) endSelect.value = eventData.endTime || '';
    };

    const clearEditState = () => {
        editingOpenEventId = '';
        draftStatusPending = false;
    };

    const resetForm = () => {
        const form = document.getElementById('openEventCreateForm');
        if (form) form.reset();
        clearEditState();
        syncOpenEventTimeSelects();
        syncModalActions();
    };

    const startEditingEvent = (eventId) => {
        const selectedEvent = openEventsCache.find((eventItem) => String(eventItem.id) === String(eventId));
        if (!selectedEvent) {
            showAlert('Open event not found for editing.', 'error');
            return;
        }

        editingOpenEventId = String(selectedEvent.id);
        applyFormData(selectedEvent);
        
        const modal = document.getElementById('openEventModal');
        if (modal) {
            modal.classList.add('show');
        }
        syncModalActions();
        document.body.style.overflow = 'hidden';
    };

    const moveEditingOpenEventToDraft = async () => {
        if (!editingOpenEventId) {
            return;
        }

        const selectedEvent = openEventsCache.find((eventItem) => String(eventItem.id) === String(editingOpenEventId));
        const eventTitle = selectedEvent?.title || 'this event';
        const confirmed = window.confirm(`Move "${eventTitle}" to draft?`);
        if (!confirmed) {
            return;
        }

        try {
            toggleSubmit(true);
            await updateStatus(editingOpenEventId, 'draft');
            closeOpenEventModal();
        } finally {
            toggleSubmit(false);
        }
    };

    const populateOpenEventStartOptions = () => {
        const startSelect = document.getElementById('openEventStartTime');
        if (!startSelect) return;

        const previous = startSelect.value;
        startSelect.innerHTML = '<option value="">Pick time</option>';

        openEventTimeSlots.forEach((slot) => {
            const option = document.createElement('option');
            option.value = slot.value;
            option.textContent = slot.label;
            startSelect.appendChild(option);
        });

        if (previous && Array.from(startSelect.options).some((option) => option.value === previous)) {
            startSelect.value = previous;
        }
    };

    const populateOpenEventEndOptions = () => {
        const startSelect = document.getElementById('openEventStartTime');
        const endSelect = document.getElementById('openEventEndTime');
        if (!startSelect || !endSelect) return;

        const selectedStart = startSelect.value;
        const previousEnd = endSelect.value;
        endSelect.innerHTML = '<option value="">Pick end time</option>';

        if (!selectedStart) {
            endSelect.innerHTML = '<option value="">Pick start time first</option>';
            endSelect.disabled = true;
            return;
        }

        const selectedStartHour = Number(selectedStart.split(':')[0]);
        openEventTimeSlots
            .filter((slot) => slot.hour > selectedStartHour)
            .forEach((slot) => {
                const option = document.createElement('option');
                option.value = slot.value;
                option.textContent = slot.label;
                endSelect.appendChild(option);
            });

        endSelect.disabled = endSelect.options.length <= 1;
        if (previousEnd && Array.from(endSelect.options).some((option) => option.value === previousEnd)) {
            endSelect.value = previousEnd;
        }
    };

    const syncOpenEventTimeSelects = () => {
        populateOpenEventStartOptions();
        populateOpenEventEndOptions();
    };

    const initOpenEventTimeSelects = () => {
        const startSelect = document.getElementById('openEventStartTime');
        const endSelect = document.getElementById('openEventEndTime');
        if (!startSelect || !endSelect) return;

        startSelect.addEventListener('change', () => {
            endSelect.value = '';
            populateOpenEventEndOptions();
        });

        syncOpenEventTimeSelects();
    };

    const initPickers = () => {
        if (typeof window.flatpickr !== 'function') return;

        window.flatpickr('#openEventDate', {
            dateFormat: 'Y-m-d',
            minDate: 'today'
        });
    };

    const loadOpenEvents = async () => {
        try {
            setLoading(true);
            const eventResponse = await request('/api/admin/open-events');
            const events = Array.isArray(eventResponse?.events) ? eventResponse.events : [];
            openEventsCache = events;
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
            currentViewingEventId = String(eventId);
            const [response, users] = await Promise.all([
                request(`/api/admin/open-events/${encodeURIComponent(eventId)}/bookings`),
                loadOpenEventUsers()
            ]);
            renderEventDetailsModal(response?.event || {}, response?.slots || [], users);
        } catch (error) {
            console.error('Failed to load open event booking details:', error);
            showAlert(error.message || 'Failed to load open event details', 'error');
        }
    };

    const submitOpenEvent = async (event) => {
        event.preventDefault();
        const payload = collectFormData();

        if (!payload.title || !payload.date || !payload.startTime || !payload.endTime) {
            showAlert('Please fill in title, date, start time, and end time.', 'error');
            return;
        }

        try {
            toggleSubmit(true);
            if (editingOpenEventId) {
                await request(`/api/admin/open-events/${encodeURIComponent(editingOpenEventId)}`, {
                    method: 'PATCH',
                    body: payload
                });
                showAlert('Open event updated successfully.');
            } else {
                await request('/api/admin/open-events', {
                    method: 'POST',
                    body: {
                        ...payload,
                        status: draftStatusPending ? 'draft' : 'published'
                    }
                });
                const message = draftStatusPending 
                    ? 'Event saved as draft successfully.' 
                    : 'Open event created successfully.';
                showAlert(message);
            }
            closeOpenEventModal();
            resetForm();
            await loadOpenEvents();
        } catch (error) {
            console.error('Failed to save open event:', error);
            showAlert(error.message || 'Failed to save open event', 'error');
        } finally {
            toggleSubmit(false);
            draftStatusPending = false;
        }
    };

    window.moveEditingOpenEventToDraft = moveEditingOpenEventToDraft;

    const updateStatus = async (eventId, status) => {
        try {
            closeOpenEventInfoModal();
            await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/status`, {
                method: 'PATCH',
                body: { status }
            });
            showAlert(status === 'draft' ? 'Open event moved to draft.' : `Open event marked as ${status}.`);
            await loadOpenEvents();
        } catch (error) {
            console.error('Failed to update open event status:', error);
            showAlert(error.message || 'Failed to update event status', 'error');
        }
    };

    const sendOpenEventNotification = async (eventId) => {
        const button = document.querySelector(`.admin-open-event-notify-btn[data-event-id="${eventId}"]`);
        const originalText = button?.textContent || 'Send Notification';
        
        try {
            if (button) {
                button.disabled = true;
                button.textContent = 'Sending...';
            }
            setLoading(true);

            const response = await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/notify-users`, {
                method: 'POST'
            });

            setLoading(false);
            
            const detailsMessage = response?.sent !== undefined && response?.failed !== undefined
                ? `✅ Notifications sent to ${response.sent} user${response.sent !== 1 ? 's' : ''}${response.failed > 0 ? ` (${response.failed} failed)` : ''}`
                : response?.message || 'Notification sent successfully.';
            
            showAlert(detailsMessage, 'success');
        } catch (error) {
            setLoading(false);
            console.error('Failed to send open event notification:', error);
            showAlert(error.message || 'Failed to send notification', 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    };

    const sendOpenEventTestEmail = async (eventId) => {
        const button = document.querySelector(`.admin-open-event-test-email-btn[data-event-id="${eventId}"]`);
        const originalText = button?.textContent || '🧪 Test Email';
        
        try {
            if (button) {
                button.disabled = true;
                button.textContent = 'Sending...';
            }
            setLoading(true);

            const response = await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/test-email`, {
                method: 'POST'
            });

            setLoading(false);
            
            const detailsMessage = response?.recipients?.length > 0
                ? `✅ Test email sent to ${response.recipients.length} admin recipient${response.recipients.length !== 1 ? 's' : ''}`
                : response?.message || 'Test email sent successfully.';
            
            showAlert(detailsMessage, 'success');
        } catch (error) {
            setLoading(false);
            console.error('Failed to send open event test email:', error);
            showAlert(error.message || 'Failed to send test email', 'error');
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    };

    const deleteOpenEvent = async (eventId) => {
        const event_data = openEventsCache.find((e) => String(e.id) === String(eventId));
        const eventTitle = event_data?.title || 'this event';
        const confirmed = window.confirm(
            `⚠️ DELETE OPEN EVENT\n\n` +
            `Are you sure you want to delete "${eventTitle}"?\n\n` +
            `This action cannot be undone. All associated slot bookings will also be deleted.\n\n` +
            `Continue?`
        );
        if (!confirmed) return;

        try {
            setLoading(true);
            await request(`/api/admin/open-events/${encodeURIComponent(eventId)}`, {
                method: 'DELETE'
            });
            showAlert(`✅ Event "${eventTitle}" deleted successfully.`, 'success');
            await loadOpenEvents();
        } catch (error) {
            console.error('Failed to delete open event:', error);
            showAlert(error.message || 'Failed to delete event', 'error');
        } finally {
            setLoading(false);
        }
    };

    const copyOpenEvent = (eventId) => {
        const sourceEvent = openEventsCache.find((e) => String(e.id) === String(eventId));
        if (!sourceEvent) {
            showAlert('Event not found.', 'error');
            return;
        }

        // Pre-fill the create form with the source event's data, forcing draft status
        editingOpenEventId = '';
        draftStatusPending = false;

        const titleInput = document.getElementById('openEventTitle');
        const quickFactsInput = document.getElementById('openEventQuickFacts');
        const descriptionInput = document.getElementById('openEventDescription');
        const notesInput = document.getElementById('openEventNotes');
        const dateInput = document.getElementById('openEventDate');
        const startSelect = document.getElementById('openEventStartTime');
        const endSelect = document.getElementById('openEventEndTime');

        if (titleInput) titleInput.value = `Copy of ${sourceEvent.title}`;
        if (quickFactsInput) quickFactsInput.value = sourceEvent.quickFacts || '';
        if (descriptionInput) descriptionInput.value = sourceEvent.description || '';
        if (notesInput) notesInput.value = sourceEvent.notes || '';
        if (dateInput) dateInput.value = sourceEvent.date || '';

        populateOpenEventStartOptions();
        if (startSelect) startSelect.value = sourceEvent.startTime || '';
        populateOpenEventEndOptions();
        if (endSelect) endSelect.value = sourceEvent.endTime || '';

        const modal = document.getElementById('openEventModal');
        const titleEl = document.getElementById('openEventModalTitle');
        if (modal) {
            modal.classList.add('show');
            if (titleEl) titleEl.textContent = 'Create Copy (New Draft)';
        }
        document.body.style.overflow = 'hidden';
    };

    const loadOpenEventUsers = async () => {
        if (openEventUsersCache.length > 0) return openEventUsersCache;
        try {
            const response = await request('/api/admin/users');
            const users = Array.isArray(response?.users) ? response.users : [];
            openEventUsersCache = users.map((u) => ({
                id: String(u._id || u.id || ''),
                name: String(u.name || '').trim(),
                email: String(u.email || '').trim()
            })).filter((u) => u.id && u.name);
            return openEventUsersCache;
        } catch (error) {
            console.error('Failed to load users for open event booking:', error);
            return [];
        }
    };

    const freeOpenEventSlot = async (eventId, bookingId) => {
        try {
            await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/bookings/${encodeURIComponent(bookingId)}`, {
                method: 'DELETE'
            });
            showAlert('Slot freed successfully.');
            await loadOpenEventDetails(eventId);
        } catch (error) {
            console.error('Failed to free slot:', error);
            showAlert(error.message || 'Failed to free slot', 'error');
        }
    };

    const adminBookOpenEventSlot = async (eventId, slotIndex) => {
        const selectEl = document.getElementById(`open-event-slot-user-${slotIndex}`);
        const userId = selectEl?.value;
        if (!userId) {
            showAlert('Please select a user to book this slot.', 'error');
            return;
        }

        const bookBtn = document.getElementById(`open-event-slot-book-btn-${slotIndex}`);
        const originalText = bookBtn?.textContent || 'Book';
        try {
            if (bookBtn) {
                bookBtn.disabled = true;
                bookBtn.textContent = 'Booking...';
            }
            await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/bookings`, {
                method: 'POST',
                body: { userId, slotIndex }
            });
            showAlert('Slot booked successfully.');
            await loadOpenEventDetails(eventId);
        } catch (error) {
            console.error('Failed to book slot:', error);
            showAlert(error.message || 'Failed to book slot', 'error');
            if (bookBtn) {
                bookBtn.disabled = false;
                bookBtn.textContent = originalText;
            }
        }
    };

    const bindEvents = () => {
        const form = document.getElementById('openEventCreateForm');
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', submitOpenEvent);
            form.dataset.bound = 'true';
        }

        const eventListSearchInput = document.getElementById('openEventListSearch');
        if (eventListSearchInput && !eventListSearchInput.dataset.bound) {
            eventListSearchInput.addEventListener('input', () => {
                eventListSearchTerm = eventListSearchInput.value || '';
                renderDraftTemplates(openEventsCache);
            });
            eventListSearchInput.dataset.bound = 'true';
        }

        const eventListStatusSelect = document.getElementById('openEventListStatusFilter');
        if (eventListStatusSelect && !eventListStatusSelect.dataset.bound) {
            eventListStatusSelect.addEventListener('change', () => {
                eventListStatusFilter = eventListStatusSelect.value || 'all';
                renderDraftTemplates(openEventsCache);
            });
            eventListStatusSelect.dataset.bound = 'true';
        }

        const eventListSortSelect = document.getElementById('openEventListSort');
        if (eventListSortSelect && !eventListSortSelect.dataset.bound) {
            eventListSortSelect.addEventListener('change', () => {
                eventListSort = eventListSortSelect.value || 'date_desc';
                renderDraftTemplates(openEventsCache);
            });
            eventListSortSelect.dataset.bound = 'true';
        }

        const cancelEditButton = document.getElementById('openEventEditCancelBtn');
        if (cancelEditButton && !cancelEditButton.dataset.bound) {
            cancelEditButton.addEventListener('click', resetForm);
            cancelEditButton.dataset.bound = 'true';
        }

        if (!document.body.dataset.adminOpenEventsBound) {
            document.body.addEventListener('click', async (event) => {
                const editButton = event.target.closest('.admin-open-event-edit-btn');
                if (editButton) {
                    const { eventId } = editButton.dataset;
                    if (!eventId) return;
                    closeOpenEventInfoModal();
                    startEditingEvent(eventId);
                    return;
                }

                const copyButton = event.target.closest('.admin-open-event-copy-btn');
                if (copyButton) {
                    const { eventId } = copyButton.dataset;
                    if (!eventId) return;
                    closeOpenEventInfoModal();
                    copyOpenEvent(eventId);
                    return;
                }

                const statusButton = event.target.closest('.admin-open-event-status-btn');
                if (statusButton) {
                    const { eventId, status } = statusButton.dataset;
                    if (!eventId || !status) return;

                    const eventData = openEventsCache.find((e) => String(e.id) === String(eventId));
                    const eventTitle = eventData?.title || 'this event';
                    const isPublishAction = status === 'published';

                    if (typeof showConfirmationModal === 'function') {
                        const title = isPublishAction ? 'Publish Open Event' : 'Move Open Event To Draft';
                        const message = isPublishAction
                            ? `Are you sure you want to publish "${eventTitle}"?`
                            : `Are you sure you want to move "${eventTitle}" to draft?`;
                        const confirmText = isPublishAction ? 'Publish Event' : 'Move to Draft';

                        showConfirmationModal(title, message, confirmText, () => {
                            void updateStatus(eventId, status);
                        });
                        return;
                    }

                    const actionLabel = isPublishAction ? 'publish this event' : 'move this event to draft';
                    const confirmed = window.confirm(`Are you sure you want to ${actionLabel}?`);
                    if (!confirmed) return;
                    await updateStatus(eventId, status);
                    return;
                }

                const notifyButton = event.target.closest('.admin-open-event-notify-btn');
                if (notifyButton) {
                    const { eventId } = notifyButton.dataset;
                    if (!eventId) return;
                    const event_data = openEventsCache.find((e) => String(e.id) === String(eventId));
                    const eventTitle = event_data?.title || 'this event';
                    const confirmed = window.confirm(
                        `⚠️ SEND NOTIFICATION TO ALL USERS\n\n` +
                        `This will send the event notification for "${eventTitle}" to ALL users in the system.\n\n` +
                        `Continue?`
                    );
                    if (!confirmed) return;
                    await sendOpenEventNotification(eventId);
                    return;
                }

                const testEmailButton = event.target.closest('.admin-open-event-test-email-btn');
                if (testEmailButton) {
                    const { eventId } = testEmailButton.dataset;
                    if (!eventId) return;
                    await sendOpenEventTestEmail(eventId);
                    return;
                }

                const deleteButton = event.target.closest('.admin-open-event-delete-btn');
                if (deleteButton) {
                    const { eventId } = deleteButton.dataset;
                    if (!eventId) return;
                    closeOpenEventInfoModal();
                    await deleteOpenEvent(eventId);
                    return;
                }

                const viewButton = event.target.closest('.admin-open-event-view-btn');
                if (viewButton) {
                    const { eventId } = viewButton.dataset;
                    if (!eventId) return;
                    const eventData = openEventsCache.find((item) => String(item.id) === String(eventId));
                    if (!eventData) return;
                    renderEventInfoModal(eventData);
                    return;
                }

                const row = event.target.closest('.admin-open-event-row');
                if (row && !event.target.closest('button')) {
                    const { eventId } = row.dataset;
                    if (!eventId) return;
                    const eventData = openEventsCache.find((item) => String(item.id) === String(eventId));
                    if (!eventData) return;
                    renderEventInfoModal(eventData);
                }
            });

            document.body.addEventListener('click', async (event) => {
                const detailsButton = event.target.closest('.admin-open-event-details-btn');
                if (detailsButton) {
                    const { eventId, eventTitle } = detailsButton.dataset;
                    if (!eventId) return;
                    const originalText = detailsButton.textContent;
                    detailsButton.disabled = true;
                    detailsButton.textContent = 'Loading...';
                    closeOpenEventInfoModal();
                    showOpenEventDetailsLoading(eventTitle || '');
                    try {
                        await loadOpenEventDetails(eventId);
                    } finally {
                        detailsButton.disabled = false;
                        detailsButton.textContent = originalText;
                    }
                    return;
                }

                const freeSlotButton = event.target.closest('.admin-open-event-free-slot-btn');
                if (freeSlotButton) {
                    const { eventId, bookingId } = freeSlotButton.dataset;
                    if (!eventId || !bookingId) return;
                    if (typeof showConfirmationModal === 'function') {
                        showConfirmationModal(
                            'Free Slot',
                            'Are you sure you want to free this slot? The booking will be cancelled.',
                            'Free Slot',
                            () => {
                                void freeOpenEventSlot(eventId, bookingId);
                            }
                        );
                        return;
                    }
                    const confirmed = window.confirm('Are you sure you want to free this slot? The booking will be cancelled.');
                    if (!confirmed) return;
                    await freeOpenEventSlot(eventId, bookingId);
                    return;
                }

                const bookSlotButton = event.target.closest('.admin-open-event-book-slot-btn');
                if (bookSlotButton) {
                    const { eventId, slotIndex } = bookSlotButton.dataset;
                    if (!eventId || slotIndex === undefined) return;
                    await adminBookOpenEventSlot(eventId, Number(slotIndex));
                    return;
                }
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

        if (tabName === 'events') {
            await loadOpenEvents();
        }
        if (tabName === 'drafts') {
            await loadOpenEvents();
        }
    };

    const init = () => {
        initPickers();
        initOpenEventTimeSelects();
        bindEvents();
    };

    window.AdminOpenEvents = {
        init,
        loadOpenEvents,
        switchOpenEventsTab,
        openOpenEventModal,
        closeOpenEventModal,
        closeOpenEventInfoModal,
        submitOpenEventWithStatus,
        deleteOpenEvent,
        copyOpenEvent,
        freeOpenEventSlot,
        adminBookOpenEventSlot
    };

    window.loadOpenEvents = loadOpenEvents;
    window.switchOpenEventsTab = switchOpenEventsTab;
    window.openOpenEventModal = openOpenEventModal;
    window.closeOpenEventModal = closeOpenEventModal;
    window.closeOpenEventInfoModal = closeOpenEventInfoModal;
    window.submitOpenEventWithStatus = submitOpenEventWithStatus;
    window.deleteOpenEvent = deleteOpenEvent;
    window.copyOpenEvent = copyOpenEvent;

    document.addEventListener('DOMContentLoaded', init);
})();
