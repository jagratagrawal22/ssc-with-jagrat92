import { supabase } from "./supabase.js";

const form = document.querySelector("#resetForm");
const msg = document.querySelector("#resetMsg");

let recoverySession = null;

const { data: { session } } = await supabase.auth.getSession();
if (session) recoverySession = session;

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY" || session) recoverySession = session;
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = document.querySelector("#newPassword").value;
  const confirm = document.querySelector("#confirmPassword").value;

  if (password.length < 6) {
    msg.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (password !== confirm) {
    msg.textContent = "Passwords do not match.";
    return;
  }

  if (!recoverySession) {
    msg.textContent = "This reset link is invalid or has expired. Please request a new password reset link.";
    return;
  }

  msg.textContent = "Updating password...";
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    msg.textContent = error.message;
    return;
  }

  msg.textContent = "Password updated successfully. Redirecting to login...";
  await supabase.auth.signOut();
  setTimeout(() => { location.href = "account.html?tab=login"; }, 1200);
});
