(() => {
  'use strict';

  const E = window.KelimelikEngine;
  const ALPHABET = new Set(['A','B','C','Ç','D','E','F','G','Ğ','H','I','İ','J','K','L','M','N','O','Ö','P','R','S','Ş','T','U','Ü','V','Y','Z']);
  const BASE = {
    '': [226,226,226], H2:[153,187,195], H3:[207,185,204], K2:[163,193,155], K3:[192,172,150],
    STAR2:[245,210,139], STAR3:[245,210,139]
  };
  const $ = id => document.getElementById(id);
  let sourceImage = null;
  let worker = null;

  function injectStyles(){
    const s=document.createElement('style');
    s.textContent=`
      .scan-card{overflow:hidden}.scan-upload{display:block;border:2px dashed #9fb6c0;border-radius:16px;padding:18px;text-align:center;background:#f6f9fa;font-weight:800;color:#145a7a}
      .scan-upload input{display:none}.scan-preview{width:100%;border-radius:14px;margin-top:12px;display:none;background:#dfe7ea}.scan-preview.show{display:block}
      .scan-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}.scan-status{margin-top:10px;padding:10px;border-radius:12px;background:#eef5f7;font-size:12px;color:#526b75;white-space:pre-line}
      .scan-note{font-size:11px;color:#6b7e86;line-height:1.45;margin-top:8px}.scan-warning{background:#fff3cd;color:#765600;border:1px solid #f1d989;border-radius:12px;padding:10px;margin-bottom:10px;font-size:12px}
    `;
    document.head.appendChild(s);
  }

  function setStatus(text){ const el=$('scanStatus'); if(el) el.textContent=text; }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function rgbAt(ctx,x,y){ const d=ctx.getImageData(clamp(Math.round(x),0,ctx.canvas.width-1),clamp(Math.round(y),0,ctx.canvas.height-1),1,1).data; return [d[0],d[1],d[2]]; }
  function dist(a,b){ return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }

  function cellGeometry(img){
    // iPhone 13 Kelimelik ekran görüntülerine göre kalibre edilmiştir.
    // Aynı oyun arayüzü farklı çözünürlükteyse oranlar ölçeklenir.
    return {
      x: img.width * 0.0043,
      y: img.height * 0.3424,
      w: img.width * 0.9915,
      h: img.height * 0.4582
    };
  }

  function isOccupied(ctx, geom, r, c){
    const pw=geom.w/15, ph=geom.h/15;
    const x=geom.x+c*pw, y=geom.y+r*ph;
    const bonus=(E && E.BONUS && E.BONUS[r]) ? (E.BONUS[r][c] || '') : '';
    const base=BASE[bonus] || BASE[''];
    const pts=[[.22,.22],[.22,.78],[.78,.22],[.78,.78]];
    let changed=0;
    for(const [px,py] of pts){ if(dist(rgbAt(ctx,x+pw*px,y+ph*py),base)>17) changed++; }
    return changed>=2;
  }

  function cropCell(img, geom, r, c){
    const pw=geom.w/15, ph=geom.h/15;
    const sx=geom.x+c*pw+pw*.08, sy=geom.y+r*ph+ph*.06, sw=pw*.84, sh=ph*.88;
    const cv=document.createElement('canvas'); cv.width=128; cv.height=128;
    const cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(img,sx,sy,sw,sh,0,0,128,128);
    const im=cx.getImageData(0,0,128,128), d=im.data;
    for(let yy=0;yy<128;yy++) for(let xx=0;xx<128;xx++){
      const i=(yy*128+xx)*4, R=d[i],G=d[i+1],B=d[i+2];
      // Sağ üstteki küçük puanı dışarıda bırak; ana harfin koyu kahverengi/siyah piksellerini tut.
      const scoreZone=xx>88 && yy<50;
      const dark=(R<190 && G<165 && B<145 && (Math.max(R,G,B)-Math.min(R,G,B)<120));
      const keep=dark && !scoreZone;
      d[i]=d[i+1]=d[i+2]=keep?0:255; d[i+3]=255;
    }
    cx.putImageData(im,0,0);
    return cv;
  }

  function detectJokerBadge(img, geom, r, c){
    const pw=geom.w/15, ph=geom.h/15;
    const sx=Math.floor(geom.x+c*pw), sy=Math.floor(geom.y+r*ph), sw=Math.max(1,Math.floor(pw)), sh=Math.max(1,Math.floor(ph));
    const cv=document.createElement('canvas'); cv.width=sw; cv.height=sh; const cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh); const d=cx.getImageData(0,0,sw,sh).data;
    let blue=0,total=sw*sh;
    for(let i=0;i<d.length;i+=4){ const R=d[i],G=d[i+1],B=d[i+2]; if(B>120 && G>90 && R<100 && B>R*1.4) blue++; }
    return blue/total>.0025;
  }

  function normalizeOcr(text){
    const up=(text||'').toLocaleUpperCase('tr-TR').replace(/[^ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]/g,'');
    if(!up) return null;
    for(const ch of up){ if(ALPHABET.has(ch)) return ch; }
    return null;
  }

  async function getWorker(){
    if(worker) return worker;
    if(!window.Tesseract) throw new Error('OCR motoru yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    setStatus('Türkçe OCR motoru ilk kez hazırlanıyor…\nİlk kullanımda birkaç MB veri indirilebilir.');
    worker=await Tesseract.createWorker('tur', 1, { logger:m=>{
      if(m.status==='loading language traineddata') setStatus(`Türkçe OCR verisi yükleniyor… %${Math.round((m.progress||0)*100)}`);
      else if(m.status==='initializing api') setStatus('OCR motoru hazırlanıyor…');
    }});
    await worker.setParameters({
      tessedit_pageseg_mode: 10,
      tessedit_char_whitelist: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'
    });
    return worker;
  }

  async function readLetter(cv){
    const w=await getWorker();
    const out=await w.recognize(cv);
    return normalizeOcr(out && out.data && out.data.text);
  }

  function rackGeometry(img){ return {x:img.width*.016, y:img.height*.811, w:img.width*.969, h:img.height*.065}; }
  function rackSlotPresent(img, rg, i){
    const p=rg.w/7, sx=rg.x+i*p+p*.08, sy=rg.y+rg.h*.12, sw=p*.84, sh=rg.h*.76;
    const cv=document.createElement('canvas'); cv.width=50; cv.height=50; const cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(img,sx,sy,sw,sh,0,0,50,50); const d=cx.getImageData(0,0,50,50).data;
    let yellow=0;
    for(let k=0;k<d.length;k+=4){ const R=d[k],G=d[k+1],B=d[k+2]; if(R>190 && G>130 && B<190) yellow++; }
    return yellow/(50*50)>.25;
  }
  function cropRack(img,rg,i){
    const p=rg.w/7, sx=rg.x+i*p+p*.08, sy=rg.y+rg.h*.05, sw=p*.84, sh=rg.h*.9;
    const cv=document.createElement('canvas');cv.width=128;cv.height=128;const cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(img,sx,sy,sw,sh,0,0,128,128); const im=cx.getImageData(0,0,128,128),d=im.data;
    for(let yy=0;yy<128;yy++)for(let xx=0;xx<128;xx++){
      const k=(yy*128+xx)*4,R=d[k],G=d[k+1],B=d[k+2]; const scoreZone=xx>90&&yy<45;
      const dark=R<190&&G<165&&B<145; const keep=dark&&!scoreZone;
      d[k]=d[k+1]=d[k+2]=keep?0:255;d[k+3]=255;
    }
    cx.putImageData(im,0,0);return cv;
  }

  async function analyze(){
    if(!sourceImage){ setStatus('Önce Kelimelik ekran görüntüsünü seç.'); return; }
    const btn=$('analyzeScreenshotBtn'); btn.disabled=true;
    try{
      const img=sourceImage, cv=document.createElement('canvas'); cv.width=img.width;cv.height=img.height;
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const geom=cellGeometry(img), board=Array.from({length:15},()=>Array(15).fill(null));
      const occupied=[];
      for(let r=0;r<15;r++)for(let c=0;c<15;c++) if(isOccupied(ctx,geom,r,c)) occupied.push([r,c]);
      setStatus(`${occupied.length} tahta taşı algılandı. Harfler okunuyor…`);
      const unresolved=[];
      for(let n=0;n<occupied.length;n++){
        const [r,c]=occupied[n]; setStatus(`Tahtadaki harfler okunuyor: ${n+1}/${occupied.length}\n${E.coord(r,c)}`);
        const letter=await readLetter(cropCell(img,geom,r,c));
        if(letter) board[r][c]={letter,isJoker:detectJokerBadge(img,geom,r,c)};
        else unresolved.push(E.coord(r,c));
      }

      const rg=rackGeometry(img), rack=[]; const rackUnresolved=[];
      for(let i=0;i<7;i++){
        if(!rackSlotPresent(img,rg,i)) continue;
        setStatus(`Eldeki taşlar okunuyor: ${i+1}/7`);
        const letter=await readLetter(cropRack(img,rg,i));
        if(letter) rack.push(letter); else { rack.push('*'); rackUnresolved.push(i+1); }
      }
      while(rack.length<7) rack.push(null);
      localStorage.setItem('ka-board',JSON.stringify(board));
      localStorage.setItem('ka-rack',JSON.stringify(rack.slice(0,7)));
      const notes=[];
      if(unresolved.length) notes.push('Okunamayan tahta kareleri: '+unresolved.join(', '));
      if(rackUnresolved.length) notes.push('Harf okunamayan el taşı joker varsayıldı: '+rackUnresolved.join(', '));
      sessionStorage.setItem('ka-scan-note',notes.join(' • ') || `${occupied.length} tahta taşı ve ${rack.filter(Boolean).length} el taşı ekran görüntüsünden aktarıldı.`);
      setStatus(`Tamamlandı. ${occupied.length-unresolved.length}/${occupied.length} tahta harfi okundu. Tahtaya aktarılıyor…`);
      setTimeout(()=>location.reload(),500);
    }catch(err){ console.error(err); setStatus('Analiz tamamlanamadı: '+(err.message||err)); btn.disabled=false; }
  }

  function loadFile(file){
    if(!file)return; const url=URL.createObjectURL(file), img=new Image();
    img.onload=()=>{sourceImage=img; const prev=$('scanPreview');prev.src=url;prev.classList.add('show');$('analyzeScreenshotBtn').disabled=false;setStatus(`Görüntü hazır: ${img.width} × ${img.height}\n“Ekran görüntüsünü analiz et”e bas.`);};
    img.onerror=()=>setStatus('Görüntü açılamadı.');img.src=url;
  }

  function showPreviousNote(){
    const note=sessionStorage.getItem('ka-scan-note'); if(!note)return; sessionStorage.removeItem('ka-scan-note');
    const boardTab=$('tab-board'); if(!boardTab)return; const d=document.createElement('div'); d.className='scan-warning';
    d.innerHTML='<strong>Ekran görüntüsü aktarıldı.</strong><br>'+note+'<br><br>Tahtayı ve elindeki taşları hızlıca kontrol et; yanlış okunan bir harf varsa üzerine dokunup düzelt.';
    boardTab.insertBefore(d,boardTab.firstChild);
  }

  function init(){
    injectStyles(); showPreviousNote();
    const input=$('screenshotInput'); if(input) input.addEventListener('change',e=>loadFile(e.target.files&&e.target.files[0]));
    const btn=$('analyzeScreenshotBtn'); if(btn) btn.addEventListener('click',analyze);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
