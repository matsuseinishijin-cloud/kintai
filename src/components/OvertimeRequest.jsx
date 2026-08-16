import { useState } from "react";
import { gasSaveBatch } from "../api/gas";
import { newId, toMin, toHStr, pad, daysInMonth, today } from "../utils/time";
import { convertTo, TIME_TRANSFER_MAP, BREAK_MIN } from "../constants";

const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 400 };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

function getShiftDef(shiftType, shiftDefs, dept) {
  if (!shiftType || shiftType === "off") return { start: null, end: null, breakMin: 0 };
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { start: match[1], end: match[2], breakMin: match[3] ? Number(match[3]) : 60 };
  }
  return (dept && shiftDefs[`${dept}:${shiftType}`]) || shiftDefs[shiftType] || { start: null, end: null, breakMin: BREAK_MIN };
}

function getMondayOf(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getWeekShiftMin(weekStart, empId, shifts, shiftDefs, lvReqs, dept) {
  if (!weekStart) return 0;
  const td = today();
  const [wy, wm, wd] = weekStart.split("-").map(Number);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(wy, wm - 1, wd + i);
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (ds > td) continue; // 実績ベース：今日より先の日付は集計対象外
    const sr = shifts.find(s => String(s.empId) === String(empId) && s.date === ds);
    const def = getShiftDef(sr?.shiftType, shiftDefs, dept);
    if (def.start && def.end) {
      const bk = def.breakMin != null ? def.breakMin : BREAK_MIN;
      total += Math.max(0, toMin(def.end) - toMin(def.start) - bk);
    }
    const lv = (lvReqs || []).find(r => String(r.empId) === String(empId) && r.date === ds && (r.status === "approved" || r.status === "pending"));
    if (lv && lv.leaveStart && lv.leaveEnd) {
      const lvMin = toMin(lv.leaveEnd) - toMin(lv.leaveStart);
      const breakMin = lv.leaveBreak === "1" ? 60 : 0;
      total += Math.max(0, lvMin - breakMin);
    }
  }
  return total;
}

