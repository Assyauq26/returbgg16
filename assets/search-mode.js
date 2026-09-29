(() => {
  const cfg = window.APP_CONFIG || {};
  const searchState = { request: 0 };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const apiSearch = async (q) => {
    if (!cfg.API_URL) throw new Error('API_URL belum diatur.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: {'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({action:'searchReturns', q}),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Server merespons HTTP ${response.status}.`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.message || 'Pencarian gagal.');
      return data.data || {mode:'awb', sellerName:'', data:[]};
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Pencarian terlalu lama. Periksa koneksi atau Apps Script.');
      throw error;
    } finally { clearTimeout(timer); }
  };

  function renderSearch() {
    const page = document.querySelector('#pageContent');
    if (!page) return;
    page.innerHTML = `
      <div class="page-title">
        <h1>Pencarian Resi / AWB</h1>
        <p>Cari data retur cukup dengan <b>nomor resi atau nama seller</b>.</p>
      </div>
      <section class="card search-card">
        <div class="field full">
          <label for="returSearchKey">Resi / Nama Seller</label>
          <div class="search-key-wrap">
            <span class="search-key-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>
            </span>
            <input id="returSearchKey" value="" placeholder="Masukkan nomor resi atau nama seller..." autocomplete="off" enterkeyhint="search">
            <button class="search-key-clear" type="button" aria-label="Hapus pencarian" hidden>×</button>
          </div>
          <div class="hint">Masukkan satu kata kunci. Jika cocok dengan seller, seluruh AWB seller tersebut akan ditampilkan. Jika berupa resi, hasil resi akan ditampilkan.</div>
        </div>
        <div class="toolbar">
          <button class="btn btn-primary" data-retur-search="submit">Cari Data</button>
          <button class="btn" data-retur-search="reset">Reset</button>
        </div>
      </section>
      <section class="card" id="returSearchResults">
        <div class="empty">Masukkan resi atau nama seller lalu tekan Cari Data.</div>
      </section>`;

    const input = document.querySelector('#returSearchKey');
    const clear = document.querySelector('.search-key-clear');
    if (input && clear) {
      input.addEventListener('input', () => { clear.hidden = !input.value; });
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } });
      clear.addEventListener('click', () => { input.value=''; clear.hidden=true; input.focus(); });
    }
  }

  async function runSearch() {
    const input = document.querySelector('#returSearchKey');
    const results = document.querySelector('#returSearchResults');
    const button = document.querySelector('[data-retur-search="submit"]');
    const q = input?.value.trim() || '';
    if (!results) return;
    if (q.length < 3) { results.innerHTML = '<div class="empty">Masukkan minimal 3 karakter.</div>'; input?.focus(); return; }
    const request = ++searchState.request;
    if (button) { button.disabled = true; button.innerHTML = '<span class="spinner"></span> Mencari...'; }
    results.innerHTML = '<div class="loading-state"><span class="spinner spinner-dark"></span> Mencari data retur...</div>';
    try {
      const response = await apiSearch(q);
      if (request !== searchState.request) return;
      const rows = Array.isArray(response.data) ? response.data : [];
      const mode = response.mode || 'awb';
      const matchedSeller = response.sellerName || '';
      if (!rows.length) {
        results.innerHTML = `<div class="empty"><b>Data tidak ditemukan.</b><span>Tidak ada data yang cocok dengan “${esc(q)}”.</span></div>`;
        return;
      }
      const heading = mode === 'seller' ? `Data retur seller: <b>${esc(matchedSeller || q)}</b>` : `Hasil pencarian resi: <b>${esc(q)}</b>`;
      results.innerHTML = `<div class="result-meta"><span>${heading}</span><b>${rows.length} data</b></div><div class="table-wrap"><table class="table"><thead><tr><th>Timestamp</th><th>AWB</th><th>Seller</th></tr></thead><tbody>${rows.map(row => `<tr><td>${esc(row.timestampText)}</td><td><code>${esc(row.awb)}</code></td><td>${esc(row.sellerName)}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (error) {
      if (request === searchState.request) results.innerHTML = `<div class="empty"><b>Pencarian gagal.</b><span>${esc(error.message)}</span></div>`;
    } finally {
      if (request === searchState.request && button) { button.disabled = false; button.textContent = 'Cari Data'; }
    }
  }

  function resetSearch() { renderSearch(); document.querySelector('#returSearchKey')?.focus(); }

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
