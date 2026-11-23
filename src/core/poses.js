// Posturas objetivo (grados por articulación). Los músculos tiran hacia ellas; no son animaciones.
const sym = p => {
  const o = {};
  for (const [k, e] of Object.entries(p)) {
    if (/^(uparm|forearm|hand|thigh|shin|foot)$/.test(k)) { o[k + 'L'] = e; o[k + 'R'] = [e[0], -e[1], -e[2]]; }
    else o[k] = e;
  }
  return o;
};
export const POSES = {
  stand: sym({ spine: [3, 0, 0], chest: [-2, 0, 0], uparm: [2, 0, 9], forearm: [-16, 0, 0], hand: [0, 0, 0], thigh: [-4, 0, 2], shin: [8, 0, 0], foot: [-4, 0, 0] }),
  charge: sym({ spine: [16, 0, 0], chest: [10, 0, 0], neck: [-8, 0, 0], head: [-14, 0, 0], uparm: [48, 0, 10], forearm: [-14, 0, 0] }),
  launch: sym({ spine: [-6, 0, 0], chest: [-6, 0, 0], head: [-4, 0, 0], uparm: [-158, 0, 10], forearm: [-12, 0, 0], thigh: [0, 0, 2], shin: [4, 0, 0], foot: [48, 0, 0] }),
  open: sym({ spine: [-3, 0, 0], chest: [-3, 0, 0], uparm: [-30, 0, 42], forearm: [-22, 0, 0], thigh: [-8, 0, 3], shin: [14, 0, 0], foot: [28, 0, 0] }),
  layout: sym({ spine: [-5, 0, 0], chest: [-5, 0, 0], uparm: [-14, 0, 16], forearm: [-14, 0, 0], thigh: [2, 0, 1], shin: [4, 0, 0], foot: [44, 0, 0] }),
  tuck: sym({ spine: [34, 0, 0], chest: [26, 0, 0], neck: [10, 0, 0], head: [8, 0, 0], uparm: [-42, 0, 12], forearm: [-52, 0, 0], thigh: [-116, 0, 7], shin: [128, 0, 0], foot: [32, 0, 0] }),
  pike: sym({ spine: [28, 0, 0], chest: [22, 0, 0], neck: [6, 0, 0], uparm: [-78, 0, 6], forearm: [-10, 0, 0], thigh: [-112, 0, 2], shin: [6, 0, 0], foot: [40, 0, 0] }),
  wrapL: { spine: [-4, 10, 0], chest: [-4, 14, 0], head: [0, 32, 0], uparmL: [-30, -50, 8], forearmL: [-112, 0, 0], uparmR: [-42, 46, -4], forearmR: [-104, 0, 0], thighL: [0, 0, 0], thighR: [0, 0, 0], shinL: [4, 0, 0], shinR: [4, 0, 0], footL: [44, 0, 0], footR: [44, 0, 0] },
  prep: sym({ spine: [8, 0, 0], chest: [2, 0, 0], head: [10, 0, 0], uparm: [-48, 0, 26], forearm: [-26, 0, 0], thigh: [-21, 0, 4], shin: [36, 0, 0], foot: [-4, 0, 0] }),
  absorb: sym({ spine: [18, 0, 0], chest: [8, 0, 0], neck: [-6, 0, 0], head: [-10, 0, 0], uparm: [-58, 0, 22], forearm: [-30, 0, 0] }),
  finish: sym({ spine: [-4, 0, 0], chest: [-6, 0, 0], head: [-4, 0, 0], uparm: [-150, 0, 24], forearm: [-8, 0, 0] }),
  bounce: sym({ spine: [0, 0, 0], uparm: [-20, 0, 24], forearm: [-14, 0, 0], thigh: [-6, 0, 3], shin: [10, 0, 0], foot: [0, 0, 0] }),
  brace: sym({ spine: [20, 0, 0], chest: [14, 0, 0], neck: [10, 0, 0], head: [8, 0, 0], uparm: [-62, 0, 22], forearm: [-62, 0, 0], thigh: [-48, 0, 8], shin: [62, 0, 0], foot: [10, 0, 0] }),
  sit: sym({ spine: [22, 0, 0], chest: [18, 0, 0], uparm: [38, 0, 16], forearm: [-12, 0, 0], thigh: [-86, 0, 8], shin: [92, 0, 0], foot: [0, 0, 0] }),
  kneel: sym({ spine: [10, 0, 0], chest: [4, 0, 0], neck: [-14, 0, 0], head: [-14, 0, 0], uparm: [-86, 0, 8], forearm: [-12, 0, 0], thigh: [-82, 0, 5], shin: [98, 0, 0], foot: [10, 0, 0] }),
  squat: sym({ spine: [26, 0, 0], chest: [12, 0, 0], head: [-18, 0, 0], uparm: [-44, 0, 12], forearm: [-34, 0, 0], thigh: [-104, 0, 9], shin: [118, 0, 0], foot: [-16, 0, 0] }),
};
const keys = new Set(Object.values(POSES).flatMap(p => Object.keys(p)));
const Z = [0, 0, 0];
export function mirror(p) {
  const o = {};
  for (const [k, e] of Object.entries(p)) {
    const s = k.slice(-1), n = s === 'L' ? k.slice(0, -1) + 'R' : s === 'R' ? k.slice(0, -1) + 'L' : k;
    o[n] = [e[0], -e[1], -e[2]];
  }
  return o;
}
POSES.wrapR = mirror(POSES.wrapL);
export function mix(a, b, t) {
  if (t <= 0) return a; if (t >= 1) return b;
  const o = {};
  for (const k of keys) { const x = a[k] || Z, y = b[k] || Z; o[k] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]; }
  return o;
}
export const offset = (p, k, e) => ({ ...p, [k]: [(p[k] || Z)[0] + e[0], (p[k] || Z)[1] + e[1], (p[k] || Z)[2] + e[2]] });

