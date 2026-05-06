(() => {
    let myBookingsData = [];
    let hasClassBookingHistory = false;
    let activeTab = 'bookings';

    const fetchMyBookingsData = async () => {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/bookings/my-bookings', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data?.message || 'Failed to load bookings');
        }

        return Array.isArray(data.bookings) ? data.bookings : [];
    };

    const setActiveTab = async (tabName) => {
        activeTab = tabName === 'tracker' ? 'tracker' : 'bookings';

        const bookingsTabButton = document.getElementById('myBookingsTabButton');
        const trackerTabButton = document.getElementById('lessonTrackerTabButton');
        const bookingsPanel = document.getElementById('myBookingsTabPanel');
        const trackerPanel = document.getElementById('lessonTrackerTabPanel');

        if (bookingsTabButton) {
            const isActive = activeTab === 'bookings';
            bookingsTabButton.classList.toggle('active', isActive);
            bookingsTabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }

        if (trackerTabButton) {
            const isActive = activeTab === 'tracker';
            trackerTabButton.classList.toggle('active', isActive);
            trackerTabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }

        if (bookingsPanel) {
            const isActive = activeTab === 'bookings';
            bookingsPanel.classList.toggle('active', isActive);
            bookingsPanel.hidden = !isActive;
        }

        if (trackerPanel) {
            const isActive = activeTab === 'tracker';
            trackerPanel.classList.toggle('active', isActive);
            trackerPanel.hidden = !isActive;
        }

        if (typeof window.loadMyBookings === 'function') {
            await window.loadMyBookings({
                allBookings: myBookingsData,
                classOnly: activeTab === 'tracker',
                trackerMode: activeTab === 'tracker',
                loadingElementId: activeTab === 'tracker' ? 'lessonTrackerLoading' : 'bookingsLoading',
                bookingsElementId: activeTab === 'tracker' ? 'lessonTrackerList' : 'bookingsList'
            });
        }
    };

    const bindTabs = () => {
        const bookingsTabButton = document.getElementById('myBookingsTabButton');
        const trackerTabButton = document.getElementById('lessonTrackerTabButton');

        if (bookingsTabButton) {
            bookingsTabButton.addEventListener('click', () => {
                setActiveTab('bookings').catch((error) => {
                    console.error('Failed to switch to bookings tab:', error);
                });
            });
        }

        if (trackerTabButton) {
            trackerTabButton.addEventListener('click', () => {
                setActiveTab('tracker').catch((error) => {
                    console.error('Failed to switch to tracker tab:', error);
                });
            });
        }
    };

    const refreshMyBookingsPage = async () => {
        myBookingsData = await fetchMyBookingsData();
        hasClassBookingHistory = myBookingsData.some((entry) => entry?.classSession?.isClassBooking);

        const trackerTabButton = document.getElementById('lessonTrackerTabButton');
        const trackerPanel = document.getElementById('lessonTrackerTabPanel');
        if (trackerTabButton) {
            trackerTabButton.hidden = !hasClassBookingHistory;
        }

        if (!hasClassBookingHistory && trackerPanel) {
            trackerPanel.hidden = true;
            if (activeTab === 'tracker') {
                activeTab = 'bookings';
            }
        }

        await setActiveTab(activeTab);
    };

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

            bindTabs();
            window.refreshMyBookingsPage = refreshMyBookingsPage;
            await refreshMyBookingsPage();
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
