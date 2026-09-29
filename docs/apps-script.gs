const CONFIG = {
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_HERE',
  SELLER_SHEET: 'SELLER_MASTER',
  DATA_SHEET: 'RETUR_DATA',
  TIMEZONE: 'Asia/Jakarta',
  SELLER_CACHE_SECONDS: 600,
  SEARCH_CACHE_SECONDS: 120,
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
    return out_({ ok: true, service: 'retur-bgg16', time: new Date().toISOString() });
  } catch (error) {
    return out_({ ok: false, message: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'getSellers') return out_({ ok: true, data: getSellers_() });
    if (body.action === 'addSeller') return out_({ ok: true, data: addSeller_(body.name) });
    if (body.action === 'saveReturns') return out_({ ok: true, data: saveReturns_(body) });
    if (body.action === 'searchReturns') return out_({ ok: true, data: searchReturns_(body) });
    throw new Error('Action tidak dikenali.');
  } catch (error) {
    return out_({ ok: false, message: error.message || String(error) });
  }
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

  cache.put(key, JSON.stringify(sellers), CONFIG.SELLER_CACHE_SECONDS);
  return sellers;
}

function addSeller_(name) {
  setupSheets();
  name = String(name || '').trim();
  if (!name) throw new Error('Nama seller wajib diisi.');

  const sellers = getSellers_();
  const existing = sellers.find((seller) => seller.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;

  const item = { id: Utilities.getUuid(), name };
  getSheet_(CONFIG.SELLER_SHEET).appendRow([item.id, item.name, true, new Date()]);
  CacheService.getScriptCache().remove('retur_bgg16_sellers_v2');
  return item;
}

function norm_(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function existingAwbs_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const set = new Set();
  values.forEach((row) => set.add(norm_(row[0])));
  return set;
}

function saveReturns_(body) {
  setupSheets();
  const seller = String(body.sellerName || '').trim();
  if (!seller) throw new Error('Seller wajib diisi.');

  const sellerExists = getSellers_().some((item) => item.name.toLowerCase() === seller.toLowerCase());
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
  CacheService.getScriptCache().remove('retur_bgg16_search_v1');

  return {
    savedCount: fresh.length,
    skippedCount: awbs.length - fresh.length,
    timestampText: Utilities.formatDate(now, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'),
  };
}

function loadReturnRows_() {
  const cache = CacheService.getScriptCache();
  const key = 'retur_bgg16_search_v1';
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet_(CONFIG.DATA_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const rows = values.map((row) => ({
    timestamp: row[0] ? new Date(row[0]).getTime() : 0,
    awb: norm_(row[1]),
    sellerName: String(row[2] || '').trim(),
  })).filter((row) => row.awb && row.sellerName);

  const payload = JSON.stringify(rows);
  // CacheService has a per-entry size limit. Only cache compact indexes that fit safely.
  if (payload.length <= 90000) cache.put(key, payload, CONFIG.SEARCH_CACHE_SECONDS);
  return rows;
}

function searchReturns_(body) {
  const queryRaw = String(body.q || '').trim();
  const query = norm_(queryRaw);
  if (query.length < 3) return { mode: 'awb', sellerName: '', data: [] };

  const sellers = getSellers_();
  const exactSeller = sellers.find((item) => norm_(item.name) === query);
  const partialSellers = exactSeller ? [exactSeller] : sellers.filter((item) => norm_(item.name).indexOf(query) !== -1);

  const rows = loadReturnRows_();
  let mode = 'awb';
  let matchedSeller = '';
  let filtered = [];

  if (exactSeller || partialSellers.length) {
    mode = 'seller';
    const sellerNames = new Set(partialSellers.map((item) => item.name.toLowerCase()));
    filtered = rows.filter((row) => sellerNames.has(row.sellerName.toLowerCase()));
    matchedSeller = partialSellers.length === 1 ? partialSellers[0].name : partialSellers.length + ' seller';
  } else {
    filtered = rows.filter((row) => row.awb.indexOf(query) !== -1);
  }

  filtered.sort((a, b) => b.timestamp - a.timestamp);
  filtered = filtered.slice(0, 500);

  return {
    mode,
    sellerName: matchedSeller,
    data: filtered.map((row) => ({
      timestampText: row.timestamp ? Utilities.formatDate(new Date(row.timestamp), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss') : '',
      awb: row.awb,
      sellerName: row.sellerName,
    })),
  };
}
