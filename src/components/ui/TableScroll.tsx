/**
 * TableScroll — テーブルカードのモバイルエッジブリードラッパー。
 *
 * 使用目的:
 *   layout.tsx が付与する `px-4` を `-mx-4` で打ち消し、テーブルカードを
 *   画面両端まで拡張する。カラム数が多いテーブルほど効果が大きい。
 *   デスクトップ (md+) ではリセットして通常フローに戻す。
 *
 * 表示階層:
 *   <TableScroll>            ← -mx-4 / overflow-x-auto / px-0（モバイルでエッジブリード）
 *     <div rounded-2xl ...>  ← テーブルコンポーネント自身のカードラッパー
 *       <div overflow-x-auto>← テーブルコンポーネント自身の内側スクロール
 *         <table />
 *
 * 表→カード切替（各行をカード形式で折り畳む）の完全実装は将来課題。
 * 現時点での共通パターンはこのエッジブリード + overflow-x-auto 方式。
 */

interface TableScrollProps {
  children: React.ReactNode;
  className?: string;
}

export function TableScroll({ children, className = "" }: TableScrollProps) {
  return (
    <div className={`-mx-4 overflow-x-auto md:mx-0 ${className}`}>
      {children}
    </div>
  );
}
