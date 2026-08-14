import React, { useState, useEffect } from "react";
import { gasSaveBatch } from "../api/gas";
import { newId, toMin, toHStr, pad, getPeriodRange, getPeriodDays, today } from "../utils/time";
import { BREAK_MIN, ROLES, isHalfLeave, isActiveEmp } from "../constants";

const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "6px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, cursor: "pointer" };
const iS = { padding: "6px 8px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, width: "100%" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };

const DOW_JP_SHORT = ["日", "月", "火", "水", "木", "金", "土"];

function getShiftDef(shiftType, shiftDefs, dept) {
  if (!shiftType || shiftType === "off") return { label: "休日", start: null, end: null, color: "#F5F9FE", tc: "#9ca3af", breakMin: 0 };
  const st = String(shiftType);
  if (st.startsWith("custom:")) {
    const match = st.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { label: "臨時", start: match[1], end: match[2], color: "#EDE9FE", tc: "#5B21B6", breakMin: match[3] ? Number(match[3]) : 60 };
  }
  return (dept && shiftDefs[`${dept}:${st}`]) || shiftDefs[st] || { label: st, start: null, end: null, color: "#F5F9FE", tc: "#6b7280", breakMin: BREAK_MIN };
}

// 週合計計算（振替・有休を含む）
function calcWeekTotal(empId, weekDays, shifts, shiftDefs, lvReqs, timeTransferReqs, dept) {
  const firstDs = weekDays[0];
  const d = new Date(firstDs); const dow = d.getDay(); const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  const weekMon = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  let rawShiftMin = 0; // 実シフト時間（振替なし）
  let total = 0;

  weekDays.forEach(ds => {
    const sr = shifts.find(s => String(s.empId) === String(empId) && s.date === ds);
    const def = getShiftDef(sr?.shiftType, shiftDefs, dept);
    if (def.start && def.end) {
      const bk = def.breakMin != null ? def.breakMin : BREAK_MIN;
      const min = Math.max(0, toMin(def.end) - toMin(def.start) - bk);
      rawShiftMin += min;
      total += min;
    }
    // 有休
    const lv = (lvReqs || []).find(r => String(r.empId) === String(empId) && r.date === ds && (r.status === "approved" || r.status === "pending"));
    if (lv && lv.leaveStart && lv.leaveEnd) {
      const lvMin = toMin(lv.leaveEnd) - toMin(lv.leaveStart);
      const bk = lv.leaveBreak === "1" ? 60 : 0;
      total += Math.max(0, lvMin - bk);
    }
  });

  // タイプA振替
  (timeTransferReqs || []).filter(r => String(r.empId) === String(empId) && r.transferType === "A" && r.status === "approved").forEach(r => {
    if (r.overWeekStart === weekMon) total -= Number(r.offsetMin || 0);
    if (r.shortWeekStart === weekMon) total += Number(r.offsetMin || 0);
  });

  // タイプC時間外
  (timeTransferReqs || []).filter(r => String(r.empId) === String(empId) && r.transferType === "C" && r.status === "approved").forEach(r => {
    if (r.overWeekStart === weekMon) total -= Number(r.offsetMin || 0);
  });

  // タイプC承認済みかどうか
  const typeCApproved = (timeTransferReqs || []).some(r =>
    String(r.empId) === String(empId) && r.transferType === "C" && r.status === "approved" && r.overWeekStart === weekMon
  );

  // ツールチップコメント
  const comments = (timeTransferReqs || [])
    .filter(r => String(r.empId) === String(empId) && r.status === "approved" && (r.overWeekStart === weekMon || r.shortWeekStart === weekMon))
    .map(r => {
      if (r.transferType === "C") return `時間外申請済：${toHStr(Number(r.offsetMin || 0))}`;
      if (r.transferType === "A") return r.overWeekStart === weekMon
        ? `超過→${r.shortWeekStart}週へ${toHStr(Number(r.offsetMin || 0))}振替`
        : `${r.overWeekStart}週から${toHStr(Number(r.offsetMin || 0))}振替`;
      return "";
    });

  return { total: Math.max(0, total), rawShiftMin, typeCApproved, weekMon, comments };
}

// 週グループ生成（月曜始まり）
// 先頭（16日を含む週）は月曜まで遡り、末尾（15日を含む週）は日曜まで延長して
// 週の合計計算が常に「月〜日」のフルセットになるようにする（表示は期間内の日付のみ）
function buildWeekGroups(periodDays) {
  if (!periodDays.length) return [];
  const [sy, sm, sd] = periodDays[0].split("-").map(Number);
  const startDow = new Date(sy, sm - 1, sd).getDay();
  const prevCount = startDow === 0 ? 6 : startDow === 1 ? 0 : startDow - 1;
  const allDs = [];
  for (let i = prevCount; i > 0; i--) {
    const d = new Date(sy, sm - 1, sd - i);
    allDs.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  periodDays.forEach(ds => allDs.push(ds));

  // 末尾（15日を含む週）を日曜まで延長
  const lastDs = periodDays[periodDays.length - 1];
  const [ly, lm, ld] = lastDs.split("-").map(Number);
  const lastDow = new Date(ly, lm - 1, ld).getDay();
  const nextCount = lastDow === 0 ? 0 : 7 - lastDow;
  for (let i = 1; i <= nextCount; i++) {
    const d = new Date(ly, lm - 1, ld + i);
    allDs.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }

  const groups = []; let wk = [];
  allDs.forEach(ds => {
    wk.push(ds);
    const dow = new Date(ds).getDay();
    if (dow === 0 || ds === allDs[allDs.length - 1]) { groups.push([...wk]); wk = []; }
  });
  return groups;
}

export default function ShiftCalendar({ emps, shifts: shiftsFromProps, shiftDefs, shiftDefList, lvReqs, timeTransferReqs, designatedHolidays, reload }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [roleFilter, setRoleFilter] = useState("");
  const [ptTypeFilter, setPtTypeFilter] = useState("");
  const [localEdits, setLocalEdits] = useState({});
  const [selectedShift, setSelectedShift] = useState("off");
  const [customStart, setCustomStart] = useState("09:00");
  const [customEnd, setCustomEnd] = useState("17:30");
  const [customBreak, setCustomBreak] = useState(60);
  const [saving, setSaving] = useState(false);
  const [tooltip, setTooltip] = useState(null);

  const period = getPeriodRange(year, month);
  const periodDays = getPeriodDays(year, month);
  const weekGroups = buildWeekGroups(periodDays);
  const hasEdits = Object.keys(localEdits).length > 0;

  // シフトをlocalEditsとマージ
  const shifts = (() => {
    const base = [...shiftsFromProps];
    Object.entries(localEdits).forEach(([key, shiftType]) => {
      const [empId, date] = key.split("_");
      const idx = base.findIndex(s => String(s.empId) === empId && s.date === date);
      if (idx >= 0) base[idx] = { ...base[idx], shiftType };
      else base.push({ id: newId(), empId, date, shiftType });
    });
    return base;
  })();

  // 表示するシフト定義（職種フィルターで絞り込み。同じキーが複数部署にまたがることがあるため、
  // 職種を選択していない状態では一意に決められず、ボタンを出さずに選択を促す）
  const visibleShiftDefs = (() => {
    const list = (shiftDefList || []).filter(d => d.key !== "off");
    if (!roleFilter) return [];
    const deptMatched = list.filter(d => d.dept === roleFilter);
    // 部署情報が未設定の古いデータ用フォールバック（部署列が空のものも一応出す）
    return deptMatched.length > 0 ? deptMatched : list.filter(d => !d.dept);
  })();

  // 職種フィルター後の従業員
  const filteredEmps = emps
    .filter(e => isActiveEmp(e) && (!roleFilter || e.role === roleFilter) && (roleFilter !== "理学療法士" || !ptTypeFilter || e.type === ptTypeFilter))
    .sort((a, b) => (a.type === "正社員" ? 0 : 1) - (b.type === "正社員" ? 0 : 1));

  // セルクリック
  const setCell = (empId, ds, dept) => {
    // 全日有休チェック
    const lvApproved = (lvReqs || []).find(r => String(r.empId) === String(empId) && r.date === ds && r.status === "approved" && !isHalfLeave(r.half));
    if (lvApproved) { alert("この日は全日有休が承認済みのためシフト変更できません。"); return; }

    // 半日有休チェック（臨時・通常シフトが有休時間帯と重なる場合）
    const lvHalfApproved = (lvReqs || []).find(r => String(r.empId) === String(empId) && r.date === ds && r.status === "approved" && isHalfLeave(r.half));
    if (lvHalfApproved && lvHalfApproved.leaveStart && lvHalfApproved.leaveEnd) {
      const actual = selectedShift === "custom" ? `custom:${customStart}-${customEnd}:${customBreak}` : selectedShift;
      const def = getShiftDef(actual, shiftDefs, dept);
      if (def.start) {
        const selS = toMin(def.start), selE = toMin(def.end);
        const lvS = toMin(lvHalfApproved.leaveStart), lvE = toMin(lvHalfApproved.leaveEnd);
        if (lvS < selE && lvE > selS) { alert("この日は半日有休の時間帯とシフトが重なるため変更できません。"); return; }
      }
    }

    const key = `${empId}_${ds}`;
    const current = shifts.find(s => String(s.empId) === String(empId) && s.date === ds)?.shiftType || "off";
    const actual = selectedShift === "custom" ? `custom:${customStart}-${customEnd}:${customBreak}` : selectedShift;
    const next = current === actual ? "off" : actual;
    setLocalEdits(prev => ({ ...prev, [key]: next }));
  };

  // 保存
  const saveAll = async () => {
    setSaving(true);
    try {
      const entries = Object.entries(localEdits);
      const dataArray = entries.map(([key, shiftType]) => {
        const sepIdx = key.indexOf("_"); const empId = key.slice(0, sepIdx); const date = key.slice(sepIdx + 1);
        const existing = shiftsFromProps.find(s => String(s.empId) === String(empId) && s.date === date);
        return { id: existing?.id || newId(), "従業員id": empId, "日付": date, "シフト種別": shiftType };
      });
      await gasSaveBatch("シフト", dataArray);
      setLocalEdits({});
      await reload();
    } catch (e) { alert("保存失敗：" + e.message); }
    setSaving(false);
  };

  const prevM = () => {
    if (hasEdits && !confirm("未保存の変更は破棄されます。よろしいですか？")) return;
    setLocalEdits({});
    month === 1 ? (setYear(y => y - 1), setMonth(12)) : setMonth(m => m - 1);
  };
  const nextM = () => {
    if (hasEdits && !confirm("未保存の変更は破棄されます。よろしいですか？")) return;
    setLocalEdits({});
    month === 12 ? (setYear(y => y + 1), setMonth(1)) : setMonth(m => m + 1);
  };

  const td = today();

  return (
    <div>
      {/* ツールチップ */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x, top: tooltip.y, background: "#1f2937", color: "#fff", padding: "6px 10px", borderRadius: 6, fontSize: 12, zIndex: 9999, pointerEvents: "none", maxWidth: 200 }}>
          {tooltip.lines.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}

      {/* ヘッダー */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button onClick={prevM} style={bS}>‹</button>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1251a3" }}>{period.label}</span>
        <button onClick={nextM} style={bS}>›</button>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); if (e.target.value !== "理学療法士") setPtTypeFilter(""); }} style={{ ...iS, width: "auto" }}>
          <option value="">全職種</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
        {roleFilter === "理学療法士" && (
          <select value={ptTypeFilter} onChange={e => setPtTypeFilter(e.target.value)} style={{ ...iS, width: "auto" }}>
            <option value="">全雇用形態</option>
            <option>正社員</option>
            <option>パート</option>
          </select>
        )}
        <button onClick={saveAll} disabled={!hasEdits || saving}
          style={{ ...bP, marginLeft: "auto", padding: "6px 14px", fontSize: 12, background: hasEdits ? "#1251a3" : "#9ca3af", opacity: hasEdits ? 1 : 0.5 }}>
          {saving ? "保存中..." : `シフト保存（${Object.keys(localEdits).length}件）`}
        </button>
        {hasEdits && <button onClick={() => { if (confirm("変更を破棄しますか？")) setLocalEdits({}); }} style={{ ...bS, fontSize: 12 }}>変更を破棄</button>}
      </div>

      {/* シフト選択バー */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: "0.75rem", padding: "10px 12px", background: "#fef9f3", borderRadius: 10, border: "1px solid #e9ddd0", alignItems: "center" }}>
        {/* off */}
        <div onClick={() => setSelectedShift("off")}
          style={{ padding: "4px 10px", borderRadius: 6, background: "#F5F9FE", border: selectedShift === "off" ? "2px solid #1251a3" : "2px solid transparent", cursor: "pointer", fontSize: 13, color: "#6b7280" }}>
          休日
        </div>
        {/* 定義済みシフト */}
        {!roleFilter && (
          <span style={{ fontSize: 12, color: "#A32D2D", padding: "4px 8px" }}>
            ⚠️ 同じ記号（A・Bなど）が職種をまたいで別の時間で使われているため、まず上の「職種」フィルターを選択してください
          </span>
        )}
        {visibleShiftDefs.map(def => {
          const k = def.key;
          return (
            <div key={k} onClick={() => setSelectedShift(k)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: def.color, border: selectedShift === k ? "2px solid #1251a3" : "2px solid transparent", cursor: "pointer" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: def.tc }}>{k}</span>
              {def.start && <span style={{ fontSize: 11, color: def.tc }}>{def.start}〜{def.end}</span>}
            </div>
          );
        })}
        {/* カスタムシフト */}
        <div onClick={() => setSelectedShift("custom")}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, background: "#EDE9FE", border: selectedShift === "custom" ? "2px solid #1251a3" : "2px solid transparent", cursor: "pointer" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#5B21B6" }}>臨時</span>
          {selectedShift === "custom" && <span style={{ fontSize: 11, color: "#5B21B6" }}>{customStart}〜{customEnd}</span>}
        </div>
        {/* カスタムシフト入力 */}
        {selectedShift === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 6, background: "#F5F3FF", border: "1px solid #DDD6FE" }}>
            <input type="time" value={customStart} onChange={e => setCustomStart(e.target.value)} style={{ ...iS, width: 90, padding: "2px 4px", fontSize: 12 }} />
            <span style={{ fontSize: 12, color: "#6b7280" }}>〜</span>
            <input type="time" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={{ ...iS, width: 90, padding: "2px 4px", fontSize: 12 }} />
            <button onClick={() => setCustomBreak(customBreak === 60 ? 0 : 60)}
              style={{ padding: "2px 8px", borderRadius: 6, border: "1px solid #DDD6FE", background: customBreak === 60 ? "#EDE9FE" : "#F5F3FF", color: customBreak === 60 ? "#5B21B6" : "#6b7280", fontSize: 11, cursor: "pointer" }}>
              休憩{customBreak === 60 ? "あり" : "なし"}
            </button>
          </div>
        )}
      </div>

      {/* グリッド */}
      <div style={{ overflow: "auto", maxHeight: "70vh", border: "1px solid #e9ddd0", borderRadius: 8 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "max-content" }}>
          <thead>
            <tr>
              <th style={{ padding: "6px 10px", textAlign: "left", background: "#fef9f3", borderBottom: "1px solid #e9ddd0", position: "sticky", left: 0, top: 0, zIndex: 2, minWidth: 100 }}>従業員</th>
              {weekGroups.map((wk, wi) => (
                <React.Fragment key={`wh${wi}`}>
                  {wk.filter(ds => periodDays.includes(ds)).map(ds => {
                    const d = new Date(ds); const dow = d.getDay();
                    const isHol = dow === 0 || dow === 6;
                    return (
                      <th key={ds} style={{ padding: "4px 6px", textAlign: "center", background: isHol ? "#FFF0F0" : "#fef9f3", borderBottom: "1px solid #e9ddd0", minWidth: 44, color: dow === 0 ? "#A32D2D" : dow === 6 ? "#1251a3" : "#374151", position: "sticky", top: 0, zIndex: 1 }}>
                        <div style={{ fontSize: 11 }}>{ds.slice(5).replace("-", "/")}</div>
                        <div style={{ fontSize: 10 }}>{DOW_JP_SHORT[dow]}</div>
                      </th>
                    );
                  })}
                  <th style={{ padding: "4px 6px", textAlign: "center", background: "#E6F1FB", borderBottom: "1px solid #e9ddd0", borderRight: "2px solid #1251a3", fontSize: 11, color: "#1251a3", minWidth: 60, position: "sticky", top: 0, zIndex: 1 }}>
                    W{wi + 1}<br />合計
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEmps.map(emp => {
              return (
                <tr key={emp.id} style={{ borderBottom: "0.5px solid #e9ddd0" }}>
                  {/* 従業員名 */}
                  <td style={{ padding: "4px 10px", background: "#fef9f3", position: "sticky", left: 0, zIndex: 1, whiteSpace: "nowrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{emp.name}</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>{emp.role}・{emp.type}</div>
                  </td>

                  {weekGroups.map((wk, wi) => {
                    // 週合計
                    const { total, rawShiftMin, typeCApproved, weekMon, comments } = calcWeekTotal(emp.id, wk, shifts, shiftDefs, lvReqs, timeTransferReqs, emp.role);
                    const weekLimit = emp.weeklyLimit ? Number(emp.weeklyLimit) : emp.type === "正社員" ? 40 : null;
                    const hasLimit = !!weekLimit;
                    const diff = hasLimit ? total / 60 - weekLimit : 0;
                    const isExact = hasLimit && Math.abs(diff) < 0.1;
                    const isOver = hasLimit && diff > 0.05;
                    const bgColor = !hasLimit ? "#f5f5f5" : isExact || typeCApproved ? "#f0f4ff" : "#FCEBEB";
                    const textColor = !hasLimit ? "#6b7280" : isExact || typeCApproved ? "#1251a3" : "#A32D2D";

                    return (
                      <React.Fragment key={`wg${wi}_${emp.id}`}>
                        {/* シフトセル */}
                        {wk.filter(ds => periodDays.includes(ds)).map(ds => {
                          const sr = shifts.find(s => String(s.empId) === String(emp.id) && s.date === ds);
                          const shiftType = sr?.shiftType || "off";
                          const def = getShiftDef(shiftType, shiftDefs, emp.role);
                          const isEdited = localEdits[`${emp.id}_${ds}`] !== undefined;
                          const lv = (lvReqs || []).find(r => String(r.empId) === String(emp.id) && r.date === ds);
                          const lvApproved = lv?.status === "approved";
                          const lvPending = lv?.status === "pending";
                          const isDesignated = emp.type === "正社員" && (designatedHolidays || []).some(d => d.date === ds);
                          const isOff = shiftType === "off";
                          const isCustom = shiftType.startsWith("custom:");
                          const d = new Date(ds); const dow = d.getDay();
                          const isHol = dow === 0 || dow === 6;
                          const isToday = ds === td;

                          return (
                            <td key={ds}
                              style={{ padding: "2px", textAlign: "center", background: isToday ? "#EFF6FF" : isHol ? "#FFF8F8" : "inherit", cursor: "pointer", userSelect: "none" }}
                              onClick={() => setCell(emp.id, ds, emp.role)}
                            >
                              <div style={{ position: "relative", display: "inline-block", width: "100%" }}>
                                {/* シフト表示 */}
                                <div style={{ background: isEdited ? "#FFF8E1" : def.color, color: def.tc, borderRadius: 4, padding: "2px 3px", fontSize: isCustom ? 7 : 15, fontWeight: 400, border: isEdited ? "1px solid #F59E0B" : "1px solid transparent", lineHeight: isCustom ? 1.4 : undefined, textAlign: "center", minWidth: isCustom ? 56 : 48, height: isCustom ? 36 : undefined, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}>
                                  {isCustom ? (
                                    <>
                                      <div style={{ fontSize: 9, lineHeight: 1.4, whiteSpace: "nowrap", fontWeight: 500 }}>{def.start}</div>
                                      <div style={{ fontSize: 9, lineHeight: 1.4, whiteSpace: "nowrap", fontWeight: 500 }}>{def.end}</div>
                                    </>
                                  ) : isOff ? (
                                    <span style={{ color: "#9ca3af" }}>休</span>
                                  ) : shiftType}
                                </div>
                                {/* 有休バッジ（右上絶対配置） */}
                                {lv && (
                                  <div style={{ position: "absolute", top: -4, right: -2, background: lvApproved ? "#0F6E56" : "#A32D2D", color: "#fff", fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 99, whiteSpace: "nowrap", lineHeight: 1.4, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", zIndex: 1 }}
                                    onClick={ev => ev.stopPropagation()}>
                                    {lv.half === "am" ? "午前" : lv.half === "pm" ? "午後" : "全日"}
                                  </div>
                                )}
                                {/* 指定休バッジ */}
                                {!lv && isDesignated && (
                                  <div style={{ position: "absolute", top: -4, right: -2, background: "#7C3AED", color: "#fff", fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 99, whiteSpace: "nowrap", lineHeight: 1.4, boxShadow: "0 1px 3px rgba(0,0,0,0.25)", zIndex: 1 }}>
                                    指定休
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}

                        {/* 週合計セル */}
                        <td key={`w${wi}_${emp.id}`}
                          style={{ padding: "4px 6px", textAlign: "center", background: bgColor, borderRight: "2px solid #1251a3", cursor: comments.length > 0 ? "help" : "default" }}
                          onMouseEnter={e => { if (comments.length > 0) { const rect = e.currentTarget.getBoundingClientRect(); setTooltip({ x: rect.left, y: rect.bottom + 4, lines: comments }); } }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {hasLimit ? (
                            <>
                              <div style={{ fontSize: 11, fontWeight: 700, color: textColor }}>
                                {isExact ? "完了✓" : isOver ? `+${(diff).toFixed(1)}超過` : `残${(-diff).toFixed(1)}h`}
                              </div>
                              <div style={{ fontSize: 9, color: "#9ca3af" }}>{(rawShiftMin / 60).toFixed(1)}/{weekLimit}h</div>
                            </>
                          ) : (
                            <div style={{ fontSize: 11, color: "#6b7280" }}>{(rawShiftMin / 60).toFixed(1)}h</div>
                          )}
                        </td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
