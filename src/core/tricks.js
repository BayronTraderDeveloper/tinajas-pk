// Registro de rotaciones del salto: grados reales integrados, no nombres prefijados.
import { DEG } from './mathx.js';
const MULT = ['', '', 'Doble ', 'Triple ', 'Cuádruple ', 'Quíntuple '];
export class TrickTracker {
  reset() { this.flip = 0; this.side = 0; this.spin = 0; this.twist = 0; this.air = 0; this.apex = 0; this.maxW = 0; this.startY = 0; this.tucked = 0; }
  constructor() { this.reset(); }
  // w en rad/s dentro del marco de despegue (x = lateral, z = frente)
  add(wx, wz, wy, dt, wu = 0) { this.spin += wu * dt / DEG; this.flip += wx * dt / DEG; this.side += wz * dt / DEG; this.twist += wy * dt / DEG; this.air += dt; this.maxW = Math.max(this.maxW, Math.hypot(wx, wz) / DEG); }
  name() {
    const full = d => Math.floor((Math.abs(d) + 50) / 360), f = full(this.flip), s = full(this.side), t = Math.round(Math.abs(this.twist) / 180) * 180;
    const parts = [];
    const mult = n => MULT[n] ?? `${n}× `;
    if (f) parts.push(mult(f) + (this.flip < 0 ? 'Backflip' : 'Frontflip'));
    if (s) parts.push(mult(s) + (this.side > 0 ? 'Sideflip der.' : 'Sideflip izq.'));
    if (t) parts.push(`${parts.length ? '' : 'Giro '}${t}°`);
    return parts.join(' + ') || 'Salto';
  }
  get isTrick() { return this.name() !== 'Salto'; }
}
