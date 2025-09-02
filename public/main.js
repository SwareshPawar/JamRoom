// Application State
let currentUser = null;
let isAdmin = false;
let currentDate = new Date();
let selectedDate = null;
let selectedTimeSlot = null;
let bookings = [];
let slotAvailability = {};

// Available time slots (24-hour format)
const timeSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
];

// Pricing
const pricing = {
    1: 25, 2: 45, 3: 65, 4: 80, 5: 95, 6: 110, 7: 125, 8: 140
};

// DOM Elements
const elements = {
    welcomeSection: document.getElementById('welcomeSection'),
    bookingSection: document.getElementById('bookingSection'),
    userDashboard: document.getElementById('userDashboard'),
    adminDashboard: document.getElementById('adminDashboard'),
    loginBtn: document.getElementById('loginBtn'),
    signupBtn: document.getElementById('signupBtn'),
    adminBtn: document.getElementById('adminBtn'),
    loginModal: document.getElementById('loginModal'),
    signupModal: document.getElementById('signupModal'),
    confirmationModal: document.getElementById('confirmationModal'),
    calendar: document.getElementById('calendar'),
    currentMonth: document.getElementById('currentMonth'),
    timeSlots: document.getElementById('timeSlots'),
    timeSlotsGrid: document.getElementById('timeSlotsGrid'),
    userBookings: document.getElementById('userBookings'),
    adminBookings: document.getElementById('adminBookings')
};

// Initialize Application
function init() {
    fetchAndRenderCalendar();
    setupEventListeners();
    showWelcome();
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('homeLogo')?.addEventListener('click', function() {
        hideAllSections();
        elements.welcomeSection.classList.remove('hidden');
    });

    elements.loginBtn.addEventListener('click', function() {
        showModal('loginModal');
    });
    
    elements.signupBtn.addEventListener('click', function() {
        showModal('signupModal');
    });
    
    elements.adminBtn.addEventListener('click', function() {
        hideAllSections();
        toggleAdminMode();
    });

    // Modal controls
    document.getElementById('closeLoginModal').addEventListener('click', () => hideModal('loginModal'));
    document.getElementById('closeSignupModal').addEventListener('click', () => hideModal('signupModal'));
    document.getElementById('closeConfirmationModal').addEventListener('click', () => hideModal('confirmationModal'));

    // Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);

    // Calendar navigation
    document.getElementById('prevMonth').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonth').addEventListener('click', () => changeMonth(1));

    // Booking
    document.getElementById('bookingDuration').addEventListener('change', updatePrice);
    document.getElementById('confirmBooking').addEventListener('click', confirmBooking);
    
    // Dashboard
    document.getElementById('newBookingBtn')?.addEventListener('click', showBooking);
    document.getElementById('bookNowBtn')?.addEventListener('click', showBooking);
    document.getElementById('closeCalendarBtn')?.addEventListener('click', function() {
        elements.bookingSection.classList.add('hidden');
        elements.welcomeSection.classList.remove('hidden');
    });
    
    // Admin controls
    document.getElementById('blockDateBtn')?.addEventListener('click', showBlockDateModal);
    document.getElementById('setHoursBtn')?.addEventListener('click', showSetHoursModal);
    document.getElementById('viewRevenueBtn')?.addEventListener('click', showRevenueReport);
    
    // Form validation
    document.getElementById('bandName').addEventListener('input', validateBookingForm);
    document.getElementById('contactEmail').addEventListener('input', validateBookingForm);
}

// Show/Hide Functions
function showWelcome() {
    hideAllSections();
    elements.welcomeSection.classList.remove('hidden');
}

function showBooking() {
    hideAllSections();
    elements.bookingSection.classList.remove('hidden');
    fetchAndRenderCalendar();
}

function showUserDashboard() {
    hideAllSections();
    elements.userDashboard.classList.remove('hidden');
    renderUserBookings();
}

function showAdminDashboard() {
    hideAllSections();
    elements.adminDashboard.classList.remove('hidden');
    renderAdminBookings();
}

