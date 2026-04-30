'use strict';

const mongoose = require('mongoose');
require('dotenv').config();

const AdminSettings = require('./models/AdminSettings');

const APPLY = process.argv.includes('--apply');

const TARGET_CATEGORY = {
    name: 'Sound Equipment Rentals',
    description: 'Sound reinforcement equipment available for full-day rental. Ideal for gigs, rehearsals, events, shoots, and off-site productions.',
    rentalType: 'perday',
    basePrice: 0,
    maxQuantity: 12,
    quantityEnabled: true,
    alwaysChargeBase: false,
    subItems: [
        {
            name: 'Zoom LiveTrak L-12 Digital Mixer',
            description: '12-channel digital mixer/recorder for live sound, rehearsal, and production.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 1,
            quantityEnabled: true
        },
        {
            name: 'QSC CP8 Speaker',
            description: 'Powered PA speaker suitable for small to medium venue reinforcement.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 2,
            quantityEnabled: true
        },
        {
            name: 'Microphone',
            description: 'General-purpose stage/vocal microphone.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 5,
            quantityEnabled: true
        },
        {
            name: 'Microphone Stand',
            description: 'Adjustable microphone stand.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 2,
            quantityEnabled: true
        },
        {
            name: 'Notation Stand',
            description: 'Music notation/sheet stand.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 1,
            quantityEnabled: true
        },
        {
            name: 'Speaker Stand',
            description: 'Tripod speaker stand for PA speakers.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 2,
            quantityEnabled: true
        },
        {
            name: 'XLR Cable',
            description: 'Balanced XLR cable for microphones and mixer connections.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 12,
            quantityEnabled: true
        },
        {
            name: 'Audio Jack / Instrument Cable',
            description: 'Instrument/audio jack cable for line-level connections.',
            price: 0,
            rentalType: 'perday',
            perdayPrice: 1,
            maxQuantity: 12,
            quantityEnabled: true
        }
    ]
};

const normalizeName = (value) => String(value || '').trim().toLowerCase();

const ensureArray = (value) => (Array.isArray(value) ? value : []);

function describePlan(plan) {
    console.log('\n=== Sound Equipment Catalog Patch Plan ===');
    console.log(`Mode: ${APPLY ? 'APPLY (writes to MongoDB)' : 'PREVIEW (no DB writes)'}`);
    console.log(`Category: ${TARGET_CATEGORY.name}`);

    if (plan.createSettings) {
        console.log('- Will create AdminSettings document (none exists yet).');
    }

    if (plan.addCategory) {
        console.log(`- Will add category '${TARGET_CATEGORY.name}' with ${TARGET_CATEGORY.subItems.length} items.`);
    } else {
        console.log(`- Category '${TARGET_CATEGORY.name}' already exists.`);

        if (plan.categoryFieldUpdates.length > 0) {
            console.log('- Will update category fields:');
            plan.categoryFieldUpdates.forEach((entry) => {
                console.log(`  - ${entry.field}: ${entry.from} -> ${entry.to}`);
            });
        } else {
            console.log('- No category-level field changes needed.');
        }

        if (plan.itemsToAdd.length > 0) {
            console.log('- Will add missing items:');
            plan.itemsToAdd.forEach((item) => {
                console.log(`  - ${item.name} (maxQty ${item.maxQuantity})`);
            });
        } else {
            console.log('- No missing items to add.');
        }

        if (plan.itemFieldUpdates.length > 0) {
            console.log('- Will update existing item fields:');
            plan.itemFieldUpdates.forEach((entry) => {
                console.log(`  - ${entry.itemName}.${entry.field}: ${entry.from} -> ${entry.to}`);
            });
        } else {
            console.log('- No existing item field updates needed.');
        }
    }
}

