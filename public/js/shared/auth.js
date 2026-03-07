/**
 * JamRoom Authentication Module
 * Handles user authentication, navigation updates, and session management
 */

class AuthManager {
    constructor(options = {}) {
        this.options = {
            apiUrl: window.location.origin,
            loginUrl: '/login.html',
            onAuthChange: null,
            autoInit: true,
            ...options
        };
        
        this.currentUser = null;
        this.isAuthenticated = false;
        this.isAdmin = false;
        
        if (this.options.autoInit) {
            this.init();
        }
    }

    /**
     * Initialize authentication check
     */
    async init() {
        try {
            await this.checkAuthStatus();
            this.updateNavigation();
        } catch (error) {
            console.error('AuthManager: Initialization failed', error);
        }
    }

    /**
     * Check current authentication status
     */
    async checkAuthStatus() {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json'
            };

            // Support token-based auth used by current backend/routes.
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }

            const response = await fetch(`${this.options.apiUrl}/api/auth/me`, {
                method: 'GET',
                headers,
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                this.setUserData(data.user);
                return data.user;
            } else {
                this.clearUserData();
                return null;
            }
        } catch (error) {
            const isAbortLike = error && (
                error.name === 'AbortError' ||
                (typeof error.message === 'string' && /aborted|failed to fetch/i.test(error.message))
            );

            // Rapid page transitions can cancel in-flight auth checks; avoid false logout noise.
            if (isAbortLike) {
                console.debug('AuthManager: Auth check request interrupted during navigation');
                return this.currentUser;
            }

            console.error('AuthManager: Auth check failed', error);
            this.clearUserData();
            return null;
        }
    }

    /**
     * Set user data and authentication state
     */
    setUserData(user) {
        this.currentUser = user;
        this.isAuthenticated = !!user;
        this.isAdmin = !!(user && (user.isAdmin || user.role === 'admin'));
        
        // Store in localStorage for quick access
        if (user) {
            localStorage.setItem('jamroom_user', JSON.stringify(user));
            localStorage.setItem('jamroom_auth', 'true');
            localStorage.setItem('jamroom_admin', this.isAdmin ? 'true' : 'false');
        }
        
        // Trigger callback
        if (this.options.onAuthChange && typeof this.options.onAuthChange === 'function') {
            this.options.onAuthChange(user, this.isAuthenticated, this.isAdmin);
        }

        // Trigger custom event
        const event = new CustomEvent('authchange', {
            detail: { user, isAuthenticated: this.isAuthenticated, isAdmin: this.isAdmin }
        });
        document.dispatchEvent(event);
    }

    /**
     * Clear user data and authentication state
     */
    clearUserData() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.isAdmin = false;
        
        // Clear localStorage
        localStorage.removeItem('jamroom_user');
        localStorage.removeItem('jamroom_auth');
        localStorage.removeItem('jamroom_admin');
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        
        // Trigger callbacks
        if (this.options.onAuthChange && typeof this.options.onAuthChange === 'function') {
            this.options.onAuthChange(null, false, false);
        }

        // Trigger custom event
        const event = new CustomEvent('authchange', {
            detail: { user: null, isAuthenticated: false, isAdmin: false }
        });
        document.dispatchEvent(event);
    }

    /**
     * Update navigation based on authentication state
     */
    updateNavigation() {
        // Common element selectors
        const elements = {
            userName: document.getElementById('userName'),
            adminName: document.getElementById('adminName'),
            loginLink: document.getElementById('loginLink'),
            registerLink: document.getElementById('registerLink'),
            logoutBtn: document.getElementById('logoutBtn'),
            bookingLink: document.getElementById('bookingLink'),
            accountLink: document.getElementById('accountLink'),
            adminLink: document.getElementById('adminLink')
        };

        if (this.isAuthenticated && this.currentUser) {
            // Show authenticated state
            const displayName = this.currentUser.name || 'User';
            
            // Update user name displays
            if (elements.userName) {
                elements.userName.textContent = `Welcome, ${displayName}`;
                elements.userName.classList.remove('hidden');
            }
            
            if (elements.adminName) {
                elements.adminName.textContent = `Welcome, ${displayName}`;
            }

            // Show authenticated links
            this.showElement(elements.logoutBtn);
            this.showElement(elements.bookingLink);
            this.showElement(elements.accountLink);
            
            // Hide guest links
            this.hideElement(elements.loginLink);
            this.hideElement(elements.registerLink);
            
            // Show admin link only for admins
            if (this.isAdmin) {
                this.showElement(elements.adminLink);
            } else {
                this.hideElement(elements.adminLink);
            }
            
        } else {
            // Show guest state
            this.hideElement(elements.userName);
            this.hideElement(elements.logoutBtn);
            this.hideElement(elements.bookingLink);
            this.hideElement(elements.accountLink);
            this.hideElement(elements.adminLink);
            
            this.showElement(elements.loginLink);
            this.showElement(elements.registerLink);
        }
        
        // Setup logout button
        if (elements.logoutBtn && !elements.logoutBtn.hasAttribute('data-auth-setup')) {
            elements.logoutBtn.addEventListener('click', () => this.logout());
            elements.logoutBtn.setAttribute('data-auth-setup', 'true');
        }
    }

    /**
     * Utility method to show element
     */
    showElement(element) {
        if (element) {
            element.classList.remove('hidden');
            element.style.display = '';
        }
    }

    /**
     * Utility method to hide element
     */
    hideElement(element) {
        if (element) {
            element.classList.add('hidden');
        }
    }

    /**
     * Login user
     */
    async login(email, password) {
        try {
            const response = await fetch(`${this.options.apiUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.setUserData(data.user);
                this.updateNavigation();
                return { success: true, user: data.user };
            } else {
                return { success: false, message: data.message || 'Login failed' };
            }
        } catch (error) {
            console.error('AuthManager: Login failed', error);
            return { success: false, message: 'Network error occurred' };
        }
    }

    /**
     * Logout user
     */
    async logout() {
        try {
            const response = await fetch(`${this.options.apiUrl}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            // Clear user data regardless of response
            this.clearUserData();
            this.updateNavigation();
            
            // Redirect to login if not on public pages
            const publicPages = ['/', '/index.html', '/login.html', '/register.html'];
            const currentPath = window.location.pathname;
            
            if (!publicPages.includes(currentPath)) {
                window.location.href = this.options.loginUrl;
            }

            return { success: true };
        } catch (error) {
            console.error('AuthManager: Logout failed', error);
            // Still clear local data even if server request failed
            this.clearUserData();
            this.updateNavigation();
            return { success: false, message: 'Logout request failed, but local session cleared' };
        }
    }

    /**
     * Register new user
     */
    async register(userData) {
        try {
            const response = await fetch(`${this.options.apiUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(userData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                this.setUserData(data.user);
                this.updateNavigation();
                return { success: true, user: data.user };
            } else {
                return { success: false, message: data.message || 'Registration failed' };
            }
        } catch (error) {
            console.error('AuthManager: Registration failed', error);
            return { success: false, message: 'Network error occurred' };
        }
    }

    /**
     * Require authentication (redirect if not authenticated)
     */
    requireAuth() {
        if (!this.isAuthenticated) {
            const currentUrl = encodeURIComponent(window.location.href);
            window.location.href = `${this.options.loginUrl}?redirect=${currentUrl}`;
            return false;
        }
        return true;
    }

    /**
     * Require admin privileges
     */
    requireAdmin() {
        if (!this.isAuthenticated) {
            this.requireAuth();
            return false;
        }
        
        if (!this.isAdmin) {
            alert('Admin access required');
            window.location.href = '/';
            return false;
        }
        
        return true;
    }

    /**
     * Get current user
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Check if user is authenticated
     */
    isLoggedIn() {
        return this.isAuthenticated;
    }

    /**
     * Check if user is admin
     */
    isAdminUser() {
        return this.isAdmin;
    }

    /**
     * Force refresh authentication status
     */
    async refresh() {
        return await this.checkAuthStatus();
    }
}

/**
 * Utility functions for quick access
 */
const AuthUtils = {
    /**
     * Quick check if user is logged in (from localStorage)
     */
    isQuickLoggedIn() {
        return localStorage.getItem('jamroom_auth') === 'true';
    },

    /**
     * Quick check if user is admin (from localStorage)
     */
    isQuickAdmin() {
        return localStorage.getItem('jamroom_admin') === 'true';
    },

    /**
     * Get stored user data (from localStorage)
     */
    getStoredUser() {
        const userData = localStorage.getItem('jamroom_user');
        return userData ? JSON.parse(userData) : null;
    },

    /**
     * Clear all auth data
     */
    clearAuthData() {
        localStorage.removeItem('jamroom_user');
        localStorage.removeItem('jamroom_auth');
        localStorage.removeItem('jamroom_admin');
    }
};

/**
 * Global instance for convenience
 */
let globalAuthManager = null;

/**
 * Get or create global auth manager instance
 */
function getAuthManager(options = {}) {
    if (!globalAuthManager) {
        globalAuthManager = new AuthManager(options);
    }
    return globalAuthManager;
}

/**
 * Legacy function support
 */
window.checkAuth = async function() {
    const authManager = getAuthManager();
    await authManager.checkAuthStatus();
    authManager.updateNavigation();
};

/**
 * Auto-initialize on DOM ready
 */
document.addEventListener('DOMContentLoaded', function() {
    // Only auto-initialize if there are auth-related elements on the page
    const hasAuthElements = !!(
        document.getElementById('userName') ||
        document.getElementById('loginLink') ||
        document.getElementById('logoutBtn') ||
        document.querySelector('[data-auth]')
    );
    
    if (hasAuthElements) {
        getAuthManager();
    }
});

// Make available globally
window.AuthManager = AuthManager;
window.AuthUtils = AuthUtils;
window.getAuthManager = getAuthManager;

console.log('🔐 auth.js: Authentication manager loaded');