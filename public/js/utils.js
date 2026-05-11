export const $ = (sel) => document.querySelector(sel);
export const fmt = (n,d=3)=> (n==null||Number.isNaN(n))? "-" : Number(n).toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
export function percentile(values,p){ if(!values||values.length===0) return null; const s=[...values].sort((a,b)=>a-b); if(s.length===1) return s[0]; const k=(s.length-1)*(p/100); const f=Math.floor(k),c=Math.ceil(k); if(f===c) return s[f]; return s[f]*(c-k)+s[c]*(k-f); }
export function csvEscape(s){ const t=String(s??""); return (t.includes(",")||t.includes("\n")||t.includes('"'))? '"'+t.replaceAll('"','""')+'"' : t; }
