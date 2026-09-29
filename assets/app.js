const state = {
  page: location.hash === '#search' ? 'search' : 'input',
  sellers: [],
  sellersLoaded: false,
  sellersLoading: false,
  sellersPromise: null,
  pending: [],
  seller: '',
  draftAwb: '',
  searchQuery: '',
  searchSeller: '',
  scanner: null,
  scanTimer: null,
  scanBusy: false,
  searchRequest: 0,
};

const cfg = window.APP_CONFIG || {};
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function api(body) {
  if (!cfg.API_URL) throw new Error('API_URL belum diatur di assets/config.js.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Server merespons HTTP ${response.status}.`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || 'Request gagal.');
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request terlalu lama. Periksa koneksi atau Apps Script.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadSellers(force = false) {
  if (state.sellersLoading && state.sellersPromise) return state.sellersPromise;
  if (state.sellersLoaded && !force) return state.sellers;
  state.sellersLoading = true;
  state.sellersPromise = api({ action: 'getSellers' })
    .then((data) => {
      state.sellers = data.data || [];
      state.sellersLoaded = true;
      state.sellersError = '';
      updateSellerControls();
      return state.sellers;
    })
    .catch((error) => {
      state.sellersError = error.message;
      updateSellerControls();
      throw error;
    })
    .finally(() => {
      state.sellersLoading = false;
      state.sellersPromise = null;
    });
  return state.sellersPromise;
}

function sellerOptions(includeAll = false) {
  const first = includeAll ? '<option value="">Semua seller</option>' : '<option value="">Pilih seller</option>';
  if (state.sellersLoading && !state.sellersLoaded) return `${first}<option disabled>Memuat seller...</option>`;
  if (state.sellersError && !state.sellersLoaded) return `${first}<option disabled>Gagal memuat seller</option>`;
  return first + state.sellers.map((seller) => `<option ${state.seller === seller.name && !includeAll ? 'selected' : ''} value="${esc(seller.name)}">${esc(seller.name)}</option>`).join('');
}

function layout(content) {
  return `<header class="topbar"><div class="brand">${esc(cfg.APP_NAME || 'Retur BGG 16')}<small>Input & pencarian paket retur</small></div><nav class="nav" aria-label="Navigasi utama"><button class="nav-btn ${state.page === 'input' ? 'active' : ''}" data-action="go-input">Input Resi</button><button class="nav-btn ${state.page === 'search' ? 'active' : ''}" data-action="go-search">Cari Resi</button></nav></header><main class="container" id="pageContent">${content}</main>`;
}

function inputPage() {
  return layout(`<div class="page-title"><h1>Input Resi Retur</h1><p>Catat AWB paket retur yang sudah diambil oleh seller.</p></div><section class="card"><div class="grid"><div class="field full"><label for="seller">Seller</label><div class="seller-row"><select id="seller">${sellerOptions()}</select><button class="btn" data-action="open-seller">+ Seller</button></div></div><div class="field full"><label for="awb">Nomor Resi / AWB</label><textarea id="awb" placeholder="Scan barcode/QR atau paste banyak AWB. Satu AWB per baris.">${esc(state.draftAwb)}</textarea><div class="hint">Scanner PC dapat mengirim AWB seperti input keyboard. Untuk kamera HP, gunakan tombol Scan di bawah.</div></div></div><div class="toolbar input-actions"><button class="btn btn-primary" data-action="open-scanner">Scan Barcode / QR</button><button class="btn btn-primary btn-submit" data-action="open-confirmation">Submit</button></div></section><div id="msg"></div>`);
}

function searchPage() {
  return layout(`<div class="page-title"><h1>Pencarian Resi / AWB</h1><p>Cari nomor resi yang sudah tersimpan.</p></div><section class="card"><div class="grid"><div class="field"><label for="q">AWB / kata kunci</label><input id="q" value="${esc(state.searchQuery)}" placeholder="Minimal 3 karakter" autocomplete="off"></div><div class="field"><label for="searchSeller">Seller (opsional)</label><select id="searchSeller">${sellerOptions(true)}</select></div></div><div class="toolbar"><button class="btn btn-primary" data-action="search">Cari</button><button class="btn" data-action="reset-search">Reset</button></div></section><section class="card" id="results"><div class="empty">Masukkan kata kunci lalu tekan Cari.</div></section>`);
}

function parse(value) {
  return [...new Set(String(value || '').split(/[\n,;\t ]+/).map((item) => item.trim()).filter(Boolean).map((item) => item.replace(/\s+/g, '').toUpperCase()))];
}

function showMessage(text, success = false) {
  const element = $('#msg');
  if (element) element.innerHTML = text ? `<div class="notice ${success ? 'success' : ''}">${esc(text)}</div>` : '';
}

function getCurrentInput() {
  const seller = $('#seller')?.value || state.seller || '';
  const awbs = parse($('#awb')?.value ?? state.draftAwb);
  state.seller = seller;
  state.draftAwb = $('#awb')?.value ?? state.draftAwb;
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
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="confirmModal"><div class="modal modal-confirm" role="dialog" aria-modal="true" aria-labelledby="confirmTitle"><div class="modal-header"><div><div class="modal-kicker">Konfirmasi Input</div><h3 id="confirmTitle">Periksa Ringkasan</h3></div><button class="icon-btn" data-action="close-confirm" aria-label="Tutup">×</button></div><div class="summary"><div class="metric"><b>${awbs.length}</b><span>Total AWB unik</span></div><div class="metric"><b>${esc(seller)}</b><span>Seller</span></div><div class="metric"><b>Siap</b><span>Status</span></div></div><div class="confirm-list"><div class="confirm-list-title">Daftar AWB</div><div class="table-wrap"><table class="table"><thead><tr><th>No</th><th>Nomor Resi / AWB</th></tr></thead><tbody>${awbs.map((awb, index) => `<tr><td>${index + 1}</td><td><code>${esc(awb)}</code></td></tr>`).join('')}</tbody></table></div></div><div class="confirm-note">Pastikan seller dan seluruh nomor AWB sudah benar sebelum disimpan.</div><div class="modal-actions"><button class="btn" data-action="close-confirm">Kembali</button><button class="btn btn-primary" id="confirmSubmitBtn" data-action="confirm-submit">Submit / Konfirmasi</button></div></div></div>`);
}

async function confirmSubmit() {
  const button = $('#confirmSubmitBtn');
  if (!state.pending.length || !state.seller || !button) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    const data = await api({ action: 'saveReturns', sellerName: state.seller, awbs: state.pending });
    closeModal('confirmModal');
    state.draftAwb = '';
    state.pending = [];
    const textarea = $('#awb');
    if (textarea) textarea.value = '';
    showMessage(`Berhasil menyimpan ${data.data.savedCount} AWB pada ${data.data.timestampText}.`, true);
  } catch (error) {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = 'Submit / Konfirmasi';
    showMessage(error.message);
  }
}

function openScanner() {
  closeModal('scannerModal');
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="scannerModal"><div class="modal scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scannerTitle"><div class="modal-header"><div><div class="modal-kicker">Scanner</div><h3 id="scannerTitle">Scan Barcode / QR</h3></div><button class="icon-btn" data-action="close-scanner" aria-label="Tutup">×</button></div><div class="scanner-frame"><video id="scannerVideo" autoplay muted playsinline></video><div class="scanner-guide"><span></span></div></div><div id="scannerStatus" class="scanner-status">Meminta akses kamera...</div><div class="modal-actions"><button class="btn" data-action="close-scanner">Tutup Scanner</button></div></div></div>`);
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
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    state.scanner = { stream, detector };
    video.srcObject = stream;
    status.textContent = 'Arahkan kamera ke barcode/QR. Scanner akan menambahkan AWB otomatis.';
    scanFrame();
  } catch (error) {
    status.textContent = error.name === 'NotAllowedError' ? 'Akses kamera ditolak. Izinkan kamera di browser lalu coba lagi.' : 'Kamera tidak dapat digunakan. Periksa izin kamera browser.';
  }
}