export default function OvertimeRequest({ emp, shifts, shiftDefs, timeTransferReqs, lvReqs, reload }) {
  const [selectedWeeks, setSelectedWeeks] = useState(new Set());
  const [sub, setSub] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [debugData, setDebugData] = useState(null); // 調査用（原因特定できたら削除します）

  const weeklyLimit = emp.weeklyLimit ? Number(emp.weeklyLimit) * 60 : null;

  // 対象週（先月・当月・週所定超過・未申請）
  const weekOptions = (() => {
    if (!weeklyLimit) return [];
    const opts = [];
    const now = new Date();
    const seen = new Set();
    for (let mo = -1; mo <= 0; mo++) {
      const raw = now.getMonth() + 1 + mo;
      const y = raw <= 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = raw <= 0 ? raw + 12 : raw;
      const last = daysInMonth(y, m);
      for (let d = 1; d <= last; d++) {
        const ds = `${y}-${pad(m)}-${pad(d)}`;
        const mon = getMondayOf(ds);
        if (seen.has(mon)) continue;
        seen.add(mon);
        const wMin = getWeekShiftMin(mon, emp.id, shifts, shiftDefs, lvReqs, emp.role);
        const excess = Math.max(0, wMin - weeklyLimit);
        if (excess <= 0) continue;
        const alreadyUsed = (timeTransferReqs || [])
          .filter(r => String(r.empId) === String(emp.id) && r.overWeekStart === mon && (r.transferType === "A" || r.transferType === "C") && (r.status === "pending" || r.status === "approved"))
          .reduce((s, r) => s + Number(r.offsetMin || 0), 0);
        const remaining = excess - alreadyUsed;
        if (remaining > 0) opts.push({ mon, wMin, excess, remaining });
      }
    }
    return opts;
  })();

  const toggleWeek = mon => {
    setSelectedWeeks(prev => {
      const next = new Set(prev);
      next.has(mon) ? next.delete(mon) : next.add(mon);
      return next;
    });
  };

  const selectedOptions = weekOptions.filter(o => selectedWeeks.has(o.mon));
  const totalSelected = selectedOptions.reduce((s, o) => s + o.remaining, 0);

  const submit = async () => {
    if (selectedWeeks.size === 0 || submitting) return;
    setSubmitting(true);
    try {
      const dataArray = selectedOptions.map(o => convertTo({
        id: newId(), empId: emp.id,
        transferType: "C",
        shortWeekStart: "", overWeekStart: o.mon,
        shortDate: "", overDate: "",
        offsetMin: o.remaining,
        reason: "時間外申請", status: "pending"
      }, TIME_TRANSFER_MAP));
      // ▼▼▼ 調査用（原因特定できたら削除します） ▼▼▼
      const result = await gasSaveBatch("時間振替申請", dataArray);
      setDebugData("【送信前データ】\n" + JSON.stringify(dataArray, null, 2) + "\n\n【GASが受け取ったデータ】\n" + JSON.stringify(result._debugReceived, null, 2));
      // ▲▲▲ 調査用 ▲▲▲
      setSelectedWeeks(new Set());
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
    setSubmitting(false);
  };

  const myReqs = (timeTransferReqs || []).filter(r => String(r.empId) === String(emp.id) && r.transferType === "C").sort((a, b) => b.overWeekStart > a.overWeekStart ? 1 : -1);

  return (
    <div>
      <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>時間外申請</div>
        {!weeklyLimit ? (
          <div style={{ padding: "1rem", background: "#fef9f3", borderRadius: 8, fontSize: 13, color: "#6b7280" }}>週所定労働時間が設定されていません</div>
        ) : (
          <>
            <div style={{ marginBottom: 10, padding: "8px 12px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#1251a3" }}>
              週所定労働時間：<strong>{emp.weeklyLimit}時間</strong>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>所定超過している週（複数選択可）</div>
              {weekOptions.length === 0
                ? <div style={{ padding: "8px 12px", background: "#fef9f3", borderRadius: 8, fontSize: 12, color: "#9ca3af" }}>該当する週がありません</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {weekOptions.map(o => (
                    <label key={o.mon} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: selectedWeeks.has(o.mon) ? "#EDE9FE" : "#fef9f3", border: selectedWeeks.has(o.mon) ? "1px solid #7C3AED" : "1px solid transparent", cursor: "pointer" }}>
                      <input type="checkbox" checked={selectedWeeks.has(o.mon)} onChange={() => toggleWeek(o.mon)} style={{ width: 16, height: 16 }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#1251a3" }}>{o.mon}週</span>
                        <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>シフト{toHStr(o.wMin)}</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#854F0B" }}>超過{toHStr(o.remaining)}</span>
                    </label>
                  ))}
                </div>
              }
            </div>
            {selectedWeeks.size > 0 && (
              <div style={{ marginBottom: 12, padding: "10px 12px", background: "#FFF8E1", borderRadius: 8, fontSize: 13, color: "#854F0B", fontWeight: 600 }}>
                申請合計：{toHStr(totalSelected)}（{selectedWeeks.size}週分）
              </div>
            )}
            <button onClick={submit} disabled={selectedWeeks.size === 0 || submitting} style={{ ...bP, width: "100%", padding: "10px 0", opacity: (selectedWeeks.size > 0 && !submitting) ? 1 : 0.4 }}>
              {submitting ? "送信中…" : `申請する（${selectedWeeks.size}週）`}
            </button>
            {debugData && (
              <div style={{ marginTop: 10, padding: 10, background: "#111827", color: "#4ADE80", borderRadius: 8, fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-all", fontFamily: "monospace" }}>
                【調査用】送信前後のデータ比較（今回は実際に送信されています）：
                {"\n"}{debugData}
              </div>
            )}
            {sub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
          </>
        )}
      </div>
      {myReqs.length > 0 && (
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>申請履歴</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["対象週", "時間外", "状態"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{myReqs.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                <td style={tdS}>{r.overWeekStart}週</td>
                <td style={{ ...tdS, color: "#1251a3", fontWeight: 600 }}>{toHStr(Number(r.offsetMin || 0))}</td>
                <td style={tdS}>{r.status === "pending" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span> : r.status === "approved" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span> : <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
