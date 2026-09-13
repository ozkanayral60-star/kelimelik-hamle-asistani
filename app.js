(() => {
  'use strict';
  const E = window.KelimelikEngine;
  const D = window.DictionaryStore;
  const state = {
    board: E.cloneBoard(JSON.parse(localStorage.getItem('ka-board') || 'null')),
    rack: JSON.parse(localStorage.getItem('ka-rack') || 'null') || Array(7).fill(null),
    settings: { sevenTileBonus: +(localStorage.getItem('ka-seven-bonus') || 25) },
    results: [], dictionary: null, customAdded: new Set(JSON.parse(localStorage.getItem('ka-added') || '[]')),
    blocked: new Set(JSON.parse(localStorage.getItem('ka-blocked') || '[]')), workerReady: false,
    pickerTarget: null, selectedMove: null, deferredPrompt: null
  };
  const $ = id => document.getElementById(id);
  const boardEl = $('board'), rackEl = $('rack'), resultsEl = $('results');
  const worker = new Worker('./solver-worker.js');
  let solveId = 0;

  function toast(text) {
    const el = $('toast'); el.textContent = text; el.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.add('hidden'), 2400);
  }
  function persist() {
    localStorage.setItem('ka-board', JSON.stringify(state.board));
    localStorage.setItem('ka-rack', JSON.stringify(state.rack));
    localStorage.setItem('ka-seven-bonus', String(state.settings.sevenTileBonus));
    localStorage.setItem('ka-added', JSON.stringify([...state.customAdded]));
    localStorage.setItem('ka-blocked', JSON.stringify([...state.blocked]));
  }
  function bonusLabel(type) {
    if (type === 'H2') return 'H<sup>2</sup>'; if (type === 'H3') return 'H<sup>3</sup>';
    if (type === 'K2') return 'K<sup>2</sup>'; if (type === 'K3') return 'K<sup>3</sup>';
    if (type === 'STAR2') return '★<sup>2</sup>'; if (type === 'STAR3') return '★★★'; return '';
  }
  function bonusClass(type) { return type ? type.toLowerCase() : ''; }
  function tileHtml(tile, extra='') {
    const score = tile.isJoker ? 0 : E.LETTER_SCORES[tile.letter] || 0;
    return `<div class="board-tile ${tile.isJoker?'joker':''} ${extra}">${tile.letter}<span class="mini-score">${score}</span>${extra?' <span class="new-mark">YENİ</span>':''}</div>`;
  }
  function renderBoard() {
    boardEl.innerHTML = '';
    for (let r=0;r<15;r++) for (let c=0;c<15;c++) {
      const bonus=E.BONUS[r][c], cell=document.createElement('button');
      cell.className='cell '+bonusClass(bonus); cell.dataset.r=r; cell.dataset.c=c;
      cell.innerHTML = `<span class="bonus">${bonusLabel(bonus)}</span>` + (state.board[r][c] ? tileHtml(state.board[r][c]) : '');
      cell.addEventListener('click', () => openPicker({type:'board',r,c})); boardEl.appendChild(cell);
    }
  }
  function renderRack() {
    rackEl.innerHTML='';
    for(let i=0;i<7;i++){
      const v=state.rack[i], b=document.createElement('button');
      b.className='rack-slot '+(!v?'empty ':'')+(v==='*'?'joker':''); b.textContent=v==='*'?'★':(v||'+');
      b.addEventListener('click',()=>openPicker({type:'rack',i})); rackEl.appendChild(b);
    }
  }
  function openPicker(target) {
    state.pickerTarget=target; $('picker').classList.remove('hidden'); $('pickerBackdrop').classList.remove('hidden');
    const isBoard=target.type==='board'; $('jokerExistingWrap').classList.toggle('hidden',!isBoard); $('pickJoker').classList.toggle('hidden',isBoard);
    $('pickerTitle').textContent=isBoard?`Tahta • ${E.coord(target.r,target.c)}`:`El taşı ${target.i+1}`;
    if(isBoard){ const t=state.board[target.r][target.c]; $('jokerExisting').checked=!!(t&&t.isJoker); }
  }
  function closePicker(){ $('picker').classList.add('hidden'); $('pickerBackdrop').classList.add('hidden'); state.pickerTarget=null; }
  function pickLetter(letter){
    const t=state.pickerTarget;if(!t)return;
    if(t.type==='board') state.board[t.r][t.c]={letter,isJoker:$('jokerExisting').checked};
    else state.rack[t.i]=letter;
    persist();renderBoard();renderRack();closePicker();
  }
  function pickJoker(){ const t=state.pickerTarget;if(t&&t.type==='rack'){state.rack[t.i]='*';persist();renderRack();closePicker();} }
  function clearPicked(){ const t=state.pickerTarget;if(!t)return;if(t.type==='board')state.board[t.r][t.c]=null;else state.rack[t.i]=null;persist();renderBoard();renderRack();closePicker(); }

  function combinedWords() {
    const base=(state.dictionary&&state.dictionary.words)||[]; const set=new Set(base);
    state.customAdded.forEach(w=>set.add(w)); state.blocked.forEach(w=>set.delete(w)); return [...set];
  }
  function initWorker(){
    state.workerReady=false; $('dictBadge').textContent='Sözlük motoru hazırlanıyor…';
    worker.postMessage({type:'init',words:combinedWords()});
  }
  worker.onmessage=e=>{
    const m=e.data||{};
    if(m.type==='ready'){
      state.workerReady=true; $('dictBadge').textContent=`${m.dictionarySize.toLocaleString('tr-TR')} kelime hazır`; updateDictInfo();
    } else if(m.type==='solved'){
      $('loading').classList.add('hidden'); state.results=m.results||[]; renderResults(); switchTab('results');
      $('resultSummary').textContent=`${state.results.length.toLocaleString('tr-TR')} geçerli hamle • ${m.elapsedMs} ms • ${m.firstMove?'İlk hamle':'Devam eden oyun'}`;
    } else if(m.type==='error'){ $('loading').classList.add('hidden'); toast(m.message||'Bir hata oluştu.'); }
  };

  function solve(){
    const rack=state.rack.filter(Boolean); if(!rack.length){toast('Önce elindeki taşları gir.');return;}
    if(!state.workerReady){toast('Sözlük motoru henüz hazırlanıyor.');return;}
    $('loading').classList.remove('hidden');
    worker.postMessage({type:'solve',id:++solveId,board:state.board,rack,settings:state.settings});
  }
  function sortedFiltered(){
    let arr=[...state.results]; const f=$('filterTiles').value;if(f!=='all')arr=arr.filter(x=>x.usedTiles===+f);
    const s=$('sortResults').value;
    if(s==='tiles')arr.sort((a,b)=>b.usedTiles-a.usedTiles||b.score.total-a.score.total);
    else if(s==='length')arr.sort((a,b)=>b.word.length-a.word.length||b.score.total-a.score.total);
    else arr.sort((a,b)=>b.score.total-a.score.total||b.usedTiles-a.usedTiles);
    return arr;
  }
  function renderResults(){
    const arr=sortedFiltered(); resultsEl.innerHTML='';
    if(!arr.length){resultsEl.innerHTML='<div class="card muted">Bu filtrede geçerli hamle bulunamadı.</div>';return;}
    const frag=document.createDocumentFragment();
    arr.forEach((m,idx)=>{
      const el=document.createElement('button'); el.className='result-card';
      const chips=[`${m.direction} • ${m.start}→${m.end}`,`${m.usedTiles} yeni taş`];
      if(m.jokers.length) chips.push('Joker: '+m.jokers.map(j=>j.as).join(', '));
      if(m.crossWords.length) chips.push('Yan: '+m.crossWords.join(', '));
      el.innerHTML=`<div class="result-top"><div><div class="result-word">${idx+1}. ${m.word}</div><div class="chips">${chips.map(x=>`<span class="chip">${x}</span>`).join('')}${m.score.star3Bonus?'<span class="chip star">3★ +25</span>':''}${m.score.sevenTileBonus?`<span class="chip star">7 taş +${m.score.sevenTileBonus}</span>`:''}</div></div><span class="score-pill">${m.score.total} p</span></div>`;
      el.addEventListener('click',()=>openMove(m));frag.appendChild(el);
    }); resultsEl.appendChild(frag);
  }
  function openMove(m){
    state.selectedMove=m;$('moveTitle').textContent=`${m.word} • ${m.score.total} puan`;$('moveSubtitle').textContent=`${m.direction} • ${m.start} → ${m.end}`;
    const map=new Map(m.placements.map(p=>[p.r+','+p.c,p]));const pb=$('previewBoard');pb.innerHTML='';
    for(let r=0;r<15;r++)for(let c=0;c<15;c++){
      const bonus=E.BONUS[r][c],cell=document.createElement('div');cell.className='cell '+bonusClass(bonus);cell.innerHTML=`<span class="bonus">${bonusLabel(bonus)}</span>`;
      if(state.board[r][c])cell.innerHTML+=tileHtml(state.board[r][c]); else if(map.has(r+','+c))cell.innerHTML+=tileHtml(map.get(r+','+c),'new'); pb.appendChild(cell);
    }
    const rows=[['Ana kelime',`${m.word}: ${m.score.mainScore} p`],['Yeni taş',m.usedTiles],['Yan kelimeler',m.score.crossDetails.length?m.score.crossDetails.map(x=>`${x.word} (${x.score})`).join(', '):'Yok'],['Yan kelime toplamı',m.score.crossTotal+' p'],['3 yıldız bonusu','+'+m.score.star3Bonus],['7 taş bonusu','+'+m.score.sevenTileBonus],['Toplam',m.score.total+' p']];
    $('moveDetails').innerHTML=rows.map(([a,b])=>`<div class="detail-row"><span>${a}</span><strong>${b}</strong></div>`).join('');
    $('moveBackdrop').classList.remove('hidden');$('moveSheet').classList.remove('hidden');
  }
  function closeMove(){$('moveBackdrop').classList.add('hidden');$('moveSheet').classList.add('hidden');}
  function switchTab(name){
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id==='tab-'+name));
    document.querySelectorAll('.bottom-nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
  }
  function updateDictInfo(){
    if(!state.dictionary)return; const d=state.dictionary;
    $('dictInfo').textContent=`Kaynak: ${d.source==='Yerleşik mini sözlük'?d.source:'TDK İmla Kılavuzu tabanlı açık liste'} • ${combinedWords().length.toLocaleString('tr-TR')} aktif kelime${d.updatedAt?' • Güncelleme: '+new Date(d.updatedAt).toLocaleDateString('tr-TR'):''}`;
    $('customWordInfo').textContent=`Eklenen: ${state.customAdded.size} • Engellenen: ${state.blocked.size}`;
  }
  function normWord(v){return E.normalizeWord(v);}
  function addCustom(){const w=normWord($('addWordInput').value);if(!w){toast('Geçerli 2–15 harfli Türkçe kelime gir.');return;}state.customAdded.add(w);state.blocked.delete(w);$('addWordInput').value='';persist();initWorker();updateDictInfo();toast(w+' eklendi.');}
  function blockCustom(){const w=normWord($('blockWordInput').value);if(!w){toast('Geçerli kelime gir.');return;}state.blocked.add(w);state.customAdded.delete(w);$('blockWordInput').value='';persist();initWorker();updateDictInfo();toast(w+' engellendi.');}
  async function loadDictionary(){state.dictionary=await D.loadCached();initWorker();updateDictInfo();}
  async function downloadDictionary(){
    const btn=$('downloadDictBtn');btn.disabled=true;const old=btn.textContent;
    try{state.dictionary=await D.downloadFull(msg=>{$('dictBadge').textContent=msg;btn.textContent=msg;});initWorker();updateDictInfo();toast('Tam sözlük cihaza kaydedildi.');}
    catch(err){toast('Sözlük indirilemedi: '+err.message);}finally{btn.disabled=false;btn.textContent=old;}
  }
  function initAlphabet(){const el=$('alphabetPicker');E.ALPHABET.forEach(ch=>{const b=document.createElement('button');b.textContent=ch;b.addEventListener('click',()=>pickLetter(ch));el.appendChild(b);});}
  function initScores(){const el=$('scoreTable');for(const ch of E.ALPHABET){const d=document.createElement('div');d.innerHTML=`<strong>${ch}</strong>${E.LETTER_SCORES[ch]} p`;el.appendChild(d);}}
  function resetAll(){if(!confirm('Tahta, el, ayarlar ve özel kelime seçimleri sıfırlansın mı?'))return;['ka-board','ka-rack','ka-seven-bonus','ka-added','ka-blocked'].forEach(k=>localStorage.removeItem(k));location.reload();}

  document.querySelectorAll('.bottom-nav button').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));
  $('solveBtn').addEventListener('click',solve);$('clearBoardBtn').addEventListener('click',()=>{state.board=E.cloneBoard(null);persist();renderBoard();});
  $('closePicker').addEventListener('click',closePicker);$('pickerBackdrop').addEventListener('click',closePicker);$('pickJoker').addEventListener('click',pickJoker);$('clearPicked').addEventListener('click',clearPicked);
  $('closeMove').addEventListener('click',closeMove);$('moveBackdrop').addEventListener('click',closeMove);$('filterTiles').addEventListener('change',renderResults);$('sortResults').addEventListener('change',renderResults);
  $('downloadDictBtn').addEventListener('click',downloadDictionary);$('addWordBtn').addEventListener('click',addCustom);$('blockWordBtn').addEventListener('click',blockCustom);
  $('sevenBonus').value=state.settings.sevenTileBonus;$('sevenBonus').addEventListener('change',e=>{state.settings.sevenTileBonus=Math.max(0,+e.target.value||0);persist();});$('resetAllBtn').addEventListener('click',resetAll);
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e;$('installBtn').classList.remove('hidden');});
  $('installBtn').addEventListener('click',async()=>{if(state.deferredPrompt){state.deferredPrompt.prompt();state.deferredPrompt=null;$('installBtn').classList.add('hidden');}else toast('Safari: Paylaş → Ana Ekrana Ekle');});
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));

  initAlphabet();initScores();renderBoard();renderRack();loadDictionary();
})();
