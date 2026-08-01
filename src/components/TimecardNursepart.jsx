import { useState } from "react";
import { toMin, toHStr, DOW_JP, getPeriodRange, getPeriodDays, today } from "../utils/time";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const bS = { padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, cursor: "pointer" };
const thS = { padding: "7px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 400, whiteSpace: "nowrap" };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0" };

function Badge({ label, bg, color }) {
  return <span style={{ padding: "2px 7px", borderRadius: 99, fontSize: 11, fontWeight: 500, background: bg, color }}>{label}</span>;
}

function getShiftDef(shiftType, shiftDefs) {
  if (!shiftType || shiftType === "off") return { label: "休日", start: null, end: null, color: "#F5F9FE", tc: "#9ca3af", breakMin: 0 };
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { label: "臨時", start: match[1], end: match[2], color: "#EDE9FE", tc: "#5B21B6", breakMin: match[3] ? Number(match[3]) : 0 };
  }
  return shiftDefs[shiftType] || { label: shiftType, start: null, end: null, color: "#F5F9FE", tc: "#6b7280", breakMin: 0 };
}

// 看護師パート時間帯
// ①午前：8:30〜14:00  ②午後前半：14:00〜17:00  ③午後後半：17:00〜  ④日曜
const AM_START = toMin("08:30"), AM_END = toMin("14:00");
const PM1_START = toMin("14:00"), PM1_END = toMin("17:00");
const PM2_START = toMin("17:00");

function calcNurseSlots(inMin, outMin, dow) {
  if (!inMin || !outMin || inMin >= outMin) return { am: 0, pm1: 0, pm2: 0, sun: 0 };
  const isSun = dow === 0;
  if (isSun) return { am: 0, pm1: 0, pm2: 0, sun: Math.max(0, outMin - inMin) };
  const am = Math.max(0, Math.min(outMin, AM_END) - Math.max(inMin, AM_START));
  const pm1 = Math.max(0, Math.min(outMin, PM1_END) - Math.max(inMin, PM1_START));
  const pm2 = Math.max(0, outMin - Math.max(inMin, PM2_START));
  return { am: Math.max(0, am), pm1: Math.max(0, pm1), pm2: Math.max(0, pm2), sun: 0 };
}

function calcDay(ds, emp, shiftDefs, shifts, punches, lvReqs) {
  const shiftRow = shifts.find(s => String(s.empId) === String(emp.id) && s.date === ds);
  const def = getShiftDef(shiftRow?.shiftType, shiftDefs);
  const punch = punches.find(p => String(p.empId) === String(emp.id) && p.date === ds);
  const lv = (lvReqs || []).find(r => String(r.empId) === String(emp.id) && r.date === ds && r.status === "approved");

  const isOff = !def.start;
  const isLeave = !!lv;
  const dow = new Date(ds).getDay();

  let awMin = 0, late = false, earlyLeave = false;
  let absent = false, missingOut = false;
  let slots = { am: 0, pm1: 0, pm2: 0, sun: 0 };

  if (isLeave) {
    // 有休
  } else if (punch?.in && punch?.out) {
    const im = toMin(punch.in), om = toMin(punch.out);
    const bk = punch.break != null ? Number(punch.break) : 0;
    const raw = Math.max(0, om - im - bk);
    awMin = Math.floor(raw / 10) * 10;
    slots = calcNurseSlots(im, om, dow);

    if (!isOff && def.start) {
      const shiftS = toMin(def.start), shiftE = toMin(def.end);
      if (im > shiftS + 1) late = true;
      if (om < shiftE - 1) earlyLeave = true;
    }
  } else if (!isOff && !punch?.in) {
    absent = true;
  } else if (punch?.in && !punch?.out) {
    missingOut = true;
  }

  const needsConfirm = !isLeave && (absent || missingOut);

  return { ds, dow, def, punch, lv, isOff, isLeave, awMin, late, earlyLeave, absent, missingOut, needsConfirm, slots };
}

