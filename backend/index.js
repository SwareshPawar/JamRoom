// ⚠️ OBSOLETE SERVER - USE server.js IN ROOT DIRECTORY
// This file is kept for reference only and should not be used
// Main production server is at: ../server.js
// To start the application, run: node server.js from the root directory

console.log('❌ WARNING: This is an obsolete server file!');
console.log('🔧 Use the main server instead: node server.js');
console.log('📁 Located at: ../server.js');
process.exit(1);

app.get('/', (req, res) => {
  res.send('JamRoom API is running');
});

// --- Mongoose Models ---
const bookingSchema = new mongoose.Schema({
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    duration: { type: Number, required: true },
    bandName: { type: String, required: true },
    email: { type: String, required: true },
    price: { type: Number, required: true },
    status: { type: String, default: 'confirmed' },
    endTime: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// Slot schema for managing availability
const slotSchema = new mongoose.Schema({
    date: { type: String, required: true },
    time: { type: String, required: true },
    capacity: { type: Number, default: 1 },
    booked: { type: Number, default: 0 },
    isBlocked: { type: Boolean, default: false }
});
const Slot = mongoose.model('Slot', slotSchema);

// Notification schema
const notificationSchema = new mongoose.Schema({
    email: String,
    type: String,
    message: String,
    bookingId: mongoose.Schema.Types.ObjectId,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// Predefined time slots
const timeSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
];

// --- Booking Endpoints ---
app.get('/api/availability', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) query.date = date;
        
        const bookings = await Booking.find(query);
        const slots = await Slot.find(query);
        
        res.json({ success: true, bookings, slots });
    } catch (error) {
        console.error('Error fetching availability:', error);
        res.status(500).json({ error: 'Server error fetching availability' });
    }
});

app.post('/api/book', async (req, res) => {
    try {
        const { date, startTime, duration, bandName, email, price } = req.body;
        if (!date || !startTime || !duration || !bandName || !email || !price) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Calculate end time
        const startHour = parseInt(startTime.split(':')[0]);
        const endTime = `${String(startHour + duration).padStart(2, '0')}:00`;
        
        // Check slot availability
        let slot = await Slot.findOne({ date, time: startTime });
        if (!slot) {
            // Create default slot if none exists
            slot = new Slot({ 
                date, 
                time: startTime,
                capacity: 1,
                booked: 0
            });
        }
        
        if (slot.isBlocked) {
            return res.status(409).json({ error: 'This time slot is blocked' });
        }
        
        if (slot.booked >= slot.capacity) {
            return res.status(409).json({ error: 'This time slot is fully booked' });
        }
        
        // Check for overlapping bookings
        const existingBookings = await Booking.find({ date });
        const conflict = existingBookings.some(b => {
            const bStart = parseInt(b.startTime.split(':')[0]);
            const bEnd = parseInt(b.endTime.split(':')[0]);
            return startHour < bEnd && (startHour + duration) > bStart;
        });
        
        if (conflict) {
            return res.status(409).json({ error: 'Time slot conflict with existing booking' });
        }
        
        // Create booking
        const booking = new Booking({ 
            date, startTime, duration, bandName, email, price, endTime 
        });
        await booking.save();
        
        // Update slot availability
        slot.booked += 1;
        await slot.save();
        
        // Create notification
        const notification = new Notification({
            email,
            type: 'booking_confirmation',
            message: `Your booking for ${date} at ${startTime} has been confirmed.`,
            bookingId: booking._id
        });
        await notification.save();
        
        res.json({ success: true, booking });
    } catch (error) {
        console.error('Booking error:', error);
        res.status(500).json({ error: 'Server error creating booking' });
    }
});

app.get('/api/user/bookings', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email required' });
        const bookings = await Booking.find({ email }).sort({ date: -1, startTime: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Error fetching user bookings:', error);
        res.status(500).json({ error: 'Server error fetching bookings' });
    }
});

app.delete('/api/bookings/:id', async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        // Free up the slot
        const slot = await Slot.findOne({ date: booking.date, time: booking.startTime });
        if (slot) {
            slot.booked = Math.max(0, slot.booked - 1);
            await slot.save();
        }
        
        await Booking.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ error: 'Server error deleting booking' });
    }
});

// --- Authentication Endpoints ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
        const user = await User.findOne({ email, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });
        res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

app.post('/api/signup', async (req, res) => {
    try {
        console.log('Signup request body:', req.body);
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        
        const user = new User({ name, email, password });
        await user.save();
        res.json({ success: true, user: { name: user.name, email: user.email } });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

// --- Slot Management Endpoints ---
app.get('/api/slots', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) query.date = date;
        
        const slots = await Slot.find(query);
        res.json({ success: true, slots });
    } catch (error) {
        console.error('Error fetching slots:', error);
        res.status(500).json({ error: 'Server error fetching slots' });
    }
});

