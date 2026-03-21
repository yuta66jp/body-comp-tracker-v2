/**
 * ナビゲーション active 判定ユーティリティ
 *
 * pathname === href の完全一致では `/settings/profile` のようなネストルートに
 * active が追従しないため、prefix 一致も扱える helper を提供する。
 *
 * ルール:
 *   - href === "/"  → 完全一致のみ（"/" は全ての pathname の prefix になるため特別扱い）
 *   - それ以外      → 完全一致 OR `pathname.startsWith(href + "/")` でネストにも対応
 */
export function isActiveNav(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
