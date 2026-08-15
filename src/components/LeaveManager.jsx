import { useState } from "react";
import { gasSave, gasDelete } from "../api/gas";
import { today, newId } from "../utils/time";
import { convertTo, isHalfLeave, LEAVE_MAP, isActiveEmp, sortEmps } from "../constants";

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
    const days = isHalfLeave(req.half) ? 0.5 : 1;
    for (const b of buckets) {
      if (b.remaining <= 0) continue;
      if (b.grantedAt > req.date) continue; // 付与日が取得日より後のバケツは対象外
      if (b.expiresAt && b.expiresAt < req.date) continue;
      const deduct = Math.min(b.remaining, days);
      b.remaining -= deduct;
      break;
    }
  });

  return buckets;
}

// 残日数の合計（マイナスも許容：不足分を承認した場合に負の値で正しく表示するため）
function calcTotalRemaining(records, lvReqs, empId) {
  const td = today();
  let recs = [];
  try { recs = JSON.parse(records || "[]"); } catch { recs = []; }
  const totalGranted = recs.filter(r => r.type === "grant" && (!r.expiresAt || r.expiresAt >= td)).reduce((s, r) => s + Number(r.days || 0), 0);
  const used = (lvReqs || []).filter(r => String(r.empId) === String(empId) && r.status === "approved")
    .reduce((s, r) => s + (isHalfLeave(r.half) ? 0.5 : 1), 0);
  return totalGranted - used;
}

