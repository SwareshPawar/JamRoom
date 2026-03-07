/**
 * JamRoom Data Management Module
 * Handles API communication, data caching, and state management
 */

class DataManager {
    constructor(options = {}) {
        this.options = {
            baseUrl: '/api',
            timeout: 30000,
            retries: 3,
            cache: true,
            cacheTimeout: 5 * 60 * 1000, // 5 minutes
            ...options
        };
        
        this.cache = new Map();
        this.pendingRequests = new Map();
    }

    /**
     * Make HTTP request with error handling and retries
     */
    async request(url, options = {}) {
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            ...options
        };

        const fullUrl = url.startsWith('http') ? url : `${this.options.baseUrl}${url}`;
        const cacheKey = `${config.method}:${fullUrl}:${JSON.stringify(config.body || {})}`;

        // Return cached response if available and valid
        if (config.method === 'GET' && this.options.cache) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // Return pending request if already in progress
        if (this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey);
        }

        const requestPromise = this.executeRequest(fullUrl, config);
        this.pendingRequests.set(cacheKey, requestPromise);

        try {
            const result = await requestPromise;
            
            // Cache successful GET requests
            if (config.method === 'GET' && this.options.cache && result.success) {
                this.setCache(cacheKey, result);
            }
            
            return result;
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }

    /**
     * Execute HTTP request with retries
     */
    async executeRequest(url, config, attempt = 1) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

            const response = await fetch(url, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            let data;
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                data = await response.text();
            }

            const result = {
                success: response.ok,
                status: response.status,
                statusText: response.statusText,
                data: data,
                headers: Object.fromEntries(response.headers.entries()),
                response: response
            };

            if (!response.ok && attempt < this.options.retries) {
                // Retry on server errors (5xx) or network errors
                if (response.status >= 500 || response.status === 0) {
                    console.warn(`Request failed (attempt ${attempt}), retrying...`, { url, status: response.status });
                    await this.delay(1000 * attempt); // Exponential backoff
                    return this.executeRequest(url, config, attempt + 1);
                }
            }

            return result;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('Request timed out:', url);
                return {
                    success: false,
                    error: 'Request timed out',
                    status: 0,
                    data: null
                };
            }

            if (attempt < this.options.retries) {
                console.warn(`Request failed (attempt ${attempt}), retrying...`, { url, error: error.message });
                await this.delay(1000 * attempt);
                return this.executeRequest(url, config, attempt + 1);
            }

            console.error('Request failed:', error);
            return {
                success: false,
                error: error.message,
                status: 0,
                data: null
            };
        }
    }

    /**
     * GET request
     */
    async get(url, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        
        return this.request(fullUrl, { method: 'GET' });
    }

    /**
     * POST request
     */
    async post(url, data = {}) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * PUT request
     */
    async put(url, data = {}) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE request
     */
    async delete(url) {
        return this.request(url, { method: 'DELETE' });
    }

    /**
     * Upload file
     */
    async upload(url, file, additionalData = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        Object.keys(additionalData).forEach(key => {
            formData.append(key, additionalData[key]);
        });

        return this.request(url, {
            method: 'POST',
            body: formData,
            headers: {} // Let browser set Content-Type for FormData
        });
    }

    /**
     * Cache management
     */
    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        const isExpired = Date.now() - cached.timestamp > this.options.cacheTimeout;
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    clearCache(pattern = null) {
        if (pattern) {
            const regex = new RegExp(pattern);
            for (const key of this.cache.keys()) {
                if (regex.test(key)) {
                    this.cache.delete(key);
                }
            }
        } else {
            this.cache.clear();
        }
    }

    /**
     * Utility methods
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

/**
 * JamRoom specific API endpoints
 */
class JamRoomAPI extends DataManager {
    constructor() {
        super({ baseUrl: '/api' });
    }

    // Authentication APIs
    async login(email, password) {
        return this.post('/auth/login', { email, password });
    }

    async register(userData) {
        return this.post('/auth/register', userData);
    }

    async logout() {
        const result = await this.post('/auth/logout');
        this.clearCache(); // Clear all cached data on logout
        return result;
    }

    async resetPassword(email) {
        return this.post('/auth/reset-password', { email });
    }

    async updatePassword(token, newPassword) {
        return this.post('/auth/update-password', { token, password: newPassword });
    }

    async checkAuth() {
        return this.get('/auth/check');
    }

    // User profile APIs
    async getProfile() {
        return this.get('/profile');
    }

    async updateProfile(profileData) {
        const result = await this.put('/profile', profileData);
        this.clearCache('/profile'); // Clear profile cache
        return result;
    }

    // Booking APIs
    async getBookings(params = {}) {
        return this.get('/bookings', params);
    }

    async getBooking(id) {
        return this.get(`/bookings/${id}`);
    }

    async createBooking(bookingData) {
        const result = await this.post('/bookings', bookingData);
        this.clearCache('/bookings'); // Clear bookings cache
        this.clearCache('/slots'); // Clear slots cache as availability changed
        return result;
    }

    async updateBooking(id, bookingData) {
        const result = await this.put(`/bookings/${id}`, bookingData);
        this.clearCache('/bookings');
        this.clearCache('/slots');
        return result;
    }

    async cancelBooking(id) {
        const result = await this.delete(`/bookings/${id}`);
        this.clearCache('/bookings');
        this.clearCache('/slots');
        return result;
    }

    // Slot APIs
    async getSlots(date, instrumentType = '') {
        const params = { date };
        if (instrumentType) params.instrumentType = instrumentType;
        return this.get('/slots', params);
    }

    async getAvailableSlots(date, instrumentType) {
        return this.get('/slots/available', { date, instrumentType });
    }

    // Admin APIs
    async getAdminBookings(params = {}) {
        return this.get('/admin/bookings', params);
    }

