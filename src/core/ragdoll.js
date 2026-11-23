// Caída física: 17 partículas con masa, unidas por huesos rígidos, límites articulares,
// tono muscular que se apaga y contacto con fricción/rebote según la superficie.
import { Quaternion } from 'three';
import { V, clamp, qBasisYX, qBasisYZ, qEuler } from './mathx.js';
import { IDX, BONES, BODY } from './body.js';

const FOOT_Q = qEuler(-15, 0, 0); // la punta queda 15° por debajo del eje del pie
const DEF = [ // nombre, hueso, desplazamiento local, radio, masa
  ['hipL', 'thighL', [0, 0, 0], .105, 8], ['hipR', 'thighR', [0, 0, 0], .105, 8],
  ['belly', 'spine', [0, .17, 0], .115, 9],
  ['shL', 'uparmL', [0, 0, 0], .085, 7], ['shR', 'uparmR', [0, 0, 0], .085, 7],
  ['neck', 'neck', [0, 0, 0], .07, 5], ['head', 'head', [0, .10, .01], .108, 5.2],
  ['elL', 'forearmL', [0, 0, 0], .045, 2], ['elR', 'forearmR', [0, 0, 0], .045, 2],
  ['haL', 'handL', [0, -.07, 0], .042, 1.1], ['haR', 'handR', [0, -.07, 0], .042, 1.1],
  ['knL', 'shinL', [0, 0, 0], .06, 5], ['knR', 'shinR', [0, 0, 0], .06, 5],
  ['anL', 'footL', [0, 0, 0], .05, 2.4], ['anR', 'footR', [0, 0, 0], .05, 2.4],
  ['toL', 'footL', [0, -.04, .15], .032, 1.2], ['toR', 'footR', [0, -.04, .15], .032, 1.2],
];
const N = Object.fromEntries(DEF.map((d, i) => [d[0], i]));
const LINKS = [ // a, b, rigidez
  ['hipL', 'hipR', 1], ['shL', 'shR', 1], ['neck', 'shL', 1], ['neck', 'shR', 1],
  ['belly', 'hipL', 1], ['belly', 'hipR', 1], ['belly', 'shL', 1], ['belly', 'shR', 1], ['belly', 'neck', 1],
  ['neck', 'head', 1], ['head', 'shL', .25], ['head', 'shR', .25],
  ['shL', 'hipL', .06], ['shR', 'hipR', .06], ['shL', 'hipR', .06], ['shR', 'hipL', .06],
  ['shL', 'elL', 1], ['shR', 'elR', 1], ['elL', 'haL', 1], ['elR', 'haR', 1],
  ['hipL', 'knL', 1], ['hipR', 'knR', 1], ['knL', 'anL', 1], ['knR', 'anR', 1],
  ['anL', 'toL', 1], ['anR', 'toR', 1], ['knL', 'toL', .3], ['knR', 'toR', .3],
];
const MIN = [ // distancias mínimas (el cuerpo no se atraviesa a sí mismo)
  ['knL', 'knR', .13], ['anL', 'anR', .11], ['knL', 'shL', .24], ['knR', 'shR', .24], ['knL', 'belly', .22], ['knR', 'belly', .22],
  ['anL', 'hipL', .26], ['anR', 'hipR', .26], ['haL', 'shL', .2], ['haR', 'shR', .2], ['haL', 'belly', .19], ['haR', 'belly', .19],
  ['haL', 'head', .16], ['haR', 'head', .16], ['elL', 'belly', .17], ['elR', 'belly', .17], ['elL', 'hipL', .16], ['elR', 'hipR', .16],
  ['head', 'belly', .3], ['head', 'knL', .2], ['head', 'knR', .2], ['shL', 'hipL', .33], ['shR', 'hipR', .33], ['haL', 'haR', .08],
  ['knL', 'hipR', .2], ['knR', 'hipL', .2], ['anL', 'knR', .1], ['anR', 'knL', .1],
].map(([a, b, d]) => [N[a], N[b], d]);
const TONE = [['elL', 'hipL'], ['elR', 'hipR'], ['haL', 'shL'], ['haR', 'shR'], ['knL', 'shL'], ['knR', 'shR'], ['anL', 'hipL'], ['anR', 'hipR'], ['head', 'belly'], ['haL', 'hipL'], ['haR', 'hipR'], ['knL', 'knR']];

