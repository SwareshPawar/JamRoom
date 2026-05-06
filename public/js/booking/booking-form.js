/**
 * Booking form module.
 * Handles booking form validation, submit flow, and field UI state updates.
 */

const setSubmitButtonLoading = (submitBtn, isLoading, loadingText = 'Creating Booking...') => {
    if (!submitBtn) return;

    if (isLoading) {
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.classList.add('loading');
        submitBtn.textContent = loadingText;
        submitBtn.disabled = true;
        return;
    }

    submitBtn.classList.remove('loading');
    submitBtn.textContent = submitBtn.dataset.originalText || 'Book Now';
    submitBtn.disabled = false;
};

const BOOKING_DRAFT_STORAGE_KEY = 'jamroom_booking_form_draft_v1';
const BOOKING_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24;
const BOOKING_CATALOG_PREF_STORAGE_KEY = 'jamroom_booking_catalog_pref_v1';
let bookingTypeOptionsCache = [];
let bookingDraftSaveTimer = null;
let isRestoringBookingDraft = false;
let hasDraftLifecycleBinding = false;

const parseDraftJSON = (rawValue) => {
    if (!rawValue) return null;

    try {
        return JSON.parse(rawValue);
    } catch (error) {
        console.warn('Failed to parse booking draft:', error);
        return null;
    }
};

const clearBookingFormDraft = () => {
    if (bookingDraftSaveTimer) {
        clearTimeout(bookingDraftSaveTimer);
        bookingDraftSaveTimer = null;
    }

    localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
};

const getCatalogPreference = () => {
    const parsed = parseDraftJSON(localStorage.getItem(BOOKING_CATALOG_PREF_STORAGE_KEY));
    if (!parsed || typeof parsed !== 'object') {
        return { lastSelected: '', recentSelections: [] };
    }

    const lastSelected = String(parsed.lastSelected || '').trim();
    const recentSelections = Array.isArray(parsed.recentSelections)
        ? parsed.recentSelections.map((value) => String(value || '').trim()).filter(Boolean)
        : [];

    return { lastSelected, recentSelections };
};

const saveCatalogPreference = (preference) => {
    try {
        localStorage.setItem(BOOKING_CATALOG_PREF_STORAGE_KEY, JSON.stringify(preference));
    } catch (error) {
        console.warn('Failed to persist catalog preference:', error);
    }
};

const getWeekdayLabelFromYmd = (ymd) => {
    const value = String(ymd || '').trim();
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { weekday: 'long' });
};

const recordCatalogSelection = (catalogValue) => {
    const normalizedValue = String(catalogValue || '').trim();
    if (!normalizedValue) return;

    const preference = getCatalogPreference();
    const dedupedRecent = [
        normalizedValue,
        ...preference.recentSelections.filter((value) => value !== normalizedValue)
    ].slice(0, 10);

    saveCatalogPreference({
        lastSelected: normalizedValue,
        recentSelections: dedupedRecent
    });
};

const getBookingTypeOptionValues = () => {
    return bookingTypeOptionsCache
        .map((option) => String(option?.value || '').trim())
        .filter(Boolean);
};

const isKnownBookingTypeValue = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    return getBookingTypeOptionValues().includes(normalized);
};

const setBookingTypeDropdownOpen = (isOpen) => {
    const combobox = document.getElementById('bookingTypeCombobox');
    const dropdown = document.getElementById('bookingTypeDropdown');
    const input = document.getElementById('bookingTypeSelect');
    if (!combobox || !dropdown || !input) return;

    dropdown.hidden = !isOpen;
    combobox.classList.toggle('is-open', isOpen);
    input.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
};

const renderBookingTypeSelectOptions = ({ query = '' } = {}) => {
    const bookingTypeDropdown = document.getElementById('bookingTypeDropdown');
    if (!bookingTypeDropdown) return;

    const normalizedQuery = String(query || '').trim().toLowerCase();
    const filteredOptions = normalizedQuery
        ? bookingTypeOptionsCache.filter((option) => {
            const value = String(option?.value || '').toLowerCase();
            const label = String(option?.label || option?.value || '').toLowerCase();
            return label.includes(normalizedQuery) || value.includes(normalizedQuery);
        })
        : bookingTypeOptionsCache;

    if (filteredOptions.length === 0) {
        bookingTypeDropdown.innerHTML = '<div class="booking-type-dropdown-empty">No matching catalog found</div>';
        return;
    }

    bookingTypeDropdown.innerHTML = filteredOptions
        .map((option) => `
            <button type="button" class="booking-type-option" data-value="${option.value}">
                <span class="booking-type-option-label">${option.label}</span>
            </button>
        `)
        .join('');
};

