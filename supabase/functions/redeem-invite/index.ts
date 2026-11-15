import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
async function sha(v:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v.trim().toUpperCase()));return [...new Uint8Array(b)].map(n=>n.toString(16).padStart(2,"0")).join("");}
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return out({error:"POST required"},405);
const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,auth=req.headers.get("Authorization");if(!auth)return out({error:"Sign in first"},401);
const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}),{data:{user}}=await userClient.auth.getUser();if(!user)return out({error:"Invalid session"},401);
let body:any;try{body=await req.json()}catch{return out({error:"Invalid request"},400)}if(typeof body.code!=="string"||body.code.length<8||body.code.length>64)return out({error:"Invalid invitation code"},400);
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),hash=await sha(body.code);
const {data:found,error}=await admin.from("care_invites").select("id,profile_id,role,invited_email").eq("code_hash",hash).is("redeemed_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
if(error||!found)return out({error:"Invitation is invalid, expired or already used"},404);
if(found.invited_email&&found.invited_email.toLowerCase()!==user.email?.toLowerCase())return out({error:"This invitation belongs to another email address"},403);
const {data:claimed}=await admin.from("care_invites").update({redeemed_at:new Date().toISOString()}).eq("id",found.id).is("redeemed_at",null).select("id").maybeSingle();if(!claimed)return out({error:"Invitation was already redeemed"},409);
const {error:insertError}=await admin.from("care_members").upsert({profile_id:found.profile_id,user_id:user.id,role:found.role,status:"active"},{onConflict:"profile_id,user_id"});if(insertError)return out({error:"Could not create care membership; contact the administrator"},500);
return out({ok:true,profile_id:found.profile_id,role:found.role});});