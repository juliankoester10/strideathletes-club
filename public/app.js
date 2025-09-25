// app.js
document.addEventListener('DOMContentLoaded', () => {
  /* ===== Navigation-Buttons auf der Startseite ===== */
  const btnFindClub = document.getElementById('btn-find-club');
  const btnRegisterClub = document.getElementById('btn-register-club');

  if (btnFindClub) {
    btnFindClub.addEventListener('click', () => { window.location.href = 'find.html'; });
  }
  if (btnRegisterClub) {
    btnRegisterClub.addEventListener('click', () => { window.location.href = 'register.html'; });
  }

  /* ===== Typing-Effekt (Startseite) ===== */
  (function setupTypewriter() {
    const el = document.getElementById('typewriter');
    if (!el) return;

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const text = (el.dataset.text || el.textContent || '').toString();
    if (!text) return;

    if (prefersReduced) { el.textContent = text; return; }

    const typeDuration = 3000;
    const eraseDuration = 1200;
    const holdDuration = 600;
    const pauseBetween = 300;

    const len = Math.max(1, text.length);
    const typeSpeed = Math.max(10, Math.floor(typeDuration / len));
    const eraseSpeed = Math.max(10, Math.floor(eraseDuration / len));

    let timer = null;

    const type = (i = 0) => {
      if (i <= text.length) {
        el.textContent = text.slice(0, i);
        timer = setTimeout(() => type(i + 1), typeSpeed);
      } else {
        timer = setTimeout(() => erase(text.length), holdDuration);
      }
    };
    const erase = (i) => {
      if (i >= 0) {
        el.textContent = text.slice(0, i);
        timer = setTimeout(() => erase(i - 1), eraseSpeed);
      } else {
        timer = setTimeout(() => type(0), pauseBetween);
      }
    };
    type(0);
    window.addEventListener('beforeunload', () => { if (timer) clearTimeout(timer); });
  })();

  /* ===== "Shop kommt bald" Helper ===== */
  function comingSoon() {
    alert('Der Online Shop kommt bald :)');
  }

  /* ===== Menü (Hover öffnet per CSS, Klick pinnt) ===== */
  (function setupMenu(){
    const menu = document.getElementById('mainMenu');
    const btn  = document.getElementById('menuButton');
    const list = document.getElementById('menuList');

    // Logo klickbar → zeigt Hinweis statt Shop
    const brandLogo = document.getElementById('brand-logo');
    if (brandLogo) {
      brandLogo.style.cursor = 'pointer';
      brandLogo.addEventListener('click', (e) => {
        e.preventDefault();
        comingSoon();
      });
    }

    if (!menu || !btn || !list) return;

    if (!btn.getAttribute('aria-controls')) {
      btn.setAttribute('aria-controls', 'menuList');
    }

    function goNav(v) {
      if (v === 'home') window.location.href = 'index.html';
      else if (v === 'find') window.location.href = 'find.html';
      else if (v === 'register') window.location.href = 'register.html';
      else if (v === 'favs') window.location.href = 'favorites.html';
      else if (v === 'shop') comingSoon();                // <<< geändert
      else if (v === 'login' || v === 'orders' || v === 'logout' || v === 'cart') {
        comingSoon();                                     // ggf. alte Shop-Actions
      }
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pinned = menu.classList.toggle('pinned');
      btn.setAttribute('aria-expanded', String(pinned));
      if (pinned) {
        list.querySelector('.menu-item')?.focus();
      }
    });

    // Event-Delegation
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.menu-item');
      if (!item) return;
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
});
