const state = {
  page: location.hash === '#search' ? 'search' : 'input',
  sellers: [],
  pending: [],
  seller: '',
  scanner: null,
  scanTimer: null,
};

const cfg = window.APP_CONFIG || {};
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

async function api(body) {
  if (!cfg.API_URL) throw new Error('API_URL belum diatur di assets/config.js.');
  const response = await fetch(cfg.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || 'Request gagal.');
  return data;
}

async function loadSellers() {
  if (!cfg.API_URL) return;
  try {
    state.sellers = (await api({ action: 'getSellers' })).data || [];
  } catch (error) {
    state.error = error.message;
  }
}

function layout(content) {
  return `
    <header class="topbar">
      <div class="brand">${esc(cfg.APP_NAME || 'Retur BGG 16')}<small>Input & pencarian paket retur</small></div>
      <nav class="nav">
        <button class="${state.page === 'input' ? 'active' : ''}" onclick="go('input')">Input Resi</button>
        <button class="${state.page === 'search' ? 'active' : ''}" onclick="go('search')">Cari Resi</button>
      </nav>
    </header>
    <main class="container">${content}</main>`;
}

function inputPage() {
  return layout(`
    <div class="page-title">
      <h1>Input Resi Retur</h1>
      <p>Catat AWB paket retur yang sudah diambil oleh seller.</p>
    </div>

    <section class="card">
      <div class="grid">
        <div class="field full">
          <label>Seller</label>
          <div class="seller-row">
            <select id="seller">
              <option value="">Pilih seller</option>
              ${state.sellers.map((seller) => `
                <option ${state.seller === seller.name ? 'selected' : ''} value="${esc(seller.name)}">${esc(seller.name)}</option>
              `).join('')}
            </select>
            <button class="btn" onclick="openSeller()">+ Seller</button>
          </div>
        </div>

        <div class="field full">
          <label>Nomor Resi / AWB</label>
          <textarea id="awb" placeholder="Scan barcode/QR atau paste banyak AWB. Satu AWB per baris."></textarea>
          <div class="hint">Scanner PC dapat mengirim AWB seperti input keyboard. Banyak AWB bisa dipaste sekaligus.</div>
        </div>
      </div>

      <div class="toolbar input-actions">
        <button class="btn btn-primary btn-submit" onclick="openConfirmation()">Submit</button>
      </div>
    </section>

    <div id="msg"></div>
    <div id="scannerMount"></div>
  `);
}

