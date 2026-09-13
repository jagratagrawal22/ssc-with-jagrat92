import { supabase } from "./supabase.js";
const list=document.querySelector("#mistakeList"), count=document.querySelector("#mistakeCount"), filter=document.querySelector("#mistakeFilter");
const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
let rows=[];
async function load(){
 const {data:{user}}=await supabase.auth.getUser(); if(!user){location.href="account.html?tab=login&next=mistake-book.html";return;}
 const [m,c]=await Promise.all([
  supabase.from("quiz_mistakes").select("id,class_id,question_id,question,option_a,option_b,option_c,option_d,chosen_option,correct_option,explanation,next_review_at,review_count,created_at").eq("user_id",user.id).order("next_review_at",{ascending:true}),
  supabase.from("classes_public").select("id,title,class_no,subject_id").eq("published",true)
 ]);
 if(m.error){list.innerHTML=`<div class="empty">Unable to load your Mistake Book.</div>`;console.error(m.error);return;}
 const cm=new Map((c.data||[]).map(x=>[x.id,x])); rows=(m.data||[]).map(x=>({...x,cls:cm.get(x.class_id)})); render();
}
function render(){
 const mode=filter.value, now=Date.now(); let shown=rows;
 if(mode==="due") shown=rows.filter(x=>!x.next_review_at||new Date(x.next_review_at)<=new Date());
 if(mode==="new") shown=rows.filter(x=>Number(x.review_count||0)===0);
 count.textContent=`${shown.length} mistake${shown.length===1?"":"s"}`;
 if(!shown.length){list.innerHTML=`<div class="empty">${mode==="due"?"🎉 Nothing is due for revision right now.":"No mistakes in this section yet."}</div>`;return;}
 list.innerHTML=shown.map((x,i)=>{const opts={a:x.option_a,b:x.option_b,c:x.option_c,d:x.option_d};const due=!x.next_review_at||new Date(x.next_review_at)<=new Date();return `<article class="mistake-card"><div class="mistake-head"><span>${esc(x.cls?.title||"Quiz")}</span><b>${due?"🔁 Due now":"📅 Scheduled"}</b></div><h3>Q${i+1}. ${esc(x.question)}</h3><div class="mistake-options">${["a","b","c","d"].map(k=>`<div class="mistake-option ${k===x.correct_option?"right":""} ${k===x.chosen_option&&k!==x.correct_option?"wrong":""}"><strong>${k.toUpperCase()}</strong>${esc(opts[k])}</div>`).join("")}</div><p class="mistake-explain">💡 ${esc(x.explanation||"Review this question again and try to recall the rule or fact before looking at the answer.")}</p><div class="mistake-foot"><small>Attempts reviewed: ${Number(x.review_count||0)}</small><button data-id="${x.id}" class="review-btn">${due?"Mark Reviewed":"Review Again"}</button><a href="class.html?id=${encodeURIComponent(x.class_id)}">Open Class →</a></div></article>`}).join("");
 list.querySelectorAll(".review-btn").forEach(btn=>btn.onclick=async()=>{btn.disabled=true;const id=btn.dataset.id;const row=rows.find(x=>x.id===id);const next=new Date(Date.now()+7*86400000).toISOString();const {error}=await supabase.from("quiz_mistakes").update({next_review_at:next,review_count:Number(row.review_count||0)+1}).eq("id",id);if(error){console.error(error);btn.disabled=false;return;}row.next_review_at=next;row.review_count=Number(row.review_count||0)+1;render();});
}
filter.onchange=render;load();
