const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pasardesa.db');

let rawDb = null;
let driver = '';

// Prioritas 1: node:sqlite (Built-in di Node.js 22 LTS / Ubuntu 24)
try {
  const { DatabaseSync } = require('node:sqlite');
  rawDb = new DatabaseSync(dbPath);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA synchronous = NORMAL;');
  driver = 'node:sqlite';
} catch (e1) {
  // Prioritas 2: better-sqlite3
  try {
    const Database = require('better-sqlite3');
    rawDb = new Database(dbPath);
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('synchronous = NORMAL');
    driver = 'better-sqlite3';
  } catch (e2) {
    console.warn('[Database] Peringatan: Driver SQLite native tidak ditemukan, menggunakan JSON Database Fallback.');
    driver = 'json-fallback';
  }
}

console.log(`[Database] Terkoneksi menggunakan driver: ${driver} (${dbPath})`);

// Wrapper Kompatibilitas Query
class DBWrapper {
  constructor(driver, rawDb, dbPath) {
    this.driver = driver;
    this.rawDb = rawDb;
    this.dbPath = dbPath;
    this.jsonFile = path.join(dataDir, 'pasardesa_data.json');
    if (driver === 'json-fallback') {
      this.initJsonStore();
    }
  }

  initJsonStore() {
    if (!fs.existsSync(this.jsonFile)) {
      this.store = {
        settings: {},
        categories: [],
        products: [],
        stories: [],
        orders: [],
        admins: []
      };
      this.saveJson();
    } else {
      try {
        this.store = JSON.parse(fs.readFileSync(this.jsonFile, 'utf8'));
      } catch (e) {
        this.store = { settings: {}, categories: [], products: [], stories: [], orders: [], admins: [] };
      }
    }
  }

  saveJson() {
    fs.writeFileSync(this.jsonFile, JSON.stringify(this.store, null, 2), 'utf8');
  }

  exec(sql) {
    if (this.rawDb) {
      return this.rawDb.exec(sql);
    }
  }

  prepare(sql) {
    const self = this;
    if (this.rawDb) {
      const stmt = this.rawDb.prepare(sql);
      return {
        get(...params) {
          try {
            return stmt.get(...params);
          } catch (err) {
            console.error('[DB Error get]', sql, err);
            return null;
          }
        },
        all(...params) {
          try {
            return stmt.all(...params) || [];
          } catch (err) {
            console.error('[DB Error all]', sql, err);
            return [];
          }
        },
        run(...params) {
          try {
            const res = stmt.run(...params);
            return {
              changes: res?.changes || 0,
              lastInsertRowid: res?.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0
            };
          } catch (err) {
            console.error('[DB Error run]', sql, err);
            throw err;
          }
        }
      };
    }

    // Fallback JSON simple mock
    return {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 })
    };
  }
}

const db = new DBWrapper(driver, rawDb, dbPath);

