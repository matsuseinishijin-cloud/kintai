import { useState } from "react";
import { gasSave } from "../api/gas";
import { today, newId, toMin } from "../utils/time";
import { convertTo, isHalfLeave, LV_REQ_MAP } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };

function getShiftDef(shiftType, shiftDefs, dept) {
  if (!shiftType || shiftType === "off") return { label: "休日", start: null, end: null };
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { label: "臨時", start: match[1], end: match[2] };
  }
  return (dept && shiftDefs[`${dept}:${shiftType}`]) || shiftDefs[shiftType] || { label: shiftType, start: null, end: null };
}

export default function LeaveRequest({ emp, leaves, lvReqs, shifts, shiftDefs, reload }) {
  const [form, setForm] = useState({ date: "", half: "", leaveStart: "", leaveEnd: "", leaveBreak: false, reason: "" });
  const [sub, setSub] = useState(false);
  const [warn, setWarn] = useState("");

  // 有休残日数（バケツ方式・LIFO・有効期限考慮）
  const td2 = today();
  const myLeaves = leaves.filter(l => String(l.empId) === String(emp.id));
  const validLeaves = myLeaves
    .map(l => {
      const records = (() => { try { return JSON.parse(l.records || "[]"); } catch { return []; } })();
      return records.filter(r => r.type === "grant" && (!r.expiresAt || r.expiresAt >= td2));
    })
    .flat()
    .sort((a, b) => b.grantedAt > a.grantedAt ? 1 : -1); // 新しい順
  const totalGranted = validLeaves.reduce((s, r) => s + (Number(r.days) || 0), 0);
  const approved = (lvReqs || []).filter(r => String(r.empId) === String(emp.id) && r.status === "approved");
  const usedDays = approved.reduce((s, r) => s + (isHalfLeave(r.half) ? 0.5 : 1), 0);
  const rem = totalGranted - usedDays;

  // 選択日のシフト
  const shiftRow = form.date ? shifts.find(s => String(s.empId) === String(emp.id) && s.date === form.date) : null;
  const def = getShiftDef(shiftRow?.shiftType, shiftDefs, emp.role);
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
      const halfVal = form.half === "full" ? "1日" : form.half;
      const data = convertTo({
        id: newId(), empId: emp.id, date: form.date,
        half: halfVal,
        reason: form.reason, status: "pending",
        leaveStart: form.leaveStart, leaveEnd: form.leaveEnd,
        leaveBreak: form.leaveBreak ? "1" : "",
      }, LV_REQ_MAP);
      await gasSave("有給申請", data);
      setForm({ date: "", half: "", leaveStart: "", leaveEnd: "", leaveBreak: false, reason: "" });
      setSub(true); setTimeout(() => setSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
  };

  // バケツ一覧（付与履歴・残日数付き・申請の帰属を追跡）
  const allRecords = myLeaves.flatMap(l => {
    try { return JSON.parse(l.records || "[]").filter(r => r.type === "grant"); } catch { return []; }
  }).sort((a, b) => b.grantedAt > a.grantedAt ? 1 : -1); // LIFO：新しい順
  const bucketsWithRem = allRecords.map(b => ({ ...b, remaining: Number(b.days), assignedReqs: [] }));
  const approvedSorted = [...approved].sort((a, b) => a.date > b.date ? 1 : -1);
  approvedSorted.forEach(req => {
    const days = isHalfLeave(req.half) ? 0.5 : 1;
    // 付与日が取得日以前かつ有効期限内のバケツのうち最新から消化（LIFO）
    const eligible = bucketsWithRem.filter(b => b.grantedAt <= req.date && (!b.expiresAt || b.expiresAt >= req.date) && b.remaining > 0);
    if (eligible.length === 0) return;
    const b = eligible[0]; // bucketsWithRemは新しい順なので[0]が最新
    const deduct = Math.min(b.remaining, days);
    b.remaining -= deduct;
    b.assignedReqs.push(req);
  });
  // 承認待ちも同様に割り当て
  const pendingReqs = (lvReqs || []).filter(r => String(r.empId) === String(emp.id) && r.status === "pending")
    .sort((a, b) => a.date > b.date ? 1 : -1);
  pendingReqs.forEach(req => {
    const eligible = bucketsWithRem.filter(b => b.grantedAt <= req.date && (!b.expiresAt || b.expiresAt >= req.date));
    if (eligible.length === 0) return;
    const b = eligible[0];
    b.assignedReqs.push(req);
  });
  const buckets = bucketsWithRem.sort((a, b) => a.grantedAt > b.grantedAt ? 1 : -1);
  const myReqs = (lvReqs || []).filter(r => String(r.empId) === String(emp.id)).sort((a, b) => b.date > a.date ? 1 : -1);
  const canSubmit = form.date && form.half && form.leaveStart && form.leaveEnd && form.reason && rem > 0;

  return (
    <div>
      {/* 申請フォームと履歴を横並び */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "start" }}>
        {/* 申請フォーム */}
        <div style={{ ...crd, padding: "1.25rem" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>有給申請</div>

          {rem <= 0 && <div style={{ marginBottom: 10, padding: "8px 12px", background: "#FFF0F0", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>有休残日数がありません</div>}

          {/* 区分 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>区分</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[["full", "全日（1日）"], ["am", "午前（0.5日）"], ["pm", "午後（0.5日）"]].map(([v, l]) => (
                <button key={v} onClick={() => setForm(p => ({ ...p, half: v }))}
                  style={{ padding: "8px 0", borderRadius: 8, border: form.half === v ? "2px solid #1251a3" : "1px solid #d1d5db", background: form.half === v ? "#E6F1FB" : "#fff", color: form.half === v ? "#1251a3" : "#111827", fontWeight: form.half === v ? 600 : 400, cursor: "pointer", fontSize: 12 }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 日付 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>取得日</div>
            <input type="date" value={form.date} max="2099-12-31" onChange={e => setForm(p => ({ ...p, date: e.target.value, leaveStart: "", leaveEnd: "" }))} style={iS} />
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

          {/* 休憩（全日・半日どちらでも表示） */}
          {form.half && (
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

        {/* 申請履歴（バケツごとにグループ表示） */}
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>付与・取得履歴</div>
          {myReqs.length === 0 && buckets.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>履歴なし</div>
          ) : (
            <div style={{ padding: "8px 12px" }}>
              {buckets.length === 0 ? (
                <div style={{ padding: "1rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>付与履歴なし</div>
              ) : buckets.map((b, bi) => {
                const bucketId = b.id || b.grantedAt;
                const td2 = today();
                const isExpired = b.expiresAt && b.expiresAt < td2;
                return (
                  <div key={bucketId} style={{ marginBottom: 12, borderRadius: 8, border: `1px solid ${isExpired ? "#e9ddd0" : "#c7d2fe"}`, overflow: "hidden" }}>
                    {/* バケツヘッダー */}
                    <div style={{ padding: "8px 12px", background: isExpired ? "#fafafa" : "#EEF2FF", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: isExpired ? "#9ca3af" : "#1251a3" }}>付与日：{b.grantedAt}</span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>付与{b.days}日</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: b.remaining > 0 ? "#0F6E56" : "#9ca3af" }}>残{b.remaining}日</span>
                      {b.expiresAt && <span style={{ fontSize: 11, color: isExpired ? "#A32D2D" : "#6b7280" }}>有効期限：{b.expiresAt}{isExpired ? "（期限切れ）" : ""}</span>}
                      {b.note && <span style={{ fontSize: 11, color: "#6b7280" }}>{b.note}</span>}
                    </div>
                    {/* このバケツの申請履歴 */}
                    {b.assignedReqs.length === 0 ? (
                      <div style={{ padding: "6px 12px", fontSize: 12, color: "#9ca3af" }}>　申請なし</div>
                    ) : b.assignedReqs.map(r => (
                      <div key={r.id} style={{ padding: "6px 12px", borderTop: "0.5px solid #e9ddd0", display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                        <span style={{ color: "#6b7280" }}>└</span>
                        <span style={{ fontWeight: 500 }}>{r.date}</span>
                        <span style={{ color: "#374151" }}>{isHalfLeave(r.half) ? "半日 0.5日" : "全日 1.0日"}</span>
                        {r.leaveStart && r.leaveEnd && <span style={{ color: "#6b7280" }}>{r.leaveStart}〜{r.leaveEnd}</span>}
                        {r.status === "pending" ? <span style={{ padding: "1px 6px", borderRadius: 99, fontSize: 10, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span>
                          : r.status === "approved" ? <span style={{ padding: "1px 6px", borderRadius: 99, fontSize: 10, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span>
                            : <span style={{ padding: "1px 6px", borderRadius: 99, fontSize: 10, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
