import test from 'node:test'; import assert from 'node:assert/strict';
import { make, flat, finite } from './sim.js'; import { World } from '../src/core/world.js'; import { AirControl, MOVES } from '../src/core/control.js'; import { NO_INPUT } from '../src/core/athlete.js'; import { Score, POINTS, NAMES, tier } from '../src/core/score.js'; import { TRICKS } from '../src/slots.js';
// Torre de h metros; seq = trucos en orden; se suelta cada uno al llegar a rel grados propios y se espera a estar casi de pie
export const drop = (h, seq, { rel = 275, mx = 1, gap = .05, yaw = Math.PI / 2 } = {}) => {
  const w = new World(); w.plane = true; w.box([0, -.5, 0], [60, 1, 10], 'floor'); w.box([-1, h / 2, 0], [2, h, 3], 'wood'); const a = make(w, { x: -.3, y: h, z: 0, yaw }), p = new AirControl(a), sc = new Score(), tr = []; let i = 0, wait = 0, l, land;
  for (let t = 0; t < 6 && !l; t += 1 / 240) { const air = a.state === 'air', held = new Set(); if (air && a.airT > .04 && i < seq.length) { const s = p.own, id = seq[i], fam = MOVES[id]?.family; if (wait > 0) { wait -= 1 / 240; if (wait <= 0) i++; } else if (fam) { const done = Math.abs(a.trick.twist - (p.twBase[id] ?? a.trick.twist)); if (done < 290) held.add(id); else if (p.capped && p.id === id && s?.deg >= 325) wait = gap; else if (!p.id || p.id !== id) held.add(id); } else { held.add(id); if (s && s.id === id && s.deg >= (Array.isArray(rel) ? rel[i] : rel)) wait = gap; } }
    a.update(1 / 240, p.drive({ ...NO_INPUT, jump: t > .2 && t < .6, mx: air && a.airT < .3 ? mx : 0 }, held)); assert.ok(finite(a)); for (const e of a.drain()) { if (e.type === 'trick') { tr.push(e.id); sc.add(e.id, e.n); } if (e.type === 'land') { l = e; land = sc.land(e); } } }
  return { ...l, tr, land };
};
test('la altura no castiga: de 3 a 25 m, de pie, sin caída', () => { for (const h of [3, 6, 10, 15, 25]) { const r = drop(h, []); assert.ok(r.lvl >= 4, `${h} m: ${r.grade} ${r.vImpact}`); assert.ok(r.vImpact > Math.sqrt(19 * h) * .9); } });
test('mezclar trucos en el aire: se nombran en orden, se cuentan todos y hay forma de caer de pie', () => {
  const C = [[6, ['flipB', 'flipF']], [6, ['flipF', 'sideR']], [8, ['flipB', 'cork']], [8, ['cork', 'flipB']], [8, ['gainer', 'webster']], [10, ['barani', 'flipF']], [10, ['btwist', 'flipB']], [18, ['flipB', 'cork', 'sideL']], [18, ['sideR', 'flipF', 'gainer']], [40, ['flipB', 'flipF', 'webster', 'gainer']], [10, ['raiz', 'flipB']], [10, ['aerial', 'flipF']], [10, ['arabian', 'flipF']], [10, ['flipF', 'arabian']], [8, ['flash', 'gainer']]];
  const bad = [];
  for (const [h, seq] of C) { let best = null, ok = 0, n = 0, full = 0; for (const r1 of [275, 300, 316, 330, 345]) for (const r2 of [255, 275, 290, 305]) for (const gap of [.02, .18]) { const r = drop(h, seq, { rel: seq.map((_, i) => i < seq.length - 1 ? r1 : r2), gap }); n++; if (seq.every(s => r.tr.includes(s))) { full++; if (r.lvl >= 3) { ok++; if (!best || r.lvl > best.lvl) best = r; } } } console.log('   ', h, 'm', seq.join(' + '), `${ok}/${n} (completos ${full})`, best ? `${best.name} | ${best.grade} | ${best.land.pts} pts ×${best.land.mult.toFixed(2)}` : ''); if (ok < 2) bad.push(seq.join('+')); }
  assert.deepEqual(bad, []);
});
test('puntos: cada truco vale distinto según dificultad, más variedad multiplica y caerse lo pierde', () => {
  for (const id in TRICKS) { assert.ok(POINTS[id] > 0, id); assert.ok(NAMES[id], id); } assert.ok(POINTS.cork > POINTS.gainer && POINTS.gainer > POINTS.flipB); assert.equal(tier(POINTS.cork), 'S');
  const go = (ids, e) => { const s = new Score(); ids.forEach(i => s.add(i)); return s.land({ grade: 'stable', combo: 1, ...e }).pts; };
  assert.ok(go(['flipB', 'cork']) > go(['flipB']) + go(['cork'])); assert.ok(go(['flipB', 'flipF', 'cork']) > go(['flipB', 'cork']) + go(['flipF'])); assert.ok(go(['flipB', 'flipB']) < go(['flipB', 'flipF'])); assert.equal(go(['cork'], { fall: true }), 0); assert.ok(go(['cork'], { grade: 'perfect' }) > go(['cork'])); assert.ok(go(['cork'], { combo: 4 }) > go(['cork']));
  const s = new Score(); s.add('flipB', 1); s.add('flipB', 2); assert.equal(s.list[1].pts, 150); s.ring(); assert.ok(s.mult > 1.8); assert.equal(s.land({ grade: 'fallF', fall: true }).lost > 0, true); assert.equal(s.count, 0);
});
test('sin Espacio: cork y B-twist hacen su movimiento real; los twists giran en vertical, como un palo', async () => {
  const { buildLab } = await import('../src/core/lab.js');
  for (const id of ['cork', 'btwist']) for (const yaw of [Math.PI / 2, -Math.PI / 2]) {
    const a = make(buildLab(), { x: 3, y: .12, z: 0, yaw }), p = new AirControl(a); let l, inv = false, did = false, flat = 0, n = 0;
    for (let t = 0; t < 4 && !l; t += 1 / 240) { if (!did && t > .2) { did = true; assert.ok(a.startAcro(id)); } const done = Math.abs(a.trick.twist - (p.twBase[id] ?? a.trick.twist)), on = did && (a.state !== 'air' || done < 290); a.update(1 / 240, p.drive(NO_INPUT, new Set(on ? [id] : []))); if (a.state === 'air') { const uy = new a.rootQ.constructor().copy(a.rootQ); const up = { x: 2 * (uy.x * uy.y - uy.w * uy.z), y: 1 - 2 * (uy.x * uy.x + uy.z * uy.z) }; if (up.y < -.3) inv = true; if (Math.abs(up.y) < .45) flat++; n++; } for (const e of a.drain()) if (e.type === 'land') l = e; }
    assert.ok(l.lvl >= 3, `${id} ${l.grade} ${l.name}`); assert.equal(l.name, id === 'cork' ? 'Cork' : 'B-twist'); if (id === 'cork') assert.ok(inv, 'el cork se invierte'); else assert.ok(flat / n > .35, `el B-twist va tumbado ${flat / n}`);
  }
  for (const id of ['twL', 'twR']) { const a = make(buildLab(), { x: 3, y: .12, z: 0, yaw: Math.PI / 2 }), p = new AirControl(a); let l, flip = 0, t0 = -1; assert.ok(a.startSpin(id)); for (let t = 0; t < 4 && !l; t += 1 / 240) { if (a.state === 'air' && t0 < 0) t0 = t; const on = a.state !== 'air' || t - t0 < .5; a.update(1 / 240, p.drive(NO_INPUT, new Set(on ? [id] : []))); if (a.state === 'air') flip = Math.max(flip, Math.abs(a.trick.flip) + Math.abs(a.trick.side)); for (const e of a.drain()) if (e.type === 'land') l = e; } assert.ok(flip < 40, `sin mortal ${flip}`); assert.match(l.name, /Giro 360°/); assert.ok(l.lvl >= 4, l.grade); }
});
