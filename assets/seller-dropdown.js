(() => {
  'use strict';

  const SELECTORS = ['#seller', '#searchSeller'];
  let openDropdown = null;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function closeAll(except) {
    document.querySelectorAll('.seller-dropdown.is-open').forEach((dropdown) => {
      if (dropdown !== except) closeDropdown(dropdown);
    });
    if (!except) openDropdown = null;
  }

  function closeDropdown(dropdown) {
    dropdown.classList.remove('is-open');
    const trigger = dropdown.querySelector('.seller-dropdown-trigger');
    const panel = dropdown.querySelector('.seller-dropdown-panel');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (panel) panel.hidden = true;
    if (openDropdown === dropdown) openDropdown = null;
  }

  function open(dropdown) {
    closeAll(dropdown);
    dropdown.classList.add('is-open');
    const trigger = dropdown.querySelector('.seller-dropdown-trigger');
    const panel = dropdown.querySelector('.seller-dropdown-panel');
    const search = dropdown.querySelector('.seller-dropdown-search');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    if (panel) panel.hidden = false;
    openDropdown = dropdown;
    refreshOptions(dropdown, '');
    requestAnimationFrame(() => search?.focus());
  }

  function selectedLabel(select) {
    const option = select.options[select.selectedIndex];
    return option ? option.textContent.trim() : '';
  }

  function optionData(select) {
    return Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.textContent.trim(),
      disabled: option.disabled
    }));
  }

  function refreshOptions(dropdown, query) {
    const select = dropdown.querySelector('select');
    const list = dropdown.querySelector('.seller-dropdown-options');
    const count = dropdown.querySelector('.seller-dropdown-count');
    if (!select || !list) return;

    const normalized = String(query || '').trim().toLowerCase();
    const options = optionData(select);
    const filtered = options.filter((option) => !normalized || option.label.toLowerCase().includes(normalized));

    if (count) count.textContent = normalized ? `${filtered.length} ditemukan` : `${options.filter(o => o.label).length} pilihan`;

    if (!filtered.length) {
      list.innerHTML = '<div class="seller-dropdown-empty">Seller tidak ditemukan</div>';
      return;
    }

    list.innerHTML = filtered.map((option) => {
      const selected = option.value === select.value;
      return `<button type="button" class="seller-dropdown-option${selected ? ' is-selected' : ''}" data-value="${esc(option.value)}" ${option.disabled ? 'disabled' : ''}>
        <span class="seller-option-icon">${selected ? '✓' : '•'}</span>
        <span class="seller-option-label">${esc(option.label || 'Tanpa nama')}</span>
        ${selected ? '<span class="seller-option-check">Terpilih</span>' : ''}
      </button>`;
    }).join('');
  }

  function choose(dropdown, value) {
    const select = dropdown.querySelector('select');
    if (!select) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    select.dispatchEvent(new Event('input', { bubbles: true }));
    updateTrigger(dropdown);
    closeDropdown(dropdown);
  }

  function updateTrigger(dropdown) {
    const select = dropdown.querySelector('select');
    const trigger = dropdown.querySelector('.seller-dropdown-trigger');
    const label = dropdown.querySelector('.seller-dropdown-value');
    if (!select || !trigger || !label) return;
    const text = selectedLabel(select) || (select.id === 'searchSeller' ? 'Semua seller' : 'Pilih seller');
    if (label.textContent !== text) label.textContent = text;
    trigger.classList.toggle('has-value', !!select.value);
    trigger.classList.toggle('placeholder', !select.value);
    const aria = `${select.id === 'searchSeller' ? 'Pilih seller untuk pencarian' : 'Pilih seller'}, ${text}`;
    if (trigger.getAttribute('aria-label') !== aria) trigger.setAttribute('aria-label', aria);
  }

  function build(select) {
    if (!select || select.dataset.customDropdown === 'true') return;
    select.dataset.customDropdown = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = `seller-dropdown${select.id === 'searchSeller' ? ' seller-dropdown-search-filter' : ''}`;
    wrapper.dataset.for = select.id;

    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    select.classList.add('native-seller-select');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'seller-dropdown-trigger placeholder';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = `<span class="seller-trigger-main"><span class="seller-trigger-avatar">S</span><span class="seller-dropdown-value"></span></span><span class="seller-trigger-chevron">⌄</span>`;

    const panel = document.createElement('div');
    panel.className = 'seller-dropdown-panel';
    panel.hidden = true;
    panel.innerHTML = `<div class="seller-dropdown-search-wrap"><span class="seller-search-icon">⌕</span><input class="seller-dropdown-search" type="search" placeholder="Cari nama seller..." autocomplete="off" spellcheck="false"><button type="button" class="seller-search-clear" aria-label="Bersihkan pencarian" hidden>×</button></div><div class="seller-dropdown-meta"><span>Pilih seller</span><span class="seller-dropdown-count"></span></div><div class="seller-dropdown-options" role="listbox"></div>`;

    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);
    updateTrigger(wrapper);
    refreshOptions(wrapper, '');

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (wrapper.classList.contains('is-open')) closeDropdown(wrapper);
      else open(wrapper);
    });

    const search = panel.querySelector('.seller-dropdown-search');
    const clear = panel.querySelector('.seller-search-clear');
    search.addEventListener('input', () => {
      refreshOptions(wrapper, search.value);
      clear.hidden = !search.value;
    });
    clear.addEventListener('click', () => {
      search.value = '';
      clear.hidden = true;
      refreshOptions(wrapper, '');
      search.focus();
    });

    panel.querySelector('.seller-dropdown-options').addEventListener('click', (event) => {
      const option = event.target.closest('.seller-dropdown-option');
      if (!option || option.disabled) return;
      choose(wrapper, option.dataset.value || '');
    });

    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDropdown(wrapper);
        trigger.focus();
      } else if (event.key === 'Enter') {
        const first = panel.querySelector('.seller-dropdown-option:not([disabled])');
        if (first) {
          event.preventDefault();
          choose(wrapper, first.dataset.value || '');
        }
      }
    });

    select.addEventListener('change', () => {
      updateTrigger(wrapper);
      refreshOptions(wrapper, search.value);
    });
  }

  function syncNewSelects() {
    SELECTORS.forEach((selector) => {
      const select = document.querySelector(selector);
      if (select && select.dataset.customDropdown !== 'true') build(select);
    });
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.seller-dropdown')) closeAll();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openDropdown) closeDropdown(openDropdown);
  });

  // Observe only for NEW native seller selects created by the SPA.
  // Never update an already-built dropdown from the observer: its own
  // change listener handles that, preventing a MutationObserver feedback loop.
  const observer = new MutationObserver(syncNewSelects);
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncNewSelects, { once: true });
  else syncNewSelects();
})();
