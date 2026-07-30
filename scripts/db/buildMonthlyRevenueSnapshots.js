const mongoose = require('mongoose');
require('dotenv').config();

const Booking = require('../../models/Booking');
const RevenueMonthlySnapshot = require('../../models/RevenueMonthlySnapshot');

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const includeClassBookings = args.includes('--include-class');
const mode = String((args.find((arg) => arg.startsWith('--mode=')) || '--mode=rollup').split('=')[1] || 'rollup').toLowerCase();
const monthsBackRaw = Number((args.find((arg) => arg.startsWith('--months=')) || '--months=12').split('=')[1]);
const monthsBack = Number.isFinite(monthsBackRaw)
  ? Math.max(2, Math.min(60, Math.trunc(monthsBackRaw)))
  : 12;

const source = mode === 'spread' ? 'SYNTHETIC_SPREAD' : 'BOOKING_ROLLUP';

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeCollectedAmount = ({ totalAmount, paymentStatus, amountPaid }) => {
  const total = Math.max(0, toNumber(totalAmount));
  const paid = Math.max(0, toNumber(amountPaid));
  const status = String(paymentStatus || '').toUpperCase();

  if (status === 'PAID') return total;
  if (status === 'PARTIAL') return Math.min(total, paid);
  return 0;
};

const getMonthMeta = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

  return {
    monthKey: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    monthLabel: monthStart.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
    monthStart,
    monthEnd,
    order: year * 12 + monthIndex
  };
};

const addMonths = (date, delta) => {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + delta);
  return copy;
};

const ensureBucket = (map, meta) => {
  const existing = map.get(meta.monthKey);
  if (existing) return existing;

  const entry = {
    monthKey: meta.monthKey,
    monthLabel: meta.monthLabel,
    monthStart: meta.monthStart,
    monthEnd: meta.monthEnd,
    collectedRevenue: 0,
    bookingCount: 0,
    order: meta.order
  };
  map.set(meta.monthKey, entry);
  return entry;
};

const getEligibleBookings = async () => {
  const query = {
    bookingStatus: 'CONFIRMED',
    paymentStatus: { $in: ['PAID', 'PARTIAL'] }
  };

  if (!includeClassBookings) {
    query['classSession.isClassBooking'] = { $ne: true };
  }

  return Booking.find(query)
    .setOptions({ includeDeleted: false })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
};

const buildRollupBuckets = (bookings) => {
  const bucketMap = new Map();

  (Array.isArray(bookings) ? bookings : []).forEach((booking) => {
    const meta = getMonthMeta(booking?.date);
    if (!meta) return;

    const bucket = ensureBucket(bucketMap, meta);
    bucket.collectedRevenue += computeCollectedAmount({
      totalAmount: booking?.price,
      paymentStatus: booking?.paymentStatus,
      amountPaid: booking?.amountPaid
    });
    bucket.bookingCount += 1;
  });

  return bucketMap;
};

const buildSpreadBuckets = (bookings) => {
  const bucketMap = new Map();
  const reference = new Date();
  const anchor = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const orderedMonths = [];

  for (let idx = 0; idx < monthsBack; idx += 1) {
    const monthDate = addMonths(anchor, -(monthsBack - 1) + idx);
    const meta = getMonthMeta(monthDate);
    if (!meta) continue;
    orderedMonths.push(meta);
    ensureBucket(bucketMap, meta);
  }

  if (orderedMonths.length === 0) return bucketMap;

  (Array.isArray(bookings) ? bookings : []).forEach((booking, index) => {
    const targetMeta = orderedMonths[index % orderedMonths.length];
    const bucket = ensureBucket(bucketMap, targetMeta);
    bucket.collectedRevenue += computeCollectedAmount({
      totalAmount: booking?.price,
      paymentStatus: booking?.paymentStatus,
      amountPaid: booking?.amountPaid
    });
    bucket.bookingCount += 1;
  });

  return bucketMap;
};

const main = async () => {
  if (!['rollup', 'spread'].includes(mode)) {
    throw new Error('Invalid --mode. Allowed: rollup | spread');
  }

  await connectDB();

  const bookings = await getEligibleBookings();
  const bucketMap = mode === 'spread'
    ? buildSpreadBuckets(bookings)
    : buildRollupBuckets(bookings);

  const buckets = [...bucketMap.values()].sort((a, b) => a.order - b.order);

  const operations = buckets.map((bucket) => ({
    updateOne: {
      filter: { source, monthKey: bucket.monthKey },
      update: {
        $set: {
          source,
          monthKey: bucket.monthKey,
          monthLabel: bucket.monthLabel,
          monthStart: bucket.monthStart,
          monthEnd: bucket.monthEnd,
          collectedRevenue: Math.max(0, Math.round(bucket.collectedRevenue)),
          bookingCount: Math.max(0, Number(bucket.bookingCount) || 0),
          meta: {
            mode,
            monthsBack: mode === 'spread' ? monthsBack : 0
          },
          generatedAt: new Date(),
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date()
        }
      },
      upsert: true
    }
  }));

  if (shouldApply) {
    if (operations.length > 0) {
      await RevenueMonthlySnapshot.bulkWrite(operations, { ordered: false });
    }

    await RevenueMonthlySnapshot.deleteMany({
      source,
      monthKey: { $nin: buckets.map((item) => item.monthKey) }
    });
  }

  const totalRevenue = buckets.reduce((sum, bucket) => sum + toNumber(bucket.collectedRevenue), 0);
  const totalBookings = buckets.reduce((sum, bucket) => sum + toNumber(bucket.bookingCount), 0);

  console.log(JSON.stringify({
    mode: shouldApply ? 'apply' : 'preview',
    source,
    generationMode: mode,
    monthsBack: mode === 'spread' ? monthsBack : undefined,
    includeClassBookings,
    bookingsScanned: bookings.length,
    monthsGenerated: buckets.length,
    totalRevenue,
    totalBookings,
    previewSample: buckets.slice(0, 24).map((bucket) => ({
      monthKey: bucket.monthKey,
      monthLabel: bucket.monthLabel,
      collectedRevenue: Math.max(0, Math.round(bucket.collectedRevenue)),
      bookingCount: bucket.bookingCount
    })),
    note: shouldApply
      ? 'Monthly snapshot collection updated. Booking documents were not modified.'
      : 'Preview only. Use --apply to write snapshot rows.'
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
