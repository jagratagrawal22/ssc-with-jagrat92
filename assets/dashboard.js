import { supabase } from "./supabase.js";
import { getCurrentStreak } from "./streak.js";

const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function renderCourseProgress(classes, progress, attempts, subjects){
  const done=new Set((progress||[]).map(x=>x.class_id));
  const sm=new Map((subjects||[]).map(x=>[x.id,x]));
  const groups=new Map();
  (classes||[]).forEach(c=>{
    if(!groups.has(c.subject_id)) groups.set(c.subject_id,{subject_id:c.subject_id,items:[],done:0});
    const g=groups.get(c.subject_id); g.items.push(c); if(done.has(c.id)) g.done++;
  });
  const ranked=[...groups.values()].sort((a,b)=> (b.done/b.items.length)-(a.done/a.items.length)).slice(0,6);
  const box=$("courseProgressGrid");
  if(!box) return;
  if(!ranked.length){box.innerHTML='<div class="empty">No published courses yet. Open Subjects to start learning.</div>';return;}
  box.innerHTML=ranked.map(g=>{
    const subj=sm.get(g.subject_id)||{}; const pct=Math.round(g.done/Math.max(1,g.items.length)*100);
    const next=g.items.find(x=>!done.has(x.id))||g.items[g.items.length-1];
    return `<article class="course-progress-card"><div class="course-progress-icon">${esc(subj.icon||'📚')}</div><div class="course-progress-body"><div class="course-progress-top"><div><b>${esc(subj.name||'Course')}</b><small>${g.done} of ${g.items.length} classes completed</small></div><strong>${pct}%</strong></div><div class="course-progress-track"><i style="width:${pct}%"></i></div><a href="class.html?id=${encodeURIComponent(next.id)}" class="course-continue">${g.done?'Continue learning':'Start course'} →</a></div></article>`;
  }).join('');
}

