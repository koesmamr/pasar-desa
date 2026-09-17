const express = require('express');
const router = express.Router();
const { db } = require('../db');

// Ambil Pengaturan Publik Toko & Desa
router.get('/config', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const config = {};
    rows.forEach(r => { config[r.key] = r.value; });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ambil Kategori Produk
router.get('/categories', (req, res) => {
  try {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC').all();
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

// Cerita Desa & Profil Pengrajin/Petani
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

    // Hitung total belanja
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

    // Ambil persentase PAD dari settings
    const padRow = db.prepare('SELECT value FROM settings WHERE key = "pad_percentage"').get();
    const padPercent = parseFloat(padRow?.value || '5');
    const pad_amount = Math.round((total_amount * padPercent) / 100);

    // Generate kode pesanan acak: PSD-2026-XXXX
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const order_code = `PSD-${Date.now().toString().slice(-4)}${randomSuffix}`;

    const stmt = db.prepare(`
      INSERT INTO orders (
        order_code, customer_name, customer_phone, customer_address,
        courier, payment_method, total_amount, pad_amount, status, items_json, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `);

    stmt.run(
      order_code,
      customer_name,
      customer_phone,
      customer_address,
      courier || 'Kurir BUMDes / JNE',
      payment_method || 'qris',
      total_amount,
      pad_amount,
      JSON.stringify(validatedItems),
      notes || ''
    );

    // Ambil nomor WA BUMDes
    const waRow = db.prepare('SELECT value FROM settings WHERE key = "whatsapp_number"').get();
    const bumdesRow = db.prepare('SELECT value FROM settings WHERE key = "bumdes_name"').get();
    const desaRow = db.prepare('SELECT value FROM settings WHERE key = "desa_name"').get();

    const targetWa = (waRow?.value || '6281234567890').replace(/\D/g, '');
    const bumdesName = bumdesRow?.value || 'BUMDes Pasar Desa';
    const desaName = desaRow?.value || 'Desa Nusantara';

    // Buat template teks WhatsApp
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
    waText += `\nMohon konfirmasi ketersediaan dan proses pesanan saya. Terima kasih!`;

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

// Cek Status Pesanan
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
