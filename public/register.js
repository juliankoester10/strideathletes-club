// register.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===== Menü (Hover öffnet, Klick pinnt) ===== */
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
    });

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item'); if (!item) return;
      e.stopPropagation();
      goNav(item.dataset.nav);
      menu.classList.remove('pinned');
      btn.setAttribute('aria-expanded', 'false');
      btn.focus();
    });

    document.addEventListener('click', (e) => {
      if (menu.classList.contains('pinned') && !menu.contains(e.target)) {
        menu.classList.remove('pinned');
        btn.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('pinned')) {
        menu.classList.remove('pinned');
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
  })();

  /* ===== Formular-Logik (unverändert) ===== */
  const form = document.getElementById('register-form');
  const errorEl = document.getElementById('form-error');

  let triedSubmit = false;
  let isSubmitting = false;

  const requiredIds = ['rc-name','rc-plzcity','rc-instagram','rc-email','rc-host','rc-meeting'];

  const getEl = id => document.getElementById(id);
  const val = id => (getEl(id)?.value || '').trim();

  const consentBox = getEl('rc-consent');
  const consentError = getEl('consent-error');
  const isConsentOk = () => !!(consentBox && consentBox.checked);
  const updateConsentError = () => {
    if (!consentError) return;
    if (!triedSubmit) { consentError.style.display = 'none'; return; }
    consentError.style.display = isConsentOk() ? 'none' : 'block';
  };

  const about = getEl('rc-about'); const counter = getEl('about-counter');
  function updateWordCounter() {
    if (!about || !counter) return;
    const words = about.value.trim().length ? about.value.trim().split(/\s+/) : [];
    if (words.length > 200) { about.value = words.slice(0, 200).join(' '); counter.textContent = '200 / 200 Wörter'; return; }
    counter.textContent = `${words.length} / 200 Wörter`;
  }
  if (about && counter) { about.addEventListener('input', updateWordCounter); updateWordCounter(); }

  const emailValid = () => /\S+@\S+\.\S+/.test(val('rc-email'));

  const slug = d => ({
    Montag:'mo', Dienstag:'di', Mittwoch:'mi', Donnerstag:'do',
    Freitag:'fr', Samstag:'sa', Sonntag:'so'
  }[d] || d.toLowerCase());

  const openPickerBtn = getEl('openWeekdayPicker');
  const panel = getEl('weekdayPanel');
  const confirmWeekdaysBtn = getEl('confirmWeekdays');
  const fieldsWrap = getEl('daytime-fields');
  const daytimeError = getEl('daytime-error');

  if (openPickerBtn && !openPickerBtn.getAttribute('aria-controls')) {
    openPickerBtn.setAttribute('aria-controls', 'weekdayPanel');
  }

  const selectedDays = new Set();

  function syncPanelCheckboxesFromState() {
    if (!panel) return;
    panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = selectedDays.has(cb.value);
    });
  }
  function updateOpenButtonLabel() {
    if (!openPickerBtn) return;
    const count = selectedDays.size;
    openPickerBtn.textContent = count > 0 ? `Tage auswählen (${count})` : 'Tage auswählen';
  }

  function openPanel() {
    if (!panel) return;
    panel.hidden = false;
    openPickerBtn?.setAttribute('aria-expanded', 'true');
    syncPanelCheckboxesFromState();
    const firstCb = panel.querySelector('input[type="checkbox"]');
    firstCb?.focus({ preventScroll: false });
  }
  function closePanel() {
    if (!panel) return;
    panel.hidden = true;
    openPickerBtn?.setAttribute('aria-expanded', 'false');
    openPickerBtn?.focus({ preventScroll: false });
  }

  if (openPickerBtn) openPickerBtn.addEventListener('click', () => {
    if (!panel) return;
    panel.hidden ? openPanel() : closePanel();
  });

  document.addEventListener('click', (e) => {
    if (!panel || panel.hidden) return;
    const within = panel.contains(e.target) || openPickerBtn.contains(e.target);
    if (!within) closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) {
      closePanel();
    }
  });

  function renderDaytimeFields() {
    fieldsWrap.innerHTML = '';
    Array.from(selectedDays).forEach(day => {
      const id = `time-${slug(day)}`;
      const row = document.createElement('div');
      row.className = 'daytime-row';
      row.innerHTML = `
        <label for="${id}">${day} um</label>
        <input id="${id}" type="time" placeholder="--:--">
      `;
      fieldsWrap.appendChild(row);
    });
    fieldsWrap.querySelectorAll('input[type="time"]').forEach(inp => {
      inp.addEventListener('input', () => { if (triedSubmit) updateDaytimeError(); });
      inp.addEventListener('change', () => { if (triedSubmit) updateDaytimeError(); });
    });
  }

  if (confirmWeekdaysBtn) {
    confirmWeekdaysBtn.addEventListener('click', () => {
      panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (cb.checked) selectedDays.add(cb.value); else selectedDays.delete(cb.value);
      });
      renderDaytimeFields();
      updateOpenButtonLabel();
      closePanel();
      if (triedSubmit) updateDaytimeError();
    });
  }

  function daytimeValid() {
    if (selectedDays.size === 0) return false;
    for (const day of selectedDays) {
      const t = (getEl(`time-${slug(day)}`)?.value || '').trim();
      if (!t) return false;
    }
    return true;
  }

  function updateDaytimeError() {
    if (!daytimeError) return;
    if (!triedSubmit) { daytimeError.style.display = 'none'; return; }
    daytimeError.style.display = daytimeValid() ? 'none' : 'block';
  }

  function allRequiredFilled() {
    const basicsOk = requiredIds.every(id => val(id).length > 0) && emailValid();
    return basicsOk && daytimeValid();
  }
  const updateRequiredError = () => {
    if (!errorEl) return;
    if (!triedSubmit) { errorEl.style.display = 'none'; return; }
    errorEl.style.display = allRequiredFilled() ? 'none' : 'block';
  };

  requiredIds.forEach(id => {
    const el = getEl(id);
    if (el) {
      const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => { if (triedSubmit) updateRequiredError(); });
    }
  });
  if (consentBox) consentBox.addEventListener('change', () => { if (triedSubmit) updateConsentError(); });

  function typeOnce(el, text, durationMs=3000) {
    const speed = Math.max(10, Math.floor(durationMs / Math.max(1, text.length)));
    let i = 0;
    const step = () => {
      if (i <= text.length) { el.textContent = text.slice(0, i++); setTimeout(step, speed); }
    };
    step();
  }

  async function postForm(data) {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Serverfehler beim Versenden');
    return res.json();
  }

  const formEl = document.getElementById('register-form');
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    triedSubmit = true;

    const okFields = allRequiredFilled();
    const okConsent = isConsentOk();

    updateRequiredError();
    updateConsentError();
    updateDaytimeError();

    if (!okFields || !okConsent) {
      const firstEmpty = requiredIds.map(getEl).find(el => el && !el.value.trim());
      if (firstEmpty) { firstEmpty.focus({preventScroll:false}); return; }

      if (!emailValid()) { getEl('rc-email')?.focus({preventScroll:false}); return; }

      const slugMap = { Montag:'mo', Dienstag:'di', Mittwoch:'mi', Donnerstag:'do', Freitag:'fr', Samstag:'sa', Sonntag:'so' };
      const firstDay = Array.from(selectedDays)[0];
      if (firstDay) { getEl(`time-${slugMap[firstDay]||firstDay.toLowerCase()}`)?.focus({preventScroll:false}); return; }

      if (consentBox && !okConsent) { consentBox.focus({preventScroll:false}); }
      return;
    }

    const schedule = Array.from(selectedDays).map(day => ({
      day,
      time: (getEl(`time-${slug(day)}`)?.value || '').trim()
    }));

    const payload = {
      name: val('rc-name'),
      plzcity: val('rc-plzcity'),
      instagram: val('rc-instagram'),
      email: val('rc-email'),
      host: val('rc-host'),
      about: val('rc-about'),
      meeting: val('rc-meeting'),
      schedule,
      distance: val('rc-distance'),
      pace: val('rc-pace'),
      consent: true,
    };

    const submitBtn = formEl.querySelector('.btn-submit');
    try {
      isSubmitting = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Wird gesendet…'; }

      await postForm(payload);

      const wrap = document.getElementById('submit-success');
      const typer = document.getElementById('submit-typer');
      if (wrap && typer) {
        wrap.hidden = false;
        typer.textContent = '';
        typeOnce(typer, typer.dataset.text || typer.textContent, 3000);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      formEl.reset();
      triedSubmit = false;
      selectedDays.clear();
      renderDaytimeFields();
      updateOpenButtonLabel();
      updateWordCounter();
      updateRequiredError();
      updateConsentError();
      updateDaytimeError();
    } catch (err) {
      alert('Leider konnte die Anfrage nicht gesendet werden. Bitte später erneut versuchen.');
      console.error(err);
    } finally {
      isSubmitting = false;
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Run Club eintragen'; }
    }
  });
});
