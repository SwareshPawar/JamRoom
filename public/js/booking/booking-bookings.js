/**
 * Booking history and billing actions module.
 */

// Time slots declared once in booking-availability.js (window.allTimeSlots).
// booking-availability.js must be loaded before this file.
const getSlotRequestTimeSlots = () => window.allTimeSlots || [];

const slotRequestAvailabilityCache = new Map();

const resolveApiUrl = () => {
    if (typeof API_URL === 'string' && API_URL.trim()) {
        return API_URL;
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }

    return '';
};

const showBookingAlert = (message, type = 'info') => {
    if (typeof window.showAlert === 'function') {
        window.showAlert(message, type);
        return;
    }

    if (window.alertManager && typeof window.alertManager.show === 'function') {
        window.alertManager.show(String(message || ''), type);
        return;
    }

    if (type === 'error') {
        console.error(message);
    } else {
        console.log(message);
    }
};

const formatBookingDate = (dateValue) => {
    if (typeof window.formatDate === 'function') {
        return window.formatDate(dateValue);
    }

    if (window.JamRoomUtils && typeof window.JamRoomUtils.formatDate === 'function') {
        return window.JamRoomUtils.formatDate(dateValue, 'DD Mon YYYY');
    }

    const parsedDate = new Date(dateValue);
    if (Number.isNaN(parsedDate.getTime())) return 'N/A';

    return parsedDate.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
};

const formatBookingTime = (timeValue) => {
    if (typeof window.formatTime === 'function') {
        return window.formatTime(timeValue);
    }

    if (window.JamRoomUtils && typeof window.JamRoomUtils.formatTime === 'function') {
        return window.JamRoomUtils.formatTime(timeValue);
    }

    const normalizedTime = String(timeValue || '').trim();
    const [hours, minutes] = normalizedTime.split(':');
    const hourNum = Number(hours);

    if (!Number.isInteger(hourNum) || !minutes) {
        return 'N/A';
    }

    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
};

const showBookingLoadingOverlay = (message) => {
    if (typeof window.showLoadingOverlay === 'function') {
        window.showLoadingOverlay(message);
        return;
    }

    if (window.JamRoomUtils && typeof window.JamRoomUtils.showLoading === 'function') {
        window.JamRoomUtils.showLoading(document.body, message || 'Processing...');
    }
};

