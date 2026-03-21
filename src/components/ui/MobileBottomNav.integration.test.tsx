/**
 * MobileBottomNav UI 結合テスト
 *
 * テスト戦略:
 * - usePathname をモックして current pathname を制御する
 * - 主要タブの描画・active 状態・その他シートの開閉を検証する
 * - lucide-react アイコンをモックして描画を安定させる
 */

// @jest-environment jest-environment-jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// next/navigation のモック
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

// next/link のモック: <a> に変換して href を保持
jest.mock("next/link", () => {
  const MockLink = ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

// lucide-react アイコンをモック
jest.mock("lucide-react", () => ({
  LayoutDashboard: () => <span data-testid="icon-dashboard" />,
  PieChart:        () => <span data-testid="icon-macro" />,
  Zap:             () => <span data-testid="icon-tdee" />,
  CalendarDays:    () => <span data-testid="icon-history" />,
  MoreHorizontal:  () => <span data-testid="icon-more" />,
  X:               () => <span data-testid="icon-close" />,
  BarChart2:       () => <span data-testid="icon-forecast" />,
  Database:        () => <span data-testid="icon-foods" />,
  Settings2:       () => <span data-testid="icon-settings" />,
}));

import { usePathname } from "next/navigation";
import { MobileBottomNav } from "./MobileBottomNav";

const mockUsePathname = usePathname as jest.Mock;

describe("MobileBottomNav", () => {
  beforeEach(() => jest.clearAllMocks());

  // ── 主要タブの描画 ─────────────────────────────────────────────────────

  it("主要 4 タブが描画される", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    expect(screen.getByText("ホーム")).toBeInTheDocument();
    expect(screen.getByText("栄養")).toBeInTheDocument();
    expect(screen.getByText("TDEE")).toBeInTheDocument();
    expect(screen.getByText("履歴")).toBeInTheDocument();
    expect(screen.getByText("その他")).toBeInTheDocument();
  });

  it("主要タブのリンク href が正しい", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    expect(screen.getByText("ホーム").closest("a")).toHaveAttribute("href", "/");
    expect(screen.getByText("栄養").closest("a")).toHaveAttribute("href", "/macro");
    expect(screen.getByText("TDEE").closest("a")).toHaveAttribute("href", "/tdee");
    expect(screen.getByText("履歴").closest("a")).toHaveAttribute("href", "/history");
  });

  // ── active 状態 ────────────────────────────────────────────────────────

  it("現在ページのタブに aria-current='page' が付く (/ の場合)", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    const homeLink = screen.getByText("ホーム").closest("a");
    expect(homeLink).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("栄養").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("現在ページのタブに aria-current='page' が付く (/macro の場合)", () => {
    mockUsePathname.mockReturnValue("/macro");
    render(<MobileBottomNav />);

    expect(screen.getByText("栄養").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("ホーム").closest("a")).not.toHaveAttribute("aria-current");
  });

  // ── その他シート ────────────────────────────────────────────────────────

  it("初期状態でその他シートは非表示", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    expect(screen.queryByText("予測精度")).not.toBeInTheDocument();
    expect(screen.queryByText("食品DB")).not.toBeInTheDocument();
    expect(screen.queryByText("設定")).not.toBeInTheDocument();
  });

  it("その他ボタンをクリックするとシートが開く", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    fireEvent.click(screen.getByLabelText("その他のナビゲーションを開く"));

    expect(screen.getByText("予測精度")).toBeInTheDocument();
    expect(screen.getByText("食品DB")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
  });

  it("その他ボタンが開いているとき aria-expanded=true になる", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    const moreBtn = screen.getByLabelText("その他のナビゲーションを開く");
    expect(moreBtn).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(moreBtn);
    expect(moreBtn).toHaveAttribute("aria-expanded", "true");
  });

  it("その他シートを再度クリックすると閉じる", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    const moreBtn = screen.getByLabelText("その他のナビゲーションを開く");
    fireEvent.click(moreBtn);
    expect(screen.getByText("予測精度")).toBeInTheDocument();

    fireEvent.click(moreBtn);
    expect(screen.queryByText("予測精度")).not.toBeInTheDocument();
  });

  it("その他シートのリンクをクリックするとシートが閉じる", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    fireEvent.click(screen.getByLabelText("その他のナビゲーションを開く"));
    fireEvent.click(screen.getByText("設定"));
    expect(screen.queryByText("予測精度")).not.toBeInTheDocument();
  });

  // ── More ページが active のとき ────────────────────────────────────────

  it("/settings のとき「その他」ボタンが active 扱いになる", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<MobileBottomNav />);

    const moreBtn = screen.getByLabelText("その他のナビゲーションを開く");
    // moreActive = true なので text-blue-700 クラスが適用される
    expect(moreBtn.className).toContain("text-blue-700");
  });

  it("/settings のとき、その他シートを開くと設定リンクに aria-current='page' が付く", () => {
    mockUsePathname.mockReturnValue("/settings");
    render(<MobileBottomNav />);

    fireEvent.click(screen.getByLabelText("その他のナビゲーションを開く"));
    const settingsLink = screen.getByText("設定").closest("a");
    expect(settingsLink).toHaveAttribute("aria-current", "page");
  });

  // ── backdrop クリックで閉じる ───────────────────────────────────────────

  it("backdrop をクリックするとシートが閉じる", () => {
    mockUsePathname.mockReturnValue("/");
    render(<MobileBottomNav />);

    fireEvent.click(screen.getByLabelText("その他のナビゲーションを開く"));
    expect(screen.getByText("予測精度")).toBeInTheDocument();

    // backdrop は aria-hidden なので container 経由でクリック
    const backdrop = document.querySelector("[aria-hidden='true']") as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByText("予測精度")).not.toBeInTheDocument();
  });
});
