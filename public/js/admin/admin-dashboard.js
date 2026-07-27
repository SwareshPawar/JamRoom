/**
 * Admin dashboard module.
 * Handles top-level admin stats loading and rendering.
 */

(() => {
    const KPI_TONE_CLASSES = ['kpi-tone-good', 'kpi-tone-warn', 'kpi-tone-bad', 'kpi-tone-neutral'];
    const STAT_IDS = [
        'totalBookings',
        'confirmedBookings',
        'monthlyRevenue',
        'totalUnpaidAmount',
        'roomUtilizationPct',
        'revenueGrowthPct',
        'newCustomers',
        'repeatCustomers',
        'upcomingSessions',
        'pendingBookings',
        'cancellations',
        'avgBookingDuration'
    ];

    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatDateLabel = (value) => {
        if (!value) return 'Date TBD';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Date TBD';
        return date.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTimeLabel = (timeValue) => {
        const raw = String(timeValue || '').trim();
        if (!raw) return '';
        if (/\b(am|pm)\b/i.test(raw)) return raw.toUpperCase();
        const [hoursPart, minutesPart] = raw.split(':');
        const hours = Number(hoursPart);
        const minutes = Number(minutesPart);
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return raw;
        const suffix = hours >= 12 ? 'PM' : 'AM';
        const normalizedHours = hours % 12 || 12;
        return `${normalizedHours}:${String(minutes).padStart(2, '0')} ${suffix}`;
    };

    const normalizeMobile = (value) => String(value || '').replace(/\D/g, '');

    const buildFollowupSchedule = (item = {}) => {
        const isPerday = String(item.bookingMode || '').toLowerCase() === 'perday';
        if (isPerday) {
            const start = formatDateLabel(item.perDayStartDate || item.date);
            const end = formatDateLabel(item.perDayEndDate || item.date);
            return `${start} to ${end} • ${Math.max(1, Number(item.perDayDays) || 1)} day(s)`;
        }

        const date = formatDateLabel(item.date);
        const startTime = formatTimeLabel(item.startTime);
        const endTime = formatTimeLabel(item.endTime);
        const duration = Math.max(0, Number(item.duration) || 0);
        const timeRange = startTime && endTime ? `${startTime} - ${endTime}` : (startTime || endTime || 'Time TBD');
        return `${date} • ${timeRange}${duration > 0 ? ` • ${duration}h` : ''}`;
    };

    const buildFollowupQueueMarkup = (queue = []) => {
        const items = Array.isArray(queue) ? queue : [];
        if (items.length === 0) {
            return `
                <section class="followup-queue-card">
                    <div class="followup-queue-header">
                        <div>
                            <h3>Follow-up Queue</h3>
                            <p>No bookings currently need follow-up.</p>
                        </div>
                        <span>0 items</span>
                    </div>
                </section>
            `;
        }

        const rows = items.map((item) => {
            const mobile = normalizeMobile(item.userMobile);
            const callHref = mobile ? `tel:${mobile}` : '';
            const whatsappHref = mobile ? `https://wa.me/${mobile}` : '';
            const dueAmount = Math.max(0, Number(item.price || 0) - Number(item.amountPaid || 0));

            return `
                <div class="followup-row">
                    <div class="followup-row-main">
                        <div class="followup-row-summary">
                            <div class="followup-row-title">${escapeHtml(item.userName || 'Customer')} • ${escapeHtml(item.title || 'Needs follow-up')}</div>
                            <div class="followup-row-type">${escapeHtml(item.rentalType || 'Booking')}</div>
                            <div class="followup-row-schedule">${escapeHtml(buildFollowupSchedule(item))}</div>
                            <div class="followup-row-badges">
                                ${dueAmount > 0 ? `<span class="status-badge">Due ₹${escapeHtml(String(dueAmount))}</span>` : ''}
                            </div>
                        </div>
                        <div class="followup-row-actions">
                            ${callHref
                                ? `<a class="followup-action" href="${callHref}">Call</a>`
                                : ''}
                            ${whatsappHref
                                ? `<a class="followup-action" href="${whatsappHref}" target="_blank" rel="noopener noreferrer">WhatsApp</a>`
                                : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <section class="followup-queue-card">
                <div class="followup-queue-header">
                    <div>
                        <h3>Follow-up Queue</h3>
                        <p>Bookings that need approval, payment follow-up, or quick action.</p>
                    </div>
                    <span>${items.length} item${items.length === 1 ? '' : 's'}</span>
                </div>
                ${rows}
            </section>
        `;
    };

    const renderFollowupQueue = (queue = []) => {
        const container = document.getElementById('followupQueueContainer');
        if (!container) return;
        container.innerHTML = buildFollowupQueueMarkup(queue);
    };

    const setOutstandingState = (value) => {
        const card = document.querySelector('.stat-card-outstanding');
        if (!card) return;

        const amount = Number(value);
        card.classList.toggle('is-clear', Number.isFinite(amount) && amount <= 0);
    };

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    };

    const setKpiTone = (id, tone) => {
        const valueEl = document.getElementById(id);
        const card = valueEl?.closest('.stat-card');
        if (!card) return;

        KPI_TONE_CLASSES.forEach((className) => card.classList.remove(className));
        if (!tone) return;
        card.classList.add(`kpi-tone-${tone}`);
    };

    const clearAllKpiTones = () => {
        document.querySelectorAll('.kpi-rows .stat-card').forEach((card) => {
            KPI_TONE_CLASSES.forEach((className) => card.classList.remove(className));
        });
    };

    const toNumber = (value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const formatPercent = (value) => `${toNumber(value).toFixed(1)}%`;

    const applyKpiTones = (stats = {}) => {
        const totalBookings = toNumber(stats.totalBookings);
        const confirmedBookings = toNumber(stats.confirmedBookings);
        const pendingBookings = toNumber(stats.pendingBookings);
        const monthlyRevenue = toNumber(stats.thisMonthRevenue);
        const lastMonthRevenue = toNumber(stats.lastMonthRevenue);
        const roomUtilizationPct = toNumber(stats.roomUtilizationPct);
        const revenueGrowthPct = toNumber(stats.revenueGrowthPct);
        const newCustomers = toNumber(stats.newCustomers);
        const repeatCustomers = toNumber(stats.repeatCustomers);
        const upcomingSessions = toNumber(stats.upcomingSessions);
        const cancellations = toNumber(stats.cancellations);
        const avgBookingDuration = toNumber(stats.avgBookingDuration);
        const confirmationRate = totalBookings > 0 ? (confirmedBookings / totalBookings) * 100 : 0;

        setKpiTone('totalBookings', totalBookings >= 10 ? 'good' : totalBookings > 0 ? 'neutral' : 'warn');
        setKpiTone('confirmedBookings', confirmationRate >= 70 ? 'good' : confirmationRate >= 45 ? 'warn' : 'bad');
        setKpiTone('monthlyRevenue', monthlyRevenue >= lastMonthRevenue && monthlyRevenue > 0 ? 'good' : monthlyRevenue > 0 ? 'warn' : 'bad');

        if (roomUtilizationPct >= 50 && roomUtilizationPct <= 85) {
            setKpiTone('roomUtilizationPct', 'good');
        } else if ((roomUtilizationPct >= 30 && roomUtilizationPct < 50) || (roomUtilizationPct > 85 && roomUtilizationPct <= 95)) {
            setKpiTone('roomUtilizationPct', 'warn');
        } else {
            setKpiTone('roomUtilizationPct', 'bad');
        }

        setKpiTone('revenueGrowthPct', revenueGrowthPct >= 10 ? 'good' : revenueGrowthPct >= 0 ? 'warn' : 'bad');
        setKpiTone('newCustomers', newCustomers >= 5 ? 'good' : newCustomers >= 2 ? 'warn' : 'neutral');
        setKpiTone('repeatCustomers', repeatCustomers >= 10 ? 'good' : repeatCustomers >= 4 ? 'warn' : 'neutral');
        setKpiTone('upcomingSessions', upcomingSessions >= 5 ? 'good' : upcomingSessions >= 1 ? 'warn' : 'bad');
        setKpiTone('pendingBookings', pendingBookings === 0 ? 'good' : pendingBookings <= 5 ? 'warn' : 'bad');
        setKpiTone('cancellations', cancellations === 0 ? 'good' : cancellations <= 3 ? 'warn' : 'bad');

        if (avgBookingDuration >= 1 && avgBookingDuration <= 4) {
            setKpiTone('avgBookingDuration', 'good');
        } else if (avgBookingDuration > 0) {
            setKpiTone('avgBookingDuration', 'warn');
        } else {
            setKpiTone('avgBookingDuration', 'bad');
        }
    };

    const setStatLoadingState = (isLoading) => {
        STAT_IDS.forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;

            if (isLoading) {
                el.classList.add('stat-number-loading');
                el.textContent = 'Loading...';
            } else {
                el.classList.remove('stat-number-loading');
            }
        });

        if (isLoading) {
            clearAllKpiTones();
        }
    };

    const renderStats = (stats = {}) => {
        setStatLoadingState(false);
        setText('totalBookings', stats.totalBookings ?? 0);
        setText('confirmedBookings', stats.confirmedBookings ?? 0);
        setText('monthlyRevenue', `₹${stats.thisMonthRevenue ?? 0}`);
        setText('totalUnpaidAmount', `₹${stats.totalUnpaidAmount ?? 0}`);
        setText('roomUtilizationPct', formatPercent(stats.roomUtilizationPct ?? 0));
        setText('revenueGrowthPct', formatPercent(stats.revenueGrowthPct ?? 0));
        setText('newCustomers', stats.newCustomers ?? 0);
        setText('repeatCustomers', stats.repeatCustomers ?? 0);
        setText('upcomingSessions', stats.upcomingSessions ?? 0);
        setText('pendingBookings', stats.pendingBookings ?? 0);
        setText('cancellations', stats.cancellations ?? 0);
        setText('avgBookingDuration', `${toNumber(stats.avgBookingDuration ?? 0).toFixed(1)}h`);
        setOutstandingState(stats.totalUnpaidAmount ?? 0);
        applyKpiTones(stats);
        renderFollowupQueue(stats.followupQueue || []);
    };

    const renderStatsUnavailable = () => {
        setStatLoadingState(false);
        setText('totalBookings', 'N/A');
        setText('confirmedBookings', 'N/A');
        setText('monthlyRevenue', 'N/A');
        setText('totalUnpaidAmount', 'N/A');
        setText('roomUtilizationPct', 'N/A');
        setText('revenueGrowthPct', 'N/A');
        setText('newCustomers', 'N/A');
        setText('repeatCustomers', 'N/A');
        setText('upcomingSessions', 'N/A');
        setText('pendingBookings', 'N/A');
        setText('cancellations', 'N/A');
        setText('avgBookingDuration', 'N/A');
        setOutstandingState(null);
        clearAllKpiTones();
        renderFollowupQueue([]);
    };

    const loadStats = async ({ apiUrl }) => {
        setStatLoadingState(true);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${apiUrl}/api/admin/stats`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load stats');
            }

            const data = await res.json();
            renderStats(data.stats || {});
            return data.stats || null;
        } catch (error) {
            console.error('Failed to load stats:', error);
            renderStatsUnavailable();
            return null;
        }
    };

    window.AdminDashboard = window.AdminDashboard || {};
    window.AdminDashboard.openFollowupBooking = (bookingId) => {
        if (typeof window.switchTab === 'function') {
            window.switchTab('bookings');
        }

        if (typeof window.openBookingDetailsModal === 'function') {
            window.openBookingDetailsModal(bookingId);
        }
    };
    window.AdminDashboard.loadStats = loadStats;
})();
