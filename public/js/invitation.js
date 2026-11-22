// Interaksi halaman undangan publik.
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('inv-data').textContent);
  var metaTag = document.querySelector('meta[name="base-path"]');
  var basePath = (data && data.basePath) ||
    (metaTag && metaTag.content) ||
    (location.pathname.startsWith('/undangan-digital') ? '/undangan-digital' : '') ||
    '';
  var L = data.labels;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var opener = $('#opener');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Lama animasi pembuka (ms) sebelum halaman undangan dibuka penuh.
  var DUR = { envelope: 2400, book: 2500, flip: 2300, doors: 2000, curtain: 2100, iris: 2400, shutter: 2000 };

  function reveal() {
    document.body.classList.remove('locked');
    document.body.classList.add('opened');
    if (opener) { opener.classList.add('end'); setTimeout(function () { opener.hidden = true; }, 1000); }
  }

  // Di pratinjau editor (?open=1) undangan langsung terbuka tanpa animasi pembuka.
  if (data.preview && !data.demo && /[?&]open=1/.test(location.search)) {
    if (opener) opener.hidden = true;
    reveal();
  }

  // ----- buka undangan -----
  var bgm = $('#bgm');
  var musicBtn = $('#music-btn');
  function setPlaying(on) { if (musicBtn) musicBtn.classList.toggle('playing', on); }
  function playMusic() {
    if (!bgm) return;
    var p = bgm.play();
    if (p && p.then) p.then(function () { setPlaying(true); }).catch(function () { setPlaying(false); });
  }
  var openBtn = $('#open-btn');
  var opened = false;
  if (openBtn) openBtn.addEventListener('click', function () {
    if (opened) return;
    opened = true;
    if (data.autoplay) playMusic();
    var after = function () {
      reveal();
      var next = $('#opening') || $('#hosts') || $('#events');
      if (next) setTimeout(function () { next.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }, 350);
    };
    if (opener && !reduce) {
      opener.classList.add('go');
      setTimeout(after, DUR[data.opener] || 2200);
    } else {
      after();
    }
  });
  if (musicBtn) {
    musicBtn.addEventListener('click', function () {
      if (bgm.paused) playMusic(); else { bgm.pause(); setPlaying(false); }
    });
  }

  // ----- hitung mundur -----
  var cd = $('#countdown');
  if (cd) {
    var target = new Date(cd.dataset.target).getTime();
    var cells = {};
    $$('b[data-u]', cd).forEach(function (b) { cells[b.dataset.u] = b; });
    var tick = function () {
      var diff = Math.max(0, target - Date.now());
      var s = Math.floor(diff / 1000);
      cells.d.textContent = Math.floor(s / 86400);
      cells.h.textContent = String(Math.floor((s % 86400) / 3600)).padStart(2, '0');
      cells.m.textContent = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
      cells.s.textContent = String(s % 60).padStart(2, '0');
    };
    tick();
    setInterval(tick, 1000);
  }

  // ----- animasi muncul saat scroll -----
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // ----- navigasi bawah (aktif sesuai bagian) -----
  var links = $$('#bottom-nav a');
  if (links.length && 'IntersectionObserver' in window) {
    var map = {};
    links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && map[e.target.id]) {
          links.forEach(function (a) { a.classList.remove('active'); });
          map[e.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) so.observe(el); });
  }

  // ----- lightbox -----
  var lb = $('#lightbox');
  $$('[data-lightbox]').forEach(function (b) {
    b.addEventListener('click', function () { $('img', lb).src = b.dataset.lightbox; lb.hidden = false; });
  });
  lb.addEventListener('click', function () { lb.hidden = true; $('img', lb).removeAttribute('src'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') lb.hidden = true; });

  // ----- salin -----
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.dataset.copy;
      var done = function () {
        var old = b.textContent; b.textContent = L.copied;
        setTimeout(function () { b.textContent = old; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done);
      else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); done(); }
    });
  });

  // ----- kirim form -----
  function post(path, body) {
    body.to = data.to;
    return fetch(basePath + '/api/public/' + encodeURIComponent(data.slug) + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function formData(form) {
    var o = {};
    new FormData(form).forEach(function (v, k) { o[k] = v; });
    return o;
  }
  function bindForm(form, path, onOk) {
    if (!form) return;
    var msg = $('.form-msg', form);
    var btn = $('button[type=submit]', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      msg.className = 'form-msg';
      if (data.preview) { msg.textContent = L.previewNotice; return; }
      if (!form.reportValidity()) return;
      btn.disabled = true; var old = btn.textContent; btn.textContent = L.sending;
      post(path, formData(form)).then(function (res) {
        msg.textContent = res.ok ? (res.j.message || '') : (res.j.error || L.error);
        msg.classList.add(res.ok ? 'ok' : 'err');
        if (res.ok && onOk) onOk(res.j);
      }).catch(function () { msg.textContent = L.error; msg.classList.add('err'); })
        .then(function () { btn.disabled = false; btn.textContent = old; });
    });
  }

  var rsvp = $('#rsvp-form');
  if (rsvp) {
    $$('input[name=attendance]', rsvp).forEach(function (r) {
      r.addEventListener('change', function () {
        var none = rsvp.attendance.value === 'tidak';
        $$('[data-hide-when]', rsvp).forEach(function (el) { el.hidden = none; });
      });
    });
    bindForm(rsvp, '/rsvp');
  }

  // ----- ucapan -----
  var list = $('#wish-list');
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function loadWishes() {
    if (!list || data.preview) { if (list) list.innerHTML = '<p class="muted">' + esc(L.noWishes) + '</p>'; return; }
    fetch(basePath + '/api/public/' + encodeURIComponent(data.slug) + '/wishes').then(function (r) { return r.json(); }).then(function (j) {
      if (!j.wishes || !j.wishes.length) { list.innerHTML = '<p class="muted">' + esc(L.noWishes) + '</p>'; return; }
      list.innerHTML = j.wishes.map(function (w) {
        return '<div class="wish"><strong>' + esc(w.name) + '</strong><p>' + esc(w.message) + '</p></div>';
      }).join('');
    }).catch(function () {});
  }
  bindForm($('#wish-form'), '/wish', function (j) {
    $('#wish-form textarea').value = '';
    if (j.approved) loadWishes();
  });
  loadWishes();
})();
