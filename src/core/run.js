// Partida de un nivel: tiempo, estrellas, puntos de control, reto y meta. Sin gráficos, para poder probarla.
import { MOVES } from './control.js';
import { VAULTS } from './vaults.js';
import { Score } from './score.js';

const SPIN = { flipB: /Backflip/, flipF: /Frontflip/, sideL: /Sideflip izq/, sideR: /Sideflip der/, twL: /\d+°/, twR: /\d+°/, double: /Doble (Back|Front|Side)|Triple/, press: /Press/ };
// ¿El aterrizaje cuenta como ese truco? Caerse o dejarlo a medias no cuenta.
export function matches(e, id) {
  if (e.lvl < 2 || /sin completar/.test(e.name)) return false; if (!id || id === 'any') return !!e.isTrick && !(e.vault && e.name === e.vault);
  if (VAULTS[id]) return e.vault === VAULTS[id].name; if (SPIN[id]) return SPIN[id].test(e.name); return !!MOVES[id]?.name && e.name.includes(MOVES[id].name);
}
export function taskText(rules, tricks) {
  const t = rules.task, n = t.n; if (t.type === 'none') return ''; if (t.type === 'clean') return 'Todos los aterrizajes limpios'; if (t.type === 'stars') return 'Recoge todas las estrellas'; if (t.type === 'zone') return 'Aterriza un truco en cada objetivo'; if (t.type === 'combo') return `Encadena ${n} trucos o habilidades sin caer`;
  if (t.type === 'vault') return `Haz ${n} × ${t.id === 'any' ? 'habilidad' : VAULTS[t.id]?.name || 'habilidad'}`;
  return `Completa ${n} × ${t.id === 'any' ? 'cualquier truco' : t.id === 'double' ? 'doble mortal' : t.id === 'press' ? 'press (media zapatilla en el borde)' : tricks?.[t.id] || t.id}`;
}
// Qué pide un objetivo
export const wantText = (id, tricks) => id === 'none' ? '' : id === 'any' ? 'un truco' : id === 'double' ? 'doble mortal' : VAULTS[id]?.name || tricks?.[id] || id;
export class LevelRun {
  constructor(world) { this.w = world; this.level = world.level; this.aim = !world.walk; this.score = new Score(); this.reset(); }
  reset() { this.time = 0; this.started = false; this.done = null; this.got = new Set(); this.zones = new Set(); this.check = -1; this.count = 0; this.falls = 0; this.outs = 0; this.fails = 0; this.best = 0; this.idx = 0; this.unclean = 0; this.score.reset(); this.jump = null; this.rings = new Set(); this.w.restore?.(); this.w.respawn = null; this.evs = []; this.fail = null; this.land = null; this.spot = { ...this.w.spawns[0] }; if (this.aim) this.setSpot(this.spot); }
  // ── Modo objetivos (2D, sin caminar) ──
  get target() { return this.aim ? this.w.zones[this.idx] || null : null; }
  // Punto de reaparición; si está sobre una pieza que se mueve, la sigue
  setSpot(p, zone = null) { const n = this.w.zones[this.idx], w = this.w, yaw = n && zone ? (w.live(n).x < w.live(zone).x ? -Math.PI / 2 : Math.PI / 2) : p.yaw ?? Math.PI / 2; this.spot = zone ? { z: 0, yaw, get x() { return w.live(zone).x; }, get y() { return w.live(zone).y; } } : { x: p.x, y: p.y, z: 0, yaw }; w.respawn = this.spot; this.spotBox = w.ground(this.spot.x, 0, this.spot.y + .25)?.box; }
  miss(why, wait = 1) { if (!this.fail && !this.done) { this.fails++; this.jump = null; this.score.total = Math.max(0, this.score.total - 150); this.fail = { why, t: wait }; this.evs.push({ type: 'fail', why }); } }
  touch(p, a) { // pies en el suelo, de pie: ¿dentro del objetivo?
    const e = this.land, z = this.target; if (!e || !z || this.fail || this.done) return; const q = this.w.live(z), inside = Math.abs(p.x - q.x) <= z.w / 2 + .06 && Math.abs(p.y - q.y) < .22, J = this.jump;
    if (inside) {
      if (z.trick !== 'none' && !matches(e, z.trick)) return this.miss(`Este objetivo pide ${wantText(z.trick, this.names)}`, 1.2); if (z.n && (J?.n || 0) < z.n) return this.miss(`Este objetivo pide ${z.n} ${z.n === 1 ? 'truco' : 'trucos'} en el aire`, 1.2);
      if (e.lvl < 4) this.unclean++; if (J) { this.score.total += J.pts; this.evs.push({ type: 'score', ...J }); } this.jump = null; this.zones.add(this.idx); this.idx++; this.evs.push({ type: 'target', i: this.idx - 1, lvl: e.lvl, name: e.name, pts: J?.pts || 0 }); this.setSpot({}, z); if (this.idx >= this.w.zones.length) this.finish({ first: this.fails === 0 }); return;
    }
    const g = this.w.ground(p.x, 0, p.y + .2)?.box; if (Math.abs(p.x - this.spot.x) < .55 && Math.abs(p.y - this.spot.y) < .25) { this.jump = null; return; } if (g && g === this.spotBox && g.id !== 'floor') { this.jump = null; this.fail = { t: .35, quiet: true }; return; }
    this.miss('Fuera del objetivo');
  }
  finish(x) { const r = this.done = { time: this.time, task: this.taskDone, outs: this.outs, falls: this.falls, fails: this.fails, score: this.score.total, best: this.score.best, ...x }; const goal = this.level.rules.score; r.goal = goal; r.third = goal ? r.score >= goal : r.first ?? r.inTime; r.stars = 1 + (r.task ? 1 : 0) + (r.third ? 1 : 0); this.evs.push({ type: 'finish', result: r }); }
  get task() { const t = this.level.rules.task; return t.type === 'none' && this.w.stars.length ? { type: 'stars' } : t; }
  // Progreso del reto: [hecho, total]
  get progress() { const t = this.task; switch (t.type) { case 'clean': return [this.unclean ? 0 : this.idx, this.w.zones.length]; case 'stars': return [this.got.size, this.w.stars.length]; case 'zone': return [this.zones.size, this.w.zones.length]; case 'combo': return [Math.min(this.best, t.n), t.n]; case 'trick': case 'vault': return [Math.min(this.count, t.n), t.n]; } return null; }
  get taskDone() { const p = this.progress; return p ? p[1] > 0 && p[0] >= p[1] : true; }
  update(dt, a) {
    const c = a.com, evs = this.evs; this.evs = [];
    if (!this.started && !this.done && (a.speed > .3 || a.state !== 'ground' || a.charging)) this.started = true;
    if (this.started && !this.done) this.time += dt;
    const zd = z => this.w.plane ? 0 : c.z - z;
    this.w.stars.forEach((s, i) => { if (this.got.has(i)) return; const q = this.w.live(s); if (Math.hypot(c.x - q.x, c.y - q.y - .1, zd(q.z)) < .85 + a.T.magnet) { this.got.add(i); evs.push({ type: 'star', i }); } });
    if (a.state === 'air') this.w.rings?.forEach((s, i) => { if (this.rings.has(i)) return; const q = this.w.live(s); if (Math.hypot(c.x - q.x, c.y - q.y, zd(q.z)) < s.w / 2 - .12 + a.T.magnet) { this.rings.add(i); this.score.ring(); evs.push({ type: 'ring', i }); } }); else if (a.state === 'ground' && this.rings.size) { this.rings.clear(); evs.push({ type: 'rings' }); }
    if (this.aim) {
      if (!this.fail && !this.done && a.state === 'ground' && a.lock <= 0 && a.pos && a.speed < .3 && this.target && (Math.abs(a.pos.x - this.spot.x) > 1.2 || Math.abs(a.pos.y - this.spot.y) > .5)) this.fail = { t: .5, quiet: true };   // quedó lejos de su punto sin aterrizar (p. ej. resbaló)
      if (this.fail) { this.fail.t -= dt; if (this.fail.t <= 0 || (this.fail.t < .4 && a.state === 'ground' && !this.fail.quiet)) { this.fail = null; this.land = null; this.jump = null; this.score.clear(); this.rings.clear(); this.w.restore?.(); evs.push({ type: 'retry', spot: this.spot }); } }
      return evs;
    }
    this.w.checks.forEach((s, i) => { if (i !== this.check && a.state === 'ground' && Math.hypot(a.pos.x - s.x, zd(s.z)) < Math.max(.9, s.w / 2) && Math.abs(a.pos.y - s.y) < 1.5) { this.check = i; this.w.respawn = { x: s.x, y: s.y, z: s.z, yaw: a.yaw }; evs.push({ type: 'check', i }); } });
    const g = this.w.goal; if (g && !this.done && a.state === 'ground' && Math.abs(a.pos.x - g.x) < Math.max(.5, g.w / 2) && Math.abs(zd(g.z)) < Math.max(.8, g.d / 2) && Math.abs(a.pos.y - g.y) < 1.2) { const par = this.level.rules.time, n = this.evs.length; this.finish({ inTime: !par || this.time <= par }); evs.push(...this.evs.splice(n)); }
    return evs;
  }
  // Sucesos del atleta
  event(e, a) {
    if (e.type === 'out') { this.outs++; if (this.aim && !this.done) { const q = this.fail; this.fail = null; if (!q) { this.fails++; this.score.total = Math.max(0, this.score.total - 150); } this.score.clear(); this.jump = null; this.rings.clear(); this.w.restore?.(); this.land = null; this.evs.push({ type: 'fail', why: 'Caíste al vacío' }); } return; }
    const S = this.score; if (e.type === 'trick') { const t = S.add(e.id, e.n); this.evs.push({ type: 'pts', ...t, mult: S.mult }); return; } if (e.type === 'jstep') { this.evs.push({ type: 'pts', ...S.add('jstep'), mult: S.mult }); return; } if (e.type === 'vault') { this.evs.push({ type: 'pts', ...S.add(e.id), mult: S.mult }); return; }
    if (e.type === 'fall') { this.falls++; if (this.aim) this.miss('Caída', 1.7); return; }
    if (this.aim && e.type === 'touchdown') return this.touch(e.p, a);
    if (e.type !== 'land' || this.done) return;
    if (!e.bounce) { const r = S.land(e); if (this.aim) { S.total -= r.pts; this.jump = r; if (e.fall && r.lost) this.evs.push({ type: 'score', ...r }); } else if (r.pts || r.lost) this.evs.push({ type: 'score', ...r }); }
    this.land = e; const t = this.task, before = this.progress?.[0]; this.best = Math.max(this.best, e.combo || 0);
    if (t.type === 'trick' && matches(e, t.id)) this.count++;
    if (t.type === 'vault' && e.vault && e.lvl >= 2 && (t.id === 'any' || e.vault === VAULTS[t.id]?.name)) this.count++;
    if (!this.aim && e.lvl >= 2) this.w.zones.forEach((z, i) => { const dx = a.com.x - z.x, dz = a.com.z - z.z, r = (z.r || 0) * Math.PI / 180, lx = dx * Math.cos(r) - dz * Math.sin(r), lz = dx * Math.sin(r) + dz * Math.cos(r); if (!this.zones.has(i) && matches(e, z.trick === 'none' ? 'any' : z.trick) && Math.abs(lx) < z.w / 2 + .15 && Math.abs(lz) < z.d / 2 + .15 && a.com.y - z.y > 0 && a.com.y - z.y < 1.8) { this.zones.add(i); this.evs.push({ type: 'zone', i }); } });
    if (this.progress && this.progress[0] !== before && t.type !== 'zone') this.evs.push({ type: 'task' });
  }
}
// Mejores marcas por nivel
export class Progress {
  constructor(store = globalThis.localStorage) { this.store = store; this.d = {}; try { const s = JSON.parse(store?.getItem('tinajas.progress.v1')); if (s && typeof s === 'object') this.d = s; } catch { } }
  get(id) { return { stars: 0, time: 0, score: 0, ...this.d[id] }; }
  add(id, r) { const p = this.get(id), fast = !p.time || r.time < p.time, rec = (r.score || 0) > (p.score || 0) || (!r.score && fast); this.d[id] = { stars: Math.max(p.stars, r.stars), time: fast ? r.time : p.time, score: Math.max(p.score || 0, r.score || 0) }; try { this.store?.setItem('tinajas.progress.v1', JSON.stringify(this.d)); } catch { } return rec; }
}
// Clasificación local: las mejores partidas de cada nivel y los mejores saltos
export class Rank {
  constructor(store = globalThis.localStorage) { this.store = store; this.d = { lv: {}, jumps: [] }; try { const s = JSON.parse(store?.getItem('tinajas.rank.v1')); if (s?.lv && Array.isArray(s.jumps)) this.d = s; } catch { } }
  save() { try { this.store?.setItem('tinajas.rank.v1', JSON.stringify(this.d)); } catch { } }
  add(id, e) { const L = this.d.lv[id] = [...(this.d.lv[id] || []), e].sort((a, b) => b.score - a.score).slice(0, 10); this.save(); return L.indexOf(e); }
  jump(e) { if (this.d.jumps.length >= 10 && e.pts <= this.d.jumps.at(-1).pts) return -1; this.d.jumps = [...this.d.jumps, e].sort((a, b) => b.pts - a.pts).slice(0, 10); this.save(); return this.d.jumps.indexOf(e); }
  of(id) { return this.d.lv[id] || []; }
  get total() { return Object.values(this.d.lv).reduce((s, l) => s + (l[0]?.score || 0), 0); }
}
// Niveles creados por el jugador
export class Library {
  constructor(clean, store = globalThis.localStorage) { this.store = store; this.clean = clean; this.list = []; try { const s = JSON.parse(store?.getItem('tinajas.levels.v1')); if (Array.isArray(s)) this.list = s.map(clean); } catch { } }
  save() { try { this.store?.setItem('tinajas.levels.v1', JSON.stringify(this.list)); return true; } catch { return false; } }
  put(l) { const c = this.clean(l), i = this.list.findIndex(x => x.id === c.id); if (i >= 0) this.list[i] = c; else this.list.push(c); this.save(); return c; }
  remove(id) { this.list = this.list.filter(l => l.id !== id); this.save(); }
}
