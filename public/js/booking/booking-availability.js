/**
 * Booking availability/time-slot module.
 * Contains schedule loading and start/end time filtering helpers.
 */

// All available time slots
const allTimeSlots = [
    { value: '09:00', label: '9:00 AM', hour: 9 },
    { value: '10:00', label: '10:00 AM', hour: 10 },
    { value: '11:00', label: '11:00 AM', hour: 11 },
    { value: '12:00', label: '12:00 PM', hour: 12 },
    { value: '13:00', label: '1:00 PM', hour: 13 },
    { value: '14:00', label: '2:00 PM', hour: 14 },
    { value: '15:00', label: '3:00 PM', hour: 15 },
    { value: '16:00', label: '4:00 PM', hour: 16 },
    { value: '17:00', label: '5:00 PM', hour: 17 },
    { value: '18:00', label: '6:00 PM', hour: 18 },
    { value: '19:00', label: '7:00 PM', hour: 19 },
    { value: '20:00', label: '8:00 PM', hour: 20 },
    { value: '21:00', label: '9:00 PM', hour: 21 },
    { value: '22:00', label: '10:00 PM', hour: 22 },
    { value: '23:00', label: '11:00 PM', hour: 23 }
];

// End time slots (includes midnight)
const allEndTimeSlots = [
    { value: '10:00', label: '10:00 AM', hour: 10 },
    { value: '11:00', label: '11:00 AM', hour: 11 },
    { value: '12:00', label: '12:00 PM', hour: 12 },
    { value: '13:00', label: '1:00 PM', hour: 13 },
    { value: '14:00', label: '2:00 PM', hour: 14 },
    { value: '15:00', label: '3:00 PM', hour: 15 },
    { value: '16:00', label: '4:00 PM', hour: 16 },
    { value: '17:00', label: '5:00 PM', hour: 17 },
    { value: '18:00', label: '6:00 PM', hour: 18 },
    { value: '19:00', label: '7:00 PM', hour: 19 },
    { value: '20:00', label: '8:00 PM', hour: 20 },
    { value: '21:00', label: '9:00 PM', hour: 21 },
    { value: '22:00', label: '10:00 PM', hour: 22 },
    { value: '23:00', label: '11:00 PM', hour: 23 },
    { value: '00:00', label: '12:00 AM (Midnight)', hour: 24 }
];