app.post('/api/admin/slots', async (req, res) => {
    try {
        const { date, time, capacity, isBlocked } = req.body;
        
        let slot = await Slot.findOne({ date, time });
        if (slot) {
            slot.capacity = capacity;
            slot.isBlocked = isBlocked;
        } else {
            slot = new Slot({ date, time, capacity, isBlocked });
        }
        
        await slot.save();
        res.json({ success: true, slot });
    } catch (error) {
        console.error('Error updating slot:', error);
        res.status(500).json({ error: 'Server error updating slot' });
    }
});

app.post('/api/admin/block-date', async (req, res) => {
    try {
        const { date, isBlocked } = req.body;
        
        // Block all time slots for this date
        await Slot.updateMany(
            { date }, 
            { isBlocked },
            { upsert: true, setDefaultsOnInsert: true }
        );
        
        res.json({ success: true, message: `Date ${date} ${isBlocked ? 'blocked' : 'unblocked'} successfully` });
    } catch (error) {
        console.error('Error blocking date:', error);
        res.status(500).json({ error: 'Server error blocking date' });
    }
});

// --- Notification Endpoints ---
app.get('/api/notifications', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email required' });
        
        const notifications = await Notification.find({ email }).sort({ createdAt: -1 });
        res.json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Server error fetching notifications' });
    }
});

// --- Admin Endpoints ---
app.get('/api/admin/bookings', async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ date: -1, startTime: -1 });
        res.json({ success: true, bookings });
    } catch (error) {
        console.error('Error fetching admin bookings:', error);
        res.status(500).json({ error: 'Server error fetching bookings' });
    }
});

app.get('/api/admin/revenue', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let matchStage = {};
        
        if (startDate && endDate) {
            matchStage.date = {
                $gte: startDate,
                $lte: endDate
            };
        }
        
        const revenueData = await Booking.aggregate([
            { $match: matchStage },
            { 
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$price" },
                    totalBookings: { $sum: 1 },
                    averageBookingValue: { $avg: "$price" }
                }
            }
        ]);
        
        const busySlots = await Booking.aggregate([
            { $match: matchStage },
            { 
                $group: {
                    _id: { date: "$date", time: "$startTime" },
                    count: { $sum: 1 },
                    totalRevenue: { $sum: "$price" }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);
        
        const result = {
            totalRevenue: revenueData.length > 0 ? revenueData[0].totalRevenue : 0,
            totalBookings: revenueData.length > 0 ? revenueData[0].totalBookings : 0,
            averageBookingValue: revenueData.length > 0 ? revenueData[0].averageBookingValue : 0,
            busySlots
        };
        
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error fetching revenue:', error);
        res.status(500).json({ error: 'Server error fetching revenue' });
    }
});

// --- Optional: Gallery & Rate Card Endpoints ---
app.get('/api/gallery', (req, res) => {
    res.json({ 
        success: true,
        images: [
            { url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4", title: "Jam Room 1" },
            { url: "https://images.unsplash.com/photo-1465101046530-73398c7f28ca", title: "Jam Room 2" },
            { url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb", title: "Jam Room 3" }
        ], 
        videos: [
            { thumbnail: "https://instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png", url: "https://www.instagram.com/p/XXXXXXXXX/" },
            { thumbnail: "https://instagram.com/static/images/ico/favicon-192.png/68d99ba29cc8.png", url: "https://www.instagram.com/p/YYYYYYYYY/" }
        ] 
    });
});

app.get('/api/ratecard', (req, res) => {
    res.json({ 
        success: true,
        rates: [
            { hours: 1, price: 25 },
            { hours: 2, price: 45 },
            { hours: 3, price: 65 },
            { hours: 4, price: 80 },
            { hours: 5, price: 95 },
            { hours: 6, price: 110 },
            { hours: 7, price: 125 },
            { hours: 8, price: 140 }
        ] 
    });
});

// Initialize default slots for today + 30 days
async function initializeSlots() {
    try {
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            
            for (const time of timeSlots) {
                const existingSlot = await Slot.findOne({ date: dateStr, time });
                if (!existingSlot) {
                    const slot = new Slot({ 
                        date: dateStr, 
                        time,
                        capacity: 1,
                        booked: 0,
                        isBlocked: false
                    });
                    await slot.save();
                }
            }
        }
        console.log('Slots initialized successfully');
    } catch (error) {
        console.error('Error initializing slots:', error);
    }
}

// Initialize slots when server starts
initializeSlots();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});