const refreshBookingTypeOptions = () => {
    const bookingTypeSelect = document.getElementById('bookingTypeSelect');
    const bookingTypeDropdown = document.getElementById('bookingTypeDropdown');
    if (!bookingTypeSelect || !bookingTypeDropdown || typeof window.getBookingCategoryOptions !== 'function') return [];

    const preference = getCatalogPreference();
    const options = [...window.getBookingCategoryOptions()].sort((a, b) => {
        const aValue = String(a?.value || '').trim();
        const bValue = String(b?.value || '').trim();

        const aIsLast = aValue && aValue === preference.lastSelected;
        const bIsLast = bValue && bValue === preference.lastSelected;
        if (aIsLast !== bIsLast) return aIsLast ? -1 : 1;

        const aRecentIndex = preference.recentSelections.indexOf(aValue);
        const bRecentIndex = preference.recentSelections.indexOf(bValue);
        const aRecentRank = aRecentIndex === -1 ? Number.MAX_SAFE_INTEGER : aRecentIndex;
        const bRecentRank = bRecentIndex === -1 ? Number.MAX_SAFE_INTEGER : bRecentIndex;
        if (aRecentRank !== bRecentRank) return aRecentRank - bRecentRank;

        return String(a?.label || aValue).localeCompare(String(b?.label || bValue));
    });
    const currentValue = String(bookingTypeSelect.value || '').trim();
    const nextValue = currentValue || preference.lastSelected || options[0]?.value || '';

    bookingTypeOptionsCache = options.map((option) => ({
        value: String(option?.value || '').trim(),
        label: String(option?.label || option?.value || '').trim()
    })).filter((option) => option.value);

    renderBookingTypeSelectOptions();

    bookingTypeSelect.disabled = bookingTypeOptionsCache.length === 0;
    if (nextValue && isKnownBookingTypeValue(nextValue)) {
        bookingTypeSelect.value = nextValue;
    }

    if (nextValue && options.some((option) => option.value === nextValue)) {
        if (typeof window.setActiveBookingCategory === 'function') {
            window.setActiveBookingCategory(nextValue);
        }
    }

    if (typeof window.refreshClassLocationUI === 'function') {
        window.refreshClassLocationUI();
    }

    return options;
};

window.refreshBookingTypeOptions = refreshBookingTypeOptions;

const collectBookingFormDraft = () => {
    const bookingMode = window.getBookingMode ? window.getBookingMode() : 'hourly';
    const bandName = document.getElementById('bandName')?.value || '';
    const notes = document.getElementById('notes')?.value || '';
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    const classLocation = document.getElementById('classLocation')?.value || '';
    const classPlanMonths = document.getElementById('classPlanMonths')?.value || '1';
    const classPreferredWeekday = document.getElementById('classPreferredWeekday')?.value || '';

    const hasDraftValues =
        !!bookingType.trim() ||
        !!classLocation.trim() ||
        !!classPreferredWeekday.trim() ||
        String(classPlanMonths || '1').trim() !== '1' ||
        !!bandName.trim() ||
        !!notes.trim();

    if (!hasDraftValues) {
        return null;
    }

    return {
        version: 1,
        savedAt: Date.now(),
        bookingMode,
        bookingType,
        classLocation,
        classPreferredWeekday,
        classPlanMonths,
        bandName,
        notes
    };
};

const saveBookingFormDraft = () => {
    if (isRestoringBookingDraft) {
        return;
    }

    const draft = collectBookingFormDraft();
    if (!draft) {
        clearBookingFormDraft();
        return;
    }

    try {
        localStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
        console.warn('Failed to persist booking draft:', error);
    }
};

const scheduleBookingFormDraftSave = (delayMs = 220) => {
    if (bookingDraftSaveTimer) {
        clearTimeout(bookingDraftSaveTimer);
    }

    bookingDraftSaveTimer = setTimeout(() => {
        bookingDraftSaveTimer = null;
        saveBookingFormDraft();
    }, delayMs);
};

