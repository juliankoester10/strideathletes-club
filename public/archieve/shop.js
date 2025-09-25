// shop.js
document.addEventListener('DOMContentLoaded', () => {
  // ========== Helpers: Config + Auth-Flag ==========
  let __configCache = null;
  async function getConfig() {
    if (__configCache) return __configCache;
    const r = await fetch('/api/config');
    const data = await r.json();
    __configCache = data || {};
    return __configCache;
  }

  function isSignedIn() {
    return localStorage.getItem('auth:signedIn') === '1';
  }
  function setSignedIn(v) {
    localStorage.setItem('auth:signedIn', v ? '1' : '0');
  }

  function consumeAuthFlagFromUrl() {
    const url = new URL(window.location.href);
    if (url.searchParams.get('auth') === 'ok') {
      setSignedIn(true);
      url.searchParams.delete('auth');
      window.history.replaceState({}, '', url.toString());
    }
  }
  consumeAuthFlagFromUrl();

  // ========== Login / Logout / Orders ==========
  async function goLogin() {
    try {
      const { shopUrl } = await getConfig();
      if (!shopUrl) { alert('Shop-URL nicht konfiguriert.'); return; }
      const returnUrl = encodeURIComponent(`${window.location.origin}/shop.html?auth=ok`);
      // Klassisches Konto mit return_url
      window.location.href = `${shopUrl}/account/login?return_url=${returnUrl}`;
    } catch (e) {
      console.error(e);
      alert('Konnte die Shop-URL nicht laden.');
    }
  }

  async function goOrders() {
    try {
      const { shopUrl } = await getConfig();
      if (!shopUrl) { alert('Shop-URL nicht konfiguriert.'); return; }
      window.location.href = `${shopUrl}/account`;
    } catch (e) {
      console.error(e);
      alert('Konnte die Shop-URL nicht laden.');
    }
  }

  async function goLogout() {
    try {
      const { shopUrl } = await getConfig();
      if (!shopUrl) { alert('Shop-URL nicht konfiguriert.'); return; }
      const confirmed = confirm('Möchtest du dich wirklich abmelden?');
      if (!confirmed) return;
      setSignedIn(false);
      const returnUrl = encodeURIComponent(`${window.location.origin}/shop.html`);
      window.location.href = `${shopUrl}/account/logout?return_url=${returnUrl}`;
    } catch (e) {
      console.error(e);
      alert('Konnte die Shop-URL nicht laden.');
    }
  }

  function applyAuthUI() {
    const btnLogin  = document.getElementById('btn-login');
    const btnLogout = document.getElementById('btn-logout');
    const btnOrders = document.getElementById('btn-orders');

    const menuLogin  = document.getElementById('menu-login');
    const menuLogout = document.getElementById('menu-logout');
    const menuOrders = document.getElementById('menu-orders');

    const signed = isSignedIn();

    if (btnLogin)  btnLogin.style.display  = signed ? 'none' : 'inline-flex';
    if (btnLogout) btnLogout.style.display = signed ? 'inline-flex' : 'none';
    if (btnOrders) btnOrders.style.display = signed ? 'inline-flex' : 'none';

    if (menuLogin)  menuLogin.style.display  = signed ? 'none' : 'block';
    if (menuLogout) menuLogout.style.display = signed ? 'block' : 'none';
    if (menuOrders) menuOrders.style.display = signed ? 'block' : 'none';
  }

  // Header-Icons
  document.getElementById('btn-login')?.addEventListener('click', goLogin);
  document.getElementById('btn-orders')?.addEventListener('click', goOrders);
  document.getElementById('btn-logout')?.addEventListener('click', goLogout);

  // Menüeinträge
  document.getElementById('menuList')?.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    const nav = item.dataset.nav;
    if (nav === 'login')   goLogin();
    if (nav === 'orders')  goOrders();
    if (nav === 'logout')  goLogout();
    if (nav === 'cart')    openCartWebUrl();
  });

  // ========== Produktlisten ==========
  const cartSummary = document.getElementById('cart-summary');
  const checkoutBtn = document.getElementById('btn-checkout');

  // Weißes Fallbackbild
  const WHITE_SQUARE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
       <rect width="100%" height="100%" fill="#ffffff"/>
     </svg>`
  );

  // Platzhalter-Produkte (Dummy)
  const products = [
    { id:'ls-black',  type:'long',  name:'Long sleeve shirt',  color:'black',     price:38, img:'placeholder.png' },
    { id:'ls-navy',   type:'long',  name:'Long sleeve shirt',  color:'navy blue', price:38, img:'placeholder.png' },
    { id:'ss-white',  type:'short', name:'Short sleeve shirt', color:'white',     price:34, img:'placeholder.png' },
    { id:'ss-black',  type:'short', name:'Short sleeve shirt', color:'black',     price:34, img:'placeholder.png' },
    { id:'ss-blue',   type:'short', name:'Short sleeve shirt', color:'blue',      price:34, img:'placeholder.png' },
  ];

  // Mapping Platzhalter -> echte Shopify Variant IDs (wenn vorhanden)
  // ➜ Sobald du echte Varianten hast:
  //    1) Shopify Admin → Produkte → Variante öffnen → "gid://shopify/ProductVariant/123456..." kopieren
  //    2) Hier eintragen. Danach funktionieren Cart/Checkout echt.
  const SHOPIFY_VARIANTS = {
    'ls-black':  null,
    'ls-navy':   null,
    'ss-white':  null,
    'ss-black':  null,
    'ss-blue':   null,
  };

  // Shopify GraphQL via Proxy
  async function shopifyGraphQL(query, variables = {}) {
    const resp = await fetch('/api/shopify', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ query, variables })
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('Ungültige JSON-Antwort von /api/shopify'); }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);
    if (data.errors) throw new Error('Shopify GraphQL Fehler: ' + JSON.stringify(data.errors));
    return data.data;
  }

  const CART_KEY = 'shopify:cart'; // {id, webUrl}
  function readShopifyCart() { try { return JSON.parse(localStorage.getItem(CART_KEY)) || null; } catch { return null; } }
  function writeShopifyCart(obj) { localStorage.setItem(CART_KEY, JSON.stringify(obj)); }

  async function ensureShopifyCart() {
    const existing = readShopifyCart();
    if (existing?.id && existing?.webUrl) return existing;

    const mutation = `
      mutation CartCreate($input: CartInput) {
        cartCreate(input: $input) {
          cart { id webUrl }
          userErrors { field message }
        }
      }`;
    const data = await shopifyGraphQL(mutation, { input: {} });
    const out = data?.cartCreate?.cart;
    if (!out?.id || !out?.webUrl) throw new Error('Konnte Shopify Cart nicht erstellen');
    writeShopifyCart(out);
    return out;
  }

  async function fetchCartWebUrl(cartId) {
    const query = `
      query GetCart($id: ID!) {
        cart(id: $id) { id webUrl }
      }`;
    const data = await shopifyGraphQL(query, { id: cartId });
    return data?.cart?.webUrl || null;
  }

  async function addLineToShopifyCart(variantId, quantity = 1) {
    if (!variantId) return false;
    const cart = await ensureShopifyCart();
    const mutation = `
      mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { id totalQuantity }
          userErrors { field message }
        }
      }`;
    const data = await shopifyGraphQL(mutation, { cartId: cart.id, lines: [{ merchandiseId: variantId, quantity }] });
    const errs = data?.cartLinesAdd?.userErrors;
    if (errs && errs.length) throw new Error('Shopify Fehler: ' + JSON.stringify(errs));
    return true;
  }

  async function openCartWebUrl() {
    const info = readShopifyCart();
    if (!info?.id) { alert('Warenkorb ist leer oder nicht erstellt.'); return; }
    const url = info.webUrl || await fetchCartWebUrl(info.id);
    if (url) window.location.href = url; else alert('Konnte den Shopify-Warenkorb nicht öffnen.');
  }

  // ===== Warenkorb (lokaler Zähler nur für Anzeige) =====
  const cart = {
    items: {}, // {productId: qty}
    async add(id) {
      // HINWEIS: Auf der Startseite legen wir NICHT mehr direkt in den Warenkorb.
      // Stattdessen führen Produktklicks zur Produktseite (später).
      // Diese Methode bleibt für Vollständigkeit.
      this.items[id] = (this.items[id] || 0) + 1;
      updateCartSummary();

      const variantId = SHOPIFY_VARIANTS[id];
      if (!variantId) return; // ohne echte Variante keine Shopify-Aktion
      try { await addLineToShopifyCart(variantId, 1); }
      catch (e) { console.warn('Shopify add failed:', e?.message || e); }
    },
    count() { return Object.values(this.items).reduce((a,b) => a + b, 0); },
    total() {
      return Object.entries(this.items).reduce((sum, [id, qty]) => {
        const p = products.find(x => x.id === id);
        return sum + (p ? p.price * qty : 0);
      }, 0);
    }
  };

  function formatPriceEUR(num) { return `${num} €`; }
  function updateCartSummary() {
    if (!cartSummary) return;
    const items = cart.count();
    cartSummary.textContent = `Warenkorb: ${items} Artikel – ${formatPriceEUR(cart.total())}`;
  }

  // ===== Produktkarten (Startseite: nur Navigation, kein Add-to-Cart) =====
  function renderCard(p) {
    const el = document.createElement('article');
    el.className = 'shop-card';
    el.setAttribute('data-id', p.id);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `${p.name} – ${p.color} öffnen`);

    el.innerHTML = `
      <div class="img">
        <img src="${p.img || 'placeholder.png'}"
             alt="${p.name} – ${p.color}"
             loading="lazy"
             onerror="this.onerror=null; this.src='${WHITE_SQUARE}'">
      </div>
      <div class="meta">
        <div class="shop-name">${p.name}</div>
        <div class="shop-color">${p.color}</div>
        <div class="shop-price">${formatPriceEUR(p.price)}</div>
      </div>
    `;
    return el;
  }

  function openProductPage(id) {
    // Später: eigene Produktseite (product.html?id=...)
    // Für jetzt: Dummy-Detailseite noch nicht implementiert.
    // Wenn du willst, sag Bescheid – dann liefere ich product.html + product.js komplett.
    alert('Produktdetailseite folgt. (Wir können sie sofort hinzufügen – sag Bescheid!)');
  }

  function handleCardActivate(target){
    const card = target.closest('.shop-card');
    if (!card) return;
    const id = card.getAttribute('data-id');
    if (!id) return;
    openProductPage(id);
  }

  function renderRows(){
    const longWrap   = document.getElementById('shop-long');
    const shortWrapA = document.getElementById('shop-short-a');
    const shortWrapB = document.getElementById('shop-short-b');
    if (!longWrap || !shortWrapA || !shortWrapB) return;

    longWrap.innerHTML   = '';
    shortWrapA.innerHTML = '';
    shortWrapB.innerHTML  = '';

    // 2 Longsleeves oben
    products.filter(p => p.type === 'long').forEach(p => longWrap.appendChild(renderCard(p)));

    // 2 Shorts in der Mitte
    const shorts = products.filter(p => p.type === 'short');
    shorts.slice(0, 2).forEach(p => shortWrapA.appendChild(renderCard(p)));

    // 1 Short unten
    if (shorts[2]) shortWrapB.appendChild(renderCard(shorts[2]));
  }
  renderRows();

  document.getElementById('shop-long')?.addEventListener('click', (e) => handleCardActivate(e.target));
  document.getElementById('shop-short-a')?.addEventListener('click', (e) => handleCardActivate(e.target));
  document.getElementById('shop-short-b')?.addEventListener('click', (e) => handleCardActivate(e.target));

  const rows = document.querySelector('.shop-rows');
  rows?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleCardActivate(e.target);
      if (e.key === ' ') e.preventDefault();
    }
  });

  // Checkout öffnet Shopify-Cart (nur mit echten Varianten sinnvoll)
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', async () => {
      try {
        const cartInfo = readShopifyCart();
        if (!cartInfo?.id) {
          alert('Es liegen noch keine echten Shopify-Artikel im Warenkorb.');
          return;
        }
        const url = cartInfo.webUrl || await fetchCartWebUrl(cartInfo.id);
        if (!url) { alert('Konnte den Shopify-Checkout-Link nicht ermitteln.'); return; }
        window.location.href = url;
      } catch (e) {
        console.error(e);
        alert('Checkout aktuell nicht möglich. Siehe Konsole.');
      }
    });
  }

  // Warenkorb-Icon öffnet Shopify-Cart
  document.getElementById('btn-cart')?.addEventListener('click', openCartWebUrl);

  updateCartSummary();
  applyAuthUI();
});
