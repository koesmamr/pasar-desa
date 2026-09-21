const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db } = require('../db');

// Helper Cek Hak Akses Superadmin / Admin BUMDes
function isSuperAdmin(userOrEmail) {
  if (!userOrEmail) return false;
  if (typeof userOrEmail === 'object') {
    if (userOrEmail.is_admin === 1 || userOrEmail.is_admin === '1' || userOrEmail.is_admin === true) {
      return true;
    }
  }
  const email = (typeof userOrEmail === 'string' ? userOrEmail : (userOrEmail.email || '')).toLowerCase().trim();
  const configuredAdmin = (process.env.ADMIN_EMAIL || 'syamsul18782@gmail.com').toLowerCase().trim();
  return email === configuredAdmin || email === 'syamsul18782@gmail.com';
}

// Helper Ambil Pengguna dari Session Cookie
function getCurrentUser(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(/session_id=([^;]+)/);
  if (!match) return null;

  const sessionId = match[1];
  const session = db.prepare(`
    SELECT email FROM sessions WHERE id = ? AND expires_at > datetime('now')
  `).get(sessionId);

  if (!session) return null;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(session.email);
  if (user) {
    user.is_superadmin = isSuperAdmin(user);
  }
  return user;
}

// ==============================================================================
// 1. GOOGLE SSO AUTHENTICATION (Murni Google SSO Tanpa Password)
// ==============================================================================

// POST /api/auth - Verifikasi Google ID Token
router.post('/auth', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google Credential Token wajib disertakan' });
    }

    // Verifikasi langsung ke Google OAuth2 API
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!googleRes.ok) {
      return res.status(401).json({ success: false, message: 'Token Google tidak valid atau telah kedaluwarsa' });
    }

    const payload = await googleRes.json();
    const email = (payload.email || '').toLowerCase().trim();
    const name = payload.name || 'Pengguna Desa';
    const picture = payload.picture || '';

    // Cek apakah akun terdaftar sebagai admin
    const isAdmin = isSuperAdmin(email) ? 1 : 0;

    // Cek apakah pengguna sudah pernah terdaftar
    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      db.prepare(`
        INSERT INTO users (email, name, picture, is_admin, is_blocked)
        VALUES (?, ?, ?, ?, 0)
      `).run(email, name, picture, isAdmin);
      console.log(`[Google SSO] Pengguna baru terdaftar: ${email} (Admin: ${isAdmin})`);
    } else {
      // Cek pemblokiran (hanya jika bukan superadmin)
      if (user.is_blocked === 1 && !isSuperAdmin(email)) {
        return res.status(403).json({
          success: false,
          message: 'Akun Google Anda dinonaktifkan oleh Administrator BUMDes.'
        });
      }

      const updatedAdmin = isAdmin || user.is_admin ? 1 : 0;
      db.prepare(`
        UPDATE users SET name = ?, picture = ?, is_admin = ? WHERE email = ?
      `).run(name, picture, updatedAdmin, email);
    }

    // Buat Session Baru (Masa aktif 7 Hari)
    const newSessionId = crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random().toString(36).substring(2));
    db.prepare(`
      INSERT INTO sessions (id, email, expires_at)
      VALUES (?, ?, datetime('now', '+7 days'))
    `).run(newSessionId, email);

    // Kirim Cookie HTTP-Only
    res.setHeader('Set-Cookie', `session_id=${newSessionId}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax`);

    return res.json({
      success: true,
      message: 'Login Google berhasil',
      user: {
        email,
        name,
        picture,
        is_admin: isAdmin === 1 || (user && user.is_admin === 1)
      }
    });

  } catch (err) {
    console.error('[Google SSO Error]', err);
    return res.status(500).json({ success: false, message: 'Gagal autentikasi Google: ' + err.message });
  }
});

