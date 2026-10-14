// One-time public .ru registry diagnostic. No user account, checkout or DNS mutation.
const names=['bylzdes.ru','yabylzdes.ru','yabilzdes.ru','ya-byl-zdes.ru','byl-zdes.ru','blizhe18.ru'];
(async()=>{
  for(const name of names){
    let out={domain:name};
    for(const origin of ['https://rdap.tcinet.ru/rdap/domain/','https://rdap.org/domain/']){
      try{
        const r=await fetch(origin+name,{redirect:'follow',headers:{accept:'application/rdap+json, application/json'},signal:AbortSignal.timeout(9000)});
        let data=await r.text();
        if(r.status===200){
          let v;
          try{v=JSON.parse(data)}catch{}
          if(v?.objectClassName==='domain' && v?.ldhName?.toLowerCase()===name){
            out={domain:name,status:'REGISTERED',source:origin,checked:true};break;
          }
          out={domain:name,status:'UNCERTAIN',http:r.status,detail:data.slice(0,130)};continue;
        }
        if(r.status===404){
          let detail=data.slice(0,200);
          out={domain:name,status:'NOT_FOUND_IN_RDAP',source:origin,checked:true,http:r.status,detail};
          break;
        }
        out={domain:name,status:'UNCERTAIN',source:origin,http:r.status,detail:data.slice(0,150)};
      }catch(e){out={domain:name,status:'ERROR',source:origin,error:e.message.slice(0,100)}}
    }
    console.log('RDAP_RESULT '+JSON.stringify(out));
  }
})();
