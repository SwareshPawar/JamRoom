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
let perdayInFlightKey = '';
const perdayAvailabilityCache = new Map();
const PERDAY_AVAILABILITY_CACHE_TTL_MS = 30000;
let availableBookingModes = ['hourly', 'perday'];
let activeBookingCategory = '';
let perdayConstraintsInitialized = false;

const bookingCategoryModeMap = new Map();

const rentalCatalog = {
    hourly: new Map(),
    perday: new Map()
};

const normalizeRentalType = (value) => {
    const normalized = String(value || 'inhouse')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
    if (normalized === 'perday') return 'perday';
    if (normalized === 'persession' || normalized === 'session') return 'persession';
    if (normalized === 'pertrack' || normalized === 'track') return 'pertrack';
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
        } else if (categoryRentalType === 'inhouse' || categoryRentalType === 'persession' || categoryRentalType === 'pertrack') {
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

    modeSwitch.innerHTML = '';
};

const getMapForMode = (mode) => mode === 'perday' ? perdaySelectedRentals : hourlySelectedRentals;

const normalizeMaxQuantity = (value, fallback = 10) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(100, parsed);
};

const getRentalMaxQuantity = (item, fallback = 10) => normalizeMaxQuantity(item?.maxQuantity, fallback);

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
    quantity: Math.max(1, Math.min(getRentalMaxQuantity(item), Number(quantity) || 1)),
    maxQuantity: getRentalMaxQuantity(item),
    quantityEnabled: item.quantityEnabled === true,
    isRequired: !!item.isRequired,
    rentalType: item.rentalType,
    perdayPrice: item.rentalType === 'perday' ? item.price : 0
});

