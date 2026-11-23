// Reproduce teclas reales en el navegador: play([[ms,'down|up','KeyQ'],...])
export const play = list => Promise.all(list.map(([ms, t, code]) => new Promise(r => setTimeout(() => { dispatchEvent(new KeyboardEvent('key' + t, { code, bubbles: true, cancelable: true })); r(); }, ms))));
