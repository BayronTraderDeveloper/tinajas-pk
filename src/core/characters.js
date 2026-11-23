// Personajes: aspecto (cuerpo, cara, pelo, ropa) y habilidades de partida. Los creados por el jugador se guardan aquí.
import { clamp } from './mathx.js';
export const HAIR = { corto: 'Corto', rapado: 'Rapado', largo: 'Largo', rizado: 'Rizado' };
export const TOPS = { camiseta: 'Camiseta', tirantes: 'Tirantes', sudadera: 'Sudadera', sin: 'Sin camiseta' };
export const BOTTOMS = { corto: 'Pantalón corto', largo: 'Pantalón largo' };
export const BEARD = { no: 'Sin barba', corta: 'Barba corta', perilla: 'Perilla' };
export const SKINS = ['#f1c7a6', '#e2b596', '#c98e64', '#b77b58', '#8d5a3b', '#5e3b26'];
const HEX = /^#[0-9a-f]{6}$/i;
// Habilidades de partida: multiplican la física (como las mejoras)
export const STATS = { jump: 'Salto', spin: 'Giro', land: 'Equilibrio', speed: 'Velocidad', air: 'Control en el aire' };
export const DEFAULT_LOOK = { height: 1.78, build: .35, skin: '#b77b58', hair: 'corto', hairColor: '#1d1512', eyes: '#4a2c17', beard: 'no', top: 'camiseta', shirt: '#e9ecef', accent: '#e5482d', bottom: 'corto', shorts: '#20262e', shoe: '#e5482d', sock: '#f3f3f1' };
export const CHARACTERS = [
  { id: 'bom', name: 'Bom Byron', about: 'Equilibrado y con todas las habilidades desde el principio: kong, doble kong y castaway.', abilities: ['kong', 'dkong', 'castaway'], stats: { jump: 1, spin: 1, land: 1.08, speed: 1, air: 1.1 }, look: { ...DEFAULT_LOOK } },
  { id: 'chino', name: 'Chino', about: 'Mide 2 metros y es musculoso: salta y corre con más fuerza, pero gira algo más lento.', abilities: ['kong', 'dkong'], stats: { jump: 1.07, spin: .94, land: 1.05, speed: 1.05, air: .95 }, look: { ...DEFAULT_LOOK, height: 2, build: 1, skin: '#c98e64', hair: 'rapado', hairColor: '#141010', beard: 'perilla', top: 'tirantes', shirt: '#1d2126', accent: '#f2c14e', bottom: 'largo', shorts: '#5b6470', shoe: '#f4f2ea' } },
  { id: 'guillie', name: 'Guillie PK', about: 'Rubio, ligero y ágil: gira más rápido y controla mejor en el aire.', abilities: ['kong', 'castaway'], stats: { jump: 1, spin: 1.08, land: .97, speed: 1.02, air: 1.2 }, look: { ...DEFAULT_LOOK, height: 1.76, build: .15, skin: '#e2b596', hair: 'largo', hairColor: '#d8b25c', eyes: '#3d6a8c', top: 'camiseta', shirt: '#2f6fb3', accent: '#f4f2ea', bottom: 'corto', shorts: '#f4f2ea', shoe: '#2f6fb3' } },
];
// Valida cualquier aspecto (de un archivo o de otro jugador)
export function cleanLook(l) {
  const s = l && typeof l === 'object' ? l : {}, o = { ...DEFAULT_LOOK }, col = (v, d) => typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : d, pick = (T, v, d) => typeof v === 'string' && Object.hasOwn(T, v) ? v : d;
  o.height = clamp(Number.isFinite(+s.height) ? +s.height : o.height, 1.6, 2.05); o.build = clamp(Number.isFinite(+s.build) ? +s.build : o.build, 0, 1);
  for (const k of ['skin', 'hairColor', 'eyes', 'shirt', 'accent', 'shorts', 'shoe', 'sock']) o[k] = col(s[k], o[k]);
  o.hair = pick(HAIR, s.hair, o.hair); o.top = pick(TOPS, s.top, o.top); o.bottom = pick(BOTTOMS, s.bottom, o.bottom); o.beard = pick(BEARD, s.beard, o.beard);
  o.height = Math.round(o.height * 100) / 100; o.build = Math.round(o.build * 100) / 100; return o;
}
export const lookKey = l => JSON.stringify(cleanLook(l));
// Habilidades del personaje aplicadas sobre la física
export function applyStats(T, st = {}) { const g = k => clamp(st[k] ?? 1, .8, 1.25); T.jumpMax *= g('jump'); T.jumpMin *= g('jump'); T.spinSpeed *= g('spin'); T.landingForgiveness *= g('land'); T.sprintSpeed *= g('speed'); T.jogSpeed *= g('speed'); T.airSteer *= g('air'); return T; }
// Lista guardada: los tres de serie y los creados
export class Roster {
  constructor(store = globalThis.localStorage) { this.store = store; this.mine = []; this.cur = 'bom'; try { const s = JSON.parse(store?.getItem('tinajas.chars.v1')); if (s) { this.mine = (s.mine || []).slice(0, 20).map(c => ({ id: String(c.id).replace(/[^\w-]/g, '').slice(0, 24) || 'c' + Math.random().toString(36).slice(2, 8), name: String(c.name || 'Atleta').replace(/[<>]/g, '').slice(0, 20), about: 'Creado por ti', abilities: ['kong', 'dkong', 'castaway'], stats: {}, look: cleanLook(c.look), mine: true })); this.cur = String(s.cur || 'bom'); } } catch { } if (!this.get(this.cur)) this.cur = 'bom'; }
  get all() { return [...CHARACTERS, ...this.mine]; }
  get(id) { return this.all.find(c => c.id === id); }
  get current() { return this.get(this.cur); }
  get chosen() { try { return !!this.store?.getItem('tinajas.chars.v1'); } catch { return true; } }
  save() { try { this.store?.setItem('tinajas.chars.v1', JSON.stringify({ cur: this.cur, mine: this.mine.map(c => ({ id: c.id, name: c.name, look: c.look })) })); } catch { } }
  choose(id) { if (this.get(id)) { this.cur = id; this.save(); } }
  put(c) { const o = { id: c.id || 'c' + Math.random().toString(36).slice(2, 8), name: String(c.name || 'Atleta').replace(/[<>]/g, '').trim().slice(0, 20) || 'Atleta', about: 'Creado por ti', abilities: ['kong', 'dkong', 'castaway'], stats: {}, look: cleanLook(c.look), mine: true }, i = this.mine.findIndex(x => x.id === o.id); if (i >= 0) this.mine[i] = o; else this.mine.push(o); this.cur = o.id; this.save(); return o; }
  remove(id) { this.mine = this.mine.filter(c => c.id !== id); if (this.cur === id) this.cur = 'bom'; this.save(); }
}
