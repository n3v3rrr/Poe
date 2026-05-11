import { $, fmt, percentile } from './utils.js';
import { getState } from './state.js';
import { CATS } from './constants.js';

let selectedRowEl = null;

export function populateLeagues(leagues){
  const sel = $("#league");
  let current = sel.value || 'Rise of the Abyssal'; // fallback
  sel.innerHTML = "";
  let found = false;
  leagues.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l.value || l.name;
    opt.textContent = l.value || l.name;
    if (opt.value === current) {
      opt.selected = true;
      found = true;
    }
    sel.appendChild(opt);
  });
  if (!found && leagues.length > 0) {
    sel.value = leagues[0].value; // только если не нашли fallback
  }
}

// แปลง history -> อัตรา (two per one) แบบทน outlier + อิงปริมาณ
export function summarizePair(history){
    if (!history.length) return null;
    const rels = []; // เก็บ [price, weight]
    for (const h of history){
      const d = h?.Data;
      const a = Number(d?.CurrencyOneData?.RelativePrice);   // ราคาญาติจากฝั่ง one
      const b = Number(d?.CurrencyTwoData?.RelativePrice);   // ราคาญาติจากฝั่ง two
      const w = Number(d?.CurrencyOneData?.VolumeTraded || 0) + Number(d?.CurrencyTwoData?.VolumeTraded || 0);

      // เดา direction: ใช้ค่าที่สอดคล้องกันมากที่สุด
      // ถ้า a>0 และ b>0 มักเป็นผกผันกัน → ใช้ 1/b หรือ a ตาม sanity check
      let p = NaN;
      if (Number.isFinite(a) && a>0 && Number.isFinite(b) && b>0){
        const invB = 1/b;
        p = (Math.abs(a - invB) / Math.max(a, invB) < 0.15) ? (a+invB)/2 : a; // เผื่อกรณี noisy
      } else if (Number.isFinite(a) && a>0) p = a;
      else if (Number.isFinite(b) && b>0) p = 1/b;

      if (Number.isFinite(p) && p>0){
        // เก็บทั้งแบบน้ำหนักด้วย volume และแบบดิบไว้หาค่า robust
        rels.push([p, Math.max(w,1)]);
      }
    }
    if (!rels.length) return null;

    // Median ที่ถ่วงน้ำหนัก (approx)
    const xs = [];
    for (const [p,w] of rels) { const k = Math.max(1, Math.round(Math.log2(w+1))); for(let i=0;i<k;i++) xs.push(p); }
    xs.sort((x,y)=>x-y);
    const mid = xs[Math.floor(xs.length/2)];
    const p25 = xs[Math.floor(xs.length*0.25)];
    const p75 = xs[Math.floor(xs.length*0.75)];

    // VWAP อย่างง่าย (น้ำหนักด้วย volume)
    const sumW = rels.reduce((a,[,w])=>a+w,0);
    const vwap = rels.reduce((a,[p,w])=>a+p*w,0) / sumW;

    return { median: mid, p25, p75, vwap, samples: xs.length };
}

export function computeBS(p25,p50,p75,tpPct,divineRate,fb,fs){
    if(!(divineRate>0) || p25==null || p50==null) return {B:null,S:null,ROI:null};
    const tp=(Math.max(0,Number(tpPct)||0))/100;
    const buyDiv=p25/divineRate;
    let sellRaw=Math.max(p50,p25*(1+tp)); if(p75!=null) sellRaw=Math.min(sellRaw,p75);
    const sellDiv=sellRaw/divineRate; if(!(buyDiv>0) || !(sellDiv>0)) return {B:null,S:null,ROI:null};
    const B=Math.max(1,Math.floor(1/buyDiv)); const S=Math.max(1,Math.ceil(1/sellDiv));
    const ROI=(B/S)*((1-fs)/(1+fb)) - 1; return {B,S,ROI};
}

