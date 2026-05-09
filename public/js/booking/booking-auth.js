/**
 * Booking auth/bootstrap module.
 * Keeps page init + auth checks separate from booking business logic.
 */

const BOOKING_SCRIPT_DEPENDENCIES = [
    {
        src: '/js/booking/booking-pricing.js',
        isReady: () => typeof window.updatePriceDisplay === 'function'
    },
    {
        src: '/js/booking/booking-rentals.js',
        isReady: () => typeof window.loadSettings === 'function'
    },
    {
        src: '/js/booking/booking-form.js',
        isReady: () => typeof window.initBookingFormHandlers === 'function'
    }
];

const appendScriptTag = (src) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.body.appendChild(script);
    });
};

const reloadScriptWithRetry = async (src, retries = 2) => {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const cacheBypassSrc = `${src}${src.includes('?') ? '&' : '?'}retry=${Date.now()}-${attempt}`;
        try {
            if (window.LazyLoader && typeof window.LazyLoader.loadScript === 'function') {
                await window.LazyLoader.loadScript(cacheBypassSrc, { async: true });
            } else {
                await appendScriptTag(cacheBypassSrc);
            }
            return;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error(`Unable to load dependency script: ${src}`);
};

const ensureBookingDependenciesLoaded = async () => {
    for (const dependency of BOOKING_SCRIPT_DEPENDENCIES) {
        if (dependency.isReady()) {
            continue;
        }

        await reloadScriptWithRetry(dependency.src, 2);

        if (!dependency.isReady()) {
            throw new Error(`Dependency did not initialize after load: ${dependency.src}`);
        }
    }
};

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
    // Show loading placeholder in navigation before auth check
    if (window.NavigationManager) {
        window.NavigationManager.showLoadingPlaceholder('navigationContainer');
    }

    // Use the unified JamRoomUtils loader (same style as nav 'Navigating...' overlay)
    if (window.JamRoomUtils) {
        window.JamRoomUtils.showLoading('Navigating...');
    } else {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.add('show');
    }

    try {
        // Check authentication
        const authResult = await checkAuth();
        if (!authResult) return;

        await ensureBookingDependenciesLoaded();

        // Load settings (fetches catalog/rental config)
        if (typeof window.loadSettings !== 'function') {
            throw new Error('Booking settings module is unavailable (window.loadSettings missing)');
        }
        await window.loadSettings();

        if (typeof window.restoreBookingFormDraft === 'function') {
            await window.restoreBookingFormDraft();
        }

        if (typeof window.loadMyBookings === 'function') {
            await window.loadMyBookings();
        }

    } catch (error) {
        console.error('Failed to initialize booking page:', error);
        showAlert('Failed to initialize page. Please refresh.', 'error');
    } finally {
        // Hide loader (both unified and fallback static overlay)
        if (window.JamRoomUtils) {
            window.JamRoomUtils.hideLoading();
        }
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('show');
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

        // Null user from AuthManager means auth failed (401) or network error
        // AuthManager already cleared the token for 401; for network errors, preserve it
        const stillHasToken = !!localStorage.getItem('token');
        if (!stillHasToken) {
            // Token was cleared by AuthManager (401 response) — redirect to login
            window.location.href = '/login.html';
            return false;
        }

        // Network/abort error but token still intact — redirect to login without clearing token
        // so the next page load can try again with the still-valid token
        window.location.href = '/login.html';
        return false;

    } catch (error) {
        console.error('Auth check failed:', error);
        // Only remove token if it was an explicit auth rejection
        const token = localStorage.getItem('token');
        if (token) {
            // Token still present — likely a code error, not an auth error; preserve token
            window.location.href = '/login.html';
        } else {
            window.location.href = '/login.html';
        }
        return false;
    }
}

// Expose for cross-file calls.
window.initializeBookingPage = initializeBookingPage;
window.checkAuth = checkAuth;
