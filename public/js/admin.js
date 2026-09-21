// ==============================================================================
// ADMIN DASHBOARD JAVASCRIPT - PASAR DESA NUSANTARA
// Pure Google SSO, User Management, Category CRUD, Product Upload & Order Invoices
// ==============================================================================

let currentUserProfile = null;
let currentTab = 'dashboard';
let categoriesCache = [];
let allProductsCache = [];
let allOrdersCache = [];
let allUsersCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkActiveSession();
});

// 1. CEK SESI AKTIF GOOGLE SSO
async function checkActiveSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.success && data.loggedIn && data.user) {
      if (data.user.is_admin) {
        currentUserProfile = data.user;
        showAdminPanel();
        return;
      } else {
        showLoginScreen();
        alert(`Akun Google (${data.user.email}) bukan Administrator BUMDes Pasar Desa.`);
        return;
      }
    }
  } catch (e) {
    console.warn('Gagal memeriksa sesi Google SSO:', e);
  }
  showLoginScreen();
}

// 2. CALLBACK RESMI GOOGLE SSO (Adopsi Pola Warung Pulsa)
async function handleGoogleLoginResponse(response) {
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (data.success) {
      if (data.user && data.user.is_admin) {
        currentUserProfile = data.user;
        showAdminPanel();
      } else {
        alert(`Akun Google (${data.user.email}) berhasil diverifikasi, namun akun ini bukan Administrator BUMDes Pasar Desa.`);
      }
    } else {
      alert('Gagal Login dengan Google: ' + (data.message || 'Token tidak valid'));
    }
  } catch (err) {
    alert('Terjadi kesalahan koneksi login Google SSO: ' + err.message);
  }
}

// 3. LOGOUT ADMIN
function adminLogout() {
  fetch('/api/logout', { method: 'POST' }).finally(() => {
    currentUserProfile = null;
    showLoginScreen();
  });
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const adminPanel = document.getElementById('adminPanel');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (adminPanel) adminPanel.style.display = 'none';
}

function showAdminPanel() {
  const loginScreen = document.getElementById('loginScreen');
  const adminPanel = document.getElementById('adminPanel');
  if (loginScreen) loginScreen.style.display = 'none';
  if (adminPanel) adminPanel.style.display = 'flex';

  // Tampilkan Nama & Avatar Google di Topbar
  const profileContainer = document.getElementById('adminProfileHeader');
  if (profileContainer && currentUserProfile) {
    profileContainer.innerHTML = `
      ${currentUserProfile.picture ? `<img src="${currentUserProfile.picture}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover; border: 2px solid var(--terracotta);">` : '<span>👤</span>'}
      <span>${currentUserProfile.name || 'Admin BUMDes'}</span>
    `;
  }

  loadCategoriesDropdown();
  loadStats();
}

// 4. EVENT LISTENERS
function setupEventListeners() {
  // Form Produk
  const productForm = document.getElementById('productForm');
  if (productForm) {
    productForm.addEventListener('submit', handleProductSubmit);
  }

  // Form Kategori
  const categoryForm = document.getElementById('categoryForm');
  if (categoryForm) {
    categoryForm.addEventListener('submit', handleCategorySubmit);
  }

  // Form Pengaturan
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
  }

  // Form Rekening Bank (Adopsi BintangCOD)
  const bankForm = document.getElementById('bankForm');
  if (bankForm) {
    bankForm.addEventListener('submit', handleBankSubmit);
  }

  // File Upload Foto Produk (Base64 Langsung)
  const prodFileInput = document.getElementById('prodFileInput');
  if (prodFileInput) {
    prodFileInput.addEventListener('change', handleProductFileSelect);
  }

  // URL Foto Produk Input Preview
  const prodImageUrl = document.getElementById('prodImageUrl');
  if (prodImageUrl) {
    prodImageUrl.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) {
        updateImagePreview(url);
      }
    });
  }

  // Filter Pencarian Produk
  const filterSearch = document.getElementById('filterProductSearch');
  if (filterSearch) {
    filterSearch.addEventListener('input', renderFilteredProducts);
  }

  // Filter Kategori Produk
  const filterCat = document.getElementById('filterProductCategory');
  if (filterCat) {
    filterCat.addEventListener('change', renderFilteredProducts);
  }
}

// Preview & Konversi File Foto Produk ke Base64
function handleProductFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 15 * 1024 * 1024) {
    alert('Ukuran foto terlalu besar! Maksimal 15MB.');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(evt) {
    const base64Data = evt.target.result;
    document.getElementById('prodImageUrl').value = base64Data;
    updateImagePreview(base64Data);
  };
  reader.readAsDataURL(file);
}

function updateImagePreview(src) {
  const preview = document.getElementById('prodImagePreview');
  const placeholder = document.getElementById('prodImagePreviewPlaceholder');
  if (preview && placeholder) {
    preview.src = src;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
  }
}

function resetImagePreview() {
  const preview = document.getElementById('prodImagePreview');
  const placeholder = document.getElementById('prodImagePreviewPlaceholder');
  if (preview && placeholder) {
    preview.src = '';
    preview.style.display = 'none';
    placeholder.style.display = 'block';
  }
}

