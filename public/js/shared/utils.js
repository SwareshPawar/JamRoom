/**
 * JamRoom Utility Functions Module
 * Common utility functions used across the application
 */

class JamRoomUtils {
    /**
     * Date and Time utilities
     */
    static formatDate(date, format = 'DD/MM/YYYY') {
        if (!date) return '';
        
        const dateObj = new Date(date);
        if (isNaN(dateObj.getTime())) return '';
        
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = dateObj.getFullYear();
        const hours = String(dateObj.getHours()).padStart(2, '0');
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        
        switch (format) {
            case 'DD/MM/YYYY':
                return `${day}/${month}/${year}`;
            case 'MM/DD/YYYY':
                return `${month}/${day}/${year}`;
            case 'YYYY-MM-DD':
                return `${year}-${month}-${day}`;
            case 'DD Mon YYYY':
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                return `${day} ${monthNames[dateObj.getMonth()]} ${year}`;
            case 'DD/MM/YYYY HH:mm':
                return `${day}/${month}/${year} ${hours}:${minutes}`;
            case 'HH:mm':
                return `${hours}:${minutes}`;
            case 'HH:mm DD/MM/YYYY':
                return `${hours}:${minutes} ${day}/${month}/${year}`;
            default:
                return dateObj.toLocaleDateString();
        }
    }

    /**
     * Format time for display (24hr to 12hr conversion)
     */
    static formatTime(time24) {
        if (!time24) return '';
        
        const [hours, minutes] = time24.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return time24;
        
        const period = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        const minutesStr = String(minutes).padStart(2, '0');
        
        return `${hours12}:${minutesStr} ${period}`;
    }

    /**
     * Convert 12hr time to 24hr format
     */
    static convertTo24Hour(time12) {
        if (!time12) return '';
        
        const [time, period] = time12.split(' ');
        if (!time || !period) return time12;
        
        const [hours, minutes] = time.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return time12;
        
        let hours24 = hours;
        
        if (period.toUpperCase() === 'PM' && hours !== 12) {
            hours24 += 12;
        } else if (period.toUpperCase() === 'AM' && hours === 12) {
            hours24 = 0;
        }
        
        return `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /**
     * Get current date in YYYY-MM-DD format
     */
    static getCurrentDate() {
        return new Date().toISOString().split('T')[0];
    }

    /**
     * Get current time in HH:MM format
     */
    static getCurrentTime() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Check if date is today
     */
    static isToday(date) {
        const today = new Date();
        const checkDate = new Date(date);
        
        return checkDate.toDateString() === today.toDateString();
    }

    /**
     * Check if date is in the future
     */
    static isFutureDate(date) {
        const checkDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return checkDate >= today;
    }

    /**
     * Get days between two dates
     */
    static getDaysBetween(date1, date2) {
        const firstDate = new Date(date1);
        const secondDate = new Date(date2);
        const timeDiff = Math.abs(secondDate.getTime() - firstDate.getTime());
        return Math.ceil(timeDiff / (1000 * 3600 * 24));
    }

    /**
     * String utilities
     */
    static capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    static capitalizeWords(str) {
        if (!str) return '';
        return str.split(' ').map(word => this.capitalize(word)).join(' ');
    }

    static truncate(str, length = 100, suffix = '...') {
        if (!str || str.length <= length) return str;
        return str.substring(0, length) + suffix;
    }

    static slugify(str) {
        if (!str) return '';
        return str
            .toLowerCase()
            .replace(/[^a-z0-9 -]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-');
    }

    /**
     * Number utilities
     */
    static formatNumber(num, decimals = 0) {
        if (isNaN(num)) return num;
        return Number(num).toLocaleString('en-IN', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });
    }

    static formatCurrency(amount, currency = 'INR', includeSymbol = true) {
        const num = parseFloat(amount);
        if (isNaN(num)) return amount;
        
        if (includeSymbol && currency === 'INR') {
            return `₹${this.formatNumber(num)}`;
        }
        
        return new Intl.NumberFormat('en-IN', {
            style: currency ? 'currency' : 'decimal',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    }

    static generateRandomId(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * DOM utilities
     */
    static createElement(tag, attributes = {}, content = '') {
        const element = document.createElement(tag);
        
        Object.keys(attributes).forEach(key => {
            if (key === 'className') {
                element.className = attributes[key];
            } else if (key === 'dataset') {
                Object.keys(attributes[key]).forEach(dataKey => {
                    element.dataset[dataKey] = attributes[key][dataKey];
                });
            } else {
                element.setAttribute(key, attributes[key]);
            }
        });
        
        if (content) {
            if (typeof content === 'string') {
                element.innerHTML = content;
            } else {
                element.appendChild(content);
            }
        }
        
        return element;
    }

    static removeElement(selector) {
        const element = typeof selector === 'string' 
            ? document.querySelector(selector) 
            : selector;
        if (element && element.parentNode) {
            element.parentNode.removeChild(element);
        }
    }

    static toggleClass(element, className, force) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        if (element) {
            element.classList.toggle(className, force);
        }
    }

    static hasClass(element, className) {
        if (typeof element === 'string') {
            element = document.querySelector(element);
        }
        return element ? element.classList.contains(className) : false;
    }

    /**
     * Event utilities
     */
    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    static throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Local storage utilities
     */
    static saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving to localStorage:', error);
            return false;
        }
    }

    static getFromStorage(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Error reading from localStorage:', error);
            return defaultValue;
        }
    }

    static removeFromStorage(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Error removing from localStorage:', error);
            return false;
        }
    }

    static clearStorage() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Error clearing localStorage:', error);
            return false;
        }
    }

    /**
     * URL utilities
     */
    static getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    }

    static setUrlParameter(name, value) {
        const url = new URL(window.location.href);
        url.searchParams.set(name, value);
        window.history.pushState({}, '', url);
    }

    static removeUrlParameter(name) {
        const url = new URL(window.location.href);
        url.searchParams.delete(name);
        window.history.pushState({}, '', url);
    }

    static updateUrl(path, replace = false) {
        if (replace) {
            window.history.replaceState({}, '', path);
        } else {
            window.history.pushState({}, '', path);
        }
    }

    /**
     * Validation utilities
     */
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    static isValidPhone(phone) {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(phone.replace(/\s/g, ''));
    }

    static isValidIndianPhone(phone) {
        const cleanPhone = phone.replace(/\D/g, '');
        return /^[6-9]\d{9}$/.test(cleanPhone);
    }

    /**
     * Screen utilities
     */
    static isMobile() {
        return window.innerWidth <= 768;
    }

    static isTablet() {
        return window.innerWidth > 768 && window.innerWidth <= 1024;
    }

    static isDesktop() {
        return window.innerWidth > 1024;
    }

    /**
     * Scroll utilities
     */
    static scrollToTop(smooth = true) {
        window.scrollTo({
            top: 0,
            behavior: smooth ? 'smooth' : 'auto'
        });
    }

    static scrollToElement(selector, offset = 0, smooth = true) {
        const element = typeof selector === 'string' 
            ? document.querySelector(selector) 
            : selector;
            
        if (element) {
            const elementTop = element.offsetTop - offset;
            window.scrollTo({
                top: elementTop,
                behavior: smooth ? 'smooth' : 'auto'
            });
        }
    }

    /**
     * Loading state management
     */
    static showLoading(container = document.body, message = 'Loading...') {
        // Backward compatibility: allow showLoading('Loading message')
        if (typeof container === 'string') {
            message = container;
            container = document.body;
        }

        if (!container || !container.appendChild) {
            container = document.body;
        }

        this.hideLoading(container); // Remove any existing loader
        
        const loader = this.createElement('div', {
            className: 'loading-overlay',
            style: `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `.replace(/\n\s*/g, '')
        }, `
            <div style="text-align: center;">
                <div style="
                    width: 40px;
                    height: 40px;
                    border: 3px solid #f3f3f3;
                    border-top: 3px solid #3498db;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 15px;
                "></div>
                <div style="color: #555; font-size: 16px;">${message}</div>
            </div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `);
        
        container.appendChild(loader);
        return loader;
    }

    static hideLoading(container = document.body) {
        if (!container || !container.querySelector) {
            container = document.body;
        }

        const loader = container.querySelector('.loading-overlay');
        if (loader) {
            loader.remove();
        }
    }

    static showButtonLoading(buttonId, originalText = '') {
        const button = document.getElementById(buttonId);
        if (!button) return;

        const currentText = originalText || button.textContent || button.value || '';
        button.setAttribute('data-original-text', currentText);
        button.disabled = true;
        button.classList.add('loading');

        if (button.tagName === 'BUTTON') {
            button.textContent = 'Loading...';
        } else {
            button.value = 'Loading...';
        }
    }

    static hideButtonLoading(buttonId) {
        const button = document.getElementById(buttonId);
        if (!button) return;

        button.disabled = false;
        button.classList.remove('loading');

        const originalText = button.getAttribute('data-original-text');
        if (originalText !== null) {
            if (button.tagName === 'BUTTON') {
                button.textContent = originalText;
            } else {
                button.value = originalText;
            }
            button.removeAttribute('data-original-text');
        }
    }

    static showSectionLoading(containerId, message = 'Loading...') {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="loading" style="display:flex;align-items:center;gap:10px;justify-content:center;padding:20px;">
                <div class="loader"></div>
                <span>${message}</span>
            </div>
        `;
    }

