// Atleta: máquina física con cuatro regímenes — suelo, despegue, aire y caída.
// En el aire solo existe conservación del momento angular: la postura cambia la inercia y la inercia cambia el giro.
import { Quaternion } from 'three';
import { V, UP, DEG, clamp, lerp, smooth, remap, damp, wrapPi, qEuler, qYaw, qExp, qLog, qBasisYZ, qBasisYX } from './mathx.js';
import { Skeleton, BONES, IDX, CONTACTS, HIP_H, THIGH, SHIN, ANKLE_H, TOTAL_MASS } from './body.js';
import { POSES, MOVE_POSES, mix, offset } from './poses.js';
import { MOVES } from './control.js';
import { ACRO, FAMILY, acroParams, axisOf, variantName } from './acro.js';
import { Ragdoll } from './ragdoll.js';
import { TrickTracker } from './tricks.js';
import { VaultMotion } from './vaults.js';
import { makeTuning, SURFACES } from './tuning.js';

export const GRADES = {
  perfect: { label: 'Aterrizaje perfecto', lvl: 5 }, stable: { label: 'Aterrizaje estable', lvl: 4 },
  unbalanced: { label: 'Desequilibrado', lvl: 3 }, steps: { label: 'Pasos adicionales', lvl: 2 },
  fallF: { label: 'Caída hacia adelante', lvl: 0 }, fallB: { label: 'Caída hacia atrás', lvl: 0 }, fallS: { label: 'Caída lateral', lvl: 0 },
  hard: { label: 'Impacto fuerte', lvl: 0 }, crash: { label: 'Golpe en el aire', lvl: 0 },
};
export const NO_INPUT = { mx: 0, mz: 0, back: false, camYaw: 0, run: false, jump: false, flip: 0, side: 0, twist: 0, tuck: 0, pike: 0 };
const FOOTC = CONTACTS.filter(c => c.kind === 'foot').map(c => ({ ...c, side: BONES[c.b].name.endsWith('L') ? 'L' : 'R' }));
const SEG = { flipB: 'Backflip', flipF: 'Frontflip', sideL: 'Sideflip izq.', sideR: 'Sideflip der.' };
const LEGS = ['L', 'R'], STEP = .61;   // sube sin saltar hasta 0,6 m
// curva suave por puntos equiespaciados
function catmull(P, u) { const n = P.length - 1, x = clamp(u, 0, 1) * n, i = Math.min(n - 1, Math.floor(x)), t = x - i, a = P[i], b = P[i + 1], m0 = i > 0 ? (b - P[i - 1]) / 2 : b - a, m1 = i < n - 1 ? (P[i + 2] - a) / 2 : b - a, t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b + (t3 - t2) * m1; }
const approach = (a, b, d) => a < b ? Math.min(b, a + d) : Math.max(b, a - d);

export class Athlete {
  constructor(world, tuning = makeTuning()) {
    this.world = world; this.T = tuning; this.sk = new Skeleton(); this.braceSk = new Skeleton();
    this.braceSk.setTarget(POSES.brace); this.braceSk.snap();
    this.rag = new Ragdoll(); this.trick = new TrickTracker();
    this.rootP = V(); this.rootQ = new Quaternion();
    this.com = V(); this.vel = V(); this.L = V(); this.hTwist = 0; this.omega = V(); this.wTwist = 0;
    this.foot = { L: this.mkFoot(), R: this.mkFoot() };
    this.events = []; this.lastLanding = null; this.combo = 0;
    this.rag.onImpact = (v, surf, p) => this.emit('impact', { v, surf, p: p.clone() });
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }
  mkFoot() { return { p: V(), q: new Quaternion(), step: -1, from: V(), fromQ: new Quaternion(), planted: true }; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }

  reset(s) {
    this.spinOnly = null; this.armed = null; this.armedSide = false; this.autoJ = 0; this.autoArm = null; this.acroVar = null; this.state = 'ground'; this.t = 0; this.side = undefined; this.js = null; this.freeLeg = null; this.setup = null; this.moveLog = {}; this.moveId = null; this.pos = V(s.x, s.y, s.z); this.bodyY = s.y; this.yaw = s.yaw; this.velH = V(); this.vel.set(0, 0, 0);
    this.charge = 0; this.charging = false; this.jumpHeld = false; this.comp = 0; this.compV = 0;
    this.sway = V(); this.swayV = V(); this.tilt = V(); this.tiltV = V(); this.phase = 0; this.lock = 0; this.balance = 0; this.run = 0;
    this.L.set(0, 0, 0); this.hTwist = 0; this.omega.set(0, 0, 0); this.wTwist = 0; this.contactT = null; this.bounceT = 0; this.ikW = 1; this.gaitW = 0;
    this.accelLean = V(); this.poseMode = null; this.finishT = 0; this.trick.reset(); this.combo = 0; this.fallCause = null; this.prevP = null;
    this.sk.setTarget(POSES.stand); this.sk.snap();
    for (const k of LEGS) { const f = this.foot[k]; this.stance(k, f.p, f.q); f.step = -1; }
    this.poseGround(1 / 240, NO_INPUT, true);
  }
  // Cayó fuera del nivel: vuelve al último punto de control
  out() { this.emit('out'); this.reset(this.world.respawn || this.world.spawns?.[0] || { x: 0, y: 0, z: 0, yaw: 0 }); }
  get speed() { return this.state === 'ground' || this.state === 'takeoff' ? this.velH.length() : Math.hypot(this.vel.x, this.vel.z); }
  get airborne() { return this.state === 'air'; }
  forward(out = V()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  left(out = V()) { return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); }
  stance(k, p, q) { const s = k === 'L' ? 1 : -1; p.copy(this.left()).multiplyScalar(.105 * s).add(this.pos); p.y = this.pos.y + ANKLE_H; qYaw(this.yaw + s * .12, q); }

  update(dt, inp) {
    if (this.autoJ > 0) { this.autoJ -= dt; inp = { ...inp, jump: this.autoJ > 0, mx: 0, mz: 0 }; }   // salto propio de la acrobacia
    this.pressed = inp.jump && !this.jumpHeld; this.released = !inp.jump && this.jumpHeld; this.jumpHeld = inp.jump;
    this.t += dt; this.world.step?.(dt);
    if (this.state === 'ground') this.ground(dt, inp);
    else if (this.state === 'takeoff') this.takeoff(dt, inp);
    else if (this.state === 'vault') this.vault.step(dt);
    else if (this.state === 'air') this.air(dt, inp);
    else if (this.state === 'ragdoll') this.ragdoll(dt, inp);
    else if (this.state === 'getup') this.getup(dt, inp);
  }

  // J-step: carrera corta en curva, bloqueo con un pie y patada de la pierna de balanceo. Sirve de salto con más giro.
  startJstep() { if (this.state !== 'ground' || this.js || this.charging || this.lock > .1) return false; const plane = this.world.plane, d = plane ? (Math.sin(this.yaw) >= 0 ? 1 : -1) : 1, yaw = plane ? d * Math.PI / 2 : this.yaw; this.js = { t: 0, T: .5, d, z0: this.pos.z, yaw, f: V(Math.sin(yaw), 0, Math.cos(yaw)), r: V(-Math.cos(yaw), 0, Math.sin(yaw)) }; this.emit('jstep'); return true; }
  // Fase A: mantener la tecla de una acrobacia mientras se carga el salto prepara su entrada (y el B-twist se pone de lado)
  arm(id, v = id) { if (!FAMILY[id] || this.state !== 'ground' || !this.charging) return false; if (this.armed !== id) { this.armed = id; this.armVar = v; this.armDir = Math.sin(this.yaw) >= 0 ? 1 : -1; this.armYaw0 = this.world.plane ? this.armDir * Math.PI / 2 : this.yaw; this.armedSide = !!ACRO[id].entry.face; this.emit('arm', { id }); } return true; }
  // Cork o B-twist pulsado en el suelo, sin Espacio: prepara su entrada y salta solo para hacer el movimiento real
  startAcro(id, v = id) { if (!FAMILY[id] || this.state !== 'ground' || this.js || this.charging || this.lock > .1) return false; this.autoJ = .36; this.autoArm = [id, v]; return true; }
  // Twist pulsado en el suelo, sin Espacio: salta solo y gira únicamente sobre su eje vertical mientras se mantiene la tecla
  startSpin(id) { if (this.state !== 'ground' || this.js || this.charging || this.lock > .1) return false; this.charge = .6; this.spinOnly = id; this.startTakeoff({ ...NO_INPUT }); this.emit('spinstart', { id }); return true; }
  startVault(id, box, dir) { if (this.state !== 'ground') return false; this.state = 'vault'; this.vault = new VaultMotion(this, id, box, dir); this.charging = false; this.charge = 0; if (this.world.plane) this.side = this.vault.d; this.emit('vault', { id }); return true; }
  // Brazo de dos huesos: muñeca a un punto del mundo, codo hacia atrás y afuera, palma abajo
  armIK(k, target, w) {
    const sk = this.sk, sg = k === 'L' ? 1 : -1, ci = IDX.chest, ui = IDX['uparm' + k], cq = this.rootQ.clone().multiply(sk.q[ci]), inv = cq.clone().invert();
    const sh = V().copy(sk.pos[ui]).applyQuaternion(this.rootQ).add(this.rootP), t = V().subVectors(target, sh).applyQuaternion(inv), A = .285, B = .26, d = clamp(t.length(), .18, A + B - .002), dir = t.normalize();
    const al = Math.acos(clamp((A * A + d * d - B * B) / (2 * A * d), -1, 1)), fl = Math.PI - Math.acos(clamp((A * A + B * B - d * d) / (2 * A * B), -1, 1));
    const hint = V(0, -.75, .5).add(V(-sg * .45, 0, 0)), up = qBasisYZ(dir.clone().multiplyScalar(-1), hint).multiply(qEuler(al / DEG, 0, 0)), fo = qEuler(-fl / DEG, 0, 0);
    const fwd = this.forward(), hw = qBasisYX(fwd.clone().multiplyScalar(-1), V(0, sg, 0)), hl = cq.clone().multiply(up).multiply(fo).invert().multiply(hw);
    [[ui, up], [IDX['forearm' + k], fo], [IDX['hand' + k], hl]].forEach(([i, q]) => { sk.local[i].slerp(q, w); sk.vel[i].multiplyScalar(1 - w); });
  }

