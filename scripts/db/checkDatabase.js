const mongoose = require('mongoose');
require('dotenv').config();

const AdminSettings = require('../../models/AdminSettings');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
        console.log('✓ Connected to MongoDB');
    } catch (error) {
        console.error('✗ MongoDB connection failed:', error);
        process.exit(1);
    }
};

const checkData = async () => {
    try {
        await connectDB();
        
        const settings = await AdminSettings.findOne();
        console.log('📊 Current AdminSettings:');
        console.log(JSON.stringify(settings, null, 2));
        
        if (settings && settings.rentalTypes) {
            console.log('\n📝 Rental Types Summary:');
            settings.rentalTypes.forEach((type, index) => {
                console.log(`${index + 1}. ${type.name} (₹${type.basePrice}/hr)`);
                console.log(`   Description: ${type.description || 'No description'}`);
                if (type.subItems && type.subItems.length > 0) {
                    console.log('   Sub-items:');
                    type.subItems.forEach((subItem, subIndex) => {
                        console.log(`   - ${subItem.name}: ₹${subItem.price}/hr ${subItem.description ? `(${subItem.description})` : ''}`);
                    });
                } else {
                    console.log('   No sub-items');
                }
                console.log('');
            });
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error checking database:', error);
        process.exit(1);
    }
};

checkData();