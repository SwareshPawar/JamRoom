# 📚 API Documentation - JamRoom Booking Application

Base URL: `http://localhost:5000` (Development)  
Production: `https://your-domain.com`

All protected endpoints require JWT token in Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

> **🆕 Enhanced Rental System Update**: The rental system now supports hierarchical categories with in-house vs per-day pricing models. Booking endpoints accept enhanced rental data structures with `rentalType` and `perdayPrice` fields. See AdminSettings schema for complete structure.

## 🧪 Testing & Development Tools

### Test Pages
- **Comprehensive API Tests**: `/test.html` - Full test suite for all endpoints
- **Rental System Tests**: `/test-rental-system.html` - Visual testing for enhanced rental features

### Utility Scripts
```bash
# Setup test environment
node createTestUsers.js    # Creates test accounts
node clearDatabase.js      # Clear booking data only
node checkDatabase.js      # Verify database state

# Test credentials (auto-created):
# User: testuser@jamroom.com / TestUser@123
# Admin: testadmin@jamroom.com / TestAdmin@123
```

### Pre-configured Test Data
The test suite includes realistic booking scenarios:
- Mixed rental types (in-house + per-day)
- Complex pricing calculations
- Multi-item bookings with quantities
- Duration-based vs flat-rate pricing validation

---

## 🔐 Authentication Endpoints

### Register User
**POST** `/api/auth/register`

Register a new user account.

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Registration successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "65abc123...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

---

### Login
**POST** `/api/auth/login`

Login with email and password.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "65abc123...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

---

### Forgot Password
**POST** `/api/auth/forgot-password`

Request password reset email.

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

---

### Reset Password
**POST** `/api/auth/reset-password`

Reset password with token from email.

**Request Body:**
```json
{
  "token": "abc123def456...",
  "password": "newpassword123"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Password reset successful",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

### Get Current User
**GET** `/api/auth/me`

Get currently logged-in user details.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "user": {
    "id": "65abc123...",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "user"
  }
}
```

---

## 📅 Slot Endpoints

### Get Available Slots
**GET** `/api/slots?date=2026-01-25`

Get available time slots for a specific date.

**Query Parameters:**
- `date` (optional): Format YYYY-MM-DD
- `startDate` (optional): Start of date range
- `endDate` (optional): End of date range

**Response:** `200 OK`
```json
{
  "success": true,
  "count": 10,
  "slots": [
    {
      "_id": "65abc...",
      "date": "2026-01-25",
      "startTime": "09:00",
      "endTime": "10:00",
      "isBlocked": false,
      "isBooked": false
    },
    {
      "_id": "65abd...",
      "date": "2026-01-25",
      "startTime": "10:00",
      "endTime": "11:00",
      "isBlocked": false,
      "isBooked": true,
      "bookingId": "65abe..."
    }
  ]
}
```

---

### Create Slot (Admin)
**POST** `/api/slots`

Create a single time slot.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "date": "2026-01-25",
  "startTime": "14:00",
  "endTime": "15:00"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Slot created successfully",
  "slot": {
    "_id": "65abc...",
    "date": "2026-01-25",
    "startTime": "14:00",
    "endTime": "15:00",
    "isBlocked": false
  }
}
```

---

### Create Bulk Slots (Admin)
**POST** `/api/slots/bulk`

Create multiple time slots for multiple dates.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "dates": ["2026-01-25", "2026-01-26", "2026-01-27"],
  "startTime": "09:00",
  "endTime": "22:00",
  "slotDuration": 60
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "30 slots created successfully",
  "count": 30,
  "slots": [...]
}
```

---

### Update Slot (Admin)
**PUT** `/api/slots/:id`

