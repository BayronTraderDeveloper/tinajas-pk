// Hoja de fotogramas para revisar movimientos (solo desarrollo): import('/dev/sheet.js')
export function sheet({ spawn = 0, script, every = .08, from = 0, n = 15, cols = 5, yaw = null, dist = 3.6, stopAfter = 99, pitch = .08, fixed = true, aim = null }) {
  const L = window.__lab; L.setPaused(true); L.spawn(spawn); const a = L.athlete, base = { mx: 0, mz: 0, back: false, camYaw: 0, run: false, jump: false, flip: 0, side: 0, twist: 0, tuck: 0, pike: 0 };
  let cv = document.getElementById('sheet'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sheet'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99;background:#222'; document.body.append(cv); }
  const rows = Math.ceil(n / cols); cv.width = 1600; cv.height = 900; const g = cv.getContext('2d'), w = 1600 / cols, h = 900 / rows; let t = 0, k = 0, next = null; const log = [];
  const face = a.yaw; while (k < n && t < 30) {
    const si = { ...base, ...script(t, a) }; if (si.held) L.ctl(1 / 60, si, si.held); else L.step(1 / 60, si); t += 1 / 60; if (next === null && t >= from) next = t;
    if (next !== null && t >= next) {
      next += every; L.body.sync(a); const c = L.camera, y = (yaw === null ? face + Math.PI / 2 : yaw); const f = aim || a.com; c.aspect = w / h; c.fov = 40; c.updateProjectionMatrix(); c.position.set(f.x - Math.sin(y) * dist, Math.max(.3, f.y + pitch * dist), f.z - Math.cos(y) * dist); c.lookAt(f.x, f.y, f.z);
      L.renderer.render(L.scene, c); const x = (k % cols) * w, yy = Math.floor(k / cols) * h, el = L.renderer.domElement, sw = el.width, sh = el.height, A = w / h; let cw = sw, ch = sh; // imagen completa con aspecto forzado
      g.drawImage(el, 0, 0, cw, ch, x, yy, w, h); g.fillStyle = '#000a'; g.fillRect(x, yy, w, 20); g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText(`${t.toFixed(2)} ${a.state} f${a.trick.flip.toFixed(0)} s${a.trick.side.toFixed(0)} t${a.trick.twist.toFixed(0)}`, x + 6, yy + 15); k++;
    }
  }
  return a.lastLanding && `${a.lastLanding.name} ${a.lastLanding.label} x=${a.lastLanding.x.toFixed(2)}`;
}
export const trick = ({ flip = 0, side = 0, twist = 0, hold = .6, flipUntil = .3, tuck = true, openAt = 300, twistUntil = 360 }) => (t, a) => { const air = a.state === 'air', deg = Math.max(Math.abs(a.trick.flip), Math.abs(a.trick.side)), on = a.state === 'takeoff' || (air && a.airT < flipUntil); return { jump: t < hold, flip: on ? flip : 0, side: on ? side : 0, twist: (a.state === 'takeoff' || air) && Math.abs(a.trick.twist) < twistUntil ? twist : 0, tuck: air && tuck && deg < openAt && a.airT > .08 ? 1 : 0 }; };