function hideAllSections() {
    // Defensive null checks for all sections in hideAllSections
    elements.welcomeSection?.classList.add('hidden');
    elements.bookingSection?.classList.add('hidden');
    elements.userDashboard?.classList.add('hidden');
    elements.adminDashboard?.classList.add('hidden');
}

function showModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    document.getElementById(modalId).classList.add('flex');
}

function hideModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
    document.getElementById(modalId).classList.remove('flex');
}

// Authentication
async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;
    
    const result = await safeFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });
    
    if (result.success) {
        currentUser = result.user;
        updateNavigation();
        hideModal('loginModal');
        showUserDashboard();
    } else {
        alert(result.error || 'Login failed');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    const name = e.target.querySelector('input[type="text"]').value;
    const email = e.target.querySelector('input[type="email"]').value;
    const password = e.target.querySelector('input[type="password"]').value;
    
    const result = await safeFetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
    });
    
    if (result.success) {
        currentUser = result.user;
        updateNavigation();
        hideModal('signupModal');
        showUserDashboard();
    } else {
        alert(result.error || 'Signup failed');
    }
}

function toggleAdminMode() {
    isAdmin = !isAdmin;
    if (isAdmin) {
        currentUser = { email: 'admin@jamspace.com', name: 'Admin' };
        showAdminDashboard();
    } else {
        showWelcome();
    }
    updateNavigation();
}

function updateNavigation() {
    if (currentUser) {
        elements.loginBtn.textContent = currentUser.name;
        elements.signupBtn.textContent = 'Logout';
        elements.signupBtn.onclick = logout;
    } else {
        elements.loginBtn.textContent = 'Login';
        elements.signupBtn.textContent = 'Sign Up';
        elements.signupBtn.onclick = () => showModal('signupModal');
    }
}

function logout() {
    currentUser = null;
    isAdmin = false;
    updateNavigation();
    showWelcome();
}

// Calendar Functions
async function fetchAndRenderCalendar() {
    const result = await safeFetch('/api/availability');
    if (result.success) {
        bookings = result.bookings || [];
        // Convert slots array to object for easier access
        if (result.slots) {
            slotAvailability = {};
            result.slots.forEach(slot => {
                if (!slotAvailability[slot.date]) {
                    slotAvailability[slot.date] = {};
                }
                slotAvailability[slot.date][slot.time] = slot;
            });
        }
    } else {
        bookings = [];
        slotAvailability = {};
    }
    renderCalendar();
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    elements.currentMonth.textContent = new Date(year, month).toLocaleDateString('en-US', { 
        month: 'long', 
        year: 'numeric' 
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let calendarHTML = '';
    
    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        calendarHTML += `<div class="text-center font-semibold text-gray-600 py-2">${day}</div>`;
    });

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        calendarHTML += `<div class="calendar-day"></div>`;
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const isPast = new Date(dateStr) < new Date().setHours(0,0,0,0);
        const hasBookings = bookings.some(b => b.date === dateStr);
        
        // Check if date is blocked
        const isBlocked = slotAvailability[dateStr] && 
            Object.values(slotAvailability[dateStr]).some(slot => slot.isBlocked);
        
        calendarHTML += `
            <div class="calendar-day border border-gray-200 rounded-lg p-2 cursor-pointer hover:bg-gray-50 
                ${isToday ? 'bg-blue-50 border-blue-300' : ''} 
                ${isPast || isBlocked ? 'opacity-50 cursor-not-allowed' : ''}" 
                 onclick="${isPast || isBlocked ? '' : `selectDate('${dateStr}')`}">
                    <div class="font-semibold ${isToday ? 'text-blue-600' : ''}">${day}</div>
                    ${hasBookings ? '<div class="w-2 h-2 bg-red-400 rounded-full mt-1"></div>' : ''}
                    ${isBlocked ? '<div class="w-2 h-2 bg-gray-600 rounded-full mt-1"></div>' : ''}
            </div>
        `;
    }

    elements.calendar.innerHTML = calendarHTML;
}

function changeMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    fetchAndRenderCalendar();
}

