/**
 * Booking pricing calculation module.
 */

// Update price display
const updatePriceDisplay = () => {
    const priceDisplay = document.getElementById('priceDisplay');
    const selectedRentalsDiv = document.getElementById('selectedRentals');
    const subtotalElement = document.getElementById('subtotalAmount');
    const taxElement = document.getElementById('taxAmount');
    const totalElement = document.getElementById('totalPrice');
    const taxSection = document.getElementById('taxSection');
    const taxLabel = document.getElementById('taxLabel');

    if (selectedRentals.size === 0) {
        priceDisplay.style.display = 'none';
        return;
    }

    const bookingMode = window.getBookingMode ? window.getBookingMode() : 'hourly';
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';

    const duration = bookingMode === 'hourly'
        ? calculateDuration()
        : 1;

    const perDayInfo = window.getPerDayBookingInfo
        ? window.getPerDayBookingInfo()
        : { days: 0, isValid: false };
    const perDayDays = bookingMode === 'perday'
        ? (perDayInfo.isValid ? Math.max(1, Number(perDayInfo.days) || 0) : 0)
        : Math.max(1, Number(perDayInfo.days) || 1);

    let subtotal = 0;
    let selectedRentalsHTML = '';

    selectedRentals.forEach((rental) => {
        // Calculate item total based on rental type
        let itemTotal;
        let displayQuantity;
        let showHourMultiplier = false;
        let showDayMultiplier = false;

        if (bookingMode === 'perday' || rental.rentalType === 'perday') {
            // Per-day rentals: charged by selected day range.
            itemTotal = rental.price * rental.quantity * perDayDays;
            displayQuantity = rental.quantity;
            showDayMultiplier = true;
        } else if (rental.rentalType === 'persession' || rental.rentalType === 'pertrack') {
            // Per-session rentals: charged once per booking session.
            itemTotal = rental.price * rental.quantity;
            displayQuantity = rental.quantity;
        } else if (rental.isRequired || rental.fullId.includes('_base')) {
            // JamRoom base rentals
            itemTotal = (rental.price || rental.basePrice) * rental.quantity * duration;
            displayQuantity = rental.quantity;
            showHourMultiplier = true;
        } else if (rental.price === 0) {
            // Free add-ons (mics, jacks): allow quantities, no cost
            itemTotal = 0;
            displayQuantity = rental.quantity;
        } else if (rental.name.includes('IEM')) {
            // IEM: special case - allow quantities but duration-based pricing
            itemTotal = (rental.price || rental.basePrice) * rental.quantity * duration;
            displayQuantity = rental.quantity;
            showHourMultiplier = true;
        } else {
            // Paid in-house rentals: tied to jamroom duration (quantity 1, but duration varies)
            itemTotal = (rental.price || rental.basePrice) * 1 * duration;
            displayQuantity = 1;
            showHourMultiplier = true;
        }
        subtotal += itemTotal;

        const quantityText = displayQuantity > 1 ? ` x${displayQuantity}` : '';
        const hourText = showHourMultiplier && duration > 1 ? ` x${duration}h` : '';
    const dayText = showDayMultiplier && perDayDays > 0 ? ` x${perDayDays}d` : '';
    const metaText = `${quantityText}${hourText}${dayText}`;

        selectedRentalsHTML += `
            <div class="rental-item">
                <span class="rental-item-main">
                    <span class="rental-item-name">${rental.name}</span>
                    ${metaText ? `<span class="rental-item-meta">${metaText.trim()}</span>` : ''}
                </span>
                <span class="rental-item-total">₹${itemTotal}</span>
            </div>
        `;
    });

    // For class bookings, override pricing with monthly fee from config
    const isClassBooking = typeof window.isClassBookingCategory === 'function' && window.isClassBookingCategory(bookingType);
    if (isClassBooking) {
        const classConfig = typeof window.getClassConfig === 'function'
            ? window.getClassConfig()
            : { monthlyFee: Number(window.adminSettings?.classConfig?.monthlyFee || 0), classesPerMonth: 4, multiMonthDiscounts: [] };
        const planMonths = Math.max(1, Number(document.getElementById('classPlanMonths')?.value || 1));
        const classesPerMonth = Math.max(1, Number(classConfig.classesPerMonth || 4));
        const totalClasses = classesPerMonth * planMonths;
        const monthlyFee = Math.max(0, Number(classConfig.monthlyFee || 0));
        const totalBeforeDiscount = monthlyFee * planMonths;

        const discountAmount = typeof window.getClassDiscountForMonths === 'function'
            ? window.getClassDiscountForMonths(planMonths, classConfig, totalBeforeDiscount)
            : 0;

        const discountEntry = (Array.isArray(classConfig.multiMonthDiscounts) ? classConfig.multiMonthDiscounts : [])
            .find((entry) => Number(entry?.months) === planMonths);
        const discountPercent = discountEntry
            ? Math.max(0, Number(discountEntry.discountPercent || 0))
            : 0;
        const totalAfterDiscount = Math.max(0, totalBeforeDiscount - discountAmount);

        subtotal = totalAfterDiscount;
        selectedRentalsHTML = `
            <div class="rental-item">
                <span>${bookingType} — ${planMonths} month(s)</span>
                <span>₹${totalBeforeDiscount}</span>
            </div>
            <div class="rental-item">
                <span>Discount (${discountPercent}%)</span>
                <span>-₹${discountAmount}</span>
            </div>
            <div class="rental-item">
                <span>Classes Included</span>
                <span>${classesPerMonth}/month (${totalClasses} total)</span>
            </div>
            <div class="rental-item" style="font-size:0.82em;opacity:0.75;">
                <span>1 item only, class completion tracked weekly</span>
                <span>Plan Active</span>
            </div>
        `;
    }

    // Use admin settings for GST calculation
    const gstEnabled = window.adminSettings?.gstConfig?.enabled || false;
    const gstRate = window.adminSettings?.gstConfig?.rate || 0.18;
    const gstDisplayName = window.adminSettings?.gstConfig?.displayName || 'GST';

    // Show/hide tax section based on GST configuration
    if (gstEnabled && subtotal > 0) {
        taxSection.style.display = 'flex';
        const taxAmount = Math.round(subtotal * gstRate);
        const totalAmount = subtotal + taxAmount;

        taxLabel.textContent = `${gstDisplayName} (${Math.round(gstRate * 100)}%):`;
        taxElement.textContent = `₹${taxAmount}`;
        totalElement.innerHTML = `<strong>₹${totalAmount}</strong>`;
    } else {
        taxSection.style.display = 'none';
        totalElement.innerHTML = `<strong>₹${subtotal}</strong>`;
    }

    selectedRentalsDiv.innerHTML = selectedRentalsHTML;
    subtotalElement.textContent = `₹${subtotal}`;

    priceDisplay.style.display = 'block';
};

