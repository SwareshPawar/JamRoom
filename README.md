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
📋 **Manage Bookings Pagination Upgrade**: Admin bookings now support backend-driven pagination, search, sort, and page-size controls  
👤 **Registered User Edit Flow**: Admin can update existing user name/email/mobile from the Users tab via modal workflow  
📱 **Direct Mobile Booking Flow (PWA)**: Booking runs directly on `/booking.html` with responsive layout plus manifest/service-worker support  
🎛️ **Rental UI Consistency Pass**: Booking rentals now follow the same base/child row alignment and controls used in admin create/edit workflows  
💳 **Modern UPI Compatibility Flow**: Replaced brittle app-specific deep links with universal `upi://pay` plus share/copy/QR fallbacks for better browser support  
🧭 **Resilient Navigation Loading**: Shared menu now auto-falls back to a visible guest nav when auth/network is slow, preventing blank or stuck loading headers  
🔐 **Auth Timeout + Cached Session Fallback**: Auth checks use timeout/abort with safe cached-user fallback for smoother mobile/desktop startup  
💾 **Refresh-Safe Booking Drafts**: `/booking.html` now restores selected mode/date/time/rentals/notes after refresh and clears draft on successful booking  
🗂️ **Admin Form Draft Persistence**: Admin create-booking and user-management forms now autosave/restore drafts to survive refreshes  
➕➖ **Admin Special Price Override**: Admin can apply discount or surcharge amount with optional note; final bill and PDF summaries reflect adjustment transparently  

## 🎉 Latest Enhancements (May 2026)

🕒 **Hourly Booking Restore**: Hourly categories now use date + start + end time with duration-based pricing and payload validation  
🎚️ **Flat-Rate Session/Track Flow**: `persession`/`pertrack` categories now run start-date-only flow (no hourly range picker)  
📆 **Per-Day Stability Fix**: Changing return date no longer resets pickup time  
💳 **Post-Booking Payment Modal**: Payment options now open in a popup after successful booking with copy/open/QR actions  
📄 **My Bookings Details Modal**: Users can open booking details from My Bookings and view paid vs remaining amounts  
🚫 **Rejected Status Cleanup**: Manage Bookings and My Bookings hide pending payment badge for rejected bookings  
📧 **Invoice-Style Email Standardization**: Booking, auth, and admin activity emails now share a consistent branded layout, with reusable eBill and quotation builders  
📑 **PDF Header Repeat Fix**: Service-group headers now repeat correctly across PDF page breaks in both server and browser download flows  

## 🚀 Core Features

### 👤 User Features
- ✅ User Registration & Login with JWT Authentication
- ✅ Password Reset via Email
- ✅ View Available Time Slots by Date
- ✅ **Enhanced Rental Selection**: Hierarchical categories with smart controls
- ✅ **Dynamic Pricing**: Real-time price calculation with different rental models
- ✅ Track Booking Status (Pending/Confirmed/Rejected)
- ✅ My Bookings payment progress (Paid/Remaining)
- ✅ Booking Details popup from My Bookings
- ✅ Cancel Pending Bookings
- ✅ **PDF Download**: Download booking invoices
- ✅ Post-booking payment popup with UPI QR/copy/open actions
- ✅ Universal UPI payment launch + link share/copy fallbacks
- ✅ Email Notifications & Calendar Invites (.ics)
- ✅ Mobile-first booking page with add-to-home-screen support

