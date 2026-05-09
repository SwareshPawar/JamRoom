/**
 * Admin calendar module.
 * Handles FullCalendar setup and calendar event loading.
 */

(() => {
    const state = {
        calendar: null,
        fullCalendarReadyPromise: null
    };

    const loadScriptFallback = (src) => new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.body.appendChild(script);
    });

    const loadStyleFallback = (href) => new Promise((resolve) => {
        if (document.querySelector(`link[href="${href}"]`)) {
            resolve();
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = resolve;
        link.onerror = resolve;
        document.head.appendChild(link);
    });

    const ensureFullCalendarLoaded = async () => {
        if (window.FullCalendar && window.FullCalendar.Calendar) {
            return window.FullCalendar;
        }

        if (state.fullCalendarReadyPromise) {
            return state.fullCalendarReadyPromise;
        }

        const jsUrl = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js';
        const cssUrl = 'https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css';

        state.fullCalendarReadyPromise = (async () => {
            if (window.LazyLoader) {
                await Promise.all([
                    window.LazyLoader.loadStylesheet(cssUrl),
                    window.LazyLoader.loadFullCalendar()
                ]);
            } else {
                await Promise.all([
                    loadStyleFallback(cssUrl),
                    loadScriptFallback(jsUrl)
                ]);
            }

            if (!window.FullCalendar || !window.FullCalendar.Calendar) {
                throw new Error('FullCalendar failed to initialize.');
            }

            return window.FullCalendar;
        })();

        try {
            return await state.fullCalendarReadyPromise;
        } finally {
            state.fullCalendarReadyPromise = null;
        }
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

    const initCalendar = async ({ fullCalendar, loadCalendar }) => {
        let calendarLib = fullCalendar;

        if (!calendarLib || !calendarLib.Calendar) {
            try {
                calendarLib = await ensureFullCalendarLoaded();
            } catch (error) {
                console.error('FullCalendar is not available.', error);
                return;
            }
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

        state.calendar = new calendarLib.Calendar(calendarEl, {
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

    const loadCalendar = async ({ apiUrl, showAlert }) => {
        if (!state.calendar) {
            return;
        }

        const calendarLoading = document.getElementById('calendarLoading');

        const showCalendarLoading = () => {
            if (!calendarLoading) {
                return;
            }

            calendarLoading.classList.remove('admin-hidden');
            calendarLoading.innerHTML = window.JamRoomUtils?.getSectionLoaderMarkup
                ? window.JamRoomUtils.getSectionLoaderMarkup('Loading calendar events...')
                : 'Loading calendar events...';
        };

        const hideCalendarLoading = () => {
            if (!calendarLoading) {
                return;
            }

            calendarLoading.classList.add('admin-hidden');
            calendarLoading.innerHTML = '';
        };

        try {
            const month = document.getElementById('calendarMonth')?.value;
            const year = document.getElementById('calendarYear')?.value;
            showCalendarLoading();

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
        } finally {
            hideCalendarLoading();
        }
    };

    window.AdminCalendar = window.AdminCalendar || {};
    window.AdminCalendar.initCalendar = initCalendar;
    window.AdminCalendar.loadCalendar = loadCalendar;
})();
