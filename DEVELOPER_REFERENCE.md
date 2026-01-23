# 🧑‍💻 Developer Reference Guide - JamRoom Booking System

> **📌 PURPOSE**: This document serves as the **single source of truth** for naming conventions, architecture patterns, and development standards. **ALWAYS REFERENCE THIS BEFORE ADDING NEW FEATURES** to maintain consistency.

---

## 🏗️ **ARCHITECTURE OVERVIEW**

### **Core Patterns**
- **MVC Architecture**: Models → Routes → Controllers → Views
- **JWT Authentication**: Bearer token in Authorization header
- **RESTful APIs**: Standard HTTP methods (GET, POST, PUT, DELETE)
- **MongoDB ODM**: Mongoose with schema validation
- **Email System**: Nodemailer with calendar invites
- **Frontend**: Vanilla JS (No frameworks) - ES6+ with modern patterns

---

## 🎨 **FRONTEND DEVELOPMENT PATTERNS**

### **Core Frontend Architecture**
```javascript
// Global Constants Pattern
const API_URL = window.location.origin;
let currentUser = null;
let settings = null;

// Utility Functions Pattern  
const showAlert = (message, type = 'info') => { /* ... */ };
const formatDate = (dateStr) => { /* ... */ };
const formatTime = (time) => { /* ... */ };
const checkAuth = async () => { /* ... */ };
```

### **CSS Design System**
```css
/* Color Variables */
--primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
--text-primary: #2c3e50;
--text-secondary: #4a5568;
--text-muted: #718096;

/* Component Classes */
.btn { /* Base button styles */ }
.btn-primary { /* Primary button variant */ }
.btn-secondary { /* Secondary button variant */ }
.alert { /* Base alert styles */ }
.alert-success { /* Success alert variant */ }
.alert-error { /* Error alert variant */ }
```

---

## 📝 **NAMING CONVENTIONS**

### **1. VARIABLES & FUNCTIONS**

#### **Backend Variables (camelCase)**
```javascript
// ✅ CORRECT PATTERNS
const userId = req.user._id;
const bookingData = req.body;
const startTime = booking.startTime;
const endTime = booking.endTime;
const totalAmount = booking.price;
const bookingStatus = 'PENDING'; // ENUM values in UPPERCASE
const paymentStatus = 'PENDING';
const rentalType = 'JamRoom';
const userName = user.name;
const userEmail = user.email;
const adminEmails = settings.adminEmails;

// ❌ AVOID THESE
const user_id, start_time, end_time; // No snake_case
const bookingstatus, paymentstatus; // No lowercase enums
const rental_type, user_name; // Inconsistent casing
```

#### **Frontend Variables (camelCase)**
```javascript
// ✅ CORRECT PATTERNS
let currentUser = null;
let selectedDate = null;
let selectedStartTime = '';
let selectedEndTime = '';
let calculatedPrice = 0;
let bookingFormData = {};
let availableSlots = [];
let myBookings = [];
let adminBookings = [];

// DOM Elements (descriptive names)
const bookingForm = document.getElementById('bookingForm');
const priceDisplay = document.getElementById('priceDisplay');
const loadingOverlay = document.getElementById('loadingOverlay');
```

#### **Function Names (camelCase + Descriptive)**
```javascript
// ✅ CORRECT PATTERNS
async function loadUserBookings() { }
async function calculateBookingPrice() { }
async function checkSlotAvailability() { }
async function sendConfirmationEmail() { }
async function generateCalendarInvite() { }
async function updateBookingStatus() { }
async function validateBookingForm() { }
async function fetchAdminSettings() { }

// ❌ AVOID THESE
function getBookings() // Too generic
function calcPrice() // Abbreviated
function checkSlots() // Not descriptive enough
```

### **2. API ENDPOINTS**

#### **URL Structure Pattern**
```javascript
// ✅ CORRECT PATTERNS
/api/auth/register         // Authentication routes
/api/auth/login
/api/auth/forgot-password
/api/auth/reset-password
/api/auth/me

/api/bookings             // Resource-based routes
/api/bookings/my-bookings
/api/bookings/:id
/api/bookings/:id/cancel

/api/admin/bookings       // Admin prefixed routes
/api/admin/bookings/:id/approve
/api/admin/bookings/:id/reject
/api/admin/bookings/:id/edit
/api/admin/stats
/api/admin/settings

/api/slots               // Simple resource routes
/api/slots/bulk
/api/slots/:id
```

#### **Request/Response Naming**
```javascript
// ✅ CORRECT REQUEST BODIES
{
  "date": "2026-01-25",           // ISO date format
  "startTime": "14:00",           // 24-hour format
  "endTime": "16:00",
  "duration": 2,                  // Number in hours
  "rentalType": "JamRoom",        // Exact rental type name
  "totalAmount": 600,             // Final calculated price
  "userName": "John Doe",
  "userEmail": "john@example.com",
  "bandName": "Rock Stars",       // Optional
  "notes": "Birthday party"       // Optional
}

// ✅ CORRECT RESPONSE STRUCTURES
{
  "success": true,
  "message": "Booking created successfully",
  "data": {
    "_id": "bookingId",
    "bookingStatus": "PENDING",    // ENUM: PENDING|CONFIRMED|REJECTED|CANCELLED
    "paymentStatus": "PENDING",    // ENUM: PENDING|PAID|REFUNDED
    "createdAt": "2026-01-25T10:30:00.000Z"
  }
}
```

### **3. DATABASE SCHEMA FIELDS**

#### **User Model Fields**
```javascript
// models/User.js - EXACT FIELD NAMES
{
  name: String,           // User's full name
  email: String,          // Lowercase, unique
  password: String,       // Hashed with bcrypt
  role: String,           // 'user' | 'admin'
  createdAt: Date
}
```

#### **Booking Model Fields**
```javascript
// models/Booking.js - EXACT FIELD NAMES
{
  userId: ObjectId,           // Reference to User._id
  date: Date,                 // Booking date
  startTime: String,          // Format: "HH:MM" (24-hour)
  endTime: String,            // Format: "HH:MM" (24-hour)
  duration: Number,           // Hours as number
  rentalType: String,         // Exact rental type name
  price: Number,              // Total calculated price
  bookingStatus: String,      // 'PENDING'|'CONFIRMED'|'REJECTED'|'CANCELLED'
  paymentStatus: String,      // 'PENDING'|'PAID'|'REFUNDED'
  userName: String,           // User's name (denormalized)
  userEmail: String,          // User's email (denormalized)
  bandName: String,           // Optional band name
  notes: String,              // Optional booking notes
  createdAt: Date,            // Auto-generated
  updatedAt: Date             // Auto-updated
}
```

