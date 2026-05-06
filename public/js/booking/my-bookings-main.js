(() => {
    const requireAuthUser = async () => {
        const auth = typeof window.getAuthManager === 'function' ? window.getAuthManager() : null;
        if (!auth || typeof auth.checkAuthStatus !== 'function') {
            return null;
        }

        const user = await auth.checkAuthStatus();
        if (!user) {
            const currentUrl = encodeURIComponent(window.location.href);
            window.location.href = `/login.html?redirect=${currentUrl}`;
            return null;
        }

        if (window.NavigationManager && typeof window.NavigationManager.init === 'function') {
            window.NavigationManager.init(user);
            window.NavigationManager.render('navigationContainer');
        }

        return user;
    };

    const init = async () => {
        if (window.JamRoomUtils) window.JamRoomUtils.showLoading('Navigating...');
        try {
            const user = await requireAuthUser();
            if (!user) return;

            if (typeof window.loadMyBookings === 'function') {
                await window.loadMyBookings();
            }
        } finally {
            if (window.JamRoomUtils) window.JamRoomUtils.hideLoading();
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        init().catch((error) => {
            console.error('Failed to initialize My Bookings page:', error);
            if (typeof window.showAlert === 'function') {
                window.showAlert('Unable to load My Bookings. Please refresh and try again.', 'error');
            }
        });
    });
})();
