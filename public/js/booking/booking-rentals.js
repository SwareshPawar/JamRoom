/**
 * Booking rental selection module.
 * Supports separate booking flows for hourly (JamRoom + InHouse) and per-day rentals.
 */

let currentBookingMode = 'hourly';
let hourlySelectedRentals = new Map();
let perdaySelectedRentals = new Map();
let perdayUnavailableItems = new Set();
let perdayBookedItemQuantities = new Map();
let perdaySelectedRange = null;
let perdayAvailabilityRequestSeq = 0;
let availableBookingModes = ['hourly', 'perday'];
let activeBookingCategory = '';

const bookingCategoryModeMap = new Map();

const rentalCatalog = {
    hourly: new Map(),
    perday: new Map()
};

const normalizeRentalType = (value) => {
    const normalized = String(value || 'inhouse').toLowerCase();
    if (normalized === 'perday') return 'perday';
    if (normalized === 'persession') return 'persession';
    return 'inhouse';
};
const normalizeRentalNameKey = (name) => String(name || '').trim().toLowerCase();

const inferAvailableBookingModesFromSettings = () => {
    const configuredModes = Array.isArray(settings?.bookingModes)
        ? settings.bookingModes
            .map((mode) => String(mode || '').toLowerCase().trim())
            .filter((mode) => mode === 'hourly' || mode === 'perday')
        : [];

    if (configuredModes.length > 0) {
        return [...new Set(configuredModes)];
    }

    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];
    let hasHourly = false;
    let hasPerday = false;

    rentalTypes.forEach((type) => {
        const typeName = String(type?.name || '').trim();
        const categoryRentalType = normalizeRentalType(type?.rentalType || '');
        const subItems = Array.isArray(type?.subItems) ? type.subItems : [];

        if (categoryRentalType === 'perday') {
            hasPerday = true;
        } else if (categoryRentalType === 'inhouse' || categoryRentalType === 'persession') {
            hasHourly = true;
        }

        if ((typeName === 'JamRoom' || !subItems.length) && Number(type?.basePrice || 0) > 0) {
            hasHourly = true;
        }

        subItems.forEach((subItem) => {
            if (normalizeRentalType(subItem?.rentalType) === 'perday') {
                hasPerday = true;
            } else {
                hasHourly = true;
            }
        });
    });

    const modes = [];
    if (hasHourly) modes.push('hourly');
    if (hasPerday) modes.push('perday');

    return modes;
};

const getDefaultBookingMode = () => {
    if (availableBookingModes.includes('hourly')) {
        return 'hourly';
    }

    if (availableBookingModes.includes('perday')) {
        return 'perday';
    }

    return 'hourly';
};

const renderBookingModeOptions = () => {
    const modeSwitch = document.getElementById('bookingModeSwitch');
    if (!modeSwitch) return;

    availableBookingModes = inferAvailableBookingModesFromSettings();

    if (availableBookingModes.length === 0) {
        modeSwitch.innerHTML = '<small class="field-help">No booking modes are available. Configure Rental Types & Pricing in Admin settings.</small>';
        return;
    }

    const selectedMode = availableBookingModes.includes(currentBookingMode)
        ? currentBookingMode
        : getDefaultBookingMode();

    const modeText = selectedMode === 'perday' ? 'Per Day' : 'Per Hour / Session';
    modeSwitch.innerHTML = `<small class="field-help">Pricing Mode: ${modeText} (auto-selected by Booking Type category)</small>`;
};

const getMapForMode = (mode) => mode === 'perday' ? perdaySelectedRentals : hourlySelectedRentals;

const setActiveSelectionMap = () => {
    selectedRentals = getMapForMode(currentBookingMode);
};

const buildSelectedRentalEntry = (item, rentalKey, quantity = 1) => ({
    name: item.name,
    fullId: rentalKey,
    category: item.category,
    description: item.description,
    basePrice: item.price,
    price: item.price,
    quantity,
    isRequired: !!item.isRequired,
    rentalType: item.rentalType,
    perdayPrice: item.rentalType === 'perday' ? item.price : 0
});

const normalizeDraftQuantityForItem = (item, rawQuantity) => {
    const baseQuantity = Math.max(1, Number(rawQuantity) || 1);
    if (!isQuantityControlEnabled(item)) {
        return 1;
    }

    const maxLimits = {
        'JamRoom__Microphone': 4,
        'JamRoom__Audio Jacks': 4
    };

    const maxLimit = maxLimits[item.key] || 99;
    return Math.max(1, Math.min(maxLimit, baseQuantity));
};

