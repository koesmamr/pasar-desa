const express = require('express');
const router = express.Router();
const { db } = require('../db');

function isSuperAdminEmail(email) {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const configuredAdmin = (process.env.ADMIN_EMAIL || 'syamsul18782@gmail.com').toLowerCase().trim();
  return clean === configuredAdmin || clean === 'syamsul18782@gmail.com';
}

// Middleware Proteksi Admin Murni Menggunakan Sesi Google SSO
function requireAdmin(req, res, next) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/session_id=([^;]+)/);
  if (!match) {
    return res.status(401).json({
      success: false,
      message: 'Sesi login tidak ditemukan. Silakan masuk menggunakan Google SSO.'
    });
  }

  const sessionId = match[1];
  const session = db.prepare(`
    SELECT email FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId);

  if (!session) {
    return res.status(401).json({
      success: false,
      message: 'Sesi Google Anda telah berakhir. Silakan login kembali.'
    });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(session.email);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Akun tidak terdaftar.' });
  }

  if (user.is_blocked === 1 && !isSuperAdminEmail(user.email)) {
    return res.status(403).json({ success: false, message: 'Akun Anda dinonaktifkan.' });
  }

  if (user.is_admin === 1 || isSuperAdminEmail(user.email)) {
    req.adminUser = user;
    return next();
  }

  return res.status(403).json({
    success: false,
    message: `Akses Ditolak: Akun Google (${user.email}) bukan Administrator BUMDes.`
  });
}

// ==============================================================================
// 1. DASHBOARD STATS
// ==============================================================================
router.get('/stats', requireAdmin, (req, res) => {
  try {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get()?.count || 0;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get()?.count || 0;
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
    const totalCategories = db.prepare('SELECT COUNT(*) as count FROM categories').get()?.count || 0;
    const pendingOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = "pending"').get()?.count || 0;

    const finance = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_omzet,
        COALESCE(SUM(pad_amount), 0) as total_pad
      FROM orders
    `).get();

    const recentOrders = db.prepare(`
      SELECT * FROM orders ORDER BY id DESC LIMIT 6
    `).all();

    res.json({
      success: true,
      data: {
        total_products: totalProducts,
        total_orders: totalOrders,
        total_users: totalUsers,
        total_categories: totalCategories,
        pending_orders: pendingOrders,
        total_omzet: finance?.total_omzet || 0,
        total_pad: finance?.total_pad || 0,
        recent_orders: recentOrders,
        admin_user: {
          name: req.adminUser.name,
          email: req.adminUser.email,
          picture: req.adminUser.picture
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 2. MANAJEMEN PENGGUNA (USER MANAGEMENT)
// ==============================================================================
router.get('/users', requireAdmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT u.*,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_email = u.email) as total_orders,
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders o WHERE o.customer_email = u.email) as total_spent
      FROM users u
      ORDER BY u.created_at DESC
    `).all();

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ubah Hak Akses Admin Pengguna
router.put('/users/:email/role', requireAdmin, (req, res) => {
  try {
    const { is_admin } = req.body;
    const targetEmail = decodeURIComponent(req.params.email);

    if (isSuperAdminEmail(targetEmail) && is_admin === 0) {
      return res.status(400).json({ success: false, message: 'Super Admin utama tidak dapat dicabut hak aksesnya.' });
    }

    db.prepare('UPDATE users SET is_admin = ? WHERE email = ?').run(is_admin ? 1 : 0, targetEmail);
    res.json({ success: true, message: 'Hak akses pengguna berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Blokir / Buka Blokir Pengguna
router.put('/users/:email/block', requireAdmin, (req, res) => {
  try {
    const { is_blocked } = req.body;
    const targetEmail = decodeURIComponent(req.params.email);

    if (isSuperAdminEmail(targetEmail)) {
      return res.status(400).json({ success: false, message: 'Super Admin tidak dapat diblokir.' });
    }

    db.prepare('UPDATE users SET is_blocked = ? WHERE email = ?').run(is_blocked ? 1 : 0, targetEmail);
    res.json({ success: true, message: is_blocked ? 'Pengguna berhasil diblokir' : 'Blokir pengguna telah dibuka' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Hapus Pengguna
router.delete('/users/:email', requireAdmin, (req, res) => {
  try {
    const targetEmail = decodeURIComponent(req.params.email);
    if (isSuperAdminEmail(targetEmail)) {
      return res.status(400).json({ success: false, message: 'Super Admin tidak dapat dihapus.' });
    }
    db.prepare('DELETE FROM users WHERE email = ?').run(targetEmail);
    db.prepare('DELETE FROM sessions WHERE email = ?').run(targetEmail);
    res.json({ success: true, message: 'Pengguna berhasil dihapus dari sistem' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 3. MANAJEMEN KATEGORI PRODUK
// ==============================================================================
router.get('/categories', requireAdmin, (req, res) => {
  try {
    const categories = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
      FROM categories c
      ORDER BY c.sort_order ASC, c.id ASC
    `).all();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/categories', requireAdmin, (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Nama kategori wajib diisi' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);
    db.prepare(`
      INSERT INTO categories (name, slug, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `).run(name, slug, icon || '📦', parseInt(sort_order) || 0);

    res.json({ success: true, message: 'Kategori berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/categories/:id', requireAdmin, (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    db.prepare(`
      UPDATE categories SET name = ?, icon = ?, sort_order = ? WHERE id = ?
    `).run(name, icon || '📦', parseInt(sort_order) || 0, req.params.id);
    res.json({ success: true, message: 'Kategori berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Kategori berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 4. MANAJEMEN PRODUK (UPLOAD & EDIT)
// ==============================================================================
router.get('/products', requireAdmin, (req, res) => {
  try {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ORDER BY p.id DESC
    `).all();
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/products', requireAdmin, (req, res) => {
  try {
    const {
      name,
      category_id,
      price,
      original_price,
      stock,
      unit,
      image_url,
      description,
      village_origin,
      maker_name,
      is_featured,
      is_active
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Nama dan harga produk wajib diisi' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

    const stmt = db.prepare(`
      INSERT INTO products (
        name, slug, category_id, price, original_price, stock, unit,
        image_url, description, village_origin, maker_name, is_featured, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      name,
      slug,
      category_id || 1,
      parseInt(price) || 0,
      parseInt(original_price) || 0,
      parseInt(stock) || 10,
      unit || 'pcs',
      image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600',
      description || '',
      village_origin || 'Desa Nusantara',
      maker_name || 'Kelompok UMKM Desa',
      is_featured ? 1 : 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1
    );

    res.json({ success: true, message: 'Produk berhasil ditambahkan ke toko' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/products/:id', requireAdmin, (req, res) => {
  try {
    const {
      name,
      category_id,
      price,
      original_price,
      stock,
      unit,
      image_url,
      description,
      village_origin,
      maker_name,
      is_featured,
      is_active
    } = req.body;

    const stmt = db.prepare(`
      UPDATE products SET
        name = ?,
        category_id = ?,
        price = ?,
        original_price = ?,
        stock = ?,
        unit = ?,
        image_url = ?,
        description = ?,
        village_origin = ?,
        maker_name = ?,
        is_featured = ?,
        is_active = ?
      WHERE id = ?
    `);

    stmt.run(
      name,
      category_id,
      parseInt(price) || 0,
      parseInt(original_price) || 0,
      parseInt(stock) || 0,
      unit || 'pcs',
      image_url,
      description,
      village_origin,
      maker_name,
      is_featured ? 1 : 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      req.params.id
    );

    res.json({ success: true, message: 'Produk berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/products/:id/toggle', requireAdmin, (req, res) => {
  try {
    const prod = db.prepare('SELECT is_active FROM products WHERE id = ?').get(req.params.id);
    if (!prod) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });

    const newStatus = prod.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE products SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
    res.json({ success: true, message: newStatus ? 'Produk diaktifkan' : 'Produk dinonaktifkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/products/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 5. MANAJEMEN PESANAN (ORDERS MANAGEMENT)
// ==============================================================================
router.get('/orders', requireAdmin, (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    orders.forEach(o => {
      try { o.items = JSON.parse(o.items_json); } catch (e) { o.items = []; }
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/orders/:id/status', requireAdmin, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `Status pesanan diubah menjadi: ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/orders/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Data pesanan berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/orders/:id/verify-payment', requireAdmin, (req, res) => {
  try {
    db.prepare('UPDATE orders SET status = "diproses" WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Pembayaran berhasil diverifikasi! Status pesanan diubah ke DIPROSES.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 6. PENGATURAN TOKO & DESA (WHITELABEL CONFIG)
// ==============================================================================
router.get('/settings', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    config.google_client_id = process.env.GOOGLE_CLIENT_ID || config.google_client_id || '857800648920-ue7akumho3f7ie9e0ir102goqvceji6d.apps.googleusercontent.com';
    config.admin_email = process.env.ADMIN_EMAIL || config.admin_email || 'syamsul18782@gmail.com';
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/settings', requireAdmin, (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      const exist = db.prepare('SELECT key FROM settings WHERE key = ?').get(key);
      if (exist) {
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(value), key);
      } else {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
      }
    }
    res.json({ success: true, message: 'Pengaturan desa & BUMDes berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 7. MANAJEMEN REKENING BANK & QRIS BUMDES (Adopsi BintangCOD)
// ==============================================================================
router.get('/payment/banks', requireAdmin, (req, res) => {
  try {
    const banks = db.prepare('SELECT * FROM bank_accounts ORDER BY sort_order ASC, id ASC').all();
    res.json({ success: true, banks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/payment/banks', requireAdmin, (req, res) => {
  try {
    const { bank_name, account_number, account_holder, sort_order, is_active } = req.body;
    if (!bank_name || !account_number || !account_holder) {
      return res.status(400).json({ success: false, message: 'Semua kolom rekening bank wajib diisi' });
    }

    const id = 'bank_' + Date.now().toString().slice(-6);
    db.prepare(`
      INSERT INTO bank_accounts (id, bank_name, account_number, account_holder, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      bank_name.trim(),
      account_number.trim(),
      account_holder.trim(),
      parseInt(sort_order) || 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1
    );

    res.json({ success: true, message: 'Rekening bank berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/payment/banks/:id', requireAdmin, (req, res) => {
  try {
    const { bank_name, account_number, account_holder, sort_order, is_active } = req.body;
    db.prepare(`
      UPDATE bank_accounts SET
        bank_name = ?,
        account_number = ?,
        account_holder = ?,
        sort_order = ?,
        is_active = ?
      WHERE id = ?
    `).run(
      bank_name.trim(),
      account_number.trim(),
      account_holder.trim(),
      parseInt(sort_order) || 0,
      is_active !== undefined ? (is_active ? 1 : 0) : 1,
      req.params.id
    );

    res.json({ success: true, message: 'Data rekening bank berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/payment/banks/:id/toggle', requireAdmin, (req, res) => {
  try {
    const bank = db.prepare('SELECT is_active FROM bank_accounts WHERE id = ?').get(req.params.id);
    if (!bank) return res.status(404).json({ success: false, message: 'Rekening bank tidak ditemukan' });

    const newStatus = bank.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE bank_accounts SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
    res.json({ success: true, message: newStatus ? 'Rekening bank diaktifkan' : 'Rekening bank dinonaktifkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/payment/banks/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM bank_accounts WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Rekening bank berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