const calculateDuration = (startTimeOverride, endTimeOverride) => {
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    const isFlatRateBooking = typeof window.isFlatRateSessionBookingCategory === 'function'
        ? window.isFlatRateSessionBookingCategory(bookingType)
        : false;
    const isClassBooking = typeof window.isClassBookingCategory === 'function'
        ? window.isClassBookingCategory(bookingType)
        : false;

    if (isFlatRateBooking || isClassBooking) {
        return 1;
    }

    const startTime = String(startTimeOverride || document.getElementById('startTime')?.value || '').trim();
    const endTime = String(endTimeOverride || document.getElementById('endTime')?.value || '').trim();

    if (!startTime || !endTime) {
        return 1;
    }

    const toMinutes = (timeValue) => {
        const [hourPart, minutePart] = String(timeValue || '').split(':');
        const hours = Number(hourPart);
        const minutes = Number(minutePart);
        if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
            return NaN;
        }
        return (hours * 60) + minutes;
    };

    const startMinutes = toMinutes(startTime);
    const endMinutes = toMinutes(endTime);
    if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
        return 1;
    }

    return Math.max(1, Math.ceil((endMinutes - startMinutes) / 60));
};

// Expose for cross-file usage and compatibility.
window.updatePriceDisplay = updatePriceDisplay;
window.calculateDuration = calculateDuration;
