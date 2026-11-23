// Mundo de colisión: cajas con giro en Y + superficies físicas.
import { V, clamp } from './mathx.js';
import { SURFACES } from './tuning.js';
export class World {
  constructor() { this.boxes = []; this.tramps = []; this.time = 0; this.movers = []; this.fans = []; }
  // ── Piezas vivas ──
  // Desplazamiento de una pieza que se mueve, en el instante t
  offset(it, t = this.time, out = { x: 0, y: 0, z: 0 }) {
    out.x = out.y = out.z = 0; if (it.t === 'swing') { const L = it.h, a = (it.md || 50) * Math.PI / 180 * Math.sin(2 * Math.PI * (t / (it.mp || 2.6) + (it.mf || 0))); out.x = L * Math.sin(a); out.y = L * (1 - Math.cos(a)); return out; }
    if (!it.md || !it.ma) return out; out[it.ma] = it.md * Math.sin(2 * Math.PI * (t / (it.mp || 4) + (it.mf || 0))); return out;
  }
  live(it) { const o = this.offset(it); return { x: it.x + o.x, y: it.y + o.y, z: (it.z || 0) + o.z }; }
  step(dt) {
    this.time += dt; if (!this.movers.length && !this.fragile) return; const o = {};
    for (const b of this.movers) { this.offset(b.item, this.time, o); const x = b.c0.x + o.x, y = b.c0.y + o.y, z = b.c0.z + o.z; b.v.set((x - b.c.x) / dt, (y - b.c.y) / dt, (z - b.c.z) / dt); b.c.set(x, y, z); b.top = y + b.h.y; }
    if (this.fragile) for (const b of this.fragile) { if (b.off) { b.back -= dt; if (b.back <= 0) { b.off = false; b.left = b.item.fr; } } else if (b.touched) { b.left -= dt; if (b.left <= 0) { b.off = true; b.back = 3; b.touched = false; } } }
  }
  restore() { if (this.fragile) for (const b of this.fragile) { b.off = false; b.touched = false; b.left = b.item.fr; } }
  // Viento en un punto
  wind(p, out) { out.set(0, 0, 0); for (const f of this.fans) { const c = this.live(f); if (Math.abs(p.x - c.x) < f.w / 2 && p.y > c.y && p.y < c.y + f.h && (this.plane || Math.abs(p.z - c.z) < f.d / 2)) { const k = f.md2 ?? 12; if (f.dir === 'l') out.x -= k; else if (f.dir === 'r') out.x += k; else out.y += k * (1 - .35 * (p.y - c.y) / f.h); } } return out; }
  box(c, size, surface = 'floor', opt = {}) {
    const yaw = opt.yaw || 0;
    const b = { c: V(...c), h: V(size[0] / 2, size[1] / 2, size[2] / 2), yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), surface, surf: SURFACES[surface], ...opt };
    b.top = b.c.y + b.h.y; this.boxes.push(b); return b;
  }
  // Trampolín: membrana elástica rectangular a una altura, con foso libre debajo
  tramp(x, z, w, d, y) { const t = { x, z, hw: w / 2, hd: d / 2, y, surf: SURFACES.tramp, depth: 0, cx: x, cz: z }; this.tramps.push(t); return t; }
  local(b, x, z) { const dx = x - b.c.x, dz = z - b.c.z; return [dx * b.cos - dz * b.sin, dx * b.sin + dz * b.cos]; }
  trampAt(x, z) { return this.tramps.find(t => Math.abs(x - t.x) < t.hw && Math.abs(z - t.z) < t.hd) || null; }
  // Superficie más alta bajo (x,z) que no supere yMax
  ground(x, z, yMax = Infinity, r = 0) {
    let best = null;
    for (const b of this.boxes) {
      if (b.off || b.noStand || b.top > yMax) continue;
      const [lx, lz] = this.local(b, x, z);
      if (Math.abs(lx) <= b.h.x + r && Math.abs(lz) <= b.h.z + r && (!best || b.top > best.y)) best = { y: b.top, surf: b.surf, name: b.surface, box: b };
    }
    const t = this.trampAt(x, z);
    if (t && t.y <= yMax && (!best || t.y > best.y)) best = { y: t.y, surf: t.surf, name: 'tramp', tramp: t };
    return best;
  }
  // Esfera contra cajas: devuelve el contacto más profundo
  sphere(p, r, minTop = -Infinity) {
    let best = null;
    for (const b of this.boxes) {
      if (b.off || b.top < minTop) continue;
      const dy = p.y - b.c.y; if (Math.abs(dy) > b.h.y + r) continue;
      const [lx, lz] = this.local(b, p.x, p.z);
      if (Math.abs(lx) > b.h.x + r || Math.abs(lz) > b.h.z + r) continue;
      const qx = clamp(lx, -b.h.x, b.h.x), qy = clamp(dy, -b.h.y, b.h.y), qz = clamp(lz, -b.h.z, b.h.z);
      let nx = lx - qx, ny = dy - qy, nz = lz - qz, d = Math.hypot(nx, ny, nz), depth;
      if (d > 1e-9) { if (d >= r) continue; depth = r - d; nx /= d; ny /= d; nz /= d; }
      else { // centro dentro: salir por la cara más cercana
        const fx = b.h.x - Math.abs(lx), fy = b.h.y - Math.abs(dy), fz = b.h.z - Math.abs(lz);
        nx = ny = nz = 0;
        if (fy <= fx && fy <= fz) { ny = Math.sign(dy) || 1; depth = fy + r; }
        else if (fx <= fz) { nx = Math.sign(lx) || 1; depth = fx + r; }
        else { nz = Math.sign(lz) || 1; depth = fz + r; }
      }
      if (!best || depth > best.depth) best = { depth, n: V(nx * b.cos + nz * b.sin, ny, -nx * b.sin + nz * b.cos), surf: b.surf, name: b.surface, box: b };
    }
    return best;
  }
  ray(o, d, max) { // marcha simple para la cámara
    const p = V(); for (let t = 0.3; t < max; t += 0.12) { p.copy(o).addScaledVector(d, t); for (const b of this.boxes) { if (b.noCam || b.off) continue; const [lx, lz] = this.local(b, p.x, p.z); if (Math.abs(lx) < b.h.x + .1 && Math.abs(lz) < b.h.z + .1 && Math.abs(p.y - b.c.y) < b.h.y + .1) return t - 0.15; } }
    return max;
  }
}
