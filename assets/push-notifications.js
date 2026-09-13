import { supabase } from './supabase.js';

const VAPID_PUBLIC_KEY = window.SSC_VAPID_PUBLIC_KEY || '';
const state = { sw:null, subscription:null };

function base64ToUint8Array(base64){ const pad='='.repeat((4-base64.length%4)%4); const raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/')); return Uint8Array.from([...raw].map(c=>c.charCodeAt(0))); }
export async function registerPush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return {ok:false,message:'Push notifications are not supported on this browser.'};
  if(!VAPID_PUBLIC_KEY) return {ok:false,message:'Push service is not configured yet. Add the VAPID public key to assets/push-config.js.'};
  const {data:{session}}=await supabase.auth.getSession(); if(!session) return {ok:false,message:'Please login first.'};
  const permission=await Notification.requestPermission(); if(permission!=='granted') return {ok:false,message:'Notification permission was not granted.'};
  state.sw=await navigator.serviceWorker.ready;
  state.subscription=await state.sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8Array(VAPID_PUBLIC_KEY)});
  const json=state.subscription.toJSON();
  await supabase.rpc('save_push_subscription',{p_endpoint:json.endpoint,p_p256dh:json.keys.p256dh,p_auth:json.keys.auth,p_device_label:navigator.userAgent.includes('Android')?'Android':'Web',p_user_agent:navigator.userAgent});
  return {ok:true,message:'Push notifications enabled on this device.'};
}
export async function disablePush(){
  const sub=state.subscription || await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if(!sub) return {ok:true,message:'No push subscription found.'};
  await supabase.rpc('delete_push_subscription',{p_endpoint:sub.endpoint}); await sub.unsubscribe(); state.subscription=null; return {ok:true,message:'Push notifications disabled on this device.'};
}
export async function savePreferences(values){
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  return supabase.rpc('save_notification_preferences',{...values,p_timezone:timezone});
}
export async function getPreferences(){ return supabase.rpc('get_notification_preferences'); }
