import { supabase } from "./supabase.js";

const params = new URLSearchParams(location.search);
const subjectId = params.get("id");
const batch = params.get("batch") === "5.0" ? "5.0" : "4.0";
const classBox = document.querySelector("#classes");
const search = document.querySelector("#search");
const subjectName = document.querySelector("#subjectName");
const subjectIcon = document.querySelector("#subjectIcon");
const subjectCount = document.querySelector("#subjectCount");
let subject = null;
let classes = [];
let completedIds = new Set();

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]));
}

function yt(url) {
  if (!url) return "";
  try {
    const u = new URL(url.trim());
    let id = "";
    if (u.hostname === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || "";
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
    }
    if (/^[\w-]{11}$/.test(id)) return `https://www.youtube.com/embed/${id}`;
  } catch (_) {}
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : "";
}

function classCard(c) {
  const video = yt(c.video_url);
  const thumb = video ? video.replace("/embed/","/vi/") + "/hqdefault.jpg" : "";
  const completed = completedIds.has(c.id);
  return `<article class="class-card class-card-clickable">
    <a class="class-open" href="class.html?id=${encodeURIComponent(c.id)}&batch=${encodeURIComponent(batch)}${isHistorySubject() && c.era ? `&era=${encodeURIComponent(c.era)}` : ""}" aria-label="Open ${esc(c.title)}">
      <div class="video class-thumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy"><span class="play-badge">▶</span>` : `<div class="no-video">🎥 Video</div>`}
        ${completed ? `<span class="completed-tick" title="Completed" aria-label="Completed">✓</span>` : ""}
      </div>
      <div class="class-info">
        <span class="tag">${esc(subject?.icon || "📚")} ${esc(subject?.name || "")} • CLASS ${esc(c.class_no)}</span>
        <h3>${esc(c.title)}</h3>
        <span class="watch-now">▶ Watch Class →</span>
      </div>
    </a>
  </article>`;
}

const ERA_LABELS = { ancient: "🏺 Ancient History", medieval: "🏰 Medieval History", modern: "🏛️ Modern History" };
const ERA_ORDER = ["ancient", "medieval", "modern"];
const ERA_DESCRIPTIONS = {
  ancient: "Indus Valley, Vedic Age, Maurya, Gupta & more",
  medieval: "Delhi Sultanate, Mughals, Bhakti, Sufi & more",
  modern: "British rule, freedom movement, Congress & more"
};

function isHistorySubject() {
  return String(subject?.name || "").trim().toLowerCase() === "history";
}

function eraCard(era) {
  const count = classes.filter(c => c.era === era).length;
  const selected = new URLSearchParams(location.search).get("era") === era;
  return `<a class="era-card ${selected ? "selected" : ""}" href="subject.html?id=${encodeURIComponent(subject.id)}&batch=${encodeURIComponent(batch)}&era=${era}">
    <span class="era-card-icon">${ERA_LABELS[era].split(" ")[0]}</span>
    <span class="era-card-title">${esc(ERA_LABELS[era].replace(/^\S+\s/, ""))}</span>
    <span class="era-card-description">${ERA_DESCRIPTIONS[era]}</span>
    <span class="era-card-count">${count} ${count === 1 ? "Video" : "Videos"} →</span>
  </a>`;
}

function renderHistoryCategories() {
  classBox.innerHTML = `<div class="history-era-grid">${ERA_ORDER.map(eraCard).join("")}</div>`;
}

function renderClasses(filter = "") {
  const q = filter.trim().toLowerCase();
  const selectedEra = new URLSearchParams(location.search).get("era");

  if (isHistorySubject() && !selectedEra) {
    classBox.innerHTML = `<div class="history-era-intro"><h2>History Sections</h2><p>Select Ancient, Medieval or Modern History to view its videos and PDFs.</p></div><div class="history-era-grid">${ERA_ORDER.map(eraCard).join("")}</div>`;
    return;
  }

  search.closest(".toolbar")?.classList.remove("hidden");
  let list = classes;
  if (isHistorySubject() && ERA_LABELS[selectedEra]) {
    list = list.filter(c => c.era === selectedEra);
    if (subjectCount) subjectCount.textContent = "";
  } else {
    if (subjectCount) subjectCount.textContent = "";
  }
  list = list.filter(c => `${c.title || ""} ${c.class_no || ""}`.toLowerCase().includes(q));

  if (!list.length) {
    classBox.innerHTML = `<div class="empty">No classes found for this section.</div>`;
    return;
  }

  // Non-History subjects remain in the existing flat layout.
  // History section pages show only the selected era's videos.
  classBox.innerHTML = `<div class="class-grid-plain">${list.map(classCard).join("")}</div>`;
}

async function load() {
  if (!subjectId) {
    subjectName.textContent = "Subject not found";
    if (subjectCount) subjectCount.textContent = "";
    classBox.innerHTML = `<div class="empty">No subject was selected.</div>`;
    return;
  }
  classBox.innerHTML = `<div class="empty">Loading videos...</div>`;
  try {
    const [s, c, mm] = await Promise.all([
      supabase.from("subjects").select("*").eq("id", subjectId).single(),
      supabase.from("classes_public").select("*").eq("subject_id", subjectId).eq("batch", batch).eq("published", true).order("class_no"),
      supabase.from("subject_batch_materials").select("mind_map_english_url,mind_map_hindi_url").eq("subject_id", subjectId).eq("batch", batch).maybeSingle()
    ]);
    if (s.error) throw new Error(`Subject: ${s.error.message}`);
    if (c.error) throw new Error(`Classes: ${c.error.message}`);
    subject = s.data;
    classes = c.data || [];
    const mindMapEnglishUrl = mm.error ? null : (mm.data?.mind_map_english_url || null);
    const mindMapHindiUrl = mm.error ? null : (mm.data?.mind_map_hindi_url || null);
    const mindMap = document.querySelector("#mindMaps");
    if(mindMap){
      mindMap.classList.remove("hidden");
      mindMap.innerHTML = `
        <div class="mind-map-card">
          <div class="mind-map-head"><span class="mind-map-kicker">PARMAR GK BATCH ${batch}</span><h2>🧠 MIND MAPS</h2><p>Quick subject revision PDFs</p></div>
          <div class="mind-map-pdf-grid">
            ${mindMapEnglishUrl ? `<a class="mind-map-pdf-btn" href="${esc(mindMapEnglishUrl)}" target="_blank" rel="noopener"><span>📄</span><b>${esc(subject.name)} (English)</b><small>OPEN PDF →</small></a>` : `<div class="mind-map-pdf-btn disabled"><span>📄</span><b>${esc(subject.name)} (English)</b><small>PDF COMING SOON</small></div>`}
            ${mindMapHindiUrl ? `<a class="mind-map-pdf-btn" href="${esc(mindMapHindiUrl)}" target="_blank" rel="noopener"><span>📄</span><b>${esc(subject.name)} (Hindi)</b><small>OPEN PDF →</small></a>` : `<div class="mind-map-pdf-btn disabled"><span>📄</span><b>${esc(subject.name)} (Hindi)</b><small>PDF COMING SOON</small></div>`}
          </div>
        </div>`;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: prog } = await supabase.from("progress").select("class_id,completed_at").eq("user_id", user.id);
      completedIds = new Set((prog || []).map(p => p.class_id));
      const pct = classes.length ? Math.round(completedIds.size / classes.length * 100) : 0;
      const next = classes.find(x => !completedIds.has(x.id));
      const sp = document.querySelector("#subjectProgress");
      if (sp) { sp.classList.remove("hidden"); sp.innerHTML = `<div class="subject-progress-copy"><span class="dash-kicker">YOUR COURSE PROGRESS</span><b>${completedIds.size}/${classes.length} classes completed</b><small>${pct}% complete</small></div><div class="subject-progress-track"><i style="width:${pct}%"></i></div>${next ? `<a href="class.html?id=${encodeURIComponent(next.id)}" class="subject-next-link">Continue: ${esc(next.title)} →</a>` : `<span class="subject-next-link complete">✓ Course completed</span>`}`; }
    } else {
      completedIds = new Set();
      document.querySelector("#subjectProgress")?.classList.add("hidden");
    }
    const selectedEra = new URLSearchParams(location.search).get("era");
    document.title = `SSC With Jagrat | Parmar GK Batch ${batch} | ${subject.name}${isHistorySubject() && ERA_LABELS[selectedEra] ? ` | ${ERA_LABELS[selectedEra].replace(/^\S+\s/, "")}` : ""}`;
    subjectName.textContent = subject.name || "Subject";
    subjectIcon.textContent = subject.icon || "📚";
    if (subjectCount) subjectCount.textContent = "";
    renderClasses();
  } catch (err) {
    console.error("Subject loading error:", err);
    subjectName.textContent = "Unable to load subject";
    if (subjectCount) subjectCount.textContent = "";
    classBox.innerHTML = `<div class="empty">Unable to load videos. Please refresh the page.</div>`;
  }
}

search.oninput = () => renderClasses(search.value);
load();
