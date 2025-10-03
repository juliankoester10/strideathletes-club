// favorites.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===== Menü ===== */
  (function setupMenu(){
    const menu = document.getElementById('mainMenu');
    const btn  = document.getElementById('menuButton');
    const list = document.getElementById('menuList');

    function comingSoon(){ alert('Der Online Shop kommt bald :)'); }

    const brandLogo = document.getElementById('brand-logo');
    if (brandLogo) {
      brandLogo.style.cursor = 'pointer';
      brandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        comingSoon();
      });
    }

    if (!menu || !btn || !list) return;

    if (!btn.getAttribute('aria-controls')) btn.setAttribute('aria-controls', 'menuList');

    function goNav(v) {
      if (v === 'home') location.href = 'index.html';
      else if (v === 'find') location.href = 'find.html';
      else if (v === 'register') location.href = 'register.html';
      else if (v === 'favs') location.href = 'favorites.html';
      else if (v === 'shop') comingSoon();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pinned = menu.classList.toggle('pinned');
      btn.setAttribute('aria-expanded', String(pinned));
      if (pinned) list.querySelector('.menu-item')?.focus();
    });
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item'); if (!item) return;
      e.stopPropagation(); goNav(item.dataset.nav);
      menu.classList.remove('pinned'); btn.setAttribute('aria-expanded','false'); btn.focus();
    });
    document.addEventListener('click', (e) => {
      if (menu.classList.contains('pinned') && !menu.contains(e.target)) {
        menu.classList.remove('pinned'); btn.setAttribute('aria-expanded','false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('pinned')) {
        menu.classList.remove('pinned'); btn.setAttribute('aria-expanded','false'); btn.focus();
      }
    });
  })();

  /* ===== Favoriten lesen/rendern ===== */
  const FAV_KEY = 'favorites:v1';
  function readFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; }
    catch { return {}; }
  }
  function writeFavs(obj) { localStorage.setItem(FAV_KEY, JSON.stringify(obj)); }
  function isFavorite(key) { const map = readFavs(); return !!map[key]; }
  function removeFavorite(key) { const map = readFavs(); delete map[key]; writeFavs(map); }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

  function scheduleTableHtml(schedule) {
    if (!schedule || schedule.length === 0) return '<div><small>—</small></div>';
    const head = `
      <div class="schedule-table">
        <div class="head">Tag</div>
        <div class="head">Uhrzeit</div>
        <div class="head">Pace</div>
        <div class="head">Strecke</div>
        ${schedule.map(s=>`
          <div class="row"></div>
          <div>${escapeHtml(s.day || '')}</div>
          <div>${escapeHtml(s.time || '')}</div>
          <div class="${s.paceText?'':'muted'}">${escapeHtml(s.paceText || '–')}</div>
          <div class="${s.distanceText?'':'muted'}">${escapeHtml(s.distanceText || '–')}</div>
        `).join('')}
      </div>
    `;
    return head;
  }

  function render() {
    const list = document.getElementById('favorites-list');
    const mapObj = readFavs();
    const clubs = Object.values(mapObj);

    if (!clubs.length) {
      list.innerHTML = '<div class="helper">Du hast noch keine Favoriten gespeichert.</div>';
      return;
    }

    list.innerHTML = clubs.map(c => {
      const contactLine = (c.contactLabel && c.contactText)
        ? `<div><small>${c.contactLabel}: ${
            c.contactHref
              ? `<a href="${escapeAttr(c.contactHref)}" target="_blank" rel="noopener">${escapeHtml(c.contactText)}</a>`
              : escapeHtml(c.contactText)
          }</small></div>`
        : '';

      const aboutCol = c.about
        ? `<div class="club-about">
             <strong>Über uns:</strong>
             <div>${escapeHtml(c.about)}</div>
           </div>`
        : '';

      return `
        <div class="club-card">
          <div class="club-main">
            <div class="fav-wrap">
              <button class="fav-btn active" aria-pressed="true" data-key="${escapeAttr(c.key)}" title="Aus meinen Favoriten entfernen">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21s-6.716-4.36-9.053-7.38C1.02 11.28 1.4 8.7 3.2 7.2 4.9 5.8 7.3 5.9 9 7.4L12 10l3-2.6c1.7-1.5 4.1-1.6 5.8.0 1.8 1.5 2.2 4.1.25 6.4C18.716 16.64 12 21 12 21z" fill="currentColor"/>
                </svg>
              </button>
              <div class="fav-tip">Aus meinen Favoriten entfernen</div>
            </div>

            <strong>${escapeHtml(c.name || 'Unbenannt')}</strong>
            <div>${escapeHtml(c.plzcity || '')}</div>
            <div>${escapeHtml(c.meeting || '')}</div>

            ${scheduleTableHtml(c.schedule)}
            ${contactLine}
          </div>
          ${aboutCol}
        </div>
      `;
    }).join('');

    // Karte rechts mit nur Favoriten
    renderMap(clubs);
  }

  /* ===== Karte rechts nur mit Favoriten ===== */
  let mapInst = null;
  let markers = [];
  function clearMarkers() { markers.forEach(m => mapInst.removeLayer(m)); markers = []; }

  async function geocode(plzcity, meeting) {
    const s = [meeting, plzcity].filter(Boolean).join(', ');
    const key = 'geo:fav:' + s.toLowerCase();
    const cached = localStorage.getItem(key);
    if (cached) {
      try { const p = JSON.parse(cached); if (p && typeof p.lat==='number' && typeof p.lng==='number') return [p.lat,p.lng]; } catch {}
    }
    const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de';
    const url  = `${base}&q=${encodeURIComponent(s + ', Germany')}`;
    try {
      const r = await fetch(url, { headers: { 'Accept':'application/json','Accept-Language':'de' }});
      const data = await r.json();
      if (Array.isArray(data) && data[0]) {
        const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
        if (isFinite(lat) && isFinite(lng)) {
          localStorage.setItem(key, JSON.stringify({lat,lng}));
          return [lat,lng];
        }
      }
    } catch {}
    return null;
  }

  async function renderMap(clubs) {
  const mapEl = document.getElementById('fav-map');
  if (!mapEl) return;

  // Map einmalig anlegen
  if (!mapInst) {
    mapInst = L.map('fav-map', { zoomControl: true }).setView([51.1657, 10.4515], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:'&copy; OpenStreetMap'
    }).addTo(mapInst);

    // WICHTIG: nach Layout/Resize sicherstellen, dass Leaflet die Größe kennt
    setTimeout(() => mapInst.invalidateSize(), 0);
    window.addEventListener('resize', () => mapInst && mapInst.invalidateSize());
  }

  clearMarkers();
  if (!clubs.length) return;

  // Geocodes parallel laden
  const pts = await Promise.all(clubs.map(async (c) => ({
    club: c,
    pt: await geocode(c.plzcity, c.meeting) // [lat,lng] oder null
  })));

  const bounds = L.latLngBounds();
  for (const { club: c, pt } of pts) {
    if (!pt) continue;
    // robustes Icon (falls Standardicons mal nicht laden): CircleMarker
    const m = L.circleMarker(pt, { radius: 7, weight: 2, opacity: 1, fillOpacity: 0.9 })
      .addTo(mapInst)
      .bindPopup(`<strong>${escapeHtml(c.name)}</strong><br>${escapeHtml(c.meeting||'')}<br>${escapeHtml(c.plzcity||'')}`);
    markers.push(m);
    bounds.extend(pt);
  }

  if (bounds.isValid()) {
    mapInst.fitBounds(bounds.pad(0.2));
    // nach FitBounds erneut sicherstellen
    setTimeout(() => mapInst.invalidateSize(), 0);
  }
}

  document.getElementById('favorites-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.fav-btn'); if (!btn) return;
    const key = btn.dataset.key;
    if (!isFavorite(key)) return;
    removeFavorite(key);
    render();
  });

  render();
});
