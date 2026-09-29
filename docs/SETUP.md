# Setup Retur BGG 16

## Google Spreadsheet
Buat spreadsheet dengan Apps Script. Script otomatis membuat:
- `SELLER_MASTER`: seller_id, seller_name, active, created_at
- `RETUR_DATA`: timestamp, awb, seller_name, source

## Apps Script
1. Paste `apps-script.gs`.
2. Isi `CONFIG.SPREADSHEET_ID`.
3. Jalankan `setupSheets()` sekali.
4. Deploy sebagai Web App.
5. Execute as: akun Anda.
6. Access: sesuai kebutuhan operasional.

## Netlify
Isi `assets/config.js` dengan URL Web App Apps Script.

Tidak ada secret Google pada frontend. Spreadsheet ID hanya berada di Apps Script backend.

## Operasional
- Input: pilih seller -> scan/paste AWB -> cek ringkasan -> submit.
- AWB duplikat yang sudah tersimpan tidak ditulis ulang.
- Timestamp dibuat server-side saat submit.
- Search mengembalikan maksimal 200 hasil terbaru.
