import { SLOT_KEYS } from './slots.js';
export const ACTIONS = [
  ['left', 'Izquierda', 'ArrowLeft'], ['right', 'Derecha', 'ArrowRight'], ['up', 'Adelante (3D)', 'ArrowUp'], ['down', 'Atrás (3D)', 'ArrowDown'], ['run', 'Correr', 'ShiftLeft'], ['jump', 'Saltar (mantener = más alto)', 'Space'],
  ['cam', 'Cambiar cámara', 'KeyV'], ['slow', 'Cámara lenta', 'KeyT'], ['reset', 'Reiniciar', 'KeyG'], ['panel', 'Panel de físicas', 'KeyP'],
];
const KEY = 'tinajas.binds.v2';
export const keyName = c => ({ Space: 'Espacio', ShiftLeft: 'Shift', ShiftRight: 'Shift der.', ControlLeft: 'Ctrl', ControlRight: 'Ctrl der.', Escape: 'Esc', Tab: 'Tab', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', AltLeft: 'Alt' }[c] || c.replace(/^Key|^Digit/, ''));
export class Input {
  constructor(el) {
    this.el = el; this.down = new Set(); this.hits = new Set(); this.look = { x: 0, y: 0 }; this.virtual = new Set(); this.padHeld = new Set(); this.zoom = 0; this.capture = null; this.enabled = true; this.padUsed = false; this.padPrev = [];
    this.binds = Object.fromEntries(ACTIONS.map(a => [a[0], a[2]])); try { Object.assign(this.binds, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { }
    addEventListener('keydown', e => {
      if (this.capture) { e.preventDefault(); const k = this.capture; this.capture = null; if (e.code !== 'Escape' && !SLOT_KEYS.includes(e.code)) { for (const a in this.binds) if (this.binds[a] === e.code) this.binds[a] = this.binds[k]; this.binds[k] = e.code; localStorage.setItem(KEY, JSON.stringify(this.binds)); } this.onBind?.(); return; }
      if (e.metaKey || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' && !['range', 'checkbox'].includes(e.target.type)) return;
      if (e.code === 'Escape' && !e.repeat) this.onEsc?.();
      if (this.onKey?.(e.code, e)) { e.preventDefault(); return; }
      if (Object.values(this.binds).includes(e.code) || SLOT_KEYS.includes(e.code) || e.code.startsWith('Arrow') || e.code.startsWith('Digit')) e.preventDefault();
      if (!e.repeat) { this.down.add(e.code); this.hits.add(e.code); this.padUsed = false; }
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.virtual.clear(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    // arrastrar con el ratón gira la cámara en 3D
    let drag = null; el.addEventListener('pointerdown', e => { if (this.lookOn) { drag = [e.clientX, e.clientY]; try { el.setPointerCapture(e.pointerId); } catch { } } });
    el.addEventListener('pointermove', e => { if (drag && this.lookOn) { this.look.x += e.clientX - drag[0]; this.look.y += e.clientY - drag[1]; drag = [e.clientX, e.clientY]; } });
    for (const t of ['pointerup', 'pointercancel']) el.addEventListener(t, () => drag = null);
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom += Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 40); }, { passive: false });
  }
  is(a) { return this.down.has(this.binds[a]) || this.virtual.has(a) || this.padHeld.has(a) || (a === 'run' && this.down.has('ShiftRight')); }
  slot(i) { return this.down.has(SLOT_KEYS[i]) || this.virtual.has('s' + i) || this.padHeld.has('s' + i); }
  slotHit(i) { return this.hits.has(SLOT_KEYS[i]) || this.hits.has('s' + i); }
  hit(a) { return this.hits.has(this.binds[a]) || this.padHits?.has(a); }
  pad(dt) {
    const p = [...(navigator.getGamepads?.() || [])].find(x => x && x.connected); this.padHits = new Set(); this.padHeld.clear(); if (!p) return null;
    const dz = v => Math.abs(v) < .16 ? 0 : (v - Math.sign(v) * .16) / .84, b = i => p.buttons[i]?.value || 0, pr = i => p.buttons[i]?.pressed;
    const edge = (i, a) => { if (pr(i) && !this.padPrev[i]) this.padHits.add(a); this.padPrev[i] = pr(i); };
    edge(8, 'cam'); if (pr(9) && !this.padPrev[9]) this.onEsc?.(); this.padPrev[9] = pr(9); edge(12, 'reset'); edge(14, 'slow'); edge(15, 'panel'); edge(13, 'ability'); [0, 3, 1, 2, 4, 5].forEach((i, n) => { if (pr(i)) { this.padHeld.add('s' + n); if (!this.slotPrev?.[n]) this.hits.add('s' + n); } (this.slotPrev ||= [])[n] = pr(i); });
    const o = { x: dz(p.axes[0]), y: -dz(p.axes[1]), lx: dz(p.axes[2]), ly: dz(p.axes[3]), jump: b(7) > .3, tuck: b(6), run: b(6) > .3 || pr(10) };
    if (Object.values(o).some(v => v)) this.padUsed = true; this.look.x += o.lx * 320 * dt; if (this.lookOn) this.look.y -= o.ly * 220 * dt; else this.zoom += o.ly * 12 * dt; return o;
  }
  // Estado para la física: izquierda/derecha es el eje X. Los trucos no entran aquí: los gestiona AirControl en el aire.
  read(dt, cam3 = null) {
    const p = this.pad(dt); let x = (this.is('right') ? 1 : 0) - (this.is('left') ? 1 : 0), y = (this.is('up') ? 1 : 0) - (this.is('down') ? 1 : 0), jump = this.is('jump'), run = this.is('run');
    if (p) { x += p.x; y += p.y; jump ||= p.jump; run ||= p.run; }
    if (cam3 !== null) { // en 3D las flechas van respecto a la cámara
      const l = Math.max(1, Math.hypot(x, y)), s = Math.sin(cam3), c = Math.cos(cam3); x /= l; y /= l;
      return { mx: s * y - c * x, mz: c * y + s * x, back: false, camYaw: cam3, run, jump, flip: 0, side: 0, twist: 0, tuck: 0, pike: 0 };
    }
    return { mx: Math.max(-1, Math.min(1, x)), mz: 0, back: false, camYaw: 0, run, jump, flip: 0, side: 0, twist: 0, tuck: 0, pike: 0 };
  }
  flush() { this.hits.clear(); this.look.x = this.look.y = 0; this.zoom = 0; }
}
