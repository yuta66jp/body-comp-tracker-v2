"use client";

/**
 * DashboardLayout — ダッシュボード共通レイアウト
 *
 * #361: PC aside サイドバーを廃止し、MobileMealLoggerSheet（PC/モバイル共用）に統一。
 *   - 以前: lg+ では w-80 の sticky aside サイドバーで MealLogger を常時表示
 *   - 以降: 全サイズで trigger ボタン → modal / bottom sheet で入力
 *   - メインコンテンツ列が常に full-width になりダッシュボードが広く使えるようになる
 */

import type { GoogleHealthStatusSnapshot } from "@/lib/googleHealth/status";
import { DashboardQuickActions } from "./DashboardQuickActions";

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** 左右カラムの上に全幅で表示するコンテンツ（シーズンバッジ・エラーバナーなど） */
  header?: React.ReactNode;
  googleHealthStatus: GoogleHealthStatusSnapshot;
}

export function DashboardLayout({ children, header, googleHealthStatus }: DashboardLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-slate-50 py-6 gap-2 dark:bg-slate-950">
      {/* 全幅ヘッダー（シーズンバッジ・エラーバナーなど） */}
      {header && <div>{header}</div>}

      {/* メインコンテンツ（full-width） */}
      <main className="flex flex-col gap-6">
        {/* 記録・Google Health 同期の主要アクション */}
        <DashboardQuickActions googleHealthStatus={googleHealthStatus} />

        {children}
      </main>
    </div>
  );
}
