(() => {
  'use strict';

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getApp = () => document.getElementById('app');
  const getMain = () => document.getElementById('pageContent');

  function hasUsablePage() {
    const main = getMain();
    return !!(main && main.children.length > 0 && main.textContent.trim().length > 20);
  }

  function recoverInput() {
    const root = getApp();
    if (!root || typeof window.inputPage !== 'function') return false;
    try {
      root.innerHTML = window.inputPage();
      return true;
    } catch (_) {
      return false;
    }
  }

  function recoverSearch() {
    const root = getApp();
    if (!root || typeof window.searchPage !== 'function') return false;
    try {
      root.innerHTML = window.searchPage();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function bootGuard() {
    await wait(120);

    if (!hasUsablePage()) {
      const recovered = recoverInput();
      if (recovered && typeof window.loadSellers === 'function') {
        window.loadSellers().catch(() => {});
      }
    }

    // If the application has rendered its own navigation, do not interfere with it.
    // This listener only acts when the normal navigation handler did not render a page.
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="go-input"], [data-action="go-search"]');
      if (!button) return;
      window.setTimeout(() => {
        if (hasUsablePage()) return;
        if (button.dataset.action === 'go-search') {
          if (recoverSearch() && typeof window.loadReturnSellers === 'function') {
            window.loadReturnSellers().catch(() => {});
          }
        } else if (recoverInput() && typeof window.loadSellers === 'function') {
          window.loadSellers().catch(() => {});
        }
      }, 40);
    }, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootGuard, { once: true });
  } else {
    bootGuard();
  }
})();
