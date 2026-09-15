(function(){
  function entryUrl(no){
    const u=new URL('./entry.html',location.href);
    u.search='';
    u.hash=String(no);
    return u.href;
  }

  function shortMessage(message,max=120){
    const s=String(message||'').replace(/\s+/g,' ').trim();
    if(!s)return '';
    return s.length>max?s.slice(0,max-1)+'…':s;
  }

  function shareText(no,message){
    const quote=shortMessage(message);
    return `Я оставил свой след в проекте «Я БЫЛ ЗДЕСЬ». Запись №${Number(no).toLocaleString('ru-RU')}${quote?`\n\n«${quote}»`:''}`;
  }

  function projectUrl(){
    return new URL('./index.html',location.href).href;
  }

  async function copyText(text){
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.style.position='fixed';
    ta.style.opacity='0';
    document.body.appendChild(ta);
    ta.focus();ta.select();
    const ok=document.execCommand('copy');
    ta.remove();
    return ok;
  }

  function popup(url){
    window.open(url,'_blank','noopener,noreferrer,width=720,height=640');
  }

  async function nativeShare(no,message){
    const url=entryUrl(no);
    const text=shareText(no,message);
    if(navigator.share){
      try{
        await navigator.share({title:'Я БЫЛ ЗДЕСЬ',text,url});
        return true;
      }catch(e){
        if(e?.name==='AbortError') return false;
      }
    }
    await copyText(`${text}\n${url}`);
    return 'copied';
  }

  async function shareProject(){
    const url=projectUrl();
    const text='«Я БЫЛ ЗДЕСЬ» — общая книга интернета. Оставь свой след и получи уникальный номер.';
    if(navigator.share){
      try{
        await navigator.share({title:'Я БЫЛ ЗДЕСЬ',text,url});
        return true;
      }catch(e){
        if(e?.name==='AbortError') return false;
      }
    }
    await copyText(`${text}\n${url}`);
    return 'copied';
  }

  function socialUrl(type,no,message){
    const url=entryUrl(no);
    const text=shareText(no,message);
    if(type==='telegram') return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if(type==='vk') return `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent('Я БЫЛ ЗДЕСЬ')}&description=${encodeURIComponent(text)}`;
    if(type==='whatsapp') return `https://wa.me/?text=${encodeURIComponent(text+'\n'+url)}`;
    return url;
  }

  function renderQR(target,url){
    target.innerHTML='';
    if(typeof QRCode==='undefined'){
      target.innerHTML='<div class="small">QR-код временно недоступен. Скопируйте ссылку.</div>';
      return;
    }
    new QRCode(target,{
      text:url,
      width:190,
      height:190,
      colorDark:'#0b0b0d',
      colorLight:'#ffffff',
      correctLevel:QRCode.CorrectLevel.M
    });
  }

  function renderShareBox(container,no,message,opts={}){
    if(!container)return;
    const id=`share-${String(no).replace(/\D/g,'')}-${Math.random().toString(36).slice(2,7)}`;
    const url=entryUrl(no);
    const compact=!!opts.compact;
    container.innerHTML=`
      <div class="share-card ${compact?'compact':''}">
        <div class="share-head">
          <div>
            <div class="share-eyebrow">ПОДЕЛИТЬСЯ ЗАПИСЬЮ</div>
            <b>${compact?'Покажи свой след':'Сделай запись заметнее'}</b>
          </div>
          <span class="share-no">№${Number(no).toLocaleString('ru-RU')}</span>
        </div>
        <div class="share-buttons">
          <button type="button" data-share="native">Поделиться</button>
          <button type="button" data-share="telegram">Telegram</button>
          <button type="button" data-share="vk">VK</button>
          <button type="button" data-share="whatsapp">WhatsApp</button>
          <button type="button" data-share="copy">Скопировать ссылку</button>
          <button type="button" data-share="qr">QR-код</button>
        </div>
        <div class="share-link">${url.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <div class="qr-wrap" id="${id}" hidden>
          <div class="qr-box" data-qr-box></div>
          <div class="small">QR ведёт только на публичную запись. Секретный ключ управления в него не попадает.</div>
          <button type="button" class="qr-download" data-share="download">Скачать QR PNG</button>
        </div>
        <div class="share-feedback" aria-live="polite"></div>
      </div>`;

    const feedback=container.querySelector('.share-feedback');
    const qrWrap=container.querySelector('.qr-wrap');
    const qrBox=container.querySelector('[data-qr-box]');

    container.addEventListener('click',async(e)=>{
      const btn=e.target.closest('[data-share]');
      if(!btn)return;
      const action=btn.dataset.share;
      if(action==='telegram'||action==='vk'||action==='whatsapp'){
        popup(socialUrl(action,no,message));
        return;
      }
      if(action==='native'){
        const r=await nativeShare(no,message);
        if(r==='copied') feedback.textContent='Ссылка и текст скопированы.';
        return;
      }
      if(action==='copy'){
        await copyText(url);
        feedback.textContent='Ссылка скопирована.';
        return;
      }
      if(action==='qr'){
        qrWrap.hidden=!qrWrap.hidden;
        if(!qrWrap.hidden && !qrBox.dataset.ready){
          renderQR(qrBox,url);
          qrBox.dataset.ready='1';
        }
        return;
      }
      if(action==='download'){
        const canvas=qrBox.querySelector('canvas');
        const img=qrBox.querySelector('img');
        const data=canvas?.toDataURL('image/png')||img?.src;
        if(!data){feedback.textContent='Сначала откройте QR-код.';return;}
        const a=document.createElement('a');
        a.href=data;
        a.download=`ya-byl-zdes-${no}-qr.png`;
        document.body.appendChild(a);a.click();a.remove();
      }
    },{once:false});
  }

  window.YBZShare={entryUrl,shareText,nativeShare,shareProject,socialUrl,renderShareBox,copyText};
})();
