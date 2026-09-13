(() => {
  'use strict';

  // Kelimelik'te rakibin SON hamlesindeki taşlar turuncu, eski taşlar sarıdır.
  // Son hamlede oluşan kelimenin anlamını açan mavi “?” simgesi bir taşın SAĞ ALT
  // köşesinde görünebilir. Bu işaret harf değildir ve joker işareti de değildir.
  // Bu katman, özellikle turuncu+? taşlarda yalnızca ortadaki büyük harfi OCR'ye verir.
  if (!window.Tesseract || !window.Tesseract.createWorker) return;

  const originalCreateWorker = window.Tesseract.createWorker.bind(window.Tesseract);
  const badgeSequence = [];
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

  function darkBrown(R,G,B){
    return R<175 && G<145 && B<120 && (R+G+B)<410;
  }

  // U ve E gibi harflerde, soru işaretinin OCR'yi bozması halinde şekil denetimi.
  // U: üst/orta kesitte iki ayrı dikey kol, alt kesitte birleşen tek gövde.
  function looksLikeU(input){
    if(!(input instanceof HTMLCanvasElement)) return false;
    const w=input.width,h=input.height,ctx=input.getContext('2d',{willReadFrequently:true});
    const d=ctx.getImageData(0,0,w,h).data;
    const pts=[];
    for(let y=Math.floor(h*.10);y<Math.floor(h*.88);y++) for(let x=Math.floor(w*.12);x<Math.floor(w*.70);x++){
      const i=(y*w+x)*4;
      if(darkBrown(d[i],d[i+1],d[i+2])) pts.push([x,y]);
    }
    if(pts.length<120) return false;
    let minX=w,maxX=0,minY=h,maxY=0;
    for(const [x,y] of pts){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
    const bw=maxX-minX+1,bh=maxY-minY+1;
    if(bw<w*.18||bh<h*.32) return false;

    function runsAt(frac){
      const y=Math.max(0,Math.min(h-1,Math.round(minY+bh*frac)));
      const row=[];
      for(let x=minX;x<=maxX;x++){
        const i=(y*w+x)*4; row.push(darkBrown(d[i],d[i+1],d[i+2]));
      }
      let runs=0,len=0;
      for(let i=0;i<=row.length;i++){
        if(i<row.length&&row[i]) len++;
        else { if(len>=Math.max(3,Math.round(bw*.05))) runs++; len=0; }
      }
      return runs;
    }
    const upper=runsAt(.28),middle=runsAt(.52),lower=runsAt(.80);
    return upper>=2 && middle>=2 && lower===1;
  }

  function coreLetterCanvas(input){
    const sx=input.width*.10, sy=input.height*.07;
    const sw=input.width*.60, sh=input.height*.84; // sağ üst puan ve sağ alt ? tamamen dışarıda
    const out=document.createElement('canvas');out.width=220;out.height=220;
    const ctx=out.getContext('2d',{willReadFrequently:true});
    ctx.fillStyle='#fff';ctx.fillRect(0,0,220,220);
    const scale=Math.min(188/sw,198/sh),dw=sw*scale,dh=sh*scale;
    ctx.drawImage(input,sx,sy,sw,sh,(220-dw)/2,(220-dh)/2,dw,dh);
    return out;
  }

  function sanitizeTileCanvas(input,info) {
    if (!(input instanceof HTMLCanvasElement)) return input;
    if (input.width !== 220 || input.height !== 220) return input;

    // Turuncu son-hamle taşı + mavi ? varsa sadece ana harfin çekirdeğini kullan.
    if(info.recentOrange && info.meaningBadge) return coreLetterCanvas(input);

    const copy=document.createElement('canvas');copy.width=input.width;copy.height=input.height;
    const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(input,0,0);
    ctx.fillStyle='#fff';
    // Sağ üstteki küçük puan.
    ctx.fillRect(copy.width*.70,0,copy.width*.30,copy.height*.36);
    // Sağ alttaki anlam “?” simgesi bölgesi.
    ctx.fillRect(copy.width*.68,copy.height*.54,copy.width*.32,copy.height*.46);
    return copy;
  }

  // Soru işaretli taşın mavi rozeti daha önce yanlışlıkla joker sanılabiliyordu.
  // OCR sırasındaki gerçek tahta taşlarının rozet bilgisini sırayla tutup, ka-board
  // kaydedilirken yalnızca bu taşlarda isJoker=false yapıyoruz.
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
      // Her gerçek tahta taşının ilk RAW çağrısı renkli olur. Böylece ? rozeti sırası korunur.
      if(info.colorful) badgeSequence.push(!!(info.recentOrange&&info.meaningBadge));

      const uShape=info.recentOrange&&info.meaningBadge&&looksLikeU(image);
      const out=await originalRecognize(sanitizeTileCanvas(image,info),...rest);

      // Gerçek U şekli, soru işareti yüzünden E vb. okunmuşsa U'yu zorunlu kabul et.
      if(uShape && out && out.data){out.data.text='U';out.data.confidence=99;}
      return out;
    };
    return worker;
  };
})();
