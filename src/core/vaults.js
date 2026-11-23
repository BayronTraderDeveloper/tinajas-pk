// Habilidades especiales de vallado: kong y doble kong.
// Kong: despegue 1-2, vuelo con la cadera a la altura de la cabeza, manos planas, rodillas entre los brazos, empuje.
// Castaway: backflip que sale de las manos. Apoyo en el canto del muro, media parada, empuje y mortal alejándose.
// Doble kong: primer apoyo cerca del inicio, vuelo horizontal, segundo apoyo cerca del final y ahí se recogen las rodillas.
import { clamp, lerp, smooth, V, qYaw, qEuler, DEG, damp } from './mathx.js';
import { POSES, mix, offset } from './poses.js';
import { BODY, COM_H } from './body.js';

export const VAULTS = {
  kong: { name: 'Kong', key: 'Digit1', label: '1', minLen: .35, maxLen: 1.4, minV: 3.5 },
  dkong: { name: 'Doble kong', key: 'Digit2', label: '2', minLen: 1.4, maxLen: 3.2, minV: 4.7 },
  castaway: { name: 'Castaway', key: 'Digit3', label: '3', wall: true, minH: 1, maxH: 2.05, minV: 2.8 },
};
export const HEIGHT = [.7, 1.2];
// Cada plataforma admite un solo movimiento, según su tamaño
export function vaultFor(box, fromY, len = box.h.x * 2) {
  if (!box.vaultable) return null; const h = box.top - fromY; if (h < HEIGHT[0] - .01 || h > HEIGHT[1] + .01) return null;
  for (const [id, v] of Object.entries(VAULTS)) if (!v.wall && len > v.minLen && len <= v.maxLen + .001) return id; return null;
}
// Todo lo que se puede hacer en esa plataforma: su vallado (si es baja) y los trucos de muralla (desde 1 m)
export function optionsFor(box, fromY, len) {
  if (!box.vaultable) return []; const h = box.top - fromY, k = vaultFor(box, fromY, len), out = k ? [k] : [];
  for (const [id, v] of Object.entries(VAULTS)) if (v.wall && h >= v.minH - .01 && h <= v.maxH + .01) out.push(id); return out;
}
// Caras por las que se puede atacar una caja. En 2D solo las dos del eje X; en 3D las cuatro, con su giro.
// dir: hacia dónde se mueve el atleta · len: fondo en ese sentido · face: distancia a la cara · lat: desvío lateral
export function faces(w, b, p) {
  const out = [], dx = p.x - b.c.x, dz = p.z - b.c.z;
  for (const [ax, h, hl] of w.plane ? [[[1, 0], b.h.x, 9]] : [[[b.cos, -b.sin], b.h.x, b.h.z], [[b.sin, b.cos], b.h.z, b.h.x]]) for (const s of [1, -1]) {
    const X = ax[0] * s, Z = ax[1] * s, along = -(dx * X + dz * Z), lat = dx * Z - dz * X;
    out.push({ box: b, dir: V(X, 0, Z), len: h * 2, half: h, face: along - h, lat: w.plane ? 0 : lat, wide: hl });
  }
  return out;
}
const clear = (w, a, D, face, step) => { for (let s = step; s < face - .12; s += .2) { const g = w.ground(a.pos.x + D.x * s, w.plane ? 0 : a.pos.z + D.z * s, a.pos.y + 3); if (!g || Math.abs(g.y - a.pos.y) > .2) return false; } return true; };
const beyond = (w, a, f, d) => w.ground(a.pos.x + f.dir.x * (f.face + f.len + d), w.plane ? 0 : a.pos.z + f.dir.z * (f.face + f.len + d), f.box.top + 3);
// Subida hasta apoyar las manos en un muro: tiempo de vuelo según la altura
const wallRise = (h, g) => { const dy = Math.max(.12, h + .44 * BODY.k - 1.06 * BODY.k), vy = Math.sqrt(.16 + 2 * g * dy); return { vy, T: (vy - .4) / g }; };
export const takeoffDist = (v, id = 'kong', h = 1, g = 9.81) => VAULTS[id]?.wall ? .36 + .11 * Math.min(v, 4.2) + 2.5 * wallRise(h, g).T : .7 + .24 * v;

