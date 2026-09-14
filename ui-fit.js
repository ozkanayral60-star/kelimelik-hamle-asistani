(() => {
  'use strict';

  function fitImportedBoard(){
    let shouldFit=false;
    try{shouldFit=sessionStorage.getItem('ka-auto-fit-board')==='1';}catch{}
    if(!shouldFit)return;
    try{sessionStorage.removeItem('ka-auto-fit-board');}catch{}

    const wrap=document.querySelector('#tab-board .board-wrap');
    const board=document.getElementById('board');
    if(!wrap||!board)return;

    const top=document.querySelector('.topbar');
    const nav=document.querySelector('.bottom-nav');
    const viewportHeight=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;
    const available=Math.max(260,Math.floor(viewportHeight-(top?.offsetHeight||0)-(nav?.offsetHeight||0)-28));
    const containerWidth=Math.floor(wrap.parentElement?.clientWidth||window.innerWidth);
    const size=Math.min(containerWidth,available);

    wrap.style.width=size+'px';
    wrap.style.maxWidth='100%';
    wrap.style.marginLeft='auto';
    wrap.style.marginRight='auto';
    board.style.width='100%';

    requestAnimationFrame(()=>{
      wrap.scrollIntoView({block:'start',behavior:'auto'});
      const offset=(top?.offsetHeight||0)+8;
      if(offset)window.scrollBy(0,-offset);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(fitImportedBoard,80));
  else setTimeout(fitImportedBoard,80);
})();