"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen, PenLine } from "lucide-react";
import { MealLogger } from "@/components/meal/MealLogger";
import { MobileMealLoggerSheet } from "./MobileMealLoggerSheet";

interface DashboardLayoutProps {
  children: React.ReactNode;
  /** 左右カラムの上に全幅で表示するコンテンツ（シーズンバッジ・エラーバナーなど） */
  header?: React.ReactNode;
}

export function DashboardLayout({ children, header }: DashboardLayoutProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 py-6 gap-2">
      {/* 全幅ヘッダー（シーズンバッジ・エラーバナーなど） */}
      {header && <div>{header}</div>}

      {/* 左右カラムレイアウト（aside + main） */}
      <div className="flex flex-1 gap-0">

      {/* サイドバー（lg 以上のみ）
          open=true : w-80 でフル表示。カードヘッダーに「食事ログ + 閉じるボタン」を統合。
          open=false: w-8 に縮小し、PanelLeftOpen アイコンのみ表示（スタンドアロン行を作らない）。 */}
      <aside
        className={`hidden lg:flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          open ? "w-80 mr-6" : "w-8 mr-3"
        }`}
      >
        {open ? (
          /* 展開時: 食事ログカード（ヘッダーに閉じるボタン統合） */
          <div className="w-80 sticky top-0">
            <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              {/* カードヘッダー: 食事ログタイトル + 閉じるボタン */}
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50">
                    <PenLine size={14} className="text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">食事ログ</span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                  title="食事ログを閉じる"
                  aria-label="食事ログを閉じる"
                >
                  <PanelLeftClose size={13} />
                  閉じる
                </button>
              </div>
              {/* MealLogger 本体（内部ヘッダーは非表示） */}
              <div className="p-5">
                <MealLogger sidebar showHeader={false} />
              </div>
            </div>
          </div>
        ) : (
          /* 折りたたみ時: アイコンのみの再オープンボタン */
          <div className="sticky top-0">
            <button
              onClick={() => setOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50"
              title="食事ログを開く"
              aria-label="食事ログを開く"
            >
              <PanelLeftOpen size={14} className="text-slate-500" />
            </button>
          </div>
        )}
      </aside>

      {/* メインコンテンツ */}
      <main className="min-w-0 flex-1 flex flex-col gap-6">
        {children}

        {/* モバイル用 MealLogger: 閲覧コンテンツの後に trigger を配置し、
            bottom sheet で入力フォームを開く（lg+ では描画なし）。
            閲覧導線（KPI → GoalNavigator → WeeklyReview → Tabs）を先に確保する。 */}
        <MobileMealLoggerSheet />
      </main>
      </div>
    </div>
  );
}
