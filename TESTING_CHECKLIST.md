# ✅ Testing & Verification Checklist

Use this checklist to verify that everything is working correctly.

---

## � **Enhanced Rental System Testing (January 2026)**

### 🎸 **Rental Category Testing**

#### **JamRoom Base Quantity Restrictions**
- [ ] JamRoom base shows "Fixed: 1 room" instead of quantity controls
- [ ] Clicking +/- on JamRoom base has no effect
- [ ] Price changes only with duration: 2h = ₹600 (300×2)

#### **Free Add-ons Quantity Limits**
- [ ] Microphone: Can increase to max 4, then + button stops working
- [ ] Audio Jacks: Can increase to max 4, then + button stops working
- [ ] Both display as "FREE" in pricing summary

#### **IEM Special Case**
- [ ] IEM has quantity controls (not fixed at 1 like other in-house)
- [ ] Price: ₹50 × quantity × duration
- [ ] 3 IEMs, 2h = ₹300 total

#### **In-house vs Per-day Logic**
- [ ] Guitar (In-house): No +/- buttons, shows "Tied to JamRoom duration"
- [ ] Guitar (Per-day): Has +/- buttons, shows "₹800/day"
- [ ] In-house scales with duration: 2h = ₹400
- [ ] Per-day flat rate: any duration = ₹800

### 🎯 **UI/UX Testing**

#### **Collapsible Categories**
- [ ] Click "JamRoom" header → content expands/collapses
- [ ] Click "Instrument Rentals" header → content expands/collapses
- [ ] Icons change: − (expanded) ↔ + (collapsed)
- [ ] Gradient headers display correctly

#### **Visual Indicators**
- [ ] 🆓 Free items (mics, jacks)
- [ ] 🔗 In-house items (guitar, keyboard in-house)
- [ ] 📅 Per-day items (guitar, keyboard per-day)
- [ ] 🏠 Base categories (JamRoom base)

### 💰 **Complex Pricing Scenarios**

#### **Scenario 1: Band Session**
JamRoom (2h) + 2 Mics + Guitar In-house + 1 IEM
- [ ] JamRoom: ₹600 (300×2)
- [ ] Mics: FREE
- [ ] Guitar: ₹400 (200×2)
- [ ] IEM: ₹100 (50×1×2)
- [ ] **Expected Total**: ₹1,100 + GST

#### **Scenario 2: Mixed Rental Types**
JamRoom (1h) + Keyboard Per-day + 3 IEMs
- [ ] JamRoom: ₹300 (300×1)
- [ ] Keyboard: ₹800 (flat rate)
- [ ] IEMs: ₹150 (50×3×1)
- [ ] **Expected Total**: ₹1,250 + GST

### ⚡ **Real-time Updates**
- [ ] Change duration from 1h→3h: in-house items update automatically
- [ ] Change duration: per-day items stay same price
- [ ] Add/remove items: price summary updates instantly
- [ ] Quantity changes: pricing reflects immediately

---

## �🔧 Pre-Testing Setup

- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created with all required variables
- [ ] MongoDB connection string added to `.env`
- [ ] Gmail App Password configured
- [ ] Server starts without errors (`npm start`)

---

## 🌐 Basic Functionality Tests

### Landing Page
- [ ] Home page loads at http://localhost:5000
- [ ] All navigation links work
- [ ] Login/Register buttons visible
- [ ] Responsive design works on mobile

### User Registration
- [ ] Can access registration page
- [ ] Can register with valid details
- [ ] Password validation works (min 6 chars)
- [ ] Email validation works
- [ ] Receives JWT token
- [ ] Redirects to booking page
- [ ] Welcome email received

### User Login
- [ ] Can access login page
- [ ] Can login with registered user
- [ ] Wrong password shows error
- [ ] Invalid email shows error
- [ ] Receives JWT token
- [ ] Redirects based on role
- [ ] Token stored in localStorage

### Admin Login
- [ ] Can login as admin (admin@jamroom.com / Admin@123)
- [ ] Redirects to admin panel
- [ ] Admin menu shows correct options
- [ ] User menu hidden for admin-only items

---

## 👤 User Features Tests

### View Slots
- [ ] Can select a date
- [ ] Slots load for selected date
- [ ] Available slots show as clickable
- [ ] Booked slots show as disabled
- [ ] Blocked slots show as blocked
- [ ] Can select an available slot
- [ ] Selected slot highlights

### Create Booking
- [ ] Can select rental type
- [ ] Can enter band name (optional)
- [ ] Can add notes (optional)
- [ ] Submit button works
- [ ] Booking created successfully
- [ ] UPI QR code displays
- [ ] UPI details show correctly
- [ ] Confirmation message appears

### View My Bookings
- [ ] Bookings list loads
- [ ] Shows all user bookings
- [ ] Status badges display correctly
- [ ] Recent bookings appear first
- [ ] All booking details visible

### Cancel Booking
- [ ] Cancel button visible for PENDING bookings
- [ ] Confirmation dialog appears
- [ ] Booking status changes to CANCELLED
- [ ] Cancellation email received
- [ ] Slot becomes available again

