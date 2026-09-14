(() => {
  'use strict';

  let observer = null;
  let regroupTimer = null;
  let regrouping = false;

  function injectStyles(){
    if(document.getElementById('longWordRevisionStyles')) return;
    const s=document.createElement('style'); s.id='longWordRevisionStyles';
    s.textContent=`
      .chip.long-word{background:#e7f5ff;color:#0d6588;font-weight:800}
      .chip.board-contrib{background:#eef7ea;color:#41723a;font-weight:800}
      .placement-legend{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 4px;font-size:11px;color:#5c7079}
      .placement-legend span{display:flex;align-items:center;gap:5px}
      .placement-legend i{display:inline-block;width:14px;height:14px;border-radius:4px;box-shadow:inset 0 -2px 0 #0002}
      .legend-existing{background:#f5c81f}.legend-new{background:#ff9b27}
      .length-group{display:flex;flex-direction:column;gap:8px;margin:0 0 16px}
      .length-header{position:sticky;top:72px;z-index:8;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#0f4e69;color:white;border-radius:14px;padding:10px 12px;box-shadow:0 4px 13px #16303b20}
      .length-header strong{font-size:17px}.length-header span{font-size:11px;opacity:.88;font-weight:800}
      .best-result{border:2px solid #e1a800;box-shadow:0 5px 18px #d9a90025}
      .best-badge{display:inline-flex;align-items:center;gap:4px;background:#fff0b5;color:#795900;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900}
      .result-card .result-word{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    `;
    document.head.appendChild(s);
  }

  function parseCard(card) {
    const wordEl = card.querySelector('.result-word');
    if (!wordEl) return null;
    const raw = card.dataset.word || wordEl.textContent || '';
    const word = raw.replace(/^\s*\d+\.\s*/, '').replace(/🏆.*$/,'').trim();
    const chipTexts = [...card.querySelectorAll('.chip')].map(x => (x.textContent || '').trim());
    const usedText = chipTexts.find(x => /yeni taş/i.test(x));
    const used = usedText ? +(usedText.match(/\d+/) || [0])[0] : 0;
    const scoreText=(card.querySelector('.score-pill')?.textContent||'').match(/\d+/);
    const score=scoreText?+scoreText[0]:0;
    return { word, used, boardUsed: Math.max(0, word.length - used), score };
  }

  function enhanceCard(card) {
    const info = parseCard(card); if (!info) return;
    card.dataset.word=info.word;
    card.dataset.wordLength=String(info.word.length);
    card.dataset.score=String(info.score);
    const wordEl=card.querySelector('.result-word');
    if(wordEl && wordEl.dataset.cleaned!=='1'){
      wordEl.textContent=info.word;
      wordEl.dataset.cleaned='1';
    }
    if (card.dataset.longWordEnhanced === '1') return;
    const chips = card.querySelector('.chips'); if (!chips) return;
    const len = document.createElement('span'); len.className = 'chip'; len.textContent = `${info.word.length} harfli`;
    const board = document.createElement('span'); board.className = 'chip board-contrib'; board.textContent = `${info.boardUsed} harf tahtadan`;
    chips.insertBefore(board, chips.firstChild);
    chips.insertBefore(len, chips.firstChild);
    if (info.word.length > 7) {
      const long = document.createElement('span'); long.className='chip long-word'; long.textContent='Uzun kelime'; chips.insertBefore(long, chips.firstChild);
    }
    card.dataset.longWordEnhanced='1';
  }

  function markBest(cards){
    cards.forEach(c=>{c.classList.remove('best-result');c.querySelector('.best-badge')?.remove();});
    if(!cards.length)return;
    let best=cards[0];
    for(const c of cards) if(+(c.dataset.score||0)>+(best.dataset.score||0)) best=c;
    best.classList.add('best-result');
    const chips=best.querySelector('.chips');
    if(chips){const b=document.createElement('span');b.className='best-badge';b.textContent='🏆 En yüksek puan';chips.insertBefore(b,chips.firstChild);}
  }

  function regroupResults(){
    if(regrouping)return;
    const results=document.getElementById('results'); if(!results)return;
    const cards=[...results.querySelectorAll('.result-card')];
    if(!cards.length)return;
    regrouping=true;
    if(observer)observer.disconnect();
    cards.forEach(enhanceCard);

    const quick=document.getElementById('quickFilter')?.value||'all';
    markBest(cards);
    results.innerHTML='';

    if(quick==='top5'){
      cards.sort((a,b)=>+(b.dataset.score||0)-+(a.dataset.score||0)||+(b.dataset.wordLength||0)-+(a.dataset.wordLength||0));
      const section=document.createElement('section');section.className='length-group';
      const header=document.createElement('div');header.className='length-header';
      header.innerHTML=`<strong>En yüksek puanlı 5 hamle</strong><span>${cards.length} seçenek</span>`;
      section.appendChild(header);
      cards.forEach(card=>section.appendChild(card));
      results.appendChild(section);
      regrouping=false;
      if(observer)observer.observe(results,{childList:true,subtree:true});
      return;
    }

    cards.sort((a,b)=>{
      const la=+(a.dataset.wordLength||0),lb=+(b.dataset.wordLength||0);
      const sa=+(a.dataset.score||0),sb=+(b.dataset.score||0);
      return lb-la || sb-sa || (a.dataset.word||'').localeCompare(b.dataset.word||'','tr');
    });
    const groups=new Map();
    for(const card of cards){
      const len=+(card.dataset.wordLength||0);
      if(!groups.has(len))groups.set(len,[]);
      groups.get(len).push(card);
    }
    [...groups.keys()].sort((a,b)=>b-a).forEach(len=>{
      const section=document.createElement('section');section.className='length-group';
      const header=document.createElement('div');header.className='length-header';
      header.innerHTML=`<strong>${len} harfli kelimeler</strong><span>${groups.get(len).length} seçenek</span>`;
      section.appendChild(header);
      groups.get(len).sort((a,b)=>+(b.dataset.score||0)-+(a.dataset.score||0)).forEach(card=>section.appendChild(card));
      results.appendChild(section);
    });
    regrouping=false;
    if(observer)observer.observe(results,{childList:true,subtree:true});
  }

  function scheduleRegroup(){
    clearTimeout(regroupTimer);
    regroupTimer=setTimeout(regroupResults,20);
  }

  function enhanceMoveSheet(card) {
    const info = parseCard(card); if (!info) return;
    requestAnimationFrame(() => {
      const details = document.getElementById('moveDetails');
      const preview = document.getElementById('previewBoard');
      if (!details || !preview) return;
      details.querySelectorAll('.revision-extra').forEach(x=>x.remove());
      const first = details.firstElementChild;
      const row1=document.createElement('div'); row1.className='detail-row revision-extra'; row1.innerHTML=`<span>Kelime uzunluğu</span><strong>${info.word.length} harf</strong>`;
      const row2=document.createElement('div'); row2.className='detail-row revision-extra'; row2.innerHTML=`<span>Tahtadan kullanılan harf</span><strong>${info.boardUsed}</strong>`;
      details.insertBefore(row2, first);
      details.insertBefore(row1, row2);
      let legend=document.getElementById('placementLegend');
      if (!legend) {
        legend=document.createElement('div'); legend.id='placementLegend'; legend.className='placement-legend';
        legend.innerHTML='<span><i class="legend-existing"></i> Tahtada vardı</span><span><i class="legend-new"></i> Yeni koyacağın taş</span>';
        preview.parentNode.insertBefore(legend, preview);
      }
    });
  }

  function init() {
    injectStyles();
    const results=document.getElementById('results'); if(!results) return;
    observer=new MutationObserver(scheduleRegroup); observer.observe(results,{childList:true,subtree:true});
    scheduleRegroup();
    results.addEventListener('click',e=>{
      const card=e.target.closest('.result-card'); if(card) enhanceMoveSheet(card);
    }, true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();