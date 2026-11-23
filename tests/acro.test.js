import test from 'node:test'; import assert from 'node:assert/strict';
import { record } from '../src/core/acrosim.js'; import { ACRO, acroParams } from '../src/core/acro.js'; import { makeTuning } from '../src/core/tuning.js'; import { V } from '../src/core/mathx.js';
const R = {}; const rec = id => R[id] ||= record(id, { tuning: makeTuning() });
const upY = f => V(0, 1, 0).applyQuaternion(f.q).y, chestY = f => V(0, 0, 1).applyQuaternion(f.q).y;
for (const id in ACRO) test(`${ACRO[id].name}: vueltas exactas, cae de pie y no atraviesa el suelo`, () => {
  const s = rec(id), A = ACRO[id]; assert.ok(s.land, 'aterriza'); assert.equal(s.name, A.name); assert.ok(s.land.lvl >= 4, `${id} ${s.grade} x=${s.land.x.toFixed(2)}`);
  assert.equal(s.flips, A.flips, 'vueltas'); assert.equal(s.twists, A.twists, 'twists'); assert.ok(s.thMax < 360 + 45, `no gira de más: ${s.thMax}`);
  assert.equal(s.inv, A.base === 'cork' ? 1 : 0, 'inversiones'); assert.ok(s.minY > -.015, `suelo ${s.minY}`);
  for (const k of 'ABCDEFG') assert.ok(s.phases[k] > 0, `fase ${k}`); for (let i = 1; i < s.frames.length; i++) { const a = s.frames[i - 1], b = s.frames[i]; assert.ok(a.p.distanceTo(b.p) < .3, 'sin saltos de posición'); assert.ok(a.q.angleTo(b.q) < .55, `sin cambios bruscos ${i} ${a.q.angleTo(b.q)}`); b.l.forEach((q, j) => assert.ok(q.angleTo(a.l[j]) < .6, `articulación ${j}`)); }
  const again = record(id, { tuning: makeTuning() }); assert.equal(again.grade, s.grade); assert.ok(again.frames.at(-1).p.distanceTo(s.frames.at(-1).p) < 1e-9, 'se repite igual');
  console.log('   ', A.name.padEnd(14), s.grade, `aire ${s.air.toFixed(2)} s, giro máx ${s.maxW.toFixed(0)} °/s, inversiones ${s.inv}, twists ${s.twists}`, Object.entries(s.phases).map(([k, v]) => k + ' ' + v.toFixed(2)).join(' '));
});
test('identidad real: B-twist tumbado boca abajo, cork muy invertido en diagonal, más twists = más rápido y más alto', () => {
  const D = id => rec(id).frames.filter(f => f.phase === 'D');
  for (const id of ['btwist', 'dbtwist']) { const d = D(id), flat = d.filter(f => Math.abs(upY(f)) < .4).length / d.length, down = d.filter(f => Math.abs(upY(f)) < .4 && chestY(f) < -.5).length; assert.ok(flat > .4, `${id} tumbado ${flat}`); assert.ok(down > 0, `${id} boca abajo`); assert.ok(Math.min(...d.map(upY)) > -.2, `${id} sin invertir`); }
  for (const id of ['cork', 'dcork', 'tcork']) { const m = Math.min(...D(id).map(upY)); assert.ok(m < -.6 && m > -.99, `${id} muy invertido, en diagonal: ${m}`); }
  // la pose a mitad de vuelta no es la misma entre trucos
  const mid = id => { const d = D(id); return d[d.length >> 1].l; }, diff = (a, b) => mid(a).reduce((s, q, i) => s + q.angleTo(mid(b)[i]), 0); assert.ok(diff('btwist', 'cork') > .8, 'B-twist y cork no se parecen');
  const twR = id => Math.max(...rec(id).frames.slice(1).map((f, i) => Math.abs(f.tw - rec(id).frames[i].tw) * 60)); assert.ok(twR('tcork') > twR('dcork') && twR('dcork') > twR('cork'), `más twists, twist más rápido ${twR('cork')} ${twR('dcork')} ${twR('tcork')}`); assert.ok(rec('tcork').air > rec('dcork').air && rec('dcork').air > rec('cork').air, 'más twists piden más altura');
  for (const id of ['btwist', 'cork']) { const land = rec(id).frames.find(f => f.phase === 'F'); assert.ok(land, 'hay apertura'); }
});
test('los controles cambian el movimiento: altura, giro, inclinación y apertura', () => {
  const run = (id, k, v) => { const b = acroParams[id][k]; acroParams[id][k] = v; const s = record(id, { tuning: makeTuning() }); acroParams[id][k] = b; return s; };
  assert.ok(run('cork', 'height', 1).air > rec('cork').air + .1); assert.ok(run('cork', 'spin', 1.4).maxW > rec('cork').maxW * 1.1);
  const tiltLow = run('cork', 'tilt', 8), m = s => Math.min(...s.frames.filter(f => f.phase === 'D').map(upY)); assert.ok(m(tiltLow) < m(rec('cork')) - .03, 'menos inclinación = más invertido');
  const late = run('btwist', 'open', 30), early = run('btwist', 'open', 140), at = (r, th) => r.frames.find(f => f.th >= th && f.state === 'air'); assert.ok(at(late, 310).l.reduce((t, q, i) => t + q.angleTo(at(early, 310).l[i]), 0) > .5, 'abrir antes cambia la postura a tiempo');
});
