/**
 * NavigationManager - Unified Navigation System for JamRoom
 * 
 * Features:
 * - Consistent navigation across all pages
 * - Context-aware link visibility
 * - Role-based access control
 * - Automated current page detection
 * - Responsive navigation layout
 */

class NavigationManager {
    constructor() {
        this.currentPage = this.detectCurrentPage();
        this.user = null;
        this.isAuthenticated = false;
        this.hasRendered = false;
        this.bootstrapFallbackTimer = null;
        
        console.log(`🧭 NavigationManager: Detected page '${this.currentPage}'`);
    }

    clearBootstrapFallbackTimer() {
        if (this.bootstrapFallbackTimer) {
            clearTimeout(this.bootstrapFallbackTimer);
            this.bootstrapFallbackTimer = null;
        }
    }

    scheduleGuestFallback(containerId = 'navigationContainer', delayMs = 1400) {
        this.clearBootstrapFallbackTimer();

        this.bootstrapFallbackTimer = setTimeout(() => {
            const container = document.getElementById(containerId);
            if (!container) return;

            const hasOnlyLoadingShell =
                container.children.length === 1 &&
                !!container.querySelector('.nav-loading-shell');
            const isEmpty = container.childElementCount === 0 && !String(container.textContent || '').trim();

            if ((hasOnlyLoadingShell || isEmpty) && !this.hasRendered) {
                this.init(null);
                this.render(containerId);
                console.warn('🧭 NavigationManager: Fallback rendered guest menu after delayed initialization');
            }
        }, delayMs);
    }

    /**
     * Detect current page from URL
     */
    detectCurrentPage() {
        const path = window.location.pathname;
        if (path === '/' || path === '/index.html') return 'home';
        if (path === '/booking.html') return 'booking';
        if (path === '/admin.html') return 'admin';
        if (path === '/account.html') return 'account';
        if (path === '/payment-info.html') return 'payment';
        if (path === '/login.html') return 'login';
        if (path === '/register.html') return 'register';
        if (path === '/reset-password.html') return 'reset-password';
        return 'unknown';
    }

