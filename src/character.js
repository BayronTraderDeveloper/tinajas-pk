// Atleta 3D generado por volúmenes anatómicos (campos de distancia) y con piel sobre el esqueleto físico.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Skeleton, BONES, IDX } from './core/body.js';
import { V, clamp } from './core/mathx.js';
import { DEFAULT_LOOK, cleanLook } from './core/characters.js';

const BIND = { uparmL: [0, 0, 48], uparmR: [0, 0, -48], thighL: [0, 0, 5], thighR: [0, 0, -5], shinL: [0, 0, 0], shinR: [0, 0, 0], footL: [0, 0, -5], footR: [0, 0, 5] };
const H = 0.94;
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * .25; };
const smax = (a, b, k) => -smin(-a, -b, k);

function bindSkeleton() { const s = new Skeleton(); s.setTarget(BIND); s.snap(); return s; }
const sk = bindSkeleton();
const toBind = (b, p) => V(...p).applyQuaternion(sk.q[IDX[b]]).add(sk.pos[IDX[b]]).add(V(0, H, 0));
// primitivas -> cierres en espacio de atado
function cone(b, a, c, ra, rb) {
  const A = toBind(b, a), B = toBind(b, c), d = B.clone().sub(A), L2 = d.lengthSq();
  return { b, lo: V(Math.min(A.x, B.x), Math.min(A.y, B.y), Math.min(A.z, B.z)).subScalar(Math.max(ra, rb)), hi: V(Math.max(A.x, B.x), Math.max(A.y, B.y), Math.max(A.z, B.z)).addScalar(Math.max(ra, rb)),
    f: (x, y, z) => { const px = x - A.x, py = y - A.y, pz = z - A.z; let t = (px * d.x + py * d.y + pz * d.z) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - d.x * t, py - d.y * t, pz - d.z * t) - (ra + (rb - ra) * t); } };
}
function ell(b, c, r) {
  const C = toBind(b, c), m = new THREE.Matrix4().makeRotationFromQuaternion(sk.q[IDX[b]].clone().invert()).elements, R = Math.max(...r);
  return { b, lo: C.clone().subScalar(R), hi: C.clone().addScalar(R), f: (x, y, z) => {
    const px = x - C.x, py = y - C.y, pz = z - C.z, lx = m[0] * px + m[4] * py + m[8] * pz, ly = m[1] * px + m[5] * py + m[9] * pz, lz = m[2] * px + m[6] * py + m[10] * pz;
    const ax = lx / r[0], ay = ly / r[1], az = lz / r[2], k0 = Math.sqrt(ax * ax + ay * ay + az * az), bx = ax / r[0], by = ay / r[1], bz = az / r[2], k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    return k1 < 1e-6 ? -Math.min(...r) : k0 * (k0 - 1) / k1; } };
}
// plano local de hueso: devuelve coordenada local para recortes
function localCoord(b) { const q = sk.q[IDX[b]].clone().invert(), o = sk.pos[IDX[b]].clone().add(V(0, H, 0)), v = V(); return (x, y, z) => v.set(x - o.x, y - o.y, z - o.z).applyQuaternion(q); }

