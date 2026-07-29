// ── 時間計算ユーティリティ ────────────────────────────────────────────────────

// 2桁ゼロ埋め
export const pad = n => String(n).padStart(2, "0");

// "HH:MM" → 分数
export const toMin = t => {
  if (!t) return 0;
  const [h, m] = t.split(":");
  return +h * 60 + +m;
};

// 分数 → "Xh" or "XhYm"
export const toHStr = m => {
  if (!m || m === 0) return "0h";
  const sign = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const mn = abs % 60;
  return sign + h + "h" + (mn > 0 ? pad(mn) + "m" : "");
};

// 分数 → "HH:MM"
export const fmtTime = m => {
  if (m === null || m === undefined) return "―";
  return pad(Math.floor(m / 60)) + ":" + pad(m % 60);
};

// 今日の日付 "YYYY-MM-DD"
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 現在時刻 "HH:MM"
export const nowStr = () => {
  const d = new Date();
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};

// 月の日数
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// 月の最初の曜日（0=日）
export const firstDow = (y, m) => new Date(y, m - 1, 1).getDay();

// 切り捨て丸め（roundMin単位）
export const roundDownMin = (min, roundMin) => Math.floor(min / roundMin) * roundMin;

// ユニークID生成
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// JSON安全パース
export const safeParseJSON = (str, fallback = []) => {
  try { return JSON.parse(str || "[]"); } catch { return fallback; }
};

// 曜日
export const DOW_JP = ["日", "月", "火", "水", "木", "金", "土"];

// 日付が土日か
export const isWeekend = ds => {
  const d = new Date(ds);
  return d.getDay() === 0 || d.getDay() === 6;
};

// 15日締め期間を取得
export const getCurrentPeriod = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  if (d >= 16) {
    return { year: m === 12 ? y + 1 : y, month: m === 12 ? 1 : m + 1 };
  }
  return { year: y, month: m };
};

// 15日締め期間の開始・終了日を取得
export const getPeriodRange = (year, month) => {
  const prevM = month === 1 ? 12 : month - 1;
  const prevY = month === 1 ? year - 1 : year;
  return {
    start: `${prevY}-${pad(prevM)}-16`,
    end: `${year}-${pad(month)}-15`,
    label: `${prevY}/${pad(prevM)}/16 〜 ${year}/${pad(month)}/15`,
  };
};

// 期間内の全日付リストを生成（タイムゾーン安全）
export const getPeriodDays = (year, month) => {
  const range = getPeriodRange(year, month);
  const [sy, sm, sd] = range.start.split("-").map(Number);
  const [ey, em, ed] = range.end.split("-").map(Number);
  const days = [];
  let cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cur <= end) {
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};
