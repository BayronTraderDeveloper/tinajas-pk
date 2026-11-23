// Graba una acrobacia completa con la física real (60 fotogramas por segundo) y mide lo que pide la validación.
// La ejecuta como un jugador que sabe hacerla: mantiene la tecla de su familia y suelta en el momento justo.
import { Athlete, NO_INPUT } from './athlete.js';
import { AirControl } from './control.js';
import { World } from './world.js';
import { CONTACTS } from './body.js';
import { V } from './mathx.js';
import { ACRO, acroParams } from './acro.js';
export function stage() { const w = new World(); w.plane = false; w.x0 = -30; w.x1 = 30; w.z0 = -30; w.z1 = 30; w.box([0, -.5, 0], [60, 1, 60], 'floor', { id: 'floor', noCam: true }); w.spawns = [{ x: 0, y: 0, z: 0, yaw: Math.PI / 2 }]; return w; }
export function record(id, { tuning, world = stage(), spawn = { x: -2, y: 0, z: 0, yaw: Math.PI / 2 }, hold = .42, prep = .35, keep = 1.1, fps = 60 } = {}) {
  const A = ACRO[id], fam = A.family, a = new Athlete(world, tuning), c = new AirControl(a), P = acroParams[id], h = 1 / 240, raw = []; a.reset(spawn);
  let t = 0, air0 = -1, land = null, touch = -1, minY = 9, inv = 0, wasInv = false, maxW = 0, rel = -1;
  const st = { id, want: { flips: A.flips, twists: A.twists } };
  // sigue manteniendo hasta casi completar los twists que pide esa variante; el giro principal sigue solo
  const keepHolding = () => a.state !== 'air' || Math.abs(a.trick.twist - (c.twBase[fam] ?? a.trick.twist)) < 360 * A.twists - (A.lead ?? 70);
  for (let f = 0; t < 8; f++) {
    const charging = t > prep && t < prep + hold, air = a.state === 'air';
    if (charging && a.charging) a.arm(fam, id);
    const on = charging || (air && rel < 0 && keepHolding()); if (air && !on && rel < 0) rel = t;
    a.update(h, c.drive({ ...NO_INPUT, jump: charging }, new Set(on ? [fam] : []))); t += h;
    for (const e of a.drain()) { if (e.type === 'takeoff' && air0 < 0) air0 = t; if (e.type === 'land' && !land) { land = e; touch = t; } }
    if (a.state === 'air') { const up = V(0, 1, 0).applyQuaternion(a.rootQ); const isInv = up.y < -.2; if (isInv && !wasInv) inv++; wasInv = isInv; maxW = Math.max(maxW, a.omega.length() * 57.3); }
    if (a.state !== 'ragdoll') for (const q of CONTACTS) { const y = a.worldPt(q).y - (q.kind === 'foot' ? .02 : q.r); if (y < minY) { minY = y; st.minAt = [q.kind, a.state, +t.toFixed(3)]; } }
    if (f % Math.round(240 / fps) === 0) raw.push({ t, st: a.state, airT: a.airT, p: a.rootP.clone(), q: a.rootQ.clone(), l: a.sk.local.map(x => x.clone()), th: a.moveTheta || 0, tw: a.trick.twist, com: a.com.clone(), state: a.state });
    if (touch >= 0 && t > touch + keep) break;
  }
  // fases: A preparación, B impulso, C despegue, D rotación principal, E transición (justo antes de abrir), F apertura, G aterrizaje
  const r = rel < 0 ? touch : rel; for (const f of raw) f.phase = touch >= 0 && f.t >= touch ? 'G' : f.st === 'takeoff' ? 'B' : f.st !== 'air' ? 'A' : f.airT < .12 ? 'C' : f.t >= r ? 'F' : f.t >= r - .14 ? 'E' : 'D';
  const thMax = Math.max(...raw.map(f => f.th)), tw0 = raw.find(f => f.st === 'air')?.tw ?? 0;
  Object.assign(st, { frames: raw, land, name: land?.name, grade: land?.grade, air: touch >= 0 && air0 >= 0 ? touch - air0 : 0, inv, minY, maxW, thMax, flips: Math.floor((thMax + 50) / 360), twists: Math.round(Math.abs(raw.at(-1).tw - tw0) / 360 * 2) / 2, ok: !!land && land.lvl >= 3, release: rel });
  st.phases = Object.fromEntries([...'ABCDEFG'].map(k => [k, raw.filter(f => f.phase === k).length / fps]));
  return st;
}
