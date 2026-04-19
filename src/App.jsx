// ── 設定 ──────────────────────────────────────────────────────────────────────
const HEADERS = {
  "従業員":        ["id","氏名","職種","雇用形態","責任者","週上限時間"],
  "シフト":        ["id","従業員id","日付","シフト種別"],
  "打刻":          ["id","従業員id","日付","出勤","退勤","休憩","補正済"],
  "残業申請":      ["id","従業員id","日付","シフト終了","申請退勤","理由","状態","種別"],
  "有給申請":      ["id","従業員id","日付","理由","状態","半日"],
  "有給":          ["id","従業員id","付与日数","取得日数","履歴"],
  "パスワード":    ["id","従業員id","パスワード"],
  "シフト定義":    ["id","部署","キー","名前","開始","終了","色","文字色","順番","休憩"],
  "打刻修正申請":  ["id","従業員id","日付","申請出勤","申請退勤","理由","状態","元出勤","元退勤"],
  "振替申請":      ["id","従業員id","振替出勤日","振替出勤シフト","振替休日","理由","状態"],
  "週間パターン":  ["id","職種","パターン名","月","火","水","木","金","土","日"],
  "シフト確認申請":["id","従業員id","日付","理由","理由詳細","開始時刻","終了時刻","承認シフト","状態"],
};

// ── エントリポイント ──────────────────────────────────────────────────────────
function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const body   = e.postData ? JSON.parse(e.postData.contents || "{}") : {};
    const action = params.action || body.action;
    const sheet  = params.sheet  || body.sheet;

    let result;
    if      (action === "getAll")    result = getAll(sheet);
    else if (action === "save")      result = save(sheet, body.data);
    else if (action === "saveMany")  result = saveMany(sheet, body.dataList);
    else if (action === "delete")    result = deleteRow(sheet, body.id);
    else if (action === "ping")      result = { ok: true };
    else throw new Error("unknown action: " + action);

    return jsonResponse({ ok: true, data: result });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── id/従業員id 列かどうか判定 ────────────────────────────────────────────────
function isIdCol(colName) {
  return colName === "id" || colName === "従業員id";
}

// ── id列を文字列形式に設定するヘルパー ────────────────────────────────────────
function applyTextFormat(sheet, headers) {
  const lastRow = sheet.getMaxRows();
  headers.forEach((h, i) => {
    if (isIdCol(h)) {
      sheet.getRange(1, i + 1, lastRow, 1).setNumberFormat("@");
    }
  });
}

// ── キャッシュヘルパー ─────────────────────────────────────────────────────────
const CACHE_DURATION = 60; // キャッシュ有効期間（秒）
// キャッシュ不要なシート（頻繁に更新されるもの）
const NO_CACHE_SHEETS = ["残業申請","有給申請","打刻修正申請","パスワード","シフト確認申請"];

function getCacheKey(sheetName) { return "kintai_cache_" + sheetName; }

function getFromCache(sheetName) {
  if (NO_CACHE_SHEETS.includes(sheetName)) return null;
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(getCacheKey(sheetName));
    if (cached) return JSON.parse(cached);
  } catch(e) {}
  return null;
}

function setToCache(sheetName, data) {
  if (NO_CACHE_SHEETS.includes(sheetName)) return;
  try {
    const cache = CacheService.getScriptCache();
    const json = JSON.stringify(data);
    // キャッシュは100KBまで
    if (json.length < 100000) {
      cache.put(getCacheKey(sheetName), json, CACHE_DURATION);
    }
  } catch(e) {}
}

function invalidateCache(sheetName) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(getCacheKey(sheetName));
  } catch(e) {}
}

// ── 全件取得 ──────────────────────────────────────────────────────────────────
function getAll(sheetName) {
  // キャッシュを確認
  const cached = getFromCache(sheetName);
  if (cached) return cached;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("シートが見つかりません: " + sheetName);

  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  if (lastCol === 0 || lastRow === 0) return [];

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  applyTextFormat(sheet, headers);

  if (lastRow <= 1) return [];

  const displayValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getDisplayValues();

  const result = displayValues.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val === "" || val === null || val === undefined) {
        obj[h] = null;
      } else if (isIdCol(h)) {
        obj[h] = String(val);
      } else {
        const num = Number(val);
        obj[h] = isNaN(num) || val.trim() === "" ? val : num;
      }
    });
    return obj;
  }).filter(row => row["id"] !== null && row["id"] !== "");

  // キャッシュに保存
  setToCache(sheetName, result);
  return result;
}

// ── 保存（upsert） ────────────────────────────────────────────────────────────
function save(sheetName, data) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("シートが見つかりません: " + sheetName);

  if (sheet.getLastRow() === 0) {
    const h = HEADERS[sheetName];
    if (h) sheet.appendRow(h);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idIdx   = headers.indexOf("id");

  applyTextFormat(sheet, headers);

  let targetRow = -1;
  if (idIdx >= 0 && data.id) {
    const idColValues = sheet.getLastRow() > 1
      ? sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1).getDisplayValues()
      : [];
    for (let i = 0; i < idColValues.length; i++) {
      if (String(idColValues[i][0]) === String(data.id)) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const row = headers.map(h => {
    let val = data[h] !== undefined ? data[h] : "";
    if (isIdCol(h) && val !== "") {
      val = String(val);
    }
    return val;
  });

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
    headers.forEach((h, i) => {
      if (isIdCol(h)) {
        sheet.getRange(targetRow, i + 1).setNumberFormat("@");
      }
    });
  } else {
    sheet.appendRow(row);
    const newRow = sheet.getLastRow();
    headers.forEach((h, i) => {
      if (isIdCol(h)) {
        sheet.getRange(newRow, i + 1).setNumberFormat("@");
      }
    });
  }

  invalidateCache(sheetName);
  return { saved: String(data.id) };
}

