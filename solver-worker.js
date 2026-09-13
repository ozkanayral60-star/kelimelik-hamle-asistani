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
      const settings = msg.settings || {};
      for (let r=0;r<15;r++) for (let c=0;c<15;c++) if (self.KelimelikEngine.BONUS[r][c] === 'STAR3') self.KelimelikEngine.BONUS[r][c] = null;
      const star3 = settings.star3;
      if (star3 && Number.isInteger(star3.r) && Number.isInteger(star3.c) && star3.r>=0 && star3.r<15 && star3.c>=0 && star3.c<15) self.KelimelikEngine.BONUS[star3.r][star3.c] = 'STAR3';
      const started = performance.now();
      const out = engine.solve(msg.board, msg.rack, settings);
      self.postMessage({ type: 'solved', id: msg.id, elapsedMs: Math.round(performance.now() - started), ...out });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err && err.message ? err.message : String(err) });
  }
};