#### **AdminSettings Model Fields**
```javascript
// models/AdminSettings.js - EXACT FIELD NAMES
{
  rentalTypes: [{
    name: String,             // "JamRoom", "Instruments", etc.
    description: String,
    basePrice: Number,
    subItems: [{              // Enhanced rental system
      name: String,
      price: Number,
      rentalType: String,     // 'inhouse'|'perday'
      perdayPrice: Number
    }]
  }],
  prices: {
    hourlyRate: Number,       // Base hourly rate
    instrumentsRate: Number,
    soundSystemRate: Number
  },
  upiId: String,              // UPI payment ID
  upiName: String,            // UPI account name
  adminEmails: [String],      // Array of admin email addresses
  studioName: String,         // Studio name for branding
  studioAddress: String,      // Full address for calendar
  businessHours: {
    startTime: String,        // "09:00"
    endTime: String          // "22:00"
  },
  createdAt: Date,
  updatedAt: Date
}
```

---

## 📁 **FILE STRUCTURE & LOCATIONS**

### **Backend Files (Where to Add Code)**

#### **Routes** (`/routes/`)
```javascript
// auth.routes.js - Authentication endpoints
// booking.routes.js - User booking operations
// admin.routes.js - Admin operations
// slot.routes.js - Time slot management

// ✅ NEW ROUTE PATTERN
router.post('/endpoint-name', protect, async (req, res) => {
  try {
    // Implementation
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Operation failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});
```

#### **Models** (`/models/`)
```javascript
// Add new models here with Mongoose schema
// Follow existing patterns for validation and timestamps
```

#### **Middleware** (`/middleware/`)
```javascript
// auth.js - JWT token verification
// admin.js - Admin role checking
```

#### **Utils** (`/utils/`)
```javascript
// email.js - Email sending functions
// calendar.js - Calendar invite generation
// upi.js - UPI payment utilities
```

### **Frontend Files** (`/public/`)

#### **HTML Files**
```
index.html - Landing page
login.html - User login
register.html - User registration
booking.html - User booking interface ⭐ Main user functionality
admin.html - Admin dashboard ⭐ Main admin functionality
reset-password.html - Password reset
test.html - API testing suite
test-rental-system.html - Rental system tests
```

#### **JavaScript Patterns**
```javascript
// ✅ STANDARD FUNCTION PATTERNS
async function apiCall(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('token');
  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    ...(data && { body: JSON.stringify(data) })
  };
  
  const response = await fetch(`${API_URL}${endpoint}`, config);
  return await response.json();
}
```

---

## 🔧 **DEVELOPMENT PATTERNS**

### **1. Adding New API Endpoints**

#### **Step-by-Step Process**
1. **Define in appropriate route file** (`/routes/`)
2. **Add middleware** (`protect` for auth, `isAdmin` for admin)
3. **Use consistent error handling**
4. **Test with `/test.html`**
5. **Update API_DOCUMENTATION.md**

#### **Template for New Endpoints**
```javascript
// In routes file (e.g., booking.routes.js)
router.post('/new-endpoint', protect, async (req, res) => {
  try {
    const { requiredField1, requiredField2 } = req.body;
    const userId = req.user._id;
    
    // Validation
    if (!requiredField1 || !requiredField2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Required fields missing' 
      });
    }
    
    // Business logic
    const result = await SomeModel.create({
      userId,
      requiredField1,
      requiredField2,
      createdAt: new Date()
    });
    
    res.json({ 
      success: true, 
      message: 'Operation completed successfully',
      data: result 
    });
    
  } catch (error) {
    console.error('New endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});
```

### **2. Frontend Form Handling**

#### **Standard Form Submission Pattern**
```javascript
// ✅ USE THIS PATTERN FOR ALL FORMS
async function handleFormSubmission(event) {
  event.preventDefault();
  
  // Show loading state
  const submitBtn = document.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';
  
  try {
    // Collect form data
    const formData = {
      field1: document.getElementById('field1').value,
      field2: document.getElementById('field2').value
    };
    
    // Validate locally
    if (!formData.field1 || !formData.field2) {
      throw new Error('Please fill all required fields');
    }
    
    // API call
    const result = await apiCall('/api/endpoint', 'POST', formData);
    
    if (result.success) {
      // Handle success
      showSuccessMessage(result.message);
      document.getElementById('formId').reset();
      // Refresh data if needed
      await loadUpdatedData();
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    console.error('Form submission error:', error);
    showErrorMessage(error.message);
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
}
```

### **3. Database Operations**

#### **Standard CRUD Patterns**
```javascript
// ✅ CREATE
const newRecord = await Model.create({
  userId: req.user._id,
  ...data,
  createdAt: new Date()
});

// ✅ READ with population
const records = await Model.find({ userId })
  .populate('userId', 'name email')
  .sort({ createdAt: -1 });

// ✅ UPDATE
const updated = await Model.findByIdAndUpdate(
  recordId,
  { ...updateData, updatedAt: new Date() },
  { new: true }
);

// ✅ DELETE
const deleted = await Model.findByIdAndDelete(recordId);
```

---

## 🎯 **QUICK REFERENCE**

### **Common Variables by Feature**

#### **Authentication**
```javascript
// Variables to use consistently
const token = localStorage.getItem('token');
const currentUser = req.user;
const userId = req.user._id;
const userRole = req.user.role;
```

#### **Booking Operations**
```javascript
// Booking-related variables
const bookingData = {
  date,           // Date object or ISO string
  startTime,      // "HH:MM" format
  endTime,        // "HH:MM" format
  duration,       // Number of hours
  rentalType,     // Exact rental type name
  totalAmount,    // Final calculated price
  userName,       // User's full name
  userEmail       // User's email
};

const bookingStatus = 'PENDING'; // PENDING|CONFIRMED|REJECTED|CANCELLED
const paymentStatus = 'PENDING'; // PENDING|PAID|REFUNDED
```

#### **Admin Operations**
```javascript
// Admin-related variables
const adminEmails = settings.adminEmails;
const studioName = settings.studioName;
const studioAddress = settings.studioAddress;
const businessHours = settings.businessHours;
```

