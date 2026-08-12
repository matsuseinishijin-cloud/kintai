// ── GAS API URL ───────────────────────────────────────────────────────────────
export const GAS_URL = "https://script.google.com/macros/s/AKfycbx7YjvfSj3N-KOevAwh-VcLnnWCaX0PnBjA24Qd2M_ApGiAU7myXp15u2LewU7lL1KaSQ/exec";

// ── 全件取得 ──────────────────────────────────────────────────────────────────
export async function gasGet(sheet) {
  const r = await fetch(`${GAS_URL}?action=getAll&sheet=${encodeURIComponent(sheet)}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

// ── 保存（upsert） ────────────────────────────────────────────────────────────
export async function gasSave(sheet, data) {
  const r = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action: "save", sheet, data }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

// ── 削除 ──────────────────────────────────────────────────────────────────────
export async function gasDelete(sheet, id) {
  const r = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action: "delete", sheet, id }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error);
  return j.data;
}

