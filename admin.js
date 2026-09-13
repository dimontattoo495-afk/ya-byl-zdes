(function(){
  const cfg = window.YBZ_CONFIG || {};
  const KEY = "ybz_admin_session";

  const $ = (id)=>document.getElementById(id);
  const esc = (s)=>String(s??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
  const fmt = (n)=>new Intl.NumberFormat("ru-RU").format(Number(n||0));
  const dateFmt = (s)=>s ? new Date(s).toLocaleString("ru-RU") : "—";

  function getSession(){
    try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); }
    catch { return null; }
  }
  function saveSession(s){ sessionStorage.setItem(KEY, JSON.stringify(s)); }
  function clearSession(){ sessionStorage.removeItem(KEY); }

  async function authLogin(email,password){
    const url=String(cfg.SUPABASE_URL).replace(/\/+$/,'') + "/auth/v1/token?grant_type=password";
    const res=await fetch(url,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":cfg.SUPABASE_ANON_KEY
      },
      body:JSON.stringify({email,password})
    });
    const data=await res.json();
    if(!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || "Не удалось войти");
    return data;
  }

  async function rpc(fn,body={}){
    const s=getSession();
    if(!s?.access_token) throw new Error("Сессия администратора отсутствует");

    const url=String(cfg.SUPABASE_URL).replace(/\/+$/,'') + `/rest/v1/rpc/${fn}`;
    const res=await fetch(url,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "apikey":cfg.SUPABASE_ANON_KEY,
        "Authorization":`Bearer ${s.access_token}`
      },
      body:JSON.stringify(body)
    });
    const txt=await res.text();
    let data=null;
    try{data=txt?JSON.parse(txt):null}catch{data=txt}
    if(!res.ok){
      if(res.status===401){ clearSession(); showLogin(); }
      throw new Error((data&&typeof data==="object"&&(data.message||data.error||data.hint)) || data || `HTTP ${res.status}`);
    }
    return data;
  }

  function showLogin(){
    $("loginBox").classList.remove("hidden");
    $("adminApp").classList.add("hidden");
    $("adminNav").classList.add("hidden");
  }
  function showApp(){
    $("loginBox").classList.add("hidden");
    $("adminApp").classList.remove("hidden");
    $("adminNav").classList.remove("hidden");
  }

  function msg(text,type="ok"){
    $("globalMsg").innerHTML=`<div class="notice ${type==="error"?"error":""}">${esc(text)}</div>`;
    setTimeout(()=>$("globalMsg").innerHTML="",3000);
  }

  async function verifyAdmin(){
    const r=await rpc("ybz_is_admin");
    if(r!==true) throw new Error("У этого пользователя нет прав администратора");
  }

  async function loadSummary(){
    const rows=await rpc("ybz_admin_summary");
    const s=Array.isArray(rows)?rows[0]:rows;
    $("sReal").textContent=fmt(s.real_published);
    $("sDemo").textContent=fmt(s.demo_published);
    $("sPending").textContent=fmt(s.pending_count);
    $("sHidden").textContent=fmt(s.hidden_count);
    $("sViews").textContent=fmt(s.total_views);
    $("sPayments").textContent=fmt(s.successful_payments);
    $("sRevenue").textContent=fmt(s.revenue_rub)+" ₽";
  }

  async function loadEntries(){
    const filter=$("entryFilter").value;
    const rows=await rpc("ybz_admin_entries",{p_filter:filter,p_limit:200,p_offset:0});
    $("entriesBody").innerHTML=(rows||[]).map(e=>{
      const type=e.is_demo ? `<span class="tag demo">ДЕМО</span>` : `<span class="tag ok">РЕАЛЬНАЯ</span>`;
      const statusClass=e.status==="pending"?"pending":(e.status==="published"?"ok":"");
      return `<tr>
        <td>${fmt(e.public_no)}</td>
        <td style="min-width:260px">${esc(e.message)}</td>
        <td>${esc(e.name||"Без имени")}${e.city?"<br><span class='muted'>"+esc(e.city)+"</span>":""}</td>
        <td>${type}<br><span class="muted">${esc(e.plan)}</span></td>
        <td><span class="tag ${statusClass}">${esc(e.status)}</span></td>
        <td>${esc(e.payment_status)}</td>
        <td>${fmt(e.price_rub)}</td>
        <td>${fmt(e.views)}</td>
        <td>${dateFmt(e.created_at)}</td>
        <td><div class="row-actions">
          ${e.status!=="published"?`<button data-action="publish" data-no="${e.public_no}">Опубликовать</button>`:""}
          ${e.status!=="hidden"?`<button data-action="hide" data-no="${e.public_no}">Скрыть</button>`:""}
          <button class="danger" data-action="delete" data-no="${e.public_no}">Удалить</button>
        </div></td>
      </tr>`;
    }).join("") || `<tr><td colspan="10">Нет записей</td></tr>`;
  }

  async function loadPayments(){
    const rows=await rpc("ybz_admin_payments",{p_limit:200,p_offset:0});
    $("paymentsBody").innerHTML=(rows||[]).map(p=>`<tr>
      <td style="max-width:260px;word-break:break-all">${esc(p.payment_id)}</td>
      <td>${p.public_no?fmt(p.public_no):"—"}</td>
      <td>${fmt(p.amount_rub)} ₽</td>
      <td>${esc(p.status)}</td>
      <td>${dateFmt(p.created_at)}</td>
    </tr>`).join("") || `<tr><td colspan="5">Платежей пока нет</td></tr>`;
  }

  async function refreshAll(){
    await Promise.all([loadSummary(),loadEntries(),loadPayments()]);
  }

  $("loginForm").addEventListener("submit",async(e)=>{
    e.preventDefault();
    const btn=e.submitter;
    const box=$("loginMsg");
    btn.disabled=true;
    box.innerHTML="";
    try{
      const s=await authLogin($("email").value.trim(),$("password").value);
      saveSession(s);
      await verifyAdmin();
      showApp();
      await refreshAll();
    }catch(err){
      clearSession();
      box.innerHTML=`<div class="notice error">${esc(err.message)}</div>`;
    }finally{
      btn.disabled=false;
    }
  });

  $("logoutBtn").addEventListener("click",()=>{ clearSession(); showLogin(); });

  $("refreshEntries").addEventListener("click",async()=>{try{await loadEntries();await loadSummary()}catch(e){msg(e.message,"error")}});
  $("refreshPayments").addEventListener("click",async()=>{try{await loadPayments();await loadSummary()}catch(e){msg(e.message,"error")}});
  $("entryFilter").addEventListener("change",async()=>{try{await loadEntries()}catch(e){msg(e.message,"error")}});

  $("entriesBody").addEventListener("click",async(e)=>{
    const btn=e.target.closest("button[data-action]");
    if(!btn)return;
    const no=Number(btn.dataset.no);
    const action=btn.dataset.action;
    try{
      if(action==="delete"){
        if(!confirm(`Удалить запись №${no}? Это действие необратимо.`))return;
        await rpc("ybz_admin_delete_entry",{p_public_no:no});
      }else{
        const status=action==="publish"?"published":"hidden";
        await rpc("ybz_admin_set_status",{p_public_no:no,p_status:status});
      }
      await Promise.all([loadEntries(),loadSummary(),loadPayments()]);
    }catch(err){msg(err.message,"error")}
  });

  $("deleteDemos").addEventListener("click",async()=>{
    if(!confirm("Удалить ВСЕ демонстрационные записи? Это действие необратимо."))return;
    try{
      const count=await rpc("ybz_admin_delete_all_demo");
      msg(`Удалено демо-записей: ${count}`);
      await Promise.all([loadEntries(),loadSummary()]);
    }catch(err){msg(err.message,"error")}
  });

  (async function init(){
    const s=getSession();
    if(!s?.access_token){ showLogin(); return; }
    try{
      await verifyAdmin();
      showApp();
      await refreshAll();
    }catch(err){
      clearSession();
      showLogin();
      $("loginMsg").innerHTML=`<div class="notice error">${esc(err.message)}</div>`;
    }
  })();
})();
