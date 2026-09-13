import { supabase } from "./supabase.js";
import { recordActivityToday } from "./streak.js";

function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
const LETTERS=["a","b","c","d"];

export async function loadQuiz(classId){
 const box=document.querySelector("#quizBox"); if(!box)return;
 const {data:questions,error}=await supabase.from("quiz_questions_public")
  .select("id,class_id,question,option_a,option_b,option_c,option_d,sort_order,topic,difficulty,is_pyq,pyq_year,pyq_tier,marks,negative_marks")
  .eq("class_id",classId).order("sort_order");
 if(error||!questions?.length){box.classList.add("hidden");return;}
 box.classList.remove("hidden");

 let mode="practice", timeLimit=0, timer=null, remaining=0, current=[];
 const answers={};
 const modeLabels={practice:"Practice",quick:"Quick 10",timed:"Timed",pyq:"PYQ"};

 box.innerHTML=`
 <div class="quiz2-head"><div><span class="quiz2-kicker">QUIZ 2.0</span><h2 class="quiz-heading">Practice & Exam Quiz</h2><p class="quiz2-sub">Choose a mode, then answer every question.</p></div><div id="quizTimer" class="quiz-timer hidden">⏱ <b>00:00</b></div></div>
 <div class="quiz2-controls">
   <label>Mode<select id="quizMode"><option value="practice">Practice — All</option><option value="quick">Quick 10</option><option value="timed">Timed — 10 min</option><option value="pyq">PYQ Mode</option></select></label>
   <label>Difficulty<select id="quizDifficulty"><option value="all">All levels</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
   <label>Topic<select id="quizTopic"><option value="all">All topics</option></select></label>
   <button type="button" id="quizStart" class="quiz-submit">Start Quiz</button>
 </div>
 <div id="quizMeta" class="quiz2-meta"></div>
 <div id="quizActive" class="hidden"></div>`;

 const modeEl=box.querySelector("#quizMode"), diffEl=box.querySelector("#quizDifficulty"), topicEl=box.querySelector("#quizTopic"), startBtn=box.querySelector("#quizStart"), active=box.querySelector("#quizActive"), timerEl=box.querySelector("#quizTimer"), meta=box.querySelector("#quizMeta");
 const topics=[...new Set(questions.map(q=>String(q.topic||"").trim()).filter(Boolean))].sort();
 topicEl.innerHTML='<option value="all">All topics</option>'+topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");

 function filtered(){
   let pool=questions.filter(q=>diffEl.value==="all"||String(q.difficulty||"medium").toLowerCase()===diffEl.value);
   if(topicEl.value!=="all")pool=pool.filter(q=>String(q.topic||"")===topicEl.value);
   if(modeEl.value==="pyq")pool=pool.filter(q=>q.is_pyq);
   if(modeEl.value==="quick"||modeEl.value==="timed")pool=pool.slice(0,10);
   return pool;
 }
 function updateMeta(){
   const pool=filtered(); const pyq=questions.filter(q=>q.is_pyq).length;
   meta.innerHTML=`<span>${pool.length} questions available</span><span>${pyq} PYQ tagged</span><span>+${pool.reduce((s,q)=>s+Number(q.marks||2),0)} max marks</span><span>−${pool.reduce((s,q)=>s+Number(q.negative_marks||.5),0)} total possible penalty</span>`;
   startBtn.disabled=!pool.length;
   startBtn.textContent=pool.length?`Start ${modeLabels[modeEl.value]} Quiz`:`No matching questions`;
 }
 modeEl.onchange=updateMeta; diffEl.onchange=updateMeta; topicEl.onchange=updateMeta; updateMeta();

 function stopTimer(){if(timer){clearInterval(timer);timer=null;}timerEl.classList.add("hidden");}
 function render(){
   active.innerHTML=`<div class="quiz-progress"><b>${modeLabels[mode]}</b><span id="quizProgress">0 / ${current.length} answered</span></div>
    <div class="quiz-palette">${current.map((q,i)=>`<button type="button" class="palette-btn" data-i="${i}">${i+1}</button>`).join("")}</div>
    <div class="quiz-list">${current.map((q,i)=>`<div class="quiz-q" data-qid="${q.id}"><p class="quiz-q-text"><b>Q${i+1}.</b> ${esc(q.question)}</p>${q.topic?`<span class="quiz-tag">${esc(q.topic)}</span>`:""}${q.is_pyq?`<span class="quiz-tag pyq">PYQ${q.pyq_year?` ${esc(q.pyq_year)}`:""}${q.pyq_tier?` • ${esc(q.pyq_tier)}`:""}</span>`:""}<div class="quiz-options">${LETTERS.map(l=>`<button type="button" class="quiz-opt" data-letter="${l}"><span class="quiz-opt-letter">${l.toUpperCase()}</span><span>${esc(q[`option_${l}`])}</span></button>`).join("")}</div></div>`).join("")}</div>
    <div class="quiz2-bottom"><span id="quizAnswered">0 answered</span><button type="button" id="quizSubmit" class="quiz-submit" disabled>Submit Quiz</button></div><div id="quizResult" class="quiz-result hidden"></div>`;
   const progress=()=>{const n=Object.keys(answers).length;active.querySelector("#quizProgress").textContent=`${n} / ${current.length} answered`;active.querySelector("#quizAnswered").textContent=`${n} answered`;active.querySelector("#quizSubmit").disabled=n!==current.length;active.querySelectorAll(".palette-btn").forEach(b=>b.classList.toggle("answered",!!answers[current[Number(b.dataset.i)]?.id]));};
   active.querySelectorAll(".quiz-q").forEach(qEl=>{const qid=qEl.dataset.qid;qEl.querySelectorAll(".quiz-opt").forEach(btn=>btn.onclick=()=>{answers[qid]=btn.dataset.letter;qEl.querySelectorAll(".quiz-opt").forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");progress();});});
   active.querySelectorAll(".palette-btn").forEach(b=>b.onclick=()=>active.querySelectorAll(".quiz-q")[Number(b.dataset.i)]?.scrollIntoView({behavior:"smooth",block:"center"}));
   active.querySelector("#quizSubmit").onclick=()=>submit(); progress();
 }

 async function submit(){
   stopTimer(); const submitBtn=active.querySelector("#quizSubmit"),resultBox=active.querySelector("#quizResult"); submitBtn.disabled=true;submitBtn.textContent="Checking answers...";
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){resultBox.classList.remove("hidden");resultBox.innerHTML=`Please log in to submit and save your quiz score.`;submitBtn.disabled=false;submitBtn.textContent="Submit Quiz";return;}
   const {data,error}=await supabase.rpc("submit_quiz_attempt_v2",{p_class_id:classId,p_question_ids:current.map(q=>q.id),p_answers:answers});
   if(error||!data){console.error(error);resultBox.classList.remove("hidden");resultBox.innerHTML=`Unable to submit the quiz. Please run the Quiz 2.0 SQL migration and try again.`;submitBtn.disabled=false;submitBtn.textContent="Submit Quiz";return;}
   const resultMap=new Map((data.results||[]).map(r=>[String(r.question_id),r]));
   current.forEach(q=>{const chosen=answers[q.id],r=resultMap.get(String(q.id)),correct=r?.correct_option,qEl=active.querySelector(`.quiz-q[data-qid="${q.id}"]`);if(!qEl)return;qEl.querySelectorAll(".quiz-opt").forEach(b=>{b.disabled=true;if(b.dataset.letter===correct)b.classList.add("correct");else if(b.dataset.letter===chosen)b.classList.add("incorrect");});if(r?.explanation)qEl.insertAdjacentHTML("beforeend",`<p class="quiz-explain">💡 ${esc(r.explanation)}</p>`);});
   submitBtn.classList.add("hidden");resultBox.classList.remove("hidden");const pct=data.max_score?Math.max(0,Math.round(Number(data.score)/Number(data.max_score)*100)):0;resultBox.innerHTML=`<div class="quiz-result-grid"><b>${data.score} / ${data.max_score} marks</b><span>${data.correct} correct • ${data.wrong} wrong</span><strong>${pct}% score</strong></div><p>Wrong answers have been added to your Mistake Book for revision.</p>`;recordActivityToday(user.id);
 }

 startBtn.onclick=()=>{mode=modeEl.value;current=filtered();Object.keys(answers).forEach(k=>delete answers[k]);if(!current.length)return;active.classList.remove("hidden");render();active.scrollIntoView({behavior:"smooth",block:"start"});
   if(mode==="timed"){remaining=600;timerEl.classList.remove("hidden");const tick=()=>{const m=String(Math.floor(remaining/60)).padStart(2,"0"),s=String(remaining%60).padStart(2,"0");timerEl.querySelector("b").textContent=`${m}:${s}`;if(remaining<=0){if(Object.keys(answers).length===current.length)submit();else{timerEl.querySelector("b").textContent="Time up";submit();}return;}remaining--;};tick();timer=setInterval(tick,1000);}
 };
}
