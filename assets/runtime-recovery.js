(() => {
  'use strict';

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const getApp = () => document.getElementById('app');
  const getMain = () => document.getElementById('pageContent');

  function revealPage() {
    const main = getMain();
    if (!main) return false;
    main.style.opacity = '1';
    main.style.transform = 'none';
    return true;
  }

  function hasUsablePage() {
    const main = getMain();
    if (!main || main.children.length === 0 || main.textContent.trim().length <= 20) return false;
    const style = window.getComputedStyle(main);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
  }

  function recoverInput() {
    const root = getApp();
    if (!root || typeof window.inputPage !== 'function') return false;
    try {
      root.innerHTML = window.inputPage();
      return revealPage();
    } catch (_) {
      return false;
    }
  }

  function recoverSearch() {
    const root = getApp();
    if (!root || typeof window.searchPage !== 'function') return false;
    try {
      root.innerHTML = window.searchPage();
      return revealPage();
    } catch (_) {
      return false;
    }
  }

  async function bootGuard() {
    await wait(120);

    // app-fixed.js may render #pageContent while CSS keeps it transparent.
    // Reveal it before deciding that boot failed.
    if (getMain()) revealPage();

    if (!hasUsablePage()) {
      const recovered = recoverInput();
      if (recovered && typeof window.loadSellers === 'function') {
        window.loadSellers().catch(() => {});
      }
    }

    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action="go-input"], [data-action="go-search"]');
      if (!button) return;
      window.setTimeout(() => {
        if (getMain()) revealPage();
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
