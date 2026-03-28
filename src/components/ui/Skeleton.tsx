/**
 * Skeleton — ローディング用スケルトン UI のビルディングブロック
 *
 * loading.tsx 内で使用する最小限のプレースホルダー。
 * animate-pulse で脈動アニメーションを付与する。
 */

interface SkeletonBlockProps {
  className?: string;
}

/** 汎用スケルトンブロック。className で高さ・幅・角丸を調整する。 */
export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700 ${className ?? ""}`}
    />
  );
}

/** スケルトンカード行: 横並びの複数カードを生成するユーティリティ */
export function SkeletonCardRow({
  count,
  height = "h-24",
  cols = "grid-cols-1 sm:grid-cols-3",
}: {
  count: number;
  height?: string;
  cols?: string;
}) {
  return (
    <div className={`grid gap-3 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBlock key={i} className={height} />
      ))}
    </div>
  );
}
