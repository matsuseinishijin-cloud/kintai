import { useState } from "react";
import { gasSave } from "../api/gas";
import { today, nowStr, newId, toHStr, toMin, pad } from "../utils/time";
import { BREAK_MIN, convertTo, PUNCH_MAP, PUNCH_FIX_MAP, isHalfLeave } from "../constants";

// ── スタイル ──────────────────────────────────────────────────────────────────
const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };

// ── シフト定義からdef取得 ─────────────────────────────────────────────────────
function getShiftDef(shiftType, shiftDefs) {
  if (!shiftType || shiftType === "off") {
    return { label: "休日", start: null, end: null, color: "#F5F9FE", tc: "#6b7280" };
  }
  if (shiftType.startsWith("custom:")) {
    const match = shiftType.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2}):?(\d*)$/);
    if (match) return { label: "臨時", start: match[1], end: match[2], breakMin: match[3] ? Number(match[3]) : 60, color: "#EDE9FE", tc: "#5B21B6" };
  }
  return shiftDefs[shiftType] || { label: shiftType, start: null, end: null, color: "#F5F9FE", tc: "#6b7280" };
}

// ── 通知アイテム ──────────────────────────────────────────────────────────────
function NotificationItem({ type, msg }) {
  const colors = {
    error: { bg: "#FFF0F0", color: "#A32D2D", border: "#F09595", icon: "🔴" },
    warn:  { bg: "#FFF8E1", color: "#854F0B", border: "#F59E0B", icon: "⚠️" },
    info:  { bg: "#F0F4FF", color: "#1251a3", border: "#93C5FD", icon: "ℹ️" },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.icon} {msg}
    </div>
  );
}

