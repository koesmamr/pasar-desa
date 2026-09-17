// State Manajemen Aplikasi
let appConfig = {};
let currentUser = null;
let currentCategory = 'semua';
let searchQuery = '';
let cart = JSON.parse(localStorage.getItem('pasardesa_cart') || '[]');

// DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
  updateCartUI();
});

async function initApp() {
  await loadConfig();
  await checkUserAuth();
  await loadCategories();
  await loadProducts();
  await loadStories();
}

// Cek Pengguna Aktif (Google SSO)
async function checkUserAuth() {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();
    if (data.success && data.loggedIn && data.user) {
      currentUser = data.user;
      const topAuth = document.getElementById('topAuthArea');
      if (topAuth) {
        topAuth.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; font-size:12px;">
            ${currentUser.picture ? `<img src="${currentUser.picture}" style="width:22px; height:22px; border-radius:50%;">` : '<span>👤</span>'}
            <span>Hai, <strong>${currentUser.name}</strong></span>
            ${currentUser.is_admin ? '<a href="/admin" style="background:#C85A32; color:#FFF; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold;">Panel Admin</a>' : ''}
            <button onclick="userLogout()" style="background:none; color:#FFCDD2; font-size:11px; text-decoration:underline;">Keluar</button>
          </div>
        `;
      }
      // Isi otomatis form checkout jika kosong
      const nameInput = document.getElementById('orderName');
      if (nameInput && !nameInput.value) nameInput.value = currentUser.name;
    }
  } catch (e) {
    console.warn('Gagal cek auth me:', e);
  }
}

async function userLogout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.reload();
}

// 1. Ambil Konfigurasi Desa & BUMDes
async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success) {
      appConfig = data.data;
      applyConfigToDOM();
    }
  } catch (err) {
    console.error('Gagal memuat konfigurasi desa:', err);
  }
}

function applyConfigToDOM() {
  const desaName = appConfig.desa_name || 'Desa Nusantara';
  const bumdesName = appConfig.bumdes_name || 'BUMDes Berkah Mandiri';
  const tagline = appConfig.store_tagline || 'Lokal, Asli, Berkualitas';
  const padPercent = appConfig.pad_percentage || '5';
  const wa = appConfig.whatsapp_number || '6281234567890';

  document.querySelectorAll('.conf-desa-name').forEach(el => el.textContent = desaName);
  document.querySelectorAll('.conf-bumdes-name').forEach(el => el.textContent = bumdesName);
  document.querySelectorAll('.conf-tagline').forEach(el => el.textContent = tagline);
  document.querySelectorAll('.conf-pad-percent').forEach(el => el.textContent = `${padPercent}%`);

  const waBtn = document.getElementById('floatingWaBtn');
  if (waBtn) {
    const cleanWa = wa.replace(/\D/g, '');
    waBtn.href = `https://wa.me/${cleanWa}?text=Halo%20Admin%20${encodeURIComponent(bumdesName)},%20saya%20ingin%20bertanya%20produk%20Pasar%20Desa`;
  }
}

// 2. Ambil Kategori Produk
async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const data = await res.json();
    if (data.success) {
      renderCategoryPills(data.data);
    }
  } catch (err) {
    console.error('Gagal memuat kategori:', err);
  }
}

function renderCategoryPills(categories) {
  const container = document.getElementById('categoryPills');
  if (!container) return;

  let html = `
    <button class="category-pill ${currentCategory === 'semua' ? 'active' : ''}" onclick="filterCategory('semua', this)">
      <span>🌟</span> Semua Produk
    </button>
  `;

  categories.forEach(c => {
    html += `
      <button class="category-pill ${currentCategory === c.slug ? 'active' : ''}" onclick="filterCategory('${c.slug}', this)">
        <span>${c.icon || '📦'}</span> ${c.name}
      </button>
    `;
  });

  container.innerHTML = html;
}

