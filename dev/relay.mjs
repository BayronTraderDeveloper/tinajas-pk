// Relé Nostr mínimo, en memoria, solo para probar sin publicar nada en la red pública: node dev/relay.mjs [puerto]
import http from 'node:http'; import crypto from 'node:crypto'; import { matchFilter, verifyEvent } from 'nostr-tools';
const port = +process.argv[2] || 7777, events = [];
const frame = s => { const p = Buffer.from(s), n = p.length, h = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255])]); return Buffer.concat([h, p]); };
const server = http.createServer((q, r) => { r.writeHead(200); r.end('relé de pruebas'); });
server.on('upgrade', (req, sock) => {
  const acc = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`);
  let buf = Buffer.alloc(0); const send = m => { try { sock.write(frame(JSON.stringify(m))); } catch { } };
  sock.on('data', d => { buf = Buffer.concat([buf, d]); for (;;) { if (buf.length < 2) return; const op = buf[0] & 15; let len = buf[1] & 127, off = 2; if (len === 126) { len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; } const mask = buf.slice(off, off + 4); off += 4; if (buf.length < off + len) return; const pl = Buffer.from(buf.slice(off, off + len)).map((b, i) => b ^ mask[i % 4]); buf = buf.slice(off + len); if (op === 8) { sock.end(); return; } if (op !== 1) continue; let m; try { m = JSON.parse(pl.toString()); } catch { continue; }
    if (m[0] === 'EVENT') { const e = m[1], ok = verifyEvent(e); if (ok) { const d = e.tags.find(t => t[0] === 'd')?.[1]; for (let i = events.length - 1; i >= 0; i--) if (events[i].kind === e.kind && events[i].pubkey === e.pubkey && events[i].tags.find(t => t[0] === 'd')?.[1] === d) events.splice(i, 1); events.push(e); } send(['OK', e.id, ok, ok ? '' : 'invalid']); }
    else if (m[0] === 'REQ') { const [, id, ...fs] = m; const now = Date.now() / 1000; for (const e of events) { const exp = +(e.tags.find(t => t[0] === 'expiration')?.[1] || 0); if (exp && exp < now) continue; if (fs.some(f => matchFilter(f, e))) send(['EVENT', id, e]); } send(['EOSE', id]); }
    else if (m[0] === 'CLOSE') send(['CLOSED', m[1], '']); } });
  sock.on('error', () => { });
});
server.listen(port, () => console.log('relé de pruebas en ws://localhost:' + port));
