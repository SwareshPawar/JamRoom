# 🚀 Deployment Guide - JamRoom Booking Application

## Prerequisites

- GitHub account
- MongoDB Atlas account (free tier works)
- Vercel or Render account (free tier works)
- Gmail account for email notifications

---

## Option 1: Deploy to Vercel (Recommended)

### Step 1: Prepare Your Repository

1. **Commit all changes**
   ```bash
   git add .
   git commit -m "Initial commit - JamRoom booking app"
   ```

2. **Push to GitHub**
   ```bash
   git remote add origin https://github.com/yourusername/jamroom.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Setup MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Database Access → Add New Database User
   - Username: `jamroom_user`
   - Password: Generate secure password (save it!)
4. Network Access → Add IP Address
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
5. Connect → Connect your application
   - Copy connection string
   - Replace `<jamroom_user>` with your password
   - Replace `<dbname>` with `jamroom`

Example:
```
mongodb+srv://jamroom_user:YourPassword@cluster0.xxxxx.mongodb.net/jamroom?retryWrites=true&w=majority
```

### Step 3: Deploy to Vercel

1. **Go to [Vercel](https://vercel.com)**
2. **Sign up/Login** with GitHub
3. **Import Project**
   - Click "Add New" → "Project"
   - Import your GitHub repository
4. **Configure Project**
   - Framework Preset: Other
   - Root Directory: ./
   - Build Command: (leave empty)
   - Output Directory: public
5. **Add Environment Variables**
   Click "Environment Variables" and add:
   
   ```
   MONGO_URI = mongodb+srv://jamroom_user:password@cluster.mongodb.net/jamroom?retryWrites=true&w=majority
   JWT_SECRET = your_generated_secret_64_chars_long
   EMAIL_USER = your.email@gmail.com
   EMAIL_PASS = your_gmail_app_password
   BASE_URL = https://your-app-name.vercel.app
   UPI_ID = yourname@paytm
   UPI_NAME = JamRoom Studio
   ```

6. **Deploy**
   - Click "Deploy"
   - Wait for deployment to complete
   - Your app will be live at: `https://your-app-name.vercel.app`

### Step 4: Test Deployment

1. Visit your Vercel URL
2. Login as admin: `admin@jamroom.com` / `Admin@123`
3. Create some time slots
4. Test booking flow
5. Check email notifications

---

## Option 2: Deploy to Render

### Step 1: Prepare Repository (Same as Vercel)

Push your code to GitHub.

### Step 2: Setup MongoDB Atlas (Same as Vercel)

Follow MongoDB Atlas setup above.

### Step 3: Deploy to Render

