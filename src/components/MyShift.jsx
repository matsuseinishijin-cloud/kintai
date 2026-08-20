import { useState, useEffect } from "react";
import { pad, daysInMonth, firstDow, today, DOW_JP } from "../utils/time";
import { isHalfLeave } from "../constants";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const bS = { padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, cursor: "pointer" };

// 祝日キャッシュ
let HOLIDAYS = {};
const _holidayCache = {};
async function fetchHolidays(year) {
  if (_holidayCache[year]) return;
  try {
    const r = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);
    const data = await r.json();
    HOLIDAYS = { ...HOLIDAYS, ...data };
    _holidayCache[year] = true;
  } catch (e) { console.warn("祝日API取得失敗:", e); }
}

// シフト定義からdef取得
function getShiftDef(shiftType, shiftDefs, dept) {
  if (dept === "AT") dept = "理学療法士"; // ATは理学療法士のシフト定義を転用
  if (!shiftType || shiftType === "off") {
    return { label: "休日", start: null, end: null, color: "#F5F9FE", tc: "#9ca3af" };
  }
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { label: "臨時", start: match[1], end: match[2], color: "#EDE9FE", tc: "#5B21B6" };
  }
  return (dept && shiftDefs[`${dept}:${shiftType}`]) || shiftDefs[shiftType] || { label: shiftType, start: null, end: null, color: "#F5F9FE", tc: "#6b7280" };
}

export default function MyShift({ emp, shifts, shiftDefs, lvReqs }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  useEffect(() => {
    fetchHolidays(year);
    fetchHolidays(year + 1);
  }, [year]);

  const prevM = () => { if (month === 1) { fetchHolidays(year - 1); setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const nextM = () => { if (month === 12) { fetchHolidays(year + 1); setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const first = firstDow(year, month);
  const last = daysInMonth(year, month);
  const td = today();

  // カレンダーセルを生成（空白＋日付）
  const cells = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* ナビゲーション */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1rem" }}>
        <button onClick={prevM} style={bS}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{year}年{month}月</span>
        <button onClick={nextM} style={bS}>›</button>
      </div>

      {/* 曜日ヘッダー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
        {DOW_JP.map((d, i) => (
          <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 500, padding: "4px 0", color: i === 0 ? "#A32D2D" : i === 6 ? "#1251a3" : "#6b7280" }}>{d}</div>
        ))}
      </div>

      {/* カレンダー */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;

          const ds = `${year}-${pad(month)}-${pad(d)}`;
          const dow = new Date(year, month - 1, d).getDay();
          const isToday = ds === td;
          const isHoliday = !!HOLIDAYS[ds];
          const holidayName = HOLIDAYS[ds] || null;

          // シフト
          const shiftRow = shifts.find(s => String(s.empId) === String(emp.id) && s.date === ds);
          const def = getShiftDef(shiftRow?.shiftType, shiftDefs, emp.role);

          // 有休
          const lvApproved = (lvReqs || []).find(r => String(r.empId) === String(emp.id) && r.date === ds && r.status === "approved");
          const lvPending = (lvReqs || []).find(r => String(r.empId) === String(emp.id) && r.date === ds && r.status === "pending");
          const hasLeave = lvApproved || lvPending;

          // 日付の色
          const dateColor = dow === 0 || isHoliday ? "#A32D2D" : dow === 6 ? "#1251a3" : "#374151";

          return (
            <div key={i} style={{
              borderRadius: 8,
              padding: "5px 4px",
              textAlign: "center",
              background: isToday ? "#EFF6FF" : hasLeave ? (lvApproved ? "#E1F5EE" : "#FFF0F0") : def.color,
              border: isToday ? "2px solid #1251a3" : "1px solid transparent",
              minHeight: 58,
              position: "relative",
            }}>
              {/* 日付 */}
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: dateColor, marginBottom: 2 }}>
                {d}
                {isHoliday && <span style={{ fontSize: 8, color: "#A32D2D", marginLeft: 2 }}>祝</span>}
              </div>

              {/* 有休バッジ */}
              {hasLeave && (
                <div style={{ fontSize: 9, fontWeight: 600, color: lvApproved ? "#0F6E56" : "#A32D2D", background: lvApproved ? "#C6F6D5" : "#FECACA", borderRadius: 4, padding: "1px 3px", marginBottom: 2, display: "inline-block" }}>
                  {lvApproved ? (isHalfLeave(lvApproved.half) ? "半休✓" : "有休✓") : (isHalfLeave(lvPending.half) ? "半休…" : "有休…")}
                </div>
              )}

              {/* シフト時刻 */}
              {!hasLeave && def.start && (
                <>
                  <div style={{ fontSize: 9, color: def.tc, lineHeight: 1.3 }}>{def.start}</div>
                  <div style={{ fontSize: 9, color: def.tc, lineHeight: 1.3 }}>{def.end}</div>
                </>
              )}

              {/* 臨時シフト表示 */}
              {!hasLeave && shiftRow?.shiftType?.startsWith("custom:") && def.start && (
                <>
                  <div style={{ fontSize: 8, color: def.tc, lineHeight: 1.2 }}>{def.start}</div>
                  <div style={{ fontSize: 8, color: def.tc, lineHeight: 1.2 }}>{def.end}</div>
                </>
              )}

              {/* 祝日名ツールチップ（タイトル属性） */}
            </div>
          );
        })}
      </div>

      {/* 凡例 */}
      <div style={{ display: "flex", gap: 12, marginTop: "1rem", flexWrap: "wrap", fontSize: 12, color: "#6b7280" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "#E1F5EE", border: "1px solid #C6F6D5", display: "inline-block" }} />有休（承認済）
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "#FFF0F0", border: "1px solid #FECACA", display: "inline-block" }} />有休（申請中）
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: "#EFF6FF", border: "2px solid #1251a3", display: "inline-block" }} />今日
        </span>
      </div>
    </div>
  );
}