### Download PDF (User)
- [ ] PDF download button visible in My Bookings
- [ ] PDF downloads successfully with correct filename
- [ ] PDF contains complete booking details
- [ ] PDF formatting matches booking data
- [ ] User can only download own booking PDFs
- [ ] Access denied for other users' bookings
- [ ] Error handling for invalid booking IDs

---

## 🛠️ Admin Features Tests

### Admin Dashboard
- [ ] Statistics cards display
- [ ] Total bookings count correct
- [ ] Pending bookings count correct
- [ ] Confirmed bookings count correct
- [ ] Total revenue calculated correctly

### View All Bookings
- [ ] All bookings list loads
- [ ] Filter by status works
- [ ] Booking details complete
- [ ] User information visible
- [ ] Action buttons show for pending bookings

### Approve Booking
- [ ] Approve button works
- [ ] Status changes to CONFIRMED
- [ ] User receives confirmation email
- [ ] All admins receive notification
- [ ] Calendar invite attached to email
- [ ] Payment status changes to PAID

### Reject Booking
- [ ] Reject button works
- [ ] Can enter rejection reason
- [ ] Status changes to REJECTED
- [ ] User receives rejection email
- [ ] Slot becomes available again

### Create Slots (Single)
- [ ] Can access slot creation form
- [ ] Can enter date, start time, end time
- [ ] Single slot creates successfully
- [ ] Duplicate slot prevented
- [ ] Slot appears in available slots

### Create Slots (Bulk)
- [ ] Bulk creation modal opens
- [ ] Can select date range
- [ ] Can set business hours
- [ ] Can set slot duration
- [ ] Multiple slots created
- [ ] Success message shows count
- [ ] All slots appear in list

### Block/Unblock Slots
- [ ] Block button works
- [ ] Slot status changes to blocked
- [ ] Blocked slot not bookable
- [ ] Unblock button works
- [ ] Unblocked slot becomes available
- [ ] Cannot block slot with confirmed booking

### Admin Settings
- [ ] Settings load correctly
- [ ] Can update UPI ID
- [ ] Can update UPI Name
- [ ] Can update admin emails
- [ ] Changes save successfully
- [ ] Settings reflect in bookings

### Grant Admin Access
- [ ] Can enter user email
- [ ] User promoted to admin
- [ ] User receives notification email
- [ ] User added to admin emails list
- [ ] User can access admin panel

### Download PDF (Admin)
- [ ] PDF download button visible for all bookings
- [ ] Admin can download PDF for any booking
- [ ] PDF downloads with correct filename format
- [ ] PDF contains complete booking information
- [ ] PDF shows studio branding and contact info
- [ ] Pricing breakdown matches booking data
- [ ] Error handling for non-existent bookings
- [ ] PDF generation works for all booking types

---

## 📧 Email Tests

- [ ] Welcome email received on registration
- [ ] Password reset email received
- [ ] Reset link works correctly
- [ ] Booking confirmation email received (user)
- [ ] New booking notification received (admin)
- [ ] Approval confirmation received (user)
- [ ] Approval notification received (admins)
- [ ] Calendar invite (.ics) attached
- [ ] Calendar invite opens in email client
- [ ] Rejection email received
- [ ] Cancellation email received

---

## 🔐 Security Tests

### Authentication
- [ ] Cannot access booking page without login
- [ ] Cannot access admin panel without admin role
- [ ] JWT token expires correctly
- [ ] Invalid token rejected
- [ ] Logout clears token

### Password Security
- [ ] Password not visible in responses
- [ ] Password hashed in database
- [ ] Forgot password works
- [ ] Reset token expires (30 mins)
- [ ] Old token cannot be reused

### Authorization
- [ ] Regular user cannot access admin routes
- [ ] Cannot approve bookings as user
- [ ] Cannot create slots as user
- [ ] Cannot view other users' sensitive data
- [ ] Admin can access all features

---

## 💾 Database Tests

### Data Integrity
- [ ] No duplicate users (email unique)
- [ ] No duplicate slots (date+time unique)
- [ ] Bookings reference valid users
- [ ] Bookings reference valid slots
- [ ] Deleted users cascade correctly
- [ ] Cancelled bookings free slots

### Validation
- [ ] Email format validated
- [ ] Required fields enforced
- [ ] Data types enforced
- [ ] Min/max values respected
- [ ] Enum values enforced

---

## 🎨 UI/UX Tests

### Responsive Design
- [ ] Works on desktop (1920x1080)
- [ ] Works on laptop (1366x768)
- [ ] Works on tablet (768x1024)
- [ ] Works on mobile (375x667)
- [ ] All buttons accessible
- [ ] Forms usable on mobile

### User Experience
- [ ] Loading states show
- [ ] Success messages appear
- [ ] Error messages clear
- [ ] Buttons have hover effects
- [ ] Forms have validation feedback
- [ ] Navigation intuitive

---

## 🚀 Performance Tests