1. **Go to [Render](https://render.com)**
2. **Sign up/Login** with GitHub
3. **Create New Web Service**
   - Click "New" → "Web Service"
   - Connect your GitHub repository
4. **Configure Service**
   - Name: `jamroom-booking`
   - Environment: `Node`
   - Region: Choose closest to you
   - Branch: `main`
   - Build Command: `npm install`
   - Start Command: `node server.js`
5. **Add Environment Variables**
   Click "Advanced" → "Add Environment Variable"
   
   Add all variables from `.env.example`:
   ```
   MONGO_URI
   JWT_SECRET
   EMAIL_USER
   EMAIL_PASS
   BASE_URL (use Render URL: https://jamroom-booking.onrender.com)
   UPI_ID
   UPI_NAME
   ```

6. **Create Web Service**
   - Click "Create Web Service"
   - Wait 5-10 minutes for deployment
   - Your app will be live at: `https://jamroom-booking.onrender.com`

### Step 4: Test Deployment

Same as Vercel testing steps.

---

## Post-Deployment Steps

### 1. Update BASE_URL

After deployment, update `BASE_URL` environment variable:
- Vercel: `https://your-app-name.vercel.app`
- Render: `https://jamroom-booking.onrender.com`

### 2. Setup Custom Domain (Optional)

#### Vercel:
1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

#### Render:
1. Go to Settings → Custom Domain
2. Add your domain
3. Update DNS records

### 3. Create Admin Slots

1. Login as admin
2. Go to Admin Panel → Manage Slots
3. Create slots for the next 30-60 days

### 4. Configure Email Templates

Edit email templates in:
- `routes/auth.routes.js` (Welcome email)
- `routes/booking.routes.js` (Booking emails)
- `routes/admin.routes.js` (Admin emails)

### 5. Change Default Admin Password

1. Login as admin
2. Use "Forgot Password" to reset
3. Or create new admin user and delete default

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/jamroom` |
| `JWT_SECRET` | Secret for JWT tokens | 64+ character random string |
| `EMAIL_USER` | Email address for notifications | `studio@gmail.com` |
| `EMAIL_PASS` | Email password (App Password) | 16-char Gmail app password |
| `BASE_URL` | Your deployed app URL | `https://jamroom.vercel.app` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `UPI_ID` | UPI ID for payments | `jamroom@paytm` |
| `UPI_NAME` | UPI display name | `JamRoom Studio` |

---

## Continuous Deployment

Both Vercel and Render support automatic deployments:

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Update feature"
   git push origin main
   ```

2. **Automatic Deploy**
   - Vercel/Render detects the push
   - Automatically builds and deploys
   - Usually takes 1-2 minutes

---

## Monitoring & Logs

### Vercel:
- Dashboard → Your Project → Deployments → Logs
- Real-time logs available
- Function logs for debugging

### Render:
- Dashboard → Your Service → Logs
- Real-time streaming logs
- Download logs option

---

## Troubleshooting Production Issues

### Issue: MongoDB Connection Timeout

**Solution:**
- Check MONGO_URI is correct
- Verify IP whitelist includes 0.0.0.0/0
- Test connection locally first

### Issue: Email Not Sending in Production

**Solution:**
- Verify EMAIL_PASS is Gmail App Password
- Check Gmail security settings
- Test with different email provider if needed

### Issue: 500 Server Error

**Solution:**
- Check deployment logs
- Verify all environment variables
- Test locally with production env vars

### Issue: Static Files Not Loading

**Solution:**
- Verify `public` folder structure
- Check Vercel/Render static file serving config
- Clear browser cache

---

## Performance Optimization

### 1. Enable Compression
Already included in server.js

### 2. Database Indexes
Already created in models

### 3. Caching
Consider adding Redis for session management

### 4. CDN
Use Vercel Edge Network or Cloudflare

---

## Security Checklist for Production

- [ ] Changed default admin password
- [ ] Strong JWT_SECRET (64+ chars)
- [ ] MongoDB IP whitelist configured
- [ ] HTTPS enabled (automatic on Vercel/Render)
- [ ] Environment variables secured
- [ ] CORS properly configured
- [ ] Rate limiting enabled (optional)
- [ ] Input validation on all endpoints
- [ ] Regular backups of MongoDB

---

## Backup & Restore

### Backup MongoDB:
```bash
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/jamroom"
```

### Restore MongoDB:
```bash
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/jamroom" dump/
```

---

## Scaling Considerations

### Free Tier Limits:

**Vercel:**
- 100 GB bandwidth/month
- Serverless functions: 100 GB-hours/month

**Render:**
- 750 hours/month (always-on with paid plan)
- 100 GB bandwidth/month

**MongoDB Atlas:**
- 512 MB storage
- Shared CPU
- Sufficient for 1000+ users

### When to Upgrade:
- More than 500 bookings/month → MongoDB M10
- High traffic → Render Standard plan
- Need 99.99% uptime → Paid hosting

---

## Support & Maintenance

### Regular Tasks:
1. **Weekly:** Check server logs
2. **Monthly:** Review bookings and revenue
3. **Quarterly:** Update dependencies
4. **Annually:** Review and optimize

### Updates:
```bash
# Update dependencies
npm update

# Check for security vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix
```

---

## Success! 🎉

Your JamRoom Booking Application is now live and ready to accept bookings!

**Next Steps:**
- Share the URL with users
- Monitor first few bookings
- Collect user feedback
- Iterate and improve

---

**Need help?** Check the main README.md or create an issue on GitHub.
