// Cámara: de lado en 2D (escena 3D con poca perspectiva) y en tercera persona, libre, en 3D.
import * as THREE from 'three';
import { clamp, damp, wrapPi } from './core/mathx.js';
export const CAMS2 = ['Lateral', 'Lateral cercana', 'Lateral amplia'], CAMS3 = ['Tercera persona', 'Cercana', 'Amplia', 'De lado'];
const SET = [{ d: 11.5, fov: 24 }, { d: 7.2, fov: 24 }, { d: 18, fov: 24 }], SET3 = [5.4, 3.5, 9, 6.6];
export class Cam {
  constructor(camera, world) { this.c = camera; this.w = world; this.mode = 0; this.zoom = 1; this.f = new THREE.Vector3(); this.d = 11.5; this.init = false; this.look = 0; this.yaw = 0; this.pitch = .24; this.manual = 0; }
  get list() { return this.w.plane ? CAMS2 : CAMS3; }
  get name() { return this.list[this.mode % this.list.length]; }
  setWorld(w, yaw = 0) { if (!!w.plane !== !!this.w.plane) this.mode = 0; this.w = w; this.init = false; this.zoom = 1; this.yaw = yaw; this.pitch = .24; this.look = 0; this.manual = 0; }
  next() { this.mode = (this.mode + 1) % this.list.length; return this.name; }
  fov(v) { if (Math.abs(this.c.fov - v) > .05) { this.c.fov = v; this.c.updateProjectionMatrix(); } }
  update(dt, a, look, zoom, rdt, box, aim) { this.zoom = clamp(this.zoom * (1 + zoom * .06), .55, 1.8); return this.w.plane ? aim ? this.updateAim(a, rdt, aim) : this.update2(a, rdt, box) : this.update3(a, look, rdt); }
  update3(a, look, rdt) {
    const moved = Math.abs(look.x) + Math.abs(look.y) > .5, side = this.mode === 3; this.manual = moved ? 1.6 : Math.max(0, this.manual - rdt);
    this.yaw = wrapPi(this.yaw - look.x * .0052); this.pitch = clamp(this.pitch + look.y * .004, -.12, 1.25);
    if (this.manual <= 0 && a.state === 'ground') { // se coloca detrás (o al lado) con calma, sin dar la vuelta si corre hacia la cámara
      const v = a.speed, want = side ? a.yaw + Math.PI / 2 : Math.atan2(a.velH.x, a.velH.z); let d = wrapPi(want - this.yaw); if (side && Math.abs(d) > Math.PI / 2) d = wrapPi(d + Math.PI);
      if (side ? a.speed > .6 || this.settle : v > 1.2 && Math.abs(d) < 2.3) this.yaw = wrapPi(this.yaw + d * (1 - Math.exp(-(side ? 2.2 : .55 + v * .14) * rdt)));
    }
    const air = a.state === 'air', tx = a.com.x, ty = a.com.y + .28, tz = a.com.z; if (!this.init) { this.f.set(tx, ty, tz); this.init = true; this.d = SET3[this.mode]; }
    const k = air ? 16 : 11; this.f.x = damp(this.f.x, tx, k, rdt); this.f.y = damp(this.f.y, ty, air ? 8 : 6, rdt); this.f.z = damp(this.f.z, tz, k, rdt);
    const p = side ? Math.min(this.pitch, .2) : this.pitch, dir = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(p), Math.sin(p), -Math.cos(this.yaw) * Math.cos(p)), want = SET3[this.mode] * this.zoom + (air ? .6 : 0);
    const free = Math.max(1.1, this.w.ray(this.f, dir, want)); this.d = free < this.d ? damp(this.d, free, 18, rdt) : damp(this.d, free, 3, rdt);
    this.c.position.copy(this.f).addScaledVector(dir, this.d); this.c.position.y = Math.max(this.c.position.y, .25); this.c.lookAt(this.f); this.fov(46);
  }
  // Niveles de objetivos: encuadra a la vez al atleta y el punto donde debe caer
  updateAim(a, rdt, z) {
    const S = SET[this.mode], asp = this.c.aspect, tan = Math.tan(S.fov * Math.PI / 360), lo = Math.min(a.com.x - 1.6, z.x - z.w / 2 - .6), hi = Math.max(a.com.x + 1.6, z.x + z.w / 2 + .6), gy = Math.min(z.y, this.spotY ?? 0), top = Math.max(a.com.y + 1.2, z.y + 2, (this.spotY ?? 0) + 3), bot = Math.max(gy - .7, -1);
    const full = Math.max(S.d * .82 * this.zoom, (hi - lo) / 2 / (tan * asp) * 1.06 * Math.max(1, this.zoom), (top - bot) / 2 / tan * 1.32);
    // alturas grandes: plano general mientras espera y, al saltar, sigue de cerca al atleta
    const busy = a.state === 'air' || a.state === 'ragdoll' || a.state === 'takeoff' || a.charging || a.state === 'vault', cap = (busy ? 17 : 34) * Math.max(1, this.zoom), d = Math.min(full, cap), k = full > cap ? clamp((full - cap) / (full * .5), 0, 1) : 0, hh = d * tan, hw = hh * asp, mx = (lo + hi) / 2, my = (top + bot) / 2, tx = clamp(mx, a.com.x - hw * .6, a.com.x + hw * .6), ty = clamp(my, a.com.y - hh * (busy ? .25 : .6), a.com.y + hh * .45) - .12 * d * tan * (1 - k);
    if (!this.init) { this.f.set(tx, ty, 0); this.d = d; this.init = true; } const q = busy && k > 0 ? 9 : 4; this.f.x = damp(this.f.x, tx, q, rdt); this.f.y = damp(this.f.y, ty, q, rdt); this.d = damp(this.d, d, d > this.d ? 5 : k > 0 ? 3.2 : 1.6, rdt);
    this.c.position.set(this.f.x, this.f.y + this.d * .06, this.d); this.c.lookAt(this.f.x, this.f.y, 0); this.fov(S.fov);
  }
  update2(a, rdt, box) {
    const S = SET[this.mode], air = a.state === 'air';
    // se adelanta un poco hacia donde va; en vertical sigue la altura con suavidad
    this.look = damp(this.look, clamp(a.vel.x * .22, -1.3, 1.3), 2.2, rdt);
    const g = this.w.ground(a.com.x, 0, a.com.y), gy = g ? g.y : 0, hold = this.boxT = box ? .9 : Math.max(0, (this.boxT || 0) - rdt), bx = box ? (this.box = box) : hold > 0 && a.state !== 'air' ? this.box : null,
      tx = bx ? a.com.x + (bx.c.x - a.com.x) * .5 : a.com.x + this.look, ty = Math.max(1.15, gy + .95) * .45 + Math.max(-.5, a.com.y) * .55;
    if (!this.init) { this.f.set(tx, ty, 0); this.d = S.d; this.init = true; }
    this.f.x = damp(this.f.x, tx, air ? 9 : bx ? 4.5 : 7, rdt); this.f.y = damp(this.f.y, ty, air ? 7 : 5, rdt);
    const need = bx ? (Math.abs(bx.c.x - a.com.x) * .5 + bx.h.x + 1.1) / (Math.tan(S.fov * Math.PI / 360) * this.c.aspect) : 0; let d = Math.max(S.d * this.zoom, Math.min(need, S.d * 1.7)) + (air ? clamp(a.com.y - gy - 2, 0, 5) * .75 : 0); this.d = damp(this.d, d, bx ? 4 : 2.6, rdt);
    const half = Math.tan(S.fov * Math.PI / 360) * this.d * this.c.aspect, lo = this.w.x0 + half - .6, hi = this.w.x1 - half + .6, x = lo < hi ? clamp(this.f.x, lo, hi) : this.f.x;
    this.c.position.set(x, this.f.y + this.d * .075, this.d); this.c.lookAt(x, this.f.y + .1, 0); this.fov(S.fov);
  }
}
