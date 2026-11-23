// Control directo en el aire: el truco gira SOLO mientras se mantiene pulsado.
// Al soltar, el cuerpo se abre y frena (con inercia). El jugador decide cuándo soltar para caer de pie.
import { clamp, DEG, V, UP, smooth } from './mathx.js';
import { ACRO, FAMILY, TWMAX, acroParams, axisOf, twistStart, variantName } from './acro.js';
// axis: eje simple · vec: eje propio [lateral, frente, vertical] (fuera de eje) · tw: grados de twist según el giro
const ramp = (a, b, deg) => { const f = t => deg * smooth((t - a) / (b - a)); return t => Math.floor(t / 360) * deg + f(t % 360); };   // se repite en cada vuelta
export const MOVES = {
  flipB: { axis: 'flip', s: -1 }, flipF: { axis: 'flip', s: 1 }, sideL: { axis: 'side', s: -1 }, sideR: { axis: 'side', s: 1 },
  twL: { axis: 'twist', s: 1, ground: true }, twR: { axis: 'twist', s: -1, ground: true }, tuck: { pose: 'tuck' }, pike: { pose: 'pike' },
  jstep: { setup: true },
  // Cork: mortal atrás fuera de eje (inclinado unos 35° hacia la vertical: el cuerpo no llega a quedar cabeza abajo) y el twist en el centro del vuelo
  cork: { name: 'Cork' },
  // B-twist: patada de mariposa (cuerpo tumbado boca abajo, girando casi en vertical) con el twist mientras está tumbado
  btwist: { name: 'B-twist' },
  raiz: { name: 'Raiz', vec: [-.28, -.66, .70], tw: null, travel: .8, I: 8 },                 // giro tumbado, patada arriba
  gainer: { name: 'Gainer', vec: [-1, 0, 0], tw: null, travel: 1.6 },                         // mortal atrás avanzando, a una pierna
  webster: { name: 'Webster', vec: [1, 0, 0], tw: null, travel: 1.5 },                        // mortal adelante a una pierna
  flash: { name: 'Flash kick', vec: [-1, 0, 0], tw: null, travel: 0 },                        // mortal estirado con patada
  aerial: { name: 'Aerial', vec: [1, 0, 0], tw: t => 90 * smooth((t %= 360) / 95) * (1 - smooth((t - 170) / 100)), cam: true, la: .12, travel: 1.5 }, // rueda sin manos
  arabian: { name: 'Arabian', vec: [-1, 0, 0], tw: ramp(20, 130, 180), travel: -.6, tuckAfter: 110 },  // media vuelta y mortal adelante
  barani: { name: 'Barani', vec: [1, 0, 0], tw: ramp(55, 285, 180), la: .075, travel: 1.2 },           // mortal adelante con medio giro
};
for (const m of Object.values(MOVES)) if (m.vec) { const l = Math.hypot(...m.vec); m.vec = m.vec.map(x => x / l); }
// Las cinco acrobacias: eje, twist y velocidad salen de sus ajustes; no pueden dar más vueltas de las que les tocan
// Cork y B-twist: cada uno es una familia. Mantener la tecla encadena la siguiente vuelta (o el segundo twist); soltar a tiempo es cosa del jugador.
for (const [id, vars] of Object.entries(FAMILY)) { const A = ACRO[id], m = MOVES[id] = { name: A.name, acro: true, family: id, vars, max: 360, ground: true, travel: A.base === 'cork' ? 1.3 : 1.4, side: A.entry.travel === 'side', I: A.base === 'btwist' ? 7.5 : undefined }; Object.defineProperty(m, 'vec', { get: () => axisOf(id), enumerable: true }); }
export { variantName };
const brakeFor = (I, twisted) => BRAKE * (twisted ? clamp(I / 6.2, 1, 2) : 1);   // frenar cuesta parecido agrupado o estirado
const I_OPEN = 11.9, BRAKE = 2.9, SPIN = ['flip', 'side', 'x'], AXES = [...SPIN, 'twist'];

