/* pwa-install.js — баннер установки PWA (Android + iOS) */
(function () {
  function init(opts) {
    opts = opts || {};
    const appName = opts.appName || document.title;
    const swPath  = opts.swPath  || '/sw.js';
    const bannerBg = opts.bannerBg || '#0a0a0f';

    // Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(swPath).catch(() => {});
    }

    // theme-color — завжди чорний
    function setThemeColor() {
      const meta = document.getElementById('themeColorMeta');
      if (meta) meta.setAttribute('content', '#000000');
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', setThemeColor);
    setThemeColor();

    // Не показывать если закрыли менее 7 дней назад
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 7 * 24 * 60 * 60 * 1000) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isInStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
    if (isInStandalone) return;

    let deferredPrompt = null;

    function createBanner(btnLabel, onBtnClick) {
      const b = document.createElement('div');
      b.id = 'pwa-install-banner';
      b.style.cssText = 'position:fixed;bottom:20px;left:12px;right:12px;'
        + 'background:' + bannerBg + ';color:#fff;border-radius:18px;'
        + 'padding:14px 16px;display:flex;align-items:center;gap:12px;'
        + 'box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:9000;'
        + 'font-family:-apple-system,Roboto,sans-serif;'
        + 'animation:pwaSlideUp .4s cubic-bezier(.32,1,.23,1);';
      b.innerHTML =
        '<span style="font-size:28px;flex-shrink:0">📲</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:600">' + appName + '</div>' +
          '<div style="font-size:12px;opacity:.7;margin-top:2px">Додати на екран</div>' +
        '</div>' +
        '<button id="pwa-action-btn" style="flex-shrink:0;padding:8px 16px;background:#fff;' +
          'color:' + bannerBg + ';border:none;border-radius:12px;font-size:13px;' +
          'font-weight:700;cursor:pointer">' + btnLabel + '</button>' +
        '<button id="pwa-close-btn" style="flex-shrink:0;background:none;border:none;' +
          'color:#fff;font-size:18px;cursor:pointer;opacity:.65;padding:2px 4px">✕</button>';

      if (!document.getElementById('pwa-style')) {
        const s = document.createElement('style');
        s.id = 'pwa-style';
        s.textContent = '@keyframes pwaSlideUp{from{transform:translateY(120%);opacity:0}to{transform:translateY(0);opacity:1}}';
        document.head.appendChild(s);
      }
      document.body.appendChild(b);
      document.getElementById('pwa-action-btn').onclick = onBtnClick;
      document.getElementById('pwa-close-btn').onclick = () => {
        b.remove();
        localStorage.setItem('pwa-install-dismissed', Date.now());
      };
    }

    function showIOSGuide() {
      const ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:9999;'
        + 'background:rgba(0,0,0,.8);display:flex;align-items:flex-end;padding:12px;';
      const steps = [
        'Натисни <strong style="color:#fff">«Поділитися»</strong> <span style="font-size:18px"> ⎙ </span> внизу Safari',
        'Вибери <strong style="color:#fff">«На екран «Додому»»</strong>',
        'Натисни <strong style="color:#fff">«Додати»</strong>',
      ];
      ov.innerHTML =
        '<div style="background:#1c1c1e;border-radius:22px;padding:24px;width:100%;' +
          'border:1px solid rgba(255,255,255,.12)">' +
          '<div style="font-size:17px;font-weight:700;margin-bottom:20px;' +
            'text-align:center;color:#fff">Встановлення</div>' +
          '<div style="display:flex;flex-direction:column;gap:16px">' +
          steps.map((t, i) =>
            '<div style="display:flex;align-items:center;gap:14px">' +
              '<div style="width:36px;height:36px;background:' + bannerBg + ';border-radius:10px;' +
                'display:flex;align-items:center;justify-content:center;' +
                'font-size:16px;font-weight:700;color:#fff;flex-shrink:0">' + (i+1) + '</div>' +
              '<div style="font-size:14px;color:rgba(255,255,255,.75);line-height:1.4">' + t + '</div>' +
            '</div>'
          ).join('') +
          '</div>' +
          '<button id="pwa-ios-ok" style="width:100%;margin-top:22px;padding:14px;background:' + bannerBg + ';' +
            'color:#fff;border:none;border-radius:14px;font-size:15px;' +
            'font-weight:600;cursor:pointer">Зрозуміло</button>' +
        '</div>';
      document.body.appendChild(ov);
      ov.onclick = e => { if (e.target === ov) ov.remove(); };
      document.getElementById('pwa-ios-ok').onclick = () => ov.remove();
    }

    if (isIOS) {
      const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|chrome/i.test(navigator.userAgent);
      if (isSafari) {
        setTimeout(() => createBanner('Як?', showIOSGuide), 2000);
      }
    } else {
      window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        setTimeout(() => {
          createBanner('Встановити', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            document.getElementById('pwa-install-banner')?.remove();
          });
        }, 1500);
      });
      window.addEventListener('appinstalled', () => {
        document.getElementById('pwa-install-banner')?.remove();
      });
    }
  }

  window.PWAInstall = { init };
})();
