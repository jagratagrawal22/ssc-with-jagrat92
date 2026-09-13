import { supabase } from "./supabase.js";

// Records today's date (in the user's local timezone) as an activity day
// for streak tracking. Safe no-op if it already exists (PK conflict) or
// if the user isn't logged in. Called from progress/quiz actions only —
// never blocks or delays the calling code.
export async function recordActivityToday(userId) {
  if (!userId) return;
  try {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await supabase.from("daily_activity").upsert({ user_id: userId, activity_date: dateStr }, { onConflict: "user_id,activity_date" });
  } catch (e) {
    console.error("Could not record daily activity:", e);
  }
}

// Computes the user's current streak (consecutive days up to and
// including today or yesterday — a streak "survives" until a full day
// is missed) from their daily_activity rows.
export async function getCurrentStreak(userId) {
  if (!userId) return 0;
  const { data, error } = await supabase.from("daily_activity")
    .select("activity_date").eq("user_id", userId).order("activity_date", { ascending: false });
  if (error || !data || !data.length) return 0;

  const days = new Set(data.map(d => d.activity_date));
  let streak = 0;
  let cursor = new Date();
  // Allow the streak to still show as "alive" if today has no activity
  // yet but yesterday did — otherwise it'd zero out the moment the clock
  // ticks past midnight before the user studies.
  const cursorStr = () => `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
  if (!days.has(cursorStr())) cursor.setDate(cursor.getDate() - 1);

  while (days.has(cursorStr())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
