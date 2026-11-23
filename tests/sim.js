import { World } from '../src/core/world.js';
import { buildLab } from '../src/core/lab.js';
import { Athlete, NO_INPUT } from '../src/core/athlete.js';
import { makeTuning } from '../src/core/tuning.js';
export const DT = 1 / 240;
export function flat(surface = 'floor') { const w = new World(); w.box([0, -.5, 0], [80, 1, 80], surface); return w; }
export function make(world = flat(), spawn = { x: 0, y: 0, z: 0, yaw: 0 }, tun = {}) { const a = new Athlete(world, { ...makeTuning(), ...tun }); a.reset(spawn); return a; }
// script(t, a) -> input parcial
export function run(a, secs, script = () => ({}), each) {
  const ev = []; const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) { const t = i * DT; a.update(DT, { ...NO_INPUT, ...script(t, a) }); for (const e of a.drain()) ev.push({ t, ...e }); each && each(t, a); }
  return ev;
}
export const land = ev => ev.find(e => e.type === 'land');
export function finite(a) { return [a.rootP.x, a.rootP.y, a.rootP.z, a.rootQ.x, a.rootQ.w, ...a.sk.local.flatMap(q => [q.x, q.y, q.z, q.w])].every(Number.isFinite); }
// salto: carga 0.6 s, mantiene mortal en despegue, agrupa, abre al llegar a openAt grados
export const trick = ({ flip = 0, side = 0, twist = 0, hold = .6, flipUntil = .3, tuck = true, openAt = 300, twistUntil = 360 }) => (t, a) => {
  const air = a.state === 'air', deg = Math.max(Math.abs(a.trick.flip), Math.abs(a.trick.side));
  return { jump: t < hold, flip: t > hold - .05 && (a.state === 'takeoff' || (air && a.airT < flipUntil)) ? flip : 0, side: (a.state === 'takeoff' || (air && a.airT < flipUntil)) ? side : 0,
    twist: (a.state === 'takeoff' || air) && Math.abs(a.trick.twist) < twistUntil ? twist : (air && Math.abs(a.hTwist) > .4 ? -Math.sign(a.hTwist) : 0), tuck: air && tuck && deg < openAt && a.airT > .08 ? 1 : 0 };
};
