import sqlite3InitModule from './dist/index.mjs';

let sqlite3;
let db;
const filename = '/kasir-lokal.sqlite';

function execute(sql, bind = []) {
  const resultRows = [];
  db.exec({ sql, bind, rowMode: 'object', resultRows });
  return resultRows;
}

function initializeSchema() {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS barang (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE,
      nama TEXT NOT NULL,
      satuan TEXT NOT NULL DEFAULT 'Pcs',
      harga INTEGER NOT NULL CHECK(harga >= 0),
      stok REAL NOT NULL DEFAULT 0 CHECK(stok >= 0)
    );
    CREATE TABLE IF NOT EXISTS transaksi (
      id TEXT PRIMARY KEY,
      waktu TEXT NOT NULL,
      total_bayar INTEGER NOT NULL,
      metode_bayar TEXT NOT NULL,
      dibayar INTEGER NOT NULL,
      kembalian INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS detail_transaksi (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_transaksi TEXT NOT NULL REFERENCES transaksi(id) ON DELETE CASCADE,
      id_barang INTEGER NOT NULL,
      nama_barang TEXT NOT NULL,
      harga_satuan INTEGER NOT NULL,
      qty REAL NOT NULL,
      subtotal INTEGER NOT NULL
    );
  `);
}

async function openDb() {
  if (!sqlite3.oo1.OpfsDb) throw new Error('OPFS tidak tersedia. Buka melalui Chrome atau Edge terbaru dan pastikan server mengaktifkan header COOP/COEP.');
  db = new sqlite3.oo1.OpfsDb(filename, 'c');
  initializeSchema();
}

function makeTransactionId() {
  const now = new Date();
  const stamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0'), String(now.getMilliseconds()).padStart(3, '0')].join('');
  return stamp;
}

const handlers = {
  async init() {
    sqlite3 = await sqlite3InitModule();
    await openDb();
    return { filename, sqliteVersion: sqlite3.version.libVersion };
  },
  products({ search = '' } = {}) {
    return execute('SELECT * FROM barang WHERE nama LIKE ? OR barcode LIKE ? ORDER BY nama COLLATE NOCASE LIMIT 100', [`%${search}%`, `%${search}%`]);
  },
  saveProduct(product) {
    const value = [product.barcode || null, product.nama.trim(), product.satuan.trim() || 'Pcs', Math.round(Number(product.harga)), Number(product.stok)];
    if (!value[1]) throw new Error('Nama barang wajib diisi.');
    if (value[3] < 0 || value[4] < 0) throw new Error('Harga dan stok tidak boleh negatif.');
    if (product.id) execute('UPDATE barang SET barcode=?, nama=?, satuan=?, harga=?, stok=? WHERE id=?', [...value, Number(product.id)]);
    else execute('INSERT INTO barang (barcode,nama,satuan,harga,stok) VALUES (?,?,?,?,?)', value);
    return true;
  },
  deleteProduct({ id }) {
    execute('DELETE FROM barang WHERE id=?', [Number(id)]);
    return true;
  },
  checkout({ cart, metode, dibayar }) {
    if (!cart?.length) throw new Error('Keranjang masih kosong.');
    const items = cart.map((item) => ({ ...item, qty: Number(item.qty) })).filter((item) => item.qty > 0);
    const total = items.reduce((sum, item) => sum + Math.round(item.harga * item.qty), 0);
    const paid = Math.round(Number(dibayar));
    if (!Number.isFinite(paid) || paid < total) throw new Error('Nominal dibayar belum cukup.');
    for (const item of items) {
      const found = execute('SELECT stok FROM barang WHERE id=?', [item.id])[0];
      if (!found || Number(found.stok) < item.qty) throw new Error(`Stok ${item.nama} tidak cukup.`);
    }
    const id = makeTransactionId();
    const time = new Date().toISOString().slice(0, 19).replace('T', ' ');
    db.exec('BEGIN IMMEDIATE');
    try {
      execute('INSERT INTO transaksi (id,waktu,total_bayar,metode_bayar,dibayar,kembalian) VALUES (?,?,?,?,?,?)', [id, time, total, metode, paid, paid - total]);
      for (const item of items) {
        const subtotal = Math.round(item.harga * item.qty);
        execute('INSERT INTO detail_transaksi (id_transaksi,id_barang,nama_barang,harga_satuan,qty,subtotal) VALUES (?,?,?,?,?,?)', [id, item.id, item.nama, item.harga, item.qty, subtotal]);
        execute('UPDATE barang SET stok=stok-? WHERE id=?', [item.qty, item.id]);
      }
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return { id, total, kembalian: paid - total };
  },
  history() {
    return execute(`SELECT t.id, t.waktu, t.metode_bayar, t.total_bayar, t.dibayar, t.kembalian, GROUP_CONCAT(d.nama_barang || ' ×' || d.qty, ', ') AS items FROM transaksi t LEFT JOIN detail_transaksi d ON d.id_transaksi=t.id GROUP BY t.id ORDER BY t.waktu DESC LIMIT 100`);
  },
  report({ from, to }) {
    const dates = [from + ' 00:00:00', to + ' 23:59:59'];
    return {
      metrics: execute('SELECT COALESCE(SUM(total_bayar),0) total, COUNT(*) transaksi, COALESCE(AVG(total_bayar),0) rata_rata FROM transaksi WHERE waktu BETWEEN ? AND ?', dates)[0],
      top: execute(`SELECT nama_barang, SUM(qty) qty, SUM(subtotal) pendapatan FROM detail_transaksi d JOIN transaksi t ON t.id=d.id_transaksi WHERE t.waktu BETWEEN ? AND ? GROUP BY nama_barang ORDER BY qty DESC LIMIT 8`, dates),
      payments: execute('SELECT metode_bayar, SUM(total_bayar) total, COUNT(*) jumlah FROM transaksi WHERE waktu BETWEEN ? AND ? GROUP BY metode_bayar ORDER BY total DESC', dates)
    };
  },
  export() { return sqlite3.capi.sqlite3_js_db_export(db); },
  async import({ bytes }) {
    db.close();
    db = undefined;
    await sqlite3.oo1.OpfsDb.importDb(filename, new Uint8Array(bytes));
    await openDb();
    return true;
  },
  async reset() {
    db.close();
    db = undefined;
    const root = await sqlite3.opfs.getRootDir();
    await root.removeEntry(filename.slice(1)).catch(() => {});
    await openDb();
    return true;
  }
};

self.onmessage = async ({ data }) => {
  try {
    const result = await handlers[data.type](data.payload);
    self.postMessage({ id: data.id, result }, result instanceof Uint8Array ? [result.buffer] : []);
  } catch (error) { self.postMessage({ id: data.id, error: error.message || String(error) }); }
};
