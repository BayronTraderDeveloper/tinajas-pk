// Ayuda de desarrollo: juega con teclas de verdad. plan = { face, hold, dir, dur, early, key, rel, vault, js, bounce }
export function plan(p) {
  const L = window.__lab, k = (c, d) => dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c, bubbles: true })), st = {}, set = (c, v) => { if (!!st[c] !== !!v) { st[c] = v; k(c, v); } };
  return new Promise(done => { const t0 = performance.now(), r0 = L.run.idx, f0 = L.run.fails; let b = 0, was = false; const arrow = p.dir > 0 ? 'ArrowRight' : 'ArrowLeft';
    const tick = () => { const t = (performance.now() - t0) / 1000, a = L.athlete, air = a.state === 'air' && a.bounceT <= 0, mv = p.vec ? a.moveTheta || 0 : Math.abs(a.trick.flip) + Math.abs(a.trick.side), B = a.bounceT > 0; if (B && !was) b++; was = B;
      if (p.face) { set('ArrowLeft', t < .4 && p.face < 0); set('ArrowRight', t < .4 && p.face > 0); } const u = t - (p.face ? .9 : .2);
      if (p.vault) set('Digit' + p.vault, u > 0 && u < .1); else if (p.js) set(p.js, u > 0 && u < .1); else set('Space', (u > 0 && u < p.hold) || (p.bounce && B && a.vel.y > 0 && b <= p.bounce));
      const live = !p.bounce || b >= p.bounce; if (u > 0 && p.dir) set(arrow, (p.early && u > .02 && u < p.hold + .2 && !p.bounce) || (air && live && a.airT < p.dur)); if (p.key) set(p.key, air && live && a.airT > .03 && mv < p.rel && u > 0);
      if (L.run.idx > r0 || L.run.fails > f0 || L.run.done || t > 14) { for (const c in st) set(c, false); done({ idx: L.run.idx, fails: L.run.fails, why: L.run.fail?.why, land: L.athlete.lastLanding?.name + ' ' + L.athlete.lastLanding?.grade, done: L.run.done }); } else requestAnimationFrame(tick); }; tick(); });
}
