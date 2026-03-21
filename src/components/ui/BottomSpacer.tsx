/**
 * BottomSpacer — 底部固定 UI（MobileBottomNav）との重なりを防ぐスペーサー。
 *
 * layout.tsx の <main> 内末尾に配置済み。
 * 将来的に FAB・アクションバーなど別の bottom-fixed UI を追加する場合も
 * このコンポーネントを再利用して余白を確保する。
 *
 * 高さは CSS 変数 `--bottom-nav-height`（globals.css 定義）で管理する。
 * 変数を変更するだけで全利用箇所に追従できる。
 * md 以上では非表示のため desktop レイアウトに影響しない。
 */
export function BottomSpacer() {
  return (
    <div
      className="md:hidden"
      aria-hidden="true"
      style={{
        height:
          "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))",
      }}
    />
  );
}
