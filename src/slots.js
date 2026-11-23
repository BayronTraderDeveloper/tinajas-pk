// Seis ranuras de truco: teclas fijas Q W E A S D, con el truco que el jugador elija.
export const SLOT_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyA', 'KeyS', 'KeyD'];
export const TRICKS = { flipB: 'Backflip', flipF: 'Frontflip', sideL: 'Sideflip izquierda', sideR: 'Sideflip derecha', twL: 'Twist izquierda', twR: 'Twist derecha', tuck: 'Agrupado', pike: 'Carpa',
  jstep: 'J-step', cork: 'Cork', btwist: 'B-twist', raiz: 'Raiz', gainer: 'Gainer', webster: 'Webster', flash: 'Flash kick', aerial: 'Aerial', arabian: 'Arabian', barani: 'Barani' };
export const DEFAULT_SLOTS = ['flipB', 'flipF', 'sideL', 'sideR', 'twL', 'twR'];
const KEY = 'tinajas.slots.v1';
export class Slots {
  constructor(store = globalThis.localStorage) {
    this.store = store; this.list = [...DEFAULT_SLOTS];
    try { const s = JSON.parse(store?.getItem(KEY)); if (Array.isArray(s) && s.length === 6) this.list = s.map((t, i) => (t in TRICKS && s.indexOf(t) === i ? t : null)); } catch { }
  }
  // Un truco solo puede estar en una tecla: si ya estaba en otra, se intercambian
  assign(i, id) { const j = id ? this.list.indexOf(id) : -1; if (j >= 0 && j !== i) this.list[j] = this.list[i]; this.list[i] = id; this.save(); }
  reset() { this.list = [...DEFAULT_SLOTS]; this.save(); }
  save() { try { this.store?.setItem(KEY, JSON.stringify(this.list)); } catch { } }
}
// Una línea por truco, para el menú
export const ABOUT = { flipB: 'Mortal atrás', flipF: 'Mortal adelante', sideL: 'Mortal lateral', sideR: 'Mortal lateral',  tuck: 'Postura', pike: 'Postura', jstep: 'Salto en curva, con más giro (en el suelo)', cork: 'Mantén: cork, doble o triple cork', btwist: 'Mantén: B-twist o doble B-twist', twL: 'Sin Espacio: giro vertical', twR: 'Sin Espacio: giro vertical', raiz: 'Giro tumbado con patada arriba', gainer: 'Mortal atrás que avanza', webster: 'Mortal adelante a una pierna', flash: 'Mortal estirado con patada', aerial: 'Rueda sin manos', arabian: 'Media vuelta y mortal adelante', barani: 'Mortal adelante con medio giro' };
