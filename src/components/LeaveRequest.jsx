import { useState } from "react";
import { gasSave } from "../api/gas";
import { today, newId, toMin, isWeekend, pad } from "../utils/time";
import { convertTo, LV_REQ_MAP } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };

function getShiftDef(shiftType, shiftDefs) {
  if (!shiftType || shiftType === "off") return { label: "休日", start: null, end: null };
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { label: "臨時", start: match[1], end: match[2] };
  }
  return shiftDefs[shiftType] || { label: shiftType, start: null, end: null };
}

export default function LeaveRequest({ emp, leaves, lvReqs, shifts, shiftDefs, reload }) {
  const [form, setForm] = useState({ date: "", half: "full", leaveStart: "", leaveEnd: "", leaveBreak: false, reason: "" });
  const [sub, setSub] = useState(false);
  const [warn, setWarn] = useState("");

  // 有休残日数
  const leave = leaves.find(l => String(l.empId) === String(emp.id));
  const approved = (lvReqs || []).filter(r => String(r.empId) === String(emp.id) && r.status === "approved");
  const usedDays = approved.reduce((s, r) => s + (r.half ? 0.5 : 1), 0);
  const rem = (Number(leave?.granted) || 0) - usedDays;

  // 選択日のシフト
  const shiftRow = form.date ? shifts.find(s => String(s.empId) === String(emp.id) && s.date === form.date) : null;
  const def = getShiftDef(shiftRow?.shiftType, shiftDefs);
  const hasShift = def.start !== null;

  // シフトとの重なりチェック
  const checkOverlap = () => {
    if (!hasShift || !form.leaveStart || !form.leaveEnd) return false;
    const shiftS = toMin(def.start), shiftE = toMin(def.end);
    const lvS = toMin(form.leaveStart), lvE = toMin(form.leaveEnd);
    return lvS < shiftE && lvE > shiftS;
  };

  const submit = async () => {
    if (!form.date || !form.leaveStart || !form.leaveEnd || !form.reason) return;
    if (rem <= 0) { alert("有休残日数がありません"); return; }

    // シフト重なり警告（申請は可能）
    if (checkOverlap()) {
      setWarn("申請時間帯にシフトが入っています。シフト責任者に連絡してください。");
    } else {
      setWarn("");
    }

    try {
      const data = convertTo({
        id: newId(), empId: emp.id, date: form.date,
        half: form.half === "full" ? "" : form.half,
        leaveStart: form.leaveStart, leaveEnd: form.leaveEnd,
        leaveBreak: form.leaveBreak ? "1" : "0",
        reason: form.reason, status: "pending",
        createdAt: new Date().toISOString(),
      }, LV_REQ_MAP);
      await gasSave("有給申請", data);
      setForm({ date: "", half: "full", leaveStart: "", leaveEnd: "", leaveBreak: false, reason: "" });
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
  };

  const myReqs = (lvReqs || []).filter(r => String(r.empId) === String(emp.id)).sort((a, b) => b.date > a.date ? 1 : -1);
  const canSubmit = form.date && form.leaveStart && form.leaveEnd && form.reason && rem > 0;

  return (
    <div>
      {/* 残日数 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: "1rem" }}>
        {[["付与日数", (leave?.granted || 0) + "日", ""], ["取得済", usedDays + "日", ""], ["残日数", rem + "日", rem < 3 ? "#A32D2D" : "#0F6E56"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "#fff", border: "1px solid #e9ddd0", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: c || "#111827" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 申請フォーム */}
      <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>有給申請</div>

        {rem <= 0 && <div style={{ marginBottom: 10, padding: "8px 12px", background: "#FFF0F0", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>有休残日数がありません</div>}

        {/* 区分 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>区分</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[["full", "全日（1日）"], ["half", "半日（0.5日）"]].map(([v, l]) => (
              <button key={v} onClick={() => setForm(p => ({ ...p, half: v }))}
                style={{ padding: "8px 0", borderRadius: 8, border: form.half === v ? "2px solid #1251a3" : "1px solid #d1d5db", background: form.half === v ? "#E6F1FB" : "#fff", color: form.half === v ? "#1251a3" : "#111827", fontWeight: form.half === v ? 600 : 400, cursor: "pointer", fontSize: 13 }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 日付 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>取得日</div>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value, leaveStart: "", leaveEnd: "" }))} style={iS} />
        </div>

        {/* シフト表示 */}
        {form.date && (
          <div style={{ marginBottom: 10, padding: "6px 10px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#374151" }}>
            {hasShift ? `シフト：${def.start}〜${def.end}` : "シフトなし（休日）"}
          </div>
        )}

        {/* 有休時間帯 */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>有休時間帯</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>開始</div>
              <input type="time" value={form.leaveStart} onChange={e => setForm(p => ({ ...p, leaveStart: e.target.value }))} style={iS} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>終了</div>
              <input type="time" value={form.leaveEnd} onChange={e => setForm(p => ({ ...p, leaveEnd: e.target.value }))} style={iS} />
            </div>
          </div>
        </div>

        {/* 休憩（半日のみ） */}
        {form.half === "half" && (
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={form.leaveBreak} onChange={e => setForm(p => ({ ...p, leaveBreak: e.target.checked }))} style={{ width: 16, height: 16 }} />
              休憩あり（60分差し引き）
            </label>
          </div>
        )}

        {/* 理由 */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>理由</div>
          <input type="text" value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="例：私用のため" style={iS} />
        </div>

        {/* 重なり警告 */}
        {warn && <div style={{ marginBottom: 10, padding: "8px 12px", background: "#FFF8E1", borderRadius: 8, fontSize: 12, color: "#854F0B", border: "1px solid #F59E0B" }}>⚠️ {warn}</div>}

        <button onClick={submit} disabled={!canSubmit}
          style={{ ...bP, width: "100%", padding: "10px 0", opacity: canSubmit ? 1 : 0.4 }}>
          申請する
        </button>
        {sub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
      </div>

      {/* 申請履歴 */}
      {myReqs.length > 0 && (
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>申請履歴</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["日付", "区分", "時間帯", "状態"].map(h => <th key={h} style={{ padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 400 }}>{h}</th>)}</tr></thead>
            <tbody>{myReqs.map(r => (
              <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                <td style={{ padding: "8px 10px" }}>{r.date}</td>
                <td style={{ padding: "8px 10px" }}>{r.half ? "半日" : "全日"}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#6b7280" }}>{r.leaveStart && r.leaveEnd ? `${r.leaveStart}〜${r.leaveEnd}` : "―"}</td>
                <td style={{ padding: "8px 10px" }}>
                  {r.status === "pending" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span>
                    : r.status === "approved" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span>
                      : <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