    /**
     * Error handling
     */
    static handleError(error, context = 'Application') {
        console.error(`${context} Error:`, error);
        
        // You can extend this to send errors to a logging service
        // this.logErrorToService(error, context);
        
        return {
            message: error.message || 'An unexpected error occurred',
            context: context,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Copy to clipboard
     */
    static async copyToClipboard(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const success = document.execCommand('copy');
                textArea.remove();
                return success;
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Generic API request helper
     */
    static async makeRequest(url, options = {}) {
        const defaultOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include'
        };
        
        const config = { ...defaultOptions, ...options };
        
        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: data,
                response: response
            };
        } catch (error) {
            console.error('API request failed:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    /**
     * Format file size
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get file extension
     */
    static getFileExtension(filename) {
        return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
    }
}

// Make JamRoomUtils globally available
window.JamRoomUtils = JamRoomUtils;
console.log('🛠️ utils.js: JamRoomUtils loaded');

// Legacy function support for backward compatibility
window.formatDate = (date, format) => JamRoomUtils.formatDate(date, format);
window.formatTime = (time) => JamRoomUtils.formatTime(time);
window.formatCurrency = (amount) => JamRoomUtils.formatCurrency(amount);
window.copyToClipboard = (text) => JamRoomUtils.copyToClipboard(text);
window.showLoading = (container, message) => JamRoomUtils.showLoading(container, message);
window.hideLoading = (container) => JamRoomUtils.hideLoading(container);
window.debounce = (func, delay) => JamRoomUtils.debounce(func, delay);
window.throttle = (func, limit) => JamRoomUtils.throttle(func, limit);

// Make available globally
window.JamRoomUtils = JamRoomUtils;