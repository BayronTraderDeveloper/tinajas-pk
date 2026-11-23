// Formas de conectar una sala: directa entre jugadores por internet (WebRTC, sin servidor propio; por defecto),
// Supabase Realtime (si se configura) o pestañas del mismo navegador (?red=pestanas, para probar sin internet).
import { SUPABASE, online } from './config.js';
export async function openTransport(code, me, on) { const q = new URLSearchParams(globalThis.location?.search || ''); return q.get('red') === 'pestanas' ? tabs(code, me, on) : online() ? supabase(code, me, on) : p2p(code, me, on); }
// Directa: los relés públicos solo sirven para presentarse; los datos de la partida van de jugador a jugador, cifrados
async function p2p(code, me, on) {
  const { joinRoom } = await import('trystero'); const room = joinRoom({ appId: 'tinajas-pk-v1' }, code), who = new Map();
  const [hello, getHello] = act(room, 'hola'), [msg, getMsg] = act(room, 'm'), emit = () => on.peers([me, ...who.values()]);
  const join = id => hello(me, { target: id }), left = id => { who.delete(id); emit(); };
  if (typeof room.onPeerJoin === 'function' && room.onPeerJoin.length) { room.onPeerJoin(join); room.onPeerLeave(left); } else { room.onPeerJoin = join; room.onPeerLeave = left; }
  getHello((d, id) => { if (d && typeof d === 'object' && typeof d.id === 'string') { const isNew = !who.has(id); who.set(id, d); if (isNew) hello(me, { target: id }); emit(); } });
  getMsg(d => on.message(d)); setTimeout(emit, 50); on.state?.(true);
  return { kind: 'internet', send: m => msg(m), close: () => room.leave() };
}
// Trystero cambió su API entre versiones: acepta las dos formas
function act(room, id) {
  const a = room.makeAction(id); if (Array.isArray(a)) return [(d, o) => a[0](d, o?.target ?? null), f => a[1]((d, p) => f(d, p))];
  return [(d, o) => a.send(d, o), f => { a.onMessage = (d, m) => f(d, m?.peerId ?? m); }];
}
let client = null;
async function supabase(code, me, on) {
  if (!client) { const { createClient } = await import('@supabase/supabase-js'); client = createClient(SUPABASE.url, SUPABASE.key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { params: { eventsPerSecond: 20 } } }); }
  const ch = client.channel('tinajas:' + code, { config: { broadcast: { self: false, ack: false }, presence: { key: me.id } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => on.message(payload));
  ch.on('presence', { event: 'sync' }, () => { const st = ch.presenceState(); on.peers(Object.entries(st).map(([id, l]) => ({ ...l.at(-1), id }))); });
  await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('El servidor no responde')), 9000); ch.subscribe(s => { if (s === 'SUBSCRIBED') { clearTimeout(t); ch.track(me); ok(); on.state?.(true); } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); on.state?.(false); no(new Error('No se pudo conectar')); } else if (s === 'CLOSED') on.state?.(false); }); }).catch(e => { client.removeChannel(ch); throw e; });
  return { kind: 'internet', send: m => ch.send({ type: 'broadcast', event: 'm', payload: m }), close: () => client.removeChannel(ch) };
}
async function tabs(code, me, on) {
  const bc = new BroadcastChannel('tinajas-' + code), seen = new Map([[me.id, { me, t: Infinity }]]), emit = () => on.peers([...seen.values()].map(s => s.me));
  bc.onmessage = ({ data: d }) => { if (d?.hello) { const isNew = !seen.has(d.hello.id); seen.set(d.hello.id, { me: d.hello, t: performance.now() }); if (isNew) { bc.postMessage({ hello: me }); emit(); } } else if (d?.bye) { seen.delete(d.bye); emit(); } else if (d?.m) on.message(d.m); };
  const beat = setInterval(() => { bc.postMessage({ hello: me }); let ch = false; for (const [k, s] of seen) if (performance.now() - s.t > 6000) { seen.delete(k); ch = true; } if (ch) emit(); }, 1000);
  const bye = () => bc.postMessage({ bye: me.id }); addEventListener('pagehide', bye); bc.postMessage({ hello: me }); setTimeout(emit, 60);
  return { kind: 'pestañas', send: m => bc.postMessage({ m }), close: () => { bye(); clearInterval(beat); removeEventListener('pagehide', bye); bc.close(); } };
}
