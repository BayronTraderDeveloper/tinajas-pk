import * as THREE from 'three';
import { Athlete, GRADES } from './core/athlete.js';
import { AirControl, MOVES } from './core/control.js';
import { makeTuning } from './core/tuning.js';
import { BONES, CONTACTS, setBody } from './core/body.js';
import { Roster, applyStats, lookKey, cleanLook } from './core/characters.js';
import { VaultSense, VAULTS, REACH } from './core/vaults.js';
import { Abilities } from './core/abilities.js';
import { buildWorld, sanitize } from './core/levels.js';
import { LAB, LEVELS_2D, MAPS_3D } from './core/maps.js';
import { LevelRun, Progress, Library, Rank, taskText } from './core/run.js';
import { Upgrades } from './core/upgrades.js';
import { NAMES } from './core/score.js';
import { createStage } from './scene.js';
import { createCharacter } from './character.js';
import { Input } from './input.js';
import { Slots, TRICKS } from './slots.js';
import { Cam } from './camera.js';
import { HUD } from './hud.js';
import { Menu } from './menu.js';
import { Editor } from './editor.js';
import { Viewer } from './viewer.js';
import { Room, COLORS, newCode } from './net/room.js';
import * as net from './net/nostr.js';
import { damp } from './core/mathx.js';

const canvas = document.getElementById('view'), ui = document.getElementById('ui'), edRoot = document.getElementById('editor');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
await new Promise(r => setTimeout(r, 30));
const tuning = makeTuning(); try { Object.assign(tuning, JSON.parse(localStorage.getItem('tinajas.tuning.v1') || '{}')); } catch { }
let world = buildWorld(MAPS_3D[0]), run = new LevelRun(world);
const stage = createStage(renderer), { scene, dust } = stage, camera = new THREE.PerspectiveCamera(24, 1, .3, 400);
const roster = new Roster(); let hero = roster.current; setBody(hero.look);
const upgrades = new Upgrades(), rank = new Rank(), eff = applyStats(upgrades.apply(tuning, makeTuning()), hero.stats), retune = () => { applyStats(upgrades.apply(tuning, eff), hero.stats); run.score.style = eff.style; };
const athlete = new Athlete(world, eff); let body = createCharacter(hero.look); scene.add(body);
const control = new AirControl(athlete), abilities = new Abilities(), sense = new VaultSense(athlete, abilities); abilities.set = new Set(hero.abilities);
const slots = new Slots(), input = new Input(canvas), cam = new Cam(camera, world), progress = new Progress(), lib = new Library(sanitize);
const view = { traj: true, mom: false, bones: false, cont: false };
let app = 'menu', from = 'home', testing = false, level = MAPS_3D[0], curInp = {}, quality = 1.5, slowT = 0, paused = false, slow = false, scale = 1, time = 0, spawnI = 0, room = null, netOk = true, countdown = 0, doneT = 0;
const setApp = v => { app = v; document.body.dataset.app = v; };
const spawn = i => { spawnI = i; control.reset(); sense.clear(); sense.reach = run.aim ? 1.2 : REACH; athlete.reset(world.spawns[i]); if (run.aim) { athlete.side = Math.sin(world.spawns[i].yaw) < 0 ? -1 : 1; cam.spotY = run.spot.y; } cam.init = false; cam.look = 0; trail.length = 0; };
const pause = v => { paused = v; hud.openMenu(v); };
const save = () => { localStorage.setItem('tinajas.tuning.v1', JSON.stringify(tuning)); retune(); };
const allLevels = () => [...MAPS_3D, ...LEVELS_2D, LAB, ...lib.list];
const exportLevel = l => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(l, null, 1)], { type: 'application/json' })); a.download = l.name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

