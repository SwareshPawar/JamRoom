(function baselinePerfBootstrap() {
    if (typeof window === 'undefined' || typeof performance === 'undefined') {
        return;
    }

    if (window.__jamroomPerfBaselineInitialized) {
        return;
    }
    window.__jamroomPerfBaselineInitialized = true;

    const PAGE_LABELS = {
        '/booking.html': 'booking',
        '/admin.html': 'admin',
        '/my-bookings.html': 'my-bookings',
        '/account.html': 'account'
    };

    const path = window.location.pathname || '';
    const pageLabel = PAGE_LABELS[path];

    if (!pageLabel) {
        return;
    }

    const state = {
        firstContentfulPaintMs: null,
        largestContentfulPaintMs: null,
        firstInteractionMs: null,
        firstInteractionDelayMs: null,
        sent: false
    };

    const round = (value) => (typeof value === 'number' && Number.isFinite(value)
        ? Number(value.toFixed(2))
        : null);

    const toEventRelativeNow = (event) => {
        if (!event || typeof event.timeStamp !== 'number') {
            return null;
        }

        const eventTs = event.timeStamp;
        const now = performance.now();

        if (eventTs > now + 1000) {
            return null;
        }

        if (eventTs < 0) {
            return null;
        }

        return eventTs;
    };

    const captureFirstInteraction = (event) => {
        if (state.firstInteractionMs !== null) {
            return;
        }

        const eventMs = toEventRelativeNow(event);
        state.firstInteractionMs = round(eventMs !== null ? eventMs : performance.now());

        if (eventMs !== null) {
            state.firstInteractionDelayMs = round(Math.max(0, performance.now() - eventMs));
        }
    };

    ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => {
        window.addEventListener(eventName, captureFirstInteraction, {
            once: true,
            passive: true,
            capture: true
        });
    });

    if ('PerformanceObserver' in window) {
        try {
            const paintObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.name === 'first-contentful-paint') {
                        state.firstContentfulPaintMs = round(entry.startTime);
                    }
                });
            });
            paintObserver.observe({ type: 'paint', buffered: true });
        } catch (error) {
            // Ignore observer errors in unsupported browsers.
        }

        try {
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                if (lastEntry) {
                    state.largestContentfulPaintMs = round(lastEntry.startTime);
                }
            });
            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    lcpObserver.disconnect();
                }
            });
        } catch (error) {
            // Ignore observer errors in unsupported browsers.
        }
    }

    const sendMetric = () => {
        if (state.sent) {
            return;
        }

        const navigationEntry = performance.getEntriesByType('navigation')[0];
        const metric = {
            page: path,
            pageLabel,
            navigationType: navigationEntry ? navigationEntry.type : '',
            transferSize: navigationEntry ? navigationEntry.transferSize : null,
            encodedBodySize: navigationEntry ? navigationEntry.encodedBodySize : null,
            decodedBodySize: navigationEntry ? navigationEntry.decodedBodySize : null,
            domContentLoadedMs: navigationEntry ? round(navigationEntry.domContentLoadedEventEnd) : null,
            loadEventMs: navigationEntry ? round(navigationEntry.loadEventEnd) : null,
            firstContentfulPaintMs: state.firstContentfulPaintMs,
            largestContentfulPaintMs: state.largestContentfulPaintMs,
            firstInteractionMs: state.firstInteractionMs,
            firstInteractionDelayMs: state.firstInteractionDelayMs
        };

        state.sent = true;

        const payload = JSON.stringify(metric);
        const endpoint = '/api/test/perf-metrics';

        if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(endpoint, blob);
        } else {
            fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            }).catch(() => {
                // Ignore metric send errors.
            });
        }

        if (window.console && typeof window.console.info === 'function') {
            window.console.info('[perf-baseline]', metric);
        }
    };

    window.addEventListener('load', () => {
        setTimeout(sendMetric, 0);
    }, { once: true });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            sendMetric();
        }
    });
})();
