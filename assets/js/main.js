/* Portfolio Julen De La Serna: sin dependencias. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;

  /* ---------- reloj de la cabecera ---------- */
  const clock = $('.clock time');
  if (clock) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: clock.dataset.tz || 'Europe/Madrid',
    });
    const tick = () => {
      const now = new Date();
      clock.textContent = fmt.format(now);
      clock.dateTime = now.toISOString();
    };
    tick();
    setInterval(tick, 10000);
  }

  /* ---------- cursor "play" + vista previa de la lista ---------- */
  let cursorOff = () => {};
  if (finePointer) {
    root.classList.add('has-cursor');

    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = '<span class="cursor-label">[PLAY]</span>';

    const peek = document.createElement('div');
    peek.className = 'peek';
    peek.setAttribute('aria-hidden', 'true');
    peek.innerHTML = '<img alt="">';
    const peekImg = $('img', peek);

    document.body.append(cursor, peek);

    let tx = -200,
      ty = -200,
      x = tx,
      y = ty,
      raf = 0;
    const ease = reduceMotion ? 1 : 0.2;

    const frame = () => {
      x += (tx - x) * ease;
      y += (ty - y) * ease;
      const t = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      cursor.style.transform = t;
      peek.style.transform = t;
      raf = Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1 ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    document.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        tx = e.clientX;
        ty = e.clientY;
        kick();
      },
      { passive: true }
    );

    const setOn = (on, tile) => {
      cursor.classList.toggle('is-on', on);
      const listing = root.dataset.view === 'list';
      peek.classList.toggle('is-on', on && listing && !!tile);
      if (on && listing && tile && tile.dataset.image) {
        const src = tile.dataset.image;
        if (!peekImg.src.endsWith(src)) peekImg.src = src;
      }
    };
    cursorOff = () => setOn(false);

    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target.closest('[data-cursor]');
      if (target) setOn(true, target.closest('.tile'));
    });
    document.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const from = e.target.closest('[data-cursor]');
      const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('[data-cursor]') : null;
      if (from && from !== to) setOn(false);
    });
    window.addEventListener('blur', cursorOff);
    document.addEventListener('mouseleave', cursorOff);
  }

  /* ---------- vídeos en bucle dentro de las miniaturas ---------- */
  const tiles = $$('.tile');
  tiles.forEach((tile) => {
    const video = $('video', tile);
    if (!video) return;

    const start = () => {
      if (reduceMotion) return;
      if (!video.getAttribute('src')) {
        video.src = video.dataset.src;
        video.load();
      }
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    const stop = () => {
      video.pause();
      tile.classList.remove('is-playing');
      try {
        video.currentTime = 0;
      } catch (_) {}
    };

    video.addEventListener('playing', () => tile.classList.add('is-playing'));
    tile.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && start());
    tile.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && stop());
    tile.addEventListener('focusin', start);
    tile.addEventListener('focusout', stop);

    // En pantallas táctiles no hay hover: se reproduce lo que está a la vista.
    if (!finePointer && !reduceMotion && 'IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) => {
            if (entry.isIntersecting) start();
            else stop();
          }),
        { threshold: 0.6 }
      ).observe(tile);
    }
  });

  /* ---------- filtros y vista (cuadrícula / lista) ---------- */
  const grid = $('.grid');
  if (grid) {
    const filterBtns = $$('[data-filter]');
    const viewBtns = $$('[data-view-btn]');
    const params = new URLSearchParams(location.search);

    const sync = () => {
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    };

    const applyFilter = (value) => {
      tiles.forEach((tile) => {
        const ok = value === 'all' || tile.dataset.group === value;
        tile.hidden = !ok;
      });
      filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === value)));
      if (typeof queueReveal === 'function') queueReveal();
      if (value === 'all') params.delete('type');
      else params.set('type', value);
    };

    const applyView = (value) => {
      root.dataset.view = value;
      viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.viewBtn === value)));
      if (value === 'grid') params.delete('view');
      else params.set('view', 'list');
      cursorOff();
    };

    filterBtns.forEach((b) =>
      b.addEventListener('click', () => {
        applyFilter(b.dataset.filter);
        sync();
      })
    );
    viewBtns.forEach((b) =>
      b.addEventListener('click', () => {
        applyView(b.dataset.viewBtn);
        sync();
      })
    );

    const wanted = params.get('type');
    if (wanted && filterBtns.some((b) => b.dataset.filter === wanted)) applyFilter(wanted);
    applyView(params.get('view') === 'list' ? 'list' : 'grid');
  }


  /* ---------- textos de cada trabajo: aparecen poco a poco al hacer scroll (móvil) ---------- */
  const captions = $$('.tile .caption');
  const touchLayout = matchMedia('(hover: none), (max-width: 680px)');
  let revealOn = false;
  let revealRaf = 0;
  const clamp01 = (n) => Math.min(1, Math.max(0, n));

  const paintReveal = () => {
    revealRaf = 0;
    const vh = window.innerHeight;
    captions.forEach((cap) => {
      const tile = cap.closest('.tile');
      if (tile.hidden) return;
      const top = cap.getBoundingClientRect().top;
      const p = clamp01((vh * 0.94 - top) / (vh * 0.22));
      cap.style.setProperty('--p', p.toFixed(3));
      cap.style.setProperty('--q', clamp01((p - 0.3) / 0.7).toFixed(3));
    });
  };
  const queueReveal = () => {
    if (revealOn && !revealRaf) revealRaf = requestAnimationFrame(paintReveal);
  };
  const syncReveal = () => {
    const want = !reduceMotion && touchLayout.matches && captions.length > 0;
    if (want === revealOn) return;
    revealOn = want;
    root.classList.toggle('js-reveal', want);
    if (want) paintReveal();
    else
      captions.forEach((cap) => {
        cap.style.removeProperty('--p');
        cap.style.removeProperty('--q');
      });
  };
  window.addEventListener('scroll', queueReveal, { passive: true });
  window.addEventListener('resize', () => {
    syncReveal();
    queueReveal();
  });
  if (touchLayout.addEventListener) touchLayout.addEventListener('change', syncReveal);
  syncReveal();

  /* ---------- reproductor de la ficha de proyecto ---------- */
  $$('[data-embed]').forEach((box) => {
    const btn = $('.player-btn', box);
    if (!btn) return;
    btn.addEventListener(
      'click',
      () => {
        const frame = document.createElement('iframe');
        frame.src = box.dataset.embed;
        frame.title = box.dataset.title || 'Video';
        frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
        frame.allowFullscreen = true;
        box.replaceChildren(frame);
        box.removeAttribute('data-cursor');
        cursorOff();
      },
      { once: true }
    );
  });

  /* ---------- formulario de contacto ---------- */
  const form = $('#contact-form');
  if (form) {
    const status = $('.form-status', form);
    const say = (text, isError) => {
      status.textContent = text;
      status.classList.toggle('is-error', !!isError);
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const fields = ['name', 'email', 'message'];
      let firstBad = null;
      fields.forEach((f) => {
        const el = form.elements[f];
        const value = String(data[f] || '').trim();
        const bad = !value || (f === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
        el.setAttribute('aria-invalid', String(bad));
        if (bad && !firstBad) firstBad = el;
      });
      if (firstBad) {
        say('Please check the highlighted fields: something is missing or the email is not valid.', true);
        firstBad.focus();
        return;
      }

      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        say('Sending…');
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error(String(res.status));
          form.reset();
          say('Message sent. I will reply as soon as I can.');
        } catch (_) {
          say('The message could not be sent. Write to me at ' + form.dataset.email + '.', true);
        }
        return;
      }

      // Sin servicio de formularios configurado: se abre el correo del visitante.
      const subject = encodeURIComponent('Message from the website: ' + data.name);
      const body = encodeURIComponent(data.message + '\n\n' + data.name + '\n' + data.email);
      say('Opening your email app…');
      location.href = 'mailto:' + form.dataset.email + '?subject=' + subject + '&body=' + body;
    });
  }
})();
