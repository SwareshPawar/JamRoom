/**
 * Booking availability/time-slot module.
 * Contains schedule loading and start/end time filtering helpers.
 */

// Single source of truth for studio time slots.
// Generates hourly slots between startHour and endHour (inclusive).
const buildTimeSlots = (startHour = 9, endHour = 23) => {
    const slots = [];
    for (let h = startHour; h <= endHour; h++) {
        const hh = String(h).padStart(2, '0');
        const period = h >= 12 ? 'PM' : 'AM';
        const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        slots.push({ value: `${hh}:00`, label: `${displayHour}:00 ${period}`, hour: h });
    }
    return slots;
};

const allTimeSlots = buildTimeSlots();

const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const hasFutureStartSlotsForToday = (selectedDate) => {
    const now = new Date();
    const todayLocal = getLocalDateString(now);
    if (selectedDate !== todayLocal) {
        return true;
    }

    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    return allTimeSlots.some((slot) => (slot.hour * 60) > currentTimeInMinutes);
};

let availabilityRequestSeq = 0;
let activeAvailabilityController = null;

const setHourlyAvailabilityVisibility = (isVisible) => {
    const view = document.getElementById('hourlyAvailabilityView');
    if (!view) return;
    view.hidden = !isVisible;
};

const setPerdayAvailabilityVisibility = (isVisible) => {
    const view = document.getElementById('perdayReferenceView');
    if (!view) return;
    view.hidden = !isVisible;
};

const getHourlyUnavailableRanges = (availabilityData) => {
    const unavailableRanges = [];

    if (availabilityData && Array.isArray(availabilityData.bookings)) {
        availabilityData.bookings.forEach((booking) => {
            if (booking.bookingStatus === 'CONFIRMED') {
                unavailableRanges.push({
                    start: booking.startTime,
                    end: booking.endTime,
                    type: 'booking'
                });
            }
        });
    }

    if (availabilityData && Array.isArray(availabilityData.blockedTimes)) {
        availabilityData.blockedTimes.forEach((blocked) => {
            unavailableRanges.push({
                start: blocked.startTime,
                end: blocked.endTime,
                type: 'blocked'
            });
        });
    }

    return unavailableRanges;
};

// Populate start time slots based on selected date and availability
const populateStartTimeSlots = async (selectedDate, availabilityData) => {
    const startTimeSelect = document.getElementById('startTime');
    const loadingEl = document.getElementById('startTimeLoading');

    if (!startTimeSelect) {
        return;
    }

    // Flat-rate track/session bookings do not require slot picking.
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    if (typeof window.isFlatRateSessionBookingCategory === 'function' && window.isFlatRateSessionBookingCategory(bookingType)) {
        if (loadingEl) loadingEl.style.display = 'none';
        startTimeSelect.innerHTML = '<option value="">No time needed</option>';
        startTimeSelect.disabled = true;
        populateEndTimeSlots('', selectedDate, null);
        return;
    }

    // For class bookings, show all time slots without availability filtering
    if (typeof window.isClassBookingCategory === 'function' && window.isClassBookingCategory(bookingType)) {
        if (loadingEl) loadingEl.style.display = 'none';
        startTimeSelect.innerHTML = '<option value="">Pick class time</option>';
        allTimeSlots.forEach(slot => {
            const option = document.createElement('option');
            option.value = slot.value;
            option.textContent = slot.label;
            startTimeSelect.appendChild(option);
        });
        startTimeSelect.disabled = false;
        populateEndTimeSlots(startTimeSelect.value || '', selectedDate, null);
        return;
    }

    // Show loading state
    if (loadingEl) {
        loadingEl.style.display = 'block';
    }
    startTimeSelect.disabled = true;

    startTimeSelect.innerHTML = '<option value="">Loading...</option>';

    if (!selectedDate) {
        startTimeSelect.innerHTML = '<option value="">Pick date first</option>';
        populateEndTimeSlots('', selectedDate, null);
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        return;
    }

    try {
        const now = new Date();
        const todayStr = getLocalDateString(now);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        const unavailableRanges = getHourlyUnavailableRanges(availabilityData);

        // Reset and populate start time options
        startTimeSelect.innerHTML = '<option value="">Pick time</option>';

        let hasAvailableSlots = false;

        allTimeSlots.forEach(slot => {
            // Skip past times for today
            if (selectedDate === todayStr) {
                // Convert current time and slot time to minutes for accurate comparison
                const currentTimeInMinutes = currentHour * 60 + currentMinute;
                const slotTimeInMinutes = slot.hour * 60; // Slot minutes are always 0 (:00)

                // Skip slots that are in the past
                if (slotTimeInMinutes <= currentTimeInMinutes) {
                    return;
                }
            }

            // Check if this time slot is available (not overlapping with bookings/blocks)
            const isAvailable = !isTimeSlotUnavailable(slot.value, unavailableRanges);

            if (isAvailable) {
                const option = document.createElement('option');
                option.value = slot.value;
                option.textContent = slot.label;
                startTimeSelect.appendChild(option);
                hasAvailableSlots = true;
            }
        });

        if (!hasAvailableSlots) {
            const noSlotMessage = selectedDate === todayStr
                ? 'No slots left today. Choose another date.'
                : 'No available time slots for this date';

            startTimeSelect.innerHTML = `<option value="">${noSlotMessage}</option>`;
            startTimeSelect.disabled = true;
        } else {
            startTimeSelect.disabled = false;
        }

        populateEndTimeSlots(startTimeSelect.value || '', selectedDate, availabilityData);

    } catch (error) {
        console.error('Error populating time slots:', error);
        startTimeSelect.innerHTML = '<option value="">Error loading times</option>';
        populateEndTimeSlots('', selectedDate, null);
    } finally {
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }
};

