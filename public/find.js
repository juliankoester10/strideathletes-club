// find.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===== Menü ===== */
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

    // A11y
    if (!btn.getAttribute('aria-controls')) btn.setAttribute('aria-controls', 'menuList');

    function goNav(v) {
      if (v === 'home') window.location.href = 'index.html';
      else if (v === 'find') window.location.href = 'find.html';
      else if (v === 'register') window.location.href = 'register.html';
      else if (v === 'favs') window.location.href = 'favorites.html';
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
      menu.classList.remove('pinned'); btn.setAttribute('aria-expanded','false');
      btn.focus();
    });

    document.addEventListener('click', (e) => {
      if (menu.classList.contains('pinned') && !menu.contains(e.target)) {
        menu.classList.remove('pinned'); btn.setAttribute('aria-expanded','false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('pinned')) {
        menu.classList.remove('pinned'); btn.setAttribute('aria-expanded','false');
        btn.focus();
      }
    });
  })();

  /* ===== DOM ===== */
  const inpPlzCity = document.getElementById('filter-plzcity');
  const sugList    = document.getElementById('plzcity-suggestions');
  const inpName    = document.getElementById('filter-name');

  const weekdayDropdown = document.getElementById('weekdayDropdown');
  const weekdayBtn      = document.getElementById('weekdayButton');
  const weekdayLabel    = document.getElementById('weekdayLabel');
  const weekdayList     = document.getElementById('weekdayList');
  let selectedWeekday   = '';

  const timeFrom = document.getElementById('time-from');
  const timeTo   = document.getElementById('time-to');
  const inpDist  = document.getElementById('filter-distance');
  const inpPace  = document.getElementById('filter-pace');
  const btnSearch= document.getElementById('btn-search');

  /* ===== Map ===== */
  const map = L.map('map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; OpenStreetMap'
  }).addTo(map);
  let markers = [];
  const clearMarkers = () => { markers.forEach(m=>map.removeLayer(m)); markers = []; };

  /* ===== Daten laden ===== */
  let allClubs = [];
  fetch('/api/clubs')
    .then(r => r.json())
    .then(rows => {
      allClubs = normalizeClubs(rows || []);
      buildPlzCityIndex(allClubs);
      render(allClubs);          // initial: alle anzeigen
    })
    .catch(err => console.error('clubs load failed', err));

  /* ===== Normalisierung … (unverändert) ===== */
  function normalizeClubs(rows) {
    return rows.map(r => {
      const name     = norm(pick(r, 'name','Name','Run Club','Clubname'));
      const plzcity  = norm(pick(r, 'plzcity','PLZ/Stadt','PLZ Stadt','PLZ, Stadt','Ort (PLZ/Stadt)'));
      const meeting  = norm(pick(r, 'meeting','Treffpunkt','Ort','Standort des Treffpunkts'));
      const datetime = norm(pick(r, 'datetime','Datum/Zeit','Tage/Uhrzeiten','Tage / Uhrzeiten','Schedule'));
      const distance = norm(pick(r, 'distance','Strecke'));
      const pace     = norm(pick(r, 'pace','Pace'));
      const about  = norm(pick(r, 'about','Über uns','Ueber uns','Über Uns','Beschreibung','About'));
      const igwRaw = norm(pick(r, 'instagram','Instagram','Instagram/Website','Instagram / Website','Website','Webseite'));
      const key = makeClubKey(name, plzcity, meeting);

      let contactLabel = '', contactHref = '', contactText = '';
      if (igwRaw) {
        const raw = igwRaw.trim();
        const lower = raw.toLowerCase();

        const isHttp = /^https?:\/\//i.test(raw);
        const isInstagramUrl = lower.includes('instagram.com');
        const isHandleLike = raw.startsWith('@');

        const hasWhitelistedTld = /\.(com|de|org)(?:[\/?#]|$)/i.test(raw) ||
                                  /(?:^|\/\/|www\.)[\w-]+\.(com|de|org)(?:[\/?#]|$)/i.test(raw);

        const treatAsWebsite = (isHttp && !isInstagramUrl) || (!isHttp && hasWhitelistedTld);

        if (!treatAsWebsite) {
          contactLabel = 'Instagram';
          if (isHttp) {
            contactHref = raw;
          } else {
            const handle = raw.replace(/^@/, '').trim();
            contactHref = handle ? `https://instagram.com/${encodeURIComponent(handle)}` : '';
          }
          contactText = raw;
        } else {
          contactLabel = 'Website';
          contactHref  = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
          contactText  = raw;
        }
      }

      const schedule = datetime
        ? datetime.split(';').map(s => s.trim()).filter(Boolean).map(s => {
            const m = s.match(/^([A-Za-zÄÖÜäöüß]+)\s+(\d{1,2}:\d{2})$/);
            return m ? { day: m[1], time: m[2] } : null;
          }).filter(Boolean)
        : [];

      let paceMin = null, paceMax = null;
      if (pace) {
        const pm = pace.match(/^(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?$/);
        if (pm) {
          paceMin = (+pm[1])*60 + (+pm[2]);
          paceMax = pm[3] ? (+pm[3])*60 + (+pm[4]) : paceMin;
          if (paceMax < paceMin) [paceMin, paceMax] = [paceMax, paceMin];
        }
      }

      let distMin = null, distMax = null;
      if (distance) {
        const d1 = distance.match(/^\s*(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*km/i);
        const d2 = distance.match(/^\s*Ab\s+(\d+(?:[.,]\d+)?)\s*km/i);
        const d3 = distance.match(/^\s*(\d+(?:[.,]\d+)?)\s*km/i);
        if (d1) { distMin = parseFloat(d1[1].replace(',','.')); distMax = parseFloat(d1[2].replace(',','.')); }
        else if (d2) { distMin = parseFloat(d2[1].replace(',','.')); distMax = Infinity; }
        else if (d3) { distMin = parseFloat(d3[1].replace(',','.')); distMax = parseFloat(d3[1].replace(',','.')); }
      }
      return {
        ...r,
        key,
        name, plzcity, meeting, schedule, distance, pace,
        paceMin, paceMax, distMin, distMax,
        about,
        contactLabel, contactHref, contactText
      };
    });
  }
  const norm = (s)=> (s||'').toString().trim();
  function pick(obj, ...candidates) {
    if (!obj) return undefined;
    for (const c of candidates) if (c in obj) return obj[c];
    const keys = Object.keys(obj);
    for (const c of candidates) {
      const k = keys.find(k => k.toLowerCase() === String(c).toLowerCase());
      if (k) return obj[k];
    }
    const normKey = s => String(s).toLowerCase().replace(/[\s/_-]+/g,'').replace(/[()]/g,'');
    const map = new Map(keys.map(k => [normKey(k), k]));
    for (const c of candidates) {
      const k = map.get(normKey(c));
      if (k) return obj[k];
    }
    return undefined;
  }
  function slug(s) {
    return String(s||'')
      .toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function makeClubKey(name, plzcity, meeting) {
    return [name, plzcity, meeting].map(slug).filter(Boolean).join('__');
  }

  function splitPlzCity(plzcityRaw) {
    const s = String(plzcityRaw || '').replace(',', ' ').replace(/\s+/g,' ').trim();
    const m = s.match(/\b(\d{5})\b/);
    const postalCode = m ? m[1] : '';
    let city = s;
    if (postalCode) city = city.replace(new RegExp(`\\b${postalCode}\\b[,]?\\s*`), '').trim();
    return { postalCode, city };
  }
  function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  /* ===== Vorschläge Stadt/PLZ ===== */
  let plzCityIndex = [];
  function buildPlzCityIndex(clubs) {
    const set = new Set();
    clubs.forEach(c => { if (c.plzcity) set.add(c.plzcity); });
    plzCityIndex = Array.from(set).sort();
  }

  function showSuggestions(q) {
    if (!sugList) return;
    q = (q || '').trim();
    if (!q) { sugList.hidden = true; sugList.innerHTML = ''; return; }
    const ql = q.toLowerCase();
    const items = plzCityIndex.filter(s => s.toLowerCase().includes(ql)).slice(0, 8);
    if (items.length === 0) { sugList.hidden = true; sugList.innerHTML = ''; return; }
    sugList.innerHTML = items.map(s => `<li class="suggest-item" role="option" tabindex="0">${s}</li>`).join('');
    sugList.hidden = false;
  }

  if (inpPlzCity && sugList) {
    inpPlzCity.addEventListener('input', () => showSuggestions(inpPlzCity.value));
    inpPlzCity.addEventListener('focus', () => showSuggestions(inpPlzCity.value));
    document.addEventListener('click', (e) => {
      if (!sugList.contains(e.target) && e.target !== inpPlzCity) { sugList.hidden = true; }
    });
    sugList.addEventListener('click', (e) => {
      const li = e.target.closest('.suggest-item'); if (!li) return;
      inpPlzCity.value = li.textContent; sugList.hidden = true;
    });
    sugList.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const li = e.target.closest('.suggest-item'); if (!li) return;
        inpPlzCity.value = li.textContent; sugList.hidden = true; inpPlzCity.focus();
      }
    });
  }

  /* ===== Wochentag-Dropdown (hover + klick) ===== */
  if (weekdayDropdown && weekdayBtn && weekdayList) {
    const open = (pin=false) => { weekdayDropdown.classList.toggle('pinned', pin); weekdayBtn.setAttribute('aria-expanded', String(pin)); };
    weekdayBtn.addEventListener('click', (e) => { e.stopPropagation(); open(!weekdayDropdown.classList.contains('pinned')); });
    weekdayList.querySelectorAll('.menu-item').forEach(b=>{
      b.addEventListener('click', ()=> {
        selectedWeekday = b.dataset.day || '';
        weekdayLabel.textContent = selectedWeekday || 'Alle';
        open(false);
      });
    });
    document.addEventListener('click', (e) => { if (!weekdayDropdown.contains(e.target)) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  /* ===== Filtern / Render / Geocoding … (unverändert) ===== */
  const toMin  = (s)=> { const m = /^(\d{1,2}):(\d{2})$/.exec(s||''); return m ? (+m[1])*60+(+m[2]) : null; };

  function matchesFilters(c) {
    const qpc = (inpPlzCity.value || '').trim().toLowerCase();
    if (qpc && !(c.plzcity || '').toLowerCase().includes(qpc)) return false;

    const qn = (inpName.value || '').trim().toLowerCase();
    if (qn && !(c.name || '').toLowerCase().includes(qn)) return false;

    if (selectedWeekday) {
      if (!c.schedule || !c.schedule.some(s => (s.day || '').toLowerCase() === selectedWeekday.toLowerCase())) {
        return false;
      }
    }

    const fromM = toMin(timeFrom.value);
    const toM   = toMin(timeTo.value);
    if (fromM != null && toM != null) {
      const times = (c.schedule || [])
        .filter(s => !selectedWeekday || (s.day||'').toLowerCase() === selectedWeekday.toLowerCase())
        .map(s => toMin(s.time))
        .filter(v => v != null);
      if (times.length > 0 && !times.some(t => fromM <= t && t <= toM)) return false;
    }

    const wantKm = parseFloat((inpDist.value || '').replace(',','.'));
    if (!isNaN(wantKm) && c.distMin != null && c.distMax != null) {
      if (!(c.distMin <= wantKm && wantKm <= c.distMax)) return false;
    }

    const wantPace = toMin(inpPace.value);
    if (wantPace != null && c.paceMin != null && c.paceMax != null) {
      if (!(c.paceMin <= wantPace && c.paceMax >= wantPace)) return false;
    }

    return true;
  }

  function applyFilters() {
    render(allClubs.filter(matchesFilters));
  }
  btnSearch?.addEventListener('click', (e)=>{ e.preventDefault(); applyFilters(); });

  [inpPlzCity, inpName, timeFrom, timeTo, inpDist, inpPace].forEach(el=>{
    if (!el) return;
    el.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }});
  });

  function render(clubs) {
    const list = document.getElementById('clubs-list');
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
        <button
          class="fav-btn ${isFavorite(c.key) ? 'active' : ''}"
          aria-pressed="${isFavorite(c.key)}"
          data-key="${escapeAttr(c.key)}"
          title="${isFavorite(c.key) ? 'Aus meinen Favoriten entfernen' : 'Zu meinen Favoriten hinzufügen'}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-6.716-4.36-9.053-7.38C1.02 11.28 1.4 8.7 3.2 7.2 4.9 5.8 7.3 5.9 9 7.4L12 10l3-2.6c1.7-1.5 4.1-1.6 5.8.0 1.8 1.5 2.2 4.1.25 6.4C18.716 16.64 12 21 12 21z" fill="currentColor"/>
          </svg>
        </button>
        <div class="fav-tip">${isFavorite(c.key) ? 'Aus meinen Favoriten entfernen' : 'Zu meinen Favoriten hinzufügen'}</div>
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
    }).join('') || '<div class="helper">Keine Clubs gefunden.</div>';

    clearMarkers();
    if (clubs.length === 0) return;

    const bounds = L.latLngBounds();
    const queue = clubs.slice();
    const MAX = 3;
    let active = 0;

    const runNext = () => {
      while (active < MAX && queue.length) {
        const c = queue.shift();
        active++;
        geocodeClub(c).then(pt => {
          if (pt) {
            const m = L.marker(pt).addTo(map)
              .bindPopup(`<strong>${escapeHtml(c.name)}</strong><br>${escapeHtml(c.meeting||'')}<br>${escapeHtml(c.plzcity||'')}`);
            m.on('click', () => {
              const targetZoom = Math.max(map.getZoom(), 14);
              map.setView(pt, targetZoom, { animate: true });
            });
            markers.push(m);
            bounds.extend(pt);
          }
        }).finally(() => {
          active--;
          if (queue.length) runNext();
          else if (active === 0 && bounds.isValid()) map.fitBounds(bounds.pad(0.2));
        });
      }
    };
    runNext();
  }

  document.getElementById('clubs-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.fav-btn'); if (!btn) return;
    const key = btn.dataset.key;
    const club = allClubs.find(c => c.key === key);
    if (!club) return;

    if (isFavorite(key)) removeFavorite(key); else addFavorite(club);

    const active = isFavorite(key);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
    btn.title = active ? 'Aus meinen Favoriten entfernen' : 'Zu meinen Favoriten hinzufügen';

    const tip = btn.parentElement.querySelector('.fav-tip');
    if (tip) tip.textContent = active ? 'Aus meinen Favoriten entfernen' : 'Zu meinen Favoriten hinzufügen';
  });

  // Geocoding (wie gehabt)
  async function geocodeClub(c) {
    const { postalCode, city } = splitPlzCity(c.plzcity);
    const meeting = (c.meeting || '').trim();

    const keyParts = [
      meeting && `meet=${meeting}`,
      postalCode && `plz=${postalCode}`,
      city && `city=${city}`
    ].filter(Boolean);
    const key = 'geo:' + keyParts.join('|').toLowerCase();

    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        const p = JSON.parse(cached);
        if (p && typeof p.lat === 'number' && typeof p.lng === 'number') return [p.lat, p.lng];
      } catch {}
    }

    const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de';
    const urls = [];

    if (meeting && postalCode && city) {
      urls.push(`${base}&street=${encodeURIComponent(meeting)}&postalcode=${encodeURIComponent(postalCode)}&city=${encodeURIComponent(city)}&country=${encodeURIComponent('Germany')}`);
    }
    if (meeting && city) {
      urls.push(`${base}&street=${encodeURIComponent(meeting)}&city=${encodeURIComponent(city)}&country=${encodeURIComponent('Germany')}`);
    }
    if (meeting && c.plzcity) {
      urls.push(`${base}&q=${encodeURIComponent(`${meeting}, ${c.plzcity}, Germany`)}`);
    }
    if (c.plzcity) {
      urls.push(`${base}&q=${encodeURIComponent(`${c.plzcity}, Germany`)}`);
    }

    for (const url of urls) {
      try {
        const r = await fetch(url, { headers: { 'Accept': 'application/json', 'Accept-Language': 'de' }});
        const data = await r.json();
        if (Array.isArray(data) && data[0]) {
          const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          if (isFinite(lat) && isFinite(lng)) {
            localStorage.setItem(key, JSON.stringify({ lat, lng }));
            return [lat, lng];
          }
        }
      } catch {}
    }

    console.warn('Geocoding fehlgeschlagen:', { name: c.name, meeting, plzcity: c.plzcity });
    return null;
  }

  // Favoriten-Storage
  const FAV_KEY = 'favorites:v1';
  function readFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; } catch { return {}; } }
  function writeFavs(obj) { localStorage.setItem(FAV_KEY, JSON.stringify(obj)); }
  function isFavorite(key) { const map = readFavs(); return !!map[key]; }
  function addFavorite(club) { const map = readFavs(); map[club.key] = club; writeFavs(map); }
  function removeFavorite(key) { const map = readFavs(); delete map[key]; writeFavs(map); }
});
