import { supabase } from "./supabase.js";
import { setupBookmarkButton } from "./bookmark.js";
import { loadQuiz } from "./quiz.js";
import { recordActivityToday } from "./streak.js";

const pageParams = new URLSearchParams(location.search);
const id = pageParams.get("id");
const requestedEra = pageParams.get("era");
const batch = pageParams.get("batch") === "5.0" ? "5.0" : "4.0";
const loading = document.querySelector("#classLoading");
const content = document.querySelector("#classContent");

function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function yt(url){
  if(!url)return "";
  try{
    const u=new URL(url.trim()); let x="";
    if(u.hostname==="youtu.be") x=u.pathname.split("/")[1]||"";
    else if(u.hostname.includes("youtube.com")){
      if(u.pathname==="/watch") x=u.searchParams.get("v")||"";
      else if(u.pathname.startsWith("/shorts/")) x=u.pathname.split("/")[2]||"";
      else if(u.pathname.startsWith("/embed/")) x=u.pathname.split("/")[2]||"";
    }
    return /^[\w-]{11}$/.test(x)?`https://www.youtube.com/embed/${x}`:"";
  }catch(e){return "";}
}
function setResource(sel,url){
 const el=document.querySelector(sel);
 if(url){el.href=url;el.classList.remove("hidden");}else if(el){el.classList.add("hidden");}
}

// --- In-page PDF viewer (additive). practiceBtn/notesBtn are now buttons
// (not links) that open a modal iframe viewer instead of a new tab. The
// modal always includes an "Open in new tab" link as a fallback. mockBtn
// is untouched — it still behaves as a normal external link. ---
function setupPdfButton(sel,url,title){
  const el=document.querySelector(sel);
  if(!el) return;
  if(!url){ el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  el.onclick=()=>openPdfModal(url,title);
}
function openPdfModal(url,title){
  const modal=document.querySelector("#pdfModal");
  if(!modal) return;
  document.querySelector("#pdfModalTitle").textContent=title;
  document.querySelector("#pdfOpenNewTab").href=url;
  document.querySelector("#pdfFrame").src=url;
  modal.classList.remove("hidden");
}
function closePdfModal(){
  const modal=document.querySelector("#pdfModal");
  if(!modal) return;
  modal.classList.add("hidden");
  document.querySelector("#pdfFrame").src="";
}
(function initPdfModal(){
  const closeBtn=document.querySelector("#pdfModalClose");
  const modal=document.querySelector("#pdfModal");
  if(closeBtn) closeBtn.onclick=closePdfModal;
  if(modal) modal.addEventListener("click",e=>{ if(e.target===modal) closePdfModal(); });
})();

// --- Progress tracking (additive; only runs for a logged-in user viewing
// unlocked content — never affects the paywall or the video player) ---
async function setupCompleteButton(classId){
  const btn=document.querySelector("#completeBtn");
  if(!btn) return;
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){ btn.classList.add("hidden"); return; }

  const {data:existing}=await supabase.from("progress").select("id")
    .eq("user_id",user.id).eq("class_id",classId).maybeSingle();
  let done=!!existing;
  const render=()=>{ btn.textContent=done?"Completed":"Mark as Complete"; btn.classList.toggle("done",done); };
  render();
  btn.classList.remove("hidden");

  btn.onclick=async()=>{
    btn.disabled=true;
    try{
      if(done){
        const {error}=await supabase.from("progress").delete().eq("user_id",user.id).eq("class_id",classId);
        if(error) throw error;
        done=false;
      }else{
        const {error}=await supabase.from("progress").insert({user_id:user.id,class_id:classId});
        if(error) throw error;
        done=true;
        recordActivityToday(user.id);
      }
      render();
    }catch(e){ console.error("Progress update failed:",e); }
    finally{ btn.disabled=false; }
  };
}
function renderUnavailable(player){
  player.innerHTML = `<div class="paywall">
    <div class="paywall-icon">⚠️</div>
    <h3>Video unavailable</h3>
    <p>Please refresh the page and try again.</p>
  </div>`;
}

