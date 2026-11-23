// Puntuación: cada truco vale distinto; cuantos más y más variados en el mismo vuelo, más se multiplica. Caerse lo pierde todo.
import { VAULTS } from './vaults.js';
export const POINTS = {
  tuck: 20, pike: 30, jstep: 50, kong: 60, dkong: 90, twL: 80, twR: 80, flipB: 100, flipF: 110, sideL: 120, sideR: 120, aerial: 140, flash: 150, gainer: 160, webster: 170, raiz: 180, barani: 190, castaway: 200, btwist: 210, arabian: 230, cork: 260, dbtwist: 420, dcork: 560, tcork: 900,
};
// Clase de dificultad, para la tabla
export const tier = p => p >= 200 ? 'S' : p >= 150 ? 'A' : p >= 100 ? 'B' : 'C';
export const NAMES = { flipB: 'Backflip', flipF: 'Frontflip', sideL: 'Sideflip izq.', sideR: 'Sideflip der.', twL: 'Giro 360° izq.', twR: 'Giro 360° der.', tuck: 'Agrupado', pike: 'Carpa', jstep: 'J-step', cork: 'Cork', btwist: 'B-twist', dbtwist: 'Doble B-twist', dcork: 'Doble cork', tcork: 'Triple cork', raiz: 'Raiz', gainer: 'Gainer', webster: 'Webster', flash: 'Flash kick', aerial: 'Aerial', arabian: 'Arabian', barani: 'Barani', ...Object.fromEntries(Object.entries(VAULTS).map(([k, v]) => [k, v.name])) };
export const LAND = { perfect: 1.5, stable: 1.2, unbalanced: .8, steps: .5 };
export class Score {
  constructor() { this.style = 1; this.reset(); }
  reset() { this.total = 0; this.best = 0; this.clear(); }
  clear() { this.list = []; this.rings = 0; this.h0 = null; }
  get count() { return this.list.filter(t => !['tuck', 'pike', 'jstep'].includes(t.id)).length; }
  get base() { return this.list.reduce((s, t) => s + t.pts, 0); }
  get mult() { const L = this.list.filter(t => !['tuck', 'pike', 'jstep'].includes(t.id)), kinds = new Set(L.map(t => t.id)).size; return 1 + Math.max(0, L.length - 1) * .4 + Math.max(0, kinds - 1) * .25 + this.rings * .5; }
  // n: cuántas veces seguidas sin soltar (doble, triple…)
  add(id, n = 1) { const same = this.list.filter(t => t.id === id).length, k = n > 1 ? 1 + .5 * (n - 1) : same ? .6 : 1, t = { id, n, pts: Math.round((POINTS[id] || 0) * k) }; this.list.push(t); return t; }
  ring() { this.rings++; }
  // Aterriza: cobra o pierde
  land(e) {
    const n = this.count, pend = this.base, f = e.fall ? 0 : LAND[e.grade] ?? 0, chain = 1 + Math.max(0, (e.combo || 0) - 1) * .1, drop = !e.fall && pend ? Math.round(Math.max(0, e.drop || 0) * 10) : 0, mult = this.mult, pts = Math.round((pend + drop) * mult * f * chain * this.style / 5) * 5;
    const r = { pts, base: pend, drop, mult, land: f, chain, n, list: this.list, lost: e.fall && pend > 0 ? Math.round(pend * mult) : 0 }; this.total += pts; this.best = Math.max(this.best, pts); this.clear(); return r;
  }
}