Update a time slot (e.g., block/unblock).

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "isBlocked": true
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Slot updated successfully",
  "slot": {
    "_id": "65abc...",
    "date": "2026-01-25",
    "startTime": "14:00",
    "endTime": "15:00",
    "isBlocked": true
  }
}
```

---

## 🎫 Booking Endpoints

### Create Booking
**POST** `/api/bookings`

Create a new booking request.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "slotId": "65abc123...",
  "rentalType": "JamRoom",
  "bandName": "The Rockers",
  "notes": "Need extra microphones"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "message": "Booking created successfully. Pending admin approval.",
  "booking": {
    "_id": "65def...",
    "userId": "65abc...",
    "slotId": {
      "_id": "65ghi...",
      "date": "2026-01-25",
      "startTime": "14:00",
      "endTime": "15:00"
    },
    "rentalType": "JamRoom",
    "price": 500,
    "bookingStatus": "PENDING",
    "paymentStatus": "PENDING"
  },
  "upiDetails": {
    "upiId": "jamroom@paytm",
    "upiName": "JamRoom Studio",
    "amount": 500
  }
}
```

---

### Get My Bookings
**GET** `/api/bookings/my-bookings`

Get all bookings for logged-in user.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "count": 3,
  "bookings": [
    {
      "_id": "65def...",
      "slotId": {
        "date": "2026-01-25",
        "startTime": "14:00",
        "endTime": "15:00"
      },
      "rentalType": "JamRoom",
      "price": 500,
      "bookingStatus": "CONFIRMED",
      "paymentStatus": "PAID",
      "createdAt": "2026-01-20T10:30:00.000Z"
    }
  ]
}
```

---

### Cancel Booking
**PUT** `/api/bookings/:id/cancel`

Cancel a pending booking.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Booking cancelled successfully",
  "booking": {
    "_id": "65def...",
    "bookingStatus": "CANCELLED"
  }
}
```

---

### Download Booking PDF
**GET** `/api/bookings/:id/download-pdf`

Download PDF invoice for user's own booking.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** `200 OK`  
Returns PDF file for download

**Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="booking-65def....pdf"
```

**Access Control:** Users can only download PDFs of their own bookings.

**Error Responses:**
- `404`: Booking not found
- `403`: Access denied (not user's booking)
- `500`: Server error generating PDF

---

## 👨‍💼 Admin Endpoints

### Get All Bookings (Admin)
**GET** `/api/admin/bookings?status=PENDING`

Get all bookings with optional status filter.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Query Parameters:**
- `status` (optional): PENDING, CONFIRMED, REJECTED, CANCELLED
- `date` (optional): Specific date
- `startDate` & `endDate` (optional): Date range

**Response:** `200 OK`
```json
{
  "success": true,
  "count": 5,
  "bookings": [
    {
      "_id": "65def...",
      "userId": {
        "_id": "65abc...",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "slotId": {
        "date": "2026-01-25",
        "startTime": "14:00",
        "endTime": "15:00"
      },
      "rentalType": "JamRoom",
      "price": 500,
      "bookingStatus": "PENDING",
      "userName": "John Doe",
      "userEmail": "john@example.com"
    }
  ]
}
```

---

### Approve Booking (Admin)
**PUT** `/api/admin/bookings/:id/approve`

Approve a pending booking.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Booking approved and confirmation sent",
  "booking": {
    "_id": "65def...",
    "bookingStatus": "CONFIRMED",
    "paymentStatus": "PAID"
  }
}
```

**Side Effects:**
- Sends confirmation email to user
- Sends notification to all admins
- Attaches calendar invite (.ics file)

---

### Reject Booking (Admin)
**PUT** `/api/admin/bookings/:id/reject`

Reject a pending booking.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "reason": "Slot no longer available"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Booking rejected",
  "booking": {
    "_id": "65def...",
    "bookingStatus": "REJECTED"
  }
}
```

---

### Get Statistics (Admin)
**GET** `/api/admin/stats`

Get admin dashboard statistics.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "stats": {
    "totalBookings": 45,
    "pendingBookings": 5,
    "confirmedBookings": 38,
    "totalRevenue": 22500,
    "recentBookings": [...]
  }
}
```

---

### Get Admin Settings (Admin)
**GET** `/api/admin/settings`

