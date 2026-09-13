import { supabase } from './supabase.js';
const $=id=>document.getElementById(id); const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let challenge=null, answers={};
let timerId=null;
const TIMER_SECONDS=10*60;
function timerKey(){return `dailyChallengeStart:${challenge?.challenge_date||'today'}`;}
function startTimer(){
  if(!challenge || challenge.done){$('challengeTimer').textContent='⏱️ Completed'; return;}
  let started=Number(localStorage.getItem(timerKey()));
  if(!started){started=Date.now();localStorage.setItem(timerKey(),String(started));}
  const tick=()=>{
    const left=Math.max(0,TIMER_SECONDS-Math.floor((Date.now()-started)/1000));
    const m=String(Math.floor(left/60)).padStart(2,'0'), sec=String(left%60).padStart(2,'0');
    $('challengeTimer').textContent=`⏱️ ${m}:${sec}`;
    if(left<=0){clearInterval(timerId);timerId=null; $('challengeTimer').textContent='⏰ Time up'; if(!challenge.done) submit(true);}
  };
  tick(); clearInterval(timerId); timerId=setInterval(tick,1000);
}
function stopTimer(){if(timerId){clearInterval(timerId);timerId=null;} if(challenge?.challenge_date) localStorage.removeItem(timerKey());}
function render(){
  const q=challenge.questions||[];
  $('challengeMeta').textContent=` • ${q.length} questions • +2 / −0.5`;
  $('challengeQuestions').innerHTML=q.map((x,i)=>`<article class="challenge-q"><div class="challenge-q-head"><b>Q${i+1}</b><span>${esc(x.topic||'General')} • ${esc(x.difficulty||'medium')}</span></div><h3>${esc(x.question)}</h3><div class="challenge-options">${[['a',x.option_a],['b',x.option_b],['c',x.option_c],['d',x.option_d]].map(([k,t])=>`<button class="challenge-option ${answers[x.id]===k?'selected':''}" data-q="${x.id}" data-o="${k}" ${challenge.done?'disabled':''}><b>${k.toUpperCase()}</b><span>${esc(t)}</span></button>`).join('')}</div></article>`).join('');
  document.querySelectorAll('.challenge-option').forEach(b=>b.onclick=()=>{answers[b.dataset.q]=b.dataset.o;render();});
  $('submitChallenge').classList.toggle('hidden',challenge.done); $('challengeStatus').textContent=challenge.done?'Completed 🎉':"Today's Challenge";
  if(challenge.done){ $('challengeResult').classList.remove('hidden'); stopTimer(); } else startTimer();
  $('challengeScore').textContent=challenge.done?`${challenge.score}/${challenge.max_score}`:`0/${q.reduce((s,x)=>s+Number(x.marks||0),0)}`;
}
async function load(){
  const {data:{user}}=await supabase.auth.getUser(); if(!user){location.href='account.html?tab=login&next=daily-challenge.html';return;}
  const {data,error}=await supabase.rpc('get_daily_challenge',{p_question_count:10});
  if(error){$('challengeLoading').textContent=error.message;return;} challenge=data; $('challengeLoading').classList.add('hidden');$('challengeContent').classList.remove('hidden');render(); loadLeaderboard(); loadHistory();
}
async function submit(force=false){
  const total=challenge.questions.length, unanswered=challenge.questions.filter(q=>!answers[q.id]).length;
  if(!challenge.questions.length){alert('No questions are available for today.');return;}
  if(unanswered && !force && !confirm(`${unanswered} question(s) are unanswered. Submit anyway?`)) return;
  $('submitChallenge').disabled=true;$('submitChallenge').textContent='Submitting...';
  const {data,error}=await supabase.rpc('submit_daily_challenge',{p_answers:answers});
  if(error){alert(error.message);$('submitChallenge').disabled=false;$('submitChallenge').textContent='SUBMIT CHALLENGE';return;}
  challenge.done=true;challenge.score=data.score;challenge.max_score=data.max_score;challenge.correct=data.correct;challenge.wrong=data.wrong;challenge.unanswered=data.unanswered;render(); stopTimer();
  $('challengeResult').innerHTML=`<div class="challenge-result"><span>🎉 Challenge Complete</span><h2>${esc(data.score)} / ${esc(data.max_score)}</h2><p>Correct: <b>${data.correct}</b> • Wrong: <b>${data.wrong}</b> • Unanswered: <b>${data.unanswered}</b></p><small>+${data.challenge_points||0} XP earned. Wrong questions have been added to your revision flow.</small></div>`;$('challengeResult').classList.remove('hidden');loadLeaderboard(); loadHistory();
}
async function loadLeaderboard(){const {data,error}=await supabase.rpc('get_daily_challenge_leaderboard',{p_limit:20}); if(error){$('challengeLeaderboard').textContent='Leaderboard unavailable.';return;} $('challengeLeaderboard').innerHTML=(data||[]).map((x,i)=>`<div class="challenge-lb-row"><b>#${i+1}</b><span>${esc(x.display_name)}</span><strong>${esc(x.score)}</strong><small>${x.correct} correct</small></div>`).join('')||'<div class="empty">No attempts yet today.</div>';}
$('submitChallenge').onclick=submit;load();

async function loadHistory(){
  const {data,error}=await supabase.from('daily_challenge_attempts').select('challenge_date,score,max_score,correct,wrong,unanswered,created_at').order('challenge_date',{ascending:false}).limit(14);
  if(error){$('challengeHistory').textContent='History unavailable.';return;}
  const rows=data||[];
  $('challengeHistory').innerHTML=rows.map(x=>`<div class="challenge-history-row"><b>${esc(new Date(`${x.challenge_date}T00:00:00`).toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'}))}</b><span>${esc(x.correct)} correct • ${esc(x.wrong)} wrong • ${esc(x.unanswered)} skipped</span><strong>${esc(x.score)} / ${esc(x.max_score)}</strong></div>`).join('')||'<div class="empty">No previous challenges yet.</div>';
}
