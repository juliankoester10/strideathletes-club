// cart.js
document.addEventListener('DOMContentLoaded', () => {
  // Config
  let __configCache = null;
  async function getConfig() {
    if (__configCache) return __configCache;
    const r = await fetch('/api/config');
    __configCache = await r.json();
    return __configCache;
  }

  // Produkte (Preis/Name für Anzeige)
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

  // Storefront API
  async function shopifyGraphQL(query, variables = {}) {
    const resp = await fetch('/api/shopify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });
    const text = await resp.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Ungültige JSON-Antwort von /api/shopify'); }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text}`);
    if (data.errors) throw new Error('Shopify GraphQL Fehler: ' + JSON.stringify(data.errors));
    return data.data;
  }

  const CART_KEY = 'shopify:cart';
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

  // Lokaler Warenkorb
  function getLocalCart() { try { return JSON.parse(localStorage.getItem('local:cart') || '[]'); } catch { return []; } }
  function setLocalCart(arr) { localStorage.setItem('local:cart', JSON.stringify(arr || [])); }
  function formatPriceEUR(num) { return `${num} €`; }

  const listEl = document.getElementById('cart-list');
  const totalEl = document.getElementById('cart-total');
  const goCheckout = document.getElementById('go-checkout');
  const barSummary = document.getElementById('cart-bar-summary');
  const barCheckout = document.getElementById('btn-checkout');

  function renderCart() {
    const items = getLocalCart();
    if (!items.length) {
      listEl.innerHTML = `<div class="helper">Dein Warenkorb ist leer.</div>`;
      totalEl.textContent = '0 €';
      if (barSummary) barSummary.textContent = 'Warenkorb: 0 Artikel';
      return;
    }

    listEl.innerHTML = items.map((it, idx) => {
      const p = products.find(x => x.id === it.id);
      if (!p) return '';
      const line = p.price * it.qty;
      return `
        <div class="cart-item" data-idx="${idx}">
          <div class="ci-left">
            <div class="ci-img"><img src="${p.img || 'placeholder.png'}" alt=""></div>
            <div class="ci-meta">
              <div class="ci-name">${p.name}</div>
              <div class="ci-meta2">${p.color} • Größe ${it.size}</div>
              <button class="ci-remove">Entfernen</button>
            </div>
          </div>
          <div class="ci-right">
            <input class="ci-qty" type="number" min="1" value="${it.qty}">
            <div class="ci-line">${formatPriceEUR(line)}</div>
          </div>
        </div>
      `;
    }).join('');

    const total = items.reduce((sum, it) => {
      const p = products.find(x => x.id === it.id);
      return sum + (p ? p.price * it.qty : 0);
    }, 0);
    totalEl.textContent = formatPriceEUR(total);

    const count = items.reduce((a, it) => a + it.qty, 0);
    if (barSummary) barSummary.textContent = `Warenkorb: ${count} Artikel – ${formatPriceEUR(total)}`;
  }

  listEl.addEventListener('click', (e) => {
    const rm = e.target.closest('.ci-remove'); if (!rm) return;
    const row = rm.closest('.cart-item'); if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const items = getLocalCart();
    items.splice(idx, 1);
    setLocalCart(items);
    renderCart();
  });

  listEl.addEventListener('change', (e) => {
    const qty = e.target.closest('.ci-qty'); if (!qty) return;
    const row = qty.closest('.cart-item'); if (!row) return;
    const idx = parseInt(row.dataset.idx, 10);
    const items = getLocalCart();
    const v = Math.max(1, parseInt(qty.value || '1', 10));
    items[idx].qty = v;
    setLocalCart(items);
    renderCart();
  });

  async function goToCheckout() {
    try {
      const local = getLocalCart();
      if (!local.length) { alert('Dein Warenkorb ist leer.'); return; }
      const cartInfo = await ensureShopifyCart();

      // Lines mit Variant-IDs (nur vorhandene)
      const lines = [];
      for (const it of local) {
        const variants = (SHOPIFY_VARIANTS[it.id] || {});
        const vId = variants[it.size] || '';
        if (vId) lines.push({ merchandiseId: vId, quantity: it.qty || 1 });
      }

      if (lines.length) {
        const mutation = `
          mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
            cartLinesAdd(cartId: $cartId, lines: $lines) {
              cart { id totalQuantity webUrl }
              userErrors { field message }
            }
          }`;
        const data = await shopifyGraphQL(mutation, { cartId: cartInfo.id, lines });
        const errs = data?.cartLinesAdd?.userErrors;
        if (errs && errs.length) console.warn('Shopify Fehler:', errs);
      } else {
        console.warn('Keine Variant-IDs hinterlegt – Checkout öffnet leeren Shopify-Warenkorb.');
      }

      const url = cartInfo.webUrl;
      if (!url) { alert('Konnte den Shopify-Checkout nicht öffnen.'); return; }
      location.href = url;
    } catch (e) {
      alert('Checkout aktuell nicht möglich. Details in der Konsole.');
      console.error(e);
    }
  }

  if (goCheckout) goCheckout.addEventListener('click', goToCheckout);
  if (barCheckout) barCheckout.addEventListener('click', goToCheckout);

  renderCart();
});
