// Hoja de fotogramas del visor de acrobacias (solo desarrollo): import('/dev/acro.js').then(m => m.sheet('cork', 'side'))
export function sheet(id, view = 'side', { n = 16, cols = 8, from = 'B', to = 'G', dist = 3.6 } = {}) {
  const L = window.__lab, v = L.viewer; v.id = id; v.view = view; v.dist = dist; v.play = false; v.rec(); const F = v.r.frames, a = F.findIndex(f => f.phase === from), b = F.findIndex(f => f.phase === to) + 8;
  let cv = document.getElementById('sheet'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sheet'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99;background:#222;object-fit:contain'; document.body.append(cv); }
  const rows = Math.ceil(n / cols), w = 1600 / cols, h = w * 1.25; cv.width = 1600; cv.height = h * rows; const g = cv.getContext('2d'), c = L.camera;
  for (let k = 0; k < n; k++) { const i = Math.round(a + (b - a) * k / (n - 1)); v.t = i / 60; v.f.copy(F[i].com); v.f.y = Math.max(1, F[i].com.y); v.update(1, L.body, c, { x: 0, y: 0 }, 0); c.aspect = w / h; c.updateProjectionMatrix(); L.renderer.render(L.scene, c); const el = L.renderer.domElement; g.drawImage(el, 0, 0, el.width, el.height, (k % cols) * w, Math.floor(k / cols) * h, w, h); g.fillStyle = '#000b'; g.fillRect((k % cols) * w, Math.floor(k / cols) * h, w, 20); g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(`${F[i].phase} ${F[i].th.toFixed(0)}° tw${Math.abs(F[i].tw).toFixed(0)}`, (k % cols) * w + 4, Math.floor(k / cols) * h + 15); }
  return `${v.r.name} ${v.r.grade}`;
}