const clearModeSelectionsFromUI = (mode) => {
    const selectedMap = getMapForMode(mode);
    selectedMap.clear();

    document
        .querySelectorAll(`.rental-option[data-rental-mode="${mode}"]`)
        .forEach((optionEl) => {
            const checkbox = optionEl.querySelector('.rental-checkbox');
            if (checkbox && !checkbox.disabled) {
                checkbox.checked = false;
            }

            optionEl.classList.remove('selected');

            const quantityDisplay = optionEl.querySelector('.quantity-display');
            if (quantityDisplay) {
                quantityDisplay.textContent = '1';
            }
        });
};

const applyModeDraftSelection = (mode, draftItems = []) => {
    const selectedMap = getMapForMode(mode);
    const catalog = rentalCatalog[mode];
    if (!catalog) return;

    draftItems.forEach((entry) => {
        const rentalKey = String(entry?.key || '').trim();
        if (!rentalKey) return;

        const item = catalog.get(rentalKey);
        if (!item) return;

        const quantity = normalizeDraftQuantityForItem(item, entry?.quantity);

        const rentalDiv = document.querySelector(`[data-rental-id="${rentalKey}"][data-rental-mode="${mode}"]`);
        const checkbox = rentalDiv?.querySelector('.rental-checkbox');
        if (!rentalDiv || !checkbox || checkbox.disabled) return;

        checkbox.checked = true;
        rentalDiv.classList.add('selected');

        const quantityDisplay = rentalDiv.querySelector('.quantity-display');
        if (quantityDisplay) {
            quantityDisplay.textContent = String(quantity);
        }

        selectedMap.set(rentalKey, buildSelectedRentalEntry(item, rentalKey, quantity));
    });
};

const getBookingRentalDraftSnapshot = () => ({
    hourly: [...hourlySelectedRentals.entries()].map(([key, rental]) => ({
        key,
        quantity: Math.max(1, Number(rental?.quantity) || 1)
    })),
    perday: [...perdaySelectedRentals.entries()].map(([key, rental]) => ({
        key,
        quantity: Math.max(1, Number(rental?.quantity) || 1)
    }))
});

const applyBookingRentalDraftSelection = (draftSelection = {}) => {
    clearModeSelectionsFromUI('hourly');
    clearModeSelectionsFromUI('perday');

    applyModeDraftSelection('hourly', Array.isArray(draftSelection.hourly) ? draftSelection.hourly : []);
    applyModeDraftSelection('perday', Array.isArray(draftSelection.perday) ? draftSelection.perday : []);

    setActiveSelectionMap();
    applyPerdayItemAvailability();

    if (typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }
};

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const combineDateAndTime = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) return null;

    const [hours, minutes] = String(timeValue).split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;

    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;

    date.setHours(hours, minutes, 0, 0);
    return date;
};

const calculatePerDayDurationInfo = ({ startDate, endDate, pickupTime, returnTime }) => {
    const startDateTime = combineDateAndTime(startDate, pickupTime);
    const endDateTime = combineDateAndTime(endDate, returnTime);

    if (!startDateTime || !endDateTime) {
        return {
            days: 0,
            totalHours: 0,
            isValid: false,
            error: 'Select per-day start/end date and pick-up/return time.'
        };
    }

    const diffMs = endDateTime.getTime() - startDateTime.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    if (diffMs < dayMs) {
        return {
            days: 0,
            totalHours: 0,
            isValid: false,
            error: 'Return must be at least 24 hours after pick-up.'
        };
    }

    if (diffMs % dayMs !== 0) {
        return {
            days: 0,
            totalHours: Math.floor(diffMs / (1000 * 60 * 60)),
            isValid: false,
            error: 'Return must be in exact 24-hour blocks (24h, 48h, 72h...).'
        };
    }

    const days = diffMs / dayMs;
    return {
        days,
        totalHours: days * 24,
        isValid: true,
        error: ''
    };
};

const ensurePerdayAvailabilityInfoEl = () => {
    const container = document.getElementById('perdayRentalsList');
    if (!container) return null;

    let infoEl = document.getElementById('perdayAvailabilityInfo');
    if (!infoEl) {
        infoEl = document.createElement('small');
        infoEl.id = 'perdayAvailabilityInfo';
        infoEl.className = 'field-help';
        container.parentElement?.appendChild(infoEl);
    }

    return infoEl;
};

const updatePerdayAvailabilityInfo = (message = '') => {
    const infoEl = ensurePerdayAvailabilityInfoEl();
    if (!infoEl) return;

    infoEl.textContent = message;
    infoEl.style.display = message ? 'block' : 'none';
};

const toTitleCase = (value) => String(value || '')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const getPerdayItemDisplayName = (nameKey) => {
    for (const item of rentalCatalog.perday.values()) {
        if (normalizeRentalNameKey(item.name) === nameKey) {
            return item.name;
        }
    }

    return toTitleCase(nameKey);
};

