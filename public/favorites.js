// favorites.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===== Menü (gleiches Verhalten wie auf anderen Seiten) ===== */
  (function setupMenu(){
    const menu = document.getElementById('mainMenu');
    const btn  = document.getElementById('menuButton');
    const list = document.getElementById('menuList');

    function comingSoon(){ alert('Der Online Shop kommt bald :)'); }

    // Logo klickbar → Hinweis
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
      else if (v === 'shop') comingSoon(); // geändert
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

  /* ===== Favoriten lesen/rendern (unverändert) ===== */
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

  function render() {
    const list = document.getElementById('favorites-list');
    const map = readFavs();
    const clubs = Object.values(map);

    if (!clubs.length) {
      list.innerHTML = '<div class="helper">Du hast noch keine Favoriten gespeichert.</div>';
      return;
    }

    list.innerHTML = clubs.map(c => {
      const sched = (c.schedule||[]).map(s => `${s.day} ${s.time}`).join(' · ') || '—';

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
            <div><small>${sched}</small></div>
            ${c.pace ? `<div><small>Pace: ${escapeHtml(c.pace)}</small></div>` : ''}
            ${c.distance ? `<div><small>Strecke: ${escapeHtml(c.distance)}</small></div>` : ''}
            ${contactLine}
          </div>
          ${aboutCol}
        </div>
      `;
    }).join('');
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
