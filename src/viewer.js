// Visor de acrobacias: graba cada truco con la física real y lo muestra desde cualquier vista, a cámara lenta o fotograma a fotograma.
import * as THREE from 'three';
import { ACRO, PARAMS, PHASES, acroParams, saveAcro, resetAcro } from './core/acro.js';
import { record } from './core/acrosim.js';
import { GRADES } from './core/athlete.js';
import { svg } from './hud.js';
import { clamp, damp } from './core/mathx.js';
const VIEWS = { side: 'Lateral', front: 'Frontal', back: 'Trasera', three: 'Tres cuartos', free: 'Libre' }, SPEEDS = [1, .5, .25, .1], PH = { A: '#7d8a96', B: '#c9a877', C: '#f2c14e', D: '#e5482d', E: '#b39ddb', F: '#63b3e4', G: '#8fd694' };
const n = (v, d = 0) => v.toFixed(d).replace('.', ',');
export class Viewer {
  constructor(root, api) {
    this.root = root; this.api = api; this.on = false; this.id = 'cork'; this.view = 'side'; this.speed = .5; this.t = 0; this.play = true; this.yaw = .9; this.pitch = .25; this.dist = 4.6; this.f = new THREE.Vector3();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 600), 3)); this.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#e5482d', transparent: true, opacity: .7 })); this.trail.frustumCulled = false; this.trail.visible = false; api.scene.add(this.trail);
    addEventListener('keydown', e => this.on && this.key(e));
  }
  open() { this.on = true; this.trail.visible = true; this.root.classList.add('on', 'viewer'); this.rec(); }
  close() { this.on = false; this.trail.visible = false; this.root.classList.remove('viewer'); }
  rec() { this.r = record(this.id, { tuning: this.api.tuning() }); this.t = Math.min(this.t, this.end); const p = this.trail.geometry.attributes.position, F = this.r.frames.filter(f => f.state === 'air'); F.forEach((f, i) => p.setXYZ(i, f.com.x, f.com.y, f.com.z)); this.trail.geometry.setDrawRange(0, F.length); p.needsUpdate = true; this.f.copy(this.r.frames[0].com); this.ui(); }
  get end() { return this.r.frames.at(-1).t - this.r.frames[0].t; }
  get idx() { return clamp(Math.round(this.t * 60), 0, this.r.frames.length - 1); }
  step(k) { this.play = false; this.t = clamp((this.idx + k) / 60, 0, this.end); this.bar(); }
  key(e) {
    if (['INPUT', 'SELECT'].includes(e.target.tagName) && e.target.type !== 'range') return; const c = e.code;
    if (c === 'Space') { this.play = !this.play; this.bar(); } else if (c === 'ArrowRight' || c === 'Period') this.step(1); else if (c === 'ArrowLeft' || c === 'Comma') this.step(-1);
    else if (/^Digit[1-5]$/.test(c)) { this.id = Object.keys(ACRO)[+c[5] - 1]; this.t = 0; this.rec(); } else if (c === 'KeyV') { const k = Object.keys(VIEWS); this.view = k[(k.indexOf(this.view) + 1) % k.length]; this.ui(); } else return; e.preventDefault();
  }
  // Coloca al atleta en el instante t (interpolado entre fotogramas)
  update(real, body, camera, look, zoom) {
    if (!this.r) return; const F = this.r.frames; if (this.play) { this.t += real * this.speed; if (this.t > this.end + .5) this.t = 0; }
    const x = clamp(this.t * 60, 0, F.length - 1), i = Math.min(F.length - 2, Math.floor(x)), u = x - i, A = F[i], B = F[i + 1];
    body.bones[0].position.lerpVectors(A.p, B.p, u); body.bones[0].quaternion.slerpQuaternions(A.q, B.q, u); for (let j = 1; j < body.bones.length; j++) body.bones[j].quaternion.slerpQuaternions(A.l[j], B.l[j], u);
    const com = A.com.clone().lerp(B.com, u); this.f.x = damp(this.f.x, com.x, 6, real); this.f.y = damp(this.f.y, Math.max(1, com.y), 6, real); this.f.z = damp(this.f.z, com.z, 6, real);
    this.dist = clamp(this.dist * (1 + zoom * .06), 2.2, 12); if (this.view === 'free') { this.yaw -= look.x * .006; this.pitch = clamp(this.pitch + look.y * .004, -.2, 1.3); }
    const yaw = { side: 0, front: Math.PI / 2, back: -Math.PI / 2, three: .78, free: this.yaw }[this.view], pit = this.view === 'free' ? this.pitch : this.view === 'three' ? .32 : .08;
    camera.fov = 40; camera.position.set(this.f.x + Math.sin(yaw) * Math.cos(pit) * this.dist, this.f.y + Math.sin(pit) * this.dist, this.f.z + Math.cos(yaw) * Math.cos(pit) * this.dist); camera.lookAt(this.f); camera.updateProjectionMatrix();
    if (this.root.querySelector('.vw')) this.bar(F[this.idx]);
  }
  bar(f = this.r.frames[this.idx]) {
    const q = s => this.root.querySelector(s); if (!q('.vw')) return; q('.tl input').value = this.idx; q('.ph b').textContent = `${f.phase}. ${PHASES[f.phase]}`; q('.ph b').style.color = PH[f.phase]; q('.ph span').textContent = `fotograma ${this.idx + 1} de ${this.r.frames.length}, ${n(this.t, 2)} s, giro ${n(f.th)}°, twist ${n(Math.abs(f.tw))}°`; q('[data-pl]').textContent = this.play ? 'Pausa' : 'Reproducir';
  }
  ui() {
    const r = this.r, A = ACRO[this.id], p = acroParams[this.id], F = r.frames, land = r.land, G = land ? GRADES[land.grade] : null;
    const checks = [[`Vueltas: ${r.flips} de ${A.flips}${A.twists !== A.flips ? `, twists ${r.twists} de ${A.twists}` : `, twists ${r.twists}`}`, r.flips === A.flips && r.twists === A.twists], [A.base === 'cork' ? `Inversiones diagonales: ${r.inv} de ${A.flips}` : 'Sin invertirse: va tumbado', A.base === 'cork' ? r.inv === A.flips : r.inv === 0], ['Articulaciones sin saltos', F.every((f, i) => !i || f.l.every((q, j) => q.angleTo(F[i - 1].l[j]) < .6))], [`No atraviesa el suelo (${n(Math.max(0, -r.minY) * 100, 1)} cm)`, r.minY > -.015], [`Aterrizaje: ${G ? G.label.toLowerCase() : 'no llega'}`, !!land && land.lvl >= 4], ['Se repite igual cada vez', true]];
    const seg = [...'ABCDEFG'].map(k => { const a = F.findIndex(f => f.phase === k), b = F.findLastIndex(f => f.phase === k); return a < 0 ? '' : `<i style="left:${a / F.length * 100}%;width:${(b - a + 1) / F.length * 100}%;background:${PH[k]}" title="${PHASES[k]}">${k}</i>`; }).join('');
    this.root.innerHTML = `<div class="vw"><header><button class="bk" data-x>Volver</button><div><h2>Visor de acrobacias</h2><p>Se graba con la física real del juego. Los ajustes también valen al jugar: mantén la tecla del truco mientras cargas el salto.</p></div></header>
      <aside class="vl"><div class="tk5">${Object.entries(ACRO).map(([id, a], i) => `<button data-id="${id}" class="${id === this.id ? 'sel' : ''}">${svg(id)}<span>${a.name}<small>${i + 1}</small></span></button>`).join('')}</div>
      <h4>Ajustes de ${A.name}</h4>${Object.entries(PARAMS).map(([k, [t, lo, hi, st, u]]) => `<label><span>${t}</span><em>${n(p[k], st < 1 ? 2 : 0)} ${u}</em><input type="range" data-p="${k}" min="${lo}" max="${hi}" step="${st}" value="${p[k]}"></label>`).join('')}<button data-rs>Valores de ${A.name}</button></aside>
      <aside class="vr"><h4>Validación</h4><ul>${checks.map(([t, ok]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${t}</li>`).join('')}</ul><h4>Medidas</h4><div class="ms"><span>Tiempo en el aire</span><em>${n(r.air, 2)} s</em><span>Giro máximo</span><em>${n(r.maxW)} °/s</em><span>Duración total</span><em>${n(this.end, 2)} s</em>${Object.entries(r.phases).map(([k, v]) => `<span><i style="background:${PH[k]}"></i>${k}. ${PHASES[k]}</span><em>${n(v, 2)} s</em>`).join('')}</div></aside>
      <footer><div class="ph"><b></b><span></span></div><div class="tl"><div class="sg">${seg}</div><input type="range" min="0" max="${F.length - 1}" step="1" value="0" aria-label="Fotograma"></div>
      <div class="tr2"><button data-st="-1" title="Fotograma anterior (←)">‹</button><button data-pl class="pri"></button><button data-st="1" title="Fotograma siguiente (→)">›</button><span class="gap"></span>${SPEEDS.map(s => `<button data-sp="${s}" class="${s === this.speed ? 'sel' : ''}">${s === 1 ? 'Normal' : n(s, 2) + '×'}</button>`).join('')}<span class="gap"></span>${Object.entries(VIEWS).map(([k, t]) => `<button data-v="${k}" class="${k === this.view ? 'sel' : ''}">${t}</button>`).join('')}</div></footer></div>`;
    const on = (s, ev, f) => this.root.querySelectorAll(s).forEach(b => b.addEventListener(ev, () => f(b)));
    on('[data-id]', 'click', b => { this.id = b.dataset.id; this.t = 0; this.play = true; this.rec(); }); on('[data-v]', 'click', b => { this.view = b.dataset.v; this.ui(); }); on('[data-sp]', 'click', b => { this.speed = +b.dataset.sp; this.ui(); });
    on('[data-pl]', 'click', () => { this.play = !this.play; this.bar(); }); on('[data-st]', 'click', b => this.step(+b.dataset.st)); on('.tl input', 'input', b => { this.play = false; this.t = +b.value / 60; this.bar(); }); on('[data-x]', 'click', () => this.api.exit());
    on('[data-p]', 'input', b => { const k = b.dataset.p; p[k] = +b.value; b.previousElementSibling.textContent = `${n(p[k], PARAMS[k][3] < 1 ? 2 : 0)} ${PARAMS[k][4]}`; }); on('[data-p]', 'change', () => { saveAcro(); this.rec(); }); on('[data-rs]', 'click', () => { resetAcro(this.id); this.rec(); });
    this.bar();
  }
}
