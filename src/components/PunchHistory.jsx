import { useState } from "react";
import { gasDelete } from "../api/gas";
import { sortEmps } from "../constants";

const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };
const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "auto" };
const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
const bD = { padding: "4px 10px", borderRadius: 6, border: "none", background: "#FFF0F0", color: "#A32D2D", fontSize: 11, cursor: "pointer" };
const thS = { padding: "8px 10px", fontSize: 11, color: "#6b7280", borderBottom: "1px solid #e9ddd0", textAlign: "left", fontWeight: 500, whiteSpace: "nowrap" };
const tdS = { padding: "8px 10px", fontSize: 13, borderBottom: "0.5px solid #e9ddd0", whiteSpace: "nowrap" };

export default function PunchHistory({ emps, punches, reload }) {
  const [empFilter, setEmpFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  const empName = id => emps.find(e => String(e.id) === String(id))?.name || `(不明:${id})`;

  // 同一従業員・同一日付の重複を検出
  const countMap = {};
  (punches || []).forEach(p => {
    const key = `${p.empId}_${p.date}`;
    countMap[key] = (countMap[key] || 0) + 1;
  });
  const dupKeys = new Set(Object.entries(countMap).filter(([, c]) => c > 1).map(([k]) => k));

  const filtered = (punches || [])
    .filter(p => (!empFilter || String(p.empId) === String(empFilter)) && (!monthFilter || (p.date || "").startsWith(monthFilter)))
    .sort((a, b) => {
      const d = (b.date || "").localeCompare(a.date || "");
      if (d !== 0) return d;
      return empName(a.empId).localeCompare(empName(b.empId));
    });

  const del = async p => {
    if (!confirm(`${empName(p.empId)}さんの ${p.date} の打刻（出勤:${p.in || "―"} / 退勤:${p.out || "―"}）を削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      await gasDelete("打刻", p.id);
      await reload();
    } catch (e) { alert("削除失敗：" + e.message); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <select value={empFilter} onChange={e => setEmpFilter(e.target.value)} style={iS}>
          <option value="">全従業員</option>
          {sortEmps(emps).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} style={iS} />
        {(empFilter || monthFilter) && <button onClick={() => { setEmpFilter(""); setMonthFilter(""); }} style={bS}>絞り込み解除</button>}
      </div>

      {dupKeys.size > 0 && (
        <div style={{ marginBottom: "1rem", padding: "10px 14px", background: "#FFF0F0", border: "1px solid #F09595", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>
          ⚠️ 同じ従業員・同じ日付の打刻データが複数件存在する箇所が {dupKeys.size} 件あります（下表で赤くハイライト）。誤操作による重複の可能性があるので確認してください。
        </div>
      )}

      <div style={{ ...crd, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e9ddd0", fontSize: 14, fontWeight: 600 }}>
          打刻履歴（生データ）<span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>{filtered.length}件</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>該当データがありません</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>{["id", "従業員", "日付", "出勤", "退勤", "休憩(分)", "補正済", "操作"].map(h => <th key={h} style={thS}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isDup = dupKeys.has(`${p.empId}_${p.date}`);
                  const adjusted = p.adjusted === true || p.adjusted === "true" || p.adjusted === "TRUE";
                  return (
                    <tr key={p.id} style={{ borderBottom: "0.5px solid #e9ddd0", background: isDup ? "#FFF5F5" : "inherit" }}>
                      <td style={{ ...tdS, fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>{p.id}</td>
                      <td style={{ ...tdS, fontWeight: 500 }}>
                        {empName(p.empId)}
                        {isDup && <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 99, fontSize: 10, background: "#FFF0F0", color: "#A32D2D" }}>重複</span>}
                      </td>
                      <td style={tdS}>{p.date}</td>
                      <td style={tdS}>{p.in || "―"}</td>
                      <td style={tdS}>{p.out || "―"}</td>
                      <td style={tdS}>{p.break != null && p.break !== "" ? p.break : "―"}</td>
                      <td style={tdS}>{adjusted ? <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, background: "#EEEDFE", color: "#3C3489" }}>補正済</span> : "―"}</td>
                      <td style={tdS}><button onClick={() => del(p)} style={bD}>削除</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