    isCurrentHref(href) {
        const current = window.location.pathname === '/index.html' ? '/' : window.location.pathname;
        const target = href === '/index.html' ? '/' : href;
        return current === target;
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Initialize navigation system
     */
    init(user = null) {
        this.user = user;
        this.isAuthenticated = !!user;
        console.log(`🧭 NavigationManager: Initialized for ${this.isAuthenticated ? user.role : 'guest'} user`);
    }

    /**
     * Update authentication state
     */
    updateAuth(user, containerId = null) {
        this.user = user;
        this.isAuthenticated = !!user;

        // Prefer explicit navigation container when present to avoid noisy auto-detect logs.
        if (containerId) {
            this.render(containerId);
            return;
        }

        const defaultContainer = document.getElementById('navigationContainer');
        if (defaultContainer) {
            this.render('navigationContainer');
            return;
        }

        this.render();
    }

    /**
     * Generate main navigation links based on context
     */
    getMainLinks() {
        const links = [];

        links.push({
            href: '/',
            text: '🏠 Home',
            class: `nav-link ${this.isCurrentHref('/') ? 'active' : ''}`.trim(),
            id: 'homeNavLink'
        });

        links.push({
            href: '/booking.html',
            text: '📅 Book Now',
            class: `nav-link ${this.isCurrentHref('/booking.html') ? 'active' : ''}`.trim(),
            id: 'bookingNavLink'
        });

        links.push({
            href: '/payment-info.html',
            text: '💳 Payment Info',
            class: `nav-link ${this.isCurrentHref('/payment-info.html') ? 'active' : ''}`.trim(),
            id: 'paymentNavLink'
        });

        if (this.isAuthenticated) {
            links.push({
                href: '/account.html',
                text: '👤 My Account',
                class: `nav-link ${this.isCurrentHref('/account.html') ? 'active' : ''}`.trim(),
                id: 'accountNavLink'
            });
        }

        if (this.isAuthenticated && this.user?.role === 'admin') {
            links.push({
                href: '/admin.html',
                text: '🎛️ Admin Panel',
                class: `nav-link ${this.isCurrentHref('/admin.html') ? 'active' : ''}`.trim(),
                id: 'adminNavLink'
            });
        }

        return links;
    }

    /**
     * Generate user info section
     */
    getHeaderActions() {
        const actions = [];

        if (this.isAuthenticated) {
            actions.push({
                type: 'button',
                text: '🚪 Logout',
                onclick: 'NavigationManager.logout()',
                class: 'btn btn-danger',
                id: 'navLogoutBtn'
            });

            if (
                this.user?.role === 'admin' &&
                (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ) {
                actions.push({
                    type: 'link',
                    href: '/test.html',
                    text: '🧪 Tests',
                    class: 'btn btn-warning btn-sm',
                    id: 'testNavLink'
                });
            }
        } else {
            actions.push({
                type: 'link',
                href: '/login.html',
                text: 'Login',
                class: 'btn btn-primary',
                id: 'loginNavLink'
            });
            actions.push({
                type: 'link',
                href: '/register.html',
                text: 'Register',
                class: 'btn btn-secondary',
                id: 'registerNavLink'
            });
        }

        return actions;
    }

    getThemeToggleText() {
        if (window.ThemeManager && typeof window.ThemeManager.getCurrentTheme === 'function') {
            return window.ThemeManager.getCurrentTheme() === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
        return 'Dark Mode';
    }

    refreshThemeToggleLabels() {
        if (window.ThemeManager && typeof window.ThemeManager.updateToggleButtons === 'function') {
            window.ThemeManager.updateToggleButtons();
            return;
        }

        const text = this.getThemeToggleText();
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.textContent = text;
        });
    }

    generateLoadingHTML() {
        return `
            <div class="nav-loading-shell" role="status" aria-live="polite">
                <span class="nav-loading-spinner" aria-hidden="true"></span>
                <span>Loading menu...</span>
            </div>`;
    }

    showLoadingPlaceholder(containerId = 'navigationContainer') {
        const container = document.getElementById(containerId);
        if (!container || container.childElementCount > 0) {
            return;
        }

        container.innerHTML = this.generateLoadingHTML();
    }

    /**
     * Generate navigation HTML
     */
    generateHTML() {
        const mainLinks = this.getMainLinks();
        const headerActions = this.getHeaderActions();
        const displayName = this.isAuthenticated
            ? this.escapeHtml(this.user?.name || this.user?.email || 'User')
            : '';
        const greetingHtml = this.isAuthenticated
            ? `<p class="app-greeting">Hi, ${displayName}</p>`
            : '';

        // Generate main links HTML
        const mainLinksHTML = mainLinks.map(link => 
            `<a href="${link.href}" class="${link.class}" id="${link.id}">${link.text}</a>`
        ).join('\n                ');

        // Generate header actions HTML
        const headerActionsHTML = headerActions.map(item => {
            switch (item.type) {
                case 'button':
                    return `<button onclick="${item.onclick}" class="${item.class}" id="${item.id}" ${item.attrs || ''}>${item.text}</button>`;
                case 'link':
                    return `<a href="${item.href}" class="${item.class}" id="${item.id}" ${item.attrs || ''}>${item.text}</a>`;
                default:
                    return '';
            }
        }).join('\n                ');

        return `
            <div class="app-header">
                <div class="app-brand">
                    <h1>🎸Swar JamRoom & Music Studio</h1>
                    ${greetingHtml}
                </div>
                <div class="app-header-actions">
                    ${headerActionsHTML}
                </div>
            </div>
            <div class="main-nav" role="navigation" aria-label="Primary navigation">
                <div class="nav-links">
                    ${mainLinksHTML}
                </div>
            </div>`;
    }

    /**
     * Render navigation to DOM
     */
    render(containerId = null) {
        const navHTML = this.generateHTML();
        
        if (containerId) {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = navHTML;
                this.hasRendered = true;
                this.clearBootstrapFallbackTimer();
                this.refreshThemeToggleLabels();
                document.dispatchEvent(new CustomEvent('jamroom:navigation-rendered'));
                console.log(`🧭 NavigationManager: Rendered navigation for ${this.currentPage} page`);
                return;
            }

            // Fall through to auto-detect if requested container is missing.
            console.warn(`🧭 NavigationManager: Container '${containerId}' not found, using auto-detect`);
        }

        // Auto-detect navigation container
        const containers = [
            document.getElementById('navigationContainer'),
            document.querySelector('.topbar'),
            document.querySelector('.app-header'),
            document.querySelector('header'),
            document.querySelector('.header'),
            document.querySelector('nav')
        ].filter(el => el !== null);

        if (containers.length > 0) {
            const target = containers[0];

            // If we found a dedicated container, render directly into it.
            if (target.id === 'navigationContainer') {
                target.innerHTML = navHTML;
            } else {
                const mainContainer = target.parentElement;
                if (mainContainer) {
                    mainContainer.innerHTML = navHTML;
                }
            }

            this.hasRendered = true;
            this.clearBootstrapFallbackTimer();
        } else {
            console.warn('🧭 NavigationManager: No navigation container found');
        }

        this.refreshThemeToggleLabels();

        document.dispatchEvent(new CustomEvent('jamroom:navigation-rendered'));

        console.log(`🧭 NavigationManager: Rendered navigation for ${this.currentPage} page`);
    }

