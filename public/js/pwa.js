/**
 * PWA：註冊 Service Worker、安裝提示（Android）、iOS 加到主畫面提示
 */
(function () {
  const INSTALL_DISMISS_KEY = 'kahoot_pwa_install_dismissed';
  let deferredPrompt = null;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW 註冊失敗', err);
      });
    });
  }

  function showBanner(html, onMount) {
    if (document.getElementById('pwa-install-banner')) return;
    if (sessionStorage.getItem(INSTALL_DISMISS_KEY) === '1') return;
    if (isStandalone()) return;

    const el = document.createElement('div');
    el.id = 'pwa-install-banner';
    el.className = 'pwa-install-banner';
    el.innerHTML = html;
    document.body.appendChild(el);
    if (typeof onMount === 'function') onMount(el);
  }

  function dismissBanner() {
    sessionStorage.setItem(INSTALL_DISMISS_KEY, '1');
    document.getElementById('pwa-install-banner')?.remove();
  }

  function setupInstallUI() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showBanner(
        `<div class="pwa-install-inner">
          <div>
            <strong>安裝 Kahoot App</strong>
            <p>加到主畫面，全螢幕遊玩更方便</p>
          </div>
          <div class="pwa-install-actions">
            <button type="button" class="btn btn-primary btn-small" id="pwa-install-btn">安裝</button>
            <button type="button" class="btn btn-secondary btn-small" id="pwa-dismiss-btn">稍後</button>
          </div>
        </div>`,
        (el) => {
          el.querySelector('#pwa-install-btn')?.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            dismissBanner();
          });
          el.querySelector('#pwa-dismiss-btn')?.addEventListener('click', dismissBanner);
        }
      );
    });

    // iOS 無法 beforeinstallprompt，改顯示操作說明
    if (isIos() && !isStandalone()) {
      setTimeout(() => {
        showBanner(
          `<div class="pwa-install-inner">
            <div>
              <strong>加到 iPhone 主畫面</strong>
              <p>點分享按钮 →「加入主畫面」即可全螢幕使用</p>
            </div>
            <div class="pwa-install-actions">
              <button type="button" class="btn btn-secondary btn-small" id="pwa-dismiss-btn">知道了</button>
            </div>
          </div>`,
          (el) => {
            el.querySelector('#pwa-dismiss-btn')?.addEventListener('click', dismissBanner);
          }
        );
      }, 1200);
    }

    // Android 若已是瀏覽器且很久沒觸發 prompt，仍給輕提示（可選關閉）
    if (isAndroid() && !isStandalone()) {
      // beforeinstallprompt 會處理；此處不重複
    }

    document.documentElement.classList.toggle('pwa-standalone', isStandalone());
  }

  registerSW();
  setupInstallUI();
})();
