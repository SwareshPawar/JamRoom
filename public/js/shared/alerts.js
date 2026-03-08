/**
 * JamRoom Alert System Module
 * Provides consistent alert notifications across the application
 */

class AlertManager {
    constructor(options = {}) {
        this.options = {
            position: 'top-right', // top-right, top-left, top-center, bottom-right, etc.
            timeout: 5000, // Auto close after 5 seconds, 0 for no timeout
            maxAlerts: 5, // Maximum number of alerts to show at once
            showCloseButton: true,
            ...options
        };
        
        this.alerts = [];
        this.container = null;
        this.init();
    }

    /**
     * Initialize alert system
     */
    init() {
        // Create alerts container if it doesn't exist
        this.container = document.getElementById('alert-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'alert-container';
            this.container.className = `alert-container alert-${this.options.position}`;
            document.body.appendChild(this.container);
        }
        
        this.injectStyles();
    }

    /**
     * Inject required CSS styles
     */
    injectStyles() {
        if (document.getElementById('alert-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'alert-styles';
        style.textContent = `
            .alert-container {
                position: fixed;
                z-index: 10000;
                pointer-events: none;
                max-width: 400px;
            }
            
            .alert-container.alert-top-right {
                top: 20px;
                right: 20px;
            }
            
            .alert-container.alert-top-left {
                top: 20px;
                left: 20px;
            }
            
            .alert-container.alert-top-center {
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
            }
            
            .alert-container.alert-bottom-right {
                bottom: 20px;
                right: 20px;
            }
            
            .alert-container.alert-bottom-left {
                bottom: 20px;
                left: 20px;
            }
            
            .alert-container.alert-bottom-center {
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
            }
            
            .jamroom-alert {
                background: #fff;
                border: 1px solid #ddd;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                pointer-events: all;
                position: relative;
                overflow: hidden;
                max-width: 100%;
                animation: alertSlideIn 0.3s ease-out;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                line-height: 1.4;
            }
            
            .jamroom-alert.alert-removing {
                animation: alertSlideOut 0.3s ease-in forwards;
            }
            
            @keyframes alertSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(100%);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            
            @keyframes alertSlideOut {
                to {
                    opacity: 0;
                    transform: translateX(100%);
                    margin-bottom: -100px;
                }
            }
            
            .jamroom-alert.success {
                border-left: 4px solid #27ae60;
                background-color: #d5f4e6;
            }
            
            .jamroom-alert.error {
                border-left: 4px solid #e74c3c;
                background-color: #fdeaea;
            }
            
            .jamroom-alert.warning {
                border-left: 4px solid #f39c12;
                background-color: #fef5e7;
            }
            
            .jamroom-alert.info {
                border-left: 4px solid #3498db;
                background-color: #e8f5fd;
            }
            
            .alert-header {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                margin-bottom: 8px;
            }
            
            .alert-title {
                font-weight: 600;
                color: #2c3e50;
                margin: 0;
                flex: 1;
            }
            
            .alert-close {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                color: #7f8c8d;
                padding: 0;
                margin-left: 10px;
                line-height: 1;
                flex-shrink: 0;
            }
            
            .alert-close:hover {
                color: #2c3e50;
            }
            
            .alert-message {
                color: #34495e;
                margin: 0;
            }

            .alert-spacer {
                flex: 1;
            }
            
            .alert-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                height: 3px;
                background-color: rgba(0, 0, 0, 0.1);
                animation: alertProgress linear;
            }
            
            .jamroom-alert.success .alert-progress {
                background-color: #27ae60;
            }
            
            .jamroom-alert.error .alert-progress {
                background-color: #e74c3c;
            }
            
            .jamroom-alert.warning .alert-progress {
                background-color: #f39c12;
            }
            
            .jamroom-alert.info .alert-progress {
                background-color: #3498db;
            }
            
            @keyframes alertProgress {
                from { width: 100%; }
                to { width: 0%; }
            }
            
            @media (max-width: 480px) {
                .alert-container {
                    left: 10px !important;
                    right: 10px !important;
                    max-width: none;
                    transform: none !important;
                }
                
                .jamroom-alert {
                    margin-bottom: 8px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    /**
     * Show alert
     */
    show(message, type = 'info', options = {}) {
        const alertOptions = {
            title: '',
            timeout: this.options.timeout,
            showCloseButton: this.options.showCloseButton,
            ...options
        };

        // Remove oldest alert if we've reached the limit
        if (this.alerts.length >= this.options.maxAlerts) {
            this.remove(this.alerts[0]);
        }

        const alertId = 'alert-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const alertElement = document.createElement('div');
        alertElement.id = alertId;
        alertElement.className = `jamroom-alert ${type}`;
        
        const headerHtml = alertOptions.title ? `
            <div class="alert-header">
                <h4 class="alert-title">${alertOptions.title}</h4>
                ${alertOptions.showCloseButton ? '<button class="alert-close" onclick="window.alertManager.remove(\'' + alertId + '\')">&times;</button>' : ''}
            </div>
        ` : (alertOptions.showCloseButton ? `
            <div class="alert-header">
                <div class="alert-spacer"></div>
                <button class="alert-close" onclick="window.alertManager.remove('${alertId}')">&times;</button>
            </div>
        ` : '');
        
        alertElement.innerHTML = `
            ${headerHtml}
            <div class="alert-message">${message}</div>
            ${alertOptions.timeout > 0 ? '<div class="alert-progress"></div>' : ''}
        `;

        if (alertOptions.timeout > 0) {
            const progressBar = alertElement.querySelector('.alert-progress');
            if (progressBar) {
                progressBar.style.animationDuration = `${alertOptions.timeout}ms`;
            }
        }
        
        this.container.appendChild(alertElement);
        
        const alert = {
            id: alertId,
            element: alertElement,
            type: type,
            message: message,
            timeout: alertOptions.timeout
        };
        
        this.alerts.push(alert);
        
        // Auto remove after timeout
        if (alertOptions.timeout > 0) {
            setTimeout(() => {
                this.remove(alertId);
            }, alertOptions.timeout);
        }
        
        return alertId;
    }

    /**
     * Remove alert
     */
    remove(alertOrId) {
        const alertId = typeof alertOrId === 'string' ? alertOrId : alertOrId.id;
        const alert = this.alerts.find(a => a.id === alertId);
        
        if (!alert) return;
        
        alert.element.classList.add('alert-removing');
        
        setTimeout(() => {
            if (alert.element.parentNode) {
                alert.element.parentNode.removeChild(alert.element);
            }
            this.alerts = this.alerts.filter(a => a.id !== alertId);
        }, 300);
    }

    /**
     * Clear all alerts
     */
    clearAll() {
        this.alerts.forEach(alert => {
            this.remove(alert.id);
        });
    }

    /**
     * Show success alert
     */
    success(message, options = {}) {
        return this.show(message, 'success', {
            title: options.title || 'Success',
            ...options
        });
    }

    /**
     * Show error alert
     */
    error(message, options = {}) {
        return this.show(message, 'error', {
            title: options.title || 'Error',
            timeout: options.timeout || 0, // Errors don't auto-close by default
            ...options
        });
    }

    /**
     * Show warning alert
     */
    warning(message, options = {}) {
        return this.show(message, 'warning', {
            title: options.title || 'Warning',
            ...options
        });
    }

    /**
     * Show info alert
     */
    info(message, options = {}) {
        return this.show(message, 'info', {
            title: options.title || '',
            ...options
        });
    }
}

/**
 * Simple alert functions for quick usage
 */
class SimpleAlert {
    
    /**
     * Show simple browser alert (fallback)
     */
    static alert(message, title = 'Alert') {
        if (window.alertManager) {
            return window.alertManager.info(message, { title });
        } else {
            alert(message);
        }
    }

    /**
     * Show confirmation dialog
     */
    static confirm(message, title = 'Confirm') {
        return confirm(message);
    }

    /**
     * Show prompt dialog
     */
    static prompt(message, defaultValue = '', title = 'Input Required') {
        return prompt(message, defaultValue);
    }

    /**
     * Show loading alert
     */
    static loading(message = 'Loading...') {
        if (window.alertManager) {
            return window.alertManager.info(message, { 
                title: '',
                timeout: 0,
                showCloseButton: false
            });
        }
        return null;
    }

    /**
     * Hide loading alert
     */
    static hideLoading(alertId) {
        if (window.alertManager && alertId) {
            window.alertManager.remove(alertId);
        }
    }
}

/**
 * Toast notifications (simpler, smaller alerts)
 */
class ToastManager {
    static show(message, type = 'info', duration = 3000) {
        // Create a simpler toast notification
        const toast = document.createElement('div');
        toast.className = `jamroom-toast toast-${type}`;
        toast.textContent = message;
        
        // Inject toast styles if not already present
        if (!document.getElementById('toast-styles')) {
            const style = document.createElement('style');
            style.id = 'toast-styles';
            style.textContent = `
                .jamroom-toast {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #333;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 25px;
                    font-size: 14px;
                    z-index: 10001;
                    animation: toastSlideIn 0.3s ease-out;
                    max-width: 80vw;
                    text-align: center;
                }
                
                .jamroom-toast.toast-removing {
                    animation: toastSlideOut 0.3s ease-in forwards;
                }
                
                .jamroom-toast.toast-success {
                    background: #27ae60;
                }
                
                .jamroom-toast.toast-error {
                    background: #e74c3c;
                }
                
                .jamroom-toast.toast-warning {
                    background: #f39c12;
                }
                
                .jamroom-toast.toast-info {
                    background: #3498db;
                }
                
                @keyframes toastSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(100%);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
                
                @keyframes toastSlideOut {
                    to {
                        opacity: 0;
                        transform: translateX(-50%) translateY(100%);
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(toast);
        
        // Remove after duration
        setTimeout(() => {
            toast.classList.add('toast-removing');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
        
        return toast;
    }

    static success(message, duration = 3000) {
        return this.show(message, 'success', duration);
    }

    static error(message, duration = 5000) {
        return this.show(message, 'error', duration);
    }

    static warning(message, duration = 4000) {
        return this.show(message, 'warning', duration);
    }

    static info(message, duration = 3000) {
        return this.show(message, 'info', duration);
    }
}

// Auto-initialize global alert manager
document.addEventListener('DOMContentLoaded', function() {
    if (!window.alertManager) {
        window.alertManager = new AlertManager();
    }
});

// Legacy function support
window.showAlert = function(message, type = 'info', title = '') {
    if (window.alertManager) {
        return window.alertManager.show(message, type, { title });
    }
};

window.showSuccess = function(message, title = 'Success') {
    if (window.alertManager) {
        return window.alertManager.success(message, { title });
    }
};

window.showError = function(message, title = 'Error') {
    if (window.alertManager) {
        return window.alertManager.error(message, { title });
    }
};

window.showWarning = function(message, title = 'Warning') {
    if (window.alertManager) {
        return window.alertManager.warning(message, { title });
    }
};

window.showInfo = function(message, title = '') {
    if (window.alertManager) {
        return window.alertManager.info(message, { title });
    }
};

// Toast shortcuts
window.showToast = function(message, type = 'info') {
    return ToastManager.show(message, type);
};

window.toast = {
    show: (message, type, duration) => ToastManager.show(message, type, duration),
    success: (message, duration) => ToastManager.success(message, duration),
    error: (message, duration) => ToastManager.error(message, duration),
    warning: (message, duration) => ToastManager.warning(message, duration),
    info: (message, duration) => ToastManager.info(message, duration)
};

// Make available globally
window.AlertManager = AlertManager;
window.SimpleAlert = SimpleAlert;
window.ToastManager = ToastManager;

console.log('🚨 alerts.js: Alert system loaded');