  // ───────────────────────── SUELO ─────────────────────────
  ground(dt, inp) {
    const T = this.T; this.lock = Math.max(0, this.lock - dt / T.recover); this.balance = Math.max(0, this.balance - dt); this.finishT = Math.max(0, this.finishT - dt);
    if (this.js) { const J = this.js; J.t += dt; if (this.world.plane) this.side = J.d; inp = { ...inp, mx: J.f.x, mz: J.f.z, run: false, back: false, jump: false }; this.pressed = this.released = false; if (J.t > J.T - .14) this.charge = Math.min(.95, this.charge + dt * 7); if (J.t >= J.T) { this.js = null; this.charge = .95; this.setup = 'J-step'; this.freeLeg = 'R'; this.startTakeoff({ ...inp, mx: 0, mz: 0 }); return; } }
    let mx = inp.mx, mz = inp.mz; const free = this.lock <= 0; if (!free) mx = mz = 0;
    const want = Math.min(1, Math.hypot(mx, mz)), fwd = this.forward();
    // velocidad: aceleración limitada, no instantánea
    const top = inp.back ? 1.7 : inp.run ? T.sprintSpeed : T.jogSpeed;
    let target = inp.stay ? 0 : want * top; if (this.charging) target = Math.min(target, Math.max(this.velH.length() * .985, 0));
    const dir = want > .05 ? V(mx / Math.hypot(mx, mz), 0, mz / Math.hypot(mx, mz)) : V();
    const desired = dir.clone().multiplyScalar(target), dv = desired.sub(this.velH), before = this.velH.clone();
    const acc = (want > .05 ? (this.velH.length() > T.jogSpeed && target > this.velH.length() ? T.runAccel * .62 : T.runAccel * 1.7) : 8.5) * (free ? 1 : .28);
    const l = dv.length(), m = Math.min(l, acc * dt); if (l > 1e-6) this.velH.addScaledVector(dv, m / l);
    if (this.armed && this.charging && ACRO[this.armed].entry.step) { const d = this.world.plane ? V(this.armDir, 0, 0) : V(Math.sin(this.armYaw0), 0, Math.cos(this.armYaw0)), sp = ACRO[this.armed].entry.step * Math.sin(Math.PI * clamp(this.charge * 1.1, 0, 1)) + .4; this.velH.lerp(d.multiplyScalar(sp), 1 - Math.exp(-12 * dt)); }   // paso de entrada
    if (this.world.plane) { // 2.5D: solo mira a izquierda o derecha y vuelve al carril
      this.velH.z = 0; const J = this.js; if (J) { const u = J.t / J.T; this.pos.z = lerp(J.z0, 0, u) + .42 * Math.sin(Math.PI * u) * (u < .5 ? 1 : 1); this.velH.x = J.d * Math.max(Math.abs(this.velH.x), 3.2 * smooth(u * 2)); } else this.pos.z = damp(this.pos.z, 0, 5, dt);
      if (want > .05 && !this.charging && !inp.jump) this.side = Math.sign(dir.x) || 1;  // con Espacio pulsado, la dirección ya no lo gira: marca el truco
      else if (this.side !== undefined) { /* mantiene el frente */ } else if (this.side === undefined) this.side = Math.sin(this.yaw) >= 0 ? 1 : -1;
      let d = wrapPi((this.armedSide ? this.armYaw0 - Math.PI / 2 : this.side * Math.PI / 2) - (J ? J.d * .55 * Math.cos(Math.PI * J.t / J.T) : 0) - this.yaw); if (Math.abs(d) > 2.2) d = Math.abs(d) * -this.side;  // gira dando la cara a la cámara
      if (this.lock <= .1) this.yaw = wrapPi(this.yaw + clamp(d * 10, -10, 10) * dt);
    } else if (this.js) { // J-step en 3D: curva hacia la derecha del atleta
      const J = this.js, u = J.t / J.T, v = Math.max(this.velH.dot(J.f), 3.2 * smooth(u * 2)); this.velH.copy(J.f).multiplyScalar(v); this.pos.addScaledVector(J.r, .42 * Math.PI / J.T * Math.cos(Math.PI * u) * dt);
      this.yaw = wrapPi(this.yaw + clamp(wrapPi(J.yaw - .55 * Math.cos(Math.PI * u) - this.yaw) * 10, -10, 10) * dt);
    } else if (this.armedSide && this.charging) { this.yaw = wrapPi(this.yaw + clamp(wrapPi(this.armYaw0 - Math.PI / 2 - this.yaw) * 10, -10, 10) * dt); }
    else if (want > .05 && !this.charging && !inp.jump) {
      const face = inp.back ? inp.camYaw : Math.atan2(dir.x, dir.z);
      const rate = remap(this.velH.length(), 0, T.sprintSpeed, 11, 4.5); this.yaw += clamp(wrapPi(face - this.yaw) * 10, -rate, rate) * dt;
    }
    // mover y colisionar
    const sb = this.surf?.box; if (sb && (sb.off || sb.launch)) { if (sb.launch) return this.springGround(sb); this.surf = null; } else if (sb) { if (sb.item?.fr) sb.touched = true; if (sb.v) this.ride(sb, dt); }
    this.pos.addScaledVector(this.velH, dt);
    for (const h of [.45, .95, 1.4]) { const c = this.world.sphere(V(this.pos.x, this.pos.y + h, this.pos.z), .26, this.pos.y + STEP); if (c && Math.abs(c.n.y) < .5) { this.pos.x += c.n.x * c.depth; this.pos.z += c.n.z * c.depth; const vn = this.velH.dot(c.n); if (vn < 0) this.velH.addScaledVector(c.n, -vn); } }
    const g = this.world.ground(this.pos.x, this.pos.z, this.pos.y + STEP, .06), spd = this.velH.length();
    if (!g || g.y < this.pos.y - (spd < 4 ? STEP : .34)) return this.leaveEdge(inp);
    this.pos.y = g.y;
    // obstáculos bajos: el cuerpo empieza a subir antes de llegar, según la velocidad
    let bodyT = g.y; this.climb = 0;
    if (spd > .3) {
      const look = .3 + .13 * spd, ux = this.velH.x / spd, uz = this.velH.z / spd;
      for (let i = 1; i <= 6; i++) { const d = look * i / 6, q = this.world.ground(this.pos.x + ux * d, this.pos.z + uz * d, g.y + STEP); if (q && q.y > g.y + .03) { bodyT = Math.max(bodyT, g.y + (q.y - g.y) * (1 - .85 * d / look)); this.climb = Math.max(this.climb, q.y - g.y); } }
      if (this.climb > .3 && spd > 4.6) this.velH.multiplyScalar(1 - 1.6 * dt);   // pierde algo de velocidad al subir
    }
    this.bodyY = damp(this.bodyY, bodyT, this.bodyY < bodyT ? 15 : 10, dt);
    this.surf = g; 
    // resortes del cuerpo: compresión de piernas, balanceo e inclinación
    const soft = g.surf.soft;
    const chargeDepth = -.30 * smooth(this.charge);
    const w = lerp(10.5, 8, soft), z = .85; this.compV += (w * w * (chargeDepth - this.comp) - 2 * z * w * this.compV) * dt; this.comp += this.compV * dt; 
    if (this.comp < -.52) { this.comp = -.52; this.compV = Math.max(0, this.compV); }
    const zs = this.balance > 0 ? .28 : .9, ws = 6.5;
    this.swayV.addScaledVector(this.sway, -ws * ws * dt).multiplyScalar(1 / (1 + 2 * zs * ws * dt)); this.sway.addScaledVector(this.swayV, dt); this.sway.y = 0; if (this.sway.length() > .3) this.sway.setLength(.3);
    const a = V().subVectors(this.velH, before).multiplyScalar(1 / dt); this.accelLean.lerp(a, 1 - Math.exp(-7 * dt));
    const lean = V().copy(this.accelLean).multiplyScalar(.035).addScaledVector(this.velH, .025); if (lean.length() > .3) lean.setLength(.3);
    if (this.comp < -.05) lean.addScaledVector(fwd, clamp(-this.comp, 0, .4) * .55);
    const E = this.armed && ACRO[this.armed].entry; if (E?.lean && this.charging) lean.addScaledVector(fwd, E.lean * smooth(this.charge));   // B-twist: la carga en «U» baja el pecho
    const tt = V(lean.z, 0, -lean.x), wt = this.balance > 0 ? 6 : 8;  // eje = UP × lean
    this.tiltV.addScaledVector(V().subVectors(tt, this.tilt), wt * wt * dt).multiplyScalar(1 / (1 + 2 * (this.balance > 0 ? .3 : .9) * wt * dt)); this.tilt.addScaledVector(this.tiltV, dt);
    // preparación del salto: se puede encadenar durante la absorción
    if (this.pressed && this.lock <= .12) { this.charging = true; this.charge = Math.max(this.charge, clamp(-this.comp * 1.6, 0, .6)); }
    if (this.autoArm && this.charging) { this.arm(...this.autoArm); this.autoArm = null; }
    if (this.charging) { this.charge = Math.min(1, this.charge + dt * (inp.chargeRate || 1) / T.chargeTime); if (this.released || !inp.jump) return this.startTakeoff(inp); }
    else if (!this.js) this.charge = Math.max(0, this.charge - dt * 4);
    this.poseGround(dt, inp);
  }
  // Va encima de una plataforma que se mueve: la sigue sin resbalar
  ride(b, dt) { const x = b.v.x * dt, y = b.v.y * dt, z = b.v.z * dt; this.pos.x += x; this.pos.z += z; this.bodyY += y; this.pos.y += y; for (const k of LEGS) { const f = this.foot[k]; f.p.x += x; f.p.y += y; f.p.z += z; f.from.x += x; f.from.y += y; f.from.z += z; } }
  springGround(b) { this.poseGround(1 / 240, NO_INPUT); this.charging = false; this.charge = 0; this.vel.set(this.velH.x + (b.push || 0), b.launch * this.T.spring, this.velH.z); this.L.set(0, 0, 0); this.hTwist = 0; this.beginAir('jump'); this.launchSpeed = 99; this.emit('spring', { p: this.pos.clone(), surf: b.surf, box: b }); }
  leaveEdge(inp) {
    this.js = null;
    if (this.charging && this.charge > .15) return this.startTakeoff(inp || NO_INPUT);  // salta justo en el borde
    this.poseGround(1 / 240, NO_INPUT); this.charging = false; this.charge = 0;
    this.vel.copy(this.velH); this.L.set(0, 0, 0); this.hTwist = 0; this.beginAir('fall');
  }
  gait(sp) {
    const cad = sp < 3 ? lerp(1.75, 2.75, clamp(sp / 3, 0, 1)) : remap(sp, 3, 6.8, 2.75, 3.95), T = 2 / cad;
    return { T, duty: sp < 2 ? remap(sp, .5, 2, .62, .47) : remap(sp, 2, 6.8, .47, .28), lift: sp < 1.6 ? remap(sp, .4, 1.6, .07, .15) : remap(sp, 1.6, 6.5, .15, .52), run: remap(sp, 1.3, 6, 0, 1) };
  }
  poseGround(dt, inp, snap = false) {
    const sp = this.velH.length(), gt = this.gait(sp), moving = sp > .25 && this.state === 'ground';
    this.gaitW = approach(this.gaitW, moving ? 1 : 0, dt * 7); this.run = damp(this.run, moving ? gt.run : 0, 8, dt);
    const prevPh = this.phase; if (moving) this.phase = (this.phase + dt / gt.T) % 1;
    this.spS = damp(this.spS || 0, sp, 14, dt); const ss = this.spS;
    const ph = 2 * Math.PI * this.phase, mid = Math.PI * gt.duty, G = this.gaitW, R = this.run, sn = Math.sin, cs = Math.cos;
    // pelvis: baja al apoyar, sube en el vuelo; avanza la cadera de la pierna que va delante y cae del lado sin apoyo
    const bob = G * (remap(ss, 0, 1.8, 0, .02) + remap(ss, 1.8, 4, 0, .026)) * cs(2 * (ph - mid));
    const drop = .022 + G * (remap(ss, 0, 3, 0, .058) + R * .022);
    const hipYaw = -G * lerp(5, 11, R) * cs(ph - .12), hipRoll = G * lerp(3, 4.5, R) * cs(ph - mid), hipPitch = G * (R * 3 + lerp(1, 2.4, R) * sn(2 * (ph - mid)));
    // respiración y peso en reposo
    const idle = 1 - G, br = sn(this.t * 1.65) * (1 + R * .5), shift = idle * sn(this.t * .55) * (this.comp > -.06 ? 1 : 0);
    const tq = qExp(this.tilt), yq = qYaw(this.yaw);
    this.rootQ.copy(tq).multiply(yq).multiply(qEuler(hipPitch, hipYaw, hipRoll + shift * 1.4));
    const pelvisY = HIP_H - drop - bob + this.comp;
    this.rootP.copy(this.pos).add(this.sway).addScaledVector(this.left(), G * .014 * cs(ph - mid) + shift * .012); this.rootP.y = this.bodyY + pelvisY;
    // torso: el pecho contrarrota con un leve retraso y la cabeza se mantiene estable
    const chYaw = -hipYaw * 1.05 + G * lerp(5, 9, R) * cs(ph - .45), spRoll = -hipRoll * .55, chRoll = -hipRoll * .55;
    let pose = offset(POSES.stand, 'spine', [G * (2 + R * 5) + br * .25, chYaw * .45 - hipYaw * .1, spRoll - shift]);
    pose = offset(pose, 'chest', [br * .9 - G * hipPitch * .4, chYaw * .55, chRoll]); pose = offset(pose, 'neck', [-G * R * 4, -chYaw * .25, -chRoll * .4]); pose = offset(pose, 'head', [-G * (R * 5 + bob * 60) + idle * sn(this.t * .8) * 1.2, -(chYaw + hipYaw) * .6, shift * .6]);
    // brazos: péndulo desde el hombro, contrario a la pierna. El codo va doblado y solo respira un poco;
    // el empuje es hacia atrás, la mano pasa junto a la cadera y sube hacia el centro del pecho.
    for (const [k, sg, o] of [['L', 1, 0], ['R', -1, Math.PI]]) {
      const q = ph + o - lerp(.42, .25, R), w = cs(q), fwd = smooth(clamp(-w, 0, 1)), bk = smooth(clamp(w, 0, 1)), e = q - .35, life = 1 + .05 * sn(this.t * .83 + o * 1.7);
      const swing = (w > 0 ? lerp(27, 56, R) : lerp(23, 44, R)) * w * life + lerp(9, 6, R);
      pose = offset(pose, 'uparm' + k, [G * swing, sg * G * (-lerp(9, 7, R) - fwd * lerp(15, 20, R) + bk * 5), sg * G * (lerp(4, 5, R) + bk * lerp(5, 8, R) + .8 * br)]);
      pose = offset(pose, 'forearm' + k, [-G * (lerp(72, 76, R) + lerp(4, 11, R) * cs(2 * e) + fwd * lerp(9, 14, R) + 2 * sn(e)), 0, 0]);
      pose = offset(pose, 'hand' + k, [G * (-6 + 7 * sn(q - 1)), 0, sg * -5 * G]);
    }
    const c = smooth(this.charge); if (c > 0) pose = mix(pose, this.armed ? mix(POSES.charge, ACRO[this.armed].entry.charge, .85) : POSES.charge, c);
    else if (this.comp < -.05) pose = mix(pose, POSES.absorb, smooth(-this.comp / .28));
    if (this.finishT > 0 && sp < .4) pose = mix(pose, POSES.finish, smooth(Math.min(this.finishT * 3, 1)) * .9);
    if (this.balance > 0) { const k = Math.min(1, this.balance * 2), o = Math.sin(this.t * 13) * 34 * k; pose = offset(pose, 'uparmL', [-40 * k + o, 0, 52 * k]); pose = offset(pose, 'uparmR', [-40 * k - o, 0, -52 * k]); pose = offset(pose, 'spine', [0, 0, Math.sin(this.t * 7) * 7 * k]); }
    if (this.state === 'takeoff') pose = this.takeoffPose;
    this.sk.setTarget(pose);
    if (snap) this.sk.snap(); else this.sk.drive(dt, this.state === 'takeoff' ? 24 : this.gaitW > .2 ? 20 : 13, true);
    // pies: apoyo real sin deslizamiento; el pie en apoyo se queda fijo en el mundo
    const vdir = sp > .05 ? this.velH.clone().multiplyScalar(1 / sp) : this.forward();
    for (const k of LEGS) this.stepFoot(k, dt, gt, sp, vdir, moving);
    this.sk.fk(); this.legIK(); this.sk.fk(); if (this.state === 'ground' && this.unsink()) { this.legIK(); this.sk.fk(); } this.syncCom(dt);
  }
  // Puntas y talones nunca bajo el suelo: si el pie llega inclinado, sube lo justo
  unsink() { let fix = false; for (const c of FOOTC) { const p = this.worldPt(c), g = this.world.ground(p.x, p.z, p.y + .3, 0), d = (g ? g.y : -9) - (p.y - c.r); if (d > .001 && d < .3) { this.foot[c.side].p.y += d; fix = true; } } return fix; }
  stepFoot(k, dt, gt, sp, vdir, moving) {
    const f = this.foot[k], sg = k === 'L' ? 1 : -1;
    if (moving) {
      const ph = (this.phase + (k === 'L' ? 0 : .5)) % 1, reach = sp * gt.T * gt.duty / 2, width = lerp(.10, .055, this.run), lat = this.left().multiplyScalar(width * sg);
      const ground = x => { const g = this.world.ground(x.x, x.z, this.pos.y + STEP); return g && g.y > this.pos.y - STEP ? g.y : this.pos.y; };
      let tgt, q, y = 0, pitch = 0;
      if (ph < gt.duty) { // apoyo
        const u = ph / gt.duty; tgt = V().copy(this.pos).add(lat).addScaledVector(vdir, lerp(reach, -reach, u));
        const roll = Math.pow(clamp((u - .45) / .55, 0, 1), 1.7); pitch = roll * lerp(38, 58, this.run) - (1 - smooth(u / .2)) * lerp(13, 3, this.run); y = roll * lerp(.075, .115, this.run);
        if (!f.planted) { f.planted = true; this.emit('step', { speed: sp, p: tgt.clone(), surf: this.surf?.surf }); }
      } else { // vuelo del pie: talón al glúteo, rodilla al frente, extensión y retroceso antes de apoyar
        f.planted = false; const u = (ph - gt.duty) / (1 - gt.duty), r0 = lerp(.075, .115, this.run), p0 = lerp(38, 58, this.run);
        const Z = [-1, lerp(-1.02, -1.12, this.run), lerp(-.42, -.5, this.run), .42, lerp(1.0, 1.1, this.run), 1], Y = [r0, gt.lift * .74, gt.lift, gt.lift * .62, gt.lift * .27, 0], Pt = [p0, p0 * 1.35, p0 * 1.0, 14, -12, lerp(-13, -3, this.run)];
        tgt = V().copy(this.pos).add(lat).addScaledVector(vdir, catmull(Z, u) * reach); y = Math.max(0, catmull(Y, u)); pitch = catmull(Pt, u);
      }
      let gy = ground(tgt); if (!f.planted) gy = Math.max(gy, ground(V().copy(tgt).addScaledVector(vdir, .22)), ground(V().copy(tgt).addScaledVector(vdir, -.12)));  // el pie libra el canto
      tgt.y = gy + ANKLE_H + y; const fs = vdir.dot(this.forward()) >= -.1 ? 1 : -1; q = qYaw(this.yaw + sg * .06).multiply(qEuler(pitch * fs * Math.abs(vdir.dot(this.forward())), 0, 0));
      const b = 1 - Math.exp(-(18 + this.gaitW * 200) * dt * (this.gaitW < 1 ? .5 : 1));
      const py = f.p.y; f.p.lerp(tgt, this.gaitW >= 1 ? 1 : b); if (Math.abs(tgt.y - py) > .05) f.p.y = py + clamp(tgt.y - py, -4.2 * dt * (1 + sp * .25), 5.2 * dt * (1 + sp * .25)); f.q.slerp(q, this.gaitW >= 1 ? 1 : b); f.step = -1;
    } else if (this.state === 'ground') { // quieto: pequeños pasos para recolocarse
      const tp = V(), tq = new Quaternion(); this.stance(k, tp, tq);
      const other = this.foot[k === 'L' ? 'R' : 'L'];
      if (f.step < 0) {
        const off = V().subVectors(f.p, tp), need = Math.hypot(off.x, off.z) > .07 || f.q.angleTo(tq) > .4;
        if (f.p.y > tp.y + .002 || Math.abs(off.y) > .002) { f.p.y = damp(f.p.y, tp.y, 18, dt); }
        f.q.slerp(qYaw(Math.atan2(2 * (f.q.x * f.q.z + f.q.w * f.q.y), 1 - 2 * (f.q.x * f.q.x + f.q.y * f.q.y))), 1 - Math.exp(-16 * dt));
        if (need && (other.step < 0 || other.step > .75) && this.comp > -.12 && !this.charging) { f.step = 0; f.from.copy(f.p); f.fromQ.copy(f.q); }
      } else {
        f.step += dt / .26; const u = smooth(f.step); f.p.lerpVectors(f.from, tp, u); f.p.y += Math.sin(Math.PI * u) * .07; f.q.slerpQuaternions(f.fromQ, tq, u);
        if (f.step >= 1) { f.step = -1; f.p.copy(tp); f.q.copy(tq); this.emit('step', { speed: .5, p: tp.clone(), surf: this.surf?.surf }); }
      }
    }
  }
  legIK() {
    const sk = this.sk, inv = this.rootQ.clone().invert();
    for (const k of LEGS) {
      if (k === this.freeLeg) { for (const n of ['thigh', 'shin', 'foot']) this.sk.local[IDX[n + k]].slerp(this.sk.target[IDX[n + k]], .07); continue; }
      const f = this.foot[k], sg = k === 'L' ? 1 : -1, ti = IDX['thigh' + k];
      const t = V().subVectors(f.p, this.rootP).applyQuaternion(inv).sub(BONES[ti].off);
      const d = clamp(t.length(), .24, THIGH + SHIN - .0015), dir = t.normalize();
      const al = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1)), kn = Math.PI - Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
      const ff = V(0, 0, 1).applyQuaternion(f.q); ff.y = 0; ff.normalize().applyQuaternion(inv);
      const hint = V(sg * .16, 0, 1).add(ff.multiplyScalar(.8));
      const th = qBasisYZ(dir.multiplyScalar(-1), hint).multiply(qEuler(-al / DEG, 0, 0)), sh = qEuler(kn / DEG, 0, 0);
      const ft = th.clone().multiply(sh).invert().multiply(inv.clone().multiply(f.q));
      const A = [th, sh, ft], n = ['thigh', 'shin', 'foot'];
      A.forEach((q, i) => { const id = IDX[n[i] + k]; sk.local[id].slerp(q, this.ikW); sk.vel[id].set(0, 0, 0); });
    }
    this.ikW = Math.min(1, this.ikW + .02);
  }
  syncCom(dt) {
    const c = V().copy(this.sk.com).applyQuaternion(this.rootQ).add(this.rootP); this.com.copy(c);
    if (this.state !== 'air') this.vel.set(this.velH.x, this.compV, this.velH.z);
  }

  // ───────────────────────── DESPEGUE ─────────────────────────
  startTakeoff(inp) {
    const T = this.T, c = clamp(this.charge, .12, 1), sp = this.velH.length();
    this.state = 'takeoff'; this.charging = false; this.toT = 0; this.power = c;
    this.vy = lerp(T.jumpMin, T.jumpMax, c) + T.runJumpBonus * clamp(sp / T.sprintSpeed, 0, 1) + (this.surf?.tramp ? 1.6 : 0);
    this.comp += this.bodyY - this.pos.y; this.bodyY = this.pos.y; const c0 = clamp(this.comp, -.5, -.05); this.comp = c0; this.toDist = .05 - c0; this.toDur = 2 * this.toDist / this.vy; this.toC0 = c0;
    // salto con dirección desde parado: las piernas empujan también hacia adelante
    const k = Math.hypot(inp.mx, inp.mz); if (k > .1 && sp < 2.2 && this.lock <= 0) { const push = this.pushSpeed(inp.mx / k, inp.mz / k) * (.6 + .4 * c); this.pushDir = V(inp.mx / k, 0, inp.mz / k).multiplyScalar(Math.max(0, push)); } else this.pushDir = null;
    if (this.world.plane && Math.abs(Math.sin(this.yaw)) > .6 && !this.armedSide) this.yaw = Math.sign(Math.sin(this.yaw)) * Math.PI / 2;
    if (this.armed) this.vy += acroParams[this.armVar || this.armed].height;   // fase B: cada acrobacia pide su impulso
    this.trick.reset(); this.tkRight = this.left(); this.tkFwd = this.forward(); this.trick.startY = this.pos.y;
    this.L.set(0, 0, 0); this.hTwist = 0; this.takeoffPose = POSES.launch; this.tiltV.set(0, 0, 0); if (!this.freeLeg) this.setup = null; else { this.vy += .3; this.velH.multiplyScalar(.62); }
  }
  // Adelante se empuja con más fuerza que hacia atrás
  pushSpeed(mx, mz = 0) { return lerp(1.6, 2.3, clamp((mx * Math.sin(this.yaw) + mz * Math.cos(this.yaw) + .2) / .9, 0, 1)) * this.T.push; }
  // El suelo permite generar momento angular: cuanto mejor sincronizada la tecla, más giro.
  groundTorque(dt, inp, dur, gain) {
    const T = this.T, k = gain * dt / dur;
    this.L.addScaledVector(this.tkRight, inp.flip * T.takeoffFlip * k);
    this.L.addScaledVector(this.tkFwd, inp.side * T.takeoffFlip * .92 * k);
    this.hTwist += inp.twist * T.takeoffTwist * k;
    if (this.L.length() > T.maxFlipL) this.L.setLength(T.maxFlipL);
    this.hTwist = clamp(this.hTwist, -T.maxTwistL, T.maxTwistL);
  }
  takeoff(dt, inp) {
    this.toT += dt; const u = clamp(this.toT / this.toDur, 0, 1);
    this.comp = this.toC0 + this.toDist * u * u; this.compV = 2 * this.toDist * u / this.toDur;
    this.pos.addScaledVector(this.velH, dt); const sb = this.surf?.box; if (sb?.v && !sb.off) this.ride(sb, dt); if (sb?.item?.fr) sb.touched = true;
    this.groundTorque(dt, inp, this.toDur, .55 + .45 * this.power);
    if (this.armed) { const v = axisOf(this.armed), ax = V().addScaledVector(this.tkRight, v[0]).addScaledVector(this.tkFwd, v[1]).addScaledVector(UP, v[2]); this.L.addScaledVector(ax, 34 * acroParams[this.armVar || this.armed].spin * dt / this.toDur); }   // el giro ya nace en el suelo
    const c = this.world.sphere(V(this.pos.x, this.pos.y + .95, this.pos.z), .24); if (c) { this.pos.x += c.n.x * c.depth; this.pos.z += c.n.z * c.depth; }
    // inclinación coherente con el giro que se está generando (pivota sobre los pies)
    this.tilt.addScaledVector(this.L, dt / 26); if (this.tilt.length() > .5) this.tilt.setLength(.5);
    this.takeoffPose = this.armed ? ACRO[this.armed].entry.launch : offset(this.freeLeg ? POSES.jlaunch : POSES.launch, 'head', [inp.flip * 18, 0, 0]);
    if (inp.twist) this.takeoffPose = offset(this.takeoffPose, 'chest', [0, inp.twist * 16, 0]);
    if (inp.flip > 0) this.takeoffPose = offset(offset(this.takeoffPose, 'spine', [10, 0, 0]), 'chest', [10, 0, 0]);
    // talones: el pie rueda hasta la punta al estirarse
    const lift = clamp(this.comp + .02, 0, .08) / .08;
    for (const k of LEGS) { const f = this.foot[k]; f.p.addScaledVector(this.velH, dt); f.p.y = damp(f.p.y, this.pos.y + ANKLE_H + .07 * lift, 40, dt); f.q.slerp(qYaw(this.yaw).multiply(qEuler(38 * lift, 0, 0)), 1 - Math.exp(-30 * dt)); }
    this.ikW = 1; this.poseGround(dt, inp);
    if (u >= 1) {
      this.vel.set(this.velH.x, this.vy, this.velH.z); if (this.pushDir) this.vel.add(this.pushDir); if (this.surf?.box?.v) { this.vel.x += this.surf.box.v.x; this.vel.y += Math.max(0, this.surf.box.v.y); this.vel.z += this.surf.box.v.z; }
      const lean = V().copy(this.L).cross(UP); this.vel.addScaledVector(lean, .0055);   // mortal atrás deriva atrás
      this.charge = 0; this.freeLeg = null; this.launchSpeed = this.velH.length(); this.beginAir('jump'); this.emit('takeoff', { power: this.power, p: this.pos.clone(), surf: this.surf?.surf });
    }
  }
  beginAir(kind) {
    this.famTw = 0; this.segs = []; this.moveLog = {}; this.moveId = null; this.moveTheta = 0; this.mvAmt = 0; this.mvId = null; if (kind !== 'jump') this.setup = null;
    this.vaultName = null; this.vaultHold = 0; this.vaultBox = null; this.vaultOwn = null; this.auto = null;
    this.state = 'air'; this.airT = 0; this.airKind = kind; this.com.copy(this.sk.com).applyQuaternion(this.rootQ).add(this.rootP);
    if (kind !== 'jump') { this.trick.reset(); this.tkRight = this.left(); this.tkFwd = this.forward(); this.trick.startY = this.pos.y; }
    this.apexY = this.com.y; this.startComY = this.com.y; this.bounceT = 0; this.tuckAmt = 0; this.pikeAmt = 0; this.twAmt = 0; this.contactT = null; this.launchP = this.com.clone();
    this.tilt0 = kind === 'jump' ? this.tilt.clone() : V();
  }

  // ───────────────────────── AIRE ─────────────────────────
  air(dt, inp) {
    const T = this.T, g = T.gravity; this.airT += dt;
    // 1) control corporal: pares limitados, nunca detienen el giro al instante
    const boost = inp.boost || 1, brakeK = inp.brake || 1, maxL = boost > 2 ? 125 : T.maxFlipL;  // truco mantenido
    const ax = (axis, cmd, max) => {
      if (!cmd) return; const cur = this.L.dot(axis), brake = cur * cmd < 0;
      const tq = brake ? T.airBrakeTorque * brakeK : T.airFlipTorque * clamp(1 - Math.abs(cur) / max, 0, 1) * 1.4 * boost; this.L.addScaledVector(axis, cmd * tq * dt);
    };
    if (this.bounceT <= 0) {
      ax(this.tkRight, inp.flip, maxL); ax(this.tkFwd, inp.side, maxL); if (inp.spins) for (const q of inp.spins) ax(q.axis, q.c, maxL);
      if (inp.twist) { const brake = this.hTwist * inp.twist < 0; this.hTwist += inp.twist * (brake ? T.airTwistTorque * 1.8 * (inp.twMax || 1) : T.airTwistTorque * clamp(1 - Math.abs(this.hTwist) / (T.maxTwistL * (inp.twMax || 1)), 0, 1) * 1.4 * Math.min(4, boost)) * dt; }
      else this.hTwist *= Math.exp(-1.1 * dt);
    }
    // 2) postura → inercia
    const ttg = this.timeToGround(); this.ttg = ttg;
    const spinIn = inp.flip || inp.side || (inp.spins?.length > 0);
    if (this.auto) { if (spinIn) this.auto = null; else { this.autoLand(dt); if (ttg > this.auto.open) inp = { ...inp, tuck: .82 }; } }
    this.tuckAmt = damp(this.tuckAmt, inp.tuck, 16, dt); this.pikeAmt = damp(this.pikeAmt, inp.pike, 16, dt);
    this.twAmt = damp(this.twAmt, (inp.twistPose ?? clamp(inp.twist || clamp(this.hTwist / 7, -1, 1) * .6, -1, 1)) * (1 - this.tuckAmt), 9, dt);
    if (this.vaultHold > 0) { this.vaultHold -= dt; inp = { ...inp, tuck: Math.max(inp.tuck, spinIn ? 0 : 1) }; this.tuckAmt = Math.max(this.tuckAmt, .9); }
    this.airPose(dt, inp, ttg);
    this.sk.fk();
    const I = this.sk.inertia();
    // 3) ω = L / I(eje). L está fijo en el mundo: agruparse acelera, estirarse frena.
    const Lm = this.L.length(); this.omega.set(0, 0, 0);
    if (Lm > 1e-4) { const a = this.L.clone().multiplyScalar(1 / Lm), al = a.clone().applyQuaternion(this.rootQ.clone().invert()); this.Iflip = al.dot(al.clone().applyMatrix3(I)); this.omega.copy(a).multiplyScalar(Lm / this.Iflip); }
    else this.Iflip = I.elements[0];
    this.Itwist = Math.max(.6, I.elements[4]); this.wTwist = this.hTwist / this.Itwist;
    // 4) ayuda opcional y limitada: solo endereza si ya casi está de pie y abierto
    const up = V(0, 1, 0).applyQuaternion(this.rootQ);
    if (T.assist > 0 && ttg < .45 && !spinIn && inp.tuck < .3 && this.bounceT <= 0) {
      const e = up.clone().cross(UP), ang = Math.asin(clamp(e.length(), 0, 1));
      if (up.y > .6) { const k = T.assist; const tq = e.multiplyScalar(ang > 1e-4 ? 130 * k : 0).addScaledVector(this.L, -2.6 * k); this.L.addScaledVector(tq, dt); }
      if (!inp.twist) this.hTwist *= Math.exp(-3.5 * T.assist * dt);
    }
    // 5) integrar orientación y trayectoria
    this.rootQ.premultiply(qExp(V().copy(this.omega).multiplyScalar(dt))).multiply(qYaw(this.wTwist * dt)).normalize();
    this.vel.y -= g * dt; if (this.world.fans?.length) { this.vel.addScaledVector(this.world.wind(this.com, this.windV ||= V()), dt); if (this.windV.lengthSq() > 0) { this.vel.x *= 1 - .5 * dt; this.vel.y *= 1 - .9 * dt; } }
    if (inp.travel && this.airT < .5) { const D = inp.travelSide ? this.tkRight : this.tkFwd, f = this.vel.dot(D); this.vel.addScaledVector(D, approach(f, inp.travel, 5 * dt) - f); }
    const dirX = inp.dir ?? inp.mx, dirZ = inp.dirZ ?? inp.mz, dk = Math.min(1, Math.hypot(dirX, dirZ));
    if (dk > .05 && this.airKind === 'jump' && this.airT < .4 && this.launchSpeed < 2.2) { // dirección elegida al saltar
      const ux = dirX / dk, uz = dirZ / dk, sp = lerp(1.6, 2.3, clamp((ux * this.tkFwd.x + uz * this.tkFwd.z + .2) / .9, 0, 1)) * T.push, d = V(ux * sp - this.vel.x, 0, uz * sp - this.vel.z), l = d.length(); if (l > 1e-6) this.vel.addScaledVector(d, Math.min(1, 9 * dk * dt / l));
    } else if (inp.mx || inp.mz) { const k = T.airSteer * (this.world.fans?.length && this.windV?.lengthSq() > 0 ? 5 : 1) * dt; this.vel.x += inp.mx * k; this.vel.z += inp.mz * k; }   // en el viento se dirige mejor
    if (this.world.plane) { this.vel.z = 0; this.com.z = damp(this.com.z, 0, 2, dt); }
    this.com.addScaledVector(this.vel, dt);
    this.trampForce(dt, inp);
    this.rootP.copy(this.sk.com).applyQuaternion(this.rootQ).multiplyScalar(-1).add(this.com);
    if (this.com.y > this.apexY) this.apexY = this.com.y;
    this.trick.apex = Math.max(0, this.apexY - this.startComY);
    this.trick.add(this.omega.dot(this.tkRight), this.omega.dot(this.tkFwd), this.wTwist, dt, this.omega.y);
    if (inp.tuck > .5) this.trick.tucked += dt;
    if (this.state === 'air') this.airContacts(dt, inp);
    if (this.com.y < -5) this.out();
  }
  // Mortal de una habilidad: reparte el giro que falta en el tiempo que queda, con correcciones limitadas
  autoLand(dt, first = false) {
    const t = Math.max(.05, this.timeToGround()), o = this.auto, rem = (o.target - this.trick.flip) * DEG, I0 = first ? 8.5 : this.Iflip || 8; let k = 0, I = I0; const n = 40, h = t / n;
    for (let i = 0; i < n; i++) { const left = t - i * h; I += ((left > o.open ? 5.2 : 11.7) - I) * (1 - Math.exp(-h / .085)); k += h / I; }
    const want = rem / k, cur = this.L.dot(this.tkRight); this.L.addScaledVector(this.tkRight, first ? want - cur : clamp(want - cur, -70 * dt, 70 * dt));
  }
  timeToGround() {
    const v = this.vel.y, G = this.T.gravity; let t = .15;
    for (let i = 0; i < 3; i++) { // suelo bajo el punto donde va a caer
      const g = this.world.ground(this.com.x + this.vel.x * t, this.com.z + this.vel.z * t, this.com.y - .5), h = this.com.y - .92 - (g ? g.y : 0);
      if (h <= 0) return 0; t = (v + Math.sqrt(v * v + 2 * G * h)) / G;
    }
    return t;
  }
  airPose(dt, inp, ttg) {
    const spin = Math.abs(this.trick.flip) + Math.abs(this.trick.side) > 25 || this.L.length() > 8;
    let pose = spin ? POSES.layout : POSES.open;
    if (this.airKind !== 'vault') pose = mix(pose, POSES.launch, clamp(1 - this.airT / .16, 0, 1) * .8);
    if (this.twAmt) pose = mix(pose, this.twAmt > 0 ? POSES.wrapL : POSES.wrapR, Math.abs(this.twAmt));
    this.mvAmt = damp(this.mvAmt || 0, inp.movePose ? 1 : 0, inp.movePose ? 13 : 10, dt); if (inp.movePose) { this.mvId = inp.movePose; this.mvT = inp.moveT; }
    if (this.mvAmt > .02 && this.mvId && (ACRO[this.mvId] || MOVE_POSES[this.mvId])) pose = mix(pose, ACRO[this.mvId] ? (v => ACRO[v].pose(this.mvT, this.famTw || 0, ACRO[v].level, this.acroTight ? { ...acroParams[v], tight: true } : acroParams[v]))(this.acroVar || this.mvId) : MOVE_POSES[this.mvId](this.mvT), this.mvAmt);
    if (this.pikeAmt > .01) pose = mix(pose, POSES.pike, this.pikeAmt);
    if (this.tuckAmt > .01) pose = mix(pose, POSES.tuck, this.tuckAmt);
    if (this.bounceT > 0) pose = mix(POSES.bounce, POSES.launch, clamp(this.vel.y / 4, 0, 1));
    else { // al abrir cerca del suelo el cuerpo busca la postura de aterrizaje
      const p = clamp(1 - ttg / .34, 0, 1) * (this.vel.y < 0 ? 1 : 0) * (1 - this.tuckAmt) * (1 - this.pikeAmt); if (p > 0) {
        pose = mix(pose, POSES.prep, smooth(p));
        // reflejo de apoyo: las piernas buscan quedar bajo el centro de masa, hasta 20° como mucho
        const u = V(0, 1, 0).applyQuaternion(this.rootQ.clone().invert());  // vertical del mundo vista por el cuerpo
        if (u.y > .5) {
          const fx = clamp(Math.atan2(u.z, u.y) / DEG * .75 - this.L.dot(V(1, 0, 0).applyQuaternion(this.rootQ)) * .22, -20, 20) * smooth(p), fz = clamp(-Math.atan2(u.x, u.y) / DEG * .75, -16, 16) * smooth(p);
          for (const k of LEGS) pose = offset(pose, 'thigh' + k, [fx, 0, fz]);
        }
      }
    }
    const w = this.L.dot(V(1, 0, 0).applyQuaternion(this.rootQ)); if (Math.abs(w) > 6 && this.tuckAmt < .4 && this.mvAmt < .3) pose = offset(pose, 'head', [clamp(w * .5, -24, 14), 0, 0]);  // la cabeza busca el suelo
    this.sk.setTarget(pose); this.sk.drive(dt, inp.tuck > .5 || inp.pike > .5 ? 17 : 14);
  }
  // Membrana elástica: fuerza proporcional al hundimiento de los pies
  trampForce(dt, inp) {
    const feet = this.feetPoints(); let t = null, dep = 0;
    for (const p of feet) { const q = this.world.trampAt(p.x, p.z); if (q) { const d = q.y - p.y; if (d > dep && d < 1.1) { dep = d; t = q; } } }
    if (!t) { if (this.bounceT > 0) { this.bounceT = 0; this.emitBounceEnd(); } return; }
    const up = V(0, 1, 0).applyQuaternion(this.rootQ);
    if (this.bounceT <= 0) {
      this.bounceIn = this.vel.y; const r = this.evaluate(feet, t.surf, true); this.bounceRes = r;
      if (r.fall) { this.report(r); return this.startFall(r); }
      if (this.trickName() !== 'Salto' || this.airT > .5) this.report({ ...r, bounce: true });
      this.emit('bounce', { v: -this.vel.y, p: this.com.clone(), surf: t.surf });
      this.segs = []; this.moveLog = {}; this.setup = null; this.trick.reset(); this.yawFromRoot(); this.tkRight = this.left(); this.tkFwd = this.forward(); this.trick.startY = t.y; this.startComY = this.com.y; this.apexY = this.com.y; this.L.multiplyScalar(.35); this.hTwist *= .4;
    }
    this.bounceT += dt; t.depth = Math.max(t.depth, dep); t.cx = this.com.x; t.cz = this.com.z; t.live = 1;
    const k = 135 * this.T.trampoline, rising = this.vel.y > 0;
    const vin = Math.abs(this.bounceIn);
    let a = k * dep * (1 + 1.1 * dep * dep) - ((inp.jump ? .7 : 4.2) + 2.5 * Math.max(0, vin - 7.5)) * this.vel.y * (rising ? 1 : 0); if (rising && inp.jump) a += 20 * clamp(1 - Math.max(0, vin - 3.5) / 5, .02, 1);
    this.vel.y += a * dt; this.vel.x *= Math.exp(-4.5 * dt); this.vel.z *= Math.exp(-4.5 * dt);
    if (up.y < .55) { const r = this.evaluate(feet, t.surf, true); r.fall = true; this.report(r); return this.startFall(r); }
    // las piernas enderezan y, al subir, permiten impulsar el giro
    const e = up.clone().cross(UP); this.L.addScaledVector(e, 260 * dt); this.L.multiplyScalar(Math.exp(-(inp.flip || inp.side ? 1 : 9) * dt)); if (!inp.twist) this.hTwist *= Math.exp(-9 * dt);
    if (rising) this.groundTorque(dt, inp, .15, 1);
    if (vin < 1.3 && dep < .1 && !inp.jump && this.bounceT > .12) { this.landGround(feet, { grade: 'stable', vImpact: vin, err: V(), x: 0 }, { y: t.y, surf: t.surf, name: 'tramp', tramp: t }); }
  }
  emitBounceEnd() { this.airT = 0; this.tilt0 = V(); this.startComY = this.com.y; this.apexY = this.com.y; this.launchP = this.com.clone(); }
  feetPoints() { return CONTACTS.filter(c => c.kind === 'foot').map(c => this.worldPt(c)); }
  worldPt(c) { return V().copy(c.o).applyQuaternion(this.sk.q[c.b]).add(this.sk.pos[c.b]).applyQuaternion(this.rootQ).add(this.rootP); }
  airContacts(dt, inp) {
    let feetHit = null, bodyHit = null; const feet = [];
    for (const c of CONTACTS) {
      const p = this.worldPt(c); if (c.kind === 'foot') feet.push(p);
      let h = this.world.sphere(p, c.r); if (h && h.box === this.vaultBox && (this.com.x - this.vaultFar.x) * this.vaultDir.x + (this.com.z - this.vaultFar.z) * this.vaultDir.z < 0) h = null;  // aún está pasando sobre ella con las manos recién soltadas
      if (!h) {
        if (c.kind !== 'foot') { const t = this.world.trampAt(p.x, p.z); if (t && p.y - c.r < t.y - .02 && p.y > t.y - .5 && (c.kind !== 'knee' || this.bounceT <= 0) && !(this.bounceT > 0 && p.y > t.y - .02)) { if (c.kind !== 'knee' && c.kind !== 'hand') bodyHit = { kind: c.kind, n: UP, surf: t.surf, name: 'tramp', depth: .02 }; } }
        continue;
      }
      if (c.kind === 'foot' && h.n.y > .6) { if (!feetHit || h.depth > feetHit.depth) feetHit = h; }
      else if (!bodyHit || h.depth > bodyHit.depth) bodyHit = { ...h, kind: c.kind, p };
    }
    if (feetHit && this.vel.y < .5 && this.airT > .06) {
      const bv = feetHit.box?.v; if (bv) this.vel.sub(bv); const r = this.evaluate(feet, feetHit.surf, !!feetHit.box.launch, feetHit); if (bv) this.vel.add(bv);
      if (feetHit.box.launch && !r.fall) return this.spring(feetHit, r);
      this.report(r);
      if (r.fall) { this.com.y += feetHit.depth; this.rootP.y += feetHit.depth; return this.startFall(r); }
      this.com.y += feetHit.depth; this.rootP.y += feetHit.depth; feet.forEach(p => p.y += feetHit.depth);   // sin hundirse en el suelo al tocar
      const fc = V(); feet.forEach(p => fc.addScaledVector(p, .25)); const gy = this.world.ground(fc.x, fc.z, fc.y + .3, .1);
      return this.landGround(feet, r, gy && Math.abs(gy.y - feetHit.box.top) < .4 ? gy : { y: feetHit.box.top, surf: feetHit.surf, name: feetHit.name, box: feetHit.box });
    }
    if (bodyHit) {
      const bv = bodyHit.box?.v, vn = this.vel.dot(bodyHit.n) - (bv ? bv.dot(bodyHit.n) : 0), limb = bodyHit.kind === 'hand' || bodyHit.kind === 'foot' || bodyHit.kind === 'elbow';
      if (-vn > (limb ? 2.6 : 1.1) || bodyHit.n.y > .6) {
        const up = V(0, 1, 0).applyQuaternion(this.rootQ);
        const r = { grade: 'crash', fall: true, vImpact: Math.max(0, -vn), part: bodyHit.kind, surf: bodyHit.surf, err: V(), x: 1 };
        r.grade = bodyHit.n.y > .6 ? this.fallGrade(V(up.x, 0, up.z)) : 'crash'; this.report(r); return this.startFall(r);
      }
      this.com.addScaledVector(bodyHit.n, bodyHit.depth); this.rootP.addScaledVector(bodyHit.n, bodyHit.depth); if (vn < 0) this.vel.addScaledVector(bodyHit.n, -vn);
    }
  }
  ontoEdge(g) {
    const b = g.box, [lx, lz] = this.world.local(b, this.pos.x, this.pos.z), qx = clamp(lx, -b.h.x + .04, b.h.x - .04), qz = clamp(lz, -b.h.z + .04, b.h.z - .04); if (Math.hypot(qx - lx, qz - lz) > .32) return;
    this.pos.x = b.c.x + qx * b.cos + qz * b.sin; this.pos.z = b.c.z - qx * b.sin + qz * b.cos;
  }
  // Muelle: lanza otra vez sin cortar la serie de trucos
  spring(h, r) {
    const b = h.box; this.report({ ...r, bounce: true }); this.com.y += h.depth; this.rootP.y += h.depth; this.emit('spring', { p: this.com.clone(), surf: b.surf, box: b }); this.segs = []; this.moveLog = {}; this.setup = null; this.trick.reset(); this.yawFromRoot(); this.tkRight = this.left(); this.tkFwd = this.forward(); if (this.world.plane) { const s = Math.sin(this.yaw) >= 0 ? 1 : -1; this.side = s; this.tkRight.set(0, 0, -s); this.tkFwd.set(s, 0, 0); }
    this.vel.set(this.vel.x * .35 + (b.push || 0) + (b.v?.x || 0), b.launch * this.T.spring + Math.max(0, b.v?.y || 0), this.vel.z * .35); this.L.multiplyScalar(.15); this.hTwist *= .2; this.airT = 0; this.airKind = 'jump'; this.launchSpeed = 1; this.tilt0 = V(); this.springN = (this.springN || 0) + 1; this.trick.startY = b.top; this.startComY = this.com.y; this.apexY = this.com.y; this.launchP = this.com.clone();
  }
  snapSide() { this.side = this.world.plane ? (Math.sin(this.yaw) >= 0 ? 1 : -1) : undefined; }
  yawFromRoot() { const x = V(1, 0, 0).applyQuaternion(this.rootQ), f = x.cross(UP); this.yaw = Math.atan2(f.x, f.z); }
  fallGrade(e) { this.yawFromRoot(); const f = e.dot(this.forward()), l = e.dot(this.left()); return Math.abs(l) > Math.abs(f) ? 'fallS' : f > 0 ? 'fallF' : 'fallB'; }

  // ───────────────────────── EVALUACIÓN DEL ATERRIZAJE ─────────────────────────
  // Punto de captura: ¿dónde tendría que apoyar para no caer? Comparado con la base de sus pies.
  evaluate(feet, surf, tramp) {
    const T = this.T; this.yawFromRoot();
    const F = V(); feet.forEach(p => F.addScaledVector(p, .25)); const fwd = this.forward(), lat = this.left(), up = V(0, 1, 0).applyQuaternion(this.rootQ);
    const legs = V().subVectors(this.com, F), h = Math.max(.35, legs.y), w0 = Math.sqrt(T.gravity / h);
    const base = F.clone().addScaledVector(fwd, .02);
    const off = V().subVectors(this.com, base); off.y = 0;
    const rot = V().copy(this.L).cross(UP).multiplyScalar(.5 / (TOTAL_MASS * h * w0));  // las piernas absorben la mitad del giro residual
    const vh = V(this.vel.x, 0, this.vel.z), vf = vh.dot(fwd), vl = vh.dot(lat);
    // correr hacia adelante absorbe velocidad; de espaldas o de lado, muy poca
    const over = (v, cap) => Math.sign(v) * Math.max(0, Math.abs(v) - cap) / w0 * .55;
    const vel = fwd.clone().multiplyScalar(over(vf, vf > 0 ? 7.2 : 1.7) + vf * .02).addScaledVector(lat, over(vl, 1.5) + vl * .03);
    const tiltV = V(up.x, 0, up.z).multiplyScalar(.12);
    const e = off.clone().add(rot).add(vel).add(tiltV);
    const ef = e.dot(fwd), el = e.dot(lat);
    const twist = Math.abs(this.wTwist) / DEG, fg = T.landingForgiveness * (1 + surf.soft * .25);
    const x = (Math.hypot(ef * (ef > 0 ? .88 : 1.15), el * 1.2) + Math.max(0, twist - 120) / 2400) / fg;
    const ext = V().subVectors(this.com, F).length(), legReady = clamp((ext - .5) / .4, 0, 1), vImpact = Math.max(0, -this.vel.y);
    const tol = surf.tol * lerp(.55, 1, legReady) * lerp(.9, 1, T.landingForgiveness > 0 ? 1 : 0);
    let grade = x < .115 ? 'perfect' : x < .21 ? 'stable' : x < .32 ? 'unbalanced' : x < .46 ? 'steps' : null, fall = false;
    if (legs.y < .3 || up.y < .25) grade = null;
    if (!grade) { grade = this.fallGrade(e); fall = true; }
    // la altura no castiga: se puede caer desde donde sea si se llega bien de pie
    return { grade, fall, x, err: e, ef, el, vImpact, vh: vh.length(), tilt: Math.acos(clamp(up.y, -1, 1)) / DEG, pitch: Math.atan2(up.dot(fwd), up.y) / DEG, roll: Math.atan2(up.dot(lat), up.y) / DEG, twist, legReady, tol, surf, w0 };
  }
  // Nombre del salto: trucos propios completados, o lo que digan los grados girados
  trickName() {
    const tr = this.trick, M = ['', '', 'Doble ', 'Triple ', 'Cuádruple '];
    if (this.segs?.length) { // mezcla en el aire: en el orden en que se hicieron
      const out = [], pre = this.setup ? this.setup + ' + ' : ''; let tw = 0;
      for (const s of this.segs) { if (s.id === 'twL' || s.id === 'twR') { tw += s.deg; continue; } const n0 = Math.floor((s.deg + 50) / 360); if (n0 < 1) continue; const fam = FAMILY[s.id], nm = fam ? variantName(s.id, this.famTw || 0) : SEG[s.id] || MOVES[s.id].name, n = fam ? 1 : n0, l = out.at(-1); if (l && l.nm === nm) l.n += n; else out.push({ nm, n }); }
      const t = Math.round(tw / 180) * 180, parts = out.map(o => (M[o.n] ?? o.n + '× ') + o.nm); if (t) parts.push(`${parts.length ? '' : 'Giro '}${t}°`);
      const half = !out.length && this.segs.find(s => MOVES[s.id].vec && s.deg > 70); if (half) return pre + MOVES[half.id].name + ' sin completar';
      if (parts.length) return pre + parts.join(' + '); return pre + 'Salto';
    }
    const own = Object.entries(this.moveLog || {}).map(([id, th]) => [id, Math.floor((th + 50) / 360)]).filter(q => q[1] > 0).map(([id, n]) => (M[n] ?? n + '× ') + MOVES[id].name);
    const half = !own.length && Object.entries(this.moveLog || {}).find(q => q[1] > 70); if (half) return (this.setup ? this.setup + ' + ' : '') + MOVES[half[0]].name + ' sin completar';
    return (this.setup ? this.setup + ' + ' : '') + (own.length ? own.join(' + ') : tr.name());
  }
  report(r) {
    const tr = this.trick, nm = this.trickName(), isT = !/^(J-step \+ )?Salto$|sin completar/.test(nm); this.combo = r.fall ? 0 : isT || this.vaultName ? this.combo + 1 : this.combo;
    this.lastLanding = { ...r, label: GRADES[r.grade].label, lvl: GRADES[r.grade].lvl, name: this.vaultName ? this.vaultName + (isT && nm !== this.vaultOwn ? ' + ' + nm : '') : nm, isTrick: isT || !!this.vaultName, vault: this.vaultName, flip: tr.flip, side: tr.side, twistDeg: tr.twist, air: tr.air, apex: tr.apex, maxW: tr.maxW, dist: this.launchP ? Math.hypot(this.com.x - this.launchP.x, this.com.z - this.launchP.z) : 0, combo: this.combo, drop: this.launchP ? Math.max(0, this.launchP.y - this.com.y) : 0, travel: this.launchP ? (this.com.x - this.launchP.x) * this.tkFwd.x + (this.com.z - this.launchP.z) * this.tkFwd.z : 0 };
    this.emit('land', this.lastLanding);
  }
  landGround(feet, r, g) {
    this.yawFromRoot(); const vy = this.vel.y, F = V(); feet.forEach(p => F.addScaledVector(p, .25));
    this.snapSide(); this.springN = 0; const back = -.05; this.pos.set(F.x, g.y, F.z).addScaledVector(this.forward(), back); this.surf = g; this.bodyY = g.y;
    if (g.box && !this.world.ground(this.pos.x, this.pos.z, g.y + .2, .04)?.box) this.ontoEdge(g);   // cae con las puntas en un borde: mete el apoyo dentro
    const gv = g.box?.v; this.velH.set(this.vel.x - (gv?.x || 0), 0, this.vel.z - (gv?.z || 0)).multiplyScalar(.9);
    this.tilt.copy(qLog(this.rootQ.clone().multiply(qYaw(this.yaw).invert()))); this.tiltV.copy(this.omega).multiplyScalar(.28);
    this.comp = this.rootP.y - this.pos.y - HIP_H + .022; this.compV = vy * .8;
    this.sway.set(this.rootP.x - this.pos.x, 0, this.rootP.z - this.pos.z); this.swayV.copy(this.velH).multiplyScalar(.15).addScaledVector(V().copy(this.L).cross(UP), .01); this.swayV.y = 0;
    LEGS.forEach((k, i) => {
      const f = this.foot[k], id = IDX['foot' + k]; f.p.copy(this.sk.pos[id]).applyQuaternion(this.rootQ).add(this.rootP); f.p.y = Math.max(f.p.y, g.y + ANKLE_H); f.q.copy(this.rootQ).multiply(this.sk.q[id]); f.step = -1; f.planted = true;   // el pie nunca queda bajo el suelo
    });
    this.spinOnly = null; this.armed = null; this.armedSide = false; this.state = 'ground'; this.ikW = 1; this.gaitW = 0; this.L.set(0, 0, 0); this.hTwist = 0; this.omega.set(0, 0, 0); this.wTwist = 0; this.charging = false; this.charge = 0; this.bounceT = 0; this.phase = .1;
    const runOut = this.velH.length() > 1.2;
    if (r.grade === 'perfect') { this.lock = runOut ? 0 : .16; if (this.lastLanding?.isTrick && !runOut) this.finishT = .9; }
    else if (r.grade === 'stable') this.lock = runOut ? .05 : .24;
    else if (r.grade === 'unbalanced') { this.lock = .5; this.balance = .9; }
    else if (r.grade === 'steps') { this.lock = .62; this.balance = 1.1; const d = r.err.clone().setY(0); if (d.lengthSq() > 1e-6) { d.normalize(); this.velH.multiplyScalar(.5).addScaledVector(d, 1.5 + r.x * 2); } }
    if (!runOut && r.grade !== 'steps') this.velH.multiplyScalar(.35);
    this.emit('touchdown', { v: r.vImpact, p: this.pos.clone(), surf: g.surf });
  }

  // ───────────────────────── CAÍDA ─────────────────────────
  startFall(r) {
    const w = V().copy(this.omega).addScaledVector(V(0, 1, 0).applyQuaternion(this.rootQ), this.wTwist);
    const v = this.vel.clone();
    this.rag.start(this.sk, this.rootP, this.rootQ, this.com, v, w, this.braceSk);
    if (r.err && r.x < 5 && r.err.lengthSq() > 1e-4 && r.grade !== 'crash') { const d = r.err.clone().setY(0); const m = Math.min(d.length(), .6); this.rag.topple(d.normalize(), (r.w0 || 3.3) * m * .7, this.rootP.y - .9); }
    this.spinOnly = null; this.armed = null; this.armedSide = false; this.state = 'ragdoll'; this.fallCause = r.grade; this.bounceT = 0; this.emit('fall', { grade: r.grade, p: this.com.clone() });
  }
  ragdoll(dt, inp) {
    if (this.world.plane) { const z = this.rag.com().z; for (const v of this.rag.v) v.z -= z * 7 * dt; }
    this.rag.step(dt, this.world, this.T.gravity); this.rag.apply(this.sk, this.rootP, this.rootQ);
    const h = this.rag.trampHit; if (h) { h.t.depth = Math.max(h.t.depth, h.dep); h.t.cx = h.x; h.t.cz = h.z; h.t.live = 1; }
    const c = this.rag.com(); this.vel.subVectors(c, this.com).multiplyScalar(1 / dt); this.com.copy(c);
    if (c.y < -5) return this.out();
    const want = inp.jump || inp.mx || inp.mz;
    if ((this.rag.still > .55) || (this.rag.time > .9 && want && this.rag.speed < 1.1) || (this.rag.time > 3.5 && this.rag.speed < 1.6) || this.rag.time > 7) this.startGetup();
  }
  startGetup() {
    this.state = 'getup'; this.gu = 0; const z = V(0, 0, 1).applyQuaternion(this.rootQ), y = V(0, 1, 0).applyQuaternion(this.rootQ);
    this.guUp = z.y > -.1; const d = V(y.x, 0, y.z); if (d.lengthSq() < .02) d.copy(this.forward()); d.normalize(); if (this.guUp) d.multiplyScalar(-1);
    if (y.y > .8) this.yawFromRoot(); else this.yaw = Math.atan2(d.x, d.z);
    this.snapSide(); if (this.world.plane && Math.abs(Math.sin(this.yaw)) > .35) this.yaw = this.side * Math.PI / 2;
    this.guQ0 = this.rootQ.clone(); this.guL0 = this.sk.local.map(q => q.clone()); this.guP = this.rootP.clone();
    const mid = this.guUp ? POSES.sit : POSES.kneel, pitch = this.guUp ? -24 : 62;
    const yq = qYaw(this.yaw), K = (pose, p) => { const s = new Skeleton(); s.setTarget(pose); s.snap(); return { l: s.local, q: yq.clone().multiply(qEuler(p, 0, 0)) }; };
    this.guK = [{ l: this.guL0, q: this.guQ0 }, K(mid, pitch), K(POSES.squat, 16), K(POSES.stand, 2)]; this.guT = [0, .55, 1.15, 1.75];
    const g = this.world.ground(this.rootP.x, this.rootP.z, this.rootP.y + .15, .15); this.guY = g ? g.y : 0; this.guG = g; this.emit('getup');
  }
  getup(dt, inp) {
    this.gu += dt * 1.1; const T = this.guT; let i = 0; while (i < 2 && this.gu > T[i + 1]) i++;
    const u = smooth((this.gu - T[i]) / (T[i + 1] - T[i])), A = this.guK[i], B = this.guK[i + 1];
    this.rootQ.slerpQuaternions(A.q, B.q, u); for (let j = 1; j < BONES.length; j++) this.sk.local[j].slerpQuaternions(A.l[j], B.l[j], u);
    this.sk.fk(); this.rootP.set(this.guP.x, 0, this.guP.z);
    let low = Infinity; for (const c of CONTACTS) low = Math.min(low, this.worldPt(c).y - (c.kind === 'foot' ? .02 : c.r));
    this.rootP.y = this.guY - low; if (i === 0) this.rootP.y = lerp(this.guP.y, this.rootP.y, smooth(u * 2.5));
    this.com.copy(this.sk.com).applyQuaternion(this.rootQ).add(this.rootP); this.vel.set(0, 0, 0);
    if (this.gu >= T[3]) {
      this.state = 'ground'; this.sk.vel.forEach(v => v.set(0, 0, 0)); this.pos.set(this.rootP.x, this.guY, this.rootP.z); this.bodyY = this.guY; this.velH.set(0, 0, 0); this.comp = this.rootP.y - this.guY - HIP_H + .02; this.compV = 0; this.sway.set(0, 0, 0); this.swayV.set(0, 0, 0);
      this.tilt.copy(qLog(this.rootQ.clone().multiply(qYaw(this.yaw).invert()))); this.tiltV.set(0, 0, 0); this.lock = 0; this.balance = 0; this.charge = 0; this.charging = false; this.gaitW = 0; this.surf = this.guG;
      for (const k of LEGS) { const f = this.foot[k], id = IDX['foot' + k]; f.p.copy(this.sk.pos[id]).applyQuaternion(this.rootQ).add(this.rootP); f.q.copy(this.rootQ).multiply(this.sk.q[id]); f.step = -1; }
      this.ikW = .3;
    }
  }
}
