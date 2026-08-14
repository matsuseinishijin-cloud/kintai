import { useState } from "react";
import { gasSave, gasDelete } from "../api/gas";
import { newId } from "../utils/time";
import { ROLES, convertTo } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const bD = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#FFF0F0", color: "#A32D2D", fontSize: 11, cursor: "pointer" };
const bE = { padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 11, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "8px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500 };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

const SHIFTDEF_MAP = { id: "id", "キー": "key", "名前": "label", "開始": "start", "終了": "end", "色": "color", "文字色": "tc", "部署": "dept", "順番": "order", "休憩": "breakMin" };

// 色プリセット（背景色・文字色のペア）
const COLOR_PRESETS = [
  ["#E6F1FB", "#185FA5"], ["#EAF3DE", "#3B6D11"], ["#FAEEDA", "#854F0B"],
  ["#E1F5EE", "#0F6E56"], ["#FAECE7", "#993C1D"], ["#EEEDFE", "#3C3489"],
  ["#FEF9E7", "#7D6608"], ["#F5EEF8", "#6C3483"], ["#FDEDEC", "#922B21"],
  ["#F5F9FE", "#6b7280"],
];

const emptyForm = { key: "", label: "", start: "", end: "", color: "#E6F1FB", tc: "#185FA5", breakMin: "60" };

export default function ShiftDefManager({ shiftDefList, reload }) {
  const [activeDept, setActiveDept] = useState(ROLES[0]);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  const deptDefs = (shiftDefList || [])
    .filter(d => d.dept === activeDept)
    .sort((a, b) => (a.order || 999) - (b.order || 999));

  const startEdit = d => {
    setEditId(d.id);
    setForm({ key: d.key, label: d.label, start: d.start || "", end: d.end || "", color: d.color, tc: d.tc, breakMin: String(d.breakMin ?? "60") });
  };
  const resetForm = () => { setEditId(null); setForm(emptyForm); };

  const save = async () => {
    if (!form.key || !form.label) { alert("キーと名前は必須です"); return; }
    // 同一部署内でのキー重複チェック（新規追加時、または編集で既存と別のキーに変更する場合）
    const dup = deptDefs.find(d => d.key === form.key && d.id !== editId);
    if (dup) { alert(`このキーは既に「${dup.label}」として使われています。別のキーにしてください。`); return; }
    setSaving(true);
    try {
      const nextOrder = editId ? deptDefs.find(d => d.id === editId)?.order : (Math.max(0, ...deptDefs.map(d => d.order || 0)) + 1);
      const data = convertTo({
        id: editId || newId(), key: form.key, label: form.label,
        start: form.start || "", end: form.end || "",
        color: form.color, tc: form.tc, dept: activeDept,
        order: nextOrder, breakMin: form.breakMin || "60",
      }, SHIFTDEF_MAP);
      await gasSave("シフト定義", data);
      resetForm();
      await reload();
    } catch (e) { alert("保存失敗：" + e.message); }
    setSaving(false);
  };

  const del = async d => {
    if (d.key === "off") { alert("「休日」は削除できません"); return; }
    if (!confirm(`「${d.label}」を削除しますか？\n既にこのシフトが割り当てられている日付には影響しませんが、選択肢から消えます。`)) return;
    try {
      await gasDelete("シフト定義", d.id);
      await reload();
    } catch (e) { alert("削除失敗：" + e.message); }
  };

  const move = async (d, dir) => {
    const idx = deptDefs.findIndex(x => x.id === d.id);
    const target = deptDefs[idx + dir];
    if (!target) return;
    try {
      await gasSave("シフト定義", convertTo({ id: d.id, key: d.key, label: d.label, start: d.start || "", end: d.end || "", color: d.color, tc: d.tc, dept: d.dept, order: target.order, breakMin: d.breakMin }, SHIFTDEF_MAP));
      await gasSave("シフト定義", convertTo({ id: target.id, key: target.key, label: target.label, start: target.start || "", end: target.end || "", color: target.color, tc: target.tc, dept: target.dept, order: d.order, breakMin: target.breakMin }, SHIFTDEF_MAP));
      await reload();
    } catch (e) { alert("並び替え失敗：" + e.message); }
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

      {/* 登録・編集フォーム */}
      <div style={{ ...crd, padding: "1rem 1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: "1rem" }}>{editId ? "編集" : "新規登録"}（{activeDept}）</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>キー（識別子）</div>
            <input value={form.key} onChange={e => setForm(p => ({ ...p, key: e.target.value }))} placeholder="例：A" style={iS} disabled={!!editId} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>名前</div>
            <input value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} placeholder="例：日勤" style={iS} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>開始時刻（休みの場合は空欄）</div>
            <input type="time" value={form.start} onChange={e => setForm(p => ({ ...p, start: e.target.value }))} style={iS} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>終了時刻</div>
            <input type="time" value={form.end} onChange={e => setForm(p => ({ ...p, end: e.target.value }))} style={iS} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>休憩（分）</div>
            <input type="number" min="0" value={form.breakMin} onChange={e => setForm(p => ({ ...p, breakMin: e.target.value }))} style={iS} />
          </div>
          <div style={{ gridColumn: "span 3" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 3 }}>色</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLOR_PRESETS.map(([bg, tc]) => (
                <button key={bg} onClick={() => setForm(p => ({ ...p, color: bg, tc }))}
                  style={{ width: 28, height: 28, borderRadius: 6, background: bg, border: form.color === bg ? "2px solid #1251a3" : "1px solid #d1d5db", cursor: "pointer" }} />
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 10, padding: "6px 10px", borderRadius: 6, display: "inline-block", background: form.color, color: form.tc, fontSize: 12, fontWeight: 600 }}>
          プレビュー：{form.label || "（名前未入力）"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ ...bP, opacity: saving ? 0.5 : 1 }}>{saving ? "保存中..." : (editId ? "更新" : "登録")}</button>
          {editId && <button onClick={resetForm} style={bS}>キャンセル</button>}
        </div>
      </div>

      {/* 一覧 */}
      <div style={{ ...crd, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>
          {activeDept}のシフト定義 <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>{deptDefs.length}件</span>
        </div>
        {deptDefs.length === 0 ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>まだ登録がありません</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["並び", "キー", "名前", "時間", "休憩", "操作"].map(h => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {deptDefs.map((d, i) => (
                <tr key={d.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                  <td style={tdS}>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={() => move(d, -1)} disabled={i === 0} style={{ ...bE, padding: "2px 6px", opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                      <button onClick={() => move(d, 1)} disabled={i === deptDefs.length - 1} style={{ ...bE, padding: "2px 6px", opacity: i === deptDefs.length - 1 ? 0.3 : 1 }}>↓</button>
                    </div>
                  </td>
                  <td style={tdS}><span style={{ padding: "2px 8px", borderRadius: 6, background: d.color, color: d.tc, fontWeight: 600 }}>{d.key}</span></td>
                  <td style={{ ...tdS, fontWeight: 500 }}>{d.label}</td>
                  <td style={{ ...tdS, color: "#6b7280" }}>{d.start ? `${d.start}〜${d.end}` : "（休日扱い）"}</td>
                  <td style={{ ...tdS, color: "#6b7280" }}>{d.breakMin}分</td>
                  <td style={tdS}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => startEdit(d)} style={bE}>編集</button>
                      {d.key !== "off" && <button onClick={() => del(d)} style={bD}>削除</button>}
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