// ── Oportunidad: detecta la plataforma y da 2 s para decidir, con cámara lenta sutil ──
export const DECIDE = 2, SLOW = .45, REACH = 4;
// Con poca velocidad se hace la versión desde parado: flexión, salto y más trabajo de brazos
export const isSoft = (v, id) => v < VAULTS[id].minV * .75;
const softDist = (id, h, g) => VAULTS[id].wall ? .5 + 1.1 * wallRise(h, g).T : .95;
export class VaultSense {
  constructor(athlete, abilities) { this.a = athlete; this.ab = abilities; this.opp = null; this.skip = null; this.reach = REACH; }
  clear() { this.opp = null; this.skip = null; }
  scan() {
    const a = this.a, w = a.world; if (a.state !== 'ground' || a.charging || a.js) return null;
    const v = a.velH.length(); if (v < 1.8 || a.velH.dot(a.forward()) < v * .7) return null;
    const vd = a.velH.clone().multiplyScalar(1 / v); let best = null;
    for (const b of w.boxes) {
      if (!b.vaultable || Math.abs(b.c.x - a.pos.x) > 18 || Math.abs(b.c.z - a.pos.z) > 18) continue;
      for (const f of faces(w, b, a.pos)) {
        const al = vd.dot(f.dir); if (al < (w.plane ? .7 : .86) || f.face < .2 || f.face > 14 || (best && f.face > best.face)) continue;
        if (!w.plane) { const lx = f.lat + (vd.x * f.dir.z - vd.z * f.dir.x) * f.face / al; if (Math.abs(lx) > f.wide - .2) continue; }   // ¿llega a esa cara?
        const ids = optionsFor(b, a.pos.y, f.len).filter(id => this.ab.has(id)); if (!ids.length || !clear(w, a, vd, f.face, .3)) continue;
        const back = beyond(w, a, f, .9), opts = [];
        for (const id of ids) { if (!VAULTS[id].wall && (!back || back.y > b.top - .3)) continue; const dist = f.face - takeoffDist(Math.max(v, VAULTS[id].minV), id, b.top - a.pos.y, a.T.gravity); if (dist > -.05) opts.push({ id, dist }); }
        if (opts.length) best = { box: b, face: f.face, opts, dir: f.dir, d: Math.sign(f.dir.x) || 1, v, dist: Math.min(...opts.map(o => o.dist)) };
      }
    }
    return best;
  }
  // Objetivo más cercano para una habilidad, estando quieto o en marcha; primero lo que tiene delante
  near(id) {
    const a = this.a, w = a.world; if (a.state !== 'ground' || a.charging || a.js || !this.ab.has(id)) return null;
    const fw = a.forward(); let best = null;
    for (const b of w.boxes) {
      if (!b.vaultable || Math.abs(b.c.x - a.pos.x) > 12 || Math.abs(b.c.z - a.pos.z) > 12) continue;
      for (const f of faces(w, b, a.pos)) {
        if (f.face < .15 || f.face > this.reach || Math.abs(f.lat) > f.wide - .15 || !optionsFor(b, a.pos.y, f.len).includes(id)) continue;
        const back = beyond(w, a, f, .9); if (!clear(w, a, f.dir, f.face, .2) || (!VAULTS[id].wall && (!back || back.y > b.top - .3))) continue;
        const cost = f.face + (1 - clamp(fw.dot(f.dir) * 1.4, -1, 1)) / 2 * REACH; if (!best || cost < best.cost) best = { box: b, dir: f.dir, d: Math.sign(f.dir.x) || 1, face: f.face, cost };
      }
    }
    return best;
  }
  needsRun(id, n) { return id === 'dkong' && this.a.speed < 2.5 && n.face < takeoffDist(VAULTS.dkong.minV) + .5; }  // el doble kong necesita impulso
  available() { return Object.keys(VAULTS).filter(id => { const n = this.near(id); return n && !this.needsRun(id, n); }); }
  // Pulsar la tecla: si hay aviso lo elige; si no, va directo a la plataforma más cercana
  request(id) {
    const r = this.choose(id); if (r === 'ok') return r;
    const n = this.near(id); if (!n) return r;
    if (this.needsRun(id, n)) return 'run';
    this.opp = { box: n.box, ids: [id], t: 0, chosen: id, direct: true, d: n.d, dir: n.dir, mx: n.dir.x, mz: n.dir.z, life: 3.5 }; return 'ok';
  }
  direct(real) {
    const o = this.opp, a = this.a; o.life -= real; if (a.state !== 'ground' || a.charging || o.life <= 0) { this.opp = null; return 1; }
    const f = faces(a.world, o.box, a.pos).find(q => q.dir.dot(o.dir) > .99), face = f.face, h = o.box.top - a.pos.y, v = Math.max(0, a.velH.dot(o.dir)), id = o.chosen, min = VAULTS[id].minV;
    const aligned = a.forward().dot(o.dir) > .96, soft = isSoft(v, id), need = soft ? softDist(id, h, a.T.gravity) : takeoffDist(Math.max(v, min), id, h, a.T.gravity), go = !aligned || face > need;
    o.mx = go ? o.dir.x : 0; o.mz = go ? o.dir.z : 0; o.run = id === 'dkong';
    if (aligned && face <= need + v * real * 1.1 && !(id === 'dkong' && soft && face > need)) { this.opp = null; this.skip = o.box; a.startVault(id, o.box, o.dir); }
    return 1;
  }
  // real: segundos reales. Devuelve la escala de tiempo deseada (1 = normal)
  update(real) {
    if (this.opp?.direct) return this.direct(real);
    const a = this.a, s = this.scan(); if (this.skip && (!s || s.box !== this.skip)) this.skip = null;
    if (this.opp && (!s || s.box !== this.opp.box)) this.opp = null;
    if (!this.opp && s && s.box !== this.skip && s.dist > .25 && s.dist <= s.v * SLOW * DECIDE) this.opp = { box: s.box, ids: s.opts.map(o => o.id), t: DECIDE, chosen: null };
    const o = this.opp; if (!o) return 1; o.dist = s.dist; o.d = s.d; o.dir = s.dir; o.v = s.v;
    if (o.chosen) { const m = s.opts.find(q => q.id === o.chosen); if (!m) { this.opp = null; return 1; } if (m.dist <= s.v * real * 1.2 + .03) { this.opp = null; this.skip = o.box; a.startVault(m.id, o.box, s.dir); } return 1; }
    o.t -= real; if (o.t <= 0 || s.dist <= .04) { this.skip = o.box; this.opp = null; return 1; }
    return clamp(s.dist / (s.v * o.t), .3, .6);
  }
  // Devuelve 'ok', 'wrong' (esa plataforma pide otro movimiento) o 'none'
  choose(id) { const o = this.opp; if (!o) return 'none'; if (!o.ids.includes(id)) return 'wrong'; o.chosen = id; return 'ok'; }
}

