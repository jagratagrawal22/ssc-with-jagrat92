import { supabase } from "./supabase.js";
const $ = s => document.querySelector(s);

const authSection = $("#authSection");
const accountSection = $("#accountSection");
const loginForm = $("#loginForm");
const signupForm = $("#signupForm");
const authMsg = $("#authMsg");
const tabLogin = $("#tabLogin"), tabSignup = $("#tabSignup");

function esc(v=""){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function formatRupees(paise){ return "₹" + (paise/100).toLocaleString("en-IN"); }

async function loadProfile(user){
  const { data, error } = await supabase.from("profiles").select("display_name,avatar_url,exam_target,study_goal").eq("user_id", user.id).maybeSingle();
  return error ? null : data;
}

function renderProfile(profile, user){
  const name = String(profile?.display_name || user.user_metadata?.display_name || user.user_metadata?.full_name || "").trim();
  $("#profileName").value = name;
  $("#profileExamTarget").value = profile?.exam_target || "";
  $("#profileStudyGoal").value = profile?.study_goal || "";
  const avatar = $("#profileAvatarPreview");
  avatar.innerHTML = profile?.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="Profile photo">` : "👤";
  const done = [name.length >= 2, !!profile?.avatar_url, !!profile?.exam_target, !!profile?.study_goal].filter(Boolean).length;
  const pct = done * 25;
  $("#profileCompletionText").textContent = pct + "%";
  $("#profileProgressBar").style.width = pct + "%";
}

async function saveProfile(user){
  const msg = $("#profileMsg");
  const name = $("#profileName").value.trim();
  const examTarget = $("#profileExamTarget").value;
  const studyGoal = $("#profileStudyGoal").value;
  if(name.length < 2){ msg.textContent = "Please enter your full name."; return; }
  msg.textContent = "Saving...";
  const file = $("#profileAvatar").files?.[0];
  let avatarUrl = null;
  const current = await loadProfile(user);
  avatarUrl = current?.avatar_url || null;
  if(file){
    if(file.size > 2 * 1024 * 1024){ msg.textContent = "Photo must be 2 MB or smaller."; return; }
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${user.id}/avatar.${ext || "jpg"}`;
    const { error: upError } = await supabase.storage.from("avatars").upload(path, file, { upsert:true, contentType:file.type || "image/jpeg" });
    if(upError){ msg.textContent = "Photo upload failed. Please run the v29 SQL migration first."; return; }
    avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  const { error } = await supabase.from("profiles").upsert({user_id:user.id,display_name:name,avatar_url:avatarUrl,exam_target:examTarget || null,study_goal:studyGoal || null,updated_at:new Date().toISOString()});
  if(error){ msg.textContent = error.message; return; }
  await supabase.auth.updateUser({ data:{display_name:name,full_name:name} });
  renderProfile({display_name:name,avatar_url:avatarUrl,exam_target:examTarget,study_goal:studyGoal}, user);
  msg.textContent = "Profile saved successfully.";
}

$("#profileForm").onsubmit = async (e) => { e.preventDefault(); const { data:{user} } = await supabase.auth.getUser(); if(user) await saveProfile(user); };

$("#profileAvatar").addEventListener("change", () => {
  const file = $("#profileAvatar").files?.[0]; if(!file) return;
  if(file.size > 2*1024*1024) return;
  const url = URL.createObjectURL(file);
  $("#profileAvatarPreview").innerHTML = `<img src="${esc(url)}" alt="Profile photo preview">`;
});

function showLogin() { tabLogin.classList.add("active"); tabSignup.classList.remove("active"); loginForm.classList.remove("hidden"); signupForm.classList.add("hidden"); authMsg.textContent=""; }
function showSignup() { tabSignup.classList.add("active"); tabLogin.classList.remove("active"); signupForm.classList.remove("hidden"); loginForm.classList.add("hidden"); authMsg.textContent=""; }

tabLogin.onclick = showLogin;
tabSignup.onclick = showSignup;

// Guarantee only one form is visible on initial load, regardless of markup state.
showLogin();

loginForm.onsubmit = async (e) => {
  e.preventDefault(); authMsg.textContent = "Logging in...";
  const { error } = await supabase.auth.signInWithPassword({ email: $("#loginEmail").value.trim(), password: $("#loginPassword").value });
  if (error) { authMsg.textContent = error.message; return; }
  authMsg.textContent = ""; await refresh();
};

$("#forgotPasswordBtn").onclick = async () => {
  const email = $("#loginEmail").value.trim();
  if (!email) {
    authMsg.textContent = "Enter your email address first, then tap Forgot Password.";
    $("#loginEmail").focus();
    return;
  }
  authMsg.textContent = "Sending password reset email...";
  const redirectTo = new URL("reset-password.html", window.location.href).href;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) { authMsg.textContent = error.message; return; }
  authMsg.textContent = "If an account exists for this email, a password reset link has been sent. Please check your inbox.";
};