// 5. PERGANTIAN TAB (TAB SWITCHING)
function switchAdminTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  document.getElementById('tabDashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('tabProducts').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tabCategories').style.display = tab === 'categories' ? 'block' : 'none';
  document.getElementById('tabOrders').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tabUsers').style.display = tab === 'users' ? 'block' : 'none';
  const tabBanks = document.getElementById('tabBanks');
  if (tabBanks) tabBanks.style.display = tab === 'banks' ? 'block' : 'none';
  document.getElementById('tabSettings').style.display = tab === 'settings' ? 'block' : 'none';

  const titles = {
    dashboard: 'Dashboard & Ringkasan PAD',
    products: 'Kelola Katalog Produk Desa',
    categories: 'Manajemen Kategori Produk',
    orders: 'Daftar Pesanan Pelanggan',
    users: 'Manajemen Pengguna (Google SSO)',
    banks: 'Rekening Bank & QRIS Resmi BUMDes',
    settings: 'Pengaturan Profil Desa, BUMDes & Google SSO'
  };

  const descs = {
    dashboard: 'Pantau kinerja penjualan toko dan pendapatan asli desa (PAD) secara realtime',
    products: 'Tambah produk baru, unggah foto perajin lokal, dan atur stok',
    categories: 'Atur kelompok etalase produk desa dan icon emoji',
    orders: 'Kelola status pesanan masuk dan cetak struk invoice transaksi',
    users: 'Kelola akun pengguna, hak akses admin, dan status pemblokiran',
    banks: 'Atur nomor rekening tujuan transfer dan payload QRIS untuk checkout pelanggan',
    settings: 'Ubah identitas desa, persentase PAD, nomor rekening, dan konfigurasi Google SSO'
  };

  document.getElementById('adminPageTitle').textContent = titles[tab] || 'Panel Pengelola';
  document.getElementById('adminPageDesc').textContent = descs[tab] || '';

  if (tab === 'dashboard') loadStats();
  if (tab === 'products') loadProductsTable();
  if (tab === 'categories') loadCategoriesTable();
  if (tab === 'orders') loadOrdersTable();
  if (tab === 'users') loadUsersTable();
  if (tab === 'banks') loadBanksTable();
  if (tab === 'settings') loadSettings();
}

// ==============================================================================
// TAB 1: DASHBOARD STATS & RECENT ORDERS
// ==============================================================================
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const s = data.data;
    document.getElementById('statPad').textContent = `Rp ${Number(s.total_pad || 0).toLocaleString('id-ID')}`;
    document.getElementById('statOmzet').textContent = `Rp ${Number(s.total_omzet || 0).toLocaleString('id-ID')}`;
    document.getElementById('statOrders').textContent = s.total_orders || 0;
    document.getElementById('statUsers').textContent = s.total_users || 0;

    const tbody = document.getElementById('recentOrdersBody');
    if (s.recent_orders && s.recent_orders.length > 0) {
      tbody.innerHTML = s.recent_orders.map(o => `
        <tr>
          <td><strong>#${o.order_code}</strong></td>
          <td>${escapeHtml(o.customer_name)}</td>
          <td>
            <a href="https://wa.me/${(o.customer_phone || '').replace(/\D/g, '')}" target="_blank" style="color: #2E7D32; font-weight: 600;">
              📱 ${escapeHtml(o.customer_phone)}
            </a>
          </td>
          <td><strong>Rp ${Number(o.total_amount).toLocaleString('id-ID')}</strong></td>
          <td style="color: #2E7D32; font-weight: 700;">Rp ${Number(o.pad_amount).toLocaleString('id-ID')}</td>
          <td><span class="status-badge status-${o.status}">${(o.status || 'pending').toUpperCase()}</span></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888; padding: 20px;">Belum ada pesanan masuk.</td></tr>';
    }
  } catch (err) {
    console.error('Error stats:', err);
  }
}

// ==============================================================================
// TAB 2: MANAJEMEN PRODUK (UPLOAD, EDIT, FOTO, TOGGLE AKTIF)
// ==============================================================================
async function loadCategoriesDropdown() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.success) {
      categoriesCache = data.data;
      const selectModal = document.getElementById('prodCategory');
      const selectFilter = document.getElementById('filterProductCategory');

      if (selectModal) {
        selectModal.innerHTML = categoriesCache.map(c => `<option value="${c.id}">${c.icon || '📦'} ${escapeHtml(c.name)}</option>`).join('');
      }
      if (selectFilter) {
        selectFilter.innerHTML = '<option value="">Semua Kategori</option>' + categoriesCache.map(c => `<option value="${c.id}">${c.icon || '📦'} ${escapeHtml(c.name)}</option>`).join('');
      }
    }
  } catch (e) {
    console.error('Error load categories dropdown:', e);
  }
}

async function loadProductsTable() {
  try {
    const res = await fetch('/api/admin/products');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    allProductsCache = data.data || [];
    renderFilteredProducts();
  } catch (err) {
    console.error('Error load products:', err);
  }
}

function renderFilteredProducts() {
  const search = (document.getElementById('filterProductSearch')?.value || '').toLowerCase().trim();
  const categoryId = document.getElementById('filterProductCategory')?.value || '';

  const filtered = allProductsCache.filter(p => {
    const matchName = !search || p.name.toLowerCase().includes(search) || (p.maker_name && p.maker_name.toLowerCase().includes(search));
    const matchCategory = !categoryId || String(p.category_id) === String(categoryId);
    return matchName && matchCategory;
  });

  const tbody = document.getElementById('productsTableBody');
  if (!tbody) return;

  if (filtered.length > 0) {
    tbody.innerHTML = filtered.map(p => `
      <tr>
        <td>
          <img src="${p.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600'}" style="width: 48px; height: 48px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-color);">
        </td>
        <td>
          <strong>${escapeHtml(p.name)}</strong>
          ${p.is_featured ? '<span style="font-size: 10px; background: #FFF3E0; color: #E65100; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: bold;">⭐ Unggulan</span>' : ''}
        </td>
        <td>${escapeHtml(p.category_name || '-')}</td>
        <td><strong>Rp ${Number(p.price).toLocaleString('id-ID')}</strong></td>
        <td>${p.original_price > p.price ? `<span style="text-decoration: line-through; color: #999; font-size: 11px;">Rp ${Number(p.original_price).toLocaleString('id-ID')}</span>` : '-'}</td>
        <td>${p.stock} ${escapeHtml(p.unit || 'pcs')}</td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${escapeHtml(p.maker_name || '-')} (${escapeHtml(p.village_origin || '-')})</span></td>
        <td>
          <button onclick="toggleProductActive(${p.id})" class="btn-action-sm ${p.is_active ? 'btn-action-success' : 'btn-action-warning'}">
            ${p.is_active ? '✓ Aktif' : '✗ Nonaktif'}
          </button>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button onclick="editProduct(${p.id})" class="btn-action-sm btn-action-edit">✏️ Edit</button>
            <button onclick="deleteProduct(${p.id})" class="btn-action-sm btn-action-delete">🗑️ Hapus</button>
          </div>
        </td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:#888; padding: 24px;">Tidak ada produk yang cocok dengan pencarian.</td></tr>';
  }
}