export function unitsPer1D(cur,s){ if(cur==="divine") return 1; if(cur==="exalted") return s.exPerDiv||null; if(cur==="chaos") return s.chaosPerDiv||null; return null; }

// export function goldPer1D(cur,s){
//     const units=unitsPer1D(cur,s); if(!(units>0)) return null;
//     const gpUnit = cur==="divine" ? s.goldDiv : cur==="exalted" ? s.goldEx : s.goldChaos;
//     return gpUnit*units;
// }

export function buildRows(items){
    const s=getState(); const out=[];
    const defMin=(s.catValue==="all")?300: (s.catValue.startsWith("unique:")?50:300);
    const minQ=s.minAvgQty || defMin;

    for(const it of items){
      const name=(it && (it.text||it.apiId))||"-"; const apiId=it?.apiId; const current=it?.currentPrice ?? null;
      const logs=Array.isArray(it?.priceLogs)?it.priceLogs:[]; const prices=logs.map(p=>Number(p?.price)).filter(Number.isFinite);
      const qtys=logs.map(p=>Number(p?.quantity||0)).filter(Number.isFinite);
      if(!prices.length) continue;

      const p10=percentile(prices,10), p25=percentile(prices,25), p50=percentile(prices,50), p75=percentile(prices,75);
      const avgQty=qtys.length? qtys.reduce((a,b)=>a+b,0)/qtys.length : 0;
      if(avgQty < minQ) continue;

      const buy=p25 ?? null;
      let sell=null; if(buy!=null && p50!=null) sell=Math.max(p50, buy*(1 + s.tpPct/100)); else if(p50!=null) sell=p50; if(sell!=null && p75!=null) sell=Math.min(sell,p75);

      const {B,S,ROI}=computeBS(p25,p50,p75,s.tpPct,s.divineRate,s.feeBuy,s.feeSell);

      // filters pcs/D
      if(s.divineRate){
        if(s.hideNoBS && (B==null || S==null)) continue;
        if(s.maxS>0 && S!=null && S>s.maxS) continue;
        if(s.maxB>0 && B!=null && B>s.maxB) continue;
      }

      // BlockGap: ใช้แนวคิด approx จากฝั่งบทความ
      const bgB = (p10!=null && p25!=null && p25>0)? ((p25 - p10)/p25)*100 : null;            // ช่องว่างเหนือ aggressive-bid
      const bgS = (sell!=null && p50!=null && p50>0)? ((sell - p50)/p50)*100 : null;          // ช่องว่างต่ำกว่า median-ask ที่ต้องชนะ

      out.push({ name, apiId, current, buy, sell, p10, p25, p50, p75, avgQty, B, S, ROI, bgB, bgS });
    }

    out.sort((a,b)=>{ const r=((b.ROI??-1)-(a.ROI??-1)); if(r!==0) return r; return (Math.log10((b.avgQty||1)) - Math.log10((a.avgQty||1))); });
    return out;
}

export const fmtNum=(n,d=4)=>fmt(n,d);