    async updateBookingStatus(id, status, notes = '') {
        const result = await this.put(`/admin/bookings/${id}/status`, { status, notes });
        this.clearCache('/bookings');
        this.clearCache('/admin/bookings');
        return result;
    }

    async getAdminSettings() {
        const result = await this.get('/admin/settings');

        // Backward compatibility: older cached booking pages used admin settings
        // even though booking should use the public settings endpoint.
        if (!result.success && result.status === 401) {
            const currentPath = window.location.pathname || '';
            const isBookingPage = currentPath === '/booking.html' || currentPath === '/booking-mobile.html';

            if (isBookingPage) {
                return this.get('/bookings/settings');
            }
        }

        return result;
    }

    async updateAdminSettings(settings) {
        const result = await this.put('/admin/settings', settings);
        this.clearCache('/admin/settings');
        return result;
    }

    async getBlockedTimes() {
        return this.get('/admin/blocked-times');
    }

    async createBlockedTime(blockedTimeData) {
        const result = await this.post('/admin/blocked-times', blockedTimeData);
        this.clearCache('/admin/blocked-times');
        this.clearCache('/slots'); // Availability changed
        return result;
    }

    async removeBlockedTime(id) {
        const result = await this.delete(`/admin/blocked-times/${id}`);
        this.clearCache('/admin/blocked-times');
        this.clearCache('/slots');
        return result;
    }

    // Statistics and reports
    async getStatistics(period = 'month') {
        return this.get('/admin/statistics', { period });
    }

    async getRevenueReport(startDate, endDate) {
        return this.get('/admin/reports/revenue', { startDate, endDate });
    }

    // File operations
    async uploadFile(file, type = 'general') {
        return this.upload('/upload', file, { type });
    }

    async downloadFile(filename) {
        return this.get(`/files/${filename}`);
    }
}

/**
 * Local storage data manager
 */
class LocalDataManager {
    constructor(keyPrefix = 'jamroom_') {
        this.keyPrefix = keyPrefix;
    }

    /**
     * Save data to localStorage
     */
    save(key, data) {
        try {
            const item = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem(this.keyPrefix + key, JSON.stringify(item));
            return true;
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
            return false;
        }
    }

    /**
     * Load data from localStorage
     */
    load(key, maxAge = null) {
        try {
            const item = localStorage.getItem(this.keyPrefix + key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            
            if (maxAge && Date.now() - parsed.timestamp > maxAge) {
                this.remove(key); // Remove expired data
                return null;
            }

            return parsed.data;
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
            return null;
        }
    }

    /**
     * Remove data from localStorage
     */
    remove(key) {
        try {
            localStorage.removeItem(this.keyPrefix + key);
            return true;
        } catch (error) {
            console.error('Failed to remove from localStorage:', error);
            return false;
        }
    }

    /**
     * Clear all data with this prefix
     */
    clear() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.keyPrefix)) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            return true;
        } catch (error) {
            console.error('Failed to clear localStorage:', error);
            return false;
        }
    }

    /**
     * Get all keys with this prefix
     */
    getAllKeys() {
        const keys = [];
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.keyPrefix)) {
                    keys.push(key.substring(this.keyPrefix.length));
                }
            }
        } catch (error) {
            console.error('Failed to get localStorage keys:', error);
        }
        return keys;
    }
}

/**
 * Session data manager (survives page refresh but not browser close)
 */
class SessionDataManager extends LocalDataManager {
    constructor(keyPrefix = 'jamroom_session_') {
        super(keyPrefix);
        this.storage = sessionStorage;
    }

    save(key, data) {
        try {
            const item = {
                data: data,
                timestamp: Date.now()
            };
            sessionStorage.setItem(this.keyPrefix + key, JSON.stringify(item));
            return true;
        } catch (error) {
            console.error('Failed to save to sessionStorage:', error);
            return false;
        }
    }

    load(key, maxAge = null) {
        try {
            const item = sessionStorage.getItem(this.keyPrefix + key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            
            if (maxAge && Date.now() - parsed.timestamp > maxAge) {
                this.remove(key);
                return null;
            }

            return parsed.data;
        } catch (error) {
            console.error('Failed to load from sessionStorage:', error);
            return null;
        }
    }

    remove(key) {
        try {
            sessionStorage.removeItem(this.keyPrefix + key);
            return true;
        } catch (error) {
            console.error('Failed to remove from sessionStorage:', error);
            return false;
        }
    }

    clear() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith(this.keyPrefix)) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => sessionStorage.removeItem(key));
            return true;
        } catch (error) {
            console.error('Failed to clear sessionStorage:', error);
            return false;
        }
    }
}

// Auto-initialize global instances
document.addEventListener('DOMContentLoaded', function() {
    if (!window.jamroomAPI) {
        window.jamroomAPI = new JamRoomAPI();
    }
    if (!window.localData) {
        window.localData = new LocalDataManager();
    }
    if (!window.sessionData) {
        window.sessionData = new SessionDataManager();
    }
});

// Legacy support functions
window.apiRequest = async function(url, options = {}) {
    if (window.jamroomAPI) {
        return window.jamroomAPI.request(url, options);
    }
    return fetch(url, options);
};

window.apiGet = async function(url, params = {}) {
    if (window.jamroomAPI) {
        return window.jamroomAPI.get(url, params);
    }
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    return fetch(fullUrl);
};

window.apiPost = async function(url, data = {}) {
    if (window.jamroomAPI) {
        return window.jamroomAPI.post(url, data);
    }
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
};

// Make available globally
window.DataManager = DataManager;
window.JamRoomAPI = JamRoomAPI;
window.LocalDataManager = LocalDataManager;
window.SessionDataManager = SessionDataManager;