"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Database,
  Settings2,
  PieChart,
  Zap,
  BarChart2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/",                   label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/macro",              label: "栄養",          icon: PieChart },
  { href: "/tdee",               label: "TDEE",          icon: Zap },
  { href: "/history",            label: "履歴",          icon: CalendarDays },
  { href: "/forecast-accuracy",  label: "予測精度",      icon: BarChart2 },
  { href: "/foods",              label: "食品DB",        icon: Database },
  { href: "/settings",           label: "設定",          icon: Settings2 },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-20 hidden border-b border-slate-200/80 bg-white/80 backdrop-blur-md md:block">
      <div className="mx-auto flex max-w-5xl items-center gap-0.5 px-4 py-2.5">
        {/* ロゴ */}
        <div className="mr-5 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
            <span className="text-[11px] font-black tracking-tight text-white">BC</span>
          </div>
          <span className="hidden text-sm font-bold text-slate-800 sm:block">Tracker</span>
        </div>

        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              }`}
            >
              <Icon
                size={16}
                className={`flex-shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                  active ? "text-blue-600" : ""
                }`}
              />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
