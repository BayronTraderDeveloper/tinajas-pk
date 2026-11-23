// Niveles como datos: un catálogo de piezas, validación y construcción del mundo físico. Sirve para 2D y 3D.
import { World } from './world.js';
import { clamp, DEG, V } from './mathx.js';

// Piezas: medidas por defecto [ancho x, alto y, fondo z] y límites
export const KINDS = {
  block: { name: 'Bloque', group: 'Obstáculos', size: [1.6, .5, 2.6], surface: 'wood', solid: true },
  vault: { name: 'Plataforma de kong', group: 'Obstáculos', size: [.8, .9, 2.6], surface: 'wood', solid: true },
  wall: { name: 'Muralla', group: 'Obstáculos', size: [.6, 1.6, 3], surface: 'wood', solid: true },
  stairs: { name: 'Escalera', group: 'Obstáculos', size: [2.25, 1.25, 2.6], surface: 'wood', solid: true },
  pit: { name: 'Hueco', group: 'Obstáculos', size: [3, 0, 0], only: '2d' },
  mat: { name: 'Colchoneta', group: 'Suelos', size: [4, .4, 3.2], surface: 'mat', solid: true },
  foam: { name: 'Espuma', group: 'Suelos', size: [4, .6, 3.2], surface: 'foam', solid: true },
  track: { name: 'Pista', group: 'Suelos', size: [7, .12, 2.8], surface: 'floor', solid: true },
  tramp: { name: 'Trampolín', group: 'Suelos', size: [4.6, .95, 2.8], solid: true },
  spring: { name: 'Muelle', group: 'Mecánicas', size: [1.2, .3, 1.6], surface: 'mat', solid: true },
  fan: { name: 'Viento', group: 'Mecánicas', size: [2, 5, 2.4] },
  ring: { name: 'Aro', group: 'Mecánicas', size: [1.9, 1.9, .3], y: 2 },
  swing: { name: 'Péndulo', group: 'Mecánicas', size: [.8, 3, .8], y: 4 },
  bar: { name: 'Barra', group: 'Mecánicas', size: [.2, 2.45, 2.4] },
  star: { name: 'Estrella', group: 'Reglas', size: [.6, .6, .6], y: 1.2 },
  check: { name: 'Punto de control', group: 'Reglas', size: [1, 2, 1], only: '3d' },
  zone: { name: 'Objetivo', group: 'Reglas', size: [1.4, .05, 2.2] },
  goal: { name: 'Meta', group: 'Reglas', size: [1.6, 2.6, 2.6], only: '3d' },
};
export const LIMITS = { w: [.2, 40], h: [.05, 40], d: [.3, 40] };
export const MOVABLE = ['block', 'vault', 'wall', 'mat', 'foam', 'track', 'spring', 'zone', 'star', 'ring', 'fan'], FRAGILE = ['block', 'mat', 'track', 'wall', 'vault', 'foam'];
export const THEMES = { gym: 'Gimnasio', park: 'Parque', roof: 'Azotea' };
export const TASKS = { none: 'Sin reto', clean: 'Todos los aterrizajes limpios', stars: 'Recoger todas las estrellas', trick: 'Completar trucos', vault: 'Hacer habilidades', combo: 'Encadenar trucos sin caer', zone: 'Truco en todos los objetivos' };
// Retos posibles en cada modo
export const TASKS_IN = { '2d': ['clean', 'stars', 'trick', 'vault'], '3d': ['none', 'stars', 'trick', 'vault', 'combo', 'zone'] };
export const vaultKind = len => len <= 1.4 + 1e-3 ? 'kong' : 'dkong';

