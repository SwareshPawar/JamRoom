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

    // Get duration
    const startTime = document.getElementById('startTime')?.value;
    const endTime = document.getElementById('endTime')?.value;
    const duration = startTime && endTime ? calculateDuration(startTime, endTime) : 1;

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

        if (bookingMode === 'perday' || rental.rentalType === 'perday') {
            // Per-day rentals: charged by selected day range.
            itemTotal = rental.price * rental.quantity * perDayDays;
            displayQuantity = rental.quantity;
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

        selectedRentalsHTML += `
            <div class="rental-item">
                <span>${rental.name}${quantityText}${hourText}</span>
                <span>₹${itemTotal}</span>
            </div>
        `;
    });

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

// Calculate duration between start and end time
const calculateDuration = (startTime, endTime) => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    let [endHour, endMin] = endTime.split(':').map(Number);

    // Handle midnight (00:00) as 24:00
    if (endHour === 0) endHour = 24;

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return Math.max(1, Math.ceil((endMinutes - startMinutes) / 60));
};

// Expose for cross-file usage and compatibility.
window.updatePriceDisplay = updatePriceDisplay;
window.calculateDuration = calculateDuration;
