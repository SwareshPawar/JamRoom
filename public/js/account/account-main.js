const API_URL = window.location.origin;
let currentUser = null;

// Check authentication
const token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login.html';
}

// Tab functionality
function showTab(tabName, triggerElement = null) {
    // Hide all tab panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    // Remove active class from all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    const activeButton = triggerElement
        || (typeof event !== 'undefined' ? event.target : null)
        || document.querySelector(`.tab-btn[onclick*="showTab('${tabName}'"]`);

    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Load data for specific tabs
    if (tabName === 'bookings' && !document.getElementById('bookingsList').hasAttribute('data-loaded')) {
        loadBookings();
    }
}

// Alert functions - Using shared AlertManager
function showAlert(message, type = 'error') {
    // Map our type names to shared AlertManager types
    const typeMap = { 'error': 'error', 'success': 'success' };
    if (window.alertManager) {
        window.alertManager.show(message, typeMap[type] || 'error');
    }
}

function formatDate(dateStr) {
    if (window.JamRoomUtils) {
        return window.JamRoomUtils.formatDate(dateStr, 'DD Mon YYYY');
    }
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatTime(time) {
    if (window.JamRoomUtils) {
        return window.JamRoomUtils.formatTime(time);
    }
    if (!time) return 'N/A';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function showLoadingOverlay(message = 'Processing...') {
    if (window.JamRoomUtils) {
        window.JamRoomUtils.showLoading(document.body, message);
    }
}

function hideLoadingOverlay() {
    if (window.JamRoomUtils) {
        window.JamRoomUtils.hideLoading(document.body);
    }
}

// Load user profile
async function loadProfile() {
    try {
        const response = await fetch(`${API_URL}/api/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;

            // Initialize and render NavigationManager with user data
            window.NavigationManager.init(currentUser);
            window.NavigationManager.updateAuth(currentUser);
            window.NavigationManager.render('navigationContainer');

            // Fill profile info
            document.getElementById('profileInfo').innerHTML = `
                <div class="info-card">
                    <h3>👤 Personal Info</h3>
                    <p><strong>Name:</strong> ${data.user.name}</p>
                    <p><strong>Email:</strong> ${data.user.email}</p>
                    <p><strong>Mobile:</strong> ${data.user.mobile || 'Not provided'}</p>
                </div>
                <div class="info-card">
                    <h3>📊 Account Info</h3>
                    <p><strong>Role:</strong> ${data.user.role}</p>
                    <p><strong>Member Since:</strong> ${new Date(data.user.createdAt).toLocaleDateString()}</p>
                </div>
            `;

            // Fill form
            document.getElementById('name').value = data.user.name;
            document.getElementById('email').value = data.user.email;
            document.getElementById('mobile').value = data.user.mobile || '';

            // Load WhatsApp preferences
            loadWhatsAppPreferences(data.user);
        } else {
            showAlert(data.message || 'Failed to load profile');
        }
    } catch (error) {
        console.error('Load profile error:', error);
        showAlert('Error loading profile');
    }
}

const loadScriptOnce = (src) => {
    if (document.querySelector(`script[src="${src}"]`)) {
        return Promise.resolve();
    }

    if (window.LazyLoader && typeof window.LazyLoader.loadScript === 'function') {
        return window.LazyLoader.loadScript(src, { async: true });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.body.appendChild(script);
    });
};

const ensureAccountBookingModulesLoaded = async () => {
    if (typeof window.loadMyBookings === 'function') {
        return;
    }

    await loadScriptOnce('/js/booking/booking-availability.js');
    await loadScriptOnce('/js/booking/booking-bookings.js');
    await loadScriptOnce('/js/client-pdf-generator.js');
};

// Load user bookings
async function loadBookings() {
    await ensureAccountBookingModulesLoaded();

    if (typeof window.loadMyBookings === 'function') {
        await window.loadMyBookings();
        document.getElementById('bookingsList').setAttribute('data-loaded', 'true');
        return;
    }

    showAlert('Booking module not loaded. Please refresh and try again.');
}

// Update profile
document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const updateBtn = document.getElementById('updateBtn');
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';

    try {
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const response = await fetch(`${API_URL}/api/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showAlert('Profile updated successfully!', 'success');
            // Update localStorage user info
            localStorage.setItem('user', JSON.stringify(result.user));
            // Reload profile display
            await loadProfile();
        } else {
            showAlert(result.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Update profile error:', error);
        showAlert('Error updating profile');
    } finally {
        updateBtn.disabled = false;
        updateBtn.textContent = 'Update Profile';
    }
});

// Change password
document.getElementById('passwordForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showAlert('New password and confirmation do not match');
        return;
    }

    const passwordBtn = document.getElementById('passwordBtn');
    passwordBtn.disabled = true;
    passwordBtn.textContent = 'Changing...';

    try {
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const response = await fetch(`${API_URL}/api/profile/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showAlert('Password changed successfully!', 'success');
            e.target.reset();
        } else {
            showAlert(result.message || 'Failed to change password');
        }
    } catch (error) {
        console.error('Change password error:', error);
        showAlert('Error changing password');
    } finally {
        passwordBtn.disabled = false;
        passwordBtn.textContent = 'Change Password';
    }
});

// Delete account
document.getElementById('deleteForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!confirm('Are you absolutely sure? This action cannot be undone and will permanently delete your account and all data.')) {
        return;
    }

    const deleteBtn = document.getElementById('deleteBtn');
    deleteBtn.disabled = true;
    deleteBtn.textContent = 'Deleting...';

    try {
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());

        const response = await fetch(`${API_URL}/api/profile`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showAlert('Account deleted successfully. Redirecting...', 'success');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setTimeout(() => {
                window.location.href = '/';
            }, 2000);
        } else {
            showAlert(result.message || 'Failed to delete account');
        }
    } catch (error) {
        console.error('Delete account error:', error);
        showAlert('Error deleting account');
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete Account';
    }
});

// WhatsApp Preferences Functions
function loadWhatsAppPreferences(user) {
    const whatsappEnabled = document.getElementById('whatsappEnabled');
    const sandboxJoined = document.getElementById('sandboxJoined');
    const whatsappSetup = document.getElementById('whatsappSetup');

    const whatsapp = user.whatsappNotifications || {
        enabled: false,
        verified: false,
        sandboxJoined: false
    };

    whatsappEnabled.checked = whatsapp.enabled;
    sandboxJoined.checked = whatsapp.sandboxJoined;
    whatsappEnabled.checked = false;
    sandboxJoined.checked = false;
    whatsappEnabled.disabled = true;
    sandboxJoined.disabled = true;
    whatsappSetup.style.display = 'none';

    // Update status
    updateWhatsAppStatus(whatsapp);

    // Add event listeners
    whatsappEnabled.addEventListener('change', function() {
        this.checked = false;
        whatsappSetup.style.display = 'none';
        showAlert('WhatsApp notifications are currently disabled');
    });
}

async function loadWhatsAppInstructions() {
    const setupInstructions = document.getElementById('setupInstructions');
    if (!setupInstructions) return;
    setupInstructions.innerHTML = `
        <div class="whatsapp-status-disabled">
            WhatsApp notifications are currently disabled and will be enabled later if needed.
        </div>
    `;
}

function updateWhatsAppStatus(whatsapp) {
    const statusDiv = document.getElementById('whatsappStatus');
    let statusHTML = '';

    if (whatsapp.enabled) {
        if (whatsapp.verified) {
            statusHTML = '<div class="whatsapp-status-active">✅ WhatsApp notifications are active!</div>';
        } else {
            statusHTML = '<div class="whatsapp-status-pending">⚠️ Verification required</div>';
        }
    } else {
        statusHTML = '<div class="whatsapp-status-disabled">WhatsApp notifications are currently disabled</div>';
    }

    statusDiv.innerHTML = statusHTML;
}

// Save WhatsApp preferences
document.getElementById('saveWhatsAppBtn').addEventListener('click', async function() {
    showAlert('WhatsApp notifications are currently disabled');
});

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Initialize shared modules and load profile
document.addEventListener('DOMContentLoaded', () => {
    console.log('👤 Account Page: Shared modules initialized');

    // Show loading placeholder in navigation before auth check
    if (window.NavigationManager) {
        window.NavigationManager.showLoadingPlaceholder('navigationContainer');
    }

    // Load user profile
    loadProfile();
});

window.showTab = showTab;
