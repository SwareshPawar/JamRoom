/**
 * JamRoom Form Utilities Module
 * Provides form validation, submission helpers, and common form operations
 */

class FormValidator {
    constructor(formSelector, options = {}) {
        this.form = typeof formSelector === 'string' 
            ? document.querySelector(formSelector)
            : formSelector;
            
        this.options = {
            showErrors: true,
            errorClass: 'error',
            successClass: 'success',
            errorMessageClass: 'error-message',
            validateOnSubmit: true,
            validateOnBlur: false,
            validateOnInput: false,
            ...options
        };
        
        this.validators = {};
        this.customMessages = {};
        
        if (!this.form) {
            console.error('FormValidator: Form not found');
            return;
        }
        
        this.init();
    }

    /**
     * Initialize form validation
     */
    init() {
        if (this.options.validateOnSubmit) {
            this.form.addEventListener('submit', (e) => this.handleSubmit(e));
        }
        
        if (this.options.validateOnBlur || this.options.validateOnInput) {
            this.setupFieldValidation();
        }
    }

    /**
     * Setup field-level validation
     */
    setupFieldValidation() {
        const fields = this.form.querySelectorAll('input, select, textarea');
        
        fields.forEach(field => {
            if (this.options.validateOnBlur) {
                field.addEventListener('blur', () => this.validateField(field));
            }
            
            if (this.options.validateOnInput) {
                field.addEventListener('input', () => this.validateField(field));
            }
        });
    }

    /**
     * Handle form submission
     */
    handleSubmit(e) {
        if (!this.validateForm()) {
            e.preventDefault();
            return false;
        }
        return true;
    }

    /**
     * Validate entire form
     */
    validateForm() {
        const fields = this.form.querySelectorAll('input, select, textarea');
        let isValid = true;
        
        fields.forEach(field => {
            if (!this.validateField(field)) {
                isValid = false;
            }
        });
        
        return isValid;
    }

    /**
     * Validate individual field
     */
    validateField(field) {
        const fieldName = field.name || field.id;
        const value = field.value.trim();
        let isValid = true;
        
        // Remove existing error state
        this.clearFieldError(field);
        
        // Required validation
        if (field.required && !value) {
            this.showFieldError(field, this.getErrorMessage(fieldName, 'required', 'This field is required'));
            isValid = false;
        }
        
        // Type-specific validation
        if (value && isValid) {
            switch (field.type) {
                case 'email':
                    if (!FormUtils.isValidEmail(value)) {
                        this.showFieldError(field, this.getErrorMessage(fieldName, 'email', 'Please enter a valid email address'));
                        isValid = false;
                    }
                    break;
                    
                case 'tel':
                    if (!FormUtils.isValidPhone(value)) {
                        this.showFieldError(field, this.getErrorMessage(fieldName, 'phone', 'Please enter a valid phone number'));
                        isValid = false;
                    }
                    break;
                    
                case 'password':
                    if (!FormUtils.isValidPassword(value)) {
                        this.showFieldError(field, this.getErrorMessage(fieldName, 'password', 'Password must be at least 6 characters long'));
                        isValid = false;
                    }
                    break;
                    
                case 'number':
                    if (!FormUtils.isValidNumber(value)) {
                        this.showFieldError(field, this.getErrorMessage(fieldName, 'number', 'Please enter a valid number'));
                        isValid = false;
                    }
                    break;
            }
        }
        
        // Custom validation
        if (isValid && this.validators[fieldName]) {
            const customResult = this.validators[fieldName](value, field);
            if (customResult !== true) {
                this.showFieldError(field, customResult || 'Invalid input');
                isValid = false;
            }
        }
        
        if (isValid) {
            this.showFieldSuccess(field);
        }
        
        return isValid;
    }

    /**
     * Add custom validator for a field
     */
    addValidator(fieldName, validator, errorMessage) {
        this.validators[fieldName] = validator;
        if (errorMessage) {
            this.setErrorMessage(fieldName, 'custom', errorMessage);
        }
    }

    /**
     * Set custom error message
     */
    setErrorMessage(fieldName, validationType, message) {
        if (!this.customMessages[fieldName]) {
            this.customMessages[fieldName] = {};
        }
        this.customMessages[fieldName][validationType] = message;
    }

