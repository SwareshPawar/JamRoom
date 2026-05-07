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

        const initBookingDatePickers = () => {
            if (typeof window.flatpickr !== 'function') {
                return;
            }

            const syncBookingDatePickerViewportState = (instance) => {
                if (!instance?.calendarContainer) {
                    return;
                }

                const isMobileViewport = window.innerWidth <= 768;
                instance.calendarContainer.classList.toggle('booking-date-calendar', true);
                instance.calendarContainer.classList.toggle('booking-date-calendar-mobile', isMobileViewport);
            };

            const dateInputIds = ['bookingDate', 'perdayStartDate', 'perdayEndDate'];

            dateInputIds.forEach((inputId) => {
                const inputEl = document.getElementById(inputId);
                if (!inputEl || inputEl.dataset.flatpickrBound === '1') {
                    return;
                }

                inputEl.dataset.flatpickrBound = '1';

                const picker = window.flatpickr(inputEl, {
                    dateFormat: 'Y-m-d',
                    altInput: true,
                    altFormat: 'd M Y',
                    disableMobile: true,
                    appendTo: document.body,
                    minDate: inputEl.min || 'today',
                    clickOpens: !inputEl.disabled,
                    onReady: (_selectedDates, _dateStr, instance) => {
                        syncBookingDatePickerViewportState(instance);
                        if (instance.altInput) {
                            instance.altInput.disabled = inputEl.disabled;
                            instance.altInput.classList.add('booking-date-alt-input');
                            instance.set('positionElement', instance.altInput);
                        } else {
                            instance.set('positionElement', inputEl);
                        }
                    },
                    onOpen: (_selectedDates, _dateStr, instance) => {
                        syncBookingDatePickerViewportState(instance);
                        document.body.classList.add('booking-date-picker-open');
                    },
                    onClose: () => {
                        document.body.classList.remove('booking-date-picker-open');
                    },
                    onChange: () => {
                        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });

                const disabledObserver = new MutationObserver(() => {
                    picker.set('clickOpens', !inputEl.disabled);
                    if (picker.altInput) {
                        picker.altInput.disabled = inputEl.disabled;
                    }
                });

                disabledObserver.observe(inputEl, {
                    attributes: true,
                    attributeFilter: ['disabled']
                });

                window.addEventListener('resize', () => {
                    syncBookingDatePickerViewportState(picker);
                });
            });
        };

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

        initBookingDatePickers();

        const populateTimeSelectOptions = (selectId, placeholderText) => {
            const select = document.getElementById(selectId);
            if (!select) {
                return;
            }

            const previousValue = select.value;
            select.innerHTML = `<option value="">${placeholderText}</option>`;
            (window.allTimeSlots || []).forEach((slot) => {
                const option = document.createElement('option');
                option.value = slot.value;
                option.textContent = slot.label;
                select.appendChild(option);
            });

            if (previousValue && Array.from(select.options).some((option) => option.value === previousValue)) {
                select.value = previousValue;
            }
        };

        const initPerdayTimeSelects = () => {
            populateTimeSelectOptions('perdayPickupTime', 'Select time');
            populateTimeSelectOptions('perdayReturnTime', 'Return time matches pickup time');
        };

        // Reusable custom dropdown for booking time fields.
        const bindCustomTimeSelect = ({ selectId, triggerId, displayId, defaultText }) => {
            const select = document.getElementById(selectId);
            const trigger = document.getElementById(triggerId);
            const display = document.getElementById(displayId);
            if (!select || !trigger || !display) return;

            // Panel appended to body for free fixed positioning
            const panel = document.createElement('div');
            panel.className = 'time-custom-panel';
            panel.setAttribute('role', 'listbox');
            panel.style.display = 'none';
            document.body.appendChild(panel);

            let isOpen = false;

            const updateDisplay = () => {
                const opt = select.options[select.selectedIndex];
                display.textContent = (opt && opt.value) ? opt.textContent : (select.options[0]?.textContent || defaultText);
            };

            const syncPanelOptions = () => {
                panel.innerHTML = '';
                Array.from(select.options).forEach((opt) => {
                    const li = document.createElement('div');
                    li.className = 'time-custom-option' + (opt.value === select.value && opt.value ? ' selected' : '');
                    li.textContent = opt.textContent;
                    if (!opt.value) li.dataset.placeholder = '1';
                    li.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        if (!opt.value) return;
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        updateDisplay();
                        closePanel();
                    });
                    panel.appendChild(li);
                });
            };

            const positionPanel = () => {
                const rect = trigger.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom - 8;
                const spaceAbove = rect.top - 8;
                const maxH = Math.min(260, Math.max(spaceBelow, spaceAbove) - 4);

                panel.style.width = rect.width + 'px';
                panel.style.left = rect.left + 'px';
                panel.style.maxHeight = maxH + 'px';

                if (spaceBelow >= 160 || spaceBelow >= spaceAbove) {
                    panel.style.top = (rect.bottom + 4) + 'px';
                    panel.style.bottom = '';
                } else {
                    panel.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
                    panel.style.top = '';
                }
            };

            const openPanel = () => {
                if (trigger.disabled || isOpen) return;
                syncPanelOptions();
                positionPanel();
                panel.style.display = 'block';
                trigger.setAttribute('aria-expanded', 'true');
                isOpen = true;
            };

            const closePanel = () => {
                panel.style.display = 'none';
                trigger.setAttribute('aria-expanded', 'false');
                isOpen = false;
            };

            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                isOpen ? closePanel() : openPanel();
            });

            document.addEventListener('mousedown', (e) => {
                if (isOpen && !panel.contains(e.target) && !trigger.contains(e.target)) {
                    closePanel();
                }
            });

            // Sync trigger disabled state with select
            const refreshTriggerState = () => {
                trigger.disabled = select.disabled;
                if (select.disabled) closePanel();
                updateDisplay();
            };

            select._refreshCustomTimeDropdown = () => {
                updateDisplay();
                if (isOpen) {
                    syncPanelOptions();
                    positionPanel();
                }
            };

            const disabledObserver = new MutationObserver(refreshTriggerState);
            disabledObserver.observe(select, { attributes: true, attributeFilter: ['disabled'] });

            // Sync display when select value changes externally
            select.addEventListener('change', updateDisplay);

            // Watch for innerHTML changes (option repopulation)
            const optionsObserver = new MutationObserver(() => {
                updateDisplay();
                if (isOpen) { syncPanelOptions(); positionPanel(); }
            });
            optionsObserver.observe(select, { childList: true, subtree: true, characterData: true });

            window.addEventListener('resize', () => { if (isOpen) positionPanel(); });
            window.addEventListener('scroll', () => { if (isOpen) positionPanel(); }, true);

            refreshTriggerState();
        };

        initPerdayTimeSelects();
        bindCustomTimeSelect({
            selectId: 'startTime',
            triggerId: 'startTimeTrigger',
            displayId: 'startTimeDisplay',
            defaultText: 'Pick time'
        });
        bindCustomTimeSelect({
            selectId: 'perdayPickupTime',
            triggerId: 'perdayPickupTimeTrigger',
            displayId: 'perdayPickupTimeDisplay',
            defaultText: 'Select time'
        });
        bindCustomTimeSelect({
            selectId: 'perdayReturnTime',
            triggerId: 'perdayReturnTimeTrigger',
            displayId: 'perdayReturnTimeDisplay',
            defaultText: 'Return time matches pickup time'
        });

        // Initialize
        checkAuth();
