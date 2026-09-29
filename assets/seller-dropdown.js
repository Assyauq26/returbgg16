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
    if (!dropdown) return;
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
    refreshOptions(dropdown, search?.value || '');
    requestAnimationFrame(() => search?.focus());
  }

  function selectedLabel(select) {
    const option = select.options[select.selectedIndex];
    return option ? option.textContent.trim() : '';
  }

  function rawOptions(select) {
    return Array.from(select.options).map((option) => ({
      value: option.value,
      label: option.textContent.trim(),
      disabled: option.disabled
    }));
  }

  function getInfo(select) {
    const all = rawOptions(select);
    return {
      isSearch: select.id === 'searchSeller',
      real: all.filter((o) => o.value !== '' && !/^memuat seller|gagal memuat seller$/i.test(o.label)),
      loading: all.some((o) => o.disabled && /memuat seller/i.test(o.label)),
      failed: all.some((o) => o.disabled && /gagal memuat seller/i.test(o.label))
    };
  }

  function refreshOptions(dropdown, query = '') {
    const select = dropdown.querySelector('select');
    const list = dropdown.querySelector('.seller-dropdown-options');
    const count = dropdown.querySelector('.seller-dropdown-count');
    if (!select || !list) return;

    const info = getInfo(select);
    const normalized = String(query || '').trim().toLowerCase();

    if (info.loading) {
      dropdown.classList.add('is-loading');
      if (count) count.textContent = 'Memuat...';
      list.innerHTML = `<div class="seller-dropdown-skeleton" aria-label="Memuat daftar seller"><span></span><span></span><span></span><span></span></div>`;
      return;
    }

    dropdown.classList.remove('is-loading');
    const source = info.isSearch && !normalized
      ? [{ value: '', label: 'Semua seller', disabled: false }, ...info.real]
      : info.real;
    const filtered = source.filter((option) => !normalized || option.label.toLowerCase().includes(normalized));

    if (count) count.textContent = normalized ? `${filtered.length} ditemukan` : `${info.real.length} seller`;
    if (!filtered.length) {
      list.innerHTML = `<div class="seller-dropdown-empty"><b>${info.failed ? 'Gagal memuat seller' : 'Seller tidak ditemukan'}</b><span>${info.failed ? 'Periksa koneksi lalu coba lagi.' : 'Coba kata kunci lain.'}</span></div>`;
      return;
    }

    list.innerHTML = filtered.map((option) => {
      const selected = option.value === select.value;
      const label = option.value === '' && info.isSearch ? 'Semua seller' : option.label;
      return `<button type="button" role="option" aria-selected="${selected}" class="seller-dropdown-option${selected ? ' is-selected' : ''}" data-value="${esc(option.value)}">
        <span class="seller-option-icon">${selected ? '✓' : '•'}</span>
        <span class="seller-option-label">${esc(label || 'Tanpa nama')}</span>
        ${selected ? '<span class="seller-option-check">Terpilih</span>' : ''}
      </button>`;
    }).join('');
  }

  function updateTrigger(dropdown) {
    const select = dropdown.querySelector('select');
    const trigger = dropdown.querySelector('.seller-dropdown-trigger');
    const label = dropdown.querySelector('.seller-dropdown-value');
    if (!select || !trigger || !label) return;
    const info = getInfo(select);
    const text = selectedLabel(select) || (select.id === 'searchSeller' ? 'Semua seller' : 'Pilih seller');
    trigger.classList.toggle('has-value', !!select.value);
    trigger.classList.toggle('placeholder', !select.value);
    trigger.classList.toggle('is-loading', info.loading);
    trigger.classList.toggle('is-error', info.failed);
    label.textContent = info.loading ? 'Memuat seller...' : (info.failed ? 'Gagal memuat seller' : text);
    trigger.setAttribute('aria-label', `${select.id === 'searchSeller' ? 'Pilih seller untuk pencarian' : 'Pilih seller'}, ${label.textContent}`);
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
    trigger.innerHTML = `<span class="seller-trigger-main"><span class="seller-dropdown-value"></span></span><svg class="seller-trigger-chevron" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5.5 7.5 10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const panel = document.createElement('div');
    panel.className = 'seller-dropdown-panel';
    panel.hidden = true;
    panel.innerHTML = `<div class="seller-dropdown-search-wrap"><svg class="seller-search-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><input class="seller-dropdown-search" type="search" placeholder="Cari nama seller..." autocomplete="off" spellcheck="false"><button type="button" class="seller-search-clear" aria-label="Bersihkan pencarian" hidden>×</button></div><div class="seller-dropdown-meta"><span>Pilih seller</span><span class="seller-dropdown-count"></span></div><div class="seller-dropdown-options" role="listbox"></div>`;

    wrapper.appendChild(trigger);
    wrapper.appendChild(panel);

    const search = panel.querySelector('.seller-dropdown-search');
    const clear = panel.querySelector('.seller-search-clear');

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      if (wrapper.classList.contains('is-open')) closeDropdown(wrapper); else open(wrapper);
    });

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
      if (!option) return;
      select.value = option.dataset.value || '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      select.dispatchEvent(new Event('input', { bubbles: true }));
      updateTrigger(wrapper);
      refreshOptions(wrapper, search.value);
      closeDropdown(wrapper);
    });

    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDropdown(wrapper);
        trigger.focus();
      } else if (event.key === 'Enter') {
        const first = panel.querySelector('.seller-dropdown-option');
        if (first) {
          event.preventDefault();
          first.click();
        }
      }
    });

    select.addEventListener('change', () => {
      updateTrigger(wrapper);
      refreshOptions(wrapper, search.value);
    });

    const optionObserver = new MutationObserver(() => {
      updateTrigger(wrapper);
      refreshOptions(wrapper, search.value);
    });
    optionObserver.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });

    wrapper._sellerOptionObserver = optionObserver;
    updateTrigger(wrapper);
    refreshOptions(wrapper, '');
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

  const observer = new MutationObserver(syncNewSelects);
  observer.observe(document.getElementById('app') || document.body, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncNewSelects, { once: true });
  else syncNewSelects();
})();