function openProductModal() {
  document.getElementById('productModalTitle').textContent = 'Upload Produk Baru';
  document.getElementById('prodId').value = '';
  document.getElementById('productForm').reset();
  document.getElementById('prodIsFeatured').checked = true;
  document.getElementById('prodIsActive').checked = true;
  resetImagePreview();
  document.getElementById('productModal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
}

function editProduct(id) {
  const p = allProductsCache.find(it => it.id === id);
  if (!p) return;

  document.getElementById('productModalTitle').textContent = 'Edit Data Produk';
  document.getElementById('prodId').value = p.id;
  document.getElementById('prodName').value = p.name || '';
  document.getElementById('prodCategory').value = p.category_id || (categoriesCache[0]?.id || 1);
  document.getElementById('prodPrice').value = p.price || 0;
  document.getElementById('prodOriginalPrice').value = p.original_price || 0;
  document.getElementById('prodStock').value = p.stock || 0;
  document.getElementById('prodUnit').value = p.unit || 'pcs';
  document.getElementById('prodImageUrl').value = p.image_url || '';
  document.getElementById('prodMaker').value = p.maker_name || '';
  document.getElementById('prodVillage').value = p.village_origin || '';
  document.getElementById('prodDesc').value = p.description || '';
  document.getElementById('prodIsFeatured').checked = p.is_featured === 1;
  document.getElementById('prodIsActive').checked = p.is_active === 1;

  if (p.image_url) {
    updateImagePreview(p.image_url);
  } else {
    resetImagePreview();
  }

  document.getElementById('productModal').classList.add('active');
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('prodId').value;
  const payload = {
    name: document.getElementById('prodName').value.trim(),
    category_id: document.getElementById('prodCategory').value,
    price: document.getElementById('prodPrice').value,
    original_price: document.getElementById('prodOriginalPrice').value,
    stock: document.getElementById('prodStock').value,
    unit: document.getElementById('prodUnit').value.trim() || 'pcs',
    image_url: document.getElementById('prodImageUrl').value.trim(),
    maker_name: document.getElementById('prodMaker').value.trim(),
    village_origin: document.getElementById('prodVillage').value.trim(),
    description: document.getElementById('prodDesc').value.trim(),
    is_featured: document.getElementById('prodIsFeatured').checked ? 1 : 0,
    is_active: document.getElementById('prodIsActive').checked ? 1 : 0
  };

  const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert(result.message);
      closeProductModal();
      loadProductsTable();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (err) {
    alert('Kesalahan saat menyimpan data produk: ' + err.message);
  }
}

async function toggleProductActive(id) {
  try {
    const res = await fetch(`/api/admin/products/${id}/toggle`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      loadProductsTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal mengubah status aktif produk');
  }
}

async function deleteProduct(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus produk ini secara permanen?')) return;
  try {
    const res = await fetch(`/api/admin/products/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadProductsTable();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Gagal menghapus produk: ' + err.message);
  }
}

// ==============================================================================
// TAB 3: MANAJEMEN KATEGORI PRODUK
// ==============================================================================
async function loadCategoriesTable() {
  try {
    const res = await fetch('/api/admin/categories');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;

    if (data.data.length > 0) {
      tbody.innerHTML = data.data.map(c => `
        <tr>
          <td style="font-size: 22px;">${c.icon || '📦'}</td>
          <td><strong>${escapeHtml(c.name)}</strong></td>
          <td><code style="background: #FAF6EE; padding: 2px 6px; border-radius: 4px;">${escapeHtml(c.slug)}</code></td>
          <td>${c.sort_order || 0}</td>
          <td><span style="font-weight: bold; color: var(--terracotta);">${c.product_count || 0} produk</span></td>
          <td>
            <div style="display: flex; gap: 4px;">
              <button onclick="editCategory(${JSON.stringify(c).replace(/"/g, '&quot;')})" class="btn-action-sm btn-action-edit">✏️ Edit</button>
              <button onclick="deleteCategory(${c.id})" class="btn-action-sm btn-action-delete">🗑️ Hapus</button>
            </div>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888; padding: 20px;">Belum ada kategori produk.</td></tr>';
    }
  } catch (err) {
    console.error('Error load categories table:', err);
  }
}

