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
    window.AdminDashboard.loadStats = loadStats;
})();