// GET /api/auth/me - Cek Sesi Pengguna
router.get('/auth/me', (req, res) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.json({ success: true, loggedIn: false, user: null });
    }
    return res.json({
      success: true,
      loggedIn: true,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
        phone: user.phone,
        is_admin: user.is_admin === 1 || user.is_superadmin,
        is_blocked: user.is_blocked === 1
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/logout - Keluar Sesi
router.post('/logout', (req, res) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/session_id=([^;]+)/);
    if (match) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(match[1]);
    }
    res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return res.json({ success: true, message: 'Berhasil keluar' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==============================================================================
// 2. KATALOG & TRANSAKSI PUBLIK
// ==============================================================================

// Ambil Konfigurasi Publik Toko
router.get('/config', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    config.google_client_id = process.env.GOOGLE_CLIENT_ID || config.google_client_id || '857800648920-ue7akumho3f7ie9e0ir102goqvceji6d.apps.googleusercontent.com';
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Kategori Produk
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Daftar Produk
router.get('/products', (req, res) => {
  try {
    const { category, search, featured } = req.query;
    let sql = `
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
    `;
    const params = [];

    if (category && category !== 'semua') {
      sql += ' AND c.slug = ?';
      params.push(category);
    }

    if (search && search.trim() !== '') {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.maker_name LIKE ? OR p.village_origin LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (featured === '1') {
      sql += ' AND p.is_featured = 1';
    }

    sql += ' ORDER BY p.is_featured DESC, p.id DESC';

    const products = db.prepare(sql).all(...params);
    res.json({ success: true, data: products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Detail Produk
router.get('/products/:slug', (req, res) => {
  try {
    const product = db.prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.slug = ? AND p.is_active = 1
    `).get(req.params.slug);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
    }
    res.json({ success: true, data: product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cerita Desa
router.get('/stories', (req, res) => {
  try {
    const stories = db.prepare('SELECT * FROM stories ORDER BY id ASC').all();
    res.json({ success: true, data: stories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Buat Pesanan Baru (Checkout)
router.post('/orders', (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_address,
      courier,
      payment_method,
      items,
      notes
    } = req.body;

    if (!customer_name || !customer_phone || !customer_address || !items || !items.length) {
      return res.status(400).json({ success: false, message: 'Data pesanan belum lengkap!' });
    }

    const currentUser = getCurrentUser(req);
    const customer_email = currentUser ? currentUser.email : '';

    let total_amount = 0;
    const validatedItems = [];

    for (const item of items) {
      const product = db.prepare('SELECT id, name, price, stock FROM products WHERE id = ?').get(item.id);
      if (product) {
        const qty = Math.max(1, parseInt(item.qty) || 1);
        const subtotal = product.price * qty;
        total_amount += subtotal;
        validatedItems.push({
          id: product.id,
          name: product.name,
          price: product.price,
          qty,
          subtotal
        });
      }
    }

    if (validatedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Item pesanan tidak valid' });
    }

    const padRow = db.prepare('SELECT value FROM settings WHERE key = "pad_percentage"').get();
    const padPercent = parseFloat(padRow?.value || '5');
    const pad_amount = Math.round((total_amount * padPercent) / 100);

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const order_code = `PSD-${Date.now().toString().slice(-4)}${randomSuffix}`;

    const stmt = db.prepare(`
      INSERT INTO orders (
        order_code, customer_name, customer_email, customer_phone, customer_address,
        courier, payment_method, total_amount, pad_amount, status, items_json, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      order_code,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      courier || 'Kurir BUMDes / JNE',
      payment_method || 'qris',
      total_amount,
      pad_amount,
      JSON.stringify(validatedItems),
      notes || ''
    );

    const waRow = db.prepare('SELECT value FROM settings WHERE key = "whatsapp_number"').get();
    const bumdesRow = db.prepare('SELECT value FROM settings WHERE key = "bumdes_name"').get();
    const desaRow = db.prepare('SELECT value FROM settings WHERE key = "desa_name"').get();

    const targetWa = (waRow?.value || '6281234567890').replace(/\D/g, '');
    const bumdesName = bumdesRow?.value || 'BUMDes Pasar Desa';
    const desaName = desaRow?.value || 'Desa Nusantara';

    let waText = `Halo Admin *${bumdesName}* (${desaName}),\nSaya ingin memesan produk Pasar Desa:\n\n`;
    waText += `📋 *Invoice:* #${order_code}\n`;
    waText += `👤 *Nama:* ${customer_name}\n`;
    waText += `📱 *No HP:* ${customer_phone}\n`;
    waText += `📍 *Alamat:* ${customer_address}\n`;
    waText += `🚚 *Pengiriman:* ${courier || 'Kurir BUMDes'}\n`;
    waText += `💳 *Metode Bayar:* ${payment_method === 'wa' ? 'Konfirmasi via WA' : payment_method.toUpperCase()}\n\n`;
    waText += `🛍️ *Rincian Pesanan:*\n`;

    validatedItems.forEach((it, idx) => {
      waText += `${idx + 1}. ${it.name} (${it.qty}x) - Rp ${(it.subtotal).toLocaleString('id-ID')}\n`;
    });

    waText += `\n💰 *Total Pembayaran:* Rp ${total_amount.toLocaleString('id-ID')}\n`;
    waText += `🌱 *Kontribusi Kas PAD Desa (${padPercent}%):* Rp ${pad_amount.toLocaleString('id-ID')}\n`;
    if (notes) waText += `📝 *Catatan:* ${notes}\n`;
    waText += `\nMohon konfirmasi pesanan saya. Terima kasih!`;

    const waLink = `https://wa.me/${targetWa}?text=${encodeURIComponent(waText)}`;

    res.json({
      success: true,
      message: 'Pesanan berhasil dibuat',
      data: {
        order_code,
        customer_name,
        total_amount,
        pad_amount,
        items: validatedItems,
        whatsapp_link: waLink
      }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cek Pesanan Saya (Pengguna yang sedang Login)
router.get('/my-orders', (req, res) => {
  try {
    const user = getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu' });
    }
    const orders = db.prepare('SELECT * FROM orders WHERE customer_email = ? ORDER BY id DESC').all(user.email);
    orders.forEach(o => {
      try { o.items = JSON.parse(o.items_json); } catch (e) { o.items = []; }
    });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cek Detail Pesanan by Code
router.get('/orders/:code', (req, res) => {
  try {
    const order = db.prepare('SELECT * FROM orders WHERE order_code = ?').get(req.params.code);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan' });
    }
    order.items = JSON.parse(order.items_json || '[]');
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
