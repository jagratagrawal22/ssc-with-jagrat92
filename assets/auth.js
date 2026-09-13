import { supabase } from "./supabase.js";
const form=document.querySelector("#loginForm"), msg=document.querySelector("#msg");
const {data:{session}}=await supabase.auth.getSession();
if(session) location.href="admin.html";
form.addEventListener("submit",async e=>{
 e.preventDefault(); msg.textContent="Signing in...";
 const {error}=await supabase.auth.signInWithPassword({email:email.value.trim(),password:password.value});
 if(error) msg.textContent=error.message; else location.href="admin.html";
});
