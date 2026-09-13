(function (root) {
  'use strict';
  const DB_NAME = 'kelimelik-asistani-db';
  const STORE = 'kv';
  const KEY = 'dictionary-v1';
  const SOURCES = [
    'https://raw.githubusercontent.com/CanNuhlar/Turkce-Kelime-Listesi/master/turkce_kelime_listesi.txt',
    'https://cdn.jsdelivr.net/gh/CanNuhlar/Turkce-Kelime-Listesi@master/turkce_kelime_listesi.txt'
  ];

  const FALLBACK = `ad ada adam af al ala alan alem alet ama ana anı ara arı as at ata ateş ay baba bağ bal bar baş bay ben beş bir biz bol boş bu cam can ce ceviz çay çok da dal dam dar de den deniz ders dil din diz doğa dört dur el ele emek en er ev fal fil gel gemi git göl gün güneş ha hal ham her hiç hoş iki ile ilk ip iş iyi kal kale kan kapı kar kara kaş kat kelime kim kol koş kuş laf mal masa mavi mi mor ne net oda okul on ordu oyun öp para pas pil pul renk saat saç sağ sal ses siz sol son söz su süt şal şan şar şiş taş tat tek ten top toz üç var ver yol zor zümrüt fabl keş arı tüp bay yom şak ekit`.split(/\s+/);

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  function normalizeSource(text) {
    const out = [];
    const seen = new Set();
    for (const rawLine of text.split(/\r?\n/)) {
      const raw = rawLine.trim();
      if (!raw || raw.length < 2 || raw.length > 15) continue;
      if (raw.includes(' ') || raw.includes('/') || raw.includes('-') || raw.includes("'") || raw.includes('’')) continue;
      // Proper nouns in this source are generally capitalized. Omit them for word-game safety.
      const first = raw[0];
      if (first !== first.toLocaleLowerCase('tr-TR')) continue;
      const w = raw.toLocaleUpperCase('tr-TR');
      if (![...w].every(ch => self.KelimelikEngine ? self.KelimelikEngine.ALPHABET.includes(ch) : 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.includes(ch))) continue;
      if (!seen.has(w)) { seen.add(w); out.push(w); }
    }
    return out;
  }

  async function loadCached() {
    try {
      const cached = await dbGet(KEY);
      if (cached && Array.isArray(cached.words) && cached.words.length) return cached;
    } catch (_) {}
    return { words: FALLBACK.map(w => w.toLocaleUpperCase('tr-TR')), source: 'Yerleşik mini sözlük', updatedAt: null };
  }

  async function downloadFull(onStatus) {
    let lastErr = null;
    for (const url of SOURCES) {
      try {
        onStatus && onStatus('Sözlük indiriliyor…');
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        onStatus && onStatus('Sözlük hazırlanıyor…');
        const words = normalizeSource(text);
        if (words.length < 10000) throw new Error('Beklenenden az kelime geldi: ' + words.length);
        const payload = { words, source: url, updatedAt: new Date().toISOString() };
        await dbSet(KEY, payload);
        return payload;
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('Sözlük indirilemedi.');
  }

  root.DictionaryStore = { loadCached, downloadFull, normalizeSource };
})(typeof self !== 'undefined' ? self : window);
