(() => {
  'use strict';

  const E = window.KelimelikEngine;
  const LETTERS = 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ';
  const ALPHABET = new Set([...LETTERS]);
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

  // Kullanıcının gönderdiği iPhone 13 Kelimelik tam ekran görüntülerinden kalibre edildi.
  // Tahta ekranın tamamına yatayda oturuyor: 15 eşit sütun.
  function boardGeometry(img){
    return { x:0, y:img.height*0.34242, w:img.width, h:img.height*0.45814 };
  }

  function tileGlyphPixel(R,G,B){
    // Kelimelik taşlarının ana harfi koyu kahverengidir. Bonus kare yazıları beyazdır;
    // bu yüzden taş var/yok tespitinde renkli kare zemininden çok daha güvenilirdir.
    return R<180 && G<135 && B<120 && (R-G)>5;
  }

  function darkRatioFromRegion(img,sx,sy,sw,sh,step=2){
    const cv=document.createElement('canvas');
    cv.width=Math.max(1,Math.round(sw)); cv.height=Math.max(1,Math.round(sh));
    const cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(img,sx,sy,sw,sh,0,0,cv.width,cv.height);
    const d=cx.getImageData(0,0,cv.width,cv.height).data;
    let dark=0,total=0;
    for(let y=0;y<cv.height;y+=step) for(let x=0;x<cv.width;x+=step){
      const i=(y*cv.width+x)*4; total++;
      if(tileGlyphPixel(d[i],d[i+1],d[i+2])) dark++;
    }
    return total ? dark/total : 0;
  }

  function isOccupied(img,geom,r,c){
    const pw=geom.w/15,ph=geom.h/15;
    const sx=geom.x+c*pw+pw*.12, sy=geom.y+r*ph+ph*.10;
    const ratio=darkRatioFromRegion(img,sx,sy,pw*.76,ph*.80,2);
    return ratio>.045;
  }

  function cropGlyph(img,geom,r,c){
    const pw=geom.w/15,ph=geom.h/15;
    // Ana harfi al, sağ üstteki küçük puanı dışarıda bırak.
    const sx=geom.x+c*pw+pw*.12, sy=geom.y+r*ph+ph*.06;
    const sw=pw*.66, sh=ph*.86;
    const cv=document.createElement('canvas'); cv.width=300; cv.height=300;
    cv.getContext('2d',{willReadFrequently:true}).drawImage(img,sx,sy,sw,sh,0,0,300,300);
    return cv;
  }

  function grayscaleCopy(cv){
    const out=document.createElement('canvas'); out.width=cv.width; out.height=cv.height;
    const cx=out.getContext('2d',{willReadFrequently:true}); cx.drawImage(cv,0,0);
    const im=cx.getImageData(0,0,out.width,out.height),d=im.data;
    for(let i=0;i<d.length;i+=4){
      let g=Math.round(d[i]*.299+d[i+1]*.587+d[i+2]*.114);
      g=g<128 ? Math.max(0,g-35) : Math.min(255,g+25);
      d[i]=d[i+1]=d[i+2]=g; d[i+3]=255;
    }
    cx.putImageData(im,0,0); return out;
  }

  function binaryCopy(cv){
    const out=grayscaleCopy(cv),cx=out.getContext('2d',{willReadFrequently:true});
    const im=cx.getImageData(0,0,out.width,out.height),d=im.data;
    for(let i=0;i<d.length;i+=4){const v=d[i]<175?0:255;d[i]=d[i+1]=d[i+2]=v;}
    cx.putImageData(im,0,0); return out;
  }

  function detectJokerBadge(img,geom,r,c){
    const pw=geom.w/15,ph=geom.h/15,sx=geom.x+c*pw,sy=geom.y+r*ph;
    const cv=document.createElement('canvas');cv.width=Math.max(1,Math.round(pw));cv.height=Math.max(1,Math.round(ph));
    const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,sx,sy,pw,ph,0,0,cv.width,cv.height);
    const d=cx.getImageData(0,0,cv.width,cv.height).data;let blue=0,total=cv.width*cv.height;
    for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2];if(B>120&&G>90&&R<105&&B>R*1.35)blue++;}
    return blue/total>.002;
  }

  function normalizeOcr(text){
    const cleaned=[...(text||'').toLocaleUpperCase('tr-TR')].filter(ch=>ALPHABET.has(ch)).join('');
    // Çok harfli OCR çıktısından ilk harfi tahmin ETME. Yanlış tahta oluşturmaktansa tekrar oku.
    return cleaned.length===1 ? cleaned : null;
  }

  async function getWorker(){
    if(worker)return worker;
    if(!window.Tesseract)throw new Error('OCR motoru yüklenemedi. İnternet bağlantını kontrol edip tekrar dene.');
    setStatus('Türkçe harf tanıma motoru hazırlanıyor…\nİlk kullanımda dil verisi indirilebilir.');
    worker=await Tesseract.createWorker('tur',1,{logger:m=>{
      if(m.status==='loading language traineddata')setStatus(`Türkçe OCR verisi yükleniyor… %${Math.round((m.progress||0)*100)}`);
      else if(m.status==='initializing api')setStatus('OCR motoru hazırlanıyor…');
    }});
    // RAW_LINE, Kelimelik'in tek büyük harfli taşlarında SINGLE_CHAR'dan daha güvenilir çıktı verdi.
    await worker.setParameters({tessedit_pageseg_mode:13,tessedit_char_whitelist:LETTERS});
    return worker;
  }

  async function recognize(cv){
    const w=await getWorker();
    const out=await w.recognize(cv);
    return {letter:normalizeOcr(out?.data?.text||''),confidence:Number(out?.data?.confidence||0),raw:(out?.data?.text||'').trim()};
  }

  async function readGlyph(cv){
    const a=await recognize(cv);
    if(a.letter && a.confidence>=45) return a;
    const b=await recognize(grayscaleCopy(cv));
    if(a.letter && b.letter && a.letter===b.letter) return a.confidence>=b.confidence?a:b;
    if(!a.letter && b.letter) return b;
    if(a.letter && !b.letter) return a;
    if(a.letter && b.letter && a.letter!==b.letter){
      const c=await recognize(binaryCopy(cv));
      if(c.letter===a.letter) return a;
      if(c.letter===b.letter) return b;
      return {letter:null,confidence:0,raw:`${a.raw}/${b.raw}/${c.raw}`};
    }
    const c=await recognize(binaryCopy(cv));
    return c.letter?c:{letter:null,confidence:0,raw:c.raw};
  }

  function rackGeometry(img){return{x:img.width*.016,y:img.height*.807,w:img.width*.969,h:img.height*.070};}
  function rackSlotPresent(img,rg,i){
    const p=rg.w/7,sx=rg.x+i*p+p*.08,sy=rg.y+rg.h*.10,sw=p*.84,sh=rg.h*.75;
    const cv=document.createElement('canvas');cv.width=70;cv.height=70;const cx=cv.getContext('2d',{willReadFrequently:true});
    cx.drawImage(img,sx,sy,sw,sh,0,0,70,70);const d=cx.getImageData(0,0,70,70).data;
    let yellow=0,total=70*70;
    for(let k=0;k<d.length;k+=4){const R=d[k],G=d[k+1],B=d[k+2];if(R>185&&G>120&&B<200&&R-B>35)yellow++;}
    return yellow/total>.22;
  }
  function cropRackGlyph(img,rg,i){
    const p=rg.w/7,sx=rg.x+i*p+p*.14,sy=rg.y+rg.h*.08,sw=p*.62,sh=rg.h*.82;
    const cv=document.createElement('canvas');cv.width=300;cv.height=300;
    cv.getContext('2d',{willReadFrequently:true}).drawImage(img,sx,sy,sw,sh,0,0,300,300);return cv;
  }
  function rackGlyphRatio(img,rg,i){
    const p=rg.w/7,sx=rg.x+i*p+p*.14,sy=rg.y+rg.h*.08;
    return darkRatioFromRegion(img,sx,sy,p*.62,rg.h*.82,2);
  }

  async function analyze(){
    if(!sourceImage){setStatus('Önce Kelimelik ekran görüntüsünü seç.','error');return;}
    const btn=$('analyzeScreenshotBtn');btn.disabled=true;
    try{
      const img=sourceImage;
      const ratio=img.width/img.height;
      if(ratio<.43||ratio>.50)throw new Error('Tam ekran dikey Kelimelik ekran görüntüsü seç. Kırpılmış görüntü kullanma.');

      const geom=boardGeometry(img),board=Array.from({length:15},()=>Array(15).fill(null));
      const occupied=[];
      for(let r=0;r<15;r++)for(let c=0;c<15;c++)if(isOccupied(img,geom,r,c))occupied.push([r,c]);
      setStatus(`${occupied.length} tahta taşı tespit edildi. Harfler okunuyor…`);

      const unresolved=[];
      for(let n=0;n<occupied.length;n++){
        const [r,c]=occupied[n];
        setStatus(`Tahtadaki harfler okunuyor: ${n+1}/${occupied.length}\n${E.coord(r,c)}`);
        const read=await readGlyph(cropGlyph(img,geom,r,c));
        if(!read.letter){unresolved.push(E.coord(r,c));continue;}
        board[r][c]={letter:read.letter,isJoker:detectJokerBadge(img,geom,r,c)};
      }

      // Bir tek kare bile çözülemezse yarım/yanlış tahta kaydetme.
      if(unresolved.length){
        setStatus(`Aktarım kaydedilmedi. Şu kareler güvenilir okunamadı: ${unresolved.join(', ')}\n\nAynı ekran görüntüsüyle tekrar dene. Sorun sürerse ekran görüntüsünü bana gönder; o görüntü tipini de kalibre edeyim.`,'error');
        btn.disabled=false;return;
      }

      const rg=rackGeometry(img),rack=Array(7).fill(null),present=[];
      for(let i=0;i<7;i++)if(rackSlotPresent(img,rg,i))present.push(i);
      const rackUnresolved=[];
      for(let n=0;n<present.length;n++){
        const i=present[n];setStatus(`Eldeki taşlar okunuyor: ${n+1}/${present.length}`);
        const read=await readGlyph(cropRackGlyph(img,rg,i));
        if(read.letter){rack[i]=read.letter;continue;}
        // Fiziksel taş var ama ortasında kahverengi harf yoksa bu gerçek boş joker taşıdır.
        if(rackGlyphRatio(img,rg,i)<.018) rack[i]='*';
        else rackUnresolved.push(i+1);
      }
      if(rackUnresolved.length){
        setStatus(`Aktarım kaydedilmedi. Eldeki şu taşlar güvenilir okunamadı: ${rackUnresolved.join(', ')}. Joker olarak tahmin edilmedi.`,'error');
        btn.disabled=false;return;
      }

      const transferred=board.flat().filter(Boolean).length;
      if(transferred!==occupied.length)throw new Error(`Tahta doğrulaması başarısız: ${transferred}/${occupied.length}.`);

      localStorage.setItem('ka-board',JSON.stringify(board));
      localStorage.setItem('ka-rack',JSON.stringify(rack));
      const rackCount=rack.filter(Boolean).length;
      sessionStorage.setItem('ka-scan-note',`Tahta ${transferred}/${occupied.length} • El ${rackCount}/${present.length} • Eksik kare yok`);
      setStatus(`Eksiksiz aktarım doğrulandı ✓\nTahta: ${transferred}/${occupied.length}\nEl: ${rackCount}/${present.length}\nTablo açılıyor…`,'ok');
      setTimeout(()=>location.reload(),650);
    }catch(err){console.error(err);setStatus('Analiz tamamlanamadı: '+(err.message||err),'error');btn.disabled=false;}
  }

  function loadFile(file){
    if(!file)return;
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=()=>{
      sourceImage=img;
      const prev=$('scanPreview');prev.src=url;prev.classList.add('show');
      $('analyzeScreenshotBtn').disabled=false;
      setStatus(`Görüntü hazır: ${img.width} × ${img.height}\n“Ekran Görüntüsünü Analiz Et”e bas.`);
    };
    img.onerror=()=>setStatus('Görüntü açılamadı.','error'); img.src=url;
  }

  function showPreviousNote(){
    const note=sessionStorage.getItem('ka-scan-note');if(!note)return;sessionStorage.removeItem('ka-scan-note');
    const boardTab=$('tab-board');if(!boardTab)return;
    const d=document.createElement('div');d.className='scan-warning';
    d.innerHTML='<strong>Ekran görüntüsü eksiksiz aktarıldı.</strong><br>'+note+'<br><br>Yine de hamle hesaplamadan önce tabloya bir göz atabilirsin.';
    boardTab.insertBefore(d,boardTab.firstChild);
  }

  function init(){
    injectStyles();showPreviousNote();
    const input=$('screenshotInput');if(input)input.addEventListener('change',e=>loadFile(e.target.files&&e.target.files[0]));
    const btn=$('analyzeScreenshotBtn');if(btn)btn.addEventListener('click',analyze);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
