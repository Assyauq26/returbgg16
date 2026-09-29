(() => {
  'use strict';

  // The save flow already clears the internal draft state after saveReturns succeeds,
  // but the scanned result panel is rendered directly in the DOM and can remain stale.
  // Keep the reset strictly success-driven so failed saves or manual modal closes never
  // discard unsaved AWBs.
  let waitingForSuccess = false;
  let timer = null;

  const cleanup = () => {
    const textarea = document.querySelector('#awb');
    const scannedPanel = document.querySelector('.scanned-panel');
    const submit = document.querySelector('.btn-submit');

    if (textarea) {
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (scannedPanel) scannedPanel.remove();
    if (submit) {
      submit.disabled = false;
      submit.removeAttribute('disabled');
      submit.innerHTML = 'Submit';
    }

    waitingForSuccess = false;
  };

  const stop = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
    waitingForSuccess = false;
  };

  const waitForSuccess = (startedAt = Date.now()) => {
    if (!waitingForSuccess) return;

    const success = document.querySelector('#msg .notice.success');
    if (success) {
      cleanup();
      stop();
      return;
    }

    // Never clear the form just because the confirmation modal was closed.
    // Only a success notice authorizes the reset.
    if (Date.now() - startedAt >= 20000) {
      stop();
      return;
    }

    timer = window.setTimeout(() => waitForSuccess(startedAt), 100);
  };

  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action !== 'confirm-submit') return;

    stop();
    waitingForSuccess = true;
    waitForSuccess();
  }, true);

  // Navigation/rendering replaces the form DOM. No persistent references are kept,
  // so the guard remains safe across input/search navigation.
})();
