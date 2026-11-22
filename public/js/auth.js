(function () {
  'use strict';
  var metaTag = document.querySelector('meta[name="base-path"]');
  var basePath = (metaTag && metaTag.content) ||
    (location.pathname.startsWith('/undangan-digital') ? '/undangan-digital' : '') ||
    '';
  var form = document.getElementById('auth-form');
  var msg = form.querySelector('.form-msg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    msg.textContent = '';
    if (!form.reportValidity()) return;
    var body = {};
    new FormData(form).forEach(function (v, k) { body[k] = v; });
    var btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    fetch(basePath + '/api/auth/' + form.dataset.mode, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) { location.href = basePath + '/dashboard'; return; }
        msg.textContent = res.j.error || 'Terjadi kesalahan.';
        btn.disabled = false;
      })
      .catch(function () { msg.textContent = 'Tidak dapat terhubung ke server.'; btn.disabled = false; });
  });
})();
