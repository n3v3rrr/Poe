import { $, csvEscape } from './utils.js';
import { getState } from './state.js';
import { fetchOneEndpoint, fetchPairHistory, categoryToEndpoints, fetchLeagues } from './api.js';
import { render, buildRows, applyTooltips, buildCatPicker, summarizePair, populateLeagues } from './ui.js';
import { API_BASE, PAIR_IDS } from './constants.js';

let items=[]; // aggregated items

// main.js
export async function initLeagues() {
  try {
    console.log('🔄 Loading leagues...');
    
    // ✅ 1. Используем ПРАВИЛЬНУЮ функцию для загрузки лиг
    const leagues = await fetchLeagues();
    
    // ✅ 2. Фильтруем по isCurrent (с маленькой буквы — как возвращает api.js)
    const currentLeagues = leagues.filter(l => l.isCurrent);
    console.log(`✅ Loaded ${leagues.length} leagues (${currentLeagues.length} active)`);

    // ✅ 3. Обновляем UI — вызываем экспортированную функцию напрямую
    if (typeof populateLeagues === 'function') {
      populateLeagues(leagues);
    }

    // ✅ 4. Загружаем данные для первой доступной лиги
    if (leagues.length > 0) {
      const s = getState();
      // Берём первую активную, или любую, если активных нет
      s.league = currentLeagues[0]?.value || leagues[0].value;
      console.log(`🎯 Selected league: ${s.league}`);
      
      // ✅ 5. Загружаем данные — fetchAllPages читает состояние из getState()
      await fetchAllPages();
    }
    
  } catch (error) {
    console.error('❌ Failed to init leagues:', error);
    if (typeof showError === 'function') {
      showError('Не удалось загрузить лиги. Проверьте подключение.');
    }
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
async function autoDivine() {
  const s = getState();
  const league = encodeURIComponent($("#league").value);
  const ref = s.ref || "exalted";
  const realm = "poe2"; // ✅ Важно: poe2, а не pc

  try {
    // ✅ Правильный URL с обязательными параметрами
    const url = `http://localhost:8787/api/${realm}/Leagues/${league}/Currencies/ByCategory?Category=currency&ReferenceCurrency=${ref}&Page=1&PerPage=100`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'poe-flip-dashboard/1.0 (contact: your@email.com)'
      }
    });
    
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }
    
    const data = await res.json();
    
    // 🔍 Ищем Divine Orb в ответе
    const currencies = data?.Currencies || data?.Items || data || [];
    const divine = Array.isArray(currencies) 
      ? currencies.find(c => 
          (c?.ApiId?.toLowerCase?.()?.includes?.("divine")) || 
          (c?.Text?.toLowerCase?.()?.includes?.("divine orb"))
        )
      : null;
    
    // 🔁 Альтернативный поиск, если не нашли в массиве
    if (!divine) {
      for (const key in data) {
        const arr = Array.isArray(data[key]) ? data[key] : [];
        const found = arr.find(c => 
          c?.ApiId?.toLowerCase?.()?.includes?.("divine") || 
          c?.Text?.toLowerCase?.()?.includes?.("divine")
        );
        if (found) { divine = found; break; }
      }
    }
    
    if (divine) {
      // 💡 Извлекаем цену (поле может называться по-разному)
      const divinePrice = divine.CurrentPrice ?? divine.currentPrice ?? divine.Price ?? divine.price ?? divine.LastPrice;
      
      if (divinePrice != null && divinePrice > 0) {
        // 🎯 ЗАПИСЫВАЕМ ТОЛЬКО В divineRate
        const rateInput = $("#divineRate");
        if (rateInput) {
          rateInput.value = Number(divinePrice).toFixed(3); // step="0.001" в вашем input
          
          // 🟢 Визуальный фидбек
          const btn = $("#btnAutoDiv");
          if (btn) {
            const oldText = btn.textContent;
            btn.textContent = "✓ Курс обновлён!";
            btn.style.background = "#059669";
            setTimeout(() => {
              btn.textContent = oldText;
              btn.style.background = "";
            }, 2000);
          }
          
          // 🔄 Пересчитать таблицу с новым курсом
          if (typeof refreshData === "function") refreshData();
          return;
        }
      }
    }
    
    throw new Error("Divine Orb не найден или цена = 0");
    
  } catch (err) {
    console.error("autoDivine error:", err);
    alert(`❌ Ошибка: ${err.message}`);
  }
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
