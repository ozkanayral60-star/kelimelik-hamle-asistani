(() => {
  'use strict';
  const E = window.KelimelikEngine;
  const ALPHABET = new Set(E.ALPHABET);
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
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function median(values){values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)];}
  function rgbAt(ctx,x,y){const d=ctx.getImageData(clamp(Math.round(x),0,ctx.canvas.width-1),clamp(Math.round(y),0,ctx.canvas.height-1),1,1).data;return[d[0],d[1],d[2]];}

  function boardGeometry(img){
    const size=Math.min(img.width*.992,img.height*.4615);
    return{x:(img.width-size)/2,y:img.height*.3425,w:size,h:size};
  }
  function cellMedian(ctx,g,r,c,inset=.18){
    const cw=g.w/15,ch=g.h/15,x=g.x+c*cw,y=g.y+r*ch,rs=[],gs=[],bs=[];
    for(let iy=0;iy<7;iy++)for(let ix=0;ix<7;ix++){
      const px=inset+(1-2*inset)*(ix+.5)/7,py=inset+(1-2*inset)*(iy+.5)/7;
      const [R,G,B]=rgbAt(ctx,x+cw*px,y+ch*py);rs.push(R);gs.push(G);bs.push(B);
    }
    return[median(rs),median(gs),median(bs)];
  }
  function tileBodyColor([R,G,B]){
    const pale=R>220&&G>195&&B<190;
    const orange=R>175&&G>65&&G<150&&B<95;
    return pale||orange;
  }
  function isOccupied(ctx,g,r,c){return tileBodyColor(cellMedian(ctx,g,r,c,.16));}

  function detectStar3(ctx,g,occupied){
    const target=[231,179,99]; let best=null;
    for(let r=0;r<15;r++)for(let c=0;c<15;c++){
      if(r===7&&c===7||occupied.has(r+','+c))continue;
      const rgb=cellMedian(ctx,g,r,c,.18); if(tileBodyColor(rgb))continue;
      const d=Math.hypot(rgb[0]-target[0],rgb[1]-target[1],rgb[2]-target[2]);
      if(!best||d<best.d)best={r,c,d};
    }
    return best&&best.d<42?{r:best.r,c:best.c,confidence:Math.round(100-best.d*2)}:null;
  }

  function darkLetter(R,G,B){return R<175&&G<150&&B<135&&(R+G+B)<420;}
  function cropTile(img,g,r,c,mode='binary'){
    const cw=g.w/15,ch=g.h/15,sx=g.x+c*cw+cw*.06,sy=g.y+r*ch+ch*.035,sw=cw*.88,sh=ch*.92;
    const cv=document.createElement('canvas');cv.width=220;cv.height=220;
    const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,220,220);
    if(mode==='raw')return cv;
    const im=cx.getImageData(0,0,220,220),d=im.data;
    for(let yy=0;yy<220;yy++)for(let xx=0;xx<220;xx++){
      const i=(yy*220+xx)*4,R=d[i],G=d[i+1],B=d[i+2],scoreZone=xx>154&&yy<78,edge=xx<22||xx>198||yy<18||yy>204;
      const keep=darkLetter(R,G,B)&&!scoreZone&&!edge;
      d[i]=d[i+1]=d[i+2]=keep?0:255;d[i+3]=255;
    }
    cx.putImageData(im,0,0);return cv;
  }
  function normalizeOcr(text){
    const up=(text||'').toLocaleUpperCase('tr-TR').replace(/[^ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ]/g,'');
    return up.length===1&&ALPHABET.has(up)?up:null;
  }
  async function getWorker(){
    if(worker)return worker;
    if(!window.Tesseract)throw new Error('OCR motoru yüklenemedi. İnternet bağlantısını kontrol et.');
    setStatus('Türkçe harf tanıma motoru hazırlanıyor…');
    worker=await Tesseract.createWorker('tur',1,{logger:m=>{
      if(m.status==='loading language traineddata')setStatus(`Türkçe OCR verisi yükleniyor… %${Math.round((m.progress||0)*100)}`);
      else if(m.status==='initializing api')setStatus('OCR motoru hazırlanıyor…');
    }});
    await worker.setParameters({tessedit_pageseg_mode:10,tessedit_char_whitelist:'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ'});
    return worker;
  }
  async function recognize(cv){
    const w=await getWorker(),out=await w.recognize(cv),text=out?.data?.text||'',confidence=Number(out?.data?.confidence||0);
    return{letter:normalizeOcr(text),confidence,text};
  }
  async function readTile(img,g,r,c){
    const a=await recognize(cropTile(img,g,r,c,'binary')); if(a.letter&&a.confidence>=48)return a;
    const b=await recognize(cropTile(img,g,r,c,'raw')); const valid=[a,b].filter(x=>x.letter).sort((x,y)=>y.confidence-x.confidence);
    return valid[0]||{letter:null,confidence:0,text:''};
  }
  function detectJokerBadge(img,g,r,c){
    const cw=g.w/15,ch=g.h/15,sx=Math.floor(g.x+c*cw),sy=Math.floor(g.y+r*ch),sw=Math.max(1,Math.floor(cw)),sh=Math.max(1,Math.floor(ch));
    const cv=document.createElement('canvas');cv.width=sw;cv.height=sh;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,sw,sh);
    const d=cx.getImageData(0,0,sw,sh).data;let blue=0,total=sw*sh;
    for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2];if(B>120&&G>90&&R<115&&B>R*1.2)blue++;}
    return blue/total>.002;
  }

  function rackGeometry(img){return{x:img.width*.016,y:img.height*.811,w:img.width*.969,h:img.height*.065};}
  function rackMedian(img,rg,i){
    const p=rg.w/7,sx=rg.x+i*p+p*.18,sy=rg.y+rg.h*.18,sw=p*.64,sh=rg.h*.64;
    const cv=document.createElement('canvas');cv.width=40;cv.height=40;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,40,40);
    const d=cx.getImageData(0,0,40,40).data,rs=[],gs=[],bs=[];for(let k=0;k<d.length;k+=4){rs.push(d[k]);gs.push(d[k+1]);bs.push(d[k+2]);}
    return[median(rs),median(gs),median(bs)];
  }
  function rackPresent(img,rg,i){const[R,G,B]=rackMedian(img,rg,i);return R>205&&G>145&&B<185;}
  function cropRack(img,rg,i,mode='binary'){
    const p=rg.w/7,sx=rg.x+i*p+p*.06,sy=rg.y+rg.h*.03,sw=p*.88,sh=rg.h*.92;
    const cv=document.createElement('canvas');cv.width=220;cv.height=220;const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,sw,sh,0,0,220,220);
    if(mode==='raw')return cv;
    const im=cx.getImageData(0,0,220,220),d=im.data;
    for(let yy=0;yy<220;yy++)for(let xx=0;xx<220;xx++){
      const k=(yy*220+xx)*4,R=d[k],G=d[k+1],B=d[k+2],scoreZone=xx>155&&yy<78,edge=xx<20||xx>200||yy<16||yy>205;
      const keep=darkLetter(R,G,B)&&!scoreZone&&!edge;d[k]=d[k+1]=d[k+2]=keep?0:255;d[k+3]=255;
    }
    cx.putImageData(im,0,0);return cv;
  }
  async function readRack(img,rg,i){
    const a=await recognize(cropRack(img,rg,i,'binary'));if(a.letter&&a.confidence>=48)return a;
    const b=await recognize(cropRack(img,rg,i,'raw'));const valid=[a,b].filter(x=>x.letter).sort((x,y)=>y.confidence-x.confidence);return valid[0]||{letter:null,confidence:0};
  }

  async function analyze(){
    if(!sourceImage){setStatus('Önce Kelimelik ekran görüntüsünü seç.','error');return;}
    const btn=$('analyzeScreenshotBtn');btn.disabled=true;
    try{
      const img=sourceImage,cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
      const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const g=boardGeometry(img),board=Array.from({length:15},()=>Array(15).fill(null)),occupied=[],occupiedSet=new Set();
      for(let r=0;r<15;r++)for(let c=0;c<15;c++)if(isOccupied(ctx,g,r,c)){occupied.push([r,c]);occupiedSet.add(r+','+c);}
      if(!occupied.length)throw new Error('Tahtadaki taşlar algılanamadı. Tam ekran Kelimelik ekran görüntüsü kullan.');

      const star3=detectStar3(ctx,g,occupiedSet);
      setStatus(`${occupied.length} gerçek taş bulundu.${star3?' 3 yıldız: '+E.coord(star3.r,star3.c):' Kullanılmamış 3 yıldız görünmüyor.'}\nHarfler okunuyor…`);
      const unresolved=[],low=[];
      for(let n=0;n<occupied.length;n++){
        const[r,c]=occupied[n];setStatus(`Tahtadaki gerçek taşlar okunuyor: ${n+1}/${occupied.length}\n${E.coord(r,c)}${star3?' • 3 yıldız '+E.coord(star3.r,star3.c):''}`);
        const read=await readTile(img,g,r,c);
        if(read.letter){board[r][c]={letter:read.letter,isJoker:detectJokerBadge(img,g,r,c)};if(read.confidence<35)low.push(E.coord(r,c));}
        else unresolved.push(E.coord(r,c));
      }
      if(unresolved.length){
        setStatus(`Aktarım kaydedilmedi. ${unresolved.length} GERÇEK taşın harfi güvenilir okunamadı: ${unresolved.join(', ')}\n\nBonus kareleri artık taş sayılmıyor. Aşağıdaki tahta önceki başarılı aktarımdır; bu görüntüyle hamle hesaplanamaz.`,'error');
        $('solveBtn').disabled=true;btn.disabled=false;return;
      }

      const rg=rackGeometry(img),rack=Array(7).fill(null),present=[];
      for(let i=0;i<7;i++)if(rackPresent(img,rg,i))present.push(i);
      const rackUnresolved=[];
      for(let n=0;n<present.length;n++){
        const i=present[n];setStatus(`Eldeki taşlar okunuyor: ${n+1}/${present.length}`);
        const read=await readRack(img,rg,i);
        if(read.letter)rack[i]=read.letter;
        else {
          const cc=cropRack(img,rg,i,'binary').getContext('2d').getImageData(0,0,220,220).data;let dark=0;
          for(let k=0;k<cc.length;k+=4)if(cc[k]<80)dark++;
          if(dark<120)rack[i]='*';else rackUnresolved.push(i+1);
        }
      }
      if(rackUnresolved.length){setStatus(`Aktarım kaydedilmedi. Eldeki şu taşlar okunamadı: ${rackUnresolved.join(', ')}. Eksik veriyle hamle hesaplanmadı.`,'error');$('solveBtn').disabled=true;btn.disabled=false;return;}

      localStorage.setItem('ka-board',JSON.stringify(board));
      localStorage.setItem('ka-rack',JSON.stringify(rack));
      localStorage.setItem('ka-star3',JSON.stringify(star3?{r:star3.r,c:star3.c}:null));
      const rackCount=rack.filter(Boolean).length;
      const notes=[`${occupied.length}/${occupied.length} gerçek tahta taşı aktarıldı`,`${rackCount}/${present.length} el taşı aktarıldı`,star3?`3 yıldız: ${E.coord(star3.r,star3.c)}`:'3 yıldız görünmüyor/kullanılmış'];
      if(low.length)notes.push(`Düşük OCR güveni: ${low.join(', ')}`);
      sessionStorage.setItem('ka-scan-note',notes.join(' • '));
      setStatus(`Eksiksiz aktarım doğrulandı ✓\nTahta: ${occupied.length}/${occupied.length}\nEl: ${rackCount}/${present.length}\n3 yıldız: ${star3?E.coord(star3.r,star3.c):'kullanılmış/görünmüyor'}\nTahtaya aktarılıyor…`,'ok');
      setTimeout(()=>location.reload(),550);
    }catch(err){console.error(err);setStatus('Analiz tamamlanamadı: '+(err.message||err),'error');$('solveBtn').disabled=true;btn.disabled=false;}
  }

  function loadFile(file){
    if(!file)return;const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{sourceImage=img;const prev=$('scanPreview');prev.src=url;prev.classList.add('show');$('analyzeScreenshotBtn').disabled=false;$('solveBtn').disabled=true;setStatus(`Görüntü hazır: ${img.width} × ${img.height}\nBu görüntü başarıyla aktarılana kadar aşağıdaki eski tahta hamle hesabında kullanılmayacak.`);};
    img.onerror=()=>setStatus('Görüntü açılamadı.','error');img.src=url;
  }
  function showPreviousNote(){
    const note=sessionStorage.getItem('ka-scan-note');if(!note)return;sessionStorage.removeItem('ka-scan-note');
    const boardTab=$('tab-board');if(!boardTab)return;const d=document.createElement('div');d.className='scan-warning';
    d.innerHTML='<strong>Ekran görüntüsü eksiksiz aktarıldı.</strong><br>'+note+'<br><br>Tahta ve el artık bu görüntüye aittir.';boardTab.insertBefore(d,boardTab.firstChild);
  }
  function init(){
    injectStyles();showPreviousNote();
    const input=$('screenshotInput');if(input)input.addEventListener('change',e=>loadFile(e.target.files&&e.target.files[0]));
    const btn=$('analyzeScreenshotBtn');if(btn)btn.addEventListener('click',analyze);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
