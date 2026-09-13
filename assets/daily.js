import { supabase } from "./supabase.js";

const listBox = document.querySelector("#dailyList");

function esc(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function formatDate(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

async function load() {
  const { data, error } = await supabase
    .from("daily_updates")
    .select("*")
    .eq("published", true)
    .order("update_date", { ascending: false })
    .limit(60);

  if (error) {
    listBox.innerHTML = `<div class="empty">Unable to load updates. Please refresh.</div>`;
    console.error(error);
    return;
  }
  if (!data || !data.length) {
    listBox.innerHTML = `<div class="empty">No updates posted yet — check back soon.</div>`;
    return;
  }

  // Group by date so multiple same-day updates sit under one heading.
  const byDate = {};
  for (const row of data) {
    (byDate[row.update_date] ||= []).push(row);
  }

  listBox.innerHTML = Object.keys(byDate).map(date => `
    <section class="daily-date-group">
      <h2 class="daily-date-heading">${formatDate(date)}</h2>
      ${byDate[date].map(u => `
        <article class="daily-card">
          <h3>${esc(u.title)}</h3>
          <p>${esc(u.body)}</p>
        </article>
      `).join("")}
    </section>
  `).join("");
}

load();
