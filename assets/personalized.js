import { supabase } from './supabase.js';
import { enableStudyNotifications, notifySmartReminders } from './notifications.js';
const $=id=>document.getElementById(id);const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

function renderPrepPlan(data, weak){
 const due=Number(data.due_reviews||0), mistakes=Number(data.mistakes||0), quizzes=Number(data.quizzes||0), completed=Number(data.classes_completed||0);
 const goalQ=Number(data.goal?.daily_questions||10), goalM=Number(data.goal?.daily_minutes||30);
 const weakAvg=weak.length?weak.reduce((a,x)=>a+Number(x.accuracy||0),0)/weak.length:75;
 let readiness=45;
 readiness += Math.min(20, quizzes*2);
 readiness += Math.min(15, completed*1.5);
 readiness += Math.max(0, Math.min(10, (100-weakAvg)/10));
 readiness += due===0?10:Math.max(0,10-due);
 readiness=Math.round(Math.max(0,Math.min(100,readiness)));
 const label=readiness>=80?'Strong':readiness>=60?'On Track':readiness>=40?'Needs Focus':'Build Foundation';
 $('prepReadiness').innerHTML=`<div class="readiness-score"><b>${readiness}%</b><span>${label}</span></div><div class="readiness-copy"><b>Current readiness</b><p>Use this as a study signal, not an exam prediction. Your plan prioritizes revision, weak areas and mock practice.</p><div class="readiness-track"><i style="width:${readiness}%"></i></div></div>`;
 const firstWeak=weak[0]?.topic||'your weakest available topic';
 const steps=[
  [due>0?'🔁':'📚',due>0?`Clear ${due} due revision${due>1?'s':''}`:`Review one recent mistake set`,due>0?'revision.html':'mistake-book.html',due>0?'Retention first — overdue reviews have priority.':'Keep the revision loop active.'],
  ['🎯',`Practice ${firstWeak}`, 'ai-study-assistant.html', weak.length?`${Math.round(Number(weak[0].accuracy||0))}% accuracy — improve this before adding volume.`:'Build topic data with a focused practice session.'],
  ['📝',`Complete a ${quizzes<3?'25-question':'50-question'} mock`,'exam-simulator.html','Use the mock to measure timing, accuracy and exam stamina.'],
  ['🔥',`Hit today’s goal: ${goalQ} questions / ${goalM} min`,'daily-challenge.html','Consistency compounds faster than occasional long sessions.']
 ];
 $('prepPlan').innerHTML=steps.map((x,i)=>`<a class="prep-step" href="${x[2]}"><span class="prep-step-num">${i+1}</span><span class="prep-step-icon">${x[0]}</span><span class="prep-step-body"><b>${esc(x[1])}</b><small>${esc(x[3])}</small></span><strong>→</strong></a>`).join('');
}

async function load(){const {data:{user}}=await supabase.auth.getUser();if(!user){$('pathLoading').textContent='Please log in to view your personalized plan.';return;}const {data,error}=await supabase.rpc('get_personalized_learning_path');if(error){$('pathLoading').textContent=error.message;return;}$('pathLoading').classList.add('hidden');$('pathContent').classList.remove('hidden');
 const n=data.next_action||{};$('nextAction').innerHTML=`<div class="next-action-icon">🎯</div><div><span>NEXT BEST ACTION</span><h2>${esc(n.title||'Keep studying')}</h2><p>${esc(n.reason||'Keep your daily momentum going.')}</p></div><a href="${esc(n.href||'index.html')}">Start →</a>`;
 $('pathStats').innerHTML=[['🔁',data.due_reviews,'Due revisions'],['📕',data.mistakes,'Mistake Book'],['📝',data.quizzes,'Quiz attempts'],['📚',data.classes_completed,'Classes completed']].map(x=>`<div class="path-stat"><span>${x[0]}</span><b>${x[1]}</b><small>${esc(x[2])}</small></div>`).join('');
 const weak=data.weak_topics||[];$('weakTopics').innerHTML=weak.length?weak.map((x,i)=>`<div class="weak-row"><b>${i+1}</b><span>${esc(x.topic)}<small>${x.answered} answered</small></span><strong>${x.accuracy}%</strong></div>`).join(''):'<div class="empty">Not enough question data yet. Take a few quizzes to unlock topic recommendations.</div>';
 renderPrepPlan(data, weak);
 $('goalQuestions').value=data.goal?.daily_questions||10; $('goalMinutes').value=data.goal?.daily_minutes||30; $('goalText').textContent=`Daily target: ${data.goal?.daily_questions||10} questions • ${data.goal?.daily_minutes||30} minutes`;
 $('enableNotifications').onclick=async()=>{ const r=await enableStudyNotifications(); alert(r.message); if(r.ok) notifySmartReminders(); };
 $('saveGoal').onclick=async()=>{ const {data:r,error:e}=await supabase.rpc('set_learning_goal',{p_daily_questions:Number($('goalQuestions').value),p_daily_minutes:Number($('goalMinutes').value)}); if(e) alert(e.message); else { $('goalText').textContent=`Daily target: ${r.daily_questions} questions • ${r.daily_minutes} minutes`; $('saveGoal').textContent='SAVED ✓'; setTimeout(()=>$('saveGoal').textContent='SAVE GOAL',1200); }};
}
load().then(()=>notifySmartReminders());