### **Database Collections**
```javascript
// Collection names (MongoDB)
'users'           // User accounts
'bookings'        // Booking records
'adminsettings'   // System settings (single document)
'blockedtimes'    // Blocked time slots
'slots'           // Available time slots
```

### **Environment Variables**
```bash
# Required variables (keep these names exactly)
MONGODB_URI=     # MongoDB connection string
JWT_SECRET=      # JWT signing secret
EMAIL_USER=      # SMTP email address
EMAIL_PASS=      # SMTP email password
BASE_URL=        # Application base URL
PORT=           # Server port (default: 5000)
UPI_ID=         # UPI payment ID
UPI_NAME=       # UPI account name
```

---

## 🌐 **COMPREHENSIVE FRONTEND PATTERNS**

### **1. GLOBAL VARIABLES (Standard Patterns)**
```javascript
// ✅ REQUIRED GLOBAL CONSTANTS
const API_URL = window.location.origin;
let currentUser = null;
let settings = null;

// ✅ PAGE-SPECIFIC GLOBALS (booking.html)
let selectedDate = null;
let selectedStartTime = '';
let selectedEndTime = '';
let selectedDuration = 1;
let selectedRentals = [];
let availableSlots = [];

// ✅ ADMIN PAGE GLOBALS (admin.html)
let allBookings = [];
let statsData = null;
let calendarInstance = null;
```

### **2. FUNCTION NAMING PATTERNS**
```javascript
// ✅ UTILITY FUNCTIONS (Always prefix with action)
const showAlert = (message, type = 'info') => { /* ... */ };
const hideAlert = () => { /* ... */ };
const showLoading = (message = 'Loading...') => { /* ... */ };
const hideLoading = () => { /* ... */ };
const formatDate = (dateStr) => { /* ... */ };
const formatTime = (time) => { /* ... */ };
const calculateEndTime = (startTime, duration) => { /* ... */ };

// ✅ AUTH FUNCTIONS
const checkAuth = async () => { /* ... */ };
const logout = () => { /* ... */ };

// ✅ API CALL FUNCTIONS (prefix: fetch/load/get/create/update/delete)
const fetchBookings = async () => { /* ... */ };
const loadSettings = async () => { /* ... */ };
const createBooking = async (bookingData) => { /* ... */ };
const updateBooking = async (id, data) => { /* ... */ };
const deleteBooking = async (id) => { /* ... */ };

// ✅ DOM MANIPULATION FUNCTIONS (prefix: render/update/toggle/show/hide)
const renderBookingSlots = (slots) => { /* ... */ };
const updateTimeSlots = () => { /* ... */ };
const toggleSection = (sectionId) => { /* ... */ };
const showModal = (modalId) => { /* ... */ };
const hideModal = (modalId) => { /* ... */ };

// ✅ VALIDATION FUNCTIONS (prefix: validate/check/verify)
const validateBookingForm = () => { /* ... */ };
const checkTimeAvailability = (date, time) => { /* ... */ };
const verifyPayment = (data) => { /* ... */ };
```

### **3. DOM ELEMENT ID CONVENTIONS**
```html
<!-- ✅ FORM ELEMENTS -->
<input id="email" name="email" type="email">
<input id="password" name="password" type="password">
<input id="name" name="name" type="text">
<input id="confirmPassword" name="confirmPassword" type="password">

<!-- ✅ BUTTONS (prefix: btn + Action) -->
<button id="loginBtn">Login</button>
<button id="submitBtn">Submit</button>
<button id="logoutBtn">Logout</button>
<button id="saveBtn">Save</button>
<button id="cancelBtn">Cancel</button>

<!-- ✅ CONTAINERS (suffix: Container/Section/List) -->
<div id="alertContainer"></div>
<div id="bookingContainer"></div>
<div id="timeSlotContainer"></div>
<div id="rentalsList"></div>

<!-- ✅ DISPLAYS (prefix: show/display OR descriptive name) -->
<div id="userName"></div>
<div id="totalPrice"></div>
<div id="selectedDate"></div>
<div id="bookingStatus"></div>

<!-- ✅ MODALS (suffix: Modal) -->
<div id="confirmModal"></div>
<div id="bookingModal"></div>
<div id="settingsModal"></div>

<!-- ✅ ALERTS & NOTIFICATIONS -->
<div id="alert"></div>
<div id="alertBackdrop"></div>
<div id="centeredAlert"></div>
<div id="centeredAlertMessage"></div>

<!-- ✅ LOADING STATES -->
<div id="loadingOverlay"></div>
<div id="loadingMessage"></div>
```

### **4. CSS CLASS NAMING CONVENTIONS**
```css
/* ✅ COMPONENT CLASSES (BEM-inspired) */
.btn { /* Base button */ }
.btn-primary { /* Primary variant */ }
.btn-secondary { /* Secondary variant */ }
.btn-success { /* Success variant */ }
.btn-warning { /* Warning variant */ }
.btn-danger { /* Danger variant */ }

/* ✅ LAYOUT CLASSES */
.container { /* Main container */ }
.header { /* Page header */ }
.topbar { /* Admin topbar */ }
.sidebar { /* Navigation sidebar */ }
.main-content { /* Main content area */ }

/* ✅ STATE CLASSES */
.hidden { /* Hide element */ }
.show { /* Show element */ }
.active { /* Active state */ }
.disabled { /* Disabled state */ }
.loading { /* Loading state */ }

/* ✅ ALERT CLASSES */
.alert { /* Base alert */ }
.alert-success { /* Success alert */ }
.alert-error { /* Error alert */ }
.alert-info { /* Info alert */ }
.alert-warning { /* Warning alert */ }

/* ✅ STATUS CLASSES */
.status-confirmed { /* Confirmed status */ }
.status-pending { /* Pending status */ }
.status-cancelled { /* Cancelled status */ }

/* ✅ UTILITY CLASSES */
.text-center { /* Center text */ }
.text-left { /* Left align text */ }
.text-right { /* Right align text */ }
.mt-10 { /* Margin top */ }
.mb-10 { /* Margin bottom */ }
.p-20 { /* Padding */ }
```

