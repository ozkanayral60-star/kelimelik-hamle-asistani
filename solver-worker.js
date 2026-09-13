importScripts('./engine.js');
let engine = null;
self.onmessage = function (event) {
  const msg = event.data || {};
  try {
    if (msg.type === 'init') {
      engine = self.KelimelikEngine.makeEngine(msg.words || []);
      self.postMessage({ type: 'ready', dictionarySize: engine.dictionarySize });
      return;
    }
    if (msg.type === 'solve') {
      if (!engine) throw new Error('Sözlük motoru henüz hazır değil.');
      const started = performance.now();
      const out = engine.solve(msg.board, msg.rack, msg.settings || {});
      self.postMessage({ type: 'solved', id: msg.id, elapsedMs: Math.round(performance.now() - started), ...out });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err && err.message ? err.message : String(err) });
  }
};
