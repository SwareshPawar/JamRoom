'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const AdminSettings = require('../../models/AdminSettings');

const APPLY = process.argv.includes('--apply');
const WRITE_BACKUP = APPLY || process.argv.includes('--backup');

const CATEGORIES = {
    JAMROOM: 'JamRoom',
    PER_DAY: 'Per Day Rentals',
    RECORDING: 'Recording Session',
    MUSIC_PRODUCTION: 'Music Production',
    MIX_MASTER: 'Mix & Master',
    BGM_JINGLES: 'Background Music & Jingles',
    COMPOSITION: 'Composition & Arrangement'
};

const DEFAULT_COMPOSITION_PACKAGE = {
    name: CATEGORIES.COMPOSITION,
    description: 'Composition and arrangement service for songs and projects. Includes melody design, harmonic arrangement, and instrument planning.',
    rentalType: 'persession',
    basePrice: 4000,
    maxQuantity: 1,
    alwaysChargeBase: true,
    subItems: [
        {
            name: 'Melody Composition',
            description: 'Main melody creation for a complete song or theme.',
            price: 2500,
            rentalType: 'persession',
            perdayPrice: 0,
            maxQuantity: 1
        },
        {
            name: 'Arrangement Layering',
            description: 'Instrument arrangement and production layering for one composition.',
            price: 3000,
            rentalType: 'persession',
            perdayPrice: 0,
            maxQuantity: 1
        },
        {
            name: 'Song Structure Consultation',
            description: 'Guidance for intro, verse, chorus, bridge, and final structure.',
            price: 1500,
            rentalType: 'persession',
            perdayPrice: 0,
            maxQuantity: 1
        }
    ]
};

const normalizeRentalType = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'perday') return 'perday';
    if (normalized === 'persession') return 'persession';
    return 'inhouse';
};

const normalizeName = (value) => String(value || '').trim().toLowerCase();

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMaxQty = (value, fallback = 1) => {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.min(100, parsed);
};

const roundToNearest50 = (value) => {
    const amount = toNumber(value, 0);
    if (amount <= 0) return 0;
    return Math.max(50, Math.round(amount / 50) * 50);
};

const buildCategory = (category = {}, overrides = {}) => ({
    name: String(overrides.name || category.name || '').trim(),
    description: String(overrides.description || category.description || '').trim(),
    rentalType: normalizeRentalType(overrides.rentalType || category.rentalType || 'inhouse'),
    basePrice: toNumber(overrides.basePrice ?? category.basePrice, 0),
    maxQuantity: normalizeMaxQty(overrides.maxQuantity ?? category.maxQuantity, 1),
    alwaysChargeBase: overrides.alwaysChargeBase ?? category.alwaysChargeBase ?? true,
    subItems: []
});

const buildSubItem = (subItem = {}, forcedRentalType, overrides = {}) => ({
    name: String(overrides.name || subItem.name || '').trim(),
    description: String(overrides.description || subItem.description || '').trim(),
    price: Math.max(0, toNumber(overrides.price ?? subItem.price, 0)),
    rentalType: normalizeRentalType(forcedRentalType || overrides.rentalType || subItem.rentalType || 'inhouse'),
    perdayPrice: Math.max(0, toNumber(overrides.perdayPrice ?? subItem.perdayPrice, 0)),
    maxQuantity: normalizeMaxQty(overrides.maxQuantity ?? subItem.maxQuantity, 1)
});

const dedupeSubItems = (items = [], mode = 'inhouse') => {
    const map = new Map();

    items.forEach((item) => {
        const normalizedKey = normalizeName(item.name);
        if (!normalizedKey) return;

        const normalizedItem = buildSubItem(item, mode);
        const existing = map.get(normalizedKey);

        if (!existing) {
            map.set(normalizedKey, normalizedItem);
            return;
        }

        const merged = {
            ...existing,
            description: (String(existing.description || '').length >= String(normalizedItem.description || '').length)
                ? existing.description
                : normalizedItem.description,
            price: Math.max(toNumber(existing.price), toNumber(normalizedItem.price)),
            perdayPrice: Math.max(toNumber(existing.perdayPrice), toNumber(normalizedItem.perdayPrice)),
            maxQuantity: Math.max(normalizeMaxQty(existing.maxQuantity), normalizeMaxQty(normalizedItem.maxQuantity))
        };

        map.set(normalizedKey, merged);
    });

    return Array.from(map.values());
};

const buildCategoryLookup = (rentalTypes) => {
    const byName = new Map();
    (rentalTypes || []).forEach((category) => {
        const key = normalizeName(category?.name);
        if (!key) return;
        byName.set(key, category);
    });
    return byName;
};