export class Ragdoll {
  constructor() {
    this.n = DEF.length; this.x = DEF.map(() => V()); this.p = DEF.map(() => V()); this.v = DEF.map(() => V());
    this.w = DEF.map(d => 1 / d[4]); this.r = DEF.map(d => d[3]);
    this.time = 0; this.maxImpact = 0; this.onImpact = null; this.speed = 0; this.still = 0;
  }
  // Arranca con la velocidad exacta que llevaba el cuerpo (lineal + angular)
  start(sk, rootP, rootQ, com, vel, omega, brace) {
    const k = BODY.w; this.r = DEF.map(d => d[3] * k); const pts = (s, P, Q) => DEF.map(d => V(...d[2]).multiplyScalar(k).applyQuaternion(s.q[IDX[d[1]]]).add(s.pos[IDX[d[1]]]).applyQuaternion(Q).add(P));
    const now = pts(sk, rootP, rootQ), tp = pts(brace, V(), new Quaternion());
    const dist = (A, a, b) => A[N[a]].distanceTo(A[N[b]]);
    this.links = LINKS.map(([a, b, k]) => [N[a], N[b], dist(now, a, b), k]);
    this.min = MIN.map(([a, b, d]) => [a, b, d * BODY.k]);
    this.tone = TONE.map(([a, b]) => [N[a], N[b], dist(tp, a, b)]);
    for (let i = 0; i < this.n; i++) {
      this.x[i].copy(now[i]);
      this.v[i].copy(omega).cross(V().copy(now[i]).sub(com)).add(vel);
    }
    this.time = 0; this.maxImpact = 0; this.still = 0;
  }
  // Vuelco: cada punto recibe velocidad según su altura sobre el apoyo
  topple(dir, speed, footY) { for (let i = 0; i < this.n; i++) this.v[i].addScaledVector(dir, speed * clamp((this.x[i].y - footY) / 1.2, 0, 1.3)); }
  basis() {
    const X = this.x, mid = V().addVectors(X[N.hipL], X[N.hipR]).multiplyScalar(.5);
    const px = V().subVectors(X[N.hipL], X[N.hipR]), py = V().subVectors(X[N.belly], mid);
    const cy = V().subVectors(X[N.neck], X[N.belly]), cx = V().subVectors(X[N.shL], X[N.shR]);
    return { mid, qP: qBasisYX(py, px), qC: qBasisYX(cy, cx) };
  }
  step(dt, world, g) {
    const n = 2, h = dt / n; for (let i = 0; i < n; i++) this.sub(h, world, g);
    this.time += dt;
    let e = 0; for (let i = 0; i < this.n; i++) e += this.v[i].lengthSq();
    this.speed = Math.sqrt(e / this.n);
    this.still = this.speed < .35 ? this.still + dt : 0;
  }
  sub(h, world, g) {
    const { x, p, v, w, r, n } = this, d = V();
    const tone = .02 * Math.exp(-this.time * 3.2) + .00045;
    this.trampHit = null;
    for (let i = 0; i < n; i++) {
      v[i].y -= g * h; v[i].multiplyScalar(1 - .12 * h);
      const t = world.trampAt(x[i].x, x[i].z);
      if (t) { const dep = t.y - (x[i].y - r[i]); if (dep > 0 && dep < .9) { v[i].y += (190 * dep - 4 * v[i].y) * h; v[i].x *= 1 - 3 * h; v[i].z *= 1 - 3 * h; if (!this.trampHit || dep > this.trampHit.dep) this.trampHit = { t, dep, x: x[i].x, z: x[i].z }; } }
      p[i].copy(x[i]); x[i].addScaledVector(v[i], h);
    }
    const pull = (a, b, L, k) => { d.subVectors(x[b], x[a]); const l = d.length() || 1e-6, s = k * (l - L) / l / (w[a] + w[b]); x[a].addScaledVector(d, s * w[a]); x[b].addScaledVector(d, -s * w[b]); };
    for (const [a, b, L] of this.tone) pull(a, b, L, tone);
    for (let it = 0; it < 4; it++) {
      for (const [a, b, L, k] of this.links) pull(a, b, L, k);
      for (const [a, b, L] of this.min) { const q = d.subVectors(x[b], x[a]).length(); if (q < L) pull(a, b, Math.min(L, q + .0025), .5); }
    }
    this.limits();
    const hits = [];
    for (let i = 0; i < n; i++) {
      const c = world.sphere(x[i], r[i]); if (!c) continue;
      const vn = v[i].dot(c.n);
      const out = c.depth * (1 - .8 * c.surf.soft); x[i].addScaledVector(c.n, out);
      p[i].addScaledVector(c.n, Math.max(0, out - Math.max(0, -vn * h)));  // salir del suelo no genera velocidad
      hits.push([i, c, vn]);
      if (vn < -1.2 && -vn > this.maxImpact) { this.maxImpact = -vn; this.onImpact && this.onImpact(-vn, c.surf, x[i]); }
    }
    for (let i = 0; i < n; i++) { v[i].subVectors(x[i], p[i]).multiplyScalar(1 / h); }
    const vc = V(); let mt = 0; for (let i = 0; i < n; i++) { vc.addScaledVector(v[i], 1 / w[i]); mt += 1 / w[i]; } vc.multiplyScalar(1 / mt);
    for (let i = 0; i < n; i++) { d.subVectors(v[i], vc); const s = d.length(); if (s > 13) v[i].copy(vc).addScaledVector(d, 13 / s); }
    for (const [i, c, vn0] of hits) {
      const vn = v[i].dot(c.n); d.copy(v[i]).addScaledVector(c.n, -vn);
      const s = d.length(), f = Math.min(s, c.surf.mu * (Math.max(0, -vn0) * .6 + g * h * 3 + .02));
      if (s > 1e-6) v[i].addScaledVector(d, -f / s);
      if (vn0 < -1) v[i].addScaledVector(c.n, Math.max(0, -vn0 * c.surf.rest - vn));
      else if (vn > .6) v[i].addScaledVector(c.n, -(vn - .6) * .5);
      if (c.surf.soft > .5) v[i].multiplyScalar(1 - Math.min(.5, 14 * c.surf.soft * h));
    }
    // amortiguación interna entre segmentos unidos (tejidos)
    for (const [a, b, , k] of this.links) if (k === 1) { d.subVectors(v[b], v[a]).multiplyScalar(Math.min(.5, 9 * h) / (w[a] + w[b])); v[a].addScaledVector(d, w[a]); v[b].addScaledVector(d, -w[b]); }
  }
  limits() {
    const { x, w } = this, { qP, qC } = this.basis();
    const pz = V(0, 0, 1).applyQuaternion(qP), px = V(1, 0, 0).applyQuaternion(qP), cz = V(0, 0, 1).applyQuaternion(qC), d = V();
    const push = (a, b, n, amt) => { const s = clamp(amt, -.0025, .0025) / (w[a] + w[b]); x[a].addScaledVector(n, s * w[a]); x[b].addScaledVector(n, -s * w[b]); };
    for (const k of ['L', 'R']) {
      const H = N['hip' + k], K = N['kn' + k], A = N['an' + k], S = N['sh' + k], E = N['el' + k], W = N['ha' + k], T = N['to' + k], sg = k === 'L' ? 1 : -1;
      // rodilla: no se dobla al revés
      d.addVectors(x[H], x[A]).multiplyScalar(-.5).add(x[K]); const f = d.dot(pz);
      if (f < 0) push(K, A, pz, -f * .5);
      // cadera: extensión, cruce y apertura limitados
      d.subVectors(x[K], x[H]); let t = d.dot(pz) / .42; if (t < -.35) push(K, H, pz, (-.35 - t) * .42 * .4);
      t = sg * d.dot(px) / .42; if (t < -.3) push(K, H, px, sg * (-.3 - t) * .42 * .4);
      if (t > .75) push(K, H, px, -sg * (t - .75) * .42 * .4);
      // codo
      d.addVectors(x[S], x[W]).multiplyScalar(.5).sub(x[E]); const e = d.dot(cz); if (e < -.02) push(W, E, cz, (-e - .02) * .4);
      // hombro: extensión limitada
      d.subVectors(x[E], x[S]); t = d.dot(cz) / .285; if (t < -.6) push(E, S, cz, (-.6 - t) * .285 * .4);
    }
  }
  // Lleva el estado físico a las articulaciones visibles
  apply(sk, rootP, rootQ) {
    const { x } = this, { mid, qP, qC } = this.basis(), W = {};
    const py = V(0, 1, 0).applyQuaternion(qP);
    rootQ.copy(qP); rootP.copy(mid).addScaledVector(py, .05);
    W.hips = qP; W.chest = qC; W.spine = qP.clone().slerp(qC, .5);
    const pz = V(0, 0, 1).applyQuaternion(qP), cz = V(0, 0, 1).applyQuaternion(qC);
    const hy = V().subVectors(x[N.head], x[N.neck]); W.head = qBasisYZ(hy, cz); W.neck = W.head.clone().slerp(qC, .3);
    for (const k of ['L', 'R']) {
      const H = x[N['hip' + k]], K = x[N['kn' + k]], A = x[N['an' + k]], T = x[N['to' + k]], S = x[N['sh' + k]], E = x[N['el' + k]], Ha = x[N['ha' + k]];
      const zl = V().addVectors(H, A).multiplyScalar(-.5).add(K).multiplyScalar(6).add(pz);
      W['thigh' + k] = qBasisYZ(V().subVectors(H, K), zl); W['shin' + k] = qBasisYZ(V().subVectors(K, A), zl);
      const fx = V(1, 0, 0).applyQuaternion(W['shin' + k]), ft = V().subVectors(T, A);
      W['foot' + k] = qBasisYX(ft.clone().cross(fx), fx).multiply(FOOT_Q);   // Y perpendicular al empeine
      const za = V().addVectors(S, Ha).multiplyScalar(.5).sub(E).multiplyScalar(6).add(cz.clone().multiplyScalar(.6));
      W['uparm' + k] = qBasisYZ(V().subVectors(S, E), za); W['forearm' + k] = qBasisYZ(V().subVectors(E, Ha), za); W['hand' + k] = W['forearm' + k];
    }
    BONES.forEach((b, i) => { if (b.p >= 0) { sk.local[i].copy(W[BONES[b.p].name]).invert().multiply(W[b.name]); sk.vel[i].set(0, 0, 0); } });
    sk.fk();
  }
  com() { const c = V(); let m = 0; for (let i = 0; i < this.n; i++) { const k = 1 / this.w[i]; c.addScaledVector(this.x[i], k); m += k; } return c.multiplyScalar(1 / m); }
}
