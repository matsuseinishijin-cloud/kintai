import { useState } from "react";
import { gasSave, gasDelete } from "../api/gas";
import { newId } from "../utils/time";
import { ROLES, convertTo, WEEK_PATTERN_MAP, DOW_KEY_ORDER, DOW_LABELS_MON_START } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const bD = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#FFF0F0", color: "#A32D2D", fontSize: 11, cursor: "pointer" };
const bE = { padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 11, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "8px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500 };
const tdS = { padding: "6px 8px", fontSize: 12, borderBottom: "0.5px solid #e9ddd0", textAlign: "center" };

const emptyForm = { name: "", mon: "off", tue: "off", wed: "off", thu: "off", fri: "off", sat: "off", sun: "off" };

export default function WeekPatternManager({ weekPatterns, shiftDefList, reload }) {
  const [activeDept, setActiveDept] = useState(ROLES[0]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const deptDefs = (shiftDefList || []).filter(d => d.dept === activeDept).sort((a, b) => (a.order || 999) - (b.order || 999));
  const deptPatterns = (weekPatterns || []).filter(p => p.dept === activeDept);

  const defLabel = key => {
    if (!key || key === "off") return { label: "休", color: "#F5F9FE", tc: "#9ca3af" };
    const d = deptDefs.find(x => x.key === key);
    return d ? { label: d.label, color: d.color, tc: d.tc } : { label: key, color: "#F5F9FE", tc: "#6b7280" };
  };

  const startEdit = p => {
    setEditId(p.id);
    setForm({ name: p.name, mon: p.mon || "off", tue: p.tue || "off", wed: p.wed || "off", thu: p.thu || "off", fri: p.fri || "off", sat: p.sat || "off", sun: p.sun || "off" });
  };
  const resetForm = () => { setEditId(null); setForm(emptyForm); };

  const save = async () => {
    if (!form.name) { alert("パターン名を入力してください"); return; }
    setSaving(true);
    try {
      const data = convertTo({ id: editId || newId(), dept: activeDept, ...form }, WEEK_PATTERN_MAP);
      await gasSave("週間パターン", data);
      resetForm();
      await reload();
    } catch (e) { alert("保存失敗：" + e.message); }
    setSaving(false);
  };

  const del = async p => {
    if (!confirm(`パターン「${p.name}」を削除しますか？`)) return;
    try { await gasDelete("週間パターン", p.id); await reload(); }
    catch (e) { alert("削除失敗：" + e.message); }
  };

  return (
    <div>
      {/* 部署タブ */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: "1rem" }}>
        {ROLES.map(r => (
          <button key={r} onClick={() => { setActiveDept(r); resetForm(); }}
            style={{ padding: "6px 16px", borderRadius: 8, border: activeDept === r ? "2px solid #1251a3" : "1px solid #d1d5db", background: activeDept === r ? "#E6F1FB" : "#fff", color: activeDept === r ? "#1251a3" : "#6b7280", fontSize: 12, fontWeight: activeDept === r ? 600 : 400, cursor: "pointer" }}>
            {r}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: "1rem", padding: "8px 12px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#374151" }}>
        曜日ごとにシフトを組み合わせたテンプレートを作成できます。シフト画面で「パターン適用」から、指定した従業員・週にまとめて反映できます。
      </div>

      {/* 登録・編集フォーム */}
      <div style={{ ...crd, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: "1rem" }}>{editId ? "編集" : "新規登録"}（{activeDept}）</div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>パターン名</div>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="例：週5日勤務パターン" style={{ ...iS, maxWidth: 300 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {DOW_KEY_ORDER.map((dk, i) => (
            <div key={dk}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3, textAlign: "center" }}>{DOW_LABELS_MON_START[i]}</div>
              <select value={form[dk]} onChange={e => setForm(p => ({ ...p, [dk]: e.target.value }))} style={{ ...iS, fontSize: 12, padding: "6px 4px" }}>
                <option value="off">休</option>
                {deptDefs.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: "1rem" }}>
          <button onClick={save} disabled={saving} style={{ ...bP, opacity: saving ? 0.5 : 1 }}>{saving ? "保存中..." : (editId ? "更新" : "登録")}</button>
          {editId && <button onClick={resetForm} style={bS}>キャンセル</button>}
        </div>
      </div>

      {/* 一覧 */}
      <div style={{ ...crd, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>
          {activeDept}のパターン一覧 <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>{deptPatterns.length}件</span>
        </div>
        {deptPatterns.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>まだパターンがありません</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr><th style={{ ...thS, textAlign: "left" }}>パターン名</th>{DOW_LABELS_MON_START.map(d => <th key={d} style={thS}>{d}</th>)}<th style={thS}>操作</th></tr></thead>
            <tbody>
              {deptPatterns.map(p => (
                <tr key={p.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                  <td style={{ ...tdS, textAlign: "left", fontWeight: 600 }}>{p.name}</td>
                  {DOW_KEY_ORDER.map(dk => {
                    const dl = defLabel(p[dk]);
                    return <td key={dk} style={tdS}><span style={{ padding: "2px 6px", borderRadius: 4, background: dl.color, color: dl.tc, fontSize: 11 }}>{dl.label}</span></td>;
                  })}
                  <td style={tdS}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      <button onClick={() => startEdit(p)} style={bE}>編集</button>
                      <button onClick={() => del(p)} style={bD}>削除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
