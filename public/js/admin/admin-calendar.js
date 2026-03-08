/**
 * Admin calendar module.
 * Handles FullCalendar setup and calendar event loading.
 */

(() => {
    const state = {
        calendar: null
    };

    const buildEventTitle = (booking) => {
        const rentalSummary = booking.rentals && booking.rentals.length > 0
            ? `${booking.rentals.length} item(s)`
            : booking.rentalType;
        return `${booking.userName} - ${rentalSummary} (${booking.status})`;
    };

    const buildEventDetailsText = (booking) => {
        const rentalsDisplay = booking.rentals && booking.rentals.length > 0
            ? booking.rentals.map((r) => `  - ${r.name} × ${r.quantity}`).join('\n')
            : booking.rentalType;

        return `Booking Details:\nName: ${booking.userName}\nEmail: ${booking.userEmail}\nBand: ${booking.bandName || 'N/A'}\nRentals:\n${rentalsDisplay}\nPrice: ₹${booking.price}\nStatus: ${booking.status}\nPayment: ${booking.paymentStatus}\nNotes: ${booking.notes || 'N/A'}`;
    };

    const initCalendar = ({ fullCalendar, loadCalendar }) => {
        if (!fullCalendar || !fullCalendar.Calendar) {
            console.error('FullCalendar is not available.');
            return;
        }

        if (state.calendar) {
            state.calendar.destroy();
        }

        const now = new Date();
        const monthSelect = document.getElementById('calendarMonth');
        const yearSelect = document.getElementById('calendarYear');
        const calendarEl = document.getElementById('calendar');

        if (!monthSelect || !yearSelect || !calendarEl) {
            console.error('Calendar controls are missing.');
            return;
        }

        monthSelect.value = String(now.getMonth());
        yearSelect.innerHTML = '';

        for (let year = now.getFullYear() - 1; year <= now.getFullYear() + 2; year += 1) {
            const option = document.createElement('option');
            option.value = String(year);
            option.textContent = String(year);
            if (year === now.getFullYear()) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }

        state.calendar = new fullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            eventClick: (info) => {
                const booking = info.event.extendedProps || {};
                alert(buildEventDetailsText(booking));
            },
            eventDidMount: (info) => {
                const booking = info.event.extendedProps || {};
                info.el.setAttribute('title', buildEventTitle(booking));
            }
        });

        state.calendar.render();

        if (typeof loadCalendar === 'function') {
            loadCalendar();
        }
    };

    const loadCalendar = async ({ apiUrl, showSectionLoading, showAlert }) => {
        if (!state.calendar) {
            return;
        }

        try {
            const month = document.getElementById('calendarMonth')?.value;
            const year = document.getElementById('calendarYear')?.value;

            if (typeof showSectionLoading === 'function') {
                showSectionLoading('calendar', 'Loading calendar events...');
            }

            const token = localStorage.getItem('token');
            const res = await fetch(`${apiUrl}/api/admin/bookings/calendar?month=${month}&year=${year}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to load calendar data');
            }

            const data = await res.json();
            state.calendar.removeAllEvents();
            state.calendar.addEventSource(data.events || []);
            state.calendar.gotoDate(new Date(parseInt(year, 10), parseInt(month, 10), 1));
        } catch (error) {
            console.error('Failed to load calendar:', error);
            if (typeof showAlert === 'function') {
                showAlert('calendarAlert', 'Failed to load calendar data', 'error');
            }
        }
    };

    window.AdminCalendar = window.AdminCalendar || {};
    window.AdminCalendar.initCalendar = initCalendar;
    window.AdminCalendar.loadCalendar = loadCalendar;
})();
