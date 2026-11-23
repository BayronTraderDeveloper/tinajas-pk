import test from 'node:test'; import assert from 'node:assert/strict';
import { make, run, land, finite, trick } from './sim.js'; import { setBody, TOTAL_MASS, HIP_H, BODY } from '../src/core/body.js'; import { record } from '../src/core/acrosim.js'; import { makeTuning } from '../src/core/tuning.js'; import { CHARACTERS } from '../src/core/characters.js'; import { AirControl } from '../src/core/control.js'; import { NO_INPUT } from '../src/core/athlete.js';
// Cada personaje tiene su cuerpo: la física debe seguir funcionando con cualquier altura y complexión
for (const c of CHARACTERS) test(`${c.name}: de pie, corre, backflip y cork con su cuerpo (${c.look.height} m)`, () => {
  setBody(c.look); try {
    assert.ok(Math.abs(HIP_H - .94 * c.look.height / 1.78) < 1e-9); if (c.look.height > 1.9) assert.ok(TOTAL_MASS > 95, `masa ${TOTAL_MASS}`);
    const a = make(); run(a, 2); assert.equal(a.state, 'ground'); for (const p of a.feetPoints()) assert.ok(Math.abs(p.y - .02 * BODY.w) < .03, `pies ${p.y}`);
    const r = make(); run(r, 3, () => ({ mz: 1, run: true })); assert.ok(r.speed > 6); assert.ok(finite(r));
    let best = null; for (const rel of [250, 265, 280, 295]) { const a2 = make(), p = new AirControl(a2); let l; for (let t = 0; t < 3 && !l; t += 1 / 240) { a2.update(1 / 240, p.drive({ ...NO_INPUT, jump: t > .2 && t < .6 }, new Set(a2.state === 'air' && Math.abs(a2.trick.flip) < rel ? ['flipB'] : []))); l = a2.drain().find(e => e.type === 'land'); } if (l?.name === 'Backflip' && (!best || l.lvl > best.lvl)) best = l; }
    assert.ok(best && best.lvl >= 4, `backflip ${best?.grade}`);
    const k = record('cork', { tuning: makeTuning() }); assert.equal(k.name, 'Cork'); assert.ok(k.land.lvl >= 3, `cork ${k.grade}`);
  } finally { setBody(); }
});
