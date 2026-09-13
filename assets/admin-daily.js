import { supabase } from "./supabase.js";

const $ = s => document.querySelector(s);
const form = $("#dailyForm");
const msg = $("#dailyFormMsg");
const listBox = $("#dailyAdminList");

function esc(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

// Default the date field to today for convenience.
(function initDate() {
  const el = $("#dUpdateDate");
  if (el && !el.value) {
    const now = new Date();
    el.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
})();

async function loadList() {
  listBox.innerHTML = `<div class="empty">Loading...</div>`;
  const { data, error } = await supabase.from("daily_updates").select("*").order("update_date", { ascending: false }).limit(100);
  if (error) { listBox.innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  if (!data || !data.length) { listBox.innerHTML = `<div class="empty">No updates yet.</div>`; return; }

  listBox.innerHTML = data.map(u => `
    <div class="admin-row">
      <div>
        <b>${esc(u.title)}</b>
        <span>${esc(u.body).slice(0, 120)}${u.body.length > 120 ? "…" : ""}</span>
        <small>${u.update_date} • ${u.published ? "Published" : "Hidden"}</small>
      </div>
      <div><button class="danger del-update" data-id="${u.id}">Delete</button></div>
    </div>
  `).join("");

  listBox.querySelectorAll(".del-update").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this update?")) return;
    const { error } = await supabase.from("daily_updates").delete().eq("id", b.dataset.id);
    if (error) alert(error.message); else loadList();
  });
}

form.onsubmit = async (e) => {
  e.preventDefault();
  msg.textContent = "Saving...";
  try {
    const row = {
      title: $("#dTitle").value.trim(),
      body: $("#dBody").value.trim(),
      update_date: $("#dUpdateDate").value,
      published: $("#dPublished").checked,
    };
    const { error } = await supabase.from("daily_updates").insert(row);
    if (error) throw error;
    msg.textContent = "Update posted.";
    form.reset();
    $("#dPublished").checked = true;
    initDateAgain();
    loadList();
  } catch (err) {
    msg.textContent = err.message;
  }
};

function initDateAgain() {
  const el = $("#dUpdateDate");
  const now = new Date();
  el.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

loadList();
