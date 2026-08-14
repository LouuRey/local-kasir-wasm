const state = { cart: [], products: [] };
const $ = (selector) => document.querySelector(selector);
let requestId = 0;
const worker = new Worker('./sqlite-worker.js', { type: 'module' });
const pending = new Map();
worker.onmessage = ({ data }) => { const job = pending.get(data.id); if (!job) return; pending.delete(data.id); data.error ? job.reject(new Error(data.error)) : job.resolve(data.result); };
function api(type, payload) { return new Promise((resolve, reject) => { const id = ++requestId; pending.set(id, { resolve, reject }); worker.postMessage({ id, type, payload }); }); }
function rupiah(value) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }
function toast(message, bad = false) { const box = $('#toast'); box.textContent = message; box.className = `show ${bad ? 'bad' : ''}`; setTimeout(() => box.className = '', 3600); }
function today(offset = 0) { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); }

async function loadProducts(search = '') { state.products = await api('products', { search }); renderProducts(); renderSearchResults(); }
function renderProducts() {
  const target = $('#products-table');
  target.innerHTML = state.products.length ? `<table><thead><tr><th>Barcode</th><th>Nama</th><th>Satuan</th><th>Harga</th><th>Stok</th><th></th></tr></thead><tbody>${state.products.map(p => `<tr><td>${escapeHtml(p.barcode || '—')}</td><td>${escapeHtml(p.nama)}</td><td>${escapeHtml(p.satuan)}</td><td>${rupiah(p.harga)}</td><td>${Number(p.stok)}</td><td class="actions"><button data-edit="${p.id}" class="secondary">Ubah</button><button data-delete="${p.id}" class="danger small">Hapus</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada barang.</p>';
  target.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => openProduct(state.products.find(p => p.id === Number(button.dataset.edit))));
  target.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { const product = state.products.find(p => p.id === Number(button.dataset.delete)); if (confirm(`Hapus ${product.nama}?`)) { await api('deleteProduct', { id: product.id }); await loadProducts($('#product-filter').value); toast('Barang dihapus.'); } });
}
function renderSearchResults() {
  const target = $('#product-results');
  target.innerHTML = state.products.length ? state.products.map(p => `<button class="product-result" data-add="${p.id}" ${Number(p.stok) <= 0 ? 'disabled' : ''}><span>${escapeHtml(p.nama)} <small>${escapeHtml(p.barcode || '')}</small></span><strong>${rupiah(p.harga)}</strong><small>Stok ${Number(p.stok)}</small></button>`).join('') : '<p class="muted">Barang tidak ditemukan.</p>';
  target.querySelectorAll('[data-add]').forEach(button => button.onclick = () => addToCart(state.products.find(p => p.id === Number(button.dataset.add))));
}
function addToCart(product) { const found = state.cart.find(item => item.id === product.id); if (found) { if (found.qty < product.stok) found.qty++; else return toast('Stok tidak mencukupi.', true); } else state.cart.push({ ...product, qty: 1 }); renderCart(); }
function renderCart() {
  const target = $('#cart-items');
  target.className = 'cart-items';
  if (!state.cart.length) { target.className += ' empty'; target.textContent = 'Belum ada barang di keranjang.'; }
  else target.innerHTML = state.cart.map(item => `<div class="cart-item"><div><strong>${escapeHtml(item.nama)}</strong><small>${rupiah(item.harga)} / ${escapeHtml(item.satuan)}</small></div><div class="quantity"><button data-minus="${item.id}">−</button><span>${item.qty}</span><button data-plus="${item.id}">+</button><button data-remove="${item.id}" class="remove">×</button></div><strong>${rupiah(item.harga * item.qty)}</strong></div>`).join('');
  const total = state.cart.reduce((sum, item) => sum + item.harga * item.qty, 0); $('#cart-total').textContent = rupiah(total); updateChange();
  target.querySelectorAll('[data-minus]').forEach(b => b.onclick = () => changeQty(Number(b.dataset.minus), -1)); target.querySelectorAll('[data-plus]').forEach(b => b.onclick = () => changeQty(Number(b.dataset.plus), 1)); target.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => { state.cart = state.cart.filter(item => item.id !== Number(b.dataset.remove)); renderCart(); });
}
function changeQty(id, direction) { const item = state.cart.find(x => x.id === id); if (direction > 0 && item.qty >= item.stok) return toast('Stok tidak mencukupi.', true); item.qty += direction; if (item.qty <= 0) state.cart = state.cart.filter(x => x.id !== id); renderCart(); }
function updateChange() { const total = state.cart.reduce((sum, item) => sum + item.harga * item.qty, 0); const paid = Number($('#amount-paid').value || 0); $('#change-preview').textContent = paid >= total ? `Kembalian: ${rupiah(paid - total)}` : `Kurang: ${rupiah(total - paid)}`; }
function openProduct(product = {}) { $('#product-dialog-title').textContent = product.id ? 'Ubah barang' : 'Tambah barang'; $('#product-id').value = product.id || ''; $('#product-barcode').value = product.barcode || ''; $('#product-name').value = product.nama || ''; $('#product-unit').value = product.satuan || 'Pcs'; $('#product-price').value = product.harga ?? ''; $('#product-stock').value = product.stok ?? ''; $('#product-dialog').showModal(); }
async function loadHistory() { const rows = await api('history'); $('#history-table').innerHTML = rows.length ? `<table><thead><tr><th>Waktu</th><th>ID</th><th>Barang</th><th>Metode</th><th>Total</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.waktu)}</td><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.items || '')}</td><td>${escapeHtml(r.metode_bayar)}</td><td>${rupiah(r.total_bayar)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada transaksi.</p>'; }
async function loadReport() { const data = await api('report', { from: $('#report-from').value, to: $('#report-to').value }); $('#report-metrics').innerHTML = [['Pendapatan', rupiah(data.metrics.total)], ['Transaksi', data.metrics.transaksi], ['Rata-rata', rupiah(data.metrics.rata_rata)]].map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join(''); $('#top-products').innerHTML = list(data.top, r => `${escapeHtml(r.nama_barang)} <strong>${Number(r.qty)} item · ${rupiah(r.pendapatan)}</strong>`); $('#payment-report').innerHTML = list(data.payments, r => `${escapeHtml(r.metode_bayar)} <strong>${r.jumlah} transaksi · ${rupiah(r.total)}</strong>`); }
function list(items, render) { return items.length ? `<ul class="rank-list">${items.map(item => `<li>${render(item)}</li>`).join('')}</ul>` : '<p class="muted">Belum ada data pada periode ini.</p>'; }
function showView(view) { document.querySelectorAll('.view').forEach(node => node.classList.toggle('active', node.id === `view-${view}`)); document.querySelectorAll('.nav-button').forEach(node => node.classList.toggle('active', node.dataset.view === view)); if (view === 'history') loadHistory(); if (view === 'reports') loadReport(); if (view === 'products') loadProducts($('#product-filter').value); }

document.querySelectorAll('.nav-button').forEach(button => button.onclick = () => showView(button.dataset.view));
$('#product-search').oninput = (event) => loadProducts(event.target.value);
$('#product-filter').oninput = (event) => loadProducts(event.target.value);
$('#new-product').onclick = () => openProduct();
$('#product-form').onsubmit = async (event) => { event.preventDefault(); try { await api('saveProduct', { id: $('#product-id').value, barcode: $('#product-barcode').value, nama: $('#product-name').value, satuan: $('#product-unit').value, harga: $('#product-price').value, stok: $('#product-stock').value }); $('#product-dialog').close(); await loadProducts(); toast('Barang berhasil disimpan.'); } catch (error) { toast(error.message, true); } };
$('#clear-cart').onclick = () => { state.cart = []; renderCart(); };
$('#amount-paid').oninput = updateChange;
$('#checkout').onclick = async () => { try { const result = await api('checkout', { cart: state.cart, metode: $('#payment-method').value, dibayar: $('#amount-paid').value }); state.cart = []; $('#amount-paid').value = ''; renderCart(); await loadProducts($('#product-search').value); toast(`Transaksi ${result.id} tersimpan. Kembalian ${rupiah(result.kembalian)}.`); } catch (error) { toast(error.message, true); } };
$('#report-from').value = today(-30); $('#report-to').value = today(); $('#refresh-report').onclick = loadReport;
$('#export-db').onclick = async () => { const bytes = await api('export'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/x-sqlite3' })); link.download = `kasir-lokal-${today()}.sqlite`; link.click(); URL.revokeObjectURL(link.href); };
$('#import-db').onchange = async (event) => { const file = event.target.files[0]; if (!file) return; $('#import-name').textContent = file.name; if (!confirm('Semua data lokal akan diganti dengan isi file ini. Lanjutkan?')) return; try { await api('import', { bytes: await file.arrayBuffer() }); state.cart = []; renderCart(); await loadProducts(); toast('Database berhasil dipulihkan.'); } catch (error) { toast(`Impor gagal: ${error.message}`, true); } };
$('#reset-db').onclick = async () => { if (!confirm('Hapus SELURUH data lokal di browser ini?')) return; await api('reset'); state.cart = []; renderCart(); await loadProducts(); toast('Database lokal dikosongkan.'); };

(async () => { try { const info = await api('init'); $('#database-state').textContent = `Tersimpan lokal · SQLite ${info.sqliteVersion}`; $('#database-state').className = 'state ready'; $('#app').hidden = false; await loadProducts(); renderCart(); } catch (error) { $('#database-state').textContent = 'Database tidak dapat dibuka'; $('#database-state').className = 'state error'; document.body.insertAdjacentHTML('beforeend', `<div class="fatal"><h2>Database lokal belum tersedia</h2><p>${escapeHtml(error.message)}</p><p>Jalankan melalui <code>python server.py</code>, lalu buka alamat yang ditampilkan. Aplikasi tidak dapat dibuka langsung dari file HTML.</p></div>`); } })();
