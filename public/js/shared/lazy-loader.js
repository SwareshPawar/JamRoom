/**
 * LazyLoader - Defers loading of non-critical resources until needed
 * Reduces initial page load time by deferring Instagram SDK, analytics, and heavy libraries
 */
const LazyLoader = (() => {
    const loadedScripts = new Set();

    const loadScript = (src, options = {}) => {
        return new Promise((resolve, reject) => {
            if (loadedScripts.has(src)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = options.async !== false;
            script.defer = options.defer === true;

            if (options.module) {
                script.type = 'module';
            }

            script.onload = () => {
                loadedScripts.add(src);
                resolve();
            };

            script.onerror = () => {
                reject(new Error(`Failed to load script: ${src}`));
            };

            document.body.appendChild(script);
        });
    };

    const loadStylesheet = (href) => {
        return new Promise((resolve) => {
            if (document.querySelector(`link[href="${href}"]`)) {
                resolve();
                return;
            }

            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = resolve;
            link.onerror = resolve; // Don't fail on CSS errors
            document.head.appendChild(link);
        });
    };

    const loadInstagramSDK = () => {
        return loadScript('https://www.instagram.com/embed.js', { defer: true });
    };

    const loadFlatpickr = () => {
        return loadScript('/js/vendor/flatpickr.min.js', { async: true });
    };

    const loadFullCalendar = () => {
        return loadScript('https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js', { async: true });
    };

    const observeElement = (element, callback, options = {}) => {
        if (!('IntersectionObserver' in window)) {
            // Fallback for browsers without IntersectionObserver
            callback();
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    callback();
                    observer.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: options.rootMargin || '100px',
            threshold: 0.01
        });

        observer.observe(element);
    };

    return {
        loadScript,
        loadStylesheet,
        loadInstagramSDK,
        loadFlatpickr,
        loadFullCalendar,
        observeElement
    };
})();
