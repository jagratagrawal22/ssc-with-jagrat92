import { supabase } from "./supabase.js";
import { recordActivityToday } from "./streak.js";
import { saveQuestions, getQuestions, queuePractice, getQueue, removeQueue } from "./offline-store.js";
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const letters=["a","b","c","d"];
let questions=[], selected=new Set(), session=[], answers={};
const $=id=>document.getElementById(id);
async function init(){
 const {data:{user}}=await supabase.auth.getUser();
 const {data,error}=await supabase.rpc("get_question_bank_v22");
 if(error){
   questions=await getQuestions().catch(()=>[]);
   if(!questions.length){$("qbList").innerHTML=`<div class="empty">${esc(error.message)}<br><small>Go online once to load the Question Bank, then use Save Offline.</small></div>`;return;}
 } else { questions=data||[]; await saveQuestions(questions).catch(()=>{}); }
 fillFilters(); renderList();
 ["qbSubject","qbTopic","qbDifficulty","qbType","qbYear","qbTier","qbSearch"].forEach(id=>$(id).addEventListener("input",renderList));
 $("qbSelectAll").onclick=()=>{filtered().forEach(q=>selected.add(q.id));renderList();};
 $("qbClear").onclick=()=>{selected.clear();renderList();};
 $("qbStart").onclick=()=>startPractice();
 $("qbOffline").onclick=async()=>{await saveQuestions(questions).catch(()=>{}); $("qbOffline").textContent="✅ SAVED OFFLINE";};
 window.addEventListener("ssc-online",syncQueuedPractice);
 syncQueuedPractice();
}
function fillFilters(){
 const vals=(key)=>[...new Set(questions.map(q=>q[key]).filter(v=>v!==null&&v!==undefined&&String(v).trim()!==""))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
 const subjects=vals("subject_name");$("qbSubject").innerHTML='<option value="all">All Subjects</option>'+subjects.map(v=>`<option>${esc(v)}</option>`).join("");
 const years=vals("pyq_year");$("qbYear").innerHTML='<option value="all">All Years</option>'+years.map(v=>`<option>${esc(v)}</option>`).join("");
 const tiers=vals("pyq_tier");$("qbTier").innerHTML='<option value="all">All Tiers / Shifts</option>'+tiers.map(v=>`<option>${esc(v)}</option>`).join("");
 const topics=vals("topic");$("qbTopic").innerHTML='<option value="all">All Topics</option>'+topics.map(v=>`<option>${esc(v)}</option>`).join("");
}
function filtered(){const s=$("qbSearch").value.trim().toLowerCase();return questions.filter(q=>( $("qbSubject").value==="all"||q.subject_name===$("qbSubject").value)&&($("qbTopic").value==="all"||q.topic===$("qbTopic").value)&&($("qbDifficulty").value==="all"||q.difficulty===$("qbDifficulty").value)&&($("qbType").value==="all"||($("qbType").value==="pyq"?q.is_pyq:!q.is_pyq))&&($("qbYear").value==="all"||String(q.pyq_year)===$("qbYear").value)&&($("qbTier").value==="all"||q.pyq_tier===$("qbTier").value)&&(!s||q.question.toLowerCase().includes(s)));}
function renderList(){const list=filtered();$("qbCount").textContent=`${list.length} questions • ${selected.size} selected`;$("qbList").innerHTML=list.length?list.map((q,i)=>`<label class="qb-card ${selected.has(q.id)?"selected":""}"><input type="checkbox" data-id="${q.id}" ${selected.has(q.id)?"checked":""}><div><div class="qb-q"><b>${i+1}.</b> ${esc(q.question)}</div><div class="qb-meta"><span>${esc(q.subject_name||"Subject")}</span>${q.topic?`<span>${esc(q.topic)}</span>`:""}<span>${esc(q.difficulty||"medium")}</span>${q.is_pyq?`<span class="pyq">PYQ ${esc(q.pyq_year||"")} ${q.pyq_tier?`• ${esc(q.pyq_tier)}`:""}</span>`:`<span>Practice</span>`}</div></div></label>`).join(""):"<div class='empty'>No questions match these filters.</div>";
 $("qbList").querySelectorAll("input").forEach(x=>x.onchange=()=>{x.checked?selected.add(x.dataset.id):selected.delete(x.dataset.id);renderList();});
}
function startPractice(){session=questions.filter(q=>selected.has(q.id));if(!session.length){alert("Select at least one question.");return;}if(session.length>100){session=session.slice(0,100);}answers={};const box=$("qbPractice");box.classList.remove("hidden");box.innerHTML=`<div class="panel-head"><div><h2>⚡ Custom Practice</h2><span class="panel-note">${session.length} questions • +2 / −0.5 by default</span></div><button id="qbClose" class="outline">Close</button></div><div class="quiz-list">${session.map((q,i)=>`<div class="quiz-q" data-id="${q.id}"><p class="quiz-q-text"><b>Q${i+1}.</b> ${esc(q.question)}</p><div class="quiz-meta-line">${esc(q.subject_name||"")} ${q.topic?`• ${esc(q.topic)}`:""} ${q.is_pyq?`• PYQ ${esc(q.pyq_year||"")}`:""}</div><div class="quiz-options">${letters.map(l=>`<button type="button" class="quiz-opt" data-letter="${l}"><span class="quiz-opt-letter">${l.toUpperCase()}</span><span>${esc(q[`option_${l}`])}</span></button>`).join("")}</div></div>`).join("")}</div><div class="quiz2-bottom"><span id="qbAnswered">0 answered</span><button id="qbSubmit" class="quiz-submit">SUBMIT PRACTICE</button></div><div id="qbResult" class="quiz-result hidden"></div>`;box.scrollIntoView({behavior:"smooth"});
 box.querySelectorAll(".quiz-q").forEach(el=>el.querySelectorAll(".quiz-opt").forEach(b=>b.onclick=()=>{answers[el.dataset.id]=b.dataset.letter;el.querySelectorAll(".quiz-opt").forEach(x=>x.classList.remove("selected"));b.classList.add("selected");$("qbAnswered").textContent=`${Object.keys(answers).length}/${session.length} answered`;}));$("qbClose").onclick=()=>box.classList.add("hidden");$("qbSubmit").onclick=submitPractice;}
async function submitPractice(){const btn=$("qbSubmit"),result=$("qbResult");btn.disabled=true;btn.textContent="Checking...";const {data:{user}}=await supabase.auth.getUser();if(!user){result.classList.remove("hidden");result.textContent="Please log in to save your practice session.";btn.disabled=false;btn.textContent="SUBMIT PRACTICE";return;}if(!navigator.onLine){await queuePractice({question_ids:session.map(q=>q.id),answers});result.classList.remove("hidden");result.innerHTML="<b>📴 Practice saved offline.</b><p>Your answers are queued securely on this device and will sync automatically when you reconnect.</p>";btn.classList.add("hidden");return;}if(Object.keys(answers).length<session.length&&!confirm("Some questions are unanswered. Submit anyway?")){btn.disabled=false;btn.textContent="SUBMIT PRACTICE";return;}const {data,error}=await supabase.rpc("submit_practice_session_v22",{p_question_ids:session.map(q=>q.id),p_answers:answers});if(error){result.classList.remove("hidden");result.innerHTML=esc(error.message);btn.disabled=false;btn.textContent="SUBMIT PRACTICE";return;}const map=new Map((data.results||[]).map(r=>[String(r.question_id),r]));session.forEach(q=>{const r=map.get(String(q.id)),el=document.querySelector(`.quiz-q[data-id="${q.id}"]`);if(!el)return;el.querySelectorAll(".quiz-opt").forEach(b=>{b.disabled=true;if(b.dataset.letter===r?.correct_option)b.classList.add("correct");else if(b.dataset.letter===answers[q.id])b.classList.add("incorrect");});if(r?.explanation)el.insertAdjacentHTML("beforeend",`<p class="quiz-explain">💡 ${esc(r.explanation)}</p>`);});btn.classList.add("hidden");result.classList.remove("hidden");result.innerHTML=`<div class="quiz-result-grid"><b>${data.score} / ${data.max_score}</b><span>${data.correct} correct • ${data.wrong} wrong • ${data.unanswered} unanswered</span><strong>${data.percent}%</strong></div><p>Wrong questions were added to your Mistake Book.</p>`;recordActivityToday(user.id);}
init();

async function syncQueuedPractice(){if(!navigator.onLine)return;const {data:{user}}=await supabase.auth.getUser().catch(()=>({data:{user:null}}));if(!user)return;const q=await getQueue().catch(()=>[]);for(const item of q){const {error}=await supabase.rpc("submit_practice_session_v22",{p_question_ids:item.question_ids,p_answers:item.answers});if(!error)await removeQueue(item.id).catch(()=>{});else break;}}