// ── Movimiento ──
const G = { split: { spine: [10, 0, 0], chest: [4, 0, 0], head: [-14, 0, 0], uparmL: [-60, 0, 14], uparmR: [-60, 0, -14], forearmL: [-30, 0, 0], forearmR: [-30, 0, 0] } };
const POSE = {
  dive: { spine: [4, 0, 0], chest: [2, 0, 0], neck: [-14, 0, 0], head: [-26, 0, 0], uparmL: [-118, -6, 8], uparmR: [-118, 6, -8], forearmL: [-12, 0, 0], forearmR: [-12, 0, 0], thighL: [6, 0, 4], thighR: [16, 0, -4], shinL: [46, 0, 0], shinR: [34, 0, 0], footL: [34, 0, 0], footR: [34, 0, 0] },
  flat: { spine: [-4, 0, 0], chest: [-4, 0, 0], neck: [-16, 0, 0], head: [-28, 0, 0], uparmL: [-112, -6, 8], uparmR: [-112, 6, -8], forearmL: [-14, 0, 0], forearmR: [-14, 0, 0], thighL: [4, 0, 4], thighR: [4, 0, -4], shinL: [34, 0, 0], shinR: [30, 0, 0], footL: [38, 0, 0], footR: [38, 0, 0] },
  pass: { spine: [26, 0, 0], chest: [16, 0, 0], neck: [-14, 0, 0], head: [-24, 0, 0], uparmL: [-70, -4, 10], uparmR: [-70, 4, -10], forearmL: [-8, 0, 0], forearmR: [-8, 0, 0], thighL: [-124, 0, 2], thighR: [-124, 0, -2], shinL: [134, 0, 0], shinR: [134, 0, 0], footL: [24, 0, 0], footR: [24, 0, 0] },
};
POSE.cast = { spine: [-6, 0, 0], chest: [-4, 0, 0], neck: [-12, 0, 0], head: [-26, 0, 0], uparmL: [-92, -6, 10], uparmR: [-92, 6, -10], forearmL: [-10, 0, 0], forearmR: [-10, 0, 0], thighL: [14, 0, 5], thighR: [14, 0, -5], shinL: [22, 0, 0], shinR: [22, 0, 0], footL: [42, 0, 0], footR: [42, 0, 0] };
POSE.snap = { ...POSE.cast, spine: [14, 0, 0], chest: [10, 0, 0], head: [-20, 0, 0], thighL: [-52, 0, 4], thighR: [-52, 0, -4], shinL: [62, 0, 0], shinR: [62, 0, 0], footL: [30, 0, 0], footR: [30, 0, 0] };
const hermite = (a, va, b, vb, u, T) => { const u2 = u * u, u3 = u2 * u; return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * T * va + (-2 * u3 + 3 * u2) * b + (u3 - u2) * T * vb; };

