import { supabase } from "./supabase.js";

function esc(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

async function loadOverview() {
  const box = document.querySelector("#overviewStats");
  const { data, error } = await supabase.rpc("admin_overview_stats");
  if (error || !data || !data.length) {
    box.innerHTML = `<div class="empty">${error ? esc(error.message) : "No data yet."}</div>`;
    return;
  }
  const s = data[0];
  box.innerHTML = `
    <div><b>${s.total_users}</b><span>Total Users</span></div>
    <div><b>${s.active_subscribers}</b><span>Active Subscribers</span></div>
    <div><b>${s.total_completions}</b><span>Classes Completed</span></div>
    <div><b>${s.total_quiz_attempts}</b><span>Quiz Attempts</span></div>
    <div><b>${s.active_today}</b><span>Active Today</span></div>
  `;
}

async function loadEngagement() {
  const box = document.querySelector("#engagementList");
  const { data, error } = await supabase.rpc("admin_class_engagement");
  if (error) {
    box.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  if (!data || !data.length) {
    box.innerHTML = `<div class="empty">No classes yet.</div>`;
    return;
  }
  box.innerHTML = data.slice(0, 20).map(row => `
    <div class="admin-row">
      <div>
        <b>${esc(row.subject_name || "—")} • ${esc(row.title)}</b>
        <span>${row.completions} completions • ${row.quiz_takers} quiz takers</span>
        <small>Avg quiz score: ${row.avg_quiz_score_pct ? Number(row.avg_quiz_score_pct).toFixed(0) + "%" : "—"}</small>
      </div>
    </div>
  `).join("");
}

loadOverview();
loadEngagement();
