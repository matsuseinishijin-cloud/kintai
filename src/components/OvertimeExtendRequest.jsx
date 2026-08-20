import { useState } from "react";
import { gasSave } from "../api/gas";
import { today, newId } from "../utils/time";
import { convertTo } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 400 };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

// 「残業申請」シートは早出申請（EarlyRequest.jsx）と共用のため列名は同じマッピングを使う
// シフト終了：実際のシフト終了時刻（参考値）／申請退勤：延長後の退勤希望時刻／種別："overtime"
const OT_MAP = { id:"id","従業員id":"empId","日付":"date","シフト終了":"shiftEnd","申請退勤":"requestedEnd","理由":"reason","状態":"status","種別":"type" };

function getShiftDef(shiftType, shiftDefs, dept) {
  if (dept === "AT") dept = "理学療法士"; // ATは理学療法士のシフト定義を転用
  if (!shiftType || shiftType === "off") return { start: null, end: null };
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2})/);
    if (match) return { start: match[1], end: match[2] };
  }
  return (dept && shiftDefs[`${dept}:${shiftType}`]) || shiftDefs[shiftType] || { start: null, end: null };
}

export default function OvertimeExtendRequest({ emp, shifts, shiftDefs, otReqs, reload }) {
  const td = today();
  const [form, setForm] = useState({ date: td, requestedEnd: "", reason: "" });
  const [sub, setSub] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const shiftRow = form.date ? shifts.find(s => String(s.empId) === String(emp.id) && s.date === form.date) : null;
  const def = getShiftDef(shiftRow?.shiftType, shiftDefs, emp.role);

  const submit = async () => {
    if (!form.requestedEnd || !form.reason || submitting) return;
    setSubmitting(true);
    try {
      const data = convertTo({
        id: newId(), empId: emp.id, date: form.date,
        shiftEnd: def.end || "―",
        requestedEnd: form.requestedEnd,
        reason: form.reason, status: "pending", type: "overtime"
      }, OT_MAP);
      await gasSave("残業申請", data);
      setForm({ date: td, requestedEnd: "", reason: "" });
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
    setSubmitting(false);
  };

  const myReqs = (otReqs || []).filter(r => String(r.empId) === String(emp.id) && r.type === "overtime").sort((a, b) => b.date > a.date ? 1 : -1);
  const canSubmit = form.requestedEnd && form.reason && !submitting;

  return (
    <div>
      <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>残業申請</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>対象日</div>
          <input type="date" value={form.date} max={td} onChange={e => setForm(p => ({ ...p, date: e.target.value, requestedEnd: "" }))} style={iS} />
        </div>
        {def.end && (
          <div style={{ marginBottom: 10, padding: "6px 10px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#374151" }}>
            シフト終了：<strong>{def.end}</strong>
          </div>
        )}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>申請退勤時刻（シフト終了より後の時刻）</div>
          <input type="time" value={form.requestedEnd} onChange={e => setForm(p => ({ ...p, requestedEnd: e.target.value }))} style={iS} />
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>理由</div>
          <input type="text" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="例：業務の都合" style={iS} />
        </div>
        <button onClick={submit} disabled={!canSubmit} style={{ ...bP, width: "100%", padding: "10px 0", opacity: canSubmit ? 1 : 0.4 }}>{submitting ? "送信中…" : "申請する"}</button>
        {sub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
      </div>
      {myReqs.length > 0 && (
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>申請履歴</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["日付", "申請退勤", "状態"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>{myReqs.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                <td style={tdS}>{r.date}</td>
                <td style={tdS}>{r.requestedEnd}</td>
                <td style={tdS}>{r.status === "pending" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span> : r.status === "approved" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span> : <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
