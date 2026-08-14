import { useState } from "react";
import { ROLES } from "../constants";
import TimecardSeishainStd from "./TimecardSeishainStd";
import TimecardSeishainFixed from "./TimecardSeishainFixed";
import TimecardPartStd from "./TimecardPartStd";
import TimecardPTpart from "./TimecardPTpart";
import TimecardNursepart from "./TimecardNursepart";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "auto" };

export default function TimecardAdmin({ emps, shifts, punches, shiftDefs, lvReqs, timeTransferReqs, otReqs }) {
  const [roleFilter, setRoleFilter] = useState("");
  const [empId, setEmpId] = useState(emps[0]?.id || "");

  const filteredEmps = emps.filter(e => !roleFilter || e.role === roleFilter);
  const emp = filteredEmps.find(e => String(e.id) === String(empId)) || filteredEmps[0];

  const onRoleChange = r => {
    setRoleFilter(r);
    const first = (r ? emps.filter(e => e.role === r) : emps)[0];
    if (first) setEmpId(first.id);
  };

  if (!emp) {
    return <div style={{ ...crd, padding: "2rem", color: "#6b7280", textAlign: "center" }}>該当する従業員がいません</div>;
  }

  // App.jsx の従業員本人向けタイムカード振り分けと同じロジック
  const isFixed = (emp.role === "理学療法士" || emp.role === "AT") && emp.type === "正社員";
  const isPTpart = emp.role === "理学療法士" && emp.type === "パート";
  const isNursepart = emp.role === "看護師" && emp.type === "パート";
  const isPartStd = emp.type === "パート" && !isPTpart && !isNursepart;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <select value={roleFilter} onChange={e => onRoleChange(e.target.value)} style={iS}>
          <option value="">全職種</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={emp.id} onChange={e => setEmpId(e.target.value)} style={iS}>
          {filteredEmps.map(e => <option key={e.id} value={e.id}>{e.name}（{e.role}・{e.type}）</option>)}
        </select>
      </div>

      {isFixed && <TimecardSeishainFixed emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} timeTransferReqs={timeTransferReqs} isAdmin />}
      {!isFixed && isPTpart && <TimecardPTpart emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} otReqs={otReqs} />}
      {!isFixed && !isPTpart && isNursepart && <TimecardNursepart emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />}
      {!isFixed && !isPTpart && !isNursepart && isPartStd && <TimecardPartStd emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} />}
      {!isFixed && !isPTpart && !isNursepart && !isPartStd && <TimecardSeishainStd emp={emp} shifts={shifts} punches={punches} shiftDefs={shiftDefs} lvReqs={lvReqs} isAdmin />}
    </div>
  );
}
