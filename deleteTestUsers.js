const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const User = require('./models/User');
const Booking = require('./models/Booking');

dotenv.config();
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const shouldApply = process.argv.includes('--apply');

const testUserQuery = {
  $or: [
    { name: /test/i },
    { email: /test/i }
  ]
};

async function run() {
  if (!mongoUri) {
    console.error('MONGODB_URI or MONGO_URI is not configured');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);

  try {
    const users = await User.find(testUserQuery).select('name email role createdAt').sort({ createdAt: -1 });
    const userIds = users.map((u) => u._id);

    console.log(`MATCHED_USERS_WITH_TEST=${users.length}`);

    if (users.length > 0) {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} | ${user.email} | ${user.role}`);
      });
    }

    if (!shouldApply) {
      console.log('DRY_RUN_ONLY=true');
      console.log('Run with --apply to delete all users where name/email contains "test" and their bookings.');
      return;
    }

    if (users.length === 0) {
      console.log('NOTHING_TO_DELETE=true');
      return;
    }

    const bookingResult = await Booking.deleteMany({ userId: { $in: userIds } });
    const userResult = await User.deleteMany({ _id: { $in: userIds } });

    console.log(`DELETED_BOOKINGS=${bookingResult.deletedCount || 0}`);
    console.log(`DELETED_USERS=${userResult.deletedCount || 0}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('DELETE_TEST_USERS_FAILED:', error.message);
  process.exit(1);
});
