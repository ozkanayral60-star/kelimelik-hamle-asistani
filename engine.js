(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KelimelikEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 15;
  const CENTER = { r: 7, c: 7 };
  const ALPHABET = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'.split('');
  const ALPHABET_SET = new Set(ALPHABET);

  const LETTER_SCORES = Object.freeze({
    A: 1, B: 3, C: 4, Ç: 4, D: 3, E: 1, F: 7, G: 5, Ğ: 8, H: 5,
    I: 2, İ: 1, J: 10, K: 1, L: 1, M: 2, N: 1, O: 2, Ö: 7, P: 5,
    R: 1, S: 2, Ş: 4, T: 1, U: 2, Ü: 3, V: 7, Y: 3, Z: 4
  });

  // Layout reconstructed from the empty-board screenshot supplied by the user.
  const BONUS = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  function setBonus(r, c, type) { BONUS[r - 1][c - 1] = type; }
  [
    [1,3,'K3'],[1,6,'H2'],[1,10,'H2'],[1,13,'K3'],
    [2,2,'H3'],[2,7,'H2'],[2,9,'H2'],[2,14,'H3'],
    [3,1,'K3'],[3,8,'K2'],[3,15,'K3'],
    [4,4,'K2'],[4,12,'K2'],
    [5,5,'H3'],[5,11,'H3'],
    [6,1,'H2'],[6,6,'H2'],[6,10,'H2'],[6,15,'H2'],
    [7,2,'H2'],[7,7,'H2'],[7,9,'H2'],[7,14,'H2'],
    [8,3,'K2'],[8,8,'STAR2'],[8,13,'K2'],
    [9,2,'H2'],[9,7,'H2'],[9,9,'H2'],[9,14,'H2'],
    [10,1,'H2'],[10,6,'H2'],[10,7,'STAR3'],[10,10,'H2'],[10,15,'H2'],
    [11,5,'H3'],[11,11,'H3'],
    [12,4,'K2'],[12,12,'K2'],
    [13,1,'K3'],[13,8,'K2'],[13,15,'K3'],
    [14,2,'H3'],[14,7,'H2'],[14,9,'H2'],[14,14,'H3'],
    [15,3,'K3'],[15,6,'H2'],[15,10,'H2'],[15,13,'K3']
  ].forEach(x => setBonus(...x));

  function normalizeLetter(value) {
    if (!value) return '';
    const v = String(value).trim().toLocaleUpperCase('tr-TR');
    return v.length === 1 && ALPHABET_SET.has(v) ? v : '';
  }

  function normalizeWord(value) {
    if (!value) return '';
    const v = String(value).trim().toLocaleUpperCase('tr-TR');
    if (v.length < 2 || v.length > SIZE) return '';
    for (const ch of v) if (!ALPHABET_SET.has(ch)) return '';
    return v;
  }

  function cloneBoard(board) {
    const out = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = board && board[r] ? board[r][c] : null;
        if (!cell) continue;
        const letter = normalizeLetter(typeof cell === 'string' ? cell : cell.letter);
        if (letter) out[r][c] = { letter, isJoker: !!(cell && cell.isJoker) };
      }
    }
    return out;
  }

  function emptyBoard(board) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) return false;
    return true;
  }

  class TrieNode {
    constructor() {
      this.children = Object.create(null);
      this.end = false;
    }
  }

  function buildTrie(words) {
    const root = new TrieNode();
    for (const word of words) {
      let node = root;
      for (const ch of word) {
        if (!node.children[ch]) node.children[ch] = new TrieNode();
        node = node.children[ch];
      }
      node.end = true;
    }
    return root;
  }

  function rackCounts(rack) {
    const counts = Object.create(null);
    let jokers = 0;
    for (const raw of rack || []) {
      if (raw === '*' || raw === '?' || raw === 'JOKER') { jokers++; continue; }
      const letter = normalizeLetter(raw);
      if (letter) counts[letter] = (counts[letter] || 0) + 1;
    }
    return { counts, jokers };
  }

  function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function coord(r, c) { return String.fromCharCode(65 + c) + (r + 1); }

  function makeEngine(inputWords) {
    const words = [];
    const seen = new Set();
    for (const raw of inputWords || []) {
      const w = normalizeWord(raw);
      if (w && !seen.has(w)) { seen.add(w); words.push(w); }
    }
    const wordSet = new Set(words);
    const trie = buildTrie(words);

    function perpendicularWord(board, r, c, letter, dr, dc) {
      const pdr = dc;
      const pdc = -dr;
      let startR = r, startC = c;
      while (inside(startR - pdr, startC - pdc) && board[startR - pdr][startC - pdc]) {
        startR -= pdr; startC -= pdc;
      }
      const cells = [];
      let rr = startR, cc = startC;
      while (inside(rr, cc)) {
        if (rr === r && cc === c) {
          cells.push({ r: rr, c: cc, letter, newTile: true });
        } else if (board[rr][cc]) {
          cells.push({ r: rr, c: cc, letter: board[rr][cc].letter, newTile: false, isJoker: board[rr][cc].isJoker });
        } else {
          break;
        }
        rr += pdr; cc += pdc;
      }
      if (cells.length <= 1) return null;
      return { word: cells.map(x => x.letter).join(''), cells };
    }

    function tileBase(tile) {
      if (!tile) return 0;
      return tile.isJoker ? 0 : (LETTER_SCORES[tile.letter] || 0);
    }

    function scoreWord(board, wordCells, newMap) {
      let sum = 0;
      let wordMult = 1;
      const details = [];
      for (const cell of wordCells) {
        const key = cell.r + ',' + cell.c;
        const placed = newMap.get(key);
        const tile = placed || board[cell.r][cell.c];
        let base = tileBase(tile);
        let letterMult = 1;
        let applied = null;
        if (placed) {
          const b = BONUS[cell.r][cell.c];
          if (b === 'H2') { letterMult = 2; applied = 'H2'; }
          else if (b === 'H3') { letterMult = 3; applied = 'H3'; }
          else if (b === 'K2') { wordMult *= 2; applied = 'K2'; }
          else if (b === 'K3') { wordMult *= 3; applied = 'K3'; }
          else if (b === 'STAR2') { wordMult *= 2; applied = 'STAR2'; }
        }
        sum += base * letterMult;
        details.push({ r: cell.r, c: cell.c, letter: tile.letter, base, letterMult, applied, isJoker: !!tile.isJoker });
      }
      return { score: sum * wordMult, raw: sum, wordMult, details };
    }

    function buildMainCells(startR, startC, dr, dc, word) {
      const cells = [];
      for (let i = 0; i < word.length; i++) cells.push({ r: startR + dr * i, c: startC + dc * i, letter: word[i] });
      return cells;
    }

    function validateCandidate(board, rack, candidate, firstMove) {
      const { startR, startC, dr, dc, word, placements } = candidate;
      if (!wordSet.has(word) || word.length < 2) return { ok: false, reason: 'Ana kelime sözlükte değil.' };
      const mainCells = buildMainCells(startR, startC, dr, dc, word);
      for (const cell of mainCells) if (!inside(cell.r, cell.c)) return { ok: false, reason: 'Tahta sınırı.' };
      const beforeR = startR - dr, beforeC = startC - dc;
      const afterR = startR + dr * word.length, afterC = startC + dc * word.length;
      if (inside(beforeR, beforeC) && board[beforeR][beforeC]) return { ok: false, reason: 'Kelimenin başında ek harf var.' };
      if (inside(afterR, afterC) && board[afterR][afterC]) return { ok: false, reason: 'Kelimenin sonunda ek harf var.' };

      const placementMap = new Map(placements.map(p => [p.r + ',' + p.c, p]));
      if (!placements.length) return { ok: false, reason: 'Yeni taş yok.' };
      const rackInfo = rackCounts(rack);
      const need = Object.create(null);
      let jokerNeed = 0;
      let contact = false;
      let coversCenter = false;
      const crossWords = [];

      for (let i = 0; i < mainCells.length; i++) {
        const cell = mainCells[i];
        const existing = board[cell.r][cell.c];
        const expected = word[i];
        if (existing) {
          if (existing.letter !== expected) return { ok: false, reason: 'Mevcut harf ile çakışıyor.' };
          contact = true;
        } else {
          const p = placementMap.get(cell.r + ',' + cell.c);
          if (!p || p.letter !== expected) return { ok: false, reason: 'Eksik yeni taş.' };
          if (p.isJoker) jokerNeed++;
          else need[p.letter] = (need[p.letter] || 0) + 1;
          const cross = perpendicularWord(board, cell.r, cell.c, expected, dr, dc);
          if (cross) {
            if (!wordSet.has(cross.word)) return { ok: false, reason: 'Geçersiz yan kelime: ' + cross.word };
            crossWords.push(cross);
            contact = true;
          }
        }
        if (cell.r === CENTER.r && cell.c === CENTER.c) coversCenter = true;
      }
      for (const [letter, n] of Object.entries(need)) if ((rackInfo.counts[letter] || 0) < n) return { ok: false, reason: 'Elde gerekli harf yok.' };
      if (rackInfo.jokers < jokerNeed) return { ok: false, reason: 'Yeterli joker yok.' };
      if (firstMove) {
        if (!coversCenter) return { ok: false, reason: 'İlk hamle merkez yıldızdan geçmeli.' };
      } else if (!contact) return { ok: false, reason: 'Hamle mevcut taşlara temas etmiyor.' };
      return { ok: true, mainCells, crossWords };
    }

    function calculateScore(board, candidate, validation, settings) {
      const newMap = new Map(candidate.placements.map(p => [p.r + ',' + p.c, p]));
      const main = scoreWord(board, validation.mainCells, newMap);
      let crossTotal = 0;
      const crossDetails = [];
      for (const cross of validation.crossWords) {
        const sc = scoreWord(board, cross.cells, newMap);
        crossTotal += sc.score;
        crossDetails.push({ word: cross.word, score: sc.score, raw: sc.raw, wordMult: sc.wordMult });
      }
      const star3Used = candidate.placements.some(p => BONUS[p.r][p.c] === 'STAR3');
      const star3Bonus = star3Used ? 25 : 0;
      const sevenTileBonusValue = Number.isFinite(+settings.sevenTileBonus) ? +settings.sevenTileBonus : 25;
      const sevenTileBonus = candidate.placements.length === 7 ? sevenTileBonusValue : 0;
      const total = main.score + crossTotal + star3Bonus + sevenTileBonus;
      return {
        total,
        mainScore: main.score,
        mainRaw: main.raw,
        mainWordMult: main.wordMult,
        crossTotal,
        crossDetails,
        star3Bonus,
        sevenTileBonus
      };
    }

    function solve(rawBoard, rack, settings = {}) {
      const board = cloneBoard(rawBoard);
      const firstMove = emptyBoard(board);
      const baseRack = rackCounts(rack);
      const directions = [
        { dr: 0, dc: 1, label: 'Yatay' },
        { dr: 1, dc: 0, label: 'Dikey' }
      ];
      const results = [];
      const dedupe = new Set();

      function maybeAdd(startR, startC, dr, dc, dirLabel, word, placements) {
        if (word.length < 2 || placements.length === 0) return;
        const key = startR + ':' + startC + ':' + dr + ':' + dc + ':' + word + ':' + placements.map(p => p.r + ',' + p.c + (p.isJoker ? '*' : '')).join('|');
        if (dedupe.has(key)) return;
        const candidate = { startR, startC, dr, dc, direction: dirLabel, word, placements: placements.map(p => ({ ...p })) };
        const validation = validateCandidate(board, rack, candidate, firstMove);
        if (!validation.ok) return;
        const score = calculateScore(board, candidate, validation, settings);
        dedupe.add(key);
        results.push({
          ...candidate,
          start: coord(startR, startC),
          end: coord(startR + dr * (word.length - 1), startC + dc * (word.length - 1)),
          usedTiles: placements.length,
          jokers: placements.filter(p => p.isJoker).map(p => ({ at: coord(p.r, p.c), as: p.letter })),
          crossWords: validation.crossWords.map(x => x.word),
          score
        });
      }

      for (const { dr, dc, label } of directions) {
        for (let startR = 0; startR < SIZE; startR++) {
          for (let startC = 0; startC < SIZE; startC++) {
            const prevR = startR - dr, prevC = startC - dc;
            if (inside(prevR, prevC) && board[prevR][prevC]) continue;

            const counts = { ...baseRack.counts };
            let jokers = baseRack.jokers;
            const placements = [];

            function rec(r, c, node, word) {
              if (!inside(r, c)) {
                if (node.end) maybeAdd(startR, startC, dr, dc, label, word, placements);
                return;
              }

              const existing = board[r][c];
              if (!existing && node.end) maybeAdd(startR, startC, dr, dc, label, word, placements);

              if (existing) {
                const child = node.children[existing.letter];
                if (!child) return;
                rec(r + dr, c + dc, child, word + existing.letter);
                return;
              }

              for (const letter of ALPHABET) {
                const child = node.children[letter];
                if (!child) continue;
                const cross = perpendicularWord(board, r, c, letter, dr, dc);
                if (cross && !wordSet.has(cross.word)) continue;

                if ((counts[letter] || 0) > 0) {
                  counts[letter]--;
                  placements.push({ r, c, letter, isJoker: false });
                  rec(r + dr, c + dc, child, word + letter);
                  placements.pop();
                  counts[letter]++;
                }
                if (jokers > 0) {
                  jokers--;
                  placements.push({ r, c, letter, isJoker: true });
                  rec(r + dr, c + dc, child, word + letter);
                  placements.pop();
                  jokers++;
                }
              }
            }

            rec(startR, startC, trie, '');
          }
        }
      }

      results.sort((a, b) => b.score.total - a.score.total || b.usedTiles - a.usedTiles || b.word.length - a.word.length || a.word.localeCompare(b.word, 'tr'));
      return { results, firstMove, dictionarySize: words.length };
    }

    return { solve, validateCandidate, calculateScore, dictionarySize: words.length };
  }

  return {
    SIZE, CENTER, BONUS, ALPHABET, LETTER_SCORES,
    normalizeLetter, normalizeWord, cloneBoard, makeEngine, coord
  };
});