const num = (v, d, lo, hi) => Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, lo, hi) : d, r3 = v => Math.round(v * 1000) / 1000;
const text = (v, d, n) => typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d;
// Nada de lo que llega de un archivo o de otro jugador se usa sin pasar por aquí
export function sanitize(src) {
  const s = src && typeof src === 'object' ? src : {}, mode = s.mode === '3d' ? '3d' : '2d', is3 = mode === '3d', b = s.size || {};
  const size = { x0: r3(num(b.x0, is3 ? -20 : -6, -150, 0)), x1: r3(num(b.x1, is3 ? 20 : 40, 5, 250)) }; if (is3) { size.x0 = Math.max(size.x0, -40); size.x1 = Math.min(size.x1, 40); size.z0 = r3(num(b.z0, -20, -40, -5)); size.z1 = r3(num(b.z1, 20, 5, 40)); }
  const items = (Array.isArray(s.items) ? s.items : []).slice(0, 300).filter(i => i && typeof i.t === 'string' && Object.hasOwn(KINDS, i.t) && (!KINDS[i.t].only || KINDS[i.t].only === mode)).map(i => {
    const K = KINDS[i.t], o = { t: i.t, x: r3(num(i.x, 0, size.x0, size.x1)), y: r3(num(i.y, 0, 0, 40)), z: is3 ? r3(num(i.z, 0, size.z0, size.z1)) : 0, w: r3(num(i.w, K.size[0], ...LIMITS.w)), h: r3(num(i.h, K.size[1], ...LIMITS.h)), d: r3(num(i.d, K.size[2], ...LIMITS.d)), r: r3(num(i.r, 0, -360, 360)) };
    if (!is3) o.r = Math.abs(o.r) % 360 > 90 && Math.abs(o.r) % 360 < 270 ? 180 : 0; if (i.t === 'pit') { o.y = 0; o.h = 0; o.d = 0; o.r = 0; } if (i.t === 'tramp') o.r = 0; if (i.t === 'zone') o.trick = typeof i.trick === 'string' && /^[a-zA-Z]{1,12}$/.test(i.trick) ? i.trick : 'none';
    if (i.t === 'zone') { const n = Math.round(num(i.n, 0, 0, 6)); if (n) o.n = n; }
    if (MOVABLE.includes(i.t) && ['x', 'y', ...(is3 ? ['z'] : [])].includes(i.ma) && num(i.md, 0, 0, 10) > 0) { o.ma = i.ma; o.md = r3(num(i.md, 0, 0, 10)); o.mp = r3(num(i.mp, 4, 1, 20)); o.mf = r3(num(i.mf, 0, 0, 1)); }
    if (i.t === 'swing') { o.md = r3(num(i.md, 50, 5, 85)); o.mp = r3(num(i.mp, 2.6, 1, 10)); o.mf = r3(num(i.mf, 0, 0, 1)); }
    if (FRAGILE.includes(i.t) && num(i.fr, 0, 0, 10) > 0) o.fr = r3(num(i.fr, 1, .2, 10));
    if (i.t === 'spring') { o.pow = r3(num(i.pow, 8, 3, 16)); o.push = r3(num(i.push, 0, -6, 6)); }
    if (i.t === 'fan') { o.dir = ['u', 'l', 'r'].includes(i.dir) ? i.dir : 'u'; o.md2 = r3(num(i.md2, 12, 1, 25)); }
    return o;
  });
  const p = s.spawn || {}, spawn = { x: r3(num(p.x, 0, size.x0 + .6, size.x1 - .6)), y: r3(num(p.y, 0, 0, 40)), z: is3 ? r3(num(p.z, 0, size.z0 + .6, size.z1 - .6)) : 0, yaw: r3(num(p.yaw, is3 ? 0 : Math.PI / 2, -7, 7)) }; if (!is3) spawn.yaw = Math.sin(spawn.yaw) < 0 ? -Math.PI / 2 : Math.PI / 2;
  const q = s.rules || {}, t = q.task || {}, type = TASKS_IN[mode].includes(t.type) ? t.type : is3 ? 'none' : 'clean', rules = { time: is3 ? Math.round(num(q.time, 0, 0, 999)) : 0, score: Math.round(num(q.score, 0, 0, 999999)), task: { type, n: Math.round(num(t.n, 1, 1, 20)) } };
  if (type === 'trick' || type === 'vault') rules.task.id = typeof t.id === 'string' && /^[a-zA-Z]{1,12}$/.test(t.id) ? t.id : 'any';
  return { v: 1, id: typeof s.id === 'string' && /^[\w-]{1,40}$/.test(s.id) ? s.id : 'n' + Math.random().toString(36).slice(2, 9), name: text(s.name, 'Nivel sin nombre', 40), about: text(s.about, '', 120), mode, theme: Object.hasOwn(THEMES, s.theme) ? s.theme : 'gym', size, spawn, rules, items };
}
// Cajas físicas de una pieza, en su propio marco (x adelante, y arriba)
function addItem(w, it) {
  const a = it.r * DEG, c = Math.cos(a), s = Math.sin(a), K = KINDS[it.t];
  const box = (lx, ly, lz, sx, sy, sz, surf, o) => w.box([it.x + lx * c + lz * s, it.y + ly, it.z - lx * s + lz * c], [sx, sy, sz], surf, { yaw: a, item: it, ...o });
  if (it.t === 'tramp') {
    const f = .4, t = w.tramp(it.x, it.z, it.w, it.d, it.y + it.h); t.item = it;
    for (const q of [-1, 1]) { box(0, it.h - .06, q * (it.d / 2 + f / 2), it.w + 2 * f, .12, f, 'mat', { id: 'frame' }); box(q * (it.w / 2 + f / 2), it.h - .06, 0, f, .12, it.d, 'mat', { id: 'frame' }); }
  } else if (it.t === 'stairs') { const n = Math.max(1, Math.round(it.h / .25)), sw = it.w / n; for (let i = 0; i < n; i++) { const h = it.h / n * (i + 1); box(-it.w / 2 + (i + .5) * sw, h / 2, 0, sw, h, it.d, 'wood', { id: 'step' }); } }
  else if (it.t === 'swing') box(0, -it.h, 0, it.w, it.w, it.w, 'foam', { id: 'swing', noCam: true, noStand: true });
  else if (K.solid) { const id = { block: 'platform', vault: 'vault', wall: 'rampart' }[it.t] || it.t; box(0, it.h / 2, 0, it.w, it.h, it.d, K.surface, { id, label: r3(it.h), vaultable: !it.calm && !it.md && !it.fr && !!{ block: 1, vault: 1, wall: 1 }[it.t], ...(it.t === 'spring' ? { launch: it.pow, push: it.push } : {}), ...(it.t === 'vault' ? { kind: vaultKind(it.w) } : {}) }); }
}
// Tramos de suelo que quedan entre los huecos
export function floorSpans(x0, x1, pits) { let L = [[x0, x1]]; for (const p of pits) { const a = p.x - p.w / 2, b = p.x + p.w / 2; L = L.flatMap(([u, v]) => b <= u || a >= v ? [[u, v]] : [[u, a], [b, v]].filter(q => q[1] - q[0] > .05)); } return L; }
export function buildWorld(level) {
  const w = new World(), S = level.size, is3 = level.mode === '3d', of = t => level.items.filter(i => i.t === t);
  Object.assign(w, { plane: !is3, walk: is3 || !!level.lab, x0: S.x0, x1: S.x1, z0: is3 ? S.z0 : -4.5, z1: is3 ? S.z1 : 4.9, theme: level.theme, level, stars: of('star'), checks: of('check'), zones: of('zone'), goal: of('goal')[0] || null });
  const { x0, x1, z0, z1 } = w, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; w.spans = floorSpans(x0, x1, of('pit'));
  if (is3) w.box([cx, -.5, cz], [x1 - x0, 1, z1 - z0], 'floor', { id: 'floor', noCam: true });
  else for (const [a, b] of w.spans) w.box([(a + b) / 2, -.5, cz], [b - a, 1, z1 - z0], 'floor', { id: 'floor', noCam: true });
  for (const x of [x0 - .2, x1 + .2]) w.box([x, 4, cz], [.4, 80, z1 - z0], 'wall', { id: 'wall' });
  if (is3) for (const z of [z0 - .2, z1 + .2]) w.box([cx, 4, z], [x1 - x0, 40, .4], 'wall', { id: 'wall' });
  for (const it of level.items) addItem(w, it);
  w.rings = of('ring'); w.fans = of('fan'); w.bars = of('bar').map(it => { const a = it.r * DEG, ax = is3 ? V(Math.sin(a), 0, Math.cos(a)) : V(0, 0, 1); return { item: it, p: V(it.x, it.y + it.h, is3 ? it.z : 0), axis: ax, half: it.d / 2 }; }); w.movers = w.boxes.filter(b => b.item && (b.item.t === 'swing' || (b.item.ma && b.item.md))); for (const b of w.movers) { b.c0 = b.c.clone(); b.v = b.c.clone().set(0, 0, 0); }
  const fr = w.boxes.filter(b => b.item?.fr); if (fr.length) { w.fragile = fr; w.restore(); } w.step(1e-6); for (const b of w.movers) b.v.set(0, 0, 0); w.time = 0;
  // pilar bajo las piezas que quedan sobre un hueco
  if (!is3) for (const it of level.items) if (KINDS[it.t].solid && it.y === 0 && !it.ma && !it.fr && it.t !== 'tramp' && !w.spans.some(([a, b]) => it.x - it.w / 2 >= a - .01 && it.x + it.w / 2 <= b + .01)) w.box([it.x, -3.005, 0], [it.w * .94, 6, it.d * .94], 'wall', { id: 'pillar', noCam: true });
  w.spawns = level.spawns || [{ name: 'Inicio', ...level.spawn }]; w.respawn = null;
  return w;
}
