/* Purpose: Run a DOM-free experiment contract with fixed time steps and normalized parameters.
 * Consumers: experiment-host.js and experiment-session.test.js. Dependencies: scene definitions. */
export function createSession(scene, seed = 42, supplied = {}) {
  const params = Object.fromEntries(scene.parameters.map(p => [p.key, p.default]));
  let state, remainder = 0, currentSeed = seed >>> 0, currentStart = scene.defaultStart;
  function set(key, value) {
    const p = scene.parameters.find(p => p.key === key);
    if (!p || !Number.isFinite(Number(value))) return;
    params[key] = Math.max(p.min, Math.min(p.max, p.min + Math.round((Number(value) - p.min) / p.step) * p.step));
    params[key] = Number(params[key].toFixed(8));
  }
  for (const [key, value] of Object.entries(supplied)) set(key, value);
  function reset(nextSeed = currentSeed, start = currentStart) {
    currentSeed = Number(nextSeed) >>> 0;
    currentStart = scene.starts?.some(mode => mode.id === start) ? start : scene.defaultStart;
    state = scene.create({ seed: currentSeed, params: { ...params }, start: currentStart }); remainder = 0;
  }
  reset();
  return {
    get state() { return state; }, get seed() { return currentSeed; }, get start() { return currentStart; }, params, set, reset,
    step() { scene.step(state, scene.dt, params); },
    advance(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      remainder += Math.min(seconds, 0.25);
      while (remainder + 1e-10 >= scene.dt) { scene.step(state, scene.dt, params); remainder -= scene.dt; }
    },
    clearClock() { remainder = 0; },
    action(id) { scene.actions?.find(a => a.id === id)?.run(state, params); },
    render() { return scene.render(state, params); },
    getParams() { return { version: 1, seed: currentSeed, params: { ...params }, ...(currentStart ? { start: currentStart } : {}) }; },
    applyParams(value) {
      if (!value || value.version !== 1 || !value.params || !Number.isFinite(Number(value.seed))) return false;
      if (value.start !== undefined && !scene.starts?.some(mode => mode.id === value.start)) return false;
      for (const p of scene.parameters) set(p.key, value.params[p.key] ?? p.default);
      reset(value.seed, value.start ?? scene.defaultStart); return true;
    }
  };
}
