import test from 'node:test'; import assert from 'node:assert/strict';
import { make, run, flat, finite } from './sim.js'; import { V } from '../src/core/mathx.js';
// Barra: agarrarse, balancearse, media vuelta colgado (Shift) y soltarse hacia el otro lado
test('barra: media vuelta colgado y soltarse mirando al otro lado', () => {
  const w = flat(); w.bars = [{ p: V(0, 2.45, 0), axis: V(1, 0, 0), half: 1.2 }];
  const a = make(w, { x: 0, y: 0, z: -.6, yaw: 0 });
  run(a, 1.6, t => ({ jump: t > .2 && t < .5 }));
  assert.equal(a.state, 'bar', 'se agarra'); const face = a.bar.face; a.yawFromRoot(); const f0 = a.forward().clone();
  const ev = run(a, 1.2, t => ({ run: t > .1 && t < .2 }));
  assert.equal(a.state, 'bar'); assert.equal(a.bar.face, -face, 'cambia de lado'); a.yawFromRoot(); assert.ok(a.forward().dot(f0) < -.8, 'mira al otro lado'); assert.ok(finite(a));
  assert.ok(ev.some(e => e.type === 'trick' && e.id === 'barturn'));
  // bombea y se suelta: sale hacia donde mira ahora
  run(a, 2, (t, a) => ({ mz: Math.sign(a.bar?.w || 1) * Math.sign(a.bar?.f.z || 1) }));
  const l = run(a, 3, t => ({ jump: t < .05 })).find(e => e.type === 'land'); assert.ok(l, 'aterriza'); assert.ok(finite(a));
});
