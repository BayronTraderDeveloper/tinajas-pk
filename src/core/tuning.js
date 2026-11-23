// Parámetros físicos ajustables en vivo desde el panel del laboratorio.
// Unidades SI: m, s, kg, N·m, kg·m²/s.
export const DEFAULTS = {
  gravity: 9.81,
  jogSpeed: 3.1, sprintSpeed: 6.8, runAccel: 4.2,
  jumpMin: 4.4, jumpMax: 5.6,      // velocidad vertical de despegue
  runJumpBonus: 0.6,               // extra por carrera
  chargeTime: 0.4,
  takeoffFlip: 46,                 // momento angular que da el suelo (mortal)
  takeoffTwist: 8,
  airFlipTorque: 55, airBrakeTorque: 80, maxFlipL: 85,
  airTwistTorque: 30, maxTwistL: 19,
  spinSpeed: 1.0,                  // ritmo de giro al mantener un truco
  airSteer: 1.3,                   // corrección leve de trayectoria (m/s²)
  assist: 0.35,                    // ayuda de enderezado cerca del suelo (0 = nada)
  landingForgiveness: 1.0,
  trampoline: 1.0,
  // multiplicadores que cambian con las mejoras
  push: 1, twistSpeed: 1, recover: 1, kong: 1, cast: 0, spring: 1, style: 1, magnet: 0,
};
export const makeTuning = () => ({ ...DEFAULTS });
// mu: fricción · rest: rebote · soft: amortiguación · tol: impacto vertical tolerable (m/s)
export const SURFACES = {
  floor:  { label: 'Suelo deportivo', mu: 0.75, rest: 0.12, soft: 0.25, tol: 7.6 },
  wood:   { label: 'Madera',          mu: 0.65, rest: 0.12, soft: 0.1,  tol: 7.0 },
  mat:    { label: 'Colchoneta',      mu: 0.9,  rest: 0.08, soft: 0.6,  tol: 9.5 },
  foam:   { label: 'Espuma',          mu: 1.0,  rest: 0.03, soft: 1.0,  tol: 15 },
  tramp:  { label: 'Trampolín',       mu: 0.8,  rest: 0.65, soft: 1.0,  tol: 99 },
  wall:   { label: 'Pared',           mu: 0.5,  rest: 0.2,  soft: 0.1,  tol: 5 },
};
