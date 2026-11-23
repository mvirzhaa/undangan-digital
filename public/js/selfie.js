// Halaman swafoto tamu: ambil / pilih foto, perkecil di perangkat, lalu unggah ke galeri kegiatan.
(function () {
  'use strict';
  var data = JSON.parse(document.getElementById('ev-data').textContent);
  var metaTag = document.querySelector('meta[name="base-path"]');
  var basePath = (data && data.basePath) ||
    (metaTag && metaTag.content) ||
    (location.pathname.startsWith('/undangan-digital') ? '/undangan-digital' : '') ||
    '';
  var $ = function (s) { return document.querySelector(s); };
  var slug = data.slug;
  var store = { get: function (k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (_) {} } };

  // Perangkat yang pernah membuka link personal diingat agar langsung dikenali (tanpa mengetik nama).
  var qsTo = new URLSearchParams(data.qs || '').get('to') || '';
  if (qsTo) store.set('ud_to_' + slug, qsTo);
  var savedTo = store.get('ud_to_' + slug);
  if (!qsTo && savedTo && !data.knownGuest && !sessionStorage.getItem('ud_try_' + slug)) {
    try { sessionStorage.setItem('ud_try_' + slug, '1'); } catch (_) {}
    location.replace(location.pathname + '?to=' + encodeURIComponent(savedTo)); return;
  }
  if (!data.enabled) return;

  var nameInput = $('#uname'); var queueEl = $('#queue'); var sendBtn = $('#send'); var msg = $('#msg');
  if (nameInput) nameInput.value = store.get('ud_name_' + slug);
  var items = []; var busy = false;
  var MAX_SIDE = 1600;

  function say(text, cls) { msg.textContent = text; msg.className = 'form-msg' + (cls ? ' ' + cls : ''); }

  // Perkecil & ubah ke JPEG agar unggahan cepat di jaringan seluler. Bila gagal, kirim berkas aslinya.
  function shrink(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file); var im = new Image();
      im.onload = function () {
        try {
          var w = im.naturalWidth, h = im.naturalHeight; var k = Math.min(1, MAX_SIDE / Math.max(w, h));
          var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          c.toBlob(function (b) { URL.revokeObjectURL(url); resolve(b && b.size ? b : file); }, 'image/jpeg', 0.86);
        } catch (_) { URL.revokeObjectURL(url); resolve(file); }
      };
      im.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
      im.src = url;
    });
  }

  function draw() {
    queueEl.innerHTML = '';
    items.forEach(function (it, i) {
      var d = document.createElement('div'); d.className = 'q' + (it.state ? ' ' + it.state : '');
      var im = document.createElement('img'); im.alt = 'Foto ' + (i + 1); im.src = it.preview; d.appendChild(im);
      if (!it.state && !busy) {
        var x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Hapus foto');
        x.addEventListener('click', function () { items.splice(i, 1); draw(); }); d.appendChild(x);
      }
      queueEl.appendChild(d);
    });
    var pending = items.filter(function (it) { return !it.state || it.state === 'fail'; }).length;
    sendBtn.hidden = !pending; sendBtn.disabled = busy;
    sendBtn.textContent = busy ? 'Mengirim…' : 'Kirim ' + pending + ' foto';
  }

  function add(files) {
    var list = Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type) || !f.type; }).slice(0, 12 - items.length);
    if (!list.length) return;
    say('Menyiapkan foto…');
    Promise.all(list.map(function (f) { return shrink(f).then(function (b) { return { blob: b, preview: URL.createObjectURL(b), state: '' }; }); }))
      .then(function (res) { items = items.concat(res); say(''); draw(); });
  }
  $('#f-cam').addEventListener('change', function (e) { add(e.target.files); e.target.value = ''; });
  $('#f-pick').addEventListener('change', function (e) { add(e.target.files); e.target.value = ''; });

  sendBtn.addEventListener('click', function () {
    var name = nameInput ? nameInput.value.trim() : '';
    if (nameInput && !name) { say('Isi nama Anda dulu.', 'err'); nameInput.focus(); return; }
    var todo = items.filter(function (it) { return !it.state || it.state === 'fail'; });
    busy = true; draw(); say('');
    var batches = []; for (var i = 0; i < todo.length; i += 4) batches.push(todo.slice(i, i + 4));
    var sentTotal = 0; var lastUrl = '';
    batches.reduce(function (p, batch) {
      return p.then(function () {
        var fd = new FormData();
        batch.forEach(function (it, k) { fd.append('photos', it.blob, 'foto-' + k + '.jpg'); });
        if (name) fd.append('name', name);
        var to = qsTo || savedTo; if (to) fd.append('to', to);
        return fetch(basePath + '/api/public/' + encodeURIComponent(slug) + '/selfie', { method: 'POST', body: fd }).then(function (r) {
          return r.json().then(function (j) {
            if (!r.ok) { batch.forEach(function (it) { it.state = 'fail'; }); throw new Error(j.error || 'Gagal mengirim.'); }
            batch.forEach(function (it) { it.state = 'sent'; }); sentTotal += j.saved; lastUrl = j.galleryUrl; data.mine = j.mine; draw();
          });
        });
      });
    }, Promise.resolve()).then(function () {
      if (name) store.set('ud_name_' + slug, name);
      say(sentTotal + ' foto terkirim. Terima kasih!', 'ok');
      var after = $('#after'); after.hidden = false;
      $('#after-title').textContent = 'Terima kasih sudah berbagi!';
      $('#after-text').textContent = data.mine + ' foto Anda sudah masuk galeri.';
      if (lastUrl) $('#to-gallery').href = lastUrl;
    }).catch(function (e) { say(e.message, 'err'); }).then(function () { busy = false; draw(); });
  });
})();
