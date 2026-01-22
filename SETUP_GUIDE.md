# 🚀 Quick Setup Guide - JamRoom Booking Application

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure MongoDB

### Option A: MongoDB Atlas (Recommended for Production)

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a new cluster
4. Click "Connect" → "Connect your application"
5. Copy the connection string
6. Replace `<password>` with your database password
7. Replace `<dbname>` with `jamroom`

Example:
```
mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/jamroom?retryWrites=true&w=majority
```

### Option B: Local MongoDB

```bash
# Install MongoDB locally
# Then use:
mongodb://localhost:27017/jamroom
```

## Step 3: Setup Environment Variables

Create a `.env` file in the root directory:

```env
# MongoDB Connection (REQUIRED)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/jamroom?retryWrites=true&w=majority

# JWT Secret (REQUIRED) - Generate a random string
JWT_SECRET=put_a_very_long_random_string_here_minimum_32_chars

# Email Configuration (REQUIRED for notifications)
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Application URL
BASE_URL=http://localhost:5000

# Server Port
PORT=5000

# UPI Payment Details (for India)
UPI_ID=yourname@paytm
UPI_NAME=JamRoom Studio
```

## Step 4: Setup Gmail for Email Notifications

1. **Go to your Google Account Settings**
   - https://myaccount.google.com/

2. **Enable 2-Factor Authentication**
   - Security → 2-Step Verification → Turn On

3. **Create App Password**
   - Security → 2-Step Verification → App passwords
   - Select "Mail" and "Other (Custom name)"
   - Enter "JamRoom" as the name
   - Click "Generate"
   - Copy the 16-character password (format: xxxx xxxx xxxx xxxx)
   - Remove spaces and use in `.env` as `EMAIL_PASS`

Example:
```env
EMAIL_USER=mystudio@gmail.com
EMAIL_PASS=abcdabcdabcdabcd
```

## Step 5: Generate JWT Secret

Use one of these methods to generate a strong secret:

### Method 1: Node.js
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Method 2: Online
Use any JWT secret generator or password generator (minimum 32 characters)

### Method 3: Manual
Create a long random string with letters, numbers, and special characters

Example:
```env
JWT_SECRET=8f9d7a6b5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b
```

## Step 6: Start the Application

```bash
npm start
```

You should see:
```
✅ MongoDB Connected
✅ Admin user already exists (or created)
🚀 Server is running on port 5000
🌐 Visit: http://localhost:5000
📱 Admin Panel: http://localhost:5000/admin.html
```

## Step 7: Access the Application

1. **Home Page:** http://localhost:5000
2. **Login:** http://localhost:5000/login.html
3. **Admin Panel:** http://localhost:5000/admin.html

**Default Admin Credentials:**
- Email: `admin@jamroom.com`
- Password: `Admin@123`

## Step 8: First-Time Admin Setup

1. **Login as Admin**
   - Go to http://localhost:5000/login.html
   - Use default credentials

2. **Create Slots**
   - Go to Admin Panel → Manage Slots tab
   - Click "Create Slots"
   - Select date range (e.g., next 30 days)
   - Set business hours (e.g., 09:00 - 22:00)
   - Set slot duration (e.g., 60 minutes)
   - Click "Create Slots"

3. **Update Settings**
   - Go to Settings tab
   - Update UPI ID and Name for payments
   - Add admin emails (comma-separated)
   - Save settings

4. **Change Default Password**
   - Logout
   - Click "Forgot Password"
   - Enter admin@jamroom.com
   - Check email for reset link
   - Set new password

## Step 9: Test User Flow

1. **Register a Test User**
   - Go to http://localhost:5000/register.html
   - Fill in details
   - Register

2. **Book a Slot**
   - Login with test user
   - Go to Booking page
   - Select date and slot
   - Choose rental type
   - Submit booking

3. **Check Email**
   - Both user and admin should receive emails

4. **Approve Booking (as Admin)**
   - Login as admin
   - Go to Bookings tab
   - Click "Approve" on the pending booking
   - Check emails for confirmation + calendar invite

## ✅ Verification Checklist

- [ ] MongoDB connected successfully
- [ ] Server started without errors
- [ ] Can access home page
- [ ] Can login as admin
- [ ] Created time slots
- [ ] Registered test user
- [ ] Test user can see available slots
- [ ] Test user can create booking
- [ ] Email notifications working
- [ ] Admin can approve booking
- [ ] Calendar invite received

## 🐛 Common Issues

### Issue: MongoDB Connection Failed

**Solution:**
- Check MONGO_URI in `.env`
- Verify MongoDB Atlas IP whitelist (add 0.0.0.0/0 for testing)
- Check username and password
- Ensure database name is included in URI

### Issue: Email Not Sending

**Solution:**
- Verify Gmail App Password (not regular password)
- Check EMAIL_USER and EMAIL_PASS in `.env`
- Test with a simple email first
- Check spam folder

### Issue: Cannot Login

**Solution:**
- Use exact credentials: admin@jamroom.com / Admin@123
- Check console for errors
- Clear browser localStorage
- Restart server

### Issue: Port Already in Use

**Solution:**
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# Change port in .env
PORT=3000
```

## 📞 Need Help?

- Check the main README.md for detailed documentation
- Review server logs in terminal
- Check browser console for frontend errors
- Verify all environment variables are set

## 🎉 Success!

If everything works, you should be able to:
1. ✅ Book slots as a user
2. ✅ Approve bookings as admin
3. ✅ Receive email notifications
4. ✅ See UPI payment details
5. ✅ Download calendar invites

---

**Next Steps:**
- Deploy to production (Vercel/Render)
- Customize rental types and pricing
- Add more admin users
- Customize email templates
- Set up custom domain