async function load(){
 if(!id){loading.textContent="Class not found.";return;}
 try{
  const {data:c,error}=await supabase.from("classes_public").select("*").eq("id",id).eq("published",true).eq("batch",batch).single();
  if(error) throw error;
  const {data:s,error:se}=await supabase.from("subjects").select("*").eq("id",c.subject_id).single();
  if(se) throw se;
  const {data:list,error:le}=await supabase.from("classes_public").select("id,class_no,title,era,batch").eq("subject_id",c.subject_id).eq("batch",batch).eq("published",true).order("class_no");
  if(le) throw le;
  const historySubject = String(s.name || "").trim().toLowerCase() === "history";
  const activeEra = historySubject && ["ancient","medieval","modern"].includes(requestedEra) ? requestedEra : "";
  const ordered=(list||[]).filter(x => !activeEra || x.era === activeEra);
  const pos=ordered.findIndex(x=>x.id===c.id);
  document.title=`SSC With Jagrat | ${s.name} | Class ${c.class_no}`;
  document.querySelector("#classTitle").textContent=c.title;
  document.querySelector("#breadcrumb").textContent=`${s.icon||"📚"} ${s.name}  •  CLASS ${c.class_no}`;
  const back=`subject.html?id=${encodeURIComponent(s.id)}&batch=${encodeURIComponent(batch)}${activeEra ? `&era=${encodeURIComponent(activeEra)}` : ""}`;
  document.querySelector("#subjectBack").href=back;
  document.querySelector("#backSubject").href=`batch.html?batch=${encodeURIComponent(batch)}`;
  document.querySelector("#backSubject").href=back;
  document.querySelector("#allBtn").href=back;

  // v44: turn the class page into a real course journey using existing progress data.
  const journey=document.querySelector("#classJourney");
  try{
    const {data:journeyUser}=await supabase.auth.getUser();
    if(journeyUser && journey){
      const {data:prog}=await supabase.from("progress").select("class_id").eq("user_id",journeyUser.user.id);
      const done=new Set((prog||[]).map(x=>x.class_id));
      const completedCount=ordered.filter(x=>done.has(x.id)).length;
      const pct=ordered.length?Math.round(completedCount/ordered.length*100):0;
      journey.classList.remove("hidden");
      journey.innerHTML=`<div class="class-journey-top"><span>Course progress • ${completedCount}/${ordered.length} classes</span><b>${pct}%</b></div><div class="class-journey-track"><i style="width:${pct}%"></i></div><div class="class-journey-current"><span>CLASS ${esc(c.class_no)}</span><small>${pos>=0?`Lesson ${pos+1} of ${ordered.length}`:"Current lesson"}</small></div>`;
    }
  }catch(_){ /* progress UI is optional and never blocks the class */ }

  const player=document.querySelector("#player");
  const {data:media,error:mediaErr}=await supabase.functions.invoke("get-media-url",{body:{classId:c.id}});

  if(mediaErr){
    renderUnavailable(player);
    document.querySelector("#practiceBtn")?.classList.add("hidden");
    document.querySelector("#notesBtn")?.classList.add("hidden");
    setResource("#mockBtn",null);
    document.querySelector("#bookmarkBtn")?.classList.add("hidden");
    document.querySelector("#completeBtn")?.classList.add("hidden");
    document.querySelector("#quizBox")?.classList.add("hidden");
  }else{
    if(media.video_stream_url){
      const streamUrl=String(media.video_stream_url).trim();
      let isDirectMedia=false;
      try{
        const u=new URL(streamUrl,location.href);
        isDirectMedia=/\.(mp4|m4v|webm|ogg|ogv|mov|m3u8)$/i.test(u.pathname);
      }catch(_){ /* invalid URL is handled by the fallback below */ }

      if(isDirectMedia){
        player.innerHTML=`<video class="native-video" src="${esc(streamUrl)}" controls playsinline preload="metadata"></video>`;
      }else{
        // Some stream providers expose an HTML watch page (for example
        // Telegram/FileStreamBot) rather than a raw .mp4/.m3u8 URL.
        // Load that page in an iframe and keep a new-tab fallback.
        player.innerHTML=`<div class="stream-frame-wrap">
          <iframe src="${esc(streamUrl)}" title="${esc(c.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
          <div class="stream-frame-fallback"><span>If the player does not appear, open the stream directly:</span> <a href="${esc(streamUrl)}" target="_blank" rel="noopener noreferrer">Open stream</a></div>
        </div>`;
      }
    }else if(media.video_file_url){
      player.innerHTML=`<video class="native-video" src="${esc(media.video_file_url)}" controls playsinline preload="metadata"></video>`;
    }else{
      const video=yt(media.video_url);
      player.innerHTML=video?`<iframe src="${video}" title="${esc(c.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`:`<div class="no-video">🎥 Video link will be added soon</div>`;
    }
    setupPdfButton("#practiceBtn",media.practice_url,"Practice Sheet");
    setupPdfButton("#notesBtn",media.notes_url,"Notes");
    setResource("#mockBtn",media.mock_url);
    setupCompleteButton(c.id);
    setupBookmarkButton(c.id);
    loadQuiz(c.id);
  }

  if(pos>0){const e=document.querySelector("#prevBtn");e.href=`class.html?id=${encodeURIComponent(ordered[pos-1].id)}&batch=${encodeURIComponent(batch)}${activeEra ? `&era=${encodeURIComponent(activeEra)}` : ""}`;e.classList.remove("hidden");}
  if(pos<ordered.length-1){const e=document.querySelector("#nextBtn");e.href=`class.html?id=${encodeURIComponent(ordered[pos+1].id)}&batch=${encodeURIComponent(batch)}${activeEra ? `&era=${encodeURIComponent(activeEra)}` : ""}`;e.classList.remove("hidden");}
  loading.classList.add("hidden");content.classList.remove("hidden");
 }catch(e){console.error(e);loading.textContent="Unable to load this class. Please refresh the page.";}
}
load();
