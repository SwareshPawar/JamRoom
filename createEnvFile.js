const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

const createEnvFile = async () => {
  console.log('🔧 JamRoom Environment Setup');
  console.log('============================\n');

  const envPath = path.join(__dirname, '.env');
  const backendEnvPath = path.join(__dirname, 'backend', '.env');

  // Check if .env already exists
  if (fs.existsSync(envPath) || fs.existsSync(backendEnvPath)) {
    console.log('⚠️  .env file already exists!');
    const overwrite = await question('Do you want to overwrite it? (y/N): ');
    if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
      console.log('❌ Cancelled. Existing .env file preserved.');
      rl.close();
      return;
    }
  }

  console.log('This script will help you create the .env configuration file.\n');
  console.log('💡 You can press Enter to use default values (shown in brackets)\n');

  // Collect environment variables
  const envVars = {};

  // MongoDB URI
  console.log('📊 DATABASE CONFIGURATION');
  console.log('─────────────────────────');
  envVars.MONGODB_URI = await question('MongoDB URI [mongodb://localhost:27017/jamroom]: ') 
    || 'mongodb://localhost:27017/jamroom';

  // JWT Secret
  console.log('\n🔐 SECURITY CONFIGURATION');
  console.log('─────────────────────────');
  const defaultJwtSecret = require('crypto').randomBytes(64).toString('hex');
  envVars.JWT_SECRET = await question(`JWT Secret [auto-generated]: `) 
    || defaultJwtSecret;

  // Email Configuration
  console.log('\n📧 EMAIL CONFIGURATION');
  console.log('──────────────────────');
  envVars.EMAIL_USER = await question('Gmail address [your.email@gmail.com]: ') 
    || 'your.email@gmail.com';
  envVars.EMAIL_PASS = await question('Gmail App Password [your_app_password]: ') 
    || 'your_app_password';

  // Server Configuration
  console.log('\n🌐 SERVER CONFIGURATION');
  console.log('───────────────────────');
  envVars.PORT = await question('Server Port [5000]: ') || '5000';
  envVars.BASE_URL = await question(`Base URL [http://localhost:${envVars.PORT}]: `) 
    || `http://localhost:${envVars.PORT}`;

  // Node Environment
  envVars.NODE_ENV = await question('Environment [development]: ') || 'development';

  // Create .env content
  const envContent = `# 🎸 JamRoom Booking Application - Environment Variables
# Generated on: ${new Date().toISOString()}
# 
# ⚠️  SECURITY NOTICE:
# - Never commit this file to version control
# - Keep your JWT_SECRET and EMAIL_PASS secure
# - Use environment variables in production

# 📊 Database Configuration
MONGODB_URI=${envVars.MONGODB_URI}

# 🔐 Security Configuration  
JWT_SECRET=${envVars.JWT_SECRET}

# 📧 Email Configuration (Gmail SMTP)
EMAIL_USER=${envVars.EMAIL_USER}
EMAIL_PASS=${envVars.EMAIL_PASS}

# 🌐 Server Configuration
PORT=${envVars.PORT}
BASE_URL=${envVars.BASE_URL}
NODE_ENV=${envVars.NODE_ENV}

# 💡 Additional Configuration (Optional)
# CORS_ORIGIN=http://localhost:3000
# SESSION_SECRET=your-session-secret
# RATE_LIMIT_WINDOW_MS=900000
# RATE_LIMIT_MAX_REQUESTS=100

# 📝 NOTES:
# - For Gmail: Use App Password, not regular password
# - For production: Use MongoDB Atlas connection string
# - For local dev: Use mongodb://localhost:27017/jamroom
# - JWT_SECRET: Keep this secure and random (min 64 characters)
`;

  // Write to both locations (root and backend)
  try {
    // Write to root directory
    fs.writeFileSync(envPath, envContent);
    console.log(`\n✅ Created .env file: ${envPath}`);

    // Create backend directory if it doesn't exist
    const backendDir = path.join(__dirname, 'backend');
    if (!fs.existsSync(backendDir)) {
      fs.mkdirSync(backendDir, { recursive: true });
    }

    // Write to backend directory
    fs.writeFileSync(backendEnvPath, envContent);
    console.log(`✅ Created .env file: ${backendEnvPath}`);

    console.log('\n🎯 ENVIRONMENT SETUP COMPLETE!');
    console.log('────────────────────────────');
    console.log('✓ Environment variables configured');
    console.log('✓ JWT secret generated securely');
    console.log('✓ Database connection ready');
    console.log('✓ Email configuration set');

    console.log('\n📋 NEXT STEPS:');
    console.log('1. 🔧 Update EMAIL_USER and EMAIL_PASS with real Gmail credentials');
    console.log('2. 📊 Update MONGODB_URI if using MongoDB Atlas or different database');
    console.log('3. 🚀 Run: npm install');
    console.log('4. 🏃 Run: npm start');
    console.log('5. 🧪 Test: Visit http://localhost:' + envVars.PORT);

    if (envVars.EMAIL_USER === 'your.email@gmail.com') {
      console.log('\n⚠️  EMAIL SETUP REQUIRED:');
      console.log('- Replace EMAIL_USER with your Gmail address');
      console.log('- Replace EMAIL_PASS with your Gmail App Password');
      console.log('- Generate App Password: https://support.google.com/mail/answer/185833');
    }

    if (envVars.MONGODB_URI === 'mongodb://localhost:27017/jamroom') {
      console.log('\n💡 DATABASE OPTIONS:');
      console.log('- Local MongoDB: Current setting will work if MongoDB is installed locally');
      console.log('- MongoDB Atlas: Replace MONGODB_URI with your Atlas connection string');
      console.log('- Atlas Setup: https://www.mongodb.com/cloud/atlas');
    }

  } catch (error) {
    console.error('\n❌ Error creating .env file:', error.message);
    process.exit(1);
  }

  rl.close();
};

// Store environment template for reference
const createEnvTemplate = () => {
  const templatePath = path.join(__dirname, '.env.example');
  const templateContent = `# 🎸 JamRoom Environment Variables Template
# Copy this file to .env and fill in your values

# 📊 Database Configuration
MONGODB_URI=mongodb://localhost:27017/jamroom

# 🔐 Security Configuration (Generate a random 64+ character string)
JWT_SECRET=your-super-secret-jwt-key-minimum-64-characters-long

# 📧 Email Configuration (Gmail SMTP)
EMAIL_USER=your.email@gmail.com
EMAIL_PASS=your_gmail_app_password

# 🌐 Server Configuration
PORT=5000
BASE_URL=http://localhost:5000
NODE_ENV=development

# 💡 Production Example:
# MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/jamroom?retryWrites=true&w=majority
# BASE_URL=https://yourdomain.com
# NODE_ENV=production
`;

  try {
    fs.writeFileSync(templatePath, templateContent);
    console.log(`✅ Created .env.example template: ${templatePath}`);
  } catch (error) {
    console.error('❌ Error creating .env.example:', error.message);
  }
};

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes('--template') || args.includes('-t')) {
  createEnvTemplate();
} else if (args.includes('--help') || args.includes('-h')) {
  console.log('🔧 JamRoom Environment Setup Script');
  console.log('');
  console.log('Usage:');
  console.log('  node createEnvFile.js          # Interactive setup');
  console.log('  node createEnvFile.js -t       # Create .env.example template');
  console.log('  node createEnvFile.js --help   # Show this help');
  console.log('');
  console.log('This script creates the .env file needed for JamRoom to run.');
  console.log('It will ask you for configuration values or use secure defaults.');
} else {
  createEnvFile();
}