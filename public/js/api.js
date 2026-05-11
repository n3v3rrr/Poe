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

// api.js — замените ВСЮ функцию fetchOneEndpoint на эту:

/**
 * Универсальный фетчер с правильной маршрутизацией эндпоинтов
 */
// api.js — полная замена fetchOneEndpoint

export async function fetchOneEndpoint(endpointKey, s, realm = DEFAULT_REALM) {
  const league = encodeURIComponent(s.league || DEFAULT_LEAGUE);
  const ref = encodeURIComponent(s.ref || 'exalted');
  const perPage = s.perPage || 25;

  // 🔥 СПЕЦИАЛЬНЫЙ СЛУЧАЙ: загрузка списка лиг
  if (endpointKey === 'Leagues' || endpointKey === 'leagues') {
    const url = `${API_BASE}/${realm}/Leagues`;
    console.log(`🔄 Fetching: ${url}`);
    const res = await fetch(url, { 
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'poe2-quickflip/1.0 (your_email@example.com)'
      } 
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return data.map(l => ({ value: l.Value, isCurrent: l.IsCurrent }));
  }

  // 🔥 Категории для эндпоинта /Currencies/ByCategory
  const currencyCats = [
    'currency', 'fragments', 'runes', 'talismans', 'essences',
    'ultimatum', 'expedition', 'ritual', 'omen', 'vaultkeys',
    'breach', 'abyss', 'uncutgems', 'lineagesupportgems', 'delirium'
  ];

  let url;
  if (currencyCats.includes(endpointKey)) {
    // ✅ ПРАВИЛЬНЫЕ имена параметров (PascalCase!)
    const params = new URLSearchParams({
      Category: endpointKey,              // ← ЗАГЛАВНАЯ C
      ReferenceCurrency: ref,             // ← PascalCase
      Page: '1',                          // ← PascalCase
      PerPage: String(perPage)            // ← PascalCase
    });
    url = `${API_BASE}/${realm}/Leagues/${league}/Currencies/ByCategory?${params}`;
  } 
  else if (endpointKey === 'uniques' || endpointKey.startsWith('unique:')) {
    const params = new URLSearchParams({
      ReferenceCurrency: ref,
      Page: '1',
      PerPage: String(perPage)
    });
    if (endpointKey.startsWith('unique:')) {
      params.append('Category', endpointKey.split(':')[1]); // ← ЗАГЛАВНАЯ
    }
    url = `${API_BASE}/${realm}/Leagues/${league}/Uniques/ByCategory?${params}`;
  }
  else {
    // 🔥 FALLBACK: /Items — БЕЗ параметров пагинации!
    url = `${API_BASE}/${realm}/Leagues/${league}/Items`;
  }

  console.log(`🔄 Fetching: ${url}`);
  
  const res = await fetch(url, { 
    headers: { 
      'Accept': 'application/json',
      'User-Agent': 'poe2-quickflip/1.0 (your_email@example.com)'
    } 
  });
  
  if (!res.ok) {
    const errText = await res.text().catch(() => 'No body');
    console.error(`❌ HTTP ${res.status}: ${errText.substring(0, 200)}`);
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  
  const data = await res.json();
  const items = Array.isArray(data) ? data : (data.Items || data.items || []);
  console.log(`✅ Received ${items.length} items from ${endpointKey}`);
  return items;
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