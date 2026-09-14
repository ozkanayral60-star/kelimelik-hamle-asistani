(() => {
  'use strict';

  // Kelimelik'te rakibin son hamlesindeki taşlar turuncudur. Son hamlede oluşan
  // kelimenin anlamını açan mavi “?” simgesi taşın sağ alt köşesinde bulunabilir.
  // Bu simge joker değildir. Bu dosya iki işi yapar:
  // 1) OCR'ye giderken sağ üst puanı ve sağ alt ? simgesini maskeler.
  // 2) Ekran görüntüsünün kendisinden turuncu+? karelerin koordinatlarını bulur ve
  //    bu karelerin isJoker=true olarak kaydedilmesini kesin olarak engeller.

  const meaningCoords = new Set();
  let lastFile = null;

  function boardGeometry(img){
    const size=Math.min(img.width*.992,img.height*.4615);
    return{x:(img.width-size)/2,y:img.height*.3425,w:size,h:size};
  }

  function isOrange(R,G,B){
    return R>175&&G>60&&G<165&&B<105;
  }

  function isMeaningBlue(R,G,B){
    return B>145&&G>105&&R<125&&B>R*1.25;
  }

  function scanMeaningBadges(file){
    meaningCoords.clear();
    if(!file)return;
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      try{
        const cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
        const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
        const g=boardGeometry(img),cw=g.w/15,ch=g.h/15;
        for(let r=0;r<15;r++)for(let c=0;c<15;c++){
          const x0=g.x+c*cw,y0=g.y+r*ch;
          let orange=0,orangeTotal=0,blueLR=0,lrTotal=0;
          for(let yy=0;yy<18;yy++)for(let xx=0;xx<18;xx++){
            const fx=(xx+.5)/18,fy=(yy+.5)/18;
            const x=Math.max(0,Math.min(cv.width-1,Math.round(x0+cw*fx)));
            const y=Math.max(0,Math.min(cv.height-1,Math.round(y0+ch*fy)));
            const d=ctx.getImageData(x,y,1,1).data,R=d[0],G=d[1],B=d[2];
            orangeTotal++;
            if(isOrange(R,G,B))orange++;
            if(fx>.52&&fy>.50){
              lrTotal++;
              if(isMeaningBlue(R,G,B))blueLR++;
            }
          }
          const orangeRatio=orange/Math.max(1,orangeTotal);
          const blueRatio=blueLR/Math.max(1,lrTotal);
          if(orangeRatio>.18&&blueRatio>.035) meaningCoords.add(r+','+c);
        }
      }finally{
        URL.revokeObjectURL(url);
      }
    };
    img.onerror=()=>URL.revokeObjectURL(url);
    img.src=url;
  }

  document.addEventListener('change',e=>{
    if(e.target&&e.target.id==='screenshotInput'){
      lastFile=e.target.files&&e.target.files[0]||null;
      scanMeaningBadges(lastFile);
    }
  },true);

  document.addEventListener('click',e=>{
    if(e.target&&e.target.id==='analyzeScreenshotBtn'&&lastFile) scanMeaningBadges(lastFile);
  },true);

  // Doğrudan koordinata göre düzeltme: OCR sırasına bağlı değildir. Böylece İ/I gibi
  // bazı harfler OCR'ye hiç gitmeden şekilden tanınsa bile sağ alttaki ? joker sayılmaz.
  const nativeSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key==='ka-board'&&meaningCoords.size){
      try{
        const board=JSON.parse(value);
        for(const key of meaningCoords){
          const [r,c]=key.split(',').map(Number);
          if(board?.[r]?.[c]){
            board[r][c].isJoker=false;
            board[r][c].meaningBadge=true;
          }
        }
        value=JSON.stringify(board);
      }catch{}
    }
    return nativeSetItem.call(this,key,value);
  };

  if(!window.Tesseract||!window.Tesseract.createWorker)return;
  const originalCreateWorker=window.Tesseract.createWorker.bind(window.Tesseract);

  function visualInfo(input){
    if(!(input instanceof HTMLCanvasElement)||input.width!==220||input.height!==220)return{recentOrange:false,meaningBadge:false};
    const ctx=input.getContext('2d',{willReadFrequently:true}),d=ctx.getImageData(0,0,input.width,input.height).data;
    let orange=0,total=0,blue=0,lr=0;
    for(let y=0;y<input.height;y+=3)for(let x=0;x<input.width;x+=3){
      const i=(y*input.width+x)*4,R=d[i],G=d[i+1],B=d[i+2];total++;
      if(isOrange(R,G,B))orange++;
      if(x>input.width*.52&&y>input.height*.50){lr++;if(isMeaningBlue(R,G,B))blue++;}
    }
    return{recentOrange:orange/Math.max(1,total)>.18,meaningBadge:blue/Math.max(1,lr)>.035};
  }

  function coreLetterCanvas(input){
    const sx=input.width*.08,sy=input.height*.03,sw=input.width*.63,sh=input.height*.91;
    const out=document.createElement('canvas');out.width=220;out.height=220;
    const ctx=out.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,220,220);
    const scale=Math.min(194/sw,204/sh),dw=sw*scale,dh=sh*scale;
    ctx.drawImage(input,sx,sy,sw,sh,(220-dw)/2,(220-dh)/2,dw,dh);
    return out;
  }

  function sanitize(input){
    if(!(input instanceof HTMLCanvasElement)||input.width!==220||input.height!==220)return input;
    const info=visualInfo(input);
    if(info.recentOrange&&info.meaningBadge)return coreLetterCanvas(input);
    const copy=document.createElement('canvas');copy.width=input.width;copy.height=input.height;
    const ctx=copy.getContext('2d',{willReadFrequently:true});ctx.drawImage(input,0,0);ctx.fillStyle='#fff';
    ctx.fillRect(copy.width*.70,0,copy.width*.30,copy.height*.36);
    ctx.fillRect(copy.width*.72,copy.height*.60,copy.width*.28,copy.height*.40);
    return copy;
  }

  window.Tesseract.createWorker=async function(...args){
    const worker=await originalCreateWorker(...args);
    if(!worker||typeof worker.recognize!=='function')return worker;
    const originalRecognize=worker.recognize.bind(worker);
    worker.recognize=function(image,...rest){return originalRecognize(sanitize(image),...rest);};
    return worker;
  };
})();
