(() => {
  'use strict';

  function boardHasTiles(){
    try{
      const b=JSON.parse(localStorage.getItem('ka-board')||'null');
      if(!Array.isArray(b))return false;
      for(const row of b)if(Array.isArray(row)&&row.some(Boolean))return true;
    }catch{}
    return false;
  }

  function fitImportedBoard(scrollToBoard=false){
    if(!boardHasTiles())return;
    const wrap=document.querySelector('#tab-board .board-wrap');
    const board=document.getElementById('board');
    if(!wrap||!board)return;

    const top=document.querySelector('.topbar');
    const nav=document.querySelector('.bottom-nav');
    const viewportHeight=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;
    const viewportWidth=(window.visualViewport&&window.visualViewport.width)||window.innerWidth;
    const topH=top?.getBoundingClientRect().height||0;
    const navH=nav?.getBoundingClientRect().height||0;

    // Tahtanın tamamı, üst başlık ile alt menü arasındaki görünür alana sığar.
    const availableH=Math.max(240,Math.floor(viewportHeight-topH-navH-18));
    const availableW=Math.max(240,Math.floor(Math.min(viewportWidth-12,wrap.parentElement?.clientWidth||viewportWidth)));
    const size=Math.min(availableW,availableH);

    wrap.style.width=size+'px';
    wrap.style.height=size+'px';
    wrap.style.maxWidth='calc(100vw - 12px)';
    wrap.style.maxHeight=availableH+'px';
    wrap.style.marginLeft='auto';
    wrap.style.marginRight='auto';
    board.style.width='100%';
    board.style.height='100%';
    board.style.maxWidth='100%';
    board.style.maxHeight='100%';

    if(scrollToBoard){
      requestAnimationFrame(()=>{
        const y=wrap.getBoundingClientRect().top+window.scrollY-topH-6;
        window.scrollTo({top:Math.max(0,y),behavior:'auto'});
      });
    }
  }

  function init(){
    let fresh=false;
    try{fresh=sessionStorage.getItem('ka-auto-fit-board')==='1';sessionStorage.removeItem('ka-auto-fit-board');}catch{}
    setTimeout(()=>fitImportedBoard(fresh),80);
    window.addEventListener('orientationchange',()=>setTimeout(()=>fitImportedBoard(false),120));
    window.addEventListener('resize',()=>fitImportedBoard(false));
    if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>fitImportedBoard(false));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();