function buildPlan(settingsDoc) {
    const plan = {
        createSettings: false,
        addCategory: false,
        categoryFieldUpdates: [],
        itemsToAdd: [],
        itemFieldUpdates: []
    };

    if (!settingsDoc) {
        plan.createSettings = true;
        plan.addCategory = true;
        return plan;
    }

    const rentalTypes = ensureArray(settingsDoc.rentalTypes);
    const categoryIndex = rentalTypes.findIndex((rt) => normalizeName(rt && rt.name) === normalizeName(TARGET_CATEGORY.name));

    if (categoryIndex < 0) {
        plan.addCategory = true;
        return plan;
    }

    const existingCategory = rentalTypes[categoryIndex] || {};
    const categoryFields = ['description', 'rentalType', 'basePrice', 'maxQuantity', 'quantityEnabled', 'alwaysChargeBase'];

    categoryFields.forEach((field) => {
        const current = existingCategory[field];
        const desired = TARGET_CATEGORY[field];

        if (current !== desired) {
            plan.categoryFieldUpdates.push({
                field,
                from: JSON.stringify(current),
                to: JSON.stringify(desired)
            });
        }
    });

    const existingItems = ensureArray(existingCategory.subItems);
    const existingItemMap = new Map(existingItems.map((item) => [normalizeName(item && item.name), item]));

    TARGET_CATEGORY.subItems.forEach((desiredItem) => {
        const key = normalizeName(desiredItem.name);
        const existingItem = existingItemMap.get(key);

        if (!existingItem) {
            plan.itemsToAdd.push(desiredItem);
            return;
        }

        ['description', 'rentalType', 'perdayPrice', 'maxQuantity', 'quantityEnabled'].forEach((field) => {
            const current = existingItem[field];
            const desired = desiredItem[field];
            if (current !== desired) {
                plan.itemFieldUpdates.push({
                    itemName: desiredItem.name,
                    field,
                    from: JSON.stringify(current),
                    to: JSON.stringify(desired)
                });
            }
        });
    });

    return plan;
}

function applyPlan(settingsDoc, plan) {
    let settings = settingsDoc;

    if (!settings) {
        settings = new AdminSettings({
            rentalTypes: [],
            adminEmails: []
        });
    }

    if (!Array.isArray(settings.rentalTypes)) {
        settings.rentalTypes = [];
    }

    const categoryIndex = settings.rentalTypes.findIndex((rt) => normalizeName(rt && rt.name) === normalizeName(TARGET_CATEGORY.name));

    if (categoryIndex < 0) {
        settings.rentalTypes.push(TARGET_CATEGORY);
        return settings;
    }

    const category = settings.rentalTypes[categoryIndex];
    category.description = TARGET_CATEGORY.description;
    category.rentalType = TARGET_CATEGORY.rentalType;
    category.basePrice = TARGET_CATEGORY.basePrice;
    category.maxQuantity = TARGET_CATEGORY.maxQuantity;
    category.quantityEnabled = TARGET_CATEGORY.quantityEnabled;
    category.alwaysChargeBase = TARGET_CATEGORY.alwaysChargeBase;

    if (!Array.isArray(category.subItems)) {
        category.subItems = [];
    }

    const itemMap = new Map(category.subItems.map((item) => [normalizeName(item && item.name), item]));

    TARGET_CATEGORY.subItems.forEach((desiredItem) => {
        const existing = itemMap.get(normalizeName(desiredItem.name));

        if (!existing) {
            category.subItems.push(desiredItem);
            return;
        }

        existing.description = desiredItem.description;
        existing.rentalType = desiredItem.rentalType;
        existing.perdayPrice = desiredItem.perdayPrice;
        existing.maxQuantity = desiredItem.maxQuantity;
        existing.quantityEnabled = desiredItem.quantityEnabled;

        if (typeof existing.price !== 'number') {
            existing.price = desiredItem.price;
        }

        
    });

    return settings;
}

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const settings = await AdminSettings.findOne();
        const plan = buildPlan(settings);

        describePlan(plan);

        if (!APPLY) {
            console.log('\nPreview complete. No changes were written.');
            process.exit(0);
        }

        const updatedSettings = applyPlan(settings, plan);
        await updatedSettings.save();

        console.log('\nApplied successfully to MongoDB.');
        console.log(`Category '${TARGET_CATEGORY.name}' is now present and ready for booking.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('\nFailed to process sound equipment catalog patch:', error);
        try {
            await mongoose.disconnect();
        } catch (disconnectError) {
            // Best effort cleanup.
        }
        process.exit(1);
    }
})();
