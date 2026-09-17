let authToken = localStorage.getItem('pasardesa_admin_token') || '';
let currentUserProfile = null;
let currentTab = 'dashboard';
let categoriesCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkActiveSession();
});

// Cek sesi aktif saat halaman dimuat (Cookie Google SSO atau Bearer Token)
async function checkActiveSession() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.success && data.loggedIn && data.user && data.user.is_admin) {
      currentUserProfile = data.user;
      showAdminPanel();
      return;
    }
  } catch (e) {
    console.warn('Gagal memeriksa sesi Google SSO:', e);
  }

  // Fallback: cek local token manual
  if (authToken) {
    showAdminPanel();
  } else {
    showLoginScreen();
  }
}

function setupEventListeners() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleManualLogin);
  }

  const productForm = document.getElementById('productForm');
  if (productForm) {
    productForm.addEventListener('submit', handleProductSubmit);
  }

  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSettingsSubmit);
  }
}

// Callback Google SSO (Adopsi Pola Warung Pulsa)
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
    alert('Terjadi kesalahan koneksi login Google SSO');
  }
}

// Login Manual (Fallback)
async function handleManualLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      authToken = data.data.token;
      localStorage.setItem('pasardesa_admin_token', authToken);
      currentUserProfile = { name: data.data.full_name || 'Admin BUMDes' };
      showAdminPanel();
    } else {
      alert('Login Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Terjadi kesalahan koneksi login manual');
  }
}

function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
}

function adminLogout() {
  fetch('/api/logout', { method: 'POST' }).finally(() => {
    fetch('/api/admin/logout', { method: 'POST', headers: getAuthHeaders() }).finally(() => {
      authToken = '';
      currentUserProfile = null;
      localStorage.removeItem('pasardesa_admin_token');
      showLoginScreen();
    });
  });
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'flex';

  // Tampilkan Avatar & Profil di Topbar
  const profileContainer = document.getElementById('adminProfileHeader');
  if (profileContainer && currentUserProfile) {
    profileContainer.innerHTML = `
      ${currentUserProfile.picture ? `<img src="${currentUserProfile.picture}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">` : '<span>👤</span>'}
      <span>${currentUserProfile.name || 'Pengelola BUMDes'}</span>
    `;
  }

  loadCategories();
  loadStats();
}

function switchAdminTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  document.getElementById('tabDashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('tabProducts').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('tabOrders').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('tabSettings').style.display = tab === 'settings' ? 'block' : 'none';

  const titles = {
    dashboard: 'Dashboard & Ringkasan PAD',
    products: 'Kelola Katalog Produk Desa',
    orders: 'Daftar Pesanan Masuk',
    settings: 'Pengaturan Profil Desa, BUMDes & Google SSO'
  };
  document.getElementById('adminPageTitle').textContent = titles[tab] || 'Panel Pengelola';

  if (tab === 'dashboard') loadStats();
  if (tab === 'products') loadProductsTable();
  if (tab === 'orders') loadOrdersTable();
  if (tab === 'settings') loadSettings();
}

// 1. Dashboard Stats
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const s = data.data;
    document.getElementById('statPad').textContent = `Rp ${Number(s.total_pad).toLocaleString('id-ID')}`;
    document.getElementById('statOmzet').textContent = `Rp ${Number(s.total_omzet).toLocaleString('id-ID')}`;
    document.getElementById('statOrders').textContent = s.total_orders;
    document.getElementById('statProducts').textContent = s.total_products;

    const tbody = document.getElementById('recentOrdersBody');
    if (s.recent_orders && s.recent_orders.length > 0) {
      tbody.innerHTML = s.recent_orders.map(o => `
        <tr>
          <td><strong>#${o.order_code}</strong></td>
          <td>${o.customer_name}</td>
          <td>${o.customer_phone}</td>
          <td>Rp ${Number(o.total_amount).toLocaleString('id-ID')}</td>
          <td style="color: #2E7D32; font-weight: bold;">Rp ${Number(o.pad_amount).toLocaleString('id-ID')}</td>
          <td><span class="status-badge status-${o.status}">${o.status.toUpperCase()}</span></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#888;">Belum ada pesanan masuk.</td></tr>';
    }
  } catch (err) {
    console.error('Error stats:', err);
  }
}

// 2. Products Management
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.success) {
      categoriesCache = data.data;
      const select = document.getElementById('prodCategory');
      if (select) {
        select.innerHTML = categoriesCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
    }
  } catch (e) {
    console.error('Error load categories:', e);
  }
}

async function loadProductsTable() {
  try {
    const res = await fetch('/api/admin/products', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const tbody = document.getElementById('productsTableBody');
    if (data.data.length > 0) {
      tbody.innerHTML = data.data.map(p => `
        <tr>
          <td><img src="${p.image_url}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover;"></td>
          <td><strong>${p.name}</strong></td>
          <td>${p.category_name || '-'}</td>
          <td>Rp ${Number(p.price).toLocaleString('id-ID')}</td>
          <td>${p.stock} ${p.unit}</td>
          <td>${p.village_origin || '-'} (${p.maker_name || '-'})</td>
          <td>
            <button onclick="editProduct(${JSON.stringify(p).replace(/"/g, '&quot;')})" style="background:#1976D2; color:#FFF; padding:4px 8px; border-radius:4px; font-size:11px; margin-right:4px;">Edit</button>
            <button onclick="deleteProduct(${p.id})" style="background:#D32F2F; color:#FFF; padding:4px 8px; border-radius:4px; font-size:11px;">Hapus</button>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">Belum ada produk. Silakan tambah produk baru.</td></tr>';
    }
  } catch (err) {
    console.error('Error load products:', err);
  }
}

