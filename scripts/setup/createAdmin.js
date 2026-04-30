require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');

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
    const existingUser = await User.findOne({ email: 'swareshpawar@gmail.com' });
    
    if (existingUser) {
      console.log('⚠️  User already exists with email: swareshpawar@gmail.com');
      console.log('Updating to admin role...');
      existingUser.role = 'admin';
      await existingUser.save();
      console.log('✅ User updated to admin successfully!');
    } else {
      console.log('Creating new admin user...');
      const newUser = await User.create({
        name: 'Swaresh Pawar',
        email: 'swareshpawar@gmail.com',
        password: 'Swar@123', // Will be hashed automatically by pre-save hook
        role: 'admin'
      });
      console.log('✅ Admin user created successfully!');
    }
    
    console.log('\n📧 Email: swareshpawar@gmail.com');
    console.log('🔒 Password: Swar@123');
    console.log('👑 Role: admin\n');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    process.exit(1);
  }
};

createAdminUser();
