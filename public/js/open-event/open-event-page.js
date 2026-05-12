(function openEventPageBootstrap() {
    const API_BASE = window.location.origin;

    const themedConfirm = (message, options = {}) => new Promise((resolve) => {
        const {
            title = 'Confirm Action',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmType = 'primary'
        } = options;

        if (!window.alertManager || typeof window.alertManager.show !== 'function') {
            resolve(window.confirm(message));
            return;
        }

        const confirmId = `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const okId = `${confirmId}-ok`;
        const cancelId = `${confirmId}-cancel`;

        const alertId = window.alertManager.show(
            `<div class="open-event-confirm-msg">${String(message)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;')}</div>
             <div class="open-event-confirm-actions" data-alert-interactive="true">
                <button id="${cancelId}" type="button" class="btn btn-secondary btn-sm" data-alert-interactive="true">${cancelText}</button>
                <button id="${okId}" type="button" class="btn btn-${confirmType} btn-sm" data-alert-interactive="true">${confirmText}</button>
             </div>`,
            'info',
            {
                title,
                timeout: 0,
                showCloseButton: false
            }
        );

        const finalize = (result) => {
            if (window.alertManager && alertId) {
                window.alertManager.remove(alertId);
            }
            resolve(result);
        };

        window.setTimeout(() => {
            const okBtn = document.getElementById(okId);
            const cancelBtn = document.getElementById(cancelId);

            if (okBtn) {
                okBtn.addEventListener('click', () => finalize(true), { once: true });
            }
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => finalize(false), { once: true });
            }
        }, 0);
    });

    class OpenEventApi {
        constructor(baseUrl) {
            this.baseUrl = baseUrl;
        }

        getToken() {
            return localStorage.getItem('token') || '';
        }

        async request(path, options = {}) {
            const token = this.getToken();
            const headers = {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            };

            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(`${this.baseUrl}${path}`, {
                method: options.method || 'GET',
                headers,
                body: options.body ? JSON.stringify(options.body) : undefined
            });

            let payload = null;
            try {
                payload = await response.json();
            } catch (_error) {
                payload = null;
            }

            if (!response.ok) {
                const err = new Error(payload?.message || 'Request failed');
                err.status = response.status;
                throw err;
            }

            return payload;
        }

        async getCurrentUser() {
            return this.request('/api/auth/me');
        }

        async getEvents() {
            return this.request('/api/open-events');
        }

        async getEvent(eventId) {
            return this.request(`/api/open-events/${encodeURIComponent(eventId)}`);
        }

        async bookSlot(eventId, slotIndex) {
            return this.request(`/api/open-events/${encodeURIComponent(eventId)}/book`, {
                method: 'POST',
                body: { slotIndex }
            });
        }

        async cancelMySlot(eventId) {
            return this.request(`/api/open-events/${encodeURIComponent(eventId)}/book`, {
                method: 'DELETE'
            });
        }

        async getOpenSessions() {
            return this.request('/api/bookings/open-sessions');
        }

        async toggleSessionPresence(sessionId) {
            return this.request(`/api/bookings/open-sessions/${encodeURIComponent(sessionId)}/presence`, {
                method: 'POST'
            });
        }

        async addSessionComment(sessionId, text) {
            return this.request(`/api/bookings/open-sessions/${encodeURIComponent(sessionId)}/comments`, {
                method: 'POST',
                body: { text }
            });
        }
    }

    class OpenEventRenderer {
                showLoading(message = 'Processing...') {
                    if (!this.detailBodyEl) return;
                    this.detailBodyEl.innerHTML = `<div class="open-event-loading"><span class="loading-spinner"></span> ${this.escapeHtml(message)}</div>`;
                }

                hideLoading() {
                    // No-op: content will be replaced by renderEventDetailsModal after loading
                }
        constructor() {
            this.guestHeroEl = document.getElementById('openEventGuestHero');
            this.statusEl = document.getElementById('openEventStatus');
            this.eventListEl = document.getElementById('openEventList');
            this.authNoticeEl = document.getElementById('openEventAuthNotice');
            this.loginLinkEl = document.getElementById('openEventLoginLink');
            this.registerLinkEl = document.getElementById('openEventRegisterLink');
            this.modalEl = document.getElementById('openEventDetailModal');
            this.modalTitleEl = document.getElementById('openEventDetailTitle');
            this.metaEl = document.getElementById('openEventMeta');
            this.detailBodyEl = document.getElementById('openEventDetailBody');
            this.modalCloseEl = document.getElementById('openEventDetailModalClose');
        }

        setAuthLinks(redirectTarget) {
            const encoded = encodeURIComponent(redirectTarget);
            if (this.loginLinkEl) {
                this.loginLinkEl.href = `/login.html?redirect=${encoded}`;
            }
            if (this.registerLinkEl) {
                this.registerLinkEl.href = `/register.html?redirect=${encoded}`;
            }
        }

        showAuthNotice(isVisible) {
            if (this.guestHeroEl) {
                this.guestHeroEl.hidden = !isVisible;
            }
            if (!this.authNoticeEl) return;
            this.authNoticeEl.hidden = !isVisible;
        }

        setStatus(message) {
            if (this.statusEl) {
                this.statusEl.textContent = message;
            }
        }

        bindModalClose(onClose) {
            if (!this.modalEl) return;

            if (this.modalCloseEl) {
                this.modalCloseEl.addEventListener('click', () => onClose());
            }

            this.modalEl.addEventListener('click', (event) => {
                if (event.target === this.modalEl) {
                    onClose();
                }
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.modalEl.classList.contains('show')) {
                    onClose();
                }
            });
        }

        renderDiscoveryList(items, selectedKey) {
            if (!this.eventListEl) return;

            const safeItems = Array.isArray(items) ? items : [];
            if (safeItems.length === 0) {
                this.eventListEl.innerHTML = '';
                this.setStatus('No Open Events or JamRoom Sessions are available right now.');
                return;
            }

            const eventCount = safeItems.filter((item) => item.type === 'event').length;
            const sessionCount = safeItems.filter((item) => item.type === 'session').length;
            this.setStatus(`Found ${eventCount} Open Event(s) and ${sessionCount} JamRoom Session(s).`);

            this.eventListEl.innerHTML = safeItems.map((item) => {
                const itemKey = `${item.type}:${item.id}`;
                const isSelected = itemKey === selectedKey;
                const typeLabel = item.type === 'event' ? 'Open Event' : 'JamRoom Session';
                const ctaLabel = item.type === 'event' ? 'View Slots' : 'Join Session';
                const summary = item.type === 'event'
                    ? `${this.escapeHtml(item.date)} | ${this.escapeHtml(item.startTime)} - ${this.escapeHtml(item.endTime)} | ${Number(item.slotCount || 0)} slots`
                    : `${this.escapeHtml(item.displayDate || item.date || '')} | ${this.escapeHtml(item.startTime || '')} - ${this.escapeHtml(item.endTime || '')}`;

                return `
                    <article class="open-event-item ${isSelected ? 'selected' : ''}" data-item-key="${itemKey}">
                        <div class="open-event-item-main">
                            <p class="open-event-type-pill ${item.type === 'event' ? 'open-event-type-pill-event' : 'open-event-type-pill-session'}">${typeLabel}</p>
                            <h3 class="open-event-item-title">${this.escapeHtml(item.title || (item.type === 'event' ? 'Open Event' : 'Open JamRoom Session'))}</h3>
                            <p class="open-event-item-meta">${summary}</p>
                            ${item.type === 'event'
                                ? `<p class="open-event-item-description">${this.escapeHtml(item.description || 'No description provided.')}</p>`
                                : `<p class="open-event-item-description">Host: ${this.escapeHtml(item.firstName || 'Artist')}${item.caption ? ` | ${this.escapeHtml(item.caption)}` : ''}</p>`}
                        </div>
                        <div>
                            <button type="button" class="btn btn-secondary open-event-view-btn" data-item-type="${item.type}" data-item-id="${item.id}">${ctaLabel}</button>
                        </div>
                    </article>
                `;
            }).join('');
        }

        openDetailModal() {
            if (!this.modalEl) return;
            this.modalEl.classList.add('show');
            this.modalEl.setAttribute('aria-hidden', 'false');
        }

        closeDetailModal() {
            if (!this.modalEl) return;
            this.modalEl.classList.remove('show');
            this.modalEl.setAttribute('aria-hidden', 'true');
        }

        renderEventDetailsModal(event, slots) {
            if (!this.modalTitleEl || !this.metaEl || !this.detailBodyEl) return;

            this.modalTitleEl.textContent = event?.title || 'Open Event Details';
            this.metaEl.textContent = `${event?.date || ''} | ${event?.startTime || ''} - ${event?.endTime || ''} | ${Number(event?.slotCount || 0)} slot(s)`;

            const safeSlots = Array.isArray(slots) ? slots : [];
            this.detailBodyEl.innerHTML = `
                <div class="open-event-slots" aria-live="polite">
                    ${safeSlots.map((slot) => {
                        const isBooked = slot.status === 'booked';
                        const isPast = slot.status === 'past';
                        const isMine = Boolean(slot.isMine);

                        const classes = [
                            'open-event-slot',
                            isBooked ? 'booked' : '',
                            isPast ? 'past' : '',
                            isMine ? 'mine' : ''
                        ].filter(Boolean).join(' ');

                        let actionHtml = '';
                        if (isMine && !isPast) {
                            actionHtml = `<button type="button" class="btn btn-danger btn-sm open-event-cancel-btn" data-event-id="${event.id}">Cancel My Slot</button>`;
                        } else if (!isBooked && !isPast) {
                            actionHtml = `<button type="button" class="btn btn-primary btn-sm open-event-book-btn" data-event-id="${event.id}" data-slot-index="${slot.index}" data-slot-label="${this.escapeHtml(slot.startTime)} - ${this.escapeHtml(slot.endTime)}">Book Slot</button>`;
                        }

                        const stateText = isMine
                            ? 'Booked by you'
                            : (isBooked ? `Booked by ${this.escapeHtml(slot.bookedByFirstName || 'User')}` : (isPast ? 'Past slot' : 'Available'));

                        return `
                            <div class="${classes}">
                                <p class="open-event-slot-label">${this.escapeHtml(slot.startTime)} - ${this.escapeHtml(slot.endTime)}</p>
                                <p class="open-event-slot-state">${stateText}</p>
                                ${actionHtml}
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        renderSessionDetailsModal(session, isAuthenticated) {
            if (!this.modalTitleEl || !this.metaEl || !this.detailBodyEl) return;

            this.modalTitleEl.textContent = session?.title || 'Open JamRoom Session';
            this.metaEl.textContent = `${session?.displayDate || session?.date || ''} | ${session?.startTime || ''} - ${session?.endTime || ''}`;

            const mediaPreviewHtml = this.buildMediaPreview(session?.mediaType, session?.mediaUrl);
            const disabledAttr = isAuthenticated ? '' : 'disabled';

            this.detailBodyEl.innerHTML = `
                <article class="open-event-future-card open-event-session-detail">
                    <p><strong>Host:</strong> ${this.escapeHtml(session?.firstName || 'Artist')}</p>
                    ${session?.caption ? `<p>${this.escapeHtml(session.caption)}</p>` : ''}
                    ${mediaPreviewHtml}
                    <p>Presence: ${Number(session?.presenceCount || 0)} | Comments: ${Number(session?.commentsCount || 0)}</p>
                    <div class="open-session-actions">
                        <button type="button" class="btn btn-primary btn-sm open-session-join-btn" data-session-id="${session?.id}">Join Session</button>
                        <button type="button" class="btn btn-secondary btn-sm open-session-presence-btn" data-session-id="${session?.id}" ${disabledAttr}>Mark Presence</button>
                    </div>
                    <form class="open-session-comment-form" data-session-id="${session?.id}">
                        <input type="text" name="comment" maxlength="240" placeholder="Comment on this session" ${disabledAttr}>
                        <button type="submit" class="btn btn-secondary btn-sm" ${disabledAttr}>Post</button>
                    </form>
                </article>
            `;
        }

        buildMediaPreview(mediaType, mediaUrl) {
            const url = String(mediaUrl || '').trim();
            if (!url) return '<p>Join button will mark your presence for this session.</p>';

            if (mediaType === 'youtube') {
                return `<p><a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View linked YouTube media</a></p>`;
            }

            if (mediaType === 'instagram') {
                return `<p><a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View linked Instagram media</a></p>`;
            }

            return `<p><a href="${this.escapeHtml(url)}" target="_blank" rel="noopener noreferrer">View linked media</a></p>`;
        }

        escapeHtml(value) {
            return String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    }

    class OpenEventPageController {
        constructor() {
            this.api = new OpenEventApi(API_BASE);
            this.renderer = new OpenEventRenderer();
            this.events = [];
            this.sessions = [];
            this.selectedItem = this.parseSelectedItemFromUrl();
            this.currentUser = null;
            this.bindHandlers();
            this.renderer.bindModalClose(() => this.handleCloseModal());
        }

        parseSelectedItemFromUrl() {
            const params = new URLSearchParams(window.location.search);
            const itemParam = params.get('item');
            if (itemParam && itemParam.includes(':')) {
                const [type, id] = itemParam.split(':');
                if ((type === 'event' || type === 'session') && id) {
                    return { type, id };
                }
            }

            const legacyEventId = params.get('event');
            if (legacyEventId) {
                return { type: 'event', id: legacyEventId };
            }

            return null;
        }

        getCombinedItems() {
            const eventItems = this.events.map((event) => ({
                type: 'event',
                ...event
            }));

            const sessionItems = this.sessions.map((session) => ({
                type: 'session',
                ...session,
                title: session.title || 'Open JamRoom Session'
            }));

            return [...eventItems, ...sessionItems].sort((a, b) => {
                const aKey = `${a.date || ''} ${a.startTime || ''}`;
                const bKey = `${b.date || ''} ${b.startTime || ''}`;
                return aKey.localeCompare(bKey);
            });
        }

        selectedKey() {
            return this.selectedItem ? `${this.selectedItem.type}:${this.selectedItem.id}` : '';
        }

        bindHandlers() {
            document.addEventListener('click', async (event) => {
                const viewBtn = event.target.closest('.open-event-view-btn');
                if (viewBtn) {
                    await this.selectItem(viewBtn.dataset.itemType, viewBtn.dataset.itemId, true);
                    return;
                }

                const bookBtn = event.target.closest('.open-event-book-btn');
                if (bookBtn) {
                    await this.handleBookSlot(
                        bookBtn.dataset.eventId,
                        Number(bookBtn.dataset.slotIndex),
                        String(bookBtn.dataset.slotLabel || '').trim()
                    );
                    return;
                }

                const cancelBtn = event.target.closest('.open-event-cancel-btn');
                if (cancelBtn) {
                    await this.handleCancelSlot(cancelBtn.dataset.eventId);
                    return;
                }

                const joinBtn = event.target.closest('.open-session-join-btn');
                if (joinBtn) {
                    await this.handleSessionJoin(joinBtn.dataset.sessionId);
                    return;
                }

                const presenceBtn = event.target.closest('.open-session-presence-btn');
                if (presenceBtn) {
                    await this.handleSessionPresence(presenceBtn.dataset.sessionId);
                }
            });

            document.addEventListener('submit', async (event) => {
                const commentForm = event.target.closest('.open-session-comment-form');
                if (!commentForm) return;

                event.preventDefault();
                const sessionId = commentForm.dataset.sessionId;
                const input = commentForm.querySelector('input[name="comment"]');
                const commentText = String(input?.value || '').trim();
                if (!commentText) return;

                await this.handleSessionComment(sessionId, commentText);
                if (input) input.value = '';
            });
        }

        async init() {
            this.renderer.setAuthLinks(window.location.href);
            await this.resolveUser();
            await this.loadDiscoveryData();

            if (this.selectedItem) {
                await this.selectItem(this.selectedItem.type, this.selectedItem.id, false);
            }
        }

        async resolveUser() {
            try {
                const result = await this.api.getCurrentUser();
                this.currentUser = result?.user || null;
                this.renderer.showAuthNotice(!this.currentUser);

                if (window.NavigationManager) {
                    window.NavigationManager.init(this.currentUser);
                    window.NavigationManager.render('navigationContainer');
                }
            } catch (_error) {
                this.currentUser = null;
                this.renderer.showAuthNotice(true);
                if (window.NavigationManager) {
                    window.NavigationManager.init(null);
                    window.NavigationManager.render('navigationContainer');
                }
            }
        }

        async loadDiscoveryData() {
            const [eventsResult, sessionsResult] = await Promise.allSettled([
                this.api.getEvents(),
                this.api.getOpenSessions()
            ]);

            this.events = eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value?.events)
                ? eventsResult.value.events
                : [];
            this.sessions = sessionsResult.status === 'fulfilled' && Array.isArray(sessionsResult.value?.sessions)
                ? sessionsResult.value.sessions
                : [];

            this.renderer.renderDiscoveryList(this.getCombinedItems(), this.selectedKey());
        }

        updateUrlForSelection() {
            const params = new URLSearchParams(window.location.search);
            if (this.selectedItem) {
                params.set('item', `${this.selectedItem.type}:${this.selectedItem.id}`);
            } else {
                params.delete('item');
            }
            params.delete('event');

            const query = params.toString();
            const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
            window.history.replaceState({}, '', nextUrl);
            this.renderer.setAuthLinks(window.location.href);
        }

        async selectItem(type, id, pushHistory) {
            if (!type || !id) return;

            this.selectedItem = { type, id };
            if (pushHistory) {
                this.updateUrlForSelection();
            }

            this.renderer.renderDiscoveryList(this.getCombinedItems(), this.selectedKey());

            if (type === 'event') {
                await this.showEventInModal(id);
                return;
            }

            await this.showSessionInModal(id);
        }

        async showEventInModal(eventId) {
            try {
                const details = await this.api.getEvent(eventId);
                const eventData = details?.event;
                const slotData = Array.isArray(details?.slots) ? details.slots : [];
                this.renderer.renderEventDetailsModal(eventData, slotData);
                this.renderer.openDetailModal();
            } catch (error) {
                console.error('Failed to load open event details:', error);
                this.renderer.setStatus('Could not load event slots.');
            }
        }

        async showSessionInModal(sessionId) {
            const session = this.sessions.find((item) => String(item.id) === String(sessionId));
            if (!session) {
                this.renderer.setStatus('Could not load JamRoom session details.');
                return;
            }

            this.renderer.renderSessionDetailsModal(session, Boolean(this.currentUser));
            this.renderer.openDetailModal();
        }

        handleCloseModal() {
            this.renderer.closeDetailModal();
            this.selectedItem = null;
            this.updateUrlForSelection();
            this.renderer.renderDiscoveryList(this.getCombinedItems(), this.selectedKey());
        }

        async handleBookSlot(eventId, slotIndex, slotLabel = '') {
            if (!this.currentUser) {
                this.renderer.showAuthNotice(true);
                const redirect = encodeURIComponent(window.location.href);
                window.location.href = `/login.html?redirect=${redirect}`;
                return;
            }

            const bookingMessage = slotLabel
                ? `Confirm booking this slot: ${slotLabel}?`
                : 'Confirm booking this 10-minute slot?';

            const shouldBook = await themedConfirm(bookingMessage, {
                title: 'Book Slot',
                confirmText: 'Book Slot',
                cancelText: 'Cancel',
                confirmType: 'primary'
            });
            if (!shouldBook) return;

            try {
                this.renderer.showLoading('Booking your slot...');
                await this.api.bookSlot(eventId, slotIndex);
                if (window.AlertManager && typeof window.AlertManager.success === 'function') {
                    window.AlertManager.success('Slot booked successfully');
                }
                await this.loadDiscoveryData();
                await this.showEventInModal(eventId);
            } catch (error) {
                if (window.AlertManager && typeof window.AlertManager.error === 'function') {
                    window.AlertManager.error(error.message || 'Failed to book slot');
                } else if (window.alertManager && typeof window.alertManager.show === 'function') {
                    window.alertManager.show(`<div class='open-event-confirm-msg'>${String(error.message || 'Failed to book slot')}</div>`, 'error', { title: 'Booking Error', timeout: 4000 });
                }
                await this.showEventInModal(eventId);
            }
        }

        async handleCancelSlot(eventId) {
            const shouldCancel = await themedConfirm('Cancel your booked slot for this event?', {
                title: 'Cancel Slot',
                confirmText: 'Yes, Cancel',
                cancelText: 'Keep Booking',
                confirmType: 'danger'
            });
            if (!shouldCancel) return;

            try {
                this.renderer.showLoading('Cancelling your slot...');
                await this.api.cancelMySlot(eventId);
                if (window.AlertManager && typeof window.AlertManager.success === 'function') {
                    window.AlertManager.success('Your slot booking has been cancelled');
                }
                await this.loadDiscoveryData();
                await this.showEventInModal(eventId);
            } catch (error) {
                if (window.AlertManager && typeof window.AlertManager.error === 'function') {
                    window.AlertManager.error(error.message || 'Failed to cancel slot');
                } else if (window.alertManager && typeof window.alertManager.show === 'function') {
                    window.alertManager.show(`<div class='open-event-confirm-msg'>${String(error.message || 'Failed to cancel slot')}</div>`, 'error', { title: 'Cancel Error', timeout: 4000 });
                }
                await this.showEventInModal(eventId);
            }
        }

        async handleSessionJoin(sessionId) {
            if (!this.currentUser) {
                const redirect = encodeURIComponent(window.location.href);
                window.location.href = `/login.html?redirect=${redirect}`;
                return;
            }

            const session = this.sessions.find((item) => String(item.id) === String(sessionId));
            const mediaUrl = String(session?.mediaUrl || '').trim();

            try {
                await this.api.toggleSessionPresence(sessionId);
                if (mediaUrl) {
                    window.open(mediaUrl, '_blank', 'noopener,noreferrer');
                }

                if (window.AlertManager && typeof window.AlertManager.success === 'function') {
                    window.AlertManager.success(mediaUrl ? 'Presence marked. Opening session link.' : 'Presence marked for session.');
                }

                await this.loadDiscoveryData();
                await this.showSessionInModal(sessionId);
            } catch (error) {
                if (window.AlertManager && typeof window.AlertManager.error === 'function') {
                    window.AlertManager.error(error.message || 'Failed to join session');
                }
            }
        }

        async handleSessionPresence(sessionId) {
            if (!this.currentUser) {
                const redirect = encodeURIComponent(window.location.href);
                window.location.href = `/login.html?redirect=${redirect}`;
                return;
            }

            try {
                await this.api.toggleSessionPresence(sessionId);
                await this.loadDiscoveryData();
                await this.showSessionInModal(sessionId);
            } catch (error) {
                if (window.AlertManager && typeof window.AlertManager.error === 'function') {
                    window.AlertManager.error(error.message || 'Failed to update session presence');
                }
            }
        }

        async handleSessionComment(sessionId, commentText) {
            if (!this.currentUser) {
                const redirect = encodeURIComponent(window.location.href);
                window.location.href = `/login.html?redirect=${redirect}`;
                return;
            }

            try {
                await this.api.addSessionComment(sessionId, commentText);
                await this.loadDiscoveryData();
                await this.showSessionInModal(sessionId);
            } catch (error) {
                if (window.AlertManager && typeof window.AlertManager.error === 'function') {
                    window.AlertManager.error(error.message || 'Failed to post comment');
                }
            }
        }
    }

    document.addEventListener('DOMContentLoaded', async () => {
        const controller = new OpenEventPageController();
        await controller.init();
    });
})();