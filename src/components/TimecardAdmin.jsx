import { useState } from "react";
import { gasSaveBatch } from "../api/gas";
import { newId, today, pad, getPeriodRange, getPeriodDays, DOW_JP } from "../utils/time";
import { ROLES, BREAK_MIN } from "../constants";
import TimecardSeishainStd from "./TimecardSeishainStd";
import TimecardSeishainFixed from "./TimecardSeishainFixed";
import TimecardPartStd from "./TimecardPartStd";
import TimecardPTpart from "./TimecardPTpart";
import TimecardNursepart from "./TimecardNursepart";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "auto" };
const iST = { padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, width: 100 };
const bP = { padding: "8px 16px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, cursor: "pointer" };
const thS = { padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500 };
const tdS = { padding: "6px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

// ── 打刻一括編集パネル ────────────────────────────────────────────────────────
function BulkPunchEditor({ emp, punches, reload }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [edits, setEdits] = useState({}); // { date: { in, out } }
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const period = getPeriodRange(year, month);
  const periodDays = getPeriodDays(year, month);
  const td = today();

  const prevM = () => month === 1 ? (setYear(y => y - 1), setMonth(12)) : setMonth(m => m - 1);
  const nextM = () => month === 12 ? (setYear(y => y + 1), setMonth(1)) : setMonth(m => m + 1);

  const getVal = (ds, field) => {
    if (edits[ds]?.[field] !== undefined) return edits[ds][field];
    const p = punches.find(p => String(p.empId) === String(emp.id) && p.date === ds);
    return p?.[field] || "";
  };

  const setVal = (ds, field, val) => {
    setEdits(prev => ({ ...prev, [ds]: { in: getVal(ds, "in"), out: getVal(ds, "out"), ...prev[ds], [field]: val } }));
  };

  const editedCount = Object.keys(edits).length;

  const saveAll = async () => {
    setSaving(true);
    try {
      const dataArray = Object.entries(edits).map(([ds, v]) => {
        const existing = punches.find(p => String(p.empId) === String(emp.id) && p.date === ds);
        return {
          id: existing?.id || newId(), "従業員id": emp.id, "日付": ds,
          "出勤": v.in ?? existing?.in ?? "", "退勤": v.out ?? existing?.out ?? "",
          "休憩": existing?.break != null ? existing.break : BREAK_MIN, "補正済": true,
        };
      });
      await gasSaveBatch("打刻", dataArray);
      setEdits({});
      await reload();
    } catch (e) { alert("保存失敗：" + e.message); }
    setSaving(false);
  };

  return (
    <div style={{ ...crd, marginBottom: "1rem" }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>打刻一括編集{open ? " ▲" : " ▼"}</span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>{emp.name}さんの打刻を複数日まとめて修正できます</span>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button onClick={prevM} style={bS}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1251a3" }}>{period.label}</span>
            <button onClick={nextM} style={bS}>›</button>
            <button onClick={saveAll} disabled={editedCount === 0 || saving}
              style={{ ...bP, marginLeft: "auto", opacity: editedCount === 0 || saving ? 0.4 : 1 }}>
              {saving ? "保存中..." : `変更を保存（${editedCount}件）`}
            </button>
            {editedCount > 0 && <button onClick={() => setEdits({})} style={bS}>取消</button>}
          </div>
          <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>{["日", "曜", "出勤", "退勤"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {periodDays.map(ds => {
                  const dow = new Date(ds).getDay();
                  const dc = dow === 0 ? "#A32D2D" : dow === 6 ? "#1251a3" : "#374151";
                  const isEdited = edits[ds] !== undefined;
                  return (
                    <tr key={ds} style={{ borderBottom: "0.5px solid #e9ddd0", background: ds === td ? "#EFF6FF" : isEdited ? "#FFF8E1" : "inherit" }}>
                      <td style={tdS}>{ds.slice(5).replace("-", "/")}</td>
                      <td style={{ ...tdS, color: dc }}>{DOW_JP[dow]}</td>
                      <td style={tdS}><input type="time" value={getVal(ds, "in")} onChange={e => setVal(ds, "in", e.target.value)} style={iST} /></td>
                      <td style={tdS}><input type="time" value={getVal(ds, "out")} onChange={e => setVal(ds, "out", e.target.value)} style={iST} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TimecardAdmin({ emps, shifts, punches, shiftDefs, lvReqs, timeTransferReqs, otReqs, reload }) {
  const [roleFilter, setRoleFilter] = useState("");
  const [empId, setEmpId] = useState(emps[0]?.id || "");
  const [refreshing, setRefreshing] = useState(false);

  const filteredEmps = emps.filter(e => !roleFilter || e.role === roleFilter);
  const emp = filteredEmps.find(e => String(e.id) === String(empId)) || filteredEmps[0];

  const onRoleChange = r => {
    setRoleFilter(r);
    const first = (r ? emps.filter(e => e.role === r) : emps)[0];
    if (first) setEmpId(first.id);
  };

  const doRefresh = async () => {
    setRefreshing(true);
    try { await reload(); } finally { setRefreshing(false); }
  };

  if (!emp) {
    return <div style={{ ...crd, padding: "2rem", color: "#6b7280", textAlign: "center" }}>該当する従業員がいません</div>;
  }

  // App.jsx の従業員本人向けタイムカード振り分けと同じロジック
  const isFixed = (emp.role === "理学療法士" || emp.role === "AT") && emp.type === "正社員";
  const isPTpart = emp.role === "理学療法士" && emp.type === "パート";
  const isNursepart = emp.role === "看護師" && emp.type === "パート";
  const isPartStd = emp.type === "パート" && !isPTpart && !isNursepart;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <select value={roleFilter} onChange={e => onRoleChange(e.target.value)} style={iS}>
          <option value="">全職種</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={emp.id} onChange={e => setEmpId(e.target.value)} style={iS}>
          {filteredEmps.map(e => <option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}
        </select>
        <button onClick={doRefresh} disabled={refreshing} style={{ ...bS, marginLeft: "auto", opacity: refreshing ? 0.5 : 1 }}>
          {refreshing ? "更新中..." : "🔄 更新"}
        </button>
      </div>

      <BulkPunchEditor emp={emp} punches={punches} reload={reload} />

      {isFixed && <TimecardSeishainFixed emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} isAdmin />}
      {!isFixed && isPTpart && <TimecardPTpart emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} otReqs={otReqs} />}
      {!isFixed && !isPTpart && isNursepart && <TimecardNursepart emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />}
      {!isFixed && !isPTpart && !isNursepart && isPartStd && <TimecardPartStd emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />}
      {!isFixed && !isPTpart && !isNursepart && !isPartStd && <TimecardSeishainStd emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} isAdmin />}
    </div>
  );
}
