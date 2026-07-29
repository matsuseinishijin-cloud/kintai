import { useState, useEffect, useCallback } from "react";
import { gasGet } from "./api/gas";
import { newId, today } from "./utils/time";
import { ADMIN_PASSWORD, ROLES, convertFrom, EMP_MAP, PW_MAP } from "./constants";

// ── グローバルCSS ─────────────────────────────────────────────────────────────
const _style = document.createElement("style");
_style.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #fdf8f2;
    min-height: 100vh;
    font-family: "Hiragino Sans", "Yu Gothic", sans-serif;
    font-size: 16px;
    color: #111827;
  }
  :root {
    --color-background-primary: #ffffff;
    --color-background-secondary: #fef9f3;
    --color-text-primary: #111827;
    --color-text-secondary: #374151;
    --color-text-tertiary: #6b7280;
    --color-border-secondary: #d1d5db;
    --color-border-tertiary: #e9ddd0;
    --color-accent: #1251a3;
  }
  #root { max-width: 1200px; margin: 0 auto; padding: 1rem; }
  select, input, textarea { font-family: inherit; }
`;
document.head.appendChild(_style);

// ── UI共通スタイル ─────────────────────────────────────────────────────────────
export const iS = { padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, width: "100%" };
export const bP = { padding: "8px 18px", borderRadius: 8, background: "#1251a3", color: "white", border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer" };
export const bS = { padding: "8px 14px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#111827", fontSize: 14, cursor: "pointer" };
export const crd = { background: "#fff", border: "1px solid #e9ddd0", borderRadius: 12 };

// ── Loading / Error ───────────────────────────────────────────────────────────
function Loading() {
  return <div style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>読み込み中...</div>;
}
function Err({ msg }) {
  return <div style={{ padding: "1rem", background: "#FFF0F0", borderRadius: 8, color: "#A32D2D" }}>エラー：{msg}</div>;
}

// ── ログイン画面 ──────────────────────────────────────────────────────────────
function LoginScreen({ emps, passwords, onLogin }) {
  const [mode, setMode] = useState("admin");
  const [roleFilter, setRoleFilter] = useState("全て");
  const [sel, setSel] = useState(emps[0]?.id || "");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const allRoles = ["全て", ...ROLES];
  const filteredEmps = roleFilter === "全て" ? emps : emps.filter(e => e.role === roleFilter);

  const onRoleChange = r => {
    setRoleFilter(r);
    const first = (r === "全て" ? emps : emps.filter(e => e.role === r))[0];
    if (first) setSel(first.id);
  };

  const doLogin = () => {
    setErr("");
    if (mode === "admin") {
      if (pw === ADMIN_PASSWORD) { onLogin("admin"); }
      else { setErr("パスワードが違います"); }
    } else {
      const pwRec = passwords.find(p => p.empId === sel);
      const correct = pwRec?.password || String(sel);
      if (pw === correct) { onLogin(sel); }
      else { setErr("パスワードが違います"); }
    }
  };

  return (
    <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...crd, padding: "2rem", width: 360 }}>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>クリニック勤怠</div>
        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: "1.5rem" }}>ログイン</div>

        {/* モード選択 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: "1.5rem" }}>
          {["admin", "employee"].map(m => (
            <button key={m} onClick={() => { setMode(m); setPw(""); setErr(""); }}
              style={{ padding: "10px 0", borderRadius: 8, border: mode === m ? "2px solid #1251a3" : "1px solid #d1d5db", background: mode === m ? "#E6F1FB" : "#fff", color: mode === m ? "#1251a3" : "#111827", fontWeight: mode === m ? 600 : 400, cursor: "pointer", fontSize: 14 }}>
              {m === "admin" ? "管理者" : "従業員"}
            </button>
          ))}
        </div>

        {/* 従業員選択 */}
        {mode === "employee" && (
          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>職種で絞り込み</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
              {allRoles.map(r => (
                <button key={r} onClick={() => onRoleChange(r)}
                  style={{ padding: "3px 10px", borderRadius: 6, border: roleFilter === r ? "2px solid #1251a3" : "1px solid #d1d5db", background: roleFilter === r ? "#E6F1FB" : "#fff", color: roleFilter === r ? "#1251a3" : "#6b7280", fontSize: 12, cursor: "pointer" }}>
                  {r}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>従業員を選択</div>
            <select value={sel} onChange={e => { setSel(e.target.value); setPw(""); }} style={iS}>
              {filteredEmps.map(e => (
                <option key={e.id} value={e.id}>[{e.id}] {e.name}（{e.role}・{e.type}）</option>
              ))}
            </select>
          </div>
        )}

        {/* パスワード */}
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>パスワード（4桁）</div>
          <input type="password" maxLength={4} value={pw}
            onChange={e => setPw(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && doLogin()}
            placeholder="••••"
            style={{ ...iS, letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }} />
          {mode === "employee" && (
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>初期パスワードは社員番号です</div>
          )}
        </div>

        {err && <div style={{ marginBottom: 10, padding: "6px 10px", background: "#FFF0F0", borderRadius: 8, fontSize: 13, color: "#A32D2D" }}>{err}</div>}

        <button onClick={doLogin} disabled={pw.length !== 4}
          style={{ ...bP, width: "100%", padding: "10px 0", fontSize: 15, opacity: pw.length === 4 ? 1 : 0.4 }}>
          ログイン
        </button>
      </div>
    </div>
  );
}

// ── メインアプリ ──────────────────────────────────────────────────────────────
export default function App() {
  const [emps, setEmps] = useState([]);
  const [passwords, setPasswords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loginId, setLoginId] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [e, pw] = await Promise.all([
        gasGet("従業員"),
        gasGet("パスワード"),
      ]);
      setEmps(e.map(r => convertFrom(r, EMP_MAP)));
      setPasswords(pw.map(r => convertFrom(r, PW_MAP)));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return <Loading />;
  if (error) return <Err msg={error} />;
  if (!loginId) return <LoginScreen emps={emps} passwords={passwords} onLogin={id => setLoginId(id)} />;

  return (
    <div style={{ fontFamily: "var(--font-sans)", padding: "0 0 2rem" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", ...crd, marginBottom: "1rem" }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>クリニック勤怠</div>
        <button onClick={() => setLoginId(null)} style={bS}>ログアウト</button>
      </div>

      {/* メインコンテンツ（今後ここに各画面を追加） */}
      <div style={{ ...crd, padding: "2rem", textAlign: "center", color: "#6b7280" }}>
        ログイン成功！画面を準備中です。<br />
        ログインID: {loginId}
      </div>
    </div>
  );
}
