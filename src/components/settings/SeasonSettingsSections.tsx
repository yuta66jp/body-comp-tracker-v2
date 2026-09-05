"use client";

import { useState } from "react";
import type { Season } from "@/lib/domain/season";
import { SeasonLifecycleSection } from "./SeasonLifecycleSection";
import { SeasonMonthlyGoalPlanSection } from "./SeasonMonthlyGoalPlanSection";

interface SeasonSettingsSectionsProps {
  initialSeason: Season | null;
  weightLogs: Array<{ log_date: string; weight: number | null }>;
  today: string;
  readError?: boolean;
}

export function SeasonSettingsSections(props: SeasonSettingsSectionsProps) {
  const [seasonEditing, setSeasonEditing] = useState(false);
  const [monthlyEditing, setMonthlyEditing] = useState(false);

  return (
    <>
      <div>
        {monthlyEditing && (
          <p role="status" className="mb-2 text-sm text-amber-700 dark:text-amber-300">
            シーズン設定を変更するには、月別目標の変更を保存または元に戻してください。
          </p>
        )}
        <fieldset disabled={monthlyEditing} className="min-w-0">
          <SeasonLifecycleSection {...props} onEditingChange={setSeasonEditing} />
        </fieldset>
      </div>
      <div>
        {seasonEditing && (
          <p role="status" className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            月別目標を編集するには、シーズン設定の操作を完了またはキャンセルしてください。
          </p>
        )}
        <fieldset disabled={seasonEditing} className="min-w-0">
          <SeasonMonthlyGoalPlanSection
            initialSeason={props.initialSeason}
            today={props.today}
            readError={props.readError}
            onEditingChange={setMonthlyEditing}
          />
        </fieldset>
      </div>
    </>
  );
}
