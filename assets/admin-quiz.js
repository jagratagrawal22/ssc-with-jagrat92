import { supabase } from "./supabase.js";

const $ = s => document.querySelector(s);
const panel = $("#quizPanel");
const listBox = $("#quizQuestionList");
const form = $("#quizQForm");
const msg = $("#quizFormMsg");
let currentClassId = null;

function esc(v = "") {
  return String(v).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function resetQuestionForm() {
  form.reset();
  $("#quizEditId").value = "";
  $("#quizFormTitle").textContent = "Add Question";
  $("#quizSaveBtn").textContent = "ADD QUESTION";
  msg.textContent = "";
}

function editQuestion(q) {
  $("#quizEditId").value = q.id;
  $("#qText").value = q.question || "";
  $("#qA").value = q.option_a || "";
  $("#qB").value = q.option_b || "";
  $("#qC").value = q.option_c || "";
  $("#qD").value = q.option_d || "";
  $("#qCorrect").value = q.correct_option || "a";
  $("#qExplain").value = q.explanation || "";
  $("#qTopic").value = q.topic || "";
  $("#qDifficulty").value = q.difficulty || "medium";
  $("#qIsPyq").checked = !!q.is_pyq;
  $("#qPyqYear").value = q.pyq_year || "";
  $("#qPyqTier").value = q.pyq_tier || "";
  $("#quizFormTitle").textContent = "Edit Question";
  $("#quizSaveBtn").textContent = "SAVE CHANGES";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadQuestions() {
  if (!currentClassId) return;
  listBox.innerHTML = `<div class="empty">Loading questions...</div>`;
  const { data, error } = await supabase.from("quiz_questions").select("*").eq("class_id", currentClassId).order("sort_order").order("created_at");
  if (error) {
    listBox.innerHTML = `<div class="empty">Unable to load quiz questions: ${esc(error.message)}<br><small>Make sure the v13 security SQL migration has been run in Supabase and you are logged in with the admin account.</small></div>`;
    return;
  }
  if (!data || !data.length) { listBox.innerHTML = `<div class="empty">No questions yet — add one below.</div>`; return; }

  listBox.innerHTML = data.map((q, i) => `
    <div class="admin-row">
      <div>
        <b>Q${i + 1}. ${esc(q.question)}</b>
        <span>A) ${esc(q.option_a)} &nbsp; B) ${esc(q.option_b)} &nbsp; C) ${esc(q.option_c)} &nbsp; D) ${esc(q.option_d)}</span>
        <small>Correct: ${String(q.correct_option || "").toUpperCase()} • ${esc(q.difficulty || "medium")}${q.topic ? " • " + esc(q.topic) : ""}${q.is_pyq ? " • PYQ" + (q.pyq_year ? " " + esc(q.pyq_year) : "") : ""}${q.explanation ? " • " + esc(q.explanation) : ""}</small>
      </div>
      <div class="quiz-admin-actions">
        <button class="outline edit-q" data-index="${i}">Edit</button>
        <button class="outline move-q" data-dir="up" data-index="${i}" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="outline move-q" data-dir="down" data-index="${i}" ${i === data.length - 1 ? "disabled" : ""}>↓</button>
        <button class="danger del-q" data-id="${q.id}">Delete</button>
      </div>
    </div>
  `).join("");

  listBox.querySelectorAll(".edit-q").forEach(b => b.onclick = () => editQuestion(data[Number(b.dataset.index)]));

  listBox.querySelectorAll(".move-q").forEach(b => b.onclick = async () => {
    const i = Number(b.dataset.index);
    const dir = b.dataset.dir === "up" ? -1 : 1;
    const j = i + dir;
    if (j < 0 || j >= data.length) return;
    b.disabled = true;
    try {
      // Renumber the complete list after moving the selected question. This
      // also repairs any old duplicate sort_order values created by v10.
      const reordered = [...data];
      const [moved] = reordered.splice(i, 1);
      reordered.splice(j, 0, moved);

      // First move all rows out of the normal range, then assign 0..n-1.
      for (let k = 0; k < reordered.length; k++) {
        const r = await supabase.from("quiz_questions").update({ sort_order: -(k + 1) }).eq("id", reordered[k].id);
        if (r.error) throw r.error;
      }
      for (let k = 0; k < reordered.length; k++) {
        const r = await supabase.from("quiz_questions").update({ sort_order: k }).eq("id", reordered[k].id);
        if (r.error) throw r.error;
      }
      await loadQuestions();
    } catch (e) {
      alert(e.message);
      loadQuestions();
    }
  });

  listBox.querySelectorAll(".del-q").forEach(b => b.onclick = async () => {
    if (!confirm("Delete this question?")) return;
    const { error } = await supabase.from("quiz_questions").delete().eq("id", b.dataset.id);
    if (error) alert(error.message); else { resetQuestionForm(); loadQuestions(); }
  });
}

window.addEventListener("open-quiz-panel", (e) => {
  currentClassId = e.detail.classId;
  $("#quizPanelTitle").textContent = `Manage Quiz — ${e.detail.title}`;
  panel.classList.remove("hidden");
  panel.scrollIntoView({ behavior: "smooth" });
  resetQuestionForm();
  loadQuestions();
});

$("#closeQuizPanel").onclick = () => { panel.classList.add("hidden"); currentClassId = null; resetQuestionForm(); };

form.onsubmit = async (e) => {
  e.preventDefault();
  if (!currentClassId) return;
  msg.textContent = "Saving...";
  try {
    const editId = $("#quizEditId").value;
    const row = {
      class_id: currentClassId,
      question: $("#qText").value.trim(),
      option_a: $("#qA").value.trim(),
      option_b: $("#qB").value.trim(),
      option_c: $("#qC").value.trim(),
      option_d: $("#qD").value.trim(),
      correct_option: $("#qCorrect").value,
      explanation: $("#qExplain").value.trim() || null,
      topic: $("#qTopic").value.trim() || null,
      difficulty: $("#qDifficulty").value,
      is_pyq: $("#qIsPyq").checked,
      pyq_year: $("#qPyqYear").value ? Number($("#qPyqYear").value) : null,
      pyq_tier: $("#qPyqTier").value.trim() || null,
    };

    if (editId) {
      const { error } = await supabase.from("quiz_questions").update(row).eq("id", editId);
      if (error) throw error;
      msg.textContent = "Question updated.";
    } else {
      const { data: existing } = await supabase.from("quiz_questions").select("sort_order").eq("class_id", currentClassId).order("sort_order", { ascending: false }).limit(1);
      row.sort_order = existing?.length ? Number(existing[0].sort_order || 0) + 1 : 0;
      const { error } = await supabase.from("quiz_questions").insert(row);
      if (error) throw error;
      msg.textContent = "Question added.";
    }
    resetQuestionForm();
    loadQuestions();
  } catch (err) {
    msg.textContent = err.message;
  }
};

// Optional global helper for the admin launcher and browser navigation.
window.openQuizManagerForClass = (classId, title) => {
  window.dispatchEvent(new CustomEvent("open-quiz-panel", { detail: { classId, title } }));
};
