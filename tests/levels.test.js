import test from 'node:test'; import assert from 'node:assert/strict';
import { make, finite, flat } from './sim.js';
import { World } from '../src/core/world.js';
import { buildLab } from '../src/core/lab.js';
import { buildWorld, sanitize, floorSpans, KINDS } from '../src/core/levels.js';
import { LEVELS_2D, MAPS_3D, BUILTIN, LAB } from '../src/core/maps.js';
import { solve } from './solver.js';
import { LevelRun, Progress, Library, matches } from '../src/core/run.js';
import { VaultSense, VAULTS } from '../src/core/vaults.js';
import { Abilities } from '../src/core/abilities.js';
import { AirControl, MOVES } from '../src/core/control.js';
import { NO_INPUT } from '../src/core/athlete.js';
const store = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => m[k] = v, m }; };

test('niveles: todos pasan la validación sin cambiar y se construyen', () => {
  assert.equal(new Set(BUILTIN.map(l => l.id)).size, BUILTIN.length); assert.equal(LEVELS_2D.length, 15); assert.equal(MAPS_3D.length, 3);
  for (const l of [...LEVELS_2D, ...MAPS_3D]) { assert.deepEqual(sanitize(JSON.parse(JSON.stringify(l))), l); const w = buildWorld(l); assert.ok(w.boxes.length > 3); assert.equal(!!w.plane, l.mode === '2d'); if (l.mode === '2d') assert.ok(w.zones.length, l.id); const a = make(w, w.spawns[0]); for (let i = 0; i < 480; i++) a.update(1 / 240, NO_INPUT); assert.equal(a.state, 'ground', l.id); assert.ok(Math.abs(a.pos.x - l.spawn.x) < .1); }
});
test('datos hostiles o rotos no rompen nada', () => {
  for (const x of [null, 5, 'x', [], { items: 'no' }, { items: [null, 1, { t: 'nada' }, { t: 'block', x: 'abc', w: -5, h: 1e9 }, { t: '__proto__' }, { t: 'constructor' }], size: { x0: NaN, x1: 'inf' }, name: { a: 1 }, id: '<img src=x>', theme: 'toString' }, { mode: '3d', items: Array(2000).fill({ t: 'block' }) }]) { const l = sanitize(x); assert.ok(l.items.length <= 300); assert.match(l.id, /^[\w-]+$/); assert.ok(['gym', 'park', 'roof'].includes(l.theme)); const w = buildWorld(l); for (const b of w.boxes) assert.ok([b.c.x, b.c.y, b.c.z, b.h.x, b.h.y, b.h.z].every(Number.isFinite)); assert.deepEqual(sanitize(l), l); }
  assert.deepEqual(floorSpans(0, 10, [{ x: 3, w: 2 }, { x: 4, w: 2 }]), [[0, 2], [5, 10]]);
});
test('laboratorio desde datos: mismas posiciones de siempre', () => { const w = buildLab(); assert.equal(w.spawns.length, 10); assert.equal(w.tramps[0].y, .95); const b = w.boxes.find(q => q.id === 'rampart'); assert.equal(b.c.x, 73); assert.equal(w.x1, 104); assert.equal(w.boxes.filter(q => q.id === 'step').length, 11); });

