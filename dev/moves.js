// Tira de fotogramas por truco: import('/dev/moves.js').then(m => m.strips(['cork', ...]))
export function strips(ids, { cols = 10, from = .05, every = .105, dist = 3.6, spawn = 1, views = null } = {}) {
  const L = window.__lab; L.setPaused(true); const a = L.athlete, base = { mx: 0, mz: 0, back: false, camYaw: 0, run: false, jump: false, flip: 0, side: 0, twist: 0, tuck: 0, pike: 0 };
  let cv = document.getElementById('sheet'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sheet'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99;background:#222'; document.body.append(cv); }
  cv.width = 1600; cv.height = 1580; const g = cv.getContext('2d'), w = 1600 / cols, h = 1580 / ids.length, out = [];
  ids.forEach((id, r) => {
    L.spawn(spawn); L.athlete.reset({ x: 2, y: .12, z: 0, yaw: Math.PI / 2 }); L.control.reset(); let t = 0, k = 0, air = -1; const js = id === 'jstep', mv = js ? 'cork' : id; let started = false;
    while (k < cols && t < 5) {
      if (js && !started && t > .2) { started = true; a.startJstep(); }
      if (a.state === 'air' && air < 0) air = t; const on = a.state === 'air' && (a.moveTheta || 0) < 285 && t - air > .03;
      L.ctl(1 / 60, { ...base, jump: !js && t > .2 && t < .7 }, on ? [mv] : []); t += 1 / 60;
      const t0 = js ? .22 : air + from; if ((js || air >= 0) && t >= t0 + k * (js ? .15 : every)) {
        L.body.sync(a); const c = L.camera; c.aspect = w / h; c.fov = 40; c.updateProjectionMatrix(); const v = views?.[r] || 'side'; if (v === 'front') c.position.set(a.com.x + dist, a.com.y + .3, a.com.z + .01); else if (v === 'top') c.position.set(a.com.x, a.com.y + dist, a.com.z + .01); else if (v === 'diag') c.position.set(a.com.x + dist * .6, a.com.y + dist * .35, dist * .75); else c.position.set(a.com.x, a.com.y + .1, dist); c.lookAt(a.com.x, a.com.y, a.com.z); L.renderer.render(L.scene, c);
        const el = L.renderer.domElement; g.drawImage(el, 0, 0, el.width, el.height, k * w, r * h, w, h); g.fillStyle = '#000b'; g.fillRect(k * w, r * h, w, 20); g.fillStyle = '#fff'; g.font = '13px monospace'; g.fillText(`${id} ${views?.[r] || ''} ${(a.moveTheta || 0).toFixed(0)} t${a.trick.twist.toFixed(0)} ${a.state[0]}`, k * w + 4, r * h + 15); k++;
      }
    }
    out.push(a.lastLanding ? a.lastLanding.name + ' ' + a.lastLanding.label : a.state);
  });
  return out.join(' | ');
}