async function selectDate(dateStr) {
    selectedDate = dateStr;
    document.getElementById('selectedDate').textContent = new Date(dateStr).toLocaleDateString();
    document.getElementById('bookingDate').value = new Date(dateStr).toLocaleDateString();
    
    // Fetch latest availability for this date
    const result = await safeFetch(`/api/availability?date=${dateStr}`);
    if (result.success) {
        bookings = result.bookings || [];
        if (result.slots) {
            slotAvailability[dateStr] = {};
            result.slots.forEach(slot => {
                slotAvailability[dateStr][slot.time] = slot;
            });
        }
    }
    
    renderTimeSlots(dateStr);
    elements.timeSlots.classList.remove('hidden');
}

function renderTimeSlots(dateStr) {
    const dayBookings = bookings.filter(b => b.date === dateStr);
    let slotsHTML = '';

    timeSlots.forEach(time => {
        // Check slot availability
        let available = true;
        let capacity = 1;
        let booked = 0;
        let isBlocked = false;
        
        if (slotAvailability[dateStr] && slotAvailability[dateStr][time]) {
            const slot = slotAvailability[dateStr][time];
            capacity = slot.capacity;
            booked = slot.booked;
            isBlocked = slot.isBlocked;
            available = booked < capacity && !isBlocked;
        }
        
        // Also check for conflicts with existing bookings
        const isBooked = dayBookings.some(booking => {
            const bookingStart = parseInt(booking.startTime.split(':')[0]);
            const bookingEnd = parseInt(booking.endTime.split(':')[0]);
            const slotTime = parseInt(time.split(':')[0]);
            return slotTime >= bookingStart && slotTime < bookingEnd;
        });

        available = available && !isBooked;
        
        slotsHTML += `
            <button class="time-slot p-3 rounded-lg font-semibold text-center ${available ? 
                'bg-green-100 text-green-800 hover:bg-green-200' : 
                'bg-red-100 text-red-800 cursor-not-allowed'}" 
                onclick="${available ? `selectTimeSlot('${time}')` : ''}"
                ${available ? '' : 'disabled'}>
                ${time} ${available ? 
                    `(${capacity - booked}/${capacity} available)` : 
                    '(Booked)'}
            </button>
        `;
    });

    elements.timeSlotsGrid.innerHTML = slotsHTML;
}

function selectTimeSlot(time) {
    selectedTimeSlot = time;
    document.getElementById('bookingStartTime').value = time;
    
    // Highlight selected time slot
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('bg-primary', 'text-white');
        if (slot.textContent.includes(time) && !slot.disabled) {
            slot.classList.add('bg-primary', 'text-white');
        }
    });
    
    validateBookingForm();
}

function updatePrice() {
    const duration = parseInt(document.getElementById('bookingDuration').value);
    const price = pricing[duration] || 0;
    document.getElementById('totalPrice').textContent = `$${price}`;
    validateBookingForm();
}

function validateBookingForm() {
    const duration = document.getElementById('bookingDuration').value;
    const bandName = document.getElementById('bandName').value;
    const email = document.getElementById('contactEmail').value;
    
    const isValid = selectedDate && selectedTimeSlot && duration && bandName && email;
    document.getElementById('confirmBooking').disabled = !isValid;
}

// Booking Functions
async function confirmBooking() {
    const duration = parseInt(document.getElementById('bookingDuration').value);
    const bandName = document.getElementById('bandName').value;
    const email = document.getElementById('contactEmail').value;
    const price = pricing[duration];

    const bookingData = {
        date: selectedDate,
        startTime: selectedTimeSlot,
        duration: duration,
        bandName: bandName,
        email: email,
        price: price
    };

    // Show loading state
    const confirmBtn = document.getElementById('confirmBooking');
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = 'Processing...';
    confirmBtn.disabled = true;

    const result = await safeFetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
    });

    // Restore button state
    confirmBtn.textContent = originalText;
    confirmBtn.disabled = false;

    if (result.success) {
        // Show confirmation
        document.getElementById('confirmationDetails').innerHTML = `
            <p><strong>Band:</strong> ${bandName}</p>
            <p><strong>Date:</strong> ${new Date(selectedDate).toLocaleDateString()}</p>
            <p><strong>Time:</strong> ${selectedTimeSlot}</p>
            <p><strong>Duration:</strong> ${duration} hours</p>
            <p><strong>Total:</strong> $${price}</p>
        `;
        
        showModal('confirmationModal');
        
        // Reset form and refresh data
        resetBookingForm();
        fetchAndRenderCalendar();
    } else {
        // Error is already shown by safeFetch, but we can handle specific cases
        if (result.error && result.error.includes('conflict')) {
            // Refresh availability when there's a conflict
            fetchAndRenderCalendar();
        }
    }
}

