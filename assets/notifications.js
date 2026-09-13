import { supabase } from './supabase.js';
export async function enableStudyNotifications(){
  if(!('Notification' in window)) return {ok:false,message:'Browser notifications are not supported here.'};
  const permission=await Notification.requestPermission();
  if(permission!=='granted') return {ok:false,message:'Notifications are blocked. You can enable them in browser settings.'};
  localStorage.setItem('ssc_jagrat_notifications','on');
  return {ok:true,message:'Study reminders enabled on this device.'};
}
export async function notifySmartReminders(){
  if(localStorage.getItem('ssc_jagrat_notifications')!=='on' || !('Notification' in window) || Notification.permission!=='granted') return;
  const {data}=await supabase.rpc('get_personalized_learning_path');
  const n=data?.next_action; if(!n) return;
  const key=`ssc_jagrat_last_notice_${new Date().toISOString().slice(0,10)}`;
  if(localStorage.getItem(key)===n.type) return;
  new Notification('SSC With Jagrat — Study Reminder',{body:n.title+' • '+(n.reason||'Keep your preparation moving.'),icon:'assets/icons/icon-192.png'});
  localStorage.setItem(key,n.type);
}
