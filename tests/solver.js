// Busca jugadas (momento, dirección, carga, mezcla de trucos y cuándo soltar) que caen en cada objetivo. Demuestra que el nivel tiene solución.
import { make, finite } from './sim.js';
import { buildWorld } from '../src/core/levels.js';
import { LevelRun } from '../src/core/run.js';
import { VaultSense, VAULTS } from '../src/core/vaults.js';
import { Abilities } from '../src/core/abilities.js';
import { AirControl, MOVES } from '../src/core/control.js';
import { NO_INPUT } from '../src/core/athlete.js';
const POOL = ['flipB', 'flipF', 'gainer', 'webster', 'sideR', 'sideL', 'flash', 'cork'];
export function tryPlay(level, w, idx, spot, p, tune) {
  w.time = 0; w.restore(); const zone = idx ? w.zones[idx - 1] : null, run = new LevelRun(w), c0 = { ...spot }; if (zone) { const q = w.live(zone); c0.x = q.x; c0.y = q.y; }
  const a = make(w, { x: c0.x, y: c0.y, z: 0, yaw: p.face * Math.PI / 2 }, tune), c = new AirControl(a), s = new VaultSense(a, new Abilities(null)); s.reach = 1.2; run.idx = idx; if (zone) run.setSpot({}, zone); let bounces = 0, was = false, res = null, i = 0, gap = 0, jumped = false;
  for (let f = 0; f < 60 * (p.wait + (p.bounce ? 12 : 8)) && !res; f++) {
    const t = f / 60 - p.wait, held = new Set(); let inp = { ...NO_INPUT, stay: true };
    s.update(1 / 60); if (p.vault && f === 6) s.request(p.vault); const o = s.opp;
    if (o?.direct) inp = { ...inp, mx: o.mx, run: !!o.run, stay: false };
    else if (!p.vault) {
      inp.jump = t > .2 && t < .2 + p.hold; const air = a.state === 'air' && a.bounceT <= 0; if (air) jumped = true;
      if (a.bounceT > 0 && !was) bounces++; was = a.bounceT > 0; if (p.bounce && a.bounceT > 0 && a.vel.y > 0 && bounces <= p.bounce) inp.jump = true; const live = !p.bounce || bounces >= p.bounce;
      if (air && live) { if (p.dir && a.airT < p.dur && !a.springN) inp.mx = p.dir; else if (p.steer && a.airT > .42) inp.mx = p.steer; } else if (p.dir && inp.jump && p.early) inp.mx = p.dir;
      if (air && live && a.airT > .03 && i < p.seq.length) { const q = c.own, fam = MOVES[p.seq[i]]?.family; if (gap > 0) { gap -= 1 / 60; if (gap <= 0) i++; } else if (fam) { const done = Math.abs(a.trick.twist - (c.twBase[p.seq[i]] ?? a.trick.twist)); if (done < p.rel[i] - 0) held.add(p.seq[i]); else if (c.capped) { gap = p.gap; if (i === p.seq.length - 1) i++; } } else { const go = (a.ttg ?? 9) > .12; if (go) held.add(p.seq[i]); if (q && q.id === p.seq[i] && q.deg >= p.rel[i]) { gap = p.gap; held.clear(); if (i === p.seq.length - 1) i++; } } }
    }
    for (let k = 0; k < 4; k++) a.update(1 / 240, c.drive(inp, held)); if (!finite(a)) throw new Error('no finito');
    for (const e of a.drain()) run.event(e, a); const ev = run.update(1 / 60, a), hit = ev.find(e => e.type === 'target'), bad = ev.find(e => e.type === 'fail'); if (hit) res = { ok: true, ev: hit, stars: [...run.got] }; else if (bad) res = { ok: false, why: bad.why, x: a.pos.x }; else if (jumped && ev.some(e => e.type === 'retry')) res = { ok: false, why: 'vuelve', x: a.pos.x };
  }
  return res || { ok: false, why: 'nada', x: a.pos.x };
}
export function solve(level, { max = 1400, need = 3, tune } = {}) {
  const w = buildWorld(level), out = []; let seed = 99; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647, rr = (a, b) => a + (b - a) * R(), pick = l => l[R() * l.length | 0];
  const per = Math.max(0, ...level.items.map(i => i.mp && (i.ma || i.t === 'swing') ? i.mp : 0));
  for (let i = 0; i < w.zones.length; i++) {
    const z = w.zones[i], wins = [], why = {}, prev = i ? w.zones[i - 1] : w.spawns[0], d = Math.sign(z.x - prev.x) || 1, tr = !!w.trampAt(prev.x, 0) && prev.y > .5; let n = 0, bestPts = 0; const stars = new Set();
    while (n < max && wins.filter(q => q.lvl >= 4).length < need) {
      n++; let p; if (VAULTS[z.trick]) { p = { face: n % 2 ? 1 : -1, vault: z.trick, wait: 0 }; if (n > 4) break; }
      else {
        const dbl = z.trick === 'double', req = z.trick === 'none' || z.trick === 'any' ? null : dbl ? pick(['flipB', 'flipF']) : z.trick, len = Math.max(z.n || 0, z.trick === 'none' ? (R() < .25 ? 1 : 0) : 1), seq = []; while (seq.length < len) seq.push(pick(POOL)); if (req) seq[R() * seq.length | 0] = req;
        const dur = pick([0, rr(.02, .3), rr(.1, .45), .45]); p = { face: R() < .75 ? d : -d, wait: per ? rr(0, per) : 0, hold: pick([.1, .2, .3, .45, .5]), dir: dur ? d : 0, dur, early: dur > .4, steer: pick([0, 0, 1, -1]), seq, rel: seq.map((q, k) => k < seq.length - 1 ? rr(305, 335) : dbl ? rr(590, 650) : rr(240, 312)), gap: pick([.02, .05, .15]), bounce: tr ? 2 + (R() * 4 | 0) : 0 };
      }
      const r = tryPlay(level, w, i, w.spawns[0], p, tune); if (r.ok) { wins.push({ ...p, lvl: r.ev.lvl, pts: r.ev.pts }); bestPts = Math.max(bestPts, r.ev.pts); r.stars.forEach(q => stars.add(q)); } else why[r.why] = (why[r.why] || 0) + 1;
    }
    out.push({ i, n, wins, why, stars, bestPts });
  }
  return out;
}