async function scanFrame() {
  if (!state.scanner || !$('#scannerVideo')) return;
  if (!state.scanBusy) {
    state.scanBusy = true;
    try {
      const codes = await state.scanner.detector.detect($('#scannerVideo'));
      if (codes.length) {
        const value = codes[0].rawValue?.trim();
        if (value) addScannedAwb(value);
      }
    } catch (_) {
      // Camera frames can fail while autofocus/exposure changes; keep scanning.
    } finally {
      state.scanBusy = false;
    }
  }
  state.scanTimer = setTimeout(scanFrame, 120);
}

function addScannedAwb(value) {
  const awb = value.replace(/\s+/g, '').toUpperCase();
  if (!awb) return;
  const textarea = $('#awb');
  if (!textarea) return;
  const existing = parse(textarea.value);
  if (!existing.includes(awb)) {
    textarea.value = [...existing, awb].join('\n');
    state.draftAwb = textarea.value;
    const status = $('#scannerStatus');
    if (status) status.textContent = `✓ Terbaca: ${awb}. Lanjut scan AWB berikutnya.`;
  } else {
    const status = $('#scannerStatus');
    if (status) status.textContent = `Duplikat: ${awb}. AWB tidak ditambahkan lagi.`;
  }
}

function closeScanner() {
  if (state.scanTimer) clearTimeout(state.scanTimer);
  state.scanTimer = null;
  state.scanBusy = false;
  if (state.scanner?.stream) state.scanner.stream.getTracks().forEach((track) => track.stop());
  state.scanner = null;
  closeModal('scannerModal');
}

