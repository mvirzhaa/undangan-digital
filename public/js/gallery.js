// Lightbox galeri foto (swafoto & photobooth).
(function () {
  'use strict';
  var grid = document.getElementById('grid'); var lb = document.getElementById('lb');
  if (!grid || !lb) return;
  var links = Array.prototype.slice.call(grid.querySelectorAll('a.ph'));
  var img = lb.querySelector('img'); var who = document.getElementById('lb-who'); var dl = document.getElementById('lb-dl');
  var cur = 0;
  function show(i) {
    cur = (i + links.length) % links.length;
    var a = links[cur]; img.src = a.getAttribute('href'); dl.href = a.getAttribute('href');
    who.textContent = (a.dataset.who ? a.dataset.who + ' · ' : '') + (cur + 1) + '/' + links.length;
  }
  function open(i) { show(i); lb.hidden = false; document.body.style.overflow = 'hidden'; }
  function close() { lb.hidden = true; img.removeAttribute('src'); document.body.style.overflow = ''; }
  grid.addEventListener('click', function (e) { var a = e.target.closest('a.ph'); if (!a) return; e.preventDefault(); open(links.indexOf(a)); });
  lb.querySelector('.lb-x').addEventListener('click', close);
  lb.querySelector('.prev').addEventListener('click', function () { show(cur - 1); });
  lb.querySelector('.next').addEventListener('click', function () { show(cur + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(cur - 1); else if (e.key === 'ArrowRight') show(cur + 1);
  });
})();