const normalizeDraftQuantityForItem = (item, rawQuantity) => {
    const baseQuantity = Math.max(1, Number(rawQuantity) || 1);
    if (!isQuantityControlEnabled(item)) {
        return 1;
    }

    const maxLimit = getRentalMaxQuantity(item);
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

const getTodayDateString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const addDaysToYmd = (dateStr, daysToAdd = 0) => {
    const base = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(base.getTime())) return dateStr;
    base.setDate(base.getDate() + Number(daysToAdd || 0));
    const year = base.getFullYear();
    const month = String(base.getMonth() + 1).padStart(2, '0');
    const day = String(base.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const setDateInputMinValue = (inputEl, minYmd) => {
    if (!inputEl || !minYmd) return;
    inputEl.min = minYmd;
    if (inputEl._flatpickr) {
        inputEl._flatpickr.set('minDate', minYmd);
    }
};

const setDateInputValue = (inputEl, ymdValue, { triggerChange = false } = {}) => {
    if (!inputEl || !ymdValue) return;
    if (inputEl._flatpickr) {
        inputEl._flatpickr.setDate(ymdValue, triggerChange, 'Y-m-d');
        return;
    }
    inputEl.value = ymdValue;
    if (triggerChange) {
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
};

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

const updatePerdayAvailabilityInfo = (_message = '') => {
    // Suppressed: the #perdayReferenceView panel now displays per-day item availability.
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

const renderPerdayBookedItemsPanel = (_opts = {}) => {
    // Suppressed: #perdayReferenceView now handles this display.
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
    const availabilityKey = `${startDate}|${endDate}|${pickupTime}|${returnTime}`;

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
        if (typeof window.displayPerdayAvailability === 'function') {
            window.displayPerdayAvailability({});
        }
        return;
    }

    if (perdayInFlightKey === availabilityKey) {
        return;
    }

    const cachedEntry = perdayAvailabilityCache.get(availabilityKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp) <= PERDAY_AVAILABILITY_CACHE_TTL_MS) {
        perdaySelectedRange = { startDate, endDate, pickupTime, returnTime };
        perdayUnavailableItems = new Set((cachedEntry.data.unavailableItems || []).map((name) => normalizeRentalNameKey(name)));
        perdayBookedItemQuantities = new Map(
            Object.entries(cachedEntry.data.bookedItemQuantities || {}).map(([name, qty]) => [normalizeRentalNameKey(name), Number(qty) || 0])
        );
        applyPerdayItemAvailability();

        if (typeof window.displayPerdayAvailability === 'function') {
            window.displayPerdayAvailability({
                unavailableItems: cachedEntry.data.unavailableItems || [],
                bookedItemQuantities: cachedEntry.data.bookedItemQuantities || {},
                catalogItems: Array.isArray(cachedEntry.data.catalogItems) ? cachedEntry.data.catalogItems : []
            });
        }
        return;
    }

    const requestId = ++perdayAvailabilityRequestSeq;
    perdayInFlightKey = availabilityKey;

    // Show loading state in the reference panel
    if (typeof window.displayPerdayAvailability === 'function') {
        window.displayPerdayAvailability({ loading: true });
    }

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

        perdayAvailabilityCache.set(availabilityKey, {
            timestamp: Date.now(),
            data: {
                unavailableItems: data.unavailableItems || [],
                bookedItemQuantities: data.bookedItemQuantities || {},
                catalogItems: Array.isArray(data.catalogItems) ? data.catalogItems : []
            }
        });

        perdaySelectedRange = { startDate, endDate, pickupTime, returnTime };
        perdayUnavailableItems = new Set((data.unavailableItems || []).map((name) => normalizeRentalNameKey(name)));
        perdayBookedItemQuantities = new Map(
            Object.entries(data.bookedItemQuantities || {}).map(([name, qty]) => [normalizeRentalNameKey(name), Number(qty) || 0])
        );
        applyPerdayItemAvailability();

        // Update the reference panel with full catalog + availability
        if (typeof window.displayPerdayAvailability === 'function') {
            window.displayPerdayAvailability({
                unavailableItems: data.unavailableItems || [],
                bookedItemQuantities: data.bookedItemQuantities || {},
                catalogItems: Array.isArray(data.catalogItems) ? data.catalogItems : []
            });
        }
    } catch (error) {
        console.error('Per-day item availability fetch error:', error);
        perdayUnavailableItems = new Set();
        perdayBookedItemQuantities = new Map();
        perdaySelectedRange = null;
        applyPerdayItemAvailability();
        if (typeof window.displayPerdayAvailability === 'function') {
            window.displayPerdayAvailability({ error: 'Failed to load item availability. Please try again.' });
        }
    } finally {
        if (perdayInFlightKey === availabilityKey) {
            perdayInFlightKey = '';
        }
    }
};

const resetPerdayAvailabilityState = () => {
    perdayUnavailableItems = new Set();
    perdayBookedItemQuantities = new Map();
    perdaySelectedRange = null;
    applyPerdayItemAvailability();
    if (typeof window.displayPerdayAvailability === 'function') {
        window.displayPerdayAvailability({});
    }
};

const handlePerdayPickupTimeChange = () => {
    const pickupInput = document.getElementById('perdayPickupTime');
    if (!pickupInput) return;

    syncPerDayReturnWithPickup();
    refreshPerDayDaysInfo();

    if (currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
        updatePriceDisplay();
    }

    if (pickupInput.value) {
        fetchPerdayItemAvailability();
    } else {
        resetPerdayAvailabilityState();
    }

    if (typeof window.scheduleBookingFormDraftSave === 'function') {
        window.scheduleBookingFormDraftSave();
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
    if (typeof returnInput._refreshCustomTimeDropdown === 'function') {
        returnInput._refreshCustomTimeDropdown();
    }
    returnInput.dispatchEvent(new Event('change', { bubbles: true }));
};

const toggleBookingModeFields = (mode) => {
    const isPerday = mode === 'perday';

    const hourlyBlock = document.getElementById('hourlyBookingBlock');
    const perdayBlock = document.getElementById('perdayBookingBlock');
    if (hourlyBlock) hourlyBlock.style.display = isPerday ? 'none' : 'block';
    if (perdayBlock) perdayBlock.style.display = isPerday ? 'block' : 'none';

    const bookingDateInput = document.getElementById('bookingDate');
    const startTimeInput = document.getElementById('startTime');
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
        const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
        if (!isPerTrackBookingCategory(bookingType) && selectedDate && typeof loadAvailability === 'function') {
            loadAvailability(selectedDate);
        }

        perdaySelectedRange = null;
        renderPerdayBookedItemsPanel({ hasValidRange: false });
    }

    if (currentBookingMode === 'perday') {
        // B1: Lazily initialise per-day input constraints on first switch to per-day mode.
        if (!perdayConstraintsInitialized) {
            perdayConstraintsInitialized = true;
            setPerDayInputConstraints();
        } else if (document.getElementById('perdayPickupTime')?.value) {
            fetchPerdayItemAvailability();
        } else {
            resetPerdayAvailabilityState();
        }
    }

    refreshHourlySchedulingVisibility();

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
    const getMinReturnDate = () => (startInput.value
        ? addDaysToYmd(startInput.value, 1)
        : addDaysToYmd(today, 1));
    setDateInputMinValue(startInput, today);

    const updatePickupTimeConstraints = () => {
        const selectedStartDate = startInput.value || '';
        const isToday = selectedStartDate === today;
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        let hasEnabledTime = false;
        Array.from(pickupInput.options || []).forEach((option, index) => {
            const optionValue = String(option.value || '');
            if (!optionValue) {
                option.disabled = false;
                return;
            }

            const [hours, minutes] = optionValue.split(':').map((value) => Number(value));
            const optionMinutes = (Number(hours) * 60) + Number(minutes);
            const shouldDisable = isToday && Number.isFinite(optionMinutes) && optionMinutes < currentMinutes;
            option.disabled = shouldDisable;
            hasEnabledTime = hasEnabledTime || !shouldDisable;
        });

        const currentSelectedOption = pickupInput.options[pickupInput.selectedIndex];
        if (pickupInput.value && (!currentSelectedOption || currentSelectedOption.disabled)) {
            pickupInput.value = '';
            syncPerDayReturnWithPickup();
        }

        if (!hasEnabledTime && pickupInput.value) {
            pickupInput.value = '';
            syncPerDayReturnWithPickup();
        }

        const placeholderOption = pickupInput.options[0];
        if (placeholderOption && !placeholderOption.value) {
            placeholderOption.textContent = hasEnabledTime
                ? 'Select time'
                : 'No time slots available today';
        }

        if (typeof pickupInput._refreshCustomTimeDropdown === 'function') {
            pickupInput._refreshCustomTimeDropdown();
        }
    };

    setDateInputValue(startInput, '');
    setDateInputValue(endInput, '');
    pickupInput.value = '';
    returnInput.value = '';
    setDateInputMinValue(endInput, getMinReturnDate());
    updatePickupTimeConstraints();

    const handlePerdayDateUpdate = () => {
        updatePickupTimeConstraints();
        refreshPerDayDaysInfo();
        if (currentBookingMode === 'perday' && typeof updatePriceDisplay === 'function') {
            updatePriceDisplay();
        }

        if (pickupInput.value) {
            fetchPerdayItemAvailability();
        } else {
            resetPerdayAvailabilityState();
        }

        if (typeof window.scheduleBookingFormDraftSave === 'function') {
            window.scheduleBookingFormDraftSave();
        }
    };

    const handlePickupTimeUpdate = () => {
        handlePerdayPickupTimeChange();
    };

    startInput.addEventListener('change', () => {
        const dynamicMinReturnDate = getMinReturnDate();
        setDateInputMinValue(endInput, dynamicMinReturnDate);
        if (endInput.value && endInput.value < dynamicMinReturnDate) {
            setDateInputValue(endInput, dynamicMinReturnDate, { triggerChange: true });
        }

        syncPerDayReturnWithPickup();
        handlePerdayDateUpdate();
    });

    endInput.addEventListener('change', handlePerdayDateUpdate);

    pickupInput.addEventListener('change', handlePickupTimeUpdate);

    syncPerDayReturnWithPickup();

    refreshPerDayDaysInfo();
    updatePickupTimeConstraints();
    if (pickupInput.value) {
        fetchPerdayItemAvailability();
    } else {
        resetPerdayAvailabilityState();
    }
};

const isQuantityControlEnabled = (item) => {
    if (item?.quantityEnabled === true) return true;
    if (item?.quantityEnabled === false) return false;
    if (item.isRequired) return false;
    if (item.rentalType === 'perday') return true;
    if (item.rentalType === 'persession') return true;
    if (item.rentalType === 'pertrack') return true;
    if (item.price === 0) return true;
    if ((item.name || '').includes('IEM')) return true;
    return false;
};

const buildRentalOptionHTML = (item, mode) => {
    const showQuantity = isQuantityControlEnabled(item);
    const priceUnit = item.rentalType === 'perday'
        ? '/day'
        : item.rentalType === 'persession'
            ? '/session'
            : item.rentalType === 'pertrack'
                ? '/track'
                : '/hr';
    const defaultChecked = item.isRequired ? 'checked' : '';
    const defaultDisabled = item.isRequired ? 'disabled' : '';
    const selectedClass = item.isRequired ? ' selected' : '';
    const hasDescription = String(item.description || '').trim().length > 0;

    return `
        <div class="rental-option ${item.isRequired ? 'base' : 'child'}${selectedClass}" data-rental-id="${item.key}" data-rental-mode="${mode}" onclick="if(!event.target.closest('.quantity-btn') && event.target.type !== 'checkbox' && !event.target.closest('.rental-details')){const cb=this.querySelector('.rental-checkbox');if(!cb.disabled){cb.checked=!cb.checked;toggleRental('${item.key}','${mode}');}}">
            <input type="checkbox" class="rental-checkbox" ${defaultChecked} ${defaultDisabled} onchange="toggleRental('${item.key}', '${mode}')">
            <div class="rental-meta">
                <div class="rental-name">${item.name}</div>
                <div class="rental-price">${item.price === 0 ? '' : `₹${item.price}${priceUnit}`}</div>
            </div>
            <div class="rental-qty">
                ${showQuantity
                    ? `<div class="quantity-controls">
                           <button type="button" class="quantity-btn" onclick="updateQuantity('${item.key}', -1, '${mode}')">−</button>
                           <span class="quantity-display">1</span>
                           <button type="button" class="quantity-btn" onclick="updateQuantity('${item.key}', 1, '${mode}')">+</button>
                       </div>`
                    : ''}
            </div>
            ${hasDescription
                ? `<details class="rental-details">
                       <summary>Details</summary>
                       <div class="rental-description">${item.description}</div>
                   </details>`
                : ''}
        </div>
    `;
};

const renderRentalSection = (container, title, items, mode, { collapsedByDefault = true } = {}) => {
    if (!container) return;

    const section = document.createElement('details');
    section.className = 'rental-category';
    if (!collapsedByDefault) {
        section.open = true;
    }

    const header = document.createElement('summary');
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

    if (subItems.some((subItem) => normalizeRentalType(subItem?.rentalType) === 'pertrack')) {
        return 'pertrack';
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

            const isFlexibleRentalType = (type) => type === 'persession' || type === 'pertrack';
            const isValidPair = leftRentalType === rightRentalType
                || isFlexibleRentalType(leftRentalType)
                || isFlexibleRentalType(rightRentalType);
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

const getClassConfig = () => {
    const source = settings?.classConfig || {};
    const fallbackCategoryKeywords = ['class', 'guitar class', 'keyboard class', 'music class'];
    const fallbackLocations = [String(settings?.studioName || 'Studio').trim()].filter(Boolean);
    const fallbackPlanOptionsMonths = [1];

    const categoryKeywords = Array.isArray(source.categoryKeywords) && source.categoryKeywords.length > 0
        ? source.categoryKeywords
        : fallbackCategoryKeywords;

    const locations = Array.isArray(source.locations) && source.locations.length > 0
        ? source.locations
        : fallbackLocations;

    const planOptionsMonths = (Array.isArray(source.planOptionsMonths) && source.planOptionsMonths.length > 0
        ? source.planOptionsMonths
        : fallbackPlanOptionsMonths)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 1 && value <= 24)
        .sort((a, b) => a - b);

    const multiMonthDiscounts = (Array.isArray(source.multiMonthDiscounts) ? source.multiMonthDiscounts : [])
        .map((entry) => ({
            months: Number(entry?.months),
            discountPercent: Math.max(0, Number(entry?.discountPercent || 0)),
            discountAmount: Math.max(0, Number(entry?.discountAmount || 0))
        }))
        .filter((entry) => Number.isFinite(entry.months) && entry.months >= 1 && entry.months <= 24)
        .sort((a, b) => a.months - b.months);

    return {
        enabled: source.enabled !== false,
        monthlyFee: Math.max(0, Number(source.monthlyFee || 2000)),
        classesPerMonth: Math.max(1, Number(source.classesPerMonth || 4)),
        weeksPerMonthWindow: Math.max(1, Number(source.weeksPerMonthWindow || 5)),
        sessionDurationHours: Math.max(1, Number(source.sessionDurationHours || 1)),
        allowOnlySingleClassItem: source.allowOnlySingleClassItem !== false,
        planOptionsMonths,
        multiMonthDiscounts,
        categoryKeywords: categoryKeywords.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean),
        locations: locations.map((value) => String(value || '').trim()).filter(Boolean)
    };
};

const addDays = (dateValue, daysToAdd) => {
    const result = new Date(dateValue);
    result.setDate(result.getDate() + Number(daysToAdd || 0));
    return result;
};

const formatYmd = (dateValue) => {
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getClassDiscountForMonths = (months, classConfig, totalFeeBeforeDiscount = 0) => {
    const selectedMonths = Number(months);
    if (!Number.isFinite(selectedMonths) || selectedMonths < 1) return 0;
    const match = (Array.isArray(classConfig?.multiMonthDiscounts) ? classConfig.multiMonthDiscounts : [])
        .find((entry) => Number(entry?.months) === selectedMonths);

    if (match) {
        const percent = Math.max(0, Number(match.discountPercent || 0));
        if (percent > 0) {
            return Math.round(Math.max(0, Number(totalFeeBeforeDiscount || 0)) * (percent / 100));
        }

        return Math.max(0, Number(match.discountAmount || 0));
    }

    return 0;
};

const refreshClassPlanInfoUI = () => {
    const classPlanMonthsEl = document.getElementById('classPlanMonths');
    const bookingDateEl = document.getElementById('bookingDate');
    const infoTextEl = document.getElementById('classPlanInfoText');
    const discountHintEl = document.getElementById('classDiscountHint');
    if (!classPlanMonthsEl || !infoTextEl || !discountHintEl) return;

    const classConfig = getClassConfig();
    const planMonths = Math.max(1, Number(classPlanMonthsEl.value || 1));
    const classesPerMonth = Math.max(1, Number(classConfig.classesPerMonth || 4));
    const totalClasses = classesPerMonth * planMonths;
    const totalBeforeDiscount = classConfig.monthlyFee * planMonths;
    const discountAmount = getClassDiscountForMonths(planMonths, classConfig, totalBeforeDiscount);
    const totalAfterDiscount = Math.max(0, totalBeforeDiscount - discountAmount);

    const discountEntry = (Array.isArray(classConfig.multiMonthDiscounts) ? classConfig.multiMonthDiscounts : [])
        .find((entry) => Number(entry?.months) === planMonths);
    const discountPercent = discountEntry
        ? Math.max(0, Number(discountEntry.discountPercent || 0))
        : 0;

    const startDate = bookingDateEl?.value ? new Date(`${bookingDateEl.value}T00:00:00`) : new Date();
    const endDate = addDays(startDate, planMonths * classConfig.weeksPerMonthWindow * 7);

    infoTextEl.textContent = `${classesPerMonth}/month (${totalClasses} total) | ${formatYmd(startDate)} to ${formatYmd(endDate)}`;
    discountHintEl.textContent = discountAmount > 0
        ? `${discountPercent}% off (₹${discountAmount}) | Pay now: ₹${totalAfterDiscount}`
        : `Fee: ₹${totalBeforeDiscount}`;
};

const isClassBookingCategory = (categoryName) => {
    const selectedCategory = String(categoryName || '').trim().toLowerCase();
    if (!selectedCategory) return false;

    const classConfig = getClassConfig();
    if (!classConfig.enabled) return false;

    return classConfig.categoryKeywords.some((keyword) => selectedCategory.includes(keyword));
};

const isPerTrackBookingCategory = (categoryName) => {
    const selectedCategory = String(categoryName || '').trim();
    if (!selectedCategory) return false;

    const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];
    const matchedType = rentalTypes.find((type) => String(type?.name || '').trim() === selectedCategory);
    if (!matchedType) return false;

    if (getCategoryRentalType(matchedType) !== 'pertrack') return false;

    // If this per-track category is bound to a session-type category, it operates within
    // a session context and still needs date/time scheduling.
    const sessionTypes = new Set(['persession', 'inhouse']);
    const isBoundToSession = getConfiguredBindingPairs().some((pair) => {
        if (pair.leftCategory === selectedCategory) return sessionTypes.has(pair.rightRentalType);
        if (pair.rightCategory === selectedCategory) return sessionTypes.has(pair.leftRentalType);
        return false;
    });
    if (isBoundToSession) return false;

    return true;
};

const refreshHourlySchedulingVisibility = () => {
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    const shouldHideHourlySchedule = currentBookingMode === 'hourly' && isPerTrackBookingCategory(bookingType);

    const hourlyDateGroup = document.getElementById('hourlyDateGroup');
    const hourlyAvailabilityView = document.getElementById('hourlyAvailabilityView');
    const hourlyTimeContainer = document.getElementById('hourlyTimeContainer');
    const bookingDateInput = document.getElementById('bookingDate');
    const startTimeInput = document.getElementById('startTime');
    const startTimeLabel = document.getElementById('startTimeLabel');
    const timeline = document.getElementById('referenceTimeline');

    if (hourlyDateGroup) hourlyDateGroup.style.display = shouldHideHourlySchedule ? 'none' : '';
    if (hourlyAvailabilityView) hourlyAvailabilityView.style.display = shouldHideHourlySchedule ? 'none' : '';
    if (hourlyTimeContainer) hourlyTimeContainer.style.display = shouldHideHourlySchedule ? 'none' : '';

    if (startTimeLabel) {
        if (shouldHideHourlySchedule) {
            startTimeLabel.textContent = 'Track*';
        } else {
            startTimeLabel.textContent = isClassBookingCategory(bookingType) ? 'Class Time*' : 'Time*';
        }
    }

    if (shouldHideHourlySchedule) {
        if (bookingDateInput) bookingDateInput.required = false;
        if (startTimeInput) {
            startTimeInput.required = false;
            startTimeInput.disabled = true;
            startTimeInput.value = '';
        }
        if (timeline) {
            timeline.innerHTML = '<div class="booking-theme-status booking-theme-status-muted">No schedule needed for per-track.</div>';
        }
        window.currentAvailabilityData = null;
        return;
    }

    if (bookingDateInput) bookingDateInput.required = true;
    if (startTimeInput) {
        startTimeInput.required = true;
        startTimeInput.disabled = !bookingDateInput?.value;
    }
};

const refreshClassLocationUI = () => {
    const groupEl = document.getElementById('classLocationGroup');
    const selectEl = document.getElementById('classLocation');
    const classPlanMonthsGroupEl = document.getElementById('classPlanMonthsGroup');
    const classPlanMonthsEl = document.getElementById('classPlanMonths');
    const classPlanInfoGroupEl = document.getElementById('classPlanInfoGroup');
    const classPreferredWeekdayGroupEl = document.getElementById('classPreferredWeekdayGroup');
    const classPreferredWeekdayEl = document.getElementById('classPreferredWeekday');
    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';

    if (!groupEl || !selectEl) return;

    const classConfig = getClassConfig();
    const shouldShow = isClassBookingCategory(bookingType);
    const options = classConfig.locations;
    const previousValue = String(selectEl.value || '').trim();

    selectEl.innerHTML = [
        '<option value="">Select location</option>',
        ...options.map((location) => `<option value="${location}">${location}</option>`)
    ].join('');

    if (previousValue && options.includes(previousValue)) {
        selectEl.value = previousValue;
    }

    if (!shouldShow) {
        groupEl.style.display = 'none';
        groupEl.classList.add('booking-hidden-initial');
        selectEl.required = false;
        selectEl.value = '';

        if (classPlanMonthsGroupEl) {
            classPlanMonthsGroupEl.style.display = 'none';
            classPlanMonthsGroupEl.classList.add('booking-hidden-initial');
        }
        if (classPlanMonthsEl) {
            classPlanMonthsEl.required = false;
            classPlanMonthsEl.value = '1';
        }
        if (classPlanInfoGroupEl) {
            classPlanInfoGroupEl.style.display = 'none';
            classPlanInfoGroupEl.classList.add('booking-hidden-initial');
        }
        if (classPreferredWeekdayGroupEl) {
            classPreferredWeekdayGroupEl.style.display = 'none';
            classPreferredWeekdayGroupEl.classList.add('booking-hidden-initial');
        }
        if (classPreferredWeekdayEl) {
            classPreferredWeekdayEl.required = false;
            classPreferredWeekdayEl.value = '';
        }
    } else {
        groupEl.style.display = 'block';
        groupEl.classList.remove('booking-hidden-initial');
        selectEl.required = true;

        if (classPlanMonthsEl) {
            const selectedValue = String(classPlanMonthsEl.value || '').trim();
            classPlanMonthsEl.innerHTML = classConfig.planOptionsMonths
                .map((months) => `<option value="${months}">${months} Month${months > 1 ? 's' : ''}</option>`)
                .join('');

            if (selectedValue && classConfig.planOptionsMonths.includes(Number(selectedValue))) {
                classPlanMonthsEl.value = selectedValue;
            }

            classPlanMonthsEl.required = true;
        }

        if (classPlanMonthsGroupEl) {
            classPlanMonthsGroupEl.style.display = 'block';
            classPlanMonthsGroupEl.classList.remove('booking-hidden-initial');
        }
        if (classPlanInfoGroupEl) {
            classPlanInfoGroupEl.style.display = 'block';
            classPlanInfoGroupEl.classList.remove('booking-hidden-initial');
        }
        if (classPreferredWeekdayGroupEl) {
            classPreferredWeekdayGroupEl.style.display = 'block';
            classPreferredWeekdayGroupEl.classList.remove('booking-hidden-initial');
        }
        if (classPreferredWeekdayEl) {
            classPreferredWeekdayEl.required = true;
        }
        // Pre-populate startTime with all class time slots (no availability filter needed)
        const startTimeSelectEl = document.getElementById('startTime');
        if (startTimeSelectEl) {
            const prevVal = startTimeSelectEl.value;
            startTimeSelectEl.innerHTML = '<option value="">Pick class time</option>';
            (window.allTimeSlots || []).forEach(slot => {
                const opt = document.createElement('option');
                opt.value = slot.value;
                opt.textContent = slot.label;
                startTimeSelectEl.appendChild(opt);
            });
            startTimeSelectEl.disabled = false;
            if (prevVal) startTimeSelectEl.value = prevVal;
        }

        refreshClassPlanInfoUI();
    }

    // For class bookings, rename start-time label.
    const startTimeLabel = document.getElementById('startTimeLabel');

    if (startTimeLabel) {
        startTimeLabel.textContent = shouldShow ? 'Class Time*' : 'Time*';
    }

    refreshHourlySchedulingVisibility();
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
                description: type.description || '',
                price: toNumber(type.basePrice, 0),
                rentalType: categoryRentalType,
                isRequired: false,
                quantityEnabled: type.quantityEnabled === true,
                maxQuantity: getRentalMaxQuantity(type)
            });
        }

        if (!hasSubItems) {
            if (typeName !== 'JamRoom' && toNumber(type.basePrice, 0) > 0) {
                addGroupedItem(categoryMode === 'perday' ? perdayGroups : hourlyGroups, typeName, {
                    key: `${typeName}__${typeName}`,
                    name: typeName,
                    category: typeName,
                    description: type.description || '',
                    price: toNumber(type.basePrice, 0),
                    rentalType: categoryRentalType,
                    isRequired: false,
                    quantityEnabled: type.quantityEnabled === true,
                    maxQuantity: getRentalMaxQuantity(type)
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
                isRequired: false,
                quantityEnabled: subItem.quantityEnabled === true,
                maxQuantity: getRentalMaxQuantity(subItem, getRentalMaxQuantity(type))
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

    const getPerdayItemsForCategory = (categoryName) => {
        const perdayItems = perdayGroups.get(categoryName) || [];
        if (activeMode !== 'perday') {
            return perdayItems;
        }

        const sessionItems = (hourlyGroups.get(categoryName) || [])
            .filter((item) => item.rentalType === 'persession' || item.rentalType === 'pertrack');

        return [...perdayItems, ...sessionItems];
    };

    const hasAnyHourlyItems = categoriesToRender.some((categoryName) => (hourlyGroups.get(categoryName) || []).length > 0);
    const hasAnyPerdayItems = categoriesToRender.some((categoryName) => getPerdayItemsForCategory(categoryName).length > 0);

    if (!hasAnyHourlyItems) {
        hourlyContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No catalog items configured for this category.</p>';
    } else {
        categoriesToRender.forEach((categoryName) => {
            const categoryItems = uniqueByKey(hourlyGroups.get(categoryName) || []);
            if (categoryItems.length === 0) return;
            renderRentalSection(
                hourlyContainer,
                `${categoryName} Catalog Items`,
                categoryItems,
                'hourly',
                { collapsedByDefault: true }
            );
        });
    }

    if (!hasAnyPerdayItems) {
        perdayContainer.innerHTML = '<p class="booking-empty-message booking-empty-padded">No catalog items configured for this category.</p>';
    } else {
        categoriesToRender.forEach((categoryName) => {
            const categoryItems = uniqueByKey(getPerdayItemsForCategory(categoryName));
            if (categoryItems.length === 0) return;
            renderRentalSection(
                perdayContainer,
                `${categoryName} Catalog Items`,
                categoryItems,
                'perday',
                { collapsedByDefault: true }
            );
        });
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

    refreshClassLocationUI();
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

const getJamRoomBaseItemForHourly = () => {
    const jamRoomBaseKey = 'JamRoom_base';
    const jamRoomBaseItem = rentalCatalog.hourly?.get(jamRoomBaseKey);
    if (!jamRoomBaseItem) return null;

    const jamRoomBaseDiv = document.querySelector('[data-rental-id="JamRoom_base"][data-rental-mode="hourly"]');
    const jamRoomBaseCheckbox = jamRoomBaseDiv?.querySelector('.rental-checkbox');
    if (!jamRoomBaseDiv || !jamRoomBaseCheckbox) return null;

    return {
        key: jamRoomBaseKey,
        item: jamRoomBaseItem,
        div: jamRoomBaseDiv,
        checkbox: jamRoomBaseCheckbox
    };
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

    const bookingType = document.getElementById('bookingTypeSelect')?.value || '';
    const classConfig = getClassConfig();
    const isSingleClassSelectionMode = mode === 'hourly'
        && classConfig.allowOnlySingleClassItem
        && isClassBookingCategory(bookingType);
    const isJamRoomHourlyFlow = mode === 'hourly' && String(activeBookingCategory || '').trim() === 'JamRoom';
    const jamRoomBase = isJamRoomHourlyFlow ? getJamRoomBaseItemForHourly() : null;
    const isJamRoomBaseToggle = Boolean(jamRoomBase && jamRoomBase.key === rentalKey);

    if (checkbox.checked) {
        if (jamRoomBase && !isJamRoomBaseToggle && !jamRoomBase.checkbox.checked) {
            jamRoomBase.checkbox.checked = true;
            selectedMap.set(jamRoomBase.key, buildSelectedRentalEntry(jamRoomBase.item, jamRoomBase.key, 1));
            jamRoomBase.div.classList.add('selected');
        }

        if (isSingleClassSelectionMode) {
            selectedMap.forEach((_value, existingKey) => {
                if (existingKey === rentalKey) return;

                selectedMap.delete(existingKey);
                const existingDiv = document.querySelector(`[data-rental-id="${existingKey}"][data-rental-mode="${mode}"]`);
                const existingCheckbox = existingDiv?.querySelector('.rental-checkbox');
                if (existingCheckbox) existingCheckbox.checked = false;
                if (existingDiv) existingDiv.classList.remove('selected');
            });
        }

        selectedMap.set(rentalKey, buildSelectedRentalEntry(item, rentalKey, 1));
        rentalDiv.classList.add('selected');
    } else {
        if (jamRoomBase && isJamRoomBaseToggle) {
            const hasDependentSelections = [...selectedMap.keys()].some((selectedKey) => selectedKey !== jamRoomBase.key);
            if (hasDependentSelections) {
                checkbox.checked = true;
                selectedMap.set(jamRoomBase.key, buildSelectedRentalEntry(item, rentalKey, 1));
                rentalDiv.classList.add('selected');
                showAlert('Base JamRoom must remain selected while other hourly items are selected.', 'error');
                return;
            }
        }

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
    if (!selectedMap.has(rentalKey)) {
        const catalogItem = rentalCatalog[mode]?.get(rentalKey);
        const itemName = catalogItem?.name || 'this item';
        showAlert(`Please select ${itemName} before changing quantity.`, 'warning');
        return;
    }

    const rental = selectedMap.get(rentalKey);
    if (rental.isRequired) return;

    if (mode === 'hourly' && rental.rentalType === 'inhouse' && rental.price > 0 && !rental.name.includes('IEM')) {
        return;
    }

    const maxLimit = getRentalMaxQuantity(rental);
    const requestedQuantity = (Number(rental.quantity) || 1) + change;
    if (change > 0 && requestedQuantity > maxLimit) {
        showAlert(`Maximum quantity for ${rental.name} is ${maxLimit}.`, 'warning');
    }

    const newQuantity = Math.max(1, Math.min(maxLimit, requestedQuantity));
    if (newQuantity === rental.quantity) {
        return;
    }

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
window.isClassBookingCategory = isClassBookingCategory;
window.refreshClassLocationUI = refreshClassLocationUI;
window.getClassConfig = getClassConfig;
window.refreshClassPlanInfoUI = refreshClassPlanInfoUI;
window.getClassDiscountForMonths = getClassDiscountForMonths;
window.isPerTrackBookingCategory = isPerTrackBookingCategory;