function closeModal(id) {
  document.getElementById(id)?.remove();
}

async function search() {
  const button = $('[data-action="search"]');
  const results = $('#results');
  const q = $('#q')?.value.trim() || '';
  const seller = $('#searchSeller')?.value || '';
  state.searchQuery = q;
  state.searchSeller = seller;
  if (q.length < 3) {
    if (results) results.innerHTML = '<div class="notice">Masukkan minimal 3 karakter.</div>';
    return;
  }
  const requestId = ++state.searchRequest;
  button?.classList.add('is-loading');
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner"></span> Mencari...';
  }
  if (results) results.innerHTML = '<div class="loading-state"><span class="spinner spinner-dark"></span> Mencari data...</div>';
  try {
    const data = await api({ action: 'searchReturns', q, sellerName: seller });
    if (requestId !== state.searchRequest) return;
    const rows = data.data || [];
    if (!rows.length) {
      results.innerHTML = '<div class="empty">Tidak ada data yang cocok.</div>';
      return;
    }
    results.innerHTML = `<div class="result-meta">${rows.length} hasil ditemukan</div><div class="table-wrap"><table class="table"><thead><tr><th>Timestamp</th><th>AWB</th><th>Seller</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.timestampText)}</td><td><code>${esc(row.awb)}</code></td><td>${esc(row.sellerName)}</td></tr>`).join('')}</tbody></table></div>`;
  } catch (error) {
    if (requestId === state.searchRequest) results.innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  } finally {
    if (requestId === state.searchRequest && button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.classList.remove('is-loading');
      button.textContent = 'Cari';
    }
  }
}

function resetSearch() {
  state.searchQuery = '';
  state.searchSeller = '';
  if ($('#q')) $('#q').value = '';
  if ($('#searchSeller')) $('#searchSeller').value = '';
  if ($('#results')) $('#results').innerHTML = '<div class="empty">Masukkan kata kunci lalu tekan Cari.</div>';
}

function openSeller() {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-bg" id="sellerModal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="sellerTitle"><div class="modal-header"><div><div class="modal-kicker">Master Seller</div><h3 id="sellerTitle">Tambah Seller</h3></div><button class="icon-btn" data-action="close-seller" aria-label="Tutup">×</button></div><div class="field"><label for="newSeller">Nama seller</label><input id="newSeller" autofocus placeholder="Nama seller"></div><div id="modalMsg"></div><div class="modal-actions"><button class="btn" data-action="close-seller">Batal</button><button class="btn btn-primary" data-action="add-seller">Simpan Seller</button></div></div></div>`);
}

