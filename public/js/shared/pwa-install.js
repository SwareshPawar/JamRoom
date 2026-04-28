  /**
 * pwa-install.js
 * Shows a native-style "Add to Home Screen" banner for Android Chrome
 * (and any browser that fires beforeinstallprompt).
 *
 * Include this script in every page where the banner should appear.
 * Registration of the service worker is also handled here.
 */

(function () {
  'use strict';

  // ── Service-worker registration ──────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw-booking.js').catch(function (err) {
        console.warn('[PWA] SW registration failed:', err);
      });
    });
  }

  // ── Install-prompt banner ────────────────────────────────────────────────

  // Don't show if the user already dismissed permanently
  const DISMISSED_KEY = 'pwa_install_dismissed';
  if (sessionStorage.getItem(DISMISSED_KEY)) return;

  var deferredPrompt = null;

  // Inject banner CSS once
  var style = document.createElement('style');
  style.textContent = [
    '#pwa-install-banner {',
    '  position: fixed;',
    '  bottom: 0;',
    '  left: 0;',
    '  right: 0;',
    '  z-index: 9999;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: space-between;',
    '  gap: 12px;',
    '  padding: 14px 18px;',
    '  background: #0f172a;',
    '  color: #f1f5f9;',
    '  box-shadow: 0 -4px 20px rgba(0,0,0,0.40);',
    '  font-family: "Poppins", "Nunito Sans", sans-serif;',
    '  font-size: 14px;',
    '  border-top: 2px solid #38bdf8;',
    '  transform: translateY(100%);',
    '  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);',
    '}',
    '#pwa-install-banner.pwa-visible {',
    '  transform: translateY(0);',
    '}',
    '#pwa-install-banner .pwa-icon {',
    '  width: 44px;',
    '  height: 44px;',
    '  border-radius: 10px;',
    '  flex-shrink: 0;',
    '  object-fit: cover;',
    '}',
    '#pwa-install-banner .pwa-text {',
    '  flex: 1;',
    '  min-width: 0;',
    '}',
    '#pwa-install-banner .pwa-title {',
    '  font-weight: 700;',
    '  font-size: 14px;',
    '  white-space: nowrap;',
    '  overflow: hidden;',
    '  text-overflow: ellipsis;',
    '  color: #38bdf8;',
    '}',
    '#pwa-install-banner .pwa-sub {',
    '  font-size: 12px;',
    '  color: #94a3b8;',
    '  margin-top: 1px;',
    '}',
    '#pwa-install-banner .pwa-actions {',
    '  display: flex;',
    '  align-items: center;',
    '  gap: 8px;',
    '  flex-shrink: 0;',
    '}',
    '#pwa-install-btn {',
    '  background: linear-gradient(135deg, #38bdf8, #34d399);',
    '  color: #0f172a;',
    '  border: none;',
    '  border-radius: 8px;',
    '  padding: 8px 16px;',
    '  font-weight: 700;',
    '  font-size: 13px;',
    '  cursor: pointer;',
    '  font-family: inherit;',
    '  white-space: nowrap;',
    '}',
    '#pwa-install-btn:active { opacity: 0.85; }',
    '#pwa-dismiss-btn {',
    '  background: transparent;',
    '  border: 1px solid #334155;',
    '  color: #94a3b8;',
    '  border-radius: 8px;',
    '  width: 34px;',
    '  height: 34px;',
    '  font-size: 18px;',
    '  line-height: 1;',
    '  cursor: pointer;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-family: inherit;',
    '}',
    '#pwa-dismiss-btn:active { opacity: 0.7; }',
    '@media (max-width: 400px) {',
    '  #pwa-install-banner { padding: 12px 14px; }',
    '  #pwa-install-btn { padding: 7px 12px; font-size: 12px; }',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  function buildBanner() {
    var banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Install Swar Jamroom Studio app');

    banner.innerHTML =
      '<img class="pwa-icon" src="/icons/jamroom-192.png" alt="Swar Jamroom Studio icon" />' +
      '<div class="pwa-text">' +
        '<div class="pwa-title">Swar Jamroom Studio</div>' +
        '<div class="pwa-sub">Add to Home Screen for quick bookings</div>' +
      '</div>' +
      '<div class="pwa-actions">' +
        '<button id="pwa-install-btn" aria-label="Install app">Install</button>' +
        '<button id="pwa-dismiss-btn" aria-label="Close install prompt" title="Close">&#x2715;</button>' +
      '</div>';

    document.body.appendChild(banner);

    // Animate in next frame
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        banner.classList.add('pwa-visible');
      });
    });

    document.getElementById('pwa-install-btn').addEventListener('click', function () {
      hideBanner();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (outcome) {
          if (outcome.outcome === 'accepted') {
            sessionStorage.setItem(DISMISSED_KEY, '1');
          }
          deferredPrompt = null;
        });
      }
    });

    document.getElementById('pwa-dismiss-btn').addEventListener('click', function () {
      hideBanner();
      sessionStorage.setItem(DISMISSED_KEY, '1');
    });
  }

  function hideBanner() {
    var b = document.getElementById('pwa-install-banner');
    if (!b) return;
    b.classList.remove('pwa-visible');
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 400);
  }

  // Only proceed for Android Chrome (or any browser supporting the prompt)
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // Stop the mini-infobar
    deferredPrompt = e;
    // Slight delay so the banner doesn't appear before the page paints
    setTimeout(function () {
      if (!document.getElementById('pwa-install-banner')) buildBanner();
    }, 2500);
  });

  // Hide the banner if the app is successfully installed
  window.addEventListener('appinstalled', function () {
    hideBanner();
    sessionStorage.setItem(DISMISSED_KEY, '1');
    deferredPrompt = null;
  });
})();
