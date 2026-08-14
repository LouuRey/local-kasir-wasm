# Kasir Lokal — SQLite WASM

Web kasir mandiri. Semua barang, transaksi, dan rekap tersimpan sebagai SQLite di OPFS browser pengguna—bukan di server dan bukan di database pengguna lain.

## Jalankan lokal

```powershell
cd C:\Users\Lenovo\Downloads\mlcc\kasir\local-kasir-wasm\package
node server.mjs
```

Buka `http://localhost:8000` menggunakan Chrome atau Edge terbaru. Jangan membuka `index.html` langsung dengan `file://`, karena SQLite WASM membutuhkan respons HTTP dengan header keamanan khusus untuk penyimpanan OPFS.

## Deploy

Host seluruh folder ini sebagai static site dan pastikan semua respons memiliki:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

Folder `dist/` berisi SQLite WASM resmi yang dibundel secara lokal. Gunakan menu **Backup** untuk mengunduh atau memulihkan database `.sqlite` pengguna.
