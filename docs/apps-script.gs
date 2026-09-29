const CONFIG = {
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_HERE',
  SELLER_SHEET: 'SELLER_MASTER',
  DATA_SHEET: 'RETUR_DATA',
  TIMEZONE: 'Asia/Jakarta',
  SELLER_CACHE_SECONDS: 600,
  RETURN_SELLER_CACHE_SECONDS: 600,
  SEARCH_BATCH_SIZE: 1000,
  SEARCH_MAX_RESULTS: 500,
};

let SPREADSHEET_CACHE = null;

function getSpreadsheet_() {
  if (!SPREADSHEET_CACHE) SPREADSHEET_CACHE = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return SPREADSHEET_CACHE;
}

function getSheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Sheet ' + name + ' tidak ditemukan.');
  return sheet;
}

function setupSheets() {
  const ss = getSpreadsheet_();
  let sellerSheet = ss.getSheetByName(CONFIG.SELLER_SHEET);
  if (!sellerSheet) sellerSheet = ss.insertSheet(CONFIG.SELLER_SHEET);
  if (sellerSheet.getLastRow() === 0) sellerSheet.appendRow(['seller_id', 'seller_name', 'active', 'created_at']);

  let dataSheet = ss.getSheetByName(CONFIG.DATA_SHEET);
  if (!dataSheet) dataSheet = ss.insertSheet(CONFIG.DATA_SHEET);
  if (dataSheet.getLastRow() === 0) dataSheet.appendRow(['timestamp', 'awb', 'seller_name', 'source']);
}

function out_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const action = String(e?.parameter?.action || 'health');
    if (action === 'getSellers') return out_({ ok: true, data: getSellers_() });
    if (action === 'getReturnSellers') return out_({ ok: true, data: getReturnSellers_() });
    if (action === 'searchReturns') {
      return out_({ ok: true, data: searchReturns_({ q: e?.parameter?.q || '', sellerName: e?.parameter?.sellerName || '' }) });
    }
    return out_({ ok: true, service: 'retur-bgg16', version: '2026-09-29-search-v4', time: new Date().toISOString() });
  } catch (error) {
    return out_({ ok: false, message: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'getSellers') return out_({ ok: true, data: getSellers_() });
    if (body.action === 'getReturnSellers') return out_({ ok: true, data: getReturnSellers_() });
    if (body.action === 'addSeller') return out_({ ok: true, data: addSeller_(body.name) });
    if (body.action === 'saveReturns') return out_({ ok: true, data: saveReturns_(body) });
    if (body.action === 'searchReturns') return out_({ ok: true, data: searchReturns_(body) });
    throw new Error('Action tidak dikenali.');
  } catch (error) {
    return out_({ ok: false, message: error.message || String(error) });
  }
}

