# 🎸 JamRoom Rental Booking Application

**✅ PROJECT COMPLETE** - A production-ready, full-stack booking system for jam room rentals with admin panel, email notifications, calendar invites, and UPI payment integration.

## 🎉 Latest Enhancements (January 2026)

🎸 **Hierarchical Rental System**: Categorized rentals with in-house and per-day options  
🎛️ **Collapsible Categories**: Organized rental selection with expandable sections  
⚖️ **Smart Quantity Controls**: Context-aware quantity limits and restrictions  
💰 **Dynamic Pricing**: Different pricing models for various rental types  
📄 **PDF Invoices**: Download booking invoices in PDF format  

## 🎉 Latest Enhancements (March 2026)

📧 **Multi-Recipient eBill Sending**: Admin can send eBills to customer and additional custom recipients from the admin panel  
🧾 **Admin Booking Edit Upgrade**: Edit booking type, add/remove rental items, and persist item-level rental updates with server-side total recalculation  
📱 **Phone-First Booking Shell (PWA)**: Added `/booking-mobile.html` app shell, manifest, service worker, and mobile redirect flow for installable home-screen experience  
🎛️ **Rental UI Consistency Pass**: Booking rentals now follow the same base/child row alignment and controls used in admin create/edit workflows  
💳 **Modern UPI Compatibility Flow**: Replaced brittle app-specific deep links with universal `upi://pay` plus share/copy/QR fallbacks for better browser support  

## 🚀 Core Features

### 👤 User Features
- ✅ User Registration & Login with JWT Authentication
- ✅ Password Reset via Email
- ✅ View Available Time Slots by Date
- ✅ **Enhanced Rental Selection**: Hierarchical categories with smart controls
- ✅ **Dynamic Pricing**: Real-time price calculation with different rental models
- ✅ Track Booking Status (Pending/Confirmed/Rejected)
- ✅ Cancel Pending Bookings
- ✅ **PDF Download**: Download booking invoices
- ✅ UPI QR Code for Payments
- ✅ Universal UPI payment launch + link share/copy fallbacks
- ✅ Email Notifications & Calendar Invites (.ics)
- ✅ Mobile app-like booking shell with add-to-home-screen support

### 🛠️ Admin Features
- ✅ Dashboard with Statistics & Analytics
- ✅ View All Bookings with Filters
- ✅ Approve/Reject Booking Requests
- ✅ **PDF Download**: Download invoices for any booking
- ✅ **eBill Recipients Control**: Send invoice to customer and/or additional emails
- ✅ Create Time Slots (Single & Bulk Creation)
- ✅ Block/Unblock Time Slots
- ✅ **Rental Management**: Configure prices, types, and categories
- ✅ **Booking Edit (Item-Level)**: Update rentals, booking type, and totals for existing bookings
- ✅ Grant Admin Privileges to Users
- ✅ Manage UPI Payment Details
- ✅ Admin Email Notifications

## 🛠️ Tech Stack

**Backend:** Node.js, Express, MongoDB (Mongoose), JWT Authentication  
**Email:** Nodemailer with calendar invites (iCal-Generator)  
**Frontend:** Responsive HTML/CSS/JavaScript (No frameworks)  
**Payment:** UPI QR Code Integration (No gateway fees)  
**Deployment:** Vercel/Render ready with environment variables

## 📊 Production-Ready Features

✅ **Complete CRUD Operations** • ✅ **Role-Based Access Control**  
✅ **Email Integration** • ✅ **Payment System** • ✅ **Error Handling**  
✅ **Input Validation** • ✅ **Security Best Practices**  
✅ **Scalable Architecture** • ✅ **Database Indexes**  
✅ **Seed Data** • ✅ **Calendar Integration**

**Project Stats:** 39 files • ~15,000+ lines of code • Complete documentation

## 🔧 Development Tools

| Script | Purpose | Command |
|--------|---------|---------|
| `createEnvFile.js` | Interactive environment setup | `node createEnvFile.js` |
| `clearDatabase.js` | Clear booking data (or `--all` for complete wipe) | `node clearDatabase.js` |
| `createTestUsers.js` | Create test accounts | `node createTestUsers.js` |
| `createAdmin.js` | Create admin account | `node createAdmin.js` |
| `makeAdmin.js` | Grant admin privileges | `node makeAdmin.js` |
| `checkDatabase.js` | Verify database status | `node checkDatabase.js` |

