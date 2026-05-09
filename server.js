require('dotenv').config();

// Keep server-side date operations consistent across local and Vercel runtimes.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const connectDB = require('./config/db');
const User = require('./models/User');
const AdminSettings = require('./models/AdminSettings');

const app = express();

const MAX_BASELINE_ENTRIES = 500;

app.locals.performanceBaseline = {
  pageMetrics: [],
  apiPayloads: []
};

// Default admin seeding is disabled unless explicitly enabled.
const ENABLE_DEFAULT_ADMIN_SEED = String(process.env.ENABLE_DEFAULT_ADMIN_SEED || '').toLowerCase() === 'true';
const PUBLIC_DIR = path.join(__dirname, 'public');
const LONG_CACHE_EXTENSIONS = new Set([
  '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.json'
]);

const setStaticCacheHeaders = (res, filePath) => {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache');
    return;
  }

  if (LONG_CACHE_EXTENSIONS.has(ext)) {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=604800');
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression());

app.use((req, res, next) => {
  const isTrackedEndpoint =
    req.path === '/api/bookings/my-bookings'
    || req.path === '/api/admin/bookings';

  if (!isTrackedEndpoint) {
    return next();
  }

  const startedAt = process.hrtime.bigint();
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    const payloadJson = JSON.stringify(body);
    const payloadBytes = Buffer.byteLength(payloadJson, 'utf8');
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const record = {
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
      payloadBytes,
      payloadKB: Number((payloadBytes / 1024).toFixed(2)),
      durationMs: Number(durationMs.toFixed(2)),
      query: req.query,
      at: new Date().toISOString()
    };

    app.locals.performanceBaseline.apiPayloads.push(record);
    if (app.locals.performanceBaseline.apiPayloads.length > MAX_BASELINE_ENTRIES) {
      app.locals.performanceBaseline.apiPayloads.shift();
    }

    res.set('X-JamRoom-Payload-Bytes', String(payloadBytes));
    return originalJson(body);
  };

  next();
});

// Serve static files from public directory
app.use(express.static(PUBLIC_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: setStaticCacheHeaders
}));

// API Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/slots', require('./routes/slot.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/profile', require('./routes/profile.routes'));
app.use('/api/test', require('./routes/test.routes'));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Catch-all route for frontend routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API endpoint not found'
    });
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
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
        rentalTypes: [],
        upiId: process.env.UPI_ID || 'jamroom@paytm',
        upiName: process.env.UPI_NAME || 'Swaresh Pawar',
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
