export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analytics_cache: {
        Row: {
          metric_type: string
          payload: Json
          updated_at: string
        }
        Insert: {
          metric_type: string
          payload: Json
          updated_at?: string
        }
        Update: {
          metric_type?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      career_logs: {
        Row: {
          id: number
          log_date: string
          note: string | null
          season: string
          target_date: string
          weight: number
        }
        Insert: {
          id?: number
          log_date: string
          note?: string | null
          season: string
          target_date: string
          weight: number
        }
        Update: {
          id?: number
          log_date?: string
          note?: string | null
          season?: string
          target_date?: string
          weight?: number
        }
        Relationships: []
      }
      daily_logs: {
        Row: {
          calories: number | null
          carbs: number | null
          created_at: string | null
          fat: number | null
          had_bowel_movement: boolean | null
          id: string
          is_cheat_day: boolean
          is_eating_out: boolean
          is_poor_sleep: boolean | null
          is_refeed_day: boolean
          is_travel_day: boolean
          leg_flag: boolean | null
          log_date: string
          note: string | null
          protein: number | null
          sleep_hours: number | null
          training_type: string | null
          updated_at: string
          weight: number
          work_mode: string | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          fat?: number | null
          had_bowel_movement?: boolean | null
          id?: string
          is_cheat_day?: boolean
          is_eating_out?: boolean
          is_poor_sleep?: boolean | null
          is_refeed_day?: boolean
          is_travel_day?: boolean
          leg_flag?: boolean | null
          log_date: string
          note?: string | null
          protein?: number | null
          sleep_hours?: number | null
          training_type?: string | null
          updated_at?: string
          weight: number
          work_mode?: string | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          created_at?: string | null
          fat?: number | null
          had_bowel_movement?: boolean | null
          id?: string
          is_cheat_day?: boolean
          is_eating_out?: boolean
          is_poor_sleep?: boolean | null
          is_refeed_day?: boolean
          is_travel_day?: boolean
          leg_flag?: boolean | null
          log_date?: string
          note?: string | null
          protein?: number | null
          sleep_hours?: number | null
          training_type?: string | null
          updated_at?: string
          weight?: number
          work_mode?: string | null
        }
        Relationships: []
      }
      food_master: {
        Row: {
          calories: number | null
          carbs: number | null
          category: string | null
          created_at: string | null
          fat: number | null
          id: string
          name: string
          protein: number | null
        }
        Insert: {
          calories?: number | null
          carbs?: number | null
          category?: string | null
          created_at?: string | null
          fat?: number | null
          id?: string
          name: string
          protein?: number | null
        }
        Update: {
          calories?: number | null
          carbs?: number | null
          category?: string | null
          created_at?: string | null
          fat?: number | null
          id?: string
          name?: string
          protein?: number | null
        }
        Relationships: []
      }
      forecast_backtest_metrics: {
        Row: {
          bias: number | null
          computed_at: string
          extra: Json
          horizon_days: number
          id: string
          mae: number
          mape: number | null
          model_name: string
          n_predictions: number
          rmse: number
          run_id: string
        }
        Insert: {
          bias?: number | null
          computed_at?: string
          extra?: Json
          horizon_days: number
          id?: string
          mae: number
          mape?: number | null
          model_name: string
          n_predictions?: number
          rmse: number
          run_id: string
        }
        Update: {
          bias?: number | null
          computed_at?: string
          extra?: Json
          horizon_days?: number
          id?: string
          mae?: number
          mape?: number | null
          model_name?: string
          n_predictions?: number
          rmse?: number
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_backtest_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "forecast_backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_backtest_predictions: {
        Row: {
          abs_error: number
          actual_weight: number
          ape: number | null
          error: number
          forecast_origin_date: string
          horizon_days: number
          id: string
          model_name: string
          predicted_weight: number
          run_id: string
          squared_error: number
          target_date: string
        }
        Insert: {
          abs_error: number
          actual_weight: number
          ape?: number | null
          error: number
          forecast_origin_date: string
          horizon_days: number
          id?: string
          model_name: string
          predicted_weight: number
          run_id: string
          squared_error: number
          target_date: string
        }
        Update: {
          abs_error?: number
          actual_weight?: number
          ape?: number | null
          error?: number
          forecast_origin_date?: string
          horizon_days?: number
          id?: string
          model_name?: string
          predicted_weight?: number
          run_id?: string
          squared_error?: number
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_backtest_predictions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "forecast_backtest_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_backtest_runs: {
        Row: {
          config: Json
          created_at: string
          horizons: number[]
          id: string
          model_name: string
          model_version: string | null
          n_source_rows: number
          notes: string | null
          train_max_date: string | null
          train_min_date: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          horizons: number[]
          id?: string
          model_name: string
          model_version?: string | null
          n_source_rows?: number
          notes?: string | null
          train_max_date?: string | null
          train_min_date?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          horizons?: number[]
          id?: string
          model_name?: string
          model_version?: string | null
          n_source_rows?: number
          notes?: string | null
          train_max_date?: string | null
          train_min_date?: string | null
        }
        Relationships: []
      }
      menu_master: {
        Row: {
          created_at: string | null
          id: string
          name: string
          recipe: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          recipe: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          recipe?: Json
        }
        Relationships: []
      }
      predictions: {
        Row: {
          created_at: string
          ds: string
          id: number
          model_version: string
          yhat: number
        }
        Insert: {
          created_at?: string
          ds: string
          id?: number
          model_version: string
          yhat: number
        }
        Update: {
          created_at?: string
          ds?: string
          id?: number
          model_version?: string
          yhat?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value_num: number | null
          value_str: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value_num?: number | null
          value_str?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value_num?: number | null
          value_str?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      save_daily_log_partial: {
        Args: { p_fields: Json; p_log_date: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// Convenience type aliases
export type DailyLog = Database["public"]["Tables"]["daily_logs"]["Row"];

/**
 * Dashboard 専用の daily_logs projection 型。
 * fetchDashboardDailyLogs() が取得する 16 列に対応する。
 *
 * 除外列:
 *   - note     : Dashboard のいずれの関数・コンポーネントでも参照されない
 *   - leg_flag : Dashboard では参照されない（training_type から導出される派生値）
 *
 * DailyLog は DashboardDailyLog の全プロパティを含む（plus note / leg_flag）ため、
 * DailyLog[] は DashboardDailyLog[] を受け入れる関数に渡せる（後方互換）。
 */
export type DashboardDailyLog = Omit<DailyLog, "note" | "leg_flag">;

/**
 * Macro ページ専用の daily_logs projection 型。
 * fetchMacroDailyLogs() が取得する 6 列に対応する。
 *
 * 除外列: is_* フラグ / sleep_hours / had_bowel_movement / training_type / work_mode /
 *         note / leg_flag / updated_at — Macro 計算で不要なため除外。
 */
export type MacroDailyLog = Pick<DailyLog, "log_date" | "weight" | "calories" | "protein" | "fat" | "carbs">;

/**
 * TDEE ページ専用の daily_logs projection 型。
 * fetchTdeeDailyLogs() が取得する 3 列に対応する。
 *
 * 除外列: protein / fat / carbs / is_* フラグ / sleep_hours / had_bowel_movement /
 *         training_type / work_mode / note / leg_flag / updated_at — TDEE 計算で不要なため除外。
 */
export type TdeeDailyLog = Pick<DailyLog, "log_date" | "weight" | "calories">;

export type FoodMaster = Database["public"]["Tables"]["food_master"]["Row"];
export type MenuMaster = Database["public"]["Tables"]["menu_master"]["Row"];
export type Setting = Database["public"]["Tables"]["settings"]["Row"];
export type Prediction = Database["public"]["Tables"]["predictions"]["Row"];
export type AnalyticsCache = Database["public"]["Tables"]["analytics_cache"]["Row"];
export type CareerLog = Database["public"]["Tables"]["career_logs"]["Row"];

/** menu_master.recipe JSONB の要素型 (旧版: {name, amount}) */
export interface RecipeItem {
  name: string;   // food_master.name と対応
  amount: number; // グラム数
}

/**
 * analytics_cache["enriched_logs"] の payload 要素型。
 *
 * canonical source: ml-pipeline/enrich.py (batch)
 * - tdee_estimated : SMA7 差分 + rolling median (window=7, min_periods=3)
 *                   係数: KCAL_PER_KG_FAT = 7200 kcal/kg (Hall et al., 2012)
 * - avg_tdee_7d    : 後方 7 日の tdee_estimated 平均 (min_periods=3)
 *                   front 側で再平均しないこと。この値をそのまま表示する。
 * - avg_calories_7d: 後方 7 日の摂取カロリー平均 (min_periods=1)
 *                   front 側で再平均しないこと。この値をそのまま表示する。
 *
 * avg_tdee_7d / avg_calories_7d は新規追加フィールドのため、
 * 古いバッチ結果では undefined になる場合がある。必ず ?? null で fallback すること。
 */
export interface EnrichedLogPayloadRow {
  log_date: string;
  weight_sma7: number | null;
  /** 推定 TDEE (kcal/日)。canonical source: enrich.py */
  tdee_estimated: number | null;
  /** 後方 7 日の推定 TDEE 平均 (kcal/日)。enrich.py で事前計算済み。 */
  avg_tdee_7d?: number | null;
  /** 後方 7 日の摂取カロリー平均 (kcal/日)。enrich.py で事前計算済み。 */
  avg_calories_7d?: number | null;
}

// Backtest table aliases
export type ForecastBacktestRun =
  Database["public"]["Tables"]["forecast_backtest_runs"]["Row"];
export type ForecastBacktestMetric =
  Database["public"]["Tables"]["forecast_backtest_metrics"]["Row"];
export type ForecastBacktestPrediction =
  Database["public"]["Tables"]["forecast_backtest_predictions"]["Row"];