### 🛠️ Admin Features
- ✅ Dashboard with Statistics & Analytics
- ✅ View All Bookings with Filters, Search, Sort, and Pagination
- ✅ Approve/Reject Booking Requests
- ✅ **PDF Download**: Download invoices for any booking
- ✅ **eBill Recipients Control**: Send invoice to customer and/or additional emails
- ✅ **Registered User Detail Editing**: Update name/email/mobile for existing users
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
| `scripts/setup/createEnvFile.js` | Interactive environment setup | `node scripts/setup/createEnvFile.js` |
| `scripts/db/clearDatabase.js` | Clear booking data (or `--all` for complete wipe) | `node scripts/db/clearDatabase.js` |
| `scripts/setup/createTestUsers.js` | Create test accounts | `node scripts/setup/createTestUsers.js` |
| `scripts/setup/createAdmin.js` | Create admin account | `node scripts/setup/createAdmin.js` |
| Admin panel (Users tab) | Grant admin privileges to existing user | `POST /api/admin/make-admin` |
| `scripts/db/checkDatabase.js` | Verify database status | `node scripts/db/checkDatabase.js` |
| `scripts/catalog/exportAdminSettingsCatalog.js` | Export current catalog/settings snapshot | `npm run catalog:backup` |
| `scripts/catalog/restoreAdminSettingsCatalog.js` | Preview or restore catalog snapshot | `npm run catalog:restore:preview` |

### 🧪 Testing Tools
- **`/test.html`** - Comprehensive API test suite
- **`/test-modules.html`** - Shared modules and UI test page
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

📖 **[docs/guides/SETUP_GUIDE.md](docs/guides/SETUP_GUIDE.md)** - Step-by-step setup with troubleshooting  
🚀 **[docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)** - Production deployment guide  
📊 **[docs/reference/API_DOCUMENTATION.md](docs/reference/API_DOCUMENTATION.md)** - Complete API reference  
🏗️ **[docs/reference/SYSTEM_DOCUMENTATION.md](docs/reference/SYSTEM_DOCUMENTATION.md)** - Technical architecture  
✅ **[docs/reference/TESTING_CHECKLIST.md](docs/reference/TESTING_CHECKLIST.md)** - QA testing procedures  
🗂️ **[docs/operations/CATALOG_BACKUP_WORKFLOW.md](docs/operations/CATALOG_BACKUP_WORKFLOW.md)** - Catalog backup/export/restore workflow

## 🚦 Quick Start (3 Steps)

### Prerequisites
- Node.js (v18+) • MongoDB Atlas account • Gmail account for emails

### Installation

1. **Install & Configure**
   ```bash
   npm install
   node scripts/setup/createEnvFile.js  # Interactive environment setup
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

📖 **Need help?** See [docs/guides/SETUP_GUIDE.md](docs/guides/SETUP_GUIDE.md) for detailed instructions  
🚀 **Ready to deploy?** Check [docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md) for production setup

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
| `scripts/setup/createEnvFile.js` | Interactive environment setup | `node scripts/setup/createEnvFile.js` |
| `scripts/db/clearDatabase.js` | Clear booking data (or `--all` for complete wipe) | `node scripts/db/clearDatabase.js` |
| `scripts/setup/createTestUsers.js` | Create test accounts | `node scripts/setup/createTestUsers.js` |
| `scripts/setup/createAdmin.js` | Create admin account | `node scripts/setup/createAdmin.js` |
| Admin panel (Users tab) | Grant admin privileges to existing user | `POST /api/admin/make-admin` |
| `scripts/db/checkDatabase.js` | Verify database status | `node scripts/db/checkDatabase.js` |

### 🧪 Testing Tools
- **`/test.html`** - Comprehensive API test suite
- **`/test-modules.html`** - Shared modules and UI test page
- **Auto-created test accounts**: `testuser@jamroom.com` / `testadmin@jamroom.com`

## 📚 Complete Documentation

📖 **[docs/guides/SETUP_GUIDE.md](docs/guides/SETUP_GUIDE.md)** - Step-by-step setup with troubleshooting  
🚀 **[docs/guides/DEPLOYMENT.md](docs/guides/DEPLOYMENT.md)** - Production deployment guide  
📊 **[docs/reference/API_DOCUMENTATION.md](docs/reference/API_DOCUMENTATION.md)** - Complete API reference  
🏗️ **[docs/reference/SYSTEM_DOCUMENTATION.md](docs/reference/SYSTEM_DOCUMENTATION.md)** - Technical architecture  
✅ **[docs/reference/TESTING_CHECKLIST.md](docs/reference/TESTING_CHECKLIST.md)** - QA testing procedures

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
