/**
 * Admin dashboard module.
 * Handles top-level admin stats loading and rendering.
 */

(() => {
    const STAT_IDS = ['totalBookings', 'pendingBookings', 'confirmedBookings', 'totalRevenue'];

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
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
    };

    const renderStats = (stats = {}) => {
        setStatLoadingState(false);
        setText('totalBookings', stats.totalBookings ?? 0);
        setText('pendingBookings', stats.pendingBookings ?? 0);
        setText('confirmedBookings', stats.confirmedBookings ?? 0);
        setText('totalRevenue', `₹${stats.totalRevenue ?? 0}`);
    };

    const renderStatsUnavailable = () => {
        setStatLoadingState(false);
        setText('totalBookings', 'N/A');
        setText('pendingBookings', 'N/A');
        setText('confirmedBookings', 'N/A');
        setText('totalRevenue', 'N/A');
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