    /**
     * Get error message for field and validation type
     */
    getErrorMessage(fieldName, validationType, defaultMessage) {
        return this.customMessages[fieldName]?.[validationType] || defaultMessage;
    }

    /**
     * Show field error
     */
    showFieldError(field, message) {
        if (!this.options.showErrors) return;
        
        field.classList.add(this.options.errorClass);
        field.classList.remove(this.options.successClass);
        
        // Remove existing error message
        this.clearFieldError(field, false);
        
        // Add error message
        const errorDiv = document.createElement('div');
        errorDiv.className = this.options.errorMessageClass;
        errorDiv.textContent = message;
        errorDiv.style.color = '#e74c3c';
        errorDiv.style.fontSize = '0.875rem';
        errorDiv.style.marginTop = '0.25rem';
        
        field.parentNode.appendChild(errorDiv);
    }

    /**
     * Show field success
     */
    showFieldSuccess(field) {
        if (!this.options.showErrors) return;
        
        field.classList.remove(this.options.errorClass);
        field.classList.add(this.options.successClass);
    }

    /**
     * Clear field error
     */
    clearFieldError(field, clearClass = true) {
        if (clearClass) {
            field.classList.remove(this.options.errorClass);
            field.classList.remove(this.options.successClass);
        }
        
        const errorMessage = field.parentNode.querySelector(`.${this.options.errorMessageClass}`);
        if (errorMessage) {
            errorMessage.remove();
        }
    }

    /**
     * Reset form validation state
     */
    reset() {
        const fields = this.form.querySelectorAll('input, select, textarea');
        fields.forEach(field => this.clearFieldError(field));
    }
}

/**
 * Form utilities class with static methods
 */
