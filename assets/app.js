import { supabase } from "./supabase.js";
import { getCurrentStreak } from "./streak.js";

const subjectBox = document.querySelector("#subjects");
const pageParams = new URLSearchParams(location.search);
const batch = pageParams.get("batch") === "5.0" ? "5.0" : "4.0";
const search = document.querySelector("#search");
const totalClassesEl = document.querySelector("#totalClasses");
let subjects = [];
let classes = [];
let completedIds = new Set(); // class ids the logged-in user has completed (empty if logged out)

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function renderSubjects(filter = "") {
  const q = filter.trim().toLowerCase();
  const filtered = subjects.filter(s => (s.name || "").toLowerCase().includes(q));
  subjectBox.innerHTML = filtered.map(s => {
    const subjectClasses = classes.filter(c => c.subject_id === s.id && String(c.batch || "4.0") === batch);
    const count = subjectClasses.length;
    const doneCount = completedIds.size ? subjectClasses.filter(c => completedIds.has(c.id)).length : 0;
    const progressHtml = (completedIds.size && count) ? `
      <span class="progress-label">${doneCount}/${count} completed</span>
      <div class="class-progress-bar"><span style="width:${Math.round((doneCount/count)*100)}%"></span></div>` : "";
    return `<div class="subject-card batch-subject-card">
      <a class="subject-main-link" href="subject.html?id=${encodeURIComponent(s.id)}&batch=${encodeURIComponent(batch)}" aria-label="Open ${esc(s.name)}">
      <span class="subject-icon">${esc(s.icon || "📚")}</span>
      <span class="subject-name">${esc(s.name || "Subject")}</span>
      <small>${count} ${count === 1 ? "Class" : "Classes"}</small>
      ${progressHtml}
      <span class="open-subject">View Videos →</span>
      </a>
    </div>`;
  }).join("") || `<div class="empty subject-empty">No subjects found.</div>`;
}

// "Continue learning" strip — only rendered when a logged-in user has
// started (but not necessarily finished) at least one class. Purely
// additive UI above the subject grid; does nothing for logged-out users.
async function renderContinueStrip(user) {
  const holder = document.querySelector("#continueStrip");
  if (!holder || !user) return;
  try {
    const { data: recent } = await supabase.from("progress")
      .select("class_id, completed_at")
      .eq("user_id", user.id)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!recent) return;
    const { data: cls } = await supabase.from("classes_public").select("id,title,subject_id").eq("id", recent.class_id).maybeSingle();
    if (!cls) return;
    const subj = subjects.find(s => s.id === cls.subject_id);
    holder.innerHTML = `<div class="continue-card">
      <div><b>Keep Going</b><p>You recently completed "${esc(cls.title)}" ${subj ? `in ${esc(subj.name)}` : ""}</p></div>
      <a href="subject.html?id=${encodeURIComponent(cls.subject_id)}">Continue Studying →</a>
    </div>`;
  } catch (e) {
    console.error("Continue strip error:", e);
  }
}

// Streak badge — only rendered for a logged-in user with a streak > 0.
async function renderStreakBadge(user) {
  const holder = document.querySelector("#streakBadge");
  if (!holder || !user) return;
  const streak = await getCurrentStreak(user.id);
  if (streak > 0) {
    holder.innerHTML = `<span class="streak-pill">🔥 ${streak} day${streak === 1 ? "" : "s"} streak</span>`;
    holder.classList.remove("hidden");
  }
}

async function load() {
  if (!subjectBox) return;
  subjectBox.innerHTML = `<div class="empty subject-empty">Loading subjects...</div>`;
  try {
    const [a, b] = await Promise.all([
      supabase.from("subjects").select("*").order("sort_order"),
      supabase.from("classes_public").select("id,subject_id,batch").eq("published", true)
    ]);
    if (a.error) throw new Error(`Subjects: ${a.error.message}`);
    if (b.error) throw new Error(`Classes: ${b.error.message}`);
    subjects = a.data || [];
    classes = b.data || [];
    const batchTitle = `PARMAR GK BATCH ${batch}`;
    document.title = `My Batch | ${batchTitle} | SSC With Jagrat`;
    document.querySelector("#batchBrand")?.replaceChildren(document.createTextNode(batchTitle));
    document.querySelector("#batchTitle")?.replaceChildren(document.createTextNode(batchTitle));
    document.querySelector("#batchFooter")?.replaceChildren(document.createTextNode(`© SSC With Jagrat • ${batchTitle}`));
    if (totalClassesEl) totalClassesEl.textContent = classes.length;

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prog } = await supabase.from("progress").select("class_id").eq("user_id", user.id);
      completedIds = new Set((prog || []).map(p => p.class_id));
      renderContinueStrip(user);
      renderStreakBadge(user);
    }

    renderSubjects();
  } catch (err) {
    console.error("Supabase loading error:", err);
    subjectBox.innerHTML = `<div class="empty subject-empty">Unable to load subjects. Please refresh the page.</div>`;
  }
}

if (search) search.oninput = () => renderSubjects(search.value);
load();

// V49 global polish: lightweight page progress, accessible search state and shared toast.
(function(){
  const bar=document.createElement("div");bar.className="page-progress";bar.setAttribute("aria-hidden","true");document.body.prepend(bar);
  let timer;
  function progress(){bar.style.width="18%";clearTimeout(timer);timer=setTimeout(()=>bar.style.width="72%",120);}
  window.addEventListener("beforeunload",()=>bar.style.width="100%");
  window.addEventListener("ssc-loading",progress);
  window.sscToast=function(message){let t=document.querySelector(".v49-toast");if(!t){t=document.createElement("div");t.className="v49-toast";t.setAttribute("role","status");t.setAttribute("aria-live","polite");document.body.appendChild(t)}t.textContent=message;t.classList.add("show");clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),2600)};
  if(search){search.setAttribute("aria-label","Search subjects");search.setAttribute("autocomplete","off");search.addEventListener("input",()=>{search.setAttribute("aria-expanded",String(Boolean(search.value.trim())))});}
})();