function searchPage() {
  return layout(`
    <div class="page-title">
      <h1>Pencarian Resi / AWB</h1>
      <p>Cari nomor resi yang sudah tersimpan.</p>
    </div>
    <section class="card">
      <div class="grid">
        <div class="field">
          <label>AWB / kata kunci</label>
          <input id="q" placeholder="Minimal 3 karakter">
        </div>
        <div class="field">
          <label>Seller (opsional)</label>
          <select id="searchSeller">
            <option value="">Semua seller</option>
            ${state.sellers.map((seller) => `<option value="${esc(seller.name)}">${esc(seller.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" onclick="search()">Cari</button>
        <button class="btn" onclick="resetSearch()">Reset</button>
      </div>
    </section>
    <section class="card" id="results"><div class="empty">Masukkan kata kunci lalu tekan Cari.</div></section>
  `);
}

function parse(value) {
  return [...new Set(
    value
      .split(/[\n,;\t ]+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.replace(/\s+/g, '').toUpperCase())
  )];
}

function showMessage(text, success = false) {
  const element = $('#msg');
  if (element) {
    element.innerHTML = text
      ? `<div class="notice ${success ? 'success' : ''}">${esc(text)}</div>`
      : '';
  }
}

function getCurrentInput() {
  const seller = $('#seller')?.value || '';
  const awbs = parse($('#awb')?.value || '');
  state.seller = seller;
  return { seller, awbs };
}

function openConfirmation() {
  const { seller, awbs } = getCurrentInput();
  if (!seller) return showMessage('Pilih seller terlebih dahulu.');
  if (!awbs.length) return showMessage('Masukkan minimal satu AWB.');

  state.pending = awbs;
  showConfirmationModal(seller, awbs);
}

function showConfirmationModal(seller, awbs) {
  closeModal('confirmModal');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bg" id="confirmModal">
      <div class="modal modal-confirm" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <div class="modal-header">
          <div>
            <div class="modal-kicker">Konfirmasi Input</div>
            <h3 id="confirmTitle">Periksa Ringkasan</h3>
          </div>
          <button class="icon-btn" onclick="closeModal('confirmModal')" aria-label="Tutup">×</button>
        </div>

        <div class="summary">
          <div class="metric"><b>${awbs.length}</b><span>Total AWB unik</span></div>
          <div class="metric"><b>${esc(seller)}</b><span>Seller</span></div>
          <div class="metric"><b>Siap</b><span>Status</span></div>
        </div>

        <div class="confirm-list">
          <div class="confirm-list-title">Daftar AWB</div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>No</th><th>Nomor Resi / AWB</th></tr></thead>
              <tbody>${awbs.map((awb, index) => `<tr><td>${index + 1}</td><td><code>${esc(awb)}</code></td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>

        <div class="confirm-note">Pastikan seller dan seluruh nomor AWB sudah benar sebelum disimpan.</div>
        <div class="modal-actions">
          <button class="btn" onclick="closeModal('confirmModal')">Kembali</button>
          <button class="btn btn-primary" id="confirmSubmitBtn" onclick="confirmSubmit()">Submit / Konfirmasi</button>
        </div>
      </div>
    </div>
  `);
}

async function confirmSubmit() {
  const button = $('#confirmSubmitBtn');
  if (!state.pending.length || !state.seller || !button) return;
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Menyimpan...';

  try {
    const data = await api({
      action: 'saveReturns',
      sellerName: state.seller,
      awbs: state.pending,
    });

    closeModal('confirmModal');
    $('#awb').value = '';
    state.pending = [];
    showMessage(`Berhasil menyimpan ${data.data.savedCount} AWB pada ${data.data.timestampText}.`, true);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Submit / Konfirmasi';
    showMessage(error.message);
  }
}

function openScanner() {
  closeModal('scannerModal');
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bg" id="scannerModal">
      <div class="modal scanner-modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <div><div class="modal-kicker">Scanner</div><h3>Scan Barcode / QR</h3></div>
          <button class="icon-btn" onclick="closeScanner()" aria-label="Tutup">×</button>
        </div>
        <div class="scanner-frame">
          <video id="scannerVideo" autoplay muted playsinline></video>
          <div class="scanner-guide"><span></span></div>
        </div>
        <div id="scannerStatus" class="scanner-status">Meminta akses kamera...</div>
        <div class="modal-actions"><button class="btn" onclick="closeScanner()">Tutup Scanner</button></div>
      </div>
    </div>
  `);
  startScanner();
}

async function startScanner() {
  const video = $('#scannerVideo');
  const status = $('#scannerStatus');
  if (!video || !status) return;

  if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
    status.textContent = 'Scanner kamera belum didukung browser ini. Gunakan scanner USB atau input manual.';
    return;
  }

  try {
    const detector = new BarcodeDetector({ formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    state.scanner = { stream, detector };
    video.srcObject = stream;
    status.textContent = 'Arahkan kamera ke barcode/QR. Scanner akan menambahkan AWB otomatis.';
    scanFrame();
  } catch (error) {
    status.textContent = 'Kamera tidak dapat digunakan. Periksa izin kamera browser.';
  }
}

async function scanFrame() {
  if (!state.scanner || !$('#scannerVideo')) return;
  try {
    const codes = await state.scanner.detector.detect($('#scannerVideo'));
    if (codes.length) {
      const value = codes[0].rawValue?.trim();
      if (value) addScannedAwb(value);
    }
  } catch (_) {
    // Kamera tetap berjalan; error deteksi individual diabaikan.
  }
  state.scanTimer = requestAnimationFrame(scanFrame);
}

function addScannedAwb(value) {
  const awb = value.replace(/\s+/g, '').toUpperCase();
  if (!awb) return;
  const existing = parse($('#awb')?.value || '');
  if (!existing.includes(awb)) {
    $('#awb').value = [...existing, awb].join('\n');
    const status = $('#scannerStatus');
    if (status) status.textContent = `Terbaca: ${awb}. Lanjut scan AWB berikutnya.`;
  } else {
    const status = $('#scannerStatus');
    if (status) status.textContent = `Duplikat: ${awb}. AWB tidak ditambahkan lagi.`;
  }
}

function closeScanner() {
  if (state.scanTimer) cancelAnimationFrame(state.scanTimer);
  state.scanTimer = null;
  if (state.scanner?.stream) state.scanner.stream.getTracks().forEach((track) => track.stop());
  state.scanner = null;
  closeModal('scannerModal');
}

function closeModal(id) {
  document.getElementById(id)?.remove();
}

async function search() {
  const q = $('#q')?.value.trim() || '';
  const seller = $('#searchSeller')?.value || '';
  if (q.length < 3) {
    $('#results').innerHTML = '<div class="notice">Masukkan minimal 3 karakter.</div>';
    return;
  }
  try {
    const data = await api({ action: 'searchReturns', q, sellerName: seller });
    const rows = data.data || [];
    if (!rows.length) {
      $('#results').innerHTML = '<div class="empty">Tidak ada data yang cocok.</div>';
      return;
    }
    $('#results').innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Timestamp</th><th>AWB</th><th>Seller</th></tr></thead>
        <tbody>${rows.map((row) => `<tr><td>${esc(row.timestampText)}</td><td><code>${esc(row.awb)}</code></td><td>${esc(row.sellerName)}</td></tr>`).join('')}</tbody>
      </table></div>`;
  } catch (error) {
    $('#results').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

function resetSearch() {
  if ($('#q')) $('#q').value = '';
  if ($('#searchSeller')) $('#searchSeller').value = '';
  $('#results').innerHTML = '<div class="empty">Masukkan kata kunci lalu tekan Cari.</div>';
}

function openSeller() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-bg" id="sellerModal">
      <div class="modal">
        <div class="modal-header"><div><div class="modal-kicker">Master Seller</div><h3>Tambah Seller</h3></div><button class="icon-btn" onclick="closeModal('sellerModal')">×</button></div>
        <div class="field"><label>Nama seller</label><input id="newSeller" autofocus placeholder="Nama seller"></div>
        <div id="modalMsg"></div>
        <div class="modal-actions"><button class="btn" onclick="closeModal('sellerModal')">Batal</button><button class="btn btn-primary" onclick="addSeller()">Simpan Seller</button></div>
      </div>
    </div>`);
}

async function addSeller() {
  const name = $('#newSeller')?.value.trim() || '';
  if (!name) return $('#modalMsg').innerHTML = '<div class="notice">Nama seller wajib diisi.</div>';
  try {
    const data = await api({ action: 'addSeller', name });
    state.seller = data.data.name;
    closeModal('sellerModal');
    await render();
  } catch (error) {
    $('#modalMsg').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

function cancelPreview() {
  state.pending = [];
}

async function go(page) {
  closeScanner();
  state.page = page;
  location.hash = page;
  await render();
}

async function render() {
  await loadSellers();
  $('#app').innerHTML = state.page === 'input' ? inputPage() : searchPage();
}

Object.assign(window, {
  go, openConfirmation, confirmSubmit, openScanner, closeScanner,
  search, resetSearch, openSeller, addSeller, closeModal,
});

addEventListener('hashchange', () => {
  state.page = location.hash === '#search' ? 'search' : 'input';
  render();
});

render();