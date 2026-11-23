// Datos compartidos sin servidor propio: niveles de la comunidad, clasificaciones y salas públicas, guardados en relés
// públicos de Nostr. Cada jugador firma lo suyo con una clave que se crea sola en su navegador (sin cuentas).
import { sanitize } from '../core/levels.js';
import { cleanName } from './room.js';
const DEV = new URLSearchParams(globalThis.location?.search || '').get('rele');   // pruebas: ?rele=ws://localhost:7777
export const RELAYS = DEV && /^ws:\/\/localhost:\d+$/.test(DEV) ? [DEV] : ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.nostr.band'];
const KIND = 30078, APP = 'tinajas-pk';
let lib = null, pool = null;
async function N() { if (!lib) { lib = await import('nostr-tools'); pool = new lib.SimplePool(); } return lib; }
function key() { let h = null; try { h = localStorage.getItem('tinajas.nkey.v1'); } catch { } if (!h || !/^[0-9a-f]{64}$/.test(h)) { const k = lib.generateSecretKey(); h = [...k].map(b => b.toString(16).padStart(2, '0')).join(''); try { localStorage.setItem('tinajas.nkey.v1', h); } catch { } } return Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16))); }
export async function me() { await N(); return lib.getPublicKey(key()); }
async function publish(d, tags, content, expire) {
  await N(); const t = Math.floor(Date.now() / 1000), ev = lib.finalizeEvent({ kind: KIND, created_at: t, tags: [['d', `${APP}:${d}`], ...tags, ...(expire ? [['expiration', String(t + expire)]] : [])], content: JSON.stringify(content) }, key());
  const r = await Promise.allSettled(pool.publish(RELAYS, ev)); if (!r.some(x => x.status === 'fulfilled')) throw new Error('No hay conexión con la red'); return ev;
}
async function query(filter, wait = 3500) { await N(); const list = await pool.querySync(RELAYS, filter, { maxWait: wait }); return list.filter(e => { try { return e.content.length < 120000 && lib.verifyEvent(e); } catch { return false; } }); }
const parse = e => { try { return JSON.parse(e.content); } catch { return null; } };
const txt = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
// ── Niveles de la comunidad ──
export async function publishLevel(level, author) { const l = sanitize(level); await publish(`level:${l.id}`, [['t', `${APP}-level`], ['title', l.name]], { level: l, author: cleanName(author) }); return `${await me()}:${l.id}`; }
export async function listLevels() {
  const evs = await query({ kinds: [KIND], '#t': [`${APP}-level`], limit: 150 }), seen = new Map();
  for (const e of evs) { const c = parse(e); if (!c?.level) continue; const l = sanitize(c.level), ckey = `${e.pubkey}:${l.id}`; const old = seen.get(ckey); if (!old || old.at < e.created_at) seen.set(ckey, { ckey, level: { ...l, id: 'c-' + e.pubkey.slice(0, 8) + '-' + l.id.slice(0, 20) }, author: cleanName(c.author), at: e.created_at, mine: e.pubkey === await me() }); }
  return [...seen.values()].sort((a, b) => b.at - a.at);
}
// ── Clasificación por nivel: solo quien cumplió el reto ──
export async function postScore(ckey, r, name) { const d = { name: cleanName(name), score: Math.round(r.score || 0), stars: r.stars | 0, time: Math.round((r.time || 0) * 100) / 100 }; const [pk] = ckey.split(':'); await publish(`score:${ckey}`, [['t', `${APP}-score`], ['l', ckey], ['p', pk]], d); return d; }
export async function board(ckey) {
  const evs = await query({ kinds: [KIND], '#l': [ckey], limit: 300 }), best = new Map();
  for (const e of evs) { const c = parse(e); if (!c) continue; const s = { name: cleanName(c.name), score: Math.max(0, Math.min(9999999, Math.round(+c.score || 0))), stars: Math.max(0, Math.min(3, c.stars | 0)), time: Math.max(0, Math.min(3600, +c.time || 0)), at: e.created_at, who: e.pubkey }; const o = best.get(e.pubkey); if (!o || s.score > o.score) best.set(e.pubkey, s); }
  return [...best.values()].sort((a, b) => b.score - a.score || a.time - b.time).slice(0, 50);
}
// ── Salas públicas: anuncio que caduca solo si el anfitrión se va ──
export async function announceRoom(info) { return publish(`room:${info.code}`, [['t', `${APP}-room`]], { code: txt(info.code, 8), level: txt(info.level, 40), mode: info.mode === '3d' ? '3d' : '2d', players: Math.max(1, Math.min(8, info.players | 0)), host: cleanName(info.host) }, 90); }
export async function closeRoom(code) { return publish(`room:${code}`, [['t', `${APP}-room`]], { closed: true }, 5).catch(() => { }); }
export async function listRooms() {
  const now = Math.floor(Date.now() / 1000), evs = await query({ kinds: [KIND], '#t': [`${APP}-room`], since: now - 120, limit: 80 }, 2500), rooms = new Map();
  for (const e of evs) { const c = parse(e), exp = +(e.tags.find(t => t[0] === 'expiration')?.[1] || 0); if (!c || c.closed || (exp && exp < now) || !/^[A-Z0-9]{3,8}$/.test(c.code || '')) continue; const o = rooms.get(c.code); if (!o || o.at < e.created_at) rooms.set(c.code, { code: c.code, level: txt(c.level, 40), mode: c.mode === '3d' ? '3d' : '2d', players: Math.max(1, Math.min(8, c.players | 0)), host: cleanName(c.host), at: e.created_at }); }
  return [...rooms.values()].sort((a, b) => b.at - a.at);
}
