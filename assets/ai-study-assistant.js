import { supabase } from './supabase.js';

const configStatus = document.getElementById('aiConfigStatus');
if (configStatus) {
  configStatus.textContent = '🔐 Secure AI connection • Provider keys stay server-side';
  configStatus.className = 'integration-status pending';
}

const $ = (id) => document.getElementById(id);
let session = null;
let weakTopics = [];
let conversation = [];
let practiceSetCount = 0;
const HISTORY_KEY = 'sscwj_ai_chat_history_v1';

function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderText(text){
  return esc(text).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
}
function addMessage(role, html, save=true){
  const el=document.createElement('div');
  el.className=`ai-message ${role}`;
  el.innerHTML=html;
  $('aiMessages').appendChild(el);
  $('aiMessages').scrollTo({top:$('aiMessages').scrollHeight,behavior:'smooth'});
  if(save) conversation.push({role,html});
  return el;
}
function setBusy(b){
  $('aiSend').disabled=b;
  $('aiSend').textContent=b?'Thinking…':'Ask AI →';
  $('aiPrompt').disabled=b;
}
function typingBubble(){
  return addMessage('assistant','<div class="ai-message-brand"><span class="ai-mini-avatar">🤖</span><div><b>SSC AI Tutor</b><small>Thinking</small></div></div><div class="ai-typing"><i></i><i></i><i></i></div>',false);
}
function saveHistory(){
  if(!conversation.some(x=>x.role==='user')) return;
  const first=conversation.find(x=>x.role==='user');
  const title=(first?.html||'').replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').trim().slice(0,70) || 'SSC AI chat';
  let history=[];
  try{history=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch{}
  const item={id:Date.now(),title,updatedAt:new Date().toISOString(),messages:conversation.slice(-30)};
  history=[item,...history.filter(h=>h.title!==title)].slice(0,8);
  localStorage.setItem(HISTORY_KEY,JSON.stringify(history));
  renderHistory();
}
function renderHistory(){
  const list=$('aiHistoryList'); if(!list)return;
  let history=[];
  try{history=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch{}
  if(!history.length){list.innerHTML='<span class="muted">No saved chats yet. Start a conversation.</span>';return;}
  list.innerHTML=history.map(h=>`<button type="button" class="ai-history-item" data-history-id="${h.id}"><span class="ai-history-icon">💬</span><span><b>${esc(h.title)}</b><small>${new Date(h.updatedAt).toLocaleDateString()}</small></span></button>`).join('');
  list.querySelectorAll('[data-history-id]').forEach(btn=>btn.addEventListener('click',()=>loadHistory(Number(btn.dataset.historyId))));
}
function loadHistory(id){
  let history=[]; try{history=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');}catch{}
  const item=history.find(h=>h.id===id); if(!item)return;
  conversation=item.messages||[];
  practiceSetCount=0;
  updateSessionStats();
  $('aiMessages').innerHTML='';
  conversation.forEach(m=>addMessage(m.role,m.html,false));
  $('aiPracticeArea').classList.add('hidden');
  $('aiHistoryDrawer').classList.add('hidden');
  $('aiMessages').scrollTop=$('aiMessages').scrollHeight;
}
function clearChat(save=true){
  if(save && conversation.some(x=>x.role==='user')) saveHistory();
  conversation=[];
  practiceSetCount=0;
  updateSessionStats();
  $('aiMessages').innerHTML='<div class="ai-message assistant welcome-message"><div class="ai-message-brand"><span class="ai-mini-avatar">🤖</span><div><b>SSC AI Tutor</b><small>Ready to help with SSC CGL 2026</small></div></div><p>Namaste! Ask me anything from Maths, Reasoning, English or GK/GS. You can also generate a practice set from your weak topics.</p><div class="ai-suggestions"><button type="button" data-prompt="Explain percentage in a simple way with 3 SSC-level examples.">📐 Explain Percentage</button><button type="button" data-prompt="Give me 5 SSC CGL reasoning questions for practice.">🧠 Practice Reasoning</button><button type="button" data-prompt="Explain the most important English grammar rules for SSC CGL.">📖 English Rules</button><button type="button" data-prompt="Explain Fundamental Rights in an SSC exam-oriented way.">🌍 GK / GS</button></div></div>';
  $('aiPracticeArea').classList.add('hidden');
  bindSuggestions();
}
function bindSuggestions(){
  document.querySelectorAll('.ai-suggestions button').forEach(b=>b.addEventListener('click',()=>{
    $('aiPrompt').value=b.dataset.prompt;
    $('aiPrompt').dispatchEvent(new Event('input'));
    $('aiPrompt').focus();
  }));
}

async function getContext(){
  const {data:{session:s}}=await supabase.auth.getSession(); session=s;
  if(!session){ $('aiWeakTopics').innerHTML='<span class="muted">Login to unlock personalized weak-topic practice.</span>'; return; }
  try{
    const [{data:events},{data:mistakes}] = await Promise.all([
      supabase.from('quiz_response_events').select('topic,is_correct').eq('user_id',session.user.id).limit(5000),
      supabase.from('quiz_mistakes').select('question,topic').eq('user_id',session.user.id).order('next_review_at',{ascending:true}).limit(5)
    ]);
    const map={};
    (events||[]).forEach(r=>{const t=(r.topic||'General').trim()||'General'; map[t]??={n:0,w:0}; map[t].n++; if(!r.is_correct)map[t].w++;});
    weakTopics=Object.entries(map).map(([topic,v])=>({topic,accuracy:Math.round((v.n-v.w)/v.n*100),attempts:v.n})).filter(x=>x.attempts>=2).sort((a,b)=>a.accuracy-b.accuracy).slice(0,6);
    (mistakes||[]).forEach(m=>{const t=(m.topic||'').trim(); if(t && !weakTopics.some(x=>x.topic===t))weakTopics.push({topic:t,accuracy:null,attempts:0});});
    weakTopics=weakTopics.slice(0,6);
    $('aiWeakTopics').innerHTML=weakTopics.length?weakTopics.map(x=>`<div class="ai-context-row"><span>${esc(x.topic)}</span><b>${x.accuracy===null?'Mistake':x.accuracy+'%'}</b></div>`).join(''):'<span class="muted">No weak-topic data yet. Try a quiz first.</span>';
  }catch(e){ $('aiWeakTopics').innerHTML='<span class="muted">Weak-topic data will appear after your Quiz 2.0 attempts.</span>'; }
}
function plainFromHtml(html=''){
  const box=document.createElement('div'); box.innerHTML=html; return (box.textContent||box.innerText||'').replace(/\s+/g,' ').trim();
}
function updateSessionStats(){
  const mc=$('aiMsgCount'), pc=$('aiPracticeCount'), tl=$('aiTopicLabel');
  if(mc) mc.textContent=conversation.filter(x=>x.role==='user'||x.role==='assistant').length;
  if(pc) pc.textContent=practiceSetCount;
  if(tl){ const s=$('aiSubject')?.value||'general'; const names={maths:'Maths',reasoning:'Reasoning',english:'English',gk_gs:'GK / GS',general:'Mixed SSC'}; tl.textContent=names[s]||'SSC'; }
}
function followupPrompt(kind){
  const msgs=conversation.filter(x=>x.role==='user'||x.role==='assistant');
  if(!msgs.length) return 'Start an SSC CGL study session and explain the selected topic step-by-step.';
  const lastUser=msgs.filter(x=>x.role==='user').at(-1);
  const lastAI=msgs.filter(x=>x.role==='assistant').at(-1);
  const context=plainFromHtml(lastAI?.html||'').slice(-2200);
  const original=plainFromHtml(lastUser?.html||'').slice(-900);
  const tasks={
    continue:'Continue the previous explanation from where it stopped. Add one fresh SSC CGL example and keep it concise.',
    harder:'Using the previous topic and explanation, give me a harder SSC CGL example and solve it step-by-step.',
    quiz:'Using the previous topic, quiz me with 3 SSC CGL questions. Do not reveal answers until I respond.',
    summary:'Summarize the previous explanation into 5 exam-ready revision points and 2 common traps.'
  };
  return `${tasks[kind]||tasks.continue}\n\nPrevious student request: ${original}\nPrevious AI response: ${context}`;
}
function bindFollowups(){
  document.querySelectorAll('[data-follow]').forEach(b=>b.addEventListener('click',()=>{
    $('aiMode').value=b.dataset.follow==='quiz'?'practice':'tutor';
    $('aiPrompt').value=followupPrompt(b.dataset.follow);
    $('aiPrompt').dispatchEvent(new Event('input'));
    $('aiPrompt').focus();
  }));
}

async function callAI(payload){
  const {data,error}=await supabase.functions.invoke('ai-study-assistant',{body:payload});
  if(error) throw error;
  if(!data?.ok) throw new Error(data?.error||'AI service is not configured yet.');
  return data;
}
function renderPractice(questions=[]){
  const area=$('aiPracticeArea'); if(!questions.length){area.classList.add('hidden');return;}
  area.classList.remove('hidden');
  practiceSetCount++; updateSessionStats();
  area.innerHTML=`<div class="ai-practice-head"><b>📝 AI Practice Set</b><span>${questions.length} questions</span></div>`+questions.map((q,i)=>`<div class="ai-practice-q"><div><b>Q${i+1}.</b> ${esc(q.question||'')}</div><div class="ai-practice-options">${(q.options||[]).map((o,j)=>`<button type="button" data-q="${i}" data-o="${j}"><b>${String.fromCharCode(65+j)}</b><span>${esc(o)}</span></button>`).join('')}</div><div class="ai-practice-answer hidden" id="aiAns${i}"><b>Answer:</b> ${esc(q.answer||'')}<br><span>${esc(q.explanation||'')}</span></div></div>`).join('');
  area.querySelectorAll('[data-q]').forEach(btn=>btn.addEventListener('click',()=>{const i=btn.dataset.q; area.querySelectorAll(`[data-q="${i}"]`).forEach(b=>b.disabled=true); btn.classList.add('selected'); $(`aiAns${i}`).classList.remove('hidden');}));
}

$('aiForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const prompt=$('aiPrompt').value.trim(); if(!prompt)return;
  if(!session){addMessage('assistant','<b>🔐 Login required</b><p>Please login first so I can securely personalize your AI practice.</p>');return;}
  const subject=$('aiSubject').value, mode=$('aiMode').value, difficulty=$('aiDifficulty').value;
  updateSessionStats();
  addMessage('user',`<p>${renderText(prompt)}</p>`);
  $('aiPrompt').value=''; $('aiCharCount').textContent='0/5000'; setBusy(true); $('aiPracticeArea').classList.add('hidden');
  const thinking=typingBubble();
  try{
    const data=await callAI({mode,subject,difficulty,prompt,weak_topics:weakTopics.slice(0,6)});
    thinking.innerHTML=`<div class="ai-message-brand"><span class="ai-mini-avatar">🤖</span><div><b>SSC AI Tutor</b><small>Just now</small></div></div><div>${renderText(data.answer||'')}</div>`;
    conversation.push({role:'assistant',html:thinking.innerHTML});
    if(data.questions) renderPractice(data.questions);
    saveHistory();
    updateSessionStats();
  }catch(err){
    thinking.innerHTML=`<div class="ai-message-brand"><span class="ai-mini-avatar">⚠️</span><div><b>AI unavailable</b><small>Please try again</small></div></div><p>${esc(err.message||'Please try again later.')}</p><small class="muted">The AI service is temporarily unavailable.</small>`;
    conversation.push({role:'assistant',html:thinking.innerHTML});
  } finally {setBusy(false);}
});

$('aiPrompt').addEventListener('input',e=>$('aiCharCount').textContent=`${e.target.value.length}/5000`);
$('aiPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('aiForm').requestSubmit();}});
$('aiHistoryBtn').addEventListener('click',()=>{$('aiHistoryDrawer').classList.toggle('hidden');renderHistory();});
$('aiCloseHistory').addEventListener('click',()=>$('aiHistoryDrawer').classList.add('hidden'));
$('aiNewChat').addEventListener('click',()=>clearChat(true));
$('aiClearChat').addEventListener('click',()=>clearChat(true));

const coachPrompts={
  explain:'Explain this SSC CGL topic simply, step-by-step, with 3 exam-level examples.',
  solve:'I will paste an SSC CGL question. Solve it step-by-step, explain the method, and give a shortcut.',
  practice:'Generate 5 SSC CGL multiple-choice questions with exactly 4 visible options each. Include the correct answer and a short explanation.',
  revision:'Create a practical 7-day SSC CGL revision plan based on my weak topics, with daily tasks and question targets.',
  shortcut:'Teach me the most useful SSC CGL exam shortcut for this topic, with one worked example.',
  english:'Give me 5 SSC CGL English practice questions focused on grammar and vocabulary, with answers and explanations.',
  gk:'Give me a 5-question SSC CGL GK/GS quick test with four options per question and explanations.'
};
document.querySelectorAll('[data-coach]').forEach(b=>b.addEventListener('click',()=>{
  const key=b.dataset.coach;
  $('aiMode').value=key==='practice'||key==='english'||key==='gk'?'practice':'tutor';
  $('aiSubject').value=key==='english'?'english':key==='gk'?'gk_gs':$('aiSubject').value;
  $('aiPrompt').value=coachPrompts[key]||'';
  $('aiPrompt').dispatchEvent(new Event('input'));
  $('aiPrompt').focus();
}));

document.querySelectorAll('.ai-quick button').forEach(b=>b.addEventListener('click',()=>{$('aiPrompt').value=b.dataset.prompt;$('aiPrompt').dispatchEvent(new Event('input'));$('aiPrompt').focus();}));
$('useWeakBtn').addEventListener('click',()=>{ $('aiSubject').value='general'; $('aiMode').value='practice'; $('aiPrompt').value=weakTopics.length?`Create a targeted SSC practice set from my weakest topics: ${weakTopics.map(x=>x.topic).join(', ')}. Focus on concepts I am likely to get wrong.`:'Create a mixed SSC practice set covering important Maths, Reasoning, English and GK/GS topics.'; $('aiPrompt').dispatchEvent(new Event('input')); $('aiForm').requestSubmit(); });

bindSuggestions();
bindFollowups();
$('aiSubject').addEventListener('change',updateSessionStats);
renderHistory();
updateSessionStats();
getContext();
