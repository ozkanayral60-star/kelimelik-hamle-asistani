(() => {
  'use strict';
  const E = window.KelimelikEngine;
  function readStar3(){
    try { return JSON.parse(localStorage.getItem('ka-star3') || 'null'); }
    catch { return null; }
  }
  function applyStar3(){
    if(!E || !E.BONUS) return;
    for(let r=0;r<15;r++) for(let c=0;c<15;c++) if(E.BONUS[r][c] === 'STAR3') E.BONUS[r][c] = null;
    const s=readStar3();
    if(s && Number.isInteger(s.r) && Number.isInteger(s.c) && s.r>=0 && s.r<15 && s.c>=0 && s.c<15) E.BONUS[s.r][s.c]='STAR3';
  }
  applyStar3();

  const NativeWorker = window.Worker;
  window.Worker = function(...args){
    const w = new NativeWorker(...args);
    const nativePost = w.postMessage.bind(w);
    w.postMessage = function(message, ...rest){
      if(message && message.type === 'solve'){
        message = {...message, settings:{...(message.settings||{}), star3:readStar3()}};
      }
      return nativePost(message, ...rest);
    };
    return w;
  };
  window.Worker.prototype = NativeWorker.prototype;

  document.addEventListener('DOMContentLoaded',()=>{
    const clear=document.getElementById('clearBoardBtn');
    if(clear) clear.addEventListener('click',()=>{
      localStorage.removeItem('ka-star3');
      applyStar3();
    });
  });
})();