// Inisialisasi Tabel dan Data Awal
function initDatabase() {
  if (db.rawDb) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        icon TEXT,
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        category_id INTEGER,
        price INTEGER NOT NULL,
        original_price INTEGER DEFAULT 0,
        stock INTEGER DEFAULT 10,
        unit TEXT DEFAULT 'pcs',
        image_url TEXT,
        description TEXT,
        village_origin TEXT,
        maker_name TEXT,
        is_featured INTEGER DEFAULT 1,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(category_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author_name TEXT,
        author_role TEXT,
        village TEXT,
        excerpt TEXT,
        content TEXT,
        image_url TEXT,
        read_time TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_address TEXT NOT NULL,
        courier TEXT DEFAULT 'Kurir Desa / JNE',
        payment_method TEXT DEFAULT 'qris',
        total_amount INTEGER NOT NULL,
        pad_amount INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        items_json TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT DEFAULT 'admin'
      );
    `);
  }

  // Seed settings jika kosong
  seedDefaults();
}

function seedDefaults() {
  const bcrypt = require('bcryptjs');

  // 1. Settings
  const defaultSettings = [
    { key: 'desa_name', value: process.env.DESA_NAME || 'Desa Nusantara' },
    { key: 'bumdes_name', value: process.env.BUMDES_NAME || 'BUMDes Berkah Mandiri' },
    { key: 'store_tagline', value: process.env.STORE_TAGLINE || 'Lokal, Asli, Berkualitas - Dari Desa untuk Nusantara' },
    { key: 'whatsapp_number', value: process.env.WHATSAPP_NUMBER || '6281234567890' },
    { key: 'pad_percentage', value: process.env.PAD_PERCENTAGE || '5' },
    { key: 'bank_name', value: process.env.BANK_NAME || 'Bank BRI (Bank Rakyat Indonesia)' },
    { key: 'bank_account', value: process.env.BANK_ACCOUNT || '0123-01-000456-50-8' },
    { key: 'bank_holder', value: process.env.BANK_HOLDER || 'BUMDES BERKAH MANDIRI' },
    { key: 'store_address', value: 'Jl. Raya Desa No. 12, Kantor BUMDes Berkah Mandiri' },
    { key: 'announcement', value: '🎉 Selamat Datang di Pasar Desa Nusantara! Dapatkan promo gratis ongkir khusus produk tani & kerajinan lokal.' }
  ];

  for (const s of defaultSettings) {
    const existing = db.prepare('SELECT key FROM settings WHERE key = ?').get(s.key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(s.key, s.value);
    }
  }

  // 2. Kategori Default
  const defaultCategories = [
    { id: 1, name: 'Kategori Pangan & Beras', slug: 'pangan', icon: '🌾', sort_order: 1 },
    { id: 2, name: 'Makanan & Minuman Olahan', slug: 'makanan-minuman', icon: '☕', sort_order: 2 },
    { id: 3, name: 'Pertanian & Hasil Kebun', slug: 'pertanian', icon: '🥬', sort_order: 3 },
    { id: 4, name: 'Kerajinan Tangan & Tenun', slug: 'kerajinan', icon: '🧵', sort_order: 4 },
    { id: 5, name: 'Herbal & Minyak Alami', slug: 'herbal', icon: '🌿', sort_order: 5 }
  ];

  for (const c of defaultCategories) {
    const exist = db.prepare('SELECT id FROM categories WHERE id = ?').get(c.id);
    if (!exist) {
      db.prepare('INSERT INTO categories (id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)').run(
        c.id, c.name, c.slug, c.icon, c.sort_order
      );
    }
  }

  // 3. Produk Default (Sesuai Mockup Gambar UI)
  const defaultProducts = [
    {
      name: 'Kain Tenun Ikat Asli',
      slug: 'kain-tenun-ikat-asli',
      category_id: 4,
      price: 350000,
      original_price: 400000,
      stock: 12,
      unit: 'lembar',
      image_url: 'https://images.unsplash.com/photo-1606744824163-985d376605aa?w=600&auto=format&fit=crop&q=80',
      description: 'Kain tenun ikat tradisional dengan pewarna alami akar kayu dan daun tanaman lokal. Ditenun rapi dengan ketelitian tinggi oleh kelompok perajin tenun perempuan desa.',
      village_origin: 'Dusun Sukarasa',
      maker_name: 'Kelompok Tenun Ibu Siti',
      is_featured: 1
    },
    {
      name: 'Kopi Bubuk Organik Robusta',
      slug: 'kopi-bubuk-organik-robusta',
      category_id: 2,
      price: 75000,
      original_price: 90000,
      stock: 45,
      unit: 'pack 250gr',
      image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80',
      description: 'Biji kopi robusta pilihan dari lereng bukit berketinggian 900 mdpl. Dipetik merah sempurna, disangrai medium-dark secara tradisional menghasilkan aroma cokelat karamel yang khas.',
      village_origin: 'Lereng Bukit Makmur',
      maker_name: 'Kelompok Tani Kopi Lestari',
      is_featured: 1
    },
    {
      name: 'Kerajinan Anyaman Bambu Halus',
      slug: 'kerajinan-anyaman-bambu-halus',
      category_id: 4,
      price: 120000,
      original_price: 150000,
      stock: 20,
      unit: 'set',
      image_url: 'https://images.unsplash.com/photo-1590402494682-cd3fb53b1f70?w=600&auto=format&fit=crop&q=80',
      description: 'Bakul dan wadah serbaguna dari bambu apus pilihan yang diolah anti-jamur. Kuat, ramah lingkungan, dan mempercantik interior meja makan Anda.',
      village_origin: 'Dusun Bambu Indah',
      maker_name: 'Sanggar Anyam Pak Karyo',
      is_featured: 1
    },
    {
      name: 'Gula Merah Alami Nira Kelapa',
      slug: 'gula-merah-alami-nira-kelapa',
      category_id: 2,
      price: 45000,
      original_price: 55000,
      stock: 60,
      unit: 'kg',
      image_url: 'https://images.unsplash.com/photo-1587393855524-087f83d95bc9?w=600&auto=format&fit=crop&q=80',
      description: 'Gula kelapa murni tanpa campuran obat kimia dan tanpa bahan pengawet. Dimasak perlahan di atas tungku kayu bakar, menghasilkan aroma harum legit alami.',
      village_origin: 'Dusun Kelapa Rindang',
      maker_name: 'Paguyuban Penderes Nira Berkah',
      is_featured: 1
    },
    {
      name: 'Beras Organik Pandan Wangi',
      slug: 'beras-organik-pandan-wangi',
      category_id: 1,
      price: 85000,
      original_price: 95000,
      stock: 80,
      unit: 'karung 5kg',
      image_url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=600&auto=format&fit=crop&q=80',
      description: 'Beras pulen aromatik pandan alami tanpa pemutih dan tanpa pestisida kimia. Diairi dari sumber mata air pegunungan yang jernih dan segar.',
      village_origin: 'Subak Sawah Luhur',
      maker_name: 'Gabungan Kelompok Tani Subur',
      is_featured: 1
    },
    {
      name: 'Minyak Kelapa Murni (Virgin Coconut Oil)',
      slug: 'minyak-kelapa-murni-vco',
      category_id: 5,
      price: 65000,
      original_price: 80000,
      stock: 30,
      unit: 'botol 250ml',
      image_url: 'https://images.unsplash.com/photo-1526947425960-945c6e72858f?w=600&auto=format&fit=crop&q=80',
      description: 'VCO diekstraksi dingin (cold-pressed) dari kelapa segar desa tanpa pemanasan. Bening jernih, kaya asam laurat baik untuk imunitas tubuh dan perawatan kulit.',
      village_origin: 'Dusun Pesisir Sejahtera',
      maker_name: 'BUMDes Sentra Kelapa',
      is_featured: 1
    },
    {
      name: 'Madu Hutan Liar Murni',
      slug: 'madu-hutan-liar-murni',
      category_id: 5,
      price: 110000,
      original_price: 135000,
      stock: 25,
      unit: 'botol 350ml',
      image_url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&auto=format&fit=crop&q=80',
      description: 'Madu murni hasil panen lestari lebah liar hutan desa. Rasa manis sedikit asam segar alami dengan kandungan enzim aktif yang tinggi untuk kesehatan.',
      village_origin: 'Kawasan Hutan Desa Lestari',
      maker_name: 'Komunitas Pemburu Madu Rimba',
      is_featured: 1
    },
    {
      name: 'Keripik Singkong Renyah BUMDes',
      slug: 'keripik-singkong-renyah-bumdes',
      category_id: 2,
      price: 20000,
      original_price: 25000,
      stock: 100,
      unit: 'bungkus 200gr',
      image_url: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=600&auto=format&fit=crop&q=80',
      description: 'Camilan keripik singkong renyah dengan taburan bumbu rempah tradisional khas desa. Tidak berminyak, gurih dan bikin ketagihan.',
      village_origin: 'Sentra UMKM Krajan',
      maker_name: 'KWT (Kelompok Wanita Tani) Mandiri',
      is_featured: 1
    }
  ];

  for (const p of defaultProducts) {
    const exist = db.prepare('SELECT id FROM products WHERE slug = ?').get(p.slug);
    if (!exist) {
      db.prepare(`
        INSERT INTO products (name, slug, category_id, price, original_price, stock, unit, image_url, description, village_origin, maker_name, is_featured, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        p.name, p.slug, p.category_id, p.price, p.original_price, p.stock, p.unit, p.image_url, p.description, p.village_origin, p.maker_name, p.is_featured
      );
    }
  }

  // 4. Cerita Desa (Storytelling)
  const defaultStories = [
    {
      title: 'Helai Demi Helai Warisan Leluhur: Kisah Ibu Aminah Penenun Ikat',
      author_name: 'Ibu Aminah',
      author_role: 'Ketua Kelompok Penenun Desa',
      village: 'Dusun Sukarasa',
      excerpt: 'Mengenal proses pembuatan kain tenun ikat yang membutuhkan waktu 3 pekan penuh dengan pewarna dari alam.',
      content: 'Setiap corak tenun ikat menyimpan filosofi kesabaran dan harmoni manusia dengan alam. Dengan membeli kain tenun ini, Anda langsung mendukung 24 ibu rumah tangga di desa kami untuk tetap mandiri dan melestarikan budaya bangsa.',
      image_url: 'https://images.unsplash.com/photo-1606744824163-985d376605aa?w=600&auto=format&fit=crop&q=80',
      read_time: '3 menit baca'
    },
    {
      title: 'Kopi Merah Lereng Gunung: Dari Petani Tradisional Menembus Pasar Kota',
      author_name: 'Pak Slamet',
      author_role: 'Petani Kopi BUMDes',
      village: 'Lereng Bukit Makmur',
      excerpt: 'Komitmen petani menolak pupuk kimia demi menghasilkan biji kopi organik murni berkualitas premium.',
      content: 'Dulu kopi kami hanya dibeli tengkulak dengan harga murah. Sejak adanya Pasar Desa dan BUMDes, kami bisa menjual langsung ke pembeli kota dan sebagian laba disisihkan untuk kas pembangunan desa.',
      image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=600&auto=format&fit=crop&q=80',
      read_time: '4 menit baca'
    }
  ];

  for (const s of defaultStories) {
    const exist = db.prepare('SELECT id FROM stories WHERE title = ?').get(s.title);
    if (!exist) {
      db.prepare(`
        INSERT INTO stories (title, author_name, author_role, village, excerpt, content, image_url, read_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(s.title, s.author_name, s.author_role, s.village, s.excerpt, s.content, s.image_url, s.read_time);
    }
  }

  // 5. Default Admin User
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';
  const adminExist = db.prepare('SELECT id FROM admins WHERE username = ?').get(adminUser);
  if (!adminExist) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare(`
      INSERT INTO admins (username, password_hash, full_name, role)
      VALUES (?, ?, ?, 'superadmin')
    `).run(adminUser, hash, 'Administrator BUMDes');
    console.log(`[Admin] Akun admin default dibuat: ${adminUser} / ${adminPass}`);
  }
}

// Jalankan inisialisasi saat load
initDatabase();

module.exports = {
  db,
  initDatabase
};