export function showSelectedItem(o, tr){
    // ไฮไลต์แถวที่เลือก
    if (selectedRowEl) selectedRowEl.classList.remove("selected");
    selectedRowEl = tr;
    if (selectedRowEl) selectedRowEl.classList.add("selected");

    // อัปเดตส่วนสรุป
    const s = getState();
    const needRate = !(s.divineRate > 0);
    const roiPct = (o.ROI!=null) ? (o.ROI*100).toFixed(2) + "%" : (needRate ? "— (set 1D rate)" : "-");

    const statsHtml = `
      <div>Last (Ex): <b>${fmt(o.current)}</b></div>
      <div>BUY ≤ (Ex): <b class="buy">${fmt(o.buy)}</b> | SELL ≥ (Ex): <b class="sell">${fmt(o.sell)}</b></div>
      <div>P25 / P50 / P75: <b>${fmt(o.p25)}</b> / <b>${fmt(o.p50)}</b> / <b>${fmt(o.p75)}</b></div>
      <div>Avg Qty: <b>${Math.round(o.avgQty).toLocaleString()}</b></div>
      <div style="margin-top:6px">Recommended B / S (pcs/D):
        <b>${o.B ?? "-"}</b> / <b>${o.S ?? "-"}</b>
        &nbsp;|&nbsp; ROI_net: <b>${roiPct}</b>
      </div>
      ${needRate ? '<div class="warn" style="margin-top:6px">กรุณากด “Auto 1D in [ref]” หรือใส่ Divine rate เพื่อคำนวณ B/S</div>' : ''}
    `;

    document.getElementById("selName").textContent = o.name || "-";
    document.getElementById("selApi").textContent  = o.apiId ? `API: ${o.apiId}` : "";
    document.getElementById("selStats").innerHTML  = statsHtml;
    document.getElementById("selWrap").style.display = "";
}

export function render(items, fetchCallback){
    const s=getState(); const rows=buildRows(items); const tb=$("#tbody"); tb.innerHTML="";
    // Order currency summary
    // const gBuy = goldPer1D(s.buyCur,s); const gSell= goldPer1D(s.sellCur,s);
    // $("#orderCostOut").innerHTML = `
    //   <div class="card" style="flex:1">
    //     <div class="muted">Order currency (per 1 Divine notional)</div>
    //     <div>Buy in <b>${s.buyCur}</b> → Gold/1D: <b>${gBuy!=null? fmt(gBuy,0):'-'}</b></div>
    //     <div>Sell in <b>${s.sellCur}</b> → Gold/1D: <b>${gSell!=null? fmt(gSell,0):'-'}</b></div>
    //   </div>
    // `;

    if(!rows.length){ tb.innerHTML='<tr><td colspan="14" class="muted">No data (check proxy or filters)</td></tr>'; return; }
    for(const o of rows){
      const roiOk=(s.divineRate!=null && o.ROI!=null && (o.ROI*100) >= s.hlRoi);
      const nearBuy=(s.hlBuyZone && o.current!=null && o.buy!=null && o.current <= (o.buy*1.01));

      const tr=document.createElement("tr");
      if(roiOk) tr.classList.add("hl"); else if(nearBuy) tr.classList.add("hl-warn");
      const badges=[ roiOk? `<span class="badge badge-go">ROI≥${(s.hlRoi|0)}%</span>`:"", nearBuy? '<span class="badge badge-buy">Near BUY</span>':"" ].filter(Boolean).join("");

      tr.innerHTML = `
        <td>${o.name} ${badges}</td>
        <td class="muted">${o.apiId ?? "-"}</td>
        <td>${fmt(o.current)}</td>
        <td class="buy">${fmt(o.buy)}</td>
        <td class="sell">${fmt(o.sell)}</td>
        <td>${fmt(o.p10)}</td>
        <td>${fmt(o.p25)}</td>
        <td>${fmt(o.p50)}</td>
        <td>${fmt(o.p75)}</td>
        <td>${Math.round(o.avgQty).toLocaleString()}</td>
        <td>${o.B ?? "-"}</td>
        <td>${o.S ?? "-"}</td>
        <td>${o.ROI!=null? fmt(o.ROI*100,2): "-"}</td>
        <td>${(o.bgB!=null? fmt(o.bgB,1):"-")} / ${ (o.bgS!=null? fmt(o.bgS,1):"-") }%</td>
      `;
      tr.addEventListener("click", () => showSelectedItem(o, tr));
      tb.appendChild(tr);
    }
}

