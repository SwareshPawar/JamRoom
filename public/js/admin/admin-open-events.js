(function adminOpenEventsBootstrap() {
    const API_URL = window.location.origin;
    let openEventsCache = [];
    let editingOpenEventId = '';
    let draftStatusPending = false;

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

    const openOpenEventModal = () => {
        draftStatusPending = false;
        editingOpenEventId = '';
        resetForm();
        const modal = document.getElementById('openEventModal');
        const titleEl = document.getElementById('openEventModalTitle');
        if (modal) {
            modal.classList.add('show');
            if (titleEl) titleEl.textContent = 'Create Open Event';
        }
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
        draftStatusPending = true;
        const statusSelect = document.getElementById('openEventStatus');
        if (statusSelect) {
            statusSelect.value = status;
        }
        const form = document.getElementById('openEventCreateForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    };

    const toggleSubmit = (isSubmitting) => {
        const button = document.getElementById('openEventCreateSubmit');
        const draftButton = document.getElementById('openEventSaveDraftBtn');
        if (!button) return;
        
        button.disabled = isSubmitting;
        if (draftButton) draftButton.disabled = isSubmitting;
        
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

    const renderEventCard = (event) => {
        const statusActions = event.status === 'published'
            ? `<button type="button" class="btn btn-danger btn-sm admin-open-event-status-btn" data-event-id="${event.id}" data-status="draft" title="Move this event back to draft">Move to Draft</button>`
            : `<button type="button" class="btn btn-primary btn-sm admin-open-event-status-btn" data-event-id="${event.id}" data-status="published" title="Publish this event">Publish</button>`;

        return `
            <article class="booking-expand-panel admin-theme-info-card" data-event-id="${event.id}">
                <h4>${escapeHtml(event.title)}</h4>
                <p>${escapeHtml(formatDateTimeLabel(event))}</p>
                <p>${escapeHtml(event.description || 'No description provided.')}</p>
                <p>Status: <strong>${escapeHtml(event.status)}</strong> | Slots: ${event.slotCount} | Booked: ${event.bookingCount || 0}</p>
                <div class="booking-table-actions">
                    <button type="button" class="btn btn-warning btn-sm admin-open-event-edit-btn" data-event-id="${event.id}" title="Edit this event">✏️ Edit</button>
                    <button type="button" class="btn btn-info btn-sm admin-open-event-details-btn" data-event-id="${event.id}" data-event-title="${escapeHtml(event.title)}" title="View slot bookings">📋 Bookings</button>
                    <button type="button" class="btn btn-success btn-sm admin-open-event-notify-btn" data-event-id="${event.id}" title="Send to all users">📧 Notify</button>
                    <button type="button" class="btn btn-secondary btn-sm admin-open-event-test-email-btn" data-event-id="${event.id}" title="Send test email">🧪 Test</button>
                    <button type="button" class="btn btn-danger btn-sm admin-open-event-delete-btn" data-event-id="${event.id}" title="Delete this event">🗑️ Delete</button>
                    ${statusActions}
                </div>
            </article>
        `;
    };

    const renderDraftTemplates = (events) => {
        const panelEl = document.getElementById('openEventDraftPanel');
        if (!panelEl) return;

        const draftEvents = (Array.isArray(events) ? events : []).filter((event) => String(event?.status || '').toLowerCase() === 'draft');
        if (draftEvents.length === 0) {
            panelEl.innerHTML = '<div class="loading-inline-muted">No draft open events saved yet.</div>';
            return;
        }

        panelEl.innerHTML = draftEvents.map((event) => renderEventCard(event)).join('');
    };

    const renderEvents = (events) => {
        const container = document.getElementById('openEventsList');
        if (!container) return;

        const safeEvents = Array.isArray(events) ? events : [];
        renderDraftTemplates(safeEvents);

        const nonDraftEvents = safeEvents.filter((event) => String(event?.status || '').toLowerCase() !== 'draft');

        if (safeEvents.length === 0) {
            container.innerHTML = '<div class="loading-inline-muted">No open events created yet.</div>';
            return;
        }

        if (nonDraftEvents.length === 0) {
            container.innerHTML = '<div class="loading-inline-muted">No published open events yet. Publish from Draft Open Events when ready.</div>';
            return;
        }

        container.innerHTML = nonDraftEvents.map((event) => renderEventCard(event)).join('');
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

    const applyFormData = (eventData = {}) => {
        const titleInput = document.getElementById('openEventTitle');
        const descriptionInput = document.getElementById('openEventDescription');
        const dateInput = document.getElementById('openEventDate');
        const startSelect = document.getElementById('openEventStartTime');
        const endSelect = document.getElementById('openEventEndTime');
        const statusSelect = document.getElementById('openEventStatus');

        if (titleInput) titleInput.value = eventData.title || '';
        if (descriptionInput) descriptionInput.value = eventData.description || '';
        if (dateInput) dateInput.value = eventData.date || '';
        if (startSelect) startSelect.value = eventData.startTime || '';
        populateOpenEventEndOptions();
        if (endSelect) endSelect.value = eventData.endTime || '';
        if (statusSelect) statusSelect.value = eventData.status || 'draft';
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
        const titleEl = document.getElementById('openEventModalTitle');
        if (modal) {
            modal.classList.add('show');
            if (titleEl) titleEl.textContent = 'Edit Open Event';
        }
        document.body.style.overflow = 'hidden';
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
            const response = await request(`/api/admin/open-events/${encodeURIComponent(eventId)}/bookings`);
            renderEventDetailsModal(response?.event || {}, response?.bookings || []);
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
                    body: payload
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

    const updateStatus = async (eventId, status) => {
        try {
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

    const bindEvents = () => {
        const form = document.getElementById('openEventCreateForm');
        if (form && !form.dataset.bound) {
            form.addEventListener('submit', submitOpenEvent);
            form.dataset.bound = 'true';
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
                    startEditingEvent(eventId);
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
                    await deleteOpenEvent(eventId);
                    return;
                }
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
        submitOpenEventWithStatus,
        deleteOpenEvent
    };

    window.loadOpenEvents = loadOpenEvents;
    window.switchOpenEventsTab = switchOpenEventsTab;
    window.openOpenEventModal = openOpenEventModal;
    window.closeOpenEventModal = closeOpenEventModal;
    window.submitOpenEventWithStatus = submitOpenEventWithStatus;
    window.deleteOpenEvent = deleteOpenEvent;

    document.addEventListener('DOMContentLoaded', init);
})();
