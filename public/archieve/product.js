// product.js
document.addEventListener('DOMContentLoaded', () => {
  // Config
  let __configCache = null;
  async function getConfig() {
    if (__configCache) return __configCache;
    const r = await fetch('/api/config');
    __configCache = await r.json();
    return __configCache;
  }

  // Produkte (gleich wie in shop.js)
  const products = [
    { id:'ls-black',  type:'long',  name:'Long sleeve shirt',  color:'black',     price:38, img:'placeholder.png' },
    { id:'ls-navy',   type:'long',  name:'Long sleeve shirt',  color:'navy blue', price:38, img:'placeholder.png' },
    { id:'ss-white',  type:'short', name:'Short sleeve shirt', color:'white',     price:34, img:'placeholder.png' },
    { id:'ss-black',  type:'short', name:'Short sleeve shirt', color:'black',     price:34, img:'placeholder.png' },
    { id:'ss-blue',   type:'short', name:'Short sleeve shirt', color:'blue',      price:34, img:'placeholder.png' },
  ];

  // Variant-IDs (pro Größe) – fülle später
  const SHOPIFY_VARIANTS = {
    'ls-black':  { XS:null, S:null, M:null, L:null, XL:null },
    'ls-navy':   { XS:null, S:null, M:null, L:null, XL:null },
    'ss-white':  { XS:null, S:null, M:null, L:null, XL:null },
    'ss-black':  { XS:null, S:null, M:null, L:null, XL:null },
    'ss-blue':   { XS:null, S:null, M:null, L:null, XL:null },
  };

  const params = new URLSearchParams(location.search);
  const pid = params.get('id') || '';
  const product = products.find(p => p.id === pid);

  const mainImg = document.getElementById('p-main');
  const nameEl  = document.getElementById('p-name');
  const colorEl = document.getElementById('p-color');
  const priceEl = document.getElementById('p-price');
  const sizesEl = document.getElementById('p-sizes');
  const qtyEl   = document.getElementById('p-qty');
  const addBtn  = document.getElementById('p-add');
  const checkoutBtn = document.getElementById('btn-checkout');
  const cartSummary = document.getElementById('cart-summary');

  const WHITE_SQUARE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
       <rect width="100%" height="100%" fill="#ffffff"/>
     </svg>`
  );

  function formatPriceEUR(num) { return `${num} €`; }
  function getLocalCart() { try { return JSON.parse(localStorage.getItem('local:cart') || '[]'); } catch { return []; } }
  function setLocalCart(arr) { localStorage.setItem('local:cart', JSON.stringify(arr || [])); }
  function updateCartSummary() {
    const items = getLocalCart().reduce((a, it) => a + (it.qty || 0), 0);
    const total = getLocalCart().reduce((sum, it) => {
      const p = products.find(x => x.id === it.id);
      return sum + (p ? p.price * it.qty : 0);
    }, 0);
    if (cartSummary) cartSummary.textContent = `Warenkorb: ${items} Artikel – ${formatPriceEUR(total)}`;
  }

  if (!product) {
    if (nameEl) nameEl.textContent = 'Produkt nicht gefunden';
    if (addBtn) addBtn.disabled = true;
    return;
  }

  // Render
  if (mainImg) {
    mainImg.src = product.img || 'placeholder.png';
    mainImg.alt = `${product.name} – ${product.color}`;
    mainImg.onerror = () => { mainImg.onerror = null; mainImg.src = WHITE_SQUARE; };
  }
  if (nameEl)  nameEl.textContent = product.name;
  if (colorEl) colorEl.textContent = product.color;
  if (priceEl) priceEl.textContent = formatPriceEUR(product.price);

  // Größen
  const sizes = ['XS','S','M','L','XL'];
  let selectedSize = null;
  sizes.forEach(sz => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'size-btn';
    b.textContent = sz;
    b.addEventListener('click', () => {
      selectedSize = sz;
      sizesEl.querySelectorAll('.size-btn').forEach(x => x.classList.toggle('active', x.textContent === sz));
    });
    sizesEl.appendChild(b);
  });

  // Add to cart (lokal, plus später im Checkout → Storefront-Cart)
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (!selectedSize) { alert('Bitte eine Größe auswählen.'); return; }
      const qty = Math.max(1, parseInt(qtyEl.value || '1', 10));

      const cart = getLocalCart();
      const idx = cart.findIndex(it => it.id === product.id && it.size === selectedSize);
      if (idx >= 0) cart[idx].qty += qty;
      else cart.push({ id: product.id, size: selectedSize, qty });

      setLocalCart(cart);
      updateCartSummary();
      alert('Zum Warenkorb hinzugefügt.');
    });
  }

  // Checkout führt auf Shopify-Checkout (siehe shop.js für Lines)
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', () => { location.href = 'cart.html'; });
  }

  // Warenkorb Icon aus dem Menü erreichst du global über app.js; hier nur Anzeige
  updateCartSummary();
});
