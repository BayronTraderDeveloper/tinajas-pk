import test from 'node:test'; import assert from 'node:assert/strict';
import { run, make, flat, land, finite, trick, DT } from './sim.js';
import { buildLab } from '../src/core/lab.js';
import { Skeleton, TOTAL_MASS } from '../src/core/body.js';
import { POSES } from '../src/core/poses.js';

const TR = { x: 11, y: .95, z: 0, yaw: Math.PI / 2 };
test('masa e inercia: agruparse reduce la inercia del mortal', () => {
  assert.ok(Math.abs(TOTAL_MASS - 75) < 1.2, `${TOTAL_MASS}`);
  const I = p => { const s = new Skeleton(); s.setTarget(POSES[p]); s.snap(); return s.inertia().elements; };
  const lay = I('layout'), tuck = I('tuck'), wrap = I('wrapL'), open = I('open');
  assert.ok(lay[0] > 9 && lay[0] < 16, `layout ${lay[0]}`); assert.ok(tuck[0] < lay[0] * .5, `tuck ${tuck[0]}`); assert.ok(wrap[4] < open[4] * .8, `${wrap[4]} ${open[4]}`);
});
test('parado: estable, pies en el suelo', () => {
  const a = make(); run(a, 3); assert.equal(a.state, 'ground'); assert.ok(a.rootP.y > .85 && a.rootP.y < .96); for (const p of a.feetPoints()) assert.ok(Math.abs(p.y - .02) < .03, `${p.y}`);
});
test('correr: acelera progresivamente y los pies no patinan', () => {
  const a = make(); let v1, worst = 0, last = {};
  run(a, 4, t => ({ mz: 1, run: true }), (t, b) => { if (Math.abs(t - .5) < DT) v1 = b.speed; if (t > 3) for (const k of ['L', 'R']) { const f = b.foot[k], ph = (b.phase + (k === 'L' ? 0 : .5)) % 1, g = b.gait(b.speed); if (ph > .02 && ph < g.duty * .5 && last[k]) worst = Math.max(worst, Math.abs(f.p.z - last[k]) / DT); last[k] = ph < g.duty * .5 ? f.p.z : null; } });
  assert.ok(v1 < 4 && a.speed > 6.2, `${v1} ${a.speed}`); assert.ok(worst < .9, `patinaje ${worst}`);
});
test('más carga = más altura; correr = más distancia', () => {
  const j = hold => land(run(make(), 3, t => ({ jump: t < hold })));
  const s = j(.06), f = j(.7); assert.ok(f.apex > s.apex * 1.35, `${s.apex} ${f.apex}`); assert.ok(f.apex > 1 && f.apex < 1.9, `${f.apex}`); assert.equal(f.grade, 'perfect');
  const r = land(run(make(), 5, t => ({ mz: 1, run: true, jump: t > 2.2 && t < 2.7 }))); assert.ok(r.dist > 3.5, `${r.dist}`); assert.ok(r.lvl >= 4, r.grade);
});
test('momento angular se conserva en el aire sin teclas (agrupado o estirado)', () => {
  const a = make(flat(), undefined, { assist: 0 }); let L0, maxD = 0;
  run(a, 1.15, trick({ flip: -1, flipUntil: .02, openAt: 200 }), (t, b) => { if (b.state === 'air' && b.airT > .05) { if (!L0) L0 = b.L.length(); maxD = Math.max(maxD, Math.abs(b.L.length() - L0)); } });
  assert.ok(L0 > 20); assert.ok(maxD < .01, `${maxD}`);
});
test('agruparse acelera el giro; soltar no lo detiene', () => {
  const w = tuck => { let m = 0; run(make(), 1.2, trick({ flip: -1, flipUntil: .02, tuck, openAt: 400 }), (t, b) => { if (b.state === 'air' && b.airT > .25 && b.airT < .35) m = b.omega.length(); }); return m; };
  const lay = w(false), tk = w(true); assert.ok(tk > lay * 1.7, `${lay} ${tk}`); assert.ok(lay > 1.5);
});
for (const [name, o, want] of [['backflip', { flip: -1 }, 'Backflip'], ['frontflip', { flip: 1 }, 'Frontflip'], ['sideflip', { side: 1 }, 'Sideflip der.'], ['backflip 180', { flip: -1, twist: 1, twistUntil: 120, tuck: true }, 'Backflip + 180°'], ['backflip 360', { flip: -1, twist: 1, twistUntil: 290, tuck: true, flipUntil: 1 }, 'Backflip + 360°']])
  test(`${name}: existe un momento de apertura que se aterriza`, () => {
    let best = null, tries = []; for (let openAt = 60; openAt <= 360; openAt += 10) for (const fu of o.flipUntil ? [.3, .5, .9] : [.02, .15, .3, .5]) { const r = land(run(make(), 2.2, trick({ ...o, openAt, flipUntil: fu }))); if (r && r.name === want) { tries.push([openAt, fu, r.grade, r.x.toFixed(2)]); if (!best || r.x < best.x) best = r; } }
    assert.ok(best && best.lvl >= 4, `${want}: ${best && best.grade} ${JSON.stringify(tries.slice(0, 6))}`);
    const ok = tries.filter(t => ['perfect', 'stable'].includes(t[2])).length, fall = tries.filter(t => /fall|hard/.test(t[2])).length; console.log(`   ${name}: ${ok} limpios / ${fall} caídas de ${tries.length}`);
  });
