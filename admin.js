(function(){
  const cfg=window.YBZ_CONFIG||{}, KEY="ybz_admin_session";
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const fmt=n=>new Intl.NumberFormat("ru-RU").format(Number(n||0));
  const dateFmt=s=>s?new Date(s).toLocaleString("ru-RU"):"—";
  const getSession=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch{return null}};
  const saveSession=s=>sessionStorage.setItem(KEY,JSON.stringify(s)); const clearSession=()=>sessionStorage.removeItem(KEY);

  async function authLogin(email,password){
    const res=await fetch(String(cfg.SUPABASE_URL).replace(/\/+$/,'')+"/auth/v1/token?grant_type=password",{
      method:"POST",headers:{"Content-Type":"application/json","apikey":cfg.SUPABASE_ANON_KEY},body:JSON.stringify({email,password})
    });
    const d=await res.json(); if(!res.ok)throw new Error(d?.msg||d?.message||d?.error_description||"Не удалось войти"); return d;
  }

  async function rpc(fn,body={}){
    const s=getSession(); if(!s?.access_token)throw new Error("Сессия администратора отсутствует");
    const res=await fetch(String(cfg.SUPABASE_URL).replace(/\/+$/,'')+`/rest/v1/rpc/${fn}`,{
      method:"POST",headers:{"Content-Type":"application/json","apikey":cfg.SUPABASE_ANON_KEY,"Authorization":`Bearer ${s.access_token}`},body:JSON.stringify(body)
    });
    const t=await res.text(); let d=null; try{d=t?JSON.parse(t):null}catch{d=t}
    if(!res.ok){if(res.status===401){clearSession();showLogin()}throw new Error((d&&typeof d==="object"&&(d.message||d.error||d.hint))||d||`HTTP ${res.status}`)}
    return d;
  }

  function showLogin(){$("loginBox").classList.remove("hidden");$("adminApp").classList.add("hidden");$("adminNav").classList.add("hidden")}
  function showApp(){$("loginBox").classList.add("hidden");$("adminApp").classList.remove("hidden");$("adminNav").classList.remove("hidden")}
  function msg(text,type="ok"){$("globalMsg").innerHTML=`<div class="notice ${type==="error"?"error":""}">${esc(text)}</div>`;setTimeout(()=>$("globalMsg").innerHTML="",3000)}
  async function verifyAdmin(){if(await rpc("ybz_is_admin")!==true)throw new Error("У пользователя нет прав администратора")}

  async function loadSummary(){
    const rows=await rpc("ybz_admin_summary"),s=Array.isArray(rows)?rows[0]:rows;
    $("sReal").textContent=fmt(s.real_published); $("sDemo").textContent=fmt(s.demo_published); $("sPending").textContent=fmt(s.pending_count);
    $("sHidden").textContent=fmt(s.hidden_count); $("sViews").textContent=fmt(s.total_views);
    $("sTestPayments").textContent=fmt(s.successful_test_payments); $("sTestRevenue").textContent=fmt(s.test_revenue_rub)+" ₽";
    $("sLivePayments").textContent=fmt(s.successful_live_payments); $("sLiveRevenue").textContent=fmt(s.live_revenue_rub)+" ₽";
  }

  async function loadEntries(){
    const rows=await rpc("ybz_admin_entries_v2",{
      p_filter:$("entryFilter").value,p_search:$("entrySearch").value.trim(),p_limit:200,p_offset:0
    });
    $("entriesBody").innerHTML=(rows||[]).map(e=>{
      const type=e.is_demo?`<span class="tag demo">ДЕМО</span>`:`<span class="tag ok">РЕАЛЬНАЯ</span>`;
      const sc=e.status==="pending"?"pending":(e.status==="published"?"ok":"");
      return `<tr><td>${fmt(e.public_no)}</td><td style="min-width:260px">${esc(e.message)}</td>
      <td>${esc(e.name||"Без имени")}${e.city?"<br><span class='muted'>"+esc(e.city)+"</span>":""}</td>
      <td>${type}<br><span class="muted">${esc(e.plan)}</span></td><td><span class="tag ${sc}">${esc(e.status)}</span></td>
      <td>${esc(e.payment_status)}</td><td>${fmt(e.price_rub)}</td><td>${fmt(e.views)}</td><td>${dateFmt(e.created_at)}</td>
      <td><div class="row-actions">${e.status!=="published"?`<button data-action="publish" data-no="${e.public_no}">Опубликовать</button>`:""}
      ${e.status!=="hidden"?`<button data-action="hide" data-no="${e.public_no}">Скрыть</button>`:""}
      <button class="danger" data-action="delete" data-no="${e.public_no}">Удалить</button></div></td></tr>`;
    }).join("")||`<tr><td colspan="10">Ничего не найдено</td></tr>`;
  }

  async function loadPayments(){
    const rows=await rpc("ybz_admin_payments",{p_limit:200,p_offset:0});
    $("paymentsBody").innerHTML=(rows||[]).map(p=>`<tr>
      <td style="max-width:260px;word-break:break-all">${esc(p.payment_id)}</td><td>${p.public_no?fmt(p.public_no):"—"}</td>
      <td>${fmt(p.amount_rub)} ₽</td><td><span class="tag ${p.environment==="live"?"live":"test"}">${p.environment==="live"?"БОЕВОЙ":"ТЕСТ"}</span></td>
      <td>${esc(p.status)}</td><td>${dateFmt(p.created_at)}</td></tr>`).join("")||`<tr><td colspan="6">Платежей пока нет</td></tr>`;
  }

  async function refreshAll(){await Promise.all([loadSummary(),loadEntries(),loadPayments()])}

  $("loginForm").addEventListener("submit",async e=>{
    e.preventDefault();const btn=e.submitter,box=$("loginMsg");btn.disabled=true;box.innerHTML="";
    try{const s=await authLogin($("email").value.trim(),$("password").value);saveSession(s);await verifyAdmin();showApp();await refreshAll()}
    catch(err){clearSession();box.innerHTML=`<div class="notice error">${esc(err.message)}</div>`}finally{btn.disabled=false}
  });
  $("logoutBtn").onclick=()=>{clearSession();showLogin()};
  $("refreshEntries").onclick=async()=>{try{await loadEntries();await loadSummary()}catch(e){msg(e.message,"error")}};
  $("refreshPayments").onclick=async()=>{try{await loadPayments();await loadSummary()}catch(e){msg(e.message,"error")}};
  $("entryFilter").onchange=async()=>{try{await loadEntries()}catch(e){msg(e.message,"error")}};
  $("searchBtn").onclick=async()=>{try{await loadEntries()}catch(e){msg(e.message,"error")}};
  $("clearSearch").onclick=async()=>{$("entrySearch").value="";try{await loadEntries()}catch(e){msg(e.message,"error")}};
  $("entrySearch").addEventListener("keydown",e=>{if(e.key==="Enter"){$("searchBtn").click()}});

  $("entriesBody").addEventListener("click",async e=>{
    const btn=e.target.closest("button[data-action]");if(!btn)return;const no=Number(btn.dataset.no),action=btn.dataset.action;
    try{
      if(action==="delete"){if(!confirm(`Удалить запись №${no}?`))return;await rpc("ybz_admin_delete_entry",{p_public_no:no})}
      else await rpc("ybz_admin_set_status",{p_public_no:no,p_status:action==="publish"?"published":"hidden"});
      await Promise.all([loadEntries(),loadSummary(),loadPayments()])
    }catch(err){msg(err.message,"error")}
  });

  $("deleteDemos").onclick=async()=>{
    if(!confirm("Удалить ВСЕ демонстрационные записи?"))return;
    try{const c=await rpc("ybz_admin_delete_all_demo");msg(`Удалено демо-записей: ${c}`);await Promise.all([loadEntries(),loadSummary()])}
    catch(e){msg(e.message,"error")}
  };

  (async function(){
    const s=getSession();if(!s?.access_token){showLogin();return}
    try{await verifyAdmin();showApp();await refreshAll()}
    catch(err){clearSession();showLogin();$("loginMsg").innerHTML=`<div class="notice error">${esc(err.message)}</div>`}
  })();
})();
