import { supabase } from "./supabase.js";
function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
const $=id=>document.getElementById(id);
const pct=(c,n)=>n?Math.round((Number(c)/Number(n))*100):0;
const num=n=>Number(n||0);
function bar(v,cls="analytics-bar"){const p=Math.max(0,Math.min(100,Number(v)||0));return `<div class="${cls}"><i data-pct="${p}"></i></div>`;}
function setBars(root=document){root.querySelectorAll('[data-pct]').forEach(i=>{i.style.width=`${i.dataset.pct}%`;});}
function table(rows,cols){if(!rows.length)return `<div class="empty">Not enough data yet. Complete some Quiz 2.0 questions to unlock this analysis.</div>`;return `<div class="table-scroll"><table><thead><tr>${cols.map(c=>`<th>${c[0]}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;}
function dayKey(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;}
function dayLabel(k){const d=new Date(`${k}T00:00:00`);return d.toLocaleDateString(undefined,{weekday:"short"});}
async function load(){
 try{
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){location.href="account.html?tab=login&next=performance.html";return;}
  const [ev,att,mist,classes,subjects]=await Promise.all([
   supabase.from("quiz_response_events").select("class_id,question_id,topic,difficulty,is_pyq,pyq_year,pyq_tier,is_correct,marks_awarded,answered,created_at").eq("user_id",user.id).order("created_at",{ascending:true}),
   supabase.from("quiz_attempts").select("id,score,total,created_at,class_id,attempt_type,exam_name").eq("user_id",user.id).order("created_at",{ascending:true}),
   supabase.from("quiz_mistakes").select("question_id,class_id,next_review_at").eq("user_id",user.id),
   supabase.from("classes_public").select("id,title,class_no,subject_id"),
   supabase.from("subjects").select("id,name")
  ]);
  for(const x of [ev,att,mist,classes,subjects])if(x.error)throw x.error;
  const events=ev.data||[], attempts=att.data||[], mistakes=mist.data||[], cls=classes.data||[], subs=subjects.data||[];
  const classMap=new Map(cls.map(x=>[x.id,x])), subjectMap=new Map(subs.map(x=>[x.id,x.name||x.title||"Subject"]));
  const answered=events.filter(x=>x.answered), correct=answered.filter(x=>x.is_correct), wrong=answered.filter(x=>!x.is_correct), pyq=answered.filter(x=>x.is_pyq);
  const accuracy=pct(correct.length,answered.length), totalMarks=attempts.reduce((s,x)=>s+num(x.score),0), maxMarks=attempts.reduce((s,x)=>s+num(x.total),0);
  const uniqueDays=new Set(events.map(x=>dayKey(x.created_at))).size;
  const due=mistakes.filter(x=>!x.next_review_at||new Date(x.next_review_at)<=new Date()).length;
  $("perfLoading").classList.add("hidden");$("perfContent").classList.remove("hidden");
  $("perfStats").innerHTML=[
   [accuracy+"%","Overall Accuracy","Across answered questions"],[answered.length,"Questions Solved","Recorded Quiz 2.0 answers"],[attempts.length,"Mock / Quiz Attempts","Saved assessment sessions"],[uniqueDays,"Study Days","Days with recorded activity"],[due,"Revision Due","Mistakes ready to review"],[pct(totalMarks,maxMarks)+"%","Score Efficiency","Total score vs max"]
  ].map(x=>`<div class="perf-stat-card"><b>${x[0]}</b><span>${x[1]}</span><small>${x[2]}</small></div>`).join("");

  // 14-day consistency and accuracy trend
  const today=new Date();today.setHours(0,0,0,0);const daily=[];
  for(let i=13;i>=0;i--){const d=new Date(today);d.setDate(today.getDate()-i);const k=dayKey(d);const rows=answered.filter(e=>dayKey(e.created_at)===k);const c=rows.filter(e=>e.is_correct).length;daily.push({key:k,answered:rows.length,correct:c,accuracy:pct(c,rows.length)});}
  const maxQ=Math.max(1,...daily.map(x=>x.answered));
  $("activityChart").innerHTML=daily.map(x=>`<div class="activity-col" title="${x.key}: ${x.answered} questions, ${x.accuracy}% accuracy"><div class="activity-value">${x.answered||""}</div><i class="activity-bar" data-pct="${Math.max(5,Math.round(x.answered/maxQ*100))}"></i><span>${dayLabel(x.key)}</span></div>`).join("");setBars($("activityChart"));
  const activeLast7=daily.slice(-7).filter(x=>x.answered>0).length, qLast7=daily.slice(-7).reduce((s,x)=>s+x.answered,0), qPrev7=daily.slice(0,7).reduce((s,x)=>s+x.answered,0);
  const trend=qLast7>qPrev7?"Improving":qLast7<qPrev7?"Cooling":"Steady";
  $("consistencyInsight").innerHTML=`<div class="analytics-callout"><b>${activeLast7}/7 active days</b><span>${qLast7} questions in the last 7 days • ${trend} practice volume vs previous 7 days.</span></div>`;

  // Topic intelligence
  const topicMap=new Map();for(const e of answered){const k=(e.topic||"Uncategorized").trim()||"Uncategorized";const x=topicMap.get(k)||{topic:k,attempts:0,correct:0,wrong:0,marks:0};x.attempts++;x.correct+=e.is_correct?1:0;x.wrong+=e.is_correct?0:1;x.marks+=num(e.marks_awarded);topicMap.set(k,x);}
  const topics=[...topicMap.values()].map(x=>({...x,accuracy:pct(x.correct,x.attempts)})).sort((a,b)=>a.accuracy-b.accuracy||b.attempts-a.attempts);
  const weak=topics.filter(x=>x.attempts>=2).slice(0,5);
  $("weakTopics").innerHTML=weak.length?weak.map(x=>`<div class="insight-row"><div><b>${esc(x.topic)}</b><small>${x.correct}/${x.attempts} correct • ${x.wrong} wrong</small>${bar(x.accuracy,"insight-bar")}</div><strong>${x.accuracy}%</strong></div>`).join(""):`<div class="empty">Answer at least 2 questions in a topic to detect weaknesses.</div>`;
  const rec=[...topics.filter(x=>x.attempts>=2&&x.accuracy<75),...topics.filter(x=>x.attempts<2)].slice(0,5);
  $("recommendations").innerHTML=rec.length?rec.map((x,i)=>`<div class="recommend-row"><span>${i+1}</span><div><b>${x.accuracy<75?"Priority revision: ":"Build data: "}${esc(x.topic)}</b><small>${x.attempts<2?"Solve more questions to measure this topic reliably.":`Accuracy ${x.accuracy}% • ${x.wrong} wrong answers to revisit.`}</small></div><strong>${x.accuracy}%</strong></div>`).join(""):`<div class="empty">Great start. Keep practicing to unlock more recommendations.</div>`;
  $("topicTable").innerHTML=table(topics,[['Topic',r=>`<b>${esc(r.topic)}</b>`],['Answered',r=>r.attempts],['Correct',r=>r.correct],['Accuracy',r=>`${r.accuracy}% ${bar(r.accuracy)}`],['Marks',r=>r.marks.toFixed(1)]]);setBars($("topicTable"));

  // Subject performance
  const sm=new Map();for(const e of answered){const c=classMap.get(e.class_id),name=subjectMap.get(c?.subject_id)||"Other";const x=sm.get(name)||{name,answered:0,correct:0,marks:0};x.answered++;x.correct+=e.is_correct?1:0;x.marks+=num(e.marks_awarded);sm.set(name,x);}
  const subjectsRows=[...sm.values()].map(x=>({...x,accuracy:pct(x.correct,x.answered)})).sort((a,b)=>a.accuracy-b.accuracy);
  $("subjectTable").innerHTML=table(subjectsRows,[['Subject',r=>`<b>${esc(r.name)}</b>`],['Questions',r=>r.answered],['Accuracy',r=>`${r.accuracy}% ${bar(r.accuracy)}`],['Marks',r=>r.marks.toFixed(1)]]);setBars($("subjectTable"));

  // PYQ analysis
  const yearsMap=new Map();for(const e of pyq.filter(x=>x.pyq_year)){const k=e.pyq_year,x=yearsMap.get(k)||{year:k,attempts:0,correct:0};x.attempts++;x.correct+=e.is_correct?1:0;yearsMap.set(k,x);}const years=[...yearsMap.values()].map(x=>({...x,accuracy:pct(x.correct,x.attempts)})).sort((a,b)=>String(a.year).localeCompare(String(b.year)));
  $("yearTable").innerHTML=table(years,[['Year',r=>`<b>${esc(r.year)}</b>`],['Answers',r=>r.attempts],['Accuracy',r=>`${r.accuracy}% ${bar(r.accuracy)}`]]);setBars($("yearTable"));
  const tierMap=new Map();for(const e of pyq){const k=(e.pyq_tier||"Unspecified").trim()||"Unspecified",x=tierMap.get(k)||{tier:k,attempts:0,correct:0};x.attempts++;x.correct+=e.is_correct?1:0;tierMap.set(k,x);}const tiers=[...tierMap.values()].map(x=>({...x,accuracy:pct(x.correct,x.attempts)}));
  $("tierTable").innerHTML=table(tiers,[['Tier / Shift',r=>`<b>${esc(r.tier)}</b>`],['Answers',r=>r.attempts],['Accuracy',r=>`${r.accuracy}% ${bar(r.accuracy)}`]]);setBars($("tierTable"));

  // Assessment trend
  const recent=attempts.slice(-10).reverse();
  $("trendList").innerHTML=recent.length?recent.map(a=>{const p=pct(a.score,a.total),title=classMap.get(a.class_id)?.title||a.exam_name||"Quiz";return `<div class="trend-row"><div><b>${esc(title)}</b><small>${new Date(a.created_at).toLocaleDateString()}${a.attempt_type?` • ${esc(a.attempt_type)}`:""}</small></div><div class="trend-score"><div>${bar(p)}</div><strong>${num(a.score).toFixed(1)} / ${num(a.total).toFixed(1)} (${p}%)</strong></div></div>`}).join(""):`<div class="empty">No quiz attempts yet.</div>`;setBars($("trendList"));

  // Snapshot cards
  const wrongRate=answered.length?pct(wrong.length,answered.length):0, pyqAccuracy=pct(pyq.filter(x=>x.is_correct).length,pyq.length), best=subjectsRows.length?subjectsRows[subjectsRows.length-1]:null;
  $("performanceSnapshot").innerHTML=[
   [wrongRate+"%","Wrong-answer rate","Keep reducing avoidable errors"],[pyqAccuracy+"%","PYQ accuracy",pyq.length?`${pyq.length} PYQ answers recorded`:"No PYQ data yet"],[best?best.accuracy+"%":"—","Best subject",best?best.name:"Solve more questions"],[mistakes.length,"Mistake Book","Open questions saved for revision"]
  ].map(x=>`<div class="snapshot-card"><span>${x[1]}</span><b>${x[0]}</b><small>${esc(x[2])}</small></div>`).join("");
 }catch(e){console.error(e);$("perfLoading").textContent="Unable to load performance analytics. Please refresh and try again.";}
}
load();
