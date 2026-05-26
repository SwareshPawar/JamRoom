require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');

const DEFAULT_ADMIN_NAME = String(process.env.DEFAULT_ADMIN_NAME || 'Admin User').trim();
const DEFAULT_ADMIN_EMAIL = String(process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = String(process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMe@123').trim();

const createAdminUser = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✓ Connected to MongoDB');
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: DEFAULT_ADMIN_EMAIL });
    
    if (existingUser) {
      console.log(`⚠️  User already exists with email: ${DEFAULT_ADMIN_EMAIL}`);
      console.log('Updating to admin role...');
      existingUser.role = 'admin';
      await existingUser.save();
      console.log('✅ User updated to admin successfully!');
    } else {
      console.log('Creating new admin user...');
      const newUser = await User.create({
        name: DEFAULT_ADMIN_NAME,
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD, // Will be hashed automatically by pre-save hook
        role: 'admin'
      });
      console.log('✅ Admin user created successfully!');
    }
    
    console.log(`\n📧 Email: ${DEFAULT_ADMIN_EMAIL}`);
    console.log(`🔒 Password: ${DEFAULT_ADMIN_PASSWORD}`);
    console.log('👑 Role: admin\n');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser();
