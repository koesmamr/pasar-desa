const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'pasardesa.db');

let rawDb = null;
let driver = '';

try {
  const { DatabaseSync } = require('node:sqlite');
  rawDb = new DatabaseSync(dbPath);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA synchronous = NORMAL;');
  driver = 'node:sqlite';
} catch (e1) {
  try {
    const Database = require('better-sqlite3');
    rawDb = new Database(dbPath);
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('synchronous = NORMAL');
    driver = 'better-sqlite3';
  } catch (e2) {
    console.warn('[Database] Peringatan: Driver SQLite native tidak ditemukan, menggunakan JSON Fallback.');
    driver = 'json-fallback';
  }
}

console.log(`[Database] Terkoneksi menggunakan driver: ${driver} (${dbPath})`);

class DBWrapper {
  constructor(driver, rawDb, dbPath) {
    this.driver = driver;
    this.rawDb = rawDb;
    this.dbPath = dbPath;
  }

  exec(sql) {
    if (this.rawDb) {
      return this.rawDb.exec(sql);
    }
  }

  prepare(sql) {
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

    return {
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0, lastInsertRowid: 0 })
    };
  }
}

const db = new DBWrapper(driver, rawDb, dbPath);

function initDatabase() {
  if (db.rawDb) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        name TEXT,
        phone TEXT DEFAULT '',
        picture TEXT DEFAULT '',
        is_admin INTEGER DEFAULT 0,
        is_blocked INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at DATETIME NOT NULL
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

      CREATE TABLE IF NOT EXISTS bank_accounts (
        id TEXT PRIMARY KEY,
        bank_name TEXT NOT NULL,
        account_number TEXT NOT NULL,
        account_holder TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_code TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT DEFAULT '',
        customer_phone TEXT NOT NULL,
        customer_address TEXT NOT NULL,
        courier TEXT DEFAULT 'Kurir Desa / JNE',
        payment_method TEXT DEFAULT 'cod',
        bank_name TEXT DEFAULT '',
        payment_proof_url TEXT DEFAULT '',
        pic_name TEXT DEFAULT '',
        pic_address TEXT DEFAULT '',
        dp_amount INTEGER DEFAULT 0,
        due_date TEXT DEFAULT '',
        total_amount INTEGER NOT NULL,
        pad_amount INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        items_json TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrasi kolom jika tabel lama belum memiliki kolom baru (Adopsi BintangCOD)
    try { db.exec('ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0;'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN customer_email TEXT DEFAULT "";'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN bank_name TEXT DEFAULT "";'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN payment_proof_url TEXT DEFAULT "";'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN pic_name TEXT DEFAULT "";'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN pic_address TEXT DEFAULT "";'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN dp_amount INTEGER DEFAULT 0;'); } catch (e) {}
    try { db.exec('ALTER TABLE orders ADD COLUMN due_date TEXT DEFAULT "";'); } catch (e) {}
  }

  seedDefaults();
}

