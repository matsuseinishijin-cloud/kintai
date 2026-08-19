import { useState, useEffect, useCallback } from "react";
import { gasGet } from "./api/gas";
import { ADMIN_PASSWORD, ACCESS_PASSWORD, ROLES, convertFrom, EMP_MAP, PW_MAP, SHIFT_MAP, PUNCH_MAP, LV_REQ_MAP, LEAVE_MAP, TIME_TRANSFER_MAP, PUNCH_FIX_MAP, isActiveEmp, WEEK_PATTERN_MAP, sortEmps, WEEK_ALERT_EXCLUSION_MAP } from "./constants";
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
import PunchHistory from "./components/PunchHistory";
import TimecardAdmin from "./components/TimecardAdmin";
import ShiftDefManager from "./components/ShiftDefManager";
import WeekPatternManager from "./components/WeekPatternManager";
import LeaveManager from "./components/LeaveManager";

const _style = document.createElement("style");
_style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #fdf8f2; min-height: 100vh; font-family: "Hiragino Sans", "Yu Gothic", sans-serif; font-size: 16px; color: #111827; }
  :root { --color-background-primary: #ffffff; --color-background-secondary: #fef9f3; --color-text-primary: #111827; --color-text-secondary: #374151; --color-text-tertiary: #6b7280; --color-border-secondary: #d1d5db; --color-border-tertiary: #e9ddd0; --color-accent: #1251a3; }
  #root { max-width: 1200px; margin: 0 auto; padding: 1rem; }
  select, input, textarea { font-family: inherit; }
  @media print {
    body { background: #fff !important; }
    .no-print { display: none !important; }
    #root { max-width: none !important; padding: 0 !important; }
    .print-area { box-shadow: none !important; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
`;
document.head.appendChild(_style);

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const nB = active => ({ flex: 1, minWidth: 80, padding: "8px 4px", borderRadius: 8, border: "none", background: active ? "#1251a3" : "transparent", color: active ? "white" : "#6b7280", fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" });

function Loading() { return <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>読み込み中...</div>; }
function Err({ msg }) { return <div style={{ padding: "1rem", background: "#FFF0F0", borderRadius: 8, color: "#A32D2D" }}>エラー：{msg}</div>; }

// ── アクセスゲート（この端末が院内で使用許可されているかの確認画面） ─────────────
// 従業員のログインパスワードとは別に、アプリを開ける端末自体を絞り込む目的。
// 一度正しい合言葉を入力すれば、この端末では次回から表示されない（localStorageに記憶）。
const ACCESS_GATE_KEY = "kintai_access_granted";
function AccessGate({ onPass }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    if (pw === ACCESS_PASSWORD) {
      try { localStorage.setItem(ACCESS_GATE_KEY, "1"); } catch { /* ignore */ }
      onPass();
    } else {
      setErr("合言葉が違います");
    }
  };
  return (
    <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...crd, padding: "2rem", width: 320 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>クリニック勤怠</div>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: "1.5rem" }}>院内スタッフ用の合言葉を入力してください</div>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }}
          onKeyDown={e => e.key === "Enter" && submit()}
          placeholder="合言葉" autoFocus
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 16, textAlign: "center", letterSpacing: "0.2em", marginBottom: "1rem" }} />
        {err && <div style={{ marginBottom: 10, padding: "6px 10px", background: "#FFF0F0", borderRadius: 8, fontSize: 12, color: "#A32D2D" }}>{err}</div>}
        <button onClick={submit} disabled={!pw} style={{ width: "100%", padding: "10px 0", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: pw ? 1 : 0.4 }}>入る</button>
      </div>
    </div>
  );
}

function LoginScreen({ emps, passwords, onLogin }) {
  const [mode, setMode] = useState("admin");
  const [roleFilter, setRoleFilter] = useState("全て");
  const [sel, setSel] = useState(emps[0]?.id || "");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const allRoles = ["全て", ...ROLES];
  const filteredEmps = sortEmps(roleFilter === "全て" ? emps : emps.filter(e => e.role === roleFilter));
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
  const [accessGranted, setAccessGranted] = useState(() => {
    try { return localStorage.getItem(ACCESS_GATE_KEY) === "1"; } catch { return false; }
  });
  const [emps, setEmps] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [punches, setPunches] = useState([]);
  const [lvReqs, setLvReqs] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [passwords, setPasswords] = useState([]);
  const [shiftDefs, setShiftDefs] = useState({});
  const [shiftDefList, setShiftDefList] = useState([]);
  const [weekPatterns, setWeekPatterns] = useState([]);
  const [timeTransferReqs, setTimeTransferReqs] = useState([]);
  const [punchFixReqs, setPunchFixReqs] = useState([]);
  const [otReqs, setOtReqs] = useState([]);
  const [otherReqs, setOtherReqs] = useState([]);
  const [designatedHolidays, setDesignatedHolidays] = useState([]);
  const [weekAlertExclusions, setWeekAlertExclusions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loginId, setLoginId] = useState(null);
  const [tab, setTab] = useState(0);
  const [aTab, setATab] = useState(0);
  const [shiftSettingSub, setShiftSettingSub] = useState(0);

  // 打刻専用の軽量リロード（全13シートではなく打刻データだけ再取得。打刻は最も頻繁な操作なので専用に高速化）
  const reloadPunches = useCallback(async () => {
    try {
      const p = await gasGet("打刻");
      setPunches(p.map(r => convertFrom(r, PUNCH_MAP)));
    } catch (e) { setError(e.message); }
  }, []);

  // 申請系の軽量リロード（申請したデータの種類だけ再取得）
  const reloadLeaveReqs = useCallback(async () => {
    try { const lr = await gasGet("有給申請"); setLvReqs(lr.map(r => convertFrom(r, LV_REQ_MAP))); }
    catch (e) { setError(e.message); }
  }, []);
  const reloadPunchFixReqs = useCallback(async () => {
    try { const pfr = await gasGet("打刻修正申請"); setPunchFixReqs(pfr.map(r => convertFrom(r, PUNCH_FIX_MAP))); }
    catch (e) { setError(e.message); }
  }, []);
  const reloadOtReqs = useCallback(async () => {
    try {
      const otr = await gasGet("残業申請");
      setOtReqs(otr.map(r => convertFrom(r, { id: "id", "従業員id": "empId", "日付": "date", "種別": "type", "状態": "status", "申請退勤": "requestedEnd", "シフト終了": "shiftEnd" })));
    } catch (e) { setError(e.message); }
  }, []);
  const reloadTimeTransferReqs = useCallback(async () => {
    try { const ttr = await gasGet("時間振替申請"); setTimeTransferReqs(ttr.map(r => convertFrom(r, TIME_TRANSFER_MAP))); }
    catch (e) { setError(e.message); }
  }, []);
  const reloadOtherReqs = useCallback(async () => {
    try {
      const otr2 = await gasGet("その他申請");
      setOtherReqs(otr2.map(r => convertFrom(r, { id: "id", "従業員id": "empId", "日付": "date", "内容": "content", "状態": "status", "申請日時": "createdAt", "コメント": "comment" })));
    } catch (e) { setError(e.message); }
  }, []);
  const reloadWeekAlertExclusions = useCallback(async () => {
    try {
      const wae = await gasGet("週アラート除外");
      setWeekAlertExclusions(wae.map(r => convertFrom(r, WEEK_ALERT_EXCLUSION_MAP)));
    } catch (e) { setError(e.message); }
  }, []);
  // 打刻修正の承認：申請ステータスと実際の打刻データの両方が変わるため両方を再取得
  const reloadPunchFixAndPunches = useCallback(async () => {
    await Promise.all([reloadPunchFixReqs(), reloadPunches()]);
  }, [reloadPunchFixReqs, reloadPunches]);

  const loadAll = useCallback(async () => {
    try {
      const [e, s, p, lr, lv, pw, sd, ttr, pfr, otr, otr2, dh, wp, wae] = await Promise.all([
        gasGet("従業員"), gasGet("シフト"), gasGet("打刻"),
        gasGet("有給申請"), gasGet("有給"), gasGet("パスワード"),
        gasGet("シフト定義"), gasGet("時間振替申請"), gasGet("打刻修正申請"),
        gasGet("残業申請"), gasGet("その他申請"), gasGet("指定休"),
        gasGet("週間パターン"), gasGet("週アラート除外"),
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
      setWeekAlertExclusions(wae.map(r => convertFrom(r, WEEK_ALERT_EXCLUSION_MAP)));
      setWeekPatterns(wp.map(r => convertFrom(r, WEEK_PATTERN_MAP)));
      const defsMap = {};
      const defsList = [];
      sd.forEach(d => {
        if (!d["キー"]) return;
        const entry = { id: d["id"], key: d["キー"], dept: d["部署"] || "", label: d["名前"] || d["キー"], start: d["開始"] || null, end: d["終了"] || null, color: d["色"] || "#F5F9FE", tc: d["文字色"] || "#6b7280", breakMin: d["休憩"] != null ? Number(d["休憩"]) : 60, order: d["順番"] != null && d["順番"] !== "" ? Number(d["順番"]) : 999 };
        // 同じキー（例："A"）が部署をまたいで重複定義されるケースがあるため、
        // 「部署:キー」の組み合わせで正しく引けるようにする（部署単位が優先）。
        // キーのみのエントリも後方互換のため残すが、複数部署で重複する場合は最後の1件で上書きされる点に注意。
        defsMap[d["キー"]] = entry;
        if (d["部署"]) defsMap[`${d["部署"]}:${d["キー"]}`] = entry;
        defsList.push(entry);
      });
      setShiftDefs(defsMap);
      setShiftDefList(defsList);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { if (accessGranted) loadAll(); }, [loadAll, accessGranted]);

  const doRefresh = async () => {
    setRefreshing(true);
    try { await loadAll(); } finally { setRefreshing(false); }
  };

  if (!accessGranted) return <AccessGate onPass={() => setAccessGranted(true)} />;
  if (loading) return <Loading />;
  if (error) return <Err msg={error} />;
  if (!loginId) return <LoginScreen emps={emps.filter(isActiveEmp)} passwords={passwords} onLogin={id => { setLoginId(id); setTab(0); }} />;

  const isAdmin = loginId === "admin";
  const cur = emps.find(e => e.id === loginId);
  const eTabs = ["打刻", "申請", "マイシフト", "タイムカード"];

  return (
    <div style={{ padding: "0 0 2rem" }}>
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", ...crd, marginBottom: "1rem" }}>
        <div><div style={{ fontSize: 16, fontWeight: 700 }}>クリニック勤怠</div><div style={{ fontSize: 12, color: "#6b7280" }}>{isAdmin ? "管理者" : cur?.name}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={doRefresh} disabled={refreshing} style={{ ...bS, opacity: refreshing ? 0.5 : 1 }}>{refreshing ? "更新中..." : "🔄 更新"}</button>
          <button onClick={() => { setLoginId(null); setTab(0); }} style={bS}>ログアウト</button>
        </div>
      </div>
      {!isAdmin && (<div className="no-print" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, ...crd, marginBottom: "1rem", flexWrap: "wrap" }}>{eTabs.map((t, i) => (<button key={t} onClick={() => setTab(i)} style={nB(tab === i)}>{t}</button>))}</div>)}
      {!isAdmin && cur && (<div>
        {tab === 0 && <PunchScreen emp={cur} punches={punches} shifts={shifts} shiftDefs={shiftDefs} leaves={leaves} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} weekAlertExclusions={weekAlertExclusions} reload={loadAll} reloadPunches={reloadPunches} />}
        {tab === 1 && <RequestTab emp={cur} leaves={leaves} lvReqs={lvReqs} shifts={shifts} shiftDefs={shiftDefs} otReqs={otReqs} timeTransferReqs={timeTransferReqs} punchFixReqs={punchFixReqs} weekAlertExclusions={weekAlertExclusions} reload={loadAll}
          reloadLeaveReqs={reloadLeaveReqs} reloadPunchFixReqs={reloadPunchFixReqs} reloadOtReqs={reloadOtReqs} reloadTimeTransferReqs={reloadTimeTransferReqs} reloadOtherReqs={reloadOtherReqs} />}
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
        const aTabs = ["従業員管理", "シフト", "シフト設定", "申請許可", "有給管理", "タイムカード", "打刻履歴"];
        return <div>
          <div className="no-print" style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, ...crd, marginBottom: "1rem", flexWrap: "wrap" }}>
            {aTabs.map((t, i) => <button key={t} onClick={() => setATab(i)} style={nB(aTab === i)}>{t}</button>)}
          </div>
          {aTab === 0 && <EmpManager emps={emps} passwords={passwords} reload={loadAll} />}
          {aTab === 1 && <ShiftCalendar emps={emps} shifts={shifts} shiftDefs={shiftDefs} shiftDefList={shiftDefList} weekPatterns={weekPatterns} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} designatedHolidays={designatedHolidays} weekAlertExclusions={weekAlertExclusions} reloadWeekAlertExclusions={reloadWeekAlertExclusions} reload={loadAll} />}
          {aTab === 2 && (() => {
            const shiftSettingTabs = ["シフト定義", "週間パターン"];
            return <div>
              <div style={{ display: "flex", gap: 0, marginBottom: "1rem", borderBottom: "2px solid #e9ddd0" }}>
                {shiftSettingTabs.map((t, i) => (
                  <button key={t} onClick={() => setShiftSettingSub(i)}
                    style={{ padding: "8px 20px", border: "none", borderBottom: shiftSettingSub === i ? "2.5px solid #1251a3" : "2.5px solid transparent", background: "transparent", color: shiftSettingSub === i ? "#1251a3" : "#6b7280", fontWeight: shiftSettingSub === i ? 600 : 400, fontSize: 13, cursor: "pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
              {shiftSettingSub === 0 && <ShiftDefManager shiftDefList={shiftDefList} reload={loadAll} />}
              {shiftSettingSub === 1 && <WeekPatternManager weekPatterns={weekPatterns} shiftDefList={shiftDefList} reload={loadAll} />}
            </div>;
          })()}
          {aTab === 3 && <ApprovalCenter emps={emps} lvReqs={lvReqs} otReqs={otReqs} timeTransferReqs={timeTransferReqs} punchFixReqs={punchFixReqs} otherReqs={otherReqs} shifts={shifts} shiftDefs={shiftDefs} leaves={leaves} punches={punches} reload={loadAll}
            reloadLeaveReqs={reloadLeaveReqs} reloadPunchFixAndPunches={reloadPunchFixAndPunches} reloadOtReqs={reloadOtReqs} reloadTimeTransferReqs={reloadTimeTransferReqs} reloadOtherReqs={reloadOtherReqs} />}
          {aTab === 4 && <LeaveManager emps={emps} leaves={leaves} lvReqs={lvReqs} designatedHolidays={designatedHolidays} reload={loadAll} />}
          {aTab === 5 && <TimecardAdmin emps={emps} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} otReqs={otReqs} reload={loadAll} />}
          {aTab === 6 && <PunchHistory emps={emps} punches={punches} reload={loadAll} />}
        </div>;
      })()}
    </div>
  );
}