async function addSeller() {
  const button = $('[data-action="add-seller"]');
  const name = $('#newSeller')?.value.trim() || '';
  if (!name) {
    $('#modalMsg').innerHTML = '<div class="notice">Nama seller wajib diisi.</div>';
    return;
  }
  if (button) {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="spinner"></span> Menyimpan...';
  }
  try {
    const data = await api({ action: 'addSeller', name });
    state.seller = data.data.name;
    await loadSellers(true);
    closeModal('sellerModal');
    render();
    showMessage(`Seller "${data.data.name}" siap digunakan.`, true);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Simpan Seller';
    }
    $('#modalMsg').innerHTML = `<div class="notice">${esc(error.message)}</div>`;
  }
}

function captureDraft() {
  if (state.page === 'input') {
    state.seller = $('#seller')?.value || state.seller;
    state.draftAwb = $('#awb')?.value ?? state.draftAwb;
  } else {
    state.searchQuery = $('#q')?.value ?? state.searchQuery;
    state.searchSeller = $('#searchSeller')?.value ?? state.searchSeller;
  }
}

function go(page) {
  captureDraft();
  closeScanner();
  state.page = page;
  if (location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
  render();
  if (!state.sellersLoaded && !state.sellersLoading) loadSellers().catch(() => {});
}

function updateSellerControls() {
  const inputSelect = $('#seller');
  if (inputSelect) {
    const selected = state.seller;
    inputSelect.innerHTML = sellerOptions();
    if (selected) inputSelect.value = selected;
  }
  const searchSelect = $('#searchSeller');
  if (searchSelect) {
    const selected = state.searchSeller;
    searchSelect.innerHTML = sellerOptions(true);
    if (selected) searchSelect.value = selected;
  }
}

function render() {
  $('#app').innerHTML = state.page === 'input' ? inputPage() : searchPage();
  requestAnimationFrame(() => $('#pageContent')?.classList.add('page-ready'));
}

function handleClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'go-input') go('input');
  else if (action === 'go-search') go('search');
  else if (action === 'open-seller') openSeller();
  else if (action === 'open-confirmation') openConfirmation();
  else if (action === 'confirm-submit') confirmSubmit();
  else if (action === 'close-confirm') closeModal('confirmModal');
  else if (action === 'open-scanner') openScanner();
  else if (action === 'close-scanner') closeScanner();
  else if (action === 'search') search();
  else if (action === 'reset-search') resetSearch();
  else if (action === 'close-seller') closeModal('sellerModal');
  else if (action === 'add-seller') addSeller();
}

document.addEventListener('click', handleClick);
document.addEventListener('input', (event) => {
  if (event.target.id === 'awb') state.draftAwb = event.target.value;
  if (event.target.id === 'q') state.searchQuery = event.target.value;
});
document.addEventListener('change', (event) => {
  if (event.target.id === 'seller') state.seller = event.target.value;
  if (event.target.id === 'searchSeller') state.searchSeller = event.target.value;
});
window.addEventListener('popstate', () => {
  captureDraft();
  state.page = location.hash === '#search' ? 'search' : 'input';
  render();
});
window.addEventListener('hashchange', () => {
  captureDraft();
  state.page = location.hash === '#search' ? 'search' : 'input';
  render();
});

render();
loadSellers().catch(() => {});
