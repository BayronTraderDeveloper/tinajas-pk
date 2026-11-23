import test from 'node:test'; import assert from 'node:assert/strict';
import { make, flat } from './sim.js'; import { pack, unpack, toB64, fromB64, BYTES } from '../src/net/codec.js'; import { Room, cleanName, cleanCode } from '../src/net/room.js'; import { NO_INPUT } from '../src/core/athlete.js'; import { sanitize } from '../src/core/levels.js';
const bus = () => { const L = new Map(); const sync = () => { for (const x of L.values()) x.on.peers([...L.values()].map(y => y.me)); }; return async (code, me, on) => { L.set(me.id, { me, on }); sync(); return { send: m => { const c = JSON.parse(JSON.stringify(m)); for (const [id, x] of L) if (id !== me.id) x.on.message(c); }, close: () => { L.delete(me.id); sync(); } }; }; };
test('red: la postura viaja en 102 bytes con precisión', () => {
  const a = make(flat()); for (let i = 0; i < 500; i++) a.update(1 / 240, { ...NO_INPUT, mz: 1, run: true }); assert.equal(BYTES, 102); const s = fromB64(toB64([pack(a), pack(a)])); assert.equal(s.length, 2); assert.ok(s[1].p.distanceTo(a.rootP) < .01); assert.ok(s[1].q.angleTo(a.rootQ) < .01); s[1].l.forEach((q, i) => assert.ok(q.angleTo(a.sk.local[i + 1]) < .02));
  for (const x of [null, '', '%%%', 'AAAA', 'A'.repeat(9999), {}]) assert.deepEqual(fromB64(x), []);
});
test('red: dos jugadores se ven moverse con retardo corto y sin saltos', async () => {
  const open = bus(), mk = () => ({}), A = await new Room('X', { name: 'Ana', color: 1 }, mk(), open).join(sanitize({ mode: '3d' })); await new Promise(r => setTimeout(r, 5)); let got; const B = await new Room('X', { name: 'Beto', color: 2 }, { level: l => got = l }, open).join(null);
  assert.ok(A.isHost && !B.isHost); assert.equal(got.mode, '3d'); const a = make(flat()); let now = 1000, worst = 0, last = null, seen = 0; const pb = [...B.peers.values()][0];
  for (let i = 0; i < 600; i++) { for (let j = 0; j < 4; j++) a.update(1 / 240, { ...NO_INPUT, mz: 1 }); now += 1000 / 60; const bm = B.message; B.message = m => bm.call(B, m, now); A.tick(1 / 60, a, now); B.message = bm; const q = B.pose(pb, now); if (q && i > 200) { seen++; if (last) worst = Math.max(worst, q.p.distanceTo(last) * 60); last = q.p.clone(); } }
  assert.ok(seen > 300); assert.ok(worst < 4.6, `velocidad vista ${worst}`); const lag = (a.rootP.z - last.z) / 3.1; assert.ok(lag > .1 && lag < .45, `retardo ${lag}`);
  assert.ok(A.rate <= 6); A.peers.set('q', {}); A.peers.set('r', {}); A.peers.set('s', {}); A.peers.set('t', {}); assert.ok(A.rate * 36 <= 101);
  B.leave(); A.leave();
});
test('red: mensajes falsos o abusivos se ignoran; solo el anfitrión cambia el nivel', async () => {
  const open = bus(); let feeds = [], races = 0, lv = 0; const A = await new Room('Y', { name: 'A' }, {}, open).join(sanitize({})); await new Promise(r => setTimeout(r, 5)); const B = await new Room('Y', { name: '<b>B' }, { feed: (p, n, l) => feeds.push(n), race: () => races++, level: () => lv++ }, open).join(null); const n0 = lv;
  for (const m of [null, 1, {}, { f: 'nadie', k: 'land', lvl: 5 }, { f: A.me.id, k: 's', t: 'x' }, { f: A.me.id, k: 'fin', time: Infinity, stars: 2 }, { f: A.me.id, k: 'land', lvl: 'x' }]) B.message(m); assert.equal(feeds.length, 0); assert.equal(B.board.size, 0);
  B.message({ f: A.me.id, k: 'land', lvl: 5, name: '<img src=x onerror=1>' }); assert.ok(!/[<>]/.test(feeds[0])); for (let i = 0; i < 200; i++) B.message({ f: A.me.id, k: 'land', lvl: 5, name: 'x' }); assert.ok(feeds.length < 50); await new Promise(r => setTimeout(r, 1100));
  B.setLevel(sanitize({ name: 'robo' })); assert.notEqual(A.level.name, 'robo'); A.send('race', {}); B.send('race', {}); assert.equal(races, 1); A.setLevel(sanitize({ name: 'nuevo' })); assert.equal(B.level.name, 'nuevo'); assert.equal(lv, n0 + 1);
  A.leave(); assert.ok(B.isHost, 'si el anfitrión se va, pasa al siguiente'); B.leave(); assert.equal(cleanName('  <i>x '), 'ix'); assert.equal(cleanName(''), 'Atleta'); assert.equal(cleanCode(' ab-c 1'), 'ABC1');
});
test('red: el press llega a los demás con sus huellas; los falsos se ignoran', async () => {
  const open = bus(), got = []; const A = await new Room('Z', { name: 'Ana' }, {}, open).join(sanitize({})); await new Promise(r => setTimeout(r, 5)); const B = await new Room('Z', { name: 'Beto' }, { press: (p, d) => got.push([p.name, d]) }, open).join(null);
  A.send('press', { p: [2, .4, 0], prints: [{ edge: [2, .4, .1], toe: [2.15, .4, .1] }, { edge: [2, .4, -.1], toe: 'x' }, 5] });
  for (const p of [null, 'x', [1, 2], [1, 2, Infinity], [1e9, 0, 0]]) A.send('press', { p });
  assert.equal(got.length, 1); assert.equal(got[0][0], 'Ana'); assert.deepEqual(got[0][1].prints, [{ edge: [2, .4, .1], toe: [2.15, .4, .1] }]);
  B.leave(); A.leave();
});
