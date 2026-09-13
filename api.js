(function(){
  const cfg = window.YBZ_CONFIG || {};

  function configured(){
    return cfg.SUPABASE_URL &&
      cfg.SUPABASE_ANON_KEY &&
      !cfg.SUPABASE_URL.includes("PASTE_") &&
      !cfg.SUPABASE_ANON_KEY.includes("PASTE_");
  }

  async function rpc(fn, body={}){
    if(!configured()) throw new Error("Supabase ещё не настроен. Заполните config.js");
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/${fn}`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":cfg.SUPABASE_ANON_KEY,
        "Authorization":`Bearer ${cfg.SUPABASE_ANON_KEY}`
      },
      body:JSON.stringify(body)
    });
    const txt = await res.text();
    let data = null;
    try{ data = txt ? JSON.parse(txt) : null; }catch{ data = txt; }
    if(!res.ok){
      const msg = (data && (data.message || data.error || data.hint)) || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }


  async function edge(fn, body={}){
    if(!configured()) throw new Error("Supabase ещё не настроен.");
    const base = String(cfg.SUPABASE_URL).replace(/\/+$/,'');
    const res = await fetch(`${base}/functions/v1/${fn}`,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":cfg.SUPABASE_ANON_KEY
      },
      body:JSON.stringify(body)
    });
    const txt = await res.text();
    let data = null;
    try{ data = txt ? JSON.parse(txt) : null; }catch{ data = txt; }
    if(!res.ok){
      const msg =
        (data && typeof data === "object" && (data.error || data.message || data.hint)) ||
        (typeof data === "string" && data) ||
        `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function newOwnerKey(){
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return [...arr].map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function getOwnerKey(){
    const qs = new URLSearchParams(location.search);
    const fromUrl = qs.get("key");
    if(fromUrl && /^[a-f0-9]{64}$/i.test(fromUrl)){
      localStorage.setItem("ybz_owner_key", fromUrl);
      return fromUrl;
    }
    let key = localStorage.getItem("ybz_owner_key");
    if(!key){
      key = newOwnerKey();
      localStorage.setItem("ybz_owner_key", key);
    }
    return key;
  }

  function fmt(n){ return new Intl.NumberFormat("ru-RU").format(Number(n||0)); }
  function esc(s){
    return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  }

  window.YBZ = {rpc,edge,getOwnerKey,fmt,esc,configured};
})();