    static toggleTheme() {
        if (window.ThemeManager && typeof window.ThemeManager.toggleTheme === 'function') {
            window.ThemeManager.toggleTheme();
            if (window.NavigationManager && typeof window.NavigationManager.refreshThemeToggleLabels === 'function') {
                window.NavigationManager.refreshThemeToggleLabels();
            }
        }
    }

    /**
     * Logout function
     */
    static logout() {
        // Use shared AuthManager if available
        if (window.AuthManager) {
            window.AuthManager.logout();
        } else {
            // Fallback logout
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
        }
    }

    /**
     * Highlight current page in navigation
     */
    highlightCurrentPage() {
        // Remove all active states
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });

        // Add active state to current page
        const currentLink = document.querySelector(`.nav-link[href="${window.location.pathname}"], .nav-link[href="/"]`);
        if (currentLink) {
            currentLink.classList.add('active');
        }
    }

    /**
     * Add navigation event listeners
     */
    addEventListeners() {
        // Handle navigation link clicks
        document.addEventListener('click', (e) => {
            if (e.target.matches('.nav-link, .nav-link *')) {
                const link = e.target.closest('.nav-link');
                if (link) {
                    // Add loading state if needed
                    if (window.JamRoomUtils) {
                        window.JamRoomUtils.showLoading('Navigating...');
                    }
                }
            }
        });
    }

    /**
     * Initialize responsive behavior
     */
    initResponsive() {
        const nav = document.querySelector('.main-nav');
        if (!nav) {
            return;
        }

        const syncMobileState = () => {
            nav.classList.toggle('mobile-nav', window.innerWidth <= 768);
        };

        syncMobileState();
        window.addEventListener('resize', syncMobileState);
    }
}

// Global instance
window.NavigationManager = new NavigationManager();

// Auto-initialization
document.addEventListener('DOMContentLoaded', () => {
    if (window.NavigationManager && typeof window.NavigationManager.showLoadingPlaceholder === 'function') {
        window.NavigationManager.showLoadingPlaceholder('navigationContainer');
        window.NavigationManager.scheduleGuestFallback('navigationContainer', 1400);
    }

    // Initialize responsive behavior
    window.NavigationManager.initResponsive();
    window.NavigationManager.addEventListeners();

    document.addEventListener('jamroom:theme-changed', () => {
        if (window.NavigationManager && typeof window.NavigationManager.refreshThemeToggleLabels === 'function') {
            window.NavigationManager.refreshThemeToggleLabels();
        }
    });
    
    console.log('🧭 NavigationManager: Ready for initialization');
});

window.addEventListener('load', () => {
    if (!window.NavigationManager) return;
    window.NavigationManager.scheduleGuestFallback('navigationContainer', 250);
});

console.log('🧭 navigation.js: Navigation module loaded');
