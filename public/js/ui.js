import { $, fmt, percentile } from './utils.js';
import { getState } from './state.js';
import { CATS } from './constants.js';

let selectedRowEl = null;

export function populateLeagues(leagues){
  const sel = $("#league");
  let current = sel.value || 'Rise of the Abyssal';
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
    sel.value = leagues[0].value;
  }
}

// Преобразование истории -> курс (устойчиво к выбросам)
export function summarizePair(history){
    if (!history.length) return null;
    const rels = [];
    for (const h of history){
      const d = h?.Data;
      const a = Number(d?.CurrencyOneData?.RelativePrice);
      const b = Number(d?.CurrencyTwoData?.RelativePrice);
      const w = Number(d?.CurrencyOneData?.VolumeTraded || 0) + Number(d?.CurrencyTwoData?.VolumeTraded || 0);

      let p = NaN;
      if (Number.isFinite(a) && a>0 && Number.isFinite(b) && b>0){
        const invB = 1/b;
        p = (Math.abs(a - invB) / Math.max(a, invB) < 0.15) ? (a+invB)/2 : a;
      } else if (Number.isFinite(a) && a>0) p = a;
      else if (Number.isFinite(b) && b>0) p = 1/b;

      if (Number.isFinite(p) && p>0){
        rels.push([p, Math.max(w,1)]);
      }
    }
    if (!rels.length) return null;

    const xs = [];
    for (const [p,w] of rels) { const k = Math.max(1, Math.round(Math.log2(w+1))); for(let i=0;i<k;i++) xs.push(p); }
    xs.sort((x,y)=>x-y);
    const mid = xs[Math.floor(xs.length/2)];
    const p25 = xs[Math.floor(xs.length*0.25)];
    const p75 = xs[Math.floor(xs.length*0.75)];

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

export function buildRows(items){
  const s = getState(); 
  const out = [];
  
  const defMin = (s.catValue === "all") ? 50 : (s.catValue.startsWith("unique:") ? 20 : 50);
  const minQ = s.minAvgQty || defMin;
  
  for(const it of items){
    const name = (it && (it.text || it.Text || it.apiId || it.ApiId)) || "-"; 
    const apiId = it?.apiId || it?.ApiId; 
    
    const current = it?.currentPrice ?? it?.CurrentPrice ?? it?.price ?? null;
    
    const logs = Array.isArray(it?.priceLogs) ? it.priceLogs : 
                 Array.isArray(it?.PriceLogs) ? it.PriceLogs : 
                 Array.isArray(it?.history) ? it.history : [];
    
    const prices = logs.map(p => Number(p?.price ?? p?.Price ?? p?.currentPrice)).filter(Number.isFinite);
    const qtys = logs.map(p => Number(p?.quantity ?? p?.Quantity ?? p?.qty ?? 0)).filter(Number.isFinite);
    
    const priceData = prices.length > 0 ? prices : (current != null ? [current] : []);
    if(priceData.length === 0) continue;
    
    const avgQty = qtys.length > 0 ? qtys.reduce((a,b) => a+b,0)/qtys.length : 1;
    
    if(avgQty < minQ) continue;

    const p10 = percentile(priceData, 10);
    const p25 = percentile(priceData, 25); 
    const p50 = percentile(priceData, 50);
    const p75 = percentile(priceData, 75);

    const buy = p25 ?? current ?? null;
    
    let sell = null; 
    if(buy != null && p50 != null) {
      sell = Math.max(p50, buy * (1 + s.tpPct/100)); 
    } else if(p50 != null) {
      sell = p50; 
    } else if(current != null) {
      sell = current * (1 + s.tpPct/100);
    }
    if(sell != null && p75 != null) sell = Math.min(sell, p75);

    const {B, S, ROI} = computeBS(p25, p50, p75, s.tpPct, s.divineRate, s.feeBuy, s.feeSell);

    if(s.divineRate){
      if(s.hideNoBS && (B == null || S == null)) continue;
      if(s.maxS > 0 && S != null && S > s.maxS) continue;
      if(s.maxB > 0 && B != null && B > s.maxB) continue;
    }

    const bgB = (p10 != null && p25 != null && p25 > 0) ? ((p25 - p10)/p25)*100 : null;
    const bgS = (sell != null && p50 != null && p50 > 0) ? ((sell - p50)/p50)*100 : null;

    out.push({ 
      name, apiId, current, buy, sell, p10, p25, p50, p75, 
      avgQty, B, S, ROI, bgB, bgS 
    });
  }

  out.sort((a,b) => { 
    const r = ((b.ROI ?? -1) - (a.ROI ?? -1)); 
    if(r !== 0) return r; 
    return (Math.log10((b.avgQty||1)) - Math.log10((a.avgQty||1))); 
  });
  
  return out;
}

export const fmtNum=(n,d=4)=>fmt(n,d);

export function showSelectedItem(o, tr){
    if (selectedRowEl) selectedRowEl.classList.remove("selected");
    selectedRowEl = tr;
    if (selectedRowEl) selectedRowEl.classList.add("selected");

    const s = getState();
    const needRate = !(s.divineRate > 0);
    const roiPct = (o.ROI!=null) ? (o.ROI*100).toFixed(2) + "%" : (needRate ? "— (укажите курс 1D)" : "-");

    const statsHtml = `
      <div>Последняя (Ex): <b>${fmt(o.current)}</b></div>
      <div>ПОКУПКА ≤ (Ex): <b class="buy">${fmt(o.buy)}</b> | ПРОДАЖА ≥ (Ex): <b class="sell">${fmt(o.sell)}</b></div>
      <div>P25 / P50 / P75: <b>${fmt(o.p25)}</b> / <b>${fmt(o.p50)}</b> / <b>${fmt(o.p75)}</b></div>
      <div>Среднее кол-во: <b>${Math.round(o.avgQty).toLocaleString()}</b></div>
      <div style="margin-top:6px">Рекомендуемые B / S (шт/D):
        <b>${o.B ?? "-"}</b> / <b>${o.S ?? "-"}</b>
        &nbsp;|&nbsp; ROI_net: <b>${roiPct}</b>
      </div>
      ${needRate ? '<div class="warn" style="margin-top:6px">Нажмите “Авто 1D в [валюте]” или укажите курс Divine вручную</div>' : ''}
    `;

    document.getElementById("selName").textContent = o.name || "-";
    document.getElementById("selApi").textContent  = o.apiId ? `API: ${o.apiId}` : "";
    document.getElementById("selStats").innerHTML  = statsHtml;
    document.getElementById("selWrap").style.display = "";
}

export function render(items, fetchCallback){
    const s=getState(); const rows=buildRows(items); const tb=$("#tbody"); tb.innerHTML="";
    
    if(!rows.length){ tb.innerHTML='<tr><td colspan="14" class="muted">Нет данных (проверьте прокси или фильтры)</td></tr>'; return; }
    for(const o of rows){
    const roiOk = (s.divineRate != null && o.ROI != null && (o.ROI * 100) >= s.hlRoi);
    const nearBuy = (s.hlBuyZone && o.current != null && o.buy != null && o.current <= (o.buy * 1.01));

    const tr = document.createElement("tr");

    // 🔽 НОВАЯ ЛОГИКА ПОДСВЕТКИ (без повторного объявления tr)
    const roiVal = o.ROI != null ? o.ROI * 100 : -1;
    const bgBVal = o.bgB != null ? o.bgB : 100;
    const bgSVal = o.bgS != null ? o.bgS : 100;

    if (roiVal < 5 && o.ROI != null) {
      tr.classList.add("hl-bad"); // 🔴 Красный: ROI < 5%
    } else if (bgBVal > 25 || bgSVal > 25) {
      tr.classList.add("hl-warn"); // 🟡 Жёлтый: BlockGap > 25%
    } else if (roiVal >= 15 && bgBVal <= 15 && bgSVal <= 15) {
      tr.classList.add("hl"); // 🟢 Зелёный: ROI > 15% + ликвидность
    } else if (roiOk) {
      tr.classList.add("hl"); // Ваша старая логика
    } else if (nearBuy) {
      tr.classList.add("hl-warn"); // Ваша старая логика
    }
    // 🔼 КОНЕЦ НОВОЙ ЛОГИКИ

    const badges = [
      roiOk ? `<span class="badge badge-go">ROI≥${(s.hlRoi | 0)}%</span>` : "",
      nearBuy ? '<span class="badge badge-buy">Возле покупки</span>' : ""
    ].filter(Boolean).join("");

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
     <td>${o.ROI != null ? fmt(o.ROI * 100, 2) : "-"}</td>
     <td>${(o.bgB != null ? fmt(o.bgB, 1) : "-")} / ${(o.bgS != null ? fmt(o.bgS, 1) : "-")}%</td>
  `;
    tr.addEventListener("click", () => showSelectedItem(o, tr));
    tb.appendChild(tr);
  }
}

export function buildCatPicker(fetchCallback) {
  const panel = $("#catPanel"); panel.innerHTML = "";
  
  const addItem = (label, icon, val) => {
    const div = document.createElement("div"); div.className = "cat-item";
    div.innerHTML = `<img src="${icon}" alt=""/><span>${label}</span>`;
    div.addEventListener("click", () => selectCategory(val, label, icon, fetchCallback));
    panel.appendChild(div);
  };

  addItem("Все (All)", "", "all");
  
  const s1 = document.createElement("div"); s1.className = "cat-section"; s1.textContent = "Валюта"; panel.appendChild(s1);
  CATS.currency_categories.forEach(c => addItem(c.label, c.icon, `currency:${c.apiId}`));
  
  // 👇 ДОБАВЛЕН ЦИКЛ (раньше его не было)
  const s2 = document.createElement("div"); s2.className = "cat-section"; s2.textContent = "Уникальные"; panel.appendChild(s2);
  CATS.unique_categories.forEach(c => addItem(c.label, c.icon, `unique:${c.apiId}`));

  $("#catCurrent").addEventListener("click", () => $("#catPanel").classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (!$("#catPicker").contains(e.target)) $("#catPanel").classList.remove("open");
  });
  
  selectCategory("all", "Все (All)", "", false);
}

function selectCategory(value, label, icon, fetchCallback) {
  $("#category").value = value; 
  $("#catLabel").textContent = label; 
  $("#catIcon").src = icon || ""; 
  $("#catPanel").classList.remove("open");
  
  // Дефолтный фильтр ликвидности
  let target = 300;
  if (value !== "all") {
    const [group] = value.split(":");
    target = (group === "unique") ? 20 : 300; // Уникалы обычно реже, ставим 20
  }
  
  const cur = Number($("#minAvgQty").value || 0);
  if ([0, 20, 50, 300, 1000].includes(cur)) $("#minAvgQty").value = String(target);
  
  if (fetchCallback) fetchCallback();
}

export function applyTooltips(){
    // Подсказки для заголовков таблицы
    const thTips = {
      0: "Название предмета",
      1: "API ID предмета",
      2: "Последняя цена в Exalted из API (currentPrice)",
      3: "Рекомендуемая цена покупки (Ex): используется P25",
      4: "Рекомендуемая цена продажи (Ex): max(P50, ПОКУПКА×(1+TP%)), но не выше P75",
      5: "P10: 10-й перцентиль цен (агрессивная заявка)",
      6: "P25: 25-й перцентиль (потолок для ПОКУПКИ)",
      7: "P50: 50-й перцентиль/Медиана (база для ПРОДАЖИ)",
      8: "P75: 75-й перцентиль (потолок для ПРОДАЖИ)",
      9: "Среднее количество за снэпшот (показатель ликвидности)",
      10:"B (шт/D): сколько штук можно купить на 1 Divine по цене ПОКУПКИ (округление вниз)",
      11:"S (шт/D): сколько штук нужно продать по цене ПРОДАЖИ, чтобы получить 1 Divine (округление вверх)",
      12:"ROI_net %: (B/S)×((1−комиссия_продажи)/(1+комиссия_покупки)) − 1 после комиссий",
      13:"BlockGap (B/S): B = (P25−P10)/P25, S = (ПРОДАЖА−P50)/P50 — низкое значение = близко к крупному блоку"
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

    // Подсказки для элементов управления
    const L = (id, tip) => {
      const el = document.getElementById(id);
      if (!el) return;
      let lab = el.parentElement && el.parentElement.querySelector('label');
      if (!lab) lab = document.querySelector(`label[for="${id}"]`);
      if (lab) lab.title = tip;
    };
    const B = (id, tip) => { const el = document.getElementById(id); if (el) el.title = tip; };

    L('league',      'Название лиги для получения данных из API');
    L('ref',         'Базовая валюта для получения/сравнения цен (exalted/chaos/divine)');
    L('perPage',     'Количество элементов на страницу при запросе к API (на эндпоинт)');
    L('tpPct',       'Целевая прибыль %: добавляется к ПОКУПКЕ для минимальной ПРОДАЖИ (ограничивается P75)');
    L('minAvgQty',   'Фильтр по ликвидности: отсекает предметы со средним количеством ниже этого значения');
    L('hlRoi',       'Подсветка строк с ROI_net ≥ этого значения');
    L('hlBuyZone',   'Подсветка строк, где текущая цена ≤ ПОКУПКА×1.01 (в зоне покупки)');
    L('maxS',        'Отсекает предметы с S (шт/D) выше этого порога (слишком мелкая продажа)');
    L('maxB',        'Отсекает предметы с B (шт/D) выше этого порога (слишком мелкая покупка)');
    L('hideNoBS',    'Скрывает строки, где B/S не могут быть рассчитаны (нет курса Divine или P25/P50)');

    L('feeBuy',      'Комиссия/налог при покупке (%)');
    L('feeSell',     'Комиссия при продаже (%)');
    L('divineRate',  '1 Divine равен сколько единиц в валюте привязки (используется для расчёта всех строк)');
    B('btnAutoDiv',  'Автоматически получить цену 1 Divine в валюте привязки (Ref) из API');

    L('buyCur',      'Валюта для ордера на ПОКУПКУ (влияет на стоимость в золоте)');
    L('sellCur',     'Валюта для ордера на ПРОДАЖУ');
    L('goldEx',      'Стоимость золота за 1 Exalted');
    L('goldChaos',   'Стоимость золота за 1 Chaos');
    L('goldDiv',     'Стоимость золота за 1 Divine');
    L('exPerDiv',    'Количество Exalted за 1 Divine (Ex/1D)');
    L('chaosPerDiv', 'Количество Chaos за 1 Divine (Chaos/1D)');
    B('btnAutoRates','Автоматически получить курсы Ex/1D и Chaos/1D из API');

    const inclCurrency = document.getElementById('inclCurrency');
    const inclUnique   = document.getElementById('inclUnique');
    if (inclCurrency && inclCurrency.parentElement) inclCurrency.parentElement.title = 'Включить все категории валют при выборе "Все"';
    if (inclUnique   && inclUnique.parentElement)   inclUnique.parentElement.title   = 'Включить все категории уникальных предметов при выборе "Все"';
}