const P = {};
P.torso = [
  ell('hips', [0, -.005, .0], [.150, .115, .105]), ell('hips', [.07, -.065, -.045], [.085, .09, .08]), ell('hips', [-.07, -.065, -.045], [.085, .09, .08]),
  ell('spine', [0, .05, .005], [.130, .15, .092]), ell('spine', [0, .02, .05], [.085, .12, .045]),
  ell('chest', [0, .09, -.005], [.158, .165, .108]), ell('chest', [.105, .06, -.04], [.068, .14, .062]), ell('chest', [-.105, .06, -.04], [.068, .14, .062]),
  ell('chest', [.072, .125, .062], [.085, .062, .045]), ell('chest', [-.072, .125, .062], [.085, .062, .045]),
  cone('chest', [.03, .235, -.03], [.165, .20, -.018], .05, .046), cone('chest', [-.03, .235, -.03], [-.165, .20, -.018], .05, .046),
];
P.neck = [cone('neck', [0, -.05, -.016], [0, .02, -.010], .050, .044), cone('neck', [0, .02, -.010], [0, .11, -.004], .044, .041)];
const arm = (k, s) => [
  ell('uparm' + k, [.004 * s, -.02, 0], [.058, .075, .062]), cone('uparm' + k, [0, -.02, 0], [0, -.27, 0], .050, .040), ell('uparm' + k, [0, -.145, .02], [.037, .085, .036]), ell('uparm' + k, [0, -.12, -.022], [.037, .09, .034]),
  cone('forearm' + k, [0, 0, 0], [0, -.26, 0], .040, .0265), ell('forearm' + k, [.006 * s, -.075, .004], [.044, .09, .041]),
];
const leg = (k, s) => [
  cone('thigh' + k, [0, .0, 0], [0, -.41, 0], .088, .053), ell('thigh' + k, [.008 * s, -.17, .028], [.070, .16, .062]), ell('thigh' + k, [0, -.18, -.03], [.060, .15, .055]), ell('thigh' + k, [-.02 * s, -.08, 0], [.065, .11, .075]),
  cone('shin' + k, [0, 0, 0], [0, -.40, -.004], .050, .035), ell('shin' + k, [.012 * s, -.115, -.028], [.040, .105, .042]), ell('shin' + k, [-.014 * s, -.125, -.028], [.038, .10, .042]), ell('shin' + k, [0, .0, .018], [.043, .052, .040]),
];
P.armL = arm('L', 1); P.armR = arm('R', -1); P.legL = leg('L', 1); P.legR = leg('R', -1);
const hand = (k, s) => { const a = [ell('hand' + k, [0, -.05, 0], [.0185, .052, .041])];
  // dedos semiflexionados, como una mano relajada
  [[.031, .0, .0085], [.0105, .004, .009], [-.010, .001, .0088], [-.029, -.008, .0078]].forEach(([z, l, r]) => {
    const J = [[0, -.080, z], [-.009 * s, -.114 - l, z * 1.03], [-.030 * s, -.134 - l, z * 1.0], [-.046 * s, -.124 - l * .6, z * .95]];
    for (let i = 0; i < 3; i++) a.push(cone('hand' + k, J[i], J[i + 1], r + .0015 - i * .0008, r + .0007 - i * .0008));
  });
  a.push(cone('hand' + k, [0, -.02, .025], [-.010 * s, -.062, .052], .0135, .0115), cone('hand' + k, [-.010 * s, -.062, .052], [-.027 * s, -.092, .046], .011, .009), cone('forearm' + k, [0, -.20, 0], [0, -.275, 0], .0297, .0245)); return a; };
P.handL = hand('L', 1); P.handR = hand('R', -1);
P.head = [
  // cráneo, masa de la cara, mandíbula y mentón
  ell('head', [0, .124, -.012], [.0745, .089, .095]), ell('head', [0, .078, .026], [.0575, .080, .066]), ell('head', [0, .033, .036], [.0425, .034, .050]), ell('head', [0, .008, .066], [.0185, .0155, .0175]),
  // pómulos y ángulos de la mandíbula, discretos
  ell('head', [.039, .062, .058], [.020, .017, .018]), ell('head', [-.039, .062, .058], [.020, .017, .018]), ell('head', [.043, .032, .014], [.011, .022, .024]), ell('head', [-.043, .032, .014], [.011, .022, .024]),
  // arco de las cejas
  cone('head', [.045, .104, .077], [.013, .102, .091], .0085, .0085), cone('head', [-.045, .104, .077], [-.013, .102, .091], .0085, .0085),
  // nariz: puente fino, punta y aletas pequeñas
  cone('head', [0, .095, .090], [0, .064, .1055], .0062, .0092), ell('head', [0, .0585, .1035], [.0098, .0088, .0098]), ell('head', [.0098, .0555, .0965], [.0072, .0062, .0078]), ell('head', [-.0098, .0555, .0965], [.0072, .0062, .0078]),
  // labios
  ell('head', [0, .0312, .0905], [.0188, .0050, .0082]), ell('head', [0, .0205, .0885], [.0168, .0060, .0082]),
  // orejas
  ell('head', [.0765, .077, -.007], [.0095, .028, .0175]), ell('head', [-.0765, .077, -.007], [.0095, .028, .0175]),
];
const foot = (k, s) => [cone('foot' + k, [0, -.026, -.048], [.004 * s, -.040, .10], .043, .037), ell('foot' + k, [.004 * s, -.044, .105], [.046, .034, .075]), cone('foot' + k, [0, .035, -.012], [0, -.02, -.008], .042, .046), ell('foot' + k, [0, -.02, .035], [.038, .04, .07])];
P.footL = foot('L', 1); P.footR = foot('R', -1);