export class VaultMotion {
  constructor(a, id, box, dir) {
    const plane = a.world.plane, fs = faces(a.world, box, a.pos), fw = a.forward(), F = fs.reduce((q, f) => f.dir.dot(dir || fw) > q.dir.dot(dir || fw) ? f : q), D = this.D = F.dir, g = a.T.gravity; this.a = a; this.id = id; this.box = box; this.d = Math.sign(D.x) || 1; this.t = 0; this.seg = 0;
    this.R = V(-D.z, 0, D.x);   // derecha del atleta
    a.yaw = Math.atan2(D.x, D.z); const v0 = Math.max(0, a.velH.dot(D)), soft = this.soft = isSoft(v0, id) && id !== 'dkong'; this.v = soft ? Math.max(v0, .05) : Math.max(v0, VAULTS[id].minV); const v = this.v, top = box.top, len = F.len;
    // todo se mide en s: metros desde el centro de masa inicial en el sentido del movimiento
    this.o = V(a.com.x, 0, a.com.z); this.y0 = a.com.y; const front = F.face + (a.pos.x - a.com.x) * D.x + (plane ? 0 : (a.pos.z - a.com.z) * D.z), far = front + len, pS = (a.pos.x - a.com.x) * D.x + (a.pos.z - a.com.z) * D.z, S = s => s, yTop = top + .45, d = 1;
    this.lat = plane ? a.com.z * this.R.z : 0; this.plane = plane; this.pLat = plane ? a.pos.z * this.R.z : (a.pos.x - a.com.x) * this.R.x + (a.pos.z - a.com.z) * this.R.z; if (plane) this.o.z = 0;
    const hands = VAULTS[id].wall ? [front + .1] : id === 'kong' ? [front + clamp(len * (soft ? .45 : .62), Math.min(.28, len * .55), len - .16)] : [front + .34, far - .36]; this.hands = hands; const wall = !!VAULTS[id].wall; this.wall = wall; this.front = front; this.far = far;
    // tramos del centro de masa: cada uno con su duración y velocidad vertical continua
    const segs = [], add = (kind, s1, y1, vy1, th1, hand, TT, vx1 = v) => { const p = segs.at(-1), s0 = p ? p.s1 : 0, T = TT || Math.max(.05, (s1 - s0) / v); segs.push({ kind, s0, s1, T, vx0: p ? p.vx1 : v, vx1, y0: p ? p.y1 : this.y0, y1, vy0: p ? p.vy1 : 0, vy1, th0: p ? p.th1 : a.tilt.length() / DEG * .6, th1, hand }); return segs.at(-1); };
    if (soft) {
      const yA = a.pos.y + 1.04, yc = wall ? top + .44 : top + .45, dy = Math.max(.12, yc - yA), vyc = wall ? .4 : -.15, vy = Math.sqrt(vyc * vyc + 2 * g * dy), T = (vy - vyc) / g, sc = S(hands[0]) - (wall ? .46 : .55), sA = v0 * .16 + .03, vf = (sc - sA) / T;
      add('push', sA, yA, vy, wall ? 8 : 16, undefined, .34, vf); add('fly', sc, yc, vyc, wall ? 66 : 78, undefined, T, wall ? .3 : Math.max(.6, vf));
      if (wall) { add('hands', sc + .10, yc + .13, .25, 104, 0, .28, 0); add('hands', sc - .16, yc + .42, 4.05, 50, 0, .24, -1.6); }
      else { add('hands', sc + .36, top + .58, 1.95, 60, 0, .27, 2.8); this.v = 2.8; }
    } else if (wall) {
      const r = wallRise(top - a.pos.y, g), va = Math.min(v, 4.2), yA = a.pos.y + 1.06 * BODY.k, sA = (v + va) / 2 * .11, sc = S(hands[0]) - .46, yc = yA + r.vy * r.T - .5 * g * r.T * r.T;
      add('push', sA, yA, r.vy, 10, undefined, .11, va); add('fly', sc, yc, .4, 66, undefined, r.T, 1.1);
      add('hands', sc + .10, yc + .13, .25, 104, 0, .24, 0);                    // media parada: las piernas suben
      add('hands', sc - .16, yc + .42, 4.05, 50, 0, .24, -1.6);                 // empuje: las piernas bajan con latigazo y sale hacia atrás
    } else {
    const sA = v * .11, yA = a.pos.y + 1.06 * BODY.k, s1 = S(hands[0]) - .55, T1 = Math.max(.12, (s1 - sA) / v), vyA = (yTop - yA) / T1 + g * T1 / 2;
    add('push', sA, yA, vyA, 24); add('fly', s1, yTop, vyA - g * T1, 80);
    if (id === 'kong') add('hands', s1 + .36, top + .57, 1.75, 60, 0);
    else {
      const e1 = S(hands[0]) - .12, s2 = S(hands[1]) - .55, Tf = Math.max(.08, (s2 - e1) / v), vyF = (top + .47 - (top + .49)) / Tf + g * Tf / 2;
      add('hands', e1, top + .49, vyF, 84, 0); add('fly2', s2, top + .47, vyF - g * Tf, 80); add('hands', s2 + .36, top + .57, 1.75, 60, 1);
    }
    }
    this.segs = segs; this.farS = S(far); this.T = segs.reduce((q, s) => q + s.T, 0);
    const sA = segs[0].s1; this.footPlant = soft ? { L: a.foot.L.p.clone(), R: a.foot.R.p.clone() } : { L: this.at(pS + sA * .5 + .08, a.pos.y + .07, this.pLat - .09), R: this.at(pS + sA * .5 - .14, a.pos.y + .07, this.pLat + .09) };
    this.footFrom = { L: a.foot.L.p.clone(), R: a.foot.R.p.clone() }; this.q0 = a.rootQ.clone(); this.hw = 0; this.emitted = -1;
    a.velH.copy(D).multiplyScalar(v);
  }
  at(s, y, lat = 0, out = V()) { return out.set(this.o.x + this.D.x * s + this.R.x * lat, y, this.o.z + this.D.z * s + this.R.z * lat); }
  step(dt) {
    const a = this.a, S = this.segs; this.t += dt; let t = this.t, i = 0; while (i < S.length - 1 && t > S[i].T) { t -= S[i].T; i++; }
    const s = S[i], u = clamp(t / s.T, 0, 1), done = i === S.length - 1 && t >= s.T, last = i === S.length - 1;
    const fly = s.kind === 'fly' || s.kind === 'fly2', sx = hermite(s.s0, s.vx0, s.s1, s.vx1, u, s.T), y = fly ? s.y0 + s.vy0 * t - .5 * a.T.gravity * t * t : hermite(s.y0, s.vy0, s.y1, s.vy1, u, s.T);
    const dip = this.soft && s.kind === 'push' ? -.24 * Math.sin(Math.PI * Math.pow(u, .85)) ** 2 : 0, vy = fly ? s.vy0 - a.T.gravity * t : lerp(s.vy0, s.vy1, u), th = lerp(s.th0, s.th1, s.kind === 'fly' ? smooth(u * .9 + .05) : this.wall && !last ? 1 - (1 - u) * (1 - u) : this.wall ? u * u : u);
    this.lat = damp(this.lat, 0, 6, dt); this.at(sx, y + dip, this.lat, a.com); a.vel.copy(this.D).multiplyScalar(lerp(s.vx0, s.vx1, u)); a.vel.y = vy;
    // postura objetivo: los músculos llegan con su propia inercia
    let pose; if (this.soft && s.kind === 'push') pose = mix(POSES.charge, POSES.launch, smooth((u - .5) / .5));
    else if (this.wall) pose = s.kind === 'push' ? mix(G.split, POSE.dive, smooth(u) * .5) : s.kind === 'fly' ? mix(POSE.dive, POSE.cast, smooth((u - .4) / .6)) : last ? mix(POSE.cast, POSE.snap, smooth(u)) : POSE.cast;
    else if (s.kind === 'push') pose = mix(G.split, POSE.dive, smooth(u) * .6); else if (s.kind === 'fly') pose = mix(POSE.dive, this.id === 'kong' ? POSE.pass : POSE.flat, this.id === 'kong' ? smooth((u - .25) / .6) : smooth((u - .45) / .55));
    else if (s.kind === 'fly2') pose = mix(POSE.flat, POSE.pass, smooth((u - .2) / .6)); else pose = last ? POSE.pass : POSE.flat;
    a.sk.setTarget(pose); a.sk.drive(dt, s.kind === 'push' ? 18 : 25);
    const qT = qYaw(a.yaw).multiply(qEuler(th, 0, 0)); this.q0.slerp(qT, 1 - Math.exp(-40 * dt)); a.rootQ.copy(i === 0 ? this.q0 : qT);
    a.sk.fk(); const place = () => a.rootP.copy(a.sk.com).applyQuaternion(a.rootQ).multiplyScalar(-1).add(a.com); place();
    if (s.kind === 'push') { // dos pies casi juntos: paso 1-2 y empuje
      const p = smooth(u * 1.6); for (const k of ['L', 'R']) { const f = a.foot[k]; f.p.lerpVectors(this.footFrom[k], this.footPlant[k], p); f.p.y = Math.max(f.p.y, this.footPlant[k].y) + Math.max(0, u - (this.soft ? .75 : .55)) * .22; f.q.copy(qYaw(a.yaw)).multiply(qEuler(50 * smooth((u - .4) / .6), 0, 0)); } a.ikW = 1; a.legIK(); a.sk.fk();
    }
    // manos fijas en la plataforma durante el apoyo; se acercan un poco antes
    let hi = s.hand, w = 0; if (s.kind === 'hands') w = !last || u < .85 ? 1 : 1 - (u - .85) / .15 * .5; else if (fly) { hi = s.kind === 'fly' ? 0 : 1; w = smooth((u - .62) / .38); }
    this.hw = damp(this.hw, w, w > this.hw ? 60 : 26, dt);
    if (this.hw > .02 && hi !== undefined) {
      const lift = s.kind === 'hands' ? (this.wall && !last ? .035 : lerp(.035, .11, smooth((u - .45) / .55))) : .035 + (1 - w) * .12;
      for (const [k, sg] of [['L', 1], ['R', -1]]) a.armIK(k, this.at(this.hands[hi] - (this.wall ? .03 : .06), this.box.top + lift, -sg * .2), this.hw);
      a.sk.fk();
    }
    if (s.kind === 'hands' && this.emitted !== s.hand) { this.emitted = s.hand; a.emit('hands', { p: this.at(this.hands[s.hand], this.box.top), surf: this.box.surf }); }
    a.pos.set(a.com.x, a.pos.y, this.plane ? 0 : a.com.z); if (done) this.release();
  }
  release() {
    if (this.wall) return this.releaseWall();
    const a = this.a, s = this.segs.at(-1); a.vel.copy(this.D).multiplyScalar(this.v * .985 * a.T.kong); a.velH.copy(a.vel); a.vel.y = s.vy1; a.tilt.set(0, 0, 0);
    a.launchSpeed = 99; a.beginAir('vault'); a.vaultName = VAULTS[this.id].name; a.tuckAmt = 1;
    // las rodillas siguen recogidas hasta librar el canto; el empuje de manos da el giro que endereza al atleta
    const bp = this.at(this.far + .9, 0), lg = a.world.ground(bp.x, bp.z, this.box.top), h = a.com.y - COM_H - (lg ? lg.y : 0), g = a.T.gravity, ttg = (s.vy1 + Math.sqrt(s.vy1 ** 2 + 2 * g * Math.max(.05, h))) / g;
    a.vaultBox = this.box; a.vaultFar = this.at(this.far + .22, 0); a.vaultDir = this.D; a.vaultHold = clamp((this.farS - s.s1 + .16) / this.v, .08, ttg * .5);
    let k = 0; const n = 40; for (let i = 0; i < n; i++) { const t = (i + .5) / n * ttg, q = t - a.vaultHold; k += ttg / n / (q < 0 ? 4.6 : 11.6 + (4.6 - 11.6) * Math.exp(-Math.max(0, q - .03) / .085)); }
    const rot = (s.th1 - 4) * DEG; a.L.copy(a.tkRight).multiplyScalar(-rot / k); a.hTwist = 0;
  }
  releaseWall() { // castaway: mortal atrás desde las manos, alejándose del muro y cayendo de cara a él
    const a = this.a, s = this.segs.at(-1); a.vel.copy(this.D).multiplyScalar(s.vx1); a.velH.copy(a.vel); a.vel.y = s.vy1 + a.T.cast; a.tilt.set(0, 0, 0); a.launchSpeed = 99;
    a.beginAir('vault'); a.vaultName = VAULTS[this.id].name; a.vaultOwn = 'Backflip';
    a.vaultBox = this.box; a.vaultFar = this.at(this.front - .5, 0); a.vaultDir = this.D.clone().multiplyScalar(-1);
    a.auto = { target: -(360 + s.th1 - 14), open: .34 }; a.autoLand(0, true);
  }
}
