/**
 * StatusNotice — ページレベルの通知バナー
 *
 * page.tsx に散在していた `rounded-2xl border bg-{color}-50 px-5 py-3 text-sm text-{color}-700`
 * パターンを統一する共通コンポーネント。
 *
 * ## 状態分類 (status)
 *   error   — データ取得失敗・致命的エラー。赤系 (rose)
 *   caution — 注意が必要な状態（ML バッチ未実行・stale など）。黄系 (amber)
 *
 * ## 意味論の整理
 *   - error: query 関数が kind:"error" を返したときなど、
 *            ユーザーが操作できない問題が発生した場合
 *   - caution: データが古い・バッチ未実行など、
 *              状態として許容できるが注意が必要な場合
 *
 * ## ダークモード対応の注意点
 * 将来 dark: ユーティリティを追加する場合は NOTICE_CONFIG の各エントリに追記するだけ。
 *
 * #378 で追加。
 */

export type StatusNoticeVariant = "error" | "caution";

// ── 色設定 ───────────────────────────────────────────────────────────────────
const NOTICE_CONFIG: Record<StatusNoticeVariant, { border: string; bg: string; text: string }> = {
  error:   { border: "border-rose-100",  bg: "bg-rose-50",  text: "text-rose-700"  },
  caution: { border: "border-amber-100", bg: "bg-amber-50", text: "text-amber-700" },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface StatusNoticeProps {
  status: StatusNoticeVariant;
  children: React.ReactNode;
  /** 追加の wrapper クラス（mb-4, mb-5 などのマージン調整用） */
  className?: string;
}

// ── コンポーネント ────────────────────────────────────────────────────────────

export function StatusNotice({ status, children, className = "" }: StatusNoticeProps) {
  const cfg = NOTICE_CONFIG[status];
  return (
    <div
      className={`rounded-2xl border px-5 py-3 text-sm ${cfg.border} ${cfg.bg} ${cfg.text} ${className}`}
    >
      {children}
    </div>
  );
}
