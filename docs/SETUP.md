# Setup Retur BGG 16

## Google Spreadsheet
Buat spreadsheet dengan Apps Script. Script otomatis membuat:
- `SELLER_MASTER`: seller_id, seller_name, active, created_at
- `RETUR_DATA`: timestamp, awb, seller_name, source

## Apps Script
1. Paste isi terbaru `docs/apps-script.gs` ke Apps Script.
2. Isi `CONFIG.SPREADSHEET_ID` dengan ID spreadsheet Anda.
3. Jalankan `setupSheets()` sekali.
4. Deploy sebagai Web App.
5. Execute as: akun Anda.
6. Access: sesuai kebutuhan operasional.
7. Setelah perubahan backend, **buat deployment/version baru**. Netlify tidak otomatis mengubah deployment Apps Script.
8. Endpoint baru yang wajib tersedia: `getSellers`, `getReturnSellers`, `searchReturns`, `saveReturns`, `addSeller`.

### Optimasi pencarian seller
- Daftar seller retur dibaca langsung dari kolom `C` (`seller_name`) pada `RETUR_DATA`, bukan membaca seluruh 4 kolom dan membangun seluruh objek retur.
- Hasil daftar seller di-cache selama 10 menit.
- Pencarian retur membaca data secara batch dari baris terbaru dan berhenti setelah maksimal 500 hasil.
- Frontend menyimpan cache seller retur di `localStorage` dan melakukan refresh backend di background.

## Netlify
Isi `assets/config.js` dengan URL Web App Apps Script.

Tidak ada secret Google pada frontend. Spreadsheet ID hanya berada di Apps Script backend.

## Operasional
- Input: pilih seller -> scan/paste AWB -> cek ringkasan -> submit.
- AWB duplikat yang sudah tersimpan tidak ditulis ulang.
- Timestamp dibuat server-side saat submit.
- Search mengembalikan maksimal 500 hasil terbaru.
