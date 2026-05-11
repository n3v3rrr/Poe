import { $, csvEscape } from './utils.js';
import { getState } from './state.js';
import { fetchOneEndpoint, fetchPairHistory, categoryToEndpoints, fetchLeagues } from './api.js';
import { render, buildRows, applyTooltips, buildCatPicker, summarizePair, populateLeagues } from './ui.js';
import { API_BASE, PAIR_IDS } from './constants.js';

let items=[]; // aggregated items

async function initLeagues(){
  try{
    const list = await fetchLeagues();
    populateLeagues(list);
    // After populating, we should fetch data for the selected league
    fetchAllPages();
  }catch(e){
    console.error("Fetch leagues failed", e);
    // Fallback: continue with default hardcoded value or empty
    fetchAllPages();
  }
}

async function fetchAllPages(){
  const s=getState(); 
  $("#error").style.display="none"; 
  $("#tbody").innerHTML='<tr><td colspan="14" class="muted">Loading…</td></tr>';
  const endpoints=categoryToEndpoints(s); 
  if(!endpoints.length){ 
    $("#tbody").innerHTML='<tr><td colspan="14" class="muted">No category</td></tr>'; 
    return; 
  }
  
  const aggregated=[]; 
  let any=false, lastErr=null;
  
  for(const ep of endpoints){
    try{ 
      const part = await fetchOneEndpoint(ep,s);
      console.log(`✅ Endpoint ${ep}: получено ${part.length} предметов`, part[0]); // ✅ Лог
      aggregated.push(...part); 
      any=true; 
    } catch(e){ 
      console.error(`❌ Ошибка ${ep}:`, e);
      lastErr=e; 
    }
  }
  
  console.log(`📊 Всего предметов после агрегации: ${aggregated.length}`); // ✅ Лог
  
  if(!any){ 
    $("#error").textContent="Error: "+(lastErr?.message||lastErr||"fetch failed"); 
    $("#error").style.display=""; 
    $("#tbody").innerHTML='<tr><td colspan="14" class="muted">No data</td></tr>'; 
    items=[]; 
    return; 
  }
  
  items = aggregated;
  console.log('Total items:', items.length, 'first item:', items[0]);
  render(items, fetchAllPages);
}

async function autoDivine(){
    const s=getState(); $("#refLabel").textContent=s.ref; $("#error").style.display="none";
    try{
      let page=1, found=null;
      while(page<=3 && !found){
        const url=`${API_BASE}/items/currency/currency?referenceCurrency=${encodeURIComponent(s.ref)}&page=${page}&perPage=25&league=${encodeURIComponent(s.league)}`;
        const r=await fetch(url,{headers:{Accept:"application/json"}}); if(!r.ok) throw new Error(r.status+" "+r.statusText);
        const data=await r.json(); const items=(data&&data.items)?data.items:[];
        for(const it of items){ const id=(it.apiId||"").toLowerCase(); const name=(it.text||"").toLowerCase(); if(id.includes("divine")||name.includes("divine orb")){ found=Number(it.currentPrice); break; } }
        if(items.length<25) break; page++;
      }
      if(found){ $("#divineRate").value=String(found); render(items, fetchAllPages); }
      else throw new Error("ไม่พบราคา Divine ในหน้าแรก");
    }catch(e){ $("#error").textContent="Auto Divine failed: "+(e.message||e); $("#error").style.display=""; }
}

async function autoRates(){
    const s=getState(); $("#error").style.display="none";
    try{
      // fetch Ex/1D
      const exP = fetch(`${API_BASE}/items/currency/currency?referenceCurrency=exalted&page=1&perPage=25&league=${encodeURIComponent(s.league)}`,{headers:{Accept:"application/json"}})
        .then(r=>{ if(!r.ok) throw new Error("exalted "+r.status); return r.json(); })
        .then(d=> (d.items||[]).find(it=> (it.apiId||"").toLowerCase().includes("divine") || (it.text||"").toLowerCase().includes("divine orb"))?.currentPrice || null);
      // fetch Chaos/1D
      const chP = fetch(`${API_BASE}/items/currency/currency?referenceCurrency=chaos&page=1&perPage=25&league=${encodeURIComponent(s.league)}`,{headers:{Accept:"application/json"}})
        .then(r=>{ if(!r.ok) throw new Error("chaos "+r.status); return r.json(); })
        .then(d=> (d.items||[]).find(it=> (it.apiId||"").toLowerCase().includes("divine") || (it.text||"").toLowerCase().includes("divine orb"))?.currentPrice || null);

      const [exPerDiv, chaosPerDiv] = await Promise.all([exP, chP]);
      if(exPerDiv) $("#exPerDiv").value = String(exPerDiv);
      if(chaosPerDiv) $("#chaosPerDiv").value = String(chaosPerDiv);
      render(items, fetchAllPages);
    }catch(e){ $("#error").textContent="Auto rates failed: "+(e.message||e); $("#error").style.display=""; }
}

