/**
 * SectionLabel — カード内セクション見出し
 *
 * カード / パネル内部の小見出しを統一する共通コンポーネント。
 * "ALL CAPS + 広いトラッキング + 薄いグレー" という見た目は
 * 複数コンポーネントで重複定義されていたため、ここに一元化する。
 *
 * WeeklyReviewCard / GoalNavigator / TdeeKpiCard などの
 * ローカル SectionLabel 定義はこれに置き換える。
 *
 * ## スタイルルール
 *   - テキスト: text-[11px] font-bold uppercase tracking-widest text-slate-400
 *   - 下マージン: mb-2 (デフォルト)
 *   - アイコン: オプション。左端に text-slate-400 で表示
 *
 * ## ダークモード対応の注意点
 * text-slate-400 を dark:text-slate-500 などに差し替える際は
 * このファイルのみ修正すればよい。
 *
 * #378 で追加。
 */

interface SectionLabelProps {
  /** セクション見出しテキスト */
  children: React.ReactNode;
  /** 左端に表示するアイコン (lucide コンポーネントの <Icon size={12} /> など) */
  icon?: React.ReactNode;
  /** 下マージンのクラス。デフォルトは "mb-2" */
  mb?: string;
}

export function SectionLabel({ children, icon, mb = "mb-2" }: SectionLabelProps) {
  return (
    <div className={`flex items-center gap-1.5 ${mb}`}>
      {icon && <span className="shrink-0 text-slate-400">{icon}</span>}
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        {children}
      </span>
    </div>
  );
}
