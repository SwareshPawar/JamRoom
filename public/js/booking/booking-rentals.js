/**
 * Booking rental selection module.
 */

// Load settings using shared API
const loadSettings = async () => {
    try {
        console.log('Loading booking settings...');
        // Booking page should use public booking settings, not admin-only settings.
        const res = await fetch(`${API_URL}/api/bookings/settings`);
        const data = await res.json();

        if (res.ok && data.success && data.settings) {
            settings = data.settings;
            window.adminSettings = settings; // For GST calculations

            console.log('Settings loaded:', settings);
            console.log('Rental types count:', settings?.rentalTypes?.length);
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

// Populate rental types with multiple selection interface
const populateRentalTypes = () => {
    const container = document.getElementById('rentalsList');
    container.innerHTML = '';
    selectedRentals = new Map();

    console.log('populateRentalTypes called, settings:', settings);

    if (settings && settings.rentalTypes) {
        console.log('Found rental types:', settings.rentalTypes);
        settings.rentalTypes.forEach((type, index) => {
            console.log(`Processing rental type ${index}:`, type);
            console.log('Has subItems:', type.subItems, 'Length:', type.subItems?.length);

            const hasSubItems = type.subItems && type.subItems.length > 0;

            // Create collapsible category section
            const categorySection = document.createElement('div');
            categorySection.className = 'rental-category';
            categorySection.style.cssText = 'margin-bottom: 20px; border: 2px solid #e1e8ed; border-radius: 12px; background: #f8f9fa;';

            // Category header (clickable to toggle)
            const categoryHeader = document.createElement('div');
            categoryHeader.className = 'category-header';
            categoryHeader.style.cssText = 'padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px 10px 0 0; font-weight: 600;';
            categoryHeader.innerHTML = `
                <span>${type.name}</span>
                <span class="toggle-icon" style="font-size: 18px; font-weight: bold;">−</span>
            `;

            // Category content (collapsible)
            const categoryContent = document.createElement('div');
            categoryContent.className = 'category-content';
            categoryContent.style.cssText = 'padding: 15px; display: block;';

            categorySection.appendChild(categoryHeader);
            categorySection.appendChild(categoryContent);
            container.appendChild(categorySection);

            // Add click handler for toggle
            categoryHeader.addEventListener('click', () => {
                const content = categoryContent;
                const icon = categoryHeader.querySelector('.toggle-icon');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.textContent = '−';
                } else {
                    content.style.display = 'none';
                    icon.textContent = '+';
                }
            });

            if (hasSubItems) {
                // Add base category option (always charges base price)
                const baseCategoryDiv = document.createElement('div');
                baseCategoryDiv.className = 'rental-option base';
                baseCategoryDiv.dataset.rentalId = `${type.name}_base`;

                // Special handling for JamRoom base - no quantity controls
                const isJamRoomBase = type.name === 'JamRoom';

                baseCategoryDiv.innerHTML = `
                    <input type="checkbox" class="rental-checkbox" ${isJamRoomBase ? 'checked' : ''} onchange="toggleRental('${type.name}_base', ${type.basePrice}, '${(type.description || 'Base rental').replace(/'/g, "\\'")}', '${type.name}', true)">
                    <div class="rental-meta">
                        <div class="rental-name">${type.name} (Base)</div>
                        <div class="rental-description">${type.description || 'Base rental'} - ${isJamRoomBase ? 'Always 1 room' : 'Required category'}</div>
                        <div class="rental-price">₹${type.basePrice}/hr</div>
                    </div>
                    <div class="rental-qty">
                        ${!isJamRoomBase ? `
                            <div class="quantity-controls">
                                <button type="button" class="quantity-btn" onclick="updateQuantity('${type.name}_base', -1)">−</button>
                                <span class="quantity-display">1</span>
                                <button type="button" class="quantity-btn" onclick="updateQuantity('${type.name}_base', 1)">+</button>
                            </div>
                        ` : `
                            <div class="quantity-info centered">
                                Fixed: 1 room
                            </div>
                        `}
                    </div>
                `;
                categoryContent.appendChild(baseCategoryDiv);

                if (isJamRoomBase) {
                    selectedRentals.set(`${type.name}_base`, {
                        name: `${type.name} (Base)`,
                        fullId: `${type.name}_base`,
                        category: type.name,
                        description: type.description || 'Base rental',
                        basePrice: type.basePrice,
                        price: type.basePrice,
                        quantity: 1,
                        isRequired: true,
                        rentalType: 'inhouse',
                        perdayPrice: 0
                    });
                    baseCategoryDiv.classList.add('selected');
                }

                // Add each sub-item as an optional add-on
                type.subItems.forEach((subItem) => {
                    console.log(`Adding sub-item: ${subItem.name} - ₹${subItem.price}`);
                    const itemId = `${type.name}__${subItem.name}`;
                    const rentalDiv = document.createElement('div');
                    rentalDiv.className = 'rental-option child';
                    rentalDiv.dataset.rentalId = itemId;

                    const isPerday = subItem.rentalType === 'perday';
                    const displayPrice = isPerday ? subItem.perdayPrice || 0 : subItem.price || 0;
                    const priceUnit = isPerday ? '/day' : '/hr';

                    // Only show quantity controls for per-day rentals, free add-ons (price = 0), and IEM
                    // In-house rentals (except IEM) are tied to jamroom duration and shouldn't have separate quantity controls
                    const showQuantityControls = isPerday || displayPrice === 0 || subItem.name.includes('IEM');

                    rentalDiv.innerHTML = `
                        <input type="checkbox" class="rental-checkbox" onchange="toggleRental('${itemId}', ${displayPrice}, '${(subItem.description || type.description || '').replace(/'/g, "\\'")}', '${type.name}', false, '${subItem.rentalType || 'inhouse'}')">
                        <div class="rental-meta">
                            <div class="rental-name">${subItem.name}${isPerday ? ' (Per-day)' : displayPrice === 0 ? ' (Free add-on)' : ''}</div>
                            <div class="rental-description">${subItem.description || type.description || ''} ${displayPrice === 0 ? '(Free add-on)' : isPerday ? '(Independent pricing)' : '(Tied to jamroom duration)'}</div>
                            <div class="rental-price">${displayPrice === 0 ? 'FREE' : '₹' + displayPrice + priceUnit}</div>
                        </div>
                        <div class="rental-qty">
                            ${showQuantityControls ? `
                                <div class="quantity-controls">
                                    <button type="button" class="quantity-btn" onclick="updateQuantity('${itemId}', -1)">−</button>
                                    <span class="quantity-display">1</span>
                                    <button type="button" class="quantity-btn" onclick="updateQuantity('${itemId}', 1)">+</button>
                                </div>
                            ` : `
                                <div class="quantity-info">
                                    Tied to JamRoom duration
                                </div>
                            `}
                        </div>
                    `;

                    categoryContent.appendChild(rentalDiv);
                });
            } else {
                console.log(`Creating regular rental option for: ${type.name}`);
                // Regular rental type without sub-items
                const rentalDiv = document.createElement('div');
                rentalDiv.className = 'rental-option regular';
                rentalDiv.dataset.rentalId = type.name;
                rentalDiv.style.marginTop = '12px';

                rentalDiv.innerHTML = `
                    <input type="checkbox" class="rental-checkbox" onchange="toggleRental('${type.name}', ${type.basePrice}, '${(type.description || '').replace(/'/g, "\\'")}', null, false)">
                    <div class="rental-meta">
                        <div class="rental-name">${type.name}</div>
                        <div class="rental-description">${type.description || 'No description available'}</div>
                        <div class="rental-price">₹${type.basePrice}/hr</div>
                    </div>
                    <div class="rental-qty">
                        <div class="quantity-controls">
                            <button type="button" class="quantity-btn" onclick="updateQuantity('${type.name}', -1)">−</button>
                            <span class="quantity-display">1</span>
                            <button type="button" class="quantity-btn" onclick="updateQuantity('${type.name}', 1)">+</button>
                        </div>
                    </div>
                `;

                container.appendChild(rentalDiv);
            }
        });
    } else {
        container.innerHTML = '<p style="text-align: center; color: #6c757d; padding: 20px;">No rental options available. Please contact admin.</p>';
    }

    updatePriceDisplay();
};

// Toggle rental selection
const toggleRental = (rentalName, basePrice, description, category = null, isRequired = false, rentalType = 'inhouse') => {
    const rentalDiv = document.querySelector(`[data-rental-id="${rentalName}"]`);
    const checkbox = rentalDiv.querySelector('.rental-checkbox');

    // Extract display name (remove category prefix if present)
    const displayName = rentalName.includes('__') ? rentalName.split('__')[1] :
        rentalName.includes('_base') ? rentalName.replace('_base', ' (Base)') : rentalName;

    if (checkbox.checked) {
        selectedRentals.set(rentalName, {
            name: displayName,
            fullId: rentalName,
            category: category,
            description: description,
            basePrice: basePrice,
            price: basePrice, // This should be the correct price for both hourly and per-day
            quantity: 1,
            isRequired: isRequired,
            rentalType: rentalType, // Add rental type to track pricing model
            perdayPrice: basePrice // Store the per-day price for per-day items
        });
        console.log(`Added rental: ${rentalName}, price: ${basePrice}, rentalType: ${rentalType}`);
        rentalDiv.classList.add('selected');
    } else {
        selectedRentals.delete(rentalName);
        rentalDiv.classList.remove('selected');
        // Reset quantity to 1 (only if quantity display exists)
        const quantityDisplay = rentalDiv.querySelector('.quantity-display');
        if (quantityDisplay) {
            quantityDisplay.textContent = '1';
        }
    }

    updatePriceDisplay();
};

// Update quantity for a rental
const updateQuantity = (rentalName, change) => {
    if (!selectedRentals.has(rentalName)) return;

    const rental = selectedRentals.get(rentalName);

    // Skip quantity updates for JamRoom base (always 1) and paid in-house items
    // Allow free items (price = 0), per-day rentals, and IEM to have quantity controls
    if (rentalName === 'JamRoom_base') {
        return; // JamRoom base always stays at 1
    }

    // Allow quantity changes for free items (price = 0), per-day rentals, or IEM
    if (rental.rentalType === 'inhouse' && rental.price > 0 && !rentalName.includes('_base') && !rentalName.includes('IEM')) {
        return; // Paid in-house instruments (except IEM) don't have adjustable quantities
    }

    // Define maximum limits for specific items
    const maxLimits = {
        'JamRoom__Microphone': 4,
        'JamRoom__Audio Jacks': 4
    };

    const maxLimit = maxLimits[rentalName] || 99; // Default max of 99 if no specific limit
    const newQuantity = Math.max(1, Math.min(maxLimit, rental.quantity + change));

    rental.quantity = newQuantity;

    // Update display (only if quantity display exists)
    const rentalDiv = document.querySelector(`[data-rental-id="${rentalName}"]`);
    const quantityDisplay = rentalDiv?.querySelector('.quantity-display');
    if (quantityDisplay) {
        quantityDisplay.textContent = newQuantity;
    }

    updatePriceDisplay();
};

// Expose for inline handlers and cross-file usage.
window.loadSettings = loadSettings;
window.populateRentalTypes = populateRentalTypes;
window.toggleRental = toggleRental;
window.updateQuantity = updateQuantity;