signupForm.onsubmit = async (e) => {
  e.preventDefault();
  authMsg.textContent = "Creating account...";
  const displayName = $("#signupName").value.trim();
  const email = $("#signupEmail").value.trim();
  const password = $("#signupPassword").value;
  if (displayName.length < 2) { authMsg.textContent = "Please enter your name (at least 2 characters)."; return; }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, full_name: displayName } }
  });
  if (error) { authMsg.textContent = error.message; return; }

  // Save the signup name to the public profile when a session is available.
  // If email confirmation is enabled, refresh() will sync it after the user logs in.
  if (data?.session?.user?.id) {
    const { error: profileError } = await supabase.from("profiles").upsert({
      user_id: data.session.user.id,
      display_name: displayName
    });
    if (profileError) console.warn("Profile name could not be saved yet:", profileError.message);
  }

  if (!data?.session) {
    authMsg.innerHTML = "Account created. Please check your email and click the verification link before logging in.";
    return;
  }
  authMsg.textContent = "Account created! Loading your account...";
  await refresh();
};

$("#logoutBtn").onclick = async () => { await supabase.auth.signOut(); await refresh(); };

async function loadPlans() {
  const { data, error } = await supabase.from("plans").select("*").eq("active", true).order("amount_paise");
  return error || !data ? [] : data;
}

async function loadEntitlements() {
  const { data, error } = await supabase.rpc("get_my_entitlements");
  return error ? null : data;
}