function openCategoryModal() {
  document.getElementById('categoryModalTitle').textContent = 'Tambah Kategori Baru';
  document.getElementById('catId').value = '';
  document.getElementById('categoryForm').reset();
  document.getElementById('catIcon').value = '📦';
  document.getElementById('categoryModal').classList.add('active');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
}

function editCategory(c) {
  document.getElementById('categoryModalTitle').textContent = 'Edit Kategori Produk';
  document.getElementById('catId').value = c.id;
  document.getElementById('catIcon').value = c.icon || '📦';
  document.getElementById('catName').value = c.name || '';
  document.getElementById('catOrder').value = c.sort_order || 0;
  document.getElementById('categoryModal').classList.add('active');
}

async function handleCategorySubmit(e) {
  e.preventDefault();
  const id = document.getElementById('catId').value;
  const payload = {
    icon: document.getElementById('catIcon').value.trim() || '📦',
    name: document.getElementById('catName').value.trim(),
    sort_order: parseInt(document.getElementById('catOrder').value) || 0
  };

  const url = id ? `/api/admin/categories/${id}` : '/api/admin/categories';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeCategoryModal();
      loadCategoriesTable();
      loadCategoriesDropdown();
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Kesalahan saat menyimpan kategori: ' + err.message);
  }
}

async function deleteCategory(id) {
  if (!confirm('Hapus kategori ini? Semua produk dalam kategori ini tetap aman.')) return;
  try {
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadCategoriesTable();
      loadCategoriesDropdown();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Gagal menghapus kategori: ' + err.message);
  }
}

// ==============================================================================
// TAB 4: PESANAN PELANGGAN & CETAK STRUK INVOICE
// ==============================================================================
async function loadOrdersTable() {
  try {
    const res = await fetch('/api/admin/orders');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    allOrdersCache = data.data || [];
    renderFilteredOrders();
  } catch (err) {
    console.error('Error load orders:', err);
  }
}