### **5. API ENDPOINTS (Complete List)**
```javascript
// ✅ AUTHENTICATION ENDPOINTS
const AUTH_ENDPOINTS = {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    ME: '/api/auth/me',
    FORGOT_PASSWORD: '/api/auth/forgot-password',
    RESET_PASSWORD: '/api/auth/reset-password'
};

// ✅ BOOKING ENDPOINTS  
const BOOKING_ENDPOINTS = {
    SETTINGS: '/api/bookings/settings',
    AVAILABILITY: '/api/bookings/availability/:date',
    CREATE: '/api/bookings',
    MY_BOOKINGS: '/api/bookings/my-bookings',
    CANCEL: '/api/bookings/:id/cancel',
    GET_BY_ID: '/api/bookings/:id'
};

// ✅ ADMIN ENDPOINTS
const ADMIN_ENDPOINTS = {
    STATS: '/api/admin/stats',
    BOOKINGS: '/api/admin/bookings',
    SETTINGS_GET: '/api/admin/settings',
    SETTINGS_UPDATE: '/api/admin/settings',
    APPROVE_BOOKING: '/api/admin/bookings/:id/approve',
    REJECT_BOOKING: '/api/admin/bookings/:id/reject',
    DELETE_BOOKING: '/api/admin/bookings/:id'
};
```

### **6. LOCALSTORAGE KEYS**
```javascript
// ✅ STANDARD LOCALSTORAGE KEYS
const STORAGE_KEYS = {
    TOKEN: 'token',           // JWT authentication token
    USER: 'user',             // User profile data
    SETTINGS: 'settings',     // App settings cache
    BOOKING_DRAFT: 'booking_draft', // Draft booking data
    THEME: 'theme',           // UI theme preference
    LAST_LOGIN: 'last_login'  // Last login timestamp
};

// ✅ USAGE PATTERNS
localStorage.setItem(STORAGE_KEYS.TOKEN, token);
const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
localStorage.removeItem(STORAGE_KEYS.TOKEN);
```

### **7. FORM FIELD NAMING**
```html
<!-- ✅ USER AUTHENTICATION FORMS -->
<input name="email" id="email" type="email" required>
<input name="password" id="password" type="password" required>
<input name="name" id="name" type="text" required>
<input name="confirmPassword" id="confirmPassword" type="password" required>

<!-- ✅ BOOKING FORMS -->
<input name="date" id="bookingDate" type="date" required>
<input name="startTime" id="startTime" type="time" required>
<input name="duration" id="duration" type="number" min="1" required>
<input name="bandName" id="bandName" type="text">
<textarea name="notes" id="bookingNotes"></textarea>

<!-- ✅ ADMIN SETTINGS FORMS -->
<input name="studioName" id="studioName" type="text" required>
<input name="studioAddress" id="studioAddress" type="text" required>
<input name="studioPhone" id="studioPhone" type="tel" required>
<input name="basePrice" id="basePrice" type="number" min="0" required>
```

### **8. EVENT HANDLER PATTERNS**
```javascript
// ✅ FORM SUBMISSION HANDLERS
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    // Handle form submission
});

// ✅ BUTTON CLICK HANDLERS  
document.getElementById('logoutBtn').addEventListener('click', () => {
    logout();
});

// ✅ INPUT CHANGE HANDLERS
document.getElementById('bookingDate').addEventListener('change', async (e) => {
    await updateAvailableSlots(e.target.value);
});

// ✅ MODAL EVENT HANDLERS
document.getElementById('showModalBtn').addEventListener('click', () => {
    showModal('confirmModal');
});

// ✅ WINDOW EVENTS
window.addEventListener('load', async () => {
    await checkAuth();
    await loadSettings();
});

// ✅ DOCUMENT READY EVENTS
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});
```

### **9. ERROR HANDLING PATTERNS**
```javascript
// ✅ ASYNC FUNCTION ERROR HANDLING
const fetchData = async () => {
    try {
        showLoading('Fetching data...');
        const response = await fetch(`${API_URL}/api/data`);
        const data = await response.json();
        
        if (data.success) {
            return data.data;
        } else {
            throw new Error(data.message || 'Request failed');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        showAlert(error.message || 'An error occurred', 'error');
        throw error;
    } finally {
        hideLoading();
    }
};

// ✅ FORM VALIDATION ERROR HANDLING
const validateForm = (formData) => {
    const errors = [];
    
    if (!formData.email) {
        errors.push('Email is required');
    }
    if (!formData.password || formData.password.length < 6) {
        errors.push('Password must be at least 6 characters');
    }
    
    if (errors.length > 0) {
        showAlert(errors.join('. '), 'error');
        return false;
    }
    
    return true;
};
```

### **10. JAVASCRIPT UTILITY PATTERNS**
```javascript
// ✅ DATE FORMATTING
const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }).format(date);
};

// ✅ TIME FORMATTING (24-hour to 12-hour)
const formatTime = (time) => {
    if (!time) return time;
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
};

// ✅ PRICE FORMATTING
const formatPrice = (amount) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(amount);
};

// ✅ DEBOUNCE UTILITY
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};
```

---

## ⚠️ **CRITICAL RULES**

### **DO's**
✅ Always use `protect` middleware for authenticated endpoints  
✅ Use `isAdmin` middleware for admin-only endpoints  
✅ Validate all input data before processing  
✅ Use consistent error response format  
✅ Add `try-catch` blocks for async operations  
✅ Update API documentation after adding endpoints  
✅ Test with `/test.html` before deploying  
✅ Use exact field names from this reference  
✅ Follow camelCase for variables and functions  
✅ Use UPPERCASE for enum values  
✅ Follow established CSS class naming patterns
✅ Use consistent DOM element ID conventions
✅ Implement proper error handling for all async operations
✅ Cache frequently used DOM elements in variables

### **DON'Ts**  
❌ Don't use snake_case for variables  
❌ Don't create new naming patterns  
❌ Don't skip input validation  
❌ Don't forget error handling  
❌ Don't hardcode values (use environment variables)  
❌ Don't modify core models without updating this guide  
❌ Don't use different field names than specified here  
❌ Don't forget to populate user data in queries  
❌ Don't use inline styles - use CSS classes
❌ Don't create duplicate utility functions
❌ Don't forget to clean up event listeners
❌ Don't use global variables unnecessarily

---

## 🎨 **FRONTEND DEVELOPMENT PATTERNS**

### **1. HTML & CSS NAMING CONVENTIONS**

