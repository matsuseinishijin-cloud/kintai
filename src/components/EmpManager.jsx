import { useState } from "react";
import { gasSave, gasDelete } from "../api/gas";
import { newId } from "../utils/time";
import { ROLES, REHA_LEAD_ROLES, SHIFT_LEAD_ROLES, EMP_MAP, PW_MAP, EMP_ID_PREFIX, convertTo } from "../constants";

const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const bD = { padding: "6px 12px", borderRadius: 6, border: "none", background: "#FFF0F0", color: "#A32D2D", fontSize: 12, cursor: "pointer" };
const bE = { padding: "6px 12px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 12, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "8px 12px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500, whiteSpace: "nowrap" };
const tdS = { padding: "8px 12px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

const isLeadVal = v => v === "true" || v === true || v === "TRUE" || v === 1;
const FIXED_OT_ROLES = ["理学療法士", "AT"];

// 社員番号を自動採番
function genEmpId(emps, role, type) {
  const prefix = EMP_ID_PREFIX[`${role}_${type}`];
  if (!prefix) return "";
  const existing = emps
    .filter(e => String(e.id).startsWith(String(prefix)))
    .map(e => Number(e.id))
    .filter(n => !isNaN(n));
  const max = existing.length > 0 ? Math.max(...existing) : prefix * 100;
  return String(max + 1);
}

export default function EmpManager({ emps, passwords, reload }) {
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: "医療事務", type: "正社員", isLead: false, weeklyLimit: "", fixedOTLimit: "" });
  const [pwEdit, setPwEdit] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [filter, setFilter] = useState({ role: "", type: "" });

  const filteredEmps = emps.filter(e =>
    (!filter.role || e.role === filter.role) &&
    (!filter.type || e.type === filter.type)
  );

  const startNew = () => {
    setEditId(null);
    setForm({ name: "", role: "医療事務", type: "正社員", isLead: false, weeklyLimit: "", fixedOTLimit: "" });
    setShowForm(true);
  };

  const startEdit = e => {
    setEditId(e.id);
    setForm({ name: e.name, role: e.role, type: e.type, isLead: isLeadVal(e.isLead), weeklyLimit: e.weeklyLimit || "", fixedOTLimit: e.fixedOTLimit || "" });
    setShowForm(true);
  };

  const cancel = () => { setEditId(null); setShowForm(false); };

  const save = async () => {
    if (!form.name) { alert("氏名を入力してください"); return; }
    try {
      const empId = editId || genEmpId(emps, form.role, form.type);
      const data = convertTo({ id: empId, name: form.name, role: form.role, type: form.type, isLead: form.isLead ? "true" : "false", weeklyLimit: form.weeklyLimit || "", fixedOTLimit: form.fixedOTLimit || "" }, EMP_MAP);
      await gasSave("従業員", data);
      // 新規の場合はパスワードも設定（初期値=社員番号）
      if (!editId) {
        const pwData = convertTo({ id: newId(), empId: empId, password: empId }, PW_MAP);
        await gasSave("パスワード", pwData);
      }
      cancel();
      await reload();
    } catch (e) { alert("保存失敗：" + e.message); }
  };

  const del = async emp => {
    if (!confirm(`${emp.name}を削除しますか？`)) return;
    try {
      await gasDelete("従業員", emp.id);
      await reload();
    } catch (e) { alert("削除失敗：" + e.message); }
  };

  const savePw = async () => {
    if (!newPw || newPw.length !== 4) { alert("4桁のパスワードを入力してください"); return; }
    try {
      const pwRec = passwords.find(p => p.empId === pwEdit);
      const data = convertTo({ id: pwRec?.id || newId(), empId: pwEdit, password: newPw }, PW_MAP);
      await gasSave("パスワード", data);
      setPwEdit(null); setNewPw("");
      await reload();
    } catch (e) { alert("パスワード変更失敗：" + e.message); }
  };

  const needsFixedOT = FIXED_OT_ROLES.includes(form.role) && form.type === "正社員";
  const needsWeeklyLimit = form.type === "正社員";

  return (
    <div>
      {/* フィルター・追加ボタン */}
      <div style={{ display: "flex", gap: 8, marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
        <select value={filter.role} onChange={e => setFilter(p => ({ ...p, role: e.target.value }))} style={{ ...iS, width: "auto" }}>
          <option value="">全職種</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={filter.type} onChange={e => setFilter(p => ({ ...p, type: e.target.value }))} style={{ ...iS, width: "auto" }}>
          <option value="">全雇用形態</option>
          <option>正社員</option>
          <option>パート</option>
        </select>
        <button onClick={startNew} style={{ ...bP, marginLeft: "auto" }}>＋ 新規追加</button>
      </div>

      {/* 追加・編集フォーム */}
      {showForm && (
        <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>{editId ? "従業員編集" : "新規従業員追加"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>氏名</div>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="例：山田 太郎" style={iS} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>職種</div>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value, fixedOTLimit: "" }))} style={iS}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>雇用形態</div>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} style={iS}>
                <option>正社員</option>
                <option>パート</option>
              </select>
            </div>
            {needsWeeklyLimit && (
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>週所定労働時間（h）</div>
                <input type="number" min="1" max="60" value={form.weeklyLimit} onChange={e => setForm(p => ({ ...p, weeklyLimit: e.target.value }))} placeholder="例：40" style={iS} />
              </div>
            )}
            {needsFixedOT && (
              <div>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>固定残業時間</div>
                <select value={form.fixedOTLimit} onChange={e => setForm(p => ({ ...p, fixedOTLimit: e.target.value }))} style={iS}>
                  <option value="">選択してください</option>
                  <option value="20">20時間</option>
                  <option value="16">16時間</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={!!form.isLead} onChange={e => setForm(p => ({ ...p, isLead: e.target.checked }))} style={{ width: 16, height: 16 }} />
              ★ 責任者
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {REHA_LEAD_ROLES.includes(form.role) ? "（リハ科責任者）" : SHIFT_LEAD_ROLES.includes(form.role) ? "（シフト責任者）" : ""}
              </span>
            </label>
          </div>
          {!editId && <div style={{ marginBottom: 12, padding: "8px 12px", background: "#F5F9FE", borderRadius: 8, fontSize: 12, color: "#6b7280" }}>
            社員番号は自動採番されます。初期パスワードは社員番号です。
          </div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={save} style={{ ...bP, padding: "10px 24px" }}>保存</button>
            <button onClick={cancel} style={bS}>キャンセル</button>
          </div>
        </div>
      )}

      {/* パスワード変更フォーム */}
      {pwEdit && (
        <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>パスワード変更：{emps.find(e => e.id === pwEdit)?.name}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="text" maxLength={4} value={newPw} onChange={e => setNewPw(e.target.value.replace(/\D/g, ""))} placeholder="4桁の数字" style={{ ...iS, width: 160, letterSpacing: "0.3em", textAlign: "center" }} />
            <button onClick={savePw} style={{ ...bP, padding: "8px 20px" }}>変更</button>
            <button onClick={() => { setPwEdit(null); setNewPw(""); }} style={bS}>キャンセル</button>
          </div>
        </div>
      )}

      {/* 従業員一覧 */}
      <div style={{ ...crd, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>
          従業員一覧（{filteredEmps.length}名）
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{["社員番号", "氏名", "職種", "雇用形態", "週所定", "固定残業", "責任者", "操作"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {filteredEmps.map(emp => (
              <tr key={emp.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                <td style={{ ...tdS, color: "#6b7280" }}>{emp.id}</td>
                <td style={{ ...tdS, fontWeight: 500 }}>{emp.name}</td>
                <td style={tdS}>{emp.role}</td>
                <td style={tdS}>{emp.type}</td>
                <td style={{ ...tdS, color: emp.weeklyLimit ? "#1251a3" : "#9ca3af" }}>{emp.weeklyLimit ? emp.weeklyLimit + "h" : "―"}</td>
                <td style={{ ...tdS, color: emp.fixedOTLimit ? "#854F0B" : "#9ca3af" }}>{emp.fixedOTLimit ? emp.fixedOTLimit + "h" : "―"}</td>
                <td style={tdS}>{isLeadVal(emp.isLead) ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>★責任者</span> : "―"}</td>
                <td style={tdS}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => startEdit(emp)} style={bE}>編集</button>
                    <button onClick={() => { setPwEdit(emp.id); setNewPw(""); }} style={bE}>PW変更</button>
                    <button onClick={() => del(emp)} style={bD}>削除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
