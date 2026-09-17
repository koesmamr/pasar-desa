require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
const adminRoutes = require('./src/routes/admin');
const { initDatabase } = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// Admin Web Page Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Single Page fallback ke index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inisialisasi Database & Start Server
try {
  initDatabase();
} catch (e) {
  console.error('[Database] Inisialisasi awal error:', e);
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('====================================================');
  console.log(`🌾 PASAR DESA NUSANTARA - SERVER AKTIF`);
  console.log(`🚀 Berjalan di http://localhost:${PORT}`);
  console.log(`🏛️ Panel Admin BUMDes di http://localhost:${PORT}/admin`);
  console.log('====================================================');
});
