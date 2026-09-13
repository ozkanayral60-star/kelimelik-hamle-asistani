(() => {
  'use strict';

  // Kelimelik, rakibin son hamlesindeki bazı taşların sağ alt köşesine
  // kelime anlamını açan küçük bir “?” simgesi koyabiliyor.
  // Bu simge taşın harfi değildir. OCR'ye gönderilen 220×220 taş kırpımlarında
  // sağ üst puan alanı ve sağ alt “?” alanı beyazlanır; ortadaki büyük harf korunur.
  if (!window.Tesseract || !window.Tesseract.createWorker) return;

  const originalCreateWorker = window.Tesseract.createWorker.bind(window.Tesseract);

  function sanitizeTileCanvas(input) {
    if (!(input instanceof HTMLCanvasElement)) return input;
    if (input.width !== 220 || input.height !== 220) return input;

    const copy = document.createElement('canvas');
    copy.width = input.width;
    copy.height = input.height;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(input, 0, 0);

    ctx.save();
    ctx.fillStyle = '#ffffff';

    // Sağ üstteki küçük harf puanı.
    ctx.fillRect(copy.width * 0.70, 0, copy.width * 0.30, copy.height * 0.36);

    // Sağ alttaki “?” anlam simgesi. Büyük ana harfin bulunduğu merkez bölgeye dokunmaz.
    ctx.fillRect(copy.width * 0.70, copy.height * 0.58, copy.width * 0.30, copy.height * 0.42);

    ctx.restore();
    return copy;
  }

  window.Tesseract.createWorker = async function (...args) {
    const worker = await originalCreateWorker(...args);
    if (!worker || typeof worker.recognize !== 'function') return worker;

    const originalRecognize = worker.recognize.bind(worker);
    worker.recognize = function (image, ...rest) {
      return originalRecognize(sanitizeTileCanvas(image), ...rest);
    };
    return worker;
  };
})();
