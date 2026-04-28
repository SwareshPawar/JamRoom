/**
 * updateCatalog.js
 * JamRoom & Music Studio — Rental Catalog Manager
 *
 * Usage:
 *   node updateCatalog.js           → Preview current catalog + proposed new catalog (no changes)
 *   node updateCatalog.js --apply   → Apply the new catalog to the database
 *
 * ──────────────────────────────────────────────────────────────
 * REVIEW PRICING BEFORE RUNNING WITH --apply
 * New instruments (Sitar, Sarangi, Mandolin, Bulbul Tarang) have
 * been given suggested market rates. Adjust as needed below.
 * ──────────────────────────────────────────────────────────────
 */

'use strict';

const mongoose = require('mongoose');
require('dotenv').config();
const AdminSettings = require('./models/AdminSettings');

// ─── Helpers ────────────────────────────────────────────────────────────────

const APPLY = process.argv.includes('--apply');

const line  = (char = '─', len = 70) => char.repeat(len);
const head  = (title) => `\n${line()}\n  ${title}\n${line()}`;
const label = (key, val) => `  ${key.padEnd(22)} ${val}`;

const billingLabel = {
    inhouse:    'Per Hour (in-studio)',
    perday:     'Per Day (rental)',
    persession: 'Per Session / Event'
};

const inrFormat = (n) => n === 0 ? 'FREE' : `₹${n}`;

function printRentalType(rt, index) {
    console.log(`\n  [${index + 1}] ${rt.name}`);
    console.log(label('  Billing type:', billingLabel[rt.rentalType] || rt.rentalType));
    if (rt.basePrice > 0) {
        console.log(label('  Base price:', `${inrFormat(rt.basePrice)} / ${rt.rentalType === 'persession' ? 'session' : rt.rentalType === 'perday' ? 'day' : 'hr'}`));
    }
    console.log(label('  Description:', rt.description ? rt.description.slice(0, 80) + (rt.description.length > 80 ? '…' : '') : '(none)'));
    if (rt.subItems && rt.subItems.length > 0) {
        console.log('  Sub-items:');
        rt.subItems.forEach((s) => {
            const price = rt.rentalType === 'perday' ? s.perdayPrice : s.price;
            const unit  = rt.rentalType === 'persession' ? '/session' : rt.rentalType === 'perday' ? '/day' : '/hr';
            console.log(`    • ${s.name.padEnd(36)} ${inrFormat(price)}${price > 0 ? unit : ''}`);
        });
    } else {
        console.log('  Sub-items:    (none)');
    }
}

// ════════════════════════════════════════════════════════════════════════════
// NEW CATALOG DEFINITION
// Review this carefully before running with --apply
// ════════════════════════════════════════════════════════════════════════════

