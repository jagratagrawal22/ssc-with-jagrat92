import { supabase } from "./supabase.js";
const $=s=>document.querySelector(s), form=$("#classForm"), msg=$("#formMsg");
let subjects=[], classes=[];
async function guard(){const {data:{session}}=await supabase.auth.getSession();if(!session){location.href="login.html";return false}if((session.user.email||"").toLowerCase()!=="jalajsinghal04@gmail.com"){await supabase.auth.signOut();alert("Admin access is restricted.");location.href="login.html";return false}return true}
function ext(file){return file.name.toLowerCase().endsWith(".pdf")}
function isVideoFile(file){return /\.(mp4|webm|ogg|ogv|mov)$/i.test(file.name)}
async function upload(file,folder){if(!file)return null;if(!ext(file)){throw Error("Only PDF files are allowed.")}const path=`${folder}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error}=await supabase.storage.from("materials").upload(path,file,{contentType:"application/pdf"});if(error)throw error;return supabase.storage.from("materials").getPublicUrl(path).data.publicUrl}
async function uploadVideo(file,batch="4.0"){if(!file)return null;if(!isVideoFile(file)){throw Error("Only video files are allowed (mp4, webm, ogg, mov).")}const path=`${batch}/class-videos/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const {error}=await supabase.storage.from("videos").upload(path,file,{contentType:file.type||"video/mp4"});if(error)throw error;return supabase.storage.from("videos").getPublicUrl(path).data.publicUrl}
function fileNameFromUrl(url){if(!url)return "";try{return decodeURIComponent(url.split("/").pop().replace(/^[0-9a-f-]{36}-/i,""))}catch(_){return url}}
function updateVideoSourceUI(){
  const upload=$("#srcUpload").checked, stream=$("#srcStream").checked;
  $("#videoUrlWrap").classList.toggle("hidden",upload||stream);
  $("#videoStreamWrap").classList.toggle("hidden",!stream);
  $("#videoUploadWrap").classList.toggle("hidden",!upload);
}
$("#srcYoutube").onchange=updateVideoSourceUI;$("#srcStream").onchange=updateVideoSourceUI;$("#srcUpload").onchange=updateVideoSourceUI;
function updateEraUI(){const s=subjects.find(x=>x.id===$("#subject").value);const isHistory=(s?.name||"").trim().toLowerCase()==="history";$("#eraWrap").classList.toggle("hidden",!isHistory);if(!isHistory)$("#era").value=""}
async function load(){if(!await guard())return;const [a,b]=await Promise.all([supabase.from("subjects").select("*").order("sort_order"),supabase.from("classes").select("*").order("created_at",{ascending:false})]);if(a.error||b.error){msg.textContent="Database error. Run database.sql and check config.js.";return}subjects=a.data||[];classes=b.data||[];$("#subject").innerHTML=subjects.map(s=>`<option value="${s.id}">${s.icon||"📚"} ${s.name}</option>`).join("");render();stats();updateEraUI()}
$("#subject").addEventListener("change",updateEraUI);
function stats(){$("#sSubjects").textContent=subjects.length;$("#sClasses").textContent=classes.length;$("#sPdfs").textContent=classes.filter(c=>c.practice_url||c.notes_url).length}
function openQuizForClass(id){
  const c=classes.find(x=>x.id===id);
  if(!c){$("#quizLauncherMsg").textContent="Please select a valid class.";return;}
  $("#quizClassSelect").value=c.id;
  window.dispatchEvent(new CustomEvent("open-quiz-panel",{detail:{classId:c.id,title:c.title||`Class ${c.class_no}`}}));
}
function refreshQuizClassSelect(){
  const sel=$("#quizClassSelect");
  if(!sel)return;
  const previous=sel.value;
  sel.innerHTML='<option value="">Select a class...</option>'+classes.map(c=>{
    const s=subjects.find(x=>x.id===c.subject_id)||{};
    return `<option value="${c.id}">${s.name||"Subject"} • Class ${c.class_no} — ${c.title||"Untitled"}</option>`;
  }).join("");
  if(classes.some(c=>c.id===previous))sel.value=previous;
}
function render(){
  const q=($("#adminSearch").value||"").toLowerCase();
  $("#adminList").innerHTML=classes.filter(c=>(c.title||"").toLowerCase().includes(q)).map(c=>{
    const s=subjects.find(x=>x.id===c.subject_id)||{};
    const safeTitle=String(c.title||`Class ${c.class_no}`).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    return `<div class="admin-row"><div><b>${s.icon||"📚"} ${s.name||"Subject"} • Class ${c.class_no} • Batch ${escAdmin(c.batch||"4.0")}</b><span>${safeTitle}</span><small>${c.published?"Published":"Hidden"}</small></div><div><button class="edit" data-id="${c.id}">Edit</button><button class="quiz" data-id="${c.id}" data-title="${safeTitle}">Manage Quiz</button><button class="danger del" data-id="${c.id}">Delete</button></div></div>`;
  }).join("")||"<div class='empty'>No classes yet.</div>";
  document.querySelectorAll(".edit").forEach(b=>b.onclick=()=>edit(b.dataset.id));
  document.querySelectorAll(".del").forEach(b=>b.onclick=()=>del(b.dataset.id));
  document.querySelectorAll(".quiz").forEach(b=>b.onclick=()=>openQuizForClass(b.dataset.id));
  refreshQuizClassSelect();
}

