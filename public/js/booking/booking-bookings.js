/**
 * Booking history and billing actions module.
 */

const slotRequestTimeSlots = [
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

const slotRequestAvailabilityCache = new Map();

const getSlotRequestLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isSlotRequestTimeUnavailable = (timeSlot, unavailableRanges) => {
    const [slotHour, slotMinute] = String(timeSlot || '00:00').split(':').map(Number);
    const slotMinutes = slotHour * 60 + slotMinute;

    return unavailableRanges.some((range) => {
        const [startHour, startMinute] = String(range.start || '00:00').split(':').map(Number);
        const [endHour, endMinute] = String(range.end || '00:00').split(':').map(Number);
        const rangeStart = startHour * 60 + startMinute;
        let rangeEnd = endHour * 60 + endMinute;

        if (rangeEnd <= rangeStart) {
            rangeEnd += 24 * 60;
        }

        return slotMinutes >= rangeStart && slotMinutes < rangeEnd;
    });
};

const fetchSlotRequestAvailability = async (date) => {
    if (!date) return null;
    if (slotRequestAvailabilityCache.has(date)) {
        return slotRequestAvailabilityCache.get(date);
    }

    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/bookings/availability/${date}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error('Unable to load available times for that date');
    }

    const data = await res.json();
    slotRequestAvailabilityCache.set(date, data);
    return data;
};

const loadSlotRequestTimeOptions = async (dateInputEl) => {
    const form = dateInputEl?.closest('.lesson-slot-form');
    const timeSelect = form?.querySelector('.slot-req-time');
    const loadingEl = form?.querySelector('.slot-req-time-loading');
    const selectedDate = String(dateInputEl?.value || '').trim();

    if (!timeSelect) return;

    timeSelect.innerHTML = '<option value="">Select time</option>';
    timeSelect.disabled = true;

    if (!selectedDate) {
        timeSelect.innerHTML = '<option value="">Select a date first</option>';
        return;
    }

    if (loadingEl) loadingEl.style.display = 'block';

    try {
        const availabilityData = await fetchSlotRequestAvailability(selectedDate);
        const unavailableRanges = [
            ...((availabilityData?.bookings || [])
                .filter((booking) => booking.bookingStatus === 'CONFIRMED')
                .map((booking) => ({ start: booking.startTime, end: booking.endTime }))),
            ...((availabilityData?.blockedTimes || [])
                .map((blocked) => ({ start: blocked.startTime, end: blocked.endTime })))
        ];

        const todayLocal = getSlotRequestLocalDateString(new Date());
        const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
        const availableSlots = slotRequestTimeSlots.filter((slot) => {
            if (selectedDate === todayLocal && (slot.hour * 60) <= currentMinutes) {
                return false;
            }

            return !isSlotRequestTimeUnavailable(slot.value, unavailableRanges);
        });

        if (availableSlots.length === 0) {
            timeSelect.innerHTML = `<option value="">${selectedDate === todayLocal ? 'No slots left today' : 'No available time slots'}</option>`;
            return;
        }

        timeSelect.innerHTML = '<option value="">Select time</option>'
            + availableSlots.map((slot) => `<option value="${slot.value}">${slot.label}</option>`).join('');
        timeSelect.disabled = false;
    } catch (error) {
        timeSelect.innerHTML = '<option value="">Error loading times</option>';
        showAlert(error.message || 'Unable to load time options', 'error');
    } finally {
        if (loadingEl) loadingEl.style.display = 'none';
    }
};

