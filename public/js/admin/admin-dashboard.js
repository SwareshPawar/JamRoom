/**
 * Admin dashboard module.
 * Handles top-level admin stats loading and rendering.
 */

(() => {
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    };

    const renderStats = (stats = {}) => {
        setText('totalBookings', stats.totalBookings ?? 0);
        setText('pendingBookings', stats.pendingBookings ?? 0);
        setText('confirmedBookings', stats.confirmedBookings ?? 0);
        setText('totalRevenue', `₹${stats.totalRevenue ?? 0}`);
    };

    const loadStats = async ({ apiUrl }) => {
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
            return null;
        }
    };

    window.AdminDashboard = window.AdminDashboard || {};
    window.AdminDashboard.loadStats = loadStats;
})();
