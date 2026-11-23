// Press («pinchar» un borde): huella de la zapatilla donde quedó, destello en el borde, aviso de quién la pinchó
// y una etiqueta fija con los que ya la han pinchado. Sirve para el jugador y para los de la sala.
import * as THREE from 'three';

const SOLE = (() => {   // suela con dibujo, blanca para teñirla del color del jugador (se ve sobre cualquier superficie), vista desde arriba (la punta hacia +y de la textura)
  const c = document.createElement('canvas'); c.width = 64; c.height = 160; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(32, 46, 27, 44, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(32, 124, 22, 34, 0, 0, Math.PI * 2); g.fill(); g.fillRect(12, 46, 40, 80);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 4; for (let y = 12; y < 156; y += 11) { g.beginPath(); g.moveTo(10, y); g.lineTo(54, y + 4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();

function label(lines, { big = false, color = '#ffc531' } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), f1 = big ? 64 : 34, f2 = big ? 34 : 26, pad = 18;
  g.font = `800 ${f1}px system-ui, sans-serif`; const w1 = g.measureText(lines[0]).width; g.font = `600 ${f2}px system-ui, sans-serif`; const w2 = Math.max(0, ...lines.slice(1).map(l => g.measureText(l).width));
  c.width = Math.ceil(Math.max(w1, w2) + pad * 2); c.height = Math.ceil(f1 * 1.25 + (lines.length - 1) * f2 * 1.3 + pad * 1.4);
  g.fillStyle = 'rgba(14,16,20,.82)'; g.beginPath(); g.roundRect(0, 0, c.width, c.height, 18); g.fill(); g.strokeStyle = color; g.lineWidth = 4; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'top'; g.fillStyle = color; g.font = `800 ${f1}px system-ui, sans-serif`; g.fillText(lines[0], c.width / 2, pad * .7);
  g.fillStyle = '#fff'; g.font = `600 ${f2}px system-ui, sans-serif`; lines.slice(1).forEach((l, i) => g.fillText(l, c.width / 2, pad * .7 + f1 * 1.2 + i * f2 * 1.3));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); const h = big ? .62 : .42; s.scale.set(h * c.width / c.height, h, 1); s.renderOrder = 20; return s;
}

export class PressMarks {
  constructor(scene) { this.scene = scene; this.root = new THREE.Group(); scene.add(this.root); this.fx = []; this.spots = new Map(); this.prints = []; }
  clear() { for (const o of [...this.root.children]) { this.root.remove(o); o.traverse(m => { m.material?.map !== SOLE && m.material?.map?.dispose(); m.material?.dispose?.(); }); } this.fx = []; this.spots.clear(); this.prints = []; }
  // e = { p:[x,y,z] borde, prints:[{edge,toe}], name, color, mine }
  add(e) {
    const p = new THREE.Vector3(...e.p), color = e.color || '#ffc531';
    for (const q of e.prints || []) {
      const a = new THREE.Vector3(...q.edge), b = new THREE.Vector3(...q.toe), d = b.clone().sub(a), L = d.length(); if (L < .02 || L > .4) continue;
      // la huella entera de la zapatilla mide unos 27 cm: solo se ve la parte que quedó encima, desde el borde a la punta
      const full = .27, cut = Math.min(1, L / full), g = new THREE.PlaneGeometry(.1, L), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) if (uv.getY(i) < .5) uv.setY(i, 1 - cut);
      g.translate(0, -L / 2, 0);   // la punta en el origen y el resto hacia el borde
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: SOLE, color, transparent: true, opacity: .9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(-d.x, -d.z); m.position.copy(b).setY(b.y + .006); m.renderOrder = 3; this.root.add(m); this.prints.push(m);
      // zapatilla fantasma justo donde quedó: media suela encima del borde y la otra mitad al aire
      const dir = d.clone().normalize(), shoe = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .5, depthWrite: false });
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(.045, .17, 4, 10), mat); up.rotation.x = Math.PI / 2; up.scale.set(1, 1, .75); up.position.y = .045; shoe.add(up);
      const so = new THREE.Mesh(new THREE.BoxGeometry(.095, .022, .27), new THREE.MeshBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: .75, depthWrite: false })); so.position.y = .011; shoe.add(so);
      shoe.position.copy(b).addScaledVector(dir, -full / 2 + .01).setY(b.y + .004); shoe.rotation.y = Math.atan2(dir.x, dir.z); shoe.renderOrder = 4; this.root.add(shoe); this.prints.push(shoe);
      this.fx.push({ o: shoe, t: 0, T: 1e9, kind: 'shoe' });
      if (this.prints.length > 60) { const o = this.prints.shift(); this.root.remove(o); o.traverse(m => { m.geometry?.dispose(); m.material?.dispose?.(); }); }
    }
    // destello a lo largo del borde
    const fl = new THREE.Mesh(new THREE.RingGeometry(.05, .09, 32), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    fl.position.copy(p).setY(p.y + .02); fl.rotation.x = -Math.PI / 2; this.root.add(fl); this.fx.push({ o: fl, t: 0, T: .9, kind: 'ring' });
    // aviso que sube
    const pop = label(['¡PRESS!', `${e.name} la pinchó`], { big: true, color }); pop.position.copy(p).setY(p.y + 1.1); this.root.add(pop); this.fx.push({ o: pop, t: 0, T: 2.2, kind: 'pop', y: p.y + 1.1 });
    // etiqueta fija del borde: quién la ha pinchado ya (al lado y por debajo del borde, para no tapar al que está encima)
    const k = `${Math.round(p.x * 2)}:${Math.round(p.y * 4)}:${Math.round(p.z * 2)}`, s = this.spots.get(k) || { names: [], tag: null, p };
    s.names = [e.name, ...s.names.filter(n => n !== e.name)]; if (s.tag) { this.root.remove(s.tag); s.tag.material.map.dispose(); s.tag.material.dispose(); }
    const n = s.names.length, who = s.names.slice(0, 3).join(', ') + (n > 3 ? ` y ${n - 3} más` : '');
    s.tag = label([`👟 Pinchada ×${n}`, n === 1 ? `por ${who}` : `ya la pincharon ${who}`], { color }); const out = new THREE.Vector3(); for (const q of e.prints || []) out.add(new THREE.Vector3(q.edge[0] - q.toe[0], 0, q.edge[2] - q.toe[2])); if (out.lengthSq() < 1e-6) out.set(-1, 0, 0); out.normalize(); s.tag.position.copy(s.p).addScaledVector(out, 1.05).setY(s.p.y + .3); s.tag.material.opacity = .9; this.root.add(s.tag); this.spots.set(k, s);
    return n;
  }
  update(dt) {
    this.fx = this.fx.filter(f => {
      f.t += dt; const k = f.t / f.T;
      if (f.kind === 'shoe') { const k2 = Math.min(1, f.t / .25); f.o.scale.setScalar(1 + .35 * (1 - k2) * (1 - k2)); return k2 < 1; }
      if (f.kind === 'ring') { const s = 1 + k * 7; f.o.scale.set(s, s, s); f.o.material.opacity = 1 - k; }
      else { const pop = Math.min(1, f.t / .18), sc = pop < 1 ? .6 + .5 * pop : 1 + .1 * Math.max(0, 1 - (f.t - .18) / .3); f.o.position.y = f.y + f.t * .35; f.o.material.opacity = k > .7 ? (1 - k) / .3 : 1; if (!f.base) f.base = f.o.scale.clone(); f.o.scale.copy(f.base).multiplyScalar(sc); }
      if (k >= 1) { this.root.remove(f.o); f.o.geometry?.dispose?.(); f.o.material.map?.dispose?.(); f.o.material.dispose(); return false; }
      return true;
    });
  }
}
