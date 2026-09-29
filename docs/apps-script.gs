const CONFIG = {
  SPREADSHEET_ID: 'PASTE_SPREADSHEET_ID_HERE',
  SELLER_SHEET: 'SELLER_MASTER',
  DATA_SHEET: 'RETUR_DATA',
  TIMEZONE: 'Asia/Jakarta',
  SELLER_CACHE_SECONDS: 60,
};

let SPREADSHEET_CACHE = null;

function getSpreadsheet_() {
  if (!SPREADSHEET_CACHE) SPREADSHEET_CACHE = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return SPREADSHEET_CACHE;
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

function doGet() {
  return out_({ ok: true, service: 'retur-bgg16', time: new Date().toISOString() });
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
  const cached = cache.get('retur_bgg16_sellers');
  if (cached) return JSON.parse(cached);

  setupSheets();
  const sheet = getSpreadsheet_().getSheetByName(CONFIG.SELLER_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const sellers = values
    .filter((row) => String(row[1]).trim() && String(row[2]).toLowerCase() !== 'false')
    .map((row) => ({ id: String(row[0]), name: String(row[1]).trim() }));

  cache.put('retur_bgg16_sellers', JSON.stringify(sellers), CONFIG.SELLER_CACHE_SECONDS);
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
  getSpreadsheet_().getSheetByName(CONFIG.SELLER_SHEET).appendRow([item.id, item.name, true, new Date()]);
  CacheService.getScriptCache().remove('retur_bgg16_sellers');
  return item;
}

function norm_(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function existingAwbs_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return new Set();
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
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

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.DATA_SHEET);
  const existing = existingAwbs_(sheet);
  const fresh = awbs.filter((awb) => !existing.has(awb));
  if (!fresh.length) throw new Error('Semua AWB sudah pernah dicatat.');

  const now = new Date();
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, fresh.length, 4).setValues(fresh.map((awb) => [now, awb, seller, 'WEB']));

  return {
    savedCount: fresh.length,
    skippedCount: awbs.length - fresh.length,
    timestampText: Utilities.formatDate(now, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss'),
  };
}

function searchReturns_(body) {
  setupSheets();
  const query = norm_(body.q || '');
  const sellerFilter = String(body.sellerName || '').trim().toLowerCase();
  if (query.length < 3) return [];

  const sheet = getSpreadsheet_().getSheetByName(CONFIG.DATA_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const results = [];

  for (let index = values.length - 1; index >= 0 && results.length < 200; index -= 1) {
    const row = values[index];
    const timestamp = row[0];
    const awb = norm_(row[1]);
    const sellerName = String(row[2] || '');
    if (!awb || awb.indexOf(query) === -1) continue;
    if (sellerFilter && sellerName.toLowerCase() !== sellerFilter) continue;

    results.push({
      timestampText: timestamp ? Utilities.formatDate(new Date(timestamp), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss') : '',
      awb,
      sellerName,
    });
  }

  return results;
}