// ── 複数件一括保存 ────────────────────────────────────────────────────────────
function saveMany(sheetName, dataList) {
  if (!dataList || dataList.length === 0) return { saved: 0 };
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("シートが見つかりません: " + sheetName);

  if (sheet.getLastRow() === 0) {
    const h = HEADERS[sheetName];
    if (h) sheet.appendRow(h);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idIdx   = headers.indexOf("id");
  applyTextFormat(sheet, headers);

  // 既存データのid→行番号マップ と 従業員id+日付→行番号マップを作成
  const idToRow = {};
  const empDateToRow = {};
  if (idIdx >= 0 && sheet.getLastRow() > 1) {
    const allValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
    const empIdIdx = headers.indexOf("従業員id");
    const dateIdx  = headers.indexOf("日付");
    allValues.forEach((row, i) => {
      const rowNum = i + 2;
      if (row[idIdx]) idToRow[String(row[idIdx])] = rowNum;
      if (empIdIdx >= 0 && dateIdx >= 0 && row[empIdIdx] && row[dateIdx]) {
        empDateToRow[String(row[empIdIdx]) + "_" + String(row[dateIdx])] = rowNum;
      }
    });
  }

  // 更新行と追加行を分類
  const toUpdate = []; // {rowNum, rowData}
  const toAppend = []; // rowData[]

  dataList.forEach(data => {
    const row = headers.map(h => {
      let val = data[h] !== undefined ? data[h] : "";
      if (isIdCol(h) && val !== "") val = String(val);
      return val;
    });
    // IDで検索→なければ従業員id+日付の複合キーで検索
    let existingRow = data.id ? idToRow[String(data.id)] : null;
    if (!existingRow && data["従業員id"] && data["日付"]) {
      existingRow = empDateToRow[String(data["従業員id"]) + "_" + String(data["日付"])];
    }
    if (existingRow) {
      toUpdate.push({ rowNum: existingRow, row });
    } else {
      toAppend.push(row);
    }
  });

  // 更新：行ごとにsetValues
  toUpdate.forEach(({ rowNum, row }) => {
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([row]);
    headers.forEach((h, i) => {
      if (isIdCol(h)) sheet.getRange(rowNum, i + 1).setNumberFormat("@");
    });
  });

  // 追加：まとめてappend
  if (toAppend.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, toAppend.length, headers.length).setValues(toAppend);
    headers.forEach((h, i) => {
      if (isIdCol(h)) sheet.getRange(startRow, i + 1, toAppend.length, 1).setNumberFormat("@");
    });
  }

  invalidateCache(sheetName);
  return { saved: dataList.length };
}

// ── 行削除 ────────────────────────────────────────────────────────────────────
function deleteRow(sheetName, id) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error("シートが見つかりません: " + sheetName);

  if (sheet.getLastRow() <= 1) throw new Error("行が見つかりません: " + id);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idIdx   = headers.indexOf("id");
  if (idIdx < 0) throw new Error("id列がありません");

  const idColValues = sheet.getRange(2, idIdx + 1, sheet.getLastRow() - 1, 1).getDisplayValues();
  for (let i = 0; i < idColValues.length; i++) {
    if (String(idColValues[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      invalidateCache(sheetName);
      return { deleted: String(id) };
    }
  }
  throw new Error("行が見つかりません: " + id);
}

// ── 全シートのヘッダー初期化（新規シートのみ） ───────────────────────────────
function initHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(HEADERS).forEach(([name, headers]) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) { Logger.log("シートなし: " + name); return; }
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
    applyTextFormat(sheet, headers);
    Logger.log("処理完了: " + name);
  });
  Logger.log("initHeaders 完了");
}

// ── 不足列を既存シートに追加する ─────────────────────────────────────────────
function addMissingHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Object.entries(HEADERS).forEach(([name, expectedHeaders]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(expectedHeaders);
      applyTextFormat(sheet, expectedHeaders);
      Logger.log("新規シート作成: " + name);
      return;
    }

    const lastCol = sheet.getLastColumn();
    const existingHeaders = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      : [];

    const missing = expectedHeaders.filter(h => !existingHeaders.includes(h));

    if (missing.length === 0) {
      Logger.log("変更なし: " + name);
      return;
    }

    missing.forEach(h => {
      const newCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, newCol).setValue(h);
      if (isIdCol(h)) {
        sheet.getRange(1, newCol, sheet.getMaxRows(), 1).setNumberFormat("@");
      }
      Logger.log("列追加: " + name + " → " + h);
    });

    const updatedHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    applyTextFormat(sheet, updatedHeaders);

    Logger.log("更新完了: " + name + " （追加: " + missing.join(", ") + "）");
  });

  Logger.log("addMissingHeaders 完了");
}

// ── 既存データのID列を一括で文字列に変換するユーティリティ ───────────────────
function fixExistingIds() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(HEADERS).forEach(([name, headers]) => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() <= 1) return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const headerRow = allValues[0];

    headerRow.forEach((h, colIdx) => {
      if (!isIdCol(h)) return;
      sheet.getRange(1, colIdx + 1, lastRow, 1).setNumberFormat("@");
      for (let r = 1; r < allValues.length; r++) {
        const val = allValues[r][colIdx];
        if (val !== "" && val !== null && val !== undefined) {
          sheet.getRange(r + 1, colIdx + 1).setValue(String(val));
        }
      }
    });
    Logger.log("fixExistingIds 完了: " + name);
  });
  Logger.log("全シート fixExistingIds 完了");
}

// ── コールドスタート対策（5分トリガーで実行） ─────────────────────────────────
function warmUp() {
  Logger.log("warmUp: " + new Date().toISOString());
}

// ── レスポンス生成 ────────────────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}