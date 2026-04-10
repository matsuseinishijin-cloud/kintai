import React,{ useState, useEffect, useCallback, useRef } from "react";

// ── グローバルCSS注入 ──────────────────────────────────────────────────────────
const _style = document.createElement('style');
_style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #fdf8f2;
    min-height: 100vh;
    font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 16px;
    color: #111827;
  }
  :root {
    --font-sans: "Hiragino Sans", "Yu Gothic", sans-serif;
    --color-background-primary: #ffffff;
    --color-background-secondary: #fef9f3;
    --color-text-primary: #111827;
    --color-text-secondary: #374151;
    --color-text-tertiary: #6b7280;
    --color-border-secondary: #d1d5db;
    --color-border-tertiary: #e9ddd0;
    --color-accent: #1251a3;
  }
  #root { max-width: 1200px; margin: 0 auto; padding: 1rem; }
  select, input, textarea { font-family: inherit; font-size: 15px; }
  .lv-badge-wrap { position: relative; display: inline-block; }
  .lv-badge-wrap .lv-tooltip {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 9999;
    background: #1a1a2e;
    color: #fff;
    font-size: 11px;
    line-height: 1.6;
    padding: 6px 10px;
    border-radius: 8px;
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    pointer-events: none;
    min-width: 140px;
  }
  .lv-badge-wrap .lv-tooltip::before {
    content: '';
    position: absolute;
    bottom: 100%;
    right: 8px;
    border: 5px solid transparent;
    border-bottom-color: #1a1a2e;
  }
  .lv-badge-wrap:hover .lv-tooltip { display: block; }
