/**
 * Admin booking edit module.
 * Handles edit modal loading, rental selection rendering, total recalculation, and submit flow.
 */

(() => {
    const state = {
        currentEditingBookingId: null,
        currentEditingBookingData: null
    };

    const getEditRentalInputId = (rentalId, deps) => `edit_${deps.getRentalInputId(rentalId)}`;

    const getRentalMatchKey = (name, rentalType = 'inhouse') => {
        return `${String(name || '').trim().toLowerCase()}::${String(rentalType || 'inhouse').trim().toLowerCase()}`;
    };

    const buildExistingRentalMap = (booking) => {
        const existingMap = new Map();
        const existingRentals = Array.isArray(booking?.rentals) ? booking.rentals : [];

        existingRentals.forEach((rental) => {
            const key = getRentalMatchKey(rental?.name, rental?.rentalType || 'inhouse');
            if (!existingMap.has(key)) {
                existingMap.set(key, rental);
            }
        });

        return existingMap;
    };

    const renderEditBookingRentals = (rentalTypes, booking, deps) => {
        const container = document.getElementById('editBookingRentals');
        const existingMap = buildExistingRentalMap(booking);
        const usedExistingKeys = new Set();

        if (!container) return;

        if (!Array.isArray(rentalTypes) || rentalTypes.length === 0) {
            container.innerHTML = '<div class="loading-inline-muted">No rental options configured</div>';
            return;
        }

        let html = '';

        rentalTypes.forEach((type) => {
            html += `<div class="admin-rental-category">${deps.escapeHtml(type.name)}</div>`;

            if (type.name === 'JamRoom' && type.basePrice && type.basePrice > 0) {
                const baseId = `${type.name}_base`;
                const qtyInputId = getEditRentalInputId(baseId, deps);
                const isJamRoomBase = type.name === 'JamRoom';
                const baseKey = getRentalMatchKey(`${type.name} (Base)`, 'inhouse');
                const matchedBase = existingMap.get(baseKey);

                if (matchedBase) {
                    usedExistingKeys.add(baseKey);
                }

                const basePrice = matchedBase ? Number(matchedBase.price || type.basePrice) : type.basePrice;
                const baseQuantity = Math.max(parseInt(matchedBase?.quantity, 10) || 1, 1);

                const encodedBaseData = encodeURIComponent(JSON.stringify({
                    id: baseId,
                    name: `${type.name} (Base)`,
                    category: type.name,
                    price: basePrice,
                    perdayPrice: 0,
                    rentalType: 'inhouse',
                    description: matchedBase?.description || type.description || '',
                    isRequired: false,
                    isBase: true
                }));

                const shouldCheckBase = !!matchedBase;

                html += `
                    <div class="admin-rental-row base">
                        <input type="checkbox" id="edit_rental_${qtyInputId}" name="editRental" data-rental="${encodedBaseData}" ${shouldCheckBase ? 'checked' : ''}>
                        <label for="edit_rental_${qtyInputId}" class="admin-rental-meta">
                            🏠 ${deps.escapeHtml(type.name)} (Base) - ₹${basePrice}/hr
                            <span class="admin-rental-subtext">Base item</span>
                        </label>
                        <div class="admin-rental-qty">
                            <label for="${qtyInputId}">Qty</label>
                            <input type="number" id="${qtyInputId}" min="1" max="10" value="${baseQuantity}" ${isJamRoomBase ? 'disabled' : ''}>
                        </div>
                    </div>
                `;
            }

            if (type.subItems && type.subItems.length > 0) {
                type.subItems.forEach((subItem) => {
                    const itemId = `${type.name}__${subItem.name}`;
                    const qtyInputId = getEditRentalInputId(itemId, deps);
                    const configuredRentalType = type.rentalType || subItem.rentalType || 'inhouse';
                    const matchKey = getRentalMatchKey(subItem.name, configuredRentalType);
                    const matchedRental = existingMap.get(matchKey);

                    if (matchedRental) {
                        usedExistingKeys.add(matchKey);
                    }

                    const effectiveRentalType = matchedRental?.rentalType || configuredRentalType;
                    const isPerday = effectiveRentalType === 'perday';
                    const isPerSession = effectiveRentalType === 'persession';
                    const defaultPrice = isPerday ? (subItem.perdayPrice || 0) : (subItem.price || 0);
                    const effectivePrice = matchedRental ? Number(matchedRental.price || defaultPrice) : defaultPrice;
                    const priceUnit = isPerday ? '/day' : isPerSession ? '/session' : '/hr';
                    const isFree = effectivePrice === 0;
                    const showQuantityControls = isPerday || isPerSession || isFree || (subItem.name || '').includes('IEM');
                    const quantityValue = Math.max(parseInt(matchedRental?.quantity, 10) || 1, 1);

                    const encodedRentalData = encodeURIComponent(JSON.stringify({
                        id: itemId,
                        name: subItem.name,
                        category: type.name,
                        price: effectivePrice,
                        perdayPrice: isPerday ? effectivePrice : (subItem.perdayPrice || 0),
                        rentalType: effectiveRentalType,
                        description: matchedRental?.description || subItem.description || '',
                        isRequired: false,
                        isBase: false,
                        allowCustomQuantity: isPerday || isFree || (subItem.name || '').includes('IEM')
                    }));

                    const icon = isFree ? '🆓' : (isPerday ? '📅' : isPerSession ? '🎯' : '🔗');
                    const typeLabel = isFree ? '' : (isPerday ? ' (Per-day)' : isPerSession ? ' (Per-session)' : ' (In-house)');
                    const priceDisplay = isFree ? 'FREE' : `₹${effectivePrice}${priceUnit}`;
                    const details = [
                        isPerday ? 'Flat per-day pricing' : '',
                        (isPerSession && !isFree) ? 'Flat per-session pricing' : '',
                        (!isPerday && !isPerSession && !isFree) ? 'Tied to session duration' : '',
                        isFree ? 'Free add-on' : ''
                    ].filter(Boolean).join(' | ');

                    html += `
                        <div class="admin-rental-row child">
                            <input type="checkbox" id="edit_rental_${qtyInputId}" name="editRental" data-rental="${encodedRentalData}" ${matchedRental ? 'checked' : ''}>
                            <label for="edit_rental_${qtyInputId}" class="admin-rental-meta">
                                ${icon} ${deps.escapeHtml(subItem.name)}${typeLabel} - ${priceDisplay}
                                <span class="admin-rental-subtext">${details}</span>
                            </label>
                            <div class="admin-rental-qty">
                                ${showQuantityControls
                                    ? `<label for="${qtyInputId}">Qty</label><input type="number" id="${qtyInputId}" min="1" max="10" value="${quantityValue}">`
                                    : `<span class="admin-rental-subtext admin-rental-subtext-tight">Qty fixed: 1</span><input type="hidden" id="${qtyInputId}" value="1">`
                                }
                            </div>
                        </div>
                    `;
                });
            } else if (type.name !== 'JamRoom' && type.basePrice && type.basePrice > 0) {
                const itemId = `${type.name}__${type.name}`;
                const qtyInputId = getEditRentalInputId(itemId, deps);
                const matchKey = getRentalMatchKey(type.name, 'inhouse');
                const matchedRental = existingMap.get(matchKey);

                if (matchedRental) {
                    usedExistingKeys.add(matchKey);
                }

                const effectivePrice = matchedRental ? Number(matchedRental.price || type.basePrice) : type.basePrice;
                const encodedRentalData = encodeURIComponent(JSON.stringify({
                    id: itemId,
                    name: type.name,
                    category: type.name,
                    price: effectivePrice,
                    perdayPrice: 0,
                    rentalType: 'inhouse',
                    description: matchedRental?.description || type.description || '',
                    isRequired: false,
                    isBase: false,
                    allowCustomQuantity: false
                }));

                html += `
                    <div class="admin-rental-row child">
                        <input type="checkbox" id="edit_rental_${qtyInputId}" name="editRental" data-rental="${encodedRentalData}" ${matchedRental ? 'checked' : ''}>
                        <label for="edit_rental_${qtyInputId}" class="admin-rental-meta">
                            🔗 ${deps.escapeHtml(type.name)} - ₹${effectivePrice}/hr
                            <span class="admin-rental-subtext">Category base price item</span>
                        </label>
                        <div class="admin-rental-qty">
                            <span class="admin-rental-subtext admin-rental-subtext-tight">Qty fixed: 1</span>
                            <input type="hidden" id="${qtyInputId}" value="1">
                        </div>
                    </div>
                `;
            }
        });

        const existingRentals = Array.isArray(booking?.rentals) ? booking.rentals : [];
        const unmatchedRentals = existingRentals.filter((rental) => {
            const key = getRentalMatchKey(rental?.name, rental?.rentalType || 'inhouse');
            return !usedExistingKeys.has(key);
        });

        if (unmatchedRentals.length > 0) {
            html += '<div class="admin-rental-category">Existing Custom Items</div>';

            unmatchedRentals.forEach((rental, index) => {
                const itemId = `custom_existing_${index}`;
                const qtyInputId = getEditRentalInputId(itemId, deps);
                const isPerday = String(rental?.rentalType || '').toLowerCase() === 'perday';
                const effectivePrice = Number(rental?.price || 0);
                const priceUnit = isPerday ? '/day' : '/hr';
                const quantityValue = Math.max(parseInt(rental?.quantity, 10) || 1, 1);

                const encodedRentalData = encodeURIComponent(JSON.stringify({
                    id: itemId,
                    name: rental?.name || 'Custom Item',
                    category: rental?.category || '',
                    price: effectivePrice,
                    perdayPrice: isPerday ? effectivePrice : (Number(rental?.perdayPrice) || 0),
                    rentalType: isPerday ? 'perday' : 'inhouse',
                    description: rental?.description || '',
                    isRequired: false,
                    isBase: false,
                    allowCustomQuantity: true
                }));

                html += `
                    <div class="admin-rental-row child">
                        <input type="checkbox" id="edit_rental_${qtyInputId}" name="editRental" data-rental="${encodedRentalData}" checked>
                        <label for="edit_rental_${qtyInputId}" class="admin-rental-meta">
                            🧩 ${deps.escapeHtml(rental?.name || 'Custom Item')} - ₹${effectivePrice}${priceUnit}
                            <span class="admin-rental-subtext">Previously saved item (not in current settings)</span>
                        </label>
                        <div class="admin-rental-qty">
                            <label for="${qtyInputId}">Qty</label>
                            <input type="number" id="${qtyInputId}" min="1" max="10" value="${quantityValue}">
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;
    };

    const collectSelectedEditRentals = (deps, { strict = false } = {}) => {
        const selectedRentals = [];
        const rentalInputs = document.querySelectorAll('#editBookingRentals input[name="editRental"]:checked');

        if (strict && rentalInputs.length === 0) {
            throw new Error('Please select at least one rental item.');
        }

        rentalInputs.forEach((input) => {
            const rentalData = JSON.parse(decodeURIComponent(input.dataset.rental));
            const quantityElement = document.getElementById(getEditRentalInputId(rentalData.id, deps));
            const rawQuantity = parseInt(quantityElement?.value, 10) || 1;
            const isPerday = rentalData.rentalType === 'perday';
            const isPerSession = rentalData.rentalType === 'persession';
            const isFree = (isPerday ? (rentalData.perdayPrice || 0) : (rentalData.price || 0)) === 0;
            const isIem = (rentalData.name || '').includes('IEM');
            const isBase = rentalData.isRequired || String(rentalData.id).includes('_base');

            let effectiveQuantity = rawQuantity;
            if (!isPerday && !isPerSession && !isFree && !isIem && !isBase && !rentalData.allowCustomQuantity) {
                effectiveQuantity = 1;
            }

            const unitPrice = isPerday ? (rentalData.perdayPrice || 0) : (rentalData.price || 0);

            selectedRentals.push({
                name: rentalData.name,
                category: rentalData.category || '',
                price: unitPrice,
                perdayPrice: rentalData.perdayPrice || 0,
                quantity: effectiveQuantity,
                rentalType: rentalData.rentalType || 'inhouse',
                description: rentalData.description || '',
                isRequired: !!rentalData.isRequired,
                fullId: rentalData.id
            });
        });

        if (strict && selectedRentals.length === 0) {
            throw new Error('Please select at least one rental item.');
        }

        return selectedRentals;
    };

    const getCurrentGstConfig = (deps) => {
        const source = deps.getCreateBookingSettings() || deps.getAdminSettingsData() || {};
        const enabled = source?.gstConfig?.enabled === true;
        const rate = enabled ? (source?.gstConfig?.rate || 0.18) : 0;

        return { enabled, rate };
    };

    const getNormalizedPriceAdjustment = () => {
        const rawType = document.getElementById('editPriceAdjustmentType')?.value;
        const normalizedType = ['discount', 'surcharge'].includes(String(rawType || '').trim().toLowerCase())
            ? String(rawType).trim().toLowerCase()
            : 'none';

        const parsedAmount = Number(document.getElementById('editPriceAdjustmentAmount')?.value || 0);
        const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount > 0
            ? parsedAmount
            : 0;

        if (normalizedType === 'discount') {
            return {
                type: 'discount',
                amount: normalizedAmount,
                signedValue: -normalizedAmount
            };
        }

        if (normalizedType === 'surcharge') {
            return {
                type: 'surcharge',
                amount: normalizedAmount,
                signedValue: normalizedAmount
            };
        }

        return {
            type: 'none',
            amount: 0,
            signedValue: 0
        };
    };

    const recalculateEditBookingTotals = (deps) => {
        const duration = parseFloat(document.getElementById('editDuration')?.value) || 0;
        const items = collectSelectedEditRentals(deps, { strict: false });
        const editRentalTypeEl = document.getElementById('editRentalType');

        let subtotal = 0;
        items.forEach((item) => {
            let itemTotal;

            if (item.rentalType === 'perday') {
                itemTotal = item.price * item.quantity;
            } else if (item.rentalType === 'persession') {
                itemTotal = item.price * item.quantity;
            } else if (item.isRequired || String(item.fullId).includes('_base')) {
                itemTotal = item.price * item.quantity * duration;
            } else if (item.price === 0) {
                itemTotal = 0;
            } else if ((item.name || '').includes('IEM')) {
                itemTotal = item.price * item.quantity * duration;
            } else {
                itemTotal = item.price * 1 * duration;
            }

            subtotal += itemTotal;
        });

        const gstConfig = getCurrentGstConfig(deps);
        const taxAmount = gstConfig.enabled ? Math.round(subtotal * gstConfig.rate) : 0;
        const adjustment = getNormalizedPriceAdjustment();
        const totalAmount = subtotal + taxAmount + adjustment.signedValue;

        const subtotalEl = document.getElementById('editSubtotal');
        const taxEl = document.getElementById('editTaxAmount');
        const totalEl = document.getElementById('editPrice');
        if (subtotalEl) subtotalEl.value = subtotal.toFixed(2);
        if (taxEl) taxEl.value = taxAmount.toFixed(2);
        if (totalEl) totalEl.value = Math.max(0, totalAmount).toFixed(2);

        if (editRentalTypeEl && typeof window.populateAdminBookingTypeSelect === 'function') {
            const settingsSource = deps.getCreateBookingSettings() || deps.getAdminSettingsData() || {};
            const rentalTypes = Array.isArray(settingsSource?.rentalTypes) ? settingsSource.rentalTypes : [];
            const currentValue = String(editRentalTypeEl.value || '').trim();
            const options = window.populateAdminBookingTypeSelect('editRentalType', rentalTypes, {
                selectedValue: currentValue
            });
            const derivedValue = typeof window.deriveAdminBookingTypeLabel === 'function'
                ? window.deriveAdminBookingTypeLabel(items, rentalTypes)
                : '';

            if ((!currentValue || !options.some((option) => option.value === currentValue)) && derivedValue) {
                editRentalTypeEl.value = derivedValue;
            }
        }

        return { items, subtotal, taxAmount, totalAmount, adjustment };
    };

    const loadEditBookingRentals = async (booking, deps) => {
        let settingsToUse = deps.getCreateBookingSettings();

        if (!settingsToUse || !Array.isArray(settingsToUse.rentalTypes)) {
            const response = await fetch(`${deps.apiUrl}/api/admin/settings`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to load rental options for editing');
            }

            const result = await response.json();
            if (!result.success || !result.settings) {
                throw new Error('Rental settings are unavailable');
            }

            settingsToUse = result.settings;
            deps.setCreateBookingSettings(result.settings);
            deps.setAdminSettingsData(result.settings);
        }

        renderEditBookingRentals(settingsToUse.rentalTypes || [], booking, deps);

        if (typeof window.populateAdminBookingTypeSelect === 'function') {
            window.populateAdminBookingTypeSelect('editRentalType', settingsToUse.rentalTypes || [], {
                selectedValue: booking?.rentalType || ''
            });
        }
    };

    const openEditBooking = async (bookingId, bookingData, deps) => {
        try {
            state.currentEditingBookingId = bookingId;

            const booking = typeof bookingData === 'string' ? JSON.parse(bookingData.replace(/&quot;/g, '"')) : bookingData;
            state.currentEditingBookingData = booking;

            const bookingDate = new Date(booking.date);
            const formattedDate = bookingDate.toISOString().split('T')[0];

            const editDate = document.getElementById('editDate');
            const editStartTime = document.getElementById('editStartTime');
            const editDuration = document.getElementById('editDuration');
            const editRentalType = document.getElementById('editRentalType');
            const editNotes = document.getElementById('editNotes');
            const editRentals = document.getElementById('editBookingRentals');

            if (editDate) editDate.value = formattedDate;
            if (editStartTime) editStartTime.value = booking.startTime;
            if (editDuration) editDuration.value = booking.duration;
            if (editRentalType) editRentalType.value = booking.rentalType || '';
            if (editNotes) editNotes.value = booking.notes || '';

            const editAdjustmentType = document.getElementById('editPriceAdjustmentType');
            const editAdjustmentAmount = document.getElementById('editPriceAdjustmentAmount');
            const editAdjustmentNote = document.getElementById('editPriceAdjustmentNote');

            const fallbackAdjustmentType = Number(booking?.priceAdjustmentValue || 0) < 0
                ? 'discount'
                : Number(booking?.priceAdjustmentValue || 0) > 0
                    ? 'surcharge'
                    : 'none';
            const resolvedAdjustmentType = ['none', 'discount', 'surcharge'].includes(String(booking?.priceAdjustmentType || '').toLowerCase())
                ? String(booking.priceAdjustmentType).toLowerCase()
                : fallbackAdjustmentType;
            const resolvedAdjustmentAmount = Number.isFinite(Number(booking?.priceAdjustmentAmount))
                ? Number(booking.priceAdjustmentAmount)
                : Math.abs(Number(booking?.priceAdjustmentValue || 0));

            if (editAdjustmentType) editAdjustmentType.value = resolvedAdjustmentType;
            if (editAdjustmentAmount) editAdjustmentAmount.value = Math.max(0, resolvedAdjustmentAmount).toFixed(2);
            if (editAdjustmentNote) editAdjustmentNote.value = booking?.priceAdjustmentNote || '';

            if (editRentals) {
                editRentals.innerHTML = '<div class="loading-inline-muted">Loading rental options...</div>';
            }

            await loadEditBookingRentals(booking, deps);
            recalculateEditBookingTotals(deps);

            const modal = document.getElementById('editBookingModal');
            if (modal) {
                modal.classList.add('show');
            }
        } catch (error) {
            console.error('Error opening edit modal:', error);
            deps.showAlert('bookingAlert', 'Error opening edit form', 'error');
        }
    };

    const submitEditBookingForm = async (deps) => {
        if (!state.currentEditingBookingId) {
            deps.showAlert('bookingAlert', 'No booking selected for editing', 'error');
            return;
        }

        try {
            deps.showLoading('Updating booking...');

            const duration = parseFloat(document.getElementById('editDuration')?.value);
            if (!Number.isFinite(duration) || duration <= 0) {
                throw new Error('Please provide a valid duration.');
            }

            const bookingTypeLabel = document.getElementById('editRentalType')?.value.trim();
            if (!bookingTypeLabel) {
                throw new Error('Please provide booking type/label.');
            }

            const rentals = collectSelectedEditRentals(deps, { strict: true });
            const pricing = recalculateEditBookingTotals(deps);

            if (pricing.totalAmount < 0) {
                throw new Error('Discount cannot be greater than subtotal plus tax.');
            }

            const adjustment = getNormalizedPriceAdjustment();

            const formData = {
                date: document.getElementById('editDate')?.value,
                startTime: document.getElementById('editStartTime')?.value,
                duration,
                rentalType: bookingTypeLabel,
                rentals: rentals.map((rental) => ({
                    name: rental.name,
                    category: rental.category,
                    price: rental.price,
                    perdayPrice: rental.perdayPrice,
                    quantity: rental.quantity,
                    rentalType: rental.rentalType,
                    description: rental.description
                })),
                subtotal: pricing.subtotal,
                taxAmount: pricing.taxAmount,
                totalAmount: pricing.totalAmount,
                priceAdjustmentType: adjustment.type,
                priceAdjustmentAmount: adjustment.amount,
                priceAdjustmentNote: document.getElementById('editPriceAdjustmentNote')?.value || '',
                notes: document.getElementById('editNotes')?.value
            };

            const [hours, minutes] = String(formData.startTime || '00:00').split(':').map(Number);
            const totalMinutes = hours * 60 + minutes + Math.round(formData.duration * 60);
            const endHours = Math.floor(totalMinutes / 60) % 24;
            const endMins = totalMinutes % 60;
            formData.endTime = `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;

            const token = localStorage.getItem('token');
            const res = await fetch(`${deps.apiUrl}/api/admin/bookings/${state.currentEditingBookingId}/edit`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || 'Failed to update booking');
            }

            deps.closeModal('editBookingModal');
            deps.showAlert('bookingAlert', 'Booking updated successfully!', 'success');
            await deps.refreshStats();
            await deps.refreshBookings();
            state.currentEditingBookingId = null;
        } catch (error) {
            deps.showAlert('bookingAlert', error.message, 'error');
        } finally {
            deps.hideLoading();
        }
    };

    window.AdminBookingsEdit = window.AdminBookingsEdit || {};
    window.AdminBookingsEdit.openEditBooking = openEditBooking;
    window.AdminBookingsEdit.recalculateEditBookingTotals = recalculateEditBookingTotals;
    window.AdminBookingsEdit.submitEditBookingForm = submitEditBookingForm;
})();