// ── Cambiar de nivel y de pantalla ──
function load(l) { level = l; world = buildWorld(l); run = new LevelRun(world); run.names = TRICKS; run.score.style = eff.style; athlete.world = world; if (room) world.time = (Date.now() / 1000) % 3600; stage.load(world); stage.marks(run); cam.setWorld(world, world.spawns[0].yaw); input.lookOn = !world.plane; doneT = 0; hud.setLevel(l, run); spawn(0); }
function play(l, o = {}) { if (o.from) from = o.from; testing = !!o.test; if (editor.on) editor.close(); menu.hide(); load(l); paused = false; hud.openMenu(false); setApp('play'); document.activeElement?.blur?.(); }
function edit(l) { menu.hide(); leaveRoom(); body.visible = false; setApp('edit'); input.lookOn = false; editor.open(l); }
function viewerOpen() { menu.hide(); leaveRoom(); load(sanitize({ id: 'visor', name: 'Visor', mode: '3d', theme: 'gym', size: { x0: -12, x1: 12, z0: -12, z1: 12 } })); setApp('viewer'); input.lookOn = true; body.visible = true; viewer.open(); ui.classList.add('on'); }
function home(v = 'home') { leaveRoom(); if (editor.on) editor.close(); if (viewer.on) { viewer.close(); ui.classList.remove('on'); } paused = false; hud.openMenu(false); hud.end.classList.remove('on'); testing = false; load(MAPS_3D[0]); body.visible = true; setApp('menu'); input.lookOn = false; menu.show(v); }
function exit() { if (testing) { pause(false); hud.end.classList.remove('on'); edit(level); } else home(room ? 'net' : from); }
function restart() { hud.end.classList.remove('on'); run.reset(); doneT = 0; stage.marks(run); hud.obK = ''; spawn(0); document.activeElement?.blur?.(); }
const nextLevel = () => { const L = level.mode === '2d' ? LEVELS_2D : [], i = L.findIndex(x => x.id === level.id); return i >= 0 ? L[i + 1] : null; };
// ── En línea ──
const avatars = new Map();
const cb = {
  state: ok => { netOk = ok; hud.players(room, netOk); }, change: () => { if (room) { hud.players(room, netOk); clearTimeout(cb.at); cb.at = setTimeout(announce, 1500); } },
  join: p => { const m = avatarFor(p.look); m.visible = false; scene.add(m); avatars.set(p.id, m); if (room) hud.feed(p.name, 'entró en la sala'); },
  leave: p => { const m = avatars.get(p.id); if (m) { scene.remove(m); avatars.delete(p.id); } hud.feed(p.name, 'salió de la sala'); },
  level: l => { if (app === 'play' && room) { load(l); hud.say('Nivel: ' + l.name); } else pendingLevel?.(l); hud.players(room, netOk); },
  feed: (p, name, lvl) => hud.feed(p.name, name, lvl >= 4 ? '#8fd694' : lvl >= 2 ? '#f2c14e' : '#ef6a5a'),
  finish: (p, t, s) => { hud.feed(p.name, `terminó con ${'★'.repeat(s)}`, '#ffc531'); hud.players(room, netOk); }, race: () => startRace(),
};
let pendingLevel = null;
// Personajes: cada jugador se ve con el suyo (se generan una vez y se reutilizan)
const lookCache = new Map(), avatarFor = look => { const key = lookKey(look); let m = lookCache.get(key); if (!m || m.parent) { m = createCharacter(cleanLook(look)); if (!lookCache.has(key)) lookCache.set(key, m); } return m; };
function swapBody(look) { scene.remove(body); body = createCharacter(look); scene.add(body); body.sync(athlete); }
function setHero(id) { roster.choose(id); hero = roster.current; setBody(hero.look); athlete.rebody(); swapBody(hero.look); abilities.set = new Set(hero.abilities); abilities.save(); retune(); hud.buildDock(); }
// Vista previa en el menú sin cambiar todavía de personaje (solo el aspecto)
function previewLook(look) { setBody(look); athlete.rebody(); swapBody(look); }
let adT = null; const announce = () => { if (room?.pub && room.isHost) net.announceRoom({ code: room.code, level: room.level?.name || '', mode: room.level?.mode, players: room.peers.size + 1, host: room.me.name }).catch(() => { }); };
function leaveRoom() { if (!room) return; const r = room; room = null; clearInterval(adT); if (r.pub && r.isHost) net.closeRoom(r.code); r.leave(); for (const m of avatars.values()) scene.remove(m); avatars.clear(); hud.players(null); hud.tags([]); }
async function host(l, prof, o = {}) { leaveRoom(); const r = new Room(newCode(), { ...prof, look: hero.look, name: prof.name || hero.name }, cb); await r.join(l.lab ? l : { ...sanitize(l), ...(l._ckey ? { _ckey: l._ckey } : {}) }); room = r; r.pub = !!o.pub; if (r.pub) { announce(); adT = setInterval(announce, 30000); } from = 'net'; play(l); hud.players(room, netOk); }
async function join(code, prof) {
  leaveRoom(); const r = new Room(code, { ...prof, look: hero.look, name: prof.name || hero.name }, cb); const got = new Promise((ok, no) => { pendingLevel = ok; setTimeout(() => no(new Error('No hay nadie en esa sala')), 6000); }); got.catch(() => { });
  try { await r.join(null); const l = await got; room = r; from = 'net'; play(l); hud.players(room, netOk); } catch (e) { r.leave(); for (const m of avatars.values()) scene.remove(m); avatars.clear(); throw e; } finally { pendingLevel = null; }
}
function startRace() { restart(); countdown = 3.999; room?.zero(); hud.players(room, netOk); }