const initSlotRequestDatePickers = () => {
    if (typeof window.flatpickr !== 'function') {
        return;
    }

    document.querySelectorAll('.slot-req-date').forEach((inputEl) => {
        if (!inputEl || inputEl.dataset.flatpickrBound === '1') {
            return;
        }

        inputEl.dataset.flatpickrBound = '1';

        const picker = window.flatpickr(inputEl, {
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'd M Y',
            disableMobile: true,
            minDate: inputEl.min || 'today',
            maxDate: inputEl.max || null,
            clickOpens: !inputEl.disabled,
            onReady: (_selectedDates, _dateStr, instance) => {
                if (instance.altInput) {
                    instance.altInput.disabled = inputEl.disabled;
                    instance.altInput.placeholder = 'Select date';
                    instance.altInput.classList.add('slot-req-date-alt');
                }
            },
            onChange: () => {
                loadSlotRequestTimeOptions(inputEl);
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
    });
};

// Load user's bookings
const loadMyBookings = async () => {
    const loadingEl = document.getElementById('bookingsLoading');
    const bookingsEl = document.getElementById('bookingsList');

    if (loadingEl) {
        loadingEl.style.display = 'none';
    }

    if (bookingsEl) {
        bookingsEl.style.display = 'block';
        bookingsEl.innerHTML = window.JamRoomUtils?.getSectionLoaderMarkup
            ? window.JamRoomUtils.getSectionLoaderMarkup('Loading bookings...')
            : '<div class="loading-text">Loading bookings...</div>';
    }

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/my-bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        if (data.bookings.length === 0) {
            document.getElementById('bookingsList').innerHTML =
                '<p class="booking-empty-message">No bookings yet</p>';
            return;
        }

        let html = '';
        data.bookings.forEach(booking => {
            const isPerday = booking.bookingMode === 'perday';
            const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
            const perDayRange = (booking.perDayStartDate && booking.perDayEndDate)
                ? `${formatDate(booking.perDayStartDate)} to ${formatDate(booking.perDayEndDate)}`
                : formatDate(booking.date);
            const perDayTimeRange = `${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}`;

            const statusClass = booking.bookingStatus.toLowerCase();
            const rentalsDisplay = booking.rentals && booking.rentals.length > 0
                ? booking.rentals.filter(r => r && r.name && r.quantity !== undefined && r.price !== undefined)
                    .map(r => {
                        const rentalType = String(r.rentalType || 'inhouse').toLowerCase();
                        const days = isPerday ? perDayDays : 1;
                        const amount = (isPerday || rentalType === 'perday')
                            ? (r.price * r.quantity * days)
                            : (rentalType === 'persession' || rentalType === 'pertrack')
                                ? (r.price * r.quantity)
                                : (r.price * r.quantity * (booking.duration || 1));
                        return `<li>${r.name} × ${r.quantity} - ₹${amount}</li>`;
                    }).join('')
                : `<li>${booking.rentalType || 'Unknown rental'}</li>`;

            const bookingDateLine = isPerday
                ? `<p><strong>📅 Per-day Range:</strong> ${perDayRange} (${perDayDays} day(s))</p>`
                : `<p><strong>📅 Date:</strong> ${formatDate(booking.date)}</p>`;

            const bookingTimeLine = isPerday
                ? `<p><strong>🕐 Pick-up/Return:</strong> ${perDayTimeRange}</p>`
                : `<p><strong>🕐 Time:</strong> ${formatTime(booking.startTime)} - ${formatTime(booking.endTime)} (${booking.duration}h)</p>`;

            const classSession = booking.classSession || {};

            const bookingItemNames = booking.rentals && booking.rentals.length > 0
                ? booking.rentals
                    .filter((rental) => rental && rental.name)
                    .map((rental) => rental.name)
                : [];
            const bookingSummaryTitle = classSession.isClassBooking
                ? (classSession.selectedClassItemName || classSession.instrument || 'Music Class')
                : (bookingItemNames.length > 0
                    ? `${bookingItemNames.slice(0, 2).join(', ')}${bookingItemNames.length > 2 ? ` +${bookingItemNames.length - 2} more` : ''}`
                    : (booking.rentalType || 'Booking'));
            const bookingSummaryMeta = isPerday
                ? `${perDayRange} | ${perDayTimeRange}`
                : `${formatDate(booking.date)} | ${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`;
            const lessons = Array.isArray(classSession.lessons) ? classSession.lessons : [];
            const lessonRows = lessons.length > 0
                ? lessons.map((lesson) => {
                    const status = String(lesson?.status || 'SCHEDULED').toUpperCase();
                    const statusClass = status === 'COMPLETED' ? 'completed' : status === 'CANCELLED' ? 'cancelled' : 'scheduled';
                    const statusLabel = status.charAt(0) + status.slice(1).toLowerCase();
                    const weekNum = lesson?.weekNumber || lesson?.classNumber || 1;
                    const scheduledDate = lesson?.scheduledDate ? formatDate(lesson.scheduledDate) : 'TBD';
                    const completionDate = lesson?.completedDate ? formatDate(lesson.completedDate) : null;
                    const completionTime = lesson?.completedStartTime && lesson?.completedEndTime
                        ? `${formatTime(lesson.completedStartTime)} - ${formatTime(lesson.completedEndTime)}`
                        : null;
                    const headerDateStr = (() => {
                        const src = status === 'COMPLETED' && lesson?.completedDate ? lesson.completedDate : lesson?.scheduledDate;
                        if (!src) return null;
                        const d = new Date(src);
                        if (Number.isNaN(d.getTime())) return null;
                        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                    })();
                    // Slot request badge for header
                    const slotReq = lesson?.slotRequest || {};
                    const slotReqStatus = String(slotReq.status || 'NONE').toUpperCase();
                    const slotReqHeaderBadge = slotReqStatus === 'PENDING'
                        ? ` <span class="lesson-status-badge lesson-status-scheduled" style="font-size:0.7em;">Slot Pending</span>`
                        : '';

                    // Determine week date range for the date input
                    const getWeekRange = (d) => {
                        if (!d) return null;
                        const dt = new Date(d);
                        if (Number.isNaN(dt.getTime())) return null;
                        const dow = dt.getDay();
                        const diff = dow === 0 ? -6 : 1 - dow;
                        const mon = new Date(dt); mon.setDate(dt.getDate() + diff); mon.setHours(0,0,0,0);
                        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
                        const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
                        return { min: fmt(mon), max: fmt(sun) };
                    };
                    const weekRange = status === 'SCHEDULED' ? getWeekRange(lesson?.scheduledDate) : null;

                    // Build slot request section
                    let slotRequestSection = '';
                    if (status === 'SCHEDULED') {
                        const bookingId = booking._id;
                        const lessonIdStr = String(lesson?._id || '');
                        if (slotReqStatus === 'PENDING') {
                            const pDate = slotReq.proposedDate ? new Date(slotReq.proposedDate).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '';
                            slotRequestSection = `<div class="lesson-slot-request lesson-slot-pending">
                                <p><strong>Slot request pending approval</strong></p>
                                <p>Requested: ${pDate} at ${slotReq.proposedStartTime || 'N/A'} (${slotReq.proposedEndTime || ''})</p>
                                <button class="btn btn-sm btn-secondary" onclick="cancelSlotRequest('${bookingId}','${lessonIdStr}',this)">Withdraw Request</button>
                            </div>`;
                        } else if (slotReqStatus === 'REJECTED') {
                            slotRequestSection = `<div class="lesson-slot-request lesson-slot-rejected">
                                <p><strong>Slot request was rejected.</strong>${slotReq.responseNote ? ` Note: ${slotReq.responseNote}` : ''} You can submit a new request.</p>
                            </div>`;
                        } else if (slotReqStatus === 'APPROVED') {
                            slotRequestSection = `<p style="color:var(--success-color);font-size:0.85em">✔ Slot confirmed by admin</p>`;
                        }
                        if (slotReqStatus !== 'PENDING') {
                            const minDate = weekRange?.min || '';
                            const maxDate = weekRange?.max || '';
                            slotRequestSection += `<details class="lesson-slot-form">
                                <summary class="btn btn-sm btn-primary lesson-slot-trigger">Request Slot</summary>
                                <div class="lesson-slot-form-panel">
                                    <div class="field-help">Pick a date within this lesson week, then choose from available JamRoom time slots.</div>
                                    <div class="time-container lesson-slot-time-container">
                                        <div class="form-group lesson-slot-field">
                                            <label><strong>Date</strong></label>
                                            <input type="date" class="slot-req-date" min="${minDate}" max="${maxDate}">
                                        </div>
                                        <div class="form-group lesson-slot-field">
                                            <label><strong>Start Time</strong></label>
                                            <select class="slot-req-time" disabled>
                                                <option value="">Select a date first</option>
                                            </select>
                                            <div class="loading-text start-time-loading slot-req-time-loading">Loading available times...</div>
                                        </div>
                                    </div>
                                    <button class="btn btn-sm btn-success lesson-slot-submit" onclick="submitSlotRequest('${bookingId}','${lessonIdStr}',this)">Submit Request</button>
                                </div>
                            </details>`;
                        }
                    }

                    return `
                        <li>
                            <details class="lesson-accordion">
                                <summary class="lesson-accordion-header">
                                    <span class="lesson-accordion-week">Week ${weekNum}${headerDateStr ? ` · ${headerDateStr}` : ''}${slotReqHeaderBadge}</span>
                                    <span class="lesson-status-badge lesson-status-${statusClass}">${statusLabel}</span>
                                </summary>
                                <div class="lesson-accordion-body">
                                    <p><strong>Scheduled:</strong> ${scheduledDate} (${formatTime(lesson?.scheduledStartTime || '') || 'N/A'} – ${formatTime(lesson?.scheduledEndTime || '') || 'N/A'})</p>
                                    ${status === 'COMPLETED' && completionDate ? `<p><strong>Completed on:</strong> ${completionDate}${completionTime ? `, ${completionTime}` : ''}</p>` : ''}
                                    ${lesson?.notes ? `<p><strong>Notes:</strong> ${lesson.notes}</p>` : ''}
                                    ${lesson?.details ? `<p><strong>Details:</strong> ${lesson.details}</p>` : ''}
                                    ${slotRequestSection}
                                </div>
                            </details>
                        </li>
                    `;
                }).join('')
                : '';

            const classSessionDetails = classSession.isClassBooking
                ? `
                    <p><strong>🎓 Class Instrument:</strong> ${classSession.instrument || 'Music'}</p>
                    <p><strong>🎼 Class Item:</strong> ${classSession.selectedClassItemName || classSession.instrument || 'N/A'}</p>
                    <p><strong>📍 Class Location:</strong> ${classSession.location || 'N/A'}</p>
                    <p><strong>🗓️ Default Weekly Slot:</strong> ${(classSession.preferredWeekday || 'N/A')} ${classSession.preferredStartTime ? `at ${formatTime(classSession.preferredStartTime)}` : ''}</p>
                    <p><strong>📅 Plan Window:</strong> ${classSession.planStartDate ? formatDate(classSession.planStartDate) : 'N/A'} to ${classSession.planEndDate ? formatDate(classSession.planEndDate) : 'N/A'}</p>
                    <p><strong>📚 Classes:</strong> ${classSession.classesPerMonth || 0}/month, ${classSession.totalClassesPlanned || 0} total</p>
                    <p><strong>✅ Progress:</strong> ${classSession.completedClassesCount || 0}/${classSession.totalClassesPlanned || 0} completed (${classSession.classesRemainingAfterBooking ?? 0} remaining)</p>
                    <p><strong>💳 Fee:</strong> ₹${classSession.totalFeeBeforeDiscount || classSession.monthlyFee || 0} | <strong>Discount:</strong> ₹${classSession.discountAmount || 0} | <strong>Paid:</strong> ₹${classSession.totalFeeAfterDiscount || classSession.monthlyFeeDueNow || 0}</p>
                `
                : '';

            const classSessionBlock = classSession.isClassBooking
                ? `
                    <div class="booking-class-tabs">
                        <div class="booking-class-tab-list" role="tablist" aria-label="Class booking sections">
                            <button type="button" class="booking-class-tab active" data-tab-target="details" onclick="switchBookingClassTab(this, 'details')">Class Details</button>
                            <button type="button" class="booking-class-tab" data-tab-target="tracker" onclick="switchBookingClassTab(this, 'tracker')">Lesson Tracker</button>
                        </div>
                        <div class="booking-class-tab-panel active" data-tab-panel="details">
                            ${classSessionDetails}
                        </div>
                        <div class="booking-class-tab-panel" data-tab-panel="tracker" hidden>
                            ${lessonRows
                                ? `<ul class="lesson-accordion-list">${lessonRows}</ul>`
                                : '<p class="booking-empty-message booking-empty-padded">No lesson tracker entries yet.</p>'}
                        </div>
                    </div>
                `
                : '';

            html += `
                <details class="booking-card booking-card-collapsible ${statusClass}">
                    <summary class="booking-card-summary">
                        <div class="booking-card-summary-primary">
                            <h4 class="booking-card-title">${bookingSummaryTitle}</h4>
                            <p class="booking-card-summary-meta">${bookingSummaryMeta}</p>
                        </div>
                        <div class="booking-card-summary-side">
                            <span class="status-badge status-${statusClass}">${booking.bookingStatus}</span>
                            <strong class="booking-card-summary-total">₹${booking.price}</strong>
                        </div>
                    </summary>
                    <div class="booking-card-body">
                        <p><strong>📝 Items:</strong></p>
                        <ul class="booking-rentals-list">${rentalsDisplay}</ul>
                        ${bookingDateLine}
                        ${bookingTimeLine}
                        ${classSessionBlock}
                        <p><strong>💰 Total:</strong> ₹${booking.price}
                            ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                            ? `<small>(Subtotal: ₹${booking.subtotal} + Tax: ₹${booking.taxAmount})</small>` : ''}
                        </p>
                        ${booking.bandName ? `<p><strong>🎵 Band:</strong> ${booking.bandName}</p>` : ''}
                        <div class="booking-actions-row">
                            ${booking.bookingStatus === 'PENDING'
                            ? `<button onclick="cancelBooking('${booking._id}')" class="btn btn-danger">Cancel Booking</button>`
                            : ''}
                            ${(booking.bookingStatus === 'CONFIRMED' || booking.bookingStatus === 'COMPLETED')
                            ? `<button onclick="downloadUserPDF('${booking._id}')" class="btn btn-secondary" title="Download Bill PDF">📄 Download Bill</button>`
                            : ''}
                        </div>
                    </div>
                </details>
            `;
        });

        document.getElementById('bookingsList').innerHTML = html || '<p class="booking-empty-message">No valid bookings found</p>';
        initSlotRequestDatePickers();
    } catch (error) {
        console.error('Load bookings error:', error);

        if (loadingEl) {
            loadingEl.style.display = 'none';
        }

        if (bookingsEl) {
            bookingsEl.style.display = 'block';
            bookingsEl.innerHTML = '<p class="text-danger">Failed to load bookings: ' + error.message + '</p>';
        }
    }
};

// Submit a weekly slot request for a class lesson
const submitSlotRequest = async (bookingId, lessonId, btnEl) => {
    try {
        const form = btnEl?.closest('.lesson-slot-form');
        const dateInput = form?.querySelector('.slot-req-date');
        const timeInput = form?.querySelector('.slot-req-time');
        const proposedDate = dateInput?.value?.trim();
        const proposedStartTime = timeInput?.value?.trim();

        if (!proposedDate) {
            showAlert('Please select a date.', 'error');
            return;
        }

        if (!proposedStartTime) {
            showAlert('Please select a start time.', 'error');
            return;
        }

        if (btnEl) btnEl.disabled = true;
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/${bookingId}/class-lessons/${lessonId}/request-slot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ proposedDate, proposedStartTime })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to submit slot request');

        showAlert(data.message || 'Slot request submitted!', 'success');
        await loadMyBookings();
    } catch (error) {
        showAlert(error.message || 'Failed to submit slot request', 'error');
        if (btnEl) btnEl.disabled = false;
    }
};