const uni = (prims, k) => (x, y, z) => { let d = 9; for (let i = 0; i < prims.length; i++) { const v = prims[i].f(x, y, z); d = d === 9 ? v : smin(d, v, k); } return d; };
const noise = (x, y, z) => Math.sin(x * 31 + Math.sin(y * 23) * 1.7) * Math.sin(y * 19 + z * 27) * .5 + Math.sin(x * 57 - y * 41 + z * 37) * .3;

// Redes de superficie: malla suave con vértices compartidos
function surfaceNet(f, lo, hi, h) {
  const nx = Math.ceil((hi.x - lo.x) / h) + 3, ny = Math.ceil((hi.y - lo.y) / h) + 3, nz = Math.ceil((hi.z - lo.z) / h) + 3, ox = lo.x - h, oy = lo.y - h, oz = lo.z - h;
  const g = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) g[id(i, j, k)] = f(ox + i * h, oy + j * h, oz + k * h);
  const vi = new Int32Array(nx * ny * nz).fill(-1), pos = [], idx = [], c = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let m = 0; for (let n = 0; n < 8; n++) { c[n] = g[id(i + (n & 1), j + (n >> 1 & 1), k + (n >> 2))]; if (c[n] < 0) m |= 1 << n; }
    if (m === 0 || m === 255) continue; let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let a = 0; a < 8; a++) for (let ax = 1; ax < 8; ax <<= 1) { const b = a | ax; if (b === a || (c[a] < 0) === (c[b] < 0)) continue; const t = c[a] / (c[a] - c[b]); sx += (a & 1) + (ax === 1 ? t : 0); sy += (a >> 1 & 1) + (ax === 2 ? t : 0); sz += (a >> 2) + (ax === 4 ? t : 0); cnt++; }
    vi[id(i, j, k)] = pos.length / 3; pos.push(ox + (i + sx / cnt) * h, oy + (j + sy / cnt) * h, oz + (k + sz / cnt) * h);
  }
  const quad = (a, b, d, e, flip) => { if (a < 0 || b < 0 || d < 0 || e < 0) return; flip ? idx.push(a, d, b, a, e, d) : idx.push(a, b, d, a, d, e); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const s = g[id(i, j, k)] < 0;
    if (s !== g[id(i + 1, j, k)] < 0) quad(vi[id(i, j - 1, k - 1)], vi[id(i, j, k - 1)], vi[id(i, j, k)], vi[id(i, j - 1, k)], !s);
    if (s !== g[id(i, j + 1, k)] < 0) quad(vi[id(i - 1, j, k - 1)], vi[id(i - 1, j, k)], vi[id(i, j, k)], vi[id(i, j, k - 1)], !s);
    if (s !== g[id(i, j, k + 1)] < 0) quad(vi[id(i - 1, j - 1, k)], vi[id(i, j - 1, k)], vi[id(i, j, k)], vi[id(i - 1, j, k)], !s);
  }
  const e = h * .5, nor = new Float32Array(pos.length);
  for (let n = 0; n < pos.length; n += 3) { const [x, y, z] = [pos[n], pos[n + 1], pos[n + 2]]; let a = f(x + e, y, z) - f(x - e, y, z), b = f(x, y + e, z) - f(x, y - e, z), d = f(x, y, z + e) - f(x, y, z - e); const l = Math.hypot(a, b, d) || 1; nor[n] = a / l; nor[n + 1] = b / l; nor[n + 2] = d / l; }
  return { pos: new Float32Array(pos), nor, idx };
}
function build(f, prims, weightPrims, h, color, pad = .03, accent = null) {
  const lo = V(9, 9, 9), hi = V(-9, -9, -9); prims.forEach(p => { lo.min(p.lo); hi.max(p.hi); }); lo.subScalar(pad); hi.addScalar(pad);
  const m = surfaceNet(f, lo, hi, h), n = m.pos.length / 3, geo = new THREE.BufferGeometry();
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const byBone = {}; weightPrims.forEach(p => (byBone[p.b] ||= []).push(p)); const names = Object.keys(byBone), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2]; let ds = names.map(b => { let d = 9; for (const p of byBone[b]) d = Math.min(d, p.f(x, y, z)); return [IDX[b], d]; }); ds.sort((a, b) => a[1] - b[1]); ds = ds.slice(0, 4);
    const d0 = Math.max(0, ds[0][1]); let s = 0; const w = ds.map(d => { const v = Math.exp(-Math.max(0, d[1] - d0) / .016); s += v; return v; });
    ds.forEach((d, j) => { si[i * 4 + j] = d[0]; sw[i * 4 + j] = w[j] / s; });
    color(x, y, z, c, m.nor[i * 3 + 1]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; uv[i * 2] = (x + z) * 14; uv[i * 2 + 1] = y * 14;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (accent) { const ac = new Float32Array(n); for (let i = 0; i < n; i++) ac[i] = accent(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); geo.setAttribute('accent', new THREE.BufferAttribute(ac, 1)); }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); geo.setIndex(m.idx); return geo;
}
function knit() { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 64, 64); for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) { g.fillStyle = '#b5b5b5'; g.beginPath(); g.ellipse(x + 2.5, y + 4, 1.6, 3.6, .5, 0, 7); g.fill(); g.beginPath(); g.ellipse(x + 5.5, y + 4, 1.6, 3.6, -.5, 0, 7); g.fill(); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }

// Franjas de color con borde nítido: distancia con signo interpolada y recortada en el píxel
function striped(params, colorA) {
  const m = new THREE.MeshPhysicalMaterial(params), u = { value: new THREE.Color(colorA) };
  m.onBeforeCompile = sh => {
    sh.uniforms.uAcc = u; sh.vertexShader = 'attribute float accent; varying float vAcc;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAcc = accent;');
    sh.fragmentShader = 'uniform vec3 uAcc; varying float vAcc;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n { float aw = fwidth(vAcc) + 1e-5; diffuseColor.rgb = mix(diffuseColor.rgb, uAcc, smoothstep(-aw, aw, -vAcc)); }');
  };
  return m;
}
export const LOOK = DEFAULT_LOOK;
const syncBones = bones => a => { bones[0].position.copy(a.rootP); bones[0].quaternion.copy(a.rootQ); for (let i = 1; i < bones.length; i++) bones[i].quaternion.copy(a.sk.local[i]); };
// Otro jugador: su propio personaje (mismo generador, su aspecto)
export const cloneCharacter = (src, look) => createCharacter(look);
// Personaje completo según su aspecto: cuerpo (altura y complexión), cara, pelo, barba y ropa
export function createCharacter(look0 = DEFAULT_LOOK) {
  const look = cleanLook(look0), kH = look.height / 1.78, kW = kH * (1 + .1 * look.build), inf = .008 * look.build;
  const group = new THREE.Group(), bones = BONES.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
  BONES.forEach((b, i) => { const o = b.base.off; if (b.p >= 0) { bones[b.p].add(bones[i]); bones[i].position.set(o[0] * kW, o[1] * kH, o[2] * kW); bones[i].quaternion.copy(sk.local[i]); } else bones[i].position.set(0, H * kH, 0); });
  group.add(bones[0]); group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const add = (geo, mat) => { geo.scale(kW, kH, kW); const m = new THREE.SkinnedMesh(geo, mat); m.bind(skeleton, new THREE.Matrix4()); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; group.add(m); return m; };
  const k = knit();
  const skinM = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .56, sheen: .35, sheenRoughness: .5, sheenColor: new THREE.Color('#c9563c') });
  const clothOpt = { vertexColors: true, roughness: .86, sheen: .5, sheenRoughness: .6, bumpMap: k, bumpScale: .5, side: THREE.DoubleSide };
  const clothA = striped(clothOpt, look.accent), pantsM = striped(clothOpt, look.accent), sockM = striped(clothOpt, look.accent), shoeM = striped({ vertexColors: true, roughness: .62, bumpMap: k, bumpScale: .4 }, '#fbfbf8'), soleM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5 }), hairM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .72 });
  const C = s => new THREE.Color(s), cs = C(look.skin), cFill = col => (x, y, z, c) => c.copy(col);
  const red = C('#a5543f'), dark = cs.clone().multiplyScalar(.78);
  const LC = {}; for (const b of ['uparmL', 'uparmR', 'forearmL', 'forearmR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'head', 'hips', 'chest', 'neck', 'spine']) LC[b] = localCoord(b);
  const skinCol = (x, y, z, c) => { c.copy(cs).offsetHSL(0, 0, noise(x * .6, y * .6, z * .6) * .012); };
  const bareArms = look.top === 'tirantes' || look.top === 'sin', longSleeve = look.top === 'sudadera', pants = look.bottom === 'largo';
  for (const s of ['L', 'R']) {
    let f = uni(P['arm' + s], .03); add(build((x, y, z) => smax(f(x, y, z) - inf, Math.max(bareArms ? -9 : LC['uparm' + s](x, y, z).y + .06, -LC['forearm' + s](x, y, z).y - .238), .004), P['arm' + s], P['arm' + s], .0085, skinCol), skinM);
    if (!pants) { f = uni(P['leg' + s], .035); add(build((x, y, z) => Math.max(f(x, y, z) - inf, LC['thigh' + s](x, y, z).y + .16, -LC['shin' + s](x, y, z).y - .34), P['leg' + s], P['leg' + s], .0095, skinCol), skinM); }
    f = uni(P['hand' + s], .012); add(build((x, y, z) => Math.max(f(x, y, z), LC['forearm' + s](x, y, z).y + .228), P['hand' + s], P['hand' + s], .0042, skinCol, .012), skinM);
    const lf = uni(P['leg' + s], .035), shinP = P['leg' + s].filter(p => p.b.startsWith('shin'));
    if (!pants) add(build((x, y, z) => { const q = LC['shin' + s](x, y, z); return smax(lf(x, y, z) - inf - .005 - .0012 * Math.sin(q.y * 420), Math.max(q.y + .285, -q.y - .42), .006); }, shinP, shinP, .007, cFill(C(look.sock)), .03, (x, y, z) => Math.abs(LC['shin' + s](x, y, z).y + .312) - .005), sockM);
    const ff = uni(P['foot' + s], .035), sg = s === 'L' ? 1 : -1;
    add(build((x, y, z) => { const q = LC['foot' + s](x, y, z); return smax(smax(ff(x, y, z), -q.y - .052, .01), q.y - .018 - Math.max(0, -q.z) * .25, .008); }, P['foot' + s], P['foot' + s], .0055, (x, y, z, c) => {
      const q = LC['foot' + s](x, y, z); c.set(look.shoe); if (q.z > .118 && q.y < -.036) c.copy(C(look.shoe)).multiplyScalar(.82); }, .03, (x, y, z) => { const q = LC['foot' + s](x, y, z); const laces = Math.max(Math.abs(q.x) - .016, q.z - .085, .008 - q.z, Math.abs(((q.z + .2) % .019) - .0095) - .0045); const swoop = Math.max(Math.abs(q.y + .031 - (q.z - .015) * .3) - .006, .028 - Math.abs(q.x), q.z - .07, -.035 - q.z); return Math.min(laces, swoop); }), shoeM);
    const soleF = (x, y, z) => { const q = LC['foot' + s](x, y, z), zc = (q.z - .05) / .132, wd = .0405 + .008 * clamp(q.z / .1, -.3, 1) - .006 * Math.max(0, 1 - Math.abs(q.z - .02) / .05), ex = Math.hypot((q.x - .003 * sg) / wd, Math.sign(zc) * Math.pow(Math.abs(zc), 1.9)) - 1; return smax(ex * wd * .8, Math.abs(q.y + .0585 - Math.max(0, q.z - .1) * .12) - .0125, .008); };
    add(build(soleF, P['foot' + s], [P['foot' + s][0]], .005, (x, y, z, c) => c.set(LC['foot' + s](x, y, z).y < -.066 ? '#2a2c30' : '#f6f5f0')), soleM);
  }
  const torsoF = uni([...P.torso, P.legL[0], P.legR[0], P.legL[3], P.legR[3]], .04), neckF = uni([P.neck[0]], .02);
  // torso al aire (tirantes o sin camiseta): pecho y abdomen marcados según la complexión
  if (bareArms) {
    const tp = [...P.torso, P.armL[0], P.armR[0]], tf = uni([...tp, P.legL[0], P.legR[0]], .045);
    add(build((x, y, z) => { const hp = LC.hips(x, y, z).y; let d = tf(x, y, z) - inf - .001; d = smin(d, neckF(x, y, z), .03); return smax(d, -hp - .07, .01); }, tp, tp, .009, (x, y, z, c) => { skinCol(x, y, z, c); const ch = LC.chest(x, y, z), sp = LC.spine(x, y, z); if (z > .05) { const pec = Math.abs(ch.y - .055) < .006 && Math.abs(x) > .015 && Math.abs(x) < .12, ab = sp.y > -.02 && sp.y < .14 && (Math.abs(x) < .004 || Math.abs((sp.y % .05) - .025) < .003) && Math.abs(x) < .05; if (pec || ab) c.multiplyScalar(1 - .06 * (.4 + look.build)); } }), skinM);
  }
  // parte de arriba
  if (look.top !== 'sin') {
    const tank = look.top === 'tirantes', hood = look.top === 'sudadera', thick = hood ? .016 : .010;
    const shirtP = tank ? [...P.torso] : hood ? [...P.torso, ...P.armL, ...P.armR] : [...P.torso, ...P.armL.slice(0, 4), ...P.armR.slice(0, 4)], sf = uni([...shirtP, P.legL[0], P.legR[0], P.legL[3], P.legR[3]], .04);
    const shirt = (x, y, z) => {
      const l = LC.uparmL(x, y, z), ly = l.y, r = LC.uparmR(x, y, z), ry = r.y, hp = LC.hips(x, y, z).y, side = x > 0 ? ly : ry, ch = LC.chest(x, y, z);
      const hem = clamp((.12 - hp) / .2, 0, 1), sl = Math.abs(x) > .17 ? clamp((-side - .04) / .12, 0, 1) : 0;
      let d = sf(x, y, z) - inf - thick - hem * .016 - sl * .008 - noise(x, y, z) * (.0022 + .003 * hem) - Math.sin(y * 46 + x * 18) * .0016 * hem;
      if (hood) { const fa = x > 0 ? LC.forearmL(x, y, z) : LC.forearmR(x, y, z); d = smax(d, -fa.y - .232, .004); d = smin(d, Math.hypot(ch.x / .105, (ch.y - .255) / .06, (ch.z + .075) / .06) * .06 - .06, .03); }
      else if (tank) { d = smax(d, -(Math.hypot(Math.abs(ch.x) - .2, ch.y - .2, ch.z + .005) - .095), .012); d = smax(d, -(Math.hypot(ch.x * .9, ch.y - .26, Math.max(0, ch.z - .02) * 1.4) - .075), .01); }
      else d = smax(d, Math.abs(x) > .16 && ch.y > -.06 ? -side - .165 : -9, .004);
      d = smax(d, -hp - .085, .004);
      return smax(d, -(neckF(x, y, z) - .014 - Math.max(0, z) * .12), .012);
    };
    const sh = C(look.shirt);
    add(build(shirt, shirtP, shirtP, .009, cFill(sh), .03, (x, y, z) => { const ch = LC.chest(x, y, z); const band = Math.max(Math.abs(ch.y - .03 + Math.abs(x) * .3) - .02, Math.abs(x) - .2); const s2 = x > 0 ? LC.uparmL(x, y, z) : LC.uparmR(x, y, z), fa = x > 0 ? LC.forearmL(x, y, z) : LC.forearmR(x, y, z); const cuff = hood ? Math.abs(fa.y + .22) - .012 : Math.max(s2.y + .147, .2 - Math.abs(x), -.06 - ch.y); const col = Math.max(neckF(x, y, z) - .021 - Math.max(0, z) * .12, (z < -.03 ? .225 : .19) - ch.y); return Math.min(tank ? 9 : band, cuff, col); }), clothA);
  }
  // pantalón: corto o largo hasta el tobillo, con franja lateral
  const shortsP = [P.torso[0], P.torso[1], P.torso[2], ...P.legL.slice(0, pants ? 8 : 4), ...P.legR.slice(0, pants ? 8 : 4)], A = uni([P.torso[0], P.torso[1], P.torso[2]], .04), B = uni(P.legL.slice(0, pants ? 8 : 4), .035), D = uni(P.legR.slice(0, pants ? 8 : 4), .035);
  add(build((x, y, z) => { const l = LC[x > 0 ? 'thighL' : 'thighR'](x, y, z), sh2 = LC[x > 0 ? 'shinL' : 'shinR'](x, y, z), fl = clamp((-l.y - .04) / .22, 0, 1); let d = smin(smin(A(x, y, z), x > 0 ? B(x, y, z) : D(x, y, z), .05), x > 0 ? D(x, y, z) : B(x, y, z), .015) - inf - .012 - fl * (pants ? .010 : .017) - noise(x * .8, y * .8, z * .8) * (.002 + .005 * fl); d = smax(d, pants ? -sh2.y - .36 : -l.y - .262, .004); return smax(d, LC.hips(x, y, z).y + .02, .004); }, shortsP, shortsP, .0095, cFill(C(look.shorts)), .03, (x, y, z) => { const l = LC[x > 0 ? 'thighL' : 'thighR'](x, y, z); return Math.max(Math.abs(l.z + .005) - .011, .05 - l.x * Math.sign(x)); }), pantsM);
  // cabeza
  const hf = uni(P.head, .014), nk = uni(P.neck, .03);
  const sock = (x, y, z) => { const q = LC.head(x, y, z); return Math.hypot((Math.abs(q.x) - .031) / 1.25, q.y - .0855, q.z - .098) - .0155; };
  const mouth = (x, y, z) => { const q = LC.head(x, y, z); return Math.max(Math.hypot((q.y - .0258) * 1, q.z - .097) - .0028, Math.abs(q.x) - .0175); };
  const headF = (x, y, z) => { let d = smin(hf(x, y, z), nk(x, y, z), .035); d = smax(d, -sock(x, y, z), .012); d = smax(d, -mouth(x, y, z), .004); return Math.max(d, -(y - (toBind('neck', [0, -.05, 0]).y))); };
  const beardC = C(look.hairColor), beardOn = look.beard !== 'no';
  add(build(headF, [...P.head, ...P.neck], [...P.head.slice(0, 1), ...P.head.slice(2, 3), ...P.neck, cone('chest', [-.06, .2, -.01], [.06, .2, -.01], .05, .05)], .0042, (x, y, z, c) => {
    const q = LC.head(x, y, z); c.copy(cs); const lip = Math.hypot(q.x / .021, (q.y - .026) / .0115); if (lip < 1 && q.z > .084) c.lerp(red, .45 * (1 - lip * .5)); const ck = Math.hypot(Math.abs(q.x) - .040, q.y - .058); c.lerp(red, Math.max(0, .10 - ck * 3) * (q.z > .03 ? 1 : 0)); const es = sock(x, y, z); if (q.z > .05 && es < .005) c.lerp(dark, .35);
    if (beardOn && q.z > -.005 && lip > 1.2) { const jaw = q.y < .05 - Math.max(0, Math.abs(q.x) - .03) * .4 && q.y > -.03, goatee = Math.abs(q.x) < .023 && q.y < .019 && q.y > -.012, stache = Math.abs(q.x) < .024 && q.y > .033 && q.y < .043 && q.z > .08; if (look.beard === 'corta' ? jaw : goatee || stache) c.lerp(beardC, .62); }
  }, .012), skinM);
  // pelo: corto, rapado, largo o rizado
  const cr = uni([P.head[0]], .01), hairTone = (x, y, z, c) => { c.set(look.hairColor).offsetHSL(0, 0, Math.max(0, Math.sin(x * 260 + z * 40)) * .03 - .01); if (look.hair === 'rapado') c.lerp(cs, .42); };   // rapado: se ve la piel
  const HAIRF = {
    corto: (x, y, z) => { const q = LC.head(x, y, z); const top = clamp((q.y - .13) / .07, 0, 1); const st = Math.sin(q.x * 260 + Math.sin(q.z * 90) * 2) * .0016 + noise(x * 2.4, y * 2.4, z * 2.4) * .0035 * top; const line = .105 + .62 * q.z + (Math.abs(q.x) > .055 ? -.012 : 0) + .0035 * Math.sin(q.x * 150); return smax(cr(x, y, z) - .007 - .013 * top * (1 + q.z * 4) - st, line - q.y, .012); },
    rapado: (x, y, z) => { const q = LC.head(x, y, z); const line = .098 + .6 * q.z + (Math.abs(q.x) > .055 ? -.01 : 0); return smax(cr(x, y, z) - .0028 - noise(x * 4, y * 4, z * 4) * .0006, line - q.y, .008); },
    // largo: pegado arriba, raya al lado, cae por los lados hasta la mandíbula y por detrás hasta la nuca
    largo: (x, y, z) => { const q = LC.head(x, y, z), drop = clamp((.13 - q.y) / .1, 0, 1); const st = Math.sin(q.x * 300 + q.y * 30) * .0018 * drop + Math.sin(q.z * 220 + q.x * 60) * .0012; const yb = q.z > .06 ? .118 + .12 * Math.max(0, q.x + .01) : q.z > .0 ? .045 - .2 * Math.max(0, q.z - .03) : .01, part = Math.exp(-Math.pow((q.x + .022) / .006, 2)) * clamp((q.y - .16) / .03, 0, 1) * .004; return smax(cr(x, y, z) - .0075 - .009 * drop - st + part, yb - q.y, .012); },
    rizado: (x, y, z) => { const q = LC.head(x, y, z); const curl = (Math.sin(q.x * 230) * Math.sin(q.y * 210) * Math.sin(q.z * 220)) * .0045 + noise(x * 3, y * 3, z * 3) * .003; const line = .102 + .58 * q.z; return smax(cr(x, y, z) - .022 - curl, line - q.y, .014); },
  };
  add(build(HAIRF[look.hair], [P.head[0]], [P.head[0]], .0046, hairTone, .045), hairM);
  const brow = [cone('head', [.046, .1055, .081], [.030, .1095, .0955], .0028, .0036), cone('head', [.030, .1095, .0955], [.013, .1055, .1015], .0036, .0030), cone('head', [-.046, .1055, .081], [-.030, .1095, .0955], .0028, .0036), cone('head', [-.030, .1095, .0955], [-.013, .1055, .1015], .0036, .0030)];
  add(build(uni(brow, .004), brow, brow, .0026, cFill(C(look.hairColor).multiplyScalar(.8)), .01), hairM);
  // ojos con párpados: miran tranquilos, sin saltarse de la cara
  const eyeW = new THREE.MeshPhysicalMaterial({ color: '#f2eee8', roughness: .18, clearcoat: 1 }), iris = new THREE.MeshPhysicalMaterial({ color: look.eyes, roughness: .12, clearcoat: 1 }), pup = new THREE.MeshBasicMaterial({ color: '#050505' }), lidM = new THREE.MeshStandardMaterial({ color: cs.clone().multiplyScalar(.92), roughness: .6 }), lashM = new THREE.MeshStandardMaterial({ color: '#15100d', roughness: .8 });
  const head = bones[IDX.head];
  for (const s of [1, -1]) {
    const e = new THREE.Group(); e.position.set(.031 * s * (kW / kW), .0855, .0738); e.add(new THREE.Mesh(new THREE.SphereGeometry(.0134, 24, 16), eyeW)); const cap = (r, a, m) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, a), m); o.rotation.x = Math.PI / 2; e.add(o); }; cap(.0137, .48, iris); cap(.01385, .22, pup);
    const lid = (r, a, rx, m) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, a), m); o.rotation.x = rx; e.add(o); return o; };
    lid(.0146, .82, .42, lidM); lid(.0148, .16, 1.12, lashM).scale.set(1, .6, 1); lid(.0145, .5, Math.PI - .45, lidM);
    e.scale.set(1 / kW * kW, 1, 1); head.add(e);
  }
  // los ojos van en el hueso de la cabeza (sin la escala de la malla): se colocan a la escala del personaje
  head.children.forEach(o => { if (o.isGroup) { o.position.set(o.position.x * kW, o.position.y * kH, o.position.z * kW); o.scale.set(kW, kH, kW); } });
  group.bones = bones; group.look = look;
  group.sync = syncBones(bones);
  return group;
}
