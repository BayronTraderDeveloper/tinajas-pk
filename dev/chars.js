// Retratos y cuerpos de los personajes (solo desarrollo): import('/dev/chars.js').then(m => m.sheet())
import * as THREE from 'three';
import { createCharacter } from '/src/character.js';
import { CHARACTERS } from '/src/core/characters.js';
export function sheet({ face = true, looks = CHARACTERS.map(c => c.look), yaw = .35 } = {}) {
  const L = window.__lab, R = L.renderer, scene = new THREE.Scene(); scene.background = new THREE.Color('#c9d6df'); scene.environment = L.scene.environment; scene.environmentIntensity = .4; scene.add(new THREE.HemisphereLight('#dfeaf2', '#8a7358', .7)); const sun = new THREE.DirectionalLight('#fff0d8', 2.2); sun.position.set(-2, 4, 5); scene.add(sun);
  let cv = document.getElementById('sheet'); if (!cv) { cv = document.createElement('canvas'); cv.id = 'sheet'; cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:99;background:#222;object-fit:contain'; document.body.append(cv); }
  const n = looks.length, cols = face ? n * 2 : n, w = 1600 / cols, h = face ? 700 : 1000; cv.width = 1600; cv.height = h; const g = cv.getContext('2d'), cam = new THREE.PerspectiveCamera(face ? 18 : 30, w / h, .05, 50);
  looks.forEach((look, i) => { const c = createCharacter(look); scene.add(c); c.updateMatrixWorld(true); const head = new THREE.Vector3(); c.bones[4].getWorldPosition(head);
    for (const [j, a] of (face ? [[0, 0], [1, yaw + .6]] : [[0, yaw]])) { if (face) { cam.position.set(head.x + Math.sin(a) * 1.25, head.y + .12, head.z + Math.cos(a) * 1.25); cam.lookAt(head.x, head.y + .1, head.z); } else { cam.position.set(Math.sin(a) * 4.2, look.height * .55, Math.cos(a) * 4.2); cam.lookAt(0, look.height * .5, 0); } cam.aspect = w / h; cam.updateProjectionMatrix(); R.setSize(w, h, false); R.render(scene, cam); g.drawImage(R.domElement, 0, 0, R.domElement.width, R.domElement.height, (face ? i * 2 + j : i) * w, 0, w, h); }
    scene.remove(c); });
  dispatchEvent(new Event('resize')); return 'ok';
}