#### **DOM Element IDs (camelCase)**
```javascript
// ✅ FORM ELEMENTS
loginForm, registerForm, bookingForm, resetForm
submitBtn, loginBtn, logoutBtn, forgotBtn, resetBtn
email, password, name, confirmPassword, newPassword

// ✅ DISPLAY ELEMENTS  
priceDisplay, totalPrice, durationDisplay
bookingContainer, alertContainer, loadingOverlay
userName, userEmail, bookingStatus, paymentStatus
upiSection, calendarContainer, statsContainer

// ✅ NAVIGATION & LAYOUT
topbar, mainContent, sidebar, header
loginLink, registerLink, bookingLink, adminLink
dashboardTab, bookingsTab, settingsTab

// ✅ MODALS & ALERTS
alertBackdrop, centeredAlert, centeredAlertMessage
confirmationModal, confirmationTitle, confirmationMessage
loadingOverlay, loadingMessage

// ❌ AVOID THESE
login_form, submit_btn, user_name // No snake_case
loginform, submitbtn // No lowercase concatenation
login-form, submit-btn // No kebab-case for IDs
```

#### **CSS Classes (kebab-case)**
```css
/* ✅ COMPONENT CLASSES */
.btn, .btn-primary, .btn-secondary, .btn-danger
.alert, .alert-success, .alert-error, .alert-info
.card, .card-header, .card-body, .card-footer
.form-group, .form-control, .form-label
.table, .table-striped, .table-hover

/* ✅ LAYOUT CLASSES */
.container, .header, .topbar, .main-content
.sidebar, .content-wrapper, .dashboard-grid
.booking-section, .admin-section, .stats-section

/* ✅ STATE CLASSES */
.hidden, .show, .active, .loading, .disabled
.expanded, .collapsed, .selected, .error
.success, .pending, .confirmed, .rejected

/* ✅ UTILITY CLASSES */
.text-center, .text-right, .text-left
.mt-3, .mb-3, .p-4, .mx-auto
.d-flex, .d-none, .justify-content-center
```

### **2. JAVASCRIPT GLOBAL VARIABLES**

#### **Standard Global Variables**
```javascript
// ✅ CORE CONSTANTS (Always define these)
const API_URL = window.location.origin;
const ITEMS_PER_PAGE = 10;
const DEBOUNCE_DELAY = 300;

// ✅ STATE VARIABLES (Initialize as null/empty)
let currentUser = null;
let settings = null;
let bookings = [];
let selectedDate = null;
let selectedTimeSlot = null;
let calculatedPrice = 0;
let isLoading = false;

// ✅ CACHE VARIABLES
let settingsCache = null;
let userBookingsCache = [];
let availabilityCacheByDate = {};

// ✅ UI STATE VARIABLES
let currentTab = 'dashboard';
let currentPage = 1;
let sortColumn = 'createdAt';
let sortDirection = 'desc';
let currentFilter = 'all';

// ❌ AVOID THESE
var apiUrl = '...'; // Use const instead
window.currentUser = null; // Don't pollute global namespace
let user; // Always initialize variables
```

### **3. FUNCTION NAMING PATTERNS**

#### **Core Function Categories**
```javascript
// ✅ AUTHENTICATION FUNCTIONS
async function checkAuth() { }
async function loginUser(credentials) { }
async function logoutUser() { }
async function refreshToken() { }

// ✅ DATA FETCHING FUNCTIONS
async function fetchUserProfile() { }
async function fetchBookings(filters = {}) { }
async function fetchAvailableSlots(date) { }
async function fetchAdminStats() { }
async function fetchSettings() { }

// ✅ DATA MANIPULATION FUNCTIONS
async function createBooking(bookingData) { }
async function updateBooking(id, data) { }
async function cancelBooking(id) { }
async function approveBooking(id) { }
async function rejectBooking(id) { }

// ✅ UI RENDERING FUNCTIONS
function renderBookingsList(bookings) { }
function renderAvailableSlots(slots) { }
function renderUserProfile(user) { }
function renderDashboardStats(stats) { }
function renderSettingsForm(settings) { }

// ✅ UI INTERACTION FUNCTIONS
function showAlert(message, type = 'info') { }
function hideAlert() { }
function showLoading(message = 'Loading...') { }
function hideLoading() { }
function toggleSection(sectionId) { }
function showModal(modalId) { }
function hideModal(modalId) { }

// ✅ FORM HANDLING FUNCTIONS
async function handleLoginForm(event) { }
async function handleBookingForm(event) { }
async function handleSettingsForm(event) { }
function validateBookingForm(formData) { }
function resetForm(formId) { }

// ✅ UTILITY FUNCTIONS
function formatDate(dateStr) { }
function formatTime(time24) { }
function formatPrice(amount) { }
function calculateEndTime(startTime, duration) { }
function debounce(func, delay) { }
function sanitizeInput(input) { }

// ✅ EVENT HANDLER FUNCTIONS
function handleWindowLoad() { }
function handleFormSubmit(event) { }
function handleButtonClick(event) { }
function handleInputChange(event) { }
```

### **4. API ENDPOINT PATTERNS**

#### **Standard Fetch Patterns**
```javascript
// ✅ AUTHENTICATED API CALL PATTERN
async function makeAuthenticatedRequest(endpoint, method = 'GET', data = null) {
  const token = localStorage.getItem('token');
  const config = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    },
    ...(data && { body: JSON.stringify(data) })
  };
  
  try {
    const response = await fetch(`${API_URL}${endpoint}`, config);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.message || 'Request failed');
    }
    
    return result;
  } catch (error) {
    console.error(`API Error [${method} ${endpoint}]:`, error);
    throw error;
  }
}

// ✅ SPECIFIC API CALL EXAMPLES
async function fetchBookings() {
  return await makeAuthenticatedRequest('/api/bookings/my-bookings');
}

async function createBooking(bookingData) {
  return await makeAuthenticatedRequest('/api/bookings', 'POST', bookingData);
}

async function updateSettings(settingsData) {
  return await makeAuthenticatedRequest('/api/admin/settings', 'PUT', settingsData);
}
```

#### **Complete Endpoint Reference**
```javascript
// ✅ AUTHENTICATION ENDPOINTS
'/api/auth/register'        // POST - User registration
'/api/auth/login'          // POST - User login  
'/api/auth/me'             // GET - Get current user
'/api/auth/forgot-password' // POST - Request password reset
'/api/auth/reset-password'  // POST - Reset password with token

// ✅ BOOKING ENDPOINTS
'/api/bookings'                    // POST - Create booking
'/api/bookings/my-bookings'        // GET - Get user's bookings
'/api/bookings/:id/cancel'         // PUT - Cancel booking
'/api/bookings/settings'           // GET - Get public settings
'/api/bookings/availability/:date' // GET - Get availability for date

// ✅ ADMIN ENDPOINTS
'/api/admin/bookings'              // GET - Get all bookings
'/api/admin/bookings/:id/approve'  // PUT - Approve booking
'/api/admin/bookings/:id/reject'   // PUT - Reject booking  
'/api/admin/bookings/:id/edit'     // PUT - Edit booking
'/api/admin/bookings/:id'          // DELETE - Delete booking
'/api/admin/stats'                 // GET - Get dashboard stats
'/api/admin/settings'              // GET/PUT - Admin settings
'/api/admin/make-admin'            // POST - Grant admin privileges
```

