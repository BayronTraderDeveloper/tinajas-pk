// Habilidades desbloqueables. De momento todas vienen dadas; unlock/lock quedan listos para la progresión.
import { VAULTS } from './vaults.js';
const KEY = 'tinajas.abilities.v1', GIVEN = Object.keys(VAULTS);
export class Abilities {
  constructor(store = globalThis.localStorage) { this.store = store; this.set = new Set(GIVEN); try { const s = JSON.parse(store?.getItem(KEY)); if (Array.isArray(s)) this.set = new Set(s.filter(x => x in VAULTS)); } catch { } }
  has(id) { return this.set.has(id); }
  unlock(id) { if (id in VAULTS) { this.set.add(id); this.save(); } }
  lock(id) { this.set.delete(id); this.save(); }
  save() { try { this.store?.setItem(KEY, JSON.stringify([...this.set])); } catch { } }
}
