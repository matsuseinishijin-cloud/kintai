// ── GAS API URL ───────────────────────────────────────────────────────────────
export const GAS_URL = "https://script.google.com/macros/s/AKfycbx7YjvfSj3N-KOevAwh-VcLnnWCaX0PnBjA24Qd2M_ApGiAU7myXp15u2LewU7lL1KaSQ/exec";

// ── 通信の自動再試行 ──────────────────────────────────────────────────────────
// Google側の一時的な失敗（ネットワークの途切れ、JSONではなくHTMLのエラーページが返る、
// ロックの待ち時間切れ）のときだけ、同じ内容でもう一度送る。
// ・保存データは送る前にidが決まっており、再試行でも同じ内容・同じidを送るため、二重登録にならない。
// ・「シートが見つかりません」など、アプリ側が返した業務上のエラーは再試行しない（そのままエラーにする）。
const RETRY_DELAYS_MS = [800, 2000]; // 1回目・2回目の再試行までの待ち時間（合計で最大3回送る）

class TransientGasError extends Error {}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// url/init で通信し、成功したら j.data を返す。
// notFoundIsSuccess: 削除用。再試行後に「行が見つかりません」が返ったら、
//   1回目の削除が実は成功していたと判断して成功扱いにする（削除は2回目に失敗しやすいため）。
async function callGas(url, init, notFoundIsSuccess) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1] + Math.random() * 300);
    try {
      let r, text;
      try {
        r = await fetch(url, init);
        text = await r.text();
      } catch (e) {
        throw new TransientGasError("ネットワークに接続できませんでした");
      }
      let j;
      try {
        j = JSON.parse(text);
      } catch (e) {
        throw new TransientGasError("サーバーから想定外の応答が返りました（HTTP " + r.status + "）");
      }
      if (!j.ok) {
        const msg = String(j.error || "");
        if (/Lock timeout|ロック/.test(msg)) throw new TransientGasError("他の処理が混み合っていました");
        if (attempt > 0 && notFoundIsSuccess && msg.includes("行が見つかりません")) return notFoundIsSuccess;
        throw new Error(msg); // 業務上のエラーは再試行しない
      }
      return j.data;
    } catch (e) {
      if (!(e instanceof TransientGasError)) throw e;
      lastErr = e;
    }
  }
  throw new Error("通信が不安定なため完了できませんでした。しばらくしてから、もう一度お試しください。（" + lastErr.message + "）");
}

// ── 全件取得 ──────────────────────────────────────────────────────────────────
export async function gasGet(sheet) {
  return callGas(`${GAS_URL}?action=getAll&sheet=${encodeURIComponent(sheet)}`, { cache: "no-store" });
}

// ── 保存（upsert） ────────────────────────────────────────────────────────────
export async function gasSave(sheet, data) {
  const body = JSON.stringify({ action: "save", sheet, data }); // 再試行でも同じ内容（同じid）を送る
  return callGas(GAS_URL, { method: "POST", body });
}

// ── 一括保存（upsert・複数件をまとめて1回の通信で処理） ─────────────────────────
// シフト画面など、複数セルをまとめて保存する場面で使用。gasSaveをN回呼ぶより高速。
export async function gasSaveBatch(sheet, dataArray) {
  const body = JSON.stringify({ action: "saveBatch", sheet, data: dataArray }); // 再試行でも同じ内容（同じid）を送る
  return callGas(GAS_URL, { method: "POST", body });
}

// ── 削除 ──────────────────────────────────────────────────────────────────────
export async function gasDelete(sheet, id) {
  const body = JSON.stringify({ action: "delete", sheet, id });
  return callGas(GAS_URL, { method: "POST", body }, { deleted: id });
}