### **5. LOCALSTORAGE PATTERNS**

#### **Standard Storage Keys**
```javascript
// ✅ AUTHENTICATION DATA
localStorage.setItem('token', jwtToken);
localStorage.setItem('user', JSON.stringify(userObject));
localStorage.setItem('refreshToken', refreshToken);

// ✅ USER PREFERENCES  
localStorage.setItem('theme', 'dark');
localStorage.setItem('language', 'en');
localStorage.setItem('timezone', 'Asia/Kolkata');

// ✅ CACHE DATA (with expiry)
localStorage.setItem('settingsCache', JSON.stringify({
  data: settings,
  timestamp: Date.now(),
  expiry: 3600000 // 1 hour
}));

// ✅ FORM STATE (temporary)
localStorage.setItem('bookingFormDraft', JSON.stringify(formData));
localStorage.setItem('adminFilters', JSON.stringify(filterState));

// ✅ USAGE PATTERNS
// Getting with fallback
const token = localStorage.getItem('token') || null;
const user = JSON.parse(localStorage.getItem('user') || 'null');

// Cache with expiry check
function getCachedSettings() {
  const cached = localStorage.getItem('settingsCache');
  if (cached) {
    const { data, timestamp, expiry } = JSON.parse(cached);
    if (Date.now() - timestamp < expiry) {
      return data;
    }
  }
  return null;
}

// Cleanup on logout
function clearUserData() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('bookingFormDraft');
}
```

### **6. FORM HANDLING PATTERNS**

#### **Standard Form Structure**
```javascript
// ✅ COMPLETE FORM HANDLING PATTERN
async function handleFormSubmission(formId, endpoint, method = 'POST') {
  const form = document.getElementById(formId);
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.textContent;
  
  // Prevent multiple submissions
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing...';
  
  try {
    // Collect form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Client-side validation
    const validation = validateFormData(data, formId);
    if (!validation.isValid) {
      showAlert(validation.message, 'error');
      return;
    }
    
    // API call
    const result = await makeAuthenticatedRequest(endpoint, method, data);
    
    if (result.success) {
      showAlert(result.message, 'success');
      form.reset();
      // Additional success actions
      if (typeof onFormSuccess === 'function') {
        onFormSuccess(result.data);
      }
    } else {
      throw new Error(result.message);
    }
    
  } catch (error) {
    console.error('Form submission error:', error);
    showAlert(error.message, 'error');
  } finally {
    // Reset button state
    submitBtn.disabled = false;
    submitBtn.textContent = originalBtnText;
  }
}

// ✅ FORM VALIDATION PATTERNS
function validateFormData(data, formType) {
  switch (formType) {
    case 'loginForm':
      if (!data.email || !data.password) {
        return { isValid: false, message: 'Email and password required' };
      }
      if (!isValidEmail(data.email)) {
        return { isValid: false, message: 'Invalid email format' };
      }
      break;
      
    case 'bookingForm':
      if (!data.date || !data.startTime || !data.duration) {
        return { isValid: false, message: 'Please fill all required fields' };
      }
      if (new Date(data.date) < new Date()) {
        return { isValid: false, message: 'Cannot book for past dates' };
      }
      break;
  }
  
  return { isValid: true };
}

// ✅ INPUT VALIDATION HELPERS
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  return /^[6-9]\d{9}$/.test(phone); // Indian mobile
}

function sanitizeInput(input) {
  return input.trim().replace(/<[^>]*>/g, ''); // Remove HTML tags
}
```

### **7. UI INTERACTION PATTERNS**

#### **Alert & Modal Systems**
```javascript
// ✅ ALERT SYSTEM
function showAlert(message, type = 'info', duration = 4000) {
  const backdrop = document.getElementById('alertBackdrop');
  const alert = document.getElementById('centeredAlert');
  const messageEl = document.getElementById('centeredAlertMessage');
  
  // Update content
  messageEl.textContent = message;
  alert.className = `alert alert-${type}`;
  
  // Show alert
  backdrop.classList.add('show');
  alert.classList.add('show');
  
  // Auto-hide after duration
  setTimeout(() => {
    hideAlert();
  }, duration);
}

function hideAlert() {
  document.getElementById('alertBackdrop').classList.remove('show');
  document.getElementById('centeredAlert').classList.remove('show');
}

// ✅ LOADING STATES
function showLoading(message = 'Loading...') {
  const overlay = document.getElementById('loadingOverlay');
  const messageEl = document.getElementById('loadingMessage');
  messageEl.textContent = message;
  overlay.classList.add('show');
}

function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

// ✅ BUTTON LOADING STATES
function setButtonLoading(buttonId, isLoading) {
  const button = document.getElementById(buttonId);
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = 'Loading...';
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText;
    button.disabled = false;
  }
}

// ✅ SECTION TOGGLING
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  const icon = section.querySelector('.collapse-icon');
  
  if (section.classList.contains('collapsed')) {
    section.classList.remove('collapsed');
    icon.textContent = '▼';
  } else {
    section.classList.add('collapsed');
    icon.textContent = '▶';
  }
}
```

#### **Data Rendering Patterns**
```javascript
// ✅ TABLE RENDERING PATTERN
function renderDataTable(containerId, data, columns, actions = []) {
  const container = document.getElementById(containerId);
  
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="no-data">No data available</p>';
    return;
  }
  
  let html = `
    <table class="table table-striped">
      <thead>
        <tr>
          ${columns.map(col => `<th>${col.label}</th>`).join('')}
          ${actions.length > 0 ? '<th>Actions</th>' : ''}
        </tr>
      </thead>
      <tbody>
  `;
  
  data.forEach(row => {
    html += '<tr>';
    columns.forEach(col => {
      const value = col.format ? col.format(row[col.key]) : row[col.key];
      html += `<td>${value}</td>`;
    });
    
    if (actions.length > 0) {
      html += '<td>';
      actions.forEach(action => {
        html += `<button class="btn btn-${action.type}" onclick="${action.handler}('${row._id}')">${action.label}</button>`;
      });
      html += '</td>';
    }
    
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

// ✅ CARD GRID RENDERING
function renderCardGrid(containerId, data, cardTemplate) {
  const container = document.getElementById(containerId);
  
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="no-data">No items found</p>';
    return;
  }
  
  const html = data.map(item => cardTemplate(item)).join('');
  container.innerHTML = html;
}
```

