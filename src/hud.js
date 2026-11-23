import { ACTIONS, keyName } from './input.js';
import { SLOT_KEYS, TRICKS, ABOUT } from './slots.js';
import { VAULTS, DECIDE } from './core/vaults.js';
import { DEFAULTS } from './core/tuning.js';
import { clamp, DEG, V } from './core/mathx.js';
import { taskText, wantText } from './core/run.js';
import { clock, esc } from './menu.js';
import { COLORS } from './net/room.js';
import { NAMES, LAND } from './core/score.js';
// Iconos dibujados mirando a la derecha; se voltean si el atleta mira a la izquierda
const A = (d, h) => `<path class="ar" d="${d}"/><path class="ah" d="${h}"/>`, F = d => `<path class="bd" d="${d}"/>`, HD = (x, y) => `<circle class="hd" cx="${x}" cy="${y}" r="4.2"/>`;
const ICON = {
  flipB: A('M39 30a16 16 0 1 0-8 9', 'M27 36l5 3.500-5 4') + HD(17, 26) + F('M20 29q7 5 10 1l-3-7 6-1'),
  flipF: A('M9 30a16 16 0 1 1 8 9', 'M21 36l-5 3.500 5 4') + HD(31, 26) + F('M28 29q-7 5-10 1l3-7-6-1'),
  sideL: A('M36 12q-13-9-24 4', 'M12 10v7h7') + HD(21, 22) + F('M22 26l3 10-8 8M25 36l8 5M23 29l-9 1M23 29l9-5'),
  sideR: A('M12 12q13-9 24 4', 'M36 10v7h-7') + HD(27, 22) + F('M26 26l-3 10 8 8M23 36l-8 5M25 29l9 1M25 29l-9-5'),
  twL: HD(24, 9) + F('M24 14v15l-3 15M24 29l3 15M24 18l-5 6 5 2M24 18l5 5') + A('M38 25c0 7-27 8-28 1', 'M8 31l2-7 6 4'),
  twR: HD(24, 9) + F('M24 14v15l-3 15M24 29l3 15M24 18l-5 6 5 2M24 18l5 5') + A('M10 25c0 7 27 8 28 1', 'M40 31l-2-7-6 4'),
  tuck: HD(20, 15) + F('M20 20q-5 9 1 15l12-9 1 12 5-1M21 23l11 6'),
  pike: HD(15, 17) + F('M16 22q-1 8 5 14l19-13M17 24l15 3'),
  jump: HD(24, 13) + F('M24 18v12l-5 7 3 7M24 30l5 7-3 7M24 21l-6-9M24 21l6-9') + A('M38 22V8', 'M33 13l5-6 5 6'),
};
Object.assign(ICON, {
  jstep: A('M8 40h20q12 0 12-14V14', 'M34 19l6-7 6 7') + HD(17, 13) + F('M17 18l1 10-6 8M18 28l9-3 5-4M17 20l-7 4M17 20l8-2'),
  cork: A('M12 38C2 24 12 8 26 8c12 0 18 10 14 20', 'M35 23l5 6 5-6') + HD(17, 27) + F('M20 25l11-5 8 1M22 24l-3-6M31 20l5 8'),
  btwist: A('M7 18q17-12 34 0', 'M41 11v7h-7') + HD(11, 27) + F('M15 27h14l10-5M29 27l10 5M19 27l-3 8M20 27l3 8') + A('M14 41q10 4 20 0', ''),
  raiz: A('M8 34q16 12 32 0', 'M8 41v-7h7') + HD(12, 22) + F('M16 22l13 2 4-15M29 24l10 4M19 23l-5 7M20 23l4 7'),
  gainer: A('M38 34a16 16 0 1 0-8 6', 'M24 34l5 6-6 4') + HD(16, 24) + F('M19 22l9-4 9-2M28 18l3 10M20 23l-5-7'),
  webster: A('M10 34a16 16 0 1 1 8 6', 'M24 34l-5 6 6 4') + HD(32, 25) + F('M29 23l-9-4-8 4M20 19l-1 11 7 2M28 24l5-8'),
  flash: A('M39 30a16 16 0 1 0-8 9', 'M27 36l5 3.500-5 4') + HD(16, 30) + F('M18 27l6-9 1-11M24 18l9 4 2 7M18 28l-7-4'),
  aerial: A('M9 20a15 15 0 0 1 30 0', 'M33 15l6 6 5-7') + HD(24, 38) + F('M24 33V23l-11-9M24 23l11-9M24 31l-10 2M24 31l10 2'),
  arabian: A('M39 30a16 16 0 1 0-8 9', 'M27 36l5 3.500-5 4') + HD(23, 20) + F('M23 24l3 9 6-4-6-6M23 25l-6 4') + A('M14 13q9-6 18 0', ''),
  barani: A('M9 30a16 16 0 1 1 8 9', 'M21 36l-5 3.500 5 4') + HD(24, 34) + F('M24 30V17l-3-8M24 17l4-8M24 27l-7 3M24 27l6 4') + A('M16 22q8 5 16 0', ''),
});
const BOX = (x, w) => `<path class="bx" d="M${x} 42V31h${w}v11"/>`;
ICON.kong = BOX(17, 14) + HD(36, 18) + F('M32 19q-7-3-11 2l8 5-6 3M31 20l-6 10') + A('M8 30Q14 10 26 9', 'M21 6l6 3-4 5');
ICON.dkong = BOX(7, 34) + HD(37, 19) + F('M33 20l-13-1-11 4M31 20l1 10M18 31l3-7') + A('M6 14q8-9 16-2 7-8 16-2', 'M33 6l6 4-5 5');
ICON.castaway = `<path class="bx" d="M40 43V20h-6v23"/>` + HD(26, 27) + F('M26 22l8-3M25 22l-9-4-9-5M16 18l-7 2') + A('M30 13a12 12 0 0 0-21-3', 'M8 4l1 6 6 0');
for (const [id, b, n] of [['dbtwist', 'btwist', 2], ['dcork', 'cork', 2], ['tcork', 'cork', 3]]) ICON[id] = ICON[b] + `<text x="44" y="46" text-anchor="end" class="nb">${n}</text>`;
export const svg = k => k ? `<svg viewBox="0 0 48 48">${ICON[k]}</svg>` : '<svg viewBox="0 0 48 48"><path class="no" d="M24 17v14M17 24h14"/></svg>';
const SHORT = { sideL: 'Side izq.', sideR: 'Side der.', twL: 'Twist izq.', twR: 'Twist der.' };
const el = (cls, html = '', p) => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; p.append(d); return d; };
const n = (v, d = 0) => (Object.is(Math.round(v * 10 ** d), -0) ? 0 : v).toFixed(d).replace('.', ',');
const col = l => l >= 4 ? '#8fd694' : l >= 2 ? '#f2c14e' : '#ef6a5a';
const SL = [['Salto', [['jumpMax', 'Salto máximo', 3, 9, .1, 'm/s'], ['gravity', 'Gravedad', 1.6, 15, .1, 'm/s²'], ['sprintSpeed', 'Velocidad de carrera', 4, 11, .1, 'm/s'], ['chargeTime', 'Tiempo de carga', .15, 1.2, .05, 's']]], ['Rotación', [['spinSpeed', 'Velocidad de giro', .6, 1.8, .05, '×'], ['airFlipTorque', 'Control de giro en el aire', 0, 160, 1, 'N·m'], ['airBrakeTorque', 'Freno de giro', 0, 200, 2, 'N·m'], ['airTwistTorque', 'Control de twist', 0, 80, 1, 'N·m'], ['airSteer', 'Corrección de trayectoria', 0, 5, .1, '']]], ['Aterrizaje', [['assist', 'Ayuda de enderezado', 0, 1, .05, ''], ['landingForgiveness', 'Tolerancia', .5, 2, .05, '×'], ['trampoline', 'Dureza del trampolín', .5, 1.8, .05, '×']]]];
export class HUD {
  constructor(root, api) {
    this.api = api; const I = api.input; el('shade', '', root);
    this.tl = el('tl', '<b class="ln"></b><span class="tm"></span><div class="ob"></div>', root); this.tr = el('tr', '', root);
    this.tc = el('tc', '<div class="n"></div><div class="g"></div>', root); this.card = el('card off', '', root);
    this.bars = el('bars', [['j', 'Impulso'], ['s', 'Velocidad'], ['r', 'Rotación']].map(([k, t]) => `<div class="bar ${k}"><span>${t}</span><i><u></u></i><em></em></div>`).join(''), root);
    this.help = el('help', '', root); this.air = el('air', '<div class="r"></div><canvas width="248" height="248"></canvas>', root);
    this.dock = el('dock', '', root); this.buildDock();
    this.lab = el('lab', '', root); this.toast = el('toast', '', root); this.vp = el('vp', '', root); this.menu = el('menu', '', root); this.roomEl = el('room', '', root); this.feedEl = el('feed', '', root); this.names = el('names', '', root); this.pts = el('pts', '<b>0</b><span></span>', root); this.chain = el('chain', '', root); this.end = el('end', '', root); this.big = el('big', '', root); this.q = s => root.querySelector(s); this.buildLab(); this.buildMenu(); I.onBind = () => { this.buildMenu(); this.buildDock(); }; this.helpState = '';
  }
  say(t) { this.toast.textContent = t; this.toast.classList.add('on'); clearTimeout(this.tt); this.tt = setTimeout(() => this.toast.classList.remove('on'), 1300); }
  buildDock() {
    const I = this.api.input, L = this.api.slots.list;
    this.dock.innerHTML = L.map((t, i) => `<button class="tk${t ? '' : ' empty'}" data-a="s${i}" aria-label="${t ? TRICKS[t] : 'Vacío'}">${svg(t)}<kbd>${keyName(SLOT_KEYS[i])}</kbd><span>${t ? SHORT[t] || TRICKS[t] : 'Vacío'}</span></button>`).join('') + `<button class="tk" data-a="jump" aria-label="Saltar">${svg('jump')}<kbd>${keyName(I.binds.jump)}</kbd><span>Saltar</span></button>`;
    this.dock.insertAdjacentHTML('afterbegin', Object.entries(VAULTS).filter(([id]) => this.api.abilities.has(id)).map(([id, v]) => `<button class="tk ab" data-v="${id}" aria-label="${v.name}">${svg(id)}<kbd>${v.label}</kbd><span>${v.name}</span></button>`).join(''));
    this.dock.querySelectorAll('.ab').forEach(b => { b.tabIndex = -1; b.addEventListener('pointerdown', e => { e.preventDefault(); if (!e.button) I.hits.add('v_' + b.dataset.v); }); });
    this.dock.querySelectorAll('.tk[data-a]').forEach(b => { const a = b.dataset.a, on = e => { e.preventDefault(); if (e.button) return; I.virtual.add(a); I.hits.add(a); try { b.setPointerCapture(e.pointerId); } catch { } }, off = () => I.virtual.delete(a); b.addEventListener('pointerdown', on); for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, off); b.tabIndex = -1; });
  }
  ability(id, r) { const o = this.api.sense.opp, n = VAULTS[id].name; if (r === 'wrong') this.say(`Aquí puedes hacer ${o.ids.map(i => `${VAULTS[i].name} (${VAULTS[i].label})`).join(' o ')}`); else if (r === 'run') this.say('Doble kong: toma un poco más de carrera'); else if (r === 'none') this.say(`${n}: acércate a ${id === 'kong' ? 'una plataforma corta' : id === 'dkong' ? 'una plataforma larga' : 'un muro de 1 a 2 m'}`); else if (r === 'locked') this.say(`${n} aún no está desbloqueado`); }
  vaultStart(id) { this.tc.querySelector('.n').textContent = VAULTS[id].name; this.tc.querySelector('.g').textContent = ''; this.tcT = 1.2; }
  prompt(o) { // aviso de habilidad con cuenta atrás
const p = this.vp; p.classList.toggle('on', !!o); if (!o) { this.vpId = null; return; }
    const key = o.ids.join() + (o.chosen || ''); if (this.vpId !== key) { this.vpId = key; p.innerHTML = `<div class="ops">${o.ids.map(id => `<div class="${o.chosen === id ? 'sel' : o.chosen ? 'no' : ''}"><kbd>${VAULTS[id].label}</kbd>${svg(id)}<b>${VAULTS[id].name}</b></div>`).join('')}</div><i><u></u></i>`; }
    p.classList.toggle('ok', !!o.chosen); p.querySelector('u').style.transform = `scaleX(${o.chosen ? 1 : clamp(o.t / DECIDE, 0, 1)})`;
  }
  needJump() { this.say('Primero salta con ' + keyName(this.api.input.binds.jump) + ' y mantén el truco en el aire'); }
  buildLab() {
    const T = this.api.tuning, L = this.lab; L.innerHTML = '<h3>Panel de físicas</h3>';
    if (this.api.spawns().length > 1) el('row', this.api.spawns().map((s, i) => `<button data-sp="${i}">${i + 1}. ${s.name}</button>`).join(''), L); L.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { this.api.spawn(+b.dataset.sp); b.blur(); });
    el('', '<h4>Ver</h4>' + [['traj', 'Trayectoria y centro de masa'], ['mom', 'Momento angular'], ['bones', 'Esqueleto'], ['cont', 'Puntos de contacto']].map(([k, t]) => `<div class="ck"><input type="checkbox" id="v-${k}"><label for="v-${k}" style="display:inline;margin:0">${t}</label></div>`).join(''), L);
    for (const k of ['traj', 'mom', 'bones', 'cont']) { const c = L.querySelector('#v-' + k); c.checked = this.api.view[k]; c.onchange = () => { this.api.view[k] = c.checked; c.blur(); }; }
    for (const [g, list] of SL) { el('', `<h4>${g}</h4>`, L); for (const [k, t, a, b, s, u] of list) { const lb = document.createElement('label'); lb.innerHTML = `<span>${t}</span><em></em><input type="range" min="${a}" max="${b}" step="${s}" value="${T[k]}">`; const em = lb.querySelector('em'), r = lb.querySelector('input'), up = () => em.textContent = n(T[k], s < 1 ? (s < .1 ? 2 : 1) : 0) + ' ' + u; r.oninput = () => { T[k] = +r.value; up(); this.api.save(); }; r.onchange = () => r.blur(); up(); L.append(lb); } }
    const r = document.createElement('button'); r.textContent = 'Restaurar valores'; r.onclick = () => { Object.assign(T, DEFAULTS); this.api.save(); this.buildLab(); }; L.append(r);
  }
  openMenu(v) { this.menu.classList.toggle('on', v); if (v) { this.sel = 0; this.buildMenu(); this.menu.scrollTop = 0; } this.api.input.onKey = v ? c => { const i = SLOT_KEYS.indexOf(c); if (i >= 0) { this.sel = i; this.buildMenu(); return true; } return false; } : null; }
  buildMenu() {
    const I = this.api.input, S = this.api.slots, sel = this.sel ?? 0;
    const rm = this.api.room(), lvs = this.api.levels();
    this.menu.innerHTML = `<div><header><h2>Pausa</h2><div class="hb"><button class="rl">Reiniciar nivel</button><button class="ex">${this.api.testing() ? 'Volver al editor' : rm ? 'Salir de la sala' : 'Salir al menú'}</button><button class="go">Continuar</button></div></header>${rm ? `<section class="rmx"><h3>Sala ${esc(rm.code)}</h3><p>${rm.isHost ? 'Eres el anfitrión: puedes cambiar el nivel para todos y dar la salida.' : 'El anfitrión elige el nivel.'}</p>${rm.isHost ? `<div class="acts"><select data-rl>${lvs.map(l => `<option value="${esc(l.id)}"${l.id === rm.level?.id ? ' selected' : ''}>${l.mode === '3d' ? '3D' : '2D'}: ${esc(l.name)}</option>`).join('')}</select><button class="race">Salida a la vez (3, 2, 1)</button></div>` : ''}</section>` : ''}
      <div class="asg"><section><h3>Tus seis trucos</h3><p>Elige una tecla.</p><div class="slots">${S.list.map((t, i) => `<button data-s="${i}" class="${i === sel ? 'sel' : ''}" aria-pressed="${i === sel}"><kbd>${keyName(SLOT_KEYS[i])}</kbd>${svg(t)}<span>${t ? TRICKS[t] : 'Vacío'}</span></button>`).join('')}</div></section>
      <section><h3>Truco para la tecla ${keyName(SLOT_KEYS[sel])}</h3><p>Elige uno de la lista.</p><div class="list two">${Object.entries(TRICKS).map(([id, t]) => { const j = S.list.indexOf(id); return `<button data-t="${id}" class="${j === sel ? 'sel' : ''}">${svg(id)}<span>${t}<small>${ABOUT[id]}</small></span>${j >= 0 ? `<kbd>${keyName(SLOT_KEYS[j])}</kbd>` : ''}</button>`; }).join('')}<button data-t="" class="${S.list[sel] ? '' : 'sel'}">${svg(null)}<span>Vacío</span></button></div></section></div>
      <div class="acts"><button class="rt">Trucos por defecto</button></div>
      <h3>Habilidades especiales</h3><p>Al acercarte trotando o corriendo a una plataforma o un muro, tienes 2 segundos para elegir. Si estás parado cerca (hasta 4 m), pulsa su tecla y lo hace al momento.</p><div class="abl">${Object.entries(VAULTS).map(([id, v]) => `<div class="${this.api.abilities.has(id) ? '' : 'lk'}"><kbd>${v.label}</kbd>${svg(id)}<span><b>${v.name}</b><br>${{ kong: 'Plataformas cortas, hasta 1,4 m de largo', dkong: 'Plataformas largas, de 1,4 a 3,2 m', castaway: 'Muros y plataformas de 1 a 2 m de alto' }[id]}</span><em>${this.api.abilities.has(id) ? 'Desbloqueado' : 'Bloqueado'}</em></div>`).join('')}</div>
      <h3>Otras teclas</h3><div class="keys">${ACTIONS.map(([k, t]) => `<div><span>${t}</span><button data-k="${k}">${keyName(I.binds[k])}</button></div>`).join('')}</div>
      <div class="acts"><button class="rs">Teclas por defecto</button></div>
      <p class="tip">El J-step se pulsa en el suelo: hace la carrera en curva y salta; en el aire mantén el truco que quieras. Para el resto, salta y, en el aire, mantén el truco: gira solo mientras lo mantienes. Al soltar, el cuerpo se abre y frena, así que suelta cuando la marca roja entre en la zona verde del medidor. Las flechas, con ${keyName(I.binds.jump)} pulsado, deciden si el truco viaja hacia adelante o hacia atrás. Mando: RT salta, LT corre; A, Y, B, X, LB y RB son los seis trucos.</p></div>`;
    const on = (q, f) => this.menu.querySelectorAll(q).forEach(b => b.onclick = () => f(b)), redo = () => { this.buildMenu(); this.buildDock(); };
    on('[data-s]', b => { this.sel = +b.dataset.s; this.buildMenu(); }); on('[data-t]', b => { S.assign(this.sel ?? 0, b.dataset.t || null); redo(); });
    on('[data-k]', b => { I.capture = b.dataset.k; b.textContent = 'Pulsa…'; b.classList.add('wait'); }); on('.go', () => this.api.pause(false)); on('.rl', () => { this.api.pause(false); this.api.restart(); }); on('.ex', () => this.api.exit()); on('.race', () => { this.api.pause(false); this.api.race(); }); const rl = this.menu.querySelector('[data-rl]'); if (rl) rl.onchange = () => this.api.roomLevel(rl.value); on('.rt', () => { S.reset(); redo(); });
    on('.rs', () => { ACTIONS.forEach(a => I.binds[a[0]] = a[2]); localStorage.removeItem('tinajas.binds.v2'); redo(); }); this.helpState = '';
  }
  land(r) {
    if (!r.isTrick && r.lvl >= 4 && r.apex < .25) return; const c = col(r.lvl); this.tc.querySelector('.n').textContent = r.name; const g = this.tc.querySelector('.g'); g.textContent = r.label + (r.combo > 1 ? `, combo ×${r.combo}` : ''); g.style.color = c; this.tcT = 3.2;
    const tw = Math.abs(r.twistDeg);
    const rows = [['Altura del salto', n(r.apex, 2) + ' m'], ['Tiempo en el aire', n(r.air, 2) + ' s'], ['Dirección', Math.abs(r.travel) < .35 ? 'en el sitio' : (r.travel > 0 ? 'adelante ' : 'atrás ') + n(Math.abs(r.travel), 2) + ' m'], ['Mortal', n(r.flip) + '°'], Math.abs(r.side) > 20 && ['Lateral', n(r.side) + '°'], tw > 20 && ['Twist', n(r.twistDeg) + '°'], ['Giro máximo', n(r.maxW) + ' °/s'], ['Impacto vertical', n(r.vImpact, 1) + ' m/s'], r.tilt !== undefined && ['Inclinación', n(r.tilt) + '°'], r.legReady !== undefined && ['Piernas extendidas', n(r.legReady * 100) + ' %'], ['Superficie', r.surf?.label || '']].filter(Boolean);
    this.card.innerHTML = `<h3>${r.name}</h3><p style="color:${c}">${r.label}</p><div class="m">${rows.map(x => `<span>${x[0]}</span><em>${x[1]}</em>`).join('')}</div>${r.ef !== undefined ? '<canvas width="452" height="240"></canvas>' : ''}`; this.card.classList.remove('off'); this.cardT = 6;
    const cv = this.card.querySelector('canvas'); if (cv) this.balance(cv, r, c);
  }
  balance(cv, r, c) { // base de apoyo vista desde arriba y punto de captura
    const g = cv.getContext('2d'), cx = 226, cy = 128, S = 190; g.lineWidth = 2; for (const [x, k] of [[.46, '#ef6a5a'], [.32, '#f2c14e'], [.21, '#8fd694'], [.115, '#8fd694']]) { g.strokeStyle = k + '88'; g.beginPath(); g.ellipse(cx, cy, x / 1.2 * S, x * S, 0, 0, 7); g.stroke(); }
    g.fillStyle = '#ffffff30'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 20, cy, 10, 26, 0, 0, 7); g.fill(); }
    const px = cx - clamp(r.el, -.9, .9) * S, py = cy - clamp(r.ef, -.55, .55) * S; g.fillStyle = c; g.beginPath(); g.arc(px, py, 9, 0, 7); g.fill(); g.strokeStyle = c; g.beginPath(); g.moveTo(cx, cy); g.lineTo(px, py); g.stroke(); g.fillStyle = '#f5f3eeb0'; g.font = '500 20px system-ui'; g.fillText('Equilibrio', 4, 24); g.fillText('frente', cx + 120, 30); g.fillText('atrás', cx + 120, 226);
  }
  // ── nivel, sala y resultado ──
  setLevel(level, run) { this.tl.querySelector('.ln').textContent = level.name; this.end.classList.remove('on'); this.obK = ''; this.feedEl.textContent = ''; this.card.classList.add('off'); this.buildLab(); this.helpState = ''; this.run = run; this.shown = 0; this.chain.innerHTML = ''; this.chain.className = 'chain'; }
  objective() {
    const r = this.run, ob = this.tl.querySelector('.ob'), L = r.level, p = r.progress, z = r.target, t = r.task; this.tl.querySelector('.tm').textContent = r.aim ? `${r.fails ? `${r.fails} ${r.fails === 1 ? 'fallo' : 'fallos'}` : 'Sin fallos'}` : r.w.goal ? clock(r.time) + (L.rules.time ? ` de ${L.rules.time} s` : '') : L.lab ? 'Entrenamiento libre' : 'Modo libre';
    this.pts.firstChild.textContent = Math.round(this.shown = Math.abs((this.shown ?? 0) - r.score.total) < 1 ? r.score.total : (this.shown ?? 0) + (r.score.total - (this.shown ?? 0)) * .16).toLocaleString('es'); this.pts.lastChild.textContent = L.rules.score && r.aim ? `objetivo ${L.rules.score.toLocaleString('es')}` : 'puntos';
    const key = [r.idx, z?.trick, z?.n, p?.join(), r.got.size, r.done ? 1 : 0].join('|'); if (key === this.obK) return; this.obK = key; const lines = [];
    if (z) { const w = [wantText(z.trick, TRICKS), z.n ? `${z.n} ${z.n === 1 ? 'truco' : 'trucos'} en el aire` : ''].filter(Boolean).join(' y '); lines.push(`<li><b>Objetivo ${r.idx + 1} de ${r.w.zones.length}</b>${w ? `: ${esc(w)}` : ''}</li>`); } else if (r.w.goal) lines.push('<li>Llega a la meta</li>');
    const tx = taskText({ task: t }, TRICKS); if (tx && p && (r.aim ? r.w.zones.length : 1)) lines.push(`<li class="${r.taskDone ? 'ok' : t.type === 'clean' && r.unclean ? 'no' : ''}">${esc(tx)}${t.type === 'clean' ? '' : ` <em>${p[0]}/${p[1]}</em>`}</li>`); if (t.type !== 'stars' && r.w.stars.length) lines.push(`<li>Estrellas <em>${r.got.size}/${r.w.stars.length}</em></li>`);
    ob.innerHTML = lines.length ? `<ul>${lines.join('')}</ul>` : '';
  }
  finish(r, o) { // resultado del nivel
    this.end.innerHTML = `<div><h2>${o.test ? 'Nivel superado' : r.stars === 3 ? 'Perfecto' : 'Nivel superado'}</h2><p class="sc"><b>${r.score.toLocaleString('es')}</b> puntos${o.rank === 0 && !o.test ? ', récord' : o.rank > 0 && !o.test ? `, puesto ${o.rank + 1}` : ''}</p><p class="big3">${[1, 2, 3].map(i => `<i class="${i <= r.stars ? 'y' : ''}">★</i>`).join('')}</p><div class="m"><span>${o.aim ? 'Todos los objetivos' : 'Meta'}</span><em class="ok">hecho</em><span>${esc(o.task || 'Reto')}</span><em class="${r.task ? 'ok' : ''}">${r.task ? 'hecho' : 'pendiente'}</em>${o.aim ? (r.goal ? `<span>Objetivo de ${r.goal.toLocaleString('es')} puntos</span><em class="${r.third ? 'ok' : ''}">${r.third ? 'hecho' : 'pendiente'}</em>` : `<span>A la primera</span><em class="${r.first ? 'ok' : ''}">${r.first ? 'hecho' : `${r.fails} ${r.fails === 1 ? 'fallo' : 'fallos'}`}</em>`) : `<span>Tiempo${o.par ? ` (objetivo ${o.par} s)` : ''}</span><em class="${r.inTime ? 'ok' : ''}">${clock(r.time)}</em>`}${o.record && !o.test && !o.aim ? '<span>Mejor marca</span><em class="ok">nueva</em>' : ''}</div><div class="acts">${o.next ? '<button class="nx pri">Siguiente nivel</button>' : ''}<button class="rp${o.next ? '' : ' pri'}">Repetir</button>${o.test ? '' : '<button class="up">Mejoras</button>'}<button class="ex">${o.test ? 'Volver al editor' : 'Salir'}</button></div></div>`;
    this.end.classList.add('on'); const q = (s, f) => { const b = this.end.querySelector(s); if (b) b.onclick = f; }; q('.nx', () => this.api.next()); q('.rp', () => this.api.restart()); q('.ex', () => this.api.exit()); q('.up', () => this.api.upgrades()); this.end.querySelector('.pri')?.focus({ preventScroll: true });
  }
  // Trucos del vuelo actual, en vivo
  points(e) { const d = document.createElement('div'); d.innerHTML = `<b>${e.n > 1 ? ['', '', 'Doble ', 'Triple '][e.n] ?? e.n + '× ' : ''}${esc(NAMES[e.id])}</b><em>+${e.pts}</em>`; if (this.chainOld) { this.chain.innerHTML = ''; this.chainOld = false; } this.chain.querySelector('.mx')?.remove(); this.chain.append(d); if (e.mult > 1) { const m = document.createElement('div'); m.className = 'mx'; m.textContent = '× ' + n(e.mult, 2); this.chain.append(m); } this.chain.className = 'chain on'; this.chT = 3; }
  mult(m) { if (this.chainOld) return; this.chain.querySelector('.mx')?.remove(); const d = document.createElement('div'); d.className = 'mx'; d.textContent = '× ' + n(m, 2); this.chain.append(d); this.chain.className = 'chain on'; this.chT = 3; }
  banked(e) { if (!e.pts && !e.lost) return; const d = document.createElement('div'); d.className = 'tot'; d.textContent = e.pts ? `+${e.pts.toLocaleString('es')}` : `−${e.lost.toLocaleString('es')} perdidos`; this.chain.append(d); const x = []; if (e.pts) { x.push(`aterrizaje × ${n(e.land, 1)}`); if (e.chain > 1) x.push(`combo × ${n(e.chain, 1)}`); if (e.drop > 9) x.push(`altura +${e.drop}`); const s = document.createElement('small'); s.textContent = x.join(', '); this.chain.append(s); } this.chain.className = `chain on ${e.pts ? 'ok' : 'bad'}`; this.chT = 2.6; this.chainOld = true; }
  bigText(t, c = '') { this.big.textContent = t; this.big.style.color = c; this.big.classList.add('on'); clearTimeout(this.bt); this.bt = setTimeout(() => this.big.classList.remove('on'), 1000); }
  feed(name, text, c) { const d = document.createElement('div'), b = document.createElement('b'), s = document.createElement('span'); b.textContent = name; s.textContent = ' ' + text; if (c) s.style.color = c; d.append(b, s); this.feedEl.append(d); while (this.feedEl.children.length > 5) this.feedEl.firstChild.remove(); setTimeout(() => d.remove(), 6000); }
  players(room, state) {
    this.roomEl.classList.toggle('on', !!room); if (!room) { this.roomEl.innerHTML = ''; this.names.innerHTML = ''; return; } const sc = p => Math.max(p.pts || 0, room.board.get(p.id)?.score || 0), all = [room.me, ...room.peers.values()].sort((a, b) => sc(b) - sc(a) || a.at - b.at);
    this.roomEl.innerHTML = `<h4>Sala <button class="cp" title="Copiar código">${esc(room.code)}</button></h4>${state === false ? '<p class="warn">Sin conexión, reintentando…</p>' : ''}${all.map(p => { const b = room.board.get(p.id); return `<div><i style="background:${COLORS[p.color % COLORS.length]}"></i><span>${esc(p.name)}${p === room.me ? ' (tú)' : ''}${p.id === room.host ? ', anfitrión' : ''}</span>${p.pts || b ? `<em>${b ? '★'.repeat(b.stars) + ' ' : ''}${Math.round(Math.max(p.pts || 0, b?.score || 0)).toLocaleString('es')}</em>` : ''}</div>`; }).join('')}`;
    this.roomEl.querySelector('.cp').onclick = () => navigator.clipboard?.writeText(room.code).then(() => this.say('Código copiado'), () => {});
  }
  tags(list) { while (this.names.children.length < list.length) this.names.append(document.createElement('div')); [...this.names.children].forEach((d, i) => { const t = list[i]; d.style.display = t ? '' : 'none'; if (t) { if (d.textContent !== t.name) d.textContent = t.name; d.style.transform = `translate(-50%,-100%) translate(${t.x.toFixed(1)}px,${t.y.toFixed(1)}px)`; } }); }
  update(dt, a, info) {
    this.objective(); this.chT = (this.chT || 0) - dt; if (this.chT <= 0 && a.state !== 'air') this.chain.classList.remove('on'); else if (a.state === 'takeoff' && !this.chainOld) { this.chain.innerHTML = ''; } 
    const st = { ground: a.charging ? 'Cargando' : a.balance > 0 ? 'Recuperando equilibrio' : 'En el suelo', takeoff: 'Despegue', air: a.bounceT > 0 ? 'Rebote' : 'En el aire', ragdoll: 'Caída', getup: 'Levantándose', vault: 'Habilidad', bar: a.bar?.turn ? 'Media vuelta' : 'En la barra · Shift: media vuelta' }[a.state] || ''; this.tr.innerHTML = `<b>${st}</b><br>Cámara ${info.cam}${info.slow ? '<br>Cámara lenta' : ''}<br>${info.fps} FPS`;
    this.tcT = (this.tcT || 0) - dt; this.cardT = (this.cardT || 0) - dt; if (this.cardT <= 0 || a.state === 'takeoff' || (a.state === 'air' && a.airT > .35 && a.bounceT <= 0)) this.card.classList.add('off');
    const inAir = a.state === 'air' || a.state === 'takeoff', tr = a.trick; if (inAir && Math.abs(tr.flip) + Math.abs(tr.side) + Math.abs(tr.twist) + Math.abs(tr.spin) > 40) { this.tc.querySelector('.n').textContent = a.moveId ? TRICKS[a.moveId] : tr.name(); this.tc.querySelector('.g').textContent = ''; this.tcT = .4; } this.tc.style.opacity = this.tcT > 0 ? 1 : 0;
    const B = this.bars.children, set = (i, f, t) => { B[i].querySelector('u').style.transform = `scaleX(${clamp(f, 0, 1)})`; B[i].querySelector('em').textContent = t; }, w = a.omega.length() / DEG, tw = Math.abs(a.wTwist) / DEG;
    set(0, a.charge, n(a.charge * 100) + ' %'); set(1, a.speed / a.T.sprintSpeed, n(a.speed, 1) + ' m/s'); const rot = a.state === 'air' ? Math.max(w, tw) : 0; set(2, rot / 700, n(rot) + ' °/s');
    this.air.style.opacity = inAir ? 1 : 0; if (inAir) this.drawAir(a);
    const I = this.api.input, fw = inAir && a.tkFwd ? a.tkFwd : a.forward(), left = fw.x * info.right.x + fw.z * info.right.z < -.2; this.dock.classList.toggle('flip', left);
    const opp = this.api.sense.opp; this.prompt(opp?.direct ? null : opp); const can = opp ? opp.ids : this.api.sense.available(); if (opp) this.card.classList.add('off');
    for (const b of this.dock.children) { if (b.dataset.v) { b.classList.toggle('can', can.includes(b.dataset.v)); b.classList.toggle('on', a.state === 'vault' ? a.vault.id === b.dataset.v : opp?.chosen === b.dataset.v); continue; } const k = b.dataset.a; b.classList.toggle('on', k === 'jump' ? !!info.inp.jump : inAir && I.slot(+k[1])); }
    this.dock.classList.toggle('ready', inAir || a.charging);
    const k = x => `<kbd>${keyName(I.binds[x])}</kbd>`, hs = (this.run.aim ? 'a' : this.run.w.plane ? 'p' : '3') && a.state === 'air' ? 'air' : a.charging ? 'ch' : a.state === 'ragdoll' ? 'rag' : 'g'; if (hs !== this.helpState) { this.helpState = hs; const aim = this.run.aim, is3 = !this.run.w.plane, H = { g: aim ? [k('left') + k('right') + 'Mirar a un lado', k('jump') + 'Cargar y saltar', 'En el aire, mantén un truco', k('reset') + 'Repetir', '<kbd>Esc</kbd>Asignar trucos'] : [(is3 ? k('up') + k('down') : '') + k('left') + k('right') + 'Trotar', k('run') + 'Correr', k('jump') + 'Salta y mantén un truco en el aire', is3 ? 'Arrastra para girar la cámara' : k('panel') + 'Físicas', '<kbd>Esc</kbd>Asignar trucos'], ch: [(is3 ? k('up') + k('down') : '') + k('left') + k('right') + 'Dirección del truco', 'Suelta ' + k('jump') + 'para saltar'], air: aim ? [k('left') + k('right') + 'Dirección', 'Mantén el truco para girar, suelta para caer de pie'] : ['Mantén para girar, suelta para frenar y caer de pie'], rag: [k('jump') + 'Levantarse', k('reset') + 'Reiniciar'] }; this.help.innerHTML = H[hs].map(x => `<span>${x}</span>`).join(''); }
  }
  drawAir(a) {
    const c = this.air.querySelector('canvas'), g = c.getContext('2d'), R = 96, o = 124, tr = a.trick; g.clearRect(0, 0, 248, 248); g.fillStyle = '#10161cb0'; g.beginPath(); g.arc(o, o, 118, 0, 7); g.fill(); g.lineWidth = 11; g.strokeStyle = '#ffffff22'; g.beginPath(); g.arc(o, o, R, 0, 7); g.stroke();
    const sideways = Math.abs(tr.side) > Math.abs(tr.flip), mv = a.mvId && a.moveTheta > 4, rot = mv ? a.moveTheta * (tr.flip < -5 ? -1 : 1) : sideways ? tr.side : tr.flip, f = (Math.abs(rot) % 360) * DEG, st = -Math.PI / 2, sg = Math.sign(rot) || 1; if (Math.abs(rot) > 8) { g.lineCap = 'butt'; g.strokeStyle = '#8fd694aa'; const z0 = st + sg * 265 * DEG, z1 = st + sg * 342 * DEG; g.beginPath(); g.arc(o, o, R, z0, z1, sg < 0); g.stroke(); } g.strokeStyle = '#e5482d'; g.lineCap = 'round'; g.beginPath(); g.arc(o, o, R, st, st + sg * f, sg < 0); g.stroke();
    const up = V(0, 1, 0).applyQuaternion(a.rootQ), ax = sideways ? up.dot(a.tkRight) * -1 : up.dot(a.tkFwd), an = Math.atan2(ax, up.y); g.save(); g.translate(o, o); g.rotate(an); g.strokeStyle = '#f5f3ee'; g.lineWidth = 9; g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 20); g.moveTo(0, 20); g.lineTo(-9, 58); g.moveTo(0, 20); g.lineTo(9, 58); g.stroke(); g.fillStyle = '#f5f3ee'; g.beginPath(); g.arc(0, -42, 13, 0, 7); g.fill(); g.restore();
    const e = a.state === 'air' ? (a.ttg ?? 0) : 0, rows = [mv ? [TRICKS[a.mvId], n(a.moveTheta) + '°'] : ['Mortal', n(tr.flip) + '°'], ['Lateral', n(tr.side) + '°'], ['Twist', n(tr.twist) + '°'], ['Vueltas', n(Math.abs(rot) / 360, 1)], ['Altura', n(Math.max(0, a.com.y - (a.startComY ?? a.com.y)), 2) + ' m'], ['Suelo en', n(e, 2) + ' s']]; const r = this.air.querySelector('.r'); r.innerHTML = rows.map(x => `<div><span>${x[0]}</span><em>${x[1]}</em></div>`).join('');
  }
}
