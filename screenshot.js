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
    if(document.getElementById('scanRevisionStyles')) return;
    const s=document.createElement('style'); s.id='scanRevisionStyles';
    s.textContent=`
      .scan-card{overflow:hidden}.scan-upload{display:block;border:2px dashed #9fb6c0;border-radius:16px;padding:18px;text-align:center;background:#f6f9fa;font-weight:800;color:#145a7a}
      .scan-upload input{display:none}.scan-preview{width:100%;border-radius:14px;margin-top:12px;display:none;background:#dfe7ea}.scan-preview.show{display:block}
      .scan-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:12px}.scan-status{margin-top:10px;padding:10px;border-radius:12px;background:#eef5f7;font-size:12px;color:#526b75;white-space:pre-line}
      .scan-status.ok{background:#eaf7ef;color:#21663f;border:1px solid #b9dfc7}.scan-status.error{background:#fff0ef;color:#8b3430;border:1px solid #efc4c0}
      .scan-note{font-size:11px;color:#6b7e86;line-height:1.45;margin-top:8px}.scan-warning{background:#fff3cd;color:#765600;border:1px solid #f1d989;border-radius:12px;padding:10px;margin-bottom:10px;font-size:12px}
    `;
    document.head.appendChild(s);
  }

  function setStatus(text,kind=''){
    const el=$('scanStatus'); if(!el)return;
    el.textContent=text; el.classList.remove('ok','error'); if(kind)el.classList.add(kind);
  }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
  function rgbAt(ctx,x,y){ const d=ctx.getImageData(clamp(Math.round(x),0,ctx.canvas.width-1),clamp(Math.round(y),0,ctx.canvas.height-1),1,1).data; return [d[0],d[1],d[2]]; }
  function dist(a,b){ return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]); }

  function cellGeometry(img){
    // Kelimelik'in iPhone dikey ekranındaki kare tahta oranı.
    const size=Math.min(img.width*.992, img.height*.4615);
    return { x:(img.width-size)/2, y:img.height*.3425, w:size, h:size };
  }

  function tileLike(R,G,B){
    // Oynanmış taşların sarı/turuncu gövdesi.
    return R>175 && G>95 && G<235 && B<180 && R>G*.93;
  }
  function darkLetter(R,G,B){ return R<175 && G<145 && B<130 && (R+G+B)<410; }

  function cellStats(ctx,geom,r,c){
    const pw=geom.w/15, ph=geom.h/15, x=geom.x+c*pw, y=geom.y+r*ph;
    let tile=0,dark=0,changed=0,total=0;
    const bonus=(E?.BONUS?.[r]?.[c])||''; const base=BASE[bonus]||BASE[''];
    for(let iy=2;iy<=8;iy++)for(let ix=2;ix<=8;ix++){
      const px=ix/10,py=iy/10,[R,G,B]=rgbAt(ctx,x+pw*px,y+ph*py);total++;
      if(tileLike(R,G,B))tile++;
      if(darkLetter(R,G,B))dark++;
      if(dist([R,G,B],base)>24)changed++;
    }
    return {tileFrac:tile/total,darkFrac:dark/total,changedFrac:changed/total,bonus};
  }

  function isOccupied(ctx,geom,r,c){
    const s=cellStats(ctx,geom,r,c);
    // Normal/H/K karelerinde taş gövdesi en güvenilir sinyal.
    if(s.bonus!=='STAR2' && s.bonus!=='STAR3' && s.tileFrac>.24) return true;
    // Yıldız karelerinin boş zemini de sarı olduğu için koyu ana harf + değişim aranır.
    if((s.bonus==='STAR2'||s.bonus==='STAR3') && s.darkFrac>.035 && s.changedFrac>.20) return true;
    // Tema/ekran farklarına karşı yedek ölçüt.
    return s.changedFrac>.62 && s.darkFrac>.025;
  }

  function cropCell(img,geom,r,c,mode='binary'){
    const pw=geom.w/15,ph=geom.h/15;
    const sx=geom.x+c*pw+pw*.055, sy=geom.y+r*ph+ph*.04, sw=pw*.89, sh=ph*.91;
    const cv=document.createElement('canvas');cv.width=180;cv.height=180;
    const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,180,180);
    if(mode==='raw')return cv;
    const im=cx.getImageData(0,0,180,180),d=im.data;
    for(let yy=0;yy<180;yy++)for(let xx=0;xx<180;xx++){
      const i=(yy*180+xx)*4,R=d[i],G=d[i+1],B=d[i+2];
      const scoreZone=xx>126&&yy<66;
      const keep=darkLetter(R,G,B)&&!scoreZone;
      d[i]=d[i+1]=d[i+2]=keep?0:255;d[i+3]=255;
    }
    cx.putImageData(im,0,0);return cv;
  }

  function detectJokerBadge(img,geom,r,c){
    const pw=geom.w/15,ph=geom.h/15,sx=Math.floor(geom.x+c*pw),sy=Math.floor(geom.y+r*ph),sw=Math.max(1,Math.floor(pw)),sh=Math.max(1,Math.floor(ph));
    const cv=document.createElement('canvas');cv.width=sw;cv.height=sh;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    const d=cx.getImageData(0,0,sw,sh).data;let blue=0,total=sw*sh;
    for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2];if(B>115&&G>85&&R<110&&B>R*1.25)blue++;}
    return blue/total>.002;
  }

  function normalizeOcr(text){
    const up=(text||'').toLocaleUpperCase('tr-TR').replace(/[^ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]/g,'');
    if(!up)return null; for(const ch of up)if(ALPHABET.has(ch))return ch; return null;
  }

  async function getWorker(){
    if(worker)return worker;
    if(!window.Tesseract)throw new Error('OCR motoru yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    setStatus('Türkçe OCR motoru ilk kez hazırlanıyor…\nİlk kullanımda birkaç MB veri indirilebilir.');
    worker=await Tesseract.createWorker('tur',1,{logger:m=>{
      if(m.status==='loading language traineddata')setStatus(`Türkçe OCR verisi yükleniyor… %${Math.round((m.progress||0)*100)}`);
      else if(m.status==='initializing api')setStatus('OCR motoru hazırlanıyor…');
    }});
    await worker.setParameters({tessedit_pageseg_mode:10,tessedit_char_whitelist:'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'});
    return worker;
  }

  async function recognizeCanvas(cv){
    const w=await getWorker(),out=await w.recognize(cv),text=out?.data?.text||'',confidence=Number(out?.data?.confidence||0);
    return {letter:normalizeOcr(text),confidence,text};
  }

  async function readCellLetter(img,geom,r,c){
    const first=await recognizeCanvas(cropCell(img,geom,r,c,'binary'));
    if(first.letter&&first.confidence>=55)return first;
    const second=await recognizeCanvas(cropCell(img,geom,r,c,'raw'));
    const valid=[first,second].filter(x=>x.letter).sort((a,b)=>b.confidence-a.confidence);
    return valid[0]||{letter:null,confidence:0,text:''};
  }

  function rackGeometry(img){return{x:img.width*.016,y:img.height*.811,w:img.width*.969,h:img.height*.065};}
  function rackTileFraction(img,rg,i){
    const p=rg.w/7,sx=rg.x+i*p+p*.08,sy=rg.y+rg.h*.08,sw=p*.84,sh=rg.h*.82;
    const cv=document.createElement('canvas');cv.width=60;cv.height=60;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,60,60);
    const d=cx.getImageData(0,0,60,60).data;let n=0;for(let k=0;k<d.length;k+=4)if(tileLike(d[k],d[k+1],d[k+2]))n++;return n/(60*60);
  }
  function rackSlotPresent(img,rg,i){return rackTileFraction(img,rg,i)>.22;}
  function cropRack(img,rg,i,mode='binary'){
    const p=rg.w/7,sx=rg.x+i*p+p*.06,sy=rg.y+rg.h*.035,sw=p*.88,sh=rg.h*.91;
    const cv=document.createElement('canvas');cv.width=180;cv.height=180;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,180,180);
    if(mode==='raw')return cv;
    const im=cx.getImageData(0,0,180,180),d=im.data;
    for(let yy=0;yy<180;yy++)for(let xx=0;xx<180;xx++){
      const k=(yy*180+xx)*4,R=d[k],G=d[k+1],B=d[k+2],scoreZone=xx>128&&yy<62;
      const keep=darkLetter(R,G,B)&&!scoreZone;d[k]=d[k+1]=d[k+2]=keep?0:255;d[k+3]=255;
    }
    cx.putImageData(im,0,0);return cv;
  }
  async function readRackLetter(img,rg,i){
    const a=await recognizeCanvas(cropRack(img,rg,i,'binary'));if(a.letter&&a.confidence>=55)return a;
    const b=await recognizeCanvas(cropRack(img,rg,i,'raw'));const valid=[a,b].filter(x=>x.letter).sort((x,y)=>y.confidence-x.confidence);return valid[0]||{letter:null,confidence:0};
  }

  async function analyze(){
    if(!sourceImage){setStatus('Önce Kelimelik ekran görüntüsünü seç.','error');return;}
    const btn=$('analyzeScreenshotBtn');btn.disabled=true;
    try{
      const img=sourceImage,cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const geom=cellGeometry(img),board=Array.from({length:15},()=>Array(15).fill(null));
      const occupied=[];
      for(let r=0;r<15;r++)for(let c=0;c<15;c++)if(isOccupied(ctx,geom,r,c))occupied.push([r,c]);
      if(!occupied.length)throw new Error('Tahtadaki taşlar algılanamadı. Tam ekran Kelimelik ekran görüntüsü kullan.');
      setStatus(`${occupied.length} tahta taşı bulundu. Tüm harfler doğrulanarak okunuyor…`);
      const unresolved=[],low=[];
      for(let n=0;n<occupied.length;n++){
        const [r,c]=occupied[n];setStatus(`Tahtadaki harfler okunuyor: ${n+1}/${occupied.length}\n${E.coord(r,c)}`);
        const read=await readCellLetter(img,geom,r,c);
        if(read.letter){board[r][c]={letter:read.letter,isJoker:detectJokerBadge(img,geom,r,c)};if(read.confidence<35)low.push(E.coord(r,c));}
        else unresolved.push(E.coord(r,c));
      }

      // Eksik harf varsa eksik tabloyu KESİNLİKLE kaydetme.
      if(unresolved.length){
        setStatus(`Aktarım durduruldu. ${unresolved.length} tahta karesi güvenilir biçimde okunamadı: ${unresolved.join(', ')}\n\nEksik tahta oluşturulmadı. Ekran görüntüsünü yeniden seçip tekrar dene.`,'error');
        btn.disabled=false;return;
      }

      const rg=rackGeometry(img),rack=Array(7).fill(null),present=[];
      for(let i=0;i<7;i++)if(rackSlotPresent(img,rg,i))present.push(i);
      for(let n=0;n<present.length;n++){
        const i=present[n];setStatus(`Eldeki taşlar okunuyor: ${n+1}/${present.length}`);
        const read=await readRackLetter(img,rg,i);
        // Harfsiz ama fiziksel olarak bulunan sarı taş joker kabul edilir.
        rack[i]=read.letter||'*';
      }

      const transferred=board.flat().filter(Boolean).length;
      if(transferred!==occupied.length)throw new Error(`Tahta doğrulaması başarısız: ${transferred}/${occupied.length}. Eksik veri kaydedilmedi.`);
      localStorage.setItem('ka-board',JSON.stringify(board));
      localStorage.setItem('ka-rack',JSON.stringify(rack));
      const rackCount=rack.filter(Boolean).length;
      const notes=[`${transferred}/${occupied.length} tahta taşı eksiksiz aktarıldı`,`${rackCount}/${present.length} el taşı aktarıldı`];
      if(low.length)notes.push(`Düşük OCR güveni olan ama okunan kareler: ${low.join(', ')}`);
      sessionStorage.setItem('ka-scan-note',notes.join(' • '));
      setStatus(`Aktarım doğrulandı ✓\nTahta: ${transferred}/${occupied.length}\nEl: ${rackCount}/${present.length}\nTabloya aktarılıyor…`,'ok');
      setTimeout(()=>location.reload(),650);
    }catch(err){console.error(err);setStatus('Analiz tamamlanamadı: '+(err.message||err),'error');btn.disabled=false;}
  }

  function loadFile(file){
    if(!file)return;const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{sourceImage=img;const prev=$('scanPreview');prev.src=url;prev.classList.add('show');$('analyzeScreenshotBtn').disabled=false;setStatus(`Görüntü hazır: ${img.width} × ${img.height}\n“Ekran Görüntüsünü Analiz Et”e bas.`);};
    img.onerror=()=>setStatus('Görüntü açılamadı.','error');img.src=url;
  }

  function showPreviousNote(){
    const note=sessionStorage.getItem('ka-scan-note');if(!note)return;sessionStorage.removeItem('ka-scan-note');
    const boardTab=$('tab-board');if(!boardTab)return;const d=document.createElement('div');d.className='scan-warning';
    d.innerHTML='<strong>Ekran görüntüsü eksiksiz aktarım kontrolünden geçti.</strong><br>'+note+'<br><br>İstersen yine de gözle kontrol edebilirsin; herhangi bir harfe dokunarak düzeltme yapabilirsin.';
    boardTab.insertBefore(d,boardTab.firstChild);
  }

  function init(){
    injectStyles();showPreviousNote();
    const input=$('screenshotInput');if(input)input.addEventListener('change',e=>loadFile(e.target.files&&e.target.files[0]));
    const btn=$('analyzeScreenshotBtn');if(btn)btn.addEventListener('click',analyze);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
