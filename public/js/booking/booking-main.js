// Global variables
        const API_URL = window.location.origin;
        let currentUser = null;
        let settings = null;
        let selectedRentals = new Map();

        // Auth/init functions moved to booking-auth.js

        // Utility functions using shared modules
        const showAlert = (message, type = 'info') => {
            if (window.alertManager) {
                switch(type) {
                    case 'error':
                        window.alertManager.error(message);
                        break;
                    case 'success':
                        window.alertManager.success(message);
                        break;
                    case 'warning':
                        window.alertManager.warning(message);
                        break;
                    default:
                        window.alertManager.info(message);
                }
            } else {
                // Fallback
                alert(`${type.toUpperCase()}: ${message}`);
            }
        };

        // Using shared utility functions
        const formatDate = (dateStr) => {
            if (window.JamRoomUtils) {
                return window.JamRoomUtils.formatDate(dateStr, 'DD Mon YYYY');
            } else {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-IN', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
        };

        const formatTime = (time) => {
            if (window.JamRoomUtils) {
                return window.JamRoomUtils.formatTime(time);
            } else {
                if (!time) return 'N/A';
                const [hours, minutes] = time.split(':');
                const hour = parseInt(hours);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour % 12 || 12;
                return `${displayHour}:${minutes} ${ampm}`;
            }
        };

        const calculateEndTime = (startTime, duration) => {
            const [hours, minutes] = startTime.split(':').map(Number);
            const endMinutes = (hours * 60 + minutes + duration * 60);
            const endHours = Math.floor(endMinutes / 60) % 24;
            const endMins = endMinutes % 60;
            return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
        };

        // Loading functions using shared utils
        const showLoading = (message = 'Processing...') => {
            if (window.JamRoomUtils) {
                window.JamRoomUtils.showLoading(document.body, message);
            } else {
                // Fallback loading
                const overlay = document.getElementById('loadingOverlay');
                const messageEl = document.getElementById('loadingMessage');
                if (overlay && messageEl) {
                    messageEl.textContent = message;
                    overlay.classList.add('show');
                }
            }
        };
        
        const hideLoading = () => {
            if (window.JamRoomUtils) {
                window.JamRoomUtils.hideLoading(document.body);
            } else {
                // Fallback
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) {
                    overlay.classList.remove('show');
                }
            }
        };

        // Alias functions for compatibility
        const showLoadingOverlay = showLoading;
        const hideLoadingOverlay = hideLoading;

        // Rental settings/selection functions moved to booking-rentals.js

        // Price calculation functions moved to booking-pricing.js

        // Availability/timeline functions moved to booking-availability.js

        // Form submit + field listeners moved to booking-form.js

        // Booking history + billing actions moved to booking-bookings.js

        // Event listeners - Add safety checks since NavigationManager handles logout button
        const logoutBtnLegacy = document.getElementById('logoutBtn');
        if (logoutBtnLegacy) {
            logoutBtnLegacy.addEventListener('click', () => {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
            });
        }

        if (window.initBookingFormHandlers) {
            window.initBookingFormHandlers();
        }

        // Initialize
        checkAuth();
