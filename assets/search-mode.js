(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const state = { request: 0, sellers: [], sellersLoading: false, sellersLoaded: false };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function api(body) {
    if (!cfg.API_URL) throw new Error('API_URL belum diatur.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: {'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Server merespons HTTP ${response.status}.`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.message || 'Request gagal.');
      return data.data || {};
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Request terlalu lama. Periksa koneksi atau Apps Script.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function loadReturnSellers(force = false) {
    if (state.sellersLoading) return;
    if (state.sellersLoaded && !force) return;
    state.sellersLoading = true;
    setSellerOptions('loading');
    try {
      const data = await api({ action: 'getReturnSellers' });
      state.sellers = Array.isArray(data) ? data : [];
      state.sellersLoaded = true;
      setSellerOptions('ready');
    } catch (error) {
      state.sellers = [];
      setSellerOptions('error', error.message);
    } finally {
      state.sellersLoading = false;
    }
  }

  function setSellerOptions(mode, errorMessage = '') {
    const select = document.querySelector('#searchSeller');
    if (!select) return;
    if (mode === 'loading') {
      select.innerHTML = '<option value="">Pilih seller...</option><option value="" disabled>Memuat seller retur...</option>';
    } else if (mode === 'error') {
      select.innerHTML = '<option value="">Pilih seller...</option><option value="" disabled>Gagal memuat seller</option>';
      select.dataset.sellerLoadError = errorMessage || 'Gagal memuat seller.';
    } else {
      select.dataset.sellerLoadError = '';
      select.innerHTML = '<option value="">Pilih seller...</option>' + state.sellers.map(s => `<option value="${esc(s.name)}">${esc(s.name)} · ${Number(s.count || 0)} resi</option>`).join('');
    }
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderSearch() {
    const page = document.querySelector('#pageContent');
    if (!page) return;
    page.innerHTML = `
      <div class="page-title">
        <h1>Pencarian Data Retur</h1>
        <p>Cari dengan <b>salah satu</b>: nomor resi atau seller.</p>
      </div>

      <section class="card search-card">
        <div class="search-mode-grid">
          <div class="field full">
            <label for="returSearchKey">Nomor Resi / AWB</label>
            <div class="search-key-wrap">
              <span class="search-key-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>
              </span>
              <input id="returSearchKey" placeholder="Masukkan nomor resi..." autocomplete="off" enterkeyhint="search">
              <button class="search-key-clear" type="button" aria-label="Hapus resi" hidden>×</button>
            </div>
            <div class="hint">Gunakan ini jika ingin mencari satu resi atau AWB tertentu.</div>
          </div>

          <div class="search-or-divider"><span>ATAU</span></div>

          <div class="field full">
            <label for="searchSeller">Nama Seller</label>
            <select id="searchSeller">
              <option value="">Pilih seller...</option>
              <option value="" disabled>Memuat seller retur...</option>
            </select>
            <div class="hint">Daftar seller diambil dari <b>data retur yang sudah tersimpan</b>. Pilih seller untuk menampilkan seluruh AWB retur seller tersebut.</div>
          </div>
        </div>

        <div class="search-selection-note" id="searchSelectionNote">Pilih salah satu metode pencarian.</div>
        <div class="toolbar">
          <button class="btn btn-primary" data-retur-search="submit">Cari Data</button>
          <button class="btn" data-retur-search="reset">Reset</button>
        </div>
      </section>

      <section class="card" id="returSearchResults">
        <div class="empty">Masukkan nomor resi atau pilih seller, lalu tekan <b>Cari Data</b>.</div>
      </section>`;

    const input = document.querySelector('#returSearchKey');
    const clear = document.querySelector('.search-key-clear');
    const seller = document.querySelector('#searchSeller');

    input?.addEventListener('input', () => {
      clear.hidden = !input.value;
      if (input.value.trim()) {
        seller.value = '';
        seller.dispatchEvent(new Event('change', { bubbles: true }));
      }
      updateSelectionNote();
    });
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); runSearch(); }
    });
    clear?.addEventListener('click', () => {
      input.value = '';
      clear.hidden = true;
      updateSelectionNote();
      input.focus();
    });
    seller?.addEventListener('change', () => {
      if (seller.value) input.value = '';
      if (clear) clear.hidden = !input.value;
      updateSelectionNote();
    });

    updateSelectionNote();
    loadReturnSellers();
  }

  function updateSelectionNote() {
    const input = document.querySelector('#returSearchKey');
    const seller = document.querySelector('#searchSeller');
    const note = document.querySelector('#searchSelectionNote');
    if (!note) return;
    const hasAwb = !!input?.value.trim();
    const hasSeller = !!seller?.value;
    if (hasAwb && !hasSeller) {
      note.textContent = 'Mode pencarian: nomor resi / AWB';
      note.className = 'search-selection-note is-active';
    } else if (hasSeller && !hasAwb) {
      note.textContent = `Mode pencarian: seluruh retur seller “${seller.options[seller.selectedIndex]?.textContent.split(' · ')[0] || seller.value}”`;
      note.className = 'search-selection-note is-active';
    } else if (hasAwb && hasSeller) {
      note.textContent = 'Pilih salah satu saja: hapus resi atau seller.';
      note.className = 'search-selection-note is-error';
    } else {
      note.textContent = 'Pilih salah satu metode pencarian.';
      note.className = 'search-selection-note';
    }
  }

  async function runSearch() {
    const input = document.querySelector('#returSearchKey');
    const seller = document.querySelector('#searchSeller');
    const results = document.querySelector('#returSearchResults');
    const button = document.querySelector('[data-retur-search="submit"]');
    const q = input?.value.trim() || '';
    const sellerName = seller?.value || '';
    if (!results) return;

    if (q && sellerName) {
      updateSelectionNote();
      results.innerHTML = '<div class="empty"><b>Pilih satu metode pencarian.</b><span>Gunakan nomor resi <i>atau</i> nama seller, bukan keduanya.</span></div>';
      return;
    }
    if (!q && !sellerName) {
      results.innerHTML = '<div class="empty"><b>Belum ada pencarian.</b><span>Masukkan nomor resi atau pilih seller.</span></div>';
      return;
    }
    if (q && q.length < 3) {
      results.innerHTML = '<div class="empty">Nomor resi minimal 3 karakter.</div>';
      input?.focus();
      return;
    }

    const request = ++state.request;
    if (button) { button.disabled = true; button.innerHTML = '<span class="spinner"></span> Mencari...'; }
    results.innerHTML = '<div class="loading-state"><span class="spinner spinner-dark"></span> Mencari data retur...</div>';

    try {
      const response = await api({ action: 'searchReturns', q: q || '', sellerName: sellerName || '' });
      if (request !== state.request) return;
      const rows = Array.isArray(response.data) ? response.data : [];
      if (!rows.length) {
        const target = sellerName || q;
        results.innerHTML = `<div class="empty"><b>Data tidak ditemukan.</b><span>Tidak ada data retur untuk “${esc(target)}”.</span></div>`;
        return;
      }
      const heading = response.mode === 'seller'
        ? `Seluruh data retur seller: <b>${esc(response.sellerName || sellerName)}</b>`
        : `Hasil pencarian AWB: <b>${esc(q)}</b>`;
      results.innerHTML = `
        <div class="result-meta"><span>${heading}</span><b>${rows.length}${rows.length >= 500 ? '+' : ''} data</b></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Timestamp</th><th>AWB</th><th>Seller</th></tr></thead><tbody>
        ${rows.map(row => `<tr><td>${esc(row.timestampText)}</td><td><code>${esc(row.awb)}</code></td><td>${esc(row.sellerName)}</td></tr>`).join('')}
        </tbody></table></div>`;
    } catch (error) {
      if (request === state.request) results.innerHTML = `<div class="empty"><b>Pencarian gagal.</b><span>${esc(error.message)}</span></div>`;
    } finally {
      if (request === state.request && button) { button.disabled = false; button.textContent = 'Cari Data'; }
    }
  }

  function resetSearch() {
    renderSearch();
    setTimeout(() => document.querySelector('#returSearchKey')?.focus(), 0);
  }

  function apply() {
    if (location.hash !== '#search') return;
    renderSearch();
  }

  document.addEventListener('click', event => {
    const action = event.target.closest('[data-retur-search]')?.dataset.returSearch;
    if (action === 'submit') { event.preventDefault(); runSearch(); }
    if (action === 'reset') { event.preventDefault(); resetSearch(); }
  });

  window.addEventListener('hashchange', () => setTimeout(apply, 0));
  document.addEventListener('DOMContentLoaded', () => setTimeout(apply, 0));
})();
