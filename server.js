require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const User = require('./models/User');
const AdminSettings = require('./models/AdminSettings');

const app = express();

// Default admin seeding is disabled unless explicitly enabled.
const ENABLE_DEFAULT_ADMIN_SEED = String(process.env.ENABLE_DEFAULT_ADMIN_SEED || '').toLowerCase() === 'true';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/slots', require('./routes/slot.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/profile', require('./routes/profile.routes'));
app.use('/api/test', require('./routes/test.routes'));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route for frontend routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API endpoint not found'
    });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Seed data function
const seedDatabase = async () => {
  try {
    console.log('Checking for seed data...');

    if (ENABLE_DEFAULT_ADMIN_SEED) {
      // Optional local bootstrap path (disabled by default).
      const adminExists = await User.findOne({ email: 'admin@jamroom.com' });

      if (!adminExists) {
        console.log('Creating default admin user...');
        await User.create({
          name: 'Admin',
          email: 'admin@jamroom.com',
          password: 'Admin@123', // Will be hashed automatically by pre-save hook
          role: 'admin'
        });
        console.log('✅ Default admin user created');
        console.log('📧 Email: admin@jamroom.com');
        console.log('🔒 Password: Admin@123');
      } else {
        console.log('✅ Default admin user already exists');
      }
    } else {
      console.log('⏭️ Skipping default admin user seed (ENABLE_DEFAULT_ADMIN_SEED is not true)');
    }

    // Initialize admin settings
    let settings = await AdminSettings.findOne();
    
    if (!settings) {
      console.log('Creating default admin settings...');
      settings = await AdminSettings.create({
        rentalTypes: [
          { name: 'JamRoom', description: 'Basic jam room rental', basePrice: 500 },
          { name: 'Instruments', description: 'Instrument rental only', basePrice: 300 },
          { name: 'Sound System', description: 'Sound system rental', basePrice: 400 },
          { name: 'JamRoom + Instruments', description: 'Room with instruments', basePrice: 700 },
          { name: 'Full Package', description: 'Everything included', basePrice: 1000 }
        ],
        prices: {
          hourlyRate: 500,
          instrumentsRate: 300,
          soundSystemRate: 400
        },
        upiId: process.env.UPI_ID || 'jamroom@paytm',
        upiName: process.env.UPI_NAME || 'JamRoom Studio',
        adminEmails: [],
        businessHours: {
          startTime: '09:00',
          endTime: '22:00'
        },
        slotDuration: 60
      });
      console.log('✅ Default admin settings created');
    } else {
      console.log('✅ Admin settings verified');
    }

    console.log('\n🎉 Database seeded successfully!');
    if (ENABLE_DEFAULT_ADMIN_SEED) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 DEFAULT ADMIN CREDENTIALS:');
      console.log('   Email: admin@jamroom.com');
      console.log('   Password: Admin@123');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
  }
};

// Initialize server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Seed database with initial data
    await seedDatabase();

    // Start server
    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`🌐 Visit: http://localhost:${PORT}`);
      console.log(`📱 Admin Panel: http://localhost:${PORT}/admin.html`);
      console.log(`📅 Booking Page: http://localhost:${PORT}/booking.html\n`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  process.exit(1);
});

// Start the server
startServer();

// Export app for Vercel
module.exports = app;
