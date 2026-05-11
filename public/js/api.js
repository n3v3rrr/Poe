//import { API_BASE, CATS } from './constants.js';
import { API_BASE, DEFAULT_REALM, CATS} from './constants.js'; // <-- Добавьте DEFAULT_REALM

export function categoryToEndpoints(s){
  const endpoints=[];
  const pushCurrency=(apiId)=>{ if(apiId==="ritual") endpoints.push("/items/currency/ritual","/items/omen/omen"); else endpoints.push(`/items/currency/${apiId}`); };
  const pushUnique=(apiId)=> endpoints.push(`/items/unique/${apiId}`);
  if(s.catValue==="all"){
    if(s.includeCurrency) CATS.currency_categories.forEach(c=>pushCurrency(c.apiId));
//     if(s.includeUnique)   CATS.unique_categories.forEach(c=>pushUnique(c.apiId));
    return endpoints;
  }
  const [group,apiId]=s.catValue.split(":");
  if(group==="currency"){ pushCurrency(apiId); return endpoints; }
//   if(group==="unique"){ pushUnique(apiId); return endpoints; }
  return ["/items/currency/currency"];
}

export async function fetchOneEndpoint(ep, s, realm = DEFAULT_REALM) {
  let page = 1; 
  const out = [];
  const league = encodeURIComponent(s.league);
  const referenceCurrency = encodeURIComponent(s.ref || 'divine');
  
  // ep приходит как '/items/currency/currency' – забираем последний сегмент
  const category = ep.split('/').pop();

  while (true) {
    const params = new URLSearchParams({
      category: category,                    // нижний регистр!
      referenceCurrency: referenceCurrency,
      page: page.toString(),
      perPage: s.perPage.toString()
    });
    // Правильный путь
    const url = `${API_BASE}/${realm}/Leagues/${league}/Items?${params}`;
    
    const res = await fetch(url, {
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'poe2-quickflip/1.0'
      }
    });
    
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    
    // Ответ – { Items: [...], CurrentPage, Pages, Total }
    const list = (data && Array.isArray(data.Items)) ? data.Items : [];
    out.push(...list);
    
    if (list.length < s.perPage || page >= (data.Pages || 1)) break;
    page++;
  }
  return out;
  const data = await res.json();
console.log('Fetched data sample:', data);
const list = (data && Array.isArray(data.Items)) ? data.Items : [];
}



export async function fetchPairHistory(leagueName, currencyOneId, currencyTwoId, limit = 300) {
  const params = new URLSearchParams({
    Limit: limit.toString()
  });
  
  const url = `${API_BASE}/${REALM}/Leagues/${encodeURIComponent(leagueName)}/Currencies/Pairs/${currencyOneId}/${currencyTwoId}/History?${params}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.History || []; // Новый формат: { History: [...], Meta: {...} }
}

export async function fetchLeagues() {
  const url = `${API_BASE}/${DEFAULT_REALM}/Leagues`;   // уже поправили ранее
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  // data – массив объектов вида { Value: "Rise of the Abyssal", IsCurrent: true, ... }
  return data.map(league => ({
    value: league.Value,          // <-- исправлено!
    isCurrent: league.IsCurrent
  }));
}