// ── 打刻画面 ──────────────────────────────────────────────────────────────────
export default function PunchScreen({ emp, punches, shifts, shiftDefs, leaves, lvReqs, timeTransferReqs, reload, reloadPunches }) {
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingType, setSavingType] = useState(null); // "in" | "out" | null
  const [showPastWeeks, setShowPastWeeks] = useState(false);
  const [fixForm, setFixForm] = useState({ date: today(), reqIn: "", reqOut: "", reason: "" });
  const [fixSub, setFixSub] = useState(false);

  const td = today();
  const shiftRow = shifts.find(s => String(s.empId) === String(emp.id) && s.date === td);
  const def = getShiftDef(shiftRow?.shiftType, shiftDefs);
  const punch = punches.find(p => String(p.empId) === String(emp.id) && p.date === td);

  // ── 打刻処理 ────────────────────────────────────────────────────────────────
  const doPunch = async type => {
    setSaving(true);
    setSavingType(type);
    const now = nowStr();
    try {
      if (type === "in") {
        const data = convertTo({ id: newId(), empId: emp.id, date: td, in: now, out: "", break: def.breakMin != null ? def.breakMin : BREAK_MIN, adjusted: false }, PUNCH_MAP);
        await gasSave("打刻", data);
        setMsg("出勤打刻しました：" + now);
      } else {
        if (!punch) return;
        const data = convertTo({ ...punch, out: now }, PUNCH_MAP);
        await gasSave("打刻", data);
        setMsg("退勤打刻しました：" + now);
      }
      // 打刻は最も頻繁な操作のため、全データではなく打刻データだけを再取得（高速化）
      await (reloadPunches || reload)();
    } catch (e) { alert("打刻失敗：" + e.message); }
    setSaving(false);
    setSavingType(null);
  };

  // ── 打刻修正申請 ─────────────────────────────────────────────────────────────
  const submitFix = async () => {
    if (!fixForm.reqIn || !fixForm.reqOut || !fixForm.reason) return;
    try {
      const cur = punches.find(p => String(p.empId) === String(emp.id) && p.date === fixForm.date);
      const data = convertTo({
        id: newId(), empId: emp.id, date: fixForm.date,
        reqIn: fixForm.reqIn, reqOut: fixForm.reqOut, reason: fixForm.reason,
        status: "pending", origIn: cur?.in || "", origOut: cur?.out || "",
        createdAt: new Date().toISOString(), comment: ""
      }, PUNCH_FIX_MAP);
      await gasSave("打刻修正申請", data);
      setFixForm({ date: today(), reqIn: "", reqOut: "", reason: "" });
      setFixSub(true);
      setTimeout(() => setFixSub(false), 3000);
      await reload();
    } catch (e) { alert("申請失敗：" + e.message); }
  };

  // ── 通知チェック ─────────────────────────────────────────────────────────────
  const notifications = [];

  // ①シフト超過・不足（週所定あり）
  if (emp.weeklyLimit) {
    const weekLimit = Number(emp.weeklyLimit) * 60;
    const now = new Date();
    const seen = new Set();
    for (let mo = -1; mo <= 0; mo++) {
      const raw = now.getMonth() + 1 + mo;
      const y = raw <= 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = raw <= 0 ? raw + 12 : raw;
      const last = new Date(y, m, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const ds = `${y}-${pad(m)}-${pad(d)}`;
        const date = new Date(y, m - 1, d);
        const dow = date.getDay();
        const diff = dow === 0 ? -6 : 1 - dow;
        const mon = new Date(date);
        mon.setDate(date.getDate() + diff);
        const monStr = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;
        if (seen.has(monStr)) continue;
        seen.add(monStr);
        let wMin = 0;
        for (let i = 0; i < 7; i++) {
          const d2 = new Date(mon);
          d2.setDate(mon.getDate() + i);
          const ds2 = `${d2.getFullYear()}-${pad(d2.getMonth() + 1)}-${pad(d2.getDate())}`;
          if (ds2 > td) continue; // 今日より先の日付は実績ベース集計から除外
          const sr = shifts.find(s => String(s.empId) === String(emp.id) && s.date === ds2);
          const def2 = getShiftDef(sr?.shiftType, shiftDefs);
          if (def2.start && def2.end) {
            const bk = def2.breakMin != null ? def2.breakMin : BREAK_MIN;
            wMin += Math.max(0, toMin(def2.end) - toMin(def2.start) - bk);
          }
          const lv = (lvReqs || []).find(r => String(r.empId) === String(emp.id) && r.date === ds2 && (r.status === "approved" || r.status === "pending"));
          if (lv && lv.leaveStart && lv.leaveEnd) {
            const lvMin = toMin(lv.leaveEnd) - toMin(lv.leaveStart);
            const breakMin = lv.leaveBreak === "1" ? 60 : 0;
            wMin += Math.max(0, lvMin - breakMin);
          }
        }
        // 既に時間振替・時間外申請で相殺済み（承認済み・申請中）の分を差し引く
        const usedAsOver = (timeTransferReqs || [])
          .filter(r => String(r.empId) === String(emp.id) && r.overWeekStart === monStr && (r.transferType === "A" || r.transferType === "C") && (r.status === "approved" || r.status === "pending"))
          .reduce((s, r) => s + Number(r.offsetMin || 0), 0);
        const usedAsShort = (timeTransferReqs || [])
          .filter(r => String(r.empId) === String(emp.id) && r.shortWeekStart === monStr && r.transferType === "A" && (r.status === "approved" || r.status === "pending"))
          .reduce((s, r) => s + Number(r.offsetMin || 0), 0);
        const netExcess = Math.max(0, wMin - weekLimit - usedAsOver);
        const netShort = Math.max(0, weekLimit - wMin - usedAsShort);
        if (netExcess > 0) notifications.push({ type: "warn", msg: `${monStr}週：シフト超過（+${toHStr(netExcess)}）`, _week: monStr, _kind: "over" });
        else if (netShort > 0 && wMin > 0) notifications.push({ type: "info", msg: `${monStr}週：シフト不足（残${toHStr(netShort)}）`, _week: monStr, _kind: "short" });
      }
    }
  }

  // ②タイムカード要確認
  const now2 = new Date();
  let confirmCount = 0;
  for (let d = 1; d <= now2.getDate(); d++) {
    const ds = `${now2.getFullYear()}-${pad(now2.getMonth() + 1)}-${pad(d)}`;
    const sr = shifts.find(s => String(s.empId) === String(emp.id) && s.date === ds);
    const def2 = getShiftDef(sr?.shiftType, shiftDefs);
    const p2 = punches.find(p => String(p.empId) === String(emp.id) && p.date === ds);
    if (def2.start && !p2) confirmCount++;
    if (p2?.in && !p2?.out && ds < td) confirmCount++;
  }
  if (confirmCount > 0) notifications.push({ type: "error", msg: `タイムカード要確認が${confirmCount}件あります` });

  // ③本日打刻忘れ
  if (def.start && !punch) notifications.push({ type: "warn", msg: "本日の出勤打刻がありません" });

  // ④有休残日数が少ない（5日未満）
  const leave = (leaves || []).find(l => String(l.empId) === String(emp.id));
  if (leave) {
    const approved = (lvReqs || []).filter(r => String(r.empId) === String(emp.id) && r.status === "approved");
    const usedDays = approved.reduce((s, r) => s + (isHalfLeave(r.half) ? 0.5 : 1), 0);
    const rem = (Number(leave.granted) || 0) - usedDays;
    if (rem > 0 && rem < 5) notifications.push({ type: "info", msg: `有休残日数が少なくなっています（残${rem}日）` });
  }

  // ⑤時間外申請が承認待ち
  const pendingOT = (timeTransferReqs || []).filter(r => String(r.empId) === String(emp.id) && r.transferType === "C" && r.status === "pending").length;
  if (pendingOT > 0) notifications.push({ type: "info", msg: `時間外申請が${pendingOT}件承認待ちです` });

  const status = !punch ? "未出勤" : !punch.out ? "勤務中" : "退勤済";
  const sc = status === "勤務中" ? "#1251a3" : status === "退勤済" ? "#3B6D11" : "#6b7280";
  const sb = status === "勤務中" ? "#E6F1FB" : status === "退勤済" ? "#EAF3DE" : "#F5F9FE";

  // 週次の超過/不足通知は、今週分だけ目立たせ、過去分は折りたたみにまとめる（見やすさ優先）
  const [ty, tmo, tda] = td.split("-").map(Number);
  const tdDow = new Date(ty, tmo - 1, tda).getDay();
  const curMonDate = new Date(ty, tmo - 1, tda + (tdDow === 0 ? -6 : 1 - tdDow));
  const curMonStr = `${curMonDate.getFullYear()}-${pad(curMonDate.getMonth() + 1)}-${pad(curMonDate.getDate())}`;
  const weeklyNotifs = notifications.filter(n => n._week);
  const otherNotifs = notifications.filter(n => !n._week);
  const currentWeekNotif = weeklyNotifs.find(n => n._week === curMonStr);
  const pastWeekNotifs = weeklyNotifs.filter(n => n._week !== curMonStr);

  return (
    <div style={{ maxWidth: 440 }}>
      {/* 通知エリア */}
      {(otherNotifs.length > 0 || currentWeekNotif || pastWeekNotifs.length > 0) && (
        <div style={{ marginBottom: "1rem", display: "flex", flexDirection: "column", gap: 6 }}>
          {otherNotifs.map((n, i) => <NotificationItem key={`o${i}`} {...n} />)}
          {currentWeekNotif && <NotificationItem {...currentWeekNotif} />}
          {pastWeekNotifs.length > 0 && (
            <div>
              <div onClick={() => setShowPastWeeks(s => !s)}
                style={{ cursor: "pointer", padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500, background: "#FFF8E1", color: "#854F0B", border: "1px solid #F59E0B" }}>
                ⚠️ 過去{pastWeekNotifs.length}週分の未解消の超過・不足があります {showPastWeeks ? "▲" : "▼ タップで表示"}
              </div>
              {showPastWeeks && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {pastWeekNotifs.map((n, i) => <NotificationItem key={`p${i}`} {...n} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 打刻カード */}
      <div style={{ ...crd, padding: "1.25rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>本日のシフト</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
          {def.start ? `${def.label}（${def.start}〜${def.end}）` : "休日"}
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <span style={{ padding: "4px 12px", borderRadius: 99, fontSize: 13, fontWeight: 500, background: sb, color: sc }}>{status}</span>
          {punch && <span style={{ marginLeft: 8, fontSize: 13, color: "#6b7280" }}>出勤：{punch.in}{punch.out ? " / 退勤：" + punch.out : ""}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => doPunch("in")} disabled={!!punch || saving}
            style={{ flex: 1, padding: "14px 0", borderRadius: 8, background: savingType === "in" ? "#93C5FD" : punch ? "#F5F9FE" : "#1251a3", color: punch ? "#9ca3af" : "white", border: "none", fontWeight: 600, fontSize: 15, cursor: punch ? "default" : "pointer", opacity: punch ? 0.5 : 1 }}>
            {savingType === "in" ? "処理中…" : "出勤打刻"}
          </button>
          <button onClick={() => doPunch("out")} disabled={!punch || !!punch?.out || saving}
            style={{ flex: 1, padding: "14px 0", borderRadius: 8, background: savingType === "out" ? "#6EE7B7" : (!punch || punch?.out) ? "#F5F9FE" : "#0F6E56", color: (!punch || punch?.out) ? "#9ca3af" : "white", border: "none", fontWeight: 600, fontSize: 15, cursor: (!punch || punch?.out) ? "default" : "pointer", opacity: (!punch || punch?.out) ? 0.5 : 1 }}>
            {savingType === "out" ? "処理中…" : "退勤打刻"}
          </button>
        </div>
        {msg && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>{msg}</div>}
      </div>

      {/* 打刻修正申請フォーム */}
      <div style={{ ...crd, padding: "1.25rem" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: "1rem" }}>打刻修正申請</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>対象日</div>
          <input type="date" value={fixForm.date} max={td} onChange={e => setFixForm(p => ({ ...p, date: e.target.value }))} style={iS} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>申請出勤時刻</div>
            <input type="time" value={fixForm.reqIn} onChange={e => setFixForm(p => ({ ...p, reqIn: e.target.value }))} style={iS} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>申請退勤時刻</div>
            <input type="time" value={fixForm.reqOut} onChange={e => setFixForm(p => ({ ...p, reqOut: e.target.value }))} style={iS} />
          </div>
        </div>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 3 }}>理由</div>
          <input type="text" value={fixForm.reason} onChange={e => setFixForm(p => ({ ...p, reason: e.target.value }))} placeholder="例：打刻忘れ" style={iS} />
        </div>
        <button onClick={submitFix} disabled={!fixForm.reqIn || !fixForm.reqOut || !fixForm.reason}
          style={{ ...bP, width: "100%", padding: "10px 0", opacity: (!fixForm.reqIn || !fixForm.reqOut || !fixForm.reason) ? 0.4 : 1 }}>
          申請する
        </button>
        {fixSub && <div style={{ marginTop: 8, fontSize: 13, color: "#3B6D11", padding: "6px 10px", background: "#EAF3DE", borderRadius: 6 }}>申請しました。</div>}
      </div>
    </div>
  );
}