// Helper function to check if a time slot overlaps with unavailable ranges
const isTimeSlotUnavailable = (timeSlot, unavailableRanges) => {
    const [slotHour, slotMinute] = timeSlot.split(':').map(Number);
    const slotTimeInMinutes = slotHour * 60 + slotMinute;

    return unavailableRanges.some(range => {
        const [startHour, startMinute] = range.start.split(':').map(Number);
        const [endHour, endMinute] = range.end.split(':').map(Number);

        const startTimeInMinutes = startHour * 60 + startMinute;
        let endTimeInMinutes = endHour * 60 + endMinute;

        // Handle midnight crossover
        if (endTimeInMinutes <= startTimeInMinutes) {
            endTimeInMinutes += 24 * 60;
        }

        // Check if slot time falls within the unavailable range
        return slotTimeInMinutes >= startTimeInMinutes && slotTimeInMinutes < endTimeInMinutes;
    });
};

const populateEndTimeSlots = (selectedStartTime, selectedDate, availabilityData = window.currentAvailabilityData) => {
    const endTimeSelect = document.getElementById('endTime');
    if (!endTimeSelect) {
        return;
    }

    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    const isFlatRateCategory = typeof window.isFlatRateSessionBookingCategory === 'function'
        ? window.isFlatRateSessionBookingCategory(bookingType)
        : false;
    const isClassCategory = typeof window.isClassBookingCategory === 'function'
        ? window.isClassBookingCategory(bookingType)
        : false;

    if (isFlatRateCategory) {
        endTimeSelect.innerHTML = '<option value="">No time needed</option>';
        endTimeSelect.disabled = true;
        endTimeSelect.value = '';
        if (typeof endTimeSelect._refreshCustomTimeDropdown === 'function') {
            endTimeSelect._refreshCustomTimeDropdown();
        }
        return;
    }

    if (isClassCategory) {
        endTimeSelect.innerHTML = '<option value="">Auto based on class duration</option>';
        endTimeSelect.disabled = true;
        endTimeSelect.value = '';
        if (typeof endTimeSelect._refreshCustomTimeDropdown === 'function') {
            endTimeSelect._refreshCustomTimeDropdown();
        }
        return;
    }

    if (!selectedDate) {
        endTimeSelect.innerHTML = '<option value="">Pick date first</option>';
        endTimeSelect.disabled = true;
        endTimeSelect.value = '';
        if (typeof endTimeSelect._refreshCustomTimeDropdown === 'function') {
            endTimeSelect._refreshCustomTimeDropdown();
        }
        return;
    }

    if (!selectedStartTime) {
        endTimeSelect.innerHTML = '<option value="">Pick start time first</option>';
        endTimeSelect.disabled = true;
        endTimeSelect.value = '';
        if (typeof endTimeSelect._refreshCustomTimeDropdown === 'function') {
            endTimeSelect._refreshCustomTimeDropdown();
        }
        return;
    }

    const unavailableRanges = getHourlyUnavailableRanges(availabilityData);
    const selectedStartMinutes = timeToMinutes(selectedStartTime);

    endTimeSelect.innerHTML = '<option value="">Pick end time</option>';

    allTimeSlots.forEach((slot) => {
        if (timeToMinutes(slot.value) <= selectedStartMinutes) {
            return;
        }

        if (isHourlyRangeUnavailable(selectedStartTime, slot.value, unavailableRanges)) {
            return;
        }

        const option = document.createElement('option');
        option.value = slot.value;
        option.textContent = slot.label;
        endTimeSelect.appendChild(option);
    });

    const hasChoices = endTimeSelect.options.length > 1;
    if (!hasChoices) {
        endTimeSelect.innerHTML = '<option value="">No valid end times</option>';
        endTimeSelect.disabled = true;
        endTimeSelect.value = '';
    } else {
        endTimeSelect.disabled = false;
        if (endTimeSelect.value) {
            const hasExisting = Array.from(endTimeSelect.options).some((option) => option.value === endTimeSelect.value);
            if (!hasExisting) {
                endTimeSelect.value = '';
            }
        }
    }

    if (typeof endTimeSelect._refreshCustomTimeDropdown === 'function') {
        endTimeSelect._refreshCustomTimeDropdown();
    }
};

