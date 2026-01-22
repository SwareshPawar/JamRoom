# 🎸 JamRoom Rental Booking Application

A production-ready, full-stack booking system for jam room rentals with admin panel, email notifications, calendar invites, and UPI payment integration.

## 🚀 Features

### User Features
- ✅ User Registration & Login with JWT Authentication
- ✅ Password Reset via Email
- ✅ View Available Time Slots
- ✅ Book Jam Room / Instruments / Sound System
- ✅ View Booking Status (Pending / Confirmed / Rejected)
- ✅ Cancel Pending Bookings
- ✅ UPI QR Code for Payments
- ✅ Email Notifications
- ✅ Calendar Invites (.ics) on Confirmation

### Admin Features
- ✅ Admin Dashboard with Statistics
- ✅ View All Bookings
- ✅ Approve / Reject Booking Requests
- ✅ Create & Manage Time Slots (Bulk Creation)
- ✅ Block / Unblock Slots
- ✅ Edit Rental Prices & Types
- ✅ Grant Admin Privileges to Users
- ✅ Manage UPI Payment Details
- ✅ Email Notifications to All Admins

## 🛠️ Tech Stack

**Backend:**
- Node.js & Express
- MongoDB (Mongoose)
- JWT Authentication
- Nodemailer (Email)
- iCal-Generator (Calendar Invites)

**Frontend:**
- Plain HTML, CSS, JavaScript
- Responsive Design
- No frameworks required

**Deployment:**
- Vercel / Render Ready
- Environment Variables

## 📁 Project Structure

```
jamroom-booking/
├── server.js                 # Main server entry point
├── package.json             # Dependencies
├── vercel.json              # Vercel deployment config
├── .env.example             # Environment variables template
├── config/
│   └── db.js               # MongoDB connection
├── models/
│   ├── User.js             # User model (user/admin)
│   ├── Booking.js          # Booking model
│   ├── Slot.js             # Time slot model
│   └── AdminSettings.js    # Admin settings model
├── routes/
│   ├── auth.routes.js      # Auth endpoints
│   ├── booking.routes.js   # Booking endpoints
│   ├── slot.routes.js      # Slot management
│   └── admin.routes.js     # Admin endpoints
├── middleware/
│   ├── auth.js             # JWT verification
│   └── admin.js            # Admin role check
├── utils/
│   ├── email.js            # Email sending
│   ├── calendar.js         # Calendar invite generation
│   └── upi.js              # UPI utilities
└── public/
    ├── index.html          # Landing page
    ├── login.html          # Login page
    ├── register.html       # Registration page
    ├── booking.html        # User booking page
    ├── admin.html          # Admin panel
    └── reset-password.html # Password reset page
```

## 🚦 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB Atlas account or local MongoDB
- Gmail account for email notifications (or other SMTP)

### Installation

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   
   Create a `.env` file in the root directory (use `.env.example` as template):
   ```env
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/jamroom?retryWrites=true&w=majority
   JWT_SECRET=your_super_secret_jwt_key_here
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASS=your_app_specific_password
   BASE_URL=http://localhost:5000
   PORT=5000
   UPI_ID=jamroom@paytm
   UPI_NAME=JamRoom Studio
   ```

3. **Setup Gmail for Email Notifications**
   - Enable 2-Factor Authentication on your Gmail account
   - Generate an App-Specific Password
   - Use this password in `EMAIL_PASS`

4. **Start the server**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5000
   - Admin Panel: http://localhost:5000/admin.html
   - Booking Page: http://localhost:5000/booking.html

## 🔐 Default Admin Credentials

```
Email: admin@jamroom.com
Password: Admin@123
```

**⚠️ IMPORTANT:** Change these credentials immediately after first login!

## 📊 User Flow

1. **User Registration/Login**
2. **View Available Slots**
3. **Book Slot** (Status: PENDING)
4. **UPI Payment QR Code Displayed**
5. **Admin Approves Booking**
6. **Status → CONFIRMED**
7. **Email + Calendar Invite Sent**

## 🎯 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings/my-bookings` - Get user's bookings
- `PUT /api/bookings/:id/cancel` - Cancel booking

### Slots
- `GET /api/slots` - Get available slots
- `POST /api/slots` - Create slot (Admin)
- `POST /api/slots/bulk` - Create multiple slots (Admin)
- `PUT /api/slots/:id` - Update slot (Admin)

### Admin
- `GET /api/admin/bookings` - Get all bookings
- `PUT /api/admin/bookings/:id/approve` - Approve booking
- `PUT /api/admin/bookings/:id/reject` - Reject booking
- `GET /api/admin/stats` - Get statistics
- `GET /api/admin/settings` - Get/Update settings
- `POST /api/admin/make-admin` - Grant admin access

## 🚀 Deployment

### Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel`
4. Add environment variables in Vercel Dashboard
5. Deploy to production: `vercel --prod`

### Deploy to Render

1. Create new Web Service on Render
2. Connect your GitHub repository
3. Build Command: `npm install`
4. Start Command: `node server.js`
5. Add environment variables
6. Deploy!

## 💳 Payment Integration

Uses UPI (India-friendly):
- QR code generated automatically
- No payment gateway fees
- Admin manually verifies payment

## 📧 Email Configuration

Update `utils/email.js` for custom email providers.

## 🔒 Security

- ✅ Passwords hashed with bcrypt
- ✅ JWT authentication
- ✅ Environment variables for secrets
- ✅ Role-based access control
- ⚠️ Change default admin credentials
- ⚠️ Use strong JWT_SECRET

## 🐛 Troubleshooting

**MongoDB Connection Error:**
- Verify MONGO_URI
- Check MongoDB Atlas IP whitelist

**Email Not Sending:**
- Verify Gmail App Password
- Check EMAIL_USER and EMAIL_PASS

**Cannot Login as Admin:**
- Use: admin@jamroom.com / Admin@123

## 📝 License

ISC License

---

**Built with ❤️ for JamRoom Studio**
