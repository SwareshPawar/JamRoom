const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        process.exit(1);
    }
};

// Use the actual User model from the project
const User = require('./models/User');

const createTestUsers = async () => {
    await connectDB();

    // Test User Credentials
    const testUser = {
        name: 'Test User',
        email: 'testuser@jamroom.com',
        phone: '9876543210',
        password: 'TestUser@123',
        role: 'user'
    };

    // Test Admin Credentials
    const testAdmin = {
        name: 'Test Admin',
        email: 'testadmin@jamroom.com',
        phone: '9876543211',
        password: 'TestAdmin@123',
        role: 'admin'
    };

    try {
        // Delete existing test users first
        await User.deleteOne({ email: testUser.email });
        await User.deleteOne({ email: testAdmin.email });
        console.log('Cleaned up existing test users...');

        // Create test user
        const newUser = new User(testUser);
        await newUser.save();
        console.log('✅ Test User created:');
        console.log(`   Email: ${testUser.email}`);
        console.log(`   Role: ${testUser.role}`);

        // Create test admin
        const newAdmin = new User(testAdmin);
        await newAdmin.save();
        console.log('✅ Test Admin created:');
        console.log(`   Email: ${testAdmin.email}`);
        console.log(`   Role: ${testAdmin.role}`);

        console.log('\n🎉 Test users ready!');

    } catch (error) {
        console.error('Error creating test users:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\nDatabase connection closed');
    }
};

createTestUsers();
