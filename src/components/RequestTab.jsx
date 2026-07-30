import { useState } from "react";
import LeaveRequest from "./LeaveRequest";
import { EARLY_TARGET_ROLES, isOvertimeTarget } from "../constants";
import { today } from "../utils/time";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const bS = active => ({ padding: "7px 14px", borderRadius: 8, border: "none", borderBottom: active ? "2px solid #1251a3" : "2px solid transparent", background: "transparent", color: active ? "#1251a3" : "#6b7280", fontWeight: active ? 600 : 400, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" });

export default function RequestTab({ emp, leaves, lvReqs, shifts, shiftDefs, otReqs, timeTransferReqs, punchFixReqs, reload }) {
  // 申請種別の決定
  const sections = [];
  const td2 = today();
  const hasLeave = leaves.some(l => {
    if (String(l.empId) !== String(emp.id)) return false;
    const records = (() => { try { return JSON.parse(l.records || "[]"); } catch { return []; } })();
    return records.some(r => r.type === "grant" && (!r.expiresAt || r.expiresAt >= td2));
  });
  if (hasLeave) sections.push({ key: "leave", label: "有給申請" });
  sections.push({ key: "punchfix", label: "打刻修正" });
  if (emp.type === "正社員" && EARLY_TARGET_ROLES.includes(emp.role)) sections.push({ key: "early", label: "早出申請" });
  if (emp.type === "正社員") sections.push({ key: "timetransfer", label: "時間振替" });
  if (isOvertimeTarget(emp)) sections.push({ key: "overtime", label: "時間外申請" });
  sections.push({ key: "other", label: "その他" });

  const [active, setActive] = useState(sections[0]?.key || "leave");

  return (
    <div>
      {/* セクションタブ */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: "1rem", borderBottom: "1px solid #e9ddd0" }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setActive(s.key)} style={bS(active === s.key)}>{s.label}</button>
        ))}
      </div>

      {/* 有給申請 */}
      {active === "leave" && (
        <LeaveRequest emp={emp} leaves={leaves} lvReqs={lvReqs} shifts={shifts} shiftDefs={shiftDefs} reload={reload} />
      )}

      {/* 打刻修正申請（過去分） */}
      {active === "punchfix" && (
        <PunchFixRequest emp={emp} punchFixReqs={punchFixReqs} reload={reload} />
      )}

      {/* 早出申請 */}
      {active === "early" && (
        <div style={{ ...crd, padding: "1.25rem", color: "#6b7280" }}>早出申請（準備中）</div>
      )}

      {/* 時間振替申請 */}
      {active === "timetransfer" && (
        <div style={{ ...crd, padding: "1.25rem", color: "#6b7280" }}>時間振替申請（準備中）</div>
      )}

      {/* 時間外申請 */}
      {active === "overtime" && (
        <div style={{ ...crd, padding: "1.25rem", color: "#6b7280" }}>時間外申請（準備中）</div>
      )}

      {/* その他申請 */}
      {active === "other" && (
        <OtherRequest emp={emp} reload={reload} />
      )}
    </div>
  );
}

// ── 打刻修正申請（過去分） ────────────────────────────────────────────────────
import { gasSave } from "../api/gas";
import { newId } from "../utils/time";
import { convertTo, PUNCH_FIX_MAP } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };

function PunchFixRequest({ emp, punchFixReqs, reload }) {
  const td = today();
  // 過去日付のみ（当日より前）
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  const [form, setForm] = useState({ date: maxDate, reqIn: "", reqOut: "", reason: "" });
  const [sub, setSub] = useState(false);

  const submit = async () => {
    if (!form.reqIn || !form.reqOut || !form.reason) return;
    try {
      const data = convertTo({
        id: newId(), empId: emp.id, date: form.date,
        reqIn: form.reqIn, reqOut: form.reqOut, reason: form.reason,
        status: "pending", origIn: "", origOut: "",
        createdAt: new Date().toISOString(), comment: ""
      }, PUNCH_FIX_MAP);
      await gasSave("打刻修正申請", data);
      setForm({ date: maxDate, reqIn: "", reqOut: "", reason: "" });
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
  };

  const myReqs = (punchFixReqs || []).filter(r => String(r.empId) === String(emp.id)).sort((a, b) => b.date > a.date ? 1 : -1);
  const canSubmit = form.reqIn && form.reqOut && form.reason;

  return (
    <div>
      <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>打刻修正申請（過去分）</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>対象日</div>
          <input type="date" value={form.date} max={maxDate} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={iS} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
          <div><div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>申請出勤時刻</div><input type="time" value={form.reqIn} onChange={e => setForm(p => ({ ...p, reqIn: e.target.value }))} style={iS} /></div>
          <div><div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>申請退勤時刻</div><input type="time" value={form.reqOut} onChange={e => setForm(p => ({ ...p, reqOut: e.target.value }))} style={iS} /></div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>理由</div>
          <input type="text" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="例：打刻忘れ" style={iS} />
        </div>
        <button onClick={submit} disabled={!canSubmit} style={{ ...bP, width: "100%", padding: "10px 0", opacity: canSubmit ? 1 : 0.4 }}>申請する</button>
        {sub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
      </div>
      {myReqs.length > 0 && (
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>申請履歴</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["日付", "申請時刻", "状態"].map(h => <th key={h} style={{ padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 400 }}>{h}</th>)}</tr></thead>
            <tbody>{myReqs.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                <td style={{ padding: "8px 10px" }}>{r.date}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#6b7280" }}>{r.reqIn}〜{r.reqOut}</td>
                <td style={{ padding: "8px 10px" }}>{r.status === "pending" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span> : r.status === "approved" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span> : <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── その他申請 ────────────────────────────────────────────────────────────────
function OtherRequest({ emp, reload }) {
  const [form, setForm] = useState({ date: today(), content: "" });
  const [sub, setSub] = useState(false);

  const submit = async () => {
    if (!form.date || !form.content) return;
    try {
      const data = convertTo({
        id: newId(), empId: emp.id, date: form.date,
        content: form.content, status: "未対応",
        createdAt: new Date().toISOString(), comment: ""
      }, { id: "id", "従業員id": "empId", "日付": "date", "内容": "content", "状態": "status", "申請日時": "createdAt", "コメント": "comment" });
      await gasSave("その他申請", data);
      setForm({ date: today(), content: "" });
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
  };

  return (
    <div style={{ ...crd, padding: "1.25rem" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>その他申請</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>日付</div>
        <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={iS} />
      </div>
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>内容</div>
        <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="申請内容を入力してください" rows={4} style={{ ...iS, resize: "vertical" }} />
      </div>
      <button onClick={submit} disabled={!form.content} style={{ ...bP, width: "100%", padding: "10px 0", opacity: form.content ? 1 : 0.4 }}>申請する</button>
      {sub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
    </div>
  );
}