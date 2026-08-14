import { useState } from "react";
import { gasSave, gasDelete } from "../api/gas";
import { today, toMin, newId } from "../utils/time";
import { convertTo, isHalfLeave, LV_REQ_MAP, TIME_TRANSFER_MAP, PUNCH_MAP, BREAK_MIN } from "../constants";

const iS = { padding: "7px 10px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 13, width: "100%" };
const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const thS = { padding: "8px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500, whiteSpace: "nowrap" };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0", verticalAlign: "middle" };

function StatusBadge({ status }) {
  if (status === "pending") return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FAEEDA", color: "#854F0B" }}>承認待ち</span>;
  if (status === "approved") return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EAF3DE", color: "#3B6D11" }}>承認済</span>;
  if (status === "rejected") return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#FFF0F0", color: "#A32D2D" }}>却下</span>;
  return <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#F5F9FE", color: "#6b7280" }}>{status}</span>;
}

function ABtn({ label, bg, color, onClick }) {
  return <button onClick={onClick} style={{ padding: "4px 10px", borderRadius: 6, background: bg, color, border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>{label}</button>;
}

function getShiftDef(shiftType, shiftDefs, dept) {
  if (!shiftType || shiftType === "off") return { start: null, end: null };
  const st = String(shiftType);
  if (st.startsWith("custom:")) {
    const match = st.slice(7).match(/^(\d{2}:\d{2})-(\d{2}:\d{2})/);
    if (match) return { start: match[1], end: match[2] };
  }
  return (dept && shiftDefs[`${dept}:${st}`]) || shiftDefs[st] || { start: null, end: null };
}

export default function ApprovalCenter({ emps, lvReqs, otReqs, timeTransferReqs, punchFixReqs, otherReqs, shifts, shiftDefs, leaves, punches, reload }) {
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [empFilter, setEmpFilter] = useState("");
  const [commentEdit, setCommentEdit] = useState({});

  const empName = id => emps.find(e => String(e.id) === String(id))?.name || id;

  // 有給残日数チェック
  const calcRem = empId => {
    const myLeaves = (leaves || []).filter(l => String(l.empId) === String(empId));
    const td = today();
    let total = 0;
    myLeaves.forEach(l => {
      const records = (() => { try { return JSON.parse(l.records || "[]"); } catch { return []; } })();
      records.filter(r => r.type === "grant" && (!r.expiresAt || r.expiresAt >= td)).forEach(r => total += Number(r.days || 0));
    });
    const used = (lvReqs || []).filter(r => String(r.empId) === String(empId) && r.status === "approved").reduce((s, r) => s + (isHalfLeave(r.half) ? 0.5 : 1), 0);
    return total - used;
  };

  // 有給承認
  const decideLv = async (id, status) => {
    const req = (lvReqs || []).find(r => r.id === id); if (!req) return;
    if (status === "approved") {
      // 残日数チェック（不足していてもブロックせず、確認の上で承認できるようにする）
      const rem = calcRem(req.empId);
      const days = isHalfLeave(req.half) ? 0.5 : 1;
      if (rem < days) {
        const ok = confirm(`有給残日数が不足しています（残${rem}日、必要${days}日）。\nこのまま承認すると残日数がマイナスになります。承認してよろしいですか？`);
        if (!ok) return;
      }
      // シフト重なりチェック
      const shiftRow = shifts.find(s => String(s.empId) === String(req.empId) && s.date === req.date);
      const reqEmpRole = emps.find(e => String(e.id) === String(req.empId))?.role;
      const def = getShiftDef(shiftRow?.shiftType, shiftDefs, reqEmpRole);
      if (def.start) {
        if (!isHalfLeave(req.half)) {
          alert(`${req.date} はシフトが入っているため承認できません。先にシフトを休日に変更してください。`);
          return;
        }
        if (req.leaveStart && req.leaveEnd) {
          const ss = toMin(def.start), se = toMin(def.end);
          const ls = toMin(req.leaveStart), le = toMin(req.leaveEnd);
          if (ls < se && le > ss) { alert(`${req.date} の有休時間帯がシフトと重なっています。先にシフトを調整してください。`); return; }
        }
      }
    }
    try {
      await gasSave("有給申請", convertTo({ ...req, status }, LV_REQ_MAP));
      await reload();
    } catch (e) { alert("更新失敗：" + e.message); }
  };

  // 残業・早出承認
  const decideOT = async (id, status) => {
    const req = (otReqs || []).find(r => r.id === id); if (!req) return;
    try {
      await gasSave("残業申請", { id: req.id, "従業員id": req.empId, "日付": req.date, "シフト終了": req.shiftEnd, "申請退勤": req.requestedEnd, "理由": req.reason, "状態": status, "種別": req.type });
      await reload();
    } catch (e) { alert("更新失敗：" + e.message); }
  };

  // 時間振替・時間外承認
  const decideTR = async (id, status) => {
    const req = (timeTransferReqs || []).find(r => r.id === id); if (!req) return;
    try {
      await gasSave("時間振替申請", convertTo({ ...req, status }, TIME_TRANSFER_MAP));
      await reload();
    } catch (e) { alert("更新失敗：" + e.message); }
  };

  // 打刻修正承認
  const decidePF = async (id, status) => {
    const req = (punchFixReqs || []).find(r => r.id === id); if (!req) return;
    try {
      const data = { id: req.id, "従業員id": req.empId, "日付": req.date, "申請出勤": req.reqIn, "申請退勤": req.reqOut, "理由": req.reason, "状態": status, "元出勤": req.origIn, "元退勤": req.origOut };
      if (status === "approved") {
        // 打刻を実際に修正（既存レコードがあれば上書き、なければ新規作成）
        const existingPunch = (punches || []).find(p => String(p.empId) === String(req.empId) && p.date === req.date);
        const punchData = convertTo({
          id: existingPunch?.id || newId(),
          empId: req.empId, date: req.date,
          in: req.reqIn, out: req.reqOut,
          break: existingPunch?.break != null ? existingPunch.break : BREAK_MIN,
          adjusted: true,
        }, PUNCH_MAP);
        await gasSave("打刻", punchData);
      }
      await gasSave("打刻修正申請", data);
      await reload();
    } catch (e) { alert("更新失敗：" + e.message); }
  };

  // その他申請ステータス更新
  const decideOther = async (id, status) => {
    const req = (otherReqs || []).find(r => r.id === id); if (!req) return;
    const comment = commentEdit[id] || req.comment || "";
    try {
      await gasSave("その他申請", { id: req.id, "従業員id": req.empId, "日付": req.date, "内容": req.content, "状態": status, "申請日時": req.createdAt, "コメント": comment });
      setCommentEdit(prev => { const n = { ...prev }; delete n[id]; return n; });
      await reload();
    } catch (e) { alert("更新失敗：" + e.message); }
  };

  // 削除
  const deleteReq = async (sheet, id) => {
    if (!confirm("この申請を削除しますか？")) return;
    try { await gasDelete(sheet, id); await reload(); }
    catch (e) { alert("削除失敗：" + e.message); }
  };

  // 全申請を統合
  const allReqs = [
    ...(lvReqs || []).map(r => ({ ...r, _type: "leave", _label: "有給申請" })),
    ...(otReqs || []).filter(r => r.type === "early").map(r => ({ ...r, _type: "early", _label: "早出申請" })),
    ...(otReqs || []).filter(r => r.type === "overtime").map(r => ({ ...r, _type: "otextend", _label: "残業申請(PT)" })),
    ...(timeTransferReqs || []).filter(r => r.transferType === "A").map(r => ({ ...r, _type: "timetransfer", _label: "時間振替" })),
    ...(timeTransferReqs || []).filter(r => r.transferType === "C").map(r => ({ ...r, _type: "overtime", _label: "時間外申請" })),
    ...(punchFixReqs || []).map(r => ({ ...r, _type: "punchfix", _label: "打刻修正" })),
    ...(otherReqs || []).map(r => ({ ...r, _type: "other", _label: "その他" })),
  ].sort((a, b) => (b.createdAt || b.date || "") > (a.createdAt || a.date || "") ? 1 : -1);

  // フィルター適用
  const filtered = allReqs.filter(r => {
    if (typeFilter !== "all" && r._type !== typeFilter) return false;
    if (statusFilter === "pending" && r.status !== "pending") return false;
    if (statusFilter === "done" && r.status === "pending") return false;
    if (empFilter && !empName(r.empId).includes(empFilter)) return false;
    return true;
  });

  const pendingCount = allReqs.filter(r => r.status === "pending").length;

  // 行の表示内容
  const renderDetail = r => {
    if (r._type === "leave") return `${r.date}（${isHalfLeave(r.half) ? "半日" : "全日"}）${r.leaveStart ? r.leaveStart + "〜" + r.leaveEnd : ""} 理由：${r.reason || "―"}`;
    if (r._type === "early") return `${r.date} 申請開始：${r.requestedEnd || "―"} 理由：${r.reason || "―"}`;
    if (r._type === "otextend") return `${r.date} 申請退勤：${r.requestedEnd || "―"} 理由：${r.reason || "―"}`;
    if (r._type === "timetransfer") return `超過週：${r.overWeekStart} → 不足週：${r.shortWeekStart}`;
    if (r._type === "overtime") return `対象週：${r.overWeekStart}`;
    if (r._type === "punchfix") return `${r.date} 申請：${r.reqIn}〜${r.reqOut} 理由：${r.reason || "―"}`;
    if (r._type === "other") return `${r.date} ${r.content || "―"}`;
    return "―";
  };

  const renderActions = r => {
    const isPending = r.status === "pending";
    const sheetMap = { leave: "有給申請", early: "残業申請", otextend: "残業申請", timetransfer: "時間振替申請", overtime: "時間振替申請", punchfix: "打刻修正申請", other: "その他申請" };
    const sheet = sheetMap[r._type];

    if (r._type === "other") {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input type="text" placeholder="コメント" value={commentEdit[r.id] ?? (r.comment || "")}
            onChange={e => setCommentEdit(prev => ({ ...prev, [r.id]: e.target.value }))}
            style={{ ...iS, fontSize: 12, padding: "4px 8px" }} />
          <div style={{ display: "flex", gap: 4 }}>
            {["未対応", "対応中", "完了"].map(s => (
              <ABtn key={s} label={s} bg={r.status === s ? "#1251a3" : "#F5F9FE"} color={r.status === s ? "#fff" : "#374151"} onClick={() => decideOther(r.id, s)} />
            ))}
            <ABtn label="削除" bg="#FFF0F0" color="#A32D2D" onClick={() => deleteReq(sheet, r.id)} />
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {isPending ? (
          <>
            <ABtn label="承認" bg="#EAF3DE" color="#3B6D11" onClick={() => {
              if (r._type === "leave") decideLv(r.id, "approved");
              else if (r._type === "early" || r._type === "otextend") decideOT(r.id, "approved");
              else if (r._type === "timetransfer" || r._type === "overtime") decideTR(r.id, "approved");
              else if (r._type === "punchfix") decidePF(r.id, "approved");
            }} />
            <ABtn label="却下" bg="#FFF0F0" color="#A32D2D" onClick={() => {
              if (r._type === "leave") decideLv(r.id, "rejected");
              else if (r._type === "early" || r._type === "otextend") decideOT(r.id, "rejected");
              else if (r._type === "timetransfer" || r._type === "overtime") decideTR(r.id, "rejected");
              else if (r._type === "punchfix") decidePF(r.id, "rejected");
            }} />
          </>
        ) : (
          <>
            <ABtn label="差し戻し" bg="#FAEEDA" color="#854F0B" onClick={() => {
              if (r._type === "leave") decideLv(r.id, "pending");
              else if (r._type === "early" || r._type === "otextend") decideOT(r.id, "pending");
              else if (r._type === "timetransfer" || r._type === "overtime") decideTR(r.id, "pending");
              else if (r._type === "punchfix") decidePF(r.id, "pending");
            }} />
            <ABtn label="削除" bg="#FFF0F0" color="#A32D2D" onClick={() => deleteReq(sheet, r.id)} />
          </>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* フィルター */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ ...iS, width: "auto" }}>
          <option value="all">全申請種別</option>
          <option value="leave">有給申請</option>
          <option value="early">早出申請</option>
          <option value="otextend">残業申請(PT)</option>
          <option value="timetransfer">時間振替</option>
          <option value="overtime">時間外申請</option>
          <option value="punchfix">打刻修正</option>
          <option value="other">その他</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...iS, width: "auto" }}>
          <option value="pending">承認待ち（{pendingCount}件）</option>
          <option value="done">処理済み</option>
          <option value="all">すべて</option>
        </select>
        <input type="text" placeholder="スタッフ名で絞り込み" value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={{ ...iS, width: 160 }} />
      </div>

      {/* 一覧 */}
      <div style={{ ...crd, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>
          {statusFilter === "pending" ? "承認待ち" : statusFilter === "done" ? "処理済み" : "全申請"}
          <span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>{filtered.length}件</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>該当する申請はありません</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>{["種別", "スタッフ", "内容", "申請日時", "状態", "操作"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ borderBottom: "0.5px solid #e9ddd0", background: r.status === "pending" ? "#FFFEF5" : "inherit" }}>
                  <td style={tdS}><span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#E6F1FB", color: "#1251a3" }}>{r._label}</span></td>
                  <td style={{ ...tdS, fontWeight: 500 }}>{empName(r.empId)}</td>
                  <td style={{ ...tdS, color: "#374151", maxWidth: 280 }}>{renderDetail(r)}</td>
                  <td style={{ ...tdS, color: "#9ca3af", fontSize: 12, whiteSpace: "nowrap" }}>{r.createdAt ? r.createdAt.slice(0, 16).replace("T", " ") : r.date}</td>
                  <td style={tdS}><StatusBadge status={r.status} /></td>
                  <td style={{ ...tdS, minWidth: 160 }}>{renderActions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
