/**
 * appleHealthParser — Apple Health export.xml から歩数を日次集計する
 *
 * ## 入力形式
 * Apple Health の export.xml（Readable Stream）。
 * 対象要素: `<Record type="HKQuantityTypeIdentifierStepCount" startDate="YYYY-MM-DD HH:MM:SS +0900" value="N"/>`
 *
 * ## 集計ロジック
 * - startDate の日付部分（YYYY-MM-DD）を JST 日付キーとして使用する
 * - 同日の全 Record の value を合算する
 * - 整数以外・負の value は除外する
 *
 * ## 注意
 * export.xml は 200MB+ になりうるため、SAX ストリーミングパーサーで処理する。
 * DOMParser / XML 全体のバッファリングは行わない。
 */

import sax from "sax";
import type { Readable } from "stream";

/** YYYY-MM-DD をキーとする日次歩数マップ */
export type DailyStepMap = Map<string, number>;

/**
 * Apple Health export.xml の Readable ストリームを SAX パースし、
 * 歩数（HKQuantityTypeIdentifierStepCount）を日次集計して返す。
 *
 * @param xmlStream - export.xml の Node.js Readable stream
 * @returns YYYY-MM-DD → 歩数合計 の Map
 */
export function parseAppleHealthStepCount(xmlStream: Readable): Promise<DailyStepMap> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false, normalize: false });
    const dailySteps: DailyStepMap = new Map();

    parser.on("opentag", (node) => {
      if (node.name !== "Record") return;
      const attrs = node.attributes as Record<string, string>;
      if (attrs["type"] !== "HKQuantityTypeIdentifierStepCount") return;

      const startDate = attrs["startDate"];
      const valueStr  = attrs["value"];
      if (!startDate || !valueStr) return;

      // startDate は "YYYY-MM-DD HH:MM:SS +0900" 形式（JST）
      // 日付部分を直接スライスする（new Date() は UTC 解釈になるため使用しない）
      const dateKey = startDate.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;

      const value = parseInt(valueStr, 10);
      if (!Number.isInteger(value) || value < 0) return;

      dailySteps.set(dateKey, (dailySteps.get(dateKey) ?? 0) + value);
    });

    parser.on("error", (err) => {
      reject(new Error(`Apple Health XML parse error: ${err.message}`));
    });

    parser.on("end", () => {
      resolve(dailySteps);
    });

    xmlStream.pipe(parser);
    xmlStream.on("error", (err) => {
      reject(new Error(`Apple Health XML stream error: ${err.message}`));
    });
  });
}

/**
 * ZIP の ArrayBuffer から export.xml エントリを抽出し、
 * 歩数の日次集計 Map を返す。
 *
 * @param zipBuffer - ZIP ファイルの ArrayBuffer
 * @returns YYYY-MM-DD → 歩数合計 の Map
 * @throws ZIP に export.xml が含まれない場合
 */
export async function parseAppleHealthZip(zipBuffer: ArrayBuffer): Promise<DailyStepMap> {
  const unzipper = await import("unzipper");
  const { Readable } = await import("stream");

  const nodeBuffer = Buffer.from(zipBuffer);
  const bufferStream = Readable.from(nodeBuffer);

  return new Promise((resolve, reject) => {
    let found = false;

    bufferStream
      .pipe(unzipper.Parse({ forceStream: true }))
      .on("entry", (entry: { path: string; type: string; autodrain: () => void; pipe: (dest: unknown) => unknown }) => {
        if (entry.path === "apple_health_export/export.xml" && entry.type === "File") {
          found = true;
          parseAppleHealthStepCount(entry as unknown as Readable)
            .then(resolve)
            .catch(reject);
        } else {
          entry.autodrain();
        }
      })
      .on("finish", () => {
        if (!found) {
          reject(new Error("apple_health_export/export.xml が ZIP 内に見つかりません"));
        }
      })
      .on("error", (err: Error) => {
        reject(new Error(`ZIP 展開エラー: ${err.message}`));
      });
  });
}