export default function TimecardNursepart({ emp, shifts, punches, shiftDefs, lvReqs }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [filter, setFilter] = useState("all");

  const period = getPeriodRange(year, month);
  const periodDays = getPeriodDays(year, month);
  const td = today();

  const prevM = () => month === 1 ? (setYear(y => y - 1), setMonth(12)) : setMonth(m => m - 1);
  const nextM = () => month === 12 ? (setYear(y => y + 1), setMonth(1)) : setMonth(m => m + 1);

  const rows = periodDays.map(ds => calcDay(ds, emp, shiftDefs, shifts, punches, lvReqs));

  // サマリー計算
  const totalAwMin = rows.reduce((s, r) => s + r.awMin, 0);
  const attendDays = rows.filter(r => r.punch?.in && r.punch?.out && !r.absent).length;
  const cd = rows.filter(r => r.needsConfirm).length;
  const lvC = rows.filter(r => r.isLeave).length;
  const totalAmMin = rows.reduce((s, r) => s + r.slots.am, 0);
  const totalPm1Min = rows.reduce((s, r) => s + r.slots.pm1, 0);
  const totalPm2Min = rows.reduce((s, r) => s + r.slots.pm2, 0);
  const totalSunMin = rows.reduce((s, r) => s + r.slots.sun, 0);

  const disp = filter === "issues" ? rows.filter(r => r.absent || r.late || r.earlyLeave || r.needsConfirm || r.missingOut) : rows;

  const statusBadge = r => {
    if (r.isLeave) return <Badge label={r.lv?.half ? "半休" : "有休"} bg="#E1F5EE" color="#0F6E56" />;
    if (r.absent) return <Badge label="欠勤" bg="#FFF0F0" color="#A32D2D" />;
    if (r.missingOut) return <Badge label="退勤忘れ" bg="#FCEBEB" color="#A32D2D" />;
    if (r.needsConfirm) return <Badge label="要確認" bg="#FCEBEB" color="#A32D2D" />;
    if (r.isOff && r.punch?.in) return <Badge label="休日出勤" bg="#FAEEDA" color="#854F0B" />;
    const badges = [];
    if (r.late) badges.push(<Badge key="late" label="遅刻" bg="#FAEEDA" color="#854F0B" />);
    if (r.earlyLeave) badges.push(<Badge key="el" label="早退" bg="#FAEEDA" color="#854F0B" />);
    if (badges.length > 0) return <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>{badges}</span>;
    if (r.isOff) return <span style={{ color: "#9ca3af", fontSize: 12 }}>休日</span>;
    if (r.punch?.in) return <Badge label="正常" bg="#EAF3DE" color="#3B6D11" />;
    return <span style={{ color: "#9ca3af" }}>―</span>;
  };

  return (
    <div>
      {/* ナビゲーション */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={prevM} style={bS}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1251a3" }}>{period.label}</span>
        <button onClick={nextM} style={bS}>›</button>
        <span style={{ fontSize: 11, color: "#6b7280" }}>（15日締め）</span>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, background: "#fff" }}>
          <option value="all">全日</option>
          <option value="issues">問題のある日のみ</option>
        </select>
      </div>

      {/* サマリー */}
      <div style={{ ...crd, padding: "12px 14px", marginBottom: "1rem" }}>
        {/* 上段 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[
            ["合計就労時間", totalAwMin > 0 ? toHStr(totalAwMin) : "―", ""],
            ["出勤日数", attendDays + "日", ""],
            ["有給", lvC > 0 ? lvC + "日" : "―", lvC > 0 ? "#0F6E56" : ""],
            ["要確認", cd > 0 ? cd + "件" : "―", cd > 0 ? "#A32D2D" : ""],
          ].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: "center", padding: "10px 4px", background: l === "要確認" && cd > 0 ? "#FFF0F0" : "#fef9f3", border: l === "要確認" && cd > 0 ? "0.5px solid #F09595" : "none", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: c || "#111827" }}>{v}</div>
            </div>
          ))}
        </div>
        {/* 下段：時間帯別集計 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          {[
            ["①午前（8:30〜14:00）", totalAmMin],
            ["②午後前半（〜17:00）", totalPm1Min],
            ["③午後後半（17:00〜）", totalPm2Min],
            ["④日曜", totalSunMin],
          ].map(([l, v]) => (
            <div key={l} style={{ textAlign: "center", padding: "8px 4px", background: "#fef9f3", borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: v > 0 ? "#1251a3" : "#9ca3af" }}>{v > 0 ? toHStr(v) : "―"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 日別テーブル */}
      <div style={{ ...crd, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>{["日", "曜", "シフト", "出勤", "退勤", "実働", "勤務状況"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {disp.map(r => {
              const dc = r.dow === 0 ? "#A32D2D" : r.dow === 6 ? "#1251a3" : "#374151";
              const isToday = r.ds === td;
              return (
                <tr key={r.ds} style={{ borderBottom: "0.5px solid #e9ddd0", background: isToday ? "#EFF6FF" : r.needsConfirm || r.absent ? "#FFF8F8" : "inherit" }}>
                  <td style={{ ...tdS, fontWeight: isToday ? 700 : 400, color: dc }}>{r.ds.slice(5).replace("-", "/")}</td>
                  <td style={{ ...tdS, color: dc }}>{DOW_JP[r.dow]}</td>
                  <td style={tdS}>{r.def.start ? <span style={{ fontSize: 12, color: r.def.tc }}>{r.def.start}〜{r.def.end}</span> : <span style={{ color: "#9ca3af", fontSize: 12 }}>休日</span>}</td>
                  <td style={tdS}>{r.punch?.in || "―"}</td>
                  <td style={tdS}>{r.punch?.out || "―"}</td>
                  <td style={tdS}>{r.awMin > 0 ? toHStr(r.awMin) : "―"}</td>
                  <td style={tdS}>{statusBadge(r)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