function openProductModal() {
  document.getElementById('productModalTitle').textContent = 'Tambah Produk Baru';
  document.getElementById('prodId').value = '';
  document.getElementById('productForm').reset();
  document.getElementById('productModal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
}

function editProduct(p) {
  document.getElementById('productModalTitle').textContent = 'Edit Produk';
  document.getElementById('prodId').value = p.id;
  document.getElementById('prodName').value = p.name;
  document.getElementById('prodCategory').value = p.category_id;
  document.getElementById('prodPrice').value = p.price;
  document.getElementById('prodOriginalPrice').value = p.original_price || 0;
  document.getElementById('prodStock').value = p.stock;
  document.getElementById('prodUnit').value = p.unit || 'pcs';
  document.getElementById('prodImageUrl').value = p.image_url;
  document.getElementById('prodMaker').value = p.maker_name || '';
  document.getElementById('prodVillage').value = p.village_origin || '';
  document.getElementById('prodDesc').value = p.description || '';
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
    unit: document.getElementById('prodUnit').value,
    image_url: document.getElementById('prodImageUrl').value.trim(),
    maker_name: document.getElementById('prodMaker').value.trim(),
    village_origin: document.getElementById('prodVillage').value.trim(),
    description: document.getElementById('prodDesc').value.trim(),
    is_featured: 1
  };

  const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(),
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
    alert('Kesalahan saat menyimpan produk');
  }
}

async function deleteProduct(id) {
  if (!confirm('Yakin ingin menghapus produk ini dari toko?')) return;
  try {
    const res = await fetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      loadProductsTable();
    } else {
      alert(data.message);
    }
  } catch (err) {
    alert('Gagal menghapus produk');
  }
}

// 3. Orders Management
async function loadOrdersTable() {
  try {
    const res = await fetch('/api/admin/orders', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const tbody = document.getElementById('allOrdersTableBody');
    if (data.data.length > 0) {
      tbody.innerHTML = data.data.map(o => `
        <tr>
          <td><strong>#${o.order_code}</strong></td>
          <td>${new Date(o.created_at).toLocaleDateString('id-ID')}</td>
          <td>
            <strong>${o.customer_name}</strong><br>
            <a href="https://wa.me/${o.customer_phone.replace(/\D/g, '')}" target="_blank" style="color: #2E7D32;">📱 ${o.customer_phone}</a>
          </td>
          <td style="max-width: 220px; font-size: 12px;">${o.customer_address}</td>
          <td><strong>Rp ${Number(o.total_amount).toLocaleString('id-ID')}</strong></td>
          <td style="color: #2E7D32; font-weight: bold;">Rp ${Number(o.pad_amount).toLocaleString('id-ID')}</td>
          <td>
            <select onchange="changeOrderStatus(${o.id}, this.value)" style="padding: 4px 6px; border-radius: 4px; font-size: 12px;">
              <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Menunggu Pembayaran</option>
              <option value="diproses" ${o.status === 'diproses' ? 'selected' : ''}>Diproses</option>
              <option value="dikirim" ${o.status === 'dikirim' ? 'selected' : ''}>Dikirim</option>
              <option value="selesai" ${o.status === 'selesai' ? 'selected' : ''}>Selesai</option>
              <option value="batal" ${o.status === 'batal' ? 'selected' : ''}>Dibatalkan</option>
            </select>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#888;">Belum ada pesanan.</td></tr>';
    }
  } catch (err) {
    console.error('Error load orders:', err);
  }
}

async function changeOrderStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/admin/orders/${id}/status`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Status diperbarui ke: ${newStatus}`);
    } else {
      alert(data.message);
    }
  } catch (e) {
    alert('Gagal update status pesanan');
  }
}

// 4. Settings Management (Whitelabel & Google SSO)
async function loadSettings() {
  try {
    const res = await fetch('/api/admin/settings', { headers: getAuthHeaders() });
    const data = await res.json();
    if (!data.success) return checkAuthExpired(data);

    const c = data.data;
    document.getElementById('setDesaName').value = c.desa_name || '';
    document.getElementById('setBumdesName').value = c.bumdes_name || '';
    document.getElementById('setTagline').value = c.store_tagline || '';
    document.getElementById('setAdminEmail').value = c.admin_email || 'syamsul18782@gmail.com';
    document.getElementById('setGoogleClientId').value = c.google_client_id || '727817597785-oub85kbvvsl640v7q4cak661vn5jt7kh.apps.googleusercontent.com';
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
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert('Pengaturan desa & Google SSO berhasil disimpan!');
      const sb = document.getElementById('adminSidebarBumdes');
      if (sb) sb.textContent = payload.bumdes_name;
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Kesalahan saat menyimpan pengaturan');
  }
}

function checkAuthExpired(res) {
  if (res.message && res.message.includes('Autentikasi')) {
    alert('Sesi Anda telah berakhir, silakan login kembali.');
    adminLogout();
  }
}