const timeToMinutes = (value) => {
    const [hours, minutes] = String(value || '').split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
        return -1;
    }
    return (hours * 60) + minutes;
};

const isHourlyRangeUnavailable = (rangeStart, rangeEnd, unavailableRanges) => {
    const requestStart = timeToMinutes(rangeStart);
    let requestEnd = timeToMinutes(rangeEnd);
    if (requestStart < 0 || requestEnd < 0) {
        return true;
    }

    if (requestEnd <= requestStart) {
        requestEnd += 24 * 60;
    }

    return unavailableRanges.some((range) => {
        const rangeStartMin = timeToMinutes(range.start);
        let rangeEndMin = timeToMinutes(range.end);
        if (rangeStartMin < 0 || rangeEndMin < 0) {
            return false;
        }

        if (rangeEndMin <= rangeStartMin) {
            rangeEndMin += 24 * 60;
        }

        return requestStart < rangeEndMin && requestEnd > rangeStartMin;
    });
};

// Legacy function for backward compatibility
const populateTimeSlots = async () => {
    const dateInput = document.getElementById('bookingDate');
    if (dateInput && dateInput.value) {
        await loadAvailability(dateInput.value);
    } else {
        // Reset the startTime select if no date is selected
        const startTimeSelect = document.getElementById('startTime');
        if (startTimeSelect) {
            startTimeSelect.innerHTML = '<option value="">Select date first</option>';
            startTimeSelect.disabled = true;
        }
    }
};

