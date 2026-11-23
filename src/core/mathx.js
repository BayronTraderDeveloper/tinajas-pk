import { Vector3, Quaternion, Euler, Matrix4 } from 'three';
export const V = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
export const UP = Object.freeze(V(0, 1, 0));
export const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const remap = (v, a, b, c, d) => lerp(c, d, clamp((v - a) / (b - a), 0, 1));
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const _e = new Euler(), _m = new Matrix4();
export const qEuler = (x, y, z, out = new Quaternion()) => out.setFromEuler(_e.set(x * DEG, y * DEG, z * DEG, 'XYZ'));
export const qYaw = (a, out = new Quaternion()) => out.setFromAxisAngle(UP, a);
// vector de rotación -> cuaternión
export function qExp(v, out = new Quaternion()) {
  const a = v.length();
  if (a < 1e-9) return out.set(v.x / 2, v.y / 2, v.z / 2, 1).normalize();
  const s = Math.sin(a / 2) / a;
  return out.set(v.x * s, v.y * s, v.z * s, Math.cos(a / 2));
}
export function qLog(q, out = V()) {
  let { x, y, z, w } = q; if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z); if (s < 1e-9) return out.set(2 * x, 2 * y, 2 * z);
  const k = 2 * Math.atan2(s, w) / s; return out.set(x * k, y * k, z * k);
}
// base ortonormal con eje Y exacto y Z lo más cercano a zHint
export function qBasisYZ(y, zHint, out = new Quaternion()) {
  const yy = y.clone().normalize();
  let x = yy.clone().cross(zHint);
  if (x.lengthSq() < 1e-8) x = yy.clone().cross(Math.abs(yy.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1));
  x.normalize();
  return out.setFromRotationMatrix(_m.makeBasis(x, yy, x.clone().cross(yy)));
}
export function qBasisYX(y, xHint, out = new Quaternion()) {
  const yy = y.clone().normalize();
  const z = xHint.clone().cross(yy);
  if (z.lengthSq() < 1e-8) return qBasisYZ(y, V(0, 0, 1), out);
  z.normalize();
  return out.setFromRotationMatrix(_m.makeBasis(yy.clone().cross(z), yy, z));
}