### **8. EVENT HANDLING PATTERNS**

#### **Standard Event Listeners**
```javascript
// ✅ DOM READY PATTERN
document.addEventListener('DOMContentLoaded', function() {
  // Initialize application
  initializeApp();
});

// ✅ FORM EVENT HANDLING
document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleLoginForm(event);
});

// ✅ BUTTON CLICK HANDLING
document.getElementById('logoutBtn').addEventListener('click', (event) => {
  event.preventDefault();
  handleLogout();
});

// ✅ INPUT CHANGE HANDLING (with debounce)
const searchInput = document.getElementById('searchInput');
let searchTimeout;

searchInput.addEventListener('input', (event) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    handleSearchInput(event.target.value);
  }, DEBOUNCE_DELAY);
});

// ✅ WINDOW EVENTS
window.addEventListener('beforeunload', (event) => {
  // Save form drafts
  saveDraftData();
});

window.addEventListener('storage', (event) => {
  // Handle localStorage changes from other tabs
  if (event.key === 'token' && !event.newValue) {
    // Token removed in another tab - logout
    handleLogout();
  }
});
```

### **9. UTILITY FUNCTIONS**

#### **Date & Time Formatting**
```javascript
// ✅ DATE FORMATTING
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

function formatTime(time24) {
  const [hours, minutes] = time24.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

function formatDateTime(dateTimeStr) {
  const date = new Date(dateTimeStr);
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

// ✅ PRICE FORMATTING
function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR'
  }).format(amount);
}

// ✅ DURATION CALCULATIONS
function calculateEndTime(startTime, duration) {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = (hours * 60 + minutes + duration * 60);
  const endHours = Math.floor(endMinutes / 60) % 24;
  const endMins = endMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
}

// ✅ DEBOUNCE UTILITY
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
```

---

## 📋 **FRONTEND FILE ORGANIZATION**

### **HTML File Structure Standards**
```html
<!-- ✅ STANDARD HTML STRUCTURE -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page Title - JamRoom</title>
    
    <!-- CSS -->
    <style>
        /* Page-specific styles */
        /* Follow existing CSS patterns */
    </style>
</head>
<body>
    <!-- Header/Navigation -->
    <div class="topbar">
        <!-- Navigation content -->
    </div>
    
    <!-- Main Content -->
    <div class="main-content">
        <!-- Page content -->
    </div>
    
    <!-- Modals & Overlays -->
    <div id="alertBackdrop" class="alert-backdrop">
        <!-- Alert content -->
    </div>
    
    <div id="loadingOverlay" class="loading-overlay">
        <!-- Loading content -->
    </div>
    
    <!-- JavaScript -->
    <script>
        // Page-specific JavaScript
        // Follow established patterns
    </script>
</body>
</html>
```

### **File Naming Conventions**
```
✅ HTML Files:
index.html      - Landing page
login.html      - Authentication  
register.html   - User registration
booking.html    - Main user interface
admin.html      - Admin dashboard
reset-password.html - Password recovery
test.html       - Testing utilities

✅ CSS Classes (by component):
.btn, .btn-primary, .btn-secondary
.alert, .alert-success, .alert-error
.card, .card-header, .card-body
.form-group, .form-control
.table, .table-striped

✅ JavaScript Files (if external):
auth.js         - Authentication logic
booking.js      - Booking functionality  
admin.js        - Admin operations
utils.js        - Utility functions
```

---

## 🔄 **FRONTEND DEVELOPMENT WORKFLOW**

### **Adding New Frontend Features**

#### **Step 1: Plan the Feature**
```javascript
// ✅ PRE-DEVELOPMENT CHECKLIST
1. Identify the target HTML file(s)
2. Plan new DOM element IDs following patterns
3. Design API endpoints needed
4. Plan CSS classes following conventions
5. Identify JavaScript functions required
```

#### **Step 2: HTML Structure**
```html
<!-- ✅ ADD HTML ELEMENTS -->
<div class="feature-container" id="newFeatureContainer">
    <form id="newFeatureForm" class="feature-form">
        <div class="form-group">
            <label for="featureInput">Feature Input:</label>
            <input type="text" id="featureInput" name="featureInput" class="form-control" required>
        </div>
        <button type="submit" id="featureSubmitBtn" class="btn btn-primary">Submit</button>
    </form>
</div>
```

#### **Step 3: JavaScript Implementation**
```javascript
// ✅ ADD JAVASCRIPT FUNCTIONS
async function handleNewFeature() {
    const form = document.getElementById('newFeatureForm');
    
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        const formData = {
            featureInput: document.getElementById('featureInput').value
        };
        
        try {
            const result = await makeAuthenticatedRequest('/api/new-endpoint', 'POST', formData);
            showAlert('Feature created successfully', 'success');
            renderNewFeatureData(result.data);
        } catch (error) {
            showAlert(error.message, 'error');
        }
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    handleNewFeature();
});
```

#### **Step 4: Testing & Integration**
```javascript
// ✅ TEST THE FEATURE
1. Test form validation
2. Test API integration
3. Test error handling
4. Test UI states (loading, success, error)
5. Test responsive design
6. Test accessibility features
```

## ⚠️ **CRITICAL FRONTEND RULES**

### **DO's for Frontend Development**
✅ Always use `const API_URL = window.location.origin` for API base URL  
✅ Follow camelCase for DOM element IDs and JavaScript variables  
✅ Use kebab-case for CSS classes  
✅ Add loading states for all async operations  
✅ Include proper error handling with user-friendly messages  
✅ Validate form inputs both client-side and server-side  
✅ Use `addEventListener` instead of inline onclick handlers  
✅ Cache DOM elements that are accessed frequently  
✅ Debounce input events that trigger API calls  
✅ Clear sensitive data from localStorage on logout  
✅ Use semantic HTML elements for better accessibility  
✅ Follow established naming patterns for consistency  