const restoreBookingFormDraft = async () => {
    const parsedDraft = parseDraftJSON(localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY));
    if (!parsedDraft || typeof parsedDraft !== 'object') {
        return false;
    }

    const savedAt = Number(parsedDraft.savedAt) || 0;
    if (!savedAt || (Date.now() - savedAt) > BOOKING_DRAFT_MAX_AGE_MS) {
        clearBookingFormDraft();
        return false;
    }

    isRestoringBookingDraft = true;

    try {
        const selectedMode = parsedDraft.bookingMode === 'perday' ? 'perday' : 'hourly';

        const bandNameEl = document.getElementById('bandName');
        if (bandNameEl && typeof parsedDraft.bandName === 'string') {
            bandNameEl.value = parsedDraft.bandName;
        }

        const notesEl = document.getElementById('notes');
        if (notesEl && typeof parsedDraft.notes === 'string') {
            notesEl.value = parsedDraft.notes;
        }

        refreshBookingTypeOptions();

        const bookingTypeEl = document.getElementById('bookingTypeSelect');
        if (bookingTypeEl && typeof parsedDraft.bookingType === 'string') {
            const savedBookingType = parsedDraft.bookingType.trim();
            if (savedBookingType && isKnownBookingTypeValue(savedBookingType)) {
                bookingTypeEl.value = savedBookingType;
                if (typeof window.setActiveBookingCategory === 'function') {
                    window.setActiveBookingCategory(savedBookingType);
                }
            }
        }

        const classLocationEl = document.getElementById('classLocation');
        if (classLocationEl && typeof parsedDraft.classLocation === 'string') {
            classLocationEl.value = parsedDraft.classLocation;
        }

        const classPreferredWeekdayEl = document.getElementById('classPreferredWeekday');
        if (classPreferredWeekdayEl && typeof parsedDraft.classPreferredWeekday === 'string') {
            classPreferredWeekdayEl.value = parsedDraft.classPreferredWeekday;
        }

        const classPlanMonthsEl = document.getElementById('classPlanMonths');
        if (classPlanMonthsEl && typeof parsedDraft.classPlanMonths === 'string') {
            classPlanMonthsEl.value = parsedDraft.classPlanMonths;
        }

        if (typeof window.refreshClassLocationUI === 'function') {
            window.refreshClassLocationUI();
        }
        if (typeof window.refreshClassPlanInfoUI === 'function') {
            window.refreshClassPlanInfoUI();
        }

        const today = getTodayDateString();

        const perdayStartDateEl = document.getElementById('perdayStartDate');
        if (perdayStartDateEl) {
            perdayStartDateEl.value = '';
        }

        const perdayEndDateEl = document.getElementById('perdayEndDate');
        if (perdayEndDateEl) {
            perdayEndDateEl.value = '';
        }

        const perdayPickupTimeEl = document.getElementById('perdayPickupTime');
        if (perdayPickupTimeEl) {
            perdayPickupTimeEl.value = '';
        }

        const perdayReturnTimeEl = document.getElementById('perdayReturnTime');
        if (perdayReturnTimeEl) {
            perdayReturnTimeEl.value = '';
        }

        refreshBookingTypeOptions();

        if (selectedMode === 'hourly') {
            const bookingDateEl = document.getElementById('bookingDate');
            if (bookingDateEl) {
                bookingDateEl.value = '';
            }

            const startTimeEl = document.getElementById('startTime');
            if (startTimeEl) {
                startTimeEl.value = '';
            }

            if (typeof populateEndTimeSlots === 'function') {
                populateEndTimeSlots();
            }

            const endTimeEl = document.getElementById('endTime');
            if (endTimeEl) {
                endTimeEl.value = '';
            }
        } else {
            if (perdayStartDateEl) {
                perdayStartDateEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (perdayEndDateEl) {
                perdayEndDateEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (perdayPickupTimeEl) {
                perdayPickupTimeEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        if (typeof updatePriceDisplay === 'function') {
            updatePriceDisplay();
        }

        return true;
    } catch (error) {
        console.error('Failed to restore booking draft:', error);
        return false;
    } finally {
        isRestoringBookingDraft = false;
    }
};

const buildRentalsForSubmission = (duration) => {
    let subtotal = 0;
    const rentalsArray = [];

    selectedRentals.forEach((rental, key) => {
        if (!rental.name || rental.price === undefined || !rental.quantity) {
            throw new Error(`Invalid rental data for ${key}: missing name, price, or quantity`);
        }

        let itemTotal;
        let effectiveQuantity;

        if (rental.rentalType === 'perday') {
            itemTotal = rental.price * rental.quantity;
            effectiveQuantity = rental.quantity;
        } else if (rental.rentalType === 'persession' || rental.rentalType === 'pertrack') {
            itemTotal = (rental.price || rental.basePrice) * rental.quantity;
            effectiveQuantity = rental.quantity;
        } else if (rental.isRequired || rental.fullId.includes('_base')) {
            itemTotal = (rental.price || rental.basePrice) * rental.quantity * duration;
            effectiveQuantity = rental.quantity;
        } else if (rental.price === 0) {
            itemTotal = 0;
            effectiveQuantity = rental.quantity;
        } else if (rental.name.includes('IEM')) {
            itemTotal = (rental.price || rental.basePrice) * rental.quantity * duration;
            effectiveQuantity = rental.quantity;
        } else {
            itemTotal = (rental.price || rental.basePrice) * duration;
            effectiveQuantity = 1;
        }

        subtotal += itemTotal;

        rentalsArray.push({
            name: rental.name,
            category: rental.category || '',
            description: rental.description || '',
            price: rental.price || rental.basePrice,
            quantity: effectiveQuantity,
            rentalType: rental.rentalType || 'inhouse'
        });
    });

    return { rentalsArray, subtotal };
};

const buildBookingFormPayload = () => {
    const bookingMode = window.getBookingMode ? window.getBookingMode() : 'hourly';

    let startTime;
    let endTime;
    let duration;
    let bookingDate;
    let perDayStartDate;
    let perDayEndDate;
    let perDayPickupTime;
    let perDayReturnTime;
    let perDayDays = 0;

    if (bookingMode === 'perday') {
        const perDayInfo = window.getPerDayBookingInfo
            ? window.getPerDayBookingInfo()
            : { startDate: '', endDate: '', pickupTime: '', returnTime: '', days: 0, isValid: false, validationMessage: '' };

        perDayStartDate = perDayInfo.startDate;
        perDayEndDate = perDayInfo.endDate;
        perDayPickupTime = perDayInfo.pickupTime;
        perDayReturnTime = perDayInfo.returnTime;
        perDayDays = Number(perDayInfo.days) || 0;

        if (!perDayStartDate || !perDayEndDate || !perDayPickupTime || !perDayReturnTime) {
            throw new Error('Please select per-day start/end date and pick-up/return time.');
        }

        if (!perDayInfo.isValid || perDayDays < 1) {
            throw new Error(perDayInfo.validationMessage || 'Return time must be in exact 24-hour blocks from pick-up.');
        }

        bookingDate = perDayStartDate;
        startTime = perDayPickupTime;
        endTime = perDayReturnTime;
        duration = perDayDays * 24;
    } else {
        startTime = document.getElementById('startTime')?.value;
        endTime = document.getElementById('endTime')?.value;
        bookingDate = document.getElementById('bookingDate')?.value;

        if (!bookingDate) {
            throw new Error('Please select a booking date.');
        }

        if (!startTime || !endTime) {
            throw new Error('Please select valid start and end times.');
        }

        duration = calculateDuration(startTime, endTime);
    }

    const { rentalsArray, subtotal } = buildRentalsForSubmission(duration);

    let adjustedSubtotal = bookingMode === 'perday'
        ? rentalsArray.reduce((sum, rental) => {
            const rentalType = String(rental?.rentalType || 'inhouse').toLowerCase();
            const qty = Math.max(1, Number(rental?.quantity || 1));
            const unitPrice = Number(rental?.price || 0);

            if (rentalType === 'persession' || rentalType === 'pertrack') {
                return sum + (unitPrice * qty);
            }

            return sum + (unitPrice * qty * perDayDays);
        }, 0)
        : subtotal;

    const bookingType = document.getElementById('bookingTypeSelect')?.value.trim() || '';
    const classLocation = document.getElementById('classLocation')?.value.trim() || '';
    const classPreferredWeekday = document.getElementById('classPreferredWeekday')?.value.trim() || '';
    const classPreferredStartTime = document.getElementById('startTime')?.value.trim() || '';
    const classPlanMonths = Math.max(1, Number(document.getElementById('classPlanMonths')?.value || 1));
    const isClassBookingCategory = typeof window.isClassBookingCategory === 'function'
        ? window.isClassBookingCategory(bookingType)
        : false;

    if (!bookingType) {
        throw new Error('Please select a booking type from the booking catalog.');
    }

    if (!isKnownBookingTypeValue(bookingType)) {
        throw new Error('Please select a valid catalog from the dropdown suggestions.');
    }

    if (isClassBookingCategory && !classLocation) {
        throw new Error('Please select class location for class booking.');
    }

    if (isClassBookingCategory && !classPreferredWeekday) {
        throw new Error('Please select preferred weekly class day.');
    }

    if (isClassBookingCategory && !classPreferredStartTime) {
        throw new Error('Please select class time.');
    }

    if (isClassBookingCategory && rentalsArray.length !== 1) {
        throw new Error('Please select exactly one class item for class booking.');
    }

    if (isClassBookingCategory) {
        const classConfig = typeof window.getClassConfig === 'function'
            ? window.getClassConfig()
            : { monthlyFee: Number(window.adminSettings?.classConfig?.monthlyFee || 0), multiMonthDiscounts: [] };
        const monthlyFee = Math.max(0, Number(classConfig.monthlyFee || 0));
        const totalBeforeDiscount = monthlyFee * classPlanMonths;
        const discountAmount = typeof window.getClassDiscountForMonths === 'function'
            ? window.getClassDiscountForMonths(classPlanMonths, classConfig, totalBeforeDiscount)
            : 0;
        adjustedSubtotal = Math.max(0, totalBeforeDiscount - discountAmount);
    }

    const gstEnabled = window.adminSettings?.gstConfig?.enabled || false;
    const gstRate = window.adminSettings?.gstConfig?.rate || 0.18;

    const taxAmount = gstEnabled ? Math.round(adjustedSubtotal * gstRate) : 0;
    const totalAmount = adjustedSubtotal + taxAmount;

    return {
        formData: {
            bookingMode,
            rentalType: bookingType,
            date: bookingDate,
            startTime,
            endTime,
            duration,
            rentals: rentalsArray,
            subtotal: adjustedSubtotal,
            taxAmount,
            totalAmount,
            classLocation: isClassBookingCategory ? classLocation : undefined,
            classPreferredWeekday: isClassBookingCategory ? classPreferredWeekday : undefined,
            classPreferredStartTime: isClassBookingCategory ? classPreferredStartTime : undefined,
            classPlanMonths: isClassBookingCategory ? classPlanMonths : undefined,
            bandName: document.getElementById('bandName')?.value || '',
            notes: document.getElementById('notes')?.value || '',
            perDayStartDate: bookingMode === 'perday' ? perDayStartDate : undefined,
            perDayEndDate: bookingMode === 'perday' ? perDayEndDate : undefined,
            perDayPickupTime: bookingMode === 'perday' ? perDayPickupTime : undefined,
            perDayReturnTime: bookingMode === 'perday' ? perDayReturnTime : undefined,
            perDayDays: bookingMode === 'perday' ? perDayDays : undefined
        }
    };
};

const resetBookingFormState = () => {
    const form = document.getElementById('bookingForm');
    const priceDisplay = document.getElementById('priceDisplay');
    const today = getTodayDateString();

    if (form) {
        form.reset();
    }

    const bookingDateEl = document.getElementById('bookingDate');
    if (bookingDateEl) {
        bookingDateEl.value = today;
        bookingDateEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const perdayStartDateEl = document.getElementById('perdayStartDate');
    if (perdayStartDateEl) {
        perdayStartDateEl.value = today;
        perdayStartDateEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const perdayEndDateEl = document.getElementById('perdayEndDate');
    if (perdayEndDateEl) {
        perdayEndDateEl.value = today;
        perdayEndDateEl.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (priceDisplay) {
        priceDisplay.style.display = 'none';
    }

    const classLocationEl = document.getElementById('classLocation');
    if (classLocationEl) {
        classLocationEl.value = '';
    }

    const classPlanMonthsEl = document.getElementById('classPlanMonths');
    if (classPlanMonthsEl) {
        classPlanMonthsEl.value = '1';
    }

    const classPreferredWeekdayEl = document.getElementById('classPreferredWeekday');
    if (classPreferredWeekdayEl) {
        classPreferredWeekdayEl.value = '';
    }

    if (typeof window.resetBookingRentalState === 'function') {
        window.resetBookingRentalState();
    } else {
        selectedRentals.clear();
    }

    refreshBookingTypeOptions();

    clearBookingFormDraft();
};

const handleBookingFormSubmit = async (e) => {
    e.preventDefault();

    if (selectedRentals.size === 0) {
        showAlert('Please select at least one rental option.', 'error');
        return;
    }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    setSubmitButtonLoading(submitBtn, true);
    showLoadingOverlay('Creating your booking...');

    try {
        if (!window.createBookingRequest) {
            throw new Error('Booking API module not loaded. Please refresh the page.');
        }

        const { formData } = buildBookingFormPayload();
        const submittedMode = formData.bookingMode;
        const data = await window.createBookingRequest(formData);

        hideLoadingOverlay();
        showAlert('Booking created successfully! Pending admin approval.', 'success');

        if (window.renderBookingPaymentSection) {
            window.renderBookingPaymentSection(data);
        }

        clearBookingFormDraft();
        resetBookingFormState();
        if (typeof window.loadMyBookings === 'function') {
            await window.loadMyBookings();
        }
        if (submittedMode === 'hourly') {
            await loadAvailability(formData.date);
        }
    } catch (error) {
        hideLoadingOverlay();
        showAlert(error.message, 'error');
        console.error('Booking submission error:', error);
    } finally {
        setSubmitButtonLoading(submitBtn, false);
    }
};

const bindBookingDateChange = (bookingDateEl) => {
    if (!bookingDateEl) return;

    let previousDateValue = null;

    const handleDateSelection = async (selectedDate) => {
        if (selectedDate === previousDateValue) {
            return;
        }

        previousDateValue = selectedDate;
        const startTimeSelect = document.getElementById('startTime');
        const endTimeSelect = document.getElementById('endTime');

        if (startTimeSelect && endTimeSelect) {
            startTimeSelect.innerHTML = '<option value="">Select date first</option>';
            endTimeSelect.innerHTML = '<option value="">Select start time first</option>';
            startTimeSelect.disabled = true;
            endTimeSelect.disabled = true;

            if (selectedDate) {
                await loadAvailability(selectedDate);
            } else {
                const timeline = document.getElementById('referenceTimeline');
                if (timeline) {
                    timeline.innerHTML = '<div class="loading-text">Select a date to view availability</div>';
                }
                window.currentAvailabilityData = null;
            }
        } else {
            const timeline = document.getElementById('referenceTimeline');
            if (timeline) {
                timeline.innerHTML = '<div class="loading-text">Select a date to view availability</div>';
            }
            window.currentAvailabilityData = null;
        }

        if (typeof window.refreshClassPlanInfoUI === 'function') {
            window.refreshClassPlanInfoUI();
        }
        updatePriceDisplay();
    };

    const onDateChange = async (e) => {
        const selectedDate = (e?.target?.value || bookingDateEl.value || '').trim();
        await handleDateSelection(selectedDate);

        const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
        const isClass = typeof window.isClassBookingCategory === 'function' && window.isClassBookingCategory(bookingType);
        if (isClass) {
            const classPreferredWeekdayEl = document.getElementById('classPreferredWeekday');
            const preferredLabel = getWeekdayLabelFromYmd(selectedDate);
            if (classPreferredWeekdayEl && preferredLabel && !classPreferredWeekdayEl.value) {
                classPreferredWeekdayEl.value = preferredLabel;
            }
        }

        scheduleBookingFormDraftSave();
    };

    bookingDateEl.addEventListener('change', onDateChange);
    bookingDateEl.addEventListener('input', onDateChange);

    // Some mobile browsers restore form values without firing input/change.
    const initialDate = bookingDateEl.value ? bookingDateEl.value.trim() : '';
    bookingDateEl.value = initialDate;
    handleDateSelection(initialDate);
};

const initBookingFormHandlers = () => {
    const bookingForm = document.getElementById('bookingForm');
    if (bookingForm) {
        bookingForm.addEventListener('submit', handleBookingFormSubmit);
    }

    const bookingTypeEl = document.getElementById('bookingTypeSelect');
    const bookingTypeDropdownEl = document.getElementById('bookingTypeDropdown');
    const bookingTypeToggleEl = document.getElementById('bookingTypeToggle');
    if (bookingTypeEl && bookingTypeDropdownEl) {
        let isSelectingFromDropdown = false;
        let highlightedOptionIndex = -1;

        const getDropdownOptionButtons = () => {
            return Array.from(bookingTypeDropdownEl.querySelectorAll('.booking-type-option'));
        };

        const setHighlightedOption = (nextIndex) => {
            const optionButtons = getDropdownOptionButtons();
            if (optionButtons.length === 0) {
                highlightedOptionIndex = -1;
                return;
            }

            const boundedIndex = Math.max(0, Math.min(nextIndex, optionButtons.length - 1));
            highlightedOptionIndex = boundedIndex;

            optionButtons.forEach((button, index) => {
                button.classList.toggle('is-active', index === boundedIndex);
            });

            optionButtons[boundedIndex].scrollIntoView({ block: 'nearest' });
        };

        const selectHighlightedOption = () => {
            const optionButtons = getDropdownOptionButtons();
            const activeButton = optionButtons[highlightedOptionIndex];
            if (!activeButton) return false;

            const selectedValue = String(activeButton.dataset.value || '').trim();
            if (!selectedValue) return false;

            bookingTypeEl.value = selectedValue;
            handleBookingTypeChange({ strict: true });
            setBookingTypeDropdownOpen(false);
            highlightedOptionIndex = -1;
            return true;
        };

        const handleBookingTypeChange = ({ strict = false } = {}) => {
            const selectedCategory = String(bookingTypeEl.value || '').trim();
            if (isKnownBookingTypeValue(selectedCategory) && typeof window.setActiveBookingCategory === 'function') {
                window.setActiveBookingCategory(selectedCategory);
                recordCatalogSelection(selectedCategory);
            }

            if (strict && selectedCategory && !isKnownBookingTypeValue(selectedCategory)) {
                bookingTypeEl.value = '';
                renderBookingTypeSelectOptions();
                if (typeof window.refreshClassLocationUI === 'function') {
                    window.refreshClassLocationUI();
                }
                return;
            }

            // Restore full suggestion list after selection/validation.
            renderBookingTypeSelectOptions();

            if (typeof window.refreshClassLocationUI === 'function') {
                window.refreshClassLocationUI();
            }
            if (typeof window.refreshClassPlanInfoUI === 'function') {
                window.refreshClassPlanInfoUI();
            }
            updatePriceDisplay();
            scheduleBookingFormDraftSave();
        };

        bookingTypeEl.addEventListener('input', () => {
            const term = String(bookingTypeEl.value || '').trim();
            renderBookingTypeSelectOptions({ query: term });
            setBookingTypeDropdownOpen(true);
            highlightedOptionIndex = -1;

            if (isKnownBookingTypeValue(term)) {
                handleBookingTypeChange();
            }
        });

        bookingTypeEl.addEventListener('change', () => {
            handleBookingTypeChange({ strict: true });
        });

        bookingTypeEl.addEventListener('focus', () => {
            renderBookingTypeSelectOptions({ query: bookingTypeEl.value });
            setBookingTypeDropdownOpen(true);
            highlightedOptionIndex = -1;
        });

        bookingTypeDropdownEl.addEventListener('mousedown', (event) => {
            // Prevent input from losing focus when clicking inside the dropdown.
            // This stops the blur event from firing mid-selection, which would
            // clear the typed search text before the click handler can set the value.
            event.preventDefault();
        });

        bookingTypeDropdownEl.addEventListener('mousemove', (event) => {
            const optionButton = event.target.closest('.booking-type-option');
            if (!optionButton) return;
            const optionButtons = getDropdownOptionButtons();
            const index = optionButtons.indexOf(optionButton);
            if (index >= 0) {
                setHighlightedOption(index);
            }
        });

        bookingTypeDropdownEl.addEventListener('click', (event) => {
            const optionButton = event.target.closest('.booking-type-option');
            if (!optionButton) return;

            const selectedValue = String(optionButton.dataset.value || '').trim();
            if (!selectedValue) return;

            bookingTypeEl.value = selectedValue;
            handleBookingTypeChange({ strict: true });
            setBookingTypeDropdownOpen(false);
            highlightedOptionIndex = -1;
            isSelectingFromDropdown = false;
        });

        if (bookingTypeToggleEl) {
            bookingTypeToggleEl.addEventListener('click', () => {
                const willOpen = bookingTypeDropdownEl.hidden;
                renderBookingTypeSelectOptions({ query: bookingTypeEl.value });
                setBookingTypeDropdownOpen(willOpen);
                highlightedOptionIndex = -1;
                if (willOpen) bookingTypeEl.focus();
            });
        }

        document.addEventListener('click', (event) => {
            const combobox = document.getElementById('bookingTypeCombobox');
            if (!combobox) return;
            if (!combobox.contains(event.target)) {
                setBookingTypeDropdownOpen(false);
                highlightedOptionIndex = -1;
            }
        });

        bookingTypeEl.addEventListener('blur', () => {
            if (isSelectingFromDropdown) {
                isSelectingFromDropdown = false;
                return;
            }
            handleBookingTypeChange({ strict: true });
            setBookingTypeDropdownOpen(false);
            highlightedOptionIndex = -1;
        });

        bookingTypeEl.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setBookingTypeDropdownOpen(false);
                highlightedOptionIndex = -1;
            }

            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (bookingTypeDropdownEl.hidden) {
                    renderBookingTypeSelectOptions({ query: bookingTypeEl.value });
                    setBookingTypeDropdownOpen(true);
                }
                setHighlightedOption(highlightedOptionIndex < 0 ? 0 : highlightedOptionIndex + 1);
                return;
            }

            if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (bookingTypeDropdownEl.hidden) {
                    renderBookingTypeSelectOptions({ query: bookingTypeEl.value });
                    setBookingTypeDropdownOpen(true);
                }
                const optionButtons = getDropdownOptionButtons();
                const startIndex = highlightedOptionIndex < 0 ? optionButtons.length - 1 : highlightedOptionIndex - 1;
                setHighlightedOption(startIndex);
                return;
            }

            if (event.key === ' ' && !bookingTypeDropdownEl.hidden) {
                if (selectHighlightedOption()) {
                    event.preventDefault();
                }
                return;
            }

            if (event.key === 'Enter' && !bookingTypeDropdownEl.hidden && highlightedOptionIndex >= 0) {
                if (selectHighlightedOption()) {
                    event.preventDefault();
                }
                return;
            }

        });
    }

    const classLocationEl = document.getElementById('classLocation');
    if (classLocationEl) {
        classLocationEl.addEventListener('change', () => {
            scheduleBookingFormDraftSave();
        });
    }

    const classPlanMonthsEl = document.getElementById('classPlanMonths');
    if (classPlanMonthsEl) {
        classPlanMonthsEl.addEventListener('change', () => {
            if (typeof window.refreshClassPlanInfoUI === 'function') {
                window.refreshClassPlanInfoUI();
            }
            updatePriceDisplay();
            scheduleBookingFormDraftSave();
        });
    }

    const classPreferredWeekdayEl = document.getElementById('classPreferredWeekday');
    if (classPreferredWeekdayEl) {
        classPreferredWeekdayEl.addEventListener('change', () => {
            scheduleBookingFormDraftSave();
        });
    }

    const startTimeEl = document.getElementById('startTime');
    if (startTimeEl) {
        startTimeEl.addEventListener('change', () => {
            const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
            const isClass = typeof window.isClassBookingCategory === 'function' && window.isClassBookingCategory(bookingType);
            if (isClass && startTimeEl.value) {
                // Auto-set end time based on class session duration configured in admin settings
                const classConfig = typeof window.getClassConfig === 'function' ? window.getClassConfig() : { sessionDurationHours: 1 };
                const sessionDurationHours = Math.max(1, Number(classConfig.sessionDurationHours || 1));
                const [h, m] = startTimeEl.value.split(':').map(Number);
                const endHour = (h + sessionDurationHours) % 24;
                const endTimeVal = `${String(endHour).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
                const endTimeEl = document.getElementById('endTime');
                if (endTimeEl) {
                    let opt = endTimeEl.querySelector(`option[value="${endTimeVal}"]`);
                    if (!opt) {
                        opt = document.createElement('option');
                        opt.value = endTimeVal;
                        opt.textContent = endTimeVal;
                        endTimeEl.appendChild(opt);
                    }
                    endTimeEl.value = endTimeVal;
                    endTimeEl.disabled = false;
                }
            } else {
                populateEndTimeSlots();
            }
            updatePriceDisplay();
            scheduleBookingFormDraftSave();
        });
    }

    const endTimeEl = document.getElementById('endTime');
    if (endTimeEl) {
        endTimeEl.addEventListener('change', () => {
            updatePriceDisplay();
            scheduleBookingFormDraftSave();
        });
    }

    const bookingDateEl = document.getElementById('bookingDate');
    bindBookingDateChange(bookingDateEl);

    const today = getTodayDateString();
    if (bookingDateEl) {
        bookingDateEl.setAttribute('min', today);
    }

    refreshBookingTypeOptions();

    if (bookingForm) {
        bookingForm.addEventListener('input', (event) => {
            const targetId = event?.target?.id;
            if (targetId === 'bandName' || targetId === 'notes') {
                scheduleBookingFormDraftSave();
            }
        });

        bookingForm.addEventListener('change', () => {
            scheduleBookingFormDraftSave();
        });
    }

    if (!hasDraftLifecycleBinding) {
        window.addEventListener('pagehide', saveBookingFormDraft);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                saveBookingFormDraft();
            }
        });
        hasDraftLifecycleBinding = true;
    }
};

window.initBookingFormHandlers = initBookingFormHandlers;
window.handleBookingFormSubmit = handleBookingFormSubmit;
window.buildBookingFormPayload = buildBookingFormPayload;
window.saveBookingFormDraft = saveBookingFormDraft;
window.scheduleBookingFormDraftSave = scheduleBookingFormDraftSave;
window.restoreBookingFormDraft = restoreBookingFormDraft;
window.clearBookingFormDraft = clearBookingFormDraft;
