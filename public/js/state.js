import { $ } from './utils.js';

export function getState(){
  return {
    catValue: $("#category").value,
    includeCurrency: $("#inclCurrency").checked,
    includeUnique: $("#inclUnique").checked,
    league: $("#league").value,
    ref: $("#ref").value,
    perPage: Number($("#perPage").value||25),
    tpPct: Number($("#tpPct").value||0),
    minAvgQty: Number($("#minAvgQty").value||0),
    feeBuy: Number($("#feeBuy").value||0)/100,
    feeSell: Number($("#feeSell").value||0)/100,
    divineRate: Number($("#divineRate").value)||null,
    // highlight & filters
    hlRoi: Number($("#hlRoi").value||0),
    hlBuyZone: $("#hlBuyZone").checked,
    maxS: Number($("#maxS").value||0),
    maxB: Number($("#maxB").value||0),
    hideNoBS: $("#hideNoBS").checked,
    // order currency + rates + gold
    buyCur: $("#buyCur").value,
    sellCur: $("#sellCur").value,
    exPerDiv: Number($("#exPerDiv").value)||null,
    chaosPerDiv: Number($("#chaosPerDiv").value)||null,
    goldEx: Number($("#goldEx").value||0),
    goldChaos: Number($("#goldChaos").value||0),
    goldDiv: Number($("#goldDiv").value||0),
  };
}