const ensurePerdayBookedItemsPanelEl = () => {
    const container = document.getElementById('perdayRentalsList');
    if (!container) return null;

    let panelEl = document.getElementById('perdayBookedItemsPanel');
    if (!panelEl) {
        panelEl = document.createElement('div');
        panelEl.id = 'perdayBookedItemsPanel';
        panelEl.className = 'perday-booked-panel';
        container.parentElement?.appendChild(panelEl);
    }

    return panelEl;
};

const renderPerdayBookedItemsPanel = ({ hasValidRange = false } = {}) => {
    const panelEl = ensurePerdayBookedItemsPanelEl();
    if (!panelEl) return;

    if (!hasValidRange || !perdaySelectedRange) {
        panelEl.style.display = 'none';
        panelEl.innerHTML = '';
        return;
    }

    const { startDate, endDate, pickupTime, returnTime } = perdaySelectedRange;
    const headerText = `Booked items in selected range: ${startDate} ${pickupTime} to ${endDate} ${returnTime}`;

    if (perdayBookedItemQuantities.size === 0) {
        panelEl.style.display = 'block';
        panelEl.innerHTML = `
            <div class="perday-booked-header">${headerText}</div>
            <div class="perday-booked-empty">No per-day items are booked for this range.</div>
        `;
        return;
    }

    const listHtml = [...perdayBookedItemQuantities.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([nameKey, qty]) => `
            <li class="perday-booked-item">
                <span class="perday-booked-name">${getPerdayItemDisplayName(nameKey)}</span>
                <span class="perday-booked-qty">Booked: ${qty}</span>
            </li>
        `)
        .join('');

    panelEl.style.display = 'block';
    panelEl.innerHTML = `
        <div class="perday-booked-header">${headerText}</div>
        <ul class="perday-booked-list">${listHtml}</ul>
    `;
};

const applyPerdayItemAvailability = () => {
    const perdayContainer = document.getElementById('perdayRentalsList');
    if (!perdayContainer) return;

    let removedSelection = false;

    perdayContainer
        .querySelectorAll('.rental-option[data-rental-mode="perday"]')
        .forEach((optionEl) => {
            const rentalKey = optionEl.getAttribute('data-rental-id');
            const item = rentalCatalog.perday.get(rentalKey);
            const checkbox = optionEl.querySelector('.rental-checkbox');
            if (!item || !checkbox) return;

            if (item.rentalType !== 'perday') {
                checkbox.disabled = false;
                optionEl.classList.remove('unavailable');
                optionEl.removeAttribute('title');
                return;
            }

            const rentalNameKey = normalizeRentalNameKey(item.name);
            const isUnavailable = perdayUnavailableItems.has(rentalNameKey);

            checkbox.disabled = isUnavailable;
            optionEl.classList.toggle('unavailable', isUnavailable);

            if (isUnavailable) {
                optionEl.title = 'Unavailable for selected pickup/return range';
                if (checkbox.checked) {
                    checkbox.checked = false;
                }
                if (perdaySelectedRentals.has(rentalKey)) {
                    perdaySelectedRentals.delete(rentalKey);
                    removedSelection = true;
                }
            } else {
                optionEl.removeAttribute('title');
            }
        });

    if (removedSelection && currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }

    if (perdayUnavailableItems.size > 0) {
        updatePerdayAvailabilityInfo('Some per-day items are unavailable for the selected date range.');
    } else {
        updatePerdayAvailabilityInfo('');
    }

    renderPerdayBookedItemsPanel({ hasValidRange: !!perdaySelectedRange });
};

