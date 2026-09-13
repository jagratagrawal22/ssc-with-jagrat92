import { supabase } from "./supabase.js";
import { getCurrentStreak } from "./streak.js";
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const pct=(a,b)=>b?Math.round(a/b*100):0;
const fmt=n=>Number(n||0).toFixed(1).replace(/\.0$/,'');
function bar(v){return `<div class="report-bar"><i style="width:${Math.max(0,Math.min(100,Number(v)||0))}%"></i></div>`;}
let exportRows=[];
async function load(){
 const {data:{user}}=await supabase.auth.getUser();
 if(!user){location.href="account.html?tab=login&next=progress-report.html";return;}
 try{
  const [events,attempts,progress,mistakes,classes,subjects,goals,activity]=await Promise.all([
   supabase.from("quiz_response_events").select("class_id,topic,is_pyq,pyq_year,pyq_tier,is_correct,marks_awarded,answered,created_at").eq("user_id",user.id).order("created_at",{ascending:true}),
   supabase.from("quiz_attempts").select("id,class_id,score,total,attempt_type,exam_name,created_at").eq("user_id",user.id).order("created_at",{ascending:true}),
   supabase.from("progress").select("class_id,completed_at").eq("user_id",user.id),
   supabase.from("quiz_mistakes").select("id,question_id,next_review_at").eq("user_id",user.id),
   supabase.from("classes_public").select("id,title,class_no,subject_id,published"),
   supabase.from("subjects").select("id,name"),
   supabase.from("learning_goals").select("daily_questions,daily_minutes").eq("user_id",user.id).maybeSingle(),
   supabase.from("daily_activity").select("activity_date").eq("user_id",user.id).order("activity_date",{ascending:true})
  ]);
  for(const r of [events,attempts,progress,mistakes,classes,subjects,goals,activity]) if(r.error) throw r.error;
  const ev=events.data||[], at=attempts.data||[], pr=progress.data||[], mi=mistakes.data||[], cl=classes.data||[], su=subjects.data||[], goal=goals.data||{daily_questions:10,daily_minutes:30}, act=activity.data||[];
  const classMap=new Map(cl.map(x=>[x.id,x])); const subjectMap=new Map(su.map(x=>[x.id,x.name||x.title||"Subject"]));
  const answered=ev.filter(x=>x.answered); const correct=answered.filter(x=>x.is_correct); const accuracy=pct(correct.length,answered.length);
  const score=at.reduce((s,x)=>s+Number(x.score||0),0), max=at.reduce((s,x)=>s+Number(x.total||0),0);
  const due=mi.filter(x=>!x.next_review_at||new Date(x.next_review_at)<=new Date()).length;
  const streak=await getCurrentStreak(user.id);
  $("reportLoading").classList.add("hidden");$("reportContent").classList.remove("hidden");
  $("reportTitle").textContent=`${user.user_metadata?.display_name||user.email?.split("@")[0]||"Student"}'s SSC Progress`;
  $("reportSubtitle").textContent=`Generated ${new Date().toLocaleDateString()} • Your recorded preparation across classes, quizzes, revision and practice.`;
  $("reportStats").innerHTML=[['🎯',accuracy+'%','Question accuracy'],['📝',at.length,'Quiz attempts'],['✅',pr.length,'Classes completed'],['🔥',streak,'Day streak'],['📕',due,'Revision due'],['🏆',fmt(score)+' / '+fmt(max),'Total quiz score']].map(x=>`<div class="report-stat"><span>${x[0]}</span><b>${x[1]}</b><small>${x[2]}</small></div>`).join("");

  const subjectMap=new Map(); for(const e of answered){const cls=classMap.get(e.class_id);const sid=cls?.subject_id||"unknown";const name=subjectMap.get(sid)||"Other";const x=subjectMap.get('__data_'+name)||{name,answered:0,correct:0,marks:0};x.answered++;x.correct+=e.is_correct?1:0;x.marks+=Number(e.marks_awarded||0);subjectMap.set('__data_'+name,x);}
  const subjectsRows=[...subjectMap.entries()].filter(([k])=>k.startsWith('__data_')).map(([,x])=>({...x,accuracy:pct(x.correct,x.answered)})).sort((a,b)=>b.accuracy-a.accuracy);
  $("reportSubjects").innerHTML=subjectsRows.length?`<div class="report-table"><div class="report-row report-head"><b>Subject</b><b>Answered</b><b>Correct</b><b>Accuracy</b></div>${subjectsRows.map(x=>`<div class="report-row"><b>${esc(x.name)}</b><span>${x.answered}</span><span>${x.correct}</span><strong>${x.accuracy}%</strong></div>`).join("")}</div>`:`<div class="empty">Complete some Quiz 2.0 or practice questions to build subject analytics.</div>`;

  const topics=new Map(); for(const e of answered){const k=(e.topic||"Uncategorized").trim()||"Uncategorized";const x=topics.get(k)||{name:k,answered:0,correct:0};x.answered++;x.correct+=e.is_correct?1:0;topics.set(k,x);} const topicRows=[...topics.values()].map(x=>({...x,accuracy:pct(x.correct,x.answered)})).sort((a,b)=>a.accuracy-b.accuracy||b.answered-a.answered);
  $("reportTopics").innerHTML=topicRows.length?topicRows.slice(0,15).map(x=>`<div class="report-topic"><div><b>${esc(x.name)}</b><small>${x.correct}/${x.answered} correct</small></div><div class="report-topic-meter">${bar(x.accuracy)}<strong>${x.accuracy}%</strong></div></div>`).join(""):`<div class="empty">Topic mastery will appear after practice.</div>`;
  const weak=topicRows.filter(x=>x.answered>=2).slice(0,6);
  $("reportWeak").innerHTML=weak.length?weak.map((x,i)=>`<div class="report-weak"><span>${i+1}</span><div><b>${esc(x.name)}</b><small>${x.accuracy}% accuracy • ${x.answered} attempts</small></div><strong>${x.accuracy}%</strong></div>`).join(""):`<div class="empty">Need at least 2 answers per topic to identify reliable weak areas.</div>`;

  const recent=at.slice(-10).reverse();$("reportTrend").innerHTML=recent.length?recent.map(x=>{const p=pct(x.score,x.total);return `<div class="report-trend"><div><b>${esc(x.exam_name||classMap.get(x.class_id)?.title||x.attempt_type||"Quiz")}</b><small>${new Date(x.created_at).toLocaleDateString()}</small></div><div>${bar(p)}<strong>${fmt(x.score)} / ${fmt(x.total)} • ${p}%</strong></div></div>`}).join(""):`<div class="empty">No attempts recorded yet.</div>`;
  const activeDays=new Set(act.map(x=>String(x.activity_date))).size; const first=act[0]?.activity_date,last=act[act.length-1]?.activity_date;
  $("reportConsistency").innerHTML=`<div class="consistency-grid"><div><b>${activeDays}</b><small>Active study days</small></div><div><b>${streak}</b><small>Current streak</small></div><div><b>${first?new Date(first).toLocaleDateString():"—"}</b><small>First recorded day</small></div><div><b>${last?new Date(last).toLocaleDateString():"—"}</b><small>Latest recorded day</small></div></div><p class="report-note">Daily activity records reflect study actions recorded by the platform; they are not a direct measurement of time spent studying.</p>`;
  const completion=cl.length?Math.round(Math.min(100,pr.length/cl.length*100)):0; const qToday=answered.filter(x=>new Date(x.created_at).toDateString()===new Date().toDateString()).length;
  $("reportLearning").innerHTML=`<div class="learning-report"><div><span>Class completion</span>${bar(completion)}<strong>${completion}%</strong></div><div><span>Today's recorded questions</span>${bar(Math.min(100,qToday/Math.max(1,goal.daily_questions)*100))}<strong>${qToday} / ${goal.daily_questions}</strong></div><div><span>Open mistakes</span>${bar(Math.min(100,mi.length?100-due/mi.length*100:100))}<strong>${mi.length-due} reviewed / ${mi.length} total</strong></div><div><span>Quiz score efficiency</span>${bar(pct(score,max))}<strong>${pct(score,max)}%</strong></div></div>`;
  exportRows=[['Metric','Value'],['Overall accuracy',accuracy+'%'],['Quiz attempts',at.length],['Classes completed',pr.length],['Current streak',streak],['Revision due',due],['Total quiz score',`${fmt(score)} / ${fmt(max)}`],['Active study days',activeDays],...subjectsRows.map(x=>[`Subject: ${x.name}`,`${x.accuracy}% (${x.correct}/${x.answered})`]),...topicRows.map(x=>[`Topic: ${x.name}`,`${x.accuracy}% (${x.correct}/${x.answered})`])];
 }catch(e){console.error(e);$("reportLoading").textContent="Unable to load report. Please ensure the v17+ database migrations are applied.";}
}
function csv(){const q='"';return exportRows.map(r=>r.map(v=>q+String(v??'').replaceAll('"','""')+q).join(',')).join('\n');}
$("printReport").addEventListener("click",()=>window.print());
$("downloadCsv").addEventListener("click",()=>{const blob=new Blob([csv()],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ssc-with-jagrat-progress-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);});
load();
