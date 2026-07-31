// ── 職種・雇用形態 ────────────────────────────────────────────────────────────
export const ROLES = ["医療事務", "理学療法士", "看護師", "リハマネ", "AT", "放射線技師"];
export const TYPES = ["正社員", "パート"];

// ── 社員番号採番ルール ────────────────────────────────────────────────────────
export const EMP_ID_PREFIX = {
  "医療事務_正社員":   11,
  "医療事務_パート":   12,
  "理学療法士_正社員": 21,
  "理学療法士_パート": 22,
  "看護師_正社員":     31,
  "看護師_パート":     32,
  "リハマネ_パート":   42,
  "AT_正社員":         51,
  "AT_パート":         52,
  "放射線技師_正社員": 61,
  "放射線技師_パート": 62,
};

// ── 管理者パスワード ──────────────────────────────────────────────────────────
export const ADMIN_PASSWORD = "1950";

// ── 休憩時間（分） ────────────────────────────────────────────────────────────
export const BREAK_MIN = 60;

// ── 残業丸めルール ────────────────────────────────────────────────────────────
// type: "round"=丸めあり, "approval"=申請制, "fixed"=固定残業
export const OT_RULES = {
  "医療事務_正社員":    { type: "round",    roundMin: 15 },
  "医療事務_パート":    { type: "round",    roundMin: 10 },
  "理学療法士_正社員":  { type: "fixed",    roundMin: 15 }, // limitHは従業員ごと（20h or 16h）
  "理学療法士_パート":  { type: "approval", roundMin: 10, capMin: 7 },
  "看護師_正社員":      { type: "round",    roundMin: 15 },
  "看護師_パート":      { type: "round",    roundMin: 10 },
  "リハマネ_パート":    { type: "round",    roundMin: 10 },
  "AT_正社員":          { type: "fixed",    roundMin: 15, limitH: 20 },
  "AT_パート":          { type: "round",    roundMin: 10 },
  "放射線技師_正社員":  { type: "round",    roundMin: 15 },
  "放射線技師_パート":  { type: "round",    roundMin: 10 },
};

export const getOtRule = emp => OT_RULES[`${emp.role}_${emp.type}`] || { type: "round", roundMin: 15 };

// ── 早出申請対象職種 ──────────────────────────────────────────────────────────
export const EARLY_TARGET_ROLES = ["看護師", "医療事務", "放射線技師"];

// ── 時間外申請対象（理学療法士正社員・週所定40h未満） ─────────────────────────
export const isOvertimeTarget = emp =>
  emp.role === "理学療法士" && emp.type === "正社員" &&
  !!emp.weeklyLimit && Number(emp.weeklyLimit) < 40;

// ── 半休判定（am/pmのみ半休、それ以外は全日） ─────────────────────────────────
export const isHalfLeave = half => half === "am" || half === "pm";

// ── 責任者ロール ──────────────────────────────────────────────────────────────
export const REHA_LEAD_ROLES = ["理学療法士", "リハマネ", "AT"]; // リハ科責任者の担当
export const SHIFT_LEAD_ROLES = ["医療事務", "看護師", "放射線技師"]; // シフト責任者の担当

// ── アバターカラー ────────────────────────────────────────────────────────────
export const AVATAR_COLORS = [
  ["#E6F1FB", "#185FA5"], ["#EAF3DE", "#3B6D11"], ["#FAEEDA", "#854F0B"],
  ["#E1F5EE", "#0F6E56"], ["#FAECE7", "#993C1D"], ["#EEEDFE", "#3C3489"],
  ["#E1F5EE", "#085041"], ["#F5C4B3", "#712B13"], ["#C0DD97", "#27500A"],
];

// ── スプレッドシートマッピング ─────────────────────────────────────────────────
export const EMP_MAP    = { id:"id", "氏名":"name", "職種":"role", "雇用形態":"type", "週間労働時間":"weeklyLimit", "固定残業時間":"fixedOTLimit", "責任者":"isLead" };
export const SHIFT_MAP  = { id:"id", "従業員id":"empId", "日付":"date", "シフト種別":"shiftType" };
export const PUNCH_MAP  = { id:"id", "従業員id":"empId", "日付":"date", "出勤":"in", "退勤":"out", "休憩":"break", "補正済":"adjusted" };
export const LV_REQ_MAP = { id:"id", "従業員id":"empId", "日付":"date", "区分":"type", "理由":"reason", "状態":"status", "半日":"half", "有休開始":"leaveStart", "有休終了":"leaveEnd" };
export const LEAVE_MAP  = { id:"id", "従業員id":"empId", "付与日数":"granted", "取得日数":"used", "履歴":"records" };
export const PW_MAP     = { id:"id", "従業員id":"empId", "パスワード":"password" };
export const PUNCH_FIX_MAP = { id:"id", "従業員id":"empId", "日付":"date", "申請出勤":"reqIn", "申請退勤":"reqOut", "理由":"reason", "状態":"status", "元出勤":"origIn", "元退勤":"origOut", "申請日時":"createdAt", "コメント":"comment" };
export const TIME_TRANSFER_MAP = { id:"id", "従業員id":"empId", "タイプ":"transferType", "不足週開始日":"shortWeekStart", "超過週開始日":"overWeekStart", "不足日":"shortDate", "超過日":"overDate", "相殺時間":"offsetMin", "理由":"reason", "状態":"status", "申請日時":"createdAt" };
export const EARLY_MAP  = { id:"id", "従業員id":"empId", "日付":"date", "シフト開始":"shiftStart", "申請開始":"requestedStart", "理由":"reason", "状態":"status", "申請日時":"createdAt" };
export const OTHER_REQ_MAP = { id:"id", "従業員id":"empId", "日付":"date", "内容":"content", "状態":"status", "申請日時":"createdAt", "コメント":"comment" };

// マッピング変換関数
export function convertFrom(row, map) {
  const o = {};
  Object.entries(map).forEach(([jp, en]) => {
    if (row[jp] !== undefined) {
      const v = row[jp];
      o[en] = (en === "id" || en === "empId")
        ? (v !== null && v !== undefined && v !== "" ? String(v) : v)
        : v;
    }
  });
  return o;
}

export function invertMap(m) {
  const r = {};
  Object.entries(m).forEach(([k, v]) => r[v] = k);
  return r;
}

export function convertTo(obj, map) {
  const inv = invertMap(map);
  const o = {};
  Object.entries(inv).forEach(([en, jp]) => {
    if (obj[en] !== undefined) o[jp] = obj[en];
  });
  return o;
}
