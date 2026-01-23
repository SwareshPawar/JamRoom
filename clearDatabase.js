require('dotenv').config({ path: __dirname + '/backend/.env' });
const mongoose = require('mongoose');

const clearBookingData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables');
      console.log('Make sure .env file exists with MONGODB_URI');
      process.exit(1);
    }
    
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✓ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`\nFound ${collections.length} collections:`);
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    // Define collections to clear (booking-related data only)
    const collectionsToWipe = [
      'bookings',
      'slots', 
      'blockedtimes'
    ];
    
    // Define collections to preserve (settings and users)
    const collectionsToPreserve = [
      'adminsettings',
      'users'
    ];
    
    console.log('\n🧹 Clearing booking-related data only...');
    console.log('📋 Collections to clear:', collectionsToWipe.join(', '));
    console.log('💾 Collections to preserve:', collectionsToPreserve.join(', '));
    
    let totalDeleted = 0;
    let clearedCollections = 0;
    let preservedCollections = 0;
    
    for (const collection of collections) {
      const collectionName = collection.name.toLowerCase();
      
      if (collectionsToWipe.includes(collectionName)) {
        const result = await db.collection(collection.name).deleteMany({});
        console.log(`✓ Cleared ${collection.name}: ${result.deletedCount} documents deleted`);
        totalDeleted += result.deletedCount;
        clearedCollections++;
      } else if (collectionsToPreserve.includes(collectionName)) {
        const count = await db.collection(collection.name).countDocuments();
        console.log(`💾 Preserved ${collection.name}: ${count} documents kept`);
        preservedCollections++;
      } else {
        // Handle any other collections - ask what to do
        const count = await db.collection(collection.name).countDocuments();
        console.log(`❓ Unknown collection ${collection.name}: ${count} documents (not touched)`);
      }
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`✅ Cleared ${clearedCollections} collections (${totalDeleted} total documents deleted)`);
    console.log(`💾 Preserved ${preservedCollections} collections (users and settings intact)`);
    console.log('\n🎯 Result: Fresh start for bookings while keeping your configuration!');
    
    // Optional: Reset any booking counters in admin settings
    try {
      const adminSettings = await db.collection('adminsettings').findOne();
      if (adminSettings && (adminSettings.bookingCounter || adminSettings.totalRevenue)) {
        await db.collection('adminsettings').updateMany({}, {
          $unset: { 
            bookingCounter: "",
            totalRevenue: "",
            lastBookingDate: ""
          }
        });
        console.log('🔄 Reset booking counters in admin settings');
      }
    } catch (e) {
      console.log('ℹ️  No booking counters to reset');
    }
    
    console.log('\n💡 Next steps:');
    console.log('   1. Your users and admin settings are preserved');
    console.log('   2. Start creating new bookings from a clean slate');
    console.log('   3. Run server normally - no need to re-seed');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing booking data:', error);
    process.exit(1);
  }
};

// Allow command line arguments to control behavior
const args = process.argv.slice(2);
const clearAll = args.includes('--all') || args.includes('-a');

if (clearAll) {
  console.log('⚠️  --all flag detected: Clearing ALL data including users and settings!');
  
  const clearEverything = async () => {
    try {
      const mongoUri = process.env.MONGODB_URI;
      
      if (!mongoUri) {
        console.error('❌ MONGODB_URI not found in environment variables');
        process.exit(1);
      }
      
      await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      
      console.log('✓ Connected to MongoDB');
      
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      console.log('\n🗑️  Clearing ALL collections...');
      
      let totalDeleted = 0;
      for (const collection of collections) {
        const result = await db.collection(collection.name).deleteMany({});
        console.log(`✓ Cleared ${collection.name}: ${result.deletedCount} documents deleted`);
        totalDeleted += result.deletedCount;
      }
      
      console.log(`\n✅ Complete database wipe: ${totalDeleted} total documents deleted!`);
      console.log('\n💡 Restart the server to re-seed default admin and settings.');
      
      await mongoose.connection.close();
      process.exit(0);
    } catch (error) {
      console.error('❌ Error clearing all data:', error);
      process.exit(1);
    }
  };
  
  clearEverything();
} else {
  clearBookingData();
}