async function load(){
  const {data:{user}} = await supabase.auth.getUser();
  if(!user){ location.href="account.html?tab=login&next=dashboard.html"; return; }
  try{
    const [prog, attempts, mistakes, bookmarks, classes, profile, activity, subjectsRes] = await Promise.all([
      supabase.from("progress").select("class_id,completed_at").eq("user_id",user.id).order("completed_at",{ascending:false}),
      supabase.from("quiz_attempts").select("class_id,score,total,created_at").eq("user_id",user.id).order("created_at",{ascending:false}),
      supabase.from("quiz_mistakes").select("id,class_id,question_id,next_review_at,review_count,created_at").eq("user_id",user.id),
      supabase.from("bookmarks").select("class_id,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(10),
      supabase.from("classes_public").select("id,title,class_no,subject_id,thumbnail_url,published").eq("published",true),
      supabase.from("profiles").select("display_name,full_name").eq("user_id",user.id).maybeSingle(),
      supabase.from("daily_activity").select("activity_date").eq("user_id",user.id).order("activity_date",{ascending:true}),
      supabase.from("subjects").select("id,name,icon")
    ]);
    // Dashboard should remain usable even if an optional analytics query fails (for example, due to a missing/older column or RLS rule).
    // Core UI uses whatever data is available instead of replacing the whole dashboard with an error.
    const p=prog.data||[], a=attempts.data||[], m=mistakes.data||[], b=bookmarks.data||[], c=classes.data||[];
    const profileData=profile.data||{};
    const displayName=profileData.display_name||profileData.full_name||user.user_metadata?.display_name||user.email?.split("@")[0]||"Student";
    $("dashGreeting").textContent=`Welcome, ${displayName}. Your progress, practice and revision — all in one place.`;
    renderCourseProgress(c,p,a,subjectsRes.data||[]);
    $("heroQuestions")?.replaceChildren(document.createTextNode(String(a.reduce((n,x)=>n+Number(x.total||0),0))));
    $("heroStudyDays")?.replaceChildren(document.createTextNode(String(new Set((activity.data||[]).map(x=>String(x.activity_date).slice(0,10))).size)));
    $("heroProStatus")?.replaceChildren(document.createTextNode("Active"));
    const byId=new Map(c.map(x=>[x.id,x])); window.__dashClassNames=Object.fromEntries(c.map(x=>[x.id,x.title]));
    $("statCompleted").textContent=p.length; $("statQuizzes").textContent=a.length;
    const total=a.reduce((s,x)=>s+Number(x.total||0),0), score=a.reduce((s,x)=>s+Number(x.score||0),0);
    const accuracy=total?Math.round(score/total*100):0; $("statAccuracy").textContent=`${accuracy}%`; const currentStreak=await getCurrentStreak(user.id); $("statStreak").textContent=currentStreak;
    const activityDates=(activity.data||[]).map(x=>String(x.activity_date).slice(0,10)).sort();
    let bestStreak=0, run=0, prev=null;
    for(const ds of activityDates){ const d=new Date(ds+"T00:00:00"); if(prev){ const diff=Math.round((d-prev)/86400000); run=diff===1?run+1:1; } else run=1; prev=d; bestStreak=Math.max(bestStreak,run); }
    $("statBestStreak").textContent=`Best: ${bestStreak} day${bestStreak===1?"":"s"}`;
    const completion=c.length?Math.round(Math.min(1,p.length/c.length)*100):0;
    const consistency=Math.min(100,currentStreak*10);
    const practice=Math.min(100,a.length*5);
    const learning=Math.round(completion*.4+accuracy*.4+consistency*.1+practice*.1);
    $("learningScore").textContent=`${learning}/100`; $("scoreRing").querySelector("span").textContent=learning; $("scoreRing").style.setProperty("--score",`${learning*3.6}deg`);
    $("learningScoreText").textContent=learning>=80?"Excellent consistency. Keep revising weak areas to stay exam-ready.":learning>=50?"Good progress. More focused practice and revision can push you higher.":"Start with one class and one quiz today. Consistency will build your score.";

    const recent=p[0];
    if(recent){ const cls=byId.get(recent.class_id); $("continueBox").innerHTML=cls?`<div class="dash-continue"><div><small>LAST COMPLETED</small><b>${esc(cls.title)}</b><span>${esc(cls.class_no||"")}</span></div><a href="class.html?id=${encodeURIComponent(cls.id)}">Open →</a></div>`:`<div class="empty">Continue from the Subjects page.</div>`; }
    else if(b[0]){const cls=byId.get(b[0].class_id); $("continueBox").innerHTML=cls?`<div class="dash-continue"><div><small>SAVED FOR LATER</small><b>${esc(cls.title)}</b></div><a href="class.html?id=${encodeURIComponent(cls.id)}">Study →</a></div>`:`<div class="empty">Start your first class today.</div>`;}
    else $("continueBox").innerHTML=`<div class="empty">No activity yet. <a href="index.html">Start a class →</a></div>`;

    const now=Date.now(); const due=m.filter(x=>!x.next_review_at||new Date(x.next_review_at).getTime()<=now).slice(0,5);
    $("revisionBox").innerHTML=due.length?`<div class="revision-list">${due.map(x=>{const cls=byId.get(x.class_id);return `<a href="mistake-book.html" class="revision-item"><span>🔁</span><div><b>${esc(cls?.title||"Quiz question")}</b><small>Review now</small></div></a>`}).join("")}</div><a class="text-link" href="mistake-book.html">Open full Mistake Book →</a>`:`<div class="empty">🎉 No revision due right now.</div>`;

    const subjMap=new Map();
    c.forEach(cls=>{if(!subjMap.has(cls.subject_id))subjMap.set(cls.subject_id,{id:cls.subject_id,classes:0,score:0,total:0,quizzes:0});subjMap.get(cls.subject_id).classes++;});
    const {data:subjects}=await supabase.from("subjects").select("id,name,icon");
    const sm=new Map((subjects||[]).map(s=>[s.id,s]));
    a.forEach(x=>{const cls=byId.get(x.class_id);if(!cls)return;const row=subjMap.get(cls.subject_id)||{id:cls.subject_id,classes:0,score:0,total:0,quizzes:0};row.score+=Number(x.score||0);row.total+=Number(x.total||0);row.quizzes++;subjMap.set(cls.subject_id,row);});
    const perf=[...subjMap.values()].filter(x=>x.quizzes).sort((x,y)=>(y.score/(y.total||1))-(x.score/(x.total||1))).slice(0,8);
    $("subjectPerformance").innerHTML=perf.length?`<div class="performance-list">${perf.map(x=>{const s=sm.get(x.id);const pct=x.total?Math.round(x.score/x.total*100):0;return `<div class="performance-row"><span>${esc(s?.icon||"📚")} ${esc(s?.name||"Subject")}</span><div class="performance-track"><i style="width:${pct}%"></i></div><b>${pct}%</b></div>`}).join("")}</div>`:`<div class="empty">Take your first quiz to see subject-wise performance.</div>`;
    const {data:pathData}=await supabase.rpc("get_personalized_learning_path");
    if(pathData?.next_action){ const n=pathData.next_action; $("nextBestAction").innerHTML=`<div class="next-action compact"><div class="next-action-icon">🎯</div><div><span>NEXT BEST ACTION</span><h3>${esc(n.title||"Keep studying")}</h3><p>${esc(n.reason||"")}</p></div><a href="${esc(n.href||"index.html")}">Start →</a></div>`; }
    try { const {data:lb}=await supabase.rpc("get_leaderboard",{p_period:"all",p_limit:100}); const me=(lb||[]).find(x=>x.is_me); $("dashRankText").textContent=me?`Your rank: #${me.rank_no}`:"Leaderboard rank"; } catch(e){ $("dashRankText").textContent="Leaderboard rank"; }
    $("dashLoading").classList.add("hidden");$("dashContent").classList.remove("hidden");
  }catch(e){console.error(e);$("dashLoading").textContent="Unable to load dashboard. Please refresh.";}
}

// v32 Dashboard 2.0 enhancements
async function loadDashboardEnhancements(userId, attempts, progress, mistakes){
  const now = new Date();
  const localKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const start = new Date(now); start.setHours(0,0,0,0); start.setDate(start.getDate()-6);
  const dayMap = Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
  const activity = dayMap.map(d=>{const key=localKey(d); const p=progress.filter(x=>x.completed_at?.slice(0,10)===key).length; const q=attempts.filter(x=>x.created_at?.slice(0,10)===key).length; return {d,p,q,n:p*2+q*3};});
  const max=Math.max(1,...activity.map(x=>x.n));
  $("weeklyProgress").innerHTML=activity.map(x=>`<div class="week-bar"><i style="height:${Math.max(6,Math.round(x.n/max*58))}px" title="${x.p} classes, ${x.q} quizzes"></i><span>${x.d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,3)}</span></div>`).join('');

  const todayKey=localKey(now);
  const todayAttempts=attempts.filter(x=>x.created_at?.slice(0,10)===todayKey).length;
  const todayCompleted=progress.filter(x=>x.completed_at?.slice(0,10)===todayKey).length;
  let goalMinutes=60;
  try{ const {data:g}=await supabase.from('learning_goals').select('daily_minutes').eq('user_id',userId).maybeSingle(); if(g?.daily_minutes) goalMinutes=Number(g.daily_minutes); }catch(e){ console.warn('goal read skipped',e); }
  const done=Math.min(goalMinutes,todayCompleted*20+todayAttempts*10); const pct=Math.min(100,Math.round(done/goalMinutes*100));
  $("goalText").textContent=`${done} / ${goalMinutes} min`; $("goalPercent").textContent=`${pct}%`; const bar=$("goalBar"); bar.className=`goal-${Math.max(0,Math.min(100,Math.round(pct/10)*10))}`;

  const recent=attempts.slice(0,4); $("recentQuizBox").innerHTML=recent.length?recent.map(x=>{const pct=x.total?Math.round(Number(x.score||0)/Number(x.total)*100):0;return `<div class="recent-quiz"><div><b>${Number(x.score||0)} / ${Number(x.total||0)} marks</b><small>${x.created_at?new Date(x.created_at).toLocaleDateString():''}</small></div><span class="recent-score">${pct}%</span></div>`}).join(''):`<div class="empty">No quizzes attempted yet.</div>`;
  const counts=new Map(); mistakes.forEach(x=>counts.set(x.class_id,(counts.get(x.class_id)||0)+1)); const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4);
  $("focusAreas").innerHTML=top.length?top.map(([id,n])=>{ const cls=document.querySelector(`a[href*="${encodeURIComponent(id)}"]`); return `<div class="focus-item"><span>📕 ${esc((window.__dashClassNames||{})[id]||"Topic to revise")}</span><b>${n} mistake${n>1?'s':''}</b></div>`; }).join(''):`<div class="empty">No major focus area yet. Keep practicing.</div>`;
}
const originalLoad = load;
load = async function(){ await originalLoad(); try{const {data:{user}}=await supabase.auth.getUser(); if(user){ const [{data:p},{data:a},{data:m}]=await Promise.all([supabase.from('progress').select('class_id,completed_at').eq('user_id',user.id),supabase.from('quiz_attempts').select('class_id,score,total,created_at').eq('user_id',user.id).order('created_at',{ascending:false}),supabase.from('quiz_mistakes').select('id,class_id,next_review_at').eq('user_id',user.id)]); await loadDashboardEnhancements(user.id,a||[],p||[],m||[]);} }catch(e){console.warn('Dashboard 2.0 enhancement load skipped',e);} };
load();
