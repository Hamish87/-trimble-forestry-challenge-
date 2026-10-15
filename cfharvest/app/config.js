/* CFHarvest replica · backend configuration for the Supabase plan store (store.js, db/README.md).
   Empty values = the replica stays on its local session store (sessionStorage), which is what the Vercel deployment uses.
   To use a database: fill in the project URL and the PUBLISHABLE key (Supabase → Project Settings → API keys: the
   "sb_publishable_…" key, or the legacy "anon" key). NEVER put a service_role / secret key here: this file is served to
   every browser. Then open the replica with ?store=supabase (or set localStorage['cfharvest-store']='supabase').
   tenantId: the company row the replica works on; empty = the seed's demo tenant md5('cfh-demo:company')::uuid. */
'use strict';
const CFH_CONFIG={
  supabaseUrl:'',        // e.g. 'https://<project-ref>.supabase.co'
  publishableKey:'',     // e.g. 'sb_publishable_…' (public by design; RLS is off in the demo, so use demo data only)
  schema:'cfharvest',
  tenantId:''
};
if(typeof module!=='undefined')module.exports=CFH_CONFIG;