export function buildCatPicker(fetchCallback){
    const panel=$("#catPanel"); panel.innerHTML="";
    const addItem=(label,icon,val)=>{ const div=document.createElement("div"); div.className="cat-item"; div.innerHTML=`<img src="${icon}" alt=""/><span>${label}</span>`; div.addEventListener("click",()=>selectCategory(val,label,icon, fetchCallback)); panel.appendChild(div); };
    const allIcon="";
    addItem("ทั้งหมด (All)",allIcon,"all");
    const s1=document.createElement("div"); s1.className="cat-section"; s1.textContent="Currency"; panel.appendChild(s1);
    CATS.currency_categories.forEach(c=> addItem(c.label,c.icon,`currency:${c.apiId}`));
    const s2=document.createElement("div"); s2.className="cat-section"; s2.textContent="Unique"; panel.appendChild(s2);
   // CATS.unique_categories.forEach(c=> addItem(c.label,c.icon,`unique:${c.apiId}`));
    $("#catCurrent").addEventListener("click",()=>$("#catPanel").classList.toggle("open"));
    document.addEventListener("click",(e)=>{ if(!$("#catPicker").contains(e.target)) $("#catPanel").classList.remove("open"); });
    selectCategory("all","ทั้งหมด (All)",allIcon, false); // initial selection, no fetch yet
}

function selectCategory(value,label,icon, fetchCallback){
    $("#category").value=value; $("#catLabel").textContent=label; $("#catIcon").src=icon||""; $("#catPanel").classList.remove("open");
    let target=300; if(value!=="all"){ const [g]=value.split(":"); target=(g==="unique")?50:300; }
    const cur=Number($("#minAvgQty").value||0); if([0,50,300,1000].includes(cur)) $("#minAvgQty").value=String(target);
    if(fetchCallback) fetchCallback();
}

