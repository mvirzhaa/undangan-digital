// Editor undangan: menu Dasbor / Tampilan / Isi / Tamu / Pengaturan dengan simpan otomatis & pratinjau langsung.
(function () {
  'use strict';

  var boot = JSON.parse(document.getElementById('boot').textContent);
  var metaTag = document.querySelector('meta[name="base-path"]');
  var basePath = (boot && boot.basePath) ||
    (metaTag && metaTag.content) ||
    (location.pathname.startsWith('/undangan-digital') ? '/undangan-digital' : '') ||
    '';
  var meta = boot.meta;
  var inv = boot.invitation;               // objek ini menjadi "state" yang diedit
  var API = basePath + '/api/invitations/' + inv.id;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var panel = $('#panel');
  var typeInfo = meta.eventTypes[inv.event_type] || meta.eventTypes.other;

  // ---------- util ----------
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function get(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function set(o, path, val) {
    var keys = path.split('.'); var last = keys.pop();
    var t = keys.reduce(function (a, k) { return a[k]; }, o);
    t[last] = val;
  }
  function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { location.href = basePath + '/login'; throw new Error('Sesi berakhir'); }
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Terjadi kesalahan'); return j; });
    });
  }
  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = 'toast'; }, 2800);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    return Promise.resolve();
  }
  var origin = location.origin;
  function inviteUrl(code) { return (boot.baseUrl || (origin + basePath)) + '/' + inv.slug + (code ? '?to=' + code : ''); }
  function fmtTime(d) { return d ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }

  // ---------- simpan otomatis ----------
  var dirty = false; var saveTimer; var saving = false; var queued = false;
  function setStatus(txt, err) { var s = $('#ed-status'); s.textContent = txt; s.classList.toggle('err', !!err); }
  function markDirty() { dirty = true; setStatus('Menyimpan…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 800); }
  function save() {
    if (saving) { queued = true; return Promise.resolve(); }
    saving = true; clearTimeout(saveTimer);
    var body = { title: inv.title, slug: inv.slug, theme: inv.theme, colors: inv.colors, fonts: inv.fonts, content: inv.content, settings: inv.settings, versions: inv.versions, status: inv.status };
    return api('PUT', API, body).then(function (j) {
      dirty = false; inv.updated_at = j.invitation.updated_at;
      if (j.invitation.slug !== inv.slug) inv.slug = j.invitation.slug;
      setStatus('Tersimpan'); reloadPreview();
    }).catch(function (e) { setStatus('Gagal menyimpan: ' + e.message, true); toast(e.message, true); })
      .then(function () { saving = false; if (queued) { queued = false; save(); } });
  }
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- pratinjau ----------
  var frame = $('#preview');
  var ANCHOR = { cover: 'cover', opening: 'opening', profile: 'hosts', family: 'family', detail: 'events', program: 'program', lineup: 'lineup', story: 'story', gallery: 'gallery', extra: 'dresscode', gift: 'gifts', info: 'info', partners: 'partners', music: 'cover', guest: 'rsvp', rsvp: 'rsvp', wishes: 'wishes', preset: 'cover', anim: 'cover', color: 'cover', font: 'cover' };
  var pvVersion = ''; var pvDemo = false; var lastPv = '';
  function pvUrl(anchor) { return basePath + '/preview/' + inv.id + '?' + (pvDemo ? 'demo=1' : 'open=1') + (pvVersion ? '&version=' + pvVersion : '') + (anchor ? '#' + anchor : ''); }
  function reloadPreview() {
    try {
      // Setelah mencoba animasi, simpan otomatis tidak boleh memutar animasinya lagi.
      if (/demo=1/.test(lastPv)) { lastPv = lastPv.replace('demo=1', 'open=1'); frame.contentWindow.location.replace(lastPv); return; }
      frame.contentWindow.location.reload();
    } catch (_) { frame.src = pvUrl(); }
  }
  function gotoPreview(anchor) {
    var url = pvUrl(anchor);
    if (url === lastPv) return;
    lastPv = url;
    if (frame.getAttribute('src') === 'about:blank') { frame.src = url; return; }
    try { frame.contentWindow.location.replace(url); } catch (_) { frame.src = url; }
  }
  $$('[data-device]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-device]').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('#preview-pane').dataset.device = b.dataset.device;
    });
  });
  $('#btn-preview-toggle').addEventListener('click', function () { $('#preview-pane').classList.toggle('open'); });

  // ---------- komponen form ----------
  function field(path, label, o) {
    o = o || {};
    var v = get(inv, path); if (v == null) v = '';
    var attrs = 'data-path="' + path + '"' + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '');
    var control;
    if (o.type === 'textarea') control = '<textarea ' + attrs + ' rows="' + (o.rows || 3) + '">' + esc(v) + '</textarea>';
    else if (o.type === 'select') {
      control = '<select ' + attrs + '>' + o.options.map(function (op) {
        return '<option value="' + esc(op[0]) + '"' + (String(op[0]) === String(v) ? ' selected' : '') + '>' + esc(op[1]) + '</option>';
      }).join('') + '</select>';
    } else if (o.type === 'color') control = '<input type="color" ' + attrs + ' value="' + esc(v || '#000000') + '">';
    else control = '<input type="' + (o.type || 'text') + '" ' + attrs + ' value="' + esc(v) + '"' + (o.min != null ? ' min="' + o.min + '"' : '') + (o.maxn != null ? ' max="' + o.maxn + '"' : '') + '>';
    return '<label class="f' + (o.cls ? ' ' + o.cls : '') + '"><span>' + esc(label) + '</span>' + control + (o.hint ? '<small class="muted">' + esc(o.hint) + '</small>' : '') + '</label>';
  }
  function toggle(path, label, hint) {
    return '<label class="switch"><input type="checkbox" data-path="' + path + '" data-bool' + (get(inv, path) ? ' checked' : '') + '><i></i><span>' + esc(label) +
      (hint ? '<small class="muted">' + esc(hint) + '</small>' : '') + '</span></label>';
  }
  function imageField(path, label) {
    var v = get(inv, path);
    return '<div class="f"><span>' + esc(label) + '</span><div class="img-field">' +
      (v ? '<img src="' + esc(v) + '" alt="">' : '<div class="img-ph">Belum ada foto</div>') +
      '<div><label class="btn small">Unggah foto<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden data-upload="' + path + '"></label>' +
      (v ? ' <button type="button" class="btn small" data-action="clear" data-path="' + path + '">Hapus</button>' : '') + '</div></div></div>';
  }
  function card(title, body, extra) {
    return '<section class="ed-card"><div class="ed-card-h"><h3>' + esc(title) + '</h3>' + (extra || '') + '</div>' + body + '</section>';
  }
  function pageHead(title, sub) { return '<div class="page-h"><h2>' + esc(title) + '</h2>' + (sub ? '<p class="muted">' + esc(sub) + '</p>' : '') + '</div>'; }
  function removeBtn(path, i) { return '<button type="button" class="btn small danger" data-action="remove" data-path="' + path + '" data-index="' + i + '">Hapus</button>'; }
  function addBtn(path, label) { return '<button type="button" class="btn small" data-action="add" data-path="' + path + '">+ ' + esc(label) + '</button>'; }

  var NEW_ITEM = {
    'content.hosts': function () { return { role: '', name: '', title: '', parents: '', instagram: '', photo: '', bio: '' }; },
    'content.events': function () { return { name: '', date: '', start: '', end: '', tz: 'WIB', venue: '', address: '', mapsUrl: '' }; },
    'content.story': function () { return { date: '', title: '', text: '' }; },
    'content.gifts.accounts': function () { return { bank: '', number: '', name: '', qris: '' }; },
    'content.rsvp.menus': function () { return ''; },
    'content.dresscode.colors': function () { return '#000000'; },
    'content.program.items': function () { return { time: '', title: '', text: '' }; },
    'content.lineup.items': function () { return { name: '', role: '', photo: '', text: '' }; },
    'content.info.items': function () { return { title: '', text: '' }; },
    'content.partners.items': function () { return { name: '', logo: '', url: '' }; },
  };
  var LIMITS = { 'content.hosts': typeInfo.host.max || 6, 'content.events': 8, 'content.story': 10, 'content.gifts.accounts': 8, 'content.rsvp.menus': 10, 'content.dresscode.colors': 6, 'content.program.items': 20, 'content.lineup.items': 12, 'content.info.items': 10, 'content.partners.items': 12 };
  function menuLabel(key) { var m = typeInfo.menu.find(function (x) { return x[0] === key; }); return m ? m[1] : key; }
  function allows(sec) { return typeInfo.sections.indexOf(sec) >= 0; }
  function rid() { return 'v' + Math.random().toString(36).slice(2, 8).padEnd(6, '0'); }
  inv.versions = inv.versions || [];

  // ---------- menu ----------
  function menuTree() {
    return [
      { key: 'dashboard', label: 'Dasbor', forms: [['dashboard', 'Dasbor']] },
      { key: 'theme', label: 'Tampilan', forms: [['preset', 'Template'], ['anim', 'Animasi pembuka'], ['color', 'Warna'], ['font', 'Jenis tulisan']] },
      { key: 'data', label: 'Isi undangan', forms: typeInfo.menu },
      { key: 'version', label: 'Versi undangan', forms: [['list', 'Versi undangan']] },
      { key: 'guest', label: 'Tamu', forms: [['guest', 'Daftar tamu'], ['rsvp', 'Kehadiran (RSVP)'], ['checkin', 'Buku tamu / check-in'], ['wishes', 'Ucapan & doa']] },
      { key: 'setting', label: 'Pengaturan', forms: [['general', 'Umum'], ['sections', 'Bagian & privasi'], ['rsvpset', 'RSVP & ucapan'], ['danger', 'Lanjutan']] },
    ];
  }
  var cur = { menu: 'dashboard', form: 'dashboard' };
  var openMenu = 'dashboard';

  function renderSide() {
    $('#side').innerHTML = menuTree().map(function (m) {
      var open = openMenu === m.key;
      var single = m.forms.length === 1;
      return '<div class="side-group' + (open ? ' open' : '') + '"><button type="button" class="side-parent' + (open && single ? ' active' : '') + '" data-menu="' + m.key + '" data-form="' + m.forms[0][0] + '">' + esc(m.label) + (single ? '' : '<i>›</i>') + '</button>' +
        (single ? '' : '<div class="side-children">' + m.forms.map(function (f) {
          return '<button type="button" class="side-child' + (cur.menu === m.key && cur.form === f[0] ? ' active' : '') + '" data-menu="' + m.key + '" data-form="' + f[0] + '">' + esc(f[1]) + '</button>';
        }).join('') + '</div>') + '</div>';
    }).join('');
  }
  $('#side').addEventListener('click', function (e) {
    var b = e.target.closest('[data-menu]'); if (!b) return;
    var group = menuTree().find(function (m) { return m.key === b.dataset.menu; });
    var isParent = b.classList.contains('side-parent');
    if (isParent && group.forms.length > 1 && openMenu === group.key) { openMenu = ''; renderSide(); return; } // lipat grup
    go(b.dataset.menu, b.dataset.form);
  });

  function go(menu, form, skipPush) {
    cur = { menu: menu, form: form }; openMenu = menu;
    if (!skipPush) history.replaceState(null, '', '?main_menu=' + menu + '&form=' + form);
    renderSide(); renderPanel();
    $('#preview-pane').classList.remove('open');
    if (menu !== 'version' && pvVersion) pvVersion = '';
    gotoPreview(ANCHOR[form] || null);
  }

  // ---------- halaman ----------
  var PAGES = {};

  // Dasbor
  PAGES['dashboard/dashboard'] = function () {
    var c = inv.content;
    var steps = [
      ['Unggah foto sampul', !!c.cover.photo, 'data', 'cover'],
      ['Pilih template & animasi', true, 'theme', 'preset'],
      ['Tulis kata pembuka', !!c.opening.text, 'data', 'opening'],
      ['Isi profil ' + typeInfo.hostsMenu.toLowerCase(), c.hosts.length > 0 && c.hosts.every(function (h) { return h.name && !/^Nama /.test(h.name); }), 'data', 'profile'],
      ['Atur jadwal & lokasi', c.events.length > 0 && c.events.every(function (e) { return e.date && e.venue && e.venue !== 'Nama Tempat' && e.address && !/^Alamat lengkap/.test(e.address); }), 'data', 'detail'],
      ['Pilih lagu latar', !!c.music.url, 'data', 'music'],
    ];
    var done = steps.filter(function (s) { return s[1]; }).length;
    var html = '<div class="hero-card"><div class="ring">' + esc(typeInfo.label) + '</div><h2>' + esc(inv.title) + '</h2>' +
      '<div class="link-row"><code id="share-link">' + esc(inviteUrl()) + '</code><button type="button" class="btn small" data-action="copy-link">Salin</button>' +
      '<a class="btn small" target="_blank" rel="noopener" href="' + (inv.status === 'published' ? (basePath + '/' + esc(inv.slug)) : (basePath + '/preview/' + inv.id)) + '">Buka ↗</a></div>' +
      '<div class="hero-actions"><button type="button" class="btn small" data-action="share">Bagikan undangan</button><button type="button" class="btn small" data-go="theme/preset">Ganti template</button></div></div>';
    html += '<div class="banner ' + (inv.status === 'published' ? 'ok' : 'warn') + '"><div><strong>' + (inv.status === 'published' ? 'Undangan sudah aktif' : 'Undangan belum aktif') + '</strong><p>' +
      (inv.status === 'published' ? 'Siapa pun yang punya link bisa membukanya' + (inv.settings.privateMode ? ' (mode privat: hanya lewat link tamu).' : '.') : 'Hanya Anda yang bisa melihatnya lewat pratinjau. Aktifkan bila sudah siap dibagikan.') +
      '</p></div><button type="button" class="btn small ' + (inv.status === 'published' ? '' : 'primary') + '" data-action="toggle-publish">' + (inv.status === 'published' ? 'Nonaktifkan' : 'Aktifkan') + '</button></div>';
    html += card('Persiapan undangan', '<p class="muted">' + done + ' dari ' + steps.length + ' langkah selesai</p><div class="progress"><i style="width:' + Math.round(done / steps.length * 100) + '%"></i></div><ul class="checklist">' +
      steps.map(function (s) { return '<li class="' + (s[1] ? 'done' : '') + '"><button type="button" data-go="' + s[2] + '/' + s[3] + '"><span class="tick">' + (s[1] ? '✓' : '') + '</span>' + esc(s[0]) + '<i>›</i></button></li>'; }).join('') + '</ul>');
    html += '<div id="stats-box"></div>';
    html += card('Menu cepat', '<div class="quick">' +
      [['Template', 'theme/preset'], ['Animasi', 'theme/anim'], ['Versi VIP', 'version/list'], ['Tamu', 'guest/guest'], ['RSVP', 'guest/rsvp'], ['Check-in', 'guest/checkin'], ['Ucapan', 'guest/wishes']].map(function (q) {
        return '<button type="button" class="btn" data-go="' + q[1] + '">' + q[0] + '</button>';
      }).join('') + '</div>');
    return { html: html, after: loadStats };
  };
  function loadStats() {
    api('GET', API + '/stats').then(function (s) {
      var box = $('#stats-box'); if (!box) return;
      box.innerHTML = card('Statistik undangan', '<div class="stats">' +
        stat(s.rsvp.hadir.pax, 'Tamu konfirmasi hadir', s.rsvp.hadir.n + ' jawaban') + stat(s.wishes.total, 'Doa & ucapan', s.wishes.pending ? s.wishes.pending + ' menunggu' : '') +
        stat(s.guests.total, 'Daftar tamu', s.guests.opened + ' sudah membuka') + stat(s.guests.checked_in, 'Check-in', s.guests.checked_in_pax + ' orang') + stat(s.views, 'Dilihat', '') + '</div>');
    }).catch(function () {});
  }
  function stat(n, label, sub) { return '<div class="stat"><b>' + n + '</b><span>' + esc(label) + '</span>' + (sub ? '<small class="muted">' + esc(sub) + '</small>' : '') + '</div>'; }

  // Tampilan: template (hanya yang cocok dengan jenis acara)
  function openerName(k) { var o = meta.openers.find(function (x) { return x.key === k; }); return o ? o.name : 'Tanpa animasi'; }
  function fxName(k) { var o = meta.effects.find(function (x) { return x.key === k; }); return o ? o.name : 'Tanpa efek'; }
  PAGES['theme/preset'] = function () {
    var list = meta.themes.filter(function (t) { return t.types.indexOf(inv.event_type) >= 0; });
    var cur = meta.themes.find(function (t) { return t.key === inv.theme; });
    var html = pageHead('Template ' + typeInfo.label, 'Ada ' + list.length + ' template untuk jenis acara ini. Ketuk salah satu untuk mencobanya langsung di pratinjau; warna & font ikut berganti, animasi pembuka mengikuti template kecuali Anda memilihnya sendiri.') +
      '<div class="ed-card current-theme"><div><small class="muted">SEDANG DIPAKAI</small><h3>' + esc(cur ? cur.name : inv.theme) + '</h3></div><button type="button" class="btn small" data-go="theme/anim">Atur animasi</button></div>' +
      '<div class="theme-grid">' + list.map(function (t) {
        return '<button type="button" class="theme-card' + (t.key === inv.theme ? ' active' : '') + '" data-theme="' + t.key + '" style="background:' + t.colors.bg + ';color:' + t.colors.text + '">' +
          '<span class="tc-sw"><i style="background:' + t.colors.primary + '"></i><i style="background:' + t.colors.accent + '"></i></span>' +
          '<strong style="font-family:\'' + esc(t.fonts.heading) + '\',serif">' + esc(t.name) + '</strong><small>' + esc(t.blurb) + '</small>' +
          '<span class="tc-tags"><em>▶ ' + esc(openerName(t.opener)) + '</em>' + (t.fx ? '<em>✦ ' + esc(fxName(t.fx)) + '</em>' : '') + '</span></button>';
      }).join('') + '</div>';
    return { html: html };
  };

  PAGES['theme/anim'] = function () {
    var th = meta.themes.find(function (t) { return t.key === inv.theme; }) || {};
    var o = inv.settings.opener || ''; var f = inv.settings.fx || '';
    function opt(group, key, title, desc, val) {
      return '<button type="button" class="opt-card' + (val === key ? ' active' : '') + '" data-anim="' + group + ':' + key + '"><strong>' + esc(title) + '</strong><small>' + esc(desc || '') + '</small></button>';
    }
    var html = pageHead('Animasi pembuka', 'Animasi yang tampil saat tamu menekan tombol buka: amplop, buku, kartu membalik, pintu, tirai, dan lainnya.') +
      card('Coba sekarang', '<p class="muted">Pratinjau di sebelah kanan akan memutar ulang animasi dari awal.</p><button type="button" class="btn primary" data-action="try-anim">▶ Coba animasi</button>') +
      card('Gaya animasi pembuka', '<div class="opt-grid">' + opt('opener', '', 'Ikuti template', openerName(th.opener), o) +
        meta.openers.map(function (x) { return opt('opener', x.key, x.name, x.desc, o); }).join('') + opt('opener', 'none', 'Tanpa animasi', 'Tombol buka langsung di sampul', o) + '</div>') +
      card('Efek latar', '<div class="opt-grid">' + opt('fx', '', 'Ikuti template', th.fx ? fxName(th.fx) : 'Tanpa efek', f) +
        meta.effects.map(function (x) { return opt('fx', x.key, x.name, '', f); }).join('') + opt('fx', 'none', 'Tanpa efek', '', f) + '</div>' +
        '<p class="muted">Efek tampil setelah undangan dibuka. Pengguna dengan pengaturan “kurangi gerakan” tidak melihat animasi.</p>');
    return { html: html };
  };

  PAGES['theme/color'] = function () {
    var html = pageHead('Warna', 'Pilih palet siap pakai atau atur warna sendiri.') +
      card('Palet', '<div class="palette-row">' + meta.palettes.map(function (p, i) {
        return '<button type="button" class="palette" data-palette="' + i + '" title="' + esc(p.name) + '"><i style="background:' + p.colors.primary + '"></i><i style="background:' + p.colors.accent + '"></i><i style="background:' + p.colors.bg + '"></i><span>' + esc(p.name) + '</span></button>';
      }).join('') + '</div>') +
      card('Warna kustom', '<div class="grid2">' +
        field('colors.primary', 'Warna utama (tombol, judul kecil)', { type: 'color' }) + field('colors.accent', 'Warna aksen', { type: 'color' }) +
        field('colors.bg', 'Latar halaman', { type: 'color' }) + field('colors.text', 'Warna teks', { type: 'color' }) + '</div>');
    return { html: html };
  };

  PAGES['theme/font'] = function () {
    var opts = meta.fonts.map(function (f) { return [f, f]; });
    var html = pageHead('Jenis tulisan') + card('Font', '<div class="grid2">' +
      field('fonts.heading', 'Judul & nama', { type: 'select', options: opts }) + field('fonts.body', 'Paragraf', { type: 'select', options: opts }) + '</div>' +
      '<p class="muted">Pratinjau di sebelah kanan akan menyesuaikan setelah tersimpan.</p>');
    return { html: html };
  };

  // Isi: sampul
  PAGES['data/cover'] = function () {
    return { html: pageHead(menuLabel('cover'), 'Bagian pertama yang dilihat tamu. Nama tamu otomatis tampil di sampul.') +
      card('Teks sampul', field('content.cover.label', 'Label atas', { max: 80 }) + field('content.cover.title', 'Judul utama', { max: 120, hint: 'Contoh: nama mempelai / nama acara' }) +
        field('content.cover.subtitle', 'Subjudul', { type: 'textarea', rows: 2, max: 300 }) + field('content.cover.buttonText', 'Teks tombol', { max: 40 })) +
      card('Foto sampul', imageField('content.cover.photo', 'Foto latar sampul') + '<p class="muted">Gunakan foto berorientasi potret. Maksimal 6 MB (JPG, PNG, WebP).</p>') };
  };
  PAGES['data/opening'] = function () {
    var o = inv.content.opening; var ar = typeInfo.arabic;
    var body = '';
    if (ar) {
      body += card('Ayat / doa berbahasa Arab', '<div class="row"><button type="button" class="btn small primary" data-action="ar-rum">Pakai QS. Ar-Rum: 21 (bawaan)</button>' +
        '<button type="button" class="btn small" data-action="ar-clear">Kosongkan</button></div>' +
        toggle('content.opening.showArabic', 'Tampilkan teks Arab di undangan', 'Matikan bila tidak ingin memakai ayat Arab.') +
        '<label class="f"><span>Teks Arab</span><textarea data-path="content.opening.arabic" rows="4" dir="rtl" lang="ar" maxlength="1200" style="font-size:1.25rem;line-height:2">' + esc(o.arabic) + '</textarea></label>' +
        (o.arabic === meta.arRum21.arabic ? '<p class="muted">Teks Arab: QS. Ar-Rum ayat 21 (bawaan).</p>' : ''));
    }
    body += card(ar ? 'Terjemahan / kata pembuka' : 'Kata pembuka', (ar ? toggle('content.opening.showText', 'Tampilkan terjemahan / teks pembuka di undangan', 'Bahasa Indonesia. Bisa dimatikan bila hanya ingin menampilkan teks Arab.') : '') +
      field('content.opening.text', ar ? 'Terjemahan / kalimat pembuka' : 'Isi kata pembuka', { type: 'textarea', rows: 6, max: 1500, hint: 'Baris baru ikut tampil.' }) +
      field('content.opening.source', 'Sumber / keterangan (opsional)', { max: 200, ph: ar ? 'mis. QS. Ar-Rum: 21' : '' }));
    return { html: pageHead(menuLabel('opening'), ar ? 'Tampil tepat setelah sampul. Untuk pernikahan, QS. Ar-Rum: 21 (Arab dan terjemahan Indonesia) sudah terisi dan masing-masing bisa dipakai atau dimatikan.' : 'Tampil tepat setelah sampul: sapaan, kutipan, atau pengantar singkat.') + body };
  };

  PAGES['data/profile'] = function () {
    var hc = typeInfo.host;
    var hosts = inv.content.hosts.map(function (h, i) {
      var p = 'content.hosts.' + i;
      return '<div class="item"><div class="item-h"><strong>' + esc(h.name || 'Profil ' + (i + 1)) + '</strong>' + removeBtn('content.hosts', i) + '</div><div class="grid2">' +
        field(p + '.role', hc.role, { max: 60, ph: 'mis. ' + (inv.event_type === 'wedding' ? 'Mempelai Wanita' : inv.event_type === 'birthday' ? 'Yang Berulang Tahun' : 'Hosted by') }) + field(p + '.name', hc.name, { max: 120 }) +
        (hc.title ? field(p + '.title', hc.title, { max: 80 }) : '') + (hc.instagram ? field(p + '.instagram', hc.instagram, { max: 60, ph: 'tanpa @' }) : '') + '</div>' +
        (hc.parents ? field(p + '.parents', hc.parents, { max: 200, ph: hc.parentsPh || '' }) : '') +
        (hc.bio ? field(p + '.bio', hc.bio, { type: 'textarea', rows: 2, max: 500 }) : '') + imageField(p + '.photo', 'Foto') + '</div>';
    }).join('');
    return { html: pageHead(menuLabel('profile'), 'Perkenalkan pihak yang mengundang.') +
      card('Judul bagian', field('content.hostsHeading', 'Judul', { max: 80 })) +
      card('Daftar profil', hosts + (inv.content.hosts.length < hc.max ? addBtn('content.hosts', 'Tambah profil') : '')) };
  };

  PAGES['data/family'] = function () {
    return { html: pageHead(menuLabel('family'), 'Keluarga atau pihak yang turut mengundang, tampil setelah profil.') +
      card('Tampilkan', toggle('settings.sections.family', 'Tampilkan bagian “Turut mengundang”')) +
      card('Isi', field('content.family.heading', 'Judul', { max: 80 }) + field('content.family.text', 'Nama keluarga / pihak', { type: 'textarea', rows: 5, max: 800, hint: 'Satu baris per keluarga.' })) };
  };

  function listPage(key, path, title, hint, itemFn, newLabel, max) {
    var items = get(inv, path + '.items').map(function (it, i) { return itemFn(it, i, path + '.items.' + i); }).join('');
    return { html: pageHead(menuLabel(key), hint) +
      card('Tampilkan', toggle('settings.sections.' + key, 'Tampilkan bagian ini di undangan') + field(path + '.heading', 'Judul bagian', { max: 80 })) +
      card(title, items + (get(inv, path + '.items').length < max ? addBtn(path + '.items', newLabel) : '')) };
  }
  PAGES['data/program'] = function () {
    return listPage('program', 'content.program', 'Urutan acara', 'Susunan acara per jam.', function (it, i, p) {
      return '<div class="item"><div class="item-h"><strong>' + esc(it.title || 'Sesi ' + (i + 1)) + '</strong>' + removeBtn('content.program.items', i) + '</div><div class="grid2">' +
        field(p + '.time', 'Jam', { type: 'time' }) + field(p + '.title', 'Kegiatan', { max: 100 }) + '</div>' + field(p + '.text', 'Keterangan (opsional)', { max: 300 }) + '</div>';
    }, 'Tambah sesi', 20);
  };
  PAGES['data/lineup'] = function () {
    return listPage('lineup', 'content.lineup', 'Daftar', 'Bintang tamu, pembicara, atau tamu kehormatan lengkap dengan foto.', function (it, i, p) {
      return '<div class="item"><div class="item-h"><strong>' + esc(it.name || 'Orang ' + (i + 1)) + '</strong>' + removeBtn('content.lineup.items', i) + '</div><div class="grid2">' +
        field(p + '.name', 'Nama', { max: 100 }) + field(p + '.role', 'Peran', { max: 100, ph: 'mis. Guest performer' }) + '</div>' + field(p + '.text', 'Keterangan (opsional)', { max: 300 }) + imageField(p + '.photo', 'Foto') + '</div>';
    }, 'Tambah orang', 12);
  };
  PAGES['data/info'] = function () {
    return listPage('info', 'content.info', 'Butir informasi', 'Hal yang perlu diketahui tamu: parkir, ketentuan masuk, bawaan, dll.', function (it, i, p) {
      return '<div class="item"><div class="item-h"><strong>' + esc(it.title || 'Info ' + (i + 1)) + '</strong>' + removeBtn('content.info.items', i) + '</div>' +
        field(p + '.title', 'Judul', { max: 100 }) + field(p + '.text', 'Isi', { type: 'textarea', rows: 2, max: 400 }) + '</div>';
    }, 'Tambah info', 10);
  };
  PAGES['data/partners'] = function () {
    return listPage('partners', 'content.partners', 'Sponsor & mitra', 'Logo atau nama sponsor. Tautan harus diawali https://', function (it, i, p) {
      return '<div class="item"><div class="item-h"><strong>' + esc(it.name || 'Mitra ' + (i + 1)) + '</strong>' + removeBtn('content.partners.items', i) + '</div><div class="grid2">' +
        field(p + '.name', 'Nama', { max: 100 }) + field(p + '.url', 'Tautan (opsional)', { max: 1000, ph: 'https://…' }) + '</div>' + imageField(p + '.logo', 'Logo (opsional)') + '</div>';
    }, 'Tambah mitra', 12);
  };

  PAGES['data/detail'] = function () {
    var events = inv.content.events.map(function (e, i) {
      var p = 'content.events.' + i;
      return '<div class="item"><div class="item-h"><strong>' + esc(e.name || 'Acara ' + (i + 1)) + '</strong>' + removeBtn('content.events', i) + '</div>' +
        field(p + '.name', 'Nama sesi acara', { max: 80, ph: 'mis. Akad Nikah, Resepsi, Red Carpet' }) +
        '<div class="grid3">' + field(p + '.date', 'Tanggal', { type: 'date' }) + field(p + '.start', 'Mulai', { type: 'time' }) + field(p + '.end', 'Selesai', { type: 'time', hint: 'Kosongkan = sampai selesai' }) + '</div>' +
        field(p + '.tz', 'Zona waktu', { type: 'select', options: [['WIB', 'WIB (UTC+7)'], ['WITA', 'WITA (UTC+8)'], ['WIT', 'WIT (UTC+9)']] }) +
        field(p + '.venue', 'Nama tempat', { max: 120 }) + field(p + '.address', 'Alamat lengkap', { type: 'textarea', rows: 2, max: 300, hint: 'Peta dibuat otomatis dari nama tempat + alamat.' }) +
        field(p + '.mapsUrl', 'Link Google Maps (opsional)', { max: 1000, ph: 'https://maps.app.goo.gl/…', hint: 'Dipakai untuk tombol “Buka di Google Maps”. Harus diawali https://' }) + '</div>';
    }).join('');
    return { html: pageHead(menuLabel('detail'), 'Atur waktu, tempat, dan hitung mundur.') +
      card('Hitung mundur', field('content.countdownTitle', 'Judul hitung mundur', { max: 80 }) + '<p class="muted">Menghitung mundur ke sesi acara paling awal.</p>') +
      card('Sesi acara', events + (inv.content.events.length < 8 ? addBtn('content.events', 'Tambah sesi acara') : '')) };
  };

  PAGES['data/story'] = function () {
    var items = inv.content.story.map(function (s, i) {
      var p = 'content.story.' + i;
      return '<div class="item"><div class="item-h"><strong>' + esc(s.title || 'Momen ' + (i + 1)) + '</strong>' + removeBtn('content.story', i) + '</div><div class="grid2">' +
        field(p + '.date', 'Waktu', { max: 40, ph: 'mis. 2019' }) + field(p + '.title', 'Judul', { max: 100 }) + '</div>' + field(p + '.text', 'Cerita', { type: 'textarea', rows: 3, max: 600 }) + '</div>';
    }).join('');
    return { html: pageHead(menuLabel('story'), 'Linimasa kisah atau perjalanan (opsional).') +
      card('Tampilkan', toggle('settings.sections.story', 'Tampilkan bagian cerita di undangan')) +
      card('Momen', items + (inv.content.story.length < 10 ? addBtn('content.story', 'Tambah momen') : '')) };
  };

  PAGES['data/gallery'] = function () {
    var imgs = inv.content.gallery.map(function (g, i) {
      return '<div class="gal-item"><img src="' + esc(g) + '" alt=""><button type="button" class="x" data-action="remove" data-path="content.gallery" data-index="' + i + '" aria-label="Hapus foto">×</button></div>';
    }).join('');
    return { html: pageHead('Galeri', 'Maksimal 24 foto.') + card('Tampilkan', toggle('settings.sections.gallery', 'Tampilkan galeri di undangan')) +
      card('Foto (' + inv.content.gallery.length + '/24)', '<div class="gal">' + imgs + '</div>' +
        '<label class="btn small">Unggah foto<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-upload-push="content.gallery"></label>') };
  };

  PAGES['data/extra'] = function () {
    var cols = inv.content.dresscode.colors.map(function (c, i) {
      return '<span class="col-item"><input type="color" data-path="content.dresscode.colors.' + i + '" value="' + esc(c) + '">' + removeBtn('content.dresscode.colors', i) + '</span>';
    }).join('');
    var html = pageHead(menuLabel('extra'));
    if (allows('dresscode')) {
      html += card('Dresscode / tema', toggle('settings.sections.dresscode', 'Tampilkan bagian ini') + field('content.dresscode.text', 'Keterangan', { type: 'textarea', rows: 3, max: 500 }) +
        '<div class="f"><span>Warna yang disarankan</span><div class="cols">' + cols + (inv.content.dresscode.colors.length < 6 ? addBtn('content.dresscode.colors', 'Warna') : '') + '</div></div>');
    }
    return { html: html + card('Penutup', field('content.closing.text', 'Kalimat penutup', { type: 'textarea', rows: 3, max: 800 }) + field('content.closing.signature', 'Tanda tangan / nama', { max: 120 })) };
  };

  PAGES['data/gift'] = function () {
    var accs = inv.content.gifts.accounts.map(function (a, i) {
      var p = 'content.gifts.accounts.' + i;
      return '<div class="item"><div class="item-h"><strong>' + esc(a.bank || 'Rekening ' + (i + 1)) + '</strong>' + removeBtn('content.gifts.accounts', i) + '</div><div class="grid3">' +
        field(p + '.bank', 'Bank / e-wallet', { max: 60 }) + field(p + '.number', 'Nomor', { max: 60 }) + field(p + '.name', 'Atas nama', { max: 100 }) + '</div>' + imageField(p + '.qris', 'Gambar QRIS (opsional)') + '</div>';
    }).join('');
    return { html: pageHead(menuLabel('gift'), 'Rekening atau alamat untuk tamu yang ingin memberi tanda kasih.') +
      card('Tampilkan', toggle('settings.sections.gifts', 'Tampilkan bagian hadiah')) +
      card('Rekening & e-wallet', accs + (inv.content.gifts.accounts.length < 8 ? addBtn('content.gifts.accounts', 'Tambah rekening') : '')) +
      card('Alamat kado', field('content.gifts.receiver', 'Nama penerima', { max: 100 }) + field('content.gifts.address', 'Alamat', { type: 'textarea', rows: 2, max: 300 })) };
  };

  PAGES['data/music'] = function () {
    var m = inv.content.music;
    return { html: pageHead('Musik latar', 'Diputar setelah tamu menekan tombol buka undangan.') +
      card('Lagu', (m.url ? '<audio controls src="' + esc(m.url) + '" style="width:100%"></audio>' : '<p class="muted">Belum ada lagu.</p>') +
        '<div class="row"><label class="btn small">Unggah MP3/OGG/WAV/M4A<input type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/x-m4a" hidden data-upload="content.music.url" data-kind="audio"></label>' +
        (m.url ? '<button type="button" class="btn small" data-action="clear" data-path="content.music.url">Hapus</button>' : '') + '</div>' +
        field('content.music.url', 'atau tempel link audio (https://…)', { max: 1000 }) + field('content.music.title', 'Judul lagu (opsional)', { max: 100 }) +
        toggle('settings.musicAutoplay', 'Putar otomatis saat undangan dibuka', 'Sebagian browser tetap memblokir autoplay.') +
        '<p class="muted">Pastikan Anda berhak memakai lagu tersebut. Maksimal 12 MB.</p>') };
  };

  // Tamu: daftar
  var guestCache = []; var selGuests = {}; var guestVer = '';
  function verName(id) { var v = inv.versions.find(function (x) { return x.id === id; }); return v ? v.name : 'Standar'; }
  PAGES['guest/guest'] = function () {
    return { html: pageHead('Daftar tamu', 'Setiap tamu punya link personal agar namanya tampil di sampul dan RSVP-nya tercatat. Tamu bisa diberi versi undangan berbeda (mis. VIP).') +
      '<div class="toolbar"><button type="button" class="btn primary small" data-action="guest-add">+ Tambah tamu</button><button type="button" class="btn small" data-action="guest-import">Impor Excel</button>' +
      '<a class="btn small" href="' + API + '/export/guests.xlsx">Ekspor Excel</a><a class="btn small" href="' + API + '/guests/template.xlsx">Unduh template</a><input type="search" id="guest-q" placeholder="Cari nama…" class="search"></div>' +
      '<div id="guest-area" class="ed-card"><p class="muted">Memuat…</p></div>', after: loadGuests };
  };
  function loadGuests() {
    return api('GET', API + '/guests').then(function (j) { guestCache = j.guests; selGuests = {}; drawGuests(); });
  }
  function waLink(g) {
    var tpl = inv.settings.waTemplate || 'Halo {nama}, berikut undangan kami: {link}';
    var msg = tpl.replace(/\{nama\}/g, g.name).replace(/\{link\}/g, inviteUrl(g.code));
    var ph = (g.phone || '').replace(/[^\d]/g, '');
    if (ph.indexOf('0') === 0) ph = '62' + ph.slice(1);
    return 'https://wa.me/' + ph + '?text=' + encodeURIComponent(msg);
  }
  var KIND_LABEL = { individual: 'Individu', group: 'Grup', private: 'Privat' };
  function verOptions(sel, withKeep) {
    return (withKeep ? '<option value="__keep">Pilih versi…</option>' : '') + '<option value=""' + (sel === '' ? ' selected' : '') + '>Standar</option>' +
      inv.versions.map(function (v) { return '<option value="' + esc(v.id) + '"' + (sel === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('');
  }
  function drawGuests() {
    var area = $('#guest-area'); if (!area) return;
    var q = (($('#guest-q') || {}).value || '').toLowerCase();
    var list = guestCache.filter(function (g) {
      if (guestVer !== '' && (guestVer === '__std' ? g.version_id : g.version_id !== guestVer)) return false;
      return !q || g.name.toLowerCase().indexOf(q) >= 0 || (g.group_name || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!guestCache.length) { area.innerHTML = '<div class="empty"><h3>Belum ada tamu</h3><p class="muted">Tambahkan satu per satu atau impor dari file Excel (.xlsx). Unduh template untuk format yang benar.</p></div>'; return; }
    var nSel = Object.keys(selGuests).length;
    var filter = inv.versions.length ? '<select id="guest-vf" class="search" style="margin:0"><option value="">Semua versi</option><option value="__std"' + (guestVer === '__std' ? ' selected' : '') + '>Standar</option>' +
      inv.versions.map(function (v) { return '<option value="' + esc(v.id) + '"' + (guestVer === v.id ? ' selected' : '') + '>' + esc(v.name) + '</option>'; }).join('') + '</select>' : '';
    var bulk = nSel ? '<div class="bulk"><strong>' + nSel + ' dipilih</strong>' + (inv.versions.length ? '<select id="bulk-ver">' + verOptions('__keep', true) + '</select><button type="button" class="btn small primary" data-action="bulk-ver">Terapkan versi</button>' : '') +
      '<button type="button" class="btn small danger" data-action="bulk-del">Hapus</button></div>' : '';
    area.innerHTML = '<p class="muted">' + guestCache.length + ' tamu terdaftar · ' + guestCache.filter(function (g) { return g.opened_at; }).length + ' sudah membuka · ' + guestCache.filter(function (g) { return g.attendance === 'hadir'; }).length + ' konfirmasi hadir ' + filter + '</p>' + bulk +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="sel-all" aria-label="Pilih semua"></th><th>Nama</th><th>Grup</th><th>Jumlah</th><th>Versi</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.map(function (g) {
        var st = g.checked_in_at ? '<span class="pill ok">Check-in</span>' : g.attendance === 'hadir' ? '<span class="pill ok">Hadir</span>' : g.attendance === 'tidak' ? '<span class="pill no">Tidak hadir</span>' : g.attendance === 'ragu' ? '<span class="pill">Belum pasti</span>' : g.opened_at ? '<span class="pill">Dibuka</span>' : '<span class="pill mute">Belum</span>';
        return '<tr><td><input type="checkbox" data-sel="' + g.id + '"' + (selGuests[g.id] ? ' checked' : '') + ' aria-label="Pilih ' + esc(g.name) + '"></td><td><strong>' + esc(g.name) + '</strong><br><small class="muted">' + esc(g.phone) + '</small></td><td>' + esc(g.group_name) + '</td><td>' + g.pax_limit + '</td>' +
          '<td>' + (g.version_id ? '<span class="pill vip">' + esc(verName(g.version_id)) + '</span>' : '<span class="muted">Standar</span>') + '</td><td>' + st + '</td>' +
          '<td class="acts"><button type="button" class="btn tiny" data-action="guest-copy" data-id="' + g.id + '">Salin link</button>' +
          (g.phone ? '<a class="btn tiny" target="_blank" rel="noopener" href="' + esc(waLink(g)) + '">WhatsApp</a>' : '') +
          '<a class="btn tiny" target="_blank" rel="noopener" href="' + API + '/guests/' + g.id + '/qr.svg">QR</a>' +
          '<a class="btn tiny" target="_blank" rel="noopener" href="' + basePath + '/preview/' + inv.id + '?guest=' + g.id + '">Lihat</a>' +
          '<button type="button" class="btn tiny" data-action="guest-edit" data-id="' + g.id + '">Edit</button>' +
          '<button type="button" class="btn tiny danger" data-action="guest-del" data-id="' + g.id + '">Hapus</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function guestDialog(g) {
    g = g || { name: '', group_name: '', phone: '', pax_limit: 1, kind: 'individual', table_name: '', version_id: '' };
    var d = $('#dlg');
    d.innerHTML = '<form id="guest-form"><h2>' + (g.id ? 'Edit tamu' : 'Tambah tamu') + '</h2>' +
      '<label class="f"><span>Nama</span><input name="name" required maxlength="160" value="' + esc(g.name) + '"></label>' +
      '<div class="grid2"><label class="f"><span>Grup</span><input name="group_name" maxlength="80" value="' + esc(g.group_name) + '" placeholder="Keluarga, Rekan kerja…"></label>' +
      '<label class="f"><span>No. WhatsApp</span><input name="phone" maxlength="30" value="' + esc(g.phone) + '" placeholder="08123456789"></label></div>' +
      '<div class="grid3"><label class="f"><span>Jumlah tamu</span><input name="pax_limit" type="number" min="1" max="50" value="' + g.pax_limit + '"></label>' +
      '<label class="f"><span>Jenis</span><select name="kind">' + Object.keys(KIND_LABEL).map(function (k) { return '<option value="' + k + '"' + (g.kind === k ? ' selected' : '') + '>' + KIND_LABEL[k] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Meja</span><input name="table_name" maxlength="60" value="' + esc(g.table_name) + '"></label></div>' +
      '<label class="f"><span>Versi undangan</span><select name="version_id">' + verOptions(g.version_id || '', false) + '</select>' +
      '<small class="muted">' + (inv.versions.length ? 'Tamu ini melihat tampilan & isi sesuai versi yang dipilih.' : 'Belum ada versi tambahan. Buat di menu “Versi undangan” (mis. VIP).') + '</small></label>' +
      '<p class="form-msg err" role="alert"></p><div class="modal-actions"><button type="button" class="btn" data-close>Batal</button><button class="btn primary" type="submit">Simpan</button></div></form>';
    d.showModal();
    $('#guest-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var body = {}; new FormData(e.target).forEach(function (v, k) { body[k] = v; });
      var req = g.id ? api('PUT', API + '/guests/' + g.id, body) : api('POST', API + '/guests', body);
      req.then(function () { d.close(); toast('Tamu tersimpan'); loadGuests(); }).catch(function (err) { $('#guest-form .form-msg').textContent = err.message; });
    });
  }
  function importDialog() {
    var d = $('#dlg');
    d.innerHTML = '<form id="imp-form"><h2>Impor tamu dari Excel</h2>' +
      '<p class="muted">Gunakan berkas <strong>.xlsx</strong>. Kolom: <code>Nama</code> (wajib), Grup, Telepon / WhatsApp, Jumlah, Jenis, <code>Versi</code>, Meja. ' +
      'Baris dengan <code>Kode</code> yang sudah ada akan <strong>diperbarui</strong> (jadi aman mengimpor ulang hasil ekspor), baris lain menjadi tamu baru. Maksimal 1000 baris / 2 MB.</p>' +
      '<p><a class="btn small" href="' + API + '/guests/template.xlsx">Unduh template Excel</a></p>' +
      '<label class="f"><span>Berkas Excel</span><input type="file" name="file" id="imp-file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></label>' +
      '<div id="imp-result"></div><p class="form-msg" role="alert"></p><div class="modal-actions"><button type="button" class="btn" data-close>Tutup</button><button class="btn primary" type="submit">Impor</button></div></form>';
    d.showModal();
    $('#imp-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = $('#imp-file').files[0]; var m = $('#imp-form .form-msg'); m.className = 'form-msg'; m.textContent = '';
      if (!f) { m.className = 'form-msg err'; m.textContent = 'Pilih berkas .xlsx dulu.'; return; }
      var fd = new FormData(); fd.append('file', f);
      m.textContent = 'Mengimpor…';
      fetch(API + '/guests/import', { method: 'POST', body: fd }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Gagal mengimpor'); return j; }); })
        .then(function (j) {
          m.className = 'form-msg ok'; m.textContent = j.added + ' tamu ditambahkan, ' + j.updated + ' diperbarui' + (j.skipped ? ', ' + j.skipped + ' baris dilewati' : '') + '.';
          $('#imp-result').innerHTML = j.errors.length ? '<ul class="err-list">' + j.errors.map(function (er) { return '<li>Baris ' + er.row + ': ' + esc(er.message) + '</li>'; }).join('') + '</ul>' : '';
          loadGuests();
        }).catch(function (err) { m.className = 'form-msg err'; m.textContent = err.message; });
    });
  }

  // Tamu: RSVP
  PAGES['guest/rsvp'] = function () {
    return { html: pageHead('Konfirmasi kehadiran') + '<div id="rsvp-area"><p class="muted">Memuat…</p></div>', after: function () {
      Promise.all([api('GET', API + '/stats'), api('GET', API + '/rsvps')]).then(function (res) {
        var s = res[0]; var rs = res[1].rsvps; var box = $('#rsvp-area'); if (!box) return;
        box.innerHTML = '<div class="stats">' + stat(s.rsvp.hadir.pax, 'Hadir (orang)', s.rsvp.hadir.n + ' jawaban') + stat(s.rsvp.tidak.n, 'Tidak hadir', '') + stat(s.rsvp.ragu.n, 'Belum pasti', '') + stat(Math.max(0, s.guests.total - (s.rsvp.hadir.n + s.rsvp.tidak.n + s.rsvp.ragu.n)), 'Belum menjawab', 'dari ' + s.guests.total + ' tamu') + '</div>' +
          '<div class="toolbar"><a class="btn small" href="' + API + '/export/rsvps.xlsx">Ekspor Excel</a></div>' +
          (rs.length ? '<div class="ed-card table-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Status</th><th>Jumlah</th><th>Menu</th><th>Catatan</th><th>Waktu</th><th></th></tr></thead><tbody>' + rs.map(function (r) {
            return '<tr><td><strong>' + esc(r.name) + '</strong></td><td><span class="pill ' + (r.attendance === 'hadir' ? 'ok' : r.attendance === 'tidak' ? 'no' : '') + '">' + r.attendance + '</span></td><td>' + r.pax + '</td><td>' + esc(r.menu) + '</td><td>' + esc(r.note) + '</td><td><small>' + fmtTime(r.created_at) + '</small></td>' +
              '<td><button type="button" class="btn tiny danger" data-action="rsvp-del" data-id="' + r.id + '">Hapus</button></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty"><h3>Belum ada konfirmasi kehadiran</h3><p class="muted">Jawaban tamu akan muncul di sini.</p></div>');
      }).catch(function (e) { toast(e.message, true); });
    } };
  };

  // Tamu: check-in
  PAGES['guest/checkin'] = function () {
    return { html: pageHead('Buku tamu / check-in', 'Catat kedatangan tamu di hari acara. Masukkan kode tamu atau pindai QR dengan pemindai yang mengetik ke kolom ini.') +
      card('Check-in', '<form id="ci-form" class="row"><input id="ci-code" class="grow" placeholder="Kode tamu atau isi QR (link undangan)…" autocomplete="off" autofocus><input id="ci-pax" type="number" min="1" max="50" placeholder="Jumlah" class="num"><button class="btn primary" type="submit">Check-in</button></form><p class="form-msg" id="ci-msg" role="status"></p>') +
      '<div id="ci-list"></div>', after: loadCheckins };
  };
  function loadCheckins() {
    api('GET', API + '/guests').then(function (j) {
      guestCache = j.guests; var box = $('#ci-list'); if (!box) return;
      var done = j.guests.filter(function (g) { return g.checked_in_at; }).sort(function (a, b) { return new Date(b.checked_in_at) - new Date(a.checked_in_at); });
      var total = done.reduce(function (n, g) { return n + (g.checked_in_pax || 0); }, 0);
      box.innerHTML = card('Sudah hadir: ' + done.length + ' tamu · ' + total + ' orang',
        done.length ? '<table class="tbl"><tbody>' + done.map(function (g) {
          return '<tr><td><strong>' + esc(g.name) + '</strong><br><small class="muted">kode ' + esc(g.code) + (g.table_name ? ' · ' + esc(g.table_name) : '') + '</small></td><td>' + g.checked_in_pax + ' orang</td><td><small>' + fmtTime(g.checked_in_at) + '</small></td><td><button type="button" class="btn tiny" data-action="ci-undo" data-id="' + g.id + '">Batalkan</button></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="muted">Belum ada yang check-in.</p>');
    });
  }

  // Tamu: ucapan
  PAGES['guest/wishes'] = function () {
    return { html: pageHead('Ucapan & doa', inv.settings.wishesModerated ? 'Moderasi aktif: ucapan baru perlu disetujui dulu.' : 'Ucapan tamu langsung tampil di undangan.') + '<div id="wish-area"><p class="muted">Memuat…</p></div>', after: loadWishes };
  };
  function loadWishes() {
    api('GET', API + '/wishes').then(function (j) {
      var box = $('#wish-area'); if (!box) return;
      box.innerHTML = j.wishes.length ? j.wishes.map(function (w) {
        return '<div class="ed-card wish-row"><div><strong>' + esc(w.name) + '</strong> <small class="muted">' + fmtTime(w.created_at) + '</small>' + (w.approved ? '' : ' <span class="pill">Menunggu</span>') + '<p>' + esc(w.message) + '</p></div><div class="acts">' +
          '<button type="button" class="btn tiny" data-action="wish-toggle" data-id="' + w.id + '" data-val="' + (!w.approved) + '">' + (w.approved ? 'Sembunyikan' : 'Setujui') + '</button><button type="button" class="btn tiny danger" data-action="wish-del" data-id="' + w.id + '">Hapus</button></div></div>';
      }).join('') : '<div class="empty"><h3>Belum ada ucapan</h3></div>';
    });
  }

  // Versi undangan (VIP / reguler / dst.)
  var VSEC_STATE = [['', 'Ikuti undangan utama'], ['on', 'Tampilkan'], ['off', 'Sembunyikan']];
  PAGES['version/list'] = function () {
    var themes = meta.themes.filter(function (t) { return t.types.indexOf(inv.event_type) >= 0; });
    var items = inv.versions.map(function (v, i) {
      var p = 'versions.' + i;
      var palettes = '<button type="button" class="chip' + (!v.colors ? ' active' : '') + '" data-vpalette="' + i + ':-1">Ikuti template</button>' + meta.palettes.map(function (pl, k) {
        var on = v.colors && v.colors.primary === pl.colors.primary && v.colors.bg === pl.colors.bg;
        return '<button type="button" class="palette' + (on ? ' sel' : '') + '" data-vpalette="' + i + ':' + k + '" title="' + esc(pl.name) + '"><i style="background:' + pl.colors.primary + '"></i><i style="background:' + pl.colors.accent + '"></i><i style="background:' + pl.colors.bg + '"></i></button>';
      }).join('');
      var evs = inv.content.events.map(function (e, k) {
        return '<label class="switch"><input type="checkbox" data-vevent="' + i + ':' + k + '"' + (v.eventIdx.indexOf(k) >= 0 ? ' checked' : '') + '><i></i><span>' + esc(e.name || 'Acara ' + (k + 1)) + '</span></label>';
      }).join('');
      var secs = typeInfo.sections.map(function (k) {
        return field(p + '.sections.' + k, SEC_LABEL[k], { type: 'select', options: VSEC_STATE });
      }).join('');
      return '<section class="ed-card version" data-vid="' + esc(v.id) + '"><div class="ed-card-h"><h3><span class="pill vip">' + esc(v.name) + '</span> <small class="muted" id="vcount-' + esc(v.id) + '"></small></h3>' +
        '<div class="acts"><button type="button" class="btn small" data-action="v-preview" data-id="' + esc(v.id) + '">Pratinjau versi ini</button><button type="button" class="btn small danger" data-action="v-del" data-index="' + i + '">Hapus</button></div></div>' +
        '<div class="grid2">' + field(p + '.name', 'Nama versi', { max: 30, hint: 'Dipakai di daftar tamu dan kolom “Versi” Excel.' }) + field(p + '.badge', 'Lencana di sampul (opsional)', { max: 40, ph: 'mis. VIP Guest' }) + '</div>' +
        '<details open><summary>Tampilan</summary>' +
        field(p + '.theme', 'Template', { type: 'select', options: [['', 'Sama dengan undangan utama']].concat(themes.map(function (t) { return [t.key, t.name]; })) }) +
        '<div class="f"><span>Warna</span><div class="chips-row">' + palettes + '</div></div>' +
        '<div class="grid2">' + field(p + '.opener', 'Animasi pembuka', { type: 'select', options: [['', 'Ikuti undangan utama'], ['none', 'Tanpa animasi']].concat(meta.openers.map(function (o) { return [o.key, o.name]; })) }) +
        field(p + '.fx', 'Efek latar', { type: 'select', options: [['', 'Ikuti undangan utama'], ['none', 'Tanpa efek']].concat(meta.effects.map(function (o) { return [o.key, o.name]; })) }) + '</div></details>' +
        '<details><summary>Teks sampul & penutup <small class="muted">(kosong = ikuti undangan utama)</small></summary>' +
        '<div class="grid2">' + field(p + '.cover.label', 'Label atas', { max: 80 }) + field(p + '.cover.title', 'Judul', { max: 120 }) + '</div>' +
        field(p + '.cover.subtitle', 'Subjudul', { type: 'textarea', rows: 2, max: 300 }) + field(p + '.cover.buttonText', 'Teks tombol buka', { max: 40 }) + imageField(p + '.cover.photo', 'Foto sampul khusus') +
        field(p + '.openingText', 'Kata pembuka', { type: 'textarea', rows: 3, max: 1500 }) + field(p + '.closingText', 'Kalimat penutup', { type: 'textarea', rows: 3, max: 800 }) + '</details>' +
        '<details><summary>Acara & informasi khusus</summary>' +
        toggle(p + '.limitEvents', 'Batasi sesi acara untuk versi ini', 'Bila aktif, hanya sesi yang dicentang di bawah yang tampil (mis. VIP hanya akad nikah).') +
        (inv.content.events.length ? '<div class="f"><span>Sesi yang ditampilkan</span>' + evs + '</div>' : '') +
        field(p + '.note.title', 'Judul catatan khusus', { max: 100, ph: 'mis. Informasi Tamu VIP' }) + field(p + '.note.text', 'Isi catatan khusus', { type: 'textarea', rows: 3, max: 800, hint: 'Tampil sebagai kartu tersendiri setelah jadwal acara.' }) + '</details>' +
        '<details><summary>Bagian undangan</summary><div class="grid2">' + secs + '</div></details></section>';
    }).join('');
    return { html: pageHead('Versi undangan', 'Buat tampilan & isi berbeda untuk tiap tipe tamu, misalnya VIP dan reguler. Tamu tanpa versi (dan link umum) melihat undangan utama “Standar”.') +
      card('Cara kerja', '<ol class="steps"><li>Buat versi di bawah (nama, template, teks, acara yang ditampilkan).</li><li>Tetapkan versi ke tamu di <button type="button" class="linkbtn" data-go="guest/guest">Daftar tamu</button> (satu per satu, centang banyak tamu, atau kolom <code>Versi</code> di Excel).</li><li>Setiap tamu membuka link personalnya dan otomatis mendapat versinya.</li></ol>') +
      items + (inv.versions.length < 6 ? '<button type="button" class="btn primary" data-action="v-add">+ Tambah versi</button>' : '<p class="muted">Maksimal 6 versi.</p>'),
      after: function () {
        api('GET', API + '/guests').then(function (j) {
          guestCache = j.guests;
          inv.versions.forEach(function (v) { var el = $('#vcount-' + v.id); if (el) el.textContent = j.guests.filter(function (g) { return g.version_id === v.id; }).length + ' tamu'; });
        }).catch(function () {});
      } };
  };

  // Pengaturan
  var slugTimer;
  PAGES['setting/general'] = function () {
    return { html: pageHead('Pengaturan umum') +
      card('Identitas', field('title', 'Judul undangan', { max: 200, hint: 'Tampil di tab browser dan saat dibagikan.' }) +
        '<label class="f"><span>Alamat link</span><div class="prefix"><span>' + esc(location.host) + '/</span><input data-path="slug" id="slug-input" value="' + esc(inv.slug) + '" maxlength="60"></div><small id="slug-msg" class="muted">Huruf kecil, angka, dan tanda minus. Mengganti alamat membuat link lama tidak berlaku.</small></label>' +
        '<div class="f"><span>Jenis acara</span><div><span class="pill">' + esc(typeInfo.label) + '</span></div></div>') +
      card('Bahasa label undangan', field('settings.lang', 'Bahasa teks tetap (tombol, formulir, label)', { type: 'select', options: [['id', 'Bahasa Indonesia'], ['en', 'English']] }) + '<p class="muted">Isi teks yang Anda tulis sendiri tidak diubah.</p>') };
  };
  var SEC_LABEL = { family: 'Turut mengundang', story: 'Cerita', gallery: 'Galeri', dresscode: 'Dresscode / tema', program: 'Rangkaian acara', lineup: 'Pengisi acara & tamu kehormatan', info: 'Info penting', partners: 'Sponsor & mitra', rsvp: 'Konfirmasi kehadiran (RSVP)', gifts: 'Hadiah', wishes: 'Ucapan & doa' };
  PAGES['setting/sections'] = function () {
    return { html: pageHead('Bagian & privasi') +
      card('Bagian undangan ' + typeInfo.label.toLowerCase(), typeInfo.sections.map(function (k) { return toggle('settings.sections.' + k, SEC_LABEL[k]); }).join('') + '<p class="muted">Hanya bagian yang cocok untuk jenis acara ini yang ditampilkan.</p>') +
      card('Privasi', toggle('settings.privateMode', 'Undangan privat', 'Hanya bisa dibuka lewat link personal tamu (…?to=kode). Link umum akan menampilkan pemberitahuan.')) };
  };
  PAGES['setting/rsvpset'] = function () {
    var menus = inv.content.rsvp.menus.map(function (m, i) {
      return '<div class="row">' + '<input class="grow" data-path="content.rsvp.menus.' + i + '" value="' + esc(m) + '" maxlength="80">' + removeBtn('content.rsvp.menus', i) + '</div>';
    }).join('');
    return { html: pageHead('RSVP & ucapan') +
      card('Konfirmasi kehadiran', '<div class="grid2">' + field('content.rsvp.deadline', 'Batas konfirmasi (opsional)', { type: 'date' }) + field('content.rsvp.maxPax', 'Maks. jumlah tamu (tamu umum)', { type: 'number', min: 1, maxn: 20 }) + '</div>' +
        '<div class="f"><span>Pilihan menu makanan (opsional)</span>' + menus + (inv.content.rsvp.menus.length < 10 ? addBtn('content.rsvp.menus', 'Tambah menu') : '') + '</div>') +
      card('Ucapan', toggle('settings.wishesModerated', 'Moderasi ucapan', 'Ucapan baru tampil setelah Anda setujui.')) +
      card('Pesan WhatsApp', field('settings.waTemplate', 'Template pesan', { type: 'textarea', rows: 4, max: 600, hint: 'Gunakan {nama} dan {link}.' })) };
  };
  PAGES['setting/danger'] = function () {
    return { html: pageHead('Lanjutan') +
      card('Duplikat undangan', '<p class="muted">Salin desain dan isi ke undangan baru (tanpa tamu, RSVP, dan ucapan).</p><button type="button" class="btn" data-action="duplicate">Duplikat</button>') +
      card('Hapus undangan', '<p class="muted">Menghapus undangan beserta semua tamu, RSVP, ucapan, dan file unggahan. Tidak bisa dibatalkan.</p><button type="button" class="btn danger" data-action="delete-inv">Hapus undangan ini</button>') };
  };

  // ---------- render panel ----------
  function renderPanel() {
    var fn = PAGES[cur.menu + '/' + cur.form];
    if (!fn) { panel.innerHTML = pageHead('Halaman tidak ditemukan'); return; }
    var r = fn();
    panel.innerHTML = r.html;
    panel.scrollTop = 0; window.scrollTo(0, 0);
    if (r.after) r.after();
  }
  function rerender() { var y = panel.scrollTop; var wy = window.scrollY; renderPanel(); panel.scrollTop = y; window.scrollTo(0, wy); }

  // ---------- event: input ----------
  function onFieldChange(e) {
    var el = e.target; var path = el.dataset && el.dataset.path; if (!path) return;
    var val = el.hasAttribute('data-bool') ? el.checked : el.value;
    set(inv, path, val);
    if (path === 'slug') checkSlug(); else if (path === 'title') $('#ed-title').textContent = inv.title;
    markDirty();
  }
  panel.addEventListener('input', function (e) { if (e.target.type !== 'checkbox' && e.target.tagName !== 'SELECT') onFieldChange(e); });
  panel.addEventListener('change', function (e) { onFieldChange(e); if (e.target.matches('#slug-input,[data-path="settings.lang"]')) return; });

  function checkSlug() {
    clearTimeout(slugTimer);
    slugTimer = setTimeout(function () {
      var msg = $('#slug-msg'); if (!msg) return;
      api('GET', basePath + '/api/slug-check?slug=' + encodeURIComponent(inv.slug) + '&except=' + inv.id).then(function (r) {
        msg.textContent = r.available ? 'Tersedia: ' + (boot.baseUrl || (origin + basePath)) + '/' + r.slug : (r.reason || 'Tidak tersedia'); msg.className = r.available ? 'ok' : 'err';
      });
    }, 350);
  }

  // ---------- event: klik ----------
  panel.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action],[data-go],[data-filter],[data-theme],[data-palette],[data-anim],[data-vpalette]'); if (!t) return;
    if (t.dataset.go) { var p = t.dataset.go.split('/'); go(p[0], p[1]); return; }
    if (t.dataset.filter) { themeFilter = t.dataset.filter; rerender(); return; }
    if (t.dataset.theme) {
      var th = meta.themes.find(function (x) { return x.key === t.dataset.theme; });
      inv.theme = th.key; inv.colors = Object.assign({}, th.colors); inv.fonts = Object.assign({}, th.fonts);
      rerender(); markDirty(); return;
    }
    if (t.dataset.palette) { inv.colors = Object.assign({}, meta.palettes[+t.dataset.palette].colors); rerender(); markDirty(); return; }
    if (t.dataset.anim) {
      var ap = t.dataset.anim.split(':'); inv.settings[ap[0]] = ap[1]; rerender(); markDirty(); return;
    }
    if (t.dataset.vpalette) {
      var vp = t.dataset.vpalette.split(':'); var vv = inv.versions[+vp[0]];
      vv.colors = +vp[1] < 0 ? null : Object.assign({}, meta.palettes[+vp[1]].colors); rerender(); markDirty(); return;
    }
    var a = t.dataset.action;
    if (a === 'v-add') {
      if (inv.versions.length >= 6) return;
      inv.versions.push({ id: rid(), name: inv.versions.length ? 'Versi ' + (inv.versions.length + 1) : 'VIP', badge: inv.versions.length ? '' : 'VIP', theme: '', colors: null, opener: '', fx: '',
        cover: { label: '', title: '', subtitle: '', buttonText: '', photo: '' }, openingText: '', closingText: '', limitEvents: false, eventIdx: [], note: { title: '', text: '' }, sections: {} });
      rerender(); markDirty(); return;
    }
    if (a === 'v-del') {
      var dv = inv.versions[+t.dataset.index];
      if (confirm('Hapus versi "' + dv.name + '"? Tamu yang memakai versi ini kembali ke undangan Standar.')) { inv.versions.splice(+t.dataset.index, 1); rerender(); markDirty(); }
      return;
    }
    if (a === 'v-preview') {
      pvVersion = t.dataset.id; pvDemo = false;
      // simpan dulu agar versi baru dikenali server, lalu muat pratinjau
      save().then(function () { lastPv = ''; gotoPreview(null); toast('Pratinjau versi “' + verName(pvVersion) + '”'); $('#preview-pane').classList.add('open'); });
      return;
    }
    if (a === 'try-anim') { pvDemo = true; lastPv = ''; save().then(function () { gotoPreview(null); pvDemo = false; $('#preview-pane').classList.add('open'); }); return; }
    if (a === 'ar-rum') {
      var ar = meta.arRum21; inv.content.opening.arabic = ar.arabic; inv.content.opening.text = ar.text; inv.content.opening.source = ar.source;
      inv.content.opening.showArabic = true; inv.content.opening.showText = true; rerender(); markDirty(); return;
    }
    if (a === 'ar-clear') { inv.content.opening.arabic = ''; inv.content.opening.showArabic = false; rerender(); markDirty(); return; }
    if (a === 'bulk-ver') {
      var bv = $('#bulk-ver').value; if (bv === '__keep') { toast('Pilih versinya dulu', true); return; }
      api('POST', API + '/guests/bulk', { action: 'version', ids: Object.keys(selGuests), version_id: bv }).then(function (j) { toast(j.affected + ' tamu diperbarui'); loadGuests(); }).catch(function (er) { toast(er.message, true); });
      return;
    }
    if (a === 'bulk-del') {
      if (confirm('Hapus ' + Object.keys(selGuests).length + ' tamu terpilih?')) api('POST', API + '/guests/bulk', { action: 'delete', ids: Object.keys(selGuests) }).then(function (j) { toast(j.affected + ' tamu dihapus'); loadGuests(); }).catch(function (er) { toast(er.message, true); });
      return;
    }
    if (a === 'add') {
      var arr = get(inv, t.dataset.path); if (arr.length >= (LIMITS[t.dataset.path] || 20)) return;
      arr.push(NEW_ITEM[t.dataset.path]()); rerender(); markDirty();
    } else if (a === 'remove') {
      get(inv, t.dataset.path).splice(+t.dataset.index, 1); rerender(); markDirty();
    } else if (a === 'clear') { set(inv, t.dataset.path, ''); rerender(); markDirty(); }
    else if (a === 'copy-link') copy(inviteUrl()).then(function () { toast('Link disalin'); });
    else if (a === 'share') shareDialog();
    else if (a === 'toggle-publish') togglePublish();
    else if (a === 'guest-add') guestDialog();
    else if (a === 'guest-import') importDialog();
    else if (a === 'guest-edit') guestDialog(guestCache.find(function (g) { return String(g.id) === t.dataset.id; }));
    else if (a === 'guest-copy') { var g = guestCache.find(function (x) { return String(x.id) === t.dataset.id; }); copy(inviteUrl(g.code)).then(function () { toast('Link tamu disalin'); }); }
    else if (a === 'guest-del') { if (confirm('Hapus tamu ini?')) api('DELETE', API + '/guests/' + t.dataset.id).then(loadGuests).catch(function (er) { toast(er.message, true); }); }
    else if (a === 'rsvp-del') { if (confirm('Hapus jawaban ini?')) api('DELETE', API + '/rsvps/' + t.dataset.id).then(renderPanel); }
    else if (a === 'wish-toggle') api('PATCH', API + '/wishes/' + t.dataset.id, { approved: t.dataset.val === 'true' }).then(loadWishes);
    else if (a === 'wish-del') { if (confirm('Hapus ucapan ini?')) api('DELETE', API + '/wishes/' + t.dataset.id).then(loadWishes); }
    else if (a === 'ci-undo') api('DELETE', API + '/guests/' + t.dataset.id + '/checkin').then(loadCheckins);
    else if (a === 'duplicate') api('POST', API + '/duplicate').then(function (j) { location.href = basePath + '/editor/' + j.id; }).catch(function (er) { toast(er.message, true); });
    else if (a === 'delete-inv') {
      if (confirm('Hapus undangan "' + inv.title + '" beserta semua datanya? Tidak bisa dibatalkan.')) api('DELETE', API).then(function () { dirty = false; location.href = basePath + '/dashboard'; });
    }
  });

  panel.addEventListener('input', function (e) { if (e.target.id === 'guest-q') drawGuests(); });
  panel.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'guest-vf') { guestVer = el.value; drawGuests(); return; }
    if (el.id === 'sel-all') { selGuests = {}; if (el.checked) guestCache.forEach(function (g) { selGuests[g.id] = 1; }); drawGuests(); return; }
    if (el.dataset && el.dataset.sel) { if (el.checked) selGuests[el.dataset.sel] = 1; else delete selGuests[el.dataset.sel]; drawGuests(); return; }
    if (el.dataset && el.dataset.vevent) {
      var ve = el.dataset.vevent.split(':'); var vr = inv.versions[+ve[0]]; var k = +ve[1]; var at = vr.eventIdx.indexOf(k);
      if (el.checked && at < 0) vr.eventIdx.push(k); else if (!el.checked && at >= 0) vr.eventIdx.splice(at, 1);
      markDirty();
    }
  });
  panel.addEventListener('submit', function (e) {
    if (e.target.id !== 'ci-form') return;
    e.preventDefault();
    var code = $('#ci-code').value; var pax = $('#ci-pax').value; var msg = $('#ci-msg');
    api('POST', API + '/checkin', { code: code, pax: pax || undefined }).then(function (j) {
      msg.className = 'form-msg ' + (j.already ? 'err' : 'ok');
      msg.textContent = (j.already ? 'Sudah check-in sebelumnya: ' : 'Berhasil check-in: ') + j.guest.name + ' (' + (j.guest.checked_in_pax || j.guest.pax_limit) + ' orang)' + (j.guest.table_name ? ' · ' + j.guest.table_name : '');
      $('#ci-code').value = ''; $('#ci-pax').value = ''; $('#ci-code').focus(); loadCheckins();
    }).catch(function (er) { msg.className = 'form-msg err'; msg.textContent = er.message; });
  });

  // ---------- unggah ----------
  function upload(file, kind) {
    var fd = new FormData(); fd.append('file', file);
    return fetch(API + '/upload' + (kind === 'audio' ? '?kind=audio' : ''), { method: 'POST', body: fd })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Gagal mengunggah'); return j.url; }); });
  }
  panel.addEventListener('change', function (e) {
    var el = e.target; if (el.type !== 'file') return;
    var files = Array.prototype.slice.call(el.files); if (!files.length) return;
    toast('Mengunggah…');
    if (el.dataset.uploadPush) {
      var arr = get(inv, el.dataset.uploadPush);
      files.slice(0, 24 - arr.length).reduce(function (p, f) { return p.then(function () { return upload(f).then(function (u) { arr.push(u); }); }); }, Promise.resolve())
        .then(function () { toast('Foto terunggah'); rerender(); markDirty(); }).catch(function (er) { toast(er.message, true); rerender(); markDirty(); });
    } else if (el.dataset.upload) {
      upload(files[0], el.dataset.kind).then(function (u) { set(inv, el.dataset.upload, u); toast('Terunggah'); rerender(); markDirty(); }).catch(function (er) { toast(er.message, true); });
    }
    el.value = '';
  });

  // ---------- dialog ----------
  $('#dlg').addEventListener('click', function (e) { if (e.target.matches('[data-close]')) $('#dlg').close(); });
  function shareDialog() {
    var d = $('#dlg'); var link = inviteUrl();
    d.innerHTML = '<div><h2>Bagikan undangan</h2>' + (inv.status !== 'published' ? '<p class="banner warn">Undangan belum aktif. Aktifkan dulu agar link bisa dibuka tamu.</p>' : '') +
      '<div class="link-row"><code>' + esc(link) + '</code></div><div class="modal-actions"><button class="btn" data-close type="button">Tutup</button>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Undangan: ' + link) + '">WhatsApp</a><button class="btn primary" type="button" id="share-copy">Salin link</button></div>' +
      '<p class="muted">Untuk link personal per tamu, buka menu Tamu › Daftar tamu.</p></div>';
    d.showModal();
    $('#share-copy').addEventListener('click', function () { copy(link).then(function () { toast('Link disalin'); }); });
  }
  $('#btn-share').addEventListener('click', shareDialog);

  function togglePublish() {
    inv.status = inv.status === 'published' ? 'draft' : 'published';
    updatePublishBtn(); markDirty();
    save().then(function () { toast(inv.status === 'published' ? 'Undangan diaktifkan' : 'Undangan dinonaktifkan'); if (cur.form === 'dashboard') rerender(); });
  }
  function updatePublishBtn() {
    var b = $('#btn-publish'); b.textContent = inv.status === 'published' ? 'Nonaktifkan' : 'Aktifkan';
    b.classList.toggle('primary', inv.status !== 'published');
    $('#pv-open').href = inv.status === 'published' ? (basePath + '/' + inv.slug) : (basePath + '/preview/' + inv.id);
  }
  $('#btn-publish').addEventListener('click', togglePublish);

  // ---------- mulai ----------
  $('#ed-title').textContent = inv.title;
  updatePublishBtn();
  var qs = new URLSearchParams(location.search);
  var m0 = qs.get('main_menu'); var f0 = qs.get('form');
  if (m0 && f0 && PAGES[m0 + '/' + f0]) { cur = { menu: m0, form: f0 }; openMenu = m0; }
  renderSide(); renderPanel();
  frame.src = pvUrl(ANCHOR[cur.form] || null);
  // sinkronkan tombol Buka setelah slug berubah
  setInterval(updatePublishBtn, 2000);
})();