const hud = new HUD(document.getElementById('hud'), { input, slots, abilities, sense, tuning, spawns: () => world.spawns, spawn, view, pause, save, exit, restart, upgrades: () => { const f = from; home('up'); from = f; }, next: () => { const l = nextLevel(); if (l) play(l); }, testing: () => testing, room: () => room, levels: allLevels, race: () => { if (room?.isHost) { room.send('race', {}); startRace(); } }, roomLevel: id => { const l = allLevels().find(x => x.id === id); if (l && room?.isHost) { const s = l.lab ? l : sanitize(l); room.setLevel(s); load(s); pause(false); hud.players(room, netOk); } } });
const menu = new Menu(ui, { progress, lib, upgrades, rank, net, upgraded: retune, viewer: () => viewerOpen(), play, edit, exportLevel, host, join, roster, setHero: id => setHero(id), preview: look => previewLook(look), say: t => hud.say(t) });
const viewer = new Viewer(ui, { scene, tuning: () => eff, exit: () => home() });
const editor = new Editor(edRoot, { stage, camera, canvas, lib, exportLevel, say: t => hud.say(t), test: l => { body.visible = true; play(l, { test: true }); }, exit: () => home('create') });
input.onEsc = () => { if (app === 'viewer') return home(); if (app === 'play' && !hud.end.classList.contains('on')) pause(!paused); else if (app === 'menu' && menu.view !== 'home') menu.show('home'); };