async function loadSubscription() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("subscriptions").select("*")
    .eq("user_id", user.id).eq("status", "active")
    .gt("current_period_end", new Date().toISOString())
    .order("current_period_end", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function startCheckout(planId, btn) {
  btn.disabled = true; const orig = btn.textContent; btn.textContent = "Starting payment...";
  try {
    const { data, error } = await supabase.functions.invoke("create-order", { body: { planId } });
    if (error) {
      let msg = "Could not start payment.";
      try { const b = await error.context.json(); msg = b.error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const options = {
      key: data.keyId, amount: data.amount, currency: data.currency,
      name: "SSC With Jagrat", description: data.planLabel, order_id: data.orderId,
      handler: async function (response) {
        btn.textContent = "Verifying payment...";
        const { error: ve } = await supabase.functions.invoke("verify-payment", {
          body: {
            orderId: response.razorpay_order_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
            planId,
          },
        });
        if (ve) {
          alert("Payment received but verification failed. Please contact support with payment ID: " + response.razorpay_payment_id);
          btn.disabled = false; btn.textContent = orig; return;
        }
        alert("🎉 Subscription activated! You now have full access.");
        await refresh();
      },
      modal: { ondismiss: function () { btn.disabled = false; btn.textContent = orig; } },
      theme: { color: "#4f46e5" },
    };
    const rzp = new Razorpay(options);
    rzp.open();
  } catch (e) {
    alert(e.message);
    btn.disabled = false; btn.textContent = orig;
  }
}

async function loadV50Profile(user, profile, sub){
  try {
    const [attRes, progRes, actRes, mistakeRes, rankRes] = await Promise.all([
      supabase.from("quiz_response_events").select("is_correct,answered,created_at").eq("user_id", user.id),
      supabase.from("progress").select("id,class_id,completed_at").eq("user_id", user.id),
      supabase.from("daily_activity").select("activity_date").eq("user_id", user.id).order("activity_date", {ascending:true}),
      supabase.from("quiz_mistakes").select("id,next_review_at").eq("user_id", user.id),
      supabase.rpc("get_leaderboard", {p_period:"all", p_limit:50})
    ]);
    const ev = attRes.data || [], prog = progRes.data || [], acts = actRes.data || [], mistakes = mistakeRes.data || [];
    const answered = ev.filter(x=>x.answered), correct = answered.filter(x=>x.is_correct).length;
    const accuracy = answered.length ? Math.round(correct/answered.length*100) : 0;
    const activeDays = new Set(acts.map(x=>x.activity_date)).size;
    const today = new Date(); today.setHours(0,0,0,0);
    const daySet = new Set(acts.map(x=>String(x.activity_date).slice(0,10)));
    let streak=0; for(let d=new Date(today);;d.setDate(d.getDate()-1)){const k=d.toISOString().slice(0,10);if(!daySet.has(k))break;streak++;}
    const xp = answered.length*10 + correct*5 + prog.length*50 + activeDays*20;
    const level = Math.max(1, Math.floor(xp/500)+1), levelBase=(level-1)*500, progress=Math.min(100,Math.round((xp-levelBase)/500*100));
    const me = (rankRes.data||[]).find(x=>x.is_me);
    const due = mistakes.filter(x=>!x.next_review_at || new Date(x.next_review_at)<=new Date()).length;
    const name=String(profile?.display_name||user.user_metadata?.display_name||user.user_metadata?.full_name||"Student").trim()||"Student";
    const avatar=profile?.avatar_url;
    $("v50DisplayName").textContent=name;
    $("v50Avatar").innerHTML=avatar?`<img src="${esc(avatar)}" alt="${esc(name)}">`:`<span>${name.charAt(0).toUpperCase()}</span>`;
    $("v50ExamLine").textContent=`${profile?.exam_target||"SSC Aspirant"} • ${profile?.study_goal||"Build a strong preparation"}`;
    $("v50JoinedLine").textContent=`${user.email||"Student account"} • ${activeDays} study day${activeDays===1?"":"s"}`;
    $("v50Level").textContent=level; $("v50XpText").textContent=`${xp.toLocaleString("en-IN")} XP`;
    $("v50LevelBar").style.width=progress+"%";
    $("v50ProBadge").textContent=sub?"PRO":"FREE"; $("v50ProBadge").classList.toggle("pro",!!sub);
    $("v50Streak").textContent=streak; $("v50Questions").textContent=answered.length.toLocaleString("en-IN"); $("v50Accuracy").textContent=accuracy+"%";
    $("v50Rank").textContent=me?.rank_no?`#${me.rank_no}`:"—"; $("v50Classes").textContent=prog.length; $("v50Mistakes").textContent=due;
    const journey=[
      ["🎯","Exam target",profile?.exam_target||"Not set",profile?.exam_target?"Your current goal is saved":"Complete your profile above"],
      ["🔥","Consistency",`${streak} day streak`,streak>=7?"Excellent consistency":"Keep a daily study habit"],
      ["📈","Accuracy",`${accuracy}% overall`,accuracy>=80?"Strong performance":"Use Smart Revision to improve"],
      ["🧠","Questions",`${answered.length} solved`,answered.length>=100?"Great practice volume":"Build your question-solving base"]
    ];
    $("v50Journey").innerHTML=journey.map(x=>`<div class="v50-journey-item"><span>${x[0]}</span><div><b>${esc(x[1])}</b><strong>${esc(x[2])}</strong><small>${esc(x[3])}</small></div></div>`).join("");
    const badges=[
      [answered.length>=10,"🎯","First 10","Solve 10 questions"],[answered.length>=100,"⚡","Century","Solve 100 questions"],[streak>=7,"🔥","7-Day Streak","Study for 7 days"],[accuracy>=80&&answered.length>=20,"🏆","Accuracy Pro","Reach 80% accuracy"],[prog.length>=5,"📚","Course Starter","Complete 5 classes"],[due>=10,"🔁","Revision Ready","Build your revision queue"]
    ];
    $("v50Badges").innerHTML=badges.map(b=>`<div class="v50-badge-card ${b[0]?"earned":"locked"}"><span>${b[0]?b[1]:"🔒"}</span><div><b>${b[2]}</b><small>${b[3]}</small></div></div>`).join("");
  } catch(e){ console.warn("V50 profile intelligence skipped",e); }
}

async function refresh() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    authSection.classList.remove("hidden");
    accountSection.classList.add("hidden");
    return;
  }
  authSection.classList.add("hidden");
  accountSection.classList.remove("hidden");
  $("#userEmail").textContent = session.user.email;

  // Keep the leaderboard profile in sync with signup metadata, then render the profile editor.
  const signupName = String(session.user.user_metadata?.display_name || session.user.user_metadata?.full_name || "").trim();
  let profile = await loadProfile(session.user);
  if (!profile && signupName) {
    await supabase.from("profiles").upsert({ user_id: session.user.id, display_name: signupName });
    profile = { display_name: signupName };
  } else if (profile && !profile.display_name && signupName) {
    await supabase.from("profiles").upsert({ user_id: session.user.id, display_name: signupName });
    profile.display_name = signupName;
  }
  renderProfile(profile || {}, session.user);

  const sub = await loadSubscription();
  await loadV50Profile(session.user, profile || {}, sub);
  const ent = await loadEntitlements();
  const statusBox = $("#subStatus");
  statusBox.innerHTML = `<div class="sub-none">🎉 All content is currently FREE — no paid subscription is required to access classes and learning features.</div>`;
}

refresh();

// If opened via the hamburger menu with ?tab=signup or ?tab=login, pre-select that tab.
const initialTab = new URLSearchParams(location.search).get("tab");
if (initialTab === "signup") tabSignup.click();
else if (initialTab === "login") tabLogin.click();