for (const l of LEVELS_2D) test(`nivel 2D ${l.name}: cada objetivo tiene varias jugadas que caen de pie`, () => {
  const o = solve(l); for (const z of o) { const good = z.wins.filter(w => w.lvl >= 4).length; assert.ok(good >= 2, `${l.id} objetivo ${z.i + 1}: ${good} limpias de ${z.n}`); }
  console.log('   ', l.name, o.map(z => `${z.wins.length}/${z.n}`).join('  ')); const st = l.items.filter(i => i.t === 'star').length, got = new Set(o.flatMap(z => [...z.stars])); assert.equal(got.size, st, 'estrellas alcanzables');
});
test('2D: no se camina; las flechas solo giran y dan dirección', () => {
  const l = LEVELS_2D[0], w = buildWorld(l), a = make(w, w.spawns[0]), c = new AirControl(a); for (let t = 0; t < 3; t += 1 / 240) a.update(1 / 240, c.drive({ ...NO_INPUT, mx: 1, run: true, stay: true }, new Set())); assert.ok(Math.abs(a.pos.x) < .02); for (let t = 0; t < 1; t += 1 / 240) a.update(1 / 240, c.drive({ ...NO_INPUT, mx: -1, stay: true }, new Set())); assert.ok(Math.abs(a.pos.x) < .02); assert.ok(Math.sin(a.yaw) < -.95, 'se gira');
  assert.equal(w.walk, false); assert.equal(buildLab().walk, true); assert.ok(buildWorld(MAPS_3D[0]).walk);
});
test('2D: fallar devuelve al último objetivo; truco equivocado no cuenta; a la primera da estrella', () => {
  const l = sanitize({ mode: '2d', size: { x0: -6, x1: 14 }, items: [{ t: 'mat', x: 2.4, w: 2, h: .2 }, { t: 'zone', x: 2.4, y: .2, w: 1.8 }, { t: 'zone', x: 6, w: 1.4, trick: 'flipB' }] }), w = buildWorld(l), a = make(w, w.spawns[0]), r = new LevelRun(w), land = (name, lvl, x, y = 0) => { a.reset({ x, y, z: 0, yaw: 1.57 }); r.event({ type: 'land', name, lvl, isTrick: true }, a); r.event({ type: 'touchdown', p: { x, y, z: 0 } }, a); return r.update(1 / 60, a).map(e => e.type).filter(t => t !== 'score'); };
  assert.deepEqual(land('Salto', 5, 1.2), ['fail']); assert.equal(r.fails, 1); let ev = []; for (let i = 0; i < 90; i++) ev.push(...r.update(1 / 60, a)); assert.equal(ev[0].type, 'retry'); assert.equal(ev[0].spot.x, 0);
  assert.deepEqual(land('Salto', 5, 2.5, .2), ['target']); assert.equal(r.idx, 1); assert.equal(r.spot.x, 2.4); assert.deepEqual(land('Frontflip', 5, 6), ['fail']); assert.match(r.fail.why, /flipB|Backflip/); for (let i = 0; i < 90; i++) for (const e of r.update(1 / 60, a)) if (e.type === 'retry') a.reset(e.spot);
  assert.deepEqual(land('Backflip', 3, 6), ['target', 'finish']); assert.equal(r.done.stars, 1); r.reset(); a.reset(r.spot); land('Salto', 5, 2.5, .2); land('Backflip', 4, 6); assert.equal(r.done.stars, 3);
});
test('reglas en 3D: estrellas, punto de control, meta y marcas', () => {
  const l = sanitize({ mode: '3d', rules: { time: 9, task: { type: 'trick', id: 'flipB', n: 1 } }, items: [{ t: 'star', x: 0, z: 3, y: 1 }, { t: 'check', x: 0, z: 6 }, { t: 'zone', x: 2, w: 3, d: 3 }, { t: 'goal', x: 0, z: 12 }] }), w = buildWorld(l), a = make(w, w.spawns[0]), r = new LevelRun(w), ev = [];
  for (let f = 0; f < 600 && !r.done; f++) { for (let i = 0; i < 4; i++) a.update(1 / 240, { ...NO_INPUT, mz: 1 }); for (const e of a.drain()) r.event(e, a); ev.push(...r.update(1 / 60, a)); }
  assert.deepEqual(ev.map(e => e.type).filter(t => t !== 'score' && t !== 'pts'), ['star', 'check', 'finish']); assert.equal(r.done.stars, 2); assert.equal(w.respawn.z, 6); r.reset(); r.event({ type: 'land', name: 'Backflip', lvl: 4, isTrick: true, combo: 1 }, { com: { x: 2, y: 1, z: 0 } }); assert.ok(r.taskDone); assert.equal(r.zones.size, 1);
  assert.ok(!matches({ name: 'Cork sin completar', lvl: 4, isTrick: false }, 'cork')); assert.ok(!matches({ name: 'Backflip', lvl: 0, isTrick: true }, 'flipB')); assert.ok(matches({ name: 'J-step + Cork', lvl: 3, isTrick: true }, 'cork'));
  const st = store(), p = new Progress(st); assert.ok(p.add('n1', { stars: 2, time: 20 })); assert.ok(!p.add('n1', { stars: 3, time: 25 })); assert.deepEqual(new Progress(st).get('n1'), { stars: 3, time: 20, score: 0 });
  const lb = new Library(sanitize, st); const saved = lb.put({ name: 'Mío', mode: '3d', items: [{ t: 'block' }] }); assert.deepEqual(new Library(sanitize, st).list[0], saved); lb.remove(saved.id); assert.equal(new Library(sanitize, st).list.length, 0);
});