function edit(id){const c=classes.find(x=>x.id===id);if(!c)return;$("#editId").value=c.id;$("#batch").value=c.batch||"4.0";$("#subject").value=c.subject_id;$("#classNo").value=c.class_no;$("#title").value=c.title;$("#videoUrl").value=c.video_url||"";$("#videoStreamUrl").value=c.video_stream_url||"";$("#videoFile").value="";$("#mockUrl").value=c.mock_url||"";$("#thumb").value=c.thumbnail_url||"";$("#published").checked=c.published;updateEraUI();$("#era").value=c.era||"";
if(c.video_stream_url){$("#srcStream").checked=true;$("#currentVideoFile").textContent=""}
else if(c.video_file_url){$("#srcUpload").checked=true;$("#currentVideoFile").textContent=`Current file: ${fileNameFromUrl(c.video_file_url)} (choose a new file to replace it)`}
else{$("#srcYoutube").checked=true;$("#currentVideoFile").textContent=""}
updateVideoSourceUI();
$("#formTitle").textContent="Edit Class";$("#cancelEdit").classList.remove("hidden");scrollTo({top:0,behavior:"smooth"})}
async function del(id){if(!confirm("Delete this class?"))return;const {error}=await supabase.from("classes").delete().eq("id",id);if(error)alert(error.message);else load()}
form.onsubmit=async e=>{e.preventDefault();msg.textContent="Saving...";try{
  const id=$("#editId").value;const old=classes.find(c=>c.id===id);
  const practiceFile=$("#practice").files[0],notesFile=$("#notes").files[0],videoFile=$("#videoFile").files[0];
  const batch=$("#batch").value || "4.0";
  const practice=practiceFile?await upload(practiceFile,`${batch}/practice`):old?.practice_url||null;
  const notes=notesFile?await upload(notesFile,`${batch}/notes`):old?.notes_url||null;
  const useUpload=$("#srcUpload").checked, useStream=$("#srcStream").checked;
  let video_url=null, video_stream_url=null, video_file_url=null;
  if(useStream){
    video_stream_url=$("#videoStreamUrl").value.trim()||null;
    if(!video_stream_url) throw Error("Stream link is required when Stream Link is selected.");
  }else if(useUpload){
    msg.textContent=videoFile?"Uploading video... this can take a while for large files.":"Saving...";
    video_file_url=videoFile?await uploadVideo(videoFile,batch):(old?.video_file_url||null);
  }else{
    video_url=$("#videoUrl").value.trim()||null;
  }
  const row={batch,subject_id:$("#subject").value,class_no:$("#classNo").value.trim(),title:$("#title").value.trim(),video_url,video_stream_url,video_file_url,practice_url:practice,notes_url:notes,mock_url:$("#mockUrl").value.trim()||null,thumbnail_url:$("#thumb").value.trim()||null,published:$("#published").checked,era:$("#era").value||null};
  const res=id?await supabase.from("classes").update(row).eq("id",id):await supabase.from("classes").insert(row);
  if(res.error)throw res.error;
  msg.textContent="Saved successfully.";form.reset();$("#editId").value="";$("#published").checked=true;$("#srcYoutube").checked=true;$("#currentVideoFile").textContent="";updateVideoSourceUI();$("#formTitle").textContent="Add New Class";$("#cancelEdit").classList.add("hidden");await load();updateEraUI()
}catch(err){msg.textContent=err.message}}
$("#cancelEdit").onclick=()=>{form.reset();$("#editId").value="";$("#formTitle").textContent="Add New Class";$("#cancelEdit").classList.add("hidden");$("#published").checked=true;$("#srcYoutube").checked=true;$("#currentVideoFile").textContent="";updateVideoSourceUI();updateEraUI()};
$("#adminSearch").oninput=render;
$("#openQuizManager").onclick=()=>{
  const id=$("#quizClassSelect").value;
  if(!id){$("#quizLauncherMsg").textContent="Please select a class first.";return;}
  $("#quizLauncherMsg").textContent="";
  openQuizForClass(id);
};
function fillMindMapSubjects(){
  const sel=$("#mindMapSubject");
  if(!sel)return;
  sel.innerHTML=subjects.map(s=>`<option value="${s.id}">${escAdmin(s.icon||"📚")} ${escAdmin(s.name||"Subject")}</option>`).join("");
  loadMindMapCurrent();
}
function escAdmin(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
async function loadMindMapCurrent(){
  const batch=$("#mindMapBatch")?.value||"4.0", subjectId=$("#mindMapSubject")?.value;
  if(!subjectId)return;
  const {data,error}=await supabase.from("subject_batch_materials").select("mind_map_english_url,mind_map_hindi_url").eq("subject_id",subjectId).eq("batch",batch).maybeSingle();
  $("#currentMindMapEnglish").textContent=error?"":(data?.mind_map_english_url?"English PDF already uploaded — choose a new PDF to replace it.":"No English Mind Map uploaded yet.");
  $("#currentMindMapHindi").textContent=error?"":(data?.mind_map_hindi_url?"Hindi PDF already uploaded — choose a new PDF to replace it.":"No Hindi Mind Map uploaded yet.");
}
$("#mindMapBatch")?.addEventListener("change",loadMindMapCurrent);
$("#mindMapSubject")?.addEventListener("change",loadMindMapCurrent);
$("#mindMapForm")?.addEventListener("submit",async e=>{
 e.preventDefault(); const m=$("#mindMapMsg"), english=$("#mindMapEnglishFile").files[0], hindi=$("#mindMapHindiFile").files[0], batch=$("#mindMapBatch").value, subjectId=$("#mindMapSubject").value;
 m.textContent="Saving...";
 try{
   if(!english && !hindi) throw Error("Please select at least one PDF.");
   const row={batch,subject_id:subjectId,updated_at:new Date().toISOString()};
   if(english){ if(!english.name.toLowerCase().endsWith(".pdf")) throw Error("English Mind Map must be a PDF."); const path=`${batch}/mind-maps/${subjectId}/English-${crypto.randomUUID()}-${english.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`; const up=await supabase.storage.from("mind-maps").upload(path,english,{contentType:"application/pdf"}); if(up.error)throw up.error; row.mind_map_english_url=supabase.storage.from("mind-maps").getPublicUrl(path).data.publicUrl; }
   if(hindi){ if(!hindi.name.toLowerCase().endsWith(".pdf")) throw Error("Hindi Mind Map must be a PDF."); const path=`${batch}/mind-maps/${subjectId}/Hindi-${crypto.randomUUID()}-${hindi.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`; const up=await supabase.storage.from("mind-maps").upload(path,hindi,{contentType:"application/pdf"}); if(up.error)throw up.error; row.mind_map_hindi_url=supabase.storage.from("mind-maps").getPublicUrl(path).data.publicUrl; }
   const res=await supabase.from("subject_batch_materials").upsert(row,{onConflict:"batch,subject_id"});
   if(res.error)throw res.error; m.textContent="Mind Map PDFs saved successfully."; $("#mindMapEnglishFile").value=""; $("#mindMapHindiFile").value=""; await loadMindMapCurrent();
 }catch(err){m.textContent=err.message||"Unable to save Mind Map PDFs.";}
});

$("#logout").onclick=async()=>{await supabase.auth.signOut();location.href="login.html"};
load().then(fillMindMapSubjects);
