const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db } = require('../db');

// Dummy simple in-memory session token store (atau hash token)
const activeTokens = new Map();

// Helper generate token
function generateToken(username) {
  const token = 'psd_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  activeTokens.set(token, { username, createdAt: Date.now() });
  return token;
}

// Middleware Proteksi Admin
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Autentikasi diperlukan. Silakan login.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!activeTokens.has(token)) {
    return res.status(401).json({ success: false, message: 'Sesi login telah berakhir atau tidak valid.' });
  }

  req.adminUser = activeTokens.get(token);
  next();
}

// 1. Admin Login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username dan password wajib diisi' });
    }

    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const match = bcrypt.compareSync(password, admin.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Username atau password salah' });
    }

    const token = generateToken(admin.username);

    res.json({
      success: true,
      message: 'Login berhasil',
      data: {
        token,
        username: admin.username,
        full_name: admin.full_name,
        role: admin.role
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Admin Logout
router.post('/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization.replace('Bearer ', '').trim();
  activeTokens.delete(token);
  res.json({ success: true, message: 'Logout berhasil' });
});

// 3. Ringkasan Statistik Dashboard (PAD, Omzet, Order, Produk)
router.get('/stats', requireAuth, (req, res) => {
  try {
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get()?.count || 0;
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get()?.count || 0;
    const pendingOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = "pending"').get()?.count || 0;
    
    // Hitung total omzet & total alokasi kas PAD
    const finance = db.prepare(`
      SELECT 
        COALESCE(SUM(total_amount), 0) as total_omzet,
        COALESCE(SUM(pad_amount), 0) as total_pad
      FROM orders
    `).get();

    const recentOrders = db.prepare(`
      SELECT * FROM orders ORDER BY id DESC LIMIT 5
    `).all();

    res.json({
      success: true,
      data: {
        total_products: totalProducts,
        total_orders: totalOrders,
        pending_orders: pendingOrders,
        total_omzet: finance?.total_omzet || 0,
        total_pad: finance?.total_pad || 0,
        recent_orders: recentOrders
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Daftar Semua Produk (Untuk Admin)
router.get('/products', requireAuth, (req, res) => {
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

// 5. Tambah Produk Baru
router.post('/products', requireAuth, (req, res) => {
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
      is_featured
    } = req.body;

    if (!name || !price) {
      return res.status(400).json({ success: false, message: 'Nama dan harga produk wajib diisi' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);

    const stmt = db.prepare(`
      INSERT INTO products (
        name, slug, category_id, price, original_price, stock, unit,
        image_url, description, village_origin, maker_name, is_featured, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    stmt.run(
      name,
      slug,
      category_id || 1,
      parseInt(price) || 0,
      parseInt(original_price) || 0,
      parseInt(stock) || 10,
      unit || 'pcs',
      image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&auto=format&fit=crop&q=80',
      description || '',
      village_origin || 'Desa Nusantara',
      maker_name || 'Kelompok UMKM Desa',
      is_featured ? 1 : 0
    );

    res.json({ success: true, message: 'Produk berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Update Produk
router.put('/products/:id', requireAuth, (req, res) => {
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

// 7. Hapus Produk
router.delete('/products/:id', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Produk berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Daftar Pesanan untuk Admin
router.get('/orders', requireAuth, (req, res) => {
  try {
    const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
    orders.forEach(o => {
      try {
        o.items = JSON.parse(o.items_json);
      } catch (e) {
        o.items = [];
      }
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Update Status Pesanan (Pending, Diproses, Dikirim, Selesai, Dibatalkan)
router.put('/orders/:id/status', requireAuth, (req, res) => {
  try {
    const { status } = req.body;
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
    res.json({ success: true, message: `Status pesanan diubah menjadi: ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Pengaturan Toko & Desa (Whitelabel Config)
router.get('/settings', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/settings', requireAuth, (req, res) => {
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

module.exports = router;
