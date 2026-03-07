// Global variables
        const API_URL = window.location.origin;
        let currentUser = null;
        let settings = null;
        let selectedRentals = new Map();

        // Auth/init functions moved to booking-auth.js

        // Utility functions using shared modules
        const showAlert = (message, type = 'info') => {
            if (window.alertManager) {
                switch(type) {
                    case 'error':
                        window.alertManager.error(message);
                        break;
                    case 'success':
                        window.alertManager.success(message);
                        break;
                    case 'warning':
                        window.alertManager.warning(message);
                        break;
                    default:
                        window.alertManager.info(message);
                }
            } else {
                // Fallback
                alert(`${type.toUpperCase()}: ${message}`);
            }
        };

        // Using shared utility functions
        const formatDate = (dateStr) => {
            if (window.JamRoomUtils) {
                return window.JamRoomUtils.formatDate(dateStr, 'DD Mon YYYY');
            } else {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-IN', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
            }
        };

        const formatTime = (time) => {
            if (window.JamRoomUtils) {
                return window.JamRoomUtils.formatTime(time);
            } else {
                if (!time) return 'N/A';
                const [hours, minutes] = time.split(':');
                const hour = parseInt(hours);
                const ampm = hour >= 12 ? 'PM' : 'AM';
                const displayHour = hour % 12 || 12;
                return `${displayHour}:${minutes} ${ampm}`;
            }
        };

        const calculateEndTime = (startTime, duration) => {
            const [hours, minutes] = startTime.split(':').map(Number);
            const endMinutes = (hours * 60 + minutes + duration * 60);
            const endHours = Math.floor(endMinutes / 60) % 24;
            const endMins = endMinutes % 60;
            return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
        };

        // Loading functions using shared utils
        const showLoading = (message = 'Processing...') => {
            if (window.JamRoomUtils) {
                window.JamRoomUtils.showLoading(document.body, message);
            } else {
                // Fallback loading
                const overlay = document.getElementById('loadingOverlay');
                const messageEl = document.getElementById('loadingMessage');
                if (overlay && messageEl) {
                    messageEl.textContent = message;
                    overlay.classList.add('show');
                }
            }
        };
        
        const hideLoading = () => {
            if (window.JamRoomUtils) {
                window.JamRoomUtils.hideLoading(document.body);
            } else {
                // Fallback
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) {
                    overlay.classList.remove('show');
                }
            }
        };

        // Alias functions for compatibility
        const showLoadingOverlay = showLoading;
        const hideLoadingOverlay = hideLoading;

        // Rental settings/selection functions moved to booking-rentals.js

        // Price calculation functions moved to booking-pricing.js

        // Availability/timeline functions moved to booking-availability.js

        // Book slot
        const bookSlot = async (e) => {
            e.preventDefault();
            
            // Validate that at least one rental is selected
            if (selectedRentals.size === 0) {
                showAlert('Please select at least one rental option.', 'error');
                return;
            }
            
            // Show loading state
            const submitBtn = e.target.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.classList.add('loading');
            submitBtn.textContent = 'Creating Booking...';
            submitBtn.disabled = true;
            
            showLoadingOverlay('Creating your booking...');

            // Calculate prices
            const startTime = document.getElementById('startTime').value;
            const endTime = document.getElementById('endTime').value;
            const duration = calculateDuration(startTime, endTime);
            
            let subtotal = 0;
            const rentalsArray = [];
            
            console.log('Building rentals array from selectedRentals:', selectedRentals);
            
            selectedRentals.forEach((rental, key) => {
                console.log(`Processing rental: ${key}`, rental);
                
                // Validate required properties
                if (!rental.name || rental.price === undefined || !rental.quantity) {
                    console.error('Missing required rental properties:', rental);
                    throw new Error(`Invalid rental data for ${key}: missing name, price, or quantity`);
                }
                
                // Calculate item total based on rental type
                let itemTotal;
                let effectiveQuantity;
                
                if (rental.rentalType === 'perday') {
                    // Per-day rentals: flat rate regardless of duration
                    itemTotal = rental.price * rental.quantity;
                    effectiveQuantity = rental.quantity;
                } else if (rental.isRequired || rental.fullId.includes('_base')) {
                    // JamRoom base rentals
                    itemTotal = (rental.price || rental.basePrice) * rental.quantity * duration;
                    effectiveQuantity = rental.quantity;
                } else if (rental.price === 0) {
                    // Free add-ons (mics, jacks): allow quantities, no cost
                    itemTotal = 0;
                    effectiveQuantity = rental.quantity;
                } else if (rental.name.includes('IEM')) {
                    // IEM: special case - allow quantities but duration-based pricing
                    itemTotal = (rental.price || rental.basePrice) * rental.quantity * duration;
                    effectiveQuantity = rental.quantity;
                } else {
                    // Paid in-house rentals (guitars, keyboards): tied to jamroom duration (quantity 1)
                    itemTotal = (rental.price || rental.basePrice) * 1 * duration; // Force quantity = 1 for paid in-house
                    effectiveQuantity = 1;
                }
                subtotal += itemTotal;
                
                rentalsArray.push({
                    name: rental.name,
                    description: rental.description || '',
                    price: rental.price || rental.basePrice,
                    quantity: effectiveQuantity,
                    rentalType: rental.rentalType || 'inhouse'  // Include rental type for backend processing
                });
            });
            
            console.log('Final rentals array:', rentalsArray);
            
            // Calculate totals with configurable GST
            const gstEnabled = window.adminSettings?.gstConfig?.enabled || false;
            const gstRate = window.adminSettings?.gstConfig?.rate || 0.18;
            
            const taxAmount = gstEnabled ? Math.round(subtotal * gstRate) : 0;
            const totalAmount = subtotal + taxAmount;

            const formData = {
                date: document.getElementById('bookingDate').value,
                startTime: startTime,
                endTime: endTime,
                duration: duration,
                rentals: rentalsArray,
                subtotal: subtotal,
                taxAmount: taxAmount,
                totalAmount: totalAmount,
                bandName: document.getElementById('bandName').value,
                notes: document.getElementById('notes').value
            };

            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/api/bookings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(formData)
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Booking failed');
                }

                hideLoadingOverlay();
                showAlert('Booking created successfully! Pending admin approval.', 'success');
                
                // Show UPI details with enhanced payment methods
                if (data.upiDetails) {
                    const { upiId, amount, upiName } = data.upiDetails;
                    
                    // Update display elements
                    document.getElementById('upiId').textContent = upiId;
                    document.getElementById('upiAmount').textContent = `₹${amount}`;
                    document.getElementById('upiAmountCopy').textContent = `₹${amount}`;
                    document.getElementById('upiName').textContent = upiName;
                    
                    // Generate UPI payment link
                    const upiLink = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${amount}&cu=INR`;

                    const copyText = (value, successMessage) => {
                        navigator.clipboard.writeText(value).then(() => {
                            showAlert(successMessage, 'success');
                        }).catch(() => {
                            const textArea = document.createElement('textarea');
                            textArea.value = value;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            showAlert(successMessage, 'success');
                        });
                    };

                    const sharePaymentLink = async () => {
                        const shareText = `UPI payment for JamRoom booking\nUPI ID: ${upiId}\nAmount: ₹${amount}\nLink: ${upiLink}`;
                        if (navigator.share) {
                            try {
                                await navigator.share({
                                    title: 'JamRoom UPI Payment',
                                    text: shareText
                                });
                                return;
                            } catch (error) {
                                if (error && error.name === 'AbortError') return;
                            }
                        }
                        copyText(upiLink, 'UPI payment link copied to clipboard!');
                    };
                    
                    // Set up payment buttons
                    document.getElementById('payWithUPI').onclick = () => {
                        window.location.href = upiLink;
                    };
                    document.getElementById('payWithPhonePe').onclick = () => {
                        sharePaymentLink();
                    };
                    document.getElementById('payWithGPay').onclick = () => {
                        copyText(upiLink, 'UPI payment link copied to clipboard!');
                    };
                    
                    // Copy functions
                    document.getElementById('copyUpiId').onclick = () => {
                        navigator.clipboard.writeText(upiId).then(() => {
                            showAlert('UPI ID copied to clipboard!', 'success');
                        }).catch(() => {
                            // Fallback for older browsers
                            const textArea = document.createElement('textarea');
                            textArea.value = upiId;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            showAlert('UPI ID copied to clipboard!', 'success');
                        });
                    };
                    
                    document.getElementById('copyAmount').onclick = () => {
                        navigator.clipboard.writeText(amount.toString()).then(() => {
                            showAlert('Amount copied to clipboard!', 'success');
                        }).catch(() => {
                            const textArea = document.createElement('textarea');
                            textArea.value = amount.toString();
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand('copy');
                            document.body.removeChild(textArea);
                            showAlert('Amount copied to clipboard!', 'success');
                        });
                    };
                    
                    // Generate QR code
                    document.getElementById('upiQR').src = 
                        `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
                    
                    // Show payment section
                    document.getElementById('upiSection').classList.add('show');

                    // Build payment guide link with booking context
                    const paymentGuideLink = document.getElementById('paymentGuideLink');
                    if (paymentGuideLink) {
                        const bookingId = data.booking && data.booking._id ? data.booking._id : '';
                        const amountParam = encodeURIComponent(String(amount));
                        const bookingParam = encodeURIComponent(String(bookingId));
                        paymentGuideLink.href = `/payment-info.html?bookingId=${bookingParam}&amount=${amountParam}`;
                    }
                }

                // Reset form
                document.getElementById('bookingForm').reset();
                document.getElementById('priceDisplay').style.display = 'none';
                
                // Clear selected rentals
                selectedRentals.clear();
                document.querySelectorAll('.rental-option').forEach(option => {
                    option.classList.remove('selected');
                    option.querySelector('.rental-checkbox').checked = false;
                    const quantityDisplay = option.querySelector('.quantity-display');
                    if (quantityDisplay) {
                        quantityDisplay.textContent = '1';
                    }
                });
                
                // Reset button state
                submitBtn.classList.remove('loading');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                
                // Reload bookings
                await loadMyBookings();
                await loadAvailability(formData.date);

            } catch (error) {
                hideLoadingOverlay();
                
                // Reset button state on error
                submitBtn.classList.remove('loading');
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
                
                showAlert(error.message, 'error');
                console.error('Booking submission error:', error);
            }
        };

        // Booking history + billing actions moved to booking-bookings.js

        // Event listeners - Add safety checks since NavigationManager handles logout button
        const logoutBtnLegacy = document.getElementById('logoutBtn');
        if (logoutBtnLegacy) {
            logoutBtnLegacy.addEventListener('click', () => {
                localStorage.removeItem('token');
                window.location.href = '/login.html';
            });
        }

        const bookingForm = document.getElementById('bookingForm');
        if (bookingForm) {
            bookingForm.addEventListener('submit', bookSlot);
        }

        // Update price when time changes - Add safety checks
        const startTimeEl = document.getElementById('startTime');
        const endTimeEl = document.getElementById('endTime');
        const bookingDateEl = document.getElementById('bookingDate');
        
        if (startTimeEl) {
            startTimeEl.addEventListener('change', () => {
                populateEndTimeSlots();
                updatePriceDisplay();
            });
        }
        
        if (endTimeEl) {
            endTimeEl.addEventListener('change', updatePriceDisplay);
        }

        if (bookingDateEl) {
            bookingDateEl.addEventListener('change', async (e) => {
            const selectedDate = e.target.value;
            console.log('Date selected:', selectedDate);
            
            const startTimeSelect = document.getElementById('startTime');
            const endTimeSelect = document.getElementById('endTime');
            
                if (startTimeSelect && endTimeSelect) {
                    console.log('Resetting time selections and loading availability...');
                    // Reset time selections
                    startTimeSelect.innerHTML = '<option value="">Select date first</option>';
                    endTimeSelect.innerHTML = '<option value="">Select start time first</option>';
                    startTimeSelect.disabled = true;
                    endTimeSelect.disabled = true;

                    if (selectedDate) {
                        // Load availability data for the selected date
                        await loadAvailability(selectedDate);
                    } else {
                        const timeline = document.getElementById('referenceTimeline');
                        if (timeline) {
                            timeline.innerHTML = '<div class="loading-text">Select a date to view availability</div>';
                        }
                        window.currentAvailabilityData = null;
                    }
                } else {
                    // Clear reference timeline if no date selected
                    const timeline = document.getElementById('referenceTimeline');
                    if (timeline) {
                        timeline.innerHTML = '<div class="loading-text">Select a date to view availability</div>';
                    }
                    window.currentAvailabilityData = null;
                }
                
                // Update price display
                updatePriceDisplay();
            });
        }

        // Set minimum date to today - Add safety check
        const today = new Date().toISOString().split('T')[0];
        const bookingDateForMin = document.getElementById('bookingDate');
        if (bookingDateForMin) {
            bookingDateForMin.setAttribute('min', today);
        }

        // Initialize
        checkAuth();