class FormUtils {
    /**
     * Email validation
     */
    static isValidEmail(email) {
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email);
    }

    /**
     * Phone number validation (flexible for different formats)
     */
    static isValidPhone(phone) {
        // Remove all non-digit characters for validation
        const digitsOnly = phone.replace(/\D/g, '');
        // Should have at least 10 digits
        return digitsOnly.length >= 10;
    }

    /**
     * Indian mobile number validation
     */
    static isValidIndianMobile(phone) {
        const digitsOnly = phone.replace(/\D/g, '');
        // Indian mobile: 10 digits starting with 6, 7, 8, or 9
        return /^[6-9]\d{9}$/.test(digitsOnly);
    }

    /**
     * Password validation
     */
    static isValidPassword(password) {
        // At least 6 characters
        return password.length >= 6;
    }

    /**
     * Strong password validation
     */
    static isStrongPassword(password) {
        // At least 8 characters, with letters and numbers
        return password.length >= 8 && 
               /[a-zA-Z]/.test(password) && 
               /[0-9]/.test(password);
    }

    /**
     * Number validation
     */
    static isValidNumber(value) {
        return !isNaN(value) && !isNaN(parseFloat(value));
    }

    /**
     * Currency validation (for amounts)
     */
    static isValidAmount(amount) {
        const num = parseFloat(amount);
        return !isNaN(num) && num >= 0;
    }

    /**
     * Format currency
     */
    static formatCurrency(amount, currency = 'INR') {
        const num = parseFloat(amount);
        if (isNaN(num)) return amount;
        
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(num);
    }

    /**
     * Format phone number for display
     */
    static formatPhone(phone) {
        const digitsOnly = phone.replace(/\D/g, '');
        
        if (digitsOnly.length === 10) {
            // Format as: +91 XXXXX XXXXX
            return `+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`;
        }
        
        if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
            // Already has country code
            return `+${digitsOnly.slice(0, 2)} ${digitsOnly.slice(2, 7)} ${digitsOnly.slice(7)}`;
        }
        
        return phone; // Return as-is if format not recognized
    }

    /**
     * Serialize form data to object
     */
    static serializeForm(form) {
        const formData = new FormData(form);
        const data = {};
        
        for (let [key, value] of formData.entries()) {
            // Handle multiple values (checkboxes, etc.)
            if (data[key]) {
                if (Array.isArray(data[key])) {
                    data[key].push(value);
                } else {
                    data[key] = [data[key], value];
                }
            } else {
                data[key] = value;
            }
        }
        
        return data;
    }

    /**
     * Populate form with data
     */
    static populateForm(form, data) {
        Object.keys(data).forEach(key => {
            const field = form.querySelector(`[name="${key}"], #${key}`);
            if (field) {
                if (field.type === 'checkbox' || field.type === 'radio') {
                    field.checked = Boolean(data[key]);
                } else {
                    field.value = data[key] || '';
                }
            }
        });
    }

    /**
     * Disable form
     */
    static disableForm(form) {
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(element => {
            element.disabled = true;
        });
    }

    /**
     * Enable form
     */
    static enableForm(form) {
        const elements = form.querySelectorAll('input, select, textarea, button');
        elements.forEach(element => {
            element.disabled = false;
        });
    }

    /**
     * Show loading state on submit button
     */
    static showFormLoading(form, loadingText = 'Please wait...') {
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.setAttribute('data-original-text', submitBtn.textContent || submitBtn.value);
            if (submitBtn.tagName === 'BUTTON') {
                submitBtn.textContent = loadingText;
            } else {
                submitBtn.value = loadingText;
            }
        }
    }

    /**
     * Hide loading state on submit button
     */
    static hideFormLoading(form) {
        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            const originalText = submitBtn.getAttribute('data-original-text');
            if (originalText) {
                if (submitBtn.tagName === 'BUTTON') {
                    submitBtn.textContent = originalText;
                } else {
                    submitBtn.value = originalText;
                }
                submitBtn.removeAttribute('data-original-text');
            }
        }
    }

    /**
     * Submit form via AJAX
     */
    static async submitForm(form, options = {}) {
        const {
            url = form.action,
            method = form.method || 'POST',
            showLoading = true,
            loadingText = 'Please wait...',
            ...fetchOptions
        } = options;

        try {
            if (showLoading) {
                FormUtils.showFormLoading(form, loadingText);
                FormUtils.disableForm(form);
            }

            const formData = new FormData(form);
            
            const response = await fetch(url, {
                method: method.toUpperCase(),
                body: formData,
                credentials: 'include',
                ...fetchOptions
            });

            const result = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: result,
                response
            };
            
        } catch (error) {
            console.error('Form submission error:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        } finally {
            if (showLoading) {
                FormUtils.hideFormLoading(form);
                FormUtils.enableForm(form);
            }
        }
    }

    /**
     * Submit form as JSON
     */
    static async submitFormJSON(form, options = {}) {
        const {
            url = form.action,
            method = form.method || 'POST',
            showLoading = true,
            loadingText = 'Please wait...',
            ...fetchOptions
        } = options;

        try {
            if (showLoading) {
                FormUtils.showFormLoading(form, loadingText);
                FormUtils.disableForm(form);
            }

            const formData = FormUtils.serializeForm(form);
            
            const response = await fetch(url, {
                method: method.toUpperCase(),
                headers: {
                    'Content-Type': 'application/json',
                    ...fetchOptions.headers
                },
                body: JSON.stringify(formData),
                credentials: 'include',
                ...fetchOptions
            });

            const result = await response.json();
            
            return {
                success: response.ok,
                status: response.status,
                data: result,
                response
            };
            
        } catch (error) {
            console.error('Form submission error:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        } finally {
            if (showLoading) {
                FormUtils.hideFormLoading(form);
                FormUtils.enableForm(form);
            }
        }
    }
}

/**
 * Auto-initialize form validation on forms with data-validate attribute
 */
document.addEventListener('DOMContentLoaded', function() {
    const formsToValidate = document.querySelectorAll('form[data-validate]');
    
    formsToValidate.forEach(form => {
        const options = {};
        
        // Parse data attributes
        if (form.hasAttribute('data-validate-on-blur')) {
            options.validateOnBlur = form.getAttribute('data-validate-on-blur') !== 'false';
        }
        if (form.hasAttribute('data-validate-on-input')) {
            options.validateOnInput = form.getAttribute('data-validate-on-input') !== 'false';
        }
        if (form.hasAttribute('data-show-errors')) {
            options.showErrors = form.getAttribute('data-show-errors') !== 'false';
        }
        
        new FormValidator(form, options);
    });
});

// Make available globally
window.FormValidator = FormValidator;
window.FormUtils = FormUtils;

console.log('📋 forms.js: Form utilities loaded');