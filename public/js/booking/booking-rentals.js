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

const rentalCatalog = {
    hourly: new Map(),
    perday: new Map()
};

const normalizeRentalType = (value) => String(value || 'inhouse').toLowerCase() === 'perday' ? 'perday' : 'inhouse';
const normalizeRentalNameKey = (name) => String(name || '').trim().toLowerCase();

const getMapForMode = (mode) => mode === 'perday' ? perdaySelectedRentals : hourlySelectedRentals;

const setActiveSelectionMap = () => {
    selectedRentals = getMapForMode(currentBookingMode);
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
    currentBookingMode = mode === 'perday' ? 'perday' : 'hourly';
    toggleBookingModeFields(currentBookingMode);
    setActiveSelectionMap();
    refreshPerDayDaysInfo();

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
};

const bindBookingModeControls = () => {
    const modeInputs = document.querySelectorAll('input[name="bookingMode"]');
    if (!modeInputs || modeInputs.length === 0) {
        switchBookingMode('hourly');
        return;
    }

    modeInputs.forEach((input) => {
        input.addEventListener('change', (event) => {
            if (event.target.checked) {
                switchBookingMode(event.target.value);
            }
        });
    });

    const selected = Array.from(modeInputs).find((input) => input.checked);
    switchBookingMode(selected?.value || 'hourly');
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
    });

    endInput.addEventListener('change', () => {
        refreshPerDayDaysInfo();
        if (currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
            updatePriceDisplay();
        }

        if (currentBookingMode === 'perday') {
            fetchPerdayItemAvailability();
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
    });

    syncPerDayReturnWithPickup();

    refreshPerDayDaysInfo();
    fetchPerdayItemAvailability();
};

const isQuantityControlEnabled = (item) => {
    if (item.isRequired) return false;
    if (item.rentalType === 'perday') return true;
    if (item.price === 0) return true;
    if ((item.name || '').includes('IEM')) return true;
    return false;
};

const buildRentalOptionHTML = (item, mode) => {
    const showQuantity = isQuantityControlEnabled(item);
    const priceUnit = item.rentalType === 'perday' ? '/day' : '/hr';
    const defaultChecked = item.isRequired ? 'checked' : '';
    const defaultDisabled = item.isRequired ? 'disabled' : '';
    const selectedClass = item.isRequired ? ' selected' : '';
    const infoText = item.isRequired
        ? 'Always required'
        : (item.rentalType === 'perday' ? 'Charged per selected day' : 'Charged for jam duration');

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

const categorizeRentalItems = () => {
    const hourlyGroups = new Map();
    const perdayGroups = new Map();

    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];

    rentalTypes.forEach((type) => {
        const typeName = String(type?.name || '').trim();
        if (!typeName) return;

        const hasSubItems = Array.isArray(type.subItems) && type.subItems.length > 0;

        // Base item is supported only for JamRoom category.
        if (typeName === 'JamRoom' && toNumber(type.basePrice, 0) > 0) {
            addGroupedItem(hourlyGroups, typeName, {
                key: `${typeName}_base`,
                name: `${typeName} (Base)`,
                category: typeName,
                description: type.description || 'Base room booking',
                price: toNumber(type.basePrice, 0),
                rentalType: 'inhouse',
                isRequired: false
            });
        }

        if (!hasSubItems) {
            if (typeName !== 'JamRoom' && toNumber(type.basePrice, 0) > 0) {
                addGroupedItem(hourlyGroups, typeName, {
                    key: `${typeName}__${typeName}`,
                    name: typeName,
                    category: typeName,
                    description: type.description || `${typeName} rental`,
                    price: toNumber(type.basePrice, 0),
                    rentalType: 'inhouse',
                    isRequired: false
                });
            }

            return;
        }

        type.subItems.forEach((subItem) => {
            const itemName = String(subItem?.name || '').trim();
            if (!itemName) return;

            const normalizedType = normalizeRentalType(subItem.rentalType);
            const price = normalizedType === 'perday'
                ? toNumber(subItem.perdayPrice, 0)
                : toNumber(subItem.price, 0);

            const item = {
                key: `${typeName}__${itemName}`,
                name: itemName,
                category: typeName,
                description: subItem.description || type.description || '',
                price,
                rentalType: normalizedType,
                isRequired: false
            };

            if (normalizedType === 'perday') {
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
        setActiveSelectionMap();
        if (typeof updatePriceDisplay === 'function') updatePriceDisplay();
        return;
    }

    const { hourlyGroups, perdayGroups } = categorizeRentalItems();

    hourlyGroups.forEach((items) => {
        items.forEach((item) => rentalCatalog.hourly.set(item.key, item));
    });
    perdayGroups.forEach((items) => {
        items.forEach((item) => rentalCatalog.perday.set(item.key, item));
    });

    const hasHourly = hourlyGroups.size > 0;
    const hasPerday = perdayGroups.size > 0;

    if (!hasHourly) {
        hourlyContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No hourly rental options configured.</p>';
    } else {
        hourlyGroups.forEach((items, categoryName) => {
            renderRentalSection(hourlyContainer, categoryName, items, 'hourly');
        });
    }

    if (!hasPerday) {
        perdayContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No per-day options configured.</p>';
    } else {
        perdayGroups.forEach((items, categoryName) => {
            renderRentalSection(perdayContainer, `${categoryName} (Per-day)`, items, 'perday');
        });
    }

    setActiveSelectionMap();
    applyPerdayItemAvailability();

    if (typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }
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
        selectedMap.set(rentalKey, {
            name: item.name,
            fullId: rentalKey,
            category: item.category,
            description: item.description,
            basePrice: item.price,
            price: item.price,
            quantity: 1,
            isRequired: !!item.isRequired,
            rentalType: item.rentalType,
            perdayPrice: item.rentalType === 'perday' ? item.price : 0
        });
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
};

const resetBookingRentalState = () => {
    populateRentalTypes();

    const modeInputs = document.querySelectorAll('input[name="bookingMode"]');
    modeInputs.forEach((input) => {
        input.checked = input.value === 'hourly';
    });

    switchBookingMode('hourly');
};

// Load settings using shared API
const loadSettings = async () => {
    try {
        const res = await fetch(`${API_URL}/api/bookings/settings`);
        const data = await res.json();

        if (res.ok && data.success && data.settings) {
            settings = data.settings;
            window.adminSettings = settings;

            bindBookingModeControls();
            setPerDayInputConstraints();
            populateRentalTypes();
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
