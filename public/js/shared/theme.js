/**
 * ThemeManager - global light/dark theme handling with persistence.
 */
(() => {
    const STORAGE_KEY = 'jamroom-theme';
    const THEMES = {
        light: 'light',
        dark: 'dark'
    };

    const getSystemTheme = () => {
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? THEMES.dark
            : THEMES.light;
    };

    const getStoredTheme = () => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved === THEMES.dark || saved === THEMES.light ? saved : null;
    };

    const getCurrentTheme = () => {
        const active = document.documentElement.getAttribute('data-theme');
        if (active === THEMES.dark || active === THEMES.light) {
            return active;
        }
        return getStoredTheme() || getSystemTheme();
    };

    const getToggleLabel = () => {
        return getCurrentTheme() === THEMES.dark ? 'Light Mode' : 'Dark Mode';
    };

    const updateToggleButtons = () => {
        document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
            button.textContent = getToggleLabel();
            button.setAttribute('aria-label', `Switch to ${getToggleLabel()}`);
        });
    };

    const applyTheme = (theme, persist = true) => {
        if (theme !== THEMES.light && theme !== THEMES.dark) {
            return;
        }

        document.documentElement.setAttribute('data-theme', theme);
        if (persist) {
            localStorage.setItem(STORAGE_KEY, theme);
        }

        updateToggleButtons();
        document.dispatchEvent(new CustomEvent('jamroom:theme-changed', { detail: { theme } }));
    };

    const toggleTheme = () => {
        applyTheme(getCurrentTheme() === THEMES.dark ? THEMES.light : THEMES.dark);
    };

    const shouldInjectFloatingToggle = () => {
        return !document.querySelector('[data-theme-fab="true"]');
    };

    const injectFloatingToggle = () => {
        if (!shouldInjectFloatingToggle()) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle-fab';
        button.setAttribute('data-theme-toggle', 'true');
        button.setAttribute('data-theme-fab', 'true');
        button.addEventListener('click', toggleTheme);
        document.body.appendChild(button);
        updateToggleButtons();
    };

    const init = () => {
        const initialTheme = getStoredTheme() || getSystemTheme();
        applyTheme(initialTheme, false);

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener('change', () => {
            if (!getStoredTheme()) {
                applyTheme(getSystemTheme(), false);
            }
        });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectFloatingToggle);
        } else {
            injectFloatingToggle();
        }
    };

    window.ThemeManager = {
        init,
        toggleTheme,
        applyTheme,
        getCurrentTheme,
        updateToggleButtons
    };

    init();
})();
