/**
 * Booking auth/bootstrap module.
 * Keeps page init + auth checks separate from booking business logic.
 */

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize shared modules
    if (window.AuthManager) {
        window.authManager = new AuthManager();
    }

    // Check authentication and load initial data
    initializeBookingPage();

    // Setup logout handler after NavigationManager renders (it creates navLogoutBtn)
    setTimeout(() => {
        const logoutBtn = document.getElementById('navLogoutBtn') || document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                if (window.authManager) {
                    const result = await window.authManager.logout();
                    if (result.success) {
                        window.location.href = '/login.html';
                    }
                } else {
                    // Fallback
                    localStorage.removeItem('token');
                    window.location.href = '/login.html';
                }
            });
        }
    }, 200);
});

// Initialize booking page
async function initializeBookingPage() {
    try {
        // Check authentication
        const authResult = await checkAuth();
        if (!authResult) return;

        // Load settings and bookings
        await loadSettings();

        if (typeof window.restoreBookingFormDraft === 'function') {
            await window.restoreBookingFormDraft();
        }

        await loadMyBookings();

    } catch (error) {
        console.error('Failed to initialize booking page:', error);
        showAlert('Failed to initialize page. Please refresh.', 'error');
    }
}

// Authentication check using shared AuthManager
async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }

    try {
        let user;
        if (window.authManager) {
            user = await window.authManager.checkAuthStatus();
        } else {
            // Fallback to direct API call
            const res = await fetch(`${API_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Not authenticated');
            const data = await res.json();
            user = data.user;
        }

        if (user) {
            currentUser = user;

            // Initialize and render NavigationManager with user data
            window.NavigationManager.init(currentUser);
            window.NavigationManager.updateAuth(currentUser);
            window.NavigationManager.render('navigationContainer');

            return true;
        }

        throw new Error('Authentication failed');

    } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('token');
        window.location.href = '/login.html';
        return false;
    }
}

// Expose for cross-file calls.
window.initializeBookingPage = initializeBookingPage;
window.checkAuth = checkAuth;