export default function LeaveManager({ emps, leaves, lvReqs, designatedHolidays, reload }) {
  const [sel, setSel] = useState(emps[0]?.id || "");
  const [form, setForm] = useState({ days: "", note: "", grantedAt: today() });
  const [editBucket, setEditBucket] = useState(null);
  const [roleFilter, setRoleFilter] = useState("");

  const filteredEmps = sortEmps(roleFilter ? emps.filter(e => e.role === roleFilter) : emps);
  const td = today();

  const leave = leaves.find(l => String(l.empId) === String(sel));
  const buckets = calcBucketsWithRemaining(leave?.records, lvReqs, sel).sort((a, b) => a.grantedAt > b.grantedAt ? 1 : -1);
  const totalRem = calcTotalRemaining(leave?.records, lvReqs, sel);
  const totalGranted = buckets.reduce((s, b) => s + Number(b.days || 0), 0);
  const usedDays = (lvReqs || []).filter(r => String(r.empId) === String(sel) && r.status === "approved").reduce((s, r) => s + (isHalfLeave(r.half) ? 0.5 : 1), 0);
  const displayRem = totalRem; // 期限切れバケツを除外した正しい残日数（totalGranted-usedDaysは期限切れも含んでしまうため使わない）

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
              {[["付与合計", totalGranted + "日", ""], ["取得済", usedDays + "日", ""], ["残日数", displayRem.toFixed(1) + "日", displayRem < 3 ? "#A32D2D" : "#0F6E56"]].map(([l, v, c]) => (
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

      {/* 取得履歴 */}
      <div style={{ ...crd, overflow: "hidden", marginTop: "1rem" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>取得履歴</div>
        {(lvReqs || []).filter(r => String(r.empId) === String(sel)).length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>取得履歴なし</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["日付", "区分", "時間帯", "状態"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {(lvReqs || []).filter(r => String(r.empId) === String(sel)).sort((a, b) => b.date > a.date ? 1 : -1).map(r => (
                <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                  <td style={tdS}>{r.date}</td>
                  <td style={tdS}>{r.reason === "指定休" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EDE9FE", color: "#7C3AED" }}>指定休</span> : isHalfLeave(r.half) ? "半日（0.5日）" : "全日（1日）"}</td>
                  <td style={{ ...tdS, color: "#6b7280", fontSize: 12 }}>{r.leaveStart && r.leaveEnd ? `${r.leaveStart}〜${r.leaveEnd}` : "―"}</td>
                  <td style={tdS}>
                    {r.status === "pending" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span>
                      : r.status === "approved" ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span>
                        : <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 指定休設定（正社員のみ対象） */}
      <DesignatedHolidayManager designatedHolidays={designatedHolidays} emps={emps} lvReqs={lvReqs} reload={reload} />
    </div>
  );
}

// ── 指定休設定 ─────────────────────────────────────────────────────────────────
function DesignatedHolidayManager({ designatedHolidays, emps, lvReqs, reload }) {
  const [form, setForm] = useState({ date: "", memo: "" });
  const [sub, setSub] = useState(false);
  const [selDh, setSelDh] = useState(null); // 選択中の指定休
  const [excluded, setExcluded] = useState(new Set()); // 除外スタッフ
  const [granting, setGranting] = useState(false);
  const DH_MAP = { id: "id", "日付": "date", "メモ": "memo" };
  const LV_MAP = { id:"id","従業員id":"empId","日付":"date","区分":"half","理由":"reason","状態":"status","有休開始":"leaveStart","有休終了":"leaveEnd" };

  const seishainEmps = sortEmps(emps.filter(e => e.type === "正社員" && isActiveEmp(e)));

  const add = async () => {
    if (!form.date) return;
    try {
      await gasSave("指定休", convertTo({ id: newId(), date: form.date, memo: form.memo || "" }, DH_MAP));
      setForm({ date: "", memo: "" });
      setSub(true); setTimeout(() => setSub(false), 2000);
      await reload();
    } catch (e) { alert("追加失敗：" + e.message); }
  };

  const del = async id => {
    if (!confirm("この指定休を削除しますか？")) return;
    try { await gasDelete("指定休", id); await reload(); }
    catch (e) { alert("削除失敗：" + e.message); }
  };

  // 一括付与
  const grantAll = async () => {
    if (!selDh) return;
    const targets = seishainEmps.filter(e => !excluded.has(e.id));
    if (targets.length === 0) { alert("付与対象のスタッフがいません"); return; }
    if (!confirm(`${selDh.date} の指定休を${targets.length}名に付与しますか？`)) return;
    setGranting(true);
    try {
      for (const emp of targets) {
        // 既に申請があれば重複しない
        const exists = (lvReqs || []).some(r => String(r.empId) === String(emp.id) && r.date === selDh.date && r.reason === "指定休");
        if (exists) continue;
        const data = convertTo({ id: newId(), empId: emp.id, date: selDh.date, half: "1日", leaveStart: "", leaveEnd: "", reason: "指定休", status: "approved", createdAt: new Date().toISOString() }, LV_MAP);
        await gasSave("有給申請", data);
      }
      alert(`${targets.length}名に指定休を付与しました`);
      setExcluded(new Set());
      await reload();
    } catch (e) { alert("付与失敗：" + e.message); }
    setGranting(false);
  };

  const sorted = [...(designatedHolidays || [])].sort((a, b) => a.date > b.date ? 1 : -1);

  // 選択中の指定休の付与済みスタッフ
  const grantedEmps = selDh ? (lvReqs || []).filter(r => r.date === selDh.date && r.reason === "指定休" && r.status === "approved").map(r => r.empId) : [];

  return (
    <div style={{ ...crd, padding: "1.25rem", marginTop: "1rem" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: "1rem", color: "#7C3AED" }}>指定休設定（正社員のみ対象）</div>

      {/* 追加フォーム */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, marginBottom: "1rem", alignItems: "end" }}>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>対象日</div>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} style={iS} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>メモ（任意）</div>
          <input type="text" value={form.memo} onChange={e => setForm(p => ({ ...p, memo: e.target.value }))} placeholder="例：夏季休暇" style={iS} />
        </div>
        <button onClick={add} disabled={!form.date} style={{ ...bP, padding: "8px 16px", opacity: form.date ? 1 : 0.4 }}>追加</button>
      </div>
      {sub && <div style={{ marginBottom: 10, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>追加しました。</div>}

      {sorted.length === 0 ? (
        <div style={{ padding: "1rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>指定休が設定されていません</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {/* 左：指定休一覧 */}
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>設定済み指定休（クリックで選択）</div>
            {sorted.map(d => (
              <div key={d.id} onClick={() => { setSelDh(d); setExcluded(new Set()); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, marginBottom: 4, background: selDh?.id === d.id ? "#EDE9FE" : "#fef9f3", border: selDh?.id === d.id ? "1px solid #7C3AED" : "1px solid transparent", cursor: "pointer" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED" }}>{d.date}</span>
                  {d.memo && <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>{d.memo}</span>}
                  {grantedEmps.length > 0 && d.id === selDh?.id && <span style={{ fontSize: 11, color: "#3B6D11", marginLeft: 8 }}>付与済{grantedEmps.length}名</span>}
                </div>
                <button onClick={e => { e.stopPropagation(); del(d.id); }} style={{ padding: "2px 8px", borderRadius: 6, border: "none", background: "#FFF0F0", color: "#A32D2D", fontSize: 11, cursor: "pointer" }}>削除</button>
              </div>
            ))}
          </div>

          {/* 右：除外設定・一括付与 */}
          {selDh && (
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>{selDh.date} の対象スタッフ</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "1rem", maxHeight: 200, overflowY: "auto" }}>
                {seishainEmps.map(emp => {
                  const isGranted = grantedEmps.includes(String(emp.id));
                  const isExcluded = excluded.has(emp.id);
                  return (
                    <label key={emp.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: isExcluded ? "#FFF0F0" : isGranted ? "#EAF3DE" : "#fef9f3", cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={!isExcluded} onChange={e => setExcluded(prev => { const n = new Set(prev); e.target.checked ? n.delete(emp.id) : n.add(emp.id); return n; })} style={{ width: 14, height: 14 }} />
                      <span style={{ flex: 1 }}>{emp.name}</span>
                      <span style={{ fontSize: 11, color: "#6b7280" }}>{emp.role}</span>
                      {isGranted && <span style={{ fontSize: 10, color: "#3B6D11" }}>付与済</span>}
                      {isExcluded && <span style={{ fontSize: 10, color: "#A32D2D" }}>除外</span>}
                    </label>
                  );
                })}
              </div>
              <button onClick={grantAll} disabled={granting}
                style={{ ...bP, width: "100%", padding: "10px 0", background: "#7C3AED", opacity: granting ? 0.5 : 1 }}>
                {granting ? "付与中..." : `一括付与（${seishainEmps.length - excluded.size}名）`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