### **DON'Ts for Frontend Development**  
❌ Don't use var declarations (use const/let)  
❌ Don't hardcode API URLs (use API_URL constant)  
❌ Don't forget to disable submit buttons during processing  
❌ Don't use inline styles (use CSS classes)  
❌ Don't access DOM elements multiple times without caching  
❌ Don't forget to remove event listeners when appropriate  
❌ Don't store sensitive data in localStorage permanently  
❌ Don't use different naming conventions than established  
❌ Don't skip input validation and sanitization  
❌ Don't forget to handle network errors gracefully  
❌ Don't create new CSS classes when existing ones work  
❌ Don't use setTimeout/setInterval without cleanup  

---

## 🔄 **WHEN ADDING NEW FEATURES**

### **Pre-Development Checklist**
- [ ] Read this reference guide completely
- [ ] Identify which files need modification
- [ ] Check existing patterns for similar functionality
- [ ] Plan variable names using established conventions
- [ ] Review API endpoint patterns
- [ ] Plan CSS classes following naming conventions
- [ ] Design error handling strategy
- [ ] Plan DOM element IDs and structure
- [ ] Confirm database field names

### **Development Checklist**
- [ ] Use exact variable names from this guide
- [ ] Follow established API patterns
- [ ] Add proper error handling
- [ ] Test with existing test pages
- [ ] Update API documentation if needed
- [ ] Verify frontend integration works

### **Post-Development Checklist**
- [ ] Test all functionality thoroughly
- [ ] Update this reference if new patterns were established
- [ ] Document any new environment variables
- [ ] Verify naming consistency across all files

---

---

## 📁 **FRONTEND FILE ORGANIZATION**

### **HTML Files Structure**
```
public/
├── index.html          # Landing page (public access)
├── login.html          # Authentication page
├── register.html       # User registration
├── reset-password.html # Password reset flow
├── booking.html        # Main booking interface (user)
├── admin.html         # Admin dashboard (admin only)
├── test.html          # Comprehensive testing suite
└── js/
    ├── client-pdf-generator.js # PDF generation utility
    └── pdfHTMLTemplate.js      # PDF template functions
```

### **JavaScript Organization Patterns**
```javascript
// ✅ STANDARD STRUCTURE FOR HTML FILES
<script>
    // 1. CONSTANTS & GLOBALS
    const API_URL = window.location.origin;
    let currentUser = null;
    
    // 2. UTILITY FUNCTIONS  
    const showAlert = (message, type) => { /* ... */ };
    const formatDate = (date) => { /* ... */ };
    
    // 3. API FUNCTIONS
    const fetchData = async () => { /* ... */ };
    const createRecord = async (data) => { /* ... */ };
    
    // 4. DOM MANIPULATION
    const renderComponent = (data) => { /* ... */ };
    const updateUI = () => { /* ... */ };
    
    // 5. EVENT HANDLERS
    document.getElementById('form').addEventListener('submit', ...);
    
    // 6. INITIALIZATION
    window.addEventListener('load', async () => {
        await checkAuth();
        initializePage();
    });
</script>
```

### **CSS Organization Pattern**
```css
/* ✅ STANDARD CSS STRUCTURE */

/* 1. RESET & BASE STYLES */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, ...; }

/* 2. CSS VARIABLES */
:root {
    --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --text-primary: #2c3e50;
}

/* 3. LAYOUT COMPONENTS */
.container { max-width: 1400px; margin: 0 auto; }
.header { ... }

/* 4. UI COMPONENTS */
.btn { ... }
.btn-primary { ... }
.alert { ... }

/* 5. STATE CLASSES */
.hidden { display: none; }
.show { display: block; }

/* 6. RESPONSIVE DESIGN */
@media (max-width: 768px) { ... }
```

### **Common UI Interaction Patterns**
```javascript
// ✅ MODAL MANAGEMENT
const showModal = (modalId) => {
    const modal = document.getElementById(modalId);
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
};

const hideModal = (modalId) => {
    const modal = document.getElementById(modalId);
    modal.classList.remove('show');
    document.body.style.overflow = 'auto';
};

// ✅ LOADING STATE MANAGEMENT
const showLoading = (message = 'Loading...') => {
    const overlay = document.getElementById('loadingOverlay');
    const messageEl = document.getElementById('loadingMessage');
    messageEl.textContent = message;
    overlay.style.display = 'flex';
};

const hideLoading = () => {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = 'none';
};

// ✅ FORM STATE MANAGEMENT
const setFormLoading = (formId, loading = true) => {
    const form = document.getElementById(formId);
    const submitBtn = form.querySelector('[type="submit"]');
    
    if (loading) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
    } else {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.getAttribute('data-original-text') || 'Submit';
    }
};
```

## 📚 **FILE LOCATIONS FOR COMMON TASKS**

| Task | Primary File | Secondary Files |
|------|-------------|----------------|
| Add new API endpoint | `/routes/[module].routes.js` | Update `/API_DOCUMENTATION.md` |
| Modify database schema | `/models/[Model].js` | Update this reference guide |
| Add frontend functionality | `/public/[page].html` | Test in `/public/test.html` |
| Email templates | `/utils/email.js` | `/utils/calendar.js` for invites |
| Authentication logic | `/middleware/auth.js` | `/routes/auth.routes.js` |
| Admin functionality | `/routes/admin.routes.js` | `/public/admin.html` |
| User functionality | `/routes/booking.routes.js` | `/public/booking.html` |
| PDF generation | `/utils/billGenerator.js` | `/public/js/client-pdf-generator.js` |
| Frontend testing | `/public/test.html` | All API endpoints |

---

## 🎯 **DEVELOPMENT WORKFLOW**

### **Adding New Frontend Features**
1. **Planning Phase**
   - Review existing patterns in similar files
   - Plan DOM element IDs using naming conventions
   - Design API integration points
   - Plan CSS classes and styling approach

2. **Implementation Phase**
   - Follow established JavaScript structure
   - Use consistent naming conventions
   - Implement proper error handling
   - Add loading states and user feedback

3. **Testing Phase**
   - Test using `/public/test.html` interface
   - Verify responsive design on mobile
   - Check browser console for errors
   - Test error scenarios and edge cases

4. **Documentation Phase**
   - Update API documentation if needed
   - Add new patterns to this reference guide
   - Document any new naming conventions

---

**🎯 REMEMBER: Consistency is key to maintainable code. When in doubt, refer to this guide first!**

*Last Updated: January 25, 2026*