// async function autoRatesFromPairHistory(){
//     const s = getState();
//     try{
//       const hx = await fetchPairHistory(s.league, PAIR_IDS.divine, PAIR_IDS.exalted, 10, null);
//       const sx = summarizePair(hx); // ได้ "Ex per 1 Divine" ที่ robust
//       // Divine→Chaos
//       const hc = await fetchPairHistory(s.league, PAIR_IDS.divine, PAIR_IDS.chaos, 10, null);
//       const sc = summarizePair(hc); // ได้ "Chaos per 1 Divine"

//       if (sx?.median) document.getElementById("exPerDiv").value = sx.median.toFixed(3);
//       if (sc?.median) document.getElementById("chaosPerDiv").value = sc.median.toFixed(3);


//       $("#orderCostOut1").innerHTML  = `
//         <div class="card" style="flex:1">
//           <div class="muted">PairHistory snapshot</div>
//           <div>Ex/1D ~ median ${sx? sx.median.toFixed(3): "-"} (IQR ${sx? (sx.p25.toFixed(3)+"–"+sx.p75.toFixed(3)):"-"})</div>
//           <div>Chaos/1D ~ median ${sc? sc.median.toFixed(3): "-"} (IQR ${sc? (sc.p25.toFixed(3)+"–"+sc.p75.toFixed(3)):"-"})</div>
//         </div>`;

//       render(items, fetchAllPages);

//     }catch(e){
//       const err = document.getElementById("error");
//       err.textContent = "PairHistory failed: " + (e.message||e);
//       err.style.display = "";
//     }
// }

document.addEventListener("DOMContentLoaded", ()=>{
    buildCatPicker(fetchAllPages);
    initLeagues(); // Load leagues then data
    applyTooltips();

    // Events
    //document.getElementById("btnAutoRatesPH").addEventListener("click", autoRatesFromPairHistory);
    $("#btnRefresh").addEventListener("click", fetchAllPages);
    $("#btnCsv").addEventListener("click", ()=>{ const rows=buildRows(items); if(!rows.length) return; const headers=["Item","API ID","Last (Ex)","BUY ≤ (Ex)","SELL ≥ (Ex)","P10","P25","P50","P75","Avg Qty","B (pcs/D)","S (pcs/D)","ROI_net %","BlockGapB %","BlockGapS %"]; const body=rows.map(o=>[o.name,o.apiId,o.current,o.buy,o.sell,o.p10,o.p25,o.p50,o.p75,Math.round(o.avgQty),o.B,o.S,(o.ROI!=null?(o.ROI*100).toFixed(2):""),(o.bgB!=null?o.bgB.toFixed(1):""),(o.bgS!=null?o.bgS.toFixed(1):"")]); const csv=[headers.map(csvEscape).join(","), ...body.map(r=>r.map(csvEscape).join(","))].join("\n"); const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="poe2_quickflip.csv"; a.click(); URL.revokeObjectURL(url); });

    $("#btnAutoDiv").addEventListener("click", autoDivine);
    $("#btnAutoRates").addEventListener("click", autoRates);

    ["feeBuy","feeSell","divineRate","ref"].forEach(id=>{
      document.getElementById(id).addEventListener("input", ()=>{ render(items, fetchAllPages); });
    });
    ["league","ref","perPage","tpPct","minAvgQty","hlRoi","hlBuyZone","maxS","maxB","hideNoBS","inclCurrency","inclUnique","buyCur","sellCur","goldEx","goldChaos","goldDiv","exPerDiv","chaosPerDiv"]
      .forEach(id=>{
        const el=document.getElementById(id);
        el.addEventListener("change", ()=>{ render(items, fetchAllPages); });
        el.addEventListener("input",  ()=>{ render(items, fetchAllPages); });
      });
});
