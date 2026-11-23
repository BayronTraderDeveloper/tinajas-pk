// Esqueleto articulado: 16 segmentos con masa e inercia reales (De Leva, atleta de 75 kg).
// Convención: +Y arriba, +Z frente, +X izquierda del atleta.
import { Vector3, Quaternion, Matrix3 } from 'three';
import { V, qEuler, qLog, qExp } from './mathx.js';

export const MASS = 75;
export const HIP_H = 0.94;                 // altura de la pelvis de pie
export const THIGH = 0.42, SHIN = 0.40, ANKLE_H = 0.07;
const S = [];
const bone = (name, parent, off, mass, com, len, r) => {
  const m = mass * MASS, perp = m * (len * len / 12 + r * r / 4), ax = m * r * r / 2;
  S.push({ name, parent, off: V(...off), m, com: V(...com), I: [perp, ax, perp] });
};
bone('hips', null, [0, 0, 0], .112, [0, 0, 0], .18, .14);
bone('spine', 'hips', [0, .11, 0], .163, [0, .08, 0], .2, .13);
bone('chest', 'spine', [0, .17, 0], .16, [0, .12, 0], .24, .14);
bone('neck', 'chest', [0, .24, -.01], .0, [0, .05, 0], .1, .05);
bone('head', 'neck', [0, .10, .01], .069, [0, .1, .01], .22, .09);
for (const s of [1, -1]) {
  const k = s > 0 ? 'L' : 'R';
  bone('uparm' + k, 'chest', [.185 * s, .19, -.01], .027, [0, -.13, 0], .285, .045);
  bone('forearm' + k, 'uparm' + k, [0, -.285, 0], .016, [0, -.11, 0], .26, .035);
  bone('hand' + k, 'forearm' + k, [0, -.26, 0], .006, [0, -.08, 0], .18, .03);
  bone('thigh' + k, 'hips', [.095 * s, -.05, 0], .142, [0, -.18, 0], THIGH, .075);
  bone('shin' + k, 'thigh' + k, [0, -THIGH, 0], .0433, [0, -.17, 0], SHIN, .05);
  bone('foot' + k, 'shin' + k, [0, -SHIN, 0], .0137, [0, -.04, .05], .2, .04);
}
export const BONES = S;
export const IDX = Object.fromEntries(S.map((b, i) => [b.name, i]));
S.forEach(b => { b.p = b.parent === null ? -1 : IDX[b.parent]; });
export const TOTAL_MASS = S.reduce((a, b) => a + b.m, 0);

// Puntos de contacto del cuerpo contra el mundo
export const CONTACTS = [];
const cp = (b, o, r, kind) => CONTACTS.push({ b: IDX[b], o: V(...o), r, kind });
for (const k of ['L', 'R']) {
  cp('foot' + k, [0, -.05, -.05], .02, 'foot'); cp('foot' + k, [0, -.05, .16], .02, 'foot');
  cp('shin' + k, [0, 0, 0], .055, 'knee');
  cp('hand' + k, [0, -.1, 0], .04, 'hand'); cp('forearm' + k, [0, 0, 0], .045, 'elbow');
  cp('uparm' + k, [0, 0, 0], .07, 'shoulder');
}
cp('hips', [0, 0, -.06], .10, 'hips'); cp('hips', [0, 0, .04], .10, 'hips');
cp('chest', [0, .1, .02], .13, 'chest'); cp('chest', [0, .1, -.04], .11, 'back');
cp('head', [0, .1, .01], .105, 'head');

const _v = V(), _q = new Quaternion();
export class Skeleton {
  constructor() {
    const n = S.length;
    this.local = S.map(() => new Quaternion());
    this.vel = S.map(() => V());           // velocidad angular de cada músculo/articulación
    this.target = S.map(() => new Quaternion());
    this.q = S.map(() => new Quaternion()); // espacio de la pelvis
    this.pos = S.map(() => V());
    this.com = V(); this.I = new Matrix3();
  }
  setTarget(pose) {
    for (let i = 0; i < S.length; i++) {
      const e = pose[S[i].name];
      if (e) qEuler(e[0], e[1], e[2], this.target[i]); else this.target[i].identity();
    }
  }
  snap() { this.target.forEach((t, i) => { this.local[i].copy(t); this.vel[i].set(0, 0, 0); }); this.fk(); }
  // Músculos: resorte amortiguado por articulación. Las posturas tienen inercia.
  drive(dt, freq, skipLegs = false) {
    const k = freq * freq, c = 2 * freq * 0.92;
    for (let i = 1; i < S.length; i++) {
      if (skipLegs && S[i].leg) continue;
      _q.copy(this.local[i]).invert().premultiply(this.target[i]);
      const err = qLog(_q, _v), w = this.vel[i];
      w.addScaledVector(err, k * dt); w.multiplyScalar(1 / (1 + c * dt));
      this.local[i].premultiply(qExp(_v.copy(w).multiplyScalar(dt), _q)).normalize();
    }
  }
  fk() {
    this.com.set(0, 0, 0);
    for (let i = 0; i < S.length; i++) {
      const b = S[i];
      if (b.p < 0) { this.q[i].identity(); this.pos[i].set(0, 0, 0); }
      else {
        this.q[i].copy(this.q[b.p]).multiply(this.local[i]);
        this.pos[i].copy(b.off).applyQuaternion(this.q[b.p]).add(this.pos[b.p]);
      }
      this.com.addScaledVector(_v.copy(b.com).applyQuaternion(this.q[i]).add(this.pos[i]), b.m / TOTAL_MASS);
    }
  }
  // Tensor de inercia de todo el cuerpo alrededor del centro de masa, según la postura actual
  inertia() {
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (let i = 0; i < S.length; i++) {
      const b = S[i]; if (!b.m) continue;
      const q = this.q[i];
      _v.copy(b.com).applyQuaternion(q).add(this.pos[i]).sub(this.com);
      const { x, y, z } = _v, m = b.m;
      xx += m * (y * y + z * z); yy += m * (x * x + z * z); zz += m * (x * x + y * y);
      xy -= m * x * y; xz -= m * x * z; yz -= m * y * z;
      // inercia propia del segmento: perp·Id + (axial-perp)·a⊗a, con a = eje Y del hueso
      const a = _v.set(0, 1, 0).applyQuaternion(q), d = b.I[1] - b.I[0];
      xx += b.I[0] + d * a.x * a.x; yy += b.I[0] + d * a.y * a.y; zz += b.I[0] + d * a.z * a.z;
      xy += d * a.x * a.y; xz += d * a.x * a.z; yz += d * a.y * a.z;
    }
    this.I.set(xx, xy, xz, xy, yy, yz, xz, yz, zz);
    return this.I;
  }
}
S.forEach(b => { b.leg = /thigh|shin|foot/.test(b.name); });