- [ ] Page loads in < 2 seconds
- [ ] API responses in < 500ms
- [ ] Large slot lists load fine
- [ ] Many bookings handled well
- [ ] Email sending doesn't block
- [ ] Database queries optimized

---

## 🌐 Browser Compatibility

- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge
- [ ] Works in mobile browsers

---

## 🐛 Error Handling Tests

### Network Errors
- [ ] MongoDB connection failure handled
- [ ] Email sending failure handled
- [ ] API timeout handled
- [ ] Invalid JSON handled

### User Errors
- [ ] Missing fields show error
- [ ] Invalid email format rejected
- [ ] Short password rejected
- [ ] Invalid date rejected
- [ ] Conflicting bookings prevented

### Edge Cases
- [ ] Empty slot list handled
- [ ] No bookings message shown
- [ ] Past dates cannot be booked
- [ ] Overlapping slots prevented
- [ ] Concurrent bookings handled

---

## 📊 Data Validation Tests

### Bookings
- [ ] Cannot book past dates
- [ ] Cannot book blocked slots
- [ ] Cannot book already booked slots
- [ ] Cannot cancel confirmed bookings
- [ ] Cannot approve twice

### Slots
- [ ] Cannot create past date slots
- [ ] End time must be after start time
- [ ] Cannot delete slot with bookings
- [ ] Cannot block confirmed bookings

### Users
- [ ] Cannot register with existing email
- [ ] Password must meet requirements
- [ ] Email must be valid format
- [ ] Name required

---

## 🔄 Workflow Tests

### Complete User Journey
1. [ ] User registers
2. [ ] User receives welcome email
3. [ ] User logs in
4. [ ] User views slots
5. [ ] User books a slot
6. [ ] User sees UPI QR code
7. [ ] Admin receives notification
8. [ ] Admin approves booking
9. [ ] User receives confirmation
10. [ ] Both receive calendar invites

### Complete Admin Journey
1. [ ] Admin logs in
2. [ ] Admin views dashboard
3. [ ] Admin creates slots (bulk)
4. [ ] Admin sees new booking
5. [ ] Admin approves booking
6. [ ] Admin views statistics
7. [ ] Admin updates settings
8. [ ] Admin grants admin to user

---

## 📱 Mobile-Specific Tests

- [ ] Touch interactions work
- [ ] Buttons large enough
- [ ] Forms easy to fill
- [ ] Date picker works
- [ ] Time picker works
- [ ] Modals display correctly
- [ ] Tables scroll horizontally

---

## 🔐 Production Readiness Tests

- [ ] Environment variables configured
- [ ] MongoDB Atlas connection works
- [ ] Email sending works in production
- [ ] HTTPS enabled (Vercel/Render)
- [ ] CORS configured correctly
- [ ] Error logging working
- [ ] Default admin password changed

---

## 📝 Documentation Tests

- [ ] README.md complete
- [ ] SETUP_GUIDE.md clear
- [ ] DEPLOYMENT.md accurate
- [ ] API_DOCUMENTATION.md complete
- [ ] Code comments present
- [ ] .env.example up to date

---

## ✅ Final Verification

### All Systems Go?
- [ ] **Authentication** - Working ✅
- [ ] **User Booking** - Working ✅
- [ ] **Admin Panel** - Working ✅
- [ ] **Email System** - Working ✅
- [ ] **Payment QR** - Working ✅
- [ ] **Calendar Invites** - Working ✅
- [ ] **Security** - Implemented ✅
- [ ] **Documentation** - Complete ✅

---

## 🎉 Launch Checklist

Before going live:

- [ ] Changed default admin password
- [ ] Created 30+ days of slots
- [ ] Tested full booking flow
- [ ] Verified email delivery
- [ ] Updated UPI details
- [ ] Added real admin emails
- [ ] Set production BASE_URL
- [ ] Tested on mobile
- [ ] Reviewed all pricing
- [ ] Backup database configured

---

## 📊 Test Results Template

Use this to track your testing:

```
Date: _______________
Tester: _____________

✅ Passed: _____ / 150
❌ Failed: _____
⚠️  Warnings: _____

Critical Issues:
- 

Non-Critical Issues:
-

Notes:
-
```

---

## 🐛 Bug Report Template

If you find issues:

```
Bug Title: 
Priority: [ ] Critical [ ] High [ ] Medium [ ] Low

Steps to Reproduce:
1. 
2. 
3. 

Expected Result:


Actual Result:


Screenshots/Logs:


Browser/Device:


Environment:
[ ] Local Development
[ ] Production
```

---

## 💡 Testing Tips

1. **Test in order** - Follow the checklist from top to bottom
2. **Use real data** - Don't just use test@test.com
3. **Try to break it** - Find edge cases
4. **Check emails** - Verify all email types
5. **Mobile first** - Test mobile thoroughly
6. **Different browsers** - Check compatibility
7. **Fresh eyes** - Have someone else test
8. **Document issues** - Keep track of problems

---

**Happy Testing! 🧪**

Mark items as complete as you verify them. Aim for 100% completion before launch!