// 3. Ambil Daftar Produk
async function loadProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  container.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
      <p style="color: var(--text-muted);">Memuat produk desa nusantara...</p>
    </div>
  `;

  try {
    let url = `/api/products?category=${currentCategory}`;
    if (searchQuery.trim()) {
      url += `&search=${encodeURIComponent(searchQuery)}`;
    }

    const res = await fetch(url);
    const data = await res.json();

    if (data.success && data.data.length > 0) {
      renderProducts(data.data);
    } else {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 50px 20px;">
          <div style="font-size: 42px; margin-bottom: 12px;">🌾</div>
          <h3 style="font-size: 18px; margin-bottom: 6px;">Produk Belum Ditemukan</h3>
          <p style="color: var(--text-muted); font-size: 14px;">Silakan coba kata kunci lain atau pilih kategori yang tersedia.</p>
        </div>
      `;
    }
  } catch (err) {
    container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red;">Gagal memuat produk: ${err.message}</p>`;
  }
}

function renderProducts(products) {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  const padPercent = appConfig.pad_percentage || '5';

  let html = '';
  products.forEach(p => {
    html += `
      <div class="product-card">
        <div class="product-thumb">
          <img src="${p.image_url || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600'}" alt="${p.name}" loading="lazy">
          <span class="badge-village">📍 ${p.village_origin || 'Desa Nusantara'}</span>
          <span class="badge-pad-cut">PAD +${padPercent}%</span>
        </div>
        <div class="product-body">
          <div class="product-category">${p.category_name || 'Produk Desa'}</div>
          <h3 class="product-name" title="${p.name}">${p.name}</h3>
          <div class="product-maker">Oleh: ${p.maker_name || 'BUMDes'}</div>
          
          <div class="product-price-wrap">
            <span class="product-price">Rp ${Number(p.price).toLocaleString('id-ID')}</span>
            ${p.original_price > p.price ? `<span class="product-original-price">Rp ${Number(p.original_price).toLocaleString('id-ID')}</span>` : ''}
          </div>

          <button class="btn-add-cart" onclick="addToCart(${p.id}, '${escapeString(p.name)}', ${p.price}, '${p.image_url}', '${escapeString(p.village_origin)}')">
            🛒 Tambah ke Keranjang
          </button>
          
          <button class="btn-buy-wa" onclick="quickBuyWhatsApp(${p.id}, '${escapeString(p.name)}', ${p.price})">
            📱 Beli Cepat via WA
          </button>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 4. Ambil Cerita Desa (Storytelling)
async function loadStories() {
  const container = document.getElementById('storiesGrid');
  if (!container) return;

  try {
    const res = await fetch('/api/stories');
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      let html = '';
      data.data.forEach(s => {
        html += `
          <div class="story-card">
            <img src="${s.image_url}" alt="${s.title}" class="story-img">
            <div class="story-content">
              <h3>${s.title}</h3>
              <div class="story-author">${s.author_name} - ${s.author_role} (${s.village})</div>
              <p class="story-text">${s.excerpt || s.content}</p>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    }
  } catch (e) {
    console.error('Gagal memuat cerita desa:', e);
  }
}

function filterCategory(slug, btn) {
  currentCategory = slug;
  document.querySelectorAll('.category-pill').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadProducts();
}

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        searchQuery = e.target.value;
        loadProducts();
      }, 350);
    });
  }

  const cartBtn = document.getElementById('openCartBtn');
  if (cartBtn) cartBtn.addEventListener('click', toggleCartDrawer);

  const closeCartBtn = document.getElementById('closeCartBtn');
  const cartOverlay = document.getElementById('cartOverlay');
  if (closeCartBtn) closeCartBtn.addEventListener('click', toggleCartDrawer);
  if (cartOverlay) cartOverlay.addEventListener('click', toggleCartDrawer);

  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) checkoutForm.addEventListener('submit', handleCheckoutSubmit);
}

// ==========================================================================
// KERANJANG BELANJA (CART)
// ==========================================================================
function addToCart(id, name, price, imageUrl, village) {
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ id, name, price: Number(price), imageUrl, village, qty: 1 });
  }
  saveCart();
  updateCartUI();
  showToast(`✅ ${name} berhasil ditambahkan ke keranjang!`);
}

