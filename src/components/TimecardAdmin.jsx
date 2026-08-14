import { useState } from "react";
import { gasSaveBatch } from "../api/gas";
import { newId } from "../utils/time";
import { ROLES, BREAK_MIN } from "../constants";
import TimecardSeishainStd from "./TimecardSeishainStd";
import TimecardSeishainFixed from "./TimecardSeishainFixed";
import TimecardPartStd from "./TimecardPartStd";
import TimecardPTpart from "./TimecardPTpart";
import TimecardNursepart from "./TimecardNursepart";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "auto" };
const bP = { padding: "8px 16px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, cursor: "pointer" };

export default function TimecardAdmin({ emps, shifts, punches, shiftDefs, lvReqs, timeTransferReqs, otReqs, reload }) {
  const [roleFilter, setRoleFilter] = useState("");
  const [empId, setEmpId] = useState(emps[0]?.id || "");
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState({}); // { date: { in, out } }
  const [saving, setSaving] = useState(false);

  const filteredEmps = emps.filter(e => !roleFilter || e.role === roleFilter);
  const emp = filteredEmps.find(e => String(e.id) === String(empId)) || filteredEmps[0];

  const onRoleChange = r => {
    setRoleFilter(r);
    const first = (r ? emps.filter(e => e.role === r) : emps)[0];
    if (first) setEmpId(first.id);
  };

  const onEmpChange = id => {
    if (Object.keys(edits).length > 0 && !confirm("未保存の変更は破棄されます。よろしいですか？")) return;
    setEdits({});
    setEmpId(id);
  };

  const onEdit = (ds, field, val) => {
    setEdits(prev => ({ ...prev, [ds]: { ...prev[ds], [field]: val } }));
  };

  const editedCount = Object.keys(edits).length;

  const toggleEditMode = () => {
    if (editMode && editedCount > 0 && !confirm("未保存の変更は破棄されます。よろしいですか？")) return;
    setEdits({});
    setEditMode(m => !m);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const dataArray = Object.entries(edits).map(([ds, v]) => {
        const existing = punches.find(p => String(p.empId) === String(emp.id) && p.date === ds);
        return {
          id: existing?.id || newId(), "従業員id": emp.id, "日付": ds,
          "出勤": v.in ?? existing?.in ?? "", "退勤": v.out ?? existing?.out ?? "",
          "休憩": existing?.break != null ? existing.break : BREAK_MIN, "補正済": true,
        };
      });
      await gasSaveBatch("打刻", dataArray);
      setEdits({});
      await reload();
    } catch (e) { alert("保存失敗：" + e.message); }
    setSaving(false);
  };

  if (!emp) {
    return <div style={{ ...crd, padding: "2rem", color: "#6b7280", textAlign: "center" }}>該当する従業員がいません</div>;
  }

  // App.jsx の従業員本人向けタイムカード振り分けと同じロジック
  const isFixed = (emp.role === "理学療法士" || emp.role === "AT") && emp.type === "正社員";
  const isPTpart = emp.role === "理学療法士" && emp.type === "パート";
  const isNursepart = emp.role === "看護師" && emp.type === "パート";
  const isPartStd = emp.type === "パート" && !isPTpart && !isNursepart;

  const cardProps = { emp, shifts, punches, shiftDefs, lvReqs, editMode, edits, onEdit };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <select value={roleFilter} onChange={e => onRoleChange(e.target.value)} style={iS}>
          <option value="">全職種</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={emp.id} onChange={e => onEmpChange(e.target.value)} style={iS}>
          {filteredEmps.map(e => <option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}
        </select>
        <button onClick={toggleEditMode} style={{ ...bS, marginLeft: "auto", background: editMode ? "#FFF0F0" : "#fff", color: editMode ? "#A32D2D" : "#111827", borderColor: editMode ? "#F09595" : "#d1d5db" }}>
          {editMode ? "編集を終了" : "✏️ 打刻を編集"}
        </button>
        {editMode && (
          <button onClick={saveAll} disabled={editedCount === 0 || saving}
            style={{ ...bP, opacity: editedCount === 0 || saving ? 0.4 : 1 }}>
            {saving ? "保存中..." : `変更を保存（${editedCount}件）`}
          </button>
        )}
      </div>

      {editMode && (
        <div style={{ marginBottom: "1rem", padding: "8px 12px", background: "#FFF8E1", border: "1px solid #F59E0B", borderRadius: 8, fontSize: 12, color: "#854F0B" }}>
          編集モード中：下のタイムカード表の「出勤」「退勤」欄に直接時刻を入力できます。入力した日はオレンジ色でハイライトされます。編集が終わったら「変更を保存」を押してください。
        </div>
      )}

      {isFixed && <TimecardSeishainFixed {...cardProps} timeTransferReqs={timeTransferReqs} isAdmin />}
      {!isFixed && isPTpart && <TimecardPTpart {...cardProps} otReqs={otReqs} />}
      {!isFixed && !isPTpart && isNursepart && <TimecardNursepart {...cardProps} />}
      {!isFixed && !isPTpart && !isNursepart && isPartStd && <TimecardPartStd {...cardProps} />}
      {!isFixed && !isPTpart && !isNursepart && !isPartStd && <TimecardSeishainStd {...cardProps} isAdmin />}
    </div>
  );
}
