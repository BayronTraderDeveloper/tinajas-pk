// Sala: quién está, sus posturas interpoladas, el nivel compartido y los avisos. Todo lo que llega se valida.
import { pack, toB64, fromB64 } from './codec.js';
import { openTransport } from './transport.js';
import { sanitize } from '../core/levels.js';
import { LAB } from '../core/maps.js';
import { cleanLook } from '../core/characters.js';
export const COLORS = ['#e9ecef', '#f2b84b', '#63b3e4', '#8fd694', '#e58fb5', '#b39ddb', '#ef8a62', '#5cc9b8'], MAX = 8, HZ = 20;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => ABC[b % ABC.length]).join('');
export const newCode = () => rid(5), cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const cleanName = s => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Atleta';
const fin = (v, lo, hi) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
export class Room {
  constructor(code, me, cb, open = openTransport) { this.code = code; this.cb = cb; this.open = open; this.me = { id: rid(10), name: cleanName(me.name), color: me.color | 0, at: Date.now(), look: cleanLook(me.look) }; this.peers = new Map(); this.buf = []; this.acc = 0; this.sent = 0; this.idle = 0; this.level = null; this.board = new Map(); this.budget = new Map(); }
  async join(level) { this.level = level; this.creator = !!level; this.tr = await this.open(this.code, this.me, { message: m => this.message(m), peers: l => this.onPeers(l), state: ok => this.cb.state?.(ok) }); if (!level) this.ask(); return this; }
  ask() { if (this.level || this.closed) return; this.send('ask', {}); this.askT = setTimeout(() => this.ask(), 900); }
  send(k, d) { this.tr?.send({ k, f: this.me.id, ...d }); }
  // Anfitrión: quien lleva más tiempo en la sala
  get host() { let h = this.me; for (const p of this.peers.values()) if (p.at < h.at || (p.at === h.at && p.id < h.id)) h = p; return h.id; }
  get isHost() { return this.host === this.me.id; }
  onPeers(list) {
    const ids = new Set();
    for (const p of list) { if (!p || typeof p.id !== 'string' || p.id === this.me.id || p.id.length > 24 || ids.size >= MAX - 1) continue; ids.add(p.id); if (!this.peers.has(p.id)) { const q = { id: p.id, name: cleanName(p.name), look: cleanLook(p.look), color: Math.abs(p.color | 0) % COLORS.length, at: Number.isFinite(p.at) ? p.at : Date.now(), snaps: [], off: null, delay: 250 }; this.peers.set(p.id, q); this.cb.join?.(q); } }
    for (const id of [...this.peers.keys()]) if (!ids.has(id)) { const q = this.peers.get(id); this.peers.delete(id); this.board.delete(id); this.cb.leave?.(q); }
    this.cb.change?.();
  }
  allow(id, now) { const b = this.budget.get(id) || { t: now, n: 0 }; if (now - b.t > 1000) { b.t = now; b.n = 0; } b.n++; this.budget.set(id, b); return b.n <= 40; }
  message(m, now = performance.now()) {
    if (this.closed || !m || typeof m !== 'object' || typeof m.f !== 'string' || m.f === this.me.id) return; const p = this.peers.get(m.f); if (!p || !this.allow(m.f, now)) return;
    if (m.k === 's') this.onState(p, m, now);
    else if (m.k === 'ask') { if (this.level && (this.isHost || this.creator)) this.send('level', { level: this.level, ckey: this.level?._ckey }); }
    else if (m.k === 'level') { if (m.f !== this.host && this.level) return; const l = m.level?.id === 'lab' ? LAB : { ...sanitize(m.level), ...(typeof m.ckey === 'string' && /^[0-9a-f]{64}:[\w-]{1,40}$/.test(m.ckey) ? { _ckey: m.ckey } : {}) }; this.level = l; this.zero(); clearTimeout(this.askT); this.cb.level?.(l, p); }
    else if (m.k === 'land') { const lvl = fin(m.lvl, 0, 5); if (lvl !== null) this.cb.feed?.(p, String(m.name || '').replace(/[<>]/g, '').slice(0, 60), lvl); }
    else if (m.k === 'pts') { const n = fin(m.n, 0, 9999999); if (n !== null) { p.pts = n; this.cb.change?.(); } }
    else if (m.k === 'fin') { const t = fin(m.time, 0, 3600), s = fin(m.stars, 1, 3); if (t !== null && s !== null) { this.record(p.id, p.name, t, s, fin(m.score, 0, 9999999) || 0); this.cb.finish?.(p, t, s); } }
    else if (m.k === 'press') { const v = a => Array.isArray(a) && a.length === 3 && a.every(x => Number.isFinite(x) && Math.abs(x) < 2000) ? a : null, P = v(m.p), pr = Array.isArray(m.prints) ? m.prints.slice(0, 2).map(q => q && v(q.edge) && v(q.toe) ? { edge: q.edge, toe: q.toe } : null).filter(Boolean) : []; if (P) this.cb.press?.(p, { p: P, prints: pr }); }
    else if (m.k === 'race') { if (m.f === this.host) this.cb.race?.(p); }
  }
  record(id, name, time, stars, score = 0) { const b = this.board.get(id); if (!b || score > b.score || (score === b.score && time < b.time)) this.board.set(id, { name, time, stars, score }); }
  points(n) { this.me.pts = n; this.send('pts', { n: Math.round(n) }); }
  zero() { this.me.pts = 0; for (const p of this.peers.values()) p.pts = 0; this.board.clear(); }
  finish(r) { this.record(this.me.id, this.me.name, r.time, r.stars, r.score || 0); this.send('fin', { time: Math.round(r.time * 1000) / 1000, stars: r.stars, score: r.score || 0 }); }
  setLevel(l) { this.level = l; this.zero(); this.send('level', { level: l, ckey: l?._ckey }); }
  // Envío: pocas y grandes. Con más gente, menos mensajes por segundo (cuota del servidor).
  get rate() { const n = this.peers.size + 1; return Math.max(2, Math.min(6, 100 / (n * n))); }
  tick(dt, a, now = performance.now()) {
    if (!this.tr || !this.peers.size) { this.buf.length = 0; return; }
    const still = a.state === 'ground' && a.speed < .08 && !a.charging && a.balance <= 0; this.idle = still ? this.idle + dt : 0;
    if (this.idle > .6) { if (now - this.sent > 1000) { this.sent = now; this.buf = [pack(a)]; this.flush(now); } return; }
    this.acc += dt; if (this.acc < 1 / HZ) return; this.acc %= 1 / HZ; this.buf.push(pack(a)); if (this.buf.length >= Math.round(HZ / this.rate)) { this.sent = now; this.flush(now); }
  }
  flush(now) { this.send('s', { t: Math.round(now), d: 1000 / HZ, b: toB64(this.buf) }); this.buf = []; }
  onState(p, m, now) {
    const t = fin(m.t, 0, 1e12), d = fin(m.d, 10, 200), L = fromB64(m.b); if (t === null || d === null || !L.length) return;
    const off = now - t; p.off = p.off === null || Math.abs(off - p.off) > 3000 ? off : Math.min(off, p.off + (off - p.off) * .05); p.delay += (L.length * d + 90 - p.delay) * (L.length > 1 ? .3 : 0);
    L.forEach((s, i) => { s.t = t - (L.length - 1 - i) * d; if (!p.snaps.length || s.t > p.snaps.at(-1).t) p.snaps.push(s); }); if (p.snaps.length > 60) p.snaps.splice(0, p.snaps.length - 60);
  }
  // Postura de otro jugador ahora: interpolada entre dos muestras
  pose(p, now = performance.now()) {
    const S = p.snaps; if (!S.length || p.off === null) return null; const t = now - p.off - p.delay; while (S.length > 2 && S[1].t <= t) S.shift();
    const A = S[0], B = S[1]; if (!B || t <= A.t) return A; const span = B.t - A.t, far = A.p.distanceTo(B.p) > 5; if (far) return t >= B.t ? B : A;
    const u = Math.min(1, (t - Math.max(A.t, B.t - Math.min(span, 250))) / Math.min(span, 250)); if (u <= 0) return A;
    return { p: A.p.clone().lerp(B.p, u), q: A.q.clone().slerp(B.q, u), l: A.l.map((q, i) => q.clone().slerp(B.l[i], u)) };
  }
  leave() { this.closed = true; clearTimeout(this.askT); this.tr?.close(); this.tr = null; }
}