Get current admin settings.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`
```json
{
  "success": true,
  "settings": {
    "_id": "65xyz...",
    "rentalTypes": [
      {
        "name": "JamRoom",
        "description": "Basic jam room rental",
        "basePrice": 500
      }
    ],
    "prices": {
      "hourlyRate": 500,
      "instrumentsRate": 300,
      "soundSystemRate": 400
    },
    "upiId": "jamroom@paytm",
    "upiName": "JamRoom Studio",
    "adminEmails": ["admin@jamroom.com"],
    "businessHours": {
      "startTime": "09:00",
      "endTime": "22:00"
    },
    "slotDuration": 60
  }
}
```

---

### Update Admin Settings (Admin)
**PUT** `/api/admin/settings`

Update admin settings.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "upiId": "newid@paytm",
  "upiName": "New Studio Name",
  "adminEmails": ["admin@jamroom.com", "manager@jamroom.com"],
  "rentalTypes": [
    {
      "name": "JamRoom",
      "description": "Updated description",
      "basePrice": 600
    }
  ]
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Settings updated successfully",
  "settings": {...}
}
```

---

### Grant Admin Access (Admin)
**POST** `/api/admin/make-admin`

Grant admin privileges to an existing user.

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Request Body:**
```json
{
  "email": "newadmin@example.com"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "message": "Admin privileges granted successfully",
  "user": {
    "id": "65abc...",
    "name": "New Admin",
    "email": "newadmin@example.com",
    "role": "admin"
  }
}
```

---

### Download Booking PDF (Admin)
**GET** `/api/admin/bookings/:id/download-pdf`

Download PDF invoice for any booking (admin access).

**Headers:**
```
Authorization: Bearer <admin_token>
```

**Response:** `200 OK`  
Returns PDF file for download

**Response Headers:**
```
Content-Type: application/pdf
Content-Disposition: attachment; filename="booking-65def....pdf"
```

**Access Control:** Admins can download PDFs for any booking.

**Error Responses:**
- `404`: Booking not found
- `500`: Server error generating PDF

---

## ❌ Error Responses

All endpoints return consistent error responses:

**400 Bad Request**
```json
{
  "success": false,
  "message": "Please provide all required fields"
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**403 Forbidden**
```json
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}
```

**404 Not Found**
```json
{
  "success": false,
  "message": "Resource not found"
}
```

**409 Conflict**
```json
{
  "success": false,
  "message": "This time slot is already booked"
}
```

**500 Server Error**
```json
{
  "success": false,
  "message": "Server error"
}
```

---

## 📝 Status Values

### Booking Status
- `PENDING` - Awaiting admin approval
- `CONFIRMED` - Approved by admin
- `REJECTED` - Rejected by admin
- `CANCELLED` - Cancelled by user

### Payment Status
- `PENDING` - Payment not yet verified
- `PAID` - Payment confirmed
- `REFUNDED` - Payment refunded

### User Roles
- `user` - Regular user
- `admin` - Administrator

---

## 🔄 Typical Workflow

1. **User Registration**
   - POST `/api/auth/register`
   - Receives JWT token

2. **View Slots**
   - GET `/api/slots?date=2026-01-25`
   - Select available slot

3. **Create Booking**
   - POST `/api/bookings`
   - Receives UPI payment details
   - Status: PENDING

4. **Admin Approval**
   - Admin: GET `/api/admin/bookings?status=PENDING`
   - Admin: PUT `/api/admin/bookings/:id/approve`
   - Emails sent with calendar invite

5. **Confirmation**
   - User receives confirmation email
   - Status: CONFIRMED
   - Calendar invite attached

---

## 🧪 Testing with Postman/Thunder Client

1. **Register/Login** to get token
2. **Save token** in environment variables
3. **Use token** in Authorization header for protected routes
4. **Test full flow**: Register → Login → View Slots → Book → Admin Approve

---

**Need help?** Check the main README.md or SETUP_GUIDE.md