const fetchPerdayItemAvailability = async () => {
    const startDate = document.getElementById('perdayStartDate')?.value || '';
    const endDate = document.getElementById('perdayEndDate')?.value || '';
    const pickupTime = document.getElementById('perdayPickupTime')?.value || '';
    const returnTime = document.getElementById('perdayReturnTime')?.value || '';

    const durationInfo = calculatePerDayDurationInfo({
        startDate,
        endDate,
        pickupTime,
        returnTime
    });

    if (!startDate || !endDate || !pickupTime || !returnTime || !durationInfo.isValid) {
        perdayUnavailableItems = new Set();
        perdayBookedItemQuantities = new Map();
        perdaySelectedRange = null;
        applyPerdayItemAvailability();
        return;
    }

    const requestId = ++perdayAvailabilityRequestSeq;

    try {
        const params = new URLSearchParams({
            startDate,
            endDate,
            pickupTime,
            returnTime
        });

        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/bookings/availability/perday-items?${params.toString()}`, {
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            }
        });

        const data = await response.json();
        if (requestId !== perdayAvailabilityRequestSeq) return;

        if (!response.ok || !data.success) {
            throw new Error(data.message || 'Failed to fetch per-day item availability');
        }

        perdaySelectedRange = { startDate, endDate, pickupTime, returnTime };
        perdayUnavailableItems = new Set((data.unavailableItems || []).map((name) => normalizeRentalNameKey(name)));
        perdayBookedItemQuantities = new Map(
            Object.entries(data.bookedItemQuantities || {}).map(([name, qty]) => [normalizeRentalNameKey(name), Number(qty) || 0])
        );
        applyPerdayItemAvailability();
    } catch (error) {
        console.error('Per-day item availability fetch error:', error);
        perdayUnavailableItems = new Set();
        perdayBookedItemQuantities = new Map();
        perdaySelectedRange = null;
        applyPerdayItemAvailability();
    }
};

const refreshPerDayDaysInfo = () => {
    const startDate = document.getElementById('perdayStartDate')?.value;
    const endDate = document.getElementById('perdayEndDate')?.value;
    const pickupTime = document.getElementById('perdayPickupTime')?.value;
    const returnTime = document.getElementById('perdayReturnTime')?.value;
    const infoEl = document.getElementById('perdayDaysInfo');
    if (!infoEl) return;

    const durationInfo = calculatePerDayDurationInfo({
        startDate,
        endDate,
        pickupTime,
        returnTime
    });

    infoEl.textContent = durationInfo.isValid
        ? `${durationInfo.days} day(s) selected (${durationInfo.totalHours}h total).`
        : durationInfo.error;
};

const syncPerDayReturnWithPickup = () => {
    const pickupInput = document.getElementById('perdayPickupTime');
    const returnInput = document.getElementById('perdayReturnTime');
    if (!pickupInput || !returnInput) return;

    returnInput.value = pickupInput.value || '';
};

const toggleBookingModeFields = (mode) => {
    const isPerday = mode === 'perday';

    const hourlyBlock = document.getElementById('hourlyBookingBlock');
    const perdayBlock = document.getElementById('perdayBookingBlock');
    if (hourlyBlock) hourlyBlock.style.display = isPerday ? 'none' : 'block';
    if (perdayBlock) perdayBlock.style.display = isPerday ? 'block' : 'none';

    const bookingDateInput = document.getElementById('bookingDate');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const perdayStart = document.getElementById('perdayStartDate');
    const perdayEnd = document.getElementById('perdayEndDate');
    const perdayPickup = document.getElementById('perdayPickupTime');
    const perdayReturn = document.getElementById('perdayReturnTime');

    if (bookingDateInput) bookingDateInput.disabled = isPerday;

    if (startTimeInput) {
        if (isPerday) {
            startTimeInput.disabled = true;
        } else {
            startTimeInput.disabled = !bookingDateInput?.value;
        }
    }

    if (endTimeInput) {
        if (isPerday) {
            endTimeInput.disabled = true;
        } else {
            endTimeInput.disabled = !startTimeInput?.value;
        }
    }

    if (perdayStart) perdayStart.disabled = !isPerday;
    if (perdayEnd) perdayEnd.disabled = !isPerday;
    if (perdayPickup) perdayPickup.disabled = !isPerday;
    if (perdayReturn) perdayReturn.disabled = true;

    if (isPerday) {
        syncPerDayReturnWithPickup();
    }
};

const switchBookingMode = (mode) => {
    const requestedMode = mode === 'perday' ? 'perday' : 'hourly';
    currentBookingMode = availableBookingModes.includes(requestedMode)
        ? requestedMode
        : getDefaultBookingMode();
    toggleBookingModeFields(currentBookingMode);
    setActiveSelectionMap();
    refreshPerDayDaysInfo();

    if (typeof window.refreshBookingTypeOptions === 'function') {
        window.refreshBookingTypeOptions();
    }

    if (currentBookingMode === 'hourly') {
        const selectedDate = document.getElementById('bookingDate')?.value;
        if (selectedDate && typeof loadAvailability === 'function') {
            loadAvailability(selectedDate);
        }

        perdaySelectedRange = null;
        renderPerdayBookedItemsPanel({ hasValidRange: false });
    }

    if (currentBookingMode === 'perday') {
        fetchPerdayItemAvailability();
    }

    if (typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }

    if (typeof window.scheduleBookingFormDraftSave === 'function') {
        window.scheduleBookingFormDraftSave();
    }
};

const bindBookingModeControls = () => {
    renderBookingModeOptions();
    switchBookingMode(getDefaultBookingMode());
};

const setPerDayInputConstraints = () => {
    const startInput = document.getElementById('perdayStartDate');
    const endInput = document.getElementById('perdayEndDate');
    const pickupInput = document.getElementById('perdayPickupTime');
    const returnInput = document.getElementById('perdayReturnTime');
    if (!startInput || !endInput || !pickupInput || !returnInput) return;

    const today = getTodayDateString();
    startInput.min = today;
    endInput.min = startInput.value || today;

    if (endInput.value && startInput.value && endInput.value < startInput.value) {
        endInput.value = startInput.value;
    }

    startInput.addEventListener('change', () => {
        endInput.min = startInput.value || today;
        if (endInput.value && startInput.value && endInput.value < startInput.value) {
            endInput.value = startInput.value;
        }

        syncPerDayReturnWithPickup();

        refreshPerDayDaysInfo();
        if (currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
            updatePriceDisplay();
        }

        if (currentBookingMode === 'perday') {
            fetchPerdayItemAvailability();
        }

        if (typeof window.scheduleBookingFormDraftSave === 'function') {
            window.scheduleBookingFormDraftSave();
        }
    });

    endInput.addEventListener('change', () => {
        refreshPerDayDaysInfo();
        if (currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
            updatePriceDisplay();
        }

        if (currentBookingMode === 'perday') {
            fetchPerdayItemAvailability();
        }

        if (typeof window.scheduleBookingFormDraftSave === 'function') {
            window.scheduleBookingFormDraftSave();
        }
    });

    pickupInput.addEventListener('change', () => {
        syncPerDayReturnWithPickup();

        refreshPerDayDaysInfo();
        if (currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
            updatePriceDisplay();
        }

        if (currentBookingMode === 'perday') {
            fetchPerdayItemAvailability();
        }

        if (typeof window.scheduleBookingFormDraftSave === 'function') {
            window.scheduleBookingFormDraftSave();
        }
    });

    syncPerDayReturnWithPickup();

    refreshPerDayDaysInfo();
    fetchPerdayItemAvailability();
};

const isQuantityControlEnabled = (item) => {
    if (item.isRequired) return false;
    if (item.rentalType === 'perday') return true;
    if (item.rentalType === 'persession') return true;
    if (item.price === 0) return true;
    if ((item.name || '').includes('IEM')) return true;
    return false;
};

const buildRentalOptionHTML = (item, mode) => {
    const showQuantity = isQuantityControlEnabled(item);
    const priceUnit = item.rentalType === 'perday' ? '/day' : item.rentalType === 'persession' ? '/session' : '/hr';
    const defaultChecked = item.isRequired ? 'checked' : '';
    const defaultDisabled = item.isRequired ? 'disabled' : '';
    const selectedClass = item.isRequired ? ' selected' : '';
    const infoText = item.isRequired
        ? 'Always required'
        : (item.rentalType === 'perday'
            ? 'Charged per selected day'
            : item.rentalType === 'persession'
                ? 'Charged once per session'
                : 'Charged for jam duration');

    return `
        <div class="rental-option ${item.isRequired ? 'base' : 'child'}${selectedClass}" data-rental-id="${item.key}" data-rental-mode="${mode}">
            <input type="checkbox" class="rental-checkbox" ${defaultChecked} ${defaultDisabled} onchange="toggleRental('${item.key}', '${mode}')">
            <div class="rental-meta">
                <div class="rental-name">${item.name}</div>
                <div class="rental-description">${item.description || ''}</div>
                <div class="rental-price">${item.price === 0 ? 'FREE' : `₹${item.price}${priceUnit}`}</div>
            </div>
            <div class="rental-qty">
                ${showQuantity
                    ? `<div class="quantity-controls">
                           <button type="button" class="quantity-btn" onclick="updateQuantity('${item.key}', -1, '${mode}')">−</button>
                           <span class="quantity-display">1</span>
                           <button type="button" class="quantity-btn" onclick="updateQuantity('${item.key}', 1, '${mode}')">+</button>
                       </div>`
                    : `<div class="quantity-info centered">${infoText}</div>`}
            </div>
        </div>
    `;
};

const renderRentalSection = (container, title, items, mode) => {
    if (!container) return;

    const section = document.createElement('div');
    section.className = 'rental-category';

    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `<strong>${title}</strong>`;
    section.appendChild(header);

    const content = document.createElement('div');
    content.className = 'category-content';

    if (!Array.isArray(items) || items.length === 0) {
        content.innerHTML = '<p class="booking-empty-message booking-empty-padded">No items configured.</p>';
    } else {
        content.innerHTML = items.map((item) => buildRentalOptionHTML(item, mode)).join('');
    }

    section.appendChild(content);
    container.appendChild(section);
};

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const addGroupedItem = (groupsMap, categoryName, item) => {
    if (!groupsMap.has(categoryName)) {
        groupsMap.set(categoryName, []);
    }
    groupsMap.get(categoryName).push(item);
};

const getCategoryRentalType = (type) => {
    const explicitType = normalizeRentalType(type?.rentalType || '');
    if (String(type?.rentalType || '').trim()) {
        return explicitType;
    }

    const subItems = Array.isArray(type?.subItems) ? type.subItems : [];
    if (subItems.some((subItem) => normalizeRentalType(subItem?.rentalType) === 'perday')) {
        return 'perday';
    }

    if (subItems.some((subItem) => normalizeRentalType(subItem?.rentalType) === 'persession')) {
        return 'persession';
    }

    return 'inhouse';
};

const getCategoryMode = (categoryRentalType) => categoryRentalType === 'perday' ? 'perday' : 'hourly';

const getConfiguredBindingPairs = () => {
    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];
    const knownCategories = new Set(
        rentalTypes
            .map((type) => String(type?.name || '').trim())
            .filter(Boolean)
    );

    const rawPairs = Array.isArray(settings?.bookingCategoryBindings?.pairs)
        ? settings.bookingCategoryBindings.pairs
        : [];

    return rawPairs
        .map((pair) => {
            const leftCategory = String(pair?.leftCategory || '').trim();
            const rightCategory = String(pair?.rightCategory || '').trim();
            const leftRentalType = normalizeRentalType(pair?.leftRentalType || 'inhouse');
            const rightRentalType = normalizeRentalType(pair?.rightRentalType || 'inhouse');

            if (!leftCategory || !rightCategory || leftCategory === rightCategory) {
                return null;
            }

            if (!knownCategories.has(leftCategory) || !knownCategories.has(rightCategory)) {
                return null;
            }

            const isValidPair = leftRentalType === rightRentalType
                || leftRentalType === 'persession'
                || rightRentalType === 'persession';
            if (!isValidPair) {
                return null;
            }

            return {
                leftCategory,
                rightCategory,
                leftRentalType,
                rightRentalType
            };
        })
        .filter(Boolean);
};

const getBoundCategoryNames = (categoryName) => {
    const normalizedCategory = String(categoryName || '').trim();
    if (!normalizedCategory) {
        return [];
    }

    const bound = new Set();
    getConfiguredBindingPairs().forEach((pair) => {
        if (pair.leftCategory === normalizedCategory) {
            bound.add(pair.rightCategory);
        } else if (pair.rightCategory === normalizedCategory) {
            bound.add(pair.leftCategory);
        }
    });

    return [...bound];
};

const getBookingCategoryOptions = () => {
    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];
    return rentalTypes
        .map((type) => {
            const categoryName = String(type?.name || '').trim();
            if (!categoryName) return null;

            const categoryRentalType = getCategoryRentalType(type);
            const mode = getCategoryMode(categoryRentalType);
            return {
                value: categoryName,
                label: categoryName,
                category: categoryName,
                mode,
                rentalType: categoryRentalType
            };
        })
        .filter(Boolean);
};

const categorizeRentalItems = () => {
    const hourlyGroups = new Map();
    const perdayGroups = new Map();
    bookingCategoryModeMap.clear();

    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];

    rentalTypes.forEach((type) => {
        const typeName = String(type?.name || '').trim();
        if (!typeName) return;

        const categoryRentalType = getCategoryRentalType(type);
        const categoryMode = getCategoryMode(categoryRentalType);
        bookingCategoryModeMap.set(typeName, categoryMode);

        const hasSubItems = Array.isArray(type.subItems) && type.subItems.length > 0;

        if (typeName === 'JamRoom' && toNumber(type.basePrice, 0) > 0 && categoryMode === 'hourly') {
            addGroupedItem(hourlyGroups, typeName, {
                key: `${typeName}_base`,
                name: `${typeName} (Base)`,
                category: typeName,
                description: type.description || 'Base room booking',
                price: toNumber(type.basePrice, 0),
                rentalType: categoryRentalType,
                isRequired: false
            });
        }

        if (!hasSubItems) {
            if (typeName !== 'JamRoom' && toNumber(type.basePrice, 0) > 0) {
                addGroupedItem(categoryMode === 'perday' ? perdayGroups : hourlyGroups, typeName, {
                    key: `${typeName}__${typeName}`,
                    name: typeName,
                    category: typeName,
                    description: type.description || `${typeName} rental`,
                    price: toNumber(type.basePrice, 0),
                    rentalType: categoryRentalType,
                    isRequired: false
                });
            }

            return;
        }

        type.subItems.forEach((subItem) => {
            const itemName = String(subItem?.name || '').trim();
            if (!itemName) return;

            const price = categoryRentalType === 'perday'
                ? toNumber(subItem.perdayPrice, 0)
                : toNumber(subItem.price, 0);

            const item = {
                key: `${typeName}__${itemName}`,
                name: itemName,
                category: typeName,
                description: subItem.description || type.description || '',
                price,
                rentalType: categoryRentalType,
                isRequired: false
            };

            if (categoryMode === 'perday') {
                addGroupedItem(perdayGroups, typeName, item);
            } else {
                addGroupedItem(hourlyGroups, typeName, item);
            }
        });
    });

    return { hourlyGroups, perdayGroups };
};

const populateRentalTypes = () => {
    const hourlyContainer = document.getElementById('rentalsList');
    const perdayContainer = document.getElementById('perdayRentalsList');

    if (!hourlyContainer || !perdayContainer) return;

    hourlyContainer.innerHTML = '';
    perdayContainer.innerHTML = '';
    hourlySelectedRentals = new Map();
    perdaySelectedRentals = new Map();
    rentalCatalog.hourly = new Map();
    rentalCatalog.perday = new Map();

    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];
    if (rentalTypes.length === 0) {
        hourlyContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No rental options available.</p>';
        perdayContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No per-day options available.</p>';
        activeBookingCategory = '';
        setActiveSelectionMap();
        if (typeof updatePriceDisplay === 'function') updatePriceDisplay();
        return;
    }

    const { hourlyGroups, perdayGroups } = categorizeRentalItems();
    const categoryOptions = getBookingCategoryOptions();

    if (!activeBookingCategory || !categoryOptions.some((option) => option.value === activeBookingCategory)) {
        activeBookingCategory = categoryOptions[0]?.value || '';
    }

    const boundCategories = getBoundCategoryNames(activeBookingCategory);
    const categoriesToRender = [activeBookingCategory, ...boundCategories].filter(Boolean);

    const activeMode = bookingCategoryModeMap.get(activeBookingCategory) || getDefaultBookingMode();
    availableBookingModes = [activeMode];

    hourlyGroups.forEach((items) => {
        items.forEach((item) => rentalCatalog.hourly.set(item.key, item));
    });
    perdayGroups.forEach((items) => {
        items.forEach((item) => rentalCatalog.perday.set(item.key, item));
    });

    const uniqueByKey = (items) => {
        const seen = new Set();
        return items.filter((item) => {
            const key = String(item?.key || '').trim();
            if (!key || seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    };

    const activeHourlyItems = uniqueByKey(
        categoriesToRender.flatMap((categoryName) => hourlyGroups.get(categoryName) || [])
    );

    const activePerdayItems = uniqueByKey(
        categoriesToRender.flatMap((categoryName) => {
            const perdayItems = perdayGroups.get(categoryName) || [];

            if (activeMode !== 'perday') {
                return perdayItems;
            }

            const sessionItems = (hourlyGroups.get(categoryName) || [])
                .filter((item) => item.rentalType === 'persession');

            return [...perdayItems, ...sessionItems];
        })
    );
    const hasHourly = activeHourlyItems.length > 0;
    const hasPerday = activePerdayItems.length > 0;

    if (!hasHourly) {
        hourlyContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No individual items configured for this category.</p>';
    } else {
        renderRentalSection(hourlyContainer, `${activeBookingCategory} - Individual Items (Optional)`, activeHourlyItems, 'hourly');
    }

    if (!hasPerday) {
        perdayContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No individual items configured for this category.</p>';
    } else {
        renderRentalSection(perdayContainer, `${activeBookingCategory} - Individual Items (Optional)`, activePerdayItems, 'perday');
    }

    switchBookingMode(activeMode);
    setActiveSelectionMap();
    applyPerdayItemAvailability();

    if (typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }

    if (typeof window.refreshBookingTypeOptions === 'function') {
        window.refreshBookingTypeOptions();
    }
};

const setActiveBookingCategory = (categoryName) => {
    const normalizedCategory = String(categoryName || '').trim();
    if (!normalizedCategory) {
        return;
    }

    if (normalizedCategory === activeBookingCategory) {
        return;
    }

    activeBookingCategory = normalizedCategory;
    populateRentalTypes();
};

const toggleRental = (rentalKey, mode = 'hourly') => {
    const selectedMap = getMapForMode(mode);
    const item = rentalCatalog[mode]?.get(rentalKey);
    const rentalDiv = document.querySelector(`[data-rental-id="${rentalKey}"][data-rental-mode="${mode}"]`);
    const checkbox = rentalDiv?.querySelector('.rental-checkbox');

    if (!item || !rentalDiv || !checkbox) return;

    if (mode === 'perday' && checkbox.checked && perdayUnavailableItems.has(normalizeRentalNameKey(item.name))) {
        checkbox.checked = false;
        showAlert(`${item.name} is unavailable for the selected pickup/return range.`, 'error');
        return;
    }

    if (checkbox.checked) {
        selectedMap.set(rentalKey, buildSelectedRentalEntry(item, rentalKey, 1));
        rentalDiv.classList.add('selected');
    } else {
        selectedMap.delete(rentalKey);
        rentalDiv.classList.remove('selected');
        const quantityDisplay = rentalDiv.querySelector('.quantity-display');
        if (quantityDisplay) quantityDisplay.textContent = '1';
    }

    if (mode === currentBookingMode && typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }

    if (typeof window.refreshBookingTypeOptions === 'function') {
        window.refreshBookingTypeOptions();
    }

    if (typeof window.scheduleBookingFormDraftSave === 'function') {
        window.scheduleBookingFormDraftSave();
    }
};

const updateQuantity = (rentalKey, change, mode = 'hourly') => {
    const selectedMap = getMapForMode(mode);
    if (!selectedMap.has(rentalKey)) return;

    const rental = selectedMap.get(rentalKey);
    if (rental.isRequired) return;

    if (mode === 'hourly' && rental.rentalType === 'inhouse' && rental.price > 0 && !rental.name.includes('IEM')) {
        return;
    }

    const maxLimits = {
        'JamRoom__Microphone': 4,
        'JamRoom__Audio Jacks': 4
    };

    const maxLimit = maxLimits[rentalKey] || 99;
    const newQuantity = Math.max(1, Math.min(maxLimit, rental.quantity + change));
    rental.quantity = newQuantity;

    const rentalDiv = document.querySelector(`[data-rental-id="${rentalKey}"][data-rental-mode="${mode}"]`);
    const quantityDisplay = rentalDiv?.querySelector('.quantity-display');
    if (quantityDisplay) quantityDisplay.textContent = String(newQuantity);

    if (mode === currentBookingMode && typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }

    if (typeof window.scheduleBookingFormDraftSave === 'function') {
        window.scheduleBookingFormDraftSave();
    }
};

const resetBookingRentalState = () => {
    const categoryOptions = getBookingCategoryOptions();
    activeBookingCategory = categoryOptions[0]?.value || '';
    populateRentalTypes();
};

// Load settings using shared API
const loadSettings = async () => {
    try {
        const res = await fetch(`${API_URL}/api/bookings/settings`);
        const data = await res.json();

        if (res.ok && data.success && data.settings) {
            settings = data.settings;
            window.adminSettings = settings;

            setPerDayInputConstraints();
            populateRentalTypes();
            bindBookingModeControls();
            if (typeof window.refreshBookingTypeOptions === 'function') {
                window.refreshBookingTypeOptions();
            }
        } else {
            console.error('Failed to load settings:', data);
            showAlert('Failed to load booking settings. Please refresh the page.', 'error');
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        showAlert('Connection error while loading settings. Please check your internet connection.', 'error');
    }
};

const getBookingMode = () => currentBookingMode;

const getPerDayBookingInfo = () => {
    const startDate = document.getElementById('perdayStartDate')?.value || '';
    const endDate = document.getElementById('perdayEndDate')?.value || '';
    const pickupTime = document.getElementById('perdayPickupTime')?.value || '';
    const returnTime = document.getElementById('perdayReturnTime')?.value || '';
    const durationInfo = calculatePerDayDurationInfo({
        startDate,
        endDate,
        pickupTime,
        returnTime
    });

    return {
        startDate,
        endDate,
        pickupTime,
        returnTime,
        days: durationInfo.days,
        totalHours: durationInfo.totalHours,
        isValid: durationInfo.isValid,
        validationMessage: durationInfo.error
    };
};

// Expose for inline handlers and cross-file usage.
window.loadSettings = loadSettings;
window.populateRentalTypes = populateRentalTypes;
window.toggleRental = toggleRental;
window.updateQuantity = updateQuantity;
window.getBookingMode = getBookingMode;
window.getPerDayBookingInfo = getPerDayBookingInfo;
window.switchBookingMode = switchBookingMode;
window.resetBookingRentalState = resetBookingRentalState;
window.getBookingCategoryOptions = getBookingCategoryOptions;
window.setActiveBookingCategory = setActiveBookingCategory;
window.getBookingRentalDraftSnapshot = getBookingRentalDraftSnapshot;
window.applyBookingRentalDraftSelection = applyBookingRentalDraftSelection;
