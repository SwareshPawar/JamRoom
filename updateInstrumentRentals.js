const mongoose = require('mongoose');
const AdminSettings = require('./models/AdminSettings');

async function updateInstrumentRentals() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('Connected to MongoDB');

        // Get current admin settings
        let settings = await AdminSettings.findOne();
        
        if (!settings) {
            console.log('No settings found');
            return;
        }

        console.log('Current rental types:', JSON.stringify(settings.rentalTypes, null, 2));

        // Find the Instrument Rentals category
        const instrumentRentalsIndex = settings.rentalTypes.findIndex(
            type => type.name === 'Instrument Rentals'
        );

        if (instrumentRentalsIndex === -1) {
            console.log('Instrument Rentals category not found');
            return;
        }

        // Update the existing instruments to be inhouse rentals and add perday versions
        const instrumentRentals = settings.rentalTypes[instrumentRentalsIndex];
        
        // Clear existing sub-items and recreate with both inhouse and perday options
        const newSubItems = [];
        
        // Add inhouse rentals (tied to jamroom duration)
        newSubItems.push({
            name: 'Guitar (In-house)',
            description: 'Electric/Acoustic guitar - hourly rate tied to jamroom booking',
            price: 200,
            rentalType: 'inhouse',
            perdayPrice: 0
        });
        
        newSubItems.push({
            name: 'Keyboard (In-house)',
            description: 'Digital keyboard/piano - hourly rate tied to jamroom booking',
            price: 200,
            rentalType: 'inhouse',
            perdayPrice: 0
        });
        
        // Add per-day rentals (independent pricing)
        newSubItems.push({
            name: 'Guitar (Per-day)',
            description: 'Electric/Acoustic guitar - full day rental',
            price: 0, // Not used for perday rentals
            rentalType: 'perday',
            perdayPrice: 800 // ₹800 per day
        });
        
        newSubItems.push({
            name: 'Keyboard (Per-day)',
            description: 'Digital keyboard/piano - full day rental',
            price: 0, // Not used for perday rentals
            rentalType: 'perday',
            perdayPrice: 800 // ₹800 per day
        });

        // Update the instrument rentals category
        settings.rentalTypes[instrumentRentalsIndex].subItems = newSubItems;

        // Save the updated settings
        await settings.save();
        
        console.log('✅ Successfully updated instrument rentals with inhouse/perday options');
        console.log('New sub-items:');
        newSubItems.forEach((item, index) => {
            console.log(`${index + 1}. ${item.name} (${item.rentalType}) - ₹${item.rentalType === 'inhouse' ? item.price + '/hr' : item.perdayPrice + '/day'}`);
        });

        process.exit(0);
    } catch (error) {
        console.error('Error updating instrument rentals:', error);
        process.exit(1);
    }
}

// Load environment variables
require('dotenv').config();

updateInstrumentRentals();