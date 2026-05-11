import { API_BASE, DEFAULT_REALM, CATS } from './constants.js';

// Маппинг категорий на ID (нужно подобрать правильные ID)
const CATEGORY_IDS = {
  'currency': 1,
  'fragments': 2,
  'runes': 3,
  'talismans': 4,
  'essences': 5,
  'ultimatum': 7,
  'expedition': 9,
  'ritual': 10,
  'vaultkeys': 13,
  'breach': 15,
  'abyss': 16,
  'uncutgems': 17,
  'lineagesupportgems': 18,
  'delirium': 11,
  'omen': 10 // ritual and omen share same ID?
};

export function categoryToEndpoints(s){
  if(s.catValue === "all"){
    if(s.includeCurrency) {
      return CATS.currency_categories.map(c => c.apiId);
    }
    return [];
  }
  
  const [group, apiId] = s.catValue.split(":");
  if(group === "currency"){
    if(apiId === "ritual") {
      return ["ritual", "omen"];
    }
    return [apiId];
  }
  
  return ["currency"];
}

export async function fetchOneEndpoint(ep, s, realm = DEFAULT_REALM) {
  let page = 1; 
  const out = [];
  const league = encodeURIComponent(s.league);
  const referenceCurrency = encodeURIComponent(s.ref || 'exalted');

  while (true) {
    // ✅ Убираем category параметр - API возвращает всё категории
    const params = new URLSearchParams({
      referenceCurrency: referenceCurrency,
      page: page.toString(),
      perPage: s.perPage.toString()
    });
    
    const url = `${API_BASE}/${realm}/Leagues/${league}/Items?${params}`;
    console.log(`🔄 Fetching: ${url}`);
    
    try {
      const res = await fetch(url, {
        headers: { 
          'Accept': 'application/json',
          'User-Agent': 'poe2-quickflip/1.0'
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      console.log(`📦 Page ${page}: ${data.Items?.length || 0} items`);
      
      const list = (data && Array.isArray(data.Items)) ? data.Items : [];
      out.push(...list);
      
      if (list.length < s.perPage || page >= (data.Pages || 1)) break;
      page++;
      
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`❌ Error fetching ${ep}:`, error);
      throw error;
    }
  }
  
  console.log(`✅ Total items: ${out.length}`);
  return out;
}

export async function fetchPairHistory(leagueName, currencyOneId, currencyTwoId, limit = 300) {
  const params = new URLSearchParams({ Limit: limit.toString() });
  const url = `${API_BASE}/${DEFAULT_REALM}/Leagues/${encodeURIComponent(leagueName)}/Currencies/Pairs/${currencyOneId}/${currencyTwoId}/History?${params}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.History || [];
}

export async function fetchLeagues() {
  const url = `${API_BASE}/${DEFAULT_REALM}/Leagues`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.map(league => ({
    value: league.Value,
    isCurrent: league.IsCurrent
  }));
}