export function applyTooltips(){
    // 2.1 หัวตาราง (ระบุตาม index ของ <th>)
    const thTips = {
      0: "ชื่อไอเทม",
      1: "รหัส API ของไอเทม",
      2: "ราคาล่าสุดในหน่วย Exalted ที่ API รายงาน (currentPrice)",
      3: "เพดานราคาซื้อแนะนำ (Ex): ใช้ P25 เป็นหลัก",
      4: "พื้นราคาขายแนะนำ (Ex): max(P50, BUY×(1+TP%)) แต่ไม่เกิน P75",
      5: "P10: 10th percentile ของราคาย้อนหลัง (ใช้แทน aggressive bid)",
      6: "P25: 25th percentile (ใช้เป็นเพดาน BUY)",
      7: "P50: 50th percentile/Median (ฐาน SELL)",
      8: "P75: 75th percentile (เพดาน SELL)",
      9: "Avg Qty: ปริมาณเฉลี่ยต่อ snapshot ใน priceLogs (ตัวชี้วัดสภาพคล่อง)",
      10:"B (pcs/D): จำนวนชิ้นต่อ 1 Divine ที่ซื้อได้ที่ราคา BUY (floor)",
      11:"S (pcs/D): จำนวนชิ้นต่อ 1 Divine ที่ต้องขายที่ราคา SELL เพื่อรับ 1D คืน (ceil)",
      12:"ROI_net %: (B/S)×((1−feeSell)/(1+feeBuy)) − 1 หลังค่าธรรมเนียม",
      13:"BlockGap (B/S): B = (P25−P10)/P25, S = (SELL−P50)/P50 — ค่าต่ำ=ยืนชิดบล็อกใหญ่"
    };
    const ths = document.querySelectorAll('#tbl thead th');
    ths.forEach((th, i) => {
      const tip = thTips[i];
      if (!tip) return;
      if (th.dataset.tipped) return;
      const text = th.textContent;
      th.innerHTML = `<abbr title="${tip.replace(/"/g,'&quot;')}">${text}</abbr>`;
      th.dataset.tipped = '1';
    });

    // 2.2 ใส่ tooltip ให้ labels/ปุ่ม ในแผงควบคุม
    const L = (id, tip) => {
      const el = document.getElementById(id);
      if (!el) return;
      // ปกติ label อยู่ใน parent เดียวกันและอยู่ก่อน input
      let lab = el.parentElement && el.parentElement.querySelector('label');
      // สำหรับ checkbox ที่มี label[for] อยู่ถัดไป
      if (!lab) lab = document.querySelector(`label[for="${id}"]`);
      if (lab) lab.title = tip;
    };
    const B = (id, tip) => { const el = document.getElementById(id); if (el) el.title = tip; };

    // Controls (ด้านบน)
    L('league',      'ชื่อลีกที่จะดึงข้อมูลจาก API');
    L('ref',         'หน่วยอ้างอิงสำหรับดึง/เทียบราคา (exalted/chaos/divine)');
    L('perPage',     'จำนวนรายการต่อหนึ่งหน้าที่เรียกจาก API (ต่อ endpoint)');
    L('tpPct',       'Target Profit %: เพิ่มจาก BUY เพื่อกำหนด SELL ขั้นต่ำ (cap ด้วย P75)');
    L('minAvgQty',   'คัดรายการที่สภาพคล่องต่ำกว่าค่านี้ออก (เฉลี่ยปริมาณต่อ snapshot)');
    L('hlRoi',       'ไฮไลต์แถวที่ ROI_net ≥ ค่านี้');
    L('hlBuyZone',   'ไฮไลต์แถวที่ราคาปัจจุบัน ≤ BUY×1.01 (อยู่โซนซื้อ)');
    L('maxS',        'ตัดรายการที่ S (pcs/D) สูงกว่าเกณฑ์นี้ (ขายย่อยเกินไป)');
    L('maxB',        'ตัดรายการที่ B (pcs/D) สูงกว่าเกณฑ์นี้ (ซื้อย่อยเกินไป)');
    L('hideNoBS',    'ซ่อนรายการที่ยังไม่สามารถคำนวณ B/S ได้ (ยังไม่มี Divine rate/P25/P50)');

    // Rate Settings
    L('feeBuy',      'ค่าธรรมเนียม/ภาษีฝั่งซื้อ (%)');
    L('feeSell',     'ค่าธรรมเนียมฝั่งขาย (%)');
    L('divineRate',  '1 Divine เท่ากับกี่หน่วยในสกุลอ้างอิง (ใช้คำนวณทุกแถวในตาราง)');
    B('btnAutoDiv',  'ดึงราคา 1 Divine ในสกุลอ้างอิง (Ref) อัตโนมัติจาก API');

    // Order Currency & Gold/1D
    L('buyCur',      'สกุลที่ใช้ตั้งคำสั่ง “ซื้อ” (กระทบต้นทุน Gold/1D)');
    L('sellCur',     'สกุลที่ใช้ตั้งคำสั่ง “ขาย”');
    L('goldEx',      'ต้นทุนทองต่อ 1 Exalted (ปรับได้)');
    L('goldChaos',   'ต้นทุนทองต่อ 1 Chaos (ปรับได้)');
    L('goldDiv',     'ต้นทุนทองต่อ 1 Divine (ปรับได้)');
    L('exPerDiv',    'จำนวน Exalted ต่อ 1 Divine (Ex/1D)');
    L('chaosPerDiv', 'จำนวน Chaos ต่อ 1 Divine (Chaos/1D)');
    B('btnAutoRates','ดึง Ex/1D และ Chaos/1D อัตโนมัติจาก API');

    // Toggles เมื่อเลือก All
    const inclCurrency = document.getElementById('inclCurrency');
    const inclUnique   = document.getElementById('inclUnique');
    if (inclCurrency && inclCurrency.parentElement) inclCurrency.parentElement.title = 'รวมหมวดฝั่ง Currency ทั้งหมดเมื่อเลือก “All”';
    if (inclUnique   && inclUnique.parentElement)   inclUnique.parentElement.title   = 'รวมหมวดฝั่ง Unique ทั้งหมดเมื่อเลือก “All”';
  }
