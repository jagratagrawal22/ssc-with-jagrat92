import { supabase } from "./supabase.js";

// Wires up the #bookmarkBtn (present on class.html) for the given class.
// Hidden entirely for logged-out users; safe no-op if the button isn't present.
export async function setupBookmarkButton(classId) {
  const btn = document.querySelector("#bookmarkBtn");
  if (!btn) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { btn.classList.add("hidden"); return; }

  const { data: existing } = await supabase.from("bookmarks").select("id")
    .eq("user_id", user.id).eq("class_id", classId).maybeSingle();
  let saved = !!existing;
  const render = () => {
    btn.textContent = saved ? "🔖 Saved" : "🔖 Save for Later";
    btn.classList.toggle("saved", saved);
  };
  render();
  btn.classList.remove("hidden");

  btn.onclick = async () => {
    btn.disabled = true;
    try {
      if (saved) {
        const { error } = await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("class_id", classId);
        if (error) throw error;
        saved = false;
      } else {
        const { error } = await supabase.from("bookmarks").insert({ user_id: user.id, class_id: classId });
        if (error) throw error;
        saved = true;
      }
      render();
    } catch (e) {
      console.error("Bookmark update failed:", e);
    } finally {
      btn.disabled = false;
    }
  };
}
