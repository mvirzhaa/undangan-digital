(function () {
  'use strict';
  var boot = JSON.parse(document.getElementById('boot').textContent);
  var metaTag = document.querySelector('meta[name="base-path"]');
  var basePath = (boot && boot.basePath) ||
    (metaTag && metaTag.content) ||
    (location.pathname.startsWith('/undangan-digital') ? '/undangan-digital' : '') ||
    '';
  var $ = function (s) { return document.querySelector(s); };
  var list = $('#list');

  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML.replace(/"/g, '&quot;'); }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        if (r.status === 401) { location.href = basePath + '/login'; throw new Error('401'); }
        return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan'); return j; });
      });
  }
  function fmt(d) { return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); }

  function load() {
    api('GET', basePath + '/api/invitations').then(function (j) {
      if (!j.invitations.length) {
        list.innerHTML = '<div class="empty"><h3>Belum ada undangan</h3><p class="muted">Klik “Buat undangan” untuk memulai.</p></div>';
        return;
      }
      list.innerHTML = j.invitations.map(function (i) {
        var type = (boot.eventTypes[i.event_type] || {}).label || i.event_type;
        var photoUrl = i.photo ? (i.photo.startsWith('/uploads/') ? (basePath + i.photo) : i.photo) : '';
        var bg = photoUrl ? 'background-image:url(\'' + esc(photoUrl) + '\')' : '';
        return '<article class="inv-card">' +
          '<div class="inv-thumb" style="' + bg + '"><span class="badge ' + i.status + '">' + (i.status === 'published' ? 'Aktif' : 'Draf') + '</span></div>' +
          '<div class="inv-body"><small class="muted">' + esc(type) + '</small><h3>' + esc(i.title) + '</h3>' +
          '<p class="muted small">/' + esc(i.slug) + ' · diubah ' + fmt(i.updated_at) + '</p>' +
          '<div class="mini-stats"><span><b>' + i.guests + '</b> tamu</span><span><b>' + i.pax_hadir + '</b> hadir</span><span><b>' + i.wishes + '</b> ucapan</span><span><b>' + i.views + '</b> dilihat</span></div>' +
          '<div class="card-actions"><a class="btn primary small" href="' + basePath + '/editor/' + i.id + '">Edit</a>' +
          '<a class="btn small" target="_blank" rel="noopener" href="' + (i.status === 'published' ? basePath + '/' + esc(i.slug) : basePath + '/preview/' + i.id) + '">' + (i.status === 'published' ? 'Buka' : 'Pratinjau') + '</a>' +
          '<button class="btn small danger" data-del="' + i.id + '" data-title="' + esc(i.title) + '" type="button">Hapus</button></div></div></article>';
      }).join('');
    }).catch(function (e) { list.innerHTML = '<p class="form-msg err">' + esc(e.message) + '</p>'; });
  }

  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    if (!confirm('Hapus undangan "' + b.dataset.title + '" beserta semua tamu, RSVP, dan ucapan? Tindakan ini tidak bisa dibatalkan.')) return;
    api('DELETE', basePath + '/api/invitations/' + b.dataset.del).then(load).catch(function (err) { alert(err.message); });
  });

  // ----- dialog buat baru -----
  var dlg = $('#new-dialog');
  var form = $('#new-form');
  var msg = form.querySelector('.form-msg');
  $('#host-prefix').textContent = location.host + basePath + '/';
  $('#new-btn').addEventListener('click', function () { form.reset(); msg.textContent = ''; dlg.showModal(); });
  $('#cancel-new').addEventListener('click', function () { dlg.close(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.reportValidity()) return;
    var body = {};
    new FormData(form).forEach(function (v, k) { if (v) body[k] = v; });
    api('POST', basePath + '/api/invitations', body)
      .then(function (j) { location.href = basePath + '/editor/' + j.id; })
      .catch(function (err) { msg.className = 'form-msg err'; msg.textContent = err.message; });
  });

  $('#logout-btn').addEventListener('click', function () {
    api('POST', basePath + '/api/auth/logout').then(function () { location.href = basePath + '/'; });
  });

  load();
})();
