(() => {
  'use strict';

  // Kelimelik'te rakibin SON hamlesindeki taşlar turuncu, eski taşlar sarıdır.
  // Son hamlede oluşan kelimenin anlamını açan mavi “?” simgesi taşın sağ alt
  // köşesinde görünebilir. Bu simge harf değildir. Sistem hiçbir harfi (U dahil)
  // önceden varsaymaz; yalnızca sağ üst puanı ve sağ alt ? simgesini temizleyip
  // ortadaki GERÇEK büyük harfi OCR'ye bırakır.
  if (!window.Tesseract || !window.Tesseract.createWorker) return;

  const originalCreateWorker = window.Tesseract.createWorker.bind(window.Tesseract);
  const badgeSequence = [];
  const seenColorCanvases = new WeakSet();
  window.__kaMeaningBadgeSequence = badgeSequence;

  function visualInfo(input) {
    if (!(input instanceof HTMLCanvasElement) || input.width !== 220 || input.height !== 220) {
      return { recentOrange:false, meaningBadge:false, colorful:false };
    }
    const ctx=input.getContext('2d',{willReadFrequently:true});
    const d=ctx.getImageData(0,0,input.width,input.height).data;
    let orange=0,cyan=0,colorful=0,total=0;
    for(let y=0;y<input.height;y+=3) for(let x=0;x<input.width;x+=3){
      const i=(y*input.width+x)*4,R=d[i],G=d[i+1],B=d[i+2]; total++;
      if((R>175&&G>60&&G<165&&B<105) || (R>215&&G>185&&B<185)) colorful++;
      if(R>175&&G>60&&G<165&&B<105) orange++;
      if(x>input.width*.55 && y>input.height*.45 && B>145 && G>115 && R<115 && B>R*1.35) cyan++;
    }
    return {
      recentOrange: orange/total>.20,
      meaningBadge: cyan/total>.006,
      colorful: colorful/total>.18
    };
  }

  function coreLetterCanvas(input){
    // Ana harfin gövdesini ve Türkçe karakterlerin üst işaretlerini koru;
    // sağ üst puan rakamı ve sağ alt ? bu kırpımın dışında kalır.
    const sx=input.width*.08, sy=input.height*.03;
    const sw=input.width*.63, sh=input.height*.91;
    const out=document.createElement('canvas');out.width=220;out.height=220;
    const ctx=out.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,220,220);
    const scale=Math.min(194/sw,204/sh),dw=sw*scale,dh=sh*scale;
    ctx.drawImage(input,sx,sy,sw,sh,(220-dw)/2,(220-dh)/2,dw,dh);
    return out;
  }

  function sanitizeTileCanvas(input,info) {
    if (!(input instanceof HTMLCanvasElement)) return input;
    if (input.width !== 220 || input.height !== 220) return input;

    // Rakibin turuncu son-hamle taşında sağ altta ? varsa yalnızca ana harfi ver.
    if(info.recentOrange && info.meaningBadge) return coreLetterCanvas(input);

    const copy=document.createElement('canvas');copy.width=input.width;copy.height=input.height;
    const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(input,0,0);
    ctx.fillStyle='#fff';
    // Sağ üst: küçük puan rakamı.
    ctx.fillRect(copy.width*.70,0,copy.width*.30,copy.height*.36);
    // Sağ alt: anlam “?” simgesi. Orta ana harfe dokunma.
    ctx.fillRect(copy.width*.72,copy.height*.60,copy.width*.28,copy.height*.40);
    return copy;
  }

  // Turuncu taşın sağ altındaki anlam “?” simgesi joker değildir. OCR sırasında
  // hangi gerçek tahta taşında bu rozet görüldüğünü kaydedip o taş için isJoker=false yap.
  const nativeSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage && key==='ka-board' && badgeSequence.length){
      try{
        const board=JSON.parse(value); let n=0;
        for(let r=0;r<15;r++) for(let c=0;c<15;c++) if(board?.[r]?.[c]){
          if(badgeSequence[n]===true) board[r][c].isJoker=false;
          n++;
        }
        value=JSON.stringify(board);
      }catch{}
    }
    return nativeSetItem.call(this,key,value);
  };

  function resetSequence(){badgeSequence.length=0;}
  document.addEventListener('change',e=>{if(e.target&&e.target.id==='screenshotInput')resetSequence();},true);
  document.addEventListener('click',e=>{if(e.target&&e.target.id==='analyzeScreenshotBtn')resetSequence();},true);

  window.Tesseract.createWorker=async function(...args){
    const worker=await originalCreateWorker(...args);
    if(!worker||typeof worker.recognize!=='function')return worker;

    const originalRecognize=worker.recognize.bind(worker);
    worker.recognize=async function(image,...rest){
      const info=visualInfo(image);
      // Aynı renkli RAW canvas iki farklı OCR modunda tekrar kullanılabilir.
      // Her taşın rozet bilgisini yalnızca bir kez sıraya ekle.
      if(info.colorful && !seenColorCanvases.has(image)){
        seenColorCanvases.add(image);
        badgeSequence.push(!!(info.recentOrange&&info.meaningBadge));
      }

      // Burada hiçbir harfi zorlamıyoruz. Çıktı tamamen temizlenmiş gerçek harften gelir.
      return originalRecognize(sanitizeTileCanvas(image,info),...rest);
    };
    return worker;
  };
})();
