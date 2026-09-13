(() => {
  'use strict';

  function parseCard(card) {
    const wordEl = card.querySelector('.result-word');
    if (!wordEl) return null;
    const raw = wordEl.textContent || '';
    const word = raw.replace(/^\s*\d+\.\s*/, '').trim();
    const chipTexts = [...card.querySelectorAll('.chip')].map(x => (x.textContent || '').trim());
    const usedText = chipTexts.find(x => /yeni taş/i.test(x));
    const used = usedText ? +(usedText.match(/\d+/) || [0])[0] : 0;
    return { word, used, boardUsed: Math.max(0, word.length - used) };
  }

  function enhanceCard(card) {
    if (card.dataset.longWordEnhanced === '1') return;
    const info = parseCard(card); if (!info) return;
    const chips = card.querySelector('.chips'); if (!chips) return;
    const len = document.createElement('span'); len.className = 'chip'; len.textContent = `${info.word.length} harfli kelime`;
    const board = document.createElement('span'); board.className = 'chip board-contrib'; board.textContent = `${info.boardUsed} harf tahtadan`;
    chips.insertBefore(board, chips.firstChild);
    chips.insertBefore(len, chips.firstChild);
    if (info.word.length > 7) {
      const long = document.createElement('span'); long.className='chip long-word'; long.textContent='Uzun kelime'; chips.insertBefore(long, chips.firstChild);
    }
    card.dataset.longWordEnhanced='1';
  }

  function enhanceAllCards() { document.querySelectorAll('.result-card').forEach(enhanceCard); }

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
    const results=document.getElementById('results'); if(!results) return;
    const obs=new MutationObserver(enhanceAllCards); obs.observe(results,{childList:true,subtree:true});
    enhanceAllCards();
    results.addEventListener('click',e=>{
      const card=e.target.closest('.result-card'); if(card) enhanceMoveSheet(card);
    }, true);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
