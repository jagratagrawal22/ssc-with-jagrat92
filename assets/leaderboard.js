import { supabase } from "./supabase.js";

const listBox = document.querySelector("#lbList");
const myRankBox = document.querySelector("#lbMyRank");
const nameCard = document.querySelector("#myNameCard");
const nameForm = document.querySelector("#nameForm");
const nameInput = document.querySelector("#displayNameInput");
const nameMsg = document.querySelector("#nameMsg");
const tabs = [...document.querySelectorAll(".lb-tab")];
let currentPeriod = "all";

function esc(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}
const MEDALS = ["🥇", "🥈", "🥉"];

function avatar(row) {
  return row.avatar_url
    ? `<img class="lb-avatar" src="${esc(row.avatar_url)}" alt="" loading="lazy">`
    : `<span class="lb-avatar lb-avatar-placeholder">👤</span>`;
}

function periodLabel() {
  return currentPeriod === "week" ? "last 7 days" : currentPeriod === "month" ? "last 30 days" : "all-time";
}

async function loadLeaderboard() {
  listBox.innerHTML = `<div class="empty">Loading ${esc(periodLabel())} leaderboard...</div>`;
  myRankBox.classList.add("hidden");

  const { data, error } = await supabase.rpc("get_leaderboard", { p_period: currentPeriod, p_limit: 50 });
  if (error) {
    listBox.innerHTML = `<div class="empty">Unable to load leaderboard. Please run the v30 SQL migration first.</div>`;
    console.error(error);
    return;
  }
  if (!data || !data.length) {
    listBox.innerHTML = `<div class="empty">No quiz attempts in this period — be the first to take a quiz!</div>`;
    return;
  }

  const me = data.find(row => row.is_me);
  if (me) {
    myRankBox.classList.remove("hidden");
    myRankBox.innerHTML = `<div><span>Your Rank</span><strong>#${me.rank_no}</strong></div><div><span>Score</span><strong>${Number(me.total_score || 0)} pts</strong></div><div><span>Streak</span><strong>🔥 ${Number(me.current_streak || 0)}</strong></div>`;
  }

  listBox.innerHTML = `<div class="lb-rows">${data.map(row => `
    <div class="lb-row ${row.is_me ? "lb-me" : ""}">
      <span class="lb-rank">${MEDALS[row.rank_no - 1] || `#${row.rank_no}`}</span>
      ${avatar(row)}
      <span class="lb-name">${esc(row.display_name)}${row.is_me ? ` <em>You</em>` : ""}</span>
      <span class="lb-meta">${Number(row.quizzes_taken || 0)} quiz${Number(row.quizzes_taken || 0) === 1 ? "" : "zes"} • 🔥 ${Number(row.current_streak || 0)} day streak</span>
      <span class="lb-score">${Number(row.total_score || 0)} pts</span>
    </div>`).join("")}</div>`;
}

async function setupNameForm() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  nameCard.classList.remove("hidden");
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  if (profile?.display_name) nameInput.value = profile.display_name;

  nameForm.onsubmit = async (e) => {
    e.preventDefault();
    nameMsg.textContent = "Saving...";
    const name = nameInput.value.trim() || null;
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, display_name: name });
    if (error) { nameMsg.textContent = error.message; return; }
    nameMsg.textContent = "Saved!";
    loadLeaderboard();
  };
}

tabs.forEach(tab => tab.addEventListener("click", () => {
  currentPeriod = tab.dataset.period;
  tabs.forEach(t => t.classList.toggle("active", t === tab));
  loadLeaderboard();
}));

loadLeaderboard();
setupNameForm();
