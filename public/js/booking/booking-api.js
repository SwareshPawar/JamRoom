/**
 * Booking API module.
 * Keeps booking request transport concerns separate from UI orchestration.
 */

const createBookingRequest = async (formData) => {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Session expired. Please log in again.');
    }

    const res = await fetch(`${API_URL}/api/bookings`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
    });

    let data = {};
    try {
        data = await res.json();
    } catch (error) {
        // Keep default empty object so error message fallback still works.
        data = {};
    }

    if (!res.ok) {
        throw new Error(data.message || 'Booking failed');
    }

    return data;
};

window.createBookingRequest = createBookingRequest;
