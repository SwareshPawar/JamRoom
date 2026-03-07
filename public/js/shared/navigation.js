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
        
        console.log(`🧭 NavigationManager: Detected page '${this.currentPage}'`);
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
        if (path === '/login.html') return 'login';
        if (path === '/register.html') return 'register';
        return 'unknown';
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

        // Home link (always available, but hidden on home page)
        if (this.currentPage !== 'home') {
            links.push({
                href: '/',
                text: '🏠 Home',
                class: 'btn btn-secondary',
                id: 'homeNavLink'
            });
        }

        // Booking link (available for authenticated users, different text based on page)
        if (this.isAuthenticated) {
            if (this.currentPage !== 'booking') {
                const text = this.currentPage === 'account' ? '📅 New Booking' : '📅 Book Now';
                links.push({
                    href: '/booking.html',
                    text: text,
                    class: this.currentPage === 'account' ? 'btn btn-primary' : 'btn btn-primary',
                    id: 'bookingNavLink'
                });
            }
        }

        // Account link (available for authenticated users, hidden on account page)
        if (this.isAuthenticated && this.currentPage !== 'account') {
            links.push({
                href: '/account.html',
                text: '👤 My Account',
                class: 'btn btn-secondary',
                id: 'accountNavLink'
            });
        }

        // Admin link (only for admin users, hidden on admin page)
        if (this.isAuthenticated && this.user?.role === 'admin' && this.currentPage !== 'admin') {
            links.push({
                href: '/admin.html',
                text: '🎛️ Admin Panel',
                class: 'btn btn-warning',
                id: 'adminNavLink'
            });
        }

        // Additional admin-specific links (only on admin page)
        if (this.currentPage === 'admin' && this.user?.role === 'admin') {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                links.push({
                    href: '/test.html',
                    text: '🧪 Tests',
                    class: 'btn btn-sm btn-warning',
                    id: 'testNavLink'
                });
            }
        }

        return links;
    }

    /**
     * Generate user info section
     */
    getUserInfo() {
        const userInfo = [];

        if (this.isAuthenticated) {
            // User name display
            const displayName = this.user.name || this.user.email || 'User';
            const rolePrefix = this.user.role === 'admin' ? 'Admin: ' : '';
            
            userInfo.push({
                type: 'text',
                content: `${rolePrefix}${displayName}`,
                id: 'userNameDisplay',
                class: 'user-name'
            });

            // Logout button
            userInfo.push({
                type: 'button',
                text: '🚪 Logout',
                onclick: 'NavigationManager.logout()',
                class: 'btn btn-danger',
                id: 'navLogoutBtn'
            });
        } else {
            // Login/Register links (only on home page for guests)
            if (this.currentPage === 'home') {
                userInfo.push({
                    type: 'link',
                    href: '/login.html',
                    text: 'Login',
                    class: 'btn btn-primary',
                    id: 'loginNavLink'
                });
                userInfo.push({
                    type: 'link',
                    href: '/register.html',
                    text: 'Register',
                    class: 'btn btn-secondary',
                    id: 'registerNavLink'
                });
            }
        }

        return userInfo;
    }

    /**
     * Generate navigation HTML
     */
    generateHTML() {
        const mainLinks = this.getMainLinks();
        const userInfo = this.getUserInfo();

        // Choose header style based on page
        const headerClass = this.currentPage === 'admin' ? 'topbar' : 'app-header';
        
        // Page titles
        const pageTitles = {
            home: '🎸Swar JamRoom & Music Studio',
            booking: '🎸 Book Your Jam Session',
            admin: '🎛️ Admin Panel',
            account: '📱 My Account'
        };

        const title = pageTitles[this.currentPage] || 'JamRoom';
        const subtitle = this.currentPage === 'home' ? '<p>Premium Jam Room Rental & Music Production Space</p>' : '';

        // Generate main links HTML
        const mainLinksHTML = mainLinks.map(link => 
            `<a href="${link.href}" class="${link.class}" id="${link.id}">${link.text}</a>`
        ).join('\n                ');

        // Generate user info HTML
        const userInfoHTML = userInfo.map(item => {
            switch (item.type) {
                case 'text':
                    return `<span id="${item.id}" class="${item.class}">${item.content}</span>`;
                case 'button':
                    return `<button onclick="${item.onclick}" class="${item.class}" id="${item.id}">${item.text}</button>`;
                case 'link':
                    return `<a href="${item.href}" class="${item.class}" id="${item.id}">${item.text}</a>`;
                default:
                    return '';
            }
        }).join('\n                ');

        // Return appropriate structure based on page
        if (this.currentPage === 'admin') {
            return `
            <div class="${headerClass}">
                <h1>${title}</h1>
                <div class="nav-links">
                    ${userInfoHTML}
                    ${mainLinksHTML}
                </div>
            </div>`;
        } else if (this.currentPage === 'account') {
            return `
            <div class="${headerClass}">
                <h1>${title}</h1>
                ${subtitle}
                <div class="nav-links">
                    ${mainLinksHTML}
                    ${userInfoHTML}
                </div>
            </div>`;
        } else if (this.currentPage === 'home') {
            return `
            <header class="${headerClass}">
                <h1>${title}</h1>
                ${subtitle}
            </header>
            <nav class="main-nav">
                <div class="nav-links">
                    <a href="/" class="nav-link ${this.currentPage === 'home' ? 'active' : ''}">Home</a>
                    ${mainLinksHTML.replace(/btn btn-/g, 'nav-link ').replace(/class="nav-link primary"/g, 'class="nav-link"').replace(/class="nav-link secondary"/g, 'class="nav-link"').replace(/class="nav-link warning"/g, 'class="nav-link"')}
                </div>
                <div class="user-info">
                    ${userInfoHTML}
                </div>
            </nav>`;
        } else {
            // booking.html and other pages
            return `
            <header class="${headerClass}">
                <h1>${title}</h1>
                ${subtitle}
                <div class="user-info">
                    ${userInfoHTML}
                    ${mainLinksHTML}
                </div>
            </header>`;
        }
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
        } else {
            console.warn('🧭 NavigationManager: No navigation container found');
        }

        console.log(`🧭 NavigationManager: Rendered navigation for ${this.currentPage} page`);
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
        // Add mobile menu toggle if needed
        const nav = document.querySelector('.main-nav, .topbar, .app-header');
        if (nav && window.innerWidth <= 768) {
            nav.classList.add('mobile-nav');
        }
    }
}

// Global instance
window.NavigationManager = new NavigationManager();

// Auto-initialization
document.addEventListener('DOMContentLoaded', () => {
    // Initialize responsive behavior
    window.NavigationManager.initResponsive();
    window.NavigationManager.addEventListeners();
    
    console.log('🧭 NavigationManager: Ready for initialization');
});

console.log('🧭 navigation.js: Navigation module loaded');