const findBestPerdayPrice = (name, existingPerdayItems = []) => {
    const normalized = normalizeName(name);
    if (!normalized) return 0;

    const exact = existingPerdayItems.find((item) => normalizeName(item.name) === normalized);
    if (exact) return Math.max(0, toNumber(exact.perdayPrice, 0));

    const relaxed = normalized
        .replace(/arranger\s*/g, '')
        .replace(/\s*keyboard/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const fuzzy = existingPerdayItems.find((item) => {
        const existingName = normalizeName(item.name)
            .replace(/arranger\s*/g, '')
            .replace(/\s*keyboard/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        return existingName === relaxed;
    });

    return fuzzy ? Math.max(0, toNumber(fuzzy.perdayPrice, 0)) : 0;
};

const ensureSessionPackage = (existingLookup, packageName, template = null) => {
    const existing = existingLookup.get(normalizeName(packageName));
    if (existing) {
        return {
            ...buildCategory(existing, {
                name: packageName,
                rentalType: 'persession'
            }),
            subItems: dedupeSubItems(existing.subItems || [], 'persession')
        };
    }

    if (!template) {
        return {
            name: packageName,
            description: '',
            rentalType: 'persession',
            basePrice: 0,
            maxQuantity: 1,
            alwaysChargeBase: true,
            subItems: []
        };
    }

    return {
        ...buildCategory(template, { rentalType: 'persession' }),
        subItems: dedupeSubItems(template.subItems || [], 'persession')
    };
};

const addBindingPair = (pairs, catalogNameSet, leftCategory, rightCategory, leftRentalType, rightRentalType) => {
    if (!catalogNameSet.has(leftCategory) || !catalogNameSet.has(rightCategory)) {
        return;
    }

    pairs.push({
        leftCategory,
        rightCategory,
        leftRentalType,
        rightRentalType
    });
};

const printCatalogSummary = (title, categories) => {
    console.log(`\n${title}`);
    console.log('='.repeat(title.length));

    categories.forEach((category, index) => {
        const itemCount = Array.isArray(category.subItems) ? category.subItems.length : 0;
        console.log(`${index + 1}. ${category.name} | mode=${category.rentalType} | base=${category.basePrice} | subItems=${itemCount}`);
    });
};

const run = async () => {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI or MONGODB_URI is not set in environment');
    }

    await mongoose.connect(mongoUri);

    const settings = await AdminSettings.getSettings();
    const currentCatalog = Array.isArray(settings.rentalTypes) ? settings.rentalTypes : [];
    const currentBindings = Array.isArray(settings?.bookingCategoryBindings?.pairs)
        ? settings.bookingCategoryBindings.pairs
        : [];

    const lookup = buildCategoryLookup(currentCatalog);

    const inhouseCategories = currentCatalog.filter((category) => normalizeRentalType(category?.rentalType) === 'inhouse');
    const perdayCategory = lookup.get(normalizeName(CATEGORIES.PER_DAY));
    const recordingSessionCategory = lookup.get(normalizeName(CATEGORIES.RECORDING));

    const jamroomBase = lookup.get(normalizeName(CATEGORIES.JAMROOM));
    const jamroomSourceCategories = inhouseCategories.filter((category) => {
        const name = String(category?.name || '').trim();
        return name && normalizeName(name) !== normalizeName(CATEGORIES.RECORDING);
    });

    const jamroomItems = [];
    jamroomSourceCategories.forEach((category) => {
        const subItems = Array.isArray(category?.subItems) ? category.subItems : [];
        subItems.forEach((subItem) => {
            jamroomItems.push(buildSubItem(subItem, 'inhouse'));
        });
    });

    const jamroomCategory = {
        ...buildCategory(jamroomBase || {}, {
            name: CATEGORIES.JAMROOM,
            rentalType: 'inhouse',
            basePrice: toNumber(jamroomBase?.basePrice, 300),
            maxQuantity: normalizeMaxQty(jamroomBase?.maxQuantity, 1),
            alwaysChargeBase: jamroomBase?.alwaysChargeBase ?? true
        }),
        subItems: dedupeSubItems(jamroomItems, 'inhouse')
    };

    const existingPerdayItems = Array.isArray(perdayCategory?.subItems) ? perdayCategory.subItems : [];
    const mirroredPerdayItems = jamroomCategory.subItems
        .filter((subItem) => toNumber(subItem.price, 0) > 0)
        .map((subItem) => {
            const existingPerdayPrice = findBestPerdayPrice(subItem.name, existingPerdayItems);
            const computedPerdayPrice = existingPerdayPrice > 0
                ? existingPerdayPrice
                : roundToNearest50(toNumber(subItem.price, 0) * 8);

            return buildSubItem(subItem, 'perday', {
                price: 0,
                perdayPrice: computedPerdayPrice
            });
        });

    const mergedPerday = dedupeSubItems([
        ...mirroredPerdayItems,
        ...existingPerdayItems.map((item) => buildSubItem(item, 'perday'))
    ], 'perday').map((item) => ({
        ...item,
        price: 0,
        rentalType: 'perday',
        perdayPrice: Math.max(0, toNumber(item.perdayPrice, 0))
    }));

    const perdayCatalog = {
        ...buildCategory(perdayCategory || {}, {
            name: CATEGORIES.PER_DAY,
            rentalType: 'perday',
            basePrice: 0,
            maxQuantity: normalizeMaxQty(perdayCategory?.maxQuantity, 5),
            alwaysChargeBase: perdayCategory?.alwaysChargeBase ?? true
        }),
        subItems: mergedPerday
    };

    const recordingSession = recordingSessionCategory
        ? {
            ...buildCategory(recordingSessionCategory, {
                name: CATEGORIES.RECORDING,
                rentalType: 'inhouse'
            }),
            subItems: dedupeSubItems(recordingSessionCategory.subItems || [], 'inhouse')
        }
        : {
            name: CATEGORIES.RECORDING,
            description: 'Raw recording session in studio. Mixing/mastering not included.',
            rentalType: 'inhouse',
            basePrice: 500,
            maxQuantity: 1,
            alwaysChargeBase: true,
            subItems: []
        };

    const musicProduction = ensureSessionPackage(lookup, CATEGORIES.MUSIC_PRODUCTION);
    const mixMaster = ensureSessionPackage(lookup, CATEGORIES.MIX_MASTER);
    const bgmJingles = ensureSessionPackage(lookup, CATEGORIES.BGM_JINGLES);
    const composition = ensureSessionPackage(lookup, CATEGORIES.COMPOSITION, DEFAULT_COMPOSITION_PACKAGE);

    const nextCatalog = [
        jamroomCategory,
        perdayCatalog,
        recordingSession,
        musicProduction,
        mixMaster,
        bgmJingles,
        composition
    ];

    const catalogNameSet = new Set(nextCatalog.map((category) => category.name));
    const nextBindings = [];

    addBindingPair(nextBindings, catalogNameSet, CATEGORIES.JAMROOM, CATEGORIES.RECORDING, 'inhouse', 'inhouse');
    addBindingPair(nextBindings, catalogNameSet, CATEGORIES.MUSIC_PRODUCTION, CATEGORIES.MIX_MASTER, 'persession', 'persession');
    addBindingPair(nextBindings, catalogNameSet, CATEGORIES.MUSIC_PRODUCTION, CATEGORIES.COMPOSITION, 'persession', 'persession');
    addBindingPair(nextBindings, catalogNameSet, CATEGORIES.BGM_JINGLES, CATEGORIES.COMPOSITION, 'persession', 'persession');
    addBindingPair(nextBindings, catalogNameSet, CATEGORIES.COMPOSITION, CATEGORIES.MIX_MASTER, 'persession', 'persession');
    addBindingPair(nextBindings, catalogNameSet, CATEGORIES.RECORDING, CATEGORIES.MIX_MASTER, 'inhouse', 'persession');

    printCatalogSummary('Current catalog', currentCatalog);
    printCatalogSummary('Proposed realigned catalog', nextCatalog);

    const removedCategories = currentCatalog
        .map((category) => category.name)
        .filter((name) => !catalogNameSet.has(name));

    if (removedCategories.length) {
        console.log('\nCategories folded into package structure:');
        removedCategories.forEach((name) => console.log(`- ${name}`));
    }

    console.log(`\nBindings: ${currentBindings.length} -> ${nextBindings.length}`);

    if (!APPLY) {
        console.log('\nPreview mode only. No database changes applied.');
        console.log('Run: node scripts/catalog/realignBookingCatalog.js --apply');
        await mongoose.disconnect();
        return;
    }

    if (WRITE_BACKUP) {
        const backupDir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(backupDir, `catalog-backup-${stamp}.json`);
        const backupPayload = {
            exportedAt: new Date().toISOString(),
            rentalTypes: currentCatalog,
            bookingCategoryBindings: { pairs: currentBindings }
        };

        fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf8');
        console.log(`Backup created: ${backupFile}`);
    }

    settings.rentalTypes = nextCatalog;
    settings.bookingCategoryBindings = { pairs: nextBindings };
    await settings.save();

    console.log('\nCatalog realignment applied successfully.');
    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Catalog realignment failed:', error.message);
    try {
        await mongoose.disconnect();
    } catch (disconnectError) {
        // ignore disconnect errors
    }
    process.exit(1);
});
