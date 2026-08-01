import { useState, useEffect, useCallback } from "react";
import { gasGet } from "./api/gas";
import { ADMIN_PASSWORD, ROLES, convertFrom, EMP_MAP, PW_MAP, SHIFT_MAP, PUNCH_MAP, LV_REQ_MAP, LEAVE_MAP, TIME_TRANSFER_MAP, PUNCH_FIX_MAP } from "./constants";
import PunchScreen from "./components/PunchScreen";
import MyShift from "./components/MyShift";
import RequestTab from "./components/RequestTab";
import TimecardSeishainStd from "./components/TimecardSeishainStd";
import TimecardSeishainFixed from "./components/TimecardSeishainFixed";
import TimecardPartStd from "./components/TimecardPartStd";
import TimecardPTpart from "./components/TimecardPTpart";
import TimecardNursepart from "./components/TimecardNursepart";
import EmpManager from "./components/EmpManager";
import ShiftCalendar from "./components/ShiftCalendar";
import ApprovalCenter from "./components/ApprovalCenter";
import LeaveManager from "./components/LeaveManager";

const _style = document.createElement("style");
_style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fdf8f2; min-height: 100vh; font-family: "Hiragino Sans", "Yu Gothic", sans-serif; font-size: 16px; color: #111827; }
  :root { --color-background-primary: #ffffff; --color-background-secondary: #fef9f3; --color-text-primary: #111827; --color-text-secondary: #374151; --color-text-tertiary: #6b7280; --color-border-secondary: #d1d5db; --color-border-tertiary: #e9ddd0; --color-accent: #1251a3; }
  #root { max-width: 1200px; margin: 0 auto; padding: 1rem; }
  select, input, textarea { font-family: inherit; }
`;
document.head.appendChild(_style);

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const nB = active => ({ flex: 1, minWidth: 80, padding: "8px 4px", borderRadius: 8, border: "none", background: active ? "#1251a3" : "transparent", color: active ? "white" : "#6b7280", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" });

function Loading() { return <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>読み込み中...</div>; }
function Err({ msg }) { return <div style={{ padding: "1rem", background: "#FFF0F0", borderRadius: 8, color: "#A32D2D" }}>エラー：{msg}</div>; }

function LoginScreen({ emps, passwords, onLogin }) {
  const [mode, setMode] = useState("admin");
  const [roleFilter, setRoleFilter] = useState("全て");
  const [sel, setSel] = useState(emps[0]?.id || "");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const allRoles = ["全て", ...ROLES];
  const filteredEmps = roleFilter === "全て" ? emps : emps.filter(e => e.role === roleFilter);
  const onRoleChange = r => { setRoleFilter(r); const first = (r === "全て" ? emps : emps.filter(e => e.role === r))[0]; if (first) setSel(first.id); };
  const doLogin = () => { setErr(""); if (mode === "admin") { if (pw === ADMIN_PASSWORD) { onLogin("admin"); } else { setErr("パスワードが違います"); } } else { const pwRec = passwords.find(p => p.empId === sel); const correct = pwRec?.password || String(sel); if (pw === correct) { onLogin(sel); } else { setErr("パスワードが違います"); } } };
  return (
    <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...crd, padding: "2rem", width: 360 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>クリニック勤怠</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: "1.5rem" }}>ログイン</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1.5rem" }}>
          {["admin", "employee"].map(m => (<button key={m} onClick={() => { setMode(m); setPw(""); setErr(""); }} style={{ padding: "10px 0", borderRadius: 8, border: mode === m ? "2px solid #1251a3" : "1px solid #d1d5db", background: mode === m ? "#E6F1FB" : "#fff", color: mode === m ? "#1251a3" : "#111827", fontWeight: mode === m ? 600 : 400, cursor: "pointer", fontSize: 14 }}>{m === "admin" ? "管理者" : "従業員"}</button>))}
        </div>
        {mode === "employee" && (<div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>職種で絞り込み</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>{allRoles.map(r => (<button key={r} onClick={() => onRoleChange(r)} style={{ padding: "3px 10px", borderRadius: 6, border: roleFilter === r ? "2px solid #1251a3" : "1px solid #d1d5db", background: roleFilter === r ? "#E6F1FB" : "#fff", color: roleFilter === r ? "#1251a3" : "#6b7280", fontSize: 12, cursor: "pointer" }}>{r}</button>))}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>従業員を選択</div>
          <select value={sel} onChange={e => { setSel(e.target.value); setPw(""); }} style={iS}>{filteredEmps.map(e => (<option key={e.id} value={e.id}>[{e.id}] {e.name}（{e.role}・{e.type}）</option>))}</select>
        </div>)}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>パスワード（4桁）</div>
          <input type="password" maxLength={4} value={pw} onChange={e => setPw(e.target.value.replace(/\D/g, ""))} onKeyDown={e => e.key === "Enter" && doLogin()} placeholder="••••" style={{ ...iS, letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }} />
          {mode === "employee" && <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>初期パスワードは社員番号です</div>}
        </div>
        {err && <div style={{ marginBottom: 10, padding: "6px 10px", background: "#FFF0F0", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>{err}</div>}
        <button onClick={doLogin} disabled={pw.length !== 4} style={{ ...bP, width: "100%", padding: "10px 0", fontSize: 15, opacity: pw.length === 4 ? 1 : 0.4 }}>ログイン</button>
      </div>
    </div>
  );
}

export default function App() {
  const [emps, setEmps] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [punches, setPunches] = useState([]);
  const [lvReqs, setLvReqs] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [passwords, setPasswords] = useState([]);
  const [shiftDefs, setShiftDefs] = useState({});
  const [timeTransferReqs, setTimeTransferReqs] = useState([]);
  const [punchFixReqs, setPunchFixReqs] = useState([]);
  const [otReqs, setOtReqs] = useState([]);
  const [otherReqs, setOtherReqs] = useState([]);
  const [designatedHolidays, setDesignatedHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loginId, setLoginId] = useState(null);
  const [tab, setTab] = useState(0);
  const [aTab, setATab] = useState(0);

  const loadAll = useCallback(async () => {
    try {
      const [e, s, p, lr, lv, pw, sd, ttr, pfr, otr, otr2, dh] = await Promise.all([
        gasGet("従業員"), gasGet("シフト"), gasGet("打刻"),
        gasGet("有給申請"), gasGet("有給"), gasGet("パスワード"),
        gasGet("シフト定義"), gasGet("時間振替申請"), gasGet("打刻修正申請"),
        gasGet("残業申請"), gasGet("その他申請"), gasGet("指定休"),
      ]);
      setEmps(e.map(r => convertFrom(r, EMP_MAP)));
      setShifts(s.map(r => convertFrom(r, SHIFT_MAP)));
      setPunches(p.map(r => convertFrom(r, PUNCH_MAP)));
      setLvReqs(lr.map(r => convertFrom(r, LV_REQ_MAP)));
      setLeaves(lv.map(r => convertFrom(r, LEAVE_MAP)));
      setPasswords(pw.map(r => convertFrom(r, PW_MAP)));
      setTimeTransferReqs(ttr.map(r => convertFrom(r, TIME_TRANSFER_MAP)));
      setPunchFixReqs(pfr.map(r => convertFrom(r, PUNCH_FIX_MAP)));
      setOtReqs(otr.map(r => convertFrom(r, { id:"id","従業員id":"empId","日付":"date","種別":"type","状態":"status","申請退勤":"requestedEnd","シフト終了":"shiftEnd" })));
      setOtherReqs(otr2.map(r => convertFrom(r, { id:"id","従業員id":"empId","日付":"date","内容":"content","状態":"status","申請日時":"createdAt","コメント":"comment" })));
      setDesignatedHolidays(dh.map(r => convertFrom(r, { id:"id","日付":"date","メモ":"memo" })));
      const defsMap = {};
      sd.forEach(d => { if (d["キー"]) { defsMap[d["キー"]] = { label: d["名前"] || d["キー"], start: d["開始"] || null, end: d["終了"] || null, color: d["色"] || "#F5F9FE", tc: d["文字色"] || "#6b7280", breakMin: d["休憩"] != null ? Number(d["休憩"]) : 60 }; } });
      setShiftDefs(defsMap);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return <Loading />;
  if (error) return <Err msg={error} />;
  if (!loginId) return <LoginScreen emps={emps} passwords={passwords} onLogin={id => { setLoginId(id); setTab(0); }} />;

  const isAdmin = loginId === "admin";
  const cur = emps.find(e => e.id === loginId);
  const eTabs = ["打刻", "申請", "マイシフト", "タイムカード"];

  return (
    <div style={{ padding: "0 0 2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", ...crd, marginBottom: "1rem" }}>
        <div><div style={{ fontSize: 16, fontWeight: 700 }}>クリニック勤怠</div><div style={{ fontSize: 12, color: "#6b7280" }}>{isAdmin ? "管理者" : cur?.name}</div></div>
        <button onClick={() => { setLoginId(null); setTab(0); }} style={bS}>ログアウト</button>
      </div>
      {!isAdmin && (<div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, ...crd, marginBottom: "1rem", flexWrap: "wrap" }}>{eTabs.map((t, i) => (<button key={t} onClick={() => setTab(i)} style={nB(tab === i)}>{t}</button>))}</div>)}
      {!isAdmin && cur && (<div>
        {tab === 0 && <PunchScreen emp={cur} punches={punches} shifts={shifts} shiftDefs={shiftDefs} leaves={leaves} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} reload={loadAll} />}
        {tab === 1 && <RequestTab emp={cur} leaves={leaves} lvReqs={lvReqs} shifts={shifts} shiftDefs={shiftDefs} otReqs={otReqs} timeTransferReqs={timeTransferReqs} punchFixReqs={punchFixReqs} reload={loadAll} />}
        {tab === 2 && <MyShift emp={cur} shifts={shifts} shiftDefs={shiftDefs} lvReqs={lvReqs} />}
        {tab === 3 && (()=>{
          const isFixed=(cur.role==="理学療法士"||cur.role==="AT")&&cur.type==="正社員";
          const isPTpart=cur.role==="理学療法士"&&cur.type==="パート";
          const isNursepart=cur.role==="看護師"&&cur.type==="パート";
          const isPartStd=cur.type==="パート"&&!isPTpart&&!isNursepart;
          if(isFixed) return <TimecardSeishainFixed emp={cur} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} />;
          if(isPTpart) return <TimecardPTpart emp={cur} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} otReqs={otReqs} />;
          if(isNursepart) return <TimecardNursepart emp={cur} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />;
          if(isPartStd) return <TimecardPartStd emp={cur} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />;
          return <TimecardSeishainStd emp={cur} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />;
        })()}
      </div>)}
      {isAdmin && (() => {
        const aTabs = ["従業員管理", "シフト", "申請許可", "有給管理", "タイムカード", "打刻履歴"];
        return <div>
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, ...crd, marginBottom: "1rem", flexWrap: "wrap" }}>
            {aTabs.map((t, i) => <button key={t} onClick={() => setATab(i)} style={nB(aTab === i)}>{t}</button>)}
          </div>
          {aTab === 0 && <EmpManager emps={emps} passwords={passwords} reload={loadAll} />}
          {aTab === 1 && <ShiftCalendar emps={emps} shifts={shifts} shiftDefs={shiftDefs} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} designatedHolidays={designatedHolidays} reload={loadAll} />}
          {aTab === 2 && <ApprovalCenter emps={emps} lvReqs={lvReqs} otReqs={otReqs} timeTransferReqs={timeTransferReqs} punchFixReqs={punchFixReqs} otherReqs={otherReqs} shifts={shifts} shiftDefs={shiftDefs} leaves={leaves} reload={loadAll} />}
          {aTab === 3 && <LeaveManager emps={emps} leaves={leaves} lvReqs={lvReqs} designatedHolidays={designatedHolidays} reload={loadAll} />}
          {aTab === 4 && <div style={{ ...crd, padding: "2rem", color: "#6b7280" }}>タイムカード（準備中）</div>}
          {aTab === 5 && <div style={{ ...crd, padding: "2rem", color: "#6b7280" }}>打刻履歴（準備中）</div>}
        </div>;
      })()}
    </div>
  );
}