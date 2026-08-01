import { useState } from "react";
import { gasSave } from "../api/gas";
import { newId, toMin, toHStr, pad, daysInMonth } from "../utils/time";
import { convertTo, TIME_TRANSFER_MAP, BREAK_MIN } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 400 };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

function getShiftDef(shiftType, shiftDefs) {
  if (!shiftType || shiftType === "off") return { start: null, end: null, breakMin: 0 };
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { start: match[1], end: match[2], breakMin: match[3] ? Number(match[3]) : 60 };
  }
  return shiftDefs[shiftType] || { start: null, end: null, breakMin: BREAK_MIN };
}

function getWeekShiftMin(weekStart, empId, shifts, shiftDefs, lvReqs) {
  if (!weekStart) return 0;
  const [wy, wm, wd] = weekStart.split("-").map(Number);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(wy, wm - 1, wd + i);
    const ds = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const sr = shifts.find(s => String(s.empId) === String(empId) && s.date === ds);
    const def = getShiftDef(sr?.shiftType, shiftDefs);
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

function getMondayOf(ds) {
  const [y, m, d] = ds.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function TimeTransferRequest({ emp, shifts, shiftDefs, timeTransferReqs, lvReqs, reload }) {
  const [form, setForm] = useState({ overWeekStart: "", shortWeekStart: "", reason: "" });
  const [sub, setSub] = useState(false);

  const weeklyLimit = emp.weeklyLimit ? Number(emp.weeklyLimit) * 60 : 40 * 60;

  // 先月・当月の週オプション
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
        const wMin = getWeekShiftMin(mon, emp.id, shifts, shiftDefs, lvReqs);
        const diff = wMin - weeklyLimit;
        opts.push({ mon, wMin, diff });
      }
    }
    return opts;
  })();

  const overWeeks = weekOptions.filter(o => o.diff > 0);
  const shortWeeks = weekOptions.filter(o => o.diff < 0);
  const selOver = weekOptions.find(o => o.mon === form.overWeekStart);
  const selShort = weekOptions.find(o => o.mon === form.shortWeekStart);
  const offsetMin = selOver && selShort ? Math.min(selOver.diff, Math.abs(selShort.diff)) : 0;

  const submit = async () => {
    if (!form.overWeekStart || !form.shortWeekStart || !form.reason || offsetMin <= 0) return;
    try {
      const data = convertTo({
        id: newId(), empId: emp.id,
        transferType: "A",
        shortWeekStart: form.shortWeekStart,
        overWeekStart: form.overWeekStart,
        shortDate: "", overDate: "",
        offsetMin: offsetMin,
        reason: form.reason, status: "pending"
      }, TIME_TRANSFER_MAP);
      await gasSave("時間振替申請", data);
      setForm({ overWeekStart: "", shortWeekStart: "", reason: "" });
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
  };

  const myReqs = (timeTransferReqs || []).filter(r => String(r.empId) === String(emp.id) && r.transferType === "A").sort((a, b) => b.overWeekStart > a.overWeekStart ? 1 : -1);
  const canSubmit = form.overWeekStart && form.shortWeekStart && form.reason && offsetMin > 0;

  return (
    <div>
      <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>時間振替申請</div>
        <div style={{ marginBottom: 10, padding: "8px 12px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#1251a3" }}>
              週所定労働時間：<strong>{emp.weeklyLimit || 40}時間</strong>
            </div>
            {/* 超過週 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>超過週（振替元）</div>
              {overWeeks.length === 0
                ? <div style={{ padding: "8px 12px", background: "#fef9f3", borderRadius: 8, fontSize: 12, color: "#9ca3af" }}>超過している週がありません</div>
                : <select value={form.overWeekStart} onChange={e => setForm(p => ({ ...p, overWeekStart: e.target.value }))} style={iS}>
                  <option value="">選択してください</option>
                  {overWeeks.map(o => (
                    <option key={o.mon} value={o.mon}>{o.mon}週（+{toHStr(o.diff)}超過）</option>
                  ))}
                </select>
              }
            </div>
            {/* 不足週 */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>不足週（振替先）</div>
              {shortWeeks.length === 0
                ? <div style={{ padding: "8px 12px", background: "#fef9f3", borderRadius: 8, fontSize: 12, color: "#9ca3af" }}>不足している週がありません</div>
                : <select value={form.shortWeekStart} onChange={e => setForm(p => ({ ...p, shortWeekStart: e.target.value }))} style={iS}>
                  <option value="">選択してください</option>
                  {shortWeeks.map(o => (
                    <option key={o.mon} value={o.mon}>{o.mon}週（{toHStr(Math.abs(o.diff))}不足）</option>
                  ))}
                </select>
              }
            </div>
            {/* 振替時間 */}
            {offsetMin > 0 && (
              <div style={{ marginBottom: 10, padding: "10px 12px", background: "#EAF3DE", borderRadius: 8, fontSize: 13, color: "#3B6D11", fontWeight: 600 }}>
                振替時間：{toHStr(offsetMin)}
              </div>
            )}
            {/* 理由 */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>理由</div>
              <input type="text" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="例：業務の都合" style={iS} />
            </div>
            <button onClick={submit} disabled={!canSubmit} style={{ ...bP, width: "100%", padding: "10px 0", opacity: canSubmit ? 1 : 0.4 }}>申請する</button>
            {sub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
      </div>
      {myReqs.length > 0 && (
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>申請履歴</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["超過週", "不足週", "振替時間", "状態"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{myReqs.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                <td style={tdS}>{r.overWeekStart}</td>
                <td style={tdS}>{r.shortWeekStart}</td>
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