// ── ayudas visuales ──
const trail = [], MAX = 420, tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3));
const trailL = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: '#e5482d', transparent: true, opacity: .75 })); trailL.frustumCulled = false; scene.add(trailL);
const over = { depthTest: false, transparent: true }, comM = new THREE.Mesh(new THREE.SphereGeometry(.035, 16, 12), new THREE.MeshBasicMaterial({ color: '#e5482d', ...over })); comM.renderOrder = 9; scene.add(comM);
const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, '#ffd23f', .14, .08); arrow.traverse(o => { if (o.material) Object.assign(o.material, over); o.renderOrder = 9; }); scene.add(arrow);
const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3)); const boneL = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: '#7fe3ff', ...over })); boneL.frustumCulled = false; boneL.renderOrder = 8; scene.add(boneL);
const cont = CONTACTS.map(c => { const m = new THREE.Mesh(new THREE.SphereGeometry(c.r, 12, 8), new THREE.MeshBasicMaterial({ color: c.kind === 'foot' ? '#8fd694' : '#ffd23f', wireframe: true, ...over, opacity: .6 })); scene.add(m); return m; });
function debug() {
  const a = athlete, on = app === 'play'; if (on && (a.state === 'air' || a.state === 'vault') && !paused) { trail.push(a.com.clone()); if (trail.length > MAX) trail.shift(); }
  trailL.visible = on && view.traj && trail.length > 1; if (trailL.visible) { const p = tg.attributes.position; trail.forEach((v, i) => p.setXYZ(i, v.x, v.y, v.z)); tg.setDrawRange(0, trail.length); p.needsUpdate = true; }
  comM.visible = on && view.traj && a.state === 'air'; comM.position.copy(a.com); const L = a.L.length(); arrow.visible = on && view.mom && L > 1 && a.state !== 'ragdoll'; if (arrow.visible) { arrow.position.copy(a.com); arrow.setDirection(a.L.clone().normalize()); arrow.setLength(L / 55, .14, .08); }
  boneL.visible = on && view.bones; if (boneL.visible) { const p = bg.attributes.position; BONES.forEach((b, i) => { const q = a.sk.pos[i].clone().applyQuaternion(a.rootQ).add(a.rootP), r = b.p < 0 ? q : a.sk.pos[b.p].clone().applyQuaternion(a.rootQ).add(a.rootP); p.setXYZ(i * 2, q.x, q.y, q.z); p.setXYZ(i * 2 + 1, r.x, r.y, r.z); }); p.needsUpdate = true; }
  cont.forEach((m, i) => { m.visible = on && view.cont; if (m.visible) m.position.copy(a.worldPt(CONTACTS[i])); });
}
function events() {
  for (const e of athlete.drain()) {
    run.event(e, athlete);
    if (e.type === 'land') { hud.land(e); if (room && (e.isTrick || e.lvl < 2)) room.send('land', { name: e.isTrick ? `${e.name}: ${e.label.toLowerCase()}` : e.label, lvl: e.lvl }); }
    else if (e.type === 'takeoff') { trail.length = 0; dust(e.p, 6, .8); } else if (e.type === 'touchdown') dust(e.p, Math.min(26, 4 + e.v * 3), .5 + e.v * .22); else if (e.type === 'impact') dust(e.p, 8, 1); else if (e.type === 'step' && e.speed > 4.5) dust(e.p, 2, .4); else if (e.type === 'bounce') trail.length = 0; else if (e.type === 'spring') { trail.length = 0; stage.bump(e.box); dust(e.p, 12, 1.2); } else if (e.type === 'hands') dust(e.p, 7, .6); else if (e.type === 'vault') { trail.length = 0; hud.vaultStart(e.id); }
    else if (e.type === 'out') { control.reset(); sense.clear(); trail.length = 0; cam.init = false; if (run.aim) athlete.side = Math.sin(run.spot.yaw) < 0 ? -1 : 1; }
  }
}
function rules(dt) {
  const ev = run.update(dt, athlete); if (!ev.length) return; stage.marks(run);
  for (const e of ev) {
    if (e.type === 'pts') hud.points(e); else if (e.type === 'ring') { const s = world.live(world.rings[e.i]); dust(s, 16, 1.6); hud.mult(run.score.mult); } else if (e.type === 'score') {
      hud.banked(e); if (e.pts > 0) { if (!testing) { upgrades.earn(e.pts); if (e.list.length) rank.jump({ pts: e.pts, tricks: e.list.filter(t => t.n < 2 || t === e.list.findLast(q => q.id === t.id)).map(t => (['', '', 'Doble ', 'Triple '][t.n] ?? '') + NAMES[t.id]).join(' + '), level: level.name, t: Date.now() }); } if (room) { room.points(run.score.total); hud.players(room, netOk); } }
    } else if (e.type === 'star') { const s = world.live(world.stars[e.i]); dust({ x: s.x, y: s.y, z: s.z }, 14, 1.4); } else if (e.type === 'check') hud.say('Punto de control');
    else if (e.type === 'target') { cam.spotY = run.spot.y; hud.bigText(e.lvl >= 5 ? 'Perfecto' : e.lvl >= 4 ? 'Objetivo' : 'Objetivo, por poco', e.lvl >= 4 ? '#8fd694' : '#f2c14e'); } else if (e.type === 'fail') hud.bigText(e.why, '#ef6a5a');
    else if (e.type === 'retry') { control.reset(); sense.clear(); athlete.reset(e.spot); athlete.side = Math.sin(e.spot.yaw) < 0 ? -1 : 1; trail.length = 0; } else if (e.type === 'zone') hud.say('Objetivo conseguido');
    else if (e.type === 'finish') { const r = e.result, rec = testing ? false : progress.add(level.id, r); doneT = 1.5; run.record = rec; run.place = testing ? -1 : rank.add(level.id, { name: menu.prof.name || 'Atleta', score: r.score, stars: r.stars, t: Date.now() }); if (!testing) upgrades.earn(r.stars * 100); if (level._ckey && r.task && (!level.rules.score || r.score >= level.rules.score)) net.postScore(level._ckey, r, menu.prof.name || hero.name).then(() => hud.say('Has entrado en la clasificación del nivel'), () => hud.say('No se pudo enviar tu marca')); if (room) { room.finish(r); hud.players(room, netOk); } }
  }
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setPixelRatio(Math.min(devicePixelRatio, quality)); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

let last = performance.now(), fps = 60; const right = new THREE.Vector3(), tmp = new THREE.Vector3(), IDLE = { mx: 0, mz: 0, back: false, camYaw: 0, run: false, jump: false, flip: 0, side: 0, twist: 0, tuck: 0, pike: 0 };
function simulate(dt, inp) { const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n; for (let i = 0; i < n; i++) athlete.update(h, inp); }
function playFrame(real) {
  if (input.hit('cam')) hud.say('Cámara ' + cam.next().toLowerCase()); if (input.hit('slow')) slow = !slow; if (input.hit('panel')) hud.lab.classList.toggle('on');
  if (input.hit('reset')) { if (hud.end.classList.contains('on') || !run.aim) { if (level.lab) spawn(spawnI); else restart(); } else { control.reset(); sense.clear(); run.fail = null; run.land = null; athlete.reset(run.spot); athlete.side = Math.sin(run.spot.yaw) < 0 ? -1 : 1; trail.length = 0; } }
  const lock = countdown > 0 || doneT < 0; if (countdown > 0) { const a = Math.ceil(countdown); countdown -= real; const b = Math.ceil(countdown); if (b !== a || a === 4) hud.bigText(b > 0 ? String(Math.min(3, b)) : '¡Ya!', '#fff'); }
  // habilidades especiales: 2 s para decidir, en cámara lenta sutil
  if (!lock) for (const id in VAULTS) if (input.hits.has(VAULTS[id].key) || input.hits.has('v_' + id) || (input.hit('ability') && (sense.opp?.ids[0] || sense.available().at(-1)) === id)) hud.ability(id, abilities.has(id) ? sense.request(id) : 'locked');
  const oppScale = sense.update(real); scale = damp(scale, slow ? .25 : oppScale, 14, real); const dt = real * scale; time += real;
  let raw = input.read(real, world.plane ? null : cam.yaw); if (lock) raw = { ...IDLE }; const o = sense.opp, want = Math.hypot(raw.mx, raw.mz);
  if (o?.direct) { if ((want > .3 && (raw.mx * o.dir.x + raw.mz * o.dir.z) / want < .2) || raw.jump) sense.opp = null; else { raw.mx = o.mx; raw.mz = o.mz; raw.run = !!o.run; } }
  else if (o?.chosen) { raw.mx = o.dir.x; raw.mz = o.dir.z; raw.run = !VAULTS[o.chosen].wall && athlete.speed > 4; }
  raw.stay = run.aim && !sense.opp?.direct;   // en los niveles 2D no se camina
  const held = new Set(lock ? [] : slots.list.filter((t, i) => t && input.slot(i)));
  if (!lock && athlete.charging) for (const t of held) if (athlete.arm(t)) break;   // fase A: la acrobacia elegida mientras se carga prepara su entrada
  if (!lock && athlete.state === 'ground' && !athlete.js) slots.list.forEach((t, i) => { if (!t || !input.slotHit(i)) return; if (t === 'jstep') { athlete.charging = false; athlete.charge = 0; athlete.startJstep(); } else if (MOVES[t]?.acro && !raw.jump && !athlete.charging) athlete.startAcro(t); else if (MOVES[t]?.ground && !raw.jump && !athlete.charging) athlete.startSpin(t); else if (!raw.jump && !athlete.charging) hud.needJump(); });  // los trucos son solo en el aire
  curInp = { ...raw, held }; const n = Math.max(1, Math.ceil(dt * 240)); for (let i = 0; i < n; i++) { const c = control.drive(raw, held); athlete.update(dt / n, lab.script ? { ...c, ...lab.script(athlete) } : c); } events(); rules(dt);
  if (doneT > 0) { doneT -= real; if (doneT <= 0) { doneT = -1; hud.finish(run.done, { aim: run.aim, test: testing, par: level.rules.time, task: taskText({ task: run.task }, TRICKS), record: run.record, rank: run.place, next: !testing && !room && nextLevel() }); } }
  stage.update(dt, athlete.com); const tz = run.aim ? run.target || world.zones.at(-1) : null; if (tz) cam.spotY = run.spot.y; cam.update(dt, athlete, input.look, input.zoom, real, sense.opp?.box || (athlete.state === 'vault' ? athlete.vault.box : null), tz ? { ...tz, ...world.live(tz) } : null);
}
function remotes(now) {
  if (!room) return; const list = [];
  for (const [id, p] of room.peers) { const m = avatars.get(id), q = room.pose(p, now); if (!m) continue; m.visible = !!q && app === 'play'; if (!q) continue; m.bones[0].position.copy(q.p); m.bones[0].quaternion.copy(q.q); q.l.forEach((x, i) => m.bones[i + 1].quaternion.copy(x)); tmp.copy(q.p); tmp.y += 1.02; tmp.project(camera); if (m.visible && tmp.z < 1) list.push({ name: p.name, x: (tmp.x + 1) / 2 * innerWidth, y: (1 - tmp.y) / 2 * innerHeight }); }
  hud.tags(list);
}
function frame(now) {
  const real = Math.min(.05, Math.max(.0005, (now - last) / 1000)); last = now; fps = damp(fps, 1 / real, 2, real);
  // resolución adaptable: baja un paso si no alcanza 60 FPS de forma sostenida
  slowT = fps < 54 ? slowT + real : 0; if (slowT > 2 && quality > 1) { quality -= .25; slowT = 0; resize(); }
  if (app === 'edit') editor.update(real); else if (app === 'viewer') { viewer.update(real, body, camera, input.look, input.zoom); stage.update(real, viewer.f); }
  else if (app === 'menu') { time += real; simulate(real, IDLE); athlete.drain(); stage.update(real, athlete.com); const t = time * .07 + .6, f = athlete.com; camera.fov = 38; camera.position.set(f.x + Math.sin(t) * 6.4, 2.1, f.z + Math.cos(t) * 6.4); camera.lookAt(f.x, 1.15, f.z); const s = innerWidth > 620 ? -(innerWidth < 1100 ? .26 : .17) * innerWidth : 0; camera.setViewOffset(innerWidth, innerHeight, s, 0, innerWidth, innerHeight); camera.updateProjectionMatrix(); }
  else { if (!paused) playFrame(real); else input.pad(real); }
  if (app !== 'menu' && camera.view?.enabled) { camera.clearViewOffset(); camera.updateProjectionMatrix(); }
  stage.highlight(app === 'play' ? sense.opp?.box : null, sense.opp ? (sense.opp.chosen ? 1.3 : .75 + .5 * Math.sin(now * .012)) : 0);
  if (app !== 'edit' && app !== 'viewer') body.sync(athlete); debug(); if (room && app === 'play') room.tick(real, athlete, now); remotes(now);
  if (app === 'play') { right.setFromMatrixColumn(camera.matrixWorld, 0); hud.update(real, athlete, { time, cam: cam.name.toLowerCase(), slow, inp: curInp, fps: Math.round(fps), right }); }
  input.flush(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
// acceso para depurar desde la consola
const lab = window.__lab = { athlete, control, slots, abilities, sense, get world() { return world; }, get run() { return run; }, upgrades, rank, eff, viewer, get room() { return room; }, roster, setHero, get body() { return body; }, get app() { return app; }, tuning, cam, hud, menu, editor, stage, scene, spawn, view, play, edit, home, allLevels, host, join, script: null, renderer, camera, body, step: (dt, inp) => { simulate(dt, inp); events(); }, ctl: (dt, inp, held) => { for (let i = 0; i < 4; i++) athlete.update(dt / 4, control.drive(inp, new Set(held))); events(); rules(dt); }, setSlow: v => slow = v, setPaused: v => paused = v, GRADES };
home(roster.chosen ? 'home' : 'chars'); requestAnimationFrame(t => { last = t; frame(t); document.getElementById('load').classList.add('off'); });
