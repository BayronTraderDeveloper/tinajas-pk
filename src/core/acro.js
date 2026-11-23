// Acrobacias de tricking copiadas de vídeo real a cámara lenta, por fases:
// A preparación, B impulso, C despegue, D rotación principal, E transición, F apertura, G aterrizaje.
// Cork: paso de balanceo, brazos lanzados arriba, cabeza atrás y la pierna libre barriendo; una inversión diagonal hacia atrás
//   muy invertida (casi cabeza abajo), piernas algo recogidas y brazos al pecho para el twist; abre en tijera y cae primero con una pierna.
//   Doble y triple cork = la misma inversión con 720° y 1080° de twist.
// B-twist: paso lateral y carga en «U» (pecho a la rodilla), sube el pecho y patea atrás la pierna libre con los brazos abiertos;
//   en el aire va tumbado casi todo el vuelo, piernas cerradas y brazos recogidos durante el twist; cae primero con una pierna.
import { mix } from './poses.js';
import { clamp, smooth, lerp } from './mathx.js';
export const PHASES = { A: 'Preparación', B: 'Impulso', C: 'Despegue', D: 'Rotación principal', E: 'Transición', F: 'Apertura', G: 'Aterrizaje' };
export const PARAMS = { height: ['Altura del salto', 0, 3, .05, 'm/s'], spin: ['Velocidad de rotación', .6, 1.8, .05, '×'], tilt: ['Inclinación', 5, 85, 1, '°'], legs: ['Separación de piernas', 0, 1, .05, ''], arms: ['Brazos recogidos', 0, 1, .05, ''], open: ['Apertura antes del final', 30, 150, 5, '°'] };
const L3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const blendL = (p, q, k) => { const o = {}; for (const key in p) o[key] = q[key] ? L3(p[key], q[key], k) : p[key]; for (const key in q) if (!o[key]) o[key] = q[key]; return o; };
const armsOpen = { uparmL: [-20, 0, 82], uparmR: [-20, 0, -82], forearmL: [-10, 0, 0], forearmR: [-10, 0, 0] }, armsWrap = { uparmL: [-32, -60, 4], forearmL: [-124, 0, 0], uparmR: [-52, 54, -2], forearmR: [-128, 0, 0], handL: [0, 0, -12], handR: [0, 0, 12] };
const arms = k => blendL(armsOpen, armsWrap, clamp(k, 0, 1));
const P = (...parts) => Object.assign({}, ...parts);
const seq = (keys, t) => { let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++; const [a, A] = keys[i], [b, B] = keys[i + 1], u = clamp((t - a) / (b - a), 0, 1); return mix(A, B, u * u * (3 - 2 * u)); };
// Entradas (fases A y B)
const ENTRY = {
  cork: { // carga del paso de balanceo: brazos atrás y abajo, pierna de apoyo flexionada, la libre atrás
    charge: { spine: [20, 0, 0], chest: [10, 0, 0], neck: [-4, 0, 0], head: [-8, 0, 0], uparmL: [48, 0, 16], uparmR: [48, 0, -16], forearmL: [-20, 0, 0], forearmR: [-20, 0, 0], thighL: [-34, 0, 4], shinL: [52, 0, 0], footL: [-8, 0, 0], thighR: [26, 0, -4], shinR: [30, 0, 0], footR: [30, 0, 0] },
    // despegue: brazos lanzados arriba del todo, espalda arqueada, cabeza atrás; la pierna libre barre hacia arriba estirada
    launch: { spine: [-16, 6, 0], chest: [-14, 8, 0], neck: [-10, 0, 0], head: [-24, 10, 0], uparmL: [-172, 0, 16], uparmR: [-166, 0, -20], forearmL: [-8, 0, 0], forearmR: [-10, 0, 0], thighL: [8, 0, 3], shinL: [4, 0, 0], footL: [52, 0, 0], thighR: [-104, 0, -6], shinR: [8, 0, 0], footR: [44, 0, 0] }, travel: 'fwd', step: 2.4 },
  btwist: { // carga en «U»: pecho hacia la rodilla, cabeza abajo, rodillas abiertas, brazos que barren abajo y cruzados
    charge: { spine: [58, -10, 0], chest: [30, -14, 0], neck: [12, -6, 0], head: [18, -10, 0], uparmL: [-30, 0, 34], uparmR: [-64, 0, -14], forearmL: [-34, 0, 0], forearmR: [-46, 0, 0], thighL: [-62, 0, 22], shinL: [78, 0, 0], footL: [-10, 0, 0], thighR: [-40, 0, -24], shinR: [56, 0, 0], footR: [-6, 0, 0] },
    // sube el pecho y patea atrás la pierna libre; brazos que se abren para barrer
    launch: { spine: [6, 14, 0], chest: [-6, 18, 0], neck: [-6, 0, 0], head: [-10, 12, 0], uparmL: [-40, 0, 104], uparmR: [-40, 0, -100], forearmL: [-12, 0, 0], forearmR: [-12, 0, 0], thighL: [-14, 0, 6], shinL: [8, 0, 0], footL: [50, 0, 0], thighR: [52, 0, -12], shinR: [12, 0, 0], footR: [50, 0, 0] }, travel: 'side', face: true, lean: .6, step: 1.6 },
};
// Fases D, E y F según los grados del giro principal (th) y los twists ya hechos (tw)
const corkPose = (th, tw, n, p) => {
  const set = P({ spine: [-14, 8, -4], chest: [-12, 12, -4], neck: [-8, 8, 0], head: [-22, 24, 0] }, arms(.3 * p.arms), { thighL: [10, 0, 4], shinL: [16, 0, 0], footL: [50, 0, 0], thighR: [-90 + 30 * (1 - p.legs), 0, -6], shinR: [20, 0, 0], footR: [44, 0, 0] });
  const bend = lerp(48, 26, (n - 1) / 2), tight = P({ spine: [14, 6, 0], chest: [10, 10, 0], neck: [6, 10, 0], head: [-2, 28, 0] }, arms(lerp(.7, 1, (n - 1) / 2) * (.5 + .5 * p.arms)), { thighL: [-bend * 1.1, 0, -3], thighR: [-bend * 1.1 - 6, 0, 3], shinL: [bend * 1.5, 0, 0], shinR: [bend * 1.5 + 6, 0, 0], footL: [48, 0, 0], footR: [48, 0, 0] });
  // apertura en tijera: la pierna de caída baja estirada, la otra se queda recogida arriba
  const open = P({ spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-10, 0, 0] }, arms(.05), { thighL: [-14, 0, 6], shinL: [10, 0, 0], footL: [20, 0, 0], thighR: [-70 + 20 * (1 - p.legs), 0, -8], shinR: [86, 0, 0], footR: [40, 0, 0] });
  const rel = 360 - p.open; if (p.tight && th > 45) return tight; return seq([[0, set], [45, tight], [rel - 30, tight], [rel + 25, open]], th);
};
const btPose = (th, tw, n, p) => {
  const kick = P({ spine: [-18, 0, 0], chest: [-14, 0, 0], neck: [-6, 0, 0], head: [-14, 0, 0] }, arms(0), { thighL: [-34 * (.5 + p.legs), 0, 14], shinL: [8, 0, 0], footL: [52, 0, 0], thighR: [44 * (.5 + p.legs), 0, -14], shinR: [10, 0, 0], footR: [52, 0, 0] });
  const tight = P({ spine: [-4, 0, 0], chest: [-4, 0, 0], neck: [-2, 0, 0], head: [-6, 26, 0] }, arms(lerp(.75, 1, n - 1) * (.6 + .4 * p.arms)), { thighL: [-2, 0, -2], thighR: [-4, 0, 2], shinL: [4, 0, 0], shinR: [6, 0, 0], footL: [54, 0, 0], footR: [54, 0, 0] });
  // cae primero con una pierna: la de apoyo busca el suelo y la de la patada sigue arriba por detrás
  const land = P({ spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-10, 0, 0] }, arms(.05), { thighL: [-30, 0, 6], shinL: [14, 0, 0], footL: [24, 0, 0], thighR: [34 * (.4 + p.legs), 0, -8], shinR: [40, 0, 0], footR: [44, 0, 0] });
  const rel = 360 - p.open; if (p.tight && th > 95) return tight; return seq([[0, kick], [60, kick], [95, tight], [rel - 25, tight], [rel + 25, land]], th);
};
export const FAMILY = { cork: ['cork', 'dcork', 'tcork'], btwist: ['btwist', 'dbtwist'] };
// impulso de twist que permite cada nivel (brazos más pegados = más rápido)
export const TWMAX = { cork: 1.9, dcork: 2.8, tcork: 3.6, btwist: 2.4, dbtwist: 3.2 };
export const ACRO = {
  btwist: { name: 'B-twist', twists: 1, base: 'btwist', entry: ENTRY.btwist, def: { height: .35, spin: .8, tilt: 78, legs: .7, arms: .8, open: 70 }, pose: btPose },
  dbtwist: { name: 'Doble B-twist', twists: 2, base: 'btwist', entry: ENTRY.btwist, def: { height: 1.3, spin: .8, tilt: 80, legs: .5, arms: 1, open: 60 }, pose: btPose, lead: 120 },
  cork: { name: 'Cork', twists: 1, base: 'cork', entry: ENTRY.cork, def: { height: .35, spin: 1, tilt: 15, legs: .6, arms: .8, open: 75 }, pose: corkPose },
  dcork: { name: 'Doble cork', twists: 2, base: 'cork', entry: ENTRY.cork, def: { height: 1.1, spin: .95, tilt: 15, legs: .4, arms: .95, open: 70 }, lead: 120, pose: corkPose },
  tcork: { name: 'Triple cork', twists: 3, base: 'cork', entry: ENTRY.cork, def: { height: 2.5, spin: .9, tilt: 15, legs: .2, arms: 1, open: 65 }, lead: 120, pose: corkPose },
};
for (const [f, l] of Object.entries(FAMILY)) l.forEach((id, i) => { ACRO[id].family = f; ACRO[id].level = i + 1; ACRO[id].flips = 1; });
const KEY = 'tinajas.acro.v2';
export const acroParams = {}; for (const id in ACRO) acroParams[id] = { ...ACRO[id].def };
try { const s = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null'); if (s) for (const id in ACRO) for (const k in PARAMS) if (Number.isFinite(s[id]?.[k])) acroParams[id][k] = clamp(s[id][k], PARAMS[k][1], PARAMS[k][2]); } catch { }
export const saveAcro = () => { try { globalThis.localStorage?.setItem(KEY, JSON.stringify(acroParams)); } catch { } };
export const resetAcro = id => { Object.assign(acroParams[id], ACRO[id].def); saveAcro(); };
// Eje del giro principal [lateral, frente, vertical]: cork = mortal atrás inclinado; B-twist = giro de mariposa en vertical
export function axisOf(id) { const a = acroParams[id].tilt * Math.PI / 180; return ACRO[id].base === 'cork' ? [-Math.cos(a), 0, Math.sin(a)] : [0, 0, 1]; }
// Grados de giro principal a partir de los cuales empieza el twist
export const twistStart = id => ACRO[id].base === 'cork' ? 35 : 75;
export const variantName = (fam, n) => n < 1 ? ACRO[fam].name + ' sin twist' : ACRO[FAMILY[fam][Math.min(n, FAMILY[fam].length) - 1]].name;
