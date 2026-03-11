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
        ? rentalsArray.reduce((sum, rental) => sum + ((rental.price || 0) * (rental.quantity || 1) * perDayDays), 0)
        : subtotal;

    const gstEnabled = window.adminSettings?.gstConfig?.enabled || false;
    const gstRate = window.adminSettings?.gstConfig?.rate || 0.18;

    const taxAmount = gstEnabled ? Math.round(adjustedSubtotal * gstRate) : 0;
    const totalAmount = adjustedSubtotal + taxAmount;

    return {
        formData: {
            bookingMode,
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

    const startTimeEl = document.getElementById('startTime');
    if (startTimeEl) {
        startTimeEl.addEventListener('change', () => {
            populateEndTimeSlots();
            updatePriceDisplay();
        });
    }

    const endTimeEl = document.getElementById('endTime');
    if (endTimeEl) {
        endTimeEl.addEventListener('change', updatePriceDisplay);
    }

    const bookingDateEl = document.getElementById('bookingDate');
    bindBookingDateChange(bookingDateEl);

    const today = new Date().toISOString().split('T')[0];
    if (bookingDateEl) {
        bookingDateEl.setAttribute('min', today);
    }
};

window.initBookingFormHandlers = initBookingFormHandlers;
window.handleBookingFormSubmit = handleBookingFormSubmit;
window.buildBookingFormPayload = buildBookingFormPayload;