`;
document.head.appendChild(_style);

// ── GAS API ───────────────────────────────────────────────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbx9o7kzpjy7XWrBJEZb0sauLsbwK7HXSGe8dklw4dFlPCnficmqiCiuYucKKL7-KL32Vw/exec";

// スプレッドシートの日本語列名 → アプリ内キー のマッピング
const EMP_MAP    = { id:"id", "氏名":"name", "職種":"role", "雇用形態":"type", "責任者":"isLead", "週上限時間":"weeklyLimit" };
const SHIFT_MAP  = { id:"id", "従業員id":"empId", "日付":"date", "シフト種別":"shiftType" };
const PUNCH_MAP  = { id:"id", "従業員id":"empId", "日付":"date", "出勤":"in", "退勤":"out", "休憩":"break", "補正済":"adjusted" };
const OT_MAP     = { id:"id", "従業員id":"empId", "日付":"date", "シフト終了":"shiftEnd", "申請退勤":"requestedEnd", "理由":"reason", "状態":"status", "種別":"type" };
const LV_REQ_MAP = { id:"id", "従業員id":"empId", "日付":"date", "理由":"reason", "状態":"status", "半日":"half" };
const LEAVE_MAP  = { id:"id", "従業員id":"empId", "付与日数":"granted", "取得日数":"used", "履歴":"records" };
const PW_MAP     = { id:"id", "従業員id":"empId", "パスワード":"password" };
const SHIFTDEF_MAP = { id:"id", "部署":"dept", "キー":"key", "名前":"label", "開始":"start", "終了":"end", "色":"color", "文字色":"tc", "順番":"order", "休憩":"breakMin" };
const PUNCH_FIX_MAP = { id:"id", "従業員id":"empId", "日付":"date", "申請出勤":"reqIn", "申請退勤":"reqOut", "理由":"reason", "状態":"status", "元出勤":"origIn", "元退勤":"origOut" };
const TRANSFER_MAP  = { id:"id", "従業員id":"empId", "振替出勤日":"workDate", "振替出勤シフト":"workShift", "振替休日":"offDate", "理由":"reason", "状態":"status" };
const WEEK_PAT_MAP  = { id:"id", "職種":"role", "パターン名":"name", "月":"mon", "火":"tue", "水":"wed", "木":"thu", "金":"fri", "土":"sat", "日":"sun" };

// アプリ内キー → 日本語列名
function invertMap(m){ const r={}; Object.entries(m).forEach(([k,v])=>r[v]=k); return r; }
const EMP_INV=invertMap(EMP_MAP), SHIFT_INV=invertMap(SHIFT_MAP), PUNCH_INV=invertMap(PUNCH_MAP);
const OT_INV=invertMap(OT_MAP), LV_REQ_INV=invertMap(LV_REQ_MAP), LEAVE_INV=invertMap(LEAVE_MAP);
const PW_INV=invertMap(PW_MAP);
const SHIFTDEF_INV=invertMap(SHIFTDEF_MAP);
const PUNCH_FIX_INV=invertMap(PUNCH_FIX_MAP);
const TRANSFER_INV=invertMap(TRANSFER_MAP);
const WEEK_PAT_INV=invertMap(WEEK_PAT_MAP);
const DOW_KEYS=["sun","mon","tue","wed","thu","fri","sat"]; // 0=日〜6=土

function convertFrom(row, map){ const o={}; Object.entries(map).forEach(([jp,en])=>{ if(row[jp]!==undefined){ const v=row[jp]; if(en==="id"||en==="empId"){ o[en]=(v!==null&&v!==undefined&&v!==""?String(v):v); } else if(en==="isLead"){ o[en]=v===true||v==="true"||v==="TRUE"||v===1?"true":"false"; } else { o[en]=v; } } }); return o; }
const isLeadVal = v => v==="true"||v===true||v==="TRUE"||v===1;
function convertTo(obj, inv){ const o={}; Object.entries(inv).forEach(([en,jp])=>{ if(obj[en]!==undefined) o[jp]=obj[en]; }); return o; }

// ── グローバルローディングオーバーレイ ────────────────────────────────────────
let _loadingCount=0;
function showOverlay(){
  _loadingCount++;
  let el=document.getElementById('_gas_overlay');
  if(!el){
    el=document.createElement('div');
    el.id='_gas_overlay';
    el.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(253,248,242,0.75);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);';
    el.innerHTML='<div style="background:#fff;border-radius:14px;padding:1.5rem 2.5rem;box-shadow:0 4px 24px rgba(180,140,100,0.18);display:flex;flex-direction:column;align-items:center;gap:10px"><div style="width:32px;height:32px;border:3px solid #e9ddd0;border-top-color:#1251a3;border-radius:50%;animation:_spin 0.8s linear infinite"></div><div style="font-size:14px;color:#374151;font-weight:500">処理中...</div></div>';
    const s=document.createElement('style');
    s.textContent='@keyframes _spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
    document.body.appendChild(el);
  }
  el.style.display='flex';
}
function hideOverlay(){
  _loadingCount=Math.max(0,_loadingCount-1);
  if(_loadingCount===0){
    const el=document.getElementById('_gas_overlay');
    if(el) el.style.display='none';
  }
}
async function withOverlay(fn){showOverlay();try{return await fn();}finally{hideOverlay();}}

async function gasGet(sheet){ return withOverlay(async()=>{ const r=await fetch(`${GAS_URL}?action=getAll&sheet=${encodeURIComponent(sheet)}`); const j=await r.json(); if(!j.ok) throw new Error(j.error); return j.data; }); }
async function gasSave(sheet, data){ return withOverlay(async()=>{ const r=await fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"save",sheet,data})}); const j=await r.json(); if(!j.ok) throw new Error(j.error); return j.data; }); }
async function gasDelete(sheet, id){ return withOverlay(async()=>{ const r=await fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"delete",sheet,id})}); const j=await r.json(); if(!j.ok) throw new Error(j.error); return j.data; }); }
// オーバーレイなし（逐次保存など複数回呼ぶ場合用）
async function gasSaveRaw(sheet, data){ const r=await fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"save",sheet,data})}); const j=await r.json(); if(!j.ok) throw new Error(j.error); return j.data; }
// 複数件一括保存
async function gasSaveMany(sheet, dataList){ return withOverlay(async()=>{ const r=await fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"saveMany",sheet,dataList})}); const j=await r.json(); if(!j.ok) throw new Error(j.error); return j.data; }); }

// ── Constants ─────────────────────────────────────────────────────────────────
const ROLES = ["医療事務","理学療法士","看護師","リハマネ","AT","放射線技師"];
const TYPES = ["正社員","パート"];

// 社員番号採番ルール
// 1桁目：職種 / 2桁目：雇用形態（1=正社員,2=パート） / 3-4桁目：連番
const EMP_ID_PREFIX = {
  "医療事務_正社員":  11,
  "医療事務_パート":  12,
  "理学療法士_正社員":21,
  "理学療法士_パート":22,
  "看護師_正社員":    31,
  "看護師_パート":    32,
  "リハマネ_正社員":  41,
  "リハマネ_パート":  42,
  "AT_正社員":        61,
  "AT_パート":        62,
  "放射線技師_正社員":51,
  "放射線技師_パート":52,
};

function generateEmpId(role, type, existingEmps) {
  const key = role + "_" + type;
  const prefix = EMP_ID_PREFIX[key];
  if (!prefix) return String(Date.now()).slice(-4);
  // 同じプレフィックスの既存IDを抽出し、最大連番+1
  const same = existingEmps
    .map(e => String(e.id))
    .filter(id => id.startsWith(String(prefix)))
    .map(id => parseInt(id.slice(2)) || 0);
  const nextSeq = same.length > 0 ? Math.max(...same) + 1 : 1;
  return String(prefix) + String(nextSeq).padStart(2, "0");
}

const ADMIN_PASSWORD = "1950";

// 部署グループ定義
const DEPT_GROUPS = {
  "医療事務":    { label:"医療事務",    roles:["医療事務"] },
  "理学療法士":  { label:"理学療法士",  roles:["理学療法士"] },
  "リハマネ・AT":{ label:"リハマネ・AT",roles:["リハマネ","AT"] },
  "看護師":      { label:"看護師",      roles:["看護師"] },
  "放射線技師":  { label:"放射線技師",  roles:["放射線技師"] },
};

// 職種→部署グループキーのマッピング
const ROLE_TO_DEPT = {
  "医療事務":   "医療事務",
  "理学療法士": "理学療法士",
  "リハマネ":   "リハマネ・AT",
  "AT":         "リハマネ・AT",
  "看護師":     "看護師",
  "放射線技師": "放射線技師",
};
// 責任者職種→管理部署
// 責任者職種→管理できる部署キー（複数可）
const LEAD_DEPTS_MAP = {
  "医療事務":   ["医療事務"],
  "理学療法士": ["理学療法士","リハマネ・AT"],
  "看護師":     ["看護師"],
  "放射線技師": ["放射線技師"],
};
const getLeadDepts = role => LEAD_DEPTS_MAP[role] || [];
const getLeadRoles = role => {
  const depts = getLeadDepts(role);
  return depts.flatMap(d => DEPT_GROUPS[d]?.roles || []);
};

// 部署別デフォルトシフト定義
const DEFAULT_SHIFT_DEFS_BY_DEPT = {
  "医療事務":    {
    day:  { label:"日勤", start:"08:30", end:"17:30", color:"#E6F1FB", tc:"#185FA5" },
    off:  { label:"休日", start:null,   end:null,    color:"var(--color-background-secondary)", tc:"var(--color-text-tertiary)" },
  },
  "理学療法士":  {
    day:   { label:"日勤", start:"08:30", end:"17:30", color:"#E6F1FB", tc:"#185FA5" },
    early: { label:"早番", start:"07:00", end:"16:00", color:"#EAF3DE", tc:"#3B6D11" },
    late:  { label:"遅番", start:"12:00", end:"21:00", color:"#FAEEDA", tc:"#854F0B" },
    off:   { label:"休日", start:null,   end:null,    color:"var(--color-background-secondary)", tc:"var(--color-text-tertiary)" },
  },
  "リハマネ・AT":{
    day:  { label:"日勤", start:"08:30", end:"17:30", color:"#EAF3DE", tc:"#3B6D11" },
    off:  { label:"休日", start:null,   end:null,    color:"var(--color-background-secondary)", tc:"var(--color-text-tertiary)" },
  },
  "看護師":      {
    day:  { label:"日勤", start:"08:30", end:"17:00", color:"#E1F5EE", tc:"#0F6E56" },
    late: { label:"遅番", start:"13:00", end:"22:00", color:"#FAEEDA", tc:"#854F0B" },
    off:  { label:"休日", start:null,   end:null,    color:"var(--color-background-secondary)", tc:"var(--color-text-tertiary)" },
  },
  "放射線技師":  {
    day:  { label:"日勤", start:"08:30", end:"17:30", color:"#EEEDFE", tc:"#3C3489" },
    off:  { label:"休日", start:null,   end:null,    color:"var(--color-background-secondary)", tc:"var(--color-text-tertiary)" },
  },
};

// グローバルなSHIFT_DEFS（後方互換・フォールバック用）
const SHIFT_DEFS = DEFAULT_SHIFT_DEFS_BY_DEPT["理学療法士"];

// 職種からシフト定義を取得するヘルパー
// shiftDefsData: { "医療事務": {...}, "リハビリ": {...}, ... }
const getShiftDefsByRole = (role, shiftDefsData) => {
  const dept = ROLE_TO_DEPT[role] || "理学療法士";
  const fromData = shiftDefsData?.[dept];
  if (fromData && Object.keys(fromData).length > 0) return fromData;
  return DEFAULT_SHIFT_DEFS_BY_DEPT[dept] || SHIFT_DEFS;
};
const getShiftDefsByDept = (dept, shiftDefsData) => {
  const fromData = shiftDefsData?.[dept];
  if (fromData && Object.keys(fromData).length > 0) return fromData;
  return DEFAULT_SHIFT_DEFS_BY_DEPT[dept] || SHIFT_DEFS;
};
const OT_RULES = {
  "医療事務_正社員":       { type:"round", roundMin:15 },
  "医療事務_パート":       { type:"round", roundMin:10 },
  "理学療法士_正社員":     { type:"overtime_request", limitH:20, roundMin:15 },
  "理学療法士_パート":     { type:"approval", capMin:10 },
  "リハマネ_正社員":       { type:"round", roundMin:10 },
  "リハマネ_パート":       { type:"round", roundMin:10 },
  "AT_正社員":             { type:"fixed", limitH:20, roundMin:15 },
  "AT_パート":             { type:"round", roundMin:10 },
  "放射線技師_正社員":     { type:"round", roundMin:15 },
  "放射線技師_パート":     { type:"round", roundMin:10 },
  "看護師_正社員":         { type:"round", roundMin:15 },
  "看護師_パート":         { type:"round", roundMin:10 },
};
const OT_RULE_LABEL = {
  none:"特別処理なし",
  round:"丸め処理",
  fixed:"固定残業20h込",
  approval:"申請制",
  overtime_request:"時間外申請制",
};
const BREAK_MIN = 60;

// 理学療法士の時間帯別在席人数定義
const PT_TIME_SLOTS = [
  { label:"9〜11時",  start:9*60,  end:11*60 },
  { label:"11〜13時", start:11*60, end:13*60 },
  { label:"14〜16時", start:14*60, end:16*60 },
  { label:"16〜18時", start:16*60, end:18*60 },
  { label:"18〜20時", start:18*60, end:20*60 },
];
function coversSlot(def, slot){
  if(!def||!def.start||!def.end) return false;
  const s=toMin(def.start), e=toMin(def.end);
  return s<=slot.start && e>=slot.end;
}
const DOW_JP = ["日","月","火","水","木","金","土"];
const AVATAR_COLORS = [
  ["#E6F1FB","#185FA5"],["#EAF3DE","#3B6D11"],["#FAEEDA","#854F0B"],
  ["#E1F5EE","#0F6E56"],["#FAECE7","#993C1D"],["#EEEDFE","#3C3489"],
  ["#E1F5EE","#085041"],["#F5C4B3","#712B13"],["#C0DD97","#27500A"],
];


// ── 日本の祝日（API取得・キャッシュ） ────────────────────────────────────────
// { "2026-01-01": "元日", ... } 形式
let HOLIDAYS = {};
const isHoliday = ds => !!HOLIDAYS[ds];
const getHolidayName = ds => HOLIDAYS[ds] || null;
const _holidayCache = {}; // 年ごとのキャッシュ

async function fetchHolidays(year) {
  if (_holidayCache[year]) return;
  try {
    const r = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
    const data = await r.json();
    HOLIDAYS = { ...HOLIDAYS, ...data };
    _holidayCache[year] = true;
  } catch(e) {
    console.warn("祝日API取得失敗:", e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2,"0");
const toMin = t => { if(!t) return 0; const [h,m]=t.split(":"); return +h*60+ +m; };
const fmtTime = m => { if(m===null||m===undefined) return "―"; return pad(Math.floor(m/60))+":"+pad(m%60); };
const toHStr = m => { if(!m||m===0) return "0h"; const h=Math.floor(Math.abs(m)/60),mn=Math.abs(m)%60; return h+"h"+(mn>0?pad(mn)+"m":""); };
const getOtRule = emp => OT_RULES[emp.role+"_"+emp.type] || { type:"none" };
const today = () => { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const nowStr = () => { const d=new Date(); return pad(d.getHours())+":"+pad(d.getMinutes()); };
const daysInMonth = (y,m) => new Date(y,m,0).getDate();
const firstDow = (y,m) => new Date(y,m-1,1).getDay();
const newId = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const safeParseJSON = (str, fallback=[]) => { try{ return JSON.parse(str||"[]"); }catch{ return fallback; } };

// ── 有休シフトキー判定 ────────────────────────────────────────────────────────
const isLeaveShift     = k => k&&(k==="leave"||( k.startsWith("leave")&&!k.startsWith("leave_am")&&!k.startsWith("leave_pm")));
const isLeaveAmShift   = k => k&&k.startsWith("leave_am");
const isLeavePmShift   = k => k&&k.startsWith("leave_pm");
const isDesignatedShift= k => k&&k.startsWith("designated");
const isAnyLeaveShift  = k => isLeaveShift(k)||isLeaveAmShift(k)||isLeavePmShift(k)||isDesignatedShift(k);
// 有休シフトの消化日数（全日=1, 半日=0.5）
const leaveShiftDays   = k => (isLeaveAmShift(k)||isLeavePmShift(k))?0.5:1;
// 有休シフトの half 値
const leaveShiftHalf   = k => isLeaveAmShift(k)?"am":isLeavePmShift(k)?"pm":null;

// ── 有給バケツ管理ヘルパー ─────────────────────────────────────────────────────
function addDays(dateStr,days){const d=new Date(dateStr);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
function addYears(dateStr,years){const d=new Date(dateStr);d.setFullYear(d.getFullYear()+years);return d.toISOString().slice(0,10);}

// recordsからgrantレコードのみ取得（新しい順=LIFO）
function buildBuckets(records){
  const recs=safeParseJSON(records,[]);
  return recs
    .filter(r=>r.type==="grant")
    .map(r=>({
      id:r.id||r.grantedAt||r.date,
      days:Number(r.days)||0,
      grantedAt:r.grantedAt||r.date||today(),
      expiresAt:r.expiresAt||addYears(r.grantedAt||r.date||today(),2),
      note:r.note||"",
    }))
    .sort((a,b)=>a.grantedAt<b.grantedAt?-1:1); // 古い順（表示用）
}

// lvReqs（承認済み申請）からバケツの残日数を動的計算
// 消化順：取得日時点で①付与済み②有効期限内のバケツのうち付与日が新しい順（LIFO）
function calcBucketsWithRemaining(records, lvReqs, empId){
  const buckets=buildBuckets(records).map(b=>({...b,used:0,remaining:b.days}));
  if(!buckets.length) return [];
  // 承認済み申請を日付順に処理（未来日付は残日数計算に含めない）
  const td2=today();
  const approvedReqs=(lvReqs||[])
    .filter(r=>String(r.empId)===String(empId)&&r.status==="approved"&&r.date<=td2)
    .sort((a,b)=>a.date<b.date?-1:1);
  // 各取得申請に対して、取得日時点で有効なバケツをLIFO（新しい付与順）で消化
  approvedReqs.forEach(r=>{
    const days=r.half?0.5:1.0;
    let toConsume=days;
    // 取得日時点で有効なバケツ：①grantedAt <= 取得日（付与済み）②expiresAt >= 取得日（期限内）
    // 新しい付与順（LIFO）でソート
    const validBuckets=[...buckets]
      .filter(b=>b.grantedAt<=r.date&&b.expiresAt>=r.date)
      .sort((a,b)=>a.grantedAt<b.grantedAt?1:-1); // 新しい順
    for(const b of validBuckets){
      if(b.remaining<=0) continue;
      const consume=Math.min(toConsume,b.remaining);
      b.remaining-=consume;
      b.used+=consume;
      toConsume-=consume;
      if(toConsume<=0) break;
    }
  });
  return buckets; // 古い順（表示用）
}

// 有効残日数合計（期限内のバケツのみ）
function calcLeaveRemainingFromReqs(records, lvReqs, empId){
  const td=today();
  const buckets=calcBucketsWithRemaining(records,lvReqs,empId);
  return buckets.filter(b=>b.expiresAt>=td).reduce((s,b)=>s+b.remaining,0);
}

// 後方互換：leave objectとlvReqsから残日数を計算
function calcLeaveRemainingCompat(leave, lvReqs, empId){
  const recs=safeParseJSON(leave?.records,[]);
  const hasGrants=recs.some(r=>r.type==="grant");
  if(!hasGrants){
    // 旧形式（granted/usedのみ）
    return Math.max(0,(+(leave?.granted||0))-(+(leave?.used||0)));
  }
  if(lvReqs&&empId){
    return calcLeaveRemainingFromReqs(leave?.records,lvReqs,empId);
  }
  // lvReqsなし → records内のuse/cancelで計算（後方互換）
  const grants=recs.filter(r=>r.type==="grant").map(r=>({...r,remaining:Number(r.days)||0}));
  const uses=recs.filter(r=>r.type==="use"||r.type==="cancel").sort((a,b)=>a.date<b.date?-1:1);
  uses.forEach(u=>{
    let d=Number(u.days)||0;
    if(u.type==="cancel") d=-d;
    // 取得日時点で有効かつ付与済みのバケツをLIFO（新しい順）で処理
    const valid=[...grants]
      .filter(b=>b.grantedAt<=(u.date||today())&&b.expiresAt>=(u.date||today()))
      .sort((a,b)=>a.grantedAt<b.grantedAt?1:-1);
    if(d>0){for(const b of valid){if(b.remaining<=0)continue;const c=Math.min(d,b.remaining);b.remaining-=c;d-=c;if(d<=0)break;}}
    else{const ab=Math.abs(d);for(const b of valid){const add=Math.min(ab,b.days-b.remaining);b.remaining+=add;d+=add;if(d>=0)break;}}
  });
  const td=today();
  return grants.filter(b=>b.expiresAt>=td).reduce((s,b)=>s+b.remaining,0);
}

function getActiveBuckets(records,lvReqs,empId){
  const td=today();
  return calcBucketsWithRemaining(records,lvReqs,empId).filter(b=>b.expiresAt>=td&&b.remaining>0);
}

// ── Reconciliation ────────────────────────────────────────────────────────────
// 丸め処理（roundMin単位で切り捨て）
function roundDownMin(min, roundMin){ return Math.floor(min/roundMin)*roundMin; }

function buildRows(emp, shifts, punches, otReqs, lvReqs, year, month, shiftDefsData={}){
  const last=daysInMonth(year,month);
  const rule=getOtRule(emp);
  const isApprovalType=rule.type==="approval"; // 理学療法士パート
  const isOvertimeRequest=rule.type==="overtime_request"; // 理学療法士正社員
  const roundMin=rule.roundMin||0;

  return Array.from({length:last},(_,i)=>{
    const d=i+1, ds=`${year}-${pad(month)}-${pad(d)}`, dow=new Date(year,month-1,d).getDay();
    const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
    const _empDefs=getShiftDefsByRole(emp.role,shiftDefsData);
    const st=shiftRow?.shiftType||"off", def=_empDefs[st]||_empDefs.off||SHIFT_DEFS.off, isOff=!def.start;
    const shiftBreakMin=def.breakMin!=null?def.breakMin:0;
    const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
    const _lvMatch=(lvReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
    const isShiftLeave=isAnyLeaveShift(st);
    const isLeave=!!_lvMatch||isShiftLeave;
    const leaveHalf=_lvMatch?.half||leaveShiftHalf(st)||null;

    // 早出申請（全職種共通）：承認済みの早出申請
    const approvedEarlyReq=(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="early");
    // 残業申請（理学療法士パート）または時間外申請（理学療法士正社員）
    const approvedOTReq=(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="overtime");

    let swMin=0,awMin=0,otMin=0,diffMin=0,late=false,earlyLeave=false,absent=false;
    let adj=punch?.adjusted||false,earlyAdj=false;
    // 打刻忘れ判定
    const missingOut=!!punch&&!punch.out&&!isOff&&!isLeave;  // 出勤のみ・退勤忘れ
    const missingIn=!!punch&&!punch.in&&!!punch.out&&!isOff&&!isLeave; // 退勤のみ・出勤忘れ（異常データ）

    if(!isOff&&def.start) swMin=toMin(def.end)-toMin(def.start)-shiftBreakMin;

    if(punch&&punch.out&&punch.in){
      const shiftStartMin=toMin(def.start||"00:00"), shiftEndMin=toMin(def.end||"00:00");
      const im=toMin(punch.in), om=toMin(punch.out);
      let imForWork=im;

      // 早出処理（全職種共通）
      if(!isOff&&def.start&&im<shiftStartMin){
        if(approvedEarlyReq){
          imForWork=im;
          earlyAdj=false;
        } else {
          imForWork=shiftStartMin;
          earlyAdj=true;
        }
      }

      // 残業処理
      let rawOtMin=Math.max(0,om-shiftEndMin);

      if(isApprovalType){
        otMin=approvedOTReq?roundDownMin(rawOtMin,roundMin):0;
      } else if(isOvertimeRequest){
        otMin=rawOtMin;
      } else if(roundMin>0&&!isOff){
        otMin=roundDownMin(rawOtMin,roundMin);
      } else {
        otMin=rawOtMin;
      }

      awMin=Math.max(0,om-imForWork-(punch.break!=null?punch.break:shiftBreakMin));
      if(!isOff&&def.start){
        if(im>shiftStartMin+1) late=true;
        if(om<shiftEndMin-1) earlyLeave=true;
        diffMin=om-shiftEndMin;
      } else { otMin=isOff?awMin:otMin; }
    } else if(!isOff&&!isLeave&&!missingOut&&!missingIn) absent=true;

    const isOffPunch=isOff&&!!punch?.out;
    const bg=isLeave?"#F0FAF5":absent||missingOut||missingIn?"#FFF5F5":adj||earlyAdj?"#F5F4FE":isOffPunch?"#F5F9FE":late||earlyLeave||otMin>0?"#FFFCF5":"";
    return {d,dow,ds,st,def,isOff,swMin,punch,awMin,otMin,diffMin,late,earlyLeave,absent,missingOut,missingIn,adjusted:adj,earlyAdj,isLeave,leaveHalf,isOffPunch,rowBg:bg,approvedOTReq,approvedEarlyReq};
  });
}

// ── UI primitives ─────────────────────────────────────────────────────────────
const Badge=({label,color,bg})=><span style={{display:"inline-block",padding:"2px 8px",borderRadius:99,fontSize:11,fontWeight:500,background:bg,color,whiteSpace:"nowrap"}}>{label}</span>;
const statusBadge=(r,isAdmin=false)=>{
  if(r.absent) return <Badge label="要対応" bg="#FCEBEB" color="#A32D2D"/>;
  if((r.adjusted||r.earlyAdj)&&isAdmin) return <Badge label="打刻調整" bg="#EEEDFE" color="#3C3489"/>;
  if(r.isLeave&&r.leaveHalf==="am") return <Badge label="有給（午前）" bg="#E1F5EE" color="#0F6E56"/>;
  if(r.isLeave&&r.leaveHalf==="pm") return <Badge label="有給（午後）" bg="#E1F5EE" color="#0F6E56"/>;
  if(r.isLeave) return <Badge label="有給" bg="#E1F5EE" color="#0F6E56"/>;
  if(r.isOffPunch) return <Badge label="シフト確認" bg="#EDE9FE" color="#5B21B6"/>;
  if(r.isOff) return <Badge label="休日" bg="#E6F1FB" color="#185FA5"/>;
  if(r.late&&r.earlyLeave) return <Badge label="遅刻・早退" bg="#FAEEDA" color="#854F0B"/>;
  if(r.late) return <Badge label="遅刻" bg="#FAEEDA" color="#854F0B"/>;
  if(r.earlyLeave) return <Badge label="早退" bg="#FAEEDA" color="#854F0B"/>;
  if(r.otMin>0) return <Badge label="残業" bg="#FAEEDA" color="#854F0B"/>;
  if(r.awMin>0) return <Badge label="正常" bg="#EAF3DE" color="#3B6D11"/>;
  return <Badge label="―" bg="var(--color-background-secondary)" color="var(--color-text-tertiary)"/>;
};

const iS={padding:"10px 13px",borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:15,width:"100%"};
const bP={padding:"10px 22px",borderRadius:8,background:"#1251a3",color:"white",border:"none",fontSize:15,fontWeight:600,cursor:"pointer",boxShadow:"0 2px 6px rgba(18,81,163,0.35)"};
const bS={padding:"10px 18px",borderRadius:8,border:"1.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-primary)",fontSize:15,cursor:"pointer",fontWeight:500};
const bD={padding:"6px 13px",borderRadius:6,border:"1px solid #F09595",background:"#FCEBEB",color:"#A32D2D",fontSize:13,cursor:"pointer",fontWeight:500};
const nB=a=>({flex:1,minWidth:80,padding:"10px 4px",borderRadius:8,border:"none",background:a?"#1251a3":"transparent",color:a?"white":"var(--color-text-secondary)",fontSize:15,fontWeight:a?700:400,cursor:"pointer",whiteSpace:"nowrap"});
const crd={background:"var(--color-background-primary)",border:"1px solid #e9ddd0",borderRadius:14,boxShadow:"0 2px 10px rgba(180,140,100,0.10)"};
const thS={padding:"10px 13px",fontSize:13,color:"var(--color-text-secondary)",borderBottom:"1px solid var(--color-border-tertiary)",textAlign:"left",fontWeight:600,background:"#fef9f3"};
const tdS={padding:"11px 13px",borderBottom:"1px solid var(--color-border-tertiary)",color:"var(--color-text-primary)",verticalAlign:"middle",fontSize:15};

// ── Loading / Error ───────────────────────────────────────────────────────────
function Loading(){return <div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-secondary)",fontSize:13}}>読み込み中...</div>;}
function Err({msg}){return <div style={{padding:"1rem",background:"#FCEBEB",borderRadius:8,color:"#A32D2D",fontSize:13}}>エラー：{msg}</div>;}

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({emps,passwords,onLogin}){
  const [mode,setMode]=useState("admin");
  const [roleFilter,setRoleFilter]=useState("全て");
  const [sel,setSel]=useState(emps[0]?.id||"");
  const [pw,setPw]=useState("");
  const [err,setErr]=useState("");
  const allRoles=["全て",...ROLES];
  const filteredEmps=roleFilter==="全て"?emps:emps.filter(e=>e.role===roleFilter);
  const onRoleChange=r=>{setRoleFilter(r);const first=(r==="全て"?emps:emps.filter(e=>e.role===r))[0];if(first)setSel(first.id);};
  const doLogin=()=>{
    setErr("");
    if(mode==="admin"){
      if(pw===ADMIN_PASSWORD){ onLogin("admin"); }
      else { setErr("パスワードが違います"); }
    } else {
      const pwRec=passwords.find(p=>String(p.empId)===String(sel));
      const correct=pwRec?.password||String(sel);
      if(pw===correct){ onLogin(sel); }
      else { setErr("パスワードが違います"); }
    }
  };
  return <div style={{minHeight:400,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{...crd,padding:"2rem",width:340}}>
      <div style={{fontSize:22,fontWeight:700,color:"#1251a3",marginBottom:4}}>クリニック勤怠</div>
      <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:"1.5rem"}}>ログイン</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:"1.5rem"}}>
        {["admin","employee"].map(m=><button key={m} onClick={()=>{setMode(m);setPw("");setErr("");}} style={{padding:"10px 0",borderRadius:8,border:mode===m?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:mode===m?"#E6F1FB":"var(--color-background-primary)",color:mode===m?"#185FA5":"var(--color-text-primary)",fontWeight:mode===m?500:400,cursor:"pointer",fontSize:13}}>{m==="admin"?"管理者":"従業員"}</button>)}
      </div>
      {mode==="employee"&&<div style={{marginBottom:"1rem"}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:6}}>職種で絞り込み</div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>
          {allRoles.map(r=><button key={r} onClick={()=>onRoleChange(r)} style={{padding:"4px 10px",borderRadius:6,border:roleFilter===r?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:roleFilter===r?"#E6F1FB":"var(--color-background-primary)",color:roleFilter===r?"#185FA5":"var(--color-text-secondary)",fontSize:11,cursor:"pointer",fontWeight:roleFilter===r?500:400}}>{r}</button>)}
        </div>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>従業員を選択</div>
        <select value={sel} onChange={e=>{setSel(e.target.value);setPw("");}} style={iS}>
          {filteredEmps.map(e=><option key={e.id} value={e.id}>[{e.id}] {e.name}（{e.role}・{e.type}）{isLeadVal(e.isLead)?"　★責任者":""}</option>)}
        </select>
      </div>}
      <div style={{marginBottom:"1rem"}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>パスワード（4桁）</div>
        <input type="password" maxLength={4} value={pw} onChange={e=>setPw(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&doLogin()} placeholder="••••" style={{...iS,letterSpacing:"0.3em",fontSize:18,textAlign:"center"}}/>
        {mode==="employee"&&<div style={{fontSize:10,color:"var(--color-text-tertiary)",marginTop:4}}>初期パスワードは社員番号です</div>}
      </div>
      {err&&<div style={{marginBottom:10,padding:"6px 10px",background:"#FCEBEB",borderRadius:8,fontSize:12,color:"#A32D2D"}}>{err}</div>}
      <button onClick={doLogin} disabled={pw.length!==4} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:pw.length===4?1:0.4}}>ログイン</button>
    </div>
  </div>;
}

// ── EmpManager ────────────────────────────────────────────────────────────────
function EmpManager({emps:empsFromProps,passwords,reload}){
  const [localEmps,setLocalEmps]=useState(null);
  const emps=localEmps||empsFromProps;
  const [form,setForm]=useState({name:"",role:"医療事務",type:"正社員",isLead:false,weeklyLimit:""});
  const [editId,setEditId]=useState(null),[saving,setSaving]=useState(false);
  const [pwEditId,setPwEditId]=useState(null),[newPw,setNewPw]=useState("");
  // 絞り込み・並び替え
  const [filterRole,setFilterRole]=useState("");
  const [filterType,setFilterType]=useState("");
  const [filterName,setFilterName]=useState("");
  const [sortKeys,setSortKeys]=useState(["id"]); // 優先順位付き複数選択
  const toggleSort=k=>{
    setSortKeys(prev=>{
      if(prev.includes(k)){
        const next=prev.filter(s=>s!==k);
        return next.length===0?["id"]:next;
      }
      return [...prev,k];
    });
  };
  const startEdit=e=>{setEditId(e.id);setForm({name:e.name,role:e.role,type:e.type,isLead:isLeadVal(e.isLead),weeklyLimit:e.weeklyLimit||""});};
  const save=async()=>{
    if(!form.name)return;
    setSaving(true);
    try{
      let empId=editId;
      if(!editId){
        empId=generateEmpId(form.role,form.type,emps);
      }
      const updated={id:empId,...form,isLead:form.isLead?"true":"false",weeklyLimit:form.weeklyLimit||""};
      const data=convertTo(updated,EMP_INV);
      // 楽観的更新：即座に画面反映
      const cur=localEmps||empsFromProps;
      setLocalEmps(editId
        ?cur.map(e=>String(e.id)===String(empId)?{...e,...updated}:e)
        :cur.concat([updated])
      );
      setEditId(null);setForm({name:"",role:"医療事務",type:"正社員",isLead:false});
      await gasSave("従業員",data);
      if(!editId){
        const existPw=passwords.find(p=>p.empId===empId);
        const pwData=convertTo({id:existPw?.id||newId(),empId:empId,password:String(empId)},PW_INV);
        await gasSave("パスワード",pwData);
      }
      await reload();
      setLocalEmps(null);
    }catch(e){setLocalEmps(null);alert("保存失敗："+e.message);}
    setSaving(false);
  };
  const del=async emp=>{
    if(!confirm("削除しますか？"))return;
    try{
      // 楽観的更新
      setLocalEmps((localEmps||empsFromProps).filter(e=>String(e.id)!==String(emp.id)));
      await gasDelete("従業員",emp.id);
      const pwRec=passwords.find(p=>String(p.empId)===String(emp.id));
      if(pwRec) await gasDelete("パスワード",pwRec.id);
      await reload();
      setLocalEmps(null);
    }catch(e){setLocalEmps(null);alert("削除失敗："+e.message);}
  };
  const resetPw=async emp=>{
    if(!confirm(`${emp.name}のパスワードを社員番号（${emp.id}）に初期化しますか？`))return;
    try{
      const existPw=passwords.find(p=>String(p.empId)===String(emp.id));
      const pwData=convertTo({id:existPw?.id||newId(),empId:emp.id,password:String(emp.id)},PW_INV);
      await gasSave("パスワード",pwData);
      await reload();
      alert("初期化しました");
    }catch(e){alert("失敗："+e.message);}
  };
  const savePw=async empId=>{
    if(newPw.length!==4)return;
    try{
      const existPw=passwords.find(p=>p.empId===empId);
      const pwData=convertTo({id:existPw?.id||newId(),empId,password:newPw},PW_INV);
      await gasSave("パスワード",pwData);
      await reload();
      setPwEditId(null);setNewPw("");
      alert("変更しました");
    }catch(e){alert("失敗："+e.message);}
  };

  // 新規登録時の採番プレビュー
  const previewId=!editId?generateEmpId(form.role,form.type,emps):null;

  return <div>
    <div style={{...crd,padding:"1rem 1.25rem",marginBottom:"1rem"}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>{editId?"編集":"新規登録"}</div>
      {!editId&&<div style={{marginBottom:8,padding:"6px 12px",background:"#E6F1FB",borderRadius:8,fontSize:12,color:"#185FA5"}}>
        社員番号（自動）：<strong>{previewId}</strong>　初期パスワード：<strong>{previewId}</strong>
      </div>}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <div><div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>氏名</div><input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="例：山田 花子" style={iS}/></div>
        <div><div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>職種</div><select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={iS}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></div>
        <div><div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>雇用形態</div><select value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))} style={iS}>{TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
        {form.type==="正社員"&&<div><div style={{fontSize:13,color:"var(--color-text-secondary)",marginBottom:4}}>週所定労働時間（h）</div><input type="number" min="1" max="60" value={form.weeklyLimit} onChange={e=>setForm(p=>({...p,weeklyLimit:e.target.value}))} placeholder="例：40" style={iS}/></div>}
        <div style={{display:"flex",alignItems:"center",gap:8,paddingTop:18}}><input type="checkbox" id="isLead" checked={!!form.isLead} onChange={e=>setForm(p=>({...p,isLead:e.target.checked}))} style={{width:16,height:16,cursor:"pointer"}}/><label htmlFor="isLead" style={{fontSize:13,cursor:"pointer"}}>★ 責任者</label></div>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={save} disabled={!form.name||saving} style={{...bP,opacity:form.name&&!saving?1:0.4}}>{saving?"保存中...":(editId?"更新":"登録")}</button>
        {editId&&<button onClick={()=>{setEditId(null);setForm({name:"",role:"医療事務",type:"正社員",isLead:false,weeklyLimit:""});}} style={bS}>キャンセル</button>}
      </div>
    </div>
    <div style={{...crd,padding:"10px 14px",marginBottom:"0.5rem"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <input value={filterName} onChange={e=>setFilterName(e.target.value)} placeholder="名前・社員番号で検索" style={{...iS,width:180}}/>
        <select value={filterRole} onChange={e=>setFilterRole(e.target.value)} style={{...iS,width:"auto"}}>
          <option value="">全職種</option>{ROLES.map(r=><option key={r}>{r}</option>)}
        </select>
        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{...iS,width:"auto"}}>
          <option value="">全雇用形態</option>{TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>並び替え：</span>
          {[["id","社員番号"],["role","職種"],["type","雇用形態"]].map(([k,l])=>{
            const idx=sortKeys.indexOf(k);
            const sel=idx>=0;
            return <button key={k} onClick={()=>toggleSort(k)} style={{padding:"4px 10px",borderRadius:6,border:sel?"2px solid #1251a3":"1px solid var(--color-border-secondary)",background:sel?"#E6F1FB":"var(--color-background-primary)",color:sel?"#1251a3":"var(--color-text-secondary)",fontSize:12,cursor:"pointer",fontWeight:sel?600:400}}>
              {sel&&<span style={{fontSize:10,background:"#1251a3",color:"white",borderRadius:"50%",padding:"0 4px",marginRight:3}}>{idx+1}</span>}{l}
            </button>;
          })}
        </div>
      </div>
    </div>
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>{["社員番号","氏名","職種","雇用形態","週労働時間","責任者","PW操作","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{(()=>{
          let list=[...emps];
          if(filterName) list=list.filter(e=>e.name.includes(filterName)||String(e.id).includes(filterName));
          if(filterRole) list=list.filter(e=>e.role===filterRole);
          if(filterType) list=list.filter(e=>e.type===filterType);
          list.sort((a,b)=>{
            for(const sk of sortKeys){
              let diff=0;
              if(sk==="role") diff=ROLES.indexOf(a.role)-ROLES.indexOf(b.role);
              else if(sk==="type") diff=TYPES.indexOf(a.type)-TYPES.indexOf(b.type);
              else diff=String(a.id).localeCompare(String(b.id));
              if(diff!==0) return diff;
            }
            return 0;
          });
          return list;
        })().map((emp,i)=>{
          const [bg,tc]=AVATAR_COLORS[i%AVATAR_COLORS.length];
          const isPwEdit=pwEditId===emp.id;
          return <tr key={emp.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
            <td style={{...tdS,fontSize:15,color:"var(--color-text-secondary)",fontFamily:"monospace",fontWeight:600}}>{emp.id}</td>
            <td style={tdS}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:34,height:34,borderRadius:"50%",background:bg,color:tc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:600}}>{emp.name[0]}</div>{emp.name}</div></td>
            <td style={{...tdS,color:"var(--color-text-secondary)"}}>{emp.role}</td>
            <td style={tdS}>{emp.type}</td>
            <td style={{...tdS,textAlign:"center",color:emp.weeklyLimit?"#1251a3":"var(--color-text-tertiary)"}}>{emp.type==="正社員"&&emp.weeklyLimit?emp.weeklyLimit+"h":"―"}</td>
            <td style={{...tdS,textAlign:"center"}}>{(isLeadVal(emp.isLead))?<Badge label="★責任者" bg="#FAEEDA" color="#854F0B"/>:"―"}</td>
            <td style={tdS}>
              {isPwEdit
                ?<div style={{display:"flex",gap:4,alignItems:"center"}}>
                  <input type="password" maxLength={4} value={newPw} onChange={e=>setNewPw(e.target.value.replace(/\D/g,""))} placeholder="4桁" style={{...iS,width:70,fontSize:13,padding:"4px 6px"}}/>
                  <button onClick={()=>savePw(emp.id)} disabled={newPw.length!==4} style={{...bP,padding:"3px 10px",fontSize:11,opacity:newPw.length===4?1:0.4}}>保存</button>
                  <button onClick={()=>{setPwEditId(null);setNewPw("");}} style={{...bS,padding:"3px 8px",fontSize:11}}>取消</button>
                </div>
                :<div style={{display:"flex",gap:4}}>
                  <button onClick={()=>{setPwEditId(emp.id);setNewPw("");}} style={{padding:"3px 8px",borderRadius:6,border:"0.5px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:11,cursor:"pointer"}}>変更</button>
                  <button onClick={()=>resetPw(emp)} style={{padding:"3px 8px",borderRadius:6,border:"0.5px solid #F09595",background:"#FFF5F5",color:"#A32D2D",fontSize:11,cursor:"pointer"}}>初期化</button>
                </div>}
            </td>
            <td style={tdS}><div style={{display:"flex",gap:6}}><button onClick={()=>startEdit(emp)} style={{...bS,padding:"3px 10px",fontSize:11}}>編集</button><button onClick={()=>del(emp)} style={bD}>削除</button></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}


// ── ShiftSettingTab（シフト定義＋週間パターンのサブタブ） ────────────────────
function ShiftSettingTab({shiftDefsData,weekPatterns,emps,shifts,lvReqs,reload,limitDepts=null,leadRoles=null,onSavingChange=null,initialSub="def"}){
  const [sub,setSub]=useState(initialSub);
  useEffect(()=>{setSub(initialSub);},[initialSub]);
  return <div>
    <div style={{display:"flex",gap:0,marginBottom:"1rem",borderBottom:"2px solid var(--color-border-tertiary)"}}>
      {[["def","シフト定義"],["pattern","週間パターン"]].map(([k,l])=>(
        <button key={k} onClick={()=>setSub(k)} style={{padding:"8px 20px",border:"none",borderBottom:sub===k?"2.5px solid #1251a3":"2.5px solid transparent",background:"transparent",color:sub===k?"#1251a3":"var(--color-text-secondary)",fontWeight:sub===k?700:400,fontSize:14,cursor:"pointer",marginBottom:"-2px"}}>
          {l}
        </button>
      ))}
    </div>
    {sub==="def"&&<ShiftDefManager shiftDefsData={shiftDefsData} reload={reload} limitDepts={limitDepts} onSavingChange={onSavingChange}/>}
    {sub==="pattern"&&<WeekPatternManager weekPatterns={weekPatterns} emps={emps} shifts={shifts} lvReqs={lvReqs} shiftDefsData={shiftDefsData} reload={reload} limitRoles={leadRoles}/>}
  </div>;
}

// ── WeekPatternManager ────────────────────────────────────────────────────────
const DOW_LABELS=["月","火","水","木","金","土","日"];
const DOW_KEY_ORDER=["mon","tue","wed","thu","fri","sat","sun"];

function WeekPatternManager({weekPatterns,emps,shifts,lvReqs,shiftDefsData,reload,limitRoles=null}){
  const visibleRoles=limitRoles||ROLES;
  const [activeRole,setActiveRole]=useState(limitRoles?limitRoles[0]:ROLES[0]);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:"",mon:"off",tue:"off",wed:"off",thu:"off",fri:"off",sat:"off",sun:"off"});
  // 適用パネル
  const [applyPatId,setApplyPatId]=useState("");
  const [applyEmpId,setApplyEmpId]=useState("");
  const [applyYear,setApplyYear]=useState(new Date().getFullYear());
  const [applyMonth,setApplyMonth]=useState(new Date().getMonth()+1);
  const [applyMsg,setApplyMsg]=useState("");

  const rolePatterns=weekPatterns.filter(p=>p.role===activeRole);
  const roleEmps=emps.filter(e=>e.role===activeRole);
  const currentShiftDefs=getShiftDefsByDept(ROLE_TO_DEPT[activeRole]||"理学療法士",shiftDefsData);
  const shiftKeys=["off",...Object.keys(currentShiftDefs).filter(k=>k!=="off")];

  const startEdit=(p)=>{setEditId(p.id);setForm({name:p.name,mon:p.mon||"off",tue:p.tue||"off",wed:p.wed||"off",thu:p.thu||"off",fri:p.fri||"off",sat:p.sat||"off",sun:p.sun||"off"});};
  const resetForm=()=>{setEditId(null);setForm({name:"",mon:"off",tue:"off",wed:"off",thu:"off",fri:"off",sat:"off",sun:"off"});};

  const save=async()=>{
    if(!form.name)return;
    const data=convertTo({id:editId||newId(),role:activeRole,...form},WEEK_PAT_INV);
    try{await gasSave("週間パターン",data);resetForm();await reload();}catch(e){alert("保存失敗："+e.message);}
  };

  const del=async(id)=>{
    if(!confirm("このパターンを削除しますか？"))return;
    try{await gasDelete("週間パターン",id);await reload();}catch(e){alert("削除失敗："+e.message);}
  };

  const applyPattern=async()=>{
    if(!applyPatId||!applyEmpId){alert("パターンと従業員を選択してください");return;}
    const pat=weekPatterns.find(p=>p.id===applyPatId);if(!pat)return;
    // ② 翌月以降のみ適用
    const now=new Date();
    const curYM=now.getFullYear()*100+now.getMonth()+1;
    const selYM=applyYear*100+applyMonth;
    if(selYM<=curYM){alert("パターン適用は翌月以降の月を選択してください");return;}
    const last=daysInMonth(applyYear,applyMonth);
    // 承認済み有休の日付セット
    const lockedDates=new Set(lvReqs.filter(r=>String(r.empId)===String(applyEmpId)&&r.status==="approved").map(r=>r.date));
    const entries=[];
    for(let d=1;d<=last;d++){
      const ds=`${applyYear}-${pad(applyMonth)}-${pad(d)}`;
      if(lockedDates.has(ds)) continue; // 承認済み有休はスキップ
      if(isHoliday(ds)) continue; // 祝日はスキップ
      const dow=new Date(applyYear,applyMonth-1,d).getDay(); // 0=日〜6=土
      const dowKey=DOW_KEY_ORDER[dow===0?6:dow-1]; // mon=0...sun=6
      const shiftType=pat[dowKey]||"off";
      const existing=shifts.find(s=>String(s.empId)===String(applyEmpId)&&s.date===ds);
      entries.push({id:existing?.id||newId(),empId:applyEmpId,date:ds,shiftType});
    }
    if(entries.length===0){setApplyMsg("適用できる日がありません");return;}
    try{
      await gasSaveMany("シフト",entries.map(e=>convertTo(e,SHIFT_INV)));
      await reload();
      setApplyMsg(`${entries.length}日分のシフトを適用しました`);
      setTimeout(()=>setApplyMsg(""),4000);
    }catch(e){alert("適用失敗："+e.message);}
  };

  return <div>
    {/* 職種タブ */}
    {visibleRoles.length>1&&<div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
      {visibleRoles.map(r=><button key={r} onClick={()=>{setActiveRole(r);resetForm();}} style={{padding:"6px 16px",borderRadius:8,border:activeRole===r?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:activeRole===r?"#E6F1FB":"var(--color-background-primary)",color:activeRole===r?"#185FA5":"var(--color-text-secondary)",fontSize:12,cursor:"pointer",fontWeight:activeRole===r?500:400}}>{r}</button>)}
    </div>}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
      {/* 左：パターン登録 */}
      <div style={{...crd,padding:"1rem 1.25rem"}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>{editId?"パターン編集":"パターン登録"}（{activeRole}）</div>
        <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>パターン名</div>
          <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="例：正社員A" style={iS}/></div>
        <div style={{marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>曜日ごとのシフト</span>
            <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>週合計：<strong style={{color:"#1251a3",fontSize:14}}>{(()=>{
              return DOW_KEY_ORDER.reduce((sum,dk)=>{
                const def=currentShiftDefs[form[dk]];
                if(!def||!def.start||!def.end) return sum;
                const bk=def.breakMin!=null?def.breakMin:0;
                return sum+(toMin(def.end)-toMin(def.start)-bk);
              },0);
            })()/ 60}h</strong></span>
          </div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>{DOW_LABELS.map(d=><th key={d} style={{...thS,textAlign:"center",padding:"6px 4px"}}>{d}</th>)}</tr></thead>
            <tbody><tr>{DOW_KEY_ORDER.map(dk=>(
              <td key={dk} style={{padding:"4px 2px",borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <select value={form[dk]} onChange={e=>setForm(p=>({...p,[dk]:e.target.value}))} style={{...iS,fontSize:11,padding:"4px 4px",textAlign:"center"}}>
                  {shiftKeys.map(k=><option key={k} value={k}>{currentShiftDefs[k]?.label||k}</option>)}
                </select>
              </td>
            ))}</tr>
            <tr>{DOW_KEY_ORDER.map(dk=>{
              const def=currentShiftDefs[form[dk]];
              const hasTime=def&&def.start&&def.end;
              const bk=hasTime?(def.breakMin!=null?def.breakMin:0):0;
              const min=hasTime?toMin(def.end)-toMin(def.start)-bk:0;
              return <td key={dk} style={{padding:"2px",textAlign:"center",fontSize:10,color:min>0?"#1251a3":"var(--color-text-tertiary)"}}>
                {min>0?`${Math.floor(min/60)}h${min%60>0?`${min%60}m`:""}`:"-"}
              </td>;
            })}</tr>
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={save} disabled={!form.name} style={{...bP,opacity:form.name?1:0.4}}>{editId?"更新":"登録"}</button>
          {editId&&<button onClick={resetForm} style={bS}>キャンセル</button>}
        </div>
      </div>
      {/* 右：パターン一覧 */}
      <div style={{...crd,overflow:"hidden"}}>
        <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>パターン一覧（{activeRole}）<span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)",marginLeft:6}}>{rolePatterns.length}件</span></div>
        {rolePatterns.length===0?<div style={{padding:"1.5rem",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>パターンがありません</div>:
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr><th style={thS}>パターン名</th>{DOW_LABELS.map(d=><th key={d} style={{...thS,textAlign:"center"}}>{d}</th>)}<th style={thS}>操作</th></tr></thead>
          <tbody>{rolePatterns.map(p=>(
            <tr key={p.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              <td style={{...tdS,fontWeight:600}}>{p.name}</td>
              {DOW_KEY_ORDER.map(dk=>{
                const def=currentShiftDefs[p[dk]||"off"]||currentShiftDefs.off;
                return <td key={dk} style={{...tdS,textAlign:"center",padding:"6px 2px"}}>
                  <span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:def?.color,color:def?.tc}}>{def?.label||p[dk]||"休日"}</span>
                </td>;
              })}
              <td style={tdS}><div style={{display:"flex",gap:4}}>
                <button onClick={()=>startEdit(p)} style={{...bS,padding:"3px 8px",fontSize:11}}>編集</button>
                <button onClick={()=>del(p.id)} style={bD}>削除</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table>}
      </div>
    </div>
    {/* パターン適用 */}
    <div style={{...crd,padding:"1rem 1.25rem"}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>パターン適用</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,marginBottom:12}}>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>パターン</div>
          <select value={applyPatId} onChange={e=>setApplyPatId(e.target.value)} style={iS}>
            <option value="">選択してください</option>
            {rolePatterns.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>従業員</div>
          <select value={applyEmpId} onChange={e=>setApplyEmpId(e.target.value)} style={iS}>
            <option value="">選択してください</option>
            {roleEmps.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>適用月</div>
          <div style={{display:"flex",gap:4}}>
            <select value={applyYear} onChange={e=>setApplyYear(+e.target.value)} style={{...iS,width:"auto"}}>
              {[2024,2025,2026,2027,2028].map(y=><option key={y}>{y}</option>)}
            </select>
            <select value={applyMonth} onChange={e=>setApplyMonth(+e.target.value)} style={{...iS,width:"auto"}}>
              {Array.from({length:12},(_,i)=>i+1).map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"flex-end"}}>
          <button onClick={applyPattern} disabled={!applyPatId||!applyEmpId} style={{...bP,opacity:applyPatId&&applyEmpId?1:0.4}}>適用する</button>
        </div>
      </div>
      {applyMsg&&<div style={{padding:"8px 12px",background:"#EAF3DE",borderRadius:8,fontSize:13,color:"#3B6D11"}}>{applyMsg}</div>}
      <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginTop:8}}>※承認済み有休のセルはスキップされます。既存シフトは上書きされます。</div>
    </div>
  </div>;
}


// ── ShiftDefManager ───────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  ["#ffffff","#1251a3"],
  ["#E6F1FB","#185FA5"],["#EAF3DE","#3B6D11"],["#FAEEDA","#854F0B"],
  ["#E1F5EE","#0F6E56"],["#FAECE7","#993C1D"],["#EEEDFE","#3C3489"],
  ["#FEF9E7","#7D6608"],["#F5EEF8","#6C3483"],["#FDEDEC","#922B21"],
];

function ShiftDefManager({shiftDefsData,reload,limitDepts=null,onSavingChange=null}){
  const depts=limitDepts&&limitDepts.length>0?limitDepts:Object.keys(DEPT_GROUPS);
  const [activeDept,setActiveDept]=useState(depts[0]);
  const rawDefs=shiftDefsData?.[activeDept]||DEFAULT_SHIFT_DEFS_BY_DEPT[activeDept]||{};
  // 楽観的更新用ローカルstate
  const [localDefs,setLocalDefs]=useState(null);
  const deptDefs=localDefs||rawDefs;
  // 順番でソートした配列を保持
  const [sortedKeys,setSortedKeys]=useState(null);
  const orderedKeys=sortedKeys||Object.keys(deptDefs).sort((a,b)=>(deptDefs[a]?._order||999)-(deptDefs[b]?._order||999));
  const [form,setForm]=useState({key:"",label:"",start:"",end:"",color:"#E6F1FB",tc:"#185FA5",origKey:"",breakMin:0});
  const [editKey,setEditKey]=useState(null),[saving,setSaving]=useState(false);
  const [dragIdx,setDragIdx]=useState(null),[dragOverIdx,setDragOverIdx]=useState(null);
  const [orderChanged,setOrderChanged]=useState(false),[savingOrder,setSavingOrder]=useState(false);
  const isSaving=saving||savingOrder;

  // rawDefsが変わったらlocalDefsをリセット
  const rawDefsStr=JSON.stringify(rawDefs);
  useEffect(()=>{setLocalDefs(null);setSortedKeys(null);},[rawDefsStr,activeDept]);

  // 部署切替時にリセット
  const switchDept=d=>{setActiveDept(d);resetForm();setSortedKeys(null);setOrderChanged(false);setLocalDefs(null);};

  const startEdit=(k,v)=>{setEditKey(k);setForm({key:k,label:v.label||"",start:v.start!=null?String(v.start):"",end:v.end!=null?String(v.end):"",color:v.color||"#E6F1FB",tc:v.tc||"#185FA5",origKey:k,breakMin:v.breakMin!=null?Number(v.breakMin):0});}
  const resetForm=()=>{setEditKey(null);setForm({key:"",label:"",start:"",end:"",color:"#E6F1FB",tc:"#185FA5",origKey:"",breakMin:0});}

  const save=async()=>{
    if(!form.key||!form.label)return;
    setSaving(true);
    onSavingChange&&onSavingChange(true);
    const origKey=form.origKey||editKey;
    const isKeyChanged=editKey&&form.key!==origKey;
    const existing=deptDefs[origKey]||deptDefs[form.key];
    const order=existing?._order||orderedKeys.indexOf(origKey||form.key)+1||orderedKeys.length+1;
    const newEntry={_id:existing?._id||newId(),_order:order,label:form.label,start:form.start||null,end:form.end||null,color:form.color,tc:form.tc,breakMin:form.breakMin===""?0:Number(form.breakMin)};
    // 楽観的更新：即座にローカルstateへ反映
    const curDefs=localDefs||rawDefs;
    const updated={...curDefs};
    if(isKeyChanged&&origKey&&updated[origKey]) delete updated[origKey];
    updated[form.key]=newEntry;
    setLocalDefs(updated);
    if(isKeyChanged) setSortedKeys(null);
    resetForm();
    try{
      const data=convertTo({
        id:newEntry._id,dept:activeDept,key:form.key,label:form.label,
        start:form.start||null,end:form.end||null,
        color:form.color,tc:form.tc,order,breakMin:form.breakMin===""?0:Number(form.breakMin)
      },SHIFTDEF_INV);
      await gasSave("シフト定義",data);
      if(isKeyChanged){
        const shiftsToUpdate=await gasGet("シフト").catch(()=>[]);
        const targets=shiftsToUpdate.filter(s=>s["シフト種別"]===origKey);
        if(targets.length>0){
          await Promise.all(targets.map(s=>gasSave("シフト",{...s,"シフト種別":form.key})));
        }
      }
      await reload();
      setLocalDefs(null);
    }catch(e){setLocalDefs(null);alert("保存失敗："+e.message);}
    setSaving(false);
    onSavingChange&&onSavingChange(false);
  };

  const del=async k=>{
    if(k==="off"){alert("休日シフトは削除できません");return;}
    if(!confirm(`「${deptDefs[k]?.label}」を削除しますか？`))return;
    // 楽観的更新
    const curDefs=localDefs||rawDefs;
    const updated={...curDefs};
    delete updated[k];
    setLocalDefs(updated);
    setSortedKeys(null);
    try{
      const id=deptDefs[k]?._id;
      if(id)await gasDelete("シフト定義",id);
      await reload();
      setLocalDefs(null);
    }catch(e){setLocalDefs(null);alert("削除失敗："+e.message);}
  };

  // ドラッグ&ドロップ：画面のみ更新（GAS保存はボタンで）
  const onDragStart=i=>{setDragIdx(i);};
  const onDragOver=(e,i)=>{e.preventDefault();setDragOverIdx(i);};
  const onDrop=()=>{
    if(dragIdx===null||dragOverIdx===null||dragIdx===dragOverIdx){setDragIdx(null);setDragOverIdx(null);return;}
    const newOrder=[...orderedKeys];
    const [moved]=newOrder.splice(dragIdx,1);
    newOrder.splice(dragOverIdx,0,moved);
    setSortedKeys(newOrder);
    setOrderChanged(true);
    setDragIdx(null);setDragOverIdx(null);
  };

  // 「順番を保存」ボタン（楽観的更新：即座に確定、裏で保存）
  const saveOrder=async()=>{
    if(!sortedKeys)return;
    setSavingOrder(true);
    onSavingChange&&onSavingChange(true);
    // 即座にUIを確定（orderChangedをfalseに）
    setOrderChanged(false);
    try{
      // 裏で順番を保存（reloadなし）
      await Promise.all(sortedKeys.map((k,i)=>{
        const v=deptDefs[k];if(!v?._id)return Promise.resolve();
        const data=convertTo({id:v._id,dept:activeDept,key:k,label:v.label,start:v.start||null,end:v.end||null,color:v.color,tc:v.tc,order:i+1,breakMin:(v.breakMin!=null&&v.breakMin!=="")? v.breakMin:0},SHIFTDEF_INV);
        return gasSave("シフト定義",data);
      }));
      // 保存完了後にreloadして_orderを更新
      await reload();
      setSortedKeys(null);
    }catch(e){
      // 失敗時は元に戻す
      setOrderChanged(true);
      alert("順番保存失敗："+e.message);
    }
    setSavingOrder(false);
    onSavingChange&&onSavingChange(false);
  };

  return <div style={{position:"relative"}}>
    {isSaving&&<div style={{position:"fixed",top:0,left:0,width:"100vw",height:"100vh",background:"rgba(0,0,0,0.35)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"white",borderRadius:16,padding:"2rem 3rem",textAlign:"center",boxShadow:"0 8px 32px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:18,fontWeight:700,color:"#1251a3",marginBottom:8}}>保存中...</div>
        <div style={{fontSize:14,color:"#4b5563"}}>完了するまでしばらくお待ちください</div>
      </div>
    </div>}
    {depts.length>1&&<div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
      {depts.map(d=><button key={d} onClick={()=>switchDept(d)} style={{padding:"6px 16px",borderRadius:8,border:activeDept===d?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:activeDept===d?"#E6F1FB":"var(--color-background-primary)",color:activeDept===d?"#185FA5":"var(--color-text-secondary)",fontSize:12,cursor:"pointer",fontWeight:activeDept===d?500:400}}>{DEPT_GROUPS[d].label}</button>)}
    </div>}
    {limitDepts&&limitDepts.length>0&&<div style={{marginBottom:"1rem",padding:"6px 12px",background:"#FAEEDA",borderRadius:8,fontSize:12,color:"#854F0B"}}>★ 担当部署のシフト定義のみ編集できます</div>}
    <div style={{...crd,padding:"1rem 1.25rem",marginBottom:"1rem"}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>{editKey?"編集":"新規追加"}（{DEPT_GROUPS[activeDept]?.label}）</div>
      <div style={{marginBottom:12,padding:"10px 14px",background:"#F0F4FF",borderRadius:8,fontSize:11,lineHeight:1.7}}>
        <div style={{fontWeight:700,color:"#1251a3",marginBottom:4}}>📋 有休シフトのキー命名ルール</div>
        <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
          <thead><tr>{["キーの先頭","扱い","入力方法"].map(h=><th key={h} style={{padding:"3px 8px",background:"#E6F1FB",color:"#1251a3",fontWeight:600,textAlign:"left",border:"1px solid #c7d8f5"}}>{h}</th>)}</tr></thead>
          <tbody>{[
            ["designated","指定休（全日有休）","開始・終了時刻は不要"],
            ["leave","全日有休","開始・終了時刻は不要"],
            ["leave_am","午前休（0.5日有休）","出勤する午後の時間を入力（例：13:00〜17:30）"],
            ["leave_pm","午後休（0.5日有休）","出勤する午前の時間を入力（例：08:30〜12:30）"],
          ].map(([k,t,m])=><tr key={k} style={{borderBottom:"1px solid #dce8fa"}}>
            <td style={{padding:"3px 8px",fontFamily:"monospace",color:"#1251a3",border:"1px solid #c7d8f5"}}>{k}…</td>
            <td style={{padding:"3px 8px",border:"1px solid #c7d8f5"}}>{t}</td>
            <td style={{padding:"3px 8px",color:"#4b5563",border:"1px solid #c7d8f5"}}>{m}</td>
          </tr>)}
          </tbody>
        </table>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>キー（英数字）</div>
          <input value={form.key} onChange={e=>setForm(p=>({...p,key:e.target.value.replace(/[^a-zA-Z0-9_]/g,"")}))} placeholder="例：night" style={iS}/></div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>名前</div>
          <input value={form.label} onChange={e=>setForm(p=>({...p,label:e.target.value}))} placeholder="例：夜勤" style={iS}/></div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>開始時刻</div>
          <input type="time" value={form.start} onChange={e=>setForm(p=>({...p,start:e.target.value}))} style={iS}/></div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>終了時刻</div>
          <input type="time" value={form.end} onChange={e=>setForm(p=>({...p,end:e.target.value}))} style={iS}/></div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>休憩（分）</div>
          <input type="number" min="0" max="180" value={form.breakMin} onChange={e=>setForm(p=>({...p,breakMin:e.target.value}))} placeholder="0" style={iS}/></div>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:6}}>カラー（プリセット）</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {COLOR_PRESETS.map(([bg,tc],i)=>(
            <div key={i} onClick={()=>setForm(p=>({...p,color:bg,tc}))}
              style={{width:32,height:32,borderRadius:8,background:bg,border:form.color===bg?"2px solid #185FA5":"1px solid var(--color-border-secondary)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:11,color:tc,fontWeight:500}}>A</span>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>背景:</div>
            <input type="color" value={form.color} onChange={e=>setForm(p=>({...p,color:e.target.value}))} style={{width:32,height:32,border:"none",padding:0,cursor:"pointer",borderRadius:4}}/>
            <div style={{fontSize:11,color:"var(--color-text-secondary)"}}>文字:</div>
            <input type="color" value={form.tc} onChange={e=>setForm(p=>({...p,tc:e.target.value}))} style={{width:32,height:32,border:"none",padding:0,cursor:"pointer",borderRadius:4}}/>
          </div>
        </div>
      </div>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>プレビュー</div>
        <span style={{padding:"3px 10px",borderRadius:6,background:form.color,color:form.tc,fontSize:12,fontWeight:500}}>
          {form.label||"名前"}{form.start&&form.end?` (${form.start}〜${form.end})`:""}
        </span>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={save} disabled={!form.key||!form.label||saving} style={{...bP,opacity:form.key&&form.label&&!saving?1:0.4}}>{saving?"保存中...":(editKey?"更新":"追加")}</button>
        {editKey&&<button onClick={resetForm} style={bS}>キャンセル</button>}
      </div>
    </div>
    <div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span>シフト一覧（{DEPT_GROUPS[activeDept]?.label}） <span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)"}}>{orderedKeys.length}件</span></span>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>☰ ドラッグで並び替え</span>
          {orderChanged&&<button onClick={saveOrder} disabled={savingOrder} style={{...bP,padding:"4px 12px",fontSize:11,opacity:savingOrder?0.5:1}}>{savingOrder?"保存中...":"順番を保存"}</button>}
        </div>
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>{["","プレビュー","キー","名前","時間","休憩","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{orderedKeys.map((k,i)=>{
          const v=deptDefs[k];if(!v)return null;
          const isDragOver=dragOverIdx===i;
          return <tr key={k}
            draggable
            onDragStart={()=>onDragStart(i)}
            onDragOver={e=>onDragOver(e,i)}
            onDrop={onDrop}
            onDragEnd={()=>{setDragIdx(null);setDragOverIdx(null);}}
            style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:isDragOver?"#E6F1FB":dragIdx===i?"#f0f0f0":"",cursor:"grab",transition:"background 0.1s"}}>
            <td style={{...tdS,color:"var(--color-text-tertiary)",fontSize:16,textAlign:"center",width:32}}>☰</td>
            <td style={tdS}><span style={{padding:"3px 10px",borderRadius:6,background:v.color,color:v.tc,fontSize:12,fontWeight:500}}>{v.label}</span></td>
            <td style={{...tdS,fontFamily:"monospace",fontSize:12,color:"var(--color-text-secondary)"}}>{k}</td>
            <td style={tdS}>{v.label}</td>
            <td style={{...tdS,color:"var(--color-text-secondary)"}}>{v.start&&v.end?`${v.start}〜${v.end}`:"―"}</td>
            <td style={{...tdS,color:"var(--color-text-secondary)"}}>{(v.breakMin!=null&&v.breakMin!=="")? v.breakMin+"分":"0分"}</td>
            <td style={tdS}><div style={{display:"flex",gap:6}}>
              <button onClick={()=>startEdit(k,v)} style={{...bS,padding:"3px 10px",fontSize:11}}>編集</button>
              {k!=="off"&&<button onClick={()=>del(k)} style={bD}>削除</button>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

// ── ShiftCalendar ─────────────────────────────────────────────────────────────
function ShiftCalendar({emps,shifts:shiftsFromProps,shiftDefsData,reload,leadRoles:initLeadRoles=null,lvReqs=[],onGotoShiftSetting=null,onGotoPattern=null}){
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth()+1);
  const [tooltip,setTooltip]=useState(null); // {x,y,lines[]}
  // localEdits: ローカルで編集中の差分 key:"empId_date" → shiftType
  const [localEdits,setLocalEdits]=useState({});
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const hasEdits=Object.keys(localEdits).length>0;
  // shiftsFromPropsとlocalEditsをマージして表示
  const shifts=shiftsFromProps.map(s=>{
    const key=String(s.empId)+"_"+s.date;
    return localEdits[key]!==undefined?{...s,shiftType:localEdits[key]}:s;
  }).concat(
    Object.entries(localEdits)
      .filter(([key])=>!shiftsFromProps.some(s=>String(s.empId)+"_"+s.date===key))
      .map(([key,shiftType])=>{
        const [empId,date]=key.split("_");
        return {id:newId(),empId,date,shiftType};
      })
  );
  const visibleRoles=initLeadRoles||ROLES;
  // シフト画面の職種ボタン（リハマネとATを「リハマネ・AT」に統合）
  const toDisplayRole=r=>(r==="リハマネ"||r==="AT")?"リハマネ・AT":r;
  const DISPLAY_ROLES=initLeadRoles
    ?[...new Set(initLeadRoles.map(toDisplayRole))]
    :["医療事務","理学療法士","看護師","リハマネ・AT","放射線技師"];
  const [roleFilter,setRoleFilter]=useState(initLeadRoles?toDisplayRole(initLeadRoles[0]):null);
  const [typeFilter,setTypeFilter]=useState(null);
  // roleFilterからの実際のrole配列（リハマネ・ATは2職種）
  const filterRoles=roleFilter==="リハマネ・AT"?["リハマネ","AT"]:roleFilter?[roleFilter]:null;
  const isPTFilter=roleFilter==="理学療法士";
  // 在院数表示対象：選択職種の全従業員
  const slotEmps=filterRoles?emps.filter(e=>filterRoles.includes(e.role)):[];
  // 全職種表示時はvisibleRolesをもとに全role展開
  const allVisibleRoles=visibleRoles.flatMap(r=>(r==="リハマネ"||r==="AT")?["リハマネ","AT"]:[r]);
  const filteredEmps=(()=>{
    const byRole=filterRoles?emps.filter(e=>filterRoles.includes(e.role)):emps.filter(e=>allVisibleRoles.includes(e.role));
    return typeFilter?byRole.filter(e=>e.type===typeFilter):byRole;
  })();
  const currentDept=roleFilter?ROLE_TO_DEPT[roleFilter==="リハマネ・AT"?"リハマネ":roleFilter]||"理学療法士":null;
  const getEmpShiftDefs=emp=>getShiftDefsByRole(emp.role,shiftDefsData);
  const currentShiftDefs=currentDept?getShiftDefsByDept(currentDept,shiftDefsData):getShiftDefsByDept("理学療法士",shiftDefsData);
  const [selectedShift,setSelectedShift]=useState(Object.keys(currentShiftDefs)[0]||"day");
  const last=daysInMonth(year,month),days=Array.from({length:last},(_,i)=>i+1);

  const getShift=(empId,d)=>{
    const ds=`${year}-${pad(month)}-${pad(d)}`;
    return shifts.find(s=>String(s.empId)===String(empId)&&s.date===ds)?.shiftType||"off";
  };
  // セルクリック：ローカルに記録するだけ（GAS呼び出しなし）
  const setCell=(empId,d)=>{
    const ds=`${year}-${pad(month)}-${pad(d)}`;
    // 承認済み有休がある日はロック
    const lockedByLeave=lvReqs.some(r=>String(r.empId)===String(empId)&&r.date===ds&&r.status==="approved");
    if(lockedByLeave){alert("この日は有休が承認済みのためシフト変更できません。\n有給管理から承認済み有休を取り消してください。");return;}
    const key=String(empId)+"_"+ds;
    const current=shifts.find(s=>String(s.empId)===String(empId)&&s.date===ds)?.shiftType||"off";
    // 同じシフトをクリックしたらoffに（トグル）
    const next=current===selectedShift?"off":selectedShift;
    setLocalEdits(prev=>({...prev,[key]:next}));
  };
  // 保存ボタン：まとめてGASに送信
  const saveAll=async()=>{
    if(!hasEdits||saving) return;
    setSaving(true);
    try{
      const entries=Object.entries(localEdits);
      const dataList=entries.map(([key,shiftType])=>{
        const sepIdx=key.indexOf("_");
        const empId=key.slice(0,sepIdx), date=key.slice(sepIdx+1);
        const existing=shiftsFromProps.find(s=>String(s.empId)===String(empId)&&s.date===date);
        return convertTo({id:existing?.id||newId(),empId,date,shiftType},SHIFT_INV);
      });
      await gasSaveMany("シフト",dataList);
      setSaveMsg("");
      setLocalEdits({});
      await reload();
      // 保存後：過去・当日の有休シフトを即時消化
      const td=today();
      const toProcess=entries.filter(([key,shiftType])=>{
        const sepIdx=key.indexOf("_"); const date=key.slice(sepIdx+1);
        if(!isAnyLeaveShift(shiftType)) return false;
        if(date>td) return false;
        return true;
      });
      if(toProcess.length>0){
        const [lvReqsLatest,leavesLatest]=await Promise.all([
          gasGet("有給申請").catch(()=>[]),
          gasGet("有給").catch(()=>[]),
        ]);
        const lvReqsMapped=lvReqsLatest.map(r=>convertFrom(r,LV_REQ_MAP));
        const leavesMapped=leavesLatest.map(r=>convertFrom(r,LEAVE_MAP));
        for(const [key,shiftType] of toProcess){
          const sepIdx=key.indexOf("_");
          const empId=key.slice(0,sepIdx), date=key.slice(sepIdx+1);
          const already=lvReqsMapped.some(r=>String(r.empId)===String(empId)&&r.date===date&&r.status==="approved");
          if(already) continue;
          const leave=leavesMapped.find(l=>String(l.empId)===String(empId));
          const days=leaveShiftDays(shiftType);
          const rem=calcLeaveRemainingCompat(leave,lvReqsMapped,empId);
          if(rem<days) continue;
          const half=leaveShiftHalf(shiftType);
          const isDesignated=isDesignatedShift(shiftType);
          const reason=isDesignated?"指定有休":"有休";
          const lvReqData=convertTo({id:newId(),empId,date,reason,status:"approved",half:half||""},LV_REQ_INV);
          try{ await gasSaveRaw("有給申請",lvReqData); }catch(e){ console.warn("有給申請保存エラー(継続):",date,e.message); }
        }
        await reload();
      }
    }catch(e){alert("保存失敗："+e.message);}
    setSaving(false);
  };
  // 月切り替え時にlocalEditsをリセット
  const confirmAndChange=(changeFn)=>{
    if(hasEdits&&!confirm("未保存の変更（"+Object.keys(localEdits).length+"件）は破棄されます。月を切り替えますか？")) return;
    setLocalEdits({});
    changeFn();
  };
  const prevM=()=>confirmAndChange(()=>{if(month===1){fetchHolidays(year-1);setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1);});
  const nextM=()=>confirmAndChange(()=>{if(month===12){fetchHolidays(year+1);setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1);});
  // 週グループ（月曜始まり）
  // 先月末の「今月1日が含まれる週」の月曜〜前月末までの日（マイナス日付で管理）
  const firstDowOfMonth=new Date(year,month-1,1).getDay(); // 0=日,1=月...
  // 月曜起算で今月1日の前にある日数（先月分）
  const prevDaysCount=firstDowOfMonth===0?6:firstDowOfMonth-1; // 月曜=0日前, 火曜=1日前...
  const prevYear=month===1?year-1:year;
  const prevMonth=month===1?12:month-1;
  const prevMonthLast=daysInMonth(prevYear,prevMonth);
  // 先月末からprevDaysCount日分をマイナスオフセットで管理（-1から始まる）
  const prevDays=prevDaysCount>0?Array.from({length:prevDaysCount},(_,i)=>-(prevDaysCount-i)):[];
  // prevDaysを含めた全日
  const allDays=[...prevDays,...days];
  const weekGroups=[];
  let wk=[];
  allDays.forEach(d=>{
    wk.push(d);
    const actualDate=d<0?prevMonthLast+d+1:d;
    const actualYear=d<0?prevYear:year;
    const actualMonth=d<0?prevMonth:month;
    const dow=new Date(actualYear,actualMonth-1,actualDate).getDay();
    if(dow===0||(d>0&&d===last)){weekGroups.push([...wk]);wk=[];}
  });
  // 第1週が月曜始まりでない場合の週合計合算
  // 表示はweekGroupsそのまま、合計計算のみ第1週と最終週を合算
  const mergedWeekGroups=weekGroups; // 表示はそのまま
  const getWeekHoursGroup=(empId,wi)=>{
    // 第1週が先月末のみで、最終週と合算する場合
    const firstWeek=weekGroups[0];
    const hasCurrentMonth=firstWeek.some(d=>d>0);
    if(!hasCurrentMonth&&(wi===0||wi===weekGroups.length-1)){
      // 第1週または最終週の場合、両方合算して返す
      const combinedDays=[...firstWeek,...weekGroups[weekGroups.length-1]];
      return calcWeekHours(empId,combinedDays);
    }
    return calcWeekHours(empId,weekGroups[wi]);
  };
  const calcWeekHours=(empId,weekDays)=>{
    const emp=emps.find(e=>String(e.id)===String(empId));
    const empDefs=getEmpShiftDefs(emp||{role:"理学療法士"});
    return weekDays.reduce((sum,d)=>{
      const actualDate=d<0?prevMonthLast+d+1:d;
      const actualYear=d<0?prevYear:year;
      const actualMonth=d<0?prevMonth:month;
      const ds=`${actualYear}-${pad(actualMonth)}-${pad(actualDate)}`;
      const st=shifts.find(s=>String(s.empId)===String(empId)&&s.date===ds)?.shiftType||"off";
      const def=empDefs[st];
      if(def&&def.start&&def.end){ const bk=def.breakMin!=null?def.breakMin:BREAK_MIN; return sum+Math.max(0,toMin(def.end)-toMin(def.start)-bk); }
      return sum;
    },0);
  };
  // 時間帯別在席人数（選択職種の全従業員）
  const calcSlotCount=(d,slot)=>{
    return slotEmps.filter(emp=>{
      const st=getShift(emp.id,d); const def=getEmpShiftDefs(emp)[st];
      return coversSlot(def,slot);
    }).length;
  };
  const tableRef=useRef(null);
  const topScrollRef=useRef(null);
  const bottomScrollRef=useRef(null);
  const syncTop=e=>{if(bottomScrollRef.current)bottomScrollRef.current.scrollLeft=e.currentTarget.scrollLeft;};
  const syncBottom=e=>{if(topScrollRef.current)topScrollRef.current.scrollLeft=e.currentTarget.scrollLeft;};

  return <div>
    {tooltip&&<div style={{position:"fixed",left:tooltip.x,top:tooltip.y,zIndex:99999,background:"#1a1a2e",color:"#fff",fontSize:12,lineHeight:1.7,padding:"8px 12px",borderRadius:10,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.3)",pointerEvents:"none"}}>
      {tooltip.lines.map((l,i)=><div key={i}>{l}</div>)}
    </div>}
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:"1rem",flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}><button onClick={prevM} style={bS}>‹</button><span style={{fontSize:15,fontWeight:500}}>{year}年{month}月</span><button onClick={nextM} style={bS}>›</button></div>
      {hasEdits&&<button onClick={saveAll} disabled={saving} style={{...bP,padding:"8px 18px",background:saving?"#6b7280":"#1251a3",opacity:saving?0.7:1}}>{saving?(saveMsg||"保存中..."):"シフト保存 ("+Object.keys(localEdits).length+"件)"}</button>}
      {hasEdits&&<button onClick={()=>setLocalEdits({})} style={{...bS,color:"#A32D2D",borderColor:"#F09595"}}>変更を破棄</button>}
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {!initLeadRoles&&<button onClick={()=>{setRoleFilter(null);setTypeFilter(null);}} style={{padding:"4px 10px",borderRadius:6,border:!roleFilter?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:!roleFilter?"#E6F1FB":"var(--color-background-primary)",color:!roleFilter?"#185FA5":"var(--color-text-secondary)",fontSize:11,cursor:"pointer",fontWeight:!roleFilter?500:400}}>全職種</button>}
        {DISPLAY_ROLES.map(r=><button key={r} onClick={()=>{setRoleFilter(r===roleFilter&&!initLeadRoles?null:r);setTypeFilter(null);}} style={{padding:"4px 10px",borderRadius:6,border:roleFilter===r?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:roleFilter===r?"#E6F1FB":"var(--color-background-primary)",color:roleFilter===r?"#185FA5":"var(--color-text-secondary)",fontSize:11,cursor:"pointer",fontWeight:roleFilter===r?500:400}}>{r}</button>)}
      </div>
      {isPTFilter&&<div style={{display:"flex",gap:4,alignItems:"center"}}>
        <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>絞り込み：</span>
        {["全て","正社員","パート"].map(t=><button key={t} onClick={()=>setTypeFilter(t==="全て"?null:t)} style={{padding:"4px 10px",borderRadius:6,border:(typeFilter===t||(t==="全て"&&!typeFilter))?"2px solid #854F0B":"0.5px solid var(--color-border-secondary)",background:(typeFilter===t||(t==="全て"&&!typeFilter))?"#FAEEDA":"var(--color-background-primary)",color:(typeFilter===t||(t==="全て"&&!typeFilter))?"#854F0B":"var(--color-text-secondary)",fontSize:11,cursor:"pointer",fontWeight:(typeFilter===t||(t==="全て"&&!typeFilter))?600:400}}>{t}</button>)}
        <span style={{fontSize:10,color:"var(--color-text-tertiary)"}}>※人数は全員で集計</span>
      </div>}
      {!roleFilter&&<span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>職種を選択するとシフト入力できます</span>}
      {roleFilter&&<span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>↓ シフトを選択してセルをクリック</span>}
      {onGotoShiftSetting&&<button onClick={onGotoShiftSetting} style={{marginLeft:"auto",padding:"5px 12px",borderRadius:7,border:"1px solid #1251a3",background:"#E6F1FB",color:"#1251a3",fontSize:11,fontWeight:600,cursor:"pointer"}}>＋ 勤務時間を作る</button>}
      {onGotoPattern&&<button onClick={onGotoPattern} style={{padding:"5px 12px",borderRadius:7,border:"1px solid #3B6D11",background:"#EAF3DE",color:"#3B6D11",fontSize:11,fontWeight:600,cursor:"pointer"}}>＋ パターン入力</button>}
      <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
        <span style={{fontSize:10,color:"var(--color-text-tertiary)"}}>有休：</span>
        <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"#0F6E56",color:"#fff"}}>有休</span>
        <span style={{fontSize:10,color:"var(--color-text-tertiary)"}}>承認済</span>
        <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:99,background:"#854F0B",color:"#fff"}}>申請中</span>
        <span style={{fontSize:10,color:"var(--color-text-tertiary)"}}>承認待ち</span>
      </div>
    </div>
    {roleFilter&&<div style={{...crd,padding:"10px 14px",marginBottom:"1rem",overflowX:"auto"}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {Object.entries(currentShiftDefs)
          .sort((a,b)=>(Number(a[1].order)||999)-(Number(b[1].order)||999))
          .map(([k,v])=>{
            const isSelected=selectedShift===k;
            const hasTime=v.start&&v.end;
            const bk=v.breakMin!=null?v.breakMin:0;
            const workMin=hasTime?toMin(v.end)-toMin(v.start)-bk:0;
            const wH=Math.floor(workMin/60);
            const wM=workMin%60;
            return <div key={k} onClick={()=>setSelectedShift(k)} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:8,background:v.color,border:isSelected?"2.5px solid #1251a3":"2.5px solid transparent",cursor:"pointer",transition:"border-color 0.1s"}}>
              <span style={{fontSize:14,fontWeight:700,color:v.tc}}>{v.label}</span>
              {hasTime&&<span style={{fontSize:12,color:v.tc,opacity:0.85}}>{v.start}〜{v.end}</span>}
              {hasTime&&<span style={{fontSize:12,fontWeight:600,color:v.tc}}>{wH+(wM>0?"."+wM*10/6|0:"")}h</span>}
              {isSelected&&<span style={{fontSize:10,fontWeight:700,color:"#1251a3",background:"rgba(255,255,255,0.8)",borderRadius:4,padding:"1px 4px"}}>✓</span>}
            </div>;
          })}
      </div>
    </div>}
    <div ref={topScrollRef} style={{overflowX:"auto"}} onScroll={syncTop}><div style={{height:12}} ref={el=>{if(el&&tableRef.current)el.style.minWidth=tableRef.current.offsetWidth+"px"}}/></div>
    <div ref={bottomScrollRef} style={{overflowX:"auto"}} onScroll={syncBottom}>
      <table ref={tableRef} style={{borderCollapse:"collapse",fontSize:13,minWidth:1600}}>
        <thead><tr>
          <th style={{...thS,minWidth:120,position:"sticky",left:0,zIndex:2,background:"#fef9f3"}}>従業員</th>
          {mergedWeekGroups.map((wk,wi)=>[
            ...wk.map(d=>{
              const actualDate=d<0?prevMonthLast+d+1:d;
              const actualYear=d<0?prevYear:year;
              const actualMonth=d<0?prevMonth:month;
              const dow=new Date(actualYear,actualMonth-1,actualDate).getDay();
              const ds=`${actualYear}-${pad(actualMonth)}-${pad(actualDate)}`;
              const hn=getHolidayName(ds);
              const isPrev=d<0;
              return <th key={d} style={{padding:"4px 3px",textAlign:"center",borderBottom:"0.5px solid var(--color-border-tertiary)",fontWeight:400,color:isPrev?"#c0c0c0":dow===0||hn?"#A32D2D":dow===6?"#185FA5":"var(--color-text-secondary)",minWidth:52,borderLeft:dow===1?"2px solid #d1d5db":"none",background:isPrev?"#f5f5f5":hn?"#FFF0F0":"inherit"}} title={hn||""}>
                <div style={{fontSize:isPrev?9:undefined}}>{isPrev?prevMonth+"/"+actualDate:actualDate}</div>
                <div style={{fontSize:9}}>{hn?"祝":DOW_JP[dow]}</div>
              </th>;
            }),
            <th key={"w"+wi} style={{padding:"4px 6px",textAlign:"center",borderBottom:"0.5px solid var(--color-border-tertiary)",borderLeft:"2px solid #1251a3",background:"#f0f4ff",fontSize:11,fontWeight:600,color:"#1251a3",minWidth:52,whiteSpace:"nowrap"}}>{"W"+(wi+1)}<br/>{"合計"}</th>
          ])}
        </tr></thead>
        <tbody>
          {filteredEmps.map((emp,i)=>{
            const empShiftDefs=getEmpShiftDefs(emp);
            const weekLimit=emp.weeklyLimit?Number(emp.weeklyLimit):null;
            return <tr key={emp.id}>
              <td style={{padding:"4px 10px",borderBottom:"0.5px solid var(--color-border-tertiary)",whiteSpace:"nowrap",position:"sticky",left:0,background:"var(--color-background-primary)",zIndex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:24,height:24,borderRadius:"50%",background:AVATAR_COLORS[i%AVATAR_COLORS.length][0],color:AVATAR_COLORS[i%AVATAR_COLORS.length][1],display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:500}}>{emp.name[0]}</div>
                  <div><div style={{fontSize:12,fontWeight:600}}>{emp.name.split(" ")[0]}</div>{weekLimit&&<div style={{fontSize:10,color:"#6b7280"}}>{"週"+weekLimit+"h"}</div>}</div>
                </div>
              </td>
              {mergedWeekGroups.map((wk,wi)=>{
                const wMins=getWeekHoursGroup(emp.id,wi);
                const wH=(wMins/60).toFixed(1);
                const over=weekLimit&&(wMins/60)>weekLimit;
                const near=weekLimit&&!over&&(wMins/60)>weekLimit*0.9;
                return [
                  ...wk.map(d=>{
                    const actualDate=d<0?prevMonthLast+d+1:d;
                    const actualYear=d<0?prevYear:year;
                    const actualMonth=d<0?prevMonth:month;
                    const ds=`${actualYear}-${pad(actualMonth)}-${pad(actualDate)}`;
                    const st=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds)?.shiftType||"off";
                    const def=empShiftDefs[st]||empShiftDefs.off||DEFAULT_SHIFT_DEFS_BY_DEPT["理学療法士"].off;
                    const isPrev=d<0;
                    const clickable=!!roleFilter&&!isPrev;
                    const dow=new Date(actualYear,actualMonth-1,actualDate).getDay();
                    // 有休申請の状態を取得（承認済み・承認待ち）
                    const lvReq=!isPrev?lvReqs.find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&(r.status==="approved"||r.status==="pending")):null;
                    const isLocked=!isPrev&&lvReqs.some(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
                    const lvBadge=lvReq?(lvReq.status==="approved"
                      ?{label:"有休",bg:"#0F6E56",tc:"#fff"}
                      :{label:"申請中",bg:"#854F0B",tc:"#fff"})
                      :null;
                    const halfLabel=lvReq?.half==="am"?"午前":lvReq?.half==="pm"?"午後":"全日";
                    const tooltipLines=lvReq?[
                      `📅 ${lvReq.date}`,
                      `種別：${halfLabel}（${lvReq.half?"0.5日":"1日"}）`,
                      `理由：${lvReq.reason||"―"}`,
                      `状態：${lvReq.status==="approved"?"✅ 承認済み":"⏳ 承認待ち"}`,
                    ]:[];
                    const isHol=!isPrev&&!!getHolidayName(ds);
                    return <td key={d} style={{padding:"2px",borderBottom:"0.5px solid var(--color-border-tertiary)",textAlign:"center",cursor:isLocked?"not-allowed":clickable?"pointer":"default",userSelect:"none",borderLeft:dow===1?"2px solid #d1d5db":"none",background:isLocked?"#F0FAF5":isPrev?"#f5f5f5":isHol?"#FFF0F0":"inherit"}} onClick={()=>clickable&&setCell(emp.id,d)}>
                      <div style={{position:"relative",display:"inline-block",width:"100%"}}>
                        <div style={{background:def.color,color:def.tc,borderRadius:4,padding:"3px 4px",fontSize:isPrev?11:15,minWidth:isPrev?36:48,border:"1px solid transparent",fontWeight:400,textAlign:"center",whiteSpace:"nowrap",opacity:isPrev?0.5:1}}>{def.label}</div>
                        {lvBadge&&<div
                          style={{position:"absolute",top:-4,right:-2,background:lvBadge.bg,color:lvBadge.tc,fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:99,whiteSpace:"nowrap",lineHeight:1.4,boxShadow:"0 1px 3px rgba(0,0,0,0.25)",cursor:"default",zIndex:1}}
                          onMouseEnter={e=>{const r=e.currentTarget.getBoundingClientRect();setTooltip({x:r.left,y:r.bottom+6,lines:tooltipLines});}}
                          onMouseLeave={()=>setTooltip(null)}
                          onClick={ev=>ev.stopPropagation()}
                        >{lvBadge.label}</div>}
                      </div>
                    </td>;
                  }),
                  <td key={"w"+wi+"_"+emp.id} style={{padding:"4px 6px",borderBottom:"0.5px solid var(--color-border-tertiary)",textAlign:"center",borderLeft:"2px solid #1251a3",background:over?"#FCEBEB":near?"#FFF8E6":"#f0f4ff"}}>
                    <div style={{fontSize:13,fontWeight:700,color:over?"#A32D2D":near?"#854F0B":"#1251a3"}}>{wH}{"h"}</div>
                    {weekLimit&&<div style={{fontSize:10,color:over?"#A32D2D":"#9ca3af"}}>{"/"+(weekLimit)+"h"}</div>}
                  </td>
                ];
              })}
            </tr>;
          })}
          {roleFilter&&slotEmps.length>0&&PT_TIME_SLOTS.map((slot,si)=>(
            <tr key={"slot"+si} style={{background:"#fef9f3",borderTop:si===0?"2px solid #e9ddd0":"none"}}>
              <td style={{padding:"4px 10px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12,fontWeight:600,color:"#4b5563",whiteSpace:"nowrap",position:"sticky",left:0,background:"#fef9f3",zIndex:1}}>{slot.label}</td>
              {mergedWeekGroups.map((wk,wi)=>[
                ...wk.map(d=>{
                  const actualDate=d<0?prevMonthLast+d+1:d;
                  const actualYear=d<0?prevYear:year;
                  const actualMonth=d<0?prevMonth:month;
                  const cnt=d>0?calcSlotCount(d,slot):0;
                  const dow=new Date(actualYear,actualMonth-1,actualDate).getDay();
                  return <td key={d} style={{padding:"4px 2px",borderBottom:"0.5px solid var(--color-border-tertiary)",textAlign:"center",borderLeft:dow===1?"2px solid #d1d5db":"none",background:d<0?"#f5f5f5":"inherit"}}>
                    <div style={{fontSize:13,fontWeight:600,color:d<0?"#d1d5db":cnt===0?"#d1d5db":cnt<=2?"#854F0B":"#1251a3"}}>{d<0?"":cnt}</div>
                  </td>;
                }),
                <td key={"w"+wi+"s"+si} style={{borderLeft:"2px solid #1251a3",background:"#f0f4ff",borderBottom:"0.5px solid var(--color-border-tertiary)"}}/>
              ])}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}

// ── OTApproval ────────────────────────────────────────────────────────────────
function OTApproval({emps,otReqs,reload}){
  const [typeFilter,setTypeFilter]=useState("all");
  const filteredReqs=typeFilter==="all"?otReqs:otReqs.filter(r=>r.type===typeFilter);
  const pending=filteredReqs.filter(r=>r.status==="pending");
  const done=filteredReqs.filter(r=>r.status!=="pending");
  const decide=async(id,status)=>{
    const req=otReqs.find(r=>r.id===id);if(!req)return;
    try{await gasSave("残業申請",convertTo({...req,status},OT_INV));await reload();}catch(e){alert("更新失敗："+e.message);}
  };
  const empName=id=>emps.find(e=>e.id===id)?.name||id;
  const typeLabel=t=>t==="early"?"早出申請":t==="overtime"?"残業/時間外申請":"申請";
  const Sec=({title,items,showAct})=><div style={{...crd,overflow:"hidden",marginBottom:"1rem"}}>
    <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>{title} <span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)"}}>{items.length}件</span></div>
    {items.length===0?<div style={{padding:"1.5rem",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>該当なし</div>:
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
      <thead><tr>{["従業員","日付","種別","シフト時刻","申請時刻","理由","状態","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
      <tbody>{items.map(r=><tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
        <td style={tdS}>{empName(r.empId)}</td>
        <td style={{...tdS,color:"var(--color-text-secondary)"}}>{r.date}</td>
        <td style={tdS}>{r.type==="early"?<Badge label="早出" bg="#EAF3DE" color="#3B6D11"/>:r.type==="overtime"?<Badge label="残業/時間外" bg="#FAEEDA" color="#854F0B"/>:<Badge label="その他" bg="#E6F1FB" color="#185FA5"/>}</td>
        <td style={tdS}>{r.shiftEnd}</td>
        <td style={{...tdS,fontWeight:500}}>{r.requestedEnd}</td>
        <td style={{...tdS,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--color-text-secondary)"}}>{r.reason}</td>
        <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
        <td style={tdS}>{showAct&&<div style={{display:"flex",gap:6}}><button onClick={()=>decide(r.id,"approved")} style={{padding:"3px 10px",borderRadius:6,background:"#EAF3DE",color:"#3B6D11",border:"none",fontSize:11,cursor:"pointer",fontWeight:500}}>承認</button><button onClick={()=>decide(r.id,"rejected")} style={{padding:"3px 10px",borderRadius:6,background:"#FCEBEB",color:"#A32D2D",border:"none",fontSize:11,cursor:"pointer",fontWeight:500}}>却下</button></div>}</td>
      </tr>)}</tbody>
    </table>}
  </div>;
  return <div>
    <div style={{display:"flex",gap:6,marginBottom:"1rem",flexWrap:"wrap"}}>
      {[["all","すべて"],["early","早出申請"],["overtime","残業/時間外申請"]].map(([v,l])=>(
        <button key={v} onClick={()=>setTypeFilter(v)} style={{padding:"4px 12px",borderRadius:6,border:typeFilter===v?"2px solid #185FA5":"0.5px solid var(--color-border-secondary)",background:typeFilter===v?"#E6F1FB":"var(--color-background-primary)",color:typeFilter===v?"#185FA5":"var(--color-text-secondary)",fontSize:12,cursor:"pointer",fontWeight:typeFilter===v?600:400}}>{l}</button>
      ))}
    </div>
    <Sec title="承認待ち" items={pending} showAct/>
    <Sec title="処理済み" items={done} showAct={false}/>
  </div>;
}

// ── LeaveManager ──────────────────────────────────────────────────────────────
// 15日締め期間ヘルパー
function getPeriodRange(year, month){
  // 対象期間: 前月16日〜当月15日
  const prevYear=month===1?year-1:year;
  const prevMonth=month===1?12:month-1;
  const start=`${prevYear}-${pad(prevMonth)}-16`;
  const end=`${year}-${pad(month)}-15`;
  return {start,end,label:`${prevYear}/${pad(prevMonth)}/16 〜 ${year}/${pad(month)}/15`};
}
function getCurrentPeriod(){
  const d=new Date();
  const y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate();
  // 16日以降は翌月締め期間へ（前月16日〜当月15日 の「当月」が翌月になる）
  if(day>=16){
    const nm=m===12?1:m+1;
    const ny=m===12?y+1:y;
    return {year:ny,month:nm};
  }
  // 1〜15日は当月締め（前月16日〜当月15日）
  return {year:y,month:m};
}

function LeaveManager({emps,leaves,lvReqs,shifts=[],reload,canGrant=true}){
  const cur0=getCurrentPeriod();
  const [sel,setSel]=useState(emps[0]?.id||""),[form,setForm]=useState({days:"",note:"",grantedAt:today()});
  const [editBucket,setEditBucket]=useState(null);
  const [periodYear,setPeriodYear]=useState(cur0.year);
  const [periodMonth,setPeriodMonth]=useState(cur0.month);
  const leave=leaves.find(l=>l.empId===sel)||{granted:0,used:0,records:"[]"};
  const pending=lvReqs.filter(r=>r.status==="pending");
  const empName=id=>emps.find(e=>e.id===id)?.name||id;
  const td=today();
  const allBuckets=calcBucketsWithRemaining(leave?.records,lvReqs,sel).sort((a,b)=>a.grantedAt<b.grantedAt?-1:1);
  const totalRem=calcLeaveRemainingCompat(leave,lvReqs,sel);
  const period=getPeriodRange(periodYear,periodMonth);
  const prevPeriod=()=>{if(periodMonth===1){setPeriodYear(y=>y-1);setPeriodMonth(12);}else setPeriodMonth(m=>m-1);};
  const nextPeriod=()=>{if(periodMonth===12){setPeriodYear(y=>y+1);setPeriodMonth(1);}else setPeriodMonth(m=>m+1);};

  const grant=async()=>{
    const d=+form.days;if(!d||d<=0||d%0.5!==0)return;
    const cur=leaves.find(l=>l.empId===sel);
    const recs=safeParseJSON(cur?.records,[]);
    const grantedAt=form.grantedAt||today();
    const expiresAt=addYears(grantedAt,2);
    const grantId=newId();
    recs.push({type:"grant",id:grantId,days:d,grantedAt,expiresAt,note:form.note});
    // grantedAt 順に並び替え
    recs.sort((a,b)=>{if(a.type!=="grant"||b.type!=="grant") return 0; return (a.grantedAt||"").localeCompare(b.grantedAt||"");});
    // grantのみ保持（use/cancelはlvReqsで動的計算）
    const grantsOnly=recs.filter(r=>r.type==="grant");
    const data=convertTo({id:cur?.id||newId(),empId:sel,granted:(+(cur?.granted||0))+d,used:+(cur?.used||0),records:JSON.stringify(grantsOnly)},LEAVE_INV);
    try{await gasSave("有給",data);setForm({days:"",note:"",grantedAt:today()});await reload();}catch(e){alert("付与失敗："+e.message);}
  };

  const saveBucket=async()=>{
    if(!editBucket)return;
    const {bucketId,days,grantedAt,expiresAt,note}=editBucket;
    const d=+days; if(!d||d<=0||d%0.5!==0){alert("付与日数は0.5日単位で入力してください");return;}
    if(!grantedAt||!expiresAt){alert("日付を入力してください");return;}
    const cur=leaves.find(l=>l.empId===sel);
    const recs=safeParseJSON(cur?.records,[]);
    const target=recs.find(r=>r.type==="grant"&&(r.id||r.date)===bucketId);
    if(!target){alert("付与データが見つかりません");return;}
    const oldDays=target.days||0;
    const daysDiff=d-oldDays;
    target.days=d;
    target.grantedAt=grantedAt;
    target.expiresAt=expiresAt;
    target.note=note||"";
    // remainingは保持しない（動的計算に移行）
    delete target.remaining;
    // grantedAt 順に並び替え、grantのみ保存
    const grantsOnly=recs.filter(r=>r.type==="grant")
      .sort((a,b)=>(a.grantedAt||"").localeCompare(b.grantedAt||""));
    const newGranted=(+(cur?.granted||0))+daysDiff;
    const data=convertTo({id:cur?.id||newId(),empId:sel,granted:Math.max(0,newGranted),used:+(cur?.used||0),records:JSON.stringify(grantsOnly)},LEAVE_INV);
    try{await gasSave("有給",data);setEditBucket(null);await reload();}catch(e){alert("保存失敗："+e.message);}
  };

  const deleteBucket=async(bucketId)=>{
    if(!confirm("この付与レコードを削除しますか？\n※取得済み日数がある場合もそのまま削除されます。"))return;
    const cur=leaves.find(l=>l.empId===sel);
    const recs=safeParseJSON(cur?.records,[]);
    const target=recs.find(r=>r.type==="grant"&&(r.id||r.date)===bucketId);
    if(!target)return;
    const removeDays=target.days||0;
    const filtered=recs.filter(r=>!(r.type==="grant"&&(r.id||r.date)===bucketId));
    const data=convertTo({id:cur?.id||newId(),empId:sel,granted:Math.max(0,(+(cur?.granted||0))-removeDays),used:+(cur?.used||0),records:JSON.stringify(filtered)},LEAVE_INV);
    try{await gasSave("有給",data);await reload();}catch(e){alert("削除失敗："+e.message);}
  };

  const decide=async(id,status)=>{
    const req=lvReqs.find(r=>r.id===id);if(!req)return;
    try{
      const td=today();
      if(status==="approved"&&req.date>td){
        // 未来日付の承認 → 「承認済み予約」として保存（日付到達後に自動消化）
        // reasonに "予約" を付加して区別し、起動時チェックで approved に昇格
        await gasSave("有給申請",convertTo({...req,status:"approved",reason:(req.reason||"")},LV_REQ_INV));
        alert(`${req.date} は未来の日付のため、日付到達時に自動消化されます。`);
      } else {
        // 過去・当日 → 即時消化
        await gasSave("有給申請",convertTo({...req,status},LV_REQ_INV));
      }
      await reload();
    }catch(e){alert("更新失敗："+e.message);}
  };

  // 承認済み有休の取消 → rejected化 ＋ 未来日付かつleave系シフトなら自動でoffに変更
  const cancelApproved=async(id)=>{
    const req=lvReqs.find(r=>r.id===id);if(!req)return;
    if(!confirm(`${req.date} の承認済み有休を取り消しますか？\n有給日数が返還されます。`))return;
    try{
      await gasSave("有給申請",convertTo({...req,status:"rejected"},LV_REQ_INV));
      // leave/designated系シフトの場合はoffに変更（過去・当日・未来すべて）
      const shiftRow=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.date);
      // 同日に他の承認済み申請がある場合はシフトを変更しない
      const otherApproved=lvReqs.filter(r=>r.id!==id&&String(r.empId)===String(req.empId)&&r.date===req.date&&r.status==="approved");
      if(otherApproved.length===0&&shiftRow&&isAnyLeaveShift(shiftRow.shiftType)){
        await gasSave("シフト",convertTo({...shiftRow,shiftType:"off"},SHIFT_INV));
      }
      await reload();
    }catch(e){alert("取消失敗："+e.message);}
  };

  const lv_records=safeParseJSON(leave?.records,[]);

  // 期間別取得日数（来月〜一番古い付与日まで遡る）
  const periodHistory=(()=>{
    const now=getCurrentPeriod();
    // 一番古い付与日を取得
    const grants=lv_records.filter(r=>r.type==="grant");
    const oldestDate=grants.length>0
      ?grants.reduce((oldest,r)=>(r.grantedAt||r.date||"")<oldest?(r.grantedAt||r.date||""):oldest, grants[0].grantedAt||grants[0].date||"")
      :"";
    // 来月を起点に過去へ遡る
    const nextYear=now.month===12?now.year+1:now.year;
    const nextMonth=now.month===12?1:now.month+1;
    const periods=[];
    let y=nextYear, m=nextMonth;
    // 終了条件: 一番古い付与日の期間まで（なければ12期間）
    const maxPeriods=oldestDate?999:13;
    let count=0;
    while(count<maxPeriods){
      const p=getPeriodRange(y,m);
      const isCurrent=y===now.year&&m===now.month;
      const isNext=y===nextYear&&m===nextMonth;
      // 古い付与日より前の期間に達したら終了
      if(oldestDate&&p.end<oldestDate&&!isCurrent&&!isNext&&count>1) break;
      const used=lvReqs.filter(r=>
        String(r.empId)===String(sel)&&
        r.status==="approved"&&
        r.date>=p.start&&r.date<=p.end
      ).reduce((s,r)=>s+(r.half?0.5:1.0),0);
      periods.push({year:y,month:m,label:p.label,used,isCurrent,isNext,start:p.start,end:p.end});
      // 前月へ
      if(m===1){m=12;y--;}else m--;
      count++;
      if(count>60) break; // 最大5年
    }
    return periods;
  })();
  const totalUsedAll=periodHistory.filter(p=>!p.isNext).reduce((s,p)=>s+p.used,0);

  return <div>
    {(()=>{
      // 期間内の付与レコード（grant/cancelのみ、useは申請ベースで表示）
      const grantRecs=lv_records.filter(r=>{
        const d=r.date||r.grantedAt||"";
        return (r.type==="grant"||r.type==="cancel")&&d>=period.start&&d<=period.end;
      });
      // 期間内の申請（承認待ち＋承認済み）
      const periodReqs=lvReqs.filter(r=>r.date>=period.start&&r.date<=period.end&&(r.status==="pending"||r.status==="approved")).sort((a,b)=>a.date<b.date?-1:1);
      // 付与レコードを日付付きオブジェクトに変換
      const grantRows=grantRecs.map(r=>({_type:"record",rec:r,date:r.date||r.grantedAt||""}));
      // 申請を行に変換
      const reqRows=periodReqs.map(r=>({_type:"req",req:r,date:r.date}));
      // 全行を日付降順で結合
      const allRows=[...grantRows,...reqRows].sort((a,b)=>a.date<b.date?1:-1);
      const totalPending=lvReqs.filter(r=>r.status==="pending").length;

      return <>
        {/* 締め期間ナビゲーター */}
        <div style={{display:"flex",alignItems:"center",gap:8,margin:"1rem 0 0.75rem",flexWrap:"wrap"}}>
          <button onClick={prevPeriod} style={bS}>‹</button>
          <span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{period.label}</span>
          <button onClick={nextPeriod} style={bS}>›</button>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span>
        </div>
        {/* 付与履歴テーブル（申請承認はApprovalCenterへ移動） */}
        <div style={{...crd,overflow:"hidden",marginBottom:"1rem"}}>
          <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>
            付与・取消一覧 <span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)"}}>{allRows.filter(r=>r._type==="record").length}件</span>
          </div>
          {allRows.filter(r=>r._type==="record").length===0
            ?<div style={{padding:"1.5rem",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>この期間の付与履歴はありません</div>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["日付","種別","内容","日数","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>{allRows.filter(r=>r._type==="record").map((row,i)=>{
                const rec=row.rec;
                const isGrant=rec.type==="grant";
                const isEditingThis=editBucket?.bucketId===(rec.id||rec.date);
                return <React.Fragment key={"rec"+i}>
                  <tr style={{borderBottom:isEditingThis?"none":"0.5px solid var(--color-border-tertiary)",background:"#FAFBFF"}}>
                    <td style={{...tdS,color:"var(--color-text-secondary)"}}>{rec.date||rec.grantedAt}</td>
                    <td style={tdS}>{isGrant?<Badge label="付与" bg="#E6F1FB" color="#185FA5"/>:<Badge label="取消" bg="#FCEBEB" color="#A32D2D"/>}</td>
                    <td style={{...tdS,fontSize:11,color:"var(--color-text-secondary)"}}>{rec.note}{isGrant&&rec.expiresAt?<span style={{marginLeft:4,color:"var(--color-text-tertiary)"}}>（〜{rec.expiresAt}）</span>:null}</td>
                    <td style={{...tdS,fontWeight:600,color:"#1251a3"}}>+{rec.days}日</td>
                    <td style={tdS}>
                      {isGrant&&<div style={{display:"flex",gap:4}}>
                        <button onClick={()=>setEditBucket(isEditingThis?null:{bucketId:rec.id||rec.date,days:String(rec.days),grantedAt:rec.grantedAt||rec.date,expiresAt:rec.expiresAt||addYears(rec.grantedAt||rec.date,2),note:rec.note||""})} style={{padding:"2px 8px",borderRadius:5,border:"1px solid var(--color-border-secondary)",background:isEditingThis?"#E6F1FB":"var(--color-background-primary)",color:isEditingThis?"#1251a3":"var(--color-text-secondary)",fontSize:10,cursor:"pointer"}}>編集</button>
                        <button onClick={()=>deleteBucket(rec.id||rec.date)} style={{padding:"2px 8px",borderRadius:5,border:"1px solid #F09595",background:"#FFF5F5",color:"#A32D2D",fontSize:10,cursor:"pointer"}}>削除</button>
                      </div>}
                    </td>
                  </tr>
                  {isEditingThis&&<tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                    <td colSpan={5} style={{padding:"10px 14px",background:"#F0F4FF"}}>
                      <div style={{fontSize:11,fontWeight:600,color:"#1251a3",marginBottom:6}}>付与レコードを編集</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:8}}>
                        <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>付与日数</div><input type="number" step="0.5" min="0.5" value={editBucket.days} onChange={e=>setEditBucket(p=>({...p,days:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                        <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>付与日</div><input type="date" value={editBucket.grantedAt} onChange={e=>setEditBucket(p=>({...p,grantedAt:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                        <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>有効期限</div><input type="date" value={editBucket.expiresAt} onChange={e=>setEditBucket(p=>({...p,expiresAt:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                        <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>備考</div><input value={editBucket.note} onChange={e=>setEditBucket(p=>({...p,note:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                      </div>
                      <div style={{display:"flex",gap:6}}><button onClick={saveBucket} style={{...bP,padding:"4px 14px",fontSize:11}}>保存</button><button onClick={()=>setEditBucket(null)} style={{...bS,padding:"4px 10px",fontSize:11}}>取消</button></div>
                    </td>
                  </tr>}
                </React.Fragment>;
              })}</tbody>
            </table>}
        </div>
      </>;
    })()}
    <div style={{display:"grid",gridTemplateColumns:canGrant?"1fr 1fr":"1fr 1fr",gap:"1rem",marginBottom:"1rem"}}>
      {/* 左カード：付与 or 残日数確認 */}
      {canGrant&&<div style={{...crd,padding:"1rem 1.25rem"}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>有給付与</div>
        <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>従業員</div>
          <select value={sel} onChange={e=>{setSel(e.target.value);setEditBucket(null);}} style={iS}>{emps.map(e=><option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}</select></div>
        <div style={{marginBottom:8,padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>有効残日数</span>
            <span style={{fontSize:16,fontWeight:700,color:totalRem<3?"#A32D2D":"#3B6D11"}}>{totalRem}日</span>
          </div>
          {allBuckets.length===0&&<div style={{fontSize:11,color:"var(--color-text-tertiary)"}}>付与なし</div>}
          {allBuckets.map(b=>{
            const isExpired=b.expiresAt<td,bid=b.id,isEditing=editBucket?.bucketId===bid;
            return <div key={bid} style={{padding:"6px 0",borderTop:"0.5px solid var(--color-border-tertiary)",opacity:isExpired?0.7:1}}>
              {!isEditing&&<div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{fontSize:11}}>
                  <span style={{color:"var(--color-text-secondary)"}}>{b.grantedAt}付与</span>
                  <span style={{marginLeft:6,fontWeight:600,color:"#1251a3"}}>{b.remaining}/{b.days}日残</span>
                  {isExpired&&<span style={{marginLeft:6,fontSize:10,color:"#A32D2D",background:"#FCEBEB",padding:"1px 5px",borderRadius:4}}>失効</span>}
                  <div style={{fontSize:10,color:isExpired?"#A32D2D":b.expiresAt<addDays(td,30)?"#854F0B":"var(--color-text-tertiary)",marginTop:2}}>期限：{b.expiresAt}{b.note&&<span style={{marginLeft:6,color:"var(--color-text-tertiary)"}}>{b.note}</span>}</div>
                </div>
                <div style={{display:"flex",gap:4}}>
                  <button onClick={()=>setEditBucket({bucketId:bid,days:String(b.days),grantedAt:b.grantedAt,expiresAt:b.expiresAt,note:b.note||""})} style={{padding:"2px 8px",borderRadius:5,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:10,cursor:"pointer"}}>編集</button>
                  <button onClick={()=>deleteBucket(bid)} style={{padding:"2px 8px",borderRadius:5,border:"1px solid #F09595",background:"#FFF5F5",color:"#A32D2D",fontSize:10,cursor:"pointer"}}>削除</button>
                </div>
              </div>}
              {isEditing&&<div style={{background:"#F0F4FF",borderRadius:8,padding:"8px 10px"}}>
                <div style={{fontSize:11,fontWeight:600,color:"#1251a3",marginBottom:6}}>付与レコードを編集</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                  <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>付与日数</div><input type="number" step="0.5" min="0.5" value={editBucket.days} onChange={e=>setEditBucket(p=>({...p,days:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                  <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>付与日</div><input type="date" value={editBucket.grantedAt} onChange={e=>setEditBucket(p=>({...p,grantedAt:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                  <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>有効期限</div><input type="date" value={editBucket.expiresAt} onChange={e=>setEditBucket(p=>({...p,expiresAt:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                  <div><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>備考</div><input value={editBucket.note} onChange={e=>setEditBucket(p=>({...p,note:e.target.value}))} style={{...iS,fontSize:12,padding:"4px 8px"}}/></div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <button onClick={saveBucket} style={{...bP,padding:"4px 14px",fontSize:11}}>保存</button>
                  <button onClick={()=>setEditBucket(null)} style={{...bS,padding:"4px 10px",fontSize:11}}>取消</button>
                </div>
              </div>}
            </div>;
          })}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
          <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>付与日数（0.5日単位）</div>
            <input type="number" step="0.5" min="0.5" value={form.days} onChange={e=>setForm(p=>({...p,days:e.target.value}))} placeholder="例：10" style={iS}/></div>
          <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>付与日（遡及可）</div>
            <input type="date" value={form.grantedAt} onChange={e=>setForm(p=>({...p,grantedAt:e.target.value}))} style={iS}/></div>
        </div>
        <div style={{marginBottom:10}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>備考</div>
          <input value={form.note} onChange={e=>setForm(p=>({...p,note:e.target.value}))} placeholder="例：2026年度付与" style={iS}/></div>
        <button onClick={grant} disabled={!form.days} style={{...bP,width:"100%",opacity:form.days?1:0.4}}>付与する（有効期限2年）</button>
      </div>}
      {!canGrant&&<div style={{...crd,padding:"1rem 1.25rem"}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>有給残日数確認</div>
        <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>従業員</div>
          <select value={sel} onChange={e=>{setSel(e.target.value);setEditBucket(null);}} style={iS}>{emps.map(e=><option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}</select></div>
        <div style={{padding:"10px 12px",background:"var(--color-background-secondary)",borderRadius:8}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:11,color:"var(--color-text-secondary)"}}>有効残日数</span>
            <span style={{fontSize:16,fontWeight:700,color:totalRem<3?"#A32D2D":"#3B6D11"}}>{totalRem}日</span>
          </div>
          {allBuckets.filter(b=>b.expiresAt>=td).map(b=>(
            <div key={b.id} style={{fontSize:11,padding:"4px 0",borderTop:"0.5px solid var(--color-border-tertiary)",display:"flex",justifyContent:"space-between"}}>
              <span style={{color:"var(--color-text-secondary)"}}>{b.grantedAt}付与 <span style={{color:"var(--color-text-tertiary)"}}>〜{b.expiresAt}</span></span>
              <span style={{fontWeight:600,color:"#1251a3"}}>{b.remaining}日</span>
            </div>
          ))}
        </div>
      </div>}
      {/* 右カード：期間別取得日数 */}
      <div style={{...crd,overflow:"hidden",display:"flex",flexDirection:"column"}}>
        <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>期間別取得日数<span style={{fontSize:11,fontWeight:400,color:"var(--color-text-tertiary)",marginLeft:6}}>（15日締め）</span></span>
          <span style={{fontSize:12,color:"var(--color-text-secondary)"}}>合計 <strong style={{color:"#1251a3"}}>{totalUsedAll}日</strong></span>
        </div>
        <div style={{overflowY:"auto",maxHeight:460}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>
              <th style={{...thS,position:"sticky",top:0,zIndex:1}}>期間</th>
              <th style={{...thS,textAlign:"right",position:"sticky",top:0,zIndex:1}}>取得</th>
            </tr></thead>
            <tbody>{periodHistory.map((p,i)=>(
              <tr key={i} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:p.isNext?"#FAFAFA":p.isCurrent?"#F0F4FF":""}}>
                <td style={{...tdS,fontSize:11}}>
                  {p.isNext&&<span style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,background:"#854F0B",color:"#fff",marginRight:5}}>来月</span>}
                  {p.isCurrent&&<span style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:4,background:"#1251a3",color:"#fff",marginRight:5}}>当月</span>}
                  {p.label}
                </td>
                <td style={{...tdS,textAlign:"right",fontWeight:p.used>0?700:400,color:p.used>0?"#1251a3":"var(--color-text-tertiary)"}}>
                  {p.used>0?p.used+"日":"―"}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>;
}

// ── TimecardView ──────────────────────────────────────────────────────────────
const CLINIC_NAME = "医）松口整形外科クリニック";

function TimecardView({emps,shifts,punches,otReqs,lvReqs,shiftDefsData,isAdmin=false,leadRoles=null,selfView=false,reload=()=>{}}){
  const cur0=getCurrentPeriod();
  const [year,setYear]=useState(cur0.year),[month,setMonth]=useState(cur0.month);
  const [rf,setRf]=useState("");
  const [empId,setEmpId]=useState("");
  const [subTab,setSubTab]=useState(0);
  const prevM=()=>month===1?(setYear(y=>y-1),setMonth(12)):setMonth(m=>m-1);
  const nextM=()=>month===12?(setYear(y=>y+1),setMonth(1)):setMonth(m=>m+1);

  // 表示対象の従業員（管理者：全員、責任者：担当のみ）
  const targetEmps=leadRoles?emps.filter(e=>leadRoles.includes(e.role)):emps;
  const filteredEmps=rf?targetEmps.filter(e=>e.role===rf):targetEmps;
  const emp=filteredEmps.find(e=>String(e.id)===String(empId))||filteredEmps[0];
  const isPTpart=emp&&emp.role==="理学療法士"&&emp.type==="パート";
  const isSeishain=emp&&emp.type==="正社員";

  // 15日締め期間を生成（前月16日〜当月15日）
  const period=getPeriodRange(year,month);
  const periodDays=(()=>{
    const days=[];
    let cur=new Date(period.start);
    const end=new Date(period.end);
    while(cur<=end){
      days.push(`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`);
      cur.setDate(cur.getDate()+1);
    }
    return days;
  })();

  // サブタブ定義：理学療法士パートは月次レポート→タイムカード
  const subTabs=isPTpart
    ?["月次レポート","タイムカード"]
    :[];

  // ── 理学療法士パート 照合ロジック ─────────────────────────────────────────
  // 生打刻を元に新ルールで調整した出退勤・実働を計算
  const getPTAdjusted=(r)=>{
    if(!r.punch||!r.def.start) return {inT:r.punch?.in||"",outT:r.punch?.out||"",workMin:0,lateMin:0,otMin:0,isLate:false,isEarly:false,isOT:false};
    const shiftStart=toMin(r.def.start);
    const shiftEnd=toMin(r.def.end);
    const pIn=r.punch.in?toMin(r.punch.in):null;
    const pOut=r.punch.out?toMin(r.punch.out):null;
    const approvedOT=(otReqs||[]).find(req=>String(req.empId)===String(emp?.id)&&req.date===r.ds&&req.status==="approved"&&req.type==="overtime");
    const approvedEarly=(otReqs||[]).find(req=>String(req.empId)===String(emp?.id)&&req.date===r.ds&&req.status==="approved"&&req.type==="early");

    // 退勤表示時刻の決定
    let adjOut=pOut;
    if(pOut!==null){
      if(approvedOT) adjOut=toMin(approvedOT.requestedEnd);
      else if(pOut-shiftEnd>=10) adjOut=shiftEnd+7; // 10分以上遅い→シフト終了+7分
      // 10分未満はそのまま
    }

    // 実働開始時刻
    let workStart=shiftStart;
    if(approvedEarly) workStart=toMin(approvedEarly.requestedEnd); // 早出申請時刻

    // 遅刻判定
    const lateMin=pIn!==null?Math.max(0,pIn-shiftStart):0;
    const isLate=lateMin>=1; // 1分以上で遅刻バッジ
    // 実働への遅刻影響：4分以上で10分丸め減算
    let lateDeduct=0;
    if(lateMin>=4) lateDeduct=Math.ceil(lateMin/10)*10;

    // 実働計算（10分切り捨て）
    const breakMin=r.def.breakMin!=null?Number(r.def.breakMin):0;
    let rawWork=pOut!==null&&adjOut!==null?Math.max(0,adjOut-workStart-breakMin-lateDeduct):0;
    const workMin=Math.floor(rawWork/10)*10;

    // 残業（adjOutがシフト終了より大きい場合）
    const otMin=adjOut!==null?Math.max(0,adjOut-shiftEnd):0;
    // 早退（adjOutがシフト終了より小さい場合）
    const isEarly=adjOut!==null&&adjOut<shiftEnd-1;
    const isOT=otMin>0;

    return {
      inT:r.punch.in||"",
      outT:adjOut!==null?fmtTime(adjOut):"",
      workMin,lateMin,lateDeduct,otMin,isLate,isEarly,isOT,
      adjOutRaw:adjOut
    };
  };

  // buildRowsの代わりに期間日付でrows生成
  const rows=(()=>{
    if(!emp) return [];
    const rule=getOtRule(emp);
    const isApprovalType=rule.type==="approval";
    const isOvertimeRequest=rule.type==="overtime_request";
    const roundMin=rule.roundMin||0;
    const _empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
    return periodDays.map(ds=>{
      const dow=new Date(ds).getDay();
      const d=parseInt(ds.slice(8));
      const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
      const st=shiftRow?.shiftType||"off";
      const def=_empDefs[st]||_empDefs.off||SHIFT_DEFS.off;
      const isOff=!def.start;
      const shiftBreakMin=def.breakMin!=null?def.breakMin:0;
      const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
      const _lvMatch=(lvReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
      const isShiftLeave=isAnyLeaveShift(st);
      const isLeave=!!_lvMatch||isShiftLeave;
      const leaveHalf=_lvMatch?.half||leaveShiftHalf(st)||null;
      const approvedEarlyReq=(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="early");
      const approvedOTReq=(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="overtime");
      let swMin=0,awMin=0,otMin=0,diffMin=0,late=false,earlyLeave=false,absent=false;
      let adj=punch?.adjusted||false,earlyAdj=false;
      const missingOut=!!punch&&!punch.out&&!isOff&&!isLeave;
      const missingIn=!!punch&&!punch.in&&!!punch.out&&!isOff&&!isLeave;
      if(!isOff&&def.start) swMin=toMin(def.end)-toMin(def.start)-shiftBreakMin;
      if(punch&&punch.out&&punch.in){
        const shiftStartMin=toMin(def.start||"00:00"),shiftEndMin=toMin(def.end||"00:00");
        const im=toMin(punch.in),om=toMin(punch.out);
        let imForWork=im;
        if(!isOff&&def.start&&im<shiftStartMin){
          if(approvedEarlyReq){imForWork=im;earlyAdj=false;}
          else{imForWork=shiftStartMin;earlyAdj=true;}
        }
        let rawOtMin=Math.max(0,om-shiftEndMin);
        if(isApprovalType) otMin=approvedOTReq?roundDownMin(rawOtMin,roundMin):0;
        else if(isOvertimeRequest) otMin=rawOtMin;
        else if(roundMin>0&&!isOff) otMin=roundDownMin(rawOtMin,roundMin);
        else otMin=rawOtMin;
        awMin=Math.max(0,om-imForWork-(punch.break!=null?punch.break:shiftBreakMin));
        if(!isOff&&def.start){
          if(im>shiftStartMin+1) late=true;
          if(om<shiftEndMin-1) earlyLeave=true;
          diffMin=om-shiftEndMin;
        } else { otMin=isOff?awMin:otMin; }
      } else if(!isOff&&!isLeave&&!missingOut&&!missingIn) absent=true;
      const isOffPunch=isOff&&!!punch?.out;
      const bg=isLeave?"#F0FAF5":absent||missingOut||missingIn?"#FFF5F5":adj||earlyAdj?"#F5F4FE":isOffPunch?"#F5F9FE":late||earlyLeave||otMin>0?"#FFFCF5":"";
      return {d,dow,ds,st,def,isOff,swMin,punch,awMin,otMin,diffMin,late,earlyLeave,absent,missingOut,missingIn,adjusted:adj,earlyAdj,isLeave,leaveHalf,isOffPunch,rowBg:bg,approvedOTReq,approvedEarlyReq};
    });
  })();

  // ── 一括入力モード ────────────────────────────────────────────────────────
  const [bulkMode,setBulkMode]=useState(false);
  const [bulkData,setBulkData]=useState({});
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkMsg,setBulkMsg]=useState("");
  const startBulk=()=>{
    const init={};
    rows.forEach(r=>{ init[r.ds]={in:r.punch?.in||"",out:r.punch?.out||""}; });
    setBulkData(init); setBulkMsg(""); setBulkMode(true); setEditKey(null);
  };
  const fillFromShift=()=>{
    const next={...bulkData};
    rows.forEach(r=>{ if(r.def.start&&r.def.end) next[r.ds]={in:r.def.start,out:r.def.end}; });
    setBulkData(next);
  };
  const clearOff=()=>{
    const next={...bulkData};
    rows.forEach(r=>{ if(!r.def.start) next[r.ds]={in:"",out:""}; });
    setBulkData(next);
  };
  const saveBulk=async()=>{
    const toSave=rows.filter(r=>{ const b=bulkData[r.ds]; return b&&b.in; });
    const toDelete=rows.filter(r=>{ const b=bulkData[r.ds]; return (!b||!b.in)&&r.punch; });
    if(toSave.length===0&&toDelete.length===0){setBulkMsg("変更なし");return;}
    if(!confirm(`${toSave.length}件を保存、${toDelete.length}件を削除します。よろしいですか？`))return;
    setBulkSaving(true); setBulkMsg("");
    try{
      // 既存打刻のidを確実に引き継いでupsert
      const saveList=toSave.map(r=>{
        const b=bulkData[r.ds];
        // r.punchは15日締め期間のrows生成時点のデータなので最新のpunchesから再取得
        const existingPunch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===r.ds);
        return convertTo({
          id:existingPunch?.id||r.punch?.id||newId(),
          empId:emp.id,
          date:r.ds,
          in:b.in,
          out:b.out||"",
          break:r.def.breakMin!=null?Number(r.def.breakMin):BREAK_MIN,
          adjusted:false
        },PUNCH_INV);
      });
      await gasSaveMany("打刻",saveList);
      for(const r of toDelete){
        const existingPunch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===r.ds);
        if(existingPunch) await gasDelete("打刻",existingPunch.id);
      }
      await reload();
      setBulkMode(false);
      setBulkMsg(`${toSave.length}件保存、${toDelete.length}件削除しました`);
      setTimeout(()=>setBulkMsg(""),4000);
    }catch(e){alert("一括保存失敗："+e.message);}
    setBulkSaving(false);
  };

  // ── インライン打刻修正 ──────────────────────────────────────────────────────
  const [editKey,setEditKey]=useState(null);
  const [editForm,setEditForm]=useState({in:"",out:""});
  const [editSaving,setEditSaving]=useState(false);
  // 月・従業員切り替え時にbulkMode・editKeyをリセット
  useEffect(()=>{setBulkMode(false);setEditKey(null);setBulkMsg("");},[year,month,empId]);
  const startEdit=(r)=>{
    setEditKey(r.ds);
    setEditForm({in:r.punch?.in||"",out:r.punch?.out||""});
  };
  const cancelEdit=()=>{ setEditKey(null); setEditForm({in:"",out:""}); };
  const saveEdit=async(r)=>{
    setEditSaving(true);
    try{
      if(!editForm.in){
        // 出勤時刻なし → 削除
        if(r.punch) await gasDelete("打刻",r.punch.id);
      } else {
        const breakMin=r.def.breakMin!=null?r.def.breakMin:BREAK_MIN;
        const data=convertTo({id:r.punch?.id||newId(),empId:emp.id,date:r.ds,in:editForm.in,out:editForm.out||"",break:breakMin,adjusted:false},PUNCH_INV);
        await gasSave("打刻",data);
      }
      await reload();
      setEditKey(null);
    }catch(e){alert("保存失敗："+e.message);}
    setEditSaving(false);
  };
  const delPunch=async(r)=>{
    if(!confirm(`${r.ds.slice(5).replace("-","/")} の打刻を削除しますか？`))return;
    try{ await gasDelete("打刻",r.punch.id); await reload(); }catch(e){alert("削除失敗："+e.message);}
  };
  // 編集行のUI（各テーブルで共用）
  const EditRow=({r,colSpan=7})=>{
    const wm=editForm.in&&editForm.out?Math.max(0,toMin(editForm.out)-toMin(editForm.in)-(r.def.breakMin!=null?r.def.breakMin:BREAK_MIN)):null;
    return <tr style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:"#F0F4FF"}}>
      <td style={tdS}><strong>{r.ds.slice(5).replace("-","/")}</strong></td>
      <td style={tdS}>{DOW_JP[r.dow]}</td>
      <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
      <td style={{padding:"4px 6px"}}><input type="time" value={editForm.in} onChange={e=>setEditForm(p=>({...p,in:e.target.value}))} style={{...iS,width:105,fontSize:13,padding:"5px 8px"}}/></td>
      <td style={{padding:"4px 6px"}}><input type="time" value={editForm.out} onChange={e=>setEditForm(p=>({...p,out:e.target.value}))} disabled={!editForm.in} style={{...iS,width:105,fontSize:13,padding:"5px 8px",opacity:editForm.in?1:0.4}}/></td>
      <td style={{...tdS,fontWeight:500,color:"#1251a3"}}>{wm!=null?toHStr(wm):"―"}</td>
      <td colSpan={colSpan-5} style={tdS}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button onClick={()=>saveEdit(r)} disabled={editSaving} style={{...bP,padding:"4px 12px",fontSize:12,opacity:editSaving?0.5:1}}>{editSaving?"保存中...":"保存"}</button>
          <button onClick={cancelEdit} disabled={editSaving} style={{...bS,padding:"4px 10px",fontSize:12}}>取消</button>
          {r.punch&&<button onClick={()=>delPunch(r)} disabled={editSaving} style={{...bD,padding:"4px 10px",fontSize:12}}>削除</button>}
        </div>
      </td>
    </tr>;
  };

  // 調整済みの出退勤を計算（理学療法士パートのみ）
  const getAdjustedTime=(row)=>{
    if(!row.punch||!row.def.start) return {inT:row.punch?.in||"",outT:row.punch?.out||""};
    const shiftStart=toMin(row.def.start);
    const shiftEnd=toMin(row.def.end);
    const punchIn=row.punch.in?toMin(row.punch.in):null;
    const punchOut=row.punch.out?toMin(row.punch.out):null;
    // 承認済み残業申請があれば丸めない
    const hasApprovedOT=otReqs.some(r=>String(r.empId)===String(emp.id)&&r.date===row.ds&&r.status==="approved");
    let adjIn=punchIn,adjOut=punchOut;
    if(!hasApprovedOT){
      if(punchIn!==null&&shiftStart-punchIn>=5) adjIn=shiftStart;
      if(punchOut!==null&&punchOut-shiftEnd>=5) adjOut=shiftEnd;
    }
    return {
      inT:adjIn!==null?fmtTime(adjIn):"",
      outT:adjOut!==null?fmtTime(adjOut):"",
      adjusted:(adjIn!==punchIn||adjOut!==punchOut)
    };
  };

  // 印刷用HTML生成
  const printTimecard=(adjusted)=>{
    if(!emp) return;
    const title=adjusted?"月次レポート":"生タイムカード";
    const w=window.open("","_blank");
    const tableRows=rows.map(r=>{
      if(r.isOff&&!r.punch) return `<tr><td>${r.ds.slice(5).replace("-","/")} </td><td>${DOW_JP[r.dow]}</td><td>休日</td><td>―</td><td>―</td><td>―</td><td>―</td></tr>`;
      if(r.isLeave) return `<tr><td>${r.ds.slice(5).replace("-","/")} </td><td>${DOW_JP[r.dow]}</td><td>${r.def.label||"有給"}</td><td colspan="4" style="text-align:center;color:#0F6E56">有給</td></tr>`;
      const shiftLabel=r.def.start?`${r.def.label}（${r.def.start}〜${r.def.end}）`:"休日";
      let inT="―",outT="―",workMin=0;
      if(r.punch){
        if(adjusted){
          const adj=getAdjustedTime(r);
          inT=adj.inT||"―"; outT=adj.outT||"―";
          if(adj.inT&&adj.outT) workMin=Math.max(0,toMin(adj.outT)-toMin(adj.inT)-(r.def.breakMin!=null?r.def.breakMin:0));
        } else {
          inT=r.punch.in||"―"; outT=r.punch.out||"未退勤";
          if(r.punch.out) workMin=r.awMin;
        }
      }
      const wH=workMin>0?toHStr(workMin):"―";
      const diffMin=adjusted&&r.def.end&&outT!=="―"?toMin(outT)-toMin(r.def.end):r.diffMin;
      const diffStr=r.punch?.out?(diffMin>=0?"+":"")+toHStr(diffMin):"―";
      const status=r.absent?"欠勤":r.late&&r.earlyLeave?"遅刻・早退":r.late?"遅刻":r.earlyLeave?"早退":r.otMin>0?"残業":r.awMin>0?"正常":"―";
      return `<tr><td>${r.ds.slice(5).replace("-","/")} </td><td>${DOW_JP[r.dow]}</td><td>${shiftLabel}</td><td>${inT}</td><td>${outT}</td><td>${wH}</td><td>${diffStr}</td>${adjusted?`<td>${status}</td>`:""}</tr>`;
    }).join("");

    // 合計計算
    const totalWork=adjusted
      ?rows.reduce((s,r)=>{
        if(!r.punch?.out||r.isLeave) return s;
        const adj=getAdjustedTime(r);
        if(!adj.inT||!adj.outT) return s;
        return s+Math.max(0,toMin(adj.outT)-toMin(adj.inT)-(r.def.breakMin!=null?r.def.breakMin:0));
      },0)
      :rows.reduce((s,r)=>s+(r.isOff||r.absent?0:r.awMin),0);
    const totalOT=rows.reduce((s,r)=>s+r.otMin,0);
    const tS=rows.reduce((s,r)=>s+(r.isOff||r.absent?0:r.swMin),0);
    const abC=rows.filter(r=>r.absent).length;
    const lC=rows.filter(r=>r.late).length;
    const eC=rows.filter(r=>r.earlyLeave).length;

    const summaryHtml=adjusted?`
      <div class="summary">
        <span>所定：<strong>${toHStr(tS)}</strong></span>
        <span>実働：<strong>${toHStr(totalWork)}</strong></span>
        <span>残業：<strong>${toHStr(totalOT)}</strong></span>
        <span>欠勤：<strong>${abC}日</strong></span>
        <span>遅刻：<strong>${lC}回</strong></span>
        <span>早退：<strong>${eC}回</strong></span>
      </div>`:"";

    const headers=adjusted
      ?"<tr><th>日付</th><th>曜</th><th>シフト</th><th>出勤</th><th>退勤</th><th>実働</th><th>差異</th><th>状態</th></tr>"
      :"<tr><th>日付</th><th>曜</th><th>シフト</th><th>出勤</th><th>退勤</th><th>実働</th><th>差異</th></tr>";

    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>
      body{font-family:"Hiragino Sans","Yu Gothic",sans-serif;font-size:12px;padding:20px;color:#111}
      h2{font-size:16px;margin-bottom:4px}
      .meta{font-size:12px;color:#555;margin-bottom:12px}
      .summary{display:flex;gap:20px;padding:8px 12px;background:#f5f5f5;border-radius:6px;margin-bottom:12px;flex-wrap:wrap}
      .summary span{font-size:12px;color:#374151}
      .summary strong{color:#1251a3}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f0f0f0;padding:5px 6px;border:1px solid #ccc;text-align:center;font-weight:600}
      td{padding:4px 6px;border:1px solid #ddd;text-align:center}
      tr:nth-child(even){background:#fafafa}
      .total{margin-top:8px;text-align:right;font-size:12px;font-weight:600}
      @media print{button{display:none}}
    </style></head><body>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
        <div>
          <h2>${CLINIC_NAME}</h2>
          <div class="meta">${title}　${period.label}　${emp.name}（${emp.role}・${emp.type}）</div>
        </div>
        <button onclick="window.print()" style="padding:6px 16px;background:#1251a3;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px">🖨 印刷</button>
      </div>
      ${summaryHtml}
      <table><thead>${headers}</thead><tbody>${tableRows}</tbody></table>
      <div class="total">実働合計：${toHStr(totalWork)}</div>
    </body></html>`);
    w.document.close();
  };

  return <div>
    {/* ヘッダー操作 */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:"1rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={prevM} style={bS}>‹</button>
        <span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{period.label}</span>
        <button onClick={nextM} style={bS}>›</button>
        <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span>
      </div>
      {!selfView&&<select value={rf} onChange={e=>{setRf(e.target.value);setEmpId("");setBulkMode(false);}} style={{...iS,width:"auto"}}>
        <option value="">全職種</option>
        {[...new Set(targetEmps.map(e=>e.role))].map(r=><option key={r}>{r}</option>)}
      </select>}
      {!selfView&&<select value={empId} onChange={e=>{setEmpId(e.target.value);setBulkMode(false);}} style={{...iS,width:"auto"}}>
        {filteredEmps.map(e=><option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}
      </select>}
      {isAdmin&&emp&&!bulkMode&&<button onClick={startBulk} style={{...bP,padding:"8px 16px",fontSize:13}}>一括入力</button>}
      {isAdmin&&emp&&bulkMode&&<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={fillFromShift} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #1251a3",background:"#E6F1FB",color:"#1251a3",fontSize:12,cursor:"pointer",fontWeight:500}}>シフトから自動入力</button>
        <button onClick={clearOff} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>休日をクリア</button>
        <button onClick={saveBulk} disabled={bulkSaving} style={{...bP,padding:"8px 16px",fontSize:13,opacity:bulkSaving?0.5:1}}>{bulkSaving?"保存中...":"まとめて保存"}</button>
        <button onClick={()=>setBulkMode(false)} disabled={bulkSaving} style={{...bS,padding:"8px 12px",fontSize:13}}>キャンセル</button>
      </div>}
      {bulkMsg&&<span style={{fontSize:12,color:"#3B6D11",padding:"4px 10px",background:"#EAF3DE",borderRadius:6}}>{bulkMsg}</span>}
    </div>

    {/* 一括入力モード */}
    {isAdmin&&bulkMode&&emp&&<div style={{...crd,overflow:"hidden",marginBottom:"1rem"}}>
      <div style={{padding:"8px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12,color:"var(--color-text-secondary)",background:"#F5F9FE"}}>
        出勤時刻を入力した日が保存されます。空欄の日は打刻なし（既存打刻がある場合は削除）になります。
      </div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>
          <th style={thS}>日</th><th style={thS}>曜</th><th style={thS}>シフト</th>
          <th style={thS}>出勤</th><th style={thS}>退勤</th><th style={{...thS,color:"var(--color-text-tertiary)"}}>実働(参考)</th>
        </tr></thead>
        <tbody>{rows.map(r=>{
          const b=bulkData[r.ds]||{in:"",out:""};
          const dc=r.dow===0?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          const isOff=!r.def.start;
          const wm=b.in&&b.out?Math.max(0,toMin(b.out)-toMin(b.in)-(r.def.breakMin!=null?r.def.breakMin:BREAK_MIN)):null;
          const willDelete=!!r.punch&&!b.in;
          return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:willDelete?"#FFF5F5":!isOff?"#F0F6FF":""}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} {r.punch&&<span style={{fontSize:9,padding:"1px 4px",borderRadius:3,background:"#E6F1FB",color:"#185FA5",marginLeft:3}}>既存</span>}</td>
            <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:11,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{padding:"4px 6px"}}><input type="time" value={b.in} onChange={e=>setBulkData(p=>({...p,[r.ds]:{...p[r.ds],in:e.target.value}}))} style={{...iS,width:110,fontSize:13,padding:"5px 8px",background:b.in?"#fff":"var(--color-background-secondary)"}}/></td>
            <td style={{padding:"4px 6px"}}><input type="time" value={b.out} onChange={e=>setBulkData(p=>({...p,[r.ds]:{...p[r.ds],out:e.target.value}}))} disabled={!b.in} style={{...iS,width:110,fontSize:13,padding:"5px 8px",opacity:b.in?1:0.4,background:b.out?"#fff":"var(--color-background-secondary)"}}/></td>
            <td style={{...tdS,color:wm!=null?"var(--color-text-primary)":"var(--color-text-tertiary)",fontWeight:wm!=null?500:400}}>{wm!=null?toHStr(wm):willDelete?"― (削除)":"―"}</td>
          </tr>;
        })}</tbody>
      </table>
      <div style={{padding:"10px 14px",borderTop:"0.5px solid var(--color-border-tertiary)",display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={saveBulk} disabled={bulkSaving} style={{...bP,padding:"10px 24px",opacity:bulkSaving?0.5:1}}>{bulkSaving?"保存中...":"まとめて保存"}</button>
        <button onClick={()=>setBulkMode(false)} disabled={bulkSaving} style={bS}>キャンセル</button>
      </div>
    </div>}

    {/* サブタブ（理学療法士パートのみ） */}
    {subTabs.length>0&&<div style={{display:"flex",gap:4,marginBottom:"1rem",borderBottom:"2px solid var(--color-border-tertiary)"}}>
      {subTabs.map((t,i)=><button key={t} onClick={()=>setSubTab(i)} style={{padding:"8px 18px",border:"none",borderBottom:subTab===i?"2px solid #1251a3":"2px solid transparent",background:"transparent",color:subTab===i?"#1251a3":"var(--color-text-secondary)",fontWeight:subTab===i?600:400,fontSize:13,cursor:"pointer",marginBottom:"-2px"}}>{t}</button>)}
    </div>}

    {/* 月次レポート（理学療法士パート：サブタブ0） */}
    {isPTpart&&subTab===0&&(()=>{
      const adjRows=rows.map(r=>({...r,...getPTAdjusted(r)}));
      const totalWork=adjRows.reduce((s,r)=>s+r.workMin,0);
      const tS=adjRows.reduce((s,r)=>s+(r.isOff||r.absent?0:r.swMin),0);
      const attendDays=adjRows.filter(r=>!r.isOff&&!r.absent&&r.workMin>0).length;
      const absentDays=adjRows.filter(r=>r.absent).length;
      const lateDays=adjRows.filter(r=>r.isLate).length;
      const earlyDays=adjRows.filter(r=>r.isEarly).length;
      return <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <div style={{fontSize:13,fontWeight:700}}>月次レポート</div>
          {!selfView&&<button onClick={()=>printTimecard(true)} style={{...bP,padding:"6px 16px",fontSize:12}}>🖨 印刷</button>}
        </div>
        {emp&&<div style={{...crd,padding:"14px 16px",marginBottom:"1rem",background:"#fff"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:"#111"}}>月次レポート</div>
          {/* 上段：合計就労時間・出勤日数 */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
            {[["合計就労時間",toHStr(totalWork)],["出勤日数",attendDays+"日"]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center",padding:"10px 4px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8}}>
                <div style={{fontSize:11,color:"#555",marginBottom:2}}>{l}</div>
                <div style={{fontSize:20,fontWeight:700,color:"#111"}}>{v}</div>
              </div>
            ))}
          </div>
          {/* 下段：欠勤・遅刻・早退 */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            {[["欠勤",absentDays+"日"],["遅刻",lateDays+"回"],["早退",earlyDays+"回"]].map(([l,v])=>(
              <div key={l} style={{textAlign:"center",padding:"8px 4px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8}}>
                <div style={{fontSize:10,color:"#555",marginBottom:2}}>{l}</div>
                <div style={{fontSize:16,fontWeight:700,color:"#111"}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:12,fontSize:12,color:"#555"}}>
            <span>所定：<strong style={{color:"#111"}}>{toHStr(tS)}</strong></span>
            <span>実働：<strong style={{color:"#111"}}>{toHStr(totalWork)}</strong></span>
          </div>
        </div>}
        {/* タイムカード */}
        <div style={{fontSize:13,fontWeight:700,marginBottom:"0.5rem",color:"#111"}}>タイムカード</div>
        <div style={{...crd,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["日","曜","シフト","出勤","退勤","勤務時間","勤務状況","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{adjRows.map(r=>{
              const dc=r.dow===0||isHoliday(r.ds)?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
              // 差異（10分丸め）：adjustedOut - shiftEnd を10分単位で
              const rawDiff=r.adjOutRaw!==null&&r.def.end?r.adjOutRaw-toMin(r.def.end):null;
              const diffRounded=rawDiff!==null?Math.round(rawDiff/10)*10:null;
              const isEditing=editKey===r.ds;
              if(isEditing) return <EditRow key={r.ds} r={r} colSpan={8}/>;
              const badges=[];
              if(r.absent) badges.push(<Badge key="ab" label="要対応" bg="#FCEBEB" color="#A32D2D"/>);
              else if(r.missingOut) badges.push(<Badge key="mo" label="退勤忘れ" bg="#FCEBEB" color="#A32D2D"/>);
              else if(r.isLeave) badges.push(<Badge key="lv" label={r.leaveHalf==="am"?"有休(午前)":r.leaveHalf==="pm"?"有休(午後)":"有休"} bg="#E1F5EE" color="#0F6E56"/>);
              else if(r.isOff&&!r.punch) badges.push(<Badge key="off" label="休日" bg="var(--color-background-secondary)" color="var(--color-text-tertiary)"/>);
              else {
                if(r.isOT) badges.push(<span key="ot" style={{display:"inline-flex",alignItems:"center",gap:2}}><Badge label="残業" bg="#FAEEDA" color="#854F0B"/>{diffRounded!==null&&diffRounded>0&&<span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>+{toHStr(diffRounded)}</span>}</span>);
                if(r.isLate) badges.push(<span key="lt" style={{display:"inline-flex",alignItems:"center",gap:2,marginLeft:2}}><Badge label="遅刻" bg="#FAEEDA" color="#854F0B"/>{r.lateMin>=4&&<span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>-{toHStr(Math.ceil(r.lateMin/10)*10)}</span>}</span>);
                if(r.isEarly){const earlyDiff=diffRounded!==null&&diffRounded<0?Math.abs(diffRounded):0;badges.push(<span key="el" style={{display:"inline-flex",alignItems:"center",gap:2,marginLeft:2}}><Badge label="早退" bg="#FAEEDA" color="#854F0B"/>{earlyDiff>0&&<span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>-{toHStr(earlyDiff)}</span>}</span>);}
                if(r.approvedEarlyReq){const em=r.punch&&r.def.start?Math.max(0,toMin(r.def.start)-toMin(r.punch.in)):0;if(em>0) badges.push(<span key="ey" style={{display:"inline-flex",alignItems:"center",gap:2,marginLeft:2}}><Badge label="早出" bg="#EAF3DE" color="#3B6D11"/><span style={{fontSize:11,color:"#3B6D11",fontWeight:500}}>+{toHStr(Math.round(em/10)*10)}</span></span>);}
                if(badges.length===0&&r.workMin>0) badges.push(<Badge key="ok" label="正常" bg="#EAF3DE" color="#3B6D11"/>);
              }
              const rowBg=r.absent||r.missingOut?"#FFF5F5":r.isLate||r.isEarly||r.isOT?"#FFFCF5":r.isLeave?"#F0FAF5":"";
              return <tr key={r.d} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:rowBg}}>
                <td style={tdS}>{r.ds.slice(5).replace("-","/")} {isHoliday(r.ds)&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝</span>}</td>
                <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
                <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
                <td style={tdS}>{r.punch?.in||"―"}</td>
                <td style={tdS}>{r.outT||(r.punch?<span style={{color:"#A32D2D",fontWeight:500}}>退勤忘れ</span>:"―")}</td>
                <td style={{...tdS,fontWeight:500}}>{r.workMin>0?toHStr(r.workMin):"―"}</td>
                <td style={tdS}><div style={{display:"flex",flexWrap:"wrap",gap:2}}>{badges}</div></td>
                <td style={tdS}><button onClick={()=>startEdit(r)} style={{...bS,padding:"3px 10px",fontSize:11}}>{r.punch?"修正":"追加"}</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>;
    })()}
    {/* タイムカード（理学療法士パート：サブタブ1） */}
    {isPTpart&&subTab===1&&<div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
        <div style={{fontSize:13,fontWeight:700}}>タイムカード</div>
        {!selfView&&<button onClick={()=>printTimecard(false)} style={{...bP,padding:"6px 16px",fontSize:12}}>🖨 印刷</button>}
      </div>
      <div style={{...crd,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr>{["日","曜","シフト","出勤","退勤","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=>{
            const dc=r.dow===0||isHoliday(r.ds)?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
            const isEditing=editKey===r.ds;
            if(isEditing) return <EditRow key={r.ds} r={r} colSpan={6}/>;
            return <tr key={r.d} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              <td style={tdS}>{r.ds.slice(5).replace("-","/")} {isHoliday(r.ds)&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝</span>}</td>
              <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
              <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
              <td style={tdS}>{r.punch?.in||"―"}</td>
              <td style={tdS}>{r.punch?.out||(r.punch?<span style={{color:"#A32D2D",fontWeight:500}}>退勤忘れ</span>:"―")}</td>
              <td style={tdS}><button onClick={()=>startEdit(r)} style={{...bS,padding:"3px 10px",fontSize:11}}>{r.punch?"修正":"追加"}</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>}

    {/* 月次レポート（正社員・その他パート）：照合レポートのみ */}
    {!isPTpart&&emp&&(()=>{
      const isNursePart=emp.role==="看護師"&&emp.type==="パート";
      const isRehaPart=emp.role==="リハマネ"&&emp.type==="パート";
      if(isNursePart) return <NurseMonthlyReport emp={emp} punches={punches} shifts={shifts} shiftDefsData={shiftDefsData} outerYear={year} outerMonth={month} reload={reload}/>;
      if(isRehaPart) return <RehaMonthlyReport emp={emp} punches={punches} shifts={shifts} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} outerYear={year} outerMonth={month} reload={reload}/>;
      return <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <div style={{fontSize:13,fontWeight:600}}>月次レポート</div>
          {!selfView&&<button onClick={()=>printTimecard(true)} style={{...bP,padding:"6px 16px",fontSize:12}}>🖨 印刷</button>}
        </div>
        <ReportView emps={[emp]} shifts={shifts} punches={punches} otReqs={otReqs} lvReqs={lvReqs} initEmpId={emp.id} shiftDefsData={shiftDefsData} isAdmin={!selfView} reload={reload} outerYear={year} outerMonth={month}/>
      </div>;
    })()}
  </div>;
}

// ── ReportView ────────────────────────────────────────────────────────────────
function ReportView({emps,shifts,punches,otReqs,lvReqs,initEmpId,shiftDefsData,isAdmin=false,reload=()=>{},outerYear=null,outerMonth=null}){
  const cur0=getCurrentPeriod();
  const [year,setYear]=useState(outerYear||cur0.year),[month,setMonth]=useState(outerMonth||cur0.month),[rf,setRf]=useState(""),[empId,setEmpId]=useState(initEmpId||emps[0]?.id||""),[filter,setFilter]=useState("all");
  const [editKey,setEditKey]=useState(null),[editForm,setEditForm]=useState({in:"",out:""}),[editSaving,setEditSaving]=useState(false);
  // outerYear/outerMonthが変わったら同期
  useEffect(()=>{
    if(outerYear!==null&&outerMonth!==null){setYear(outerYear);setMonth(outerMonth);}
  },[outerYear,outerMonth]);
  const filtered=rf?emps.filter(e=>e.role===rf):emps;
  const emp=emps.find(e=>e.id===empId)||emps[0],rule=emp?getOtRule(emp):{type:"none"};
  // 15日締め期間
  const period=getPeriodRange(year,month);
  const periodDays=(()=>{
    const days=[];let cur=new Date(period.start);const end=new Date(period.end);
    while(cur<=end){days.push(`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`);cur.setDate(cur.getDate()+1);}
    return days;
  })();
  const rows=(()=>{
    if(!emp) return [];
    const _rule=getOtRule(emp),isApprovalType=_rule.type==="approval",isOvertimeRequest=_rule.type==="overtime_request",roundMin=_rule.roundMin||0;
    const _empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
    return periodDays.map(ds=>{
      const dow=new Date(ds).getDay(),d=parseInt(ds.slice(8));
      const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
      const st=shiftRow?.shiftType||"off",def=_empDefs[st]||_empDefs.off||SHIFT_DEFS.off,isOff=!def.start;
      const shiftBreakMin=def.breakMin!=null?def.breakMin:0;
      const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
      const _lvMatch=(lvReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
      const isShiftLeave=isAnyLeaveShift(st),isLeave=!!_lvMatch||isShiftLeave,leaveHalf=_lvMatch?.half||leaveShiftHalf(st)||null;
      const approvedEarlyReq=(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="early");
      const approvedOTReq=(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="overtime");
      let swMin=0,awMin=0,otMin=0,diffMin=0,late=false,earlyLeave=false,absent=false,adj=punch?.adjusted||false,earlyAdj=false;
      const missingOut=!!punch&&!punch.out&&!isOff&&!isLeave,missingIn=!!punch&&!punch.in&&!!punch.out&&!isOff&&!isLeave;
      if(!isOff&&def.start) swMin=toMin(def.end)-toMin(def.start)-shiftBreakMin;
      if(punch&&punch.out&&punch.in){
        const shiftStartMin=toMin(def.start||"00:00"),shiftEndMin=toMin(def.end||"00:00"),im=toMin(punch.in),om=toMin(punch.out);
        let imForWork=im;
        if(!isOff&&def.start&&im<shiftStartMin){if(approvedEarlyReq){imForWork=im;earlyAdj=false;}else{imForWork=shiftStartMin;earlyAdj=true;}}
        let rawOtMin=Math.max(0,om-shiftEndMin);
        if(isApprovalType) otMin=approvedOTReq?roundDownMin(rawOtMin,roundMin):0;
        else if(isOvertimeRequest) otMin=rawOtMin;
        else if(roundMin>0&&!isOff) otMin=roundDownMin(rawOtMin,roundMin);
        else otMin=rawOtMin;
        awMin=Math.max(0,om-imForWork-(punch.break!=null?punch.break:shiftBreakMin));
        if(!isOff&&def.start){if(im>shiftStartMin+1) late=true;if(om<shiftEndMin-1) earlyLeave=true;diffMin=om-shiftEndMin;}
        else{otMin=isOff?awMin:otMin;}
      } else if(!isOff&&!isLeave&&!missingOut&&!missingIn) absent=true;
      const isOffPunch=isOff&&!!punch?.out;
      const bg=isLeave?"#F0FAF5":absent||missingOut||missingIn?"#FFF5F5":adj||earlyAdj?"#F5F4FE":isOffPunch?"#F5F9FE":late||earlyLeave||otMin>0?"#FFFCF5":"";
      return {d,dow,ds,st,def,isOff,swMin,punch,awMin,otMin,diffMin,late,earlyLeave,absent,missingOut,missingIn,adjusted:adj,earlyAdj,isLeave,leaveHalf,isOffPunch,rowBg:bg,approvedOTReq,approvedEarlyReq};
    });
  })();
  const saveEdit=async(r)=>{
    setEditSaving(true);
    try{
      if(!editForm.in){
        if(r.punch) await gasDelete("打刻",r.punch.id);
      } else {
        const breakMin=r.def.breakMin!=null?r.def.breakMin:BREAK_MIN;
        const data=convertTo({id:r.punch?.id||newId(),empId:emp.id,date:r.ds,in:editForm.in,out:editForm.out||"",break:breakMin,adjusted:false},PUNCH_INV);
        await gasSave("打刻",data);
      }
      await reload(); setEditKey(null);
    }catch(e){alert("保存失敗："+e.message);}
    setEditSaving(false);
  };
  const tS=rows.reduce((s,r)=>s+(r.isOff||r.absent?0:r.swMin),0),tO=rows.reduce((s,r)=>s+r.otMin,0);
  // 実働合計（roundタイプはシフト内時間、その他は±5分丸め）
  const tA=rows.reduce((s,r)=>{
    if(!r.punch?.out||!r.punch?.in||r.isLeave||r.isOff) return s;
    const shiftStart=toMin(r.def.start||"00:00"),shiftEnd=toMin(r.def.end||"00:00");
    const pIn=toMin(r.punch.in),pOut=toMin(r.punch.out);
    const breakMin=r.def.breakMin!=null?Number(r.def.breakMin):BREAK_MIN;
    if(rule.type==="round"&&emp?.type==="正社員"){
      const workIn=Math.max(pIn,shiftStart);
      const workOut=Math.min(pOut,shiftEnd);
      return s+Math.max(0,workOut-workIn-breakMin);
    }
    const hasApprovedOT=(otReqs||[]).some(req=>String(req.empId)===String(emp?.id)&&req.date===r.ds&&req.status==="approved");
    let adjIn=pIn,adjOut=pOut;
    if(r.def.start&&r.def.end&&!hasApprovedOT){
      if(shiftStart-pIn>=5) adjIn=shiftStart;
      if(pOut-shiftEnd>=5) adjOut=shiftEnd;
    }
    return s+Math.max(0,adjOut-adjIn-breakMin);
  },0);
  const lC=rows.filter(r=>r.late).length,eC=rows.filter(r=>r.earlyLeave).length,abC=rows.filter(r=>r.absent).length,adjC=rows.filter(r=>r.adjusted||r.earlyAdj).length,lvC=rows.filter(r=>r.isLeave).reduce((s,r)=>s+(r.leaveHalf?0.5:1),0);

  // 月20h超過アラート（fixed・overtime_requestの両方）
  const isFixedOT=rule.type==="fixed"||rule.type==="overtime_request";
  const otAlert=isFixedOT&&tO>(rule.limitH||20)*60;

  // 理学療法士正社員：時間外申請済みの残業時間と未申請の残業時間を分離
  const approvedOTMin=rule.type==="overtime_request"
    ?rows.reduce((s,r)=>s+(r.approvedOTReq?r.otMin:0),0):0;
  const unapprovedOTMin=rule.type==="overtime_request"
    ?rows.reduce((s,r)=>s+(!r.approvedOTReq&&r.otMin>0?r.otMin:0),0):0;
  const unapprovedAlert=rule.type==="overtime_request"&&unapprovedOTMin>(rule.limitH||20)*60;

  // 週超過残業の計算（理学療法士正社員・週上限時間設定あり）
  const weekLimit=emp?.weekLimit?Number(emp.weekLimit):null;
  const weeklyOT=(()=>{
    if(!weekLimit||rule.type!=="overtime_request") return 0;
    const weekMap={};
    rows.forEach(r=>{
      const weekStart=new Date(r.ds); // r.dsから直接生成（月ズレ防止）
      const dow=weekStart.getDay();
      const diff=dow===0?-6:1-dow;
      weekStart.setDate(weekStart.getDate()+diff);
      const wk=weekStart.toISOString().slice(0,10);
      if(!weekMap[wk]) weekMap[wk]=0;
      weekMap[wk]+=r.swMin;
    });
    return Object.values(weekMap).reduce((s,min)=>s+Math.max(0,min-weekLimit*60),0);
  })();

  const diff=tA-tS;
  const disp=filter==="issues"?rows.filter(r=>r.absent||r.adjusted||r.earlyAdj||r.late||r.earlyLeave||r.otMin>0):rows;
  const prevM=()=>month===1?(setYear(y=>y-1),setMonth(12)):setMonth(m=>m-1);
  const nextM=()=>month===12?(setYear(y=>y+1),setMonth(1)):setMonth(m=>m+1);
  return <div>
    {!initEmpId&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:"1rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:6}}><button onClick={prevM} style={bS}>‹</button><span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{period.label}</span><button onClick={nextM} style={bS}>›</button><span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span></div>
      {!initEmpId&&<><select value={rf} onChange={e=>setRf(e.target.value)} style={{...iS,width:"auto"}}><option value="">全職種</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select><select value={empId} onChange={e=>setEmpId(e.target.value)} style={{...iS,width:"auto"}}>{filtered.map(e=><option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}</select></>}
      <select value={filter} onChange={e=>setFilter(e.target.value)} style={{...iS,width:"auto"}}><option value="all">全日</option><option value="issues">問題のある日のみ</option></select>
    </div>}
    {initEmpId&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:"1rem"}}>
      <select value={filter} onChange={e=>setFilter(e.target.value)} style={{...iS,width:"auto"}}><option value="all">全日</option><option value="issues">問題のある日のみ</option></select>
    </div>}
    {emp&&<div style={{...crd,padding:"12px 14px",marginBottom:"1rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <div style={{width:36,height:36,borderRadius:"50%",background:AVATAR_COLORS[emps.findIndex(e=>e.id===emp.id)%AVATAR_COLORS.length][0],color:AVATAR_COLORS[emps.findIndex(e=>e.id===emp.id)%AVATAR_COLORS.length][1],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:500}}>{emp.name[0]}</div>
        <div><div style={{fontSize:14,fontWeight:500}}>{emp.name}</div><div style={{fontSize:11,color:"var(--color-text-secondary)"}}>{emp.role} ・ {emp.type}{!initEmpId&&<span style={{marginLeft:8,padding:"2px 8px",borderRadius:99,fontSize:10,fontWeight:500,background:rule.type==="none"?"#EAF3DE":rule.type==="fixed"?"#E6F1FB":"#FCEBEB",color:rule.type==="none"?"#3B6D11":rule.type==="fixed"?"#185FA5":"#A32D2D"}}>{OT_RULE_LABEL[rule.type]}</span>}</div></div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8}}>
        {[["出勤",rows.filter(r=>!r.absent&&!r.isOff&&r.awMin>0).length+"日",""],["欠勤",abC+"日",abC>0?"#A32D2D":"#3B6D11"],["遅刻",lC+"回",lC>0?"#854F0B":"#3B6D11"],["早退",eC+"回",eC>0?"#854F0B":"#3B6D11"],["有給",lvC+"日","#0F6E56"],[rule.type==="approval"?"打刻調整":"残業日",rule.type==="approval"?adjC+"件":rows.filter(r=>r.otMin>0&&!r.isOff).length+"日",""]].map(([l,v,c])=>(
          <div key={l} style={{textAlign:"center",padding:"8px 4px",background:"var(--color-background-secondary)",borderRadius:8}}><div style={{fontSize:10,color:"var(--color-text-secondary)",marginBottom:2}}>{l}</div><div style={{fontSize:16,fontWeight:500,color:c||"var(--color-text-primary)"}}>{v}</div></div>
        ))}
      </div>
      <div style={{display:"flex",gap:12,marginTop:10,fontSize:12,color:"var(--color-text-secondary)",flexWrap:"wrap"}}>
        <span>所定：<strong style={{color:"var(--color-text-primary)"}}>{toHStr(tS)}</strong></span>
        {emp?.type!=="正社員"&&<span>実働：<strong style={{color:"var(--color-text-primary)"}}>{toHStr(tA)}</strong></span>}
        <span>残業：<strong style={{color:tO>0?"#854F0B":"var(--color-text-primary)"}}>{toHStr(tO)}</strong></span>
        {rule.type==="overtime_request"&&<span>時間外申請済：<strong style={{color:"#185FA5"}}>{toHStr(approvedOTMin)}</strong></span>}
        {rule.type==="overtime_request"&&unapprovedOTMin>0&&<span>未申請残業：<strong style={{color:"#A32D2D"}}>{toHStr(unapprovedOTMin)}</strong></span>}
        {weeklyOT>0&&<span>週超過：<strong style={{color:"#854F0B"}}>{toHStr(weeklyOT)}</strong></span>}
        {otAlert&&<span style={{color:"#A32D2D",fontWeight:500}}>⚠ 固定残業（{rule.limitH}h）超過</span>}
        {unapprovedAlert&&<span style={{color:"#A32D2D",fontWeight:500}}>⚠ 未申請残業が月{rule.limitH}h超過</span>}
      </div>
    </div>}
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["日","曜","シフト","出勤","退勤",...(emp?.type!=="正社員"?["実働"]:[""]),"勤務状況",isAdmin?"操作":""].map(h=>h?<th key={h} style={thS}>{h}</th>:null)}</tr></thead>
        <tbody>{disp.map(r=>{
          const dc=r.dow===0||isHoliday(r.ds)?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          const isEditing=editKey===r.ds;
          if(isAdmin&&isEditing){
            const wm=editForm.in&&editForm.out?Math.max(0,toMin(editForm.out)-toMin(editForm.in)-(r.def.breakMin!=null?r.def.breakMin:BREAK_MIN)):null;
            return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:"#F0F4FF"}}>
              <td style={tdS}><strong>{r.ds.slice(5).replace("-","/")}</strong></td>
              <td style={tdS}>{DOW_JP[r.dow]}</td>
              <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
              <td style={{padding:"4px 6px"}}><input type="time" value={editForm.in} onChange={e=>setEditForm(p=>({...p,in:e.target.value}))} style={{...iS,width:105,fontSize:13,padding:"5px 8px"}}/></td>
              <td style={{padding:"4px 6px"}}><input type="time" value={editForm.out} onChange={e=>setEditForm(p=>({...p,out:e.target.value}))} disabled={!editForm.in} style={{...iS,width:105,fontSize:13,padding:"5px 8px",opacity:editForm.in?1:0.4}}/></td>
              {emp?.type!=="正社員"&&<td style={{...tdS,fontWeight:500,color:"#1251a3"}}>{wm!=null?toHStr(wm):"―"}</td>}
              <td colSpan={emp?.type!=="正社員"?2:3} style={tdS}><div style={{display:"flex",gap:6}}>
                <button onClick={()=>saveEdit(r)} disabled={editSaving} style={{...bP,padding:"4px 12px",fontSize:12,opacity:editSaving?0.5:1}}>{editSaving?"保存中...":"保存"}</button>
                <button onClick={()=>setEditKey(null)} disabled={editSaving} style={{...bS,padding:"4px 10px",fontSize:12}}>取消</button>
                {r.punch&&<button onClick={async()=>{if(!confirm(`${r.ds.slice(5).replace("-","/")} の打刻を削除しますか？`))return;try{await gasDelete("打刻",r.punch.id);await reload();setEditKey(null);}catch(e){alert(e.message);}}} disabled={editSaving} style={{...bD,padding:"4px 10px",fontSize:12}}>削除</button>}
              </div></td>
            </tr>;
          }
          // 勤務状況バッジ生成
          const badges=[];
          if(r.absent) badges.push(<Badge key="absent" label="要対応" bg="#FCEBEB" color="#A32D2D"/>);
          else if(r.missingOut) badges.push(<Badge key="missingOut" label="退勤忘れ" bg="#FCEBEB" color="#A32D2D"/>);
          else if(r.missingIn) badges.push(<Badge key="missingIn" label="出勤忘れ" bg="#FCEBEB" color="#A32D2D"/>);
          else if(r.isLeave) badges.push(<Badge key="leave" label={r.leaveHalf==="am"?"有休(午前)":r.leaveHalf==="pm"?"有休(午後)":"有休"} bg="#E1F5EE" color="#0F6E56"/>);
          else if(r.isOff&&!r.punch) badges.push(<Badge key="off" label="休日" bg="var(--color-background-secondary)" color="var(--color-text-tertiary)"/>);
          else {
            if(r.otMin>0) badges.push(<span key="ot" style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:4}}><Badge label="残業" bg="#FAEEDA" color="#854F0B"/><span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>+{toHStr(r.otMin)}</span></span>);
            if(r.late){const lateMin=r.punch?toMin(r.punch.in)-toMin(r.def.start):0;badges.push(<span key="late" style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:4}}><Badge label="遅刻" bg="#FAEEDA" color="#854F0B"/><span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>{lateMin>0?"-"+lateMin+"分":""}</span></span>);}
            if(r.earlyLeave){const elMin=r.punch?.out?toMin(r.def.end)-toMin(r.punch.out):0;badges.push(<span key="el" style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:4}}><Badge label="早退" bg="#FAEEDA" color="#854F0B"/><span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>{elMin>0?"-"+elMin+"分":""}</span></span>);}
            if(r.approvedEarlyReq){const earlyMin=r.punch&&r.def.start?Math.max(0,toMin(r.def.start)-toMin(r.punch.in)):0;if(earlyMin>0) badges.push(<span key="early" style={{display:"inline-flex",alignItems:"center",gap:3,marginRight:4}}><Badge label="早出" bg="#EAF3DE" color="#3B6D11"/><span style={{fontSize:11,color:"#3B6D11",fontWeight:500}}>+{earlyMin}分</span></span>);}
            if(badges.length===0&&r.awMin>0) badges.push(<Badge key="ok" label="正常" bg="#EAF3DE" color="#3B6D11"/>);
            if(badges.length===0&&r.isOff&&r.punch) badges.push(<Badge key="offpunch" label="休日出勤" bg="#FAEEDA" color="#854F0B"/>);
          }
          return <tr key={r.d} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:r.rowBg}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} {isHoliday(r.ds)&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝</span>}</td>
            <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{...tdS,color:r.punch?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{r.punch?.in||"―"}</td>
            <td style={{...tdS,color:(r.punch?.adjusted||r.earlyAdj)&&!(rule.type==="round"&&emp?.type==="正社員")?"#534AB7":"var(--color-text-primary)"}}>{r.punch?.out||(r.punch?"未退勤":"―")}</td>
            {emp?.type!=="正社員"&&<td style={{...tdS,fontWeight:500}}>{(()=>{
              if(!r.punch?.out||!r.punch?.in) return "―";
              const shiftStart=toMin(r.def.start||"00:00"),shiftEnd=toMin(r.def.end||"00:00");
              const pIn=toMin(r.punch.in),pOut=toMin(r.punch.out);
              const breakMin=r.def.breakMin!=null?Number(r.def.breakMin):BREAK_MIN;
              const _rule=getOtRule(emp);
              if(_rule.type==="round"&&emp?.type==="正社員"){
                const workIn=Math.max(pIn,shiftStart);
                const workOut=Math.min(pOut,shiftEnd);
                const adjWork=Math.max(0,workOut-workIn-breakMin);
                return adjWork>0?toHStr(adjWork):"―";
              }
              const hasApprovedOT=(otReqs||[]).some(req=>String(req.empId)===String(emp?.id)&&req.date===r.ds&&req.status==="approved");
              let adjIn=pIn,adjOut=pOut;
              if(r.def.start&&r.def.end&&!hasApprovedOT){
                if(shiftStart-pIn>=5) adjIn=shiftStart;
                if(pOut-shiftEnd>=5) adjOut=shiftEnd;
              }
              const adjWork=Math.max(0,adjOut-adjIn-breakMin);
              return adjWork>0?toHStr(adjWork):"―";
            })()}</td>}
            <td style={{...tdS}}><div style={{display:"flex",flexWrap:"wrap",gap:2,alignItems:"center"}}>{badges}</div></td>
            {isAdmin&&<td style={tdS}><button onClick={()=>{setEditKey(r.ds);setEditForm({in:r.punch?.in||"",out:r.punch?.out||""});}} style={{...bS,padding:"3px 10px",fontSize:11}}>{r.punch?"修正":"追加"}</button></td>}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

// ── PunchEditor ───────────────────────────────────────────────────────────────
function PunchEditor({emps,punches:punchesFromProps,shifts,shiftDefsData,punchFixReqs,reload}){
  const CY=new Date().getFullYear(),CM=new Date().getMonth()+1;
  const [empId,setEmpId]=useState(emps[0]?.id||""),[year,setYear]=useState(CY),[month,setMonth]=useState(CM),[editKey,setEditKey]=useState(null),[editForm,setEditForm]=useState({in:"",out:""});
  const [localPunches,setLocalPunches]=useState(null);
  const [pfTab,setPfTab]=useState("editor");
  // 一括入力モード
  const [bulkMode,setBulkMode]=useState(false);
  const [bulkData,setBulkData]=useState({}); // {ds: {in:"", out:""}}
  const [bulkSaving,setBulkSaving]=useState(false);
  const [bulkMsg,setBulkMsg]=useState("");
  const punches=localPunches||punchesFromProps;
  const prevM=()=>month===1?(setYear(y=>y-1),setMonth(12)):setMonth(m=>m-1);
  const nextM=()=>month===12?(setYear(y=>y+1),setMonth(1)):setMonth(m=>m+1);
  const last=daysInMonth(year,month);
  const empObj=emps.find(e=>String(e.id)===String(empId));
  const empD=getShiftDefsByRole(empObj?.role||"理学療法士",shiftDefsData||{});
  const rows=Array.from({length:last},(_,i)=>{
    const d=i+1,ds=`${year}-${pad(month)}-${pad(d)}`;
    const punch=punches.find(p=>String(p.empId)===String(empId)&&p.date===ds);
    const shiftRow=shifts.find(s=>String(s.empId)===String(empId)&&s.date===ds);
    return {d,dow:new Date(year,month-1,d).getDay(),ds,punch,def:empD[shiftRow?.shiftType||"off"]||empD.off||SHIFT_DEFS.off};
  });

  // 一括入力モード開始：既存打刻を初期値として読み込む
  const startBulk=()=>{
    const init={};
    rows.forEach(r=>{
      init[r.ds]={in:r.punch?.in||"", out:r.punch?.out||""};
    });
    setBulkData(init);
    setBulkMsg("");
    setBulkMode(true);
  };
  // 一括入力：シフトから出退勤時刻を一括セット
  const fillFromShift=()=>{
    const next={...bulkData};
    rows.forEach(r=>{
      if(r.def.start&&r.def.end){
        next[r.ds]={in:r.def.start, out:r.def.end};
      }
    });
    setBulkData(next);
  };
  // 一括入力：休日をクリア
  const clearOff=()=>{
    const next={...bulkData};
    rows.forEach(r=>{
      if(!r.def.start) next[r.ds]={in:"",out:""};
    });
    setBulkData(next);
  };
  // 一括保存
  const saveBulk=async()=>{
    const toSave=rows.filter(r=>{
      const b=bulkData[r.ds];
      return b&&b.in; // 出勤時刻があるものだけ保存
    });
    const toDelete=rows.filter(r=>{
      const b=bulkData[r.ds];
      return (!b||!b.in)&&r.punch; // 出勤時刻なし＋既存打刻あり→削除
    });
    if(toSave.length===0&&toDelete.length===0){setBulkMsg("変更なし");return;}
    if(!confirm(`${toSave.length}件を保存、${toDelete.length}件を削除します。よろしいですか？`))return;
    setBulkSaving(true);setBulkMsg("");
    try{
      // 保存
      const saveList=toSave.map(r=>{
        const b=bulkData[r.ds];
        const breakMin=r.def.breakMin!=null?r.def.breakMin:BREAK_MIN;
        return convertTo({id:r.punch?.id||newId(),empId,date:r.ds,in:b.in,out:b.out||"",break:breakMin,adjusted:false},PUNCH_INV);
      });
      if(saveList.length>0) await gasSaveMany("打刻",saveList);
      // 削除（1件ずつ）
      for(const r of toDelete){
        await gasDelete("打刻",r.punch.id);
      }
      await reload();
      setBulkMode(false);
      setBulkMsg(`${toSave.length}件保存、${toDelete.length}件削除しました`);
      setTimeout(()=>setBulkMsg(""),4000);
    }catch(e){alert("一括保存失敗："+e.message);}
    setBulkSaving(false);
  };
  const saveEdit=async ds=>{
    if(!editForm.in){
      const punch=punches.find(p=>p.empId===empId&&p.date===ds);
      if(punch)try{await gasDelete("打刻",punch.id);await reload();}catch(e){alert("削除失敗："+e.message);}
    } else {
      const existing=punches.find(p=>String(p.empId)===String(empId)&&p.date===ds);
      const data=convertTo({id:existing?.id||newId(),empId,date:ds,in:editForm.in,out:editForm.out,break:BREAK_MIN,adjusted:false},PUNCH_INV);
      try{await gasSave("打刻",data);await reload();}catch(e){alert("保存失敗："+e.message);}
    }
    setEditKey(null);
  };
  const delPunch=async ds=>{
    if(!confirm("この日の打刻を削除しますか？"))return;
    const punch=punches.find(p=>String(p.empId)===String(empId)&&p.date===ds);
    if(!punch)return;
    try{await gasDelete("打刻",punch.id);await reload();}catch(e){alert("削除失敗："+e.message);}
  };
  const approvePFR=async req=>{
    if(!confirm(`${req.date}の打刻修正申請を承認し、打刻を上書きしますか？`))return;
    try{
      const existing=punchesFromProps.find(p=>String(p.empId)===String(req.empId)&&p.date===req.date);
      const empObj=emps.find(e=>String(e.id)===String(req.empId));
      const shiftRow=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.date);
      const empD=getShiftDefsByRole(empObj?.role||"理学療法士",shiftDefsData||{});
      const def=empD[shiftRow?.shiftType||"off"]||empD.off||SHIFT_DEFS.off;
      if(req.reqIn||req.reqOut){
        const data=convertTo({id:existing?.id||newId(),empId:req.empId,date:req.date,in:req.reqIn||existing?.in||"",out:req.reqOut||existing?.out||"",break:def.breakMin!=null?def.breakMin:BREAK_MIN,adjusted:true},PUNCH_INV);
        await gasSave("打刻",data);
      }
      await gasSave("打刻修正申請",convertTo({...req,status:"approved"},PUNCH_FIX_INV));
      await reload();
    }catch(e){alert("承認失敗："+e.message);}
  };
  const rejectPFR=async req=>{
    if(!confirm("この申請を却下しますか？"))return;
    try{await gasSave("打刻修正申請",convertTo({...req,status:"rejected"},PUNCH_FIX_INV));await reload();}catch(e){alert("却下失敗："+e.message);}
  };
  const pendingPFR=(punchFixReqs||[]).filter(r=>r.status==="pending");
  const donePFR=(punchFixReqs||[]).filter(r=>r.status!=="pending");
  return <div>
    <div style={{display:"flex",gap:0,marginBottom:"1rem",borderBottom:"2px solid var(--color-border-tertiary)"}}>
      {[["editor","打刻修正"],["requests","修正申請"]].map(([k,l])=>(
        <button key={k} onClick={()=>setPfTab(k)} style={{padding:"8px 20px",border:"none",borderBottom:pfTab===k?"2.5px solid #1251a3":"2.5px solid transparent",background:"transparent",color:pfTab===k?"#1251a3":"var(--color-text-secondary)",fontWeight:pfTab===k?700:400,fontSize:14,cursor:"pointer",marginBottom:"-2px"}}>
          {l}{k==="requests"&&pendingPFR.length>0&&<span style={{marginLeft:4,padding:"1px 5px",borderRadius:99,fontSize:9,background:"#E24B4A",color:"white"}}>{pendingPFR.length}</span>}
        </button>
      ))}
    </div>
    {pfTab==="editor"&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:"1rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><button onClick={prevM} style={bS}>‹</button><span style={{fontSize:14,fontWeight:500}}>{year}年{month}月</span><button onClick={nextM} style={bS}>›</button></div>
        <select value={empId} onChange={e=>{setEmpId(e.target.value);setBulkMode(false);}} style={{...iS,width:"auto"}}>{emps.map(e=><option key={e.id} value={e.id}>{e.name}（{e.role}）</option>)}</select>
        {!bulkMode
          ?<button onClick={startBulk} style={{...bP,padding:"8px 16px",fontSize:13}}>一括入力</button>
          :<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <button onClick={fillFromShift} style={{padding:"6px 12px",borderRadius:8,border:"1px solid #1251a3",background:"#E6F1FB",color:"#1251a3",fontSize:12,cursor:"pointer",fontWeight:500}}>シフトから自動入力</button>
            <button onClick={clearOff} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--color-border-secondary)",background:"var(--color-background-primary)",color:"var(--color-text-secondary)",fontSize:12,cursor:"pointer"}}>休日をクリア</button>
            <button onClick={saveBulk} disabled={bulkSaving} style={{...bP,padding:"8px 16px",fontSize:13,opacity:bulkSaving?0.5:1}}>{bulkSaving?"保存中...":"まとめて保存"}</button>
            <button onClick={()=>setBulkMode(false)} disabled={bulkSaving} style={{...bS,padding:"8px 12px",fontSize:13}}>キャンセル</button>
          </div>
        }
        {bulkMsg&&<span style={{fontSize:12,color:"#3B6D11",padding:"4px 10px",background:"#EAF3DE",borderRadius:6}}>{bulkMsg}</span>}
      </div>

      {/* 一括入力モード */}
      {bulkMode&&<div style={{...crd,overflow:"hidden",marginBottom:"1rem"}}>
        <div style={{padding:"8px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:12,color:"var(--color-text-secondary)",background:"#F5F9FE"}}>
          出勤時刻を入力した日が保存されます。空欄の日は打刻なし（既存打刻がある場合は削除）になります。
        </div>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr>
            <th style={thS}>日</th><th style={thS}>曜</th><th style={thS}>シフト</th>
            <th style={thS}>出勤</th><th style={thS}>退勤</th><th style={{...thS,color:"var(--color-text-tertiary)"}}>実働(参考)</th>
          </tr></thead>
          <tbody>{rows.map(r=>{
            const b=bulkData[r.ds]||{in:"",out:""};
            const dc=r.dow===0?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
            const isOff=!r.def.start;
            const wm=b.in&&b.out?Math.max(0,toMin(b.out)-toMin(b.in)-(r.def.breakMin!=null?r.def.breakMin:BREAK_MIN)):null;
            const hasExisting=!!r.punch;
            const willDelete=hasExisting&&!b.in;
            return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:willDelete?"#FFF5F5":isOff&&b.in?"#FFFCF5":b.in?"":""}}>
              <td style={tdS}>{month}/{r.d}{hasExisting&&<span style={{marginLeft:4,fontSize:9,padding:"1px 4px",borderRadius:3,background:"#E6F1FB",color:"#185FA5"}}>既存</span>}</td>
              <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
              <td style={tdS}><span style={{fontSize:11,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
              <td style={{padding:"4px 6px"}}>
                <input type="time" value={b.in} onChange={e=>setBulkData(p=>({...p,[r.ds]:{...p[r.ds],in:e.target.value}}))}
                  style={{...iS,width:110,fontSize:13,padding:"5px 8px",background:b.in?"#fff":"var(--color-background-secondary)"}}/>
              </td>
              <td style={{padding:"4px 6px"}}>
                <input type="time" value={b.out} onChange={e=>setBulkData(p=>({...p,[r.ds]:{...p[r.ds],out:e.target.value}}))}
                  disabled={!b.in}
                  style={{...iS,width:110,fontSize:13,padding:"5px 8px",opacity:b.in?1:0.4,background:b.out?"#fff":"var(--color-background-secondary)"}}/>
              </td>
              <td style={{...tdS,color:wm!=null?"var(--color-text-primary)":"var(--color-text-tertiary)",fontWeight:wm!=null?500:400}}>
                {wm!=null?toHStr(wm):willDelete?"― (削除)":"―"}
              </td>
            </tr>;
          })}</tbody>
        </table>
        <div style={{padding:"10px 14px",borderTop:"0.5px solid var(--color-border-tertiary)",display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={saveBulk} disabled={bulkSaving} style={{...bP,padding:"10px 24px",opacity:bulkSaving?0.5:1}}>{bulkSaving?"保存中...":"まとめて保存"}</button>
          <button onClick={()=>setBulkMode(false)} disabled={bulkSaving} style={bS}>キャンセル</button>
        </div>
      </div>}

      {/* 通常の1日ずつ編集テーブル（一括モード中は非表示） */}
      {!bulkMode&&<>
      <div style={{fontSize:11,color:"var(--color-text-tertiary)",marginBottom:8,padding:"6px 10px",background:"var(--color-background-secondary)",borderRadius:8,display:"inline-block"}}>打刻がない日も「追加」で登録できます。休憩時間はシフト定義の設定が自動適用されます。</div>
      <div style={{...crd,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr>{["日","曜","シフト","出勤","退勤","実働","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=>{
            const dc=r.dow===0?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
            const wm=r.punch?.out?Math.max(0,toMin(r.punch.out)-toMin(r.punch.in)-BREAK_MIN):null;
            const isE=editKey===r.ds;
            return <tr key={r.d} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:isE?"#F5F9FE":""}}>
              <td style={tdS}>{month}/{r.d}</td><td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
              <td style={tdS}><span style={{fontSize:10,padding:"2px 6px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
              {isE?<>
                <td style={{padding:"4px 6px"}}><input type="time" value={editForm.in} onChange={e=>setEditForm(p=>({...p,in:e.target.value}))} style={{...iS,width:100}}/></td>
                <td style={{padding:"4px 6px"}}><input type="time" value={editForm.out} onChange={e=>setEditForm(p=>({...p,out:e.target.value}))} style={{...iS,width:100}}/></td>
                <td style={{...tdS,color:"var(--color-text-tertiary)"}}>―</td>
                <td style={tdS}><div style={{display:"flex",gap:6}}><button onClick={()=>saveEdit(r.ds)} style={{...bP,padding:"4px 10px",fontSize:11}}>保存</button><button onClick={()=>setEditKey(null)} style={{...bS,padding:"4px 10px",fontSize:11}}>取消</button></div></td>
              </>:<>
                <td style={{...tdS,color:r.punch?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{r.punch?.in||"―"}</td>
                <td style={{...tdS,color:r.punch?.adjusted?"#534AB7":"var(--color-text-primary)"}}>
                  {r.punch?.out||(r.punch?<span style={{color:"#A32D2D",fontWeight:500}}>退勤忘れ</span>:"―")}
                </td>
                <td style={{...tdS,fontWeight:500}}>{wm!==null?toHStr(wm):"―"}</td>
                <td style={tdS}><div style={{display:"flex",gap:6,alignItems:"center"}}>
                  {r.punch&&!r.punch.out&&<Badge label="退勤忘れ" bg="#FCEBEB" color="#A32D2D"/>}
                  <button onClick={()=>{setEditKey(r.ds);setEditForm({in:r.punch?.in||"",out:r.punch?.out||""}); }} style={{...bS,padding:"3px 10px",fontSize:11}}>{r.punch?"修正":"追加"}</button>
                  {r.punch&&<button onClick={()=>delPunch(r.ds)} style={bD}>削除</button>}
                </div></td>
              </>}
            </tr>;
          })}</tbody>
        </table>
      </div>
      </>}{/* end !bulkMode */}
    </>}
    {pfTab==="requests"&&<div>
      {pendingPFR.length===0&&donePFR.length===0&&<div style={{padding:"1.5rem",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>申請はありません</div>}
      {pendingPFR.length>0&&<div style={{marginBottom:"1rem"}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8,color:"#A32D2D"}}>承認待ち（{pendingPFR.length}件）</div>
        <div style={{...crd,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["従業員","日付","現在の打刻","申請出勤","申請退勤","理由","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{pendingPFR.sort((a,b)=>a.date<b.date?-1:1).map(r=>{
              const emp=emps.find(e=>String(e.id)===String(r.empId));
              const cur=punchesFromProps.find(p=>String(p.empId)===String(r.empId)&&p.date===r.date);
              return <tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:"#FFFCF5"}}>
                <td style={tdS}><div style={{fontWeight:500}}>{emp?.name||r.empId}</div><div style={{fontSize:10,color:"var(--color-text-tertiary)"}}>{emp?.role}</div></td>
                <td style={tdS}>{r.date}</td>
                <td style={{...tdS,color:"var(--color-text-tertiary)",fontSize:11}}>{cur?`${cur.in||"―"}→${cur.out||"未退勤"}`:"打刻なし"}</td>
                <td style={{...tdS,color:"#185FA5",fontWeight:500}}>{r.reqIn||"―"}</td>
                <td style={{...tdS,color:"#185FA5",fontWeight:500}}>{r.reqOut||"―"}</td>
                <td style={{...tdS,color:"var(--color-text-secondary)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason}</td>
                <td style={tdS}><div style={{display:"flex",gap:4}}>
                  <button onClick={()=>approvePFR(r)} style={{...bP,padding:"3px 10px",fontSize:11}}>承認</button>
                  <button onClick={()=>rejectPFR(r)} style={{...bD,padding:"3px 8px",fontSize:11}}>却下</button>
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>}
      {donePFR.length>0&&<div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:600,color:"var(--color-text-secondary)"}}>処理済み</div>
          <button onClick={()=>{
            const w=window.open("","_blank");
            const emp2id=id=>emps.find(e=>String(e.id)===String(id));
            const rows2=donePFR.sort((a,b)=>b.date<a.date?-1:1).map(r=>{
              const e2=emp2id(r.empId);
              const cur2=punchesFromProps.find(p=>String(p.empId)===String(r.empId)&&p.date===r.date);
              return `<tr><td>${e2?.name||r.empId}</td><td>${r.date}</td><td>${r.origIn||r.origOut?`${r.origIn||"―"}→${r.origOut||"未退勤"}`:cur2?`${cur2.in||"―"}→${cur2.out||"未退勤"}`:"打刻なし"}</td><td>${r.reqIn||"―"}→${r.reqOut||"―"}</td><td>${r.reason}</td><td>${r.status==="approved"?"承認済":"却下"}</td></tr>`;
            }).join("");
            w.document.write(`<html><head><title>打刻修正申請一覧</title><style>body{font-family:sans-serif;font-size:12px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#f5f5f5}@media print{button{display:none}}</style></head><body><h2 style="font-size:15px">打刻修正申請 処理済み一覧</h2><button onclick="window.print()">印刷</button><br/><br/><table><tr><th>従業員</th><th>日付</th><th>元の打刻</th><th>修正後（申請）</th><th>理由</th><th>状態</th></tr>${rows2}</table></body></html>`);
            w.document.close();
          }} style={{...bS,padding:"4px 12px",fontSize:11}}>🖨 印刷</button>
        </div>
        <div style={{...crd,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr>{["従業員","日付","元の打刻","修正後（申請）","理由","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{donePFR.sort((a,b)=>b.date<a.date?-1:1).map(r=>{
              const emp=emps.find(e=>String(e.id)===String(r.empId));
              const cur=punchesFromProps.find(p=>String(p.empId)===String(r.empId)&&p.date===r.date);
              return <tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
                <td style={tdS}>{emp?.name||r.empId}</td>
                <td style={tdS}>{r.date}</td>
                <td style={{...tdS,color:"var(--color-text-tertiary)",fontSize:11}}>{r.origIn||r.origOut?`${r.origIn||"―"}→${r.origOut||"未退勤"}`:cur?`${cur.in||"―"}→${cur.out||"未退勤"}`:"打刻なし"}</td>
                <td style={{...tdS,color:"#185FA5",fontWeight:500}}>{r.reqIn||"―"}→{r.reqOut||"―"}</td>
                <td style={{...tdS,color:"var(--color-text-secondary)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason}</td>
                <td style={tdS}>{r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>}
    </div>}
  </div>;
}

// ── PunchScreen (Employee) ────────────────────────────────────────────────────
function PunchScreen({emp,punches:punchesFromProps,shifts,shiftDefsData,reload,onPunchesUpdate=()=>{}}){
  const [msg,setMsg]=useState(""),[saving,setSaving]=useState(false);
  const [localPunches,setLocalPunches]=useState(null);
  const punches=localPunches||punchesFromProps;
  const td=today();
  const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===td);
  const _psDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  const def=_psDefs[shiftRow?.shiftType||"off"]||_psDefs.off||SHIFT_DEFS.off;
  const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===td);
  const doPunch=async type=>{
    setSaving(true);
    const now=nowStr();
    try{
      if(type==="in"){
        const newPunch={id:newId(),empId:emp.id,date:td,in:now,out:"",break:def.breakMin!=null?def.breakMin:BREAK_MIN,adjusted:false};
        const data=convertTo(newPunch,PUNCH_INV);
        // 即時画面更新（楽観的更新）
        const updated=(localPunches||punchesFromProps).concat([newPunch]);
        setLocalPunches(updated);
        onPunchesUpdate(updated);
        setMsg("出勤打刻しました："+now);
        // GASに保存（バックグラウンド）
        await gasSave("打刻",data);
        setLocalPunches(null);
      } else {
        if(!punch)return;
        const updatedPunch={...punch,out:now};
        const data=convertTo(updatedPunch,PUNCH_INV);
        // 即時画面更新（楽観的更新）
        const updated=(localPunches||punchesFromProps).map(p=>String(p.empId)===String(emp.id)&&p.date===td?updatedPunch:p);
        setLocalPunches(updated);
        onPunchesUpdate(updated);
        setMsg("退勤打刻しました："+now);
        // GASに保存（バックグラウンド）
        await gasSave("打刻",data);
        setLocalPunches(null);
      }
    }catch(e){setLocalPunches(null);alert("打刻失敗："+e.message);}
    setSaving(false);
  };
  const status=!punch?"未出勤":!punch.out?"勤務中":"退勤済";
  const sc=status==="勤務中"?"#185FA5":status==="退勤済"?"#3B6D11":"var(--color-text-tertiary)";
  const sb=status==="勤務中"?"#E6F1FB":status==="退勤済"?"#EAF3DE":"var(--color-background-secondary)";
  return <div style={{maxWidth:400}}>
    <div style={{...crd,padding:"1.25rem",marginBottom:"1rem"}}>
      <div style={{fontSize:12,color:"var(--color-text-secondary)",marginBottom:4}}>本日のシフト</div>
      <div style={{fontSize:17,fontWeight:700,marginBottom:12}}>{def.start?`${def.label}（${def.start}〜${def.end}）`:"休日"}</div>
      <div style={{marginBottom:"1rem"}}><span style={{padding:"4px 12px",borderRadius:99,fontSize:12,fontWeight:500,background:sb,color:sc}}>{status}</span>{punch&&<span style={{marginLeft:8,fontSize:12,color:"var(--color-text-secondary)"}}>出勤：{punch.in}{punch.out?" / 退勤："+punch.out:""}</span>}</div>
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>doPunch("in")} disabled={!!punch||saving} style={{flex:1,padding:"12px 0",borderRadius:8,background:punch?"var(--color-background-secondary)":"#185FA5",color:punch?"var(--color-text-tertiary)":"white",border:"none",fontWeight:500,fontSize:14,cursor:punch?"default":"pointer",opacity:punch?0.5:1}}>出勤打刻</button>
        <button onClick={()=>doPunch("out")} disabled={!punch||!!punch?.out||saving} style={{flex:1,padding:"12px 0",borderRadius:8,background:(!punch||punch?.out)?"var(--color-background-secondary)":"#0F6E56",color:(!punch||punch?.out)?"var(--color-text-tertiary)":"white",border:"none",fontWeight:500,fontSize:14,cursor:(!punch||punch?.out)?"default":"pointer",opacity:(!punch||punch?.out)?0.5:1}}>退勤打刻</button>
      </div>
      {msg&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>{msg}</div>}
    </div>
  </div>;
}

// ── OTRequest (Employee) ──────────────────────────────────────────────────────
function OTRequest({emp,shifts,otReqs,shiftDefsData,reload}){
  const rule=getOtRule(emp);
  const [form,setForm]=useState({date:today(),requestedEnd:"",reason:""}),[sub,setSub]=useState(false);
  const _otDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  const def=_otDefs[shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===form.date)?.shiftType||"off"]||_otDefs.off||SHIFT_DEFS.off;
  const myReqs=otReqs.filter(r=>String(r.empId)===String(emp.id));
  const submit=async()=>{
    if(!form.requestedEnd||!form.reason)return;
    try{
      const data=convertTo({id:newId(),empId:emp.id,date:form.date,shiftEnd:def.end||"―",requestedEnd:form.requestedEnd,reason:form.reason,status:"pending",type:"overtime"},OT_INV);
      await gasSave("残業申請",data);
      setForm({date:today(),requestedEnd:"",reason:""});setSub(true);setTimeout(()=>setSub(false),3000);
      await reload();
    }catch(e){alert("申請失敗："+e.message);}
  };
  if(rule.type!=="approval") return <div style={{background:"var(--color-background-secondary)",borderRadius:12,padding:"1.5rem",color:"var(--color-text-secondary)",fontSize:13}}>残業申請の対象外です。</div>;
  return <div>
    <div style={{...crd,padding:"1.25rem",marginBottom:"1rem",maxWidth:400}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>残業申請</div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>対象日</div><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={iS}/></div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>シフト終了：<strong>{def.end||"―"}</strong> → 申請退勤時刻</div><input type="time" value={form.requestedEnd} onChange={e=>setForm(p=>({...p,requestedEnd:e.target.value}))} style={iS}/></div>
      <div style={{marginBottom:"1rem"}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>残業理由</div><textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3} placeholder="例：患者対応のため" style={{...iS,resize:"vertical"}}/></div>
      <button onClick={submit} disabled={!form.requestedEnd||!form.reason} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:(!form.requestedEnd||!form.reason)?0.4:1}}>申請する</button>
      {sub&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>申請しました。管理者の承認をお待ちください。</div>}
    </div>
    {myReqs.length>0&&<div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>申請履歴</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{["日付","申請退勤","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
      <tbody>{myReqs.map(r=><tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}><td style={tdS}>{r.date}</td><td style={tdS}>{r.requestedEnd}</td><td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td></tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

// ── LeaveRequest (Employee) ───────────────────────────────────────────────────
function LeaveRequest({emp,leaves,lvReqs,reload}){
  const isPartt=emp.type==="パート";
  const [form,setForm]=useState({date:"",half:"full",reason:""}),[sub,setSub]=useState(false);
  const leave=leaves.find(l=>String(l.empId)===String(emp.id))||{granted:0,used:0,records:"[]"};
  const rem=calcLeaveRemainingCompat(leave,lvReqs,emp.id);
  const myReqs=lvReqs.filter(r=>String(r.empId)===String(emp.id)).sort((a,b)=>b.date<a.date?-1:1);
  const days=isPartt?1:(form.half==="full"?1:0.5);
  const canSubmit=!!(form.date&&form.reason&&rem>=days);
  const submit=async()=>{
    if(!canSubmit)return;
    try{
      const half=isPartt?null:(form.half==="full"?null:form.half);
      const data=convertTo({id:newId(),empId:emp.id,date:form.date,reason:form.reason,status:"pending",half},LV_REQ_INV);
      await gasSave("有給申請",data);
      setForm({date:"",half:"full",reason:""});setSub(true);setTimeout(()=>setSub(false),3000);
      await reload();
    }catch(e){alert("申請失敗："+e.message);}
  };
  const activeBuckets=getActiveBuckets(leave?.records,lvReqs,emp.id);
  return <div>
    <div style={{display:"flex",gap:"1rem",alignItems:"flex-start",flexWrap:"wrap",marginBottom:"1rem"}}>
      {/* 左：有給申請フォーム */}
      <div style={{...crd,padding:"1.25rem",flex:"1 1 320px",maxWidth:420}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>有給申請</div>
        {rem<=0&&<div style={{marginBottom:10,padding:"8px 12px",background:"#FCEBEB",borderRadius:8,fontSize:12,color:"#A32D2D"}}>有給残日数がありません</div>}
        {/* 正社員のみ種別選択 */}
        {!isPartt&&<div style={{marginBottom:10}}>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:4}}>種別</div>
          <div style={{display:"flex",gap:6}}>
            {[["full","全日（1日）"],["am","午前（0.5日）"],["pm","午後（0.5日）"]].map(([v,l])=>(
              <button key={v} onClick={()=>setForm(p=>({...p,half:v}))} style={{flex:1,padding:"8px 4px",borderRadius:8,border:form.half===v?"2px solid #1251a3":"1px solid var(--color-border-secondary)",background:form.half===v?"#E6F1FB":"var(--color-background-primary)",color:form.half===v?"#1251a3":"var(--color-text-secondary)",fontSize:12,fontWeight:form.half===v?600:400,cursor:"pointer"}}>{l}</button>
            ))}
          </div>
        </div>}
        <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>取得日</div>
          <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={iS}/></div>
        <div style={{marginBottom:"1rem"}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>理由</div>
          <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={2} placeholder="例：私用のため" style={{...iS,resize:"vertical"}}/></div>
        <button onClick={submit} disabled={!canSubmit} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:canSubmit?1:0.4}}>申請する</button>
        {sub&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>申請しました。</div>}
      </div>
      {/* 右：有給残日数 */}
      <div style={{...crd,padding:"1rem",flex:"1 1 200px",minWidth:200}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:activeBuckets.length>0?10:0}}>
          <span style={{fontSize:13,fontWeight:600}}>有効残日数</span>
          <span style={{fontSize:22,fontWeight:700,color:rem<3?"#A32D2D":"#3B6D11"}}>{rem}日</span>
        </div>
        {activeBuckets.map((b,i)=>(
          <div key={b.id||i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"4px 0",borderTop:"0.5px solid var(--color-border-tertiary)"}}>
            <span style={{color:"var(--color-text-secondary)"}}>{b.grantedAt}付与
              <span style={{marginLeft:6,color:b.expiresAt<addDays(today(),30)?"#A32D2D":"var(--color-text-tertiary)"}}>（{b.expiresAt}まで）</span>
            </span>
            <span style={{fontWeight:600,color:"#1251a3"}}>{b.remaining}日</span>
          </div>
        ))}
        {activeBuckets.length===0&&<div style={{fontSize:12,color:"var(--color-text-tertiary)"}}>有給が付与されていません</div>}
      </div>
    </div>
    {myReqs.length>0&&<div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>申請履歴</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["取得日","種別","理由","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{myReqs.map(r=><tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <td style={tdS}>{r.date}</td>
          <td style={tdS}>{r.half==="am"?<Badge label="午前" bg="#E1F5EE" color="#0F6E56"/>:r.half==="pm"?<Badge label="午後" bg="#E1F5EE" color="#0F6E56"/>:<Badge label="全日" bg="#E6F1FB" color="#185FA5"/>}</td>
          <td style={{...tdS,color:"var(--color-text-secondary)"}}>{r.reason}</td>
          <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

// ── TransferRequest (Employee) ────────────────────────────────────────────────
function TransferRequest({emp,shifts,transferReqs,shiftDefsData,reload}){
  const [form,setForm]=useState({workDate:today(),workShift:"day",offDate:"",reason:""}),[sub,setSub]=useState(false);
  const myReqs=(transferReqs||[]).filter(r=>String(r.empId)===String(emp.id)).sort((a,b)=>b.workDate<a.workDate?-1:1);
  const empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  const shiftOptions=Object.entries(empDefs).filter(([k])=>k!=="off").map(([k,v])=>({key:k,label:v.label,start:v.start,end:v.end}));
  const submit=async()=>{
    if(!form.workDate||!form.offDate||!form.reason)return;
    try{
      const data=convertTo({id:newId(),empId:emp.id,workDate:form.workDate,workShift:form.workShift,offDate:form.offDate,reason:form.reason,status:"pending"},TRANSFER_INV);
      await gasSave("振替申請",data);
      setForm({workDate:today(),workShift:"day",offDate:"",reason:""});setSub(true);setTimeout(()=>setSub(false),3000);
      await reload();
    }catch(e){alert("申請失敗："+e.message);}
  };
  return <div>
    <div style={{...crd,padding:"1.25rem",marginBottom:"1rem",maxWidth:420}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>振替申請</div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>振替出勤日</div>
        <input type="date" value={form.workDate} onChange={e=>setForm(p=>({...p,workDate:e.target.value}))} style={iS}/>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>振替出勤シフト</div>
        <select value={form.workShift} onChange={e=>setForm(p=>({...p,workShift:e.target.value}))} style={iS}>
          {shiftOptions.map(s=><option key={s.key} value={s.key}>{s.label}{s.start?`（${s.start}〜${s.end}）`:""}</option>)}
        </select>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>振替休日</div>
        <input type="date" value={form.offDate} onChange={e=>setForm(p=>({...p,offDate:e.target.value}))} style={iS}/>
      </div>
      <div style={{marginBottom:"1rem"}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>理由</div>
        <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3} placeholder="例：〇月〇日の休日出勤の振替" style={{...iS,resize:"vertical"}}/>
      </div>
      <button onClick={submit} disabled={!form.workDate||!form.offDate||!form.reason} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:(!form.workDate||!form.offDate||!form.reason)?0.4:1}}>申請する</button>
      {sub&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>申請しました。承認をお待ちください。</div>}
    </div>
    {myReqs.length>0&&<div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>申請履歴</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["振替出勤日","シフト","振替休日","理由","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{myReqs.map(r=>{
          const def=empDefs[r.workShift]||empDefs.off;
          return <tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
            <td style={tdS}>{r.workDate}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:def.color,color:def.tc}}>{def.label}</span></td>
            <td style={tdS}>{r.offDate}</td>
            <td style={{...tdS,color:"var(--color-text-secondary)",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason}</td>
            <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </div>;
}

// ── TransferApproval (Admin/Lead) ─────────────────────────────────────────────
function TransferApproval({emps,transferReqs,shifts,lvReqs=[],shiftDefsData,reload}){
  const pending=(transferReqs||[]).filter(r=>r.status==="pending");
  const done=(transferReqs||[]).filter(r=>r.status!=="pending");
  const empName=id=>emps.find(e=>String(e.id)===String(id))?.name||id;
  const decide=async(id,status)=>{
    const req=(transferReqs||[]).find(r=>r.id===id);if(!req)return;
    try{
      await gasSave("振替申請",convertTo({...req,status},TRANSFER_INV));
      if(status==="approved"){
        // 振替出勤日：有休がある場合は上書きしない
        const workExisting=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.workDate);
        const workHasLeave=lvReqs?.some(r=>String(r.empId)===String(req.empId)&&r.date===req.workDate&&r.status==="approved");
        if(!workHasLeave&&(!workExisting||!isAnyLeaveShift(workExisting?.shiftType))){
          await gasSave("シフト",convertTo({id:workExisting?.id||newId(),empId:req.empId,date:req.workDate,shiftType:req.workShift},SHIFT_INV));
        }
        // 振替休日：有休がある場合は上書きしない
        const offExisting=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.offDate);
        const offHasLeave=lvReqs?.some(r=>String(r.empId)===String(req.empId)&&r.date===req.offDate&&r.status==="approved");
        if(!offHasLeave&&(!offExisting||!isAnyLeaveShift(offExisting?.shiftType))){
          await gasSave("シフト",convertTo({id:offExisting?.id||newId(),empId:req.empId,date:req.offDate,shiftType:"off"},SHIFT_INV));
        }
      }
      await reload();
    }catch(e){alert("更新失敗："+e.message);}
  };
  const Sec=({title,items,showAct})=><div style={{...crd,overflow:"hidden",marginBottom:"1rem"}}>
    <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>{title} <span style={{fontSize:11,fontWeight:400,color:"var(--color-text-secondary)"}}>{items.length}件</span></div>
    {items.length===0?<div style={{padding:"1.5rem",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>該当なし</div>:
    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
      <thead><tr>{["従業員","振替出勤日","シフト","振替休日","理由","状態","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
      <tbody>{items.map(r=>{
        const emp=emps.find(e=>String(e.id)===String(r.empId));
        const empDefs=getShiftDefsByRole(emp?.role||"",shiftDefsData||{});
        const def=empDefs[r.workShift]||empDefs.off||{label:r.workShift,color:"#f5f5f5",tc:"#333"};
        return <tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <td style={tdS}>{empName(r.empId)}</td>
          <td style={tdS}>{r.workDate}</td>
          <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:def.color,color:def.tc}}>{def.label}</span></td>
          <td style={tdS}>{r.offDate}</td>
          <td style={{...tdS,color:"var(--color-text-secondary)",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason}</td>
          <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
          <td style={tdS}>{showAct&&<div style={{display:"flex",gap:6}}>
            <button onClick={()=>decide(r.id,"approved")} style={{padding:"3px 10px",borderRadius:6,background:"#EAF3DE",color:"#3B6D11",border:"none",fontSize:11,cursor:"pointer",fontWeight:500}}>承認</button>
            <button onClick={()=>decide(r.id,"rejected")} style={{padding:"3px 10px",borderRadius:6,background:"#FCEBEB",color:"#A32D2D",border:"none",fontSize:11,cursor:"pointer",fontWeight:500}}>却下</button>
          </div>}</td>
        </tr>;
      })}</tbody>
    </table>}
  </div>;
  return <div><Sec title="承認待ち" items={pending} showAct/><Sec title="処理済み" items={done} showAct={false}/></div>;
}

// ── ApprovalCenter（申請許可タブ） ────────────────────────────────────────────
function ApprovalCenter({emps,otReqs,lvReqs,transferReqs,punchFixReqs,punches=[],shifts,shiftDefsData,leaves,reload,showOT=false,showPunchFix=true}){
  const [typeFilter,setTypeFilter]=useState("all");
  const [statusFilter,setStatusFilter]=useState("pending");
  const empName=id=>emps.find(e=>String(e.id)===String(id))?.name||id;

  // 有休申請の承認・却下
  const decideLv=async(id,status)=>{
    const req=lvReqs.find(r=>r.id===id);if(!req)return;
    try{
      // 承認時の残日数チェック
      if(status==="approved"){
        const lv=leaves.find(l=>String(l.empId)===String(req.empId));
        const rem=calcLeaveRemainingCompat(lv,lvReqs,req.empId);
        const days=req.half?0.5:1;
        if(rem<days){ alert(`有給残日数が不足しています（残${rem}日、必要${days}日）`); return; }
      }
      if(status==="approved"){
        const td=today();
        const leaveShiftKey=req.half==="am"?"leave_am":req.half==="pm"?"leave_pm":"leave";
        const shiftRow=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.date);
        // 過去・当日・未来すべてシフトをleave系に同期（まだleave系でない場合）
        if(!shiftRow||!isAnyLeaveShift(shiftRow.shiftType)){
          await gasSave("シフト",convertTo({id:shiftRow?.id||newId(),empId:req.empId,date:req.date,shiftType:leaveShiftKey},SHIFT_INV));
        }
        if(req.date>td){
          await gasSave("有給申請",convertTo({...req,status:"approved"},LV_REQ_INV));
          alert(`${req.date} は未来の日付のため、日付到達時に自動消化されます。`);
        } else {
          await gasSave("有給申請",convertTo({...req,status},LV_REQ_INV));
        }
      } else {
        await gasSave("有給申請",convertTo({...req,status},LV_REQ_INV));
      }
      await reload();
    }catch(e){alert("更新失敗："+e.message);}
  };

  const cancelLv=async(id)=>{
    const req=lvReqs.find(r=>r.id===id);if(!req)return;
    if(!confirm(`${req.date} の承認済み有休を取り消しますか？\n有給日数が返還されます。`))return;
    try{
      await gasSave("有給申請",convertTo({...req,status:"rejected"},LV_REQ_INV));
      const shiftRow=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.date);
      // 同日に他の承認済み申請がある場合はシフトを変更しない
      const otherApproved=lvReqs.filter(r=>r.id!==id&&String(r.empId)===String(req.empId)&&r.date===req.date&&r.status==="approved");
      if(otherApproved.length===0&&shiftRow&&isAnyLeaveShift(shiftRow.shiftType)){
        await gasSave("シフト",convertTo({...shiftRow,shiftType:"off"},SHIFT_INV));
      }
      await reload();
    }catch(e){alert("取消失敗："+e.message);}
  };

  // 残業・早出申請の承認・却下
  const decideOT=async(id,status)=>{
    const req=otReqs.find(r=>r.id===id);if(!req)return;
    try{await gasSave("残業申請",convertTo({...req,status},OT_INV));await reload();}
    catch(e){alert("更新失敗："+e.message);}
  };

  // 振替申請の承認・却下
  const decideTR=async(id,status)=>{
    const req=transferReqs.find(r=>r.id===id);if(!req)return;
    try{
      await gasSave("振替申請",convertTo({...req,status},TRANSFER_INV));
      if(status==="approved"){
        // 振替出勤日：有休シフト・有休申請がある場合は上書きしない
        const workExisting=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.workDate);
        const workHasLeave=lvReqs.some(r=>String(r.empId)===String(req.empId)&&r.date===req.workDate&&r.status==="approved");
        if(!workHasLeave&&(!workExisting||!isAnyLeaveShift(workExisting?.shiftType))){
          await gasSave("シフト",convertTo({id:workExisting?.id||newId(),empId:req.empId,date:req.workDate,shiftType:req.workShift},SHIFT_INV));
        }
        // 振替休日：有休シフト・有休申請がある場合は上書きしない
        const offExisting=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.offDate);
        const offHasLeave=lvReqs.some(r=>String(r.empId)===String(req.empId)&&r.date===req.offDate&&r.status==="approved");
        if(!offHasLeave&&(!offExisting||!isAnyLeaveShift(offExisting?.shiftType))){
          await gasSave("シフト",convertTo({id:offExisting?.id||newId(),empId:req.empId,date:req.offDate,shiftType:"off"},SHIFT_INV));
        }
      }
      await reload();
    }catch(e){alert("更新失敗："+e.message);}
  };

  // 打刻修正申請の承認・却下
  const decidePF=async(id,status)=>{
    const req=punchFixReqs.find(r=>r.id===id);if(!req)return;
    try{
      if(status==="approved"&&(req.reqIn||req.reqOut)){
        const existing=punches?.find(p=>String(p.empId)===String(req.empId)&&p.date===req.date);
        const empObj=emps.find(e=>String(e.id)===String(req.empId));
        const shiftRow=shifts.find(s=>String(s.empId)===String(req.empId)&&s.date===req.date);
        const empD=getShiftDefsByRole(empObj?.role||"理学療法士",shiftDefsData||{});
        const def=empD[shiftRow?.shiftType||"off"]||empD.off||SHIFT_DEFS.off;
        const data=convertTo({id:existing?.id||newId(),empId:req.empId,date:req.date,in:req.reqIn||existing?.in||"",out:req.reqOut||existing?.out||"",break:def.breakMin!=null?def.breakMin:BREAK_MIN,adjusted:true},PUNCH_INV);
        await gasSave("打刻",data);
      }
      await gasSave("打刻修正申請",convertTo({...req,status},PUNCH_FIX_INV));
      await reload();
    }catch(e){alert("更新失敗："+e.message);}
  };

  // 全申請を統合してフィルタリング
  const allItems=[
    ...lvReqs.map(r=>({...r,_type:"leave"})),
    ...(showOT?otReqs.filter(r=>r.type==="overtime"||r.type==="early").map(r=>({...r,_type:"ot"}))
      :otReqs.filter(r=>r.type==="early").map(r=>({...r,_type:"ot"}))),
    ...(transferReqs||[]).map(r=>({...r,_type:"transfer"})),
    ...(showPunchFix?(punchFixReqs||[]).map(r=>({...r,_type:"punchfix"})):[]),
  ].sort((a,b)=>{
    const da=a.date||a.workDate||""; const db=b.date||b.workDate||"";
    return da<db?1:-1;
  });

  const typeOptions=[
    {key:"all",label:"すべて"},
    {key:"leave",label:"有休"},
    ...(showPunchFix?[{key:"punchfix",label:"打刻修正"}]:[]),
    {key:"transfer",label:"振替"},
    {key:"early",label:"早出"},
    ...(showOT?[{key:"overtime",label:"残業/時間外"}]:[]),
  ];

  const filtered=allItems.filter(r=>{
    if(statusFilter==="pending"&&r.status!=="pending") return false;
    if(typeFilter==="all") return true;
    if(typeFilter==="leave") return r._type==="leave";
    if(typeFilter==="punchfix") return r._type==="punchfix";
    if(typeFilter==="transfer") return r._type==="transfer";
    if(typeFilter==="early") return r._type==="ot"&&r.type==="early";
    if(typeFilter==="overtime") return r._type==="ot"&&(r.type==="overtime");
    return true;
  });

  const pendingCount=allItems.filter(r=>r.status==="pending").length;

  const typeLabel=r=>{
    if(r._type==="leave") return r.half==="am"?"有休（午前）":r.half==="pm"?"有休（午後）":"有休";
    if(r._type==="punchfix") return "打刻修正";
    if(r._type==="transfer") return "振替";
    if(r._type==="ot") return r.type==="early"?"早出":"残業/時間外";
    return "その他";
  };
  const typeBg=r=>{
    if(r._type==="leave") return {bg:"#E1F5EE",color:"#0F6E56"};
    if(r._type==="punchfix") return {bg:"#EEEDFE",color:"#3C3489"};
    if(r._type==="transfer") return {bg:"#E6F1FB",color:"#185FA5"};
    if(r._type==="ot"&&r.type==="early") return {bg:"#EAF3DE",color:"#3B6D11"};
    if(r._type==="ot") return {bg:"#FAEEDA",color:"#854F0B"};
    return {bg:"#f5f5f5",color:"#333"};
  };

  const summary=r=>{
    if(r._type==="leave") return `${r.date}（${r.reason||"―"}）`;
    if(r._type==="punchfix") return `${r.date}　${r.reqIn||"―"}→${r.reqOut||"―"}`;
    if(r._type==="transfer") return `出勤:${r.workDate}　休日:${r.offDate}`;
    if(r._type==="ot") return `${r.date}　→${r.requestedEnd||"―"}`;
    return "―";
  };

  return <div>
    {/* フィルターバー */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center",marginBottom:"1rem"}}>
      <div style={{display:"flex",gap:4}}>
        {[["pending","承認待ち"],["all","全件"]].map(([v,l])=>(
          <button key={v} onClick={()=>setStatusFilter(v)} style={{padding:"5px 12px",borderRadius:6,border:statusFilter===v?"2px solid #1251a3":"0.5px solid var(--color-border-secondary)",background:statusFilter===v?"#E6F1FB":"var(--color-background-primary)",color:statusFilter===v?"#1251a3":"var(--color-text-secondary)",fontSize:12,cursor:"pointer",fontWeight:statusFilter===v?600:400}}>{l}</button>
        ))}
      </div>
      <div style={{width:"1px",height:20,background:"var(--color-border-secondary)"}}/>
      <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {typeOptions.map(({key,label})=>(
          <button key={key} onClick={()=>setTypeFilter(key)} style={{padding:"5px 12px",borderRadius:6,border:typeFilter===key?"2px solid #854F0B":"0.5px solid var(--color-border-secondary)",background:typeFilter===key?"#FAEEDA":"var(--color-background-primary)",color:typeFilter===key?"#854F0B":"var(--color-text-secondary)",fontSize:12,cursor:"pointer",fontWeight:typeFilter===key?600:400}}>{label}</button>
        ))}
      </div>
      {pendingCount>0&&<span style={{marginLeft:"auto",padding:"3px 10px",borderRadius:99,fontSize:12,fontWeight:600,background:"#FAEEDA",color:"#854F0B"}}>承認待ち {pendingCount}件</span>}
    </div>

    {/* 申請一覧 */}
    <div style={{...crd,overflow:"hidden"}}>
      {filtered.length===0
        ?<div style={{padding:"2rem",textAlign:"center",color:"var(--color-text-tertiary)",fontSize:13}}>該当する申請はありません</div>
        :<table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr>{["従業員","種別","内容","理由","状態","操作"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>{filtered.map((r,i)=>{
            const {bg,color}=typeBg(r);
            const isPending=r.status==="pending";
            const isApproved=r.status==="approved";
            return <tr key={r.id+r._type} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
              <td style={tdS}>{empName(r.empId||r["従業員id"])}</td>
              <td style={tdS}><Badge label={typeLabel(r)} bg={bg} color={color}/></td>
              <td style={{...tdS,fontSize:11,color:"var(--color-text-secondary)"}}>{summary(r)}</td>
              <td style={{...tdS,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:"var(--color-text-secondary)"}}>{r.reason||"―"}</td>
              <td style={tdS}>
                {isPending?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>
                :isApproved?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>
                :<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}
              </td>
              <td style={tdS}>
                <div style={{display:"flex",gap:4}}>
                  {isPending&&<>
                    <button onClick={()=>{
                      if(r._type==="leave") decideLv(r.id,"approved");
                      else if(r._type==="ot") decideOT(r.id,"approved");
                      else if(r._type==="transfer") decideTR(r.id,"approved");
                      else if(r._type==="punchfix") decidePF(r.id,"approved");
                    }} style={{padding:"3px 10px",borderRadius:6,background:"#EAF3DE",color:"#3B6D11",border:"none",fontSize:11,cursor:"pointer",fontWeight:500}}>承認</button>
                    <button onClick={()=>{
                      if(r._type==="leave") decideLv(r.id,"rejected");
                      else if(r._type==="ot") decideOT(r.id,"rejected");
                      else if(r._type==="transfer") decideTR(r.id,"rejected");
                      else if(r._type==="punchfix") decidePF(r.id,"rejected");
                    }} style={{padding:"3px 10px",borderRadius:6,background:"#FCEBEB",color:"#A32D2D",border:"none",fontSize:11,cursor:"pointer",fontWeight:500}}>却下</button>
                  </>}
                  {isApproved&&r._type==="leave"&&<button onClick={()=>cancelLv(r.id)} style={{padding:"3px 10px",borderRadius:6,background:"#FCEBEB",color:"#A32D2D",border:"1px solid #F09595",fontSize:11,cursor:"pointer",fontWeight:500}}>取消</button>}
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>}
    </div>
  </div>;
}

// ── EarlyRequest (Employee) ───────────────────────────────────────────────────
function EarlyRequest({emp,shifts,otReqs,shiftDefsData,reload}){
  const [form,setForm]=useState({date:today(),requestedStart:"",reason:""}),[sub,setSub]=useState(false);
  const _defs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===form.date);
  const def=_defs[shiftRow?.shiftType||"off"]||_defs.off||SHIFT_DEFS.off;
  const myReqs=(otReqs||[]).filter(r=>String(r.empId)===String(emp.id)&&r.type==="early");
  const submit=async()=>{
    if(!form.requestedStart||!form.reason)return;
    try{
      const data=convertTo({id:newId(),empId:emp.id,date:form.date,shiftEnd:def.start||"―",requestedEnd:form.requestedStart,reason:form.reason,status:"pending",type:"early"},OT_INV);
      await gasSave("残業申請",data);
      setForm({date:today(),requestedStart:"",reason:""});setSub(true);setTimeout(()=>setSub(false),3000);
      await reload();
    }catch(e){alert("申請失敗："+e.message);}
  };
  return <div>
    <div style={{...crd,padding:"1.25rem",marginBottom:"1rem",maxWidth:420}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>早出申請</div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>対象日</div><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={iS}/></div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>シフト開始：<strong>{def.start||"―"}</strong> → 早出開始時刻</div>
        <input type="time" value={form.requestedStart} onChange={e=>setForm(p=>({...p,requestedStart:e.target.value}))} style={iS}/>
      </div>
      <div style={{marginBottom:"1rem"}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>早出理由</div>
        <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3} placeholder="例：患者対応のため" style={{...iS,resize:"vertical"}}/></div>
      <button onClick={submit} disabled={!form.requestedStart||!form.reason} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:(!form.requestedStart||!form.reason)?0.4:1}}>申請する</button>
      {sub&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>申請しました。承認をお待ちください。</div>}
    </div>
    {myReqs.length>0&&<div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>申請履歴</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["日付","早出開始","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{myReqs.sort((a,b)=>b.date<a.date?-1:1).map(r=><tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <td style={tdS}>{r.date}</td>
          <td style={tdS}>{r.requestedEnd}</td>
          <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

// ── OvertimeRequest (理学療法士正社員向け時間外申請) ──────────────────────────
function OvertimeRequest({emp,shifts,otReqs,shiftDefsData,reload}){
  const [form,setForm]=useState({date:today(),requestedEnd:"",reason:""}),[sub,setSub]=useState(false);
  const _defs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===form.date);
  const def=_defs[shiftRow?.shiftType||"off"]||_defs.off||SHIFT_DEFS.off;
  const myReqs=(otReqs||[]).filter(r=>String(r.empId)===String(emp.id)&&r.type==="overtime");
  const submit=async()=>{
    if(!form.requestedEnd||!form.reason)return;
    try{
      const data=convertTo({id:newId(),empId:emp.id,date:form.date,shiftEnd:def.end||"―",requestedEnd:form.requestedEnd,reason:form.reason,status:"pending",type:"overtime"},OT_INV);
      await gasSave("残業申請",data);
      setForm({date:today(),requestedEnd:"",reason:""});setSub(true);setTimeout(()=>setSub(false),3000);
      await reload();
    }catch(e){alert("申請失敗："+e.message);}
  };
  return <div>
    <div style={{...crd,padding:"1.25rem",marginBottom:"1rem",maxWidth:420}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>時間外申請</div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>対象日</div><input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={iS}/></div>
      <div style={{marginBottom:8}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>シフト終了：<strong>{def.end||"―"}</strong> → 申請退勤時刻</div>
        <input type="time" value={form.requestedEnd} onChange={e=>setForm(p=>({...p,requestedEnd:e.target.value}))} style={iS}/>
      </div>
      <div style={{marginBottom:"1rem"}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>時間外理由</div>
        <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={3} placeholder="例：患者対応のため" style={{...iS,resize:"vertical"}}/></div>
      <button onClick={submit} disabled={!form.requestedEnd||!form.reason} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:(!form.requestedEnd||!form.reason)?0.4:1}}>申請する</button>
      {sub&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>申請しました。承認をお待ちください。</div>}
    </div>
    {myReqs.length>0&&<div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>申請履歴</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["日付","申請退勤","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{myReqs.sort((a,b)=>b.date<a.date?-1:1).map(r=><tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <td style={tdS}>{r.date}</td>
          <td style={tdS}>{r.requestedEnd}</td>
          <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

// ── RequestTab ────────────────────────────────────────────────────────────────
function RequestTab({emp,leaves,lvReqs,shifts,otReqs,punches,punchFixReqs,shiftDefsData,transferReqs,reload}){
  const rule=getOtRule(emp);
  const hasLeave=(()=>{const lv=leaves.find(l=>String(l.empId)===String(emp.id));if(!lv) return false; return calcLeaveRemainingCompat(lv,lvReqs,emp.id)>0||safeParseJSON(lv.records,[]).some(r=>r.type==="grant");})();
  const isOTTarget=emp.role==="理学療法士"&&emp.type==="パート"; // 残業申請
  const isOvertimeRequestTarget=rule.type==="overtime_request"; // 時間外申請（理学療法士正社員）
  const isSeishain=emp.type==="正社員"; // 振替申請は正社員のみ
  const sections=[
    ...(hasLeave?[{key:"leave",label:"有給申請"}]:[]),
    ...(isOTTarget?[{key:"overtime",label:"残業申請"}]:[]),
    ...(isOvertimeRequestTarget?[{key:"overtime_request",label:"時間外申請"}]:[]),
    {key:"early",label:"早出申請"},
    ...(isSeishain?[{key:"transfer",label:"振替申請"}]:[]),
    {key:"punchfix",label:"打刻修正申請"},
  ];
  const firstKey=sections[0]?.key||"punchfix";
  const [section,setSection]=useState(firstKey);
  const validSection=sections.find(s=>s.key===section)?section:firstKey;
  return <div>
    {sections.length>1&&<div style={{display:"flex",gap:0,marginBottom:"1rem",borderBottom:"2px solid var(--color-border-tertiary)",flexWrap:"wrap"}}>
      {sections.map(s=><button key={s.key} onClick={()=>setSection(s.key)} style={{padding:"8px 20px",border:"none",borderBottom:validSection===s.key?"2.5px solid #1251a3":"2.5px solid transparent",background:"transparent",color:validSection===s.key?"#1251a3":"var(--color-text-secondary)",fontWeight:validSection===s.key?700:400,fontSize:14,cursor:"pointer",marginBottom:"-2px"}}>{s.label}</button>)}
    </div>}
    {validSection==="leave"&&hasLeave&&<LeaveRequest emp={emp} leaves={leaves} lvReqs={lvReqs} reload={reload}/>}
    {validSection==="overtime"&&isOTTarget&&<OTRequest emp={emp} shifts={shifts} otReqs={otReqs} shiftDefsData={shiftDefsData} reload={reload}/>}
    {validSection==="overtime_request"&&isOvertimeRequestTarget&&<OvertimeRequest emp={emp} shifts={shifts} otReqs={otReqs} shiftDefsData={shiftDefsData} reload={reload}/>}
    {validSection==="early"&&<EarlyRequest emp={emp} shifts={shifts} otReqs={otReqs} shiftDefsData={shiftDefsData} reload={reload}/>}
    {validSection==="transfer"&&isSeishain&&<TransferRequest emp={emp} shifts={shifts} transferReqs={transferReqs} shiftDefsData={shiftDefsData} reload={reload}/>}
    {validSection==="punchfix"&&<PunchFixRequest emp={emp} punches={punches} punchFixReqs={punchFixReqs} shifts={shifts} shiftDefsData={shiftDefsData} reload={reload}/>}
  </div>;
}

// ── PunchFixRequest ───────────────────────────────────────────────────────────
function PunchFixRequest({emp,punches,punchFixReqs,shifts,shiftDefsData,reload}){
  const [form,setForm]=useState({date:today(),reqIn:"",reqOut:"",reason:""}),[sub,setSub]=useState(false);
  const myReqs=(punchFixReqs||[]).filter(r=>String(r.empId)===String(emp.id));
  const existPunch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===form.date);
  const _defs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===form.date);
  const def=_defs[shiftRow?.shiftType||"off"]||_defs.off||SHIFT_DEFS.off;
  const submit=async()=>{
    if(!form.date||!form.reason)return;
    try{
      // 申請時点の元の打刻を記録
      const origIn=existPunch?.in||"";
      const origOut=existPunch?.out||"";
      const data=convertTo({id:newId(),empId:emp.id,date:form.date,reqIn:form.reqIn||"",reqOut:form.reqOut||"",reason:form.reason,status:"pending",origIn,origOut},PUNCH_FIX_INV);
      await gasSave("打刻修正申請",data);
      setForm({date:today(),reqIn:"",reqOut:"",reason:""});setSub(true);setTimeout(()=>setSub(false),3000);
      await reload();
    }catch(e){alert("申請失敗："+e.message);}
  };
  return <div>
    <div style={{...crd,padding:"1.25rem",marginBottom:"1rem",maxWidth:440}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>打刻修正申請</div>
      <div style={{marginBottom:8}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>対象日</div>
        <input type="date" value={form.date} onChange={e=>setForm(p=>({...p,date:e.target.value}))} style={iS}/></div>
      <div style={{marginBottom:10,padding:"8px 12px",background:"var(--color-background-secondary)",borderRadius:8,fontSize:12}}>
        <span style={{color:"var(--color-text-secondary)"}}>現在の打刻：</span>
        {existPunch?<span style={{fontWeight:500}}>{existPunch.in||"―"} → {existPunch.out||"未退勤"}</span>:<span style={{color:"var(--color-text-tertiary)"}}>打刻なし</span>}
        <span style={{marginLeft:10,color:"var(--color-text-tertiary)"}}>シフト：{def.start?`${def.label}（${def.start}〜${def.end}）`:"休日"}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>修正後・出勤時刻</div><input type="time" value={form.reqIn} onChange={e=>setForm(p=>({...p,reqIn:e.target.value}))} style={iS}/></div>
        <div><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>修正後・退勤時刻</div><input type="time" value={form.reqOut} onChange={e=>setForm(p=>({...p,reqOut:e.target.value}))} style={iS}/></div>
      </div>
      <div style={{marginBottom:"1rem"}}><div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>修正理由</div>
        <textarea value={form.reason} onChange={e=>setForm(p=>({...p,reason:e.target.value}))} rows={2} placeholder="例：打ち忘れのため" style={{...iS,resize:"vertical"}}/></div>
      <button onClick={submit} disabled={!form.date||!form.reason} style={{...bP,width:"100%",padding:"10px 0",fontSize:14,opacity:(!form.date||!form.reason)?0.4:1}}>申請する</button>
      {sub&&<div style={{marginTop:8,fontSize:12,color:"#3B6D11",padding:"6px 10px",background:"#EAF3DE",borderRadius:6}}>申請しました。管理者の確認をお待ちください。</div>}
    </div>
    {myReqs.length>0&&<div style={{...crd,overflow:"hidden"}}>
      <div style={{padding:"10px 14px",borderBottom:"0.5px solid var(--color-border-tertiary)",fontSize:13,fontWeight:500}}>申請履歴</div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["日付","申請出勤","申請退勤","理由","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{myReqs.sort((a,b)=>b.date<a.date?-1:1).map(r=><tr key={r.id} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
          <td style={tdS}>{r.date}</td><td style={tdS}>{r.reqIn||"―"}</td><td style={tdS}>{r.reqOut||"―"}</td>
          <td style={{...tdS,color:"var(--color-text-secondary)",maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.reason}</td>
          <td style={tdS}>{r.status==="pending"?<Badge label="承認待ち" bg="#FAEEDA" color="#854F0B"/>:r.status==="approved"?<Badge label="承認済" bg="#EAF3DE" color="#3B6D11"/>:<Badge label="却下" bg="#FCEBEB" color="#A32D2D"/>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </div>;
}

// ── MyShiftCalendar（カレンダー描画のみ・MyShiftWithReportから使用） ────────
function MyShiftCalendar({emp,shifts,lvReqs,shiftDefsData,punches=[],otReqs=[],year,month}){
  const first=firstDow(year,month),last=daysInMonth(year,month);
  const cells=[...Array(first).fill(null),...Array.from({length:last},(_,i)=>i+1)];
  while(cells.length%7!==0) cells.push(null);
  const td=today();
  const isPTpart=emp.role==="理学療法士"&&emp.type==="パート";
  const getStatusBadges=(ds,def)=>{
    if(!isPTpart||ds>td||!def.start) return [];
    const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
    const badges=[];
    if(!punch){badges.push({label:"欠勤",bg:"#FCEBEB",color:"#A32D2D"});return badges;}
    const shiftStart=toMin(def.start),shiftEnd=toMin(def.end);
    const punchIn=punch.in?toMin(punch.in):null,punchOut=punch.out?toMin(punch.out):null;
    if(punch.in&&!punch.out){badges.push({label:"退勤忘れ",bg:"#FCEBEB",color:"#A32D2D"});return badges;}
    let isLate=punchIn!==null&&punchIn>shiftStart,isEarlyLeave=punchOut!==null&&punchOut<shiftEnd;
    if(!isLate&&!isEarlyLeave) badges.push({label:"勤務済",bg:"#EAF3DE",color:"#3B6D11"});
    if(isLate) badges.push({label:"遅刻",bg:"#FAEEDA",color:"#854F0B"});
    if(isEarlyLeave) badges.push({label:"早退",bg:"#FAEEDA",color:"#854F0B"});
    const ot=otReqs.find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
    if(ot) badges.push({label:"残業",bg:"#EEEDFE",color:"#3C3489"});
    return badges;
  };
  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>{DOW_JP.map((d,i)=><div key={d} style={{textAlign:"center",fontSize:13,color:i===0?"#A32D2D":i===6?"#185FA5":"var(--color-text-secondary)",padding:"4px 0",fontWeight:500}}>{d}</div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>{cells.map((d,i)=>{
      if(!d) return <div key={i}/>;
      const ds=`${year}-${pad(month)}-${pad(d)}`;
      const _lvMatch=(lvReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
      const isLeave=!!_lvMatch,leaveHalf=_lvMatch?.half||null;
      const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
      const _myDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
      const def=_myDefs[(isLeave&&!leaveHalf)?"off":shiftRow?.shiftType||"off"]||_myDefs.off||SHIFT_DEFS.off;
      const dow=new Date(year,month-1,d).getDay(),isToday=ds===td,hol=isHoliday(ds);
      const leaveLabel=leaveHalf==="am"?"午前有給":leaveHalf==="pm"?"午後有給":"有給";
      const statusBadges=getStatusBadges(ds,def);
      return <div key={i} style={{borderRadius:8,padding:"6px 8px",background:isLeave&&!leaveHalf?"#E1F5EE":def.color,border:isToday?"2px solid #185FA5":"0.5px solid transparent",minHeight:72}}>
        <div style={{fontSize:16,fontWeight:600,color:dow===0||hol?"#A32D2D":dow===6?"#185FA5":isLeave?"#0F6E56":def.tc,marginBottom:4}}>{d}{hol&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝</span>}</div>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:4}}>
          <div>
            {isLeave?<div style={{fontSize:13,color:"#0F6E56",fontWeight:600}}>{leaveLabel}</div>:<div style={{fontSize:13,color:def.tc,fontWeight:600}}>{def.label}</div>}
            {!isLeave&&def.start&&<div style={{fontSize:11,color:def.tc,opacity:0.85}}>{def.start}〜{def.end}</div>}
            {isLeave&&leaveHalf&&def.start&&<div style={{fontSize:11,color:def.tc,opacity:0.85}}>{def.start}〜{def.end}</div>}
          </div>
          {statusBadges.length>0&&<div style={{display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
            {statusBadges.map((b,bi)=><span key={bi} style={{fontSize:9,fontWeight:700,padding:"1px 5px",borderRadius:3,background:b.bg,color:b.color,whiteSpace:"nowrap"}}>{b.label}</span>)}
          </div>}
        </div>
      </div>;
    })}</div>
  </div>;
}

// ── MyShift (Employee) ────────────────────────────────────────────────────────
function MyShift({emp,shifts,lvReqs,shiftDefsData,punches=[],otReqs=[]}){
  const CY=new Date().getFullYear(),CM=new Date().getMonth()+1;
  const [year,setYear]=useState(CY),[month,setMonth]=useState(CM);
  const prevM=()=>month===1?(setYear(y=>y-1),setMonth(12)):setMonth(m=>m-1);
  const nextM=()=>month===12?(setYear(y=>y+1),setMonth(1)):setMonth(m=>m+1);
  return <div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}><button onClick={prevM} style={bS}>‹</button><span style={{fontSize:14,fontWeight:500}}>{year}年{month}月</span><button onClick={nextM} style={bS}>›</button></div>
    <MyShiftCalendar emp={emp} shifts={shifts} lvReqs={lvReqs} shiftDefsData={shiftDefsData} punches={punches} otReqs={otReqs} year={year} month={month}/>
  </div>;
}



// ── MyShiftWithReport (理学療法士パート従業員) ──────────────────────────────
function MyShiftWithReport({emp,shifts,lvReqs,shiftDefsData,punches=[],otReqs=[],reload=()=>{}}){
  const cur0=getCurrentPeriod();
  const CY=new Date().getFullYear(),CM=new Date().getMonth()+1;
  // カレンダー用ナビゲーター
  const [calYear,setCalYear]=useState(CY),[calMonth,setCalMonth]=useState(CM);
  const prevCal=()=>calMonth===1?(setCalYear(y=>y-1),setCalMonth(12)):setCalMonth(m=>m-1);
  const nextCal=()=>calMonth===12?(setCalYear(y=>y+1),setCalMonth(1)):setCalMonth(m=>m+1);
  // 月次レポート用ナビゲーター（独立）
  const [repYear,setRepYear]=useState(cur0.year),[repMonth,setRepMonth]=useState(cur0.month);
  const prevRep=()=>{const pm=repMonth===1?12:repMonth-1;const py=repMonth===1?repYear-1:repYear;setRepYear(py);setRepMonth(pm);};
  const nextRep=()=>{const nm=repMonth===12?1:repMonth+1;const ny=repMonth===12?repYear+1:repYear;setRepYear(ny);setRepMonth(nm);};

  return <div>
    {/* シフトカレンダー：枠に入れて */}
    <div style={{...crd,padding:"14px 16px",marginBottom:"1.5rem"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"1rem"}}>
        <div style={{fontSize:13,fontWeight:700,color:"#111"}}>シフトカレンダー</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={prevCal} style={bS}>‹</button>
          <span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{calYear}年{calMonth}月</span>
          <button onClick={nextCal} style={bS}>›</button>
        </div>
      </div>
      <MyShiftCalendar emp={emp} shifts={shifts} lvReqs={lvReqs} shiftDefsData={shiftDefsData} punches={punches} otReqs={otReqs} year={calYear} month={calMonth}/>
    </div>

    {/* 月次レポート：枠内にナビゲーターを入れて */}
    <PTMonthlyReportSelf emp={emp} punches={punches} shifts={shifts} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} outerYear={repYear} outerMonth={repMonth} onPrev={prevRep} onNext={nextRep}/>
  </div>;
}

// ── PTMonthlyReportSelf (理学療法士パート従業員用月次レポート) ─────────────
function PTMonthlyReportSelf({emp,punches,shifts,otReqs=[],lvReqs=[],shiftDefsData,outerYear=null,outerMonth=null,onPrev=null,onNext=null}){
  const cur0=getCurrentPeriod();
  const [periodYear,setPeriodYear]=useState(outerYear||cur0.year);
  const [periodMonth,setPeriodMonth]=useState(outerMonth||cur0.month);
  const prevPeriod=onPrev||(()=>{const pm=periodMonth===1?12:periodMonth-1;const py=periodMonth===1?periodYear-1:periodYear;setPeriodYear(py);setPeriodMonth(pm);});
  const nextPeriod=onNext||(()=>{const nm=periodMonth===12?1:periodMonth+1;const ny=periodMonth===12?periodYear+1:periodYear;setPeriodYear(ny);setPeriodMonth(nm);});
  const _year=outerYear??periodYear,_month=outerMonth??periodMonth;
  const period=getPeriodRange(_year,_month);

  const days=[];
  let cur=new Date(period.start);const end=new Date(period.end);
  while(cur<=end){days.push(`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`);cur.setDate(cur.getDate()+1);}

  const empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});

  // getPTAdjustedと同じロジックをここで再実装（TimecardView外なので）
  const calcAdj=(r,punch,def)=>{
    if(!punch||!def.start) return {outT:punch?.out||"",workMin:0,lateMin:0,otMin:0,isLate:false,isEarly:false,isOT:false,adjOutRaw:null};
    const shiftStart=toMin(def.start),shiftEnd=toMin(def.end);
    const pIn=punch.in?toMin(punch.in):null,pOut=punch.out?toMin(punch.out):null;
    const approvedOT=(otReqs||[]).find(req=>String(req.empId)===String(emp.id)&&req.date===r.ds&&req.status==="approved"&&req.type==="overtime");
    const approvedEarly=(otReqs||[]).find(req=>String(req.empId)===String(emp.id)&&req.date===r.ds&&req.status==="approved"&&req.type==="early");
    let adjOut=pOut;
    if(pOut!==null){
      if(approvedOT) adjOut=toMin(approvedOT.requestedEnd);
      else if(pOut-shiftEnd>=10) adjOut=shiftEnd+7;
    }
    let workStart=shiftStart;
    if(approvedEarly) workStart=toMin(approvedEarly.requestedEnd);
    const lateMin=pIn!==null?Math.max(0,pIn-shiftStart):0;
    const isLate=lateMin>=1;
    let lateDeduct=0;if(lateMin>=4) lateDeduct=Math.ceil(lateMin/10)*10;
    const breakMin=def.breakMin!=null?Number(def.breakMin):0;
    const rawWork=pOut!==null&&adjOut!==null?Math.max(0,adjOut-workStart-breakMin-lateDeduct):0;
    const workMin=Math.floor(rawWork/10)*10;
    const otMin=adjOut!==null?Math.max(0,adjOut-shiftEnd):0;
    const isEarly=adjOut!==null&&adjOut<shiftEnd-1;
    return {outT:adjOut!==null?fmtTime(adjOut):"",workMin,lateMin,lateDeduct,otMin,isLate,isEarly,isOT:otMin>0,adjOutRaw:adjOut};
  };

  const rows=days.map(ds=>{
    const dow=new Date(ds).getDay();
    const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
    const def=empDefs[shiftRow?.shiftType||"off"]||empDefs["off"]||{label:"休日",start:null,end:null,color:"var(--color-background-secondary)",tc:"var(--color-text-tertiary)",breakMin:0};
    const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
    const isOff=!def.start;
    const _lv=(lvReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved");
    const isLeave=!!_lv;
    const adj=(!isOff&&punch)?calcAdj({ds},punch,def):{outT:"",workMin:0,lateMin:0,otMin:0,isLate:false,isEarly:false,isOT:false,adjOutRaw:null};
    const absent=!isOff&&!isLeave&&!punch;
    return {ds,dow,def,isOff,punch,isLeave,absent,...adj};
  });

  const totalWork=rows.reduce((s,r)=>s+r.workMin,0);
  const tS=rows.reduce((s,r)=>s+(r.isOff||r.absent?0:(toMin(r.def.end||"00:00")-toMin(r.def.start||"00:00")-(r.def.breakMin||0))),0);
  const attendDays=rows.filter(r=>!r.isOff&&!r.absent&&r.workMin>0).length;
  const absentDays=rows.filter(r=>r.absent).length;
  const lateDays=rows.filter(r=>r.isLate).length;
  const earlyDays=rows.filter(r=>r.isEarly).length;

  return <div>
    {/* サマリー（ナビゲーターを枠内に含める） */}
    <div style={{...crd,padding:"14px 16px",marginBottom:"1rem",background:"#fff"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontSize:13,fontWeight:700,color:"#111"}}>月次レポート</div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={prevPeriod} style={bS}>‹</button>
          <span style={{fontSize:13,fontWeight:600,color:"#1251a3"}}>{period.label}</span>
          <button onClick={nextPeriod} style={bS}>›</button>
          <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        {[["合計就労時間",toHStr(totalWork)],["出勤日数",attendDays+"日"]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center",padding:"10px 4px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8}}>
            <div style={{fontSize:11,color:"#555",marginBottom:2}}>{l}</div>
            <div style={{fontSize:20,fontWeight:700,color:"#111"}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
        {[["欠勤",absentDays+"日"],["遅刻",lateDays+"回"],["早退",earlyDays+"回"]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center",padding:"8px 4px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8}}>
            <div style={{fontSize:10,color:"#555",marginBottom:2}}>{l}</div>
            <div style={{fontSize:16,fontWeight:700,color:"#111"}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:12,fontSize:12,color:"#555"}}>
        <span>所定：<strong style={{color:"#111"}}>{toHStr(tS)}</strong></span>
        <span>実働：<strong style={{color:"#111"}}>{toHStr(totalWork)}</strong></span>
      </div>
    </div>
    {/* タイムカード */}
    <div style={{fontSize:13,fontWeight:700,marginBottom:"0.5rem",color:"#111"}}>タイムカード</div>
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["日","曜","シフト","出勤","退勤","勤務時間","勤務状況"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r=>{
          const dc=r.dow===0||isHoliday(r.ds)?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          const rawDiff=r.adjOutRaw!==null&&r.def.end?r.adjOutRaw-toMin(r.def.end):null;
          const diffRounded=rawDiff!==null?Math.round(rawDiff/10)*10:null;
          const badges=[];
          if(r.absent) badges.push(<Badge key="ab" label="要対応" bg="#FCEBEB" color="#A32D2D"/>);
          else if(r.isLeave) badges.push(<Badge key="lv" label="有休" bg="#E1F5EE" color="#0F6E56"/>);
          else if(r.isOff&&!r.punch) badges.push(<Badge key="off" label="休日" bg="var(--color-background-secondary)" color="var(--color-text-tertiary)"/>);
          else {
            if(r.isOT) badges.push(<span key="ot" style={{display:"inline-flex",alignItems:"center",gap:2}}><Badge label="残業" bg="#FAEEDA" color="#854F0B"/>{diffRounded>0&&<span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>+{toHStr(diffRounded)}</span>}</span>);
            if(r.isLate) badges.push(<span key="lt" style={{display:"inline-flex",alignItems:"center",gap:2,marginLeft:2}}><Badge label="遅刻" bg="#FAEEDA" color="#854F0B"/>{r.lateMin>=4&&<span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>-{toHStr(Math.ceil(r.lateMin/10)*10)}</span>}</span>);
            if(r.isEarly){const ed=diffRounded!==null&&diffRounded<0?Math.abs(diffRounded):0;badges.push(<span key="el" style={{display:"inline-flex",alignItems:"center",gap:2,marginLeft:2}}><Badge label="早退" bg="#FAEEDA" color="#854F0B"/>{ed>0&&<span style={{fontSize:11,color:"#854F0B",fontWeight:500}}>-{toHStr(ed)}</span>}</span>);}
            if(badges.length===0&&r.workMin>0) badges.push(<Badge key="ok" label="正常" bg="#EAF3DE" color="#3B6D11"/>);
          }
          const rowBg=r.absent?"#FFF5F5":r.isLate||r.isEarly||r.isOT?"#FFFCF5":r.isLeave?"#F0FAF5":"";
          return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:rowBg}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} {isHoliday(r.ds)&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝</span>}</td>
            <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{...tdS,color:r.punch?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{r.punch?.in||"―"}</td>
            <td style={{...tdS,color:r.punch?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{r.outT||(r.punch?<span style={{color:"#A32D2D",fontWeight:500}}>退勤忘れ</span>:"―")}</td>
            <td style={{...tdS,fontWeight:500}}>{r.workMin>0?toHStr(r.workMin):"―"}</td>
            <td style={tdS}><div style={{display:"flex",flexWrap:"wrap",gap:2}}>{badges}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
function MonthlyReport({emp,punches,shifts,otReqs,shiftDefsData}){
  // 15日締め期間
  const cur0=getCurrentPeriod();
  const [periodYear,setPeriodYear]=useState(cur0.year);
  const [periodMonth,setPeriodMonth]=useState(cur0.month);
  const period=getPeriodRange(periodYear,periodMonth);
  const prevPeriod=()=>{const pm=periodMonth===1?12:periodMonth-1;const py=periodMonth===1?periodYear-1:periodYear;setPeriodYear(py);setPeriodMonth(pm);};
  const nextPeriod=()=>{const nm=periodMonth===12?1:periodMonth+1;const ny=periodMonth===12?periodYear+1:periodYear;setPeriodYear(ny);setPeriodMonth(nm);};

  // 期間内の日付を生成
  const days=[];
  let cur=new Date(period.start);
  const end=new Date(period.end);
  while(cur<=end){
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate()+1);
  }

  const empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});

  // 集計
  let totalDays=0,totalOtMin=0,lateCount=0,earlyCount=0,totalWorkMin=0;

  const rows=days.map(ds=>{
    const dow=new Date(ds).getDay();
    const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
    const def=empDefs[shiftRow?.shiftType||"off"]||empDefs.off||SHIFT_DEFS.off;
    const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
    const isOff=!def.start;

    if(isOff) return {ds,dow,def,isOff,attended:false,otMin:0,lateMin:0,earlyMin:0,workMin:0};

    const attended=!!punch?.out;
    let otMin=0,lateMin=0,earlyMin=0,workMin=0;

    if(attended){
      const shiftStart=toMin(def.start);
      const shiftEnd=toMin(def.end);
      const breakMin=def.breakMin!=null?def.breakMin:0;
      const swMin=shiftEnd-shiftStart-breakMin; // 所定時間
      const pIn=toMin(punch.in);

      // 遅刻（出勤打刻 - シフト開始）
      if(pIn>shiftStart) lateMin=pIn-shiftStart;

      // 残業：申請退勤時刻 - シフト終了（打刻ではなく申請時刻基準）
      const approvedOT=otReqs.find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="overtime");
      if(approvedOT&&approvedOT.requestedEnd){
        const reqEnd=toMin(approvedOT.requestedEnd);
        if(reqEnd>shiftEnd) otMin=reqEnd-shiftEnd;
      }

      // 早出：シフト開始 - 申請開始時刻（打刻ではなく申請時刻基準）
      const approvedEarly=otReqs.find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="early");
      if(approvedEarly&&approvedEarly.requestedEnd){
        const reqStart=toMin(approvedEarly.requestedEnd); // early申請のrequestedEndに早出開始時刻を格納
        if(reqStart<shiftStart) earlyMin=shiftStart-reqStart;
      }

      // 就労時間 = 所定時間 + 残業申請時間 + 早出申請時間 - 遅刻時間
      workMin=Math.max(0, swMin + otMin + earlyMin - lateMin);

      totalDays++;
      totalOtMin+=otMin;
      totalWorkMin+=workMin;
      if(lateMin>0) lateCount++;
      if(earlyMin>0) earlyCount++;
    }

    return {ds,dow,def,isOff,attended,otMin,lateMin,earlyMin,workMin};
  });

  return <div>
    {/* 期間ナビゲーター */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
      <button onClick={prevPeriod} style={bS}>‹</button>
      <span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{period.label}</span>
      <button onClick={nextPeriod} style={bS}>›</button>
      <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span>
    </div>

    {/* サマリー */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:"1rem"}}>
      {[
        ["出勤日数", totalDays+"日", ""],
        ["就労時間", totalWorkMin>0?toHStr(totalWorkMin):"―", ""],
        ["残業", totalOtMin>0?toHStr(totalOtMin):"―", totalOtMin>0?"#854F0B":""],
        ["遅刻", lateCount+"回", lateCount>0?"#854F0B":""],
        ["早出", earlyCount+"回", ""],
      ].map(([l,v,c])=>(
        <div key={l} style={{textAlign:"center",padding:"10px 4px",background:"var(--color-background-secondary)",borderRadius:8}}>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:2}}>{l}</div>
          <div style={{fontSize:16,fontWeight:600,color:c||"var(--color-text-primary)"}}>{v}</div>
        </div>
      ))}
    </div>

    {/* 日別テーブル */}
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>{["日付","曜","シフト","出勤","就労時間","残業","遅刻","早出"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{rows.map(r=>{
          const dc=r.dow===0?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          if(r.isOff) return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)"}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} </td>
            <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:11,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>休日</span></td>
            <td colSpan={5} style={{...tdS,color:"var(--color-text-tertiary)",textAlign:"center"}}>―</td>
          </tr>;
          return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:!r.attended?"#FFF5F5":r.lateMin>0||r.otMin>0?"#FFFCF5":""}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} </td>
            <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:11,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{...tdS,textAlign:"center",fontSize:15}}>{r.attended?"○":"―"}</td>
            <td style={{...tdS,fontWeight:500}}>{r.workMin>0?toHStr(r.workMin):"―"}</td>
            <td style={{...tdS,color:r.otMin>0?"#854F0B":"var(--color-text-tertiary)"}}>{r.otMin>0?toHStr(r.otMin):"―"}</td>
            <td style={{...tdS,color:r.lateMin>0?"#854F0B":"var(--color-text-tertiary)"}}>{r.lateMin>0?r.lateMin+"分":"―"}</td>
            <td style={{...tdS,color:r.earlyMin>0?"#3B6D11":"var(--color-text-tertiary)"}}>{r.earlyMin>0?r.earlyMin+"分":"―"}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

// ── NurseMonthlyReport (看護師パート) ────────────────────────────────────────
// 時間帯区分：
//   ① 午前  8:30〜14:00（平日・土曜、日曜除く）※休憩ありは13:30〜14:00を除外
//   ② 午後前半 14:00〜17:00（休憩ありは14:30〜17:00）（平日・土曜、日曜除く）
//   ③ 午後後半 17:00〜20:00（平日・土曜、日曜除く）
//   ④ 日曜  全実働時間（祝日でも日曜なら計上）
const NURSE_AM_START=toMin("08:30"),NURSE_AM_END=toMin("14:00");
const NURSE_PM1_END=toMin("17:00");
const NURSE_BREAK_START=toMin("13:30"),NURSE_BREAK_END=toMin("14:30");

function calcNurseSlots(pIn,pOut,hasBreak){
  const overlap=(s,e,rs,re)=>Math.max(0,Math.min(e,re)-Math.max(s,rs));

  let amMin=0,pm1Min=0,pm2Min=0;

  if(hasBreak){
    // 午前：8:30〜13:30（休憩13:30〜14:30を除く）
    amMin=overlap(pIn,pOut,NURSE_AM_START,NURSE_BREAK_START);
    // 午後前半：14:30〜17:00
    pm1Min=overlap(pIn,pOut,NURSE_BREAK_END,NURSE_PM1_END);
    // 午後後半：17:00〜退勤（上限なし）
    pm2Min=Math.max(0,pOut-Math.max(pIn,NURSE_PM1_END));
  } else {
    // 午前：8:30〜14:00
    amMin=overlap(pIn,pOut,NURSE_AM_START,NURSE_AM_END);
    // 午後前半：14:00〜17:00
    pm1Min=overlap(pIn,pOut,NURSE_AM_END,NURSE_PM1_END);
    // 午後後半：17:00〜退勤（上限なし）
    pm2Min=Math.max(0,pOut-Math.max(pIn,NURSE_PM1_END));
  }
  return {amMin,pm1Min,pm2Min};
}

function NurseMonthlyReport({emp,punches,shifts,shiftDefsData,outerYear=null,outerMonth=null,reload=()=>{}}){
  const cur0=getCurrentPeriod();
  const [periodYear,setPeriodYear]=useState(outerYear||cur0.year);
  const [periodMonth,setPeriodMonth]=useState(outerMonth||cur0.month);
  // outerYear/outerMonthが変わったら同期
  useEffect(()=>{
    if(outerYear!==null&&outerMonth!==null){setPeriodYear(outerYear);setPeriodMonth(outerMonth);}
  },[outerYear,outerMonth]);
  const showNav=outerYear===null; // TimecardViewから呼ばれる場合はナビゲーター非表示
  const [editKey,setEditKey]=useState(null);
  const [editForm,setEditForm]=useState({in:"",out:""});
  const [editSaving,setEditSaving]=useState(false);
  const saveEdit=async(ds,def)=>{
    setEditSaving(true);
    try{
      const existing=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
      if(!editForm.in){
        if(existing) await gasDelete("打刻",existing.id);
      } else {
        const breakMin=def.breakMin!=null?Number(def.breakMin):BREAK_MIN;
        const data=convertTo({id:existing?.id||newId(),empId:emp.id,date:ds,in:editForm.in,out:editForm.out||"",break:breakMin,adjusted:false},PUNCH_INV);
        await gasSave("打刻",data);
      }
      await reload(); setEditKey(null);
    }catch(e){alert("保存失敗："+e.message);}
    setEditSaving(false);
  };
  const period=getPeriodRange(periodYear,periodMonth);
  const prevPeriod=()=>{const pm=periodMonth===1?12:periodMonth-1;const py=periodMonth===1?periodYear-1:periodYear;setPeriodYear(py);setPeriodMonth(pm);};
  const nextPeriod=()=>{const nm=periodMonth===12?1:periodMonth+1;const ny=periodMonth===12?periodYear+1:periodYear;setPeriodYear(ny);setPeriodMonth(nm);};

  const days=[];
  let cur=new Date(period.start);
  const end=new Date(period.end);
  while(cur<=end){
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate()+1);
  }

  const empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});

  // 集計変数
  let totalAmMin=0,totalPm1Min=0,totalPm2Min=0,totalSunDays=0,totalSunMin=0,totalWorkMin=0,totalDays=0;

  const rows=days.map(ds=>{
    const dow=new Date(ds).getDay(); // 0=日
    const isSunday=dow===0;
    const isHol=isHoliday(ds)&&!isSunday; // 日曜以外の祝日
    const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
    const def=empDefs[shiftRow?.shiftType||"off"]||empDefs["off"]||DEFAULT_SHIFT_DEFS_BY_DEPT["看護師"]?.off||{label:"休日",start:null,end:null,color:"var(--color-background-secondary)",tc:"var(--color-text-tertiary)",breakMin:0};
    const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
    const isOff=!def||!def.start||isHol;
    const attended=!!(punch?.in)&&!!(punch?.out);

    if(isOff||!attended) return {ds,dow,isSunday,isHol,def,isOff,attended:false,amMin:0,pm1Min:0,pm2Min:0,sunMin:0,workMin:0,pIn:null,pOut:null};

    const pInRaw=toMin(punch.in||"00:00"),pOutRaw=toMin(punch.out||"00:00");
    const shiftStart=toMin(def.start||"00:00"),shiftEnd=toMin(def.end||"00:00");
    const hasBreak=(def.breakMin!=null?Number(def.breakMin):0)>0;

    // 10分丸め調整
    let pIn=pInRaw,pOut=pOutRaw;
    // 出勤：切り上げ（例 8:23→8:30、8:31→8:40）
    pIn=Math.ceil(pInRaw/10)*10;
    // 退勤：切り捨て（例 17:08→17:00、17:19→17:10）
    pOut=Math.floor(pOutRaw/10)*10;

    const breakMinNum=def.breakMin!=null?Number(def.breakMin):0;
    const actualWork=Math.max(0,pOut-pIn-breakMinNum);
    const isAdj=pIn!==pInRaw||pOut!==pOutRaw;

    if(isSunday){
      // 日曜は時間帯区別なく全実働
      totalDays++;
      totalSunDays++;
      totalSunMin+=actualWork;
      totalWorkMin+=actualWork;
      return {ds,dow,isSunday,isHol,def,isOff:false,attended:true,amMin:0,pm1Min:0,pm2Min:0,sunMin:actualWork,workMin:actualWork,adjIn:pIn,adjOut:pOut,isAdj};
    }

    // 平日・土曜
    const {amMin,pm1Min,pm2Min}=calcNurseSlots(pIn,pOut,hasBreak);
    totalDays++;
    totalAmMin+=amMin;
    totalPm1Min+=pm1Min;
    totalPm2Min+=pm2Min;
    totalWorkMin+=amMin+pm1Min+pm2Min;
    return {ds,dow,isSunday,isHol,def,isOff:false,attended:true,amMin,pm1Min,pm2Min,sunMin:0,workMin:amMin+pm1Min+pm2Min,adjIn:pIn,adjOut:pOut,isAdj};
  });

  return <div>
    {/* 期間ナビゲーター（単独表示時のみ） */}
    {showNav&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
      <button onClick={prevPeriod} style={bS}>‹</button>
      <span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{period.label}</span>
      <button onClick={nextPeriod} style={bS}>›</button>
      <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span>
    </div>}

    {/* サマリー */}
    <div style={{...crd,padding:"14px 16px",marginBottom:"1rem",background:"#fff"}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:"#111"}}>月次レポート</div>
      {/* 上段：合計・出勤日数 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {[["合計就労時間",totalWorkMin>0?toHStr(totalWorkMin):"―"],["出勤日数",totalDays+"日"]].map(([l,v])=>(
          <div key={l} style={{textAlign:"center",padding:"10px 4px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8}}>
            <div style={{fontSize:11,color:"#555",marginBottom:2}}>{l}</div>
            <div style={{fontSize:20,fontWeight:700,color:"#111"}}>{v}</div>
          </div>
        ))}
      </div>
      {/* 下段：時間帯内訳 */}
      <div style={{display:"flex",gap:6}}>
        {[
          ["①午前（8:30〜14:00）",totalAmMin>0?toHStr(totalAmMin):"―"],
          ["②午後前半（〜17:00）",totalPm1Min>0?toHStr(totalPm1Min):"―"],
          ["③午後後半（17:00〜）",totalPm2Min>0?toHStr(totalPm2Min):"―"],
          ["④日曜",totalSunMin>0?toHStr(totalSunMin):"―"],
        ].map(([l,v])=>(
          <div key={l} style={{flex:"1 1 0",minWidth:0,borderRadius:8,padding:"10px 8px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#555",marginBottom:3}}>{l}</div>
            <div style={{fontSize:17,fontWeight:700,color:"#111"}}>{v}</div>
          </div>
        ))}
      </div>
    </div>

    {/* タイムカード */}
    <div style={{fontSize:13,fontWeight:700,marginBottom:"0.5rem",color:"var(--color-text-primary)"}}>タイムカード</div>
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>
          {["日付","曜","シフト","出勤","退勤","①午前","②午後前半","③午後後半","④日曜","操作"].map(h=><th key={h} style={thS}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r=>{
          const dc=r.isSunday?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===r.ds);
          const bg=r.isHol?"#F5F9FE":"";
          const isEditing=editKey===r.ds;
          if(isEditing) return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:"#F0F4FF"}}>
            <td style={tdS}><strong>{r.ds.slice(5).replace("-","/")}</strong></td>
            <td style={tdS}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{padding:"4px 6px"}}><input type="time" value={editForm.in} onChange={e=>setEditForm(p=>({...p,in:e.target.value}))} style={{...iS,width:105,fontSize:13,padding:"5px 8px"}}/></td>
            <td style={{padding:"4px 6px"}}><input type="time" value={editForm.out} onChange={e=>setEditForm(p=>({...p,out:e.target.value}))} disabled={!editForm.in} style={{...iS,width:105,fontSize:13,padding:"5px 8px",opacity:editForm.in?1:0.4}}/></td>
            <td colSpan={5} style={tdS}><div style={{display:"flex",gap:6}}>
              <button onClick={()=>saveEdit(r.ds,r.def)} disabled={editSaving} style={{...bP,padding:"4px 12px",fontSize:12,opacity:editSaving?0.5:1}}>{editSaving?"保存中...":"保存"}</button>
              <button onClick={()=>setEditKey(null)} disabled={editSaving} style={{...bS,padding:"4px 10px",fontSize:12}}>取消</button>
              {punch&&<button onClick={async()=>{if(!confirm("削除しますか？"))return;try{await gasDelete("打刻",punch.id);await reload();setEditKey(null);}catch(e){alert(e.message);}}} disabled={editSaving} style={{...bD,padding:"4px 10px",fontSize:12}}>削除</button>}
            </div></td>
          </tr>;
          return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:bg}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} {r.isHol&&<span style={{fontSize:9,marginLeft:3,color:"#185FA5"}}>祝</span>}{isHoliday(r.ds)&&r.isSunday&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝日</span>}</td>
            <td style={{...tdS,color:dc,fontWeight:r.isSunday?700:400}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{...tdS,color:r.attended?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{punch?.in||"―"}</td>
            <td style={{...tdS,color:r.attended?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{punch?.out||"―"}</td>
            <td style={{...tdS,color:r.amMin>0?"#111":"var(--color-text-tertiary)"}}>{r.amMin>0?toHStr(r.amMin):"―"}</td>
            <td style={{...tdS,color:r.pm1Min>0?"#111":"var(--color-text-tertiary)"}}>{r.pm1Min>0?toHStr(r.pm1Min):"―"}</td>
            <td style={{...tdS,color:r.pm2Min>0?"#111":"var(--color-text-tertiary)"}}>{r.pm2Min>0?toHStr(r.pm2Min):"―"}</td>
            <td style={{...tdS,color:r.sunMin>0?"#111":"var(--color-text-tertiary)"}}>{r.sunMin>0?toHStr(r.sunMin):"―"}</td>
            <td style={tdS}><button onClick={()=>{setEditKey(r.ds);setEditForm({in:punch?.in||"",out:punch?.out||""});}} style={{...bS,padding:"3px 10px",fontSize:11}}>{punch?"修正":"追加"}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
// ── RehaMonthlyReport (リハマネパート) ───────────────────────────────────────
// 時間帯区分：
//   ① 午前  8:40〜14:00（平日・土曜）※休憩ありは13:00〜14:00を除外
//   ② 午後  14:00〜18:00（平日・土曜）
//   ③ 夜勤  18:00〜退勤（上限なし）（平日・土曜）
//   ④ 日曜  全時間（8:40より前は早出申請があるときのみ）
const REHA_AM_START=toMin("08:40"),REHA_AM_END=toMin("14:00");
const REHA_BREAK_START_R=toMin("13:00"),REHA_BREAK_END_R=toMin("14:00");
const REHA_PM_END=toMin("18:00");

function calcRehaSlots(pIn,pOut,hasBreak,approvedEarly){
  const overlap=(s,e,rs,re)=>Math.max(0,Math.min(e,re)-Math.max(s,rs));
  const effectiveStart=approvedEarly?pIn:Math.max(pIn,REHA_AM_START);
  let amMin=0,pmMin=0,nightMin=0;
  if(hasBreak){
    // 午前：8:40〜13:00（休憩13:00〜14:00を除く）
    amMin=overlap(effectiveStart,pOut,REHA_AM_START,REHA_BREAK_START_R);
    // 早出分（承認済み）
    if(approvedEarly&&pIn<REHA_AM_START) amMin+=overlap(pIn,pOut,pIn,REHA_AM_START);
    // 午後：14:00〜18:00
    pmMin=overlap(effectiveStart,pOut,REHA_BREAK_END_R,REHA_PM_END);
    // 夜勤：18:00〜
    nightMin=Math.max(0,pOut-Math.max(effectiveStart,REHA_PM_END));
  } else {
    // 午前：8:40〜14:00
    amMin=overlap(effectiveStart,pOut,REHA_AM_START,REHA_AM_END);
    if(approvedEarly&&pIn<REHA_AM_START) amMin+=overlap(pIn,pOut,pIn,REHA_AM_START);
    // 午後：14:00〜18:00
    pmMin=overlap(effectiveStart,pOut,REHA_AM_END,REHA_PM_END);
    // 夜勤：18:00〜
    nightMin=Math.max(0,pOut-Math.max(effectiveStart,REHA_PM_END));
  }
  return {amMin,pmMin,nightMin};
}

function RehaMonthlyReport({emp,punches,shifts,otReqs=[],lvReqs=[],shiftDefsData,outerYear=null,outerMonth=null,reload=()=>{}}){
  const cur0=getCurrentPeriod();
  const [periodYear,setPeriodYear]=useState(outerYear||cur0.year);
  const [periodMonth,setPeriodMonth]=useState(outerMonth||cur0.month);
  useEffect(()=>{
    if(outerYear!==null&&outerMonth!==null){setPeriodYear(outerYear);setPeriodMonth(outerMonth);}
  },[outerYear,outerMonth]);
  const showNav=outerYear===null;
  const [editKeyR,setEditKeyR]=useState(null);
  const [editFormR,setEditFormR]=useState({in:"",out:""});
  const [editSavingR,setEditSavingR]=useState(false);
  const saveEditR=async(ds,def)=>{
    setEditSavingR(true);
    try{
      const existing=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
      if(!editFormR.in){
        if(existing) await gasDelete("打刻",existing.id);
      } else {
        const breakMin=def.breakMin!=null?Number(def.breakMin):BREAK_MIN;
        const data=convertTo({id:existing?.id||newId(),empId:emp.id,date:ds,in:editFormR.in,out:editFormR.out||"",break:breakMin,adjusted:false},PUNCH_INV);
        await gasSave("打刻",data);
      }
      await reload(); setEditKeyR(null);
    }catch(e){alert("保存失敗："+e.message);}
    setEditSavingR(false);
  };
  const period=getPeriodRange(periodYear,periodMonth);
  const prevPeriod=()=>{const pm=periodMonth===1?12:periodMonth-1;const py=periodMonth===1?periodYear-1:periodYear;setPeriodYear(py);setPeriodMonth(pm);};
  const nextPeriod=()=>{const nm=periodMonth===12?1:periodMonth+1;const ny=periodMonth===12?periodYear+1:periodYear;setPeriodYear(ny);setPeriodMonth(nm);};

  const days=[];
  let cur=new Date(period.start);
  const end=new Date(period.end);
  while(cur<=end){
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth()+1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate()+1);
  }

  const empDefs=getShiftDefsByRole(emp.role,shiftDefsData||{});
  let totalAmMin=0,totalPmMin=0,totalNightMin=0,totalSunMin=0,totalSunDays=0,totalDays=0,totalWorkMin=0;

  const rows=days.map(ds=>{
    const dow=new Date(ds).getDay();
    const isSunday=dow===0;
    const isHol=isHoliday(ds)&&!isSunday;
    const shiftRow=shifts.find(s=>String(s.empId)===String(emp.id)&&s.date===ds);
    const def=empDefs[shiftRow?.shiftType||"off"]||empDefs["off"]||{label:"休日",start:null,end:null,color:"var(--color-background-secondary)",tc:"var(--color-text-tertiary)",breakMin:0};
    const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===ds);
    const isOff=!def||!def.start||isHol;
    const attended=!!(punch?.in)&&!!(punch?.out);

    if(isOff||!attended) return {ds,dow,isSunday,isHol,def,isOff,attended:false,amMin:0,pmMin:0,nightMin:0,sunMin:0,workMin:0};

    const pInRaw=toMin(punch.in||"00:00"),pOutRaw=toMin(punch.out||"00:00");
    const hasBreak=(def.breakMin!=null?Number(def.breakMin):0)>0;
    // 10分丸め
    const pIn=Math.ceil(pInRaw/10)*10;
    const pOut=Math.floor(pOutRaw/10)*10;
    const breakMinNum=def.breakMin!=null?Number(def.breakMin):0;

    const approvedEarly=!!(otReqs||[]).find(r=>String(r.empId)===String(emp.id)&&r.date===ds&&r.status==="approved"&&r.type==="early");

    if(isSunday){
      // 日曜：8:40より前は早出申請ありのときのみ
      const effectiveIn=approvedEarly?pIn:Math.max(pIn,REHA_AM_START);
      const sunWork=Math.max(0,pOut-effectiveIn-breakMinNum);
      totalDays++;totalSunDays++;totalSunMin+=sunWork;totalWorkMin+=sunWork;
      return {ds,dow,isSunday,isHol,def,isOff:false,attended:true,amMin:0,pmMin:0,nightMin:0,sunMin:sunWork,workMin:sunWork,pInRaw,pOutRaw};
    }

    const {amMin,pmMin,nightMin}=calcRehaSlots(pIn,pOut,hasBreak,approvedEarly);
    const workMin=amMin+pmMin+nightMin;
    totalDays++;totalAmMin+=amMin;totalPmMin+=pmMin;totalNightMin+=nightMin;totalWorkMin+=workMin;
    return {ds,dow,isSunday,isHol,def,isOff:false,attended:true,amMin,pmMin,nightMin,sunMin:0,workMin,pInRaw,pOutRaw};
  });

  return <div>
    {showNav&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
      <button onClick={prevPeriod} style={bS}>‹</button>
      <span style={{fontSize:14,fontWeight:600,color:"#1251a3"}}>{period.label}</span>
      <button onClick={nextPeriod} style={bS}>›</button>
      <span style={{fontSize:11,color:"var(--color-text-tertiary)"}}>（15日締め）</span>
    </div>}

    {/* サマリー */}
    <div style={{...crd,padding:"14px 16px",marginBottom:"1rem",background:"#fff"}}>
      <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:"#111"}}>月次レポート</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {(()=>{
          const lvDays=(lvReqs||[]).filter(r=>String(r.empId)===String(emp.id)&&r.status==="approved"&&days.includes(r.date)).reduce((s,r)=>s+(r.half?0.5:1),0);
          return [["合計就労時間",totalWorkMin>0?toHStr(totalWorkMin):"―"],["出勤日数",totalDays+"日"],["有給",lvDays>0?lvDays+"日":"―"]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center",padding:"10px 4px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",borderRadius:8}}>
              <div style={{fontSize:11,color:"#555",marginBottom:2}}>{l}</div>
              <div style={{fontSize:20,fontWeight:700,color:"#111"}}>{v}</div>
            </div>
          ));
        })()}
      </div>
      <div style={{display:"flex",gap:6}}>
        {[
          ["①午前（8:40〜14:00）",totalAmMin>0?toHStr(totalAmMin):"―"],
          ["②午後（14:00〜18:00）",totalPmMin>0?toHStr(totalPmMin):"―"],
          ["③夜勤（18:00〜）",totalNightMin>0?toHStr(totalNightMin):"―"],
          ["④日曜",totalSunMin>0?toHStr(totalSunMin):"―"],
        ].map(([l,v])=>(
          <div key={l} style={{flex:"1 1 0",minWidth:0,borderRadius:8,padding:"10px 8px",background:"#fff",border:"0.5px solid var(--color-border-tertiary)",textAlign:"center"}}>
            <div style={{fontSize:10,color:"#555",marginBottom:3}}>{l}</div>
            <div style={{fontSize:17,fontWeight:700,color:"#111"}}>{v}</div>
          </div>
        ))}
      </div>
    </div>

    {/* タイムカード */}
    <div style={{fontSize:13,fontWeight:700,marginBottom:"0.5rem",color:"var(--color-text-primary)"}}>タイムカード</div>
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>
          {["日付","曜","シフト","出勤","退勤","①午前","②午後","③夜勤","④日曜","操作"].map(h=><th key={h} style={thS}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r=>{
          const dc=r.isSunday?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          const punch=punches.find(p=>String(p.empId)===String(emp.id)&&p.date===r.ds);
          const bg=r.isHol?"#F5F9FE":"";
          const isEditing=editKeyR===r.ds;
          if(isEditing) return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:"#F0F4FF"}}>
            <td style={tdS}><strong>{r.ds.slice(5).replace("-","/")}</strong></td>
            <td style={tdS}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{padding:"4px 6px"}}><input type="time" value={editFormR.in} onChange={e=>setEditFormR(p=>({...p,in:e.target.value}))} style={{...iS,width:105,fontSize:13,padding:"5px 8px"}}/></td>
            <td style={{padding:"4px 6px"}}><input type="time" value={editFormR.out} onChange={e=>setEditFormR(p=>({...p,out:e.target.value}))} disabled={!editFormR.in} style={{...iS,width:105,fontSize:13,padding:"5px 8px",opacity:editFormR.in?1:0.4}}/></td>
            <td colSpan={5} style={tdS}><div style={{display:"flex",gap:6}}>
              <button onClick={()=>saveEditR(r.ds,r.def)} disabled={editSavingR} style={{...bP,padding:"4px 12px",fontSize:12,opacity:editSavingR?0.5:1}}>{editSavingR?"保存中...":"保存"}</button>
              <button onClick={()=>setEditKeyR(null)} disabled={editSavingR} style={{...bS,padding:"4px 10px",fontSize:12}}>取消</button>
              {punch&&<button onClick={async()=>{if(!confirm("削除しますか？"))return;try{await gasDelete("打刻",punch.id);await reload();setEditKeyR(null);}catch(e){alert(e.message);}}} disabled={editSavingR} style={{...bD,padding:"4px 10px",fontSize:12}}>削除</button>}
            </div></td>
          </tr>;
          return <tr key={r.ds} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:bg}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} {r.isHol&&<span style={{fontSize:9,marginLeft:3,color:"#185FA5"}}>祝</span>}{isHoliday(r.ds)&&r.isSunday&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝日</span>}</td>
            <td style={{...tdS,color:dc,fontWeight:r.isSunday?700:400}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{...tdS,color:r.attended?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{punch?.in||"―"}</td>
            <td style={{...tdS,color:r.attended?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{punch?.out||"―"}</td>
            <td style={{...tdS,color:r.amMin>0?"#111":"var(--color-text-tertiary)"}}>{r.amMin>0?toHStr(r.amMin):"―"}</td>
            <td style={{...tdS,color:r.pmMin>0?"#111":"var(--color-text-tertiary)"}}>{r.pmMin>0?toHStr(r.pmMin):"―"}</td>
            <td style={{...tdS,color:r.nightMin>0?"#111":"var(--color-text-tertiary)"}}>{r.nightMin>0?toHStr(r.nightMin):"―"}</td>
            <td style={{...tdS,color:r.sunMin>0?"#111":"var(--color-text-tertiary)"}}>{r.sunMin>0?toHStr(r.sunMin):"―"}</td>
            <td style={tdS}><button onClick={()=>{setEditKeyR(r.ds);setEditFormR({in:punch?.in||"",out:punch?.out||""});}} style={{...bS,padding:"3px 10px",fontSize:11}}>{punch?"修正":"追加"}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
// ── PunchHistory (Employee) ───────────────────────────────────────────────────
function PunchHistory({emp,punches,shifts,otReqs,lvReqs,shiftDefsData,isAdmin=false}){
  const CY=new Date().getFullYear(),CM=new Date().getMonth()+1;
  const [year,setYear]=useState(CY),[month,setMonth]=useState(CM);
  const prevM=()=>{if(month===1){fetchHolidays(year-1);setYear(y=>y-1);setMonth(12);}else setMonth(m=>m-1);};
  const nextM=()=>{if(month===12){fetchHolidays(year+1);setYear(y=>y+1);setMonth(1);}else setMonth(m=>m+1);};
  const rows=buildRows(emp,shifts,punches,otReqs,lvReqs,year,month,shiftDefsData);

  // 週ごとの実働合計（日曜始まり）でotMin補正判定
  const weeklyWork={}; // weekKey -> 実働分合計
  rows.forEach(r=>{
    const wk=Math.floor((r.d-1+new Date(year,month-1,1).getDay())/7);
    if(!weeklyWork[wk]) weeklyWork[wk]=0;
    weeklyWork[wk]+=r.awMin;
  });
  // 各行の「週超過による休日残業」分を計算
  const weekCumul={}; // weekKey -> 累積実働
  const rowsWithOT=rows.map(r=>{
    const wk=Math.floor((r.d-1+new Date(year,month-1,1).getDay())/7);
    if(!weekCumul[wk]) weekCumul[wk]=0;
    let weekOT=0;
    if(r.isOffPunch){
      const limit=40*60;
      const prevCumul=weekCumul[wk];
      if(prevCumul>=limit){
        weekOT=r.awMin; // 既に40h超 → 全部残業
      } else if(prevCumul+r.awMin>limit){
        weekOT=prevCumul+r.awMin-limit; // 超過分だけ残業
      }
    }
    weekCumul[wk]+=r.awMin;
    return {...r,weekOT};
  });

  const tS=rowsWithOT.reduce((s,r)=>s+(r.isOff||r.absent?0:r.swMin),0);
  const tA=rowsWithOT.reduce((s,r)=>s+(r.absent?0:r.awMin),0);
  const tO=rowsWithOT.reduce((s,r)=>s+r.otMin+r.weekOT,0);
  const abC=rowsWithOT.filter(r=>r.absent).length;
  return <div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem"}}>
      <button onClick={prevM} style={bS}>‹</button>
      <span style={{fontSize:14,fontWeight:500}}>{year}年{month}月</span>
      <button onClick={nextM} style={bS}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:"1rem"}}>
      {[["所定合計",toHStr(tS),""],["実働合計",toHStr(tA),""],["残業合計",toHStr(tO),tO>0?"#854F0B":""],["欠勤",abC+"日",abC>0?"#A32D2D":""]].map(([l,v,c])=>(
        <div key={l} style={{background:"var(--color-background-secondary)",borderRadius:8,padding:"10px 12px",textAlign:"center"}}>
          <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>{l}</div>
          <div style={{fontSize:18,fontWeight:500,color:c||"var(--color-text-primary)"}}>{v}</div>
        </div>
      ))}
    </div>
    <div style={{...crd,overflow:"hidden"}}>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
        <thead><tr>{["日","曜","シフト","出勤","退勤","所定","実働","残業","状態"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
        <tbody>{rowsWithOT.map(r=>{
          const dc=r.dow===0||isHoliday(r.ds)?"#A32D2D":r.dow===6?"#185FA5":"var(--color-text-secondary)";
          const displayOT=r.otMin+(r.weekOT||0);
          const rowBg=r.isOffPunch&&r.weekOT>0?"#FFFCF5":r.rowBg;
          return <tr key={r.d} style={{borderBottom:"0.5px solid var(--color-border-tertiary)",background:rowBg}}>
            <td style={tdS}>{r.ds.slice(5).replace("-","/")} {isHoliday(r.ds)&&<span style={{fontSize:9,marginLeft:3,color:"#A32D2D"}}>祝</span>}</td>
            <td style={{...tdS,color:dc}}>{DOW_JP[r.dow]}</td>
            <td style={tdS}><span style={{fontSize:10,padding:"2px 5px",borderRadius:4,background:r.def.color,color:r.def.tc}}>{r.def.label}</span></td>
            <td style={{...tdS,color:r.punch?"var(--color-text-primary)":"var(--color-text-tertiary)"}}>{r.punch?.in||"―"}</td>
            <td style={{...tdS,color:isAdmin&&(r.punch?.adjusted||r.earlyAdj)?"#534AB7":"var(--color-text-primary)"}}>{r.punch?.out||(r.punch?"未退勤":"―")}</td>
            <td style={{...tdS,color:"var(--color-text-secondary)"}}>{r.swMin>0?toHStr(r.swMin):"―"}</td>
            <td style={{...tdS,fontWeight:500}}>{r.awMin>0?toHStr(r.awMin):"―"}</td>
            <td style={{...tdS,color:displayOT>0?"#854F0B":"var(--color-text-tertiary)",fontWeight:displayOT>0?600:400}}>{displayOT>0?toHStr(displayOT):"―"}</td>
            <td style={tdS}>{statusBadge(r,isAdmin)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

// ── ChangePw (Employee) ───────────────────────────────────────────────────────
function ChangePw({emp,passwords,reload,onClose}){
  const [cur,setCur]=useState(""),[next,setNext]=useState(""),[conf,setConf]=useState(""),[err,setErr]=useState(""),[done,setDone]=useState(false);
  const pwRec=passwords.find(p=>String(p.empId)===String(emp.id));
  const correct=pwRec?.password||String(emp.id);
  const submit=async()=>{
    setErr("");
    if(cur!==correct){setErr("現在のパスワードが違います");return;}
    if(next.length!==4){setErr("新しいパスワードは4桁で入力してください");return;}
    if(next!==conf){setErr("確認用パスワードが一致しません");return;}
    try{
      const pwData=convertTo({id:pwRec?.id||newId(),empId:emp.id,password:next},PW_INV);
      await gasSave("パスワード",pwData);
      await reload();
      setDone(true);
    }catch(e){setErr("変更失敗："+e.message);}
  };
  if(done) return <div style={{...crd,padding:"1.25rem",maxWidth:360,textAlign:"center"}}>
    <div style={{fontSize:24,marginBottom:8}}>✅</div>
    <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>パスワードを変更しました</div>
    <button onClick={onClose} style={{...bP,marginTop:12}}>閉じる</button>
  </div>;
  return <div style={{...crd,padding:"1.25rem",maxWidth:360}}>
    <div style={{fontSize:15,fontWeight:700,marginBottom:"1rem"}}>パスワード変更</div>
    {[["現在のパスワード",cur,setCur],["新しいパスワード（4桁）",next,setNext],["新しいパスワード（確認）",conf,setConf]].map(([label,val,setter])=>(
      <div key={label} style={{marginBottom:10}}>
        <div style={{fontSize:11,color:"var(--color-text-secondary)",marginBottom:3}}>{label}</div>
        <input type="password" maxLength={4} value={val} onChange={e=>setter(e.target.value.replace(/\D/g,""))} style={{...iS,letterSpacing:"0.3em",textAlign:"center",fontSize:18}}/>
      </div>
    ))}
    {err&&<div style={{marginBottom:10,padding:"6px 10px",background:"#FCEBEB",borderRadius:8,fontSize:12,color:"#A32D2D"}}>{err}</div>}
    <div style={{display:"flex",gap:8}}>
      <button onClick={submit} disabled={!cur||!next||!conf} style={{...bP,flex:1,opacity:cur&&next&&conf?1:0.4}}>変更する</button>
      <button onClick={onClose} style={bS}>キャンセル</button>
    </div>
  </div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [emps,setEmps]=useState([]);
  const [shifts,setShifts]=useState([]);
  const [punches,setPunches]=useState([]);
  const [otReqs,setOtReqs]=useState([]);
  const [leaves,setLeaves]=useState([]);
  const [lvReqs,setLvReqs]=useState([]);
  const [passwords,setPasswords]=useState([]);
  const [shiftDefsData,setShiftDefsData]=useState({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);
  const [loginId,setLoginId]=useState(null);
  const [tabName,setTabName]=useState("");
  const [patternMode,setPatternMode]=useState(false);
  const [showPwChange,setShowPwChange]=useState(false);
  const [shiftDefSaving,setShiftDefSaving]=useState(false);
  const [punchFixReqs,setPunchFixReqs]=useState([]);
  const [weekPatterns,setWeekPatterns]=useState([]);
  const [transferReqs,setTransferReqs]=useState([]);

  const loadAll=useCallback(async()=>{
    try{
      const cy=new Date().getFullYear();
      await Promise.all([fetchHolidays(cy),fetchHolidays(cy+1)]);
      const [e,s,p,o,lv,lr,pw,sd,pfr,wp,tr]=await Promise.all([
        gasGet("従業員"),gasGet("シフト"),gasGet("打刻"),
        gasGet("残業申請"),gasGet("有給"),gasGet("有給申請"),gasGet("パスワード"),
        gasGet("シフト定義").catch(()=>[]),
        gasGet("打刻修正申請").catch(()=>[]),
        gasGet("週間パターン").catch(()=>[]),
        gasGet("振替申請").catch(()=>[]),
      ]);
      setEmps(e.map(r=>convertFrom(r,EMP_MAP)));
      setShifts(s.map(r=>convertFrom(r,SHIFT_MAP)));
      setPunches(p.map(r=>convertFrom(r,PUNCH_MAP)));
      setOtReqs(o.map(r=>convertFrom(r,OT_MAP)));
      setLeaves(lv.map(r=>convertFrom(r,LEAVE_MAP)));
      setLvReqs(lr.map(r=>convertFrom(r,LV_REQ_MAP)));
      setPasswords(pw.map(r=>convertFrom(r,PW_MAP)));
      setPunchFixReqs(pfr.map(r=>convertFrom(r,PUNCH_FIX_MAP)));
      setWeekPatterns(wp.map(r=>convertFrom(r,WEEK_PAT_MAP)));
      setTransferReqs(tr.map(r=>convertFrom(r,TRANSFER_MAP)));
      // シフト定義を部署別オブジェクトに変換
      if(sd.length>0){
        const byDept={};
        const converted=sd.map(r=>convertFrom(r,SHIFTDEF_MAP));
        // 順番でソートしてから格納
        converted.sort((a,b)=>(Number(a.order)||999)-(Number(b.order)||999));
        converted.forEach(d=>{
          if(!d.dept||!d.key) return;
          if(!byDept[d.dept]) byDept[d.dept]={};
          byDept[d.dept][d.key]={_id:d.id,_order:Number(d.order)||999,label:d.label,start:d.start||null,end:d.end||null,color:d.color,tc:d.tc,breakMin:(d.breakMin!=null&&d.breakMin!=="")?Number(d.breakMin):0};
        });
        // offが無ければ各部署にデフォルトを補完
        Object.keys(DEPT_GROUPS).forEach(dept=>{
          if(!byDept[dept]) byDept[dept]={};
          if(!byDept[dept].off) byDept[dept].off=DEFAULT_SHIFT_DEFS_BY_DEPT[dept]?.off||{label:"休日",start:null,end:null,color:"var(--color-background-secondary)",tc:"var(--color-text-tertiary)"};
        });
        setShiftDefsData(byDept);
      } else {
        setShiftDefsData(DEFAULT_SHIFT_DEFS_BY_DEPT);
      }
    }catch(e){setError(e.message);}
    setLoading(false);
  },[]);

  // ── 指定有休の自動消化処理 ──────────────────────────────────────────────────
  // shifts・lvReqs・leavesがセットされた後に実行
  const processDesignatedLeave=useCallback(async(empsData,shiftsData,lvReqsData,leavesData)=>{
    const td=today();
    const toProcess=[];
    shiftsData.forEach(s=>{
      if(!isAnyLeaveShift(s.shiftType)) return;
      if(s.date>td) return;
      const already=lvReqsData.some(r=>
        String(r.empId)===String(s.empId)&&r.date===s.date&&
        r.status==="approved"
      );
      if(already) return;
      const leave=leavesData.find(l=>String(l.empId)===String(s.empId));
      const rem=calcLeaveRemainingCompat(leave,lvReqsData,s.empId);
      const days=leaveShiftDays(s.shiftType);
      if(rem<days) return;
      toProcess.push({s,leave,days});
    });
    if(toProcess.length===0) return;
    // 重複実行防止：処理件数が多い場合は警告
    if(toProcess.length>20){ console.warn("processDesignatedLeave: 処理件数が多すぎます",toProcess.length); return; }
    try{
      for(const {s,days} of toProcess){
        const half=leaveShiftHalf(s.shiftType);
        const isDesignated=isDesignatedShift(s.shiftType);
        const reason=isDesignated?"指定有休":"有休";
        const lvReqData=convertTo({id:newId(),empId:s.empId,date:s.date,reason,status:"approved",half:half||""},LV_REQ_INV);
        await gasSaveRaw("有給申請",lvReqData);
      }
      await loadAll();
    }catch(e){console.warn("指定有休自動処理エラー:",e);}
  },[loadAll]);

  useEffect(()=>{loadAll();},[loadAll]);
  useEffect(()=>{document.title="クリニック勤怠";},[]);
  // GASコールドスタート対策：5分ごとにpingを送って常時起動を維持
  useEffect(()=>{
    const ping=()=>fetch(`${GAS_URL}?action=ping`).catch(()=>{});
    ping(); // 即時1回
    const id=setInterval(ping,5*60*1000); // 5分ごと
    return ()=>clearInterval(id);
  },[]);
  // shifts・lvReqs・leavesが揃ったら指定有休を自動処理
  useEffect(()=>{
    if(!loading&&emps.length>0&&shifts.length>=0)
      processDesignatedLeave(emps,shifts,lvReqs,leaves);
  },[loading]);

  if(loading) return <Loading/>;
  if(error) return <Err msg={error}/>;

  if(!loginId) return <LoginScreen emps={emps} passwords={passwords} onLogin={id=>{setLoginId(id);setTabName("");}}/>; // tabNameはログイン後に役割別に初期化

  const isAdmin=loginId==="admin";
  const cur=emps.find(e=>String(e.id)===String(loginId));
  const isLead=!isAdmin&&cur&&(isLeadVal(cur.isLead));
  const leadDepts=isLead?getLeadDepts(cur.role):[];
  const leadRolesList=isLead?getLeadRoles(cur.role):[];
  // 責任者向け：担当部署の従業員に絞った承認待ち件数
  const leadPendOT=isLead?otReqs.filter(r=>r.status==="pending"&&emps.find(e=>String(e.id)===String(r.empId)&&leadRolesList.includes(e.role))).length:0;
  const leadPendLV=isLead?lvReqs.filter(r=>r.status==="pending"&&emps.find(e=>String(e.id)===String(r.empId)&&leadRolesList.includes(e.role))).length:0;
  const leadPendPF=isLead?punchFixReqs.filter(r=>r.status==="pending"&&emps.find(e=>String(e.id)===String(r.empId)&&leadRolesList.includes(e.role))).length:0;
  const leadPendTR=isLead?transferReqs.filter(r=>r.status==="pending"&&emps.find(e=>String(e.id)===String(r.empId)&&leadRolesList.includes(e.role))).length:0;
  const pendOT=otReqs.filter(r=>r.status==="pending").length;
  const pendLV=lvReqs.filter(r=>r.status==="pending").length;
  const pendTR=transferReqs.filter(r=>r.status==="pending").length;
  const aTabs=["従業員管理","シフト","申請許可","有給管理","タイムカード"];
  const isPTpart=cur&&cur.role==="理学療法士"&&cur.type==="パート";
  // 責任者タブ："---"はセパレーター
  const isPTlead=isLead&&cur&&cur.role==="理学療法士";
  const lTabs=isPTlead
    // 理学療法士責任者：自分の勤怠＋月次集計 | 部署管理
    ?["打刻","申請","マイシフト","打刻履歴","月次集計","---","シフト作成","申請許可","有給管理","タイムカード"]
    // その他責任者：自分の勤怠＋月次レポート | 部署管理（タイムカードなし）
    :["打刻","申請","マイシフト","月次レポート","---","シフト作成","申請許可"];
  const isNursepart=cur&&cur.role==="看護師"&&cur.type==="パート";
  const isRehapart=cur&&cur.role==="リハマネ"&&cur.type==="パート";
  const eTabs=isPTpart
    ?["打刻","申請","マイシフト"]
    :isNursepart||isRehapart
    ?["打刻","申請","マイシフト","月次集計"]
    :["打刻","申請","マイシフト","月次レポート"];
  const tabs=isAdmin?aTabs:isLead?lTabs:eTabs;

  return <div style={{fontFamily:"var(--font-sans)",padding:"0 0 2rem"}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",...crd,marginBottom:"1rem"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:40,height:40,background:"#1251a3",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="22" height="22" viewBox="0 0 18 18" fill="white"><rect x="2" y="2" width="6" height="6" rx="1"/><rect x="10" y="2" width="6" height="6" rx="1"/><rect x="2" y="10" width="6" height="6" rx="1"/><rect x="10" y="10" width="6" height="6" rx="1"/></svg></div>
        <div><div style={{fontSize:17,fontWeight:700,color:"#1251a3"}}>クリニック勤怠</div><div style={{fontSize:13,color:"var(--color-text-secondary)",fontWeight:500}}>{isAdmin?"管理者":isLead?cur?.name+"（責任者）":cur?.name}</div></div>
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        {!isAdmin&&!isLead&&cur&&<button onClick={()=>setShowPwChange(true)} style={{...bS,fontSize:12,padding:"6px 12px"}}>PW変更</button>}
        <button onClick={()=>{if(shiftDefSaving)return;loadAll();}} disabled={shiftDefSaving||loading} title="データを最新の状態に更新" style={{...bS,fontSize:15,padding:"6px 10px",opacity:shiftDefSaving||loading?0.4:1,cursor:shiftDefSaving||loading?"not-allowed":"pointer",minWidth:36}}>↻</button>
        <button onClick={()=>{if(shiftDefSaving)return;setLoginId(null);setTabName("");setShowPwChange(false);}} disabled={shiftDefSaving} style={{...bS,opacity:shiftDefSaving?0.4:1,cursor:shiftDefSaving?"not-allowed":"pointer"}}>ログアウト</button>
      </div>
    </div>

    {!isAdmin&&showPwChange&&cur&&<div style={{marginBottom:"1rem"}}>
      <ChangePw emp={cur} passwords={passwords} reload={loadAll} onClose={()=>setShowPwChange(false)}/>
    </div>}

    <div style={{display:"flex",gap:6,padding:5,borderRadius:14,...crd,marginBottom:"1rem",alignItems:"stretch"}}>
      {isLead&&<>
        {/* 自分用タブグループ */}
        <div style={{display:"flex",flexDirection:"column",gap:2,flex:1}}>
          <span style={{fontSize:9,fontWeight:700,color:"#1251a3",letterSpacing:"0.08em",paddingLeft:8,paddingBottom:1}}>MY</span>
          <div style={{display:"flex",gap:3,padding:"4px 6px",borderRadius:10,background:"transparent",alignItems:"center",height:"100%"}}>
            {tabs.slice(0,tabs.indexOf("---")).map((t,i)=>{
              const isActive=tabName===t||(tabName===""&&i===0);
              return <button key={t+i} onClick={()=>{if(shiftDefSaving)return;setTabName(t);setShowPwChange(false);}} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"none",background:isActive?"#1251a3":"transparent",color:isActive?"white":"#1251a3",fontSize:14,fontWeight:isActive?700:500,cursor:shiftDefSaving?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:shiftDefSaving&&!isActive?0.4:1,transition:"background 0.15s",textAlign:"center"}}>
                {t}
              </button>;
            })}
          </div>
        </div>
        {/* 区切り */}
        <div style={{display:"flex",alignItems:"center",padding:"0 2px"}}>
          <div style={{width:1,height:36,background:"var(--color-border-secondary)",borderRadius:1}}/>
        </div>
        {/* 責任者用タブグループ */}
        <div style={{display:"flex",flexDirection:"column",gap:2,flex:1}}>
          <span style={{fontSize:9,fontWeight:700,color:"#185FA5",letterSpacing:"0.08em",paddingLeft:8,paddingBottom:1}}>STAFF</span>
          <div style={{display:"flex",gap:3,padding:"4px 6px",borderRadius:10,background:"#ffffff",alignItems:"center",height:"100%"}}>
            {tabs.slice(tabs.indexOf("---")+1).map((t,i)=>{
              const isActive=tabName===t;
              const leadPendAll2=leadPendOT+leadPendLV+leadPendTR+(isPTlead?punchFixReqs.filter(r=>r.status==="pending"&&emps.find(e=>String(e.id)===String(r.empId)&&leadRolesList.includes(e.role))).length:0);
              return <button key={t+i} onClick={()=>{if(shiftDefSaving)return;setTabName(t);setShowPwChange(false);}} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"none",background:isActive?"#185FA5":"transparent",color:isActive?"white":"#185FA5",fontSize:14,fontWeight:isActive?700:500,cursor:shiftDefSaving?"not-allowed":"pointer",whiteSpace:"nowrap",opacity:shiftDefSaving&&!isActive?0.4:1,transition:"background 0.15s",textAlign:"center"}}>
                {t}
                {t==="申請許可"&&leadPendAll2>0&&<span style={{marginLeft:4,padding:"1px 5px",borderRadius:99,fontSize:9,background:"#E24B4A",color:"white"}}>{leadPendAll2}</span>}
              </button>;
            })}
          </div>
        </div>
      </>}
      {!isLead&&tabs.map((t,i)=>{
        if(t==="---") return <div key="sep" style={{width:"1px",height:24,background:"var(--color-border-secondary)",margin:"0 4px",alignSelf:"center"}}/>;
        const pendAll=pendOT+pendLV+pendTR+(punchFixReqs.filter(r=>r.status==="pending").length);
        return <button key={t+i} onClick={()=>{if(shiftDefSaving)return;setTabName(t);setShowPwChange(false);}} style={{...nB(tabName===t||(tabName===""&&i===0&&t!=="---")),opacity:shiftDefSaving&&tabName!==t?0.4:1,cursor:shiftDefSaving?"not-allowed":"pointer"}}>
          {t}
          {isAdmin&&t==="申請許可"&&pendAll>0&&<span style={{marginLeft:4,padding:"1px 5px",borderRadius:99,fontSize:9,background:"#E24B4A",color:"white"}}>{pendAll}</span>}
        </button>;
      })}
    </div>
    <div>
      {isAdmin&&(()=>{
        const t=tabName||aTabs[0];
        if(t==="従業員管理") return <EmpManager emps={emps} passwords={passwords} reload={loadAll}/>;
        if(t==="シフト設定") return <ShiftSettingTab shiftDefsData={shiftDefsData} weekPatterns={weekPatterns} emps={emps} shifts={shifts} lvReqs={lvReqs} reload={loadAll} onSavingChange={setShiftDefSaving} initialSub={patternMode?"pattern":"def"}/>;
        if(t==="シフト") return <ShiftCalendar emps={emps} shifts={shifts} shiftDefsData={shiftDefsData} reload={loadAll} lvReqs={lvReqs} onGotoShiftSetting={()=>{setPatternMode(false);setTabName("シフト設定");}} onGotoPattern={()=>{setPatternMode(true);setTabName("シフト設定");}}/>;
        if(t==="申請許可") return <ApprovalCenter emps={emps} otReqs={otReqs} lvReqs={lvReqs} transferReqs={transferReqs} punchFixReqs={punchFixReqs} punches={punches} shifts={shifts} shiftDefsData={shiftDefsData} leaves={leaves} reload={loadAll} showOT={true}/>;
        if(t==="有給管理") return <LeaveManager emps={emps} leaves={leaves} lvReqs={lvReqs} shifts={shifts} reload={loadAll}/>;
        if(t==="タイムカード") return <TimecardView emps={emps} shifts={shifts} punches={punches} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} isAdmin={true} reload={loadAll}/>;
        return null;
      })()}
      {!isAdmin&&cur&&(()=>{
        const t=tabName||(tabs.find(x=>x!=="---")||tabs[0]||"");
        if(t==="打刻") return <PunchScreen emp={cur} punches={punches} shifts={shifts} shiftDefsData={shiftDefsData} reload={loadAll} onPunchesUpdate={setPunches}/>;
        if(t==="申請") return <RequestTab emp={cur} leaves={leaves} lvReqs={lvReqs} shifts={shifts} otReqs={otReqs} punches={punches} punchFixReqs={punchFixReqs} shiftDefsData={shiftDefsData} transferReqs={transferReqs} reload={loadAll}/>;
        if(t==="マイシフト") return isPTpart
          ?<MyShiftWithReport emp={cur} shifts={shifts} lvReqs={lvReqs} shiftDefsData={shiftDefsData} punches={punches} otReqs={otReqs} reload={loadAll}/>
          :<MyShift emp={cur} shifts={shifts} lvReqs={lvReqs} shiftDefsData={shiftDefsData} punches={punches} otReqs={otReqs}/>;
        if(t==="打刻履歴") return <PunchHistory emp={cur} punches={punches} shifts={shifts} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} isAdmin={false}/>;
        if(t==="月次集計") return isNursepart
          ?<NurseMonthlyReport emp={cur} punches={punches} shifts={shifts} shiftDefsData={shiftDefsData} reload={loadAll}/>
          :isRehapart
          ?<RehaMonthlyReport emp={cur} punches={punches} shifts={shifts} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} reload={loadAll}/>
          :<MonthlyReport emp={cur} punches={punches} shifts={shifts} otReqs={otReqs} shiftDefsData={shiftDefsData}/>;
        // 月次レポート：自分のTimecardView（従業員・その他責任者共通）
        if(t==="月次レポート") return <TimecardView emps={[cur]} shifts={shifts} punches={punches} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} isAdmin={false} selfView={true} reload={loadAll}/>;
        if(t==="シフト作成"&&isLead) return <ShiftCalendar emps={emps} shifts={shifts} shiftDefsData={shiftDefsData} reload={loadAll} leadRoles={leadRolesList} lvReqs={lvReqs} onGotoShiftSetting={()=>{setPatternMode(false);setTabName("シフト設定");}} onGotoPattern={()=>{setPatternMode(true);setTabName("シフト設定");}} />;
        if(t==="シフト設定"&&isLead) return <ShiftSettingTab shiftDefsData={shiftDefsData} weekPatterns={weekPatterns} emps={emps} shifts={shifts} lvReqs={lvReqs} reload={loadAll} limitDepts={leadDepts} leadRoles={leadRolesList} onSavingChange={setShiftDefSaving} initialSub={patternMode?"pattern":"def"}/>;
        if(t==="申請許可"&&isLead){
          const isOTLead=leadRolesList.includes("理学療法士");
          const leadEmps=emps.filter(e=>leadRolesList.includes(e.role));
          return <ApprovalCenter
            emps={leadEmps}
            otReqs={otReqs.filter(r=>leadEmps.find(e=>String(e.id)===String(r.empId)))}
            lvReqs={lvReqs.filter(r=>leadEmps.find(e=>String(e.id)===String(r.empId)))}
            transferReqs={transferReqs.filter(r=>leadEmps.find(e=>String(e.id)===String(r.empId)))}
            punchFixReqs={punchFixReqs.filter(r=>leadEmps.find(e=>String(e.id)===String(r.empId)))}
            punches={punches}
            shifts={shifts}
            shiftDefsData={shiftDefsData}
            leaves={leaves}
            reload={loadAll}
            showOT={isOTLead}
            showPunchFix={isOTLead}
          />;
        }
        if(t==="有給管理"&&isLead) return <LeaveManager emps={emps.filter(e=>leadRolesList.includes(e.role))} leaves={leaves} lvReqs={lvReqs.filter(r=>emps.find(e=>String(e.id)===String(r.empId)&&leadRolesList.includes(e.role)))} shifts={shifts} reload={loadAll} canGrant={false}/>;
        if(t==="タイムカード"&&isLead) return <TimecardView emps={emps.filter(e=>leadRolesList.includes(e.role))} shifts={shifts} punches={punches} otReqs={otReqs} lvReqs={lvReqs} shiftDefsData={shiftDefsData} leadRoles={leadRolesList} reload={loadAll}/>;
        return null;
      })()}
    </div>
  </div>;
}