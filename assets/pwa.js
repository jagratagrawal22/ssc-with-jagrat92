(function(){
  let deferredPrompt=null;
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;showInstall();});
  function showInstall(){
    if(document.getElementById("installAppBtn")||!deferredPrompt)return;
    const b=document.createElement("button");
    b.id="installAppBtn";
    b.className="pwa-install-btn";
    b.setAttribute("aria-label","Install SSC With Jagrat");
    b.innerHTML='<span class="pwa-install-icon" aria-hidden="true">📱</span><span>Install</span>';
    b.onclick=async()=>{
      if(!deferredPrompt)return;
      await deferredPrompt.prompt();
      deferredPrompt=null;
      b.remove();
    };
    document.body.appendChild(b);
  }
  window.addEventListener("appinstalled",()=>document.getElementById("installAppBtn")?.remove());
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").then(r=>r.update()).catch(()=>{}));
})();
