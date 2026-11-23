import test from 'node:test'; import assert from 'node:assert/strict';
import { make, run, flat } from './sim.js';
// Press: caer con media zapatilla en el borde de un obstáculo (punta encima, talón al aire)
test('press: solo cuenta con media zapatilla en el borde', () => {
  const res = [];
  for (let d = 1.9; d <= 2.35; d += .05) for (const hold of [.2, .25, .3]) {
    const w = flat(); w.box([0, .2, d + .5], [3, .4, 1], 'floor'); const a = make(w);
    const l = run(a, 2.5, (t, a) => ({ jump: t > .2 && t < .2 + hold, mz: t > .2 && (a.state !== 'ground' || t < .2 + hold) ? 1 : 0 })).find(e => e.type === 'land');
    if (l) res.push(l);
  }
  const p = res.filter(l => l.press); assert.ok(p.length, 'algún salto pincha el borde');
  for (const l of p) { assert.ok(l.press.frac >= .25 && l.press.frac <= .8); assert.match(l.name, /Press/); assert.equal(l.press.prints.length, 2); }
  assert.ok(res.some(l => !l.press && !l.fall), 'caer con el pie entero no es press');
});
