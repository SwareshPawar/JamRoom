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
let hasBeforeUnloadDraftBinding = false;

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

    return options;
};

window.refreshBookingTypeOptions = refreshBookingTypeOptions;

const collectBookingFormDraft = () => {
    const bookingMode = window.getBookingMode ? window.getBookingMode() : 'hourly';
    const bookingDate = document.getElementById('bookingDate')?.value || '';
    const startTime = document.getElementById('startTime')?.value || '';
    const endTime = document.getElementById('endTime')?.value || '';
    const perdayStartDate = document.getElementById('perdayStartDate')?.value || '';
    const perdayEndDate = document.getElementById('perdayEndDate')?.value || '';
    const perdayPickupTime = document.getElementById('perdayPickupTime')?.value || '';
    const perdayReturnTime = document.getElementById('perdayReturnTime')?.value || '';
    const bandName = document.getElementById('bandName')?.value || '';
    const notes = document.getElementById('notes')?.value || '';
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    const rentalsSnapshot = typeof window.getBookingRentalDraftSnapshot === 'function'
        ? window.getBookingRentalDraftSnapshot()
        : { hourly: [], perday: [] };

    const hasDraftValues =
        !!bookingDate ||
        !!startTime ||
        !!endTime ||
        !!perdayStartDate ||
        !!perdayEndDate ||
        !!perdayPickupTime ||
        !!perdayReturnTime ||
        !!bookingType.trim() ||
        !!bandName.trim() ||
        !!notes.trim() ||
        (Array.isArray(rentalsSnapshot.hourly) && rentalsSnapshot.hourly.length > 0) ||
        (Array.isArray(rentalsSnapshot.perday) && rentalsSnapshot.perday.length > 0);

    if (!hasDraftValues) {
        return null;
    }

    return {
        version: 1,
        savedAt: Date.now(),
        bookingMode,
        bookingDate,
        startTime,
        endTime,
        perdayStartDate,
        perdayEndDate,
        perdayPickupTime,
        perdayReturnTime,
        bookingType,
        bandName,
        notes,
        rentals: rentalsSnapshot
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

        const perdayStartDateEl = document.getElementById('perdayStartDate');
        if (perdayStartDateEl && parsedDraft.perdayStartDate) {
            perdayStartDateEl.value = parsedDraft.perdayStartDate;
        }

        const perdayEndDateEl = document.getElementById('perdayEndDate');
        if (perdayEndDateEl && parsedDraft.perdayEndDate) {
            perdayEndDateEl.value = parsedDraft.perdayEndDate;
        }

        const perdayPickupTimeEl = document.getElementById('perdayPickupTime');
        if (perdayPickupTimeEl && parsedDraft.perdayPickupTime) {
            perdayPickupTimeEl.value = parsedDraft.perdayPickupTime;
        }

        const perdayReturnTimeEl = document.getElementById('perdayReturnTime');
        if (perdayReturnTimeEl && parsedDraft.perdayReturnTime) {
            perdayReturnTimeEl.value = parsedDraft.perdayReturnTime;
        }

        if (typeof window.applyBookingRentalDraftSelection === 'function') {
            window.applyBookingRentalDraftSelection(parsedDraft.rentals || {});
        }

        refreshBookingTypeOptions();

        if (selectedMode === 'hourly') {
            const bookingDateEl = document.getElementById('bookingDate');
            const selectedDate = String(parsedDraft.bookingDate || '').trim();
            if (bookingDateEl && selectedDate) {
                bookingDateEl.value = selectedDate;
            }

            if (selectedDate && typeof loadAvailability === 'function') {
                await loadAvailability(selectedDate);
            }

            const startTimeEl = document.getElementById('startTime');
            if (startTimeEl && parsedDraft.startTime && startTimeEl.querySelector(`option[value="${parsedDraft.startTime}"]`)) {
                startTimeEl.value = parsedDraft.startTime;
            }

            if (typeof populateEndTimeSlots === 'function') {
                populateEndTimeSlots();
            }

            const endTimeEl = document.getElementById('endTime');
            if (endTimeEl && parsedDraft.endTime && endTimeEl.querySelector(`option[value="${parsedDraft.endTime}"]`)) {
                endTimeEl.value = parsedDraft.endTime;
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
        } else if (rental.rentalType === 'persession') {
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

    const adjustedSubtotal = bookingMode === 'perday'
        ? rentalsArray.reduce((sum, rental) => {
            const rentalType = String(rental?.rentalType || 'inhouse').toLowerCase();
            const qty = Math.max(1, Number(rental?.quantity || 1));
            const unitPrice = Number(rental?.price || 0);

            if (rentalType === 'persession') {
                return sum + (unitPrice * qty);
            }

            return sum + (unitPrice * qty * perDayDays);
        }, 0)
        : subtotal;

    const gstEnabled = window.adminSettings?.gstConfig?.enabled || false;
    const gstRate = window.adminSettings?.gstConfig?.rate || 0.18;

    const taxAmount = gstEnabled ? Math.round(adjustedSubtotal * gstRate) : 0;
    const totalAmount = adjustedSubtotal + taxAmount;
    const bookingType = document.getElementById('bookingTypeSelect')?.value.trim() || '';

    if (!bookingType) {
        throw new Error('Please select a booking type from the booking catalog.');
    }

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

    if (form) {
        form.reset();
    }

    if (priceDisplay) {
        priceDisplay.style.display = 'none';
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
    if (bookingDateEl.value) {
        handleDateSelection(bookingDateEl.value.trim());
    }
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
            scheduleBookingFormDraftSave();
        });
    }

    const startTimeEl = document.getElementById('startTime');
    if (startTimeEl) {
        startTimeEl.addEventListener('change', () => {
            populateEndTimeSlots();
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

    const today = new Date().toISOString().split('T')[0];
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

    if (!hasBeforeUnloadDraftBinding) {
        window.addEventListener('beforeunload', saveBookingFormDraft);
        hasBeforeUnloadDraftBinding = true;
    }
};

window.initBookingFormHandlers = initBookingFormHandlers;
window.handleBookingFormSubmit = handleBookingFormSubmit;
window.buildBookingFormPayload = buildBookingFormPayload;
window.saveBookingFormDraft = saveBookingFormDraft;
window.scheduleBookingFormDraftSave = scheduleBookingFormDraftSave;
window.restoreBookingFormDraft = restoreBookingFormDraft;
window.clearBookingFormDraft = clearBookingFormDraft;