test('el momento de apertura importa: abrir mal = caída', () => {
  const g = o => land(run(make(), 2.2, trick({ flip: -1, flipUntil: .3, openAt: o }))); const set = new Set([60, 150, 220, 300, 400, 900].map(o => g(o).grade)); assert.ok(set.size >= 3, [...set].join());
});
test('sin ayuda automática: sin teclas no hay mortal', () => { const r = land(run(make(), 2.2, t => ({ jump: t < .6 }))); assert.ok(Math.abs(r.flip) < 15 && r.name === 'Salto'); });
test('caídas: dirección coherente y ragdoll estable', () => {
  const seen = {};
  for (let i = 0; i < 30; i++) { const a = make(); const o = { flip: [-1, 1, 0][i % 3], side: i % 3 === 2 ? 1 : 0, openAt: 40 + i * 15, flipUntil: .1 + (i % 5) * .12, twist: i % 4 === 3 ? 1 : 0 }; let maxV = 0, minY = 9; const ev = run(a, 7, trick(o), (t, b) => { if (b.state === 'ragdoll') { maxV = Math.max(maxV, ...b.rag.v.map(v => v.length())); minY = Math.min(minY, ...b.rag.x.map(v => v.y)); } }); const r = land(ev); seen[r.grade] = (seen[r.grade] || 0) + 1; assert.ok(finite(a)); assert.ok(maxV < 24.9, `v ${maxV}`); assert.ok(minY > -.05, `y ${minY}`); assert.equal(a.state, 'ground', `${a.state} ${r.grade}`); }
  console.log('  ', JSON.stringify(seen)); assert.ok(Object.keys(seen).length >= 4);
});
test('trampolín: rebota, gana altura con impulso y no explota', () => {
  const w = buildLab(), a = make(w, TR); const apex = []; let last = 0;
  run(a, 14, (t, b) => ({ jump: t < .6 || (b.bounceT > 0 && b.vel.y > 0) }), (t, b) => { if (b.state === 'air' && last > 0 && b.vel.y <= 0) apex.push(+b.com.y.toFixed(2)); last = b.vel.y; });
  console.log('  ', apex.join(' ')); assert.ok(finite(a)); assert.ok(apex.length > 4); assert.ok(Math.max(...apex) > 3.2 && Math.max(...apex) < 8);
});
test('trampolín: triple backflip es posible', () => {
  let best = 0; for (const stop of [700, 800, 900, 1000]) { const a = make(buildLab(), TR); let n = 0, was = 0; run(a, 14, (t, b) => { if (b.bounceT > 0 && !was) n++; was = b.bounceT > 0; const go = n >= 4; return { jump: t < .6 || (b.bounceT > 0 && b.vel.y > 0), flip: go && Math.abs(b.trick.flip) < stop ? -1 : 0, tuck: go && b.bounceT <= 0 && Math.abs(b.trick.flip) < stop ? 1 : 0 }; }, (t, b) => { best = Math.max(best, Math.abs(b.trick.flip)); }); }
  assert.ok(best > 1020, `${best}`);
});
test('laboratorio: caminar al azar 60 s nunca rompe la física', () => {
  const a = make(buildLab(), { x: -5.6, y: 0, z: 0, yaw: Math.PI / 2 }); let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; let cur = {}, next = 0;
  run(a, 60, t => { if (t > next) { next = t + .15 + rnd() * .7; const an = rnd() * 6.28, m = rnd() < .75 ? 1 : 0; cur = { mx: Math.sign(Math.sin(an)) * m, mz: 0, run: rnd() < .5, jump: rnd() < .4, flip: [-1, 0, 0, 1][rnd() * 4 | 0], side: [-1, 0, 0, 1][rnd() * 4 | 0], twist: [-1, 0, 0, 1][rnd() * 4 | 0], tuck: rnd() < .4 ? 1 : 0 }; } return cur; }, (t, b) => { assert.ok(finite(b)); assert.ok(b.com.x > -17.3 && b.com.x < 104.3 && Math.abs(b.com.z) < 2.5 && b.com.y > -.1, `${t} ${b.state} ${b.com.toArray()}`); });
});
test('2.5D: vuelve al carril y mira solo a izquierda o derecha', () => {
  for (let i = 0; i < 8; i++) { const a = make(buildLab(), { x: 3, y: .12, z: 0, yaw: Math.PI / 2 }); run(a, 9, trick({ flip: i % 2 ? 1 : 0, side: i % 2 ? 0 : 1, twist: i % 3 - 1, openAt: 120 + i * 25 })); assert.equal(a.state, 'ground'); assert.ok(Math.abs(a.pos.z) < .05, `z ${a.pos.z}`); assert.ok(Math.abs(Math.abs(a.yaw) - Math.PI / 2) < .05, `yaw ${a.yaw}`); }
});
test('control directo: gira solo mientras se mantiene; soltar a medias = no se completa', async () => {
  const { AirControl, MOVES } = await import('../src/core/control.js'); const { NO_INPUT } = await import('../src/core/athlete.js');
  const go = (spawn, ids, { press = .75, delay = .03, hold = .5, pre = .3, hz = 240, mx = 0, run = false } = {}) => {
    const a = make(spawn ? buildLab() : flat(), spawn || undefined), p = new AirControl(a), dt = 1 / hz; let air = -1;
    for (let t = 0; t < pre + hold + 3; t += dt) {
      if (a.state === 'air' && air < 0 && a.bounceT <= 0) air = t; const u = t - air - delay, h = new Set(air >= 0 && u >= 0 && u < press ? ids : []), n = Math.ceil(240 * dt);
      for (let j = 0; j < n; j++) a.update(dt / n, p.drive({ ...NO_INPUT, jump: t > pre && t < pre + hold, mx, run }, h)); const l = a.drain().find(e => e.type === 'land'); if (l) return l;
    }
  };
  const S = { x: 3, y: .12, z: 0, yaw: Math.PI / 2 }, IZQ = { ...S, yaw: -Math.PI / 2 }, NAME = { flipB: 'Backflip', flipF: 'Frontflip', sideL: 'Sideflip izq.', sideR: 'Sideflip der.', twL: 'Giro 360°', twR: 'Giro 360°' };
  for (const id in MOVES) { const a = make(), p = new AirControl(a); for (let t = 0; t < 1; t += DT) a.update(DT, p.drive(NO_INPUT, new Set([id]))); assert.equal(a.state, 'ground'); assert.ok(a.rootP.y > .85, 'en el suelo no hace nada'); }
  for (const hz of [60, 144, 240]) for (const s of [S, IZQ, TR, null]) for (const id in NAME) { const r = go(s, [id], { hz, press: .77 }); assert.equal(r.name, NAME[id]); assert.ok(r.lvl >= 4, `${id} ${hz} ${r.grade} ${r.x}`); }
  for (const id of ['flipB', 'flipF', 'sideL', 'sideR']) {
    const early = go(S, [id], { press: .4 }), full = go(S, [id], { press: 9 }), ang = r => Math.abs(r.flip) + Math.abs(r.side);
    assert.equal(early.lvl, 0, `${id} soltado pronto debe caer`); assert.ok(ang(early) < 240, `${id} no debe completarse solo: ${ang(early)}`); assert.equal(full.lvl, 0, `${id} sin soltar se pasa`); assert.ok(ang(full) > 400);
    const tap = go(S, [id], { press: .1 }); assert.ok(ang(tap) < 30 && tap.lvl >= 4, `${id} toque ${ang(tap)} ${tap.grade}`);
    let ok = 0; for (let p = .4; p < 1; p += .01) if (go(S, [id], { press: p }).lvl >= 3) ok += 10; console.log('   ', id, 'margen para soltar:', ok, 'ms'); assert.ok(ok >= 130, `${id} ${ok}`);
  }
  for (const ids of [['flipB', 'twL'], ['flipB', 'twR'], ['flipF', 'twL'], ['sideL', 'twR'], ['sideL', 'twL'], ['sideR', 'twL']]) { let ok = 0; for (let p = .7; p < 1; p += .02) { const r = go(S, ids, { press: p }); if (r.lvl >= 3 && /flip.*\+ 360/.test(r.name)) ok += 20; } console.log('   ', ids.join(' + '), 'margen', ok, 'ms'); assert.ok(ok >= 120, `${ids} ${ok}`); }
  { const a = make(), p = new AirControl(a); let w = 0; for (let t = 0; t < 1.6; t += DT) { a.update(DT, p.drive({ ...NO_INPUT, jump: t < .5 }, new Set(a.state === 'air' ? ['flipB'] : []))); if (a.state === 'air') w = Math.max(w, a.omega.length() * 57.3); } console.log('    giro máximo', w.toFixed(0), '°/s'); assert.ok(w < 575, `gira demasiado rápido: ${w}`); }
});
test('dirección tras Espacio: el truco viaja adelante o atrás sin girar al atleta', async () => {
  const { AirControl } = await import('../src/core/control.js'); const { NO_INPUT } = await import('../src/core/athlete.js');
  for (const face of [1, -1]) for (const key of [1, -1, 0]) for (const when of ['espacio', 'despegue']) for (const id of ['flipB', 'flipF', 'sideL', 'sideR', 'twL']) {
    const a = make(buildLab(), { x: 3, y: .12, z: 0, yaw: face * Math.PI / 2 }), p = new AirControl(a); let air = -1, r;
    for (let t = 0; t < 3 && !r; t += DT) { if (a.state === 'air' && air < 0) air = t; const u = t - air - .05, on = when === 'espacio' ? t > .35 : air >= 0; a.update(DT, p.drive({ ...NO_INPUT, jump: t > .3 && t < .8, mx: on ? key : 0 }, new Set(air >= 0 && u > 0 && u < .77 ? [id] : []))); if (a.state === 'takeoff') assert.ok(Math.abs(a.yaw - face * Math.PI / 2) < .02, 'no debe girarse'); r = a.drain().find(e => e.type === 'land'); }
    const want = key * face; if (!want) assert.ok(Math.abs(r.travel) < .2); else assert.ok(r.travel * want > 1, `${id} ${when} cara ${face} tecla ${key}: ${r.travel}`); assert.ok(r.lvl >= 3, `${id} ${when} cara ${face} tecla ${key}: ${r.grade} ${r.x}`);
  }
});
test('obstáculos: hasta 0,6 m se suben trotando o corriendo; más altos bloquean', () => {
  for (const h of [.1, .25, .4, .5, .6, .65, .75, 1]) for (const r of [false, true]) {
    const w = flat(); w.plane = true; w.box([4, h / 2, 0], [2, h, 3], 'wood'); const a = make(w, { x: 0, y: 0, z: 0, yaw: Math.PI / 2 }); let top = 0, st = new Set(); run(a, 5, () => ({ mx: 1, run: r }), (t, b) => { top = Math.max(top, b.pos.y); st.add(b.state); assert.ok(!st.has('ragdoll'), `tropieza ${h}`); });
    if (h <= .6) { assert.ok(a.pos.x > 8, `${h} ${r} x=${a.pos.x}`); assert.ok(Math.abs(top - h) < .01); } else { assert.ok(a.pos.x < 3, `${h} debe bloquear: ${a.pos.x}`); assert.equal(top, 0); }
  }
  const w = flat(); w.plane = true; w.box([3, .5, 0], [2, 1, 3], 'wood'); const a = make(w, { x: 0, y: 0, z: 0, yaw: Math.PI / 2 }); let top = 0; run(a, 4, t => ({ mx: 1, run: true, jump: t > .1 && t < .42 }), (t, b) => { top = Math.max(top, b.state === 'ground' ? b.pos.y : 0); }); assert.ok(top > .9, `1 m se supera saltando: ${top}`);
});
test('trotar y correr son velocidades distintas', () => { const j = make(), r = make(); run(j, 3, () => ({ mz: 1 })); run(r, 3, () => ({ mz: 1, run: true })); assert.ok(j.speed > 2.5 && j.speed < 3.5, `${j.speed}`); assert.ok(r.speed > 6, `${r.speed}`); });
test('seis trucos asignables: guardan, intercambian y no se repiten', async () => {
  const { Slots, TRICKS, SLOT_KEYS } = await import('../src/slots.js'); const { MOVES } = await import('../src/core/control.js'); const m = {}, st = { getItem: k => m[k] ?? null, setItem: (k, v) => m[k] = v };
  assert.deepEqual(SLOT_KEYS, ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD']); assert.deepEqual(Object.keys(TRICKS).sort(), Object.keys(MOVES).sort());
  const s = new Slots(st); s.assign(0, 'twL'); assert.equal(s.list[0], 'twL'); assert.equal(s.list[4], 'flipB'); s.assign(1, 'pike'); s.assign(2, null); const t = new Slots(st); assert.deepEqual(t.list, s.list); assert.equal(new Set(t.list.filter(Boolean)).size, t.list.filter(Boolean).length); m['tinajas.slots.v1'] = '["x","flipB","flipB",1,2,3]'; assert.equal(new Slots(st).list.filter(Boolean).length, 1);
});
const vaultRun = async (len, h, { run = false, choose = true, dir = 1, locked = false, key } = {}) => {
  const { World } = await import('../src/core/world.js'); const { NO_INPUT } = await import('../src/core/athlete.js'); const { VaultSense } = await import('../src/core/vaults.js'); const { Abilities } = await import('../src/core/abilities.js');
  const w = new World(); w.plane = true; w.box([0, -.5, 0], [120, 1, 10], 'floor'); w.box([14 * dir, h / 2, 0], [len, h, 2.6], 'wood', { vaultable: true });
  const ab = new Abilities(null); if (locked) { ab.lock('kong'); ab.lock('dkong'); ab.lock('castaway'); } const a = make(w, { x: 0, y: 0, z: 0, yaw: dir * Math.PI / 2 }), s = new VaultSense(a, ab), o = { slow: 0, minScale: 1, id: null, hands: 0, res: [] }; let sc = 1;
  for (let f = 0; f < 720 && !o.land; f++) { const t = s.update(1 / 60); sc += (t - sc) * .2; if (s.opp) { o.ids = s.opp.ids; o.id = s.opp.ids[0]; if (!s.opp.chosen) { o.slow += 1 / 60; o.minScale = Math.min(o.minScale, sc); } if (choose && o.slow > .8 && !s.opp.chosen) o.res.push(s.choose(key || s.opp.ids[0])); }
    for (let i = 0; i < 4; i++) a.update(sc / 240, { ...NO_INPUT, mx: dir, run: run && !(s.opp?.chosen === 'castaway') }); if (a.state === 'vault') { o.vaulted = true; assert.ok(finite(a)); } for (const e of a.drain()) { if (e.type === 'land') o.land = e; if (e.type === 'hands') o.hands++; } }
  o.x = a.pos.x * dir; return o;
};
test('kong y doble kong: cada plataforma ofrece solo el suyo y se aterriza de pie al otro lado', async () => {
  for (const dir of [1, -1]) for (const run of [false, true]) for (const h of [.75, .95, 1.2]) for (const [len, id, n, name] of [[.5, 'kong', 1, 'Kong'], [1.1, 'kong', 1, 'Kong'], [1.4, 'kong', 1, 'Kong'], [1.6, 'dkong', 2, 'Doble kong'], [2.2, 'dkong', 2, 'Doble kong'], [3.2, 'dkong', 2, 'Doble kong']]) {
    const o = await vaultRun(len, h, { run, dir }); assert.equal(o.id, id, `${len}`); assert.equal(o.hands, n, `apoyos ${len}`); assert.equal(o.land.name, name); assert.ok(o.land.lvl >= 4, `${name} ${len} ${h} ${run} ${o.land.grade}`); assert.ok(o.x > 14 + len / 2, 'pasa al otro lado');
  }
});
test('decisión: 2 s reales en cámara lenta sutil; sin pulsar no hace nada; tecla equivocada y bloqueada', async () => {
  for (const run of [false, true]) { const o = await vaultRun(1, .9, { run, choose: false }); console.log('    ventana', o.slow.toFixed(2), 's, escala mínima', o.minScale.toFixed(2)); assert.ok(o.slow > 1.75 && o.slow < 2.2, `${o.slow}`); assert.ok(o.minScale >= .3 && o.minScale < .6); assert.ok(!o.vaulted); assert.ok(o.x < 13.6); }
  const wrong = await vaultRun(1, .9, { key: 'dkong' }); assert.equal(wrong.res[0], 'wrong'); assert.ok(!wrong.vaulted);
  const lock = await vaultRun(1, .9, { locked: true }); assert.equal(lock.id, null); assert.ok(!lock.vaulted);
  for (const [len, h] of [[1, .5], [1, 2.3], [4, .9]]) { const o = await vaultRun(len, h, {}); assert.equal(o.id, null, `${len}x${h}`); }
});
test('en el laboratorio hay plataformas de kong y doble kong con carrera suficiente', async () => {
  const { vaultFor } = await import('../src/core/vaults.js'); const v = buildLab().boxes.filter(b => b.id === 'vault'); assert.equal(v.length, 4); for (const b of v) assert.equal(vaultFor(b, 0), b.kind);
});
test('murallas: desde 1 m se puede hacer castaway y se cae de pie delante del muro, mirándolo', async () => {
  for (const dir of [1, -1]) for (const run of [false, true]) for (const h of [1, 1.2, 1.5, 1.8, 2]) { const o = await vaultRun(.6, h, { run, dir, key: 'castaway' }); assert.ok(o.ids.includes('castaway'), `${h}`); assert.equal(o.land.name, 'Castaway'); assert.ok(o.land.lvl >= 4, `${h} ${run} ${o.land.grade} ${o.land.x}`); assert.ok(o.x < 13.2 && o.x > 10, `cae delante: ${o.x}`); assert.ok(o.land.flip < -340); }
  assert.ok(!(await vaultRun(.6, .9, { choose: false })).ids.includes('castaway')); assert.deepEqual((await vaultRun(1, 1.1, { choose: false })).ids, ['kong', 'castaway']); assert.deepEqual((await vaultRun(1, 1.6, { choose: false })).ids, ['castaway']);
  for (const key of ['kong', 'castaway']) { const o = await vaultRun(1, 1.1, { key }); assert.equal(o.land.name, key === 'kong' ? 'Kong' : 'Castaway'); }
});
test('activación directa: parado cerca, pulsar la tecla basta; sin muro o imposible, no hace nada', async () => {
  const { World } = await import('../src/core/world.js'); const { NO_INPUT } = await import('../src/core/athlete.js'); const { VaultSense } = await import('../src/core/vaults.js'); const { Abilities } = await import('../src/core/abilities.js');
  const go = (id, len, h, gap, face = 1) => { const w = new World(); w.plane = true; w.box([0, -.5, 0], [120, 1, 10], 'floor'); w.box([14, h / 2, 0], [len, h, 2.6], 'wood', { vaultable: true }); const a = make(w, { x: 14 - len / 2 - gap, y: 0, z: 0, yaw: face * Math.PI / 2 }), s = new VaultSense(a, new Abilities(null)); let land, r, av, start = 0, scale = 1;
    for (let f = 0; f < 420 && !land; f++) { if (f === 20) { av = s.available(); r = s.request(id); } scale = Math.min(scale, s.update(1 / 60)); const o = s.opp; for (let i = 0; i < 4; i++) a.update(1 / 240, { ...NO_INPUT, mx: o?.direct ? o.mx : 0, run: !!o?.run }); if (a.state === 'vault' && !start) start = (f - 20) / 60; assert.ok(finite(a)); land = a.drain().find(e => e.type === 'land'); } return { r, av, land, start, scale, state: a.state }; };
  for (const gap of [.28, .6, 1.2, 2.5, 3.8]) for (const face of [1, -1]) {
    for (const h of [1, 1.5, 2]) { const o = go('castaway', .6, h, gap, face); assert.equal(o.r, 'ok'); assert.equal(o.land?.name, 'Castaway'); assert.ok(o.land.lvl >= 4, `castaway ${h} ${gap} ${o.land.grade}`); assert.equal(o.scale, 1, 'sin cámara lenta'); if (gap < .4 && face > 0) assert.ok(o.start < .1, 'inmediato'); }
    for (const len of [.5, 1.1, 1.4]) { const o = go('kong', len, 1, gap, face); assert.equal(o.land?.name, 'Kong'); assert.ok(o.land.lvl >= 4, `kong ${len} ${gap} ${o.land.grade}`); }
  }
  assert.equal(go('dkong', 2.2, 1, .5).r, 'run'); assert.equal(go('dkong', 2.2, 1, 3.8).land.name, 'Doble kong');
  for (const [id, len, h, gap] of [['castaway', .6, .9, .5], ['castaway', .6, 2.4, .5], ['castaway', .6, 1.5, 6], ['kong', 2.2, 1, .5], ['kong', 1, 1.6, .5]]) { const o = go(id, len, h, gap); assert.equal(o.r, 'none', `${id} ${h}`); assert.equal(o.state, 'ground'); assert.ok(!o.av.includes(id)); }
});
test('los 10 trucos: giran solo mientras se mantienen, se completan de pie y sin completar si se suelta pronto', async () => {
  const { AirControl, MOVES } = await import('../src/core/control.js'); const { NO_INPUT } = await import('../src/core/athlete.js'); const { TRICKS, ABOUT } = await import('../src/slots.js');
  const own = Object.keys(MOVES).filter(k => MOVES[k].vec && !MOVES[k].family); assert.equal(own.length + 3, 10); for (const k in TRICKS) assert.ok(ABOUT[k], k);
  const go = (id, { press = .78, delay = .03, js = false, yaw = Math.PI / 2, hz = 240, spawn } = {}) => { const a = make(buildLab(), spawn || { x: yaw > 0 ? 2 : 5, y: .12, z: 0, yaw }), p = new AirControl(a), dt = 1 / hz; let air = -1, l, rel = 0, w = 0, did = false;
    for (let t = 0; t < 4 && !l; t += dt) { if (js && !did && t > .3) { did = true; a.startJstep(); } if (a.state === 'air' && air < 0 && a.bounceT <= 0) air = t; const th = a.moveTheta || 0, u = t - air - delay, on = air >= 0 && u >= 0 && (press > 10 ? th < press : u < press) && a.state === 'air', n = Math.ceil(240 * dt); for (let j = 0; j < n; j++) a.update(dt / n, p.drive({ ...NO_INPUT, jump: !js && t > .3 && t < .8 }, new Set(on ? [id] : []))); assert.ok(finite(a)); if (a.state === 'air') w = Math.max(w, a.omega.length() * 57.3); l = a.drain().find(e => e.type === 'land'); } return { ...l, w, z: a.com.z }; };
  for (const id of own) {
    for (const hz of [60, 144]) for (const yaw of [Math.PI / 2, -Math.PI / 2]) { const r = go(id, { press: 285, yaw, hz }); assert.equal(r.name, MOVES[id].name); assert.ok(r.lvl >= 4, `${id} ${yaw} ${hz} ${r.grade} ${r.x}`); assert.ok(r.w < 560, `${id} gira a ${r.w}`); }
    const early = go(id, { press: 110 }); assert.equal(early.lvl, 0, `${id} soltado pronto: ${early.grade}`); assert.match(early.name, /sin completar|^Salto|^Giro/, early.name);
    const j = go(id, { press: 285, js: true }); assert.equal(j.name, 'J-step + ' + MOVES[id].name); assert.ok(j.lvl >= 3, `J ${id} ${j.grade} ${j.x}`);
    let ok = 0; for (let p = 200; p < 400; p += 10) if (go(id, { press: p }).lvl >= 3) ok += 10; assert.ok(ok >= 60, `${id} margen ${ok}°`); console.log('   ', MOVES[id].name, 'margen', ok + '°');
  }
  const a = make(buildLab(), { x: 3, y: .12, z: 0, yaw: Math.PI / 2 }); a.startJstep(); let z = 0; for (let t = 0; t < 2.5; t += DT) { a.update(DT, NO_INPUT); z = Math.max(z, Math.abs(a.pos.z)); } assert.ok(z > .2, 'curva'); assert.equal(a.state, 'ground'); assert.ok(Math.abs(a.pos.z) < .1);
  assert.match(go('cork', { press: 285, spawn: TR }).name, /cork/i, 'en el trampolín, mantener más da más twist');
});
