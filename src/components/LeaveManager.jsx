import { useState } from "react";
import { gasSave } from "../api/gas";
import { today, newId } from "../utils/time";
import { convertTo, LEAVE_MAP } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const bD = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#FFF0F0", color: "#A32D2D", fontSize: 12, cursor: "pointer" };
const bE = { padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 12, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "8px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500 };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

// 有効期限自動計算（2年後）
function addYears(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

// バケツの残日数計算（LIFO）
function calcBucketsWithRemaining(records, lvReqs, empId) {
  const td = today();
  let recs = [];
  try { recs = JSON.parse(records || "[]"); } catch { recs = []; }
  const grants = recs.filter(r => r.type === "grant").sort((a, b) => b.grantedAt > a.grantedAt ? 1 : -1); // 新しい順

  const approved = (lvReqs || []).filter(r => String(r.empId) === String(empId) && r.status === "approved")
    .sort((a, b) => a.date > b.date ? 1 : -1);

  // バケツごとの残日数を計算
  const buckets = grants.map(g => ({ ...g, remaining: Number(g.days) }));
  approved.forEach(req => {
    const days = req.half ? 0.5 : 1;
    for (const b of buckets) {
      if (b.remaining <= 0) continue;
      if (b.expiresAt && b.expiresAt < req.date) continue;
      const deduct = Math.min(b.remaining, days);
      b.remaining -= deduct;
      break;
    }
  });

  return buckets;
}

function calcTotalRemaining(records, lvReqs, empId) {
  const td = today();
  const buckets = calcBucketsWithRemaining(records, lvReqs, empId);
  return buckets.filter(b => !b.expiresAt || b.expiresAt >= td).reduce((s, b) => s + b.remaining, 0);
}

export default function LeaveManager({ emps, leaves, lvReqs, reload }) {
  const [sel, setSel] = useState(emps[0]?.id || "");
  const [form, setForm] = useState({ days: "", note: "", grantedAt: today() });
  const [editBucket, setEditBucket] = useState(null);
  const [roleFilter, setRoleFilter] = useState("");

  const filteredEmps = roleFilter ? emps.filter(e => e.role === roleFilter) : emps;
  const td = today();

  const leave = leaves.find(l => String(l.empId) === String(sel));
  const buckets = calcBucketsWithRemaining(leave?.records, lvReqs, sel).sort((a, b) => a.grantedAt > b.grantedAt ? 1 : -1);
  const totalRem = calcTotalRemaining(leave?.records, lvReqs, sel);
  const totalGranted = buckets.reduce((s, b) => s + Number(b.days || 0), 0);
  const usedDays = (lvReqs || []).filter(r => String(r.empId) === String(sel) && r.status === "approved").reduce((s, r) => s + (r.half ? 0.5 : 1), 0);

  // 付与
  const grant = async () => {
    const d = Number(form.days);
    if (!d || d <= 0 || d % 0.5 !== 0) { alert("付与日数は0.5日単位で入力してください"); return; }
    const grantedAt = form.grantedAt || td;
    const expiresAt = addYears(grantedAt, 2);
    const cur = leave;
    let recs = [];
    try { recs = JSON.parse(cur?.records || "[]"); } catch { recs = []; }
    recs.push({ type: "grant", id: newId(), days: d, grantedAt, expiresAt, note: form.note || "" });
    recs.sort((a, b) => a.grantedAt > b.grantedAt ? 1 : -1);
    const grantsOnly = recs.filter(r => r.type === "grant");
    const data = convertTo({ id: cur?.id || newId(), empId: sel, granted: (Number(cur?.granted || 0) + d), used: Number(cur?.used || 0), records: JSON.stringify(grantsOnly) }, LEAVE_MAP);
    try { await gasSave("有給", data); setForm({ days: "", note: "", grantedAt: td }); await reload(); }
    catch (e) { alert("付与失敗：" + e.message); }
  };

  // バケツ編集保存
  const saveBucket = async () => {
    if (!editBucket) return;
    const d = Number(editBucket.days);
    if (!d || d <= 0 || d % 0.5 !== 0) { alert("付与日数は0.5日単位で入力してください"); return; }
    const cur = leave;
    let recs = [];
    try { recs = JSON.parse(cur?.records || "[]"); } catch { recs = []; }
    const target = recs.find(r => r.type === "grant" && (r.id || r.grantedAt) === editBucket.id);
    if (!target) { alert("付与データが見つかりません"); return; }
    const oldDays = Number(target.days || 0);
    const diff = d - oldDays;
    target.days = d;
    target.grantedAt = editBucket.grantedAt;
    target.expiresAt = editBucket.expiresAt;
    target.note = editBucket.note || "";
    const grantsOnly = recs.filter(r => r.type === "grant").sort((a, b) => a.grantedAt > b.grantedAt ? 1 : -1);
    const newGranted = Math.max(0, Number(cur?.granted || 0) + diff);
    const data = convertTo({ id: cur?.id || newId(), empId: sel, granted: newGranted, used: Number(cur?.used || 0), records: JSON.stringify(grantsOnly) }, LEAVE_MAP);
    try { await gasSave("有給", data); setEditBucket(null); await reload(); }
    catch (e) { alert("保存失敗：" + e.message); }
  };

  // バケツ削除
  const deleteBucket = async bucketId => {
    if (!confirm("この付与レコードを削除しますか？")) return;
    const cur = leave;
    let recs = [];
    try { recs = JSON.parse(cur?.records || "[]"); } catch { recs = []; }
    const target = recs.find(r => r.type === "grant" && (r.id || r.grantedAt) === bucketId);
    if (!target) return;
    const removeDays = Number(target.days || 0);
    const filtered = recs.filter(r => !(r.type === "grant" && (r.id || r.grantedAt) === bucketId));
    const data = convertTo({ id: cur?.id || newId(), empId: sel, granted: Math.max(0, Number(cur?.granted || 0) - removeDays), used: Number(cur?.used || 0), records: JSON.stringify(filtered) }, LEAVE_MAP);
    try { await gasSave("有給", data); await reload(); }
    catch (e) { alert("削除失敗：" + e.message); }
  };

  const roles = [...new Set(emps.map(e => e.role))];

  return (
    <div>
      {/* 従業員選択 */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...iS, width: "auto" }}>
          <option value="">全職種</option>
          {roles.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={sel} onChange={e => setSel(e.target.value)} style={{ ...iS, flex: 1 }}>
          {filteredEmps.map(e => <option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* 左：付与フォーム・残日数 */}
        <div>
          {/* 残日数サマリー */}
          <div style={{ ...crd, padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[["付与合計", totalGranted + "日", ""], ["取得済", usedDays + "日", ""], ["残日数", totalRem + "日", totalRem < 3 ? "#A32D2D" : "#0F6E56"]].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center", padding: "10px 4px", background: "#fef9f3", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c || "#111827" }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 付与フォーム */}
          <div style={{ ...crd, padding: "1rem" }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: "1rem" }}>有給付与</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>付与日数（0.5日単位）</div>
              <input type="number" min="0.5" step="0.5" value={form.days} onChange={e => setForm(p => ({ ...p, days: e.target.value }))} placeholder="例：10" style={iS} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>付与日</div>
              <input type="date" value={form.grantedAt} onChange={e => setForm(p => ({ ...p, grantedAt: e.target.value }))} style={iS} />
            </div>
            <div style={{ marginBottom: 8, padding: "6px 10px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#6b7280" }}>
              有効期限：{form.grantedAt ? addYears(form.grantedAt, 2) : "―"}（2年間）
            </div>
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>備考</div>
              <input type="text" value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="例：2026年度付与" style={iS} />
            </div>
            <button onClick={grant} disabled={!form.days} style={{ ...bP, width: "100%", padding: "10px 0", opacity: form.days ? 1 : 0.4 }}>付与する</button>
          </div>
        </div>

        {/* 右：バケツ一覧 */}
        <div style={{ ...crd, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>付与履歴</div>
          {buckets.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>付与履歴なし</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{["付与日", "日数", "有効期限", "残日数", "備考", "操作"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {buckets.map(b => {
                  const bucketId = b.id || b.grantedAt;
                  const isExpired = b.expiresAt && b.expiresAt < td;
                  const isEditing = editBucket?.id === bucketId;
                  return (
                    <tr key={bucketId} style={{ borderBottom: "0.5px solid #e9ddd0", background: isExpired ? "#fafafa" : "inherit" }}>
                      {isEditing ? (
                        <>
                          <td style={tdS}><input type="date" value={editBucket.grantedAt} onChange={e => setEditBucket(p => ({ ...p, grantedAt: e.target.value }))} style={{ ...iS, padding: "4px 6px", fontSize: 12 }} /></td>
                          <td style={tdS}><input type="number" min="0.5" step="0.5" value={editBucket.days} onChange={e => setEditBucket(p => ({ ...p, days: e.target.value }))} style={{ ...iS, padding: "4px 6px", fontSize: 12, width: 60 }} /></td>
                          <td style={tdS}><input type="date" value={editBucket.expiresAt} onChange={e => setEditBucket(p => ({ ...p, expiresAt: e.target.value }))} style={{ ...iS, padding: "4px 6px", fontSize: 12 }} /></td>
                          <td style={tdS}>―</td>
                          <td style={tdS}><input type="text" value={editBucket.note} onChange={e => setEditBucket(p => ({ ...p, note: e.target.value }))} style={{ ...iS, padding: "4px 6px", fontSize: 12 }} /></td>
                          <td style={tdS}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={saveBucket} style={{ ...bP, padding: "4px 10px", fontSize: 11 }}>保存</button>
                              <button onClick={() => setEditBucket(null)} style={{ ...bS, padding: "4px 10px", fontSize: 11 }}>取消</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...tdS, color: isExpired ? "#9ca3af" : "#111827" }}>{b.grantedAt}</td>
                          <td style={{ ...tdS, fontWeight: 500 }}>{b.days}日</td>
                          <td style={{ ...tdS, color: isExpired ? "#A32D2D" : "#374151" }}>{b.expiresAt}{isExpired && <span style={{ fontSize: 10, marginLeft: 4, color: "#A32D2D" }}>期限切れ</span>}</td>
                          <td style={{ ...tdS, fontWeight: 600, color: b.remaining > 0 ? "#0F6E56" : "#9ca3af" }}>{b.remaining}日</td>
                          <td style={{ ...tdS, color: "#6b7280", fontSize: 12 }}>{b.note || "―"}</td>
                          <td style={tdS}>
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => setEditBucket({ id: bucketId, days: String(b.days), grantedAt: b.grantedAt, expiresAt: b.expiresAt, note: b.note || "" })} style={bE}>編集</button>
                              <button onClick={() => deleteBucket(bucketId)} style={bD}>削除</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