const NEW_CATALOG = [

    // ── 1. JamRoom Base ─────────────────────────────────────────────────────
    {
        name:              'JamRoom',
        description:       'Professional jam and rehearsal room. Fully soundproofed with PA system, monitoring, and core studio gear. Ideal for band rehearsals, acoustic sets, and live practice sessions.',
        rentalType:        'inhouse',
        basePrice:         300,     // ₹300/hr room base charge
        maxQuantity:       1,
        alwaysChargeBase:  true,
        subItems: [
            {
                name:        'Microphone',
                description: 'Shared use dynamic microphone (SM-58 type) during session.',
                price:       0,
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 5,
            },
            {
                name:        'Audio Jacks / DI Box',
                description: 'Audio input/output jack connections and DI box for line-level instruments.',
                price:       0,
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 3,
            },
            {
                name:        'IEM (In-Ear Monitor)',
                description: 'Personal in-ear monitor unit for stage-mix monitoring during session. Priced per unit.',
                price:       50,    // ₹50/hr per unit
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 3,
            },
        ],
    },

    // ── 2. Guitars & Bass (In-House Hourly) ──────────────────────────────────
    {
        name:              'Guitars & Bass',
        description:       'Electric, acoustic, and bass guitars for in-studio use. Tied to your JamRoom booking and billed per hour.',
        rentalType:        'inhouse',
        basePrice:         0,
        maxQuantity:       3,
        alwaysChargeBase:  false,
        subItems: [
            {
                name:        'Electric Guitar (Java)',
                description: 'Java brand electric guitar. Reliable mid-range body suitable for rehearsal, recording, and production work.',
                price:       100,   // ₹100/hr
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'PRS Acoustic Guitar',
                description: 'PRS semi-acoustic guitar. Premium build quality, rich tone — great for recording sessions and rehearsals.',
                price:       200,   // ₹200/hr
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'Bass Guitar (Yamaha TRBX174)',
                description: 'Yamaha TRBX174 bass guitar in Blue. Balanced tone and low-action neck, ideal for rhythm sections and studio production.',
                price:       100,   // ₹100/hr
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
        ],
    },

    // ── 3. Keyboards & Harmonium (In-House Hourly) ───────────────────────────
    {
        name:              'Keyboards & Harmonium',
        description:       'Professional arranger keyboard and harmonium for in-studio use. Billed per hour alongside your JamRoom session.',
        rentalType:        'inhouse',
        basePrice:         0,
        maxQuantity:       2,
        alwaysChargeBase:  false,
        subItems: [
            {
                name:        'KORG PA900 Arranger Keyboard',
                description: 'KORG PA900 professional 76-key arranger keyboard. Full arranger mode, auto-styles, splits, and layering. Ideal for live performance, accompaniment, or production.',
                price:       200,   // ₹200/hr
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'Harmonium',
                description: 'Standard pedal harmonium (3.5-octave reed instrument). Widely used in classical, devotional, and Bollywood-style music.',
                price:       100,   // ₹100/hr
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
        ],
    },

    // ── 4. Indian Classical Instruments (In-House Hourly) ────────────────────
    {
        name:              'Indian Classical Instruments',
        description:       'Traditional and classical Indian string instruments for in-studio practice, recording, and music production. Must be pre-booked with a JamRoom slot.',
        rentalType:        'inhouse',
        basePrice:         0,
        maxQuantity:       2,
        alwaysChargeBase:  false,
        subItems: [
            {
                name:        'Sitar',
                description: 'Full-size concert sitar. Suitable for classical raga practice, film scoring, and studio recording sessions.',
                price:       200,   // ₹200/hr — REVIEW: adjust to your rate
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'Sarangi',
                description: 'Traditional north Indian bowed string instrument. Rich, expressive tone — used in classical, folk, and Bollywood recordings as melodic accompaniment.',
                price:       150,   // ₹150/hr — REVIEW: adjust to your rate
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'Mandolin',
                description: 'Indian-style flat-back mandolin. Used in classical South Indian, folk, and light music. Great for melody lines and studio recordings.',
                price:       100,   // ₹100/hr — REVIEW: adjust to your rate
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'Bulbul Tarang',
                description: 'Indian bulbul tarang (also known as Indian banjo). Folk and classical instrument with a distinctive plucked-string character, used in regional and traditional music styles.',
                price:       100,   // ₹100/hr — REVIEW: adjust to your rate
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 1,
            },
        ],
    },

    // ── 5. Percussion (In-House Hourly) ──────────────────────────────────────
    {
        name:              'Percussion',
        description:       'Percussion accessories for use during in-studio JamRoom sessions. Must be pre-booked.',
        rentalType:        'inhouse',
        basePrice:         0,
        maxQuantity:       2,
        alwaysChargeBase:  false,
        subItems: [
            {
                name:        'Drum Sticks',
                description: 'Professional drum sticks for practice pad or kit use during your JamRoom session. Must be pre-booked.',
                price:       50,    // ₹50/hr
                rentalType:  'inhouse',
                perdayPrice: 0,
                maxQuantity: 2,
            },
        ],
    },

    // ── 6. Per Day Rentals ───────────────────────────────────────────────────
    {
        name:              'Per Day Rentals',
        description:       'Instruments and equipment available for full-day rental. Ideal for outdoor shoots, concerts, events, TV/film productions, or use at other venues. Minimum 1 day (24 hours). Return must be in exact 24-hour blocks.',
        rentalType:        'perday',
        basePrice:         0,
        maxQuantity:       5,
        alwaysChargeBase:  false,
        subItems: [
            {
                name:        'PRS Acoustic Guitar',
                description: 'PRS Angelus semi-acoustic guitar. Full-day rental for outdoor shoots, stage performances, or recordings at another studio.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 1500,  // ₹1500/day
                maxQuantity: 1,
            },
            {
                name:        'KORG PA900 Keyboard',
                description: 'KORG PA900 professional arranger keyboard. Full-day rental for concerts, events, recordings, or shoots outside the studio.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 2000,  // ₹2000/day
                maxQuantity: 1,
            },
            {
                name:        'Bass Guitar (Yamaha TRBX174)',
                description: 'Yamaha TRBX174 bass guitar. Full-day rental for gigs, shows, or outdoor events.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 1000,  // ₹1000/day
                maxQuantity: 1,
            },
            {
                name:        'Electric Guitar (Java)',
                description: 'Java electric guitar without processor. Full-day rental for live shows and outdoor events.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 800,   // ₹800/day
                maxQuantity: 1,
            },
            {
                name:        'Sitar',
                description: 'Full-size concert sitar. Full-day rental for classical performances, film recordings, or cultural events.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 2000,  // ₹2000/day — REVIEW: adjust to your rate
                maxQuantity: 1,
            },
            {
                name:        'Sarangi',
                description: 'Traditional north Indian bowed string instrument. Full-day rental for classical concerts, folk performances, or film shoots.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 1500,  // ₹1500/day — REVIEW: adjust to your rate
                maxQuantity: 1,
            },
            {
                name:        'Mandolin',
                description: 'Indian flat-back mandolin. Full-day rental for events, folk performances, or studio recordings at another venue.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 800,   // ₹800/day — REVIEW: adjust to your rate
                maxQuantity: 1,
            },
            {
                name:        'Bulbul Tarang',
                description: 'Indian bulbul tarang. Full-day rental for folk, regional, or cultural performances and film productions.',
                price:       0,
                rentalType:  'perday',
                perdayPrice: 800,   // ₹800/day — REVIEW: adjust to your rate
                maxQuantity: 1,
            },
        ],
    },

    // ── 7. Music Production (Per Session) ───────────────────────────────────
    {
        name:              'Music Production',
        description:       'Complete music production service. Base charge covers a standard acoustic track — guitar, keyboard, or strings — with digital arrangement and programming. No drums included in base. Additional services can be added per item below.',
        rentalType:        'persession',
        basePrice:         4000,   // ₹4000/session base
        maxQuantity:       1,
        alwaysChargeBase:  true,
        subItems: [
            {
                name:        'Live Instrument Recording',
                description: 'Recording of one live instrument per session — violin, flute, guitar, sitar, or any other. Priced per instrument added.',
                price:       5000,  // ₹5000/instrument
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 4,
            },
            {
                name:        'Additional Digital Instrument / Production Layer',
                description: 'Adding a single digital instrument or production layer — synth pad, sample track, orchestral section, or electronic element.',
                price:       2000,  // ₹2000/instrument
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 3,
            },
            {
                name:        'Mixing & Mastering',
                description: 'Professional mixing and mastering. Base price covers up to 3 tracks. Contact for larger projects or stem-based mastering.',
                price:       2000,  // ₹2000 for up to 3 tracks
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 1,
            },
            {
                name:        'Vocal Recording',
                description: 'Vocal recording — raw or processed. Includes mic, signal chain, and booth time. Priced per vocal track.',
                price:       1000,  // ₹1000/vocal track
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 4,
            },
        ],
    },

    // ── 8. Mix & Master (Per Session) ───────────────────────────────────────
    {
        name:              'Mix & Master',
        description:       'Professional mixing and mastering service. Base charge covers up to 4 tracks. Additional tracks and stem mastering can be added below.',
        rentalType:        'persession',
        basePrice:         4000,   // ₹4000 base (up to 4 tracks)
        maxQuantity:       1,
        alwaysChargeBase:  true,
        subItems: [
            {
                name:        'Additional Track Mixing',
                description: 'One additional track beyond the base 4-track package. Priced per track.',
                price:       500,   // ₹500/extra track
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 10,
            },
            {
                name:        'Stem Mastering',
                description: 'Stem-based mastering for greater control over the final mix. Includes multi-stem bounce and individual processing.',
                price:       1500,  // ₹1500/project
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 1,
            },
        ],
    },

    // ── 9. Background Music & Jingles (Per Session) ─────────────────────────
    {
        name:              'Background Music & Jingles',
        description:       'Background music composition and production for short films, advertisements, YouTube content, documentaries, and corporate projects. Base charge includes digital instrument arrangement and programming.',
        rentalType:        'persession',
        basePrice:         4000,   // ₹4000/project base
        maxQuantity:       1,
        alwaysChargeBase:  true,
        subItems: [
            {
                name:        'Sound Design / Foley',
                description: 'Custom sound design and foley creation for film, video, or interactive media. Priced per scene or project segment.',
                price:       4000,  // ₹4000/segment
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 5,
            },
            {
                name:        'Live Instrument Recording',
                description: 'Recording a live instrument for the BGM or jingle track — guitar, keyboard, sitar, sarangi, or any other. Priced per instrument.',
                price:       5000,  // ₹5000/instrument
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 5,
            },
            {
                name:        'Vocal Recording',
                description: 'Jingle or narration vocal recording. Includes mic, signal chain, and booth time.',
                price:       500,   // ₹500/vocal
                rentalType:  'persession',
                perdayPrice: 0,
                maxQuantity: 5,
            },
        ],
    },

    // ── 10. Recording Session (In-House Hourly) ──────────────────────────────
    {
        name:              'Recording Session',
        description:       'Raw recording session in the studio. No mixing or mastering included. Dry WAV files delivered to your pen drive or shared via Google Drive or WeTransfer. Ideal for demos, reference takes, or tracks to be mixed elsewhere.',
        rentalType:        'inhouse',
        basePrice:         500,    // ₹500/hr
        maxQuantity:       1,
        alwaysChargeBase:  true,
        subItems: [],
    },
];

// ════════════════════════════════════════════════════════════════════════════
// MAIN SCRIPT
// ════════════════════════════════════════════════════════════════════════════

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        const settings = await AdminSettings.findOne();
        if (!settings) {
            console.error('✗ No AdminSettings document found. Run createAdmin.js first.');
            process.exit(1);
        }

        // ── Print current catalog ────────────────────────────────────────────
        console.log(head('CURRENT CATALOG'));
        const current = settings.rentalTypes || [];
        if (current.length === 0) {
            console.log('\n  (empty)');
        } else {
            current.forEach((rt, i) => printRentalType(rt, i));
        }

        // ── Print proposed catalog ───────────────────────────────────────────
        console.log(head('PROPOSED NEW CATALOG'));
        NEW_CATALOG.forEach((rt, i) => printRentalType(rt, i));

        // ── Summary diff ─────────────────────────────────────────────────────
        console.log(head('SUMMARY'));
        console.log(`  Current categories   : ${current.length}`);
        console.log(`  Proposed categories  : ${NEW_CATALOG.length}`);
        const currentItems  = current.reduce((n, rt) => n + (rt.subItems?.length || 0), 0);
        const proposedItems = NEW_CATALOG.reduce((n, rt) => n + (rt.subItems?.length || 0), 0);
        console.log(`  Current sub-items    : ${currentItems}`);
        console.log(`  Proposed sub-items   : ${proposedItems}`);

        const currentNames  = new Set(current.map((rt) => rt.name));
        const proposedNames = new Set(NEW_CATALOG.map((rt) => rt.name));
        const added         = [...proposedNames].filter((n) => !currentNames.has(n));
        const removed       = [...currentNames].filter((n) => !proposedNames.has(n));
        const kept          = [...proposedNames].filter((n) => currentNames.has(n));

        if (added.length)   console.log(`\n  ➕ New categories     : ${added.join(', ')}`);
        if (removed.length) console.log(`  ➖ Removed categories : ${removed.join(', ')}`);
        if (kept.length)    console.log(`  ✎  Updated categories : ${kept.join(', ')}`);

        console.log('\n  New instruments added (review prices before applying):');
        console.log('    • Sitar                ₹200/hr (inhouse) | ₹2000/day (perday)');
        console.log('    • Sarangi              ₹150/hr (inhouse) | ₹1500/day (perday)');
        console.log('    • Mandolin             ₹100/hr (inhouse) | ₹800/day  (perday)');
        console.log('    • Bulbul Tarang        ₹100/hr (inhouse) | ₹800/day  (perday)');

        // ── Apply ─────────────────────────────────────────────────────────────
        if (!APPLY) {
            console.log(head('HOW TO APPLY'));
            console.log('  Run with --apply to save the new catalog to the database:');
            console.log('  node updateCatalog.js --apply\n');
            console.log('  ⚠  This will REPLACE the existing rentalTypes array.');
            console.log('  ⚠  Review all prices above (especially new instruments)');
            console.log('     before applying.\n');
            process.exit(0);
        }

        // ── Backup + write ────────────────────────────────────────────────────
        console.log(head('APPLYING...'));
        const backupSnapshot = JSON.stringify(current, null, 2);

        settings.rentalTypes = NEW_CATALOG;
        await settings.save();

        console.log('  ✓ Catalog updated successfully.\n');
        console.log('  Backup of previous catalog (copy if you need to restore):');
        console.log('  ─────────────────────────────────────────────────────────');
        console.log(backupSnapshot);

        process.exit(0);
    } catch (err) {
        console.error('\n✗ Error:', err.message);
        process.exit(1);
    }
}

run();
