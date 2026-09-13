import { supabase } from "./supabase.js";
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c]));
const pct=v=>Math.max(0,Math.min(100,Number(v)||0));
const bar=v=>`<span class="intel-bar"><i style="width:${pct(v)}%"></i></span>`;
const row=(title,meta,value,cls="")=>`<div class="intel-row"><div><b>${esc(title)}</b><small>${esc(meta)}</small></div><strong class="${cls}">${esc(value)}</strong></div>`;

async function load(){
  const [overview,engagement,pyq,subs]=await Promise.all([
    supabase.rpc("admin_overview_stats"),
    supabase.rpc("admin_class_engagement"),
    supabase.rpc("get_admin_pyq_analytics"),
    supabase.rpc("get_admin_subscription_analytics")
  ]);
  const errors=[overview,engagement,pyq,subs].filter(x=>x.error);
  if(errors.length){
    console.warn("Admin intelligence partial load",errors.map(x=>x.error?.message));
  }
  const o=overview.data?.[0]||{};
  const classes=Array.isArray(engagement.data)?engagement.data:[];
  const pyqData=pyq.data||{};
  const topics=Array.isArray(pyqData.topics)?pyqData.topics:[];
  const sub=subs.data||{};

  const active=Number(o.active_subscribers)||0;
  const users=Number(o.total_users)||0;
  const attempts=Number(o.total_quiz_attempts)||0;
  const completions=Number(o.total_completions)||0;
  const activeToday=Number(o.active_today)||0;
  const engagementRate=users?Math.round(activeToday/users*100):0;
  const avgClassScore=classes.length?classes.reduce((a,c)=>a+(Number(c.avg_quiz_score_pct)||0),0)/classes.length:0;
  const classWithQuiz=classes.filter(c=>(Number(c.quiz_takers)||0)>0);
  const weakClasses=classWithQuiz.filter(c=Number(c.avg_quiz_score_pct||0)<60).sort((a,b)=>(Number(a.avg_quiz_score_pct)||0)-(Number(b.avg_quiz_score_pct)||0));
  const dormantClasses=classes.filter(c=>(Number(c.completions)||0)===0);
  const strongQuizLowCompletion=classWithQuiz.filter(c=>Number(c.avg_quiz_score_pct||0)>=75 && Number(c.completions||0)<=2).sort((a,b)=>(Number(b.avg_quiz_score_pct)||0)-(Number(a.avg_quiz_score_pct)||0));
  const weakTopics=topics.filter(t=>Number(t.attempts)>0).sort((a,b)=>(Number(a.accuracy)||100)-(Number(b.accuracy)||100));
  const pyqResponses=Number(pyqData.overview?.pyq_responses)||0;
  const pyqAccuracy=pyqResponses?Math.round((Number(pyqData.overview?.pyq_correct)||0)/pyqResponses*100):0;
  const revenue=Number(sub.gross_recorded_revenue_paise||0)/100;

  $("#adminIntelStats").innerHTML=`
    <div><b>${users}</b><span>Registered Students</span></div>
    <div><b>${active}</b><span>Active Pro</span></div>
    <div><b>${activeToday}</b><span>Active Today</span></div>
    <div><b>${attempts}</b><span>Total Quiz Attempts</span></div>`;

  const actions=[];
  if(weakClasses.length) actions.push(row("${weakClasses[0]?.title||"Weak-performing class"}",`${weakClasses.length} classes below 60% average quiz score`,`${Math.round(Number(weakClasses[0]?.avg_quiz_score_pct)||0)}%`,"danger"));
  if(dormantClasses.length) actions.push(row("Unstarted content",`${dormantClasses.length} published/available classes have no recorded completions`,String(dormantClasses.length),"warn"));
  if(weakTopics.length) actions.push(row("Weakest question topic",`${weakTopics[0].attempts||0} responses • accuracy ${weakTopics[0].accuracy??0}%`,weakTopics[0].topic,"danger"));
  if(strongQuizLowCompletion.length) actions.push(row("High-quality, low-reach class",`${strongQuizLowCompletion.length} classes score ≥75% but have ≤2 completions`,strongQuizLowCompletion[0].title,"good"));
  if(!actions.length) actions.push(`<div class="empty">No urgent action signal detected yet. More student activity will make this panel smarter.</div>`);
  $("#adminIntelActions").innerHTML=actions.join("");

  const content=[];
  content.push(row("Average class quiz score",`${classes.length} classes analyzed`,`${Math.round(avgClassScore)}%`));
  content.push(row("PYQ accuracy",`${pyqResponses} PYQ responses`,`${pyqAccuracy}%`));
  content.push(row("Course completion records","Across all classes",String(completions)));
  content.push(row("Student activity rate",`${activeToday} active today out of ${users} registered`,`${engagementRate}%`));
  $("#adminIntelContent").innerHTML=content.join("");

  const rec=[];
  if(weakClasses.length) rec.push(`<div class="intel-rec"><b>Improve ${esc(weakClasses[0].title)}</b><span>Review its questions, explanations and difficulty mix before adding more content.</span></div>`);
  if(weakTopics.length) rec.push(`<div class="intel-rec"><b>Strengthen ${esc(weakTopics[0].topic)}</b><span>This topic has the lowest observed accuracy among tracked response data. Create targeted practice/revision.</span></div>`);
  if(strongQuizLowCompletion.length) rec.push(`<div class="intel-rec"><b>Promote high-performing content</b><span>${esc(strongQuizLowCompletion[0].title)} shows strong quiz performance but low completion reach.</span></div>`);
  if(!activeToday && users) rec.push(`<div class="intel-rec"><b>Bring students back today</b><span>No activity is recorded today yet. Consider a Daily Challenge or push reminder.</span></div>`);
  if(revenue>0) rec.push(`<div class="intel-rec"><b>Monitor subscription health</b><span>Recorded subscription revenue is ₹${revenue.toLocaleString("en-IN")}; compare active Pro count with engagement.</span></div>`);
  if(!rec.length) rec.push(`<div class="empty">Keep publishing quality questions and collecting attempts. Intelligence signals will improve automatically.</div>`);
  $("#adminIntelRecommendations").innerHTML=rec.join("");
}
load();
