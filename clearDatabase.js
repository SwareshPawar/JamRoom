require('dotenv').config({ path: __dirname + '/backend/.env' });
const mongoose = require('mongoose');

const clearDatabase = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGODB_URI not found in environment variables');
      console.log('Make sure .env file exists with MONGODB_URI');
      process.exit(1);
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✓ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log(`\nFound ${collections.length} collections:`);
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    console.log('\n🗑️  Clearing all collections...');
    
    for (const collection of collections) {
      const result = await db.collection(collection.name).deleteMany({});
      console.log(`✓ Cleared ${collection.name}: ${result.deletedCount} documents deleted`);
    }
    
    console.log('\n✅ Database cleared successfully!');
    console.log('\n💡 Restart the server to re-seed default admin and settings.');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    process.exit(1);
  }
};

clearDatabase();