function updateQty(id, delta) {
  const item = cart.find(it => it.id === id);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) {
      removeFromCart(id);
      return;
    }
    saveCart();
    updateCartUI();
  }
}

function removeFromCart(id) {
  cart = cart.filter(item => item.id !== id);
  saveCart();
  updateCartUI();
}

function saveCart() {
  localStorage.setItem('pasardesa_cart', JSON.stringify(cart));
}

function toggleCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  const overlay = document.getElementById('cartOverlay');
  if (drawer && overlay) {
    drawer.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

function updateCartUI() {
  const countEls = document.querySelectorAll('.cart-count-val');
  const totalQty = cart.reduce((sum, it) => sum + it.qty, 0);
  countEls.forEach(el => el.textContent = totalQty);

  const container = document.getElementById('cartItemsList');
  const emptyState = document.getElementById('cartEmptyState');
  const footerWrap = document.getElementById('cartFooter');

  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    if (footerWrap) footerWrap.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (footerWrap) footerWrap.style.display = 'block';

  let totalAmount = 0;
  let html = '';

  cart.forEach(item => {
    const subtotal = item.price * item.qty;
    totalAmount += subtotal;
    html += `
      <div class="cart-item">
        <img src="${item.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600'}" alt="${item.name}" class="cart-item-img">
        <div class="cart-item-info">
          <div class="cart-item-title">${item.name}</div>
          <div class="cart-item-price">Rp ${item.price.toLocaleString('id-ID')}</div>
          <div class="cart-qty-control">
            <button class="btn-qty" onclick="updateQty(${item.id}, -1)">-</button>
            <span class="cart-qty-num">${item.qty}</span>
            <button class="btn-qty" onclick="updateQty(${item.id}, 1)">+</button>
            <button class="btn-remove-item" onclick="removeFromCart(${item.id})">🗑️</button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  const padPercent = parseFloat(appConfig.pad_percentage || '5');
  const padAmount = Math.round((totalAmount * padPercent) / 100);

  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');
  const padEl = document.getElementById('cartPadEst');

  if (subtotalEl) subtotalEl.textContent = `Rp ${totalAmount.toLocaleString('id-ID')}`;
  if (totalEl) totalEl.textContent = `Rp ${totalAmount.toLocaleString('id-ID')}`;
  if (padEl) padEl.textContent = `Rp ${padAmount.toLocaleString('id-ID')}`;
}

function quickBuyWhatsApp(id, name, price) {
  const wa = (appConfig.whatsapp_number || '6281234567890').replace(/\D/g, '');
  const bumdesName = appConfig.bumdes_name || 'BUMDes Berkah Mandiri';
  const text = `Halo Admin *${bumdesName}*,\nSaya ingin membeli langsung produk:\n\n*${name}*\nHarga: Rp ${Number(price).toLocaleString('id-ID')}\nJumlah: 1 pcs\n\nMohon info stok dan cara pembayarannya. Terima kasih!`;
  window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank');
}

function openCheckoutModal() {
  if (cart.length === 0) {
    showToast('Keranjang Anda masih kosong!');
    return;
  }
  toggleCartDrawer();
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.add('active');
}

function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModal');
  if (modal) modal.classList.remove('active');
}

async function handleCheckoutSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('orderName').value.trim();
  const phone = document.getElementById('orderPhone').value.trim();
  const address = document.getElementById('orderAddress').value.trim();
  const courier = document.getElementById('orderCourier').value;
  const payment = document.getElementById('orderPayment').value;
  const notes = document.getElementById('orderNotes').value.trim();

  if (!name || !phone || !address) {
    showToast('Harap lengkapi semua data formulir!');
    return;
  }

  const payload = {
    customer_name: name,
    customer_phone: phone,
    customer_address: address,
    courier,
    payment_method: payment,
    items: cart.map(it => ({ id: it.id, qty: it.qty })),
    notes
  };

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      cart = [];
      saveCart();
      updateCartUI();
      closeCheckoutModal();

      if (payment === 'wa') {
        window.open(result.data.whatsapp_link, '_blank');
      } else {
        showInvoiceModal(result.data, payment);
      }
    } else {
      showToast('Gagal membuat pesanan: ' + result.message);
    }
  } catch (err) {
    showToast('Terjadi kesalahan koneksi saat memproses order');
  }
}

function showInvoiceModal(orderData, paymentMethod) {
  const modal = document.getElementById('invoiceModal');
  const body = document.getElementById('invoiceModalBody');
  if (!modal || !body) return;

  const bankName = appConfig.bank_name || 'Bank BRI';
  const bankAcc = appConfig.bank_account || '0123-01-000456-50-8';
  const bankHolder = appConfig.bank_holder || 'BUMDes Berkah Mandiri';

  body.innerHTML = `
    <div style="text-align: center; margin-bottom: 20px;">
      <div style="font-size: 40px; margin-bottom: 8px;">🎉</div>
      <h3 style="font-size: 20px; color: var(--primary-brown-dark); font-weight: 800;">Pesanan Berhasil Dibuat!</h3>
      <p style="font-size: 13px; color: var(--text-muted);">Invoice: <strong>#${orderData.order_code}</strong></p>
    </div>

    <div style="background: var(--cream-bg); border-radius: 10px; padding: 16px; margin-bottom: 20px; font-size: 14px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
        <span>Total Tagihan:</span>
        <strong style="color: var(--primary-brown-dark); font-size: 16px;">Rp ${orderData.total_amount.toLocaleString('id-ID')}</strong>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 12px; color: #2E7D32;">
        <span>Kontribusi PAD Desa:</span>
        <strong>Rp ${orderData.pad_amount.toLocaleString('id-ID')}</strong>
      </div>
    </div>

    ${paymentMethod === 'qris' ? `
      <div style="text-align: center; margin-bottom: 20px;">
        <p style="font-size: 13px; font-weight: 600; margin-bottom: 10px;">Pindai QRIS BUMDes di bawah ini:</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=PASARDESA-${orderData.order_code}-RP-${orderData.total_amount}" style="margin: 0 auto 10px; border: 6px solid #FFF; border-radius: 12px; box-shadow: var(--shadow-sm);" alt="QRIS BUMDes">
        <p style="font-size: 11px; color: var(--text-muted);">Mendukung: BCA, Mandiri, BRI, BNI, GoPay, OVO, Dana, LinkAja, ShopeePay</p>
      </div>
    ` : `
      <div style="background: #FFF; border: 1px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Transfer ke Rekening Resmi BUMDes:</p>
        <div style="font-weight: 700; font-size: 15px; color: var(--primary-brown);">${bankName}</div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin: 8px 0; background: #F8EFEA; padding: 8px 12px; border-radius: 6px;">
          <code style="font-size: 16px; font-weight: bold; color: var(--primary-brown-dark);">${bankAcc}</code>
          <button onclick="navigator.clipboard.writeText('${bankAcc}'); showToast('Nomor rekening disalin!');" style="background: var(--terracotta); color: #FFF; padding: 4px 10px; border-radius: 4px; font-size: 11px;">Salin</button>
        </div>
        <div style="font-size: 12px; color: var(--text-muted);">a.n. <strong>${bankHolder}</strong></div>
      </div>
    `}

    <a href="${orderData.whatsapp_link}" target="_blank" class="btn-primary" style="display: block; text-align: center; text-decoration: none; margin-bottom: 10px;">
      📱 Konfirmasi Bukti Bayar via WhatsApp
    </a>
    <button onclick="closeInvoiceModal()" style="width: 100%; background: #EFE8DE; color: var(--text-dark); padding: 10px; border-radius: var(--radius-sm); font-weight: 600;">
      Selesai & Belanja Lagi
    </button>
  `;

  modal.classList.add('active');
}

function closeInvoiceModal() {
  const modal = document.getElementById('invoiceModal');
  if (modal) modal.classList.remove('active');
}

function showToast(msg) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeString(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
