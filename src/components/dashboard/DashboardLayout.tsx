"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { MealLogger } from "@/components/meal/MealLogger";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="flex min-h-screen gap-0 bg-slate-50 py-6">
      {/* サイドバー（lg 以上のみ） */}
      <aside
        className={`hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${
          open ? "w-80 mr-6" : "w-0 mr-0"
        }`}
      >
        <div className="w-80 sticky top-20">
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <MealLogger sidebar />
          </div>
        </div>
      </aside>

      {/* メインコンテンツ */}
      <main className="min-w-0 flex-1 space-y-6">
        {/* モバイル用 MealLogger + トグルボタン（lg 以上）を同じ行にまとめる */}
        <div className="flex items-center gap-3">
          {/* トグルボタン（lg 以上のみ表示） */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 shrink-0"
            title={open ? "サイドバーを閉じる" : "サイドバーを開く"}
          >
            {open
              ? <><PanelLeftClose size={14} /> 閉じる</>
              : <><PanelLeftOpen size={14} /> 食事入力</>}
          </button>
          {/* モバイル用 MealLogger */}
          <div className="lg:hidden flex-1 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <MealLogger sidebar />
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}
