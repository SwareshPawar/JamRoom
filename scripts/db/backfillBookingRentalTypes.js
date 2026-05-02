const mongoose = require('mongoose');
require('dotenv').config();

const Booking = require('../../models/Booking');
const AdminSettings = require('../../models/AdminSettings');

const shouldApply = process.argv.includes('--apply');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
};

const normalizeRentalType = (value) => {
  const token = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (token === 'perday') return 'perday';
  if (token === 'persession' || token === 'session') return 'persession';
  if (token === 'pertrack' || token === 'track') return 'pertrack';
  if (token === 'inhouse' || token === 'hourly') return 'inhouse';
  return '';
};

const normalizeNameKey = (value) => String(value || '').trim().toLowerCase();

const buildCatalogRentalTypeMap = (settings = {}) => {
  const categoryMap = new Map();
  const itemTypeBuckets = new Map();
  const rentalTypes = Array.isArray(settings?.rentalTypes) ? settings.rentalTypes : [];

  rentalTypes.forEach((type) => {
    const categoryName = normalizeNameKey(type?.name);
    const categoryType = normalizeRentalType(type?.rentalType) || 'inhouse';

    if (categoryName && !categoryMap.has(categoryName)) {
      categoryMap.set(categoryName, categoryType);
    }

    const subItems = Array.isArray(type?.subItems) ? type.subItems : [];
    subItems.forEach((subItem) => {
      const itemName = normalizeNameKey(subItem?.name);
      if (!itemName) return;

      const itemType = normalizeRentalType(subItem?.rentalType) || categoryType;
      if (!itemTypeBuckets.has(itemName)) {
        itemTypeBuckets.set(itemName, new Set());
      }
      itemTypeBuckets.get(itemName).add(itemType);
    });
  });

  const uniqueItemMap = new Map();
  itemTypeBuckets.forEach((typeSet, itemName) => {
    if (typeSet.size === 1) {
      uniqueItemMap.set(itemName, [...typeSet][0]);
    }
  });

  return { categoryMap, uniqueItemMap };
};

const inferRentalType = (rental, catalogLookup) => {
  const existingType = normalizeRentalType(rental?.rentalType);
  if (existingType) return existingType;

  const nameKey = normalizeNameKey(rental?.name);
  const categoryKey = normalizeNameKey(rental?.category);
  const matchedCategoryType = catalogLookup.categoryMap.get(categoryKey);
  if (matchedCategoryType) return matchedCategoryType;

  const matchedUniqueItemType = catalogLookup.uniqueItemMap.get(nameKey);
  if (matchedUniqueItemType) return matchedUniqueItemType;

  if (/jamroom|jam room|\(base\)|_base/.test(nameKey)) {
    return 'inhouse';
  }

  return 'inhouse';
};

const getBookingsWithMissingRentalTypes = async () => Booking.find({
  rentals: {
    $elemMatch: {
      $or: [
        { rentalType: { $exists: false } },
        { rentalType: null },
        { rentalType: '' }
      ]
    }
  }
}).lean();

const main = async () => {
  await connectDB();

  const settings = await AdminSettings.getSettings();
  const catalogLookup = buildCatalogRentalTypeMap(settings);
  const bookings = await getBookingsWithMissingRentalTypes();

  let bookingsTouched = 0;
  let rowsUpdated = 0;
  const operations = [];
  const preview = [];

  bookings.forEach((booking) => {
    let changed = false;
    const updatedRentals = (Array.isArray(booking.rentals) ? booking.rentals : []).map((rental) => {
      const currentType = normalizeRentalType(rental?.rentalType);
      if (currentType) return rental;

      const inferredType = inferRentalType(rental, catalogLookup);
      changed = true;
      rowsUpdated += 1;

      preview.push({
        bookingId: String(booking._id),
        name: rental?.name || '',
        category: rental?.category || '',
        inferredType
      });

      return {
        ...rental,
        rentalType: inferredType
      };
    });

    if (!changed) return;

    bookingsTouched += 1;
    operations.push({
      updateOne: {
        filter: { _id: booking._id },
        update: { $set: { rentals: updatedRentals } }
      }
    });
  });

  if (shouldApply && operations.length > 0) {
    await Booking.bulkWrite(operations, { ordered: false });
  }

  const remainingMissing = await Booking.countDocuments({
    rentals: {
      $elemMatch: {
        $or: [
          { rentalType: { $exists: false } },
          { rentalType: null },
          { rentalType: '' }
        ]
      }
    }
  });

  console.log(JSON.stringify({
    mode: shouldApply ? 'apply' : 'preview',
    bookingsScanned: bookings.length,
    bookingsTouched,
    rowsUpdated,
    remainingMissing,
    preview
  }, null, 2));
};

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });