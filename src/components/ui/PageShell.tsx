/**
 * PageShell — ページレベルの共通ラッパー
 *
 * 全ページで統一すべきレイアウト責務をここに集約する:
 *   - 縦 padding: モバイル py-4 / デスクトップ py-6
 *   - 横 padding: layout.tsx の px-4 に委ねる（ここでは追加しない）
 *   - 背景色: globals.css の body に設定済み。ここでは重複指定しない
 *   - ページタイトル (h1): 統一スタイルで描画
 *
 * 使い方:
 *   <PageShell title="栄養分析">...</PageShell>
 *
 * アイコン付きタイトルなどカスタムが必要な場合は titleSlot を使う:
 *   <PageShell titleSlot={<div className="mb-4 flex items-center gap-2 md:mb-6">...</div>}>
 *     ...
 *   </PageShell>
 */

interface PageShellProps {
  children: React.ReactNode;
  /** ページ見出しテキスト。titleSlot 非指定時に h1 として描画される */
  title?: string;
  /** title の代わりに使うカスタム見出し要素（アイコン + タイトル + ボタンなど） */
  titleSlot?: React.ReactNode;
}

export function PageShell({ children, title, titleSlot }: PageShellProps) {
  return (
    <main className="py-4 md:py-6">
      {titleSlot ?? (title && (
        <h1 className="mb-4 text-xl font-bold text-slate-800 md:mb-6">{title}</h1>
      ))}
      {children}
    </main>
  );
}