function resetBookingForm() {
    document.getElementById('bookingDuration').value = '';
    document.getElementById('bandName').value = '';
    document.getElementById('contactEmail').value = '';
    document.getElementById('totalPrice').textContent = '$0';
    document.getElementById('confirmBooking').disabled = true;
    
    // Clear selections
    selectedTimeSlot = null;
    document.getElementById('bookingStartTime').value = '';
    
    document.querySelectorAll('.time-slot').forEach(slot => {
        slot.classList.remove('bg-primary', 'text-white');
    });
}

// User Bookings
async function renderUserBookings() {
    if (!currentUser) return;
    
    const result = await safeFetch(`/api/user/bookings?email=${currentUser.email}`);
    const userBookings = result.success ? result.bookings : [];
    
    if (userBookings.length === 0) {
        elements.userBookings.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <div class="text-4xl mb-4">🎵</div>
                <p>No bookings yet. Ready to jam?</p>
            </div>
        `;
        return;
    }

    let bookingsHTML = '';
    userBookings.forEach(booking => {
        bookingsHTML += `
            <div class="booking-slot bg-gray-50 p-4 rounded-lg border">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-semibold text-lg">${booking.bandName}</h4>
                        <p class="text-gray-600">${new Date(booking.date).toLocaleDateString()} at ${booking.startTime}</p>
                        <p class="text-gray-600">${booking.duration} hours - $${booking.price}</p>
                    </div>
                    <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        ${booking.status}
                    </span>
                </div>
                <button class="mt-2 text-red-600 hover:text-red-800 text-sm" onclick="cancelBooking('${booking._id}')">
                    Cancel Booking
                </button>
            </div>
        `;
    });

    elements.userBookings.innerHTML = bookingsHTML;
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    
    const result = await safeFetch(`/api/bookings/${bookingId}`, {
        method: 'DELETE'
    });
    
    if (result.success) {
        alert('Booking cancelled successfully');
        renderUserBookings();
        fetchAndRenderCalendar();
    } else {
        alert('Error cancelling booking: ' + result.error);
    }
}

// Admin Functions
async function renderAdminBookings() {
    const result = await safeFetch('/api/admin/bookings');
    const allBookings = result.success ? result.bookings : [];
    
    if (allBookings.length === 0) {
        elements.adminBookings.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p>No bookings to display.</p>
            </div>
        `;
        return;
    }

    let bookingsHTML = '';
    allBookings.forEach(booking => {
        bookingsHTML += `
            <div class="booking-slot bg-gray-50 p-4 rounded-lg border">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-semibold">${booking.bandName}</h4>
                        <p class="text-sm text-gray-600">${booking.email}</p>
                        <p class="text-gray-600">${new Date(booking.date).toLocaleDateString()} at ${booking.startTime}</p>
                        <p class="text-gray-600">${booking.duration} hours - $${booking.price}</p>
                    </div>
                    <div class="text-right">
                        <span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                            ${booking.status}
                        </span>
                        <button class="block mt-2 text-red-600 hover:text-red-800 text-sm" onclick="cancelBooking('${booking._id}')">
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    elements.adminBookings.innerHTML = bookingsHTML;
}

function showBlockDateModal() {
    const modalHTML = `
        <div id="blockDateModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4">
                <h2 class="text-2xl font-bold mb-6">Block Date</h2>
                <div class="space-y-4">
                    <input type="date" id="blockDateInput" class="w-full p-3 border border-gray-300 rounded-lg">
                    <div class="flex space-x-4">
                        <button onclick="adminBlockDate(true)" class="flex-1 bg-red-500 text-white py-2 rounded-lg">Block</button>
                        <button onclick="adminBlockDate(false)" class="flex-1 bg-green-500 text-white py-2 rounded-lg">Unblock</button>
                    </div>
                </div>
                <button onclick="hideModal('blockDateModal')" class="mt-4 text-gray-500 hover:text-gray-700">Close</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

async function adminBlockDate(shouldBlock) {
    const date = document.getElementById('blockDateInput').value;
    if (!date) {
        alert('Please select a date');
        return;
    }
    
    const result = await safeFetch('/api/admin/block-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, isBlocked: shouldBlock })
    });
    
    if (result.success) {
        alert(`Date ${date} ${shouldBlock ? 'blocked' : 'unblocked'} successfully`);
        hideModal('blockDateModal');
        fetchAndRenderCalendar();
    } else {
        alert('Error: ' + result.error);
    }
}

function showSetHoursModal() {
    alert('Slot management feature coming soon!');
}

async function showRevenueReport() {
    const startDate = prompt('Enter start date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!startDate) return;
    
    const endDate = prompt('Enter end date (YYYY-MM-DD):', new Date().toISOString().split('T')[0]);
    if (!endDate) return;
    
    const result = await safeFetch(`/api/admin/revenue?startDate=${startDate}&endDate=${endDate}`);
    if (result.success) {
        const reportHTML = `
            <div class="bg-white p-4 rounded-lg shadow">
                <h3 class="text-lg font-semibold mb-4">Revenue Report (${startDate} to ${endDate})</h3>
                <div class="space-y-2">
                    <p><strong>Total Revenue:</strong> $${result.totalRevenue}</p>
                    <p><strong>Total Bookings:</strong> ${result.totalBookings}</p>
                    <p><strong>Average Booking Value:</strong> $${result.averageBookingValue.toFixed(2)}</p>
                </div>
                <h4 class="font-semibold mt-4 mb-2">Busiest Time Slots:</h4>
                <div class="space-y-2">
                    ${result.busySlots.map(slot => `
                        <p>${slot._id.date} at ${slot._id.time}: ${slot.count} bookings ($${slot.totalRevenue})</p>
                    `).join('')}
                </div>
            </div>
        `;
        
        // Create or update report display
        let reportDisplay = document.getElementById('reportDisplay');
        if (!reportDisplay) {
            reportDisplay = document.createElement('div');
            reportDisplay.id = 'reportDisplay';
            reportDisplay.className = 'mt-4';
            elements.adminBookings.parentNode.insertBefore(reportDisplay, elements.adminBookings);
        }
        reportDisplay.innerHTML = reportHTML;
    } else {
        alert('Error generating report: ' + result.error);
    }
}

// Helper Functions
const BACKEND_URL = 'http://127.0.0.1:5000';
async function safeFetch(url, options) {
    try {
        const res = await fetch(BACKEND_URL + url, options);
        if (!res.ok) {
            // Try to get error message from response
            let errorMsg = 'Server error';
            try {
                const errorData = await res.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                errorMsg = `HTTP ${res.status} ${res.statusText}`;
            }
            throw new Error(errorMsg);
        }
        return await res.json();
    } catch (err) {
        console.error('Fetch error:', err);
        showError(err.message || 'Backend is not available. Please try again later.');
        return { success: false, error: err.message };
    }
}

// Error Handling Functions
function showError(message, duration = 5000) {
    const errorBanner = document.getElementById('errorBanner');
    const errorMessage = document.getElementById('errorMessage');
    
    errorMessage.textContent = message;
    errorBanner.classList.remove('hidden');
    
    // Auto-hide after duration
    if (duration > 0) {
        setTimeout(() => {
            hideError();
        }, duration);
    }
}

function hideError() {
    const errorBanner = document.getElementById('errorBanner');
    errorBanner.classList.add('hidden');
}

// Make functions available globally for HTML onclick attributes
window.selectTimeSlot = selectTimeSlot;
window.cancelBooking = cancelBooking;
window.adminBlockDate = adminBlockDate;

// Initialize the application
init();