// ── 3D ──
const DIRS = Array.from({ length: 8 }, (_, i) => i * Math.PI / 4 + .2);
test('3D: corre, gira y salta en cualquier dirección', () => {
  for (const an of DIRS) { const a = make(flat()), mx = Math.sin(an), mz = Math.cos(an); for (let t = 0; t < 4; t += 1 / 240) a.update(1 / 240, { ...NO_INPUT, mx, mz, run: true }); assert.ok(a.speed > 6); assert.ok(a.velH.dot({ x: mx, y: 0, z: mz }) > 6); assert.ok(Math.abs(Math.atan2(Math.sin(a.yaw - an), Math.cos(a.yaw - an))) < .1); }
});
test('3D: cargando no se gira; la dirección decide hacia dónde viaja el truco', () => {
  for (const face of [0, 1.3, -2.2]) for (const rel of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const id of ['flipB', 'flipF', 'sideL', 'cork']) {
    const a = make(flat(), { x: 0, y: 0, z: 0, yaw: face }), p = new AirControl(a), an = face + rel, d = { x: Math.sin(an), z: Math.cos(an) }; let air = -1, r;
    for (let t = 0; t < 3 && !r; t += 1 / 240) { if (a.state === 'air' && air < 0) air = t; const u = t - air - .05, on = air >= 0 && u > 0 && (id === 'cork' ? (a.moveTheta || 0) < 285 : u < .77); a.update(1 / 240, p.drive({ ...NO_INPUT, jump: t > .3 && t < .8, mx: t > .35 ? d.x : 0, mz: t > .35 ? d.z : 0 }, new Set(on ? [id] : []))); if (a.state === 'takeoff') assert.ok(Math.abs(Math.sin(a.yaw - face)) < .03); r = a.drain().find(e => e.type === 'land'); if (r) { const go = (a.com.x * d.x + a.com.z * d.z); assert.ok(go > .9, `${id} ${rel} ${go}`); } }
    assert.ok(r.lvl >= 2 || id === 'cork', `${id} ${face} ${rel} ${r.grade}`);
  }
});
test('3D: los trucos caen de pie mirando en cualquier dirección, también con J-step', () => {
  for (const id of Object.keys(MOVES).filter(k => MOVES[k].vec && !MOVES[k].family)) for (const yaw of [0, 2.1]) for (const js of [false, true]) {
    const a = make(flat(), { x: 0, y: 0, z: 0, yaw }), p = new AirControl(a); let l, did;
    for (let t = 0; t < 4 && !l; t += 1 / 240) { if (js && !did && t > .3) { did = true; a.startJstep(); } a.update(1 / 240, p.drive({ ...NO_INPUT, jump: !js && t > .3 && t < .8 }, new Set(a.state === 'air' && (a.moveTheta || 0) < 285 ? [id] : []))); l = a.drain().find(e => e.type === 'land'); }
    assert.ok(l.lvl >= 3, `${id} yaw ${yaw} J ${js}: ${l.grade}`); assert.equal(l.name, (js ? 'J-step + ' : '') + MOVES[id].name);
  }
});
const vault3 = (id, len, h, an, { gap = 8, run = false, still = false, skew = 0, depth = 3 } = {}) => {
  const w = flat(), D = { x: Math.sin(an), z: Math.cos(an) }, yaw = an - Math.PI / 2; w.box([0, h / 2, 0], [len, h, depth], 'wood', { vaultable: true, yaw });
  const st = len / 2 + gap, a = make(w, { x: -D.x * st, y: 0, z: -D.z * st, yaw: an + skew * (still ? 1 : 0) }), s = new VaultSense(a, new Abilities(null)); let land, r, hands = 0; const m = { x: Math.sin(an + skew), z: Math.cos(an + skew) };
  for (let f = 0; f < 600 && !land; f++) { s.update(1 / 60); if (still ? f === 10 : s.opp && !s.opp.chosen) r = s.request(id); const o = s.opp, mv = o?.chosen ? (o.direct ? { x: o.mx, z: o.mz } : o.dir) : still ? { x: 0, z: 0 } : m; for (let i = 0; i < 4; i++) a.update(1 / 240, { ...NO_INPUT, mx: mv.x, mz: mv.z, run: o?.direct ? !!o.run : run }); assert.ok(finite(a)); for (const e of a.drain()) { if (e.type === 'land') land = e; if (e.type === 'hands') hands++; } }
  return { land, r, hands, along: a.com.x * D.x + a.com.z * D.z, lat: a.com.x * D.z - a.com.z * D.x, ids: s.opp?.ids };
};
test('3D: kong, doble kong y castaway por cualquier cara y con la caja girada', () => {
  for (const an of DIRS) for (const run of [false, true]) {
    const k = vault3('kong', 1, .95, an, { run }); assert.equal(k.land?.name, 'Kong', `${an} ${run}`); assert.ok(k.land.lvl >= 4, k.land.grade); assert.ok(k.along > .6);
    const d = vault3('dkong', 2.2, .95, an, { run, gap: 10 }); assert.equal(d.land?.name, 'Doble kong'); assert.equal(d.hands, 2); assert.ok(d.land.lvl >= 4);
    const c = vault3('castaway', .6, 1.6, an, { run }); assert.equal(c.land?.name, 'Castaway'); assert.ok(c.land.lvl >= 4, c.land.grade); assert.ok(c.along < -1);
  }
  const side = vault3('kong', 3, .95, .7 + Math.PI / 2, { depth: 1 }); // por el lado corto es larga: no hay kong
  assert.notEqual(side.land?.name, 'Kong');
  const skew = vault3('kong', 1, .95, .4, { skew: .25, depth: 7 }); assert.equal(skew.land?.name, 'Kong'); assert.ok(skew.land.lvl >= 4);
});
test('3D: parado cerca de un muro, la tecla basta', () => {
  for (const an of DIRS) for (const gap of [.5, 1.5, 3]) for (const skew of [0, 1]) { const c = vault3('castaway', .6, 1.6, an, { still: true, gap, skew }); assert.equal(c.r, 'ok'); assert.equal(c.land?.name, 'Castaway', `${an} ${gap}`); assert.ok(c.land.lvl >= 4, c.land.grade); const k = vault3('kong', 1, 1, an, { still: true, gap, skew }); assert.equal(k.land?.name, 'Kong'); assert.ok(k.land.lvl >= 4); }
  assert.equal(vault3('castaway', .6, 1.6, .3, { still: true, gap: 6 }).r, 'none');
});
test('3D: caminar al azar 40 s por cada mapa nunca rompe la física', () => {
  for (const l of MAPS_3D) { const w = buildWorld(l), a = make(w, w.spawns[0]), p = new AirControl(a), S = new VaultSense(a, new Abilities(null)); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, ids = Object.keys(MOVES).filter(k => k !== 'jstep'); let cur = {}, held = new Set(), next = 0, st = new Set();
    for (let t = 0; t < 40; t += 1 / 60) { if (t > next) { next = t + .2 + rnd() * .8; const an = rnd() * 6.28, m = rnd() < .8 ? 1 : 0; cur = { mx: Math.sin(an) * m, mz: Math.cos(an) * m, run: rnd() < .6, jump: rnd() < .4 }; held = new Set(rnd() < .5 ? [ids[rnd() * ids.length | 0]] : []); if (rnd() < .3) S.request(Object.keys(VAULTS)[rnd() * 3 | 0]); if (rnd() < .1) a.startJstep(); } S.update(1 / 60); const o = S.opp, c = o?.direct ? { ...cur, mx: o.mx, mz: o.mz, jump: false } : cur; for (let i = 0; i < 4; i++) a.update(1 / 240, p.drive({ ...NO_INPUT, ...c }, held)); st.add(a.state); a.drain(); assert.ok(finite(a)); assert.ok(a.com.x > w.x0 - .5 && a.com.x < w.x1 + .5 && a.com.z > w.z0 - .5 && a.com.z < w.z1 + .5 && a.com.y > -.2, `${l.id} ${t} ${a.state} ${a.com.toArray()}`); }
    console.log('   ', l.name, [...st].join(' ')); }
});