function renderFilteredOrders() {
  const statusFilter = document.getElementById('filterOrderStatus')?.value || '';
  const filtered = allOrdersCache.filter(o => !statusFilter || o.status === statusFilter);

  const tbody = document.getElementById('allOrdersTableBody');
  if (!tbody) return;

  if (filtered.length > 0) {
    tbody.innerHTML = filtered.map(o => `
      <tr>
        <td><strong>#${o.order_code}</strong></td>
        <td style="font-size: 11px; color: var(--text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</td>
        <td>
          <strong>${escapeHtml(o.customer_name)}</strong><br>
          <a href="https://wa.me/${(o.customer_phone || '').replace(/\D/g, '')}" target="_blank" style="color: #2E7D32; font-size: 12px; font-weight: 600;">
            📱 ${escapeHtml(o.customer_phone)}
          </a>
        </td>
        <td style="max-width: 200px; font-size: 12px;">
          ${escapeHtml(o.customer_address)}<br>
          <span style="color: var(--terracotta); font-weight: bold;">🚚 ${escapeHtml(o.courier || '-')}</span>
        </td>
        <td><strong>Rp ${Number(o.total_amount).toLocaleString('id-ID')}</strong></td>
        <td style="color: #2E7D32; font-weight: bold;">Rp ${Number(o.pad_amount).toLocaleString('id-ID')}</td>
        <td>
          <select onchange="changeOrderStatus(${o.id}, this.value)" class="form-control" style="padding: 4px 8px; font-size: 12px; width: 140px;">
            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Menunggu Bayar</option>
            <option value="diproses" ${o.status === 'diproses' ? 'selected' : ''}>Diproses</option>
            <option value="dikirim" ${o.status === 'dikirim' ? 'selected' : ''}>Dikirim</option>
            <option value="selesai" ${o.status === 'selesai' ? 'selected' : ''}>Selesai</option>
            <option value="batal" ${o.status === 'batal' ? 'selected' : ''}>Dibatalkan</option>
          </select>
        </td>
        <td>
          <div style="display: flex; gap: 4px;">
            <button onclick="viewOrderDetail(${o.id})" class="btn-action-sm btn-action-edit">👁️ Struk</button>
            <button onclick="deleteOrder(${o.id})" class="btn-action-sm btn-action-delete">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#888; padding: 24px;">Belum ada pesanan dengan filter yang dipilih.</td></tr>';
  }
}

async function changeOrderStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      const order = allOrdersCache.find(o => o.id === id);
      if (order) order.status = newStatus;
      alert(`Status pesanan berhasil diperbarui ke: ${newStatus.toUpperCase()}`);
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal update status pesanan');
  }
}

async function deleteOrder(id) {
  if (!confirm('Hapus data pesanan ini secara permanen?')) return;
  try {
    const res = await fetch(`/api/admin/orders/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadOrdersTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal menghapus pesanan');
  }
}

function viewOrderDetail(id) {
  const o = allOrdersCache.find(it => it.id === id);
  if (!o) return;

  const content = document.getElementById('orderDetailContent');
  if (!content) return;

  const items = Array.isArray(o.items) ? o.items : [];

  content.innerHTML = `
    <div id="printableReceipt" style="background: #FFF; padding: 20px; border-radius: 8px; border: 1px solid var(--border-color); font-family: 'Plus Jakarta Sans', sans-serif;">
      <!-- Header Struk -->
      <div style="text-align: center; border-bottom: 2px dashed #DDD; padding-bottom: 16px; margin-bottom: 16px;">
        <div style="font-size: 30px;">🌾</div>
        <h3 style="margin: 4px 0 2px; color: var(--primary-brown-dark); font-size: 18px;">PASAR DESA NUSANTARA</h3>
        <p style="font-size: 12px; color: var(--text-muted); margin: 0;">Pengelola: BUMDes Mandiri Sejahtera</p>
        <div style="font-size: 14px; font-weight: 800; color: var(--terracotta); margin-top: 8px;">INVOICE: #${o.order_code}</div>
        <div style="font-size: 11px; color: #999;">${new Date(o.created_at).toLocaleString('id-ID')}</div>
      </div>

      <!-- Info Pelanggan -->
      <div style="font-size: 13px; line-height: 1.6; margin-bottom: 16px; border-bottom: 1px solid #EEE; padding-bottom: 12px;">
        <div><strong>Pembeli:</strong> ${escapeHtml(o.customer_name)}</div>
        <div><strong>No. WhatsApp:</strong> ${escapeHtml(o.customer_phone)}</div>
        <div><strong>Alamat Tujuan:</strong> ${escapeHtml(o.customer_address)}</div>
        <div><strong>Ekspedisi / Kurir:</strong> ${escapeHtml(o.courier || '-')}</div>
        <div><strong>Metode Pembayaran:</strong> ${getPaymentMethodLabel(o.payment_method)}</div>
        ${o.bank_name ? `<div><strong>Rekening Bank Tujuan:</strong> ${escapeHtml(o.bank_name)}</div>` : ''}
        ${o.pic_name ? `
          <div style="background: #FFF8E1; padding: 8px 12px; border-radius: 6px; margin: 6px 0; border: 1px solid #FFE082;">
            <strong>📋 Penanggung Jawab (PIC):</strong> ${escapeHtml(o.pic_name)} (${escapeHtml(o.pic_address || '-')})
            ${o.due_date ? `<br><strong>📅 Jatuh Tempo:</strong> ${escapeHtml(o.due_date)}` : ''}
          </div>
        ` : ''}
        <div><strong>Status Pesanan:</strong> <span class="status-badge status-${o.status}">${(o.status || 'pending').toUpperCase()}</span></div>
        ${o.notes ? `<div><strong>Catatan:</strong> <em>${escapeHtml(o.notes)}</em></div>` : ''}

        <!-- LAMPIRAN BUKTI TRANSFER (ADOPSI BINTANGCOD) -->
        ${o.payment_proof_url ? `
          <div style="background: #E8F5E9; border: 1px solid #A5D6A7; border-radius: 8px; padding: 12px; margin-top: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <strong style="color: #2E7D32; font-size: 13px;">🧾 Lampiran Bukti Transfer Pelanggan</strong>
              <button type="button" onclick="showFullImageModal('${o.payment_proof_url}', 'Bukti Transfer #${o.order_code}')" style="background: none; color: #1565C0; font-size: 11px; font-weight: bold; cursor: pointer; text-decoration: underline;">
                🔍 Lihat Ukuran Penuh
              </button>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              <img src="${o.payment_proof_url}" onclick="showFullImageModal('${o.payment_proof_url}', 'Bukti Transfer #${o.order_code}')" style="width: 70px; height: 70px; object-fit: cover; border-radius: 6px; border: 1px solid #DDD; cursor: pointer;" alt="Bukti Transfer">
              <div>
                <div style="font-size: 12px; color: #333;">Tujuan: <strong>${escapeHtml(o.bank_name || 'Rekening BUMDes')}</strong></div>
                ${o.status === 'pending' ? `
                  <button type="button" onclick="verifyPayment(${o.id})" style="background: #2E7D32; color: #FFF; border: none; border-radius: 4px; padding: 5px 12px; font-size: 11px; font-weight: bold; margin-top: 6px; cursor: pointer;">
                    ✓ Verifikasi & Proses Pesanan
                  </button>
                ` : '<span style="color: #2E7D32; font-size: 11px; font-weight: bold;">✓ Pembayaran Sudah Diverifikasi</span>'}
              </div>
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Tabel Item Belanja -->
      <table style="width: 100%; font-size: 12px; border-collapse: collapse; margin-bottom: 16px;">
        <thead>
          <tr style="border-bottom: 1px solid #DDD; text-align: left; color: #666;">
            <th style="padding: 6px 0;">Item Produk</th>
            <th style="padding: 6px 0; text-align: center;">Qty</th>
            <th style="padding: 6px 0; text-align: right;">Harga</th>
            <th style="padding: 6px 0; text-align: right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(it => `
            <tr style="border-bottom: 1px solid #F5F5F5;">
              <td style="padding: 8px 0;"><strong>${escapeHtml(it.name)}</strong></td>
              <td style="padding: 8px 0; text-align: center;">${it.qty}x</td>
              <td style="padding: 8px 0; text-align: right;">Rp ${Number(it.price).toLocaleString('id-ID')}</td>
              <td style="padding: 8px 0; text-align: right;">Rp ${Number(it.subtotal || (it.price * it.qty)).toLocaleString('id-ID')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <!-- Ringkasan Pembayaran & PAD -->
      <div style="border-top: 2px dashed #DDD; padding-top: 12px; font-size: 13px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span>Total Belanja:</span>
          <strong style="font-size: 16px; color: var(--primary-brown-dark);">Rp ${Number(o.total_amount).toLocaleString('id-ID')}</strong>
        </div>
        ${o.dp_amount ? `
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #00796B; margin-bottom: 2px;">
            <span>Uang Muka (DP 30%):</span>
            <strong>Rp ${Number(o.dp_amount).toLocaleString('id-ID')}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #E65100; margin-bottom: 4px;">
            <span>Sisa Tagihan Pelunasan:</span>
            <strong>Rp ${Number(o.total_amount - o.dp_amount).toLocaleString('id-ID')}</strong>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; color: #2E7D32; font-size: 12px;">
          <span>Kontribusi Kas PAD Desa:</span>
          <strong>Rp ${Number(o.pad_amount).toLocaleString('id-ID')}</strong>
        </div>
      </div>

      <div style="text-align: center; margin-top: 20px; font-size: 11px; color: var(--text-muted); border-top: 1px solid #EEE; padding-top: 12px;">
        Terima kasih telah berbelanja dan memajukan perekonomian desa kami!
      </div>
    </div>

    <!-- Tombol Aksi Modal -->
    <div style="display: flex; gap: 10px; margin-top: 16px;">
      <button onclick="printOrderReceipt()" class="btn-primary" style="flex: 1; padding: 10px;">
        🖨️ Cetak Struk / Invoice
      </button>
      <button onclick="closeOrderDetailModal()" class="btn-secondary" style="padding: 10px 16px;">
        Tutup
      </button>
    </div>
  `;

  document.getElementById('orderDetailModal').classList.add('active');
}

function getPaymentMethodLabel(method) {
  const map = {
    cod: '🚚 Bayar di Tempat (COD)',
    cash: '🏪 Tunai Langsung / Ambil di Toko',
    transfer_qris: '📲 Transfer Bank & QRIS',
    tempo: '⏳ Cash Tunda / Tempo 3 Hari',
    dp_panjar: '💵 DP / Panjar 30%',
    wa: '📱 WhatsApp'
  };
  return map[method] || (method || 'COD').toUpperCase();
}

function closeOrderDetailModal() {
  document.getElementById('orderDetailModal').classList.remove('active');
}

// ==============================================================================
// TAB 7: MANAJEMEN REKENING BANK & QRIS BUMDES (ADOPSI BINTANGCOD)
// ==============================================================================
let adminBankList = [];

async function loadBanksTable() {
  try {
    const res = await fetch('/api/admin/payment/banks');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    adminBankList = data.banks || [];
    const tbody = document.getElementById('banksTableBody');
    if (!tbody) return;

    if (adminBankList.length > 0) {
      tbody.innerHTML = adminBankList.map(b => {
        const isQris = (b.bank_name || '').toLowerCase().includes('qris');
        return `
          <tr>
            <td>
              <strong>${escapeHtml(b.bank_name)}</strong>
              ${isQris ? '<span style="font-size: 10px; background: #EDE7F6; color: #512DA8; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: bold;">⚡ QRIS</span>' : ''}
            </td>
            <td><code style="background: #FAF6EE; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: bold;">${escapeHtml(b.account_number)}</code></td>
            <td>${escapeHtml(b.account_holder)}</td>
            <td>${b.sort_order || 0}</td>
            <td>
              <button onclick="toggleBankActive('${b.id}')" class="btn-action-sm ${b.is_active ? 'btn-action-success' : 'btn-action-warning'}">
                ${b.is_active ? '✓ Aktif' : '✗ Nonaktif'}
              </button>
            </td>
            <td>
              <div style="display: flex; gap: 4px;">
                <button onclick="editBank('${b.id}')" class="btn-action-sm btn-action-edit">✏️ Edit</button>
                <button onclick="deleteBank('${b.id}')" class="btn-action-sm btn-action-delete">🗑️ Hapus</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888; padding: 20px;">Belum ada rekening bank. Silakan tambah rekening baru.</td></tr>';
    }
  } catch (err) {
    console.error('Error load banks:', err);
  }
}

function openBankModal() {
  document.getElementById('bankModalTitle').textContent = 'Tambah Rekening Bank / QRIS';
  document.getElementById('bankId').value = '';
  document.getElementById('bankForm').reset();
  document.getElementById('inputBankActive').checked = true;
  document.getElementById('bankModal').classList.add('active');
}

function closeBankModal() {
  document.getElementById('bankModal').classList.remove('active');
}

function editBank(id) {
  const b = adminBankList.find(it => it.id === id);
  if (!b) return;

  document.getElementById('bankModalTitle').textContent = 'Edit Rekening Bank / QRIS';
  document.getElementById('bankId').value = b.id;
  document.getElementById('inputBankName').value = b.bank_name || '';
  document.getElementById('inputBankNumber').value = b.account_number || '';
  document.getElementById('inputBankHolder').value = b.account_holder || '';
  document.getElementById('inputBankOrder').value = b.sort_order || 0;
  document.getElementById('inputBankActive').checked = b.is_active === 1;

  document.getElementById('bankModal').classList.add('active');
}

async function handleBankSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('bankId').value;
  const payload = {
    bank_name: document.getElementById('inputBankName').value.trim(),
    account_number: document.getElementById('inputBankNumber').value.trim(),
    account_holder: document.getElementById('inputBankHolder').value.trim(),
    sort_order: parseInt(document.getElementById('inputBankOrder').value) || 0,
    is_active: document.getElementById('inputBankActive').checked ? 1 : 0
  };

  const url = id ? `/api/admin/payment/banks/${id}` : '/api/admin/payment/banks';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeBankModal();
      loadBanksTable();
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Kesalahan saat menyimpan rekening');
  }
}

async function toggleBankActive(id) {
  try {
    const res = await fetch(`/api/admin/payment/banks/${id}/toggle`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      loadBanksTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal mengubah status rekening');
  }
}

async function deleteBank(id) {
  if (!confirm('Yakin ingin menghapus rekening bank ini?')) return;
  try {
    const res = await fetch(`/api/admin/payment/banks/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadBanksTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal menghapus rekening');
  }
}

// Modal Foto Ukuran Penuh
function showFullImageModal(src, title) {
  const modal = document.getElementById('imagePreviewModal');
  const img = document.getElementById('imagePreviewFull');
  const titleEl = document.getElementById('imagePreviewTitle');

  if (modal && img) {
    img.src = src;
    if (titleEl) titleEl.textContent = title || 'Bukti Transfer';
    modal.classList.add('active');
  }
}

function closeImagePreviewModal() {
  const modal = document.getElementById('imagePreviewModal');
  if (modal) modal.classList.remove('active');
}

async function verifyPayment(orderId) {
  if (!confirm('Verifikasi bukti transfer ini dan ubah status pesanan menjadi DIPROSES?')) return;
  try {
    const res = await fetch(`/api/admin/orders/${orderId}/verify-payment`, { method: 'PUT' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      closeOrderDetailModal();
      loadOrdersTable();
      loadStats();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal memverifikasi pembayaran');
  }
}
  document.getElementById('orderDetailModal').classList.remove('active');
}

function printOrderReceipt() {
  window.print();
}

// ==============================================================================
// TAB 5: MANAJEMEN PENGGUNA (GOOGLE SSO USERS)
// ==============================================================================
async function loadUsersTable() {
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    allUsersCache = data.data || [];
    renderFilteredUsers();
  } catch (err) {
    console.error('Error load users:', err);
  }
}

function renderFilteredUsers() {
  const search = (document.getElementById('searchUserInput')?.value || '').toLowerCase().trim();
  const filtered = allUsersCache.filter(u => {
    return !search || (u.name && u.name.toLowerCase().includes(search)) || (u.email && u.email.toLowerCase().includes(search));
  });

  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  if (filtered.length > 0) {
    tbody.innerHTML = filtered.map(u => {
      const isSuper = u.email === 'syamsul18782@gmail.com';
      const roleBadge = isSuper
        ? '<span style="background: #E8F5E9; color: #1B5E20; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">👑 Super Admin</span>'
        : (u.is_admin ? '<span style="background: #E3F2FD; color: #1565C0; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">🏛️ Admin BUMDes</span>' : '<span style="color: #666; font-size: 12px;">👤 Pelanggan</span>');

      const statusBadge = u.is_blocked
        ? '<span style="background: #FFEBEE; color: #C62828; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">🔴 DIBLOKIR</span>'
        : '<span style="background: #E8F5E9; color: #2E7D32; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;">✓ Aktif</span>';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              ${u.picture ? `<img src="${u.picture}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">` : '<span>👤</span>'}
              <strong>${escapeHtml(u.name || 'Pengguna')}</strong>
            </div>
          </td>
          <td><code style="font-size: 12px;">${escapeHtml(u.email)}</code></td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
          <td>
            <div style="font-size: 12px;"><strong>${u.total_orders || 0}</strong> pesanan</div>
            <div style="font-size: 11px; color: #2E7D32;">Rp ${Number(u.total_spent || 0).toLocaleString('id-ID')}</div>
          </td>
          <td>${statusBadge}</td>
          <td>${roleBadge}</td>
          <td>
            ${isSuper ? '<span style="font-size: 11px; color: #999;">Super Admin Utama</span>' : `
              <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button onclick="toggleUserAdminRole('${encodeURIComponent(u.email)}', ${u.is_admin ? 0 : 1})" class="btn-action-sm ${u.is_admin ? 'btn-action-warning' : 'btn-action-edit'}">
                  ${u.is_admin ? 'Cabut Admin' : 'Jadikan Admin'}
                </button>
                <button onclick="toggleUserBlock('${encodeURIComponent(u.email)}', ${u.is_blocked ? 0 : 1})" class="btn-action-sm ${u.is_blocked ? 'btn-action-success' : 'btn-action-warning'}">
                  ${u.is_blocked ? 'Buka Blokir' : 'Blokir'}
                </button>
                <button onclick="deleteUserAccount('${encodeURIComponent(u.email)}')" class="btn-action-sm btn-action-delete">
                  Hapus
                </button>
              </div>
            `}
          </td>
        </tr>
      `;
    }).join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888; padding: 24px;">Tidak ada pengguna yang cocok.</td></tr>';
  }
}

function filterUsersTable() {
  renderFilteredUsers();
}

async function toggleUserAdminRole(encodedEmail, newIsAdmin) {
  const email = decodeURIComponent(encodedEmail);
  const actionName = newIsAdmin ? 'menjadikan Administrator BUMDes' : 'mencabut status Administrator';
  if (!confirm(`Apakah Anda yakin ingin ${actionName} untuk akun (${email})?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodedEmail}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: newIsAdmin })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadUsersTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal memperbarui hak akses pengguna');
  }
}

async function toggleUserBlock(encodedEmail, newIsBlocked) {
  const email = decodeURIComponent(encodedEmail);
  const actionName = newIsBlocked ? 'MEMBLOKIR' : 'MEMBUKA BLOKIR';
  if (!confirm(`Apakah Anda yakin ingin ${actionName} akun (${email})?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodedEmail}/block`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_blocked: newIsBlocked })
    });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadUsersTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal mengubah status blokir');
  }
}

async function deleteUserAccount(encodedEmail) {
  const email = decodeURIComponent(encodedEmail);
  if (!confirm(`PERINGATAN: Hapus akun (${email}) dari sistem? Tindakan ini tidak dapat dibatalkan.`)) return;

  try {
    const res = await fetch(`/api/admin/users/${encodedEmail}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert(data.message);
      loadUsersTable();
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal menghapus akun pengguna');
  }
}

// ==============================================================================
// TAB 6: PENGATURAN TOKO & DESA (WHITELABEL CONFIG)
// ==============================================================================
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings');
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const c = data.data || {};
    document.getElementById('setDesaName').value = c.desa_name || '';
    document.getElementById('setBumdesName').value = c.bumdes_name || '';
    document.getElementById('setTagline').value = c.store_tagline || '';
    document.getElementById('setAdminEmail').value = c.admin_email || 'syamsul18782@gmail.com';
    document.getElementById('setGoogleClientId').value = c.google_client_id || '857800648920-ue7akumho3f7ie9e0ir102goqvceji6d.apps.googleusercontent.com';
    document.getElementById('setWa').value = c.whatsapp_number || '';
    document.getElementById('setPadPercent').value = c.pad_percentage || '5';
    document.getElementById('setBankName').value = c.bank_name || '';
    document.getElementById('setBankAccount').value = c.bank_account || '';
    document.getElementById('setBankHolder').value = c.bank_holder || '';

    const sb = document.getElementById('adminSidebarBumdes');
    if (sb) sb.textContent = c.bumdes_name || 'BUMDes';
  } catch (err) {
    console.error('Error load settings:', err);
  }
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const payload = {
    desa_name: document.getElementById('setDesaName').value.trim(),
    bumdes_name: document.getElementById('setBumdesName').value.trim(),
    store_tagline: document.getElementById('setTagline').value.trim(),
    admin_email: document.getElementById('setAdminEmail').value.trim(),
    google_client_id: document.getElementById('setGoogleClientId').value.trim(),
    whatsapp_number: document.getElementById('setWa').value.trim(),
    pad_percentage: document.getElementById('setPadPercent').value.trim(),
    bank_name: document.getElementById('setBankName').value.trim(),
    bank_account: document.getElementById('setBankAccount').value.trim(),
    bank_holder: document.getElementById('setBankHolder').value.trim()
  };

  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Pengaturan desa, BUMDes & Google SSO berhasil disimpan!');
      const sb = document.getElementById('adminSidebarBumdes');
      if (sb) sb.textContent = payload.bumdes_name;
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Kesalahan saat menyimpan pengaturan: ' + err.message);
  }
}

function checkAuthExpired(res) {
  if (res.message && (res.message.includes('Sesi') || res.message.includes('Akses Ditolak') || res.message.includes('Autentikasi'))) {
    alert(res.message);
    adminLogout();
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
