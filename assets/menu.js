(function () {
  const ADMIN_EMAIL = "jalajsinghal04@gmail.com";

  async function isAdmin() {
    try {
      const { supabase } = await import("./supabase.js");
      const { data: { session } } = await supabase.auth.getSession();
      return !!session && (session.user.email || "").toLowerCase() === ADMIN_EMAIL;
    } catch (_) {
      return false;
    }
  }

  async function updateAdminMenu() {
    const slot = document.getElementById("adminMenuSlot");
    if (!slot) return;
    if (await isAdmin()) {
      slot.innerHTML = '<a class="side-menu-link" href="admin.html">🛠️ Admin</a>';
    } else {
      slot.innerHTML = "";
    }
  }

  function injectMenu() {
    const topbar = document.querySelector(".topbar");
    const brand = document.querySelector(".brand");
    if (!topbar) return;

    const btn = document.createElement("button");
    btn.id = "hamburgerBtn";
    btn.className = "hamburger-btn";
    btn.setAttribute("aria-label", "Open menu");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";
    if (brand) topbar.insertBefore(btn, brand);
    else topbar.insertBefore(btn, topbar.firstChild);

    const overlay = document.createElement("div");
    overlay.id = "sideMenuOverlay";
    overlay.className = "side-menu-overlay hidden";
    overlay.innerHTML = `
      <nav class="side-menu">
        <button id="closeSideMenu" class="side-menu-close" aria-label="Close menu">✕</button>
        <div class="side-menu-brand"><div class="logo"><img src="assets/icons/logo-header.png" alt="SSC With Jagrat"></div><b>SSC WITH JAGRAT</b></div>

        <a class="side-menu-link account-menu-link" href="account.html">🔐 Sign Up / Login</a>
        <a class="side-menu-link" href="account.html?tab=profile">👤 Profile</a>
        <div id="adminMenuSlot"></div>
        <button type="button" id="themeToggleBtn" class="side-menu-link theme-toggle-link" aria-pressed="false">🌙 <span>Night Mode</span></button>

        <a class="side-menu-link" href="index.html">🏠 Home</a>
        <a class="side-menu-link" href="dashboard.html">🎯 My Dashboard</a>
        <a class="side-menu-link" href="performance.html">🧠 Performance & PYQ</a>
        <a class="side-menu-link" href="progress-report.html">📊 Progress Report</a>
        <a class="side-menu-link" href="ai-study-assistant.html">🤖 AI Study Assistant</a>
        <a class="side-menu-link" href="personalized-learning.html">🗺️ My Learning Path</a>
        <a class="side-menu-link" href="daily-challenge.html">🔥 Daily Challenge</a>
        <a class="side-menu-link" href="exam-simulator.html">📝 Exam Simulator</a>
        <a class="side-menu-link" href="question-bank.html">📚 Question Bank</a>
        <a class="side-menu-link" href="mistake-book.html">📕 Mistake Book</a>
        <a class="side-menu-link" href="revision.html">🔁 Smart Revision</a>
        <a class="side-menu-link" href="daily.html">📰 Daily GK</a>
        <a class="side-menu-link" href="notification-settings.html">🔔 Notification Settings</a>
        <a class="side-menu-link help-menu-link" href="help.html">❓ Help & Support</a>
        <a class="side-menu-link" href="leaderboard.html">🏆 Leaderboard</a>
        <div class="side-menu-divider"></div>

        <a class="side-menu-social telegram" href="https://t.me/sscwithjagrat" target="_blank" rel="noopener">
          <svg viewBox="0 0 240 240" class="social-icon" aria-hidden="true">
            <circle cx="120" cy="120" r="120" fill="#29A9EA"/>
            <path fill="#fff" d="M52 118l125-48c6-2 11 1 9 10l-21 100c-2 8-7 10-13 6l-37-27-18 17c-2 2-4 3-7 3l3-38 68-61c3-3-1-4-4-2l-84 53-36-11c-8-3-8-8 2-11z"/>
          </svg>
          <span>Telegram</span>
        </a>
        <a class="side-menu-social whatsapp" href="https://whatsapp.com/channel/0029Vb9IEVT5Ui2SvBSmKb1N" target="_blank" rel="noopener">
          <svg viewBox="0 0 32 32" class="social-icon" aria-hidden="true">
            <circle cx="16" cy="16" r="16" fill="#25D366"/>
            <path fill="#fff" d="M23.5 8.5a10 10 0 0 0-16.4 11.3L6 26l6.4-1.1A10 10 0 0 0 23.5 8.5zM16 24a8 8 0 0 1-4.1-1.1l-.3-.2-3 .5.5-2.9-.2-.3A8 8 0 1 1 16 24zm4.4-6c-.2-.1-1.4-.7-1.6-.8s-.4-.1-.5.1-.5.8-.7.9-.3.2-.5.1a6.6 6.6 0 0 1-1.9-1.2 7.2 7.2 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5s.2-.3.3-.4a1.6 1.6 0 0 0 .2-.4.4.4 0 0 0 0-.4c-.1-.1-.5-1.2-.7-1.7s-.4-.4-.5-.4h-.4a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.8 2 4.7 4.7 0 0 0 1 2.5 10.7 10.7 0 0 0 4.1 3.6c.6.2 1 .4 1.4.5a3.4 3.4 0 0 0 1.5.1 2.5 2.5 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c-.1-.1-.2-.1-.4-.2z"/>
          </svg>
          <span>WhatsApp</span>
        </a>
      </nav>
    `;
    document.body.appendChild(overlay);

    // App-style bottom navigation. Admin pages keep the full-screen admin layout.
    if (!document.body.classList.contains("admin-page") && !document.querySelector(".admin-main")) {
      const nav=document.createElement("nav");
      nav.className="app-bottom-nav";
      nav.setAttribute("aria-label","Primary navigation");
      nav.innerHTML=`
        <a class="app-nav-item" data-nav="home" href="dashboard.html"><span class="app-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8v8.7a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 19.5z"/><path d="M9 21v-6h6v6"/></svg></span><span>Home</span></a>
        <a class="app-nav-item" data-nav="batch" href="index.html"><span class="app-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3.5h11A2.5 2.5 0 0 1 18.5 6v15H7A2.5 2.5 0 0 1 4.5 18.5V4A.5.5 0 0 1 5 3.5z"/><path d="M8 7h7M8 11h7M8 15h5"/></svg></span><span>My Batch</span></a>
        <a class="app-nav-item app-nav-ai" data-nav="ai" href="ai-study-assistant.html"><span class="app-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 7.5h8A3.5 3.5 0 0 1 19.5 11v4A3.5 3.5 0 0 1 16 18.5H9.5L5 21v-5.2A3.5 3.5 0 0 1 4.5 14v-3A3.5 3.5 0 0 1 8 7.5z"/><path d="M9 12h.01M12 12h.01M15 12h.01"/></svg></span><span>AI</span></a>
        <a class="app-nav-item" data-nav="tests" href="exam-simulator.html"><span class="app-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/></svg></span><span>Tests</span></a>
        <a class="app-nav-item" data-nav="profile" href="account.html?tab=profile"><span class="app-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-3.4 2.9-5.2 6.5-5.2s5.8 1.8 6.5 5.2"/></svg></span><span>Profile</span></a>`;
      document.body.appendChild(nav);
      const current=(location.pathname.split("/").pop()||"index.html").toLowerCase();
      let active=current==="dashboard.html"?"home":current==="batch.html"||current==="index.html"||current==="subject.html"||current==="class.html"?"batch":current==="ai-study-assistant.html"?"ai":current==="exam-simulator.html"?"tests":current==="account.html"?"profile":"";
      if(active){ const el=nav.querySelector(`[data-nav="${active}"]`); el?.classList.add("active"); el?.setAttribute("aria-current","page"); }
    }

    function open() { overlay.classList.remove("hidden"); document.body.style.overflow="hidden"; btn.setAttribute("aria-expanded","true"); setTimeout(()=>document.getElementById("closeSideMenu")?.focus(),0); }
    function close() { overlay.classList.add("hidden"); document.body.style.overflow=""; btn.setAttribute("aria-expanded","false"); btn.focus(); }

    btn.addEventListener("click", open);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.getElementById("closeSideMenu").addEventListener("click", close);
    const themeBtn=document.getElementById("themeToggleBtn");
    themeBtn?.addEventListener("click",()=>window.sscTheme?.toggle());
    window.sscTheme?.set(window.sscTheme.get());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    const current=(location.pathname.split("/").pop()||"index.html").toLowerCase();
    overlay.querySelectorAll(".side-menu-link").forEach(a=>{try{const u=new URL(a.href,location.href);if((u.pathname.split("/").pop()||"index.html").toLowerCase()===current)a.setAttribute("aria-current","page");}catch(_) {}});
    updateAdminMenu();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectMenu);
  } else {
    injectMenu();
  }
})();