export class AirControl {
  constructor(athlete) { this.a = athlete; this.reset(); }
  reset() { this.mode = { flip: 0, side: 0, x: 0, twist: 0 }; this.target = { flip: null, side: null, x: null, twist: null }; this.want = { flip: 0, side: 0, x: 0 }; this.mixed = false; this.id = null; this.base = { flip: 0, side: 0, x: 0 }; this.rot0 = 0; this.twBase = {}; this.own = null; this.ownTw = null; this.prev = null; this.chain = false; this.capped = false; this.lvl = 1; this.twT = null; this.famHeld = false; if (this.a.moveLog) this.a.moveLog = {}; this.a.moveId = null; }
  get mv() { return this.id ? MOVES[this.id] : null; }
  axis(k) { const a = this.a; if (k === 'flip') return a.tkRight; if (k === 'side') return a.tkFwd; const v = this.mv.vec; return V().addScaledVector(a.tkRight, v[0]).addScaledVector(a.tkFwd, v[1]).addScaledVector(UP, v[2] * this.turnSign()); }
  turnSign() { return 1; }
  raw(id) { const t = this.a.trick, v = MOVES[id].vec; return t.flip * v[0] + t.side * v[1] + t.spin * v[2]; }
  turned(k) {
    const a = this.a; if (k === 'twist') return a.trick.twist; return this.rot(k) - this.base[k];
  }
  rot(k) { const t = this.a.trick; return k === 'x' ? this.raw(this.id) : t[k]; }
  // Grados propios del truco desde que se empezó a mantener
  th() { return this.raw(this.id) - this.rot0; }
  // Inclinación real del cuerpo respecto a la vertical, medida sobre el eje del truco: así se puede enlazar uno con otro
  phase(k) { const ax = this.axis(k).normalize(), u = V(0, 1, 0).applyQuaternion(this.a.rootQ), p = UP.clone().addScaledVector(ax, -UP.dot(ax)), q = u.addScaledVector(ax, -u.dot(ax)); if (p.length() < .2 || q.length() < .25) return 0; return Math.atan2(p.clone().cross(q).dot(ax), p.dot(q)) / DEG; }
  // Reparte el giro entre los trucos según cuál manda en cada momento
  track(cmd, xid) {
    const a = this.a, t = a.trick, p = this.prev || { flip: t.flip, side: t.side, twist: t.twist, spin: t.spin }, S = a.segs; this.prev = { flip: t.flip, side: t.side, twist: t.twist, spin: t.spin }; if (!S) return;
    const want = xid || (cmd.flip ? (cmd.flip < 0 ? 'flipB' : 'flipF') : cmd.side ? (cmd.side > 0 ? 'sideR' : 'sideL') : null), seg = id => { const s = { id, deg: 0, n: 0 }; S.push(s); return s; };
    if (want && (!this.own || this.own.id !== want || (this.own.off && this.own.n > 0))) this.own = seg(want); if (this.own) this.own.off = !want;
    if (cmd.twist && !xid) { const id = cmd.twist > 0 ? 'twL' : 'twR'; if (!this.ownTw || this.ownTw.id !== id) this.ownTw = seg(id); }
    const bump = (s, d) => { s.deg += d; const n = Math.floor((s.deg + 50) / 360); if (n > s.n) { s.n = n; if (!MOVES[s.id]?.family) a.emit('trick', { id: s.id, n }); } };
    if (this.own) { const v = MOVES[this.own.id], d = v.vec ? (t.flip - p.flip) * v.vec[0] + (t.side - p.side) * v.vec[1] + (t.spin - p.spin) * v.vec[2] : v.axis === 'flip' ? (t.flip - p.flip) * v.s : (t.side - p.side) * v.s; bump(this.own, d); }
    if (this.ownTw && !this.mode.x) bump(this.ownTw, (t.twist - p.twist) * MOVES[this.ownTw.id].s);
    for (const id of ['tuck', 'pike']) if (this.held?.has(id)) { const s = S.find(q => q.pose === id) || (S.push({ id, pose: id, deg: 0, n: 0 }), S.at(-1)); s.t = (s.t || 0) + 1; if (s.t === 60 && S.some(q => q.n > 0 || Math.abs(q.deg) > 120)) { s.n = 1; a.emit('trick', { id, n: 1 }); } }
  }
  spinL(k) { return this.a.L.dot(this.axis(k)); }
  // Grados que aún recorrerá si suelta ahora: se abre y frena hasta parar
  stopAngle(k) {
    const a = this.a, T = a.T, h = .01; let ang = 0;
    if (k === 'twist') { let L = Math.abs(a.hTwist), t = 0; while (L > 0 && t < 1) { ang += L / (a.Itwist || 1.4) * h; L -= T.airTwistTorque * 1.8 * h; t += h; } return ang / DEG; }
    const Io = (k === 'x' && this.mv.I) || I_OPEN; let L = Math.abs(this.spinL(k)), t = 0; const I0 = a.Iflip || Io, tEnd = Math.max(.05, a.ttg ?? 1);
    while (L > 0 && t < tEnd) { const I = Io + (I0 - Io) * Math.exp(-Math.max(0, t - .05) / .085); ang += L / I * h; L -= T.airBrakeTorque * brakeFor(I, this.mixed) * h; t += h; }
    return ang / DEG;
  }
  // held: conjunto de trucos que se están manteniendo. Fuera del aire no hacen nada.
  drive(inp, held) {
    const a = this.a, o = { ...inp, dir: inp.mx, dirZ: inp.mz, flip: 0, side: 0, twist: 0, spins: [] };
    if (a.state !== 'air' || a.bounceT > 0) { if (this.mode.x || this.id || this.own || this.prev || this.target.flip !== null || this.target.side !== null || this.target.twist !== null || this.mode.flip || this.mode.side || this.mode.twist) this.reset(); return o; }
    const cmd = { flip: 0, side: 0, x: 0, twist: 0 }; let xid = null;
    for (const id of held) { const m = MOVES[id]; if (m?.vec) xid = id; else if (m?.axis) cmd[m.axis] += m.s; else if (m?.pose) o[m.pose] = 1; }
    // Cork y B-twist: una vez lanzado, el giro principal sigue solo hasta el final; la tecla manda el twist
    this.famHeld = !!xid && !!MOVES[xid]?.family; if (!xid && this.id && MOVES[this.id]?.family && !this.capped && (cmd.flip || cmd.side || cmd.twist) === 0) xid = this.id;
    const ttg = Math.max(.03, a.timeToGround()), I = a.Iflip || I_OPEN;
    this.held = held;
    if (xid) { cmd.x = 1; cmd.flip = cmd.side = 0; if (xid !== this.id) { this.id = xid; this.mode.x = 0; this.target.x = null; this.capped = false; this.lvl = 1; this.twT = null; this.begin('x'); this.mode.flip = this.mode.side = 0; this.target.flip = this.target.side = null; } }
    else if ((cmd.flip || cmd.side) && this.id) { const m = this.mv; if (m.tw && this.target.twist === null) { const th = this.th(), n = Math.max(1, Math.round(th / 360)); this.target.twist = this.twBase[this.id] + this.twSign() * Math.round(m.tw(n * 360) / 180) * 180; } this.id = null; this.mode.x = 0; this.target.x = null; this.chain = true; }   // pasa de un truco propio a un mortal normal: termina el twist que llevaba   // pasa de un truco propio a un mortal normal
    const mv = this.mv, spinning = cmd.flip || cmd.side || cmd.x, layout = cmd.twist || (xid && !mv.tuckAfter);
    if (spinning && layout) this.mixed = true; else if (spinning && !layout && Math.abs(a.hTwist) < 1.5) this.mixed = false;   // con twist o truco propio: cuerpo estirado
    o.brake = brakeFor(I, this.mixed); o.boost = 1; o.twistPose = xid ? (mv.tw ? .55 * this.twSign() * (this.id === 'aerial' ? 0 : 1) : 0) : clamp(cmd.twist, -1, 1);
    for (const k of AXES) {
      if (k === 'x' && !this.id) continue; const s = clamp(cmd[k], -1, 1);
      if (k === 'x' && mv?.family && s && (this.capped || this.th() >= 360 - acroParams[this.cur].open)) { this.capped = true; cmd.x = 0; }   // el giro principal ya está hecho: abre (el twist lo sigue mandando la tecla)
      const s2 = k === 'x' ? clamp(cmd.x, -1, 1) : s; if (s2 !== s) { if (this.mode.x) { const d = this.mode.x, end = this.turned('x') + d * this.stopAngle('x'), n = mv?.family ? Math.max(360, Math.ceil((end - 30) / 360) * 360) : Math.round(end / 360) * 360; this.mode.x = 0; this.target.x = mv?.family || Math.abs(end - n) <= 60 ? n : 'stop'; if (mv.tw && !this.tw2) this.target.twist = this.twBase[this.id] + this.twSign() * Math.round(mv.tw(Math.max(360, Math.round(this.th() / 360) * 360)) / 180) * 180; } continue; }
      if (s && this.mode[k] !== s) { // empieza a mantener: ritmo adecuado al vuelo disponible
        if (k !== 'twist' && k !== 'x' && this.target[k] === null) this.begin(k); else if (k === 'x' && this.target.x !== null && this.th() > 300) this.begin('x');
        this.mode[k] = s; this.target[k] = null; if (k !== 'twist') this.want[k] = clamp(6.9 / Math.max(.2, ttg - .2), 7 + 1.4 * clamp((ttg - 1) / .6, 0, 1), 9.2) * a.T.spinSpeed * (a.setup ? 1.1 : 1) ; if (k === 'x') this.wBase = mv?.family === 'cork' ? clamp(2 * Math.PI / Math.max(.45, ttg - .2), a.armed === this.id ? 4.6 : 7.5, 11) : this.want.x;   // con su entrada propia reparte el giro en todo el vuelo; encadenado en el aire, ritmo normal  // rad/s (Cork y B-twist reparten su giro en todo el vuelo)
      } else if (!s && this.mode[k]) { // suelta: ¿dónde se parará? Solo si va a quedar casi de pie, ajusta fino
        const d = this.mode[k], step = k === 'twist' && !a.spinOnly ? 180 : 360, end = this.turned(k) + d * this.stopAngle(k), n = Math.round(end / step) * step;
        this.mode[k] = 0; this.target[k] = Math.abs(end - n) <= 60 ? n : 'stop';
        if (k === 'x' && mv.tw) { const tend = a.trick.twist + Math.sign(a.wTwist) * this.stopAngle('twist'), tn = Math.round(tend / 180) * 180; this.target.twist = Math.abs(tend - tn) <= 75 || this.target.x !== 'stop' ? (this.target.x !== 'stop' ? this.twBase[this.id] + this.twSign() * Math.round(mv.tw(Math.abs(this.target.x)) / 180) * 180 : tn) : 'stop'; }
      }
    }
    if (mv?.family && this.mode.x) this.want.x = (this.wBase || this.want.x) * acroParams[this.cur].spin;   // cada nivel gira a su ritmo (más recogido, más rápido)
    for (const k of SPIN) {
      if (k === 'x' && !this.id) continue; const ax = this.axis(k), L = this.spinL(k), s = this.mode[k]; let c = null;
      if (s) {
        const tk = k === 'x' && mv.tuckAfter && this.th() % 360 > mv.tuckAfter, lay = this.mixed || (k === 'x' && !tk);
        const Lw = this.want[k] * (lay ? clamp(I, 4.2, 12.5) : clamp(I, 4.2, 5.8) * (k === 'side' ? .92 : 1)); c = clamp((s * Lw - L) / 12, -1, 1); o.boost = 9;
        if (k === 'x') { if (tk) o.tuck = 1; } else o.tuck = Math.max(o.tuck, o.pike || this.mixed ? 0 : 1);
        o.mx *= .3; o.mz *= .3; if (k === 'x' && mv.travel && !o.dir && !o.dirZ && a.launchSpeed < 2.2) { o.travel = mv.travel; o.travelSide = mv.side && a.armedSide; }
      } else if (this.target[k] !== null) {
        let want = 0; if (this.target[k] !== 'stop') { const rem = this.target[k] - this.turned(k) - Math.sign(L) * 5; want = clamp(rem * DEG / clamp(ttg - .04, .1, .4), -7, 7) * I; }
        c = clamp((want - L) / 9, -1, 1); if (!spinning) o.boost = Math.max(o.boost, 1.6);
      }
      if (c !== null) o.spins.push({ axis: ax, c });
    }
    if (mv?.family === 'btwist' && this.id) { // tumbado casi todo el vuelo (mariposa) y de pie para caer
      // el giro horizontal solo sirve para la inclinación: se lleva al que pide (tumbado en la mariposa, de pie al abrir)
      const up = V(0, 1, 0).applyQuaternion(a.rootQ), phi = Math.acos(clamp(up.y, -1, 1)), want = this.capped ? 0 : acroParams[this.cur].tilt * DEG * smooth(this.th() / 40 + .25); let n = UP.clone().cross(up); if (n.length() < .05) n = UP.clone().cross(a.tkRight).multiplyScalar(-1); n.normalize();
      const wn = clamp((want - phi) * (this.capped ? 7 : 5), -6, 6), Ih = clamp(a.Iflip || 10, 4, 14);
      for (const e of [V(1, 0, 0), V(0, 0, 1)]) o.spins.push({ axis: e, c: clamp((wn * n.dot(e) * Ih - a.L.dot(e)) / 8, -1, 1) }); o.boost = Math.max(o.boost, 6);
    }
    const act = SPIN.filter(k => this.mode[k]); if (this.chain && act.length === 1) { const ax = this.axis(act[0]), r = a.L.clone().addScaledVector(ax, -a.L.dot(ax)), l = r.length(); if (l > .5) o.spins.push({ axis: r.multiplyScalar(1 / l), c: -clamp(l / 9, 0, 1) }); }   // al enlazar, quita el giro sobrante del truco anterior
    const w = a.wTwist, s = this.mode.twist;
    if (mv?.family && this.id) this.famTwist(o, ttg, w);
    else if (this.mode.x && mv.tw && !s) { // el twist del truco sigue al giro, grado a grado
      const th = Math.max(0, this.th() + a.omega.length() / DEG * (mv.la || 0)), e = 4, sg = this.twSign(), slope = (mv.tw(th + e) - mv.tw(th)) / e, want = sg * slope * a.omega.length() + (this.twBase[this.id] + sg * mv.tw(th) - a.trick.twist) * DEG * 7;
      // sin pasarse: no lleva más velocidad de la que puede frenar antes de completar la vuelta del truco
      const tm = mv.family ? TWMAX[this.cur] : mv.twMax || 1, end = this.twBase[this.id] + sg * mv.tw(Math.ceil(Math.max(1, th) / 360) * 360), rem = (end - a.trick.twist) * DEG, cap = Math.sqrt(2 * a.T.airTwistTorque * 1.8 * tm / (a.Itwist || 1.4) * Math.abs(rem)) * .85 + .6; let wv = want; if (mv.twMax && Math.sign(wv) === Math.sign(rem)) wv = Math.sign(wv) * Math.min(Math.abs(wv), cap);
      o.twist = clamp((wv - w) * .6, -1, 1); o.boost = Math.max(o.boost, 4); o.twMax = mv.family ? TWMAX[this.cur] : mv.twMax;
    } else if (s) {
      let rate = 7.4 * a.T.twistSpeed * (a.spinOnly ? 1.35 : 1); const k = cmd.flip ? 'flip' : cmd.side ? 'side' : cmd.x ? 'x' : null;
      if (k) { // los dos giros acaban juntos: el twist se acompasa con el mortal
        const f = Math.abs(this.turned(k)), remF = Math.max(50, 360 - (f % 360)), remT = 360 - (Math.abs(a.trick.twist) % 360); rate = clamp(this.want[k] * remT / remF, 5, 11.5);
      }
      o.twist = s * clamp((rate - w * s) * .6, -1, 1); o.boost = Math.max(o.boost, 4);
    } else if (this.target.twist !== null) { const t = this.target.twist, want = t === 'stop' ? 0 : clamp((t - a.trick.twist) * DEG / clamp(ttg - .05, .1, .3), -9, 9); o.twist = clamp((want - w) * .7, -1, 1); }
    // postura propia y registro para el nombre
    this.track(cmd, xid);
    if (this.id) { const th = this.th(); (a.moveLog ||= {})[this.id] = th; a.moveId = this.mode.x ? this.id : null; a.moveTheta = th; if (this.mode.x || (mv?.acro && a.state === 'air')) { o.movePose = this.id; o.moveT = mv?.acro ? th : th % 360; } a.acroVar = mv?.family ? this.cur : null; }
    this.dbg = o.spins; return o;
  }
  // Twist de Cork y B-twist: mientras se mantiene, sigue girando (cada vuelta completa sube de nivel: doble, triple);
  // al soltar busca la vuelta completa más cercana que pueda frenar. Soltar a medias = cae girado.
  famTwist(o, ttg, w) {
    const a = this.a, mv = this.mv, base = this.twBase[this.id], done = a.trick.twist - base, th = this.th(), start = th >= twistStart(this.id), n = Math.floor((Math.abs(done) + 40) / 360);
    if (n > (this.twN || 0)) { this.twN = n; a.emit('trick', { id: this.id, n }); } a.famTw = Math.round(Math.abs(done) / 360);
    o.boost = Math.max(o.boost, 4); o.twMax = TWMAX[this.cur]; o.twistPose = 0; a.acroTight = (this.famHeld && start) || (typeof this.twT === 'number' && Math.abs(this.twT - done) > 70);   // mientras queda twist, todo recogido
    if (this.famHeld && start) { this.twT = null; this.lvl = Math.min(mv.vars.length, Math.floor(Math.abs(done) / 360) + 1); const rate = [12, 17, 21][this.lvl - 1]; o.twist = clamp((rate - w) * .6, -1, 1); return; }
    if (!start && this.twT === null) { o.twist = clamp(-w * .7, -1, 1); return; }
    if (this.twT === null) { const tend = done + Math.sign(w) * this.stopAngle('twist'), k = clamp(Math.round(tend / 360) * 360, Math.floor(done / 360) * 360, 360 * mv.vars.length); this.twT = Math.abs(tend - k) <= 80 || k === 360 * mv.vars.length ? k : 'stop'; }
    const want = this.twT === 'stop' ? 0 : clamp((this.twT - done) * DEG / clamp(ttg - .05, .1, .3), -14, 14); o.twist = clamp((want - w) * .7, -1, 1);
  }
  get cur() { return this.mv?.family ? this.mv.vars[Math.min(this.mv.vars.length, this.lvl || 1) - 1] : null; }
  begin(k) { for (const q of SPIN) if (q !== k && this.target[q] !== null) { this.target[q] = null; this.chain = true; } const r = this.rot(k); this.base[k] = r - this.phase(k); if (k === 'x') { this.rot0 = r; this.twBase[this.id] = this.a.trick.twist; } }
  // Sentido del twist: el aerial mira siempre hacia la cámara
  twSign() { return this.mv?.cam ? (!this.a.world.plane || this.a.tkFwd.x >= 0 ? -1 : 1) : 1; }
}
export const moveName = id => MOVES[id]?.name;
