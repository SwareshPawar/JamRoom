/**
 * Admin bookings module.
 * Handles bookings table rendering and approve/reject flows.
 */

(() => {
    const escapeHtml = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const formatCurrency = (value) => {
        const numeric = Number(value || 0);
        return `₹${Number.isFinite(numeric) ? numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '0'}`;
    };

    const formatDateTime = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/A';

        return parsed.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatSimpleDate = (value) => {
        if (!value) return 'N/A';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return 'N/A';

        return parsed.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const getBookingAdjustment = (booking) => {
        const fallbackType = Number(booking?.priceAdjustmentValue || 0) < 0
            ? 'discount'
            : Number(booking?.priceAdjustmentValue || 0) > 0
                ? 'surcharge'
                : 'none';

        const type = ['none', 'discount', 'surcharge'].includes(String(booking?.priceAdjustmentType || '').toLowerCase())
            ? String(booking.priceAdjustmentType).toLowerCase()
            : fallbackType;

        const amount = Number.isFinite(Number(booking?.priceAdjustmentAmount))
            ? Number(booking.priceAdjustmentAmount)
            : Math.abs(Number(booking?.priceAdjustmentValue || 0));

        const signedValue = Number.isFinite(Number(booking?.priceAdjustmentValue))
            ? Number(booking.priceAdjustmentValue)
            : (type === 'discount' ? -amount : type === 'surcharge' ? amount : 0);

        return {
            type,
            amount,
            signedValue,
            note: String(booking?.priceAdjustmentNote || '').trim()
        };
    };

    const getCollectedAmount = (booking) => {
        const total = Number(booking?.price || 0);
        const status = String(booking?.paymentStatus || '').toUpperCase();
        const amountPaid = Number(booking?.amountPaid || 0);

        if (status === 'PAID') return Math.max(0, total);
        if (status === 'PARTIAL') return Math.max(0, Math.min(total, amountPaid));
        return 0;
    };

    const notifyBookingAlert = (message, type = 'info') => {
        const alertMessage = String(message || 'Action failed');
        const alertType = String(type || 'info');
        const depsAlert = state.loadDeps?.showAlert;

        if (typeof depsAlert === 'function') {
            if (depsAlert === window.showAlert || depsAlert.length <= 2) {
                depsAlert(alertMessage, alertType);
            } else {
                depsAlert('bookingAlert', alertMessage, alertType);
            }
            return;
        }

        if (window.alertManager && typeof window.alertManager.show === 'function') {
            window.alertManager.show(alertMessage, alertType);
            return;
        }

        if (typeof window.showAlert === 'function') {
            window.showAlert(alertMessage, alertType);
            return;
        }

        alert(alertMessage);
    };

    const showBookingLoading = (message) => {
        const depsLoader = state.loadDeps?.showLoading;
        if (typeof depsLoader === 'function') {
            depsLoader(message);
            return;
        }

        if (typeof window.showLoading === 'function') {
            window.showLoading(message);
        }
    };

    const hideBookingLoading = () => {
        const depsHideLoader = state.loadDeps?.hideLoading;
        if (typeof depsHideLoader === 'function') {
            depsHideLoader();
            return;
        }

        if (typeof window.hideLoading === 'function') {
            window.hideLoading();
        }
    };

    const state = {
        bookingsById: new Map(),
        allBookings: [],
        formatDate: null,
        formatTime: null,
        searchTerm: '',
        sortBy: 'created_desc',
        deletedFilter: 'active',
        pageSize: 5,
        currentPage: 1,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false,
        searchDebounceTimer: null,
        loadDeps: null,
        classLessonContext: null
    };

    const getTodayYmd = () => {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    };

    const normalizeTimeValue = (value) => {
        const raw = String(value || '').trim();
        const match = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return '';

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return '';
        }

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    };

    const hideClassLessonCompletionModal = () => {
        const modal = document.getElementById('classLessonCompletionModal');
        if (modal) modal.classList.remove('show');
        state.classLessonContext = null;
    };

    const openClassLessonCompletionModal = (bookingId, lessonId) => {
        const deps = state.loadDeps;
        const booking = state.bookingsById.get(String(bookingId || ''));
        const lessons = Array.isArray(booking?.classSession?.lessons) ? booking.classSession.lessons : [];
        const lesson = lessons.find((entry) => String(entry?._id) === String(lessonId));

        if (!deps || !booking || !lesson) {
            notifyBookingAlert('Unable to open class completion form. Please refresh and try again.', 'error');
            return;
        }

        state.classLessonContext = {
            bookingId: String(bookingId || ''),
            lessonId: String(lessonId || '')
        };

        const titleEl = document.getElementById('classLessonCompletionTitle');
        const summaryEl = document.getElementById('classLessonCompletionSummary');
        const dateEl = document.getElementById('classCompletedDate');
        const startTimeEl = document.getElementById('classCompletedStartTime');
        const notesEl = document.getElementById('classCompletedNotes');
        const detailsEl = document.getElementById('classCompletedDetails');

        if (titleEl) {
            titleEl.textContent = `Mark Class Completed - Week ${lesson?.weekNumber || lesson?.classNumber || 1}`;
        }

        if (summaryEl) {
            const instrument = String(booking?.classSession?.instrument || 'Music').trim();
            const student = String(booking?.userName || 'Student').trim();
            const scheduledDate = lesson?.scheduledDate ? formatSimpleDate(lesson.scheduledDate) : 'N/A';
            const scheduledStart = lesson?.scheduledStartTime || booking?.startTime || 'N/A';
            const scheduledEnd = lesson?.scheduledEndTime || booking?.endTime || 'N/A';
            summaryEl.innerHTML = `
                <p><strong>Student:</strong> ${escapeHtml(student)}</p>
                <p><strong>Instrument:</strong> ${escapeHtml(instrument)}</p>
                <p><strong>Scheduled:</strong> ${escapeHtml(scheduledDate)} (${escapeHtml(scheduledStart)} - ${escapeHtml(scheduledEnd)})</p>
            `;
        }

        const defaultDate = lesson?.scheduledDate
            ? (() => {
                const d = new Date(lesson.scheduledDate);
                if (Number.isNaN(d.getTime())) return getTodayYmd();
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })()
            : getTodayYmd();

        if (dateEl) dateEl.value = defaultDate;
        if (startTimeEl) startTimeEl.value = normalizeTimeValue(lesson?.scheduledStartTime || booking?.startTime || '') || '';
        if (notesEl) notesEl.value = String(lesson?.notes || '').trim();
        if (detailsEl) detailsEl.value = String(lesson?.details || '').trim();

        const modal = document.getElementById('classLessonCompletionModal');
        if (modal) modal.classList.add('show');

        setTimeout(() => {
            if (dateEl) dateEl.focus();
        }, 0);
    };

    const getRentalLineTotal = (booking, rental) => {
        const quantity = Math.max(1, Number(rental?.quantity) || 1);
        const unitPrice = Number(rental?.price || 0);
        const isPerday = String(rental?.rentalType || booking?.bookingMode || '').toLowerCase() === 'perday';
        const isBaseRental = /\(base\)/i.test(String(rental?.name || '')) || rental?.isRequired === true;
        const duration = Math.max(1, Number(booking?.duration) || 1);

        if (isPerday) {
            return unitPrice * quantity;
        }

        if (isBaseRental || unitPrice === 0 || /iem/i.test(String(rental?.name || ''))) {
            return unitPrice * quantity * duration;
        }

        return unitPrice * duration;
    };

    const buildRentalsMarkup = (booking) => {
        const rentals = Array.isArray(booking?.rentals) ? booking.rentals : [];
        if (rentals.length === 0) {
            return '<p class="booking-meta-empty">No rental items provided.</p>';
        }

        const lines = rentals.map((rental) => {
            const quantity = Math.max(1, Number(rental?.quantity) || 1);
            const name = escapeHtml(rental?.name || 'Unnamed item');
            const unitPrice = formatCurrency(rental?.price || 0);
            const lineTotal = formatCurrency(getRentalLineTotal(booking, rental));
            return `
                <li>
                    <span>${name} x ${quantity}</span>
                    <span>${unitPrice} each | ${lineTotal}</span>
                </li>
            `;
        }).join('');

        return `<ul class="booking-meta-list">${lines}</ul>`;
    };

    const buildRequirementsMarkup = (booking) => {
        const rentals = Array.isArray(booking?.rentals) ? booking.rentals : [];
        const equipmentMap = new Map();

        rentals.forEach((rental) => {
            const name = String(rental?.name || '').trim();
            if (!name || /\(base\)/i.test(name)) {
                return;
            }

            const key = name.toLowerCase();
            const quantity = Math.max(1, Number(rental?.quantity) || 1);
            const existing = equipmentMap.get(key);

            if (!existing) {
                equipmentMap.set(key, { name, quantity });
                return;
            }

            existing.quantity += quantity;
        });

        const requirementParts = [];

        if (equipmentMap.size > 0) {
            const equipmentItems = [...equipmentMap.values()]
                .map((item) => `${escapeHtml(item.name)} - ${item.quantity}`)
                .join(',<br>');

            requirementParts.push(`<p><strong>Equipment:</strong> ${equipmentItems}</p>`);
        }

        if (booking?.bandName) {
            requirementParts.push(`<p><strong>Band Name:</strong> ${escapeHtml(booking.bandName)}</p>`);
        }

        if (booking?.notes) {
            requirementParts.push(`<p><strong>Notes:</strong> ${escapeHtml(booking.notes)}</p>`);
        }

        if (requirementParts.length === 0) {
            return '<p class="booking-meta-empty">No additional requirements shared by user.</p>';
        }

        return `<div class="booking-requirements">${requirementParts.join('')}</div>`;
    };

    const buildBookingActionsMarkup = (booking, { context = 'table', includeView = false } = {}) => {
        const status = String(booking?.bookingStatus || '').toUpperCase();
        const serializedBooking = JSON.stringify(booking || {}).replace(/"/g, '&quot;');
        const stopOrClose = context === 'modal'
            ? "closeModal('bookingActionModal'); "
            : `event.stopPropagation(); `;
        const actionClass = context === 'modal' ? 'booking-expand-actions' : 'booking-table-actions';
        const isDeleted = booking?.isDeleted === true;

        if (isDeleted) {
            return `
                <div class="${actionClass}">
                    <button onclick="${stopOrClose}restoreBooking('${booking._id}')" class="btn btn-success btn-sm">Restore</button>
                    <button onclick="${stopOrClose}permanentlyDeleteBooking('${booking._id}')" class="btn btn-danger btn-sm">Permanent Delete</button>
                </div>
            `;
        }

        return `
            <div class="${actionClass}">
                ${includeView
                    ? `<button onclick="openBookingPaymentDetails('${booking._id}', event)" class="btn btn-primary btn-sm">Payment</button>`
                    : ''}
                ${status === 'PENDING'
                    ? `<button onclick="${stopOrClose}approveBooking('${booking._id}')" class="btn btn-success btn-sm">Approve</button>
                       <button onclick="${stopOrClose}rejectBooking('${booking._id}')" class="btn btn-danger btn-sm">Reject</button>`
                    : ''}
                ${status === 'CONFIRMED'
                    ? `<button onclick="${stopOrClose}sendEBill('${booking._id}')" class="btn btn-primary btn-sm" title="Send eBill to customer and/or custom recipients">Send eBill</button>
                       <button onclick="${stopOrClose}downloadPDF('${booking._id}')" class="btn btn-secondary btn-sm" title="Download PDF Bill">Download PDF</button>`
                    : ''}
                <button onclick="${stopOrClose}editBooking('${booking._id}', ${serializedBooking})" class="btn btn-warning btn-sm">Edit</button>
                <button onclick="${stopOrClose}deleteBooking('${booking._id}')" class="btn btn-danger btn-sm">Delete</button>
            </div>
        `;
    };

    const buildClassTrackingMarkup = (booking) => {
        const classSession = booking?.classSession || {};
        if (!classSession?.isClassBooking) {
            return '';
        }

        const lessons = Array.isArray(classSession.lessons) ? classSession.lessons : [];
        const fmtTime = state.formatTime || ((t) => t || 'N/A');
        const pendingApprovalCount = lessons.filter((lesson) => String(lesson?.slotRequest?.status || 'NONE').toUpperCase() === 'PENDING').length;
        const lessonLines = lessons.length > 0
            ? lessons.map((lesson) => {
                const lessonId = String(lesson?._id || '');
                const status = String(lesson?.status || 'SCHEDULED').toUpperCase();
                const statusClass = status === 'COMPLETED' ? 'completed' : status === 'CANCELLED' ? 'cancelled' : 'scheduled';
                const statusLabel = status.charAt(0) + status.slice(1).toLowerCase();
                const weekNum = lesson?.weekNumber || lesson?.classNumber || 1;
                const scheduledDate = lesson?.scheduledDate ? formatSimpleDate(lesson.scheduledDate) : 'TBD';
                const completionDate = lesson?.completedDate ? formatSimpleDate(lesson.completedDate) : null;
                const completionTimeStr = lesson?.completedStartTime && lesson?.completedEndTime
                    ? `${fmtTime(lesson.completedStartTime)} - ${fmtTime(lesson.completedEndTime)}`
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
                const hasPendingSlot = slotReqStatus === 'PENDING';
                const slotReqHeaderBadge = hasPendingSlot
                    ? ' <span class="lesson-status-badge lesson-status-scheduled lesson-status-pending-approval">Pending Approval</span>'
                    : '';
                const slotReqBlock = hasPendingSlot
                    ? `<div class="lesson-slot-request lesson-slot-pending lesson-slot-request-admin">
                           <p class="lesson-slot-request-title"><strong>Pending Approval</strong></p>
                           <p><strong>Requested Slot:</strong> ${escapeHtml(slotReq.proposedDate ? formatSimpleDate(slotReq.proposedDate) : 'N/A')} at ${escapeHtml(slotReq.proposedStartTime || 'N/A')}${slotReq.proposedEndTime ? ` - ${escapeHtml(slotReq.proposedEndTime)}` : ''}</p>
                           <div class="lesson-slot-request-actions">
                               <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); approveSlotRequest('${booking._id}','${lessonId}')">Approve Slot</button>
                               <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); rejectSlotRequest('${booking._id}','${lessonId}')">Reject Slot</button>
                           </div>
                       </div>`
                    : '';

                return `
                    <li>
                        <details class="lesson-accordion">
                            <summary class="lesson-accordion-header">
                                <span class="lesson-accordion-week">Week ${weekNum}${headerDateStr ? ` · ${headerDateStr}` : ''}${slotReqHeaderBadge}</span>
                                <span class="lesson-status-badge lesson-status-${statusClass}">${statusLabel}</span>
                            </summary>
                            <div class="lesson-accordion-body">
                                <p><strong>Scheduled:</strong> ${escapeHtml(scheduledDate)} (${escapeHtml(lesson?.scheduledStartTime || 'N/A')} – ${escapeHtml(lesson?.scheduledEndTime || 'N/A')})</p>
                                ${status === 'COMPLETED'
                                    ? `<p><strong>Completed on:</strong> ${escapeHtml(completionDate || 'N/A')}${completionTimeStr ? `, ${escapeHtml(completionTimeStr)}` : ''}</p>
                                       ${lesson?.notes ? `<p><strong>Notes:</strong> ${escapeHtml(lesson.notes)}</p>` : ''}
                                       ${lesson?.details ? `<p><strong>Details:</strong> ${escapeHtml(lesson.details)}</p>` : ''}`
                                    : `<div style="display:flex;gap:6px;flex-wrap:wrap">
                                           <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); markClassLessonCompleted('${booking._id}', '${lessonId}')">Mark Completed</button>
                                           <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); cancelClassLesson('${booking._id}', '${lessonId}')">Cancel</button>
                                       </div>${slotReqBlock}
                                       <details class="lesson-slot-form" style="margin-top:8px;">
                                           <summary style="cursor:pointer;font-size:0.85em;font-weight:600;color:var(--primary-color);list-style:none;display:inline-flex;align-items:center;gap:4px;">
                                               📅 Book Slot (Admin)
                                           </summary>
                                           <div style="margin-top:8px;display:grid;gap:8px;">
                                               <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                                                   <div class="form-group" style="margin-bottom:0;">
                                                       <label style="margin-bottom:6px;">Date</label>
                                                       <input type="date" class="admin-book-slot-date form-control input" data-booking="${booking._id}" data-lesson="${lessonId}" />
                                                   </div>
                                                   <div class="form-group" style="margin-bottom:0;">
                                                       <label style="margin-bottom:6px;">Start Time</label>
                                                       <select class="admin-book-slot-time">
                                                           <option value="">Select time</option>
                                                           <option value="09:00">9:00 AM</option>
                                                           <option value="10:00">10:00 AM</option>
                                                           <option value="11:00">11:00 AM</option>
                                                           <option value="12:00">12:00 PM</option>
                                                           <option value="13:00">1:00 PM</option>
                                                           <option value="14:00">2:00 PM</option>
                                                           <option value="15:00">3:00 PM</option>
                                                           <option value="16:00">4:00 PM</option>
                                                           <option value="17:00">5:00 PM</option>
                                                           <option value="18:00">6:00 PM</option>
                                                           <option value="19:00">7:00 PM</option>
                                                           <option value="20:00">8:00 PM</option>
                                                           <option value="21:00">9:00 PM</option>
                                                           <option value="22:00">10:00 PM</option>
                                                           <option value="23:00">11:00 PM</option>
                                                       </select>
                                                   </div>
                                               </div>
                                               <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); adminBookSlot('${booking._id}','${lessonId}', this)" style="width:100%;">Confirm Slot</button>
                                           </div>
                                       </details>`}
                            </div>
                        </details>
                    </li>`;
            }).join('')
            : '<li style="padding:6px 12px;color:var(--text-color-light);">No lessons generated yet.</li>';

        return `
            <section class="booking-class-tracking">
                <div class="booking-class-tracking-head">
                    <h4>Class Tracking</h4>
                    ${pendingApprovalCount > 0
                        ? `<span class="booking-class-tracking-pill">${pendingApprovalCount} Pending Approval${pendingApprovalCount > 1 ? 's' : ''}</span>`
                        : ''}
                </div>
                <div class="booking-kv-grid">
                    <p><strong>Item:</strong> ${escapeHtml(classSession.selectedClassItemName || classSession.instrument || 'N/A')}</p>
                    <p><strong>Location:</strong> ${escapeHtml(classSession.location || 'N/A')}</p>
                    <p><strong>Plan:</strong> ${escapeHtml(String(classSession.planMonths || 1))} month(s)</p>
                    <p><strong>Plan Window:</strong> ${classSession.planStartDate ? formatSimpleDate(classSession.planStartDate) : 'N/A'} to ${classSession.planEndDate ? formatSimpleDate(classSession.planEndDate) : 'N/A'}</p>
                    <p><strong>Classes/Month:</strong> ${escapeHtml(String(classSession.classesPerMonth || 0))}</p>
                    <p><strong>Total Planned:</strong> ${escapeHtml(String(classSession.totalClassesPlanned || 0))}</p>
                    <p><strong>Completed:</strong> ${escapeHtml(String(classSession.completedClassesCount || 0))}</p>
                    <p><strong>Remaining:</strong> ${escapeHtml(String(classSession.classesRemainingAfterBooking || 0))}</p>
                    <p><strong>Plan Fee:</strong> ${formatCurrency(classSession.totalFeeBeforeDiscount || classSession.monthlyFee || 0)}</p>
                    <p><strong>Payable:</strong> ${formatCurrency(classSession.totalFeeAfterDiscount || classSession.monthlyFeeDueNow || 0)}</p>
                </div>
                <div class="booking-requirements">
                    <p><strong>Lessons:</strong></p>
                    <ul class="lesson-accordion-list">${lessonLines}</ul>
                </div>
            </section>
        `;
    };

    const buildBookingDetailsMarkup = ({ booking, formatDate, formatTime, includeActions = true, context = 'modal' }) => {
        const isPerday = booking.bookingMode === 'perday';
        const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
        const normalizedBookingStatus = String(booking?.bookingStatus || '').toUpperCase();
        const isRejectedBooking = normalizedBookingStatus === 'REJECTED';
        const userName = booking.userId?.name || booking.userName || 'N/A';
        const userEmail = booking.userId?.email || booking.userEmail || 'N/A';
        const userMobile = booking.userMobile || 'N/A';

        const dateText = isPerday && booking.perDayStartDate && booking.perDayEndDate
            ? `${formatDate(booking.perDayStartDate)} to ${formatDate(booking.perDayEndDate)}`
            : formatDate(booking.date);
        const timeText = isPerday
            ? `${formatTime(booking.startTime)} to ${formatTime(booking.endTime)}`
            : `${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`;
        const durationText = isPerday ? `${perDayDays} day(s)` : `${booking.duration} hour(s)`;
        const modeText = isPerday ? 'Per-day' : 'Hourly';
        const adjustment = getBookingAdjustment(booking);
        const adjustmentLabel = adjustment.signedValue < 0 ? 'Discount' : 'Surcharge';
        const adjustmentColorClass = adjustment.signedValue < 0 ? 'text-danger' : 'text-info';
        const normalizedPaymentStatus = ['PENDING', 'PARTIAL', 'PAID'].includes(String(booking?.paymentStatus || '').toUpperCase())
            ? String(booking.paymentStatus).toUpperCase()
            : 'PENDING';
        const totalAmount = Math.max(0, Number(booking?.price || 0));
        const amountPaidFromBooking = Number.isFinite(Number(booking?.amountPaid))
            ? Number(booking.amountPaid)
            : (normalizedPaymentStatus === 'PAID' ? totalAmount : 0);
        const collectedAmount = isRejectedBooking ? 0 : getCollectedAmount(booking);
        const outstandingAmount = isRejectedBooking ? 0 : Math.max(0, Number(booking?.price || 0) - collectedAmount);
        const paymentStatusText = isRejectedBooking
            ? 'Not Applicable (Rejected)'
            : normalizedPaymentStatus;

        return `
            <div class="booking-expand-body booking-modal-body">
                <div class="booking-expand-grid">
                    <section class="booking-expand-panel admin-theme-info-card admin-theme-info-card-accent">
                        <h4>Booking Details</h4>
                        <div class="booking-kv-grid">
                            <p><strong>Booking ID:</strong> ${escapeHtml(booking._id || 'N/A')}</p>
                            <p><strong>Mode:</strong> ${modeText}</p>
                            <p><strong>Date/Range:</strong> ${dateText}</p>
                            <p><strong>Time:</strong> ${timeText}</p>
                            <p><strong>Duration:</strong> ${durationText}</p>
                            <p><strong>Created:</strong> ${formatDateTime(booking.createdAt)}</p>
                            <p><strong>Updated:</strong> ${formatDateTime(booking.updatedAt)}</p>
                            <p><strong>Booking Status:</strong> ${escapeHtml(booking.bookingStatus || 'N/A')}</p>
                            <p><strong>Payment Status:</strong> ${escapeHtml(paymentStatusText)}</p>
                            <p><strong>Amount Received:</strong> ${isRejectedBooking ? 'N/A' : formatCurrency(collectedAmount)}</p>
                            <p><strong>Outstanding:</strong> ${isRejectedBooking ? 'N/A' : formatCurrency(outstandingAmount)}</p>
                            <p><strong>Payment Ref:</strong> ${escapeHtml(booking.paymentReference || 'N/A')}</p>
                            <p><strong>Payment Note:</strong> ${escapeHtml(booking.paymentNote || 'N/A')}</p>
                        </div>
                    </section>

                    <section class="booking-expand-panel admin-theme-info-card admin-theme-info-card-muted">
                        <h4>Customer Details</h4>
                        <div class="booking-kv-grid">
                            <p><strong>Name:</strong> ${escapeHtml(userName)}</p>
                            <p><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
                            <p><strong>Mobile:</strong> ${escapeHtml(userMobile)}</p>
                        </div>
                    </section>

                    <section class="booking-expand-panel admin-theme-info-card booking-modal-theme-pricing">
                        <h4>Rentals & Pricing</h4>
                        ${buildRentalsMarkup(booking)}
                        <div class="booking-kv-grid booking-kv-grid-price">
                            <p><strong>Subtotal:</strong> ${formatCurrency(booking.subtotal)}</p>
                            <p><strong>Tax:</strong> ${formatCurrency(booking.taxAmount)}</p>
                            ${adjustment.signedValue !== 0
                                ? `<p><strong>${adjustmentLabel}:</strong> <span class="${adjustmentColorClass}">${adjustment.signedValue < 0 ? '-' : '+'}${formatCurrency(Math.abs(adjustment.signedValue))}</span></p>`
                                : ''}
                            ${adjustment.note
                                ? `<p><strong>Adjustment Note:</strong> ${escapeHtml(adjustment.note)}</p>`
                                : ''}
                            <p><strong>Total:</strong> ${formatCurrency(booking.price)}</p>
                        </div>
                    </section>

                    ${buildClassTrackingMarkup(booking)}

                    <section class="booking-expand-panel admin-theme-info-card booking-modal-theme-requirements">
                        <h4>Requirements</h4>
                        ${buildRequirementsMarkup(booking)}
                    </section>
                </div>

                ${includeActions ? buildBookingActionsMarkup(booking, { context }) : ''}
            </div>
        `;
    };

    const openBookingDetailsModal = (bookingId) => {
        const booking = state.bookingsById.get(String(bookingId || ''));
        if (!booking) return;

        const modal = document.getElementById('bookingActionModal');
        const titleEl = document.getElementById('modalTitle');
        const detailsEl = document.getElementById('modalBookingDetails');
        const rejectReasonGroup = document.getElementById('rejectReasonGroup');
        const confirmButton = document.getElementById('confirmActionBtn');
        const secondaryButton = modal?.querySelector('.modal-actions-row .btn-secondary');

        if (!modal || !titleEl || !detailsEl) return;

        if (rejectReasonGroup) {
            rejectReasonGroup.classList.add('admin-hidden');
        }

        if (confirmButton) {
            confirmButton.style.display = 'none';
        }

        if (secondaryButton) {
            secondaryButton.textContent = 'Close';
        }

        titleEl.textContent = 'Booking Details';
        detailsEl.innerHTML = buildBookingDetailsMarkup({
            booking,
            formatDate: state.formatDate || formatSimpleDate,
            formatTime: state.formatTime || ((time) => time || 'N/A'),
            includeActions: true,
            context: 'modal'
        });

        modal.classList.add('show');

        // Initialize Flatpickr for admin slot booking date pickers
        setTimeout(() => {
            initializeAdminSlotDatePickers();
        }, 0);
    };

    const initializeAdminSlotDatePickers = () => {
        if (typeof window.flatpickr !== 'function') {
            return;
        }

        const dateInputs = document.querySelectorAll('.admin-book-slot-date');
        dateInputs.forEach((inputEl) => {
            if (inputEl.dataset.flatpickrBound === '1') {
                return;
            }

            inputEl.dataset.flatpickrBound = '1';

            window.flatpickr(inputEl, {
                dateFormat: 'Y-m-d',
                altInput: true,
                altFormat: 'd M Y',
                disableMobile: true,
                minDate: 'today',
                clickOpens: true,
                onChange: () => {
                    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    };

    const buildPaginationMarkup = () => {
        const totalPages = Math.max(1, Number(state.totalPages) || 1);
        const currentPage = Math.max(1, Math.min(Number(state.currentPage) || 1, totalPages));

        return `
            <div class="bookings-pagination-controls">
                <button type="button" id="bookingsPageFirst" class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''}>First</button>
                <button type="button" id="bookingsPagePrev" class="btn btn-sm btn-secondary" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
                <span class="bookings-page-meta">Page ${currentPage} of ${totalPages}</span>
                <button type="button" id="bookingsPageNext" class="btn btn-sm btn-secondary" ${!state.hasNextPage ? 'disabled' : ''}>Next</button>
                <button type="button" id="bookingsPageLast" class="btn btn-sm btn-secondary" ${!state.hasNextPage ? 'disabled' : ''}>Last</button>
            </div>
        `;
    };

    const buildTableControlsMarkup = (pageCount) => {
        const totalCount = Number(state.totalCount) || 0;
        const pageStart = totalCount === 0
            ? 0
            : ((Math.max(1, state.currentPage) - 1) * Math.max(1, state.pageSize)) + 1;
        const pageEnd = totalCount === 0 ? 0 : Math.min(totalCount, pageStart + Math.max(0, pageCount - 1));

        return `
            <div class="bookings-table-controls">
                <input
                    type="text"
                    id="bookingsSearchInput"
                    class="bookings-search-input"
                    placeholder="Search by user, booking ID, status, equipment"
                    value="${escapeHtml(state.searchTerm)}"
                >
                <select id="bookingsSortSelect" class="bookings-sort-select">
                    <option value="created_desc" ${state.sortBy === 'created_desc' ? 'selected' : ''}>Created: Latest First</option>
                    <option value="created_asc" ${state.sortBy === 'created_asc' ? 'selected' : ''}>Created: Oldest First</option>
                    <option value="date_desc" ${state.sortBy === 'date_desc' ? 'selected' : ''}>Booking Date: Newest First</option>
                    <option value="date_asc" ${state.sortBy === 'date_asc' ? 'selected' : ''}>Booking Date: Oldest First</option>
                    <option value="price_desc" ${state.sortBy === 'price_desc' ? 'selected' : ''}>Price: High to Low</option>
                    <option value="price_asc" ${state.sortBy === 'price_asc' ? 'selected' : ''}>Price: Low to High</option>
                    <option value="status_asc" ${state.sortBy === 'status_asc' ? 'selected' : ''}>Status: A to Z</option>
                </select>
                <select id="bookingsDeletedFilter" class="bookings-sort-select">
                    <option value="active" ${state.deletedFilter === 'active' ? 'selected' : ''}>Active</option>
                    <option value="deleted" ${state.deletedFilter === 'deleted' ? 'selected' : ''}>Deleted</option>
                    <option value="all" ${state.deletedFilter === 'all' ? 'selected' : ''}>All</option>
                </select>
                <select id="bookingsPageSize" class="bookings-limit-select">
                    <option value="5" ${state.pageSize === 5 ? 'selected' : ''}>Show 5</option>
                    <option value="10" ${state.pageSize === 10 ? 'selected' : ''}>Show 10</option>
                    <option value="25" ${state.pageSize === 25 ? 'selected' : ''}>Show 25</option>
                    <option value="50" ${state.pageSize === 50 ? 'selected' : ''}>Show 50</option>
                </select>
                <div class="bookings-table-meta">Showing ${pageStart}-${pageEnd} of ${totalCount}</div>
            </div>
        `;
    };

    const bindTableControls = () => {
        const searchInput = document.getElementById('bookingsSearchInput');
        const sortSelect = document.getElementById('bookingsSortSelect');
        const deletedFilterSelect = document.getElementById('bookingsDeletedFilter');
        const pageSizeSelect = document.getElementById('bookingsPageSize');
        const firstButton = document.getElementById('bookingsPageFirst');
        const prevButton = document.getElementById('bookingsPagePrev');
        const nextButton = document.getElementById('bookingsPageNext');
        const lastButton = document.getElementById('bookingsPageLast');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                state.searchTerm = searchInput.value || '';

                if (state.searchDebounceTimer) {
                    clearTimeout(state.searchDebounceTimer);
                }

                state.searchDebounceTimer = setTimeout(() => {
                    loadBookings({ page: 1, showLoader: false });
                }, 250);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                state.sortBy = sortSelect.value || 'created_desc';
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (deletedFilterSelect) {
            deletedFilterSelect.addEventListener('change', () => {
                state.deletedFilter = deletedFilterSelect.value || 'active';
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => {
                state.pageSize = Math.max(1, Number(pageSizeSelect.value) || 5);
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (firstButton) {
            firstButton.addEventListener('click', () => {
                loadBookings({ page: 1, showLoader: false });
            });
        }

        if (prevButton) {
            prevButton.addEventListener('click', () => {
                loadBookings({ page: Math.max(1, state.currentPage - 1), showLoader: false });
            });
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => {
                if (!state.hasNextPage) return;
                loadBookings({ page: state.currentPage + 1, showLoader: false });
            });
        }

        if (lastButton) {
            lastButton.addEventListener('click', () => {
                loadBookings({ page: Math.max(1, state.totalPages), showLoader: false });
            });
        }
    };

    const renderBookingsTableView = () => {
        const tableEl = document.getElementById('bookingsTable');
        if (!tableEl) {
            return;
        }

        const visible = Array.isArray(state.allBookings) ? state.allBookings : [];
        let html = buildTableControlsMarkup(visible.length);

        if ((Number(state.totalCount) || 0) === 0) {
            html += '<p class="text-center-muted-padded">No bookings found</p>';
            tableEl.innerHTML = html;
            bindTableControls();
            return;
        }

        if (visible.length === 0) {
            html += '<p class="text-center-muted-padded">No bookings match current search/filter.</p>';
            tableEl.innerHTML = html;
            bindTableControls();
            return;
        }

        html += '<div class="table-container"><table><thead><tr><th>#</th><th>User</th><th>Date</th><th>Time</th><th>Duration</th><th>Type</th><th>Price</th><th>Status/Payment</th><th>Created</th><th>Actions</th></tr></thead><tbody>';

        let serialNo = ((Math.max(1, state.currentPage) - 1) * Math.max(1, state.pageSize)) + 1;
        visible.forEach((booking) => {
            const isPerday = booking.bookingMode === 'perday';
            const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
            const dateText = isPerday && booking.perDayStartDate && booking.perDayEndDate
                ? `${formatSimpleDate(booking.perDayStartDate)}<br><small>to ${formatSimpleDate(booking.perDayEndDate)}</small>`
                : formatSimpleDate(booking.date);
            const timeText = isPerday
                ? `${state.formatTime(booking.startTime)} to ${state.formatTime(booking.endTime)}`
                : `${state.formatTime(booking.startTime)} - ${state.formatTime(booking.endTime)}`;
            const durationText = isPerday
                ? `${perDayDays} day(s)`
                : `${booking.duration} hour(s)`;

            const statusClass = String(booking.bookingStatus || '').toLowerCase();
            const paymentStatusClass = String(booking.paymentStatus || 'pending').toLowerCase();
            const normalizedBookingStatus = String(booking.bookingStatus || '').toUpperCase();
            const showPaymentBadge = normalizedBookingStatus !== 'REJECTED';
            const userName = booking.userId?.name || booking.userName || 'N/A';
            const userEmail = booking.userId?.email || booking.userEmail || 'N/A';
            const createdDate = booking.createdAt ? formatDateTime(booking.createdAt) : 'N/A';
            const rentalSummary = booking.rentals && booking.rentals.length > 0
                ? booking.rentals.map((r) => `${escapeHtml(r.name)} x ${Math.max(1, Number(r.quantity) || 1)}`).join('<br>')
                : escapeHtml(booking.rentalType || 'N/A');
            const adjustment = getBookingAdjustment(booking);
            const adjustmentLabel = adjustment.signedValue < 0 ? 'Discount' : 'Surcharge';
            const adjustmentLine = adjustment.signedValue !== 0
                ? `<br>${adjustmentLabel}: ${adjustment.signedValue < 0 ? '-' : '+'}${formatCurrency(Math.abs(adjustment.signedValue))}`
                : '';

            html += `
                <tr class="booking-row-clickable" onclick="openBookingDetailsModal('${booking._id}')" onkeydown="if(event.key === 'Enter' || event.key === ' '){ event.preventDefault(); openBookingDetailsModal('${booking._id}'); }" tabindex="0">
                    <td class="table-serial-cell">${serialNo++}</td>
                    <td>${escapeHtml(userName)}<br><small>${escapeHtml(userEmail)}</small></td>
                    <td>${dateText}</td>
                    <td>${timeText}</td>
                    <td>${durationText}</td>
                    <td>${rentalSummary}</td>
                    <td>
                        ${formatCurrency(booking.price)}
                        ${booking.subtotal !== undefined && booking.taxAmount !== undefined
                            ? `<br><small>Subtotal: ${formatCurrency(booking.subtotal)}<br>Tax: ${formatCurrency(booking.taxAmount)}${adjustmentLine}</small>`
                            : ''}
                    </td>
                    <td>
                        <span class="status-badge status-${statusClass}">${escapeHtml(booking.bookingStatus || 'N/A')}</span>
                        ${showPaymentBadge
                            ? `/ <span class="status-badge status-${paymentStatusClass}">${escapeHtml(booking.paymentStatus || 'PENDING')}</span>`
                            : ''}
                    </td>
                    <td><small>${escapeHtml(createdDate)}</small></td>
                    <td>${buildBookingActionsMarkup(booking, { context: 'table', includeView: true })}</td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        html += buildPaginationMarkup();
        tableEl.innerHTML = html;
        bindTableControls();
    };

    const setBookingsError = (message) => {
        const table = document.getElementById('bookingsTable');
        if (table) {
            table.innerHTML = `<p class="text-danger">Failed to load bookings: ${message}</p>`;
        }
    };

    const renderBookingsTable = ({ bookings, formatDate, formatTime }) => {
        const loadingEl = document.getElementById('bookingsLoading');
        const tableEl = document.getElementById('bookingsTable');

        if (loadingEl) {
            loadingEl.style.display = 'none';
        }

        if (!tableEl) {
            return;
        }

        state.bookingsById.clear();
        state.allBookings = Array.isArray(bookings) ? bookings : [];
        state.formatDate = formatDate;
        state.formatTime = formatTime;

        state.allBookings.forEach((booking) => {
            state.bookingsById.set(String(booking._id), booking);
        });

        if (state.searchTerm === undefined || state.searchTerm === null) {
            state.searchTerm = '';
        }
        if (!state.sortBy) {
            state.sortBy = 'created_desc';
        }
        if (!state.pageSize || state.pageSize < 1) {
            state.pageSize = 5;
        }

        renderBookingsTableView();
    };

    const normalizeBookingActionError = ({ errorMessage, mode }) => {
        let userMessage = errorMessage;

        if (errorMessage.includes('Daily user sending limit exceeded')) {
            userMessage = mode === 'approve'
                ? 'Gmail daily limit reached. Booking was approved, but notification email failed. Inform customer manually and retry after 24 hours.'
                : 'Gmail daily limit reached. Booking was rejected, but notification email failed. Inform customer manually and retry after 24 hours.';
        } else if (errorMessage.includes('Authentication failed') || errorMessage.includes('invalid credentials')) {
            userMessage = mode === 'approve'
                ? 'Booking approved, but notification email failed due to email configuration. Check EMAIL_USER/EMAIL_PASS and app password.'
                : 'Booking rejected, but notification email failed due to email configuration. Check EMAIL_USER/EMAIL_PASS and app password.';
        }

        return userMessage;
    };

    const loadBookings = async (depsOrOptions = {}, maybeOptions = {}) => {
        try {
            let deps = state.loadDeps;
            let options = depsOrOptions || {};

            if (depsOrOptions && typeof depsOrOptions === 'object' && Object.prototype.hasOwnProperty.call(depsOrOptions, 'apiUrl')) {
                deps = depsOrOptions;
                state.loadDeps = depsOrOptions;
                options = maybeOptions || {};
            }

            if (!deps || !deps.apiUrl) {
                throw new Error('Missing bookings loader dependencies');
            }

            const {
                apiUrl,
                showSectionLoading,
                formatDate,
                formatTime
            } = deps;

            const requestedPage = Math.max(1, Number(options.page) || state.currentPage || 1);

            if (options.showLoader !== false) {
                showSectionLoading('bookingsTable', 'Loading bookings...');
            }

            const token = localStorage.getItem('token');
            const params = new URLSearchParams();
            params.set('page', String(requestedPage));
            params.set('limit', String(Math.max(1, Number(state.pageSize) || 5)));
            params.set('sortBy', String(state.sortBy || 'created_desc'));
            params.set('deleted', String(state.deletedFilter || 'active'));

            const normalizedSearch = String(state.searchTerm || '').trim();
            if (normalizedSearch) {
                params.set('q', normalizedSearch);
            }

            const res = await fetch(`${apiUrl}/api/admin/bookings?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load bookings');
            }

            const data = await res.json();
            const pagination = data?.pagination || {};

            state.currentPage = Math.max(1, Number(pagination.page) || requestedPage);
            state.totalPages = Math.max(0, Number(pagination.totalPages) || 0);
            state.totalCount = Math.max(0, Number(pagination.totalCount ?? data.count) || 0);
            state.hasNextPage = Boolean(pagination.hasNextPage);
            state.hasPrevPage = Boolean(pagination.hasPrevPage);

            renderBookingsTable({ bookings: data.bookings || [], formatDate, formatTime });
        } catch (error) {
            console.error('Load bookings error:', error);
            setBookingsError(error.message);
        }
    };

    const approveBooking = async (bookingId, deps) => {
        const {
            apiUrl,
            showConfirmationModal,
            showLoading,
            hideLoading,
            showAlert,
            refreshStats,
            refreshBookings
        } = deps;

        showConfirmationModal(
            'Approve Booking',
            'Are you sure you want to approve this booking? This will confirm the reservation and send a notification to the customer.',
            'Approve',
            async () => {
                try {
                    showLoading('Approving booking...');

                    const token = localStorage.getItem('token');
                    const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/approve`, {
                        method: 'PUT',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (!res.ok) {
                        throw new Error('Failed to approve booking');
                    }

                    showAlert('bookingAlert', 'Booking approved successfully!', 'success');
                    await refreshStats();
                    await refreshBookings();
                } catch (error) {
                    console.error('Approve booking error:', error);
                    const normalized = normalizeBookingActionError({ errorMessage: error.message, mode: 'approve' });
                    showAlert('bookingAlert', normalized, normalized === error.message ? 'error' : 'warning');
                } finally {
                    hideLoading();
                }
            }
        );
    };

    const openBookingPaymentDetails = (bookingId, event) => {
        if (event && typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }

        const booking = state.bookingsById.get(String(bookingId || ''));
        if (!booking) return;

        const totalAmount = Math.max(0, Number(booking?.price || 0));
        const normalizedPaymentStatus = ['PENDING', 'PARTIAL', 'PAID'].includes(String(booking?.paymentStatus || '').toUpperCase())
            ? String(booking.paymentStatus).toUpperCase()
            : 'PENDING';
        const amountPaidFromBooking = Number.isFinite(Number(booking?.amountPaid))
            ? Number(booking.amountPaid)
            : (normalizedPaymentStatus === 'PAID' ? totalAmount : 0);

        const bookingIdEl = document.getElementById('qpBookingId');
        const statusEl = document.getElementById('qpStatus');
        const amountEl = document.getElementById('qpAmountPaid');
        const refEl = document.getElementById('qpReference');
        const noteEl = document.getElementById('qpNote');
        const totalEl = document.getElementById('qpTotalAmount');
        const summaryEl = document.getElementById('qpSummary');
        const chipsEl = document.getElementById('qpPartialChips');

        if (bookingIdEl) bookingIdEl.value = bookingId;
        if (statusEl) statusEl.value = normalizedPaymentStatus;
        if (amountEl) amountEl.value = Math.max(0, amountPaidFromBooking).toFixed(2);
        if (refEl) refEl.value = booking.paymentReference || '';
        if (noteEl) noteEl.value = booking.paymentNote || '';
        if (totalEl) totalEl.value = totalAmount.toFixed(2);

        // Show/hide partial chips
        if (chipsEl) {
            chipsEl.classList.toggle('admin-hidden', normalizedPaymentStatus !== 'PARTIAL');
        }

        // Update fixed chip labels relative to total
        const chip500El = document.getElementById('qpChip500');
        const chip1000El = document.getElementById('qpChip1000');
        if (chip500El) chip500El.style.display = totalAmount > 500 ? '' : 'none';
        if (chip1000El) chip1000El.style.display = totalAmount > 1000 ? '' : 'none';

        // Set payment mode chip
        const existingMode = String(booking.paymentMode || '').toUpperCase();
        document.querySelectorAll('.qp-mode-chip').forEach((chip) => {
            const isActive = chip.dataset.mode === existingMode;
            chip.classList.toggle('active', isActive);
            const radio = chip.querySelector('input[type="radio"]');
            if (radio) radio.checked = isActive;
        });

        // Build summary card
        if (summaryEl) {
            const customerName = escapeHtml(booking.userId?.name || booking.userName || booking.customerName || 'Customer');
            const isPerday = booking.bookingMode === 'perday';
            const modeLabel = isPerday ? 'Per-day' : 'Hourly';
            const perDayDays = Math.max(1, Number(booking.perDayDays) || 1);
            const durationLabel = isPerday ? `${perDayDays} day(s)` : `${booking.duration || 0} hr(s)`;

            const formatDateFriendly = (rawDate) => {
                if (!rawDate) return '';
                try {
                    return new Date(rawDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                } catch { return String(rawDate); }
            };
            const formatTimeFriendly = (t) => {
                if (!t) return '';
                const [hStr, mStr] = String(t).split(':');
                const h = parseInt(hStr, 10);
                const m = String(mStr || '00').padStart(2, '0');
                const ampm = h >= 12 ? 'PM' : 'AM';
                const h12 = ((h % 12) || 12);
                return `${h12}:${m} ${ampm}`;
            };

            let dateTimeStr;
            if (isPerday && booking.perDayStartDate && booking.perDayEndDate) {
                dateTimeStr = `${formatDateFriendly(booking.perDayStartDate)} &ndash; ${formatDateFriendly(booking.perDayEndDate)}`;
            } else {
                const d = formatDateFriendly(booking.date);
                const t = (booking.startTime && booking.endTime)
                    ? `${formatTimeFriendly(booking.startTime)} &ndash; ${formatTimeFriendly(booking.endTime)}`
                    : '';
                dateTimeStr = [d, t].filter(Boolean).join(', ');
            }

            const outstanding = Math.max(0, totalAmount - amountPaidFromBooking);
            summaryEl.innerHTML = `
                <div style="display:flex; flex-wrap:wrap; gap:0.25rem 1.25rem;">
                    <span><strong>Customer:</strong> ${customerName}</span>
                    <span><strong>Type:</strong> ${modeLabel} &mdash; ${durationLabel}</span>
                    ${dateTimeStr ? `<span><strong>Date/Time:</strong> ${dateTimeStr}</span>` : ''}
                    <span><strong>Total:</strong> &#8377;${totalAmount.toFixed(2)}</span>
                    <span><strong>Received:</strong> &#8377;${amountPaidFromBooking.toFixed(2)}</span>
                    <span><strong>Outstanding:</strong> &#8377;${outstanding.toFixed(2)}</span>
                </div>
            `;
        }

        const modal = document.getElementById('quickPaymentModal');
        if (modal) modal.classList.add('show');

        setTimeout(() => {
            const statusInput = document.getElementById('qpStatus');
            if (statusInput) statusInput.focus();
        }, 0);
    };

    const rejectBooking = async (bookingId, deps) => {
        const {
            apiUrl,
            showConfirmationModal,
            showLoading,
            hideLoading,
            showAlert,
            refreshStats,
            refreshBookings
        } = deps;

        showConfirmationModal(
            'Reject Booking',
            'Are you sure you want to reject this booking? This will notify the customer that their booking has been declined.',
            'Reject',
            async () => {
                const reason = document.getElementById('rejectionReason')?.value.trim();

                try {
                    showLoading('Rejecting booking...');

                    const token = localStorage.getItem('token');
                    const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/reject`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ reason: reason || undefined })
                    });

                    if (!res.ok) {
                        throw new Error('Failed to reject booking');
                    }

                    showAlert('bookingAlert', 'Booking rejected', 'info');
                    await refreshStats();
                    await refreshBookings();
                } catch (error) {
                    console.error('Reject booking error:', error);
                    const normalized = normalizeBookingActionError({ errorMessage: error.message, mode: 'reject' });
                    showAlert('bookingAlert', normalized, normalized === error.message ? 'error' : 'warning');
                } finally {
                    hideLoading();
                }
            },
            true
        );
    };

    const markClassLessonCompleted = async (bookingId, lessonId) => {
        openClassLessonCompletionModal(bookingId, lessonId);
    };

    const cancelClassLesson = async (bookingId, lessonId) => {
        const deps = state.loadDeps;
        if (!deps?.apiUrl) {
            alert('Unable to cancel lesson right now. Please refresh and try again.');
            return;
        }

        if (!confirm('Cancel this lesson? This cannot be undone.')) return;

        try {
            showBookingLoading('Cancelling lesson...');
            const token = localStorage.getItem('token');
            const res = await fetch(`${deps.apiUrl}/api/admin/bookings/${bookingId}/class-lessons/${lessonId}/cancel`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || 'Unable to cancel lesson');

            notifyBookingAlert('Lesson cancelled.', 'success');
            await loadBookings({ page: state.currentPage || 1, showLoader: false });
            openBookingDetailsModal(bookingId);
        } catch (error) {
            notifyBookingAlert(error.message || 'Unable to cancel lesson', 'error');
        } finally {
            hideBookingLoading();
        }
    };

    const submitClassLessonCompletion = async () => {
        const deps = state.loadDeps;
        if (!deps || !deps.apiUrl) {
            alert('Unable to update class lesson right now. Please refresh and try again.');
            return;
        }

        const context = state.classLessonContext;
        if (!context?.bookingId || !context?.lessonId) {
            notifyBookingAlert('Class lesson context is missing. Please try again.', 'error');
            return;
        }

        const completedDateEl = document.getElementById('classCompletedDate');
        const completedStartEl = document.getElementById('classCompletedStartTime');
        const notesEl = document.getElementById('classCompletedNotes');
        const detailsEl = document.getElementById('classCompletedDetails');

        const completedDate = String(completedDateEl?.value || '').trim();
        const completedStartTime = normalizeTimeValue(completedStartEl?.value || '');
        const notes = String(notesEl?.value || '').trim();
        const details = String(detailsEl?.value || '').trim();

        if (!completedDate) {
            notifyBookingAlert('Please select a valid completion date.', 'error');
            completedDateEl?.focus();
            return;
        }

        if (!completedStartTime) {
            notifyBookingAlert('Please enter a valid start time (HH:mm).', 'error');
            completedStartEl?.focus();
            return;
        }

        try {
            showBookingLoading('Updating class lesson...');

            const token = localStorage.getItem('token');
            const res = await fetch(`${deps.apiUrl}/api/admin/bookings/${context.bookingId}/class-lessons/${context.lessonId}/complete`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    completedDate: String(completedDate || '').trim(),
                    completedStartTime: String(completedStartTime || '').trim(),
                    notes: String(notes || '').trim(),
                    details: String(details || '').trim()
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.message || 'Unable to update class lesson');
            }

            hideClassLessonCompletionModal();
            notifyBookingAlert('Class lesson marked completed.', 'success');
            await loadBookings({ page: state.currentPage || 1, showLoader: false });
            openBookingDetailsModal(context.bookingId);
        } catch (error) {
            notifyBookingAlert(error.message || 'Unable to mark class lesson completed', 'error');
        } finally {
            hideBookingLoading();
        }
    };

    const syncQuickPaymentForBookingModal = () => {
        const statusEl = document.getElementById('qpStatus');
        const amountEl = document.getElementById('qpAmountPaid');
        const totalEl = document.getElementById('qpTotalAmount');
        const chipsEl = document.getElementById('qpPartialChips');
        if (!statusEl || !amountEl) return;

        const status = String(statusEl.value || 'PENDING').toUpperCase();
        const total = Math.max(0, Number(totalEl?.value || 0));

        if (chipsEl) chipsEl.classList.toggle('admin-hidden', status !== 'PARTIAL');

        if (status === 'PAID') {
            amountEl.value = total.toFixed(2);
            return;
        }

        if (status === 'PENDING') {
            amountEl.value = '0.00';
        }
    };

    const quickUpdateBookingPayment = async (bookingId, deps) => {
        const {
            apiUrl,
            showLoading,
            hideLoading,
            showAlert,
            refreshStats,
            refreshBookings
        } = deps;

        const booking = state.bookingsById.get(String(bookingId || ''));
        if (!booking) {
            showAlert('bookingAlert', 'Booking not found. Please refresh and try again.', 'error');
            return;
        }

        const paymentStatusEl = document.getElementById('qpStatus');
        const amountPaidEl = document.getElementById('qpAmountPaid');
        const paymentReferenceEl = document.getElementById('qpReference');
        const paymentNoteEl = document.getElementById('qpNote');

        if (!paymentStatusEl || !amountPaidEl) {
            showAlert('bookingAlert', 'Payment controls are not available in this view.', 'error');
            return;
        }

        const paymentStatus = String(paymentStatusEl.value || 'PENDING').toUpperCase();
        const totalAmount = Math.max(0, Number(booking.price || 0));
        const requestedAmount = Number(amountPaidEl.value || 0);

        if (!['PENDING', 'PARTIAL', 'PAID'].includes(paymentStatus)) {
            showAlert('bookingAlert', 'Invalid payment status selected.', 'error');
            return;
        }

        if (!Number.isFinite(requestedAmount) || requestedAmount < 0) {
            showAlert('bookingAlert', 'Amount received must be a non-negative number.', 'error');
            return;
        }

        if (paymentStatus === 'PARTIAL' && !(requestedAmount > 0 && requestedAmount < totalAmount)) {
            showAlert('bookingAlert', 'For partial payment, amount received must be greater than 0 and less than total amount.', 'warning');
            return;
        }

        const normalizedAmount = paymentStatus === 'PAID'
            ? totalAmount
            : paymentStatus === 'PENDING'
                ? 0
                : requestedAmount;

        const activeMode = document.querySelector('.qp-mode-chip.active')?.dataset?.mode || '';

        const payload = {
            paymentStatus,
            amountPaid: normalizedAmount,
            paymentReference: String(paymentReferenceEl.value || '').trim(),
            paymentNote: String(paymentNoteEl.value || '').trim(),
            paymentMode: activeMode
        };

        try {
            showLoading('Updating payment details...');

            const token = localStorage.getItem('token');
            const res = await fetch(`${apiUrl}/api/admin/bookings/${bookingId}/edit`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const result = await res.json();
            if (!res.ok) {
                throw new Error(result.message || 'Failed to update payment details');
            }

            const updatedBooking = result?.booking
                ? result.booking
                : {
                    ...booking,
                    paymentStatus,
                    amountPaid: normalizedAmount,
                    paymentReference: payload.paymentReference,
                    paymentNote: payload.paymentNote
                };

            state.bookingsById.set(String(bookingId), updatedBooking);
            state.allBookings = (state.allBookings || []).map((item) => (
                String(item?._id) === String(bookingId) ? updatedBooking : item
            ));

            showAlert('bookingAlert', 'Payment details updated successfully!', 'success');
            await refreshStats();
            await refreshBookings();
            const qpModal = document.getElementById('quickPaymentModal');
            if (qpModal) qpModal.classList.remove('show');
        } catch (error) {
            showAlert('bookingAlert', error.message || 'Unable to update payment details', 'error');
        } finally {
            hideLoading();
        }
    };

    window.AdminBookings = window.AdminBookings || {};
        const approveSlotRequest = async (bookingId, lessonId) => {
            const deps = state.loadDeps;
            if (!deps?.apiUrl) { alert('Unable to approve slot. Please refresh.'); return; }
            try {
                showBookingLoading('Approving slot...');
                const token = localStorage.getItem('token');
                const res = await fetch(`${deps.apiUrl}/api/admin/bookings/${bookingId}/class-lessons/${lessonId}/approve-slot`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({})
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.message || 'Unable to approve slot');
                notifyBookingAlert('Slot request approved. Lesson updated.', 'success');
                await loadBookings({ page: state.currentPage || 1, showLoader: false });
                openBookingDetailsModal(bookingId);
            } catch (error) {
                notifyBookingAlert(error.message || 'Unable to approve slot', 'error');
            } finally {
                hideBookingLoading();
            }
        };

        const rejectSlotRequest = async (bookingId, lessonId) => {
            const deps = state.loadDeps;
            if (!deps?.apiUrl) { alert('Unable to reject slot. Please refresh.'); return; }
            const responseNote = prompt('Reason for rejection (optional):') ?? '';
            if (responseNote === null) return; // cancelled
            try {
                showBookingLoading('Rejecting slot...');
                const token = localStorage.getItem('token');
                const res = await fetch(`${deps.apiUrl}/api/admin/bookings/${bookingId}/class-lessons/${lessonId}/reject-slot`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ responseNote: String(responseNote || '').trim() })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.message || 'Unable to reject slot');
                notifyBookingAlert('Slot request rejected.', 'success');
                await loadBookings({ page: state.currentPage || 1, showLoader: false });
                openBookingDetailsModal(bookingId);
            } catch (error) {
                notifyBookingAlert(error.message || 'Unable to reject slot', 'error');
            } finally {
                hideBookingLoading();
            }
        };

        const adminBookSlot = async (bookingId, lessonId, triggerBtn) => {
            const deps = state.loadDeps;
            if (!deps?.apiUrl) { alert('Unable to book slot. Please refresh.'); return; }
            const container = triggerBtn?.closest('details');
            const dateInput = container?.querySelector('.admin-book-slot-date');
            const timeSelect = container?.querySelector('.admin-book-slot-time');
            const proposedDate = String(dateInput?.value || '').trim();
            const proposedStartTime = String(timeSelect?.value || '').trim();
            if (!proposedDate) { notifyBookingAlert('Please select a date.', 'error'); return; }
            if (!proposedStartTime) { notifyBookingAlert('Please select a start time.', 'error'); return; }
            try {
                showBookingLoading('Booking slot...');
                const token = localStorage.getItem('token');
                const res = await fetch(`${deps.apiUrl}/api/admin/bookings/${bookingId}/class-lessons/${lessonId}/book-slot`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ proposedDate, proposedStartTime })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.message || 'Unable to book slot');
                notifyBookingAlert('Slot booked successfully. Calendar invite sent to student.', 'success');
                await loadBookings({ page: state.currentPage || 1, showLoader: false });
                openBookingDetailsModal(bookingId);
            } catch (error) {
                notifyBookingAlert(error.message || 'Unable to book slot', 'error');
            } finally {
                hideBookingLoading();
            }
        };

        window.AdminBookings = window.AdminBookings || {};
    window.AdminBookings.loadBookings = loadBookings;
    window.AdminBookings.approveBooking = approveBooking;
    window.AdminBookings.rejectBooking = rejectBooking;
    window.AdminBookings.markClassLessonCompleted = markClassLessonCompleted;
    window.AdminBookings.cancelClassLesson = cancelClassLesson;
    window.AdminBookings.submitClassLessonCompletion = submitClassLessonCompletion;
    window.AdminBookings.approveSlotRequest = approveSlotRequest;
    window.AdminBookings.rejectSlotRequest = rejectSlotRequest;
    window.AdminBookings.adminBookSlot = adminBookSlot;
    window.AdminBookings.hideClassLessonCompletionModal = hideClassLessonCompletionModal;
    window.AdminBookings.quickUpdateBookingPayment = quickUpdateBookingPayment;
    window.AdminBookings.openBookingDetailsModal = openBookingDetailsModal;
    window.AdminBookings.openBookingPaymentDetails = openBookingPaymentDetails;
    window.syncQuickPaymentForBookingModal = syncQuickPaymentForBookingModal;
    window.openBookingPaymentDetails = openBookingPaymentDetails;
    window.openBookingDetailsModal = openBookingDetailsModal;
    window.markClassLessonCompleted = markClassLessonCompleted;
    window.cancelClassLesson = cancelClassLesson;
    window.submitClassLessonCompletion = submitClassLessonCompletion;
    window.approveSlotRequest = approveSlotRequest;
    window.rejectSlotRequest = rejectSlotRequest;
    window.adminBookSlot = adminBookSlot;
    window.hideClassLessonCompletionModal = hideClassLessonCompletionModal;
})();
