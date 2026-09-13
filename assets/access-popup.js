(function(){
  const TELEGRAM_URL = 'https://t.me/Sscwithjagratowner';

  function ensurePopup(){
    let overlay=document.getElementById('adminAccessModal');
    if(overlay) return overlay;
    overlay=document.createElement('div');
    overlay.id='adminAccessModal';
    overlay.className='access-modal-overlay hidden';
    overlay.innerHTML=`
      <div class="access-modal" role="dialog" aria-modal="true" aria-labelledby="accessModalTitle">
        <button type="button" class="access-modal-close" id="accessModalClose" aria-label="Close">✕</button>
        <div class="access-modal-glow"></div>
        <div class="access-modal-icon" aria-hidden="true">
          <span>🔐</span>
        </div>
        <div class="access-modal-kicker">SSC WITH JAGRAT • BATCH ACCESS</div>
        <h2 id="accessModalTitle">CONTACT ADMIN FOR BATCH ACCESS</h2>
        <p>Contact the admin to get access to paid batches, premium classes and complete course content.</p>
        <a class="access-telegram-card" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer" aria-label="Contact admin on Telegram">
          <span class="access-telegram-logo" aria-hidden="true">
            <svg viewBox="0 0 240 240"><circle cx="120" cy="120" r="120" fill="#29A9EA"/><path fill="#fff" d="M52 118l125-48c6-2 11 1 9 10l-21 100c-2 8-7 10-13 6l-37-27-18 17c-2 2-4 3-7 3l3-38 68-61c3-3-1-4-4-2l-84 53-36-11c-8-3-8-8 2-11z"/></svg>
          </span>
          <span class="access-telegram-copy"><b>Telegram</b><small>@Sscwithjagratowner</small></span>
          <span class="access-telegram-arrow">↗</span>
        </a>
        <a class="access-contact-btn" href="${TELEGRAM_URL}" target="_blank" rel="noopener noreferrer">CONTACT ADMIN <span>→</span></a>
        <button type="button" class="access-later-btn" id="accessModalLater">Maybe later</button>
      </div>`;
    document.body.appendChild(overlay);
    const close=()=>{overlay.classList.add('hidden');document.body.style.overflow='';};
    overlay.querySelector('#accessModalClose').onclick=close;
    overlay.querySelector('#accessModalLater').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.classList.contains('hidden'))close();});
    return overlay;
  }

  window.openAdminAccessPopup=function(){
    const overlay=ensurePopup();
    overlay.classList.remove('hidden');
    document.body.style.overflow='hidden';
    setTimeout(()=>overlay.querySelector('#accessModalClose')?.focus(),0);
  };

  window.bindAdminAccessButtons=function(root=document){
    root.querySelectorAll('[data-admin-access]').forEach(btn=>{
      if(btn.dataset.accessBound==='1') return;
      btn.dataset.accessBound='1';
      btn.addEventListener('click',e=>{e.preventDefault();window.openAdminAccessPopup();});
    });
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{ensurePopup();window.bindAdminAccessButtons();});
  else {ensurePopup();window.bindAdminAccessButtons();}
})();
