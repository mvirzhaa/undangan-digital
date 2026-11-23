// Pemindai petugas: kamera (BarcodeDetector / jsQR), input kode, pencarian nama, unggah foto photobooth.
(function () {
  'use strict';
  var boot = JSON.parse(document.getElementById('sc-boot').textContent);
  var metaTag = document.querySelector('meta[name="base-path"]');
  var basePath = (boot && boot.basePath) ||
    (metaTag && metaTag.content) ||
    (location.pathname.startsWith('/undangan-digital') ? '/undangan-digital' : '') ||
    '';
  var BASE = basePath + '/api/scan/' + boot.token;
  var $ = function (s) { return document.querySelector(s); };
  var station = 'guestbook';
  var activeGuest = null;      // sesi photobooth yang sedang berjalan
  var lastCode = ''; var lastAt = 0; var busy = false;

  $('#sc-title').textContent = boot.title;
  if (boot.photobooth) $('#tab-booth').hidden = false;

  function api(method, path, body) {
    var o = { method: method, headers: {} };
    if (body instanceof FormData) o.body = body;
    else if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(BASE + path, o).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan'); return j; }); });
  }
  function hhmm(d) { return d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---- suara & getar ----
  var actx;
  function beep(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var tones = { ok: [880, 1320], dup: [440, 440], bad: [220, 160] }[kind] || [440];
      tones.forEach(function (f, i) {
        var o = actx.createOscillator(); var g = actx.createGain(); o.frequency.value = f; o.type = 'sine';
        g.gain.value = 0.12; o.connect(g); g.connect(actx.destination);
        var t0 = actx.currentTime + i * 0.13; o.start(t0); o.stop(t0 + 0.11);
      });
    } catch (_) {}
    if (navigator.vibrate) navigator.vibrate(kind === 'ok' ? 80 : [120, 60, 120]);
  }

  // ---- statistik & riwayat ----
  function drawStats(s) {
    var box = $('#sc-stats'); box.innerHTML = '';
    var a = el('span'); a.appendChild(document.createTextNode('Hadir ')); a.appendChild(el('b', '', s.checked_in + '/' + s.total)); a.appendChild(document.createTextNode(' · ' + s.checked_in_pax + ' orang')); box.appendChild(a);
    if (boot.photobooth) { var b = el('span'); b.appendChild(document.createTextNode('Photobooth ')); b.appendChild(el('b', '', String(s.booth))); box.appendChild(b); }
  }
  function drawRecent(list) {
    var ul = $('#sc-recent'); ul.innerHTML = '';
    if (!list.length) { ul.appendChild(el('li', 'muted', 'Belum ada pemindaian.')); return; }
    list.forEach(function (r) {
      var li = el('li'); li.appendChild(el('span', r.result === 'ok' ? 'r-ok' : 'r-dup', (r.station === 'booth' ? '📸 ' : '📒 ') + (r.name || '—') + (r.result === 'ok' ? '' : ' (ditolak: sudah tercatat)')));
      li.appendChild(el('span', 'muted', hhmm(r.created_at))); ul.appendChild(li);
    });
  }
  function refresh() { return api('GET', '/info').then(function (j) { drawStats(j.stats); drawRecent(j.recent); }).catch(function () {}); }

  // ---- hasil pemindaian ----
  function showResult(cls, status, title, meta, guest) {
    var box = $('#sc-result'); box.className = 'sc-result ' + cls; box.innerHTML = '';
    box.appendChild(el('div', 'st', status));
    var h = el('h2', '', title);
    if (guest && guest.version) h.appendChild(el('span', 'vip', guest.version));
    box.appendChild(h);
    (meta || []).forEach(function (m) { box.appendChild(el('div', 'meta', m)); });
    return box;
  }
  function guestMeta(g) {
    var m = [];
    if (g.group_name) m.push(g.group_name);
    if (g.table_name) m.push('Meja: ' + g.table_name);
    return m;
  }
  function handle(j) {
    var g = j.guest;
    if (j.status === 'ok') {
      beep('ok');
      if (j.station === 'booth') {
        showResult('ok', 'Photobooth · tercatat', g.name, guestMeta(g).concat('Sesi photobooth dimulai ' + hhmm(g.booth_at)), g);
        setActive(g);
      } else {
        var box = showResult('ok', 'Buku tamu · tercatat hadir', g.name, guestMeta(g).concat('Rencana ' + g.pax_limit + ' orang'), g);
        var row = el('div', 'sc-paxrow'); row.appendChild(el('span', '', 'Jumlah hadir:'));
        var inp = el('input'); inp.type = 'number'; inp.min = 1; inp.max = 50; inp.value = g.checked_in_pax || g.pax_limit; inp.setAttribute('aria-label', 'Jumlah hadir');
        var sv = el('button', 'sc-btn', 'Simpan'); sv.type = 'button';
        sv.addEventListener('click', function () {
          api('POST', '/pax', { guestId: g.id, pax: parseInt(inp.value, 10) }).then(function (r) { sv.textContent = 'Tersimpan ✓'; drawStats(r.stats); }).catch(function (e) { sv.textContent = e.message; });
        });
        row.appendChild(inp); row.appendChild(sv); box.appendChild(row);
      }
    } else if (j.status === 'duplicate') {
      beep('dup');
      var at = hhmm(j.at);
      showResult('dup', 'DITOLAK · QR sudah dipakai', g.name, guestMeta(g).concat('Sudah tercatat ' + (j.station === 'booth' ? 'di photobooth' : 'di buku tamu') + ' pukul ' + at + '. Satu QR hanya berlaku sekali.'), g);
      if (j.station === 'booth') setActive(g);
    } else {
      beep('bad');
      var msg = { notfound: 'Kode tidak dikenal.', wrong: 'QR ini milik acara lain.', disabled: 'Photobooth belum diaktifkan penyelenggara.', invalid: 'Pos tidak dikenal.' }[j.status] || 'Tidak dapat diproses.';
      showResult('bad', 'DITOLAK', msg, []);
    }
    if (j.stats) drawStats(j.stats);
    refresh();
  }

  function submit(payload) {
    if (busy) return Promise.resolve();
    busy = true;
    payload.station = station;
    return api('POST', '/scan', payload).then(handle).catch(function (e) { beep('bad'); showResult('bad', 'GAGAL', e.message, []); }).then(function () { busy = false; });
  }
  function scanCode(raw) {
    var now = Date.now();
    if (raw === lastCode && now - lastAt < 4000) return; // bingkai kamera yang sama jangan dikirim berulang
    lastCode = raw; lastAt = now;
    return submit({ code: raw });
  }

  $('#sc-form').addEventListener('submit', function (e) {
    e.preventDefault(); var v = $('#sc-code').value.trim(); if (!v) return;
    $('#sc-code').value = ''; lastCode = ''; submit({ code: v });
  });

  // ---- pencarian nama ----
  var qTimer;
  $('#sc-q').addEventListener('input', function (e) {
    clearTimeout(qTimer); var q = e.target.value.trim();
    var box = $('#sc-found');
    if (q.length < 2) { box.innerHTML = ''; return; }
    qTimer = setTimeout(function () {
      api('GET', '/search?q=' + encodeURIComponent(q)).then(function (j) {
        box.innerHTML = '';
        if (!j.guests.length) { box.appendChild(el('p', 'sc-hint', 'Tidak ada tamu bernama itu.')); return; }
        j.guests.forEach(function (g) {
          var row = el('div', 'sc-guest'); var left = el('div'); left.appendChild(el('strong', '', g.name));
          left.appendChild(el('small', '', [g.group_name, g.table_name, g.version].filter(Boolean).join(' · ') || ' '));
          row.appendChild(left);
          var doneAt = station === 'booth' ? g.booth_at : g.checked_in_at;
          if (doneAt) row.appendChild(el('span', 'done', '✓ ' + hhmm(doneAt)));
          else {
            var b = el('button', 'sc-btn', station === 'booth' ? 'Mulai sesi' : 'Catat hadir'); b.type = 'button';
            b.addEventListener('click', function () { lastCode = ''; submit({ guestId: g.id }).then(function () { b.replaceWith(el('span', 'done', '✓')); }); });
            row.appendChild(b);
          }
          box.appendChild(row);
        });
      }).catch(function (er) { box.innerHTML = ''; box.appendChild(el('p', 'sc-hint', er.message)); });
    }, 250);
  });

  // ---- tab pos ----
  $('#sc-tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-station]'); if (!b) return;
    station = b.dataset.station; lastCode = '';
    Array.prototype.forEach.call(document.querySelectorAll('#sc-tabs button'), function (x) { x.classList.toggle('active', x === b); });
    $('#sc-booth').hidden = station !== 'booth';
    $('#sc-found').innerHTML = ''; $('#sc-q').value = '';
    var r = $('#sc-result'); r.className = 'sc-result'; r.innerHTML = '';
    r.appendChild(el('p', 'muted', station === 'booth' ? 'Pos photobooth: pindai QR tamu untuk memulai sesinya.' : 'Pos buku tamu: pindai QR tamu untuk mencatat kehadiran.'));
    if (station === 'booth') loadThumbs();
  });

  // ---- photobooth: sesi aktif & unggah ----
  function setActive(g) {
    activeGuest = g;
    $('#sc-booth-who').textContent = 'Foto akan disimpan untuk: ' + g.name;
  }
  function loadThumbs() {
    api('GET', '/photos').then(function (j) {
      var box = $('#sc-thumbs'); box.innerHTML = '';
      j.photos.forEach(function (p) { var im = el('img'); im.loading = 'lazy'; im.alt = 'Foto ' + (p.guest_name || ''); im.src = BASE + '/media/' + p.id; im.title = p.guest_name || 'tanpa tamu'; box.appendChild(im); });
    }).catch(function () {});
  }
  $('#sc-upl').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files); e.target.value = '';
    if (!files.length) return;
    var msg = $('#sc-upl-msg'); msg.textContent = 'Mengunggah ' + files.length + ' foto…';
    var done = 0; var fail = '';
    var chunks = []; for (var i = 0; i < files.length; i += 10) chunks.push(files.slice(i, i + 10));
    chunks.reduce(function (p, ch) {
      return p.then(function () {
        var fd = new FormData(); ch.forEach(function (f) { fd.append('photos', f, f.name); });
        if (activeGuest) fd.append('guestId', activeGuest.id);
        return api('POST', '/photos', fd).then(function (j) { done += j.saved; });
      });
    }, Promise.resolve()).catch(function (er) { fail = er.message; }).then(function () {
      msg.textContent = done + ' foto tersimpan' + (activeGuest ? ' untuk ' + activeGuest.name : ' (tanpa tamu)') + (fail ? '. Gagal: ' + fail : '.');
      loadThumbs(); refresh();
    });
  });

  // ---- kamera ----
  var video = $('#sc-video'); var wrap = $('#sc-video-wrap'); var stream = null; var facing = 'environment'; var raf = 0;
  var canvas = document.createElement('canvas'); var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var detector = null;
  if (window.BarcodeDetector) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (_) { detector = null; } }
  var camHint = $('#sc-cam-hint');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $('#sc-start').disabled = true;
    $('#sc-off-text').textContent = 'Kamera tidak tersedia';
    camHint.textContent = (window.isSecureContext ? 'Peramban ini tidak mendukung kamera.' : 'Kamera hanya dapat dipakai lewat HTTPS.') + ' Gunakan kolom kode / pemindai USB di bawah.';
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0;
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null; wrap.classList.remove('on'); $('#sc-start').textContent = 'Aktifkan kamera'; $('#sc-flip').hidden = true;
  }
  function start() {
    stop(); camHint.textContent = '';
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false }).then(function (s) {
      stream = s; video.srcObject = s; return video.play();
    }).then(function () {
      wrap.classList.add('on'); $('#sc-start').textContent = 'Matikan kamera'; $('#sc-flip').hidden = false; loop();
    }).catch(function (e) {
      stop();
      camHint.textContent = e && e.name === 'NotAllowedError' ? 'Izin kamera ditolak. Izinkan kamera di pengaturan peramban.' : 'Kamera tidak dapat dibuka: ' + (e && e.message || e);
    });
  }
  var tick = 0;
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!stream || video.readyState < 2 || busy) return;
    var now = performance.now(); if (now - tick < 110) return; tick = now; // ±9 bingkai/detik
    if (detector) {
      detector.detect(video).then(function (codes) { if (codes && codes[0] && codes[0].rawValue) scanCode(codes[0].rawValue); }).catch(function () {});
      return;
    }
    var vw = video.videoWidth, vh = video.videoHeight; if (!vw) return;
    var k = Math.min(1, 640 / Math.max(vw, vh)); canvas.width = Math.round(vw * k); canvas.height = Math.round(vh * k);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var r = window.jsQR && window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    if (r && r.data) scanCode(r.data);
  }
  $('#sc-start').addEventListener('click', function () { if (stream) stop(); else start(); });
  $('#sc-flip').addEventListener('click', function () { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && stream) stop(); });

  if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) $('#sc-code').focus();
  refresh();
  setInterval(refresh, 15000);
})();