### 🧪 Testing Tools
- **`/test.html`** - Comprehensive API test suite
- **`/test-rental-system.html`** - Visual rental system testing
- **Auto-created test accounts**: `testuser@jamroom.com` / `testadmin@jamroom.com`

## 📁 Project Architecture

```
jamroom-booking/
├── server.js              # Main server entry point
├── config/db.js          # MongoDB connection
├── models/               # Database models (User, Booking, Slot, AdminSettings)
├── routes/               # API endpoints (auth, booking, slot, admin)
├── middleware/           # Authentication & authorization
├── utils/                # Email, calendar, UPI utilities
└── public/              # Frontend pages (HTML/CSS/JS)
```

## 📚 Complete Documentation

📖 **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Step-by-step setup with troubleshooting  
🚀 **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide  
📊 **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - Complete API reference  
🏗️ **[SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md)** - Technical architecture  
✅ **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** - QA testing procedures

## 🚦 Quick Start (3 Steps)

### Prerequisites
- Node.js (v18+) • MongoDB Atlas account • Gmail account for emails

### Installation

1. **Install & Configure**
   ```bash
   npm install
   node createEnvFile.js  # Interactive environment setup
   ```

2. **Start Server**
   ```bash
   npm start
   # For development: npm run dev
   ```

3. **Access Application**
   - **Home**: http://localhost:5000
   - **Admin Panel**: http://localhost:5000/admin.html  
   - **Login**: `admin@jamroom.com` / `Admin@123` ⚠️ *Change immediately!*

📖 **Need help?** See [SETUP_GUIDE.md](SETUP_GUIDE.md) for detailed instructions  
🚀 **Ready to deploy?** Check [DEPLOYMENT.md](DEPLOYMENT.md) for production setup

## 📊 Complete User Journey

**User registers** → **Views & books slots** → **UPI payment** → **Admin approves** → **Email + calendar invite** → **Ready to jam! 🎸**

## 📁 Project Architecture

```
jamroom-booking/
├── server.js              # Main server entry point
├── config/db.js          # MongoDB connection
├── models/               # Database models (User, Booking, Slot, AdminSettings)
├── routes/               # API endpoints (auth, booking, slot, admin)
├── middleware/           # Authentication & authorization
├── utils/                # Email, calendar, UPI utilities
└── public/              # Frontend pages (HTML/CSS/JS)
```

## 🔧 Development Tools

| Script | Purpose | Command |
|--------|---------|---------|
| `createEnvFile.js` | Interactive environment setup | `node createEnvFile.js` |
| `clearDatabase.js` | Clear booking data (or `--all` for complete wipe) | `node clearDatabase.js` |
| `createTestUsers.js` | Create test accounts | `node createTestUsers.js` |
| `createAdmin.js` | Create admin account | `node createAdmin.js` |
| `makeAdmin.js` | Grant admin privileges | `node makeAdmin.js` |
| `checkDatabase.js` | Verify database status | `node checkDatabase.js` |

### 🧪 Testing Tools
- **`/test.html`** - Comprehensive API test suite
- **`/test-rental-system.html`** - Visual rental system testing
- **Auto-created test accounts**: `testuser@jamroom.com` / `testadmin@jamroom.com`

## 📚 Complete Documentation

📖 **[SETUP_GUIDE.md](SETUP_GUIDE.md)** - Step-by-step setup with troubleshooting  
🚀 **[DEPLOYMENT.md](DEPLOYMENT.md)** - Production deployment guide  
📊 **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - Complete API reference  
🏗️ **[SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md)** - Technical architecture  
✅ **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)** - QA testing procedures

---

**Built with ❤️ for JamRoom Studio**

**Questions?** Check the documentation files or review the code comments.

**Ready to rock? Start the server and begin accepting bookings! 🚀**
- Check EMAIL_USER and EMAIL_PASS

**Cannot Login as Admin:**
- Use: admin@jamroom.com / Admin@123

## 📝 License

ISC License

---

**Built with ❤️ for JamRoom Studio**