const hideBookingLoadingOverlay = () => {
    if (typeof window.hideLoadingOverlay === 'function') {
        window.hideLoadingOverlay();
        return;
    }

    if (window.JamRoomUtils && typeof window.JamRoomUtils.hideLoading === 'function') {
        window.JamRoomUtils.hideLoading(document.body);
    }
};

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
    const apiBase = resolveApiUrl();
    const res = await fetch(`${apiBase}/api/bookings/availability/${date}`, {
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
        const availableSlots = getSlotRequestTimeSlots().filter((slot) => {
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
        showBookingAlert(error.message || 'Unable to load time options', 'error');
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

// ─── Shared helper: build lesson row HTML (used by both render modes) ────────
const buildLessonRowHTML = (lesson, bookingId) => {
    const status = String(lesson?.status || 'SCHEDULED').toUpperCase();
    const statusClass = status === 'COMPLETED' ? 'completed' : status === 'CANCELLED' ? 'cancelled' : 'scheduled';
    const statusLabel = status.charAt(0) + status.slice(1).toLowerCase();
    const weekNum = lesson?.weekNumber || lesson?.classNumber || 1;
    const scheduledDate = lesson?.scheduledDate ? formatBookingDate(lesson.scheduledDate) : 'TBD';
    const completionDate = lesson?.completedDate ? formatBookingDate(lesson.completedDate) : null;
    const completionTime = lesson?.completedStartTime && lesson?.completedEndTime
        ? `${formatBookingTime(lesson.completedStartTime)} - ${formatBookingTime(lesson.completedEndTime)}`
        : null;
    const headerDateStr = (() => {
        const src = status === 'COMPLETED' && lesson?.completedDate ? lesson.completedDate : lesson?.scheduledDate;
        if (!src) return null;
        const d = new Date(src);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    })();
    const slotReq = lesson?.slotRequest || {};
    const slotReqStatus = String(slotReq.status || 'NONE').toUpperCase();
    const slotReqHeaderBadge = slotReqStatus === 'PENDING'
        ? ` <span class="lesson-status-badge lesson-status-scheduled" style="font-size:0.7em;">Slot Pending</span>`
        : '';
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
    const lessonIdStr = String(lesson?._id || '');

    let slotRequestSection = '';
    if (status === 'SCHEDULED') {
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
                    <p><strong>Scheduled:</strong> ${scheduledDate} (${formatBookingTime(lesson?.scheduledStartTime || '') || 'N/A'} – ${formatBookingTime(lesson?.scheduledEndTime || '') || 'N/A'})</p>
                    ${status === 'COMPLETED' && completionDate ? `<p><strong>Completed on:</strong> ${completionDate}${completionTime ? `, ${completionTime}` : ''}</p>` : ''}
                    ${lesson?.notes ? `<p><strong>Notes:</strong> ${lesson.notes}</p>` : ''}
                    ${lesson?.details ? `<p><strong>Details:</strong> ${lesson.details}</p>` : ''}
                    ${slotRequestSection}
                </div>
            </details>
        </li>
    `;
};

// Load user's bookings
const loadMyBookings = async (options = {}) => {
    const loadingEl = document.getElementById('bookingsLoading');
    const bookingsEl = document.getElementById('bookingsList');
    const classOnly = options?.classOnly === true;
    const trackerMode = options?.trackerMode === true; // Lesson Tracker page: focused lesson view

    if (!loadingEl && !bookingsEl) {
        return;
    }

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
        const apiBase = resolveApiUrl();
        const res = await fetch(`${apiBase}/api/bookings/my-bookings`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await res.json();

        const allBookings = Array.isArray(data.bookings) ? data.bookings : [];
        const bookings = classOnly
            ? allBookings.filter((entry) => entry?.classSession?.isClassBooking)
            : allBookings;

        if (bookings.length === 0) {
            if (bookingsEl) {
                bookingsEl.innerHTML = classOnly
                    ? '<p class="booking-empty-message">No class bookings available for lesson tracking yet.</p>'
                    : '<p class="booking-empty-message">No bookings yet</p>';
            }
            return;
        }

        let html = '';

        if (trackerMode) {
            // ── TRACKER MODE: class-focused cards, always expanded, lessons as primary ──
            bookings.forEach(booking => {
                const classSession = booking.classSession || {};
                if (!classSession.isClassBooking) return;

                const statusClass = booking.bookingStatus.toLowerCase();
                const completed = Number(classSession.completedClassesCount || 0);
                const total = Number(classSession.totalClassesPlanned || 0);
                const remaining = classSession.classesRemainingAfterBooking ?? (total - completed);
                const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
                const planStart = classSession.planStartDate ? formatBookingDate(classSession.planStartDate) : 'N/A';
                const planEnd = classSession.planEndDate ? formatBookingDate(classSession.planEndDate) : 'N/A';

                const lessons = Array.isArray(classSession.lessons) ? classSession.lessons : [];
                const lessonRowsHTML = lessons.length > 0
                    ? lessons.map((lesson) => buildLessonRowHTML(lesson, booking._id)).join('')
                    : '';

                html += `
                    <div class="tracker-plan-card booking-card ${statusClass}">
                        <div class="tracker-plan-header">
                            <div class="tracker-plan-title-block">
                                <h3 class="tracker-plan-title">🎓 ${classSession.selectedClassItemName || classSession.instrument || 'Music Class'}</h3>
                                <span class="tracker-plan-meta">📍 ${classSession.location || 'N/A'} &nbsp;·&nbsp; 🗓️ ${classSession.preferredWeekday || 'N/A'}${classSession.preferredStartTime ? ` at ${formatBookingTime(classSession.preferredStartTime)}` : ''}</span>
                                <span class="tracker-plan-meta">📅 ${planStart} → ${planEnd}</span>
                            </div>
                            <span class="status-badge status-${statusClass}">${booking.bookingStatus}</span>
                        </div>
                        <div class="tracker-progress-bar-wrap">
                            <div class="tracker-progress-bar" style="width:${progressPct}%"></div>
                        </div>
                        <div class="tracker-progress-stats">
                            <span>✅ ${completed} completed</span>
                            <span>📚 ${remaining} remaining</span>
                            <span>Total: ${total}</span>
                        </div>
                        <div class="tracker-lessons">
                            ${lessons.length > 0
                                ? `<ul class="lesson-accordion-list">${lessonRowsHTML}</ul>`
                                : '<p class="booking-empty-message booking-empty-padded">No lesson entries yet.</p>'}
                        </div>
                    </div>
                `;
            });
        } else {
            // ── MY BOOKINGS MODE: full booking cards with class details tab ──────────
            bookings.forEach(booking => {
                const isPerday = booking.bookingMode === 'perday';
                const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
                const perDayRange = (booking.perDayStartDate && booking.perDayEndDate)
                    ? `${formatBookingDate(booking.perDayStartDate)} to ${formatBookingDate(booking.perDayEndDate)}`
                    : formatBookingDate(booking.date);
                const perDayTimeRange = `${formatBookingTime(booking.startTime)} to ${formatBookingTime(booking.endTime)}`;
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
                            return `<li>${r.name} × ${r.quantity}${amount > 0 ? ` — ₹${amount}` : ''}</li>`;
                        }).join('')
                    : `<li>${booking.rentalType || 'Unknown rental'}</li>`;

                const bookingDateLine = isPerday
                    ? `<p><strong>📅 Per-day Range:</strong> ${perDayRange} (${perDayDays} day(s))</p>`
                    : `<p><strong>📅 Date:</strong> ${formatBookingDate(booking.date)}</p>`;
                const bookingTimeLine = isPerday
                    ? `<p><strong>🕐 Pick-up/Return:</strong> ${perDayTimeRange}</p>`
                    : `<p><strong>🕐 Time:</strong> ${formatBookingTime(booking.startTime)} - ${formatBookingTime(booking.endTime)} (${booking.duration}h)</p>`;

                const classSession = booking.classSession || {};
                const bookingItemNames = booking.rentals && booking.rentals.length > 0
                    ? booking.rentals.filter((r) => r && r.name).map((r) => r.name)
                    : [];
                const bookingSummaryTitle = classSession.isClassBooking
                    ? (classSession.selectedClassItemName || classSession.instrument || 'Music Class')
                    : (bookingItemNames.length > 0
                        ? `${bookingItemNames.slice(0, 2).join(', ')}${bookingItemNames.length > 2 ? ` +${bookingItemNames.length - 2} more` : ''}`
                        : (booking.rentalType || 'Booking'));
                const bookingSummaryMeta = isPerday
                    ? `${perDayRange} | ${perDayTimeRange}`
                    : `${formatBookingDate(booking.date)} | ${formatBookingTime(booking.startTime)} - ${formatBookingTime(booking.endTime)}`;

                // Class progress badge shown inline in summary
                const classSummaryBadge = classSession.isClassBooking
                    ? (() => {
                        const done = Number(classSession.completedClassesCount || 0);
                        const tot = Number(classSession.totalClassesPlanned || 0);
                        return `<span class="booking-class-progress-badge">${done}/${tot} classes</span>`;
                    })()
                    : '';

                const lessons = Array.isArray(classSession.lessons) ? classSession.lessons : [];
                const lessonRowsHTML = lessons.length > 0
                    ? lessons.map((lesson) => buildLessonRowHTML(lesson, booking._id)).join('')
                    : '';

                const classSessionDetails = classSession.isClassBooking
                    ? `
                        <p><strong>🎓 Instrument:</strong> ${classSession.instrument || 'Music'}</p>
                        <p><strong>🎼 Class Item:</strong> ${classSession.selectedClassItemName || classSession.instrument || 'N/A'}</p>
                        <p><strong>📍 Location:</strong> ${classSession.location || 'N/A'}</p>
                        <p><strong>🗓️ Weekly Slot:</strong> ${(classSession.preferredWeekday || 'N/A')} ${classSession.preferredStartTime ? `at ${formatBookingTime(classSession.preferredStartTime)}` : ''}</p>
                        <p><strong>📅 Plan Window:</strong> ${classSession.planStartDate ? formatBookingDate(classSession.planStartDate) : 'N/A'} → ${classSession.planEndDate ? formatBookingDate(classSession.planEndDate) : 'N/A'}</p>
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
                                ${lessons.length > 0
                                    ? `<ul class="lesson-accordion-list">${lessonRowsHTML}</ul>`
                                    : '<p class="booking-empty-message booking-empty-padded">No lesson tracker entries yet.</p>'}
                            </div>
                        </div>
                    `
                    : '';

                html += `
                    <details class="booking-card booking-card-collapsible ${statusClass}">
                        <summary class="booking-card-summary">
                            <div class="booking-card-summary-primary">
                                <h4 class="booking-card-title">${bookingSummaryTitle}${classSummaryBadge}</h4>
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
        }

        if (bookingsEl) {
            bookingsEl.innerHTML = html || '<p class="booking-empty-message">No valid bookings found</p>';
        }
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
            showBookingAlert('Please select a date.', 'error');
            return;
        }

        if (!proposedStartTime) {
            showBookingAlert('Please select a start time.', 'error');
            return;
        }

        if (btnEl) btnEl.disabled = true;
        const token = localStorage.getItem('token');
        const apiBase = resolveApiUrl();
        const res = await fetch(`${apiBase}/api/bookings/${bookingId}/class-lessons/${lessonId}/request-slot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ proposedDate, proposedStartTime })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to submit slot request');

        showBookingAlert(data.message || 'Slot request submitted!', 'success');
        await loadMyBookings();
    } catch (error) {
        showBookingAlert(error.message || 'Failed to submit slot request', 'error');
        if (btnEl) btnEl.disabled = false;
    }
};

// Withdraw a pending slot request
const cancelSlotRequest = async (bookingId, lessonId, btnEl) => {
    if (!confirm('Withdraw this slot request?')) return;

    try {
        if (btnEl) btnEl.disabled = true;
        const token = localStorage.getItem('token');
        const apiBase = resolveApiUrl();
        const res = await fetch(`${apiBase}/api/bookings/${bookingId}/class-lessons/${lessonId}/request-slot`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ withdraw: true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || 'Failed to withdraw request');

        showBookingAlert(data.message || 'Slot request withdrawn.', 'success');
        await loadMyBookings();
    } catch (error) {
        showBookingAlert(error.message || 'Failed to withdraw request', 'error');
        if (btnEl) btnEl.disabled = false;
    }
};

// Cancel booking
const cancelBooking = async (bookingId) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
        showBookingLoadingOverlay('Cancelling booking...');
        const token = localStorage.getItem('token');
        const apiBase = resolveApiUrl();
        const res = await fetch(`${apiBase}/api/bookings/${bookingId}/cancel`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!res.ok) throw new Error('Failed to cancel booking');

        showBookingAlert('Booking cancelled successfully', 'success');
        await loadMyBookings();
    } catch (error) {
        showBookingAlert(error.message || 'Failed to cancel booking', 'error');
    } finally {
        hideBookingLoadingOverlay();
    }
};

// Download PDF bill for user
const downloadUserPDF = async (bookingId) => {
    try {
        showBookingLoadingOverlay('Generating your bill PDF...');

        const token = localStorage.getItem('token');

        // First, try server-side PDF generation
        try {
            console.log('Attempting server-side PDF generation...');
            const apiBase = resolveApiUrl();
            const res = await fetch(`${apiBase}/api/bookings/${bookingId}/download-pdf`, {
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

                showBookingAlert('Your bill PDF has been downloaded successfully!', 'success');
                return; // Success, exit early
            }

            const error = await res.json();
            console.log('Server-side PDF failed:', error.message);
            throw new Error(error.message || 'Server-side PDF generation failed');

        } catch (serverError) {
            console.log('Server-side PDF generation failed, trying client-side...', serverError.message);

            // Fallback to client-side PDF generation
            showBookingLoadingOverlay('Server unavailable, generating PDF locally...');

            const apiBase = resolveApiUrl();

            // Get booking data and admin settings for client-side generation
            const [bookingRes, settingsRes] = await Promise.all([
                fetch(`${apiBase}/api/bookings/${bookingId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${apiBase}/api/admin/debug-settings`, {
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
            if (typeof window.generatePDFClient !== 'function') {
                throw new Error('generatePDFClient is not defined');
            }

            await window.generatePDFClient(bookingData.booking, settingsData);
            showBookingAlert('Your bill PDF has been downloaded successfully! (Generated locally)', 'success');
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

        showBookingAlert(userMessage, 'error');
    } finally {
        hideBookingLoadingOverlay();
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
window.loadLessonTrackerBookings = () => loadMyBookings({ classOnly: true });
