// find.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===== Menü ===== */
  (function setupMenu(){
    const menu = document.getElementById('mainMenu');
    const btn  = document.getElementById('menuButton');
    const list = document.getElementById('menuList');
    // Logo klickbar → Shop
    const brandLogo = document.getElementById('brand-logo');
    if (brandLogo) {
      brandLogo.style.cursor = 'pointer';
      brandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = 'shop.html';
      });
    }

    if (!menu || !btn || !list) return;

    if (!btn.getAttribute('aria-controls')) btn.setAttribute('aria-controls', 'menuList');

    function goNav(v) {
      if (v === 'home') window.location.href = 'index.html';
      else if (v === 'find') window.location.href = 'find.html';
      else if (v === 'register') window.location.href = 'register.html';
      else if (v === 'favs') window.location.href = 'favorites.html';
      else if (v === 'shop') location.href = 'shop.html';
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

  // Radius – nur sichtbar, wenn Ort/PLZ gesetzt
  const inpRadius = document.getElementById('filter-radius');
  const outRadius = document.getElementById('radius-val');
  function syncRadiusUiVisibility() {
    const hasPlace = !!(inpPlzCity?.value || '').trim();
    if (!inpRadius || !outRadius) return;
    const sec = inpRadius.closest('.section');
    if (sec) sec.hidden = !hasPlace;
  }
  if (inpRadius && outRadius) {
    const syncVal = () => { outRadius.textContent = `${parseInt(inpRadius.value||'0',10)} km`; };
    inpRadius.addEventListener('input', syncVal);
    syncVal();
  }

  /* ===== Map ===== */
  const map = L.map('map').setView([51.1657, 10.4515], 6);
  window.map = map; // global, z. B. zum Radius-Kreis zeichnen
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
      buildGlobalPlaceSuggest();      // Vorschläge
      render(allClubs);               // initial
    })
    .catch(err => console.error('clubs load failed', err));

  /* ===== Normalisierung ===== */
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

  function parsePaceToRange(paceText) {
    if (!paceText) return { paceMin:null, paceMax:null };
    const m = String(paceText).trim().match(/^(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?$/);
    if (!m) return { paceMin:null, paceMax:null };
    let min = (+m[1])*60 + (+m[2]);
    let max = m[3] ? (+m[3])*60 + (+m[4]) : min;
    if (max < min) [min, max] = [max, min];
    return { paceMin:min, paceMax:max };
  }
  function parseDistanceToRange(distanceText) {
    if (!distanceText) return { distMin:null, distMax:null };
    const s = String(distanceText).trim();
    const d1 = s.match(/(\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)\s*km/i);
    const d2 = s.match(/Ab\s+(\d+(?:[.,]\d+)?)\s*km/i);
    const d3 = s.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    if (d1) return { distMin:parseFloat(d1[1].replace(',','.')), distMax:parseFloat(d1[2].replace(',','.')) };
    if (d2) return { distMin:parseFloat(d2[1].replace(',','.')), distMax:Infinity };
    if (d3) { const v=parseFloat(d3[1].replace(',','.')); return { distMin:v, distMax:v }; }
    return { distMin:null, distMax:null };
  }

  function parseTagCell(cell) {
    const txt = norm(cell);
    if (!txt) return null;
    const parts = txt.split('|').map(s => s.trim()).filter(Boolean);

    let day = '', time = '', paceText = '', distanceText = '';

    if (parts[0]) {
      const m = parts[0].match(/^([A-Za-zÄÖÜäöüß]+)\s+(\d{1,2}:\d{2})$/);
      if (m) { day = m[1]; time = m[2]; }
      else {
        const m2 = parts[0].match(/^([A-Za-zÄÖÜäöüß]+)/);
        const m3 = parts[0].match(/(\d{1,2}:\d{2})/);
        if (m2) day = m2[1];
        if (m3) time = m3[1];
      }
    }

    for (let i=1;i<parts.length;i++){
      const p = parts[i];
      if (/pace/i.test(p)) {
        const m = p.match(/(\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)/);
        paceText = m ? m[1] : p.replace(/pace/i,'').trim();
      } else if (/strecke/i.test(p) || /km/i.test(p)) {
        const m = p.match(/(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s*km/i) ||
                  p.match(/Ab\s*\d+(?:[.,]\d+)?\s*km/i) ||
                  p.match(/\d+(?:[.,]\d+)?\s*km/i);
        distanceText = m ? m[0] : p.replace(/strecke/i,'').trim();
      }
    }

    const { paceMin, paceMax } = parsePaceToRange(paceText);
    const { distMin, distMax } = parseDistanceToRange(distanceText);

    if (!day && !time && !paceText && !distanceText) return null;
    return { day, time, paceText, distanceText, paceMin, paceMax, distMin, distMax, raw: txt };
  }

  function normalizeClubs(rows) {
    return rows.map(r => {
      const name     = norm(pick(r, 'Name','name','Run Club','Clubname'));
      const plzcity  = norm(pick(r, 'PLZ/Stadt','plzcity','PLZ Stadt','PLZ, Stadt','Ort (PLZ/Stadt)'));
      const meeting  = norm(pick(r, 'Treffpunkt','meeting','Ort','Standort des Treffpunkts'));
      const about    = norm(pick(r, 'Über uns','Über Uns','Unter uns','Unter Uns','about','Beschreibung'));
      const instagram= norm(pick(r, 'Instagram/Website','instagram','Instagram','Website','Webseite','Instagram / Website'));
      const email    = norm(pick(r, 'E-Mail','email'));
      const host     = norm(pick(r, 'Host','host'));

      const key = makeClubKey(name, plzcity, meeting);

      const tagCells = [
        pick(r,'Tag 1','tag 1','Tag1'),
        pick(r,'Tag 2','tag 2','Tag2'),
        pick(r,'Tag 3','tag 3','Tag3'),
        pick(r,'Tag 4','tag 4','Tag4'),
        pick(r,'Tag 5','tag 5','Tag5'),
        pick(r,'Tag 6','tag 6','Tag6'),
        pick(r,'Tag 7','tag 7','Tag7'),
      ];
      const schedule = tagCells.map(parseTagCell).filter(Boolean);

      // Kontaktlabel/URL heuristik
      let contactLabel = '', contactHref = '', contactText = '';
      if (instagram) {
        const raw = instagram.trim();
        const lower = raw.toLowerCase();
        const isHttp = /^https?:\/\//i.test(raw);
        const isInstagramUrl = lower.includes('instagram.com');
        const hasWhitelistedTld = /\.(com|de|org)(?:[\/?#]|$)/i.test(raw) ||
                                  /(?:^|\/\/|www\.)[\w-]+\.(com|de|org)(?:[\/?#]|$)/i.test(raw);
        const treatAsWebsite = (isHttp && !isInstagramUrl) || (!isHttp && hasWhitelistedTld);

        if (!treatAsWebsite) {
          contactLabel = 'Instagram';
          if (isHttp) contactHref = raw;
          else {
            const handle = raw.replace(/^@/,'').trim();
            contactHref = handle ? `https://instagram.com/${encodeURIComponent(handle)}` : '';
          }
          contactText = raw;
        } else {
          contactLabel = 'Website';
          contactHref = isHttp ? raw : `https://${raw}`;
          contactText = raw;
        }
      }

      let paceMin = null, paceMax = null, distMin = null, distMax = null;
      schedule.forEach(s=>{
        if (s.paceMin!=null) paceMin = paceMin==null ? s.paceMin : Math.min(paceMin, s.paceMin);
        if (s.paceMax!=null) paceMax = paceMax==null ? s.paceMax : Math.max(paceMax, s.paceMax);
        if (s.distMin!=null) distMin = distMin==null ? s.distMin : Math.min(distMin, s.distMin);
        if (s.distMax!=null) distMax = distMax==null ? s.distMax : Math.max(distMax, s.distMax);
      });

      return {
        ...r,
        key,
        name, plzcity, meeting, about,
        email, host,
        contactLabel, contactHref, contactText,
        schedule,
        paceMin, paceMax, distMin, distMax
      };
    });
  }

  /* ===== Vorschläge Stadt/PLZ ===== */
  function showSuggestions(items) {
    if (!sugList) return;
    if (!items || items.length === 0) {
      sugList.hidden = true; sugList.innerHTML = ''; return;
    }
    sugList.innerHTML = items.map(s => `<li class="suggest-item" role="option" tabindex="0">${s}</li>`).join('');
    sugList.hidden = false;
  }

  let suggestAbort = null;
  async function queryPlaceSuggest(qRaw) {
    const q = String(qRaw || '').trim();
    if (!q) return [];

    const base = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=10&countrycodes=de';
    if (suggestAbort) try { suggestAbort.abort(); } catch {}
    suggestAbort = new AbortController();

    try {
      const r = await fetch(`${base}&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept':'application/json' },
        signal: suggestAbort.signal
      });
      const data = await r.json();

      const raw = (data || []).map(e => {
        const pc   = e.address?.postcode ?? '';
        const city = e.address?.city || e.address?.town || e.address?.village || e.address?.municipality || e.address?.county || '';
        const label = `${pc ? pc + ' ' : ''}${city}`.trim() || (e.display_name || '').split(',')[0];
        return { label, pc, city };
      }).filter(x => x.label);

      const dedup = [];
      const seen = new Set();
      for (const it of raw) {
        if (seen.has(it.label.toLowerCase())) continue;
        seen.add(it.label.toLowerCase());
        dedup.push(it);
      }

      const isDigits = /^\d{1,5}$/.test(q);
      const startsWith = (s, p) => String(s || '').startsWith(p);
      const priority = isDigits
        ? dedup.filter(x => startsWith(x.pc, q))
        : dedup.filter(x => x.label.toLowerCase().startsWith(q.toLowerCase()));

      const merged = [...priority, ...dedup.filter(x => !priority.includes(x))];

      return merged.slice(0, 10).map(x => x.label);
    } catch {
      return [];
    }
  }

  function buildGlobalPlaceSuggest() {
    if (!inpPlzCity || !sugList) return;
    const onInput = async () => {
      const q = (inpPlzCity.value || '').trim();
      syncRadiusUiVisibility();
      const items = await queryPlaceSuggest(q);
      showSuggestions(items);
    };
    inpPlzCity.addEventListener('input', onInput);
    inpPlzCity.addEventListener('focus', onInput);

    // Enter im Eingabefeld: Top-Vorschlag automatisch übernehmen
    inpPlzCity.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = (inpPlzCity.value || '').trim();
        const items = await queryPlaceSuggest(q);
        if (items && items[0]) {
          inpPlzCity.value = items[0];
        }
        showSuggestions([]);
        syncRadiusUiVisibility();
        await applyFilters();
      }
    });

    document.addEventListener('click', (e) => {
      if (!sugList.contains(e.target) && e.target !== inpPlzCity) { sugList.hidden = true; }
    });
    sugList.addEventListener('click', (e) => {
      const li = e.target.closest('.suggest-item'); if (!li) return;
      inpPlzCity.value = li.textContent; sugList.hidden = true; syncRadiusUiVisibility();
    });
    sugList.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const li = e.target.closest('.suggest-item'); if (!li) return;
        inpPlzCity.value = li.textContent; sugList.hidden = true; inpPlzCity.focus(); syncRadiusUiVisibility();
      }
    });
    syncRadiusUiVisibility();
  }

  /* ===== Filtern ===== */
  const toMin  = (s)=> { const m = /^(\d{1,2}):(\d{2})$/.exec(s||''); return m ? (+m[1])*60+(+m[2]) : null; };

  function splitPlzCity(plzcityRaw) {
    const s = String(plzcityRaw || '').replace(',', ' ').replace(/\s+/g,' ').trim();
    const m = s.match(/\b(\d{5})\b/);
    const postalCode = m ? m[1] : '';
    let city = s;
    if (postalCode) city = city.replace(new RegExp(`\\b${postalCode}\\b[,]?\\s*`), '').trim();
    return { postalCode, city };
  }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

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
    return null;
  }

  async function geocodePlace(q) {
    const key = 'geo:place:' + String(q||'').trim().toLowerCase();
    const cached = localStorage.getItem(key);
    if (cached) {
      try { const p = JSON.parse(cached); if (p && typeof p.lat==='number' && typeof p.lng==='number') return [p.lat,p.lng]; } catch {}
    }
    const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de';
    const url  = `${base}&q=${encodeURIComponent(q + ', Germany')}`;
    try {
      const r = await fetch(url, { headers: { 'Accept':'application/json', 'Accept-Language':'de' }});
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

  function haversineKm(a, b) {
    const toRad = d => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(b[0]-a[0]);
    const dLon = toRad(b[1]-a[1]);
    const s1 = Math.sin(dLat/2) ** 2 +
               Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s1));
  }

  async function ensureCoordsForClubs(clubs) {
    const out = new Map();
    const queue = clubs.slice();
    const MAX = 3;
    let active = 0;

    return new Promise(resolve => {
      const next = () => {
        while (active < MAX && queue.length) {
          const c = queue.shift();
          active++;
          geocodeClub(c).then(pt => { out.set(c.key, pt || null); })
            .finally(() => { active--; if (queue.length) next(); else if (active===0) resolve(out); });
        }
        if (queue.length === 0 && active === 0) resolve(out);
      };
      next();
    });
  }

  // wird in applyFilters gesetzt, um Textfilter zu überspringen wenn Radius aktiv ist
  window.__ignoreTextFilter = false;

  function matchesFilters(c) {
    const ignoreText = window.__ignoreTextFilter === true;

    // Stadt/PLZ (nur wenn NICHT per Radius gesucht wird)
    const qpc = (inpPlzCity.value || '').trim().toLowerCase();
    if (!ignoreText && qpc && !(c.plzcity || '').toLowerCase().includes(qpc)) return false;

    // Name
    const qn = (inpName.value || '').trim().toLowerCase();
    if (qn && !(c.name || '').toLowerCase().includes(qn)) return false;

    // Wochentag
    if (selectedWeekday) {
      if (!c.schedule || !c.schedule.some(s => (s.day || '').toLowerCase() === selectedWeekday.toLowerCase())) {
        return false;
      }
    }

    // Uhrzeit-Range
    const fromM = toMin(timeFrom.value);
    const toM   = toMin(timeTo.value);
    if (fromM != null && toM != null) {
      const times = (c.schedule || [])
        .filter(s => !selectedWeekday || (s.day||'').toLowerCase() === selectedWeekday.toLowerCase())
        .map(s => toMin(s.time))
        .filter(v => v != null);
      if (times.length > 0 && !times.some(t => fromM <= t && t <= toM)) return false;
    }

    // Strecke (km)
    const wantKm = parseFloat((inpDist.value || '').replace(',','.'));
    if (!isNaN(wantKm)) {
      const ok = (c.schedule || []).some(s => s.distMin!=null && s.distMax!=null && s.distMin <= wantKm && wantKm <= s.distMax);
      if (!ok && c.distMin!=null && c.distMax!=null && !(c.distMin <= wantKm && wantKm <= c.distMax)) return false;
      if (!ok && (c.distMin==null || c.distMax==null)) return false;
    }

    // Pace (min/km)
    const wantPace = toMin(inpPace.value);
    if (wantPace != null) {
      const ok = (c.schedule || []).some(s => s.paceMin!=null && s.paceMax!=null && s.paceMin <= wantPace && wantPace <= s.paceMax);
      if (!ok && c.paceMin!=null && c.paceMax!=null && !(c.paceMin <= wantPace && wantPace <= c.paceMax)) return false;
      if (!ok && (c.paceMin==null || c.paceMax==null)) return false;
    }

    return true;
  }

  async function applyFilters() {
    // erst alle „Fach“-Filter anwenden (ohne Radius)
    let base = allClubs.filter(matchesFilters);

    // Radiusfilter nur wenn Ort gesetzt & Radius > 0
    const rawPlace = (inpPlzCity?.value || '').trim();
    const radiusKm = parseInt((inpRadius?.value || '0'), 10) || 0;

    window.__ignoreTextFilter = false;  // default

    if (rawPlace && radiusKm > 0) {
      // 1) direkter Geocode
      let center = await geocodePlace(rawPlace);

      // 2) Fallback: Top-Vorschlag nutzen
      if (!center) {
        const sugg = await queryPlaceSuggest(rawPlace);
        if (sugg && sugg[0]) {
          center = await geocodePlace(sugg[0]);
        }
      }

      if (center) {
        window.__ignoreTextFilter = true; // Textfilter Stadt/PLZ aus
        // Radius ANSCHLIESSEND auf komplette, neu gefilterte Liste anwenden
        const coordsMap = await ensureCoordsForClubs(allClubs.filter(matchesFilters));
        base = allClubs.filter(matchesFilters).filter(c => {
          const pt = coordsMap.get(c.key);
          if (!pt) return false;
          const d = haversineKm(center, pt);
          return d <= radiusKm;
        });

        // Optional: Radius-Kreis einzeichnen
        try {
          if (typeof L !== 'undefined' && window.map) {
            if (window._radiusLayer) { window.map.removeLayer(window._radiusLayer); }
            window._radiusLayer = L.circle(center, { radius: radiusKm * 1000, weight: 1, opacity: .8, fillOpacity: .08 });
            window._radiusLayer.addTo(window.map);
          }
        } catch {}
      }
    }

    render(base);
  }
  btnSearch?.addEventListener('click', async (e)=>{ e.preventDefault(); await applyFilters(); });
  [inpPlzCity, inpName, timeFrom, timeTo, inpDist, inpPace].forEach(el=>{
    if (!el) return;
    el.addEventListener('keydown', async (e)=>{ if (e.key === 'Enter') { e.preventDefault(); await applyFilters(); }});
  });

  /* ===== Render ===== */
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

  function render(clubs) {
    const list = document.getElementById('clubs-list');
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

            ${scheduleTableHtml(c.schedule)}
            ${contactLine}
          </div>
          ${aboutCol}
        </div>
      `;
    }).join('') || '<div class="helper">Keine Clubs gefunden.</div>';

    // Marker
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

  // Favoriten-Handling
  const FAV_KEY = 'favorites:v1';
  function readFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || {}; }
    catch { return {}; }
  }
  function writeFavs(obj) { localStorage.setItem(FAV_KEY, JSON.stringify(obj)); }
  function isFavorite(key) { const map = readFavs(); return !!map[key]; }
  function addFavorite(club) { const map = readFavs(); map[club.key] = club; writeFavs(map); }
  function removeFavorite(key) { const map = readFavs(); delete map[key]; writeFavs(map); }

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
});
