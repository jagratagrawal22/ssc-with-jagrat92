(function(){
  const KEY='ssc_with_jagrat_theme';
  const getTheme=()=>{ const v=localStorage.getItem(KEY); return v==='dark'?'dark':'light'; };
  function apply(theme){
    document.documentElement.setAttribute('data-theme',theme);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content',theme==='dark'?'#0b1020':'#f6f8fc');
    const btn=document.getElementById('themeToggleBtn');
    if(btn){
      const dark=theme==='dark';
      btn.innerHTML=dark?'☀️ <span>Day Mode</span>':'🌙 <span>Night Mode</span>';
      btn.setAttribute('aria-pressed',String(dark));
      btn.setAttribute('title',dark?'Switch to Day Mode':'Switch to Night Mode');
    }
  }
  // Apply immediately to reduce theme flash.
  apply(getTheme());
  window.sscTheme={
    get:()=>getTheme(),
    set:(theme)=>{const t=theme==='dark'?'dark':'light';localStorage.setItem(KEY,t);apply(t);},
    toggle:()=>{const next=getTheme()==='dark'?'light':'dark';localStorage.setItem(KEY,next);apply(next);}
  };
  document.addEventListener('DOMContentLoaded',()=>apply(getTheme()));
})();