// Load availability reference for selected date
const loadAvailability = async (date) => {
    const container = document.getElementById('referenceTimeline');
    const startTimeSelect = document.getElementById('startTime');
    const startTimeLoadingEl = document.getElementById('startTimeLoading');

    // For flat-rate track/session bookings: date/time availability is not needed.
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    if (typeof window.isFlatRateSessionBookingCategory === 'function' && window.isFlatRateSessionBookingCategory(bookingType)) {
        await populateStartTimeSlots('', null);
        if (container) {
            container.innerHTML = '';
        }
        setHourlyAvailabilityVisibility(false);
        window.currentAvailabilityData = null;
        return;
    }

    // For class bookings: skip the hourly timeline fetch entirely.
    if (typeof window.isClassBookingCategory === 'function' && window.isClassBookingCategory(bookingType)) {
        // Keep class time dropdown functional while bypassing hourly conflict API.
        await populateStartTimeSlots(date, null);
        if (container) {
            container.innerHTML = '';
        }
        setHourlyAvailabilityVisibility(false);
        window.currentAvailabilityData = null;
        return;
    }

    if (!container) {
        await populateStartTimeSlots(date, null);
        setHourlyAvailabilityVisibility(false);
        return;
    }

    if (!date) {
        availabilityRequestSeq += 1;
        if (activeAvailabilityController) {
            activeAvailabilityController.abort();
            activeAvailabilityController = null;
        }
        container.innerHTML = '';
        setHourlyAvailabilityVisibility(false);
        window.currentAvailabilityData = null;

        if (startTimeSelect) {
            startTimeSelect.innerHTML = '<option value="">Pick date first</option>';
            startTimeSelect.disabled = true;
        }
        populateEndTimeSlots('', '', null);
        if (startTimeLoadingEl) {
            startTimeLoadingEl.style.display = 'none';
        }
        return;
    }

    if (startTimeSelect) {
        startTimeSelect.innerHTML = '<option value="">Loading available slots...</option>';
        startTimeSelect.disabled = true;
    }
    if (startTimeLoadingEl) {
        startTimeLoadingEl.style.display = 'block';
    }

    const requestId = ++availabilityRequestSeq;

    if (activeAvailabilityController) {
        activeAvailabilityController.abort();
    }

    container.innerHTML = '';
    setHourlyAvailabilityVisibility(false);

    let timeoutId;
    const controller = new AbortController();
    activeAvailabilityController = controller;
    try {
        const token = localStorage.getItem('token');
        timeoutId = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(`${API_URL}/api/bookings/availability/${date}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });

        if (!res.ok) {
            throw new Error(`Failed to load availability: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        console.log('Availability data loaded:', data);

        const activeDate = document.getElementById('bookingDate')?.value || '';
        if (requestId !== availabilityRequestSeq || activeDate !== date) {
            return;
        }

        // Store availability data globally for time slot filtering
        window.currentAvailabilityData = data;

        // Update the timeline display
        displayAvailability(data);

        // Update available time slots based on this data
        await populateStartTimeSlots(date, data);

    } catch (error) {
        const activeDate = document.getElementById('bookingDate')?.value || '';
        const isStaleRequest = requestId !== availabilityRequestSeq || activeDate !== date;
        if (isStaleRequest) {
            return;
        }

        console.error('Error loading availability:', error);

        if (error.name === 'AbortError') {
            container.innerHTML = '';
        } else {
            container.innerHTML = '';
        }
        setHourlyAvailabilityVisibility(false);

        // Clear availability data on error
        window.currentAvailabilityData = null;

        // Still try to populate basic time slots
        await populateStartTimeSlots(date, null);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        if (startTimeLoadingEl) {
            startTimeLoadingEl.style.display = 'none';
        }

        if (requestId === availabilityRequestSeq && activeAvailabilityController === controller) {
            activeAvailabilityController = null;
        }
    }
};

// Display availability timeline with simplified user view
const displayAvailability = (data) => {
    const container = document.getElementById('referenceTimeline');
    if (!container) return;
    const selectedDate = document.getElementById('bookingDate')?.value || '';

    // For flat-rate track/session bookings the hourly timeline is not meaningful.
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    if (typeof window.isFlatRateSessionBookingCategory === 'function' && window.isFlatRateSessionBookingCategory(bookingType)) {
        container.innerHTML = '';
        setHourlyAvailabilityVisibility(false);
        return;
    }

    // For class bookings the hourly timeline is not meaningful — show a class-specific message.
    if (typeof window.isClassBookingCategory === 'function' && window.isClassBookingCategory(bookingType)) {
        container.innerHTML = '';
        setHourlyAvailabilityVisibility(false);
        return;
    }

    const bookings = Array.isArray(data?.bookings) ? data.bookings : [];
    const blockedTimes = Array.isArray(data?.blockedTimes) ? data.blockedTimes : [];

    if (bookings.length === 0 && blockedTimes.length === 0) {
        if (!hasFutureStartSlotsForToday(selectedDate)) {
            container.innerHTML = '<div class="booking-theme-status booking-theme-status-muted">No slots left today. Choose another date.</div>';
            setHourlyAvailabilityVisibility(true);
            return;
        }

        container.innerHTML = '<div class="booking-theme-status booking-theme-status-success">All time slots available for this date.</div>';
        setHourlyAvailabilityVisibility(true);
        return;
    }

    const confirmedBookings = bookings.filter((booking) => booking.bookingStatus === 'CONFIRMED');
    const pendingBookings = bookings.filter((booking) => booking.bookingStatus !== 'CONFIRMED');

    const summaryParts = [];
    if (confirmedBookings.length > 0) summaryParts.push(`${confirmedBookings.length} booked`);
    if (blockedTimes.length > 0) summaryParts.push(`${blockedTimes.length} blocked`);
    if (pendingBookings.length > 0) summaryParts.push(`${pendingBookings.length} pending`);

    const hasHardConflicts = confirmedBookings.length > 0 || blockedTimes.length > 0;
    const summaryClass = hasHardConflicts ? 'booking-theme-status-warning' : 'booking-theme-status-muted';
    const summaryText = summaryParts.length > 0
        ? `Availability summary: ${summaryParts.join(', ')}.`
        : 'No schedule items.';

    container.innerHTML = `<div class="booking-theme-status ${summaryClass}">${summaryText}</div>`;
    setHourlyAvailabilityVisibility(true);
};

const getPerdayAvailabilityEmptyMessage = () => {
    const startDate = document.getElementById('perdayStartDate')?.value || '';
    const endDate = document.getElementById('perdayEndDate')?.value || '';
    const pickupTime = document.getElementById('perdayPickupTime')?.value || '';
    const returnTime = document.getElementById('perdayReturnTime')?.value || '';

    if (!startDate || !endDate) {
        return 'Select pickup and return dates.';
    }

    if (!pickupTime) {
        return 'Select pickup time.';
    }

    if (!returnTime) {
        return 'Return time will auto-fill.';
    }

    return 'No item availability to show yet.';
};

/**
 * Render per-day item availability inside #perdayAvailabilityTimeline.
 *
 * @param {object} opts
 * @param {string[]} opts.unavailableItems - normalised item name keys that are fully booked
 * @param {object} opts.bookedItemQuantities - { nameKey: bookedQty }
 * @param {Array<{name:string,nameKey:string,maxQuantity:number}>} opts.catalogItems - full perday catalog
 * @param {boolean} opts.loading - show loading state
 * @param {string|null} opts.error - error message
 */
const displayPerdayAvailability = ({ unavailableItems = [], bookedItemQuantities = {}, catalogItems = [], loading = false, error = null } = {}) => {
    const container = document.getElementById('perdayAvailabilityTimeline');
    if (!container) return;

    if (loading) {
        setPerdayAvailabilityVisibility(true);
        container.innerHTML = '<div class="booking-theme-status booking-theme-status-loading">Checking availability...</div>';
        return;
    }

    if (error) {
        setPerdayAvailabilityVisibility(true);
        container.innerHTML = `<div class="booking-theme-status booking-theme-status-danger">${error}</div>`;
        return;
    }

    if (catalogItems.length === 0) {
        setPerdayAvailabilityVisibility(false);
        container.innerHTML = '';
        return;
    }

    const unavailableSet = new Set(unavailableItems.map((k) => String(k).toLowerCase()));
    const unavailableCatalogItems = catalogItems.filter(({ nameKey }) => unavailableSet.has(String(nameKey).toLowerCase()));

    let html = '';
    unavailableCatalogItems.forEach(({ name, nameKey, maxQuantity }) => {
        const bookedQty = bookedItemQuantities[nameKey] || 0;
        const statusClass = 'timeline-status-confirmed';
        const itemStateClass = 'timeline-booking-confirmed';
        const statusLabel = 'Booked';
        const qtyNote = maxQuantity > 1
            ? ` (${Math.max(0, maxQuantity - bookedQty)}/${maxQuantity} available)`
            : '';

        html += `
            <div class="timeline-item perday-availability-item ${itemStateClass}">
                <strong>${name}${qtyNote}</strong>
                <span class="timeline-status-label ${statusClass}">${statusLabel}</span>
            </div>
        `;
    });

    const allAvailable = unavailableSet.size === 0;
    const allUnavailable = catalogItems.length > 0 && unavailableCatalogItems.length === catalogItems.length;
    const summaryClass = allAvailable ? 'booking-theme-status-success' : allUnavailable ? 'booking-theme-status-danger' : 'booking-theme-status-warning';
    const summaryText = allAvailable
        ? 'All per-day items are available for the selected range.'
        : allUnavailable
            ? 'All per-day items are booked for this range. Choose different dates.'
            : 'Some items are unavailable for the selected range.';

    setPerdayAvailabilityVisibility(true);
    container.innerHTML = `<div class="booking-theme-status ${summaryClass}">${summaryText}</div>${html}`;
};

// Expose for cross-file calls and compatibility.
window.buildTimeSlots = buildTimeSlots;
window.allTimeSlots = allTimeSlots;
window.populateStartTimeSlots = populateStartTimeSlots;
window.populateEndTimeSlots = populateEndTimeSlots;
window.populateTimeSlots = populateTimeSlots;
window.loadAvailability = loadAvailability;
window.displayAvailability = displayAvailability;
window.displayPerdayAvailability = displayPerdayAvailability;