// Withdraw a pending slot request
const cancelSlotRequest = async (bookingId, lessonId, btnEl) => {
    if (!confirm('Withdraw this slot request?')) return;

    try {
        if (btnEl) btnEl.disabled = true;
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/${bookingId}/class-lessons/${lessonId}/request-slot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ withdraw: true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to withdraw request');

        showAlert(data.message || 'Slot request withdrawn.', 'success');
        await loadMyBookings();
    } catch (error) {
        showAlert(error.message || 'Failed to withdraw request', 'error');
        if (btnEl) btnEl.disabled = false;
    }
};

// Cancel booking
const cancelBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
        showLoadingOverlay('Cancelling booking...');
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/api/bookings/${bookingId}/cancel`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to cancel booking');

        showAlert('Booking cancelled successfully', 'success');
        await loadMyBookings();
    } catch (error) {
        showAlert(error.message || 'Failed to cancel booking', 'error');
    } finally {
        hideLoadingOverlay();
    }
};

// Download PDF bill for user
const downloadUserPDF = async (bookingId) => {
    try {
        showLoadingOverlay('Generating your bill PDF...');

        const token = localStorage.getItem('token');

        // First, try server-side PDF generation
        try {
            console.log('Attempting server-side PDF generation...');
            const res = await fetch(`${API_URL}/api/bookings/${bookingId}/download-pdf`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                // Server-side generation successful
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `jamroom-booking-${bookingId}.pdf`;
                document.body.appendChild(a);
                a.click();

                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);

                showAlert('Your bill PDF has been downloaded successfully!', 'success');
                return; // Success, exit early
            }

            const error = await res.json();
            console.log('Server-side PDF failed:', error.message);
            throw new Error(error.message || 'Server-side PDF generation failed');

        } catch (serverError) {
            console.log('Server-side PDF generation failed, trying client-side...', serverError.message);

            // Fallback to client-side PDF generation
            showLoadingOverlay('Server unavailable, generating PDF locally...');

            // Get booking data and admin settings for client-side generation
            const [bookingRes, settingsRes] = await Promise.all([
                fetch(`${API_URL}/api/bookings/${bookingId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${API_URL}/api/admin/debug-settings`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            if (!bookingRes.ok) {
                throw new Error('Could not fetch booking data for PDF generation');
            }

            const bookingData = await bookingRes.json();
            let settingsData = null;

            if (settingsRes.ok) {
                const settings = await settingsRes.json();
                settingsData = settings.settings;
            }

            // Generate PDF on client-side
            await generatePDFClient(bookingData.booking, settingsData);
            showAlert('Your bill PDF has been downloaded successfully! (Generated locally)', 'success');
        }

    } catch (error) {
        console.error('PDF download error:', error);

        let userMessage = error.message;

        if (error.message.includes('Booking not found')) {
            userMessage = 'Booking not found. It may have been cancelled or removed.';
        } else if (error.message.includes('PDF generation failed')) {
            userMessage = 'Unable to generate PDF at this time. Please try again later or contact support.';
        } else if (error.message.includes('Not authorized')) {
            userMessage = 'You are not authorized to download this bill. Please make sure you are logged in.';
        } else if (error.message.includes('generatePDFClient is not defined')) {
            userMessage = 'PDF generation library not loaded. Please refresh the page and try again.';
        } else {
            userMessage = 'Unable to generate PDF. Please try again or contact support if the problem persists.';
        }

        showAlert(userMessage, 'error');
    } finally {
        hideLoadingOverlay();
    }
};

const switchBookingClassTab = (btnEl, tabName) => {
    const tabGroup = btnEl?.closest('.booking-class-tabs');
    if (!tabGroup) return;

    tabGroup.querySelectorAll('.booking-class-tab').forEach((tabBtn) => {
        const isActive = tabBtn === btnEl;
        tabBtn.classList.toggle('active', isActive);
        tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    tabGroup.querySelectorAll('.booking-class-tab-panel').forEach((panel) => {
        const isActive = panel.dataset.tabPanel === tabName;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
    });
};

// Expose for inline handlers and cross-file calls.
window.loadMyBookings = loadMyBookings;
window.loadSlotRequestTimeOptions = loadSlotRequestTimeOptions;
window.submitSlotRequest = submitSlotRequest;
window.cancelSlotRequest = cancelSlotRequest;
window.cancelBooking = cancelBooking;
window.downloadUserPDF = downloadUserPDF;
window.switchBookingClassTab = switchBookingClassTab;