function normalizeText_(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function norm_(value) {
  return normalizeText_(value).replace(/\s+/g, '').toUpperCase();
}

function getSellers_() {
  const cache = CacheService.getScriptCache();
  const key = 'retur_bgg16_sellers_v2';
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet_(CONFIG.SELLER_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
  const sellers = values
    .filter((row) => String(row[1]).trim() && String(row[2]).toLowerCase() !== 'false')
    .map((row) => ({ id: String(row[0]).trim(), name: String(row[1]).trim() }));

  const payload = JSON.stringify(sellers);
  if (payload.length <= 90000) cache.put(key, payload, CONFIG.SELLER_CACHE_SECONDS);
  return sellers;
}

function addSeller_(name) {
  setupSheets();
  name = String(name || '').trim();
  if (!name) throw new Error('Nama seller wajib diisi.');

  const sellers = getSellers_();
  const existing = sellers.find((seller) => normalizeText_(seller.name) === normalizeText_(name));
  if (existing) return existing;

  const item = { id: Utilities.getUuid(), name };
  getSheet_(CONFIG.SELLER_SHEET).appendRow([item.id, item.name, true, new Date()]);
  CacheService.getScriptCache().remove('retur_bgg16_sellers_v2');
  return item;
}

function existingAwbs_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const set = new Set();
  values.forEach((row) => {
    const value = norm_(row[0]);
    if (value) set.add(value);
  });
  return set;
}

function saveReturns_(body) {
  setupSheets();
  const seller = String(body.sellerName || '').trim();
  if (!seller) throw new Error('Seller wajib diisi.');

  const sellerExists = getSellers_().some((item) => normalizeText_(item.name) === normalizeText_(seller));
  if (!sellerExists) throw new Error('Seller tidak ditemukan di master seller.');

  const awbs = [...new Set((Array.isArray(body.awbs) ? body.awbs : []).map(norm_).filter(Boolean))];
  if (!awbs.length) throw new Error('Minimal satu AWB diperlukan.');

  const sheet = getSheet_(CONFIG.DATA_SHEET);
  const existing = existingAwbs_(sheet);
  const fresh = awbs.filter((awb) => !existing.has(awb));
  if (!fresh.length) throw new Error('Semua AWB sudah pernah dicatat.');

  const now = new Date();
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, fresh.length, 4).setValues(fresh.map((awb) => [now, awb, seller, 'WEB']));
  CacheService.getScriptCache().remove('retur_bgg16_return_sellers_v2');

  return {
    savedCount: fresh.length,
    skippedCount: awbs.length - fresh.length,
    timestampText: Utilities.formatDate(now, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'),
  };
}

function getReturnSellers_() {
  const cache = CacheService.getScriptCache();
  const key = 'retur_bgg16_return_sellers_v3';
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet_(CONFIG.DATA_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();
  const map = new Map();
  values.forEach((row) => {
    const name = String(row[0] || '').trim();
    const keyName = normalizeText_(name);
    if (!keyName) return;
    if (!map.has(keyName)) map.set(keyName, { name, count: 0 });
    map.get(keyName).count += 1;
  });

  const sellers = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const payload = JSON.stringify(sellers);
  if (payload.length <= 90000) cache.put(key, payload, CONFIG.RETURN_SELLER_CACHE_SECONDS);
  return sellers;
}

function getReturnColumns_(sheet) {
  const lastColumn = Math.max(3, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0].map(normalizeText_);
  const find = (names, fallback) => {
    for (let i = 0; i < headers.length; i += 1) {
      if (names.indexOf(headers[i]) !== -1) return i + 1;
    }
    return fallback;
  };
  return {
    timestamp: find(['timestamp', 'tanggal', 'waktu', 'created_at', 'created at'], 1),
    awb: find(['awb', 'nomor resi', 'nomor resi / awb', 'resi', 'tracking number'], 2),
    seller: find(['seller_name', 'seller name', 'nama seller', 'seller'], 3),
  };
}

function searchReturns_(body) {
  const queryRaw = String(body.q || '').trim();
  const sellerRaw = String(body.sellerName || '').trim();
  const query = norm_(queryRaw);
  const sellerQuery = normalizeText_(sellerRaw);

  if (!query && !sellerQuery) return { mode: 'none', sellerName: '', data: [] };

  const sheet = getSheet_(CONFIG.DATA_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { mode: sellerQuery ? 'seller' : 'awb', sellerName: sellerRaw, data: [] };

  const columns = getReturnColumns_(sheet);
  const maxCol = Math.max(columns.timestamp, columns.awb, columns.seller);
  const results = [];
  const batchSize = Math.max(100, CONFIG.SEARCH_BATCH_SIZE);
  let endRow = lastRow;

  while (endRow >= 2 && results.length < CONFIG.SEARCH_MAX_RESULTS) {
    const startRow = Math.max(2, endRow - batchSize + 1);
    const rowCount = endRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, rowCount, maxCol).getDisplayValues();

    for (let i = values.length - 1; i >= 0 && results.length < CONFIG.SEARCH_MAX_RESULTS; i -= 1) {
      const row = values[i];
      const awbRaw = row[columns.awb - 1];
      const sellerRawRow = row[columns.seller - 1];
      const timestampRaw = row[columns.timestamp - 1];
      const awb = norm_(awbRaw);
      const sellerName = String(sellerRawRow || '').trim();
      if (!awb || !sellerName) continue;

      const rowSeller = normalizeText_(sellerName);
      const matches = sellerQuery
        ? rowSeller === sellerQuery
        : awb.indexOf(query) !== -1;
      if (!matches) continue;

      const parsed = timestampRaw ? new Date(timestampRaw) : null;
      const timestamp = parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
      results.push({
        timestamp,
        timestampText: timestamp ? Utilities.formatDate(new Date(timestamp), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss') : String(timestampRaw || ''),
        awb,
        sellerName,
      });
    }
    endRow = startRow - 1;
  }

  results.sort((a, b) => b.timestamp - a.timestamp);
  return {
    mode: sellerQuery ? 'seller' : 'awb',
    sellerName: sellerQuery ? (results.length ? results[0].sellerName : sellerRaw) : '',
    data: results.map((row) => ({
      timestampText: row.timestampText,
      awb: row.awb,
      sellerName: row.sellerName,
    })),
  };
}
