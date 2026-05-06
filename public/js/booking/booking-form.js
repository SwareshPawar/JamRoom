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

const refreshBookingTypeOptions = () => {
    const bookingTypeSelect = document.getElementById('bookingTypeSelect');
    if (!bookingTypeSelect || typeof window.getBookingCategoryOptions !== 'function') return [];

    const options = window.getBookingCategoryOptions();
    const currentValue = String(bookingTypeSelect.value || '').trim();
    const nextValue = currentValue || options[0]?.value || '';

    bookingTypeSelect.innerHTML = [
        '<option value="">Select booking type</option>',
        ...options.map((option) => `<option value="${option.value}">${option.label}</option>`)
    ].join('');

    bookingTypeSelect.disabled = options.length === 0;
    if (nextValue && options.some((option) => option.value === nextValue)) {
        bookingTypeSelect.value = nextValue;
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

    const hasDraftValues =
        !!bookingType.trim() ||
        !!classLocation.trim() ||
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
            if (savedBookingType && bookingTypeEl.querySelector(`option[value="${savedBookingType}"]`)) {
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
    const classPlanMonths = Math.max(1, Number(document.getElementById('classPlanMonths')?.value || 1));
    const isClassBookingCategory = typeof window.isClassBookingCategory === 'function'
        ? window.isClassBookingCategory(bookingType)
        : false;

    if (!bookingType) {
        throw new Error('Please select a booking type from the booking catalog.');
    }

    if (isClassBookingCategory && !classLocation) {
        throw new Error('Please select class location for class booking.');
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
        await loadMyBookings();
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
    if (bookingTypeEl) {
        bookingTypeEl.addEventListener('change', () => {
            const selectedCategory = bookingTypeEl.value;
            if (typeof window.setActiveBookingCategory === 'function') {
                window.setActiveBookingCategory(selectedCategory);
            }
            if (typeof window.refreshClassLocationUI === 'function') {
                window.refreshClassLocationUI();
            }
            if (typeof window.refreshClassPlanInfoUI === 'function') {
                window.refreshClassPlanInfoUI();
            }
            updatePriceDisplay();
            scheduleBookingFormDraftSave();
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
