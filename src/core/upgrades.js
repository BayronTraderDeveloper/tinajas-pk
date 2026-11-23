// Árbol de mejoras: se compran con los puntos ganados y cambian de verdad la física.
export const BRANCHES = { salto: 'Salto', giro: 'Rotación', aire: 'Control', caida: 'Aterrizaje', habil: 'Habilidades', estilo: 'Estilo' };
// max: niveles · cost: puntos del primer nivel (cada nivel cuesta más) · req: [nodo, nivel] · fx: efecto por nivel sobre los valores físicos
export const NODES = {
  jump: { b: 'salto', name: 'Salto máximo', about: 'Saltas más alto', max: 5, cost: 600, fx: (T, n) => { T.jumpMax += .22 * n; T.jumpMin += .08 * n; }, show: n => `+${n * 4} % de impulso` },
  charge: { b: 'salto', name: 'Carga rápida', about: 'Cargas el salto antes', max: 3, cost: 500, req: ['jump', 1], fx: (T, n) => { T.chargeTime *= 1 - .14 * n; }, show: n => `${n * 14} % menos de espera` },
  push: { b: 'salto', name: 'Impulso', about: 'Llegas más lejos al dar dirección', max: 4, cost: 700, req: ['jump', 2], fx: (T, n) => { T.push *= 1 + .08 * n; }, show: n => `+${n * 8} % de distancia` },
  sprint: { b: 'salto', name: 'Velocidad', about: 'Corres más rápido en modo libre', max: 3, cost: 600, req: ['charge', 1], fx: (T, n) => { T.sprintSpeed += .35 * n; T.runAccel += .4 * n; }, show: n => `+${(n * .35).toFixed(1).replace('.', ',')} m/s` },
  spin: { b: 'giro', name: 'Velocidad de giro', about: 'Los mortales giran más rápido', max: 5, cost: 700, fx: (T, n) => { T.spinSpeed *= 1 + .06 * n; }, show: n => `+${n * 6} % de giro` },
  twist: { b: 'giro', name: 'Velocidad de twist', about: 'Los twists giran más rápido', max: 4, cost: 600, req: ['spin', 1], fx: (T, n) => { T.twistSpeed *= 1 + .08 * n; T.maxTwistL *= 1 + .06 * n; }, show: n => `+${n * 8} % de twist` },
  brake: { b: 'giro', name: 'Freno', about: 'Abres y paras el giro antes', max: 4, cost: 650, req: ['spin', 2], fx: (T, n) => { T.airBrakeTorque *= 1 + .1 * n; }, show: n => `+${n * 10} % de freno` },
  steer: { b: 'aire', name: 'Dirección en el aire', about: 'Corriges más la trayectoria', max: 4, cost: 500, fx: (T, n) => { T.airSteer += .55 * n; }, show: n => `+${n * 40} % de corrección` },
  assist: { b: 'aire', name: 'Sentido del cuerpo', about: 'Te enderezas mejor al final', max: 3, cost: 800, req: ['steer', 2], fx: (T, n) => { T.assist = Math.min(1, T.assist + .12 * n); }, show: n => `+${n * 34} % de ayuda` },
  land: { b: 'caida', name: 'Equilibrio', about: 'Más margen para caer de pie', max: 5, cost: 700, fx: (T, n) => { T.landingForgiveness *= 1 + .07 * n; }, show: n => `+${n * 7} % de margen` },
  recover: { b: 'caida', name: 'Recuperación', about: 'Te estabilizas antes tras caer', max: 3, cost: 500, req: ['land', 1], fx: (T, n) => { T.recover *= 1 - .2 * n; }, show: n => `${n * 20} % menos de espera` },
  kong: { b: 'habil', name: 'Kong potente', about: 'Sales más rápido del kong y del doble kong', max: 3, cost: 600, fx: (T, n) => { T.kong *= 1 + .07 * n; }, show: n => `+${n * 7} % de salida` },
  cast: { b: 'habil', name: 'Castaway alto', about: 'El castaway empuja más arriba', max: 3, cost: 700, req: ['kong', 1], fx: (T, n) => { T.cast += .25 * n; }, show: n => `+${n * 6} % de empuje` },
  bounce: { b: 'habil', name: 'Rebote', about: 'Trampolines y muelles lanzan más', max: 4, cost: 650, req: ['kong', 1], fx: (T, n) => { T.spring *= 1 + .05 * n; T.trampoline *= 1 + .04 * n; }, show: n => `+${n * 5} % de rebote` },
  style: { b: 'estilo', name: 'Estilo', about: 'Todos los saltos dan más puntos', max: 5, cost: 900, fx: (T, n) => { T.style *= 1 + .08 * n; }, show: n => `+${n * 8} % de puntos` },
  magnet: { b: 'estilo', name: 'Imán', about: 'Recoges estrellas y aros desde más lejos', max: 3, cost: 500, req: ['style', 1], fx: (T, n) => { T.magnet += .18 * n; }, show: n => `+${n * 18} cm` },
};
export const costOf = (id, lvl) => Math.round(NODES[id].cost * (1 + lvl * .75) / 50) * 50;
export class Upgrades {
  constructor(store = globalThis.localStorage) { this.store = store; this.lv = {}; this.points = 0; this.earned = 0; try { const s = JSON.parse(store?.getItem('tinajas.upgrades.v1')); if (s) { this.points = Math.max(0, s.points | 0); this.earned = Math.max(0, s.earned | 0); for (const k in NODES) if (s.lv?.[k] > 0) this.lv[k] = Math.min(NODES[k].max, s.lv[k] | 0); } } catch { } }
  save() { try { this.store?.setItem('tinajas.upgrades.v1', JSON.stringify({ lv: this.lv, points: this.points, earned: this.earned })); } catch { } }
  level(id) { return this.lv[id] || 0; }
  open(id) { const r = NODES[id].req; return !r || this.level(r[0]) >= r[1]; }
  full(id) { return this.level(id) >= NODES[id].max; }
  can(id) { return id in NODES && this.open(id) && !this.full(id) && this.points >= costOf(id, this.level(id)); }
  buy(id) { if (!this.can(id)) return false; this.points -= costOf(id, this.level(id)); this.lv[id] = this.level(id) + 1; this.save(); return true; }
  earn(n) { n = Math.max(0, Math.round(n)); this.points += n; this.earned += n; this.save(); }
  // Devuelve los puntos gastados para repartirlos de otra forma
  refund() { let t = 0; for (const k in this.lv) for (let i = 0; i < this.lv[k]; i++) t += costOf(k, i); this.lv = {}; this.points += t; this.save(); return t; }
  apply(base, out = {}) { Object.assign(out, base); for (const k in this.lv) NODES[k].fx(out, this.lv[k]); return out; }
}