function seedDefaults() {
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
    { key: 'google_client_id', value: process.env.GOOGLE_CLIENT_ID || '857800648920-ue7akumho3f7ie9e0ir102goqvceji6d.apps.googleusercontent.com' },
    { key: 'google_client_secret', value: process.env.GOOGLE_CLIENT_SECRET || '' },
    { key: 'admin_email', value: process.env.ADMIN_EMAIL || 'syamsul18782@gmail.com' }
  ];

  for (const s of defaultSettings) {
    const existing = db.prepare('SELECT key, value FROM settings WHERE key = ?').get(s.key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(s.key, s.value);
    } else if (s.key === 'google_client_id' && existing.value.includes('727817597785')) {
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(s.value, s.key);
    }
  }

  // Rekening Bank & QRIS Default (Adopsi BintangCOD)
  const defaultBankAccounts = [
    { id: 'bank_bri', bank_name: 'Bank BRI', account_number: '0123-01-000456-50-8', account_holder: 'BUMDES BERKAH MANDIRI', is_active: 1, sort_order: 1 },
    { id: 'bank_bca', bank_name: 'Bank BCA', account_number: '140-085-2402', account_holder: 'BUMDES BERKAH MANDIRI', is_active: 1, sort_order: 2 },
    { id: 'bank_mandiri', bank_name: 'Bank Mandiri', account_number: '138-00-1988221-1', account_holder: 'BUMDES BERKAH MANDIRI', is_active: 1, sort_order: 3 },
    { id: 'qris_bumdes', bank_name: 'QRIS Nasional (Semua Bank & E-Wallet)', account_number: '00020101021126670014ID.LINKAJA.WWW011893600911002230739902152026072010502280303UMI51440014ID.GO.QRIS.WWW0215ID10200234567890303UMI5204549953033605802ID5919PASAR DESA BUMDES6013KABUPATEN DES61051234562070703A016304ABCD', account_holder: 'BUMDes Pasar Desa Nusantara', is_active: 1, sort_order: 4 }
  ];

  for (const b of defaultBankAccounts) {
    const exist = db.prepare('SELECT id FROM bank_accounts WHERE id = ?').get(b.id);
    if (!exist) {
      db.prepare(`
        INSERT INTO bank_accounts (id, bank_name, account_number, account_holder, is_active, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(b.id, b.bank_name, b.account_number, b.account_holder, b.is_active, b.sort_order);
    }
  }

  // Kategori Default
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

  // Produk Default
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
      description: 'Kain tenun ikat tradisional dengan pewarna alami akar kayu dan daun tanaman lokal. Ditenun rapi oleh kelompok perajin tenun perempuan desa.',
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
      description: 'Biji kopi robusta pilihan dari lereng bukit berketinggian 900 mdpl. Dipetik merah sempurna, disangrai medium-dark secara tradisional.',
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
      description: 'Bakul dan wadah serbaguna dari bambu apus pilihan yang diolah anti-jamur. Kuat dan ramah lingkungan.',
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
      description: 'Gula kelapa murni tanpa campuran obat kimia dan tanpa bahan pengawet. Dimasak perlahan di atas tungku kayu bakar.',
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
      description: 'Beras pulen aromatik pandan alami tanpa pemutih dan tanpa pestisida kimia.',
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
      description: 'VCO diekstraksi dingin (cold-pressed) dari kelapa segar desa tanpa pemanasan. Bening jernih dan higienis.',
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
      description: 'Madu murni hasil panen lestari lebah liar hutan desa.',
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
      description: 'Camilan keripik singkong renyah dengan taburan bumbu rempah tradisional khas desa.',
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

  // Cerita Desa
  const defaultStories = [
    {
      title: 'Helai Demi Helai Warisan Leluhur: Kisah Ibu Aminah Penenun Ikat',
      author_name: 'Ibu Aminah',
      author_role: 'Ketua Kelompok Penenun Desa',
      village: 'Dusun Sukarasa',
      excerpt: 'Mengenal proses pembuatan kain tenun ikat yang membutuhkan waktu 3 pekan penuh dengan pewarna dari alam.',
      content: 'Setiap corak tenun ikat menyimpan filosofi kesabaran dan harmoni manusia dengan alam.',
      image_url: 'https://images.unsplash.com/photo-1606744824163-985d376605aa?w=600&auto=format&fit=crop&q=80',
      read_time: '3 menit baca'
    },
    {
      title: 'Kopi Merah Lereng Gunung: Dari Petani Tradisional Menembus Pasar Kota',
      author_name: 'Pak Slamet',
      author_role: 'Petani Kopi BUMDes',
      village: 'Lereng Bukit Makmur',
      excerpt: 'Komitmen petani menolak pupuk kimia demi menghasilkan biji kopi organik murni berkualitas premium.',
      content: 'Dulu kopi kami hanya dibeli tengkulak dengan harga murah. Sejak adanya Pasar Desa dan BUMDes, kami bisa menjual langsung ke pembeli kota.',
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
}

initDatabase();

module.exports = {
  db,
  initDatabase
};