// Populate start time slots based on selected date and availability
const populateStartTimeSlots = async (selectedDate, availabilityData) => {
    const startTimeSelect = document.getElementById('startTime');
    const endTimeSelect = document.getElementById('endTime');
    const loadingEl = document.getElementById('startTimeLoading');

    // Show loading state
    loadingEl.style.display = 'block';
    startTimeSelect.disabled = true;

    // Reset end time when start time changes
    endTimeSelect.innerHTML = '<option value="">Select start time first</option>';
    endTimeSelect.disabled = true;

    startTimeSelect.innerHTML = '<option value="">Loading...</option>';

    if (!selectedDate) {
        startTimeSelect.innerHTML = '<option value="">Select date first</option>';
        loadingEl.style.display = 'none';
        return;
    }

    try {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Get booked and blocked time ranges
        const unavailableRanges = [];

        // Add booked times to unavailable ranges
        if (availabilityData && availabilityData.bookings) {
            availabilityData.bookings.forEach(booking => {
                if (booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'PENDING') {
                    unavailableRanges.push({
                        start: booking.startTime,
                        end: booking.endTime,
                        type: 'booking'
                    });
                }
            });
        }

        // Add blocked times to unavailable ranges
        if (availabilityData && availabilityData.blockedTimes) {
            availabilityData.blockedTimes.forEach(blocked => {
                unavailableRanges.push({
                    start: blocked.startTime,
                    end: blocked.endTime,
                    type: 'blocked'
                });
            });
        }

        // Reset and populate start time options
        startTimeSelect.innerHTML = '<option value="">Select time</option>';

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
            startTimeSelect.innerHTML = '<option value="">No available time slots for this date</option>';
            startTimeSelect.disabled = true;
        } else {
            startTimeSelect.disabled = false;
        }

    } catch (error) {
        console.error('Error populating time slots:', error);
        startTimeSelect.innerHTML = '<option value="">Error loading times</option>';
    } finally {
        loadingEl.style.display = 'none';
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

// Helper function to check if a time range overlaps with unavailable ranges
const isTimeRangeUnavailable = (startTime, endTime, unavailableRanges) => {
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    const startTimeInMinutes = startHour * 60 + startMinute;
    let endTimeInMinutes = endHour * 60 + endMinute;

    // Handle midnight crossover
    if (endTimeInMinutes <= startTimeInMinutes) {
        endTimeInMinutes += 24 * 60;
    }

    return unavailableRanges.some(range => {
        const [rangeStartHour, rangeStartMinute] = range.start.split(':').map(Number);
        const [rangeEndHour, rangeEndMinute] = range.end.split(':').map(Number);

        const rangeStartInMinutes = rangeStartHour * 60 + rangeStartMinute;
        let rangeEndInMinutes = rangeEndHour * 60 + rangeEndMinute;

        if (rangeEndInMinutes <= rangeStartInMinutes) {
            rangeEndInMinutes += 24 * 60;
        }

        // Check for any overlap between the ranges
        return !(endTimeInMinutes <= rangeStartInMinutes || startTimeInMinutes >= rangeEndInMinutes);
    });
};

// Populate end time slots based on selected start time and check availability
const populateEndTimeSlots = () => {
    const startTimeSelect = document.getElementById('startTime');
    const endTimeSelect = document.getElementById('endTime');
    const dateInput = document.getElementById('bookingDate');
    const selectedStartTime = startTimeSelect.value;

    endTimeSelect.innerHTML = '<option value="">Select end time</option>';

    if (!selectedStartTime) {
        endTimeSelect.innerHTML = '<option value="">Select start time first</option>';
        endTimeSelect.disabled = true;
        return;
    }

    endTimeSelect.disabled = false;
    const [startHour] = selectedStartTime.split(':').map(Number);

    // Get current availability data if available
    const unavailableRanges = window.currentAvailabilityData ?
        [...(window.currentAvailabilityData.bookings || []).filter(b =>
            b.bookingStatus === 'CONFIRMED' || b.bookingStatus === 'PENDING'
        ).map(b => ({ start: b.startTime, end: b.endTime, type: 'booking' })),
        ...(window.currentAvailabilityData.blockedTimes || []).map(b =>
            ({ start: b.startTime, end: b.endTime, type: 'blocked' })
        )] : [];

    allEndTimeSlots.forEach(slot => {
        // Only show times after the selected start time
        if (slot.hour > startHour) {
            // Check if the time range from start to this end time is available
            const isRangeAvailable = !isTimeRangeUnavailable(selectedStartTime, slot.value, unavailableRanges);

            if (isRangeAvailable) {
                const option = document.createElement('option');
                option.value = slot.value;
                option.textContent = slot.label;
                endTimeSelect.appendChild(option);
            }
        }
    });

    // Check if any options were added
    if (endTimeSelect.children.length <= 1) {
        endTimeSelect.innerHTML = '<option value="">No available end times</option>';
        endTimeSelect.disabled = true;
    }
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
    if (!date) {
        container.innerHTML = '<div class="loading-text">Select a date to view availability</div>';
        window.currentAvailabilityData = null;
        return;
    }

    container.innerHTML = '<div class="timeline-loading"><span class="loader"></span><span>Loading availability...</span></div>';

    let timeoutId;
    try {
        const token = localStorage.getItem('token');
        const controller = new AbortController();
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

        // Store availability data globally for time slot filtering
        window.currentAvailabilityData = data;

        // Update the timeline display
        displayAvailability(data);

        // Update available time slots based on this data
        await populateStartTimeSlots(date, data);

    } catch (error) {
        console.error('Error loading availability:', error);
        if (error.name === 'AbortError') {
            container.innerHTML = '<p class="text-danger">Loading availability timed out. Please try again.</p>';
        } else {
            container.innerHTML = '<p class="text-danger">Failed to load schedule. Please try again.</p>';
        }

        // Clear availability data on error
        window.currentAvailabilityData = null;

        // Still try to populate basic time slots
        await populateStartTimeSlots(date, null);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
};

// Display availability timeline with simplified user view
const displayAvailability = (data) => {
    const container = document.getElementById('referenceTimeline');

    if (data.bookings.length === 0 && data.blockedTimes.length === 0) {
        container.innerHTML = '<p class="availability-all-clear">✓ All time slots available for this date</p>';
        return;
    }

    let html = '';

    // Show bookings with simplified information for users
    data.bookings.forEach(booking => {
        const isConfirmed = booking.bookingStatus === 'CONFIRMED';
        const statusText = booking.bookingStatus === 'CONFIRMED' ? 'Booked' : 'Pending';
        const statusClass = isConfirmed ? 'timeline-status-confirmed' : 'timeline-status-pending';
        const itemStateClass = isConfirmed ? 'timeline-booking-confirmed' : 'timeline-booking-pending';

        html += `
            <div class="timeline-item booked ${itemStateClass}">
                <strong>${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}</strong>
                <span class="timeline-status-label ${statusClass}">${statusText}</span>
            </div>
        `;
    });

    // Show blocked times
    data.blockedTimes.forEach(blocked => {
        html += `
            <div class="timeline-item blocked">
                <strong>${formatTime(blocked.startTime)} - ${formatTime(blocked.endTime)}</strong>
                <span class="timeline-status-label timeline-status-unavailable">Unavailable</span>
            </div>
        `;
    });

    container.innerHTML = html || '<p>No schedule items</p>';
};

// Expose for cross-file calls and compatibility.
window.populateStartTimeSlots = populateStartTimeSlots;
window.populateEndTimeSlots = populateEndTimeSlots;
window.populateTimeSlots = populateTimeSlots;
window.loadAvailability = loadAvailability;
window.displayAvailability = displayAvailability;
