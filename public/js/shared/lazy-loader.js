/**
 * LazyLoader - Defers loading of non-critical resources until needed
 * Reduces initial page load time by deferring Instagram SDK, analytics, and heavy libraries
 */
const LazyLoader = (() => {
    const loadedScripts = new Set();
    const pendingScripts = new Map();

    const loadScript = (src, options = {}) => {
        if (!src) {
            return Promise.reject(new Error('Script source is required'));
        }

        if (loadedScripts.has(src)) {
            return Promise.resolve();
        }

        if (pendingScripts.has(src)) {
            return pendingScripts.get(src);
        }

        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            if (existingScript.dataset.lazyLoaderLoaded === 'true' || existingScript.readyState === 'complete') {
                loadedScripts.add(src);
                return Promise.resolve();
            }

            const existingPromise = new Promise((resolve, reject) => {
                existingScript.addEventListener('load', () => {
                    existingScript.dataset.lazyLoaderLoaded = 'true';
                    loadedScripts.add(src);
                    pendingScripts.delete(src);
                    resolve();
                }, { once: true });

                existingScript.addEventListener('error', () => {
                    pendingScripts.delete(src);
                    reject(new Error(`Failed to load script: ${src}`));
                }, { once: true });
            });

            pendingScripts.set(src, existingPromise);
            return existingPromise;
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = options.async !== false;
            script.defer = options.defer === true;

            if (options.module) {
                script.type = 'module';
            }

            script.onload = () => {
                script.dataset.lazyLoaderLoaded = 'true';
                loadedScripts.add(src);
                pendingScripts.delete(src);
                resolve();
            };

            script.onerror = () => {
                pendingScripts.delete(src);
                reject(new Error(`Failed to load script: ${src}`));
            };

            document.body.appendChild(script);
        });

        pendingScripts.set(src, promise);
        return promise;
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
        if (!element || typeof callback !== 'function') {
            return () => {};
        }

        let hasTriggered = false;
        const runOnce = () => {
            if (hasTriggered) {
                return;
            }

            hasTriggered = true;
            callback();
        };

        const isInViewport = () => {
            const rect = element.getBoundingClientRect();
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;

            return rect.bottom >= 0 && rect.right >= 0 && rect.top <= viewportHeight && rect.left <= viewportWidth;
        };

        if (!('IntersectionObserver' in window)) {
            // Fallback for browsers without IntersectionObserver
            runOnce();
            return () => {};
        }

        if (isInViewport()) {
            runOnce();
            return () => {};
        }

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    runOnce();
                    observer.unobserve(entry.target);
                }
            });
        }, {
            rootMargin: options.rootMargin || '100px',
            threshold: 0.01
        });

        observer.observe(element);

        return () => {
            observer.disconnect();
        };
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
