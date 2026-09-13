import { supabase } from "./supabase.js";
const $=s=>document.querySelector(s);
const form=$("#adminGrantSubscriptionForm"), msg=$("#grantSubscriptionMsg");

async function load(){
  const {data,error}=await supabase.rpc("get_admin_subscription_analytics");
  if(error){
    $("#adminSubscriptionOverview").innerHTML=`<div class="empty">${String(error.message||error)}</div>`;
    return;
  }
  $("#adminSubscriptionOverview").innerHTML=`<div><b>${data.total_subscriptions||0}</b><span>Total subscriptions</span></div><div><b>${data.active_subscriptions||0}</b><span>Active now</span></div><div><b>₹${((data.gross_recorded_revenue_paise||0)/100).toLocaleString("en-IN")}</b><span>Recorded revenue</span></div><div><b>${(data.plans||[]).length}</b><span>Plans used</span></div>`;
  $("#adminSubscriptionPlans").innerHTML=(data.plans||[]).map(p=>`<div class="admin-row"><div><b>${p.plan_id}</b><span>${p.active} active • ${p.total} total</span></div><strong>₹${((p.revenue||0)/100).toLocaleString("en-IN")}</strong></div>`).join("")||"<div class='empty'>No subscription records yet.</div>";
}

form?.addEventListener("submit",async e=>{
  e.preventDefault();
  msg.textContent="Granting access...";
  const email=$("#grantEmail").value.trim().toLowerCase();
  const months=Number($("#grantDuration").value);
  if(!email){msg.textContent="Enter a student email.";return;}
  if(![1,6,12].includes(months)){msg.textContent="Choose 1, 6, or 12 months.";return;}
  const {data,error}=await supabase.rpc("grant_free_subscription",{p_email:email,p_months:months});
  if(error){msg.textContent=error.message||String(error);return;}
  msg.textContent=`Free access granted to ${email} until ${new Date(data.expires_at).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}.`;
  form.reset();
  $("#grantDuration").value=String(months);
  await load();
});

load();