// Posturas propias de cada truco según los grados girados (t). Pierna derecha = pierna de balanceo.
const seq = (keys, t) => { // [[grados, postura], …]
  t = Math.max(0, t) % 360; let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++; const [a, A] = keys[i], [b, B] = keys[i + 1], u = Math.min(1, Math.max(0, (t - a) / (b - a))); return mix(A, B, u * u * (3 - 2 * u));
};
const P = o => o, wrap = { uparmL: [-30, -50, 8], forearmL: [-108, 0, 0], uparmR: [-42, 46, -4], forearmR: [-100, 0, 0] }, open = { uparmL: [-20, 0, 58], uparmR: [-20, 0, -58], forearmL: [-16, 0, 0], forearmR: [-16, 0, 0] };
const swing = P({ spine: [-14, 0, 0], chest: [-12, 0, 0], head: [-14, 0, 0], uparmL: [-120, 0, 30], uparmR: [-120, 0, -30], thighL: [10, 0, 3], shinL: [10, 0, 0], footL: [44, 0, 0], thighR: [-78, 0, -4], shinR: [22, 0, 0], footR: [40, 0, 0] });
const splitB = P({ ...open, spine: [-12, 0, 0], chest: [-10, 0, 0], head: [-20, 0, 0], thighL: [14, 0, 6], shinL: [24, 0, 0], footL: [44, 0, 0], thighR: [-92, 0, -5], shinR: [14, 0, 0], footR: [44, 0, 0] });
const layW = P({ ...wrap, spine: [-5, 8, 0], chest: [-5, 10, 0], head: [-6, 24, 0], thighL: [4, 0, 5], thighR: [-16, 0, -6], shinL: [12, 0, 0], shinR: [20, 0, 0], footL: [44, 0, 0], footR: [44, 0, 0] });
const layO = P({ ...open, spine: [-6, 0, 0], chest: [-4, 0, 0], thighL: [0, 0, 5], thighR: [-12, 0, -5], shinL: [10, 0, 0], shinR: [16, 0, 0], footL: [40, 0, 0], footR: [40, 0, 0] });
const bfly = P({ ...open, spine: [-16, 0, 0], chest: [-14, 0, 0], head: [-16, 0, 0], thighL: [26, 0, 26], thighR: [22, 0, -30], shinL: [10, 0, 0], shinR: [10, 0, 0], footL: [44, 0, 0], footR: [44, 0, 0] });
const kickUp = P({ ...open, spine: [-10, 0, 0], chest: [-8, 0, 0], head: [-10, 0, 0], thighL: [-12, 0, 12], shinL: [44, 0, 0], footL: [30, 0, 0], thighR: [-96, 0, -10], shinR: [6, 0, 0], footR: [40, 0, 0] });
const scissor = P({ ...open, spine: [-8, 0, 0], chest: [-6, 0, 0], thighL: [-88, 0, 10], shinL: [10, 0, 0], footL: [40, 0, 0], thighR: [4, 0, -12], shinR: [30, 0, 0], footR: [36, 0, 0] });
const webF = P({ spine: [22, 0, 0], chest: [18, 0, 0], head: [8, 0, 0], uparmL: [-52, 0, 34], uparmR: [-52, 0, -34], forearmL: [-40, 0, 0], forearmR: [-40, 0, 0], thighL: [-70, 0, 4], shinL: [96, 0, 0], footL: [30, 0, 0], thighR: [34, 0, -4], shinR: [26, 0, 0], footR: [44, 0, 0] });
const flashK = P({ ...open, spine: [-18, 0, 0], chest: [-16, 0, 0], neck: [-6, 0, 0], head: [-18, 0, 0], thighL: [18, 0, 3], shinL: [52, 0, 0], footL: [40, 0, 0], thighR: [-84, 0, -3], shinR: [2, 0, 0], footR: [46, 0, 0] });
const strad = P({ spine: [0, 0, 0], chest: [0, 0, 0], uparmL: [-8, 0, 96], uparmR: [-8, 0, -96], forearmL: [-10, 0, 0], forearmR: [-10, 0, 0], thighL: [0, 0, 56], thighR: [0, 0, -56], shinL: [2, 0, 0], shinR: [2, 0, 0], footL: [46, 0, 0], footR: [46, 0, 0] });
// Cork: entrada con la pierna de balanceo arriba y la cabeza que cae hacia atrás y al hombro; durante el twist,
// piernas juntas y estiradas, un brazo cruzado al pecho y la otra mano al hombro; abre para caer.
const corkSet = P({ spine: [-16, 10, -6], chest: [-12, 14, -6], neck: [-8, 10, 0], head: [-22, 26, 0], uparmL: [-118, -10, 40], uparmR: [-96, 20, -34], forearmL: [-40, 0, 0], forearmR: [-56, 0, 0], thighL: [16, 0, 4], shinL: [18, 0, 0], footL: [46, 0, 0], thighR: [-96, 0, -6], shinR: [18, 0, 0], footR: [42, 0, 0] });
const corkIn = P({ spine: [-4, 6, 0], chest: [-4, 10, 0], neck: [0, 10, 0], head: [-6, 30, 0], uparmL: [-36, -58, 6], forearmL: [-118, 0, 0], handL: [0, 0, -10], uparmR: [-58, 52, -2], forearmR: [-124, 0, 0], thighL: [-4, 0, -3], thighR: [-10, 0, 3], shinL: [8, 0, 0], shinR: [10, 0, 0], footL: [48, 0, 0], footR: [48, 0, 0] });
const corkOut = P({ ...open, spine: [-6, 0, 0], chest: [-4, 0, 0], head: [-8, 0, 0], thighL: [6, 0, 5], thighR: [-22, 0, -5], shinL: [12, 0, 0], shinR: [22, 0, 0], footL: [36, 0, 0], footR: [36, 0, 0] });
// B-twist: brazos que barren en horizontal, cuerpo tumbado y arqueado con las piernas en tijera (una arriba por detrás,
// otra abajo por delante); en el twist todo cerrado y estirado; al final vuelve la tijera para caer primero con una pierna.
const bSwing = P({ spine: [10, -14, 0], chest: [8, -18, 0], head: [-6, -14, 0], uparmL: [-80, 0, 96], uparmR: [-70, 0, -60], forearmL: [-12, 0, 0], forearmR: [-30, 0, 0], thighL: [-4, 0, 4], shinL: [10, 0, 0], footL: [40, 0, 0], thighR: [-40, 0, -6], shinR: [30, 0, 0], footR: [40, 0, 0] });
const bKick = P({ spine: [-18, 0, 0], chest: [-14, 0, 0], neck: [-8, 0, 0], head: [-16, 0, 0], uparmL: [-14, 0, 92], uparmR: [-14, 0, -92], forearmL: [-8, 0, 0], forearmR: [-8, 0, 0], thighL: [38, 0, 6], shinL: [10, 0, 0], footL: [50, 0, 0], thighR: [-62, 0, -6], shinR: [6, 0, 0], footR: [46, 0, 0] });
const bTight = P({ spine: [-6, 0, 0], chest: [-6, 0, 0], neck: [-2, 0, 0], head: [-6, 22, 0], uparmL: [-34, -56, 6], forearmL: [-116, 0, 0], uparmR: [-52, 50, -2], forearmR: [-120, 0, 0], thighL: [0, 0, -2], thighR: [-6, 0, 2], shinL: [4, 0, 0], shinR: [6, 0, 0], footL: [50, 0, 0], footR: [50, 0, 0] });
const bLand = P({ spine: [-8, 0, 0], chest: [-6, 0, 0], head: [-8, 0, 0], uparmL: [-24, 0, 70], uparmR: [-24, 0, -70], forearmL: [-14, 0, 0], forearmR: [-14, 0, 0], thighL: [22, 0, 5], shinL: [14, 0, 0], footL: [40, 0, 0], thighR: [-40, 0, -5], shinR: [20, 0, 0], footR: [36, 0, 0] });
export const MOVE_POSES = {
  cork: t => seq([[0, swing], [45, corkSet], [95, corkIn], [280, corkIn], [335, corkOut]], t),
  btwist: t => seq([[0, bSwing], [55, bKick], [110, bTight], [270, bTight], [330, bLand]], t),
  raiz: t => seq([[0, swing], [90, kickUp], [190, scissor], [290, bfly], [360, layO]], t),
  gainer: t => seq([[0, swing], [80, splitB], [170, splitB], [250, layO], [340, layO]], t),
  webster: t => seq([[0, webF], [120, webF], [220, { ...webF, thighL: [-104, 0, 4], shinL: [112, 0, 0], thighR: [-30, 0, -4], shinR: [60, 0, 0] }], [320, layO]], t),
  flash: t => seq([[0, layO], [70, flashK], [210, flashK], [290, layO], [350, layO]], t),
  aerial: t => seq([[0, webF], [60, strad], [250, strad], [340, layO]], t),
  arabian: t => seq([[0, layO], [70, layW], [130, layO], [360, layO]], t),
  barani: t => seq([[0, webF], [90, layO], [140, layW], [270, layW], [340, layO]], t),
};
POSES.jlaunch = { spine: [-10, 8, 0], chest: [-8, 10, 0], head: [-12, 0, 0], uparmL: [-110, 0, 34], uparmR: [-96, 0, -44], forearmL: [-24, 0, 0], forearmR: [-30, 0, 0], thighL: [6, 0, 2], shinL: [6, 0, 0], footL: [44, 0, 0], thighR: [-86, 0, 6], shinR: [40, 0, 0], footR: [30, 0, 0] };
