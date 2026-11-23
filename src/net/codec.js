// Postura completa en 102 bytes: posición (1/128 m) y cuaterniones sin w.
import { Quaternion, Vector3 } from 'three';
export const N = 15, BYTES = (3 + 3 + N * 3) * 2;
const putQ = (a, o, q) => { const s = q.w < 0 ? -32767 : 32767; a[o] = q.x * s; a[o + 1] = q.y * s; a[o + 2] = q.z * s; };
const getQ = (a, o, q) => { q.x = a[o] / 32767; q.y = a[o + 1] / 32767; q.z = a[o + 2] / 32767; q.w = Math.sqrt(Math.max(0, 1 - q.x * q.x - q.y * q.y - q.z * q.z)); return q.normalize(); };
const i16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
export function pack(a, out = new Int16Array(BYTES / 2)) { out[0] = i16(a.rootP.x * 128); out[1] = i16(a.rootP.y * 128); out[2] = i16(a.rootP.z * 128); putQ(out, 3, a.rootQ); for (let i = 0; i < N; i++) putQ(out, 6 + i * 3, a.sk.local[i + 1]); return out; }
export function unpack(a, o = 0) { const s = { p: new Vector3(a[o] / 128, a[o + 1] / 128, a[o + 2] / 128), q: getQ(a, o + 3, new Quaternion()), l: [] }; for (let i = 0; i < N; i++) s.l.push(getQ(a, o + 6 + i * 3, new Quaternion())); return s; }
export function toB64(list) { const b = new Uint8Array(list.length * BYTES); list.forEach((s, i) => b.set(new Uint8Array(s.buffer, s.byteOffset, BYTES), i * BYTES)); let t = ''; for (const c of b) t += String.fromCharCode(c); return btoa(t); }
export function fromB64(str) { if (typeof str !== 'string' || str.length > 4000) return []; let t; try { t = atob(str); } catch { return []; } if (!t.length || t.length % BYTES) return []; const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); const a = new Int16Array(b.buffer), out = []; for (let i = 0; i < a.length; i += BYTES / 2) out.push(unpack(a, i)); return out; }
