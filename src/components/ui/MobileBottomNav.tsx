"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  PieChart,
  Zap,
  CalendarDays,
  MoreHorizontal,
  X,
  BarChart2,
  Database,
  Settings2,
} from "lucide-react";
import { isActiveNav } from "@/lib/utils/nav";

const PRIMARY_TABS = [
  { href: "/",        label: "ホーム",  icon: LayoutDashboard },
  { href: "/macro",   label: "栄養",    icon: PieChart },
  { href: "/tdee",    label: "TDEE",    icon: Zap },
  { href: "/history", label: "履歴",    icon: CalendarDays },
] as const;

const MORE_ITEMS = [
  { href: "/forecast-accuracy", label: "予測精度", icon: BarChart2 },
  { href: "/foods",             label: "食品DB",   icon: Database },
  { href: "/settings",          label: "設定",     icon: Settings2 },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_ITEMS.some((item) => isActiveNav(pathname, item.href));

  return (
    <>
      {/* ── More sheet ───────────────────────────────────────────────── */}
      {moreOpen && (
        <>
          {/* backdrop — タップで閉じる */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />
          {/* sheet 本体。タブバー高 + Safe Area 分だけ下から浮かせる */}
          <div
            role="menu"
            aria-label="その他のページ"
            className="fixed left-0 right-0 z-40 border-t border-slate-200 bg-white shadow-lg"
            style={{
              bottom:
                "calc(var(--bottom-nav-height, 56px) + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="mx-auto flex max-w-screen-xl flex-col px-4 py-2">
              {MORE_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = isActiveNav(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    <Icon size={18} className={active ? "text-blue-600" : ""} />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Bottom tab bar ───────────────────────────────────────────── */}
      <nav
        aria-label="モバイルナビゲーション"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="mx-auto flex max-w-screen-xl items-stretch">
          {/* 主要タブ */}
          {PRIMARY_TABS.map(({ href, label, icon: Icon }) => {
            const active = isActiveNav(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
                  active
                    ? "text-blue-700"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Icon
                  size={20}
                  className={`flex-shrink-0 ${active ? "text-blue-600" : ""}`}
                />
                <span>{label}</span>
              </Link>
            );
          })}

          {/* その他ボタン */}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="その他のナビゲーションを開く"
            onClick={() => setMoreOpen((prev) => !prev)}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${
              moreActive || moreOpen
                ? "text-blue-700"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            {moreOpen ? (
              <X size={20} />
            ) : (
              <MoreHorizontal
                size={20}
                className={moreActive ? "text-blue-600" : ""}
              />
            )}
            <span>その他</span>
          </button>
        </div>
      </nav>
    </>
  );
}
