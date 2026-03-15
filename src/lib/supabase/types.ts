/**
 * Supabase DB 型定義
 * 本番では `npx supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts` で上書きすること。
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      forecast_backtest_runs: {
        Row: {
          id: string;
          created_at: string;
          model_name: string;
          model_version: string | null;
          horizons: number[];
          train_min_date: string | null;
          train_max_date: string | null;
          n_source_rows: number;
          notes: string | null;
          config: Json;
        };
        Insert: {
          id?: string;
          created_at?: string;
          model_name: string;
          model_version?: string | null;
          horizons: number[];
          train_min_date?: string | null;
          train_max_date?: string | null;
          n_source_rows?: number;
          notes?: string | null;
          config?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          model_name?: string;
          model_version?: string | null;
          horizons?: number[];
          train_min_date?: string | null;
          train_max_date?: string | null;
          n_source_rows?: number;
          notes?: string | null;
          config?: Json;
        };
        Relationships: [];
      };
      forecast_backtest_metrics: {
        Row: {
          id: string;
          run_id: string;
          model_name: string;
          horizon_days: number;
          mae: number;
          rmse: number;
          mape: number | null;
          bias: number | null;
          n_predictions: number;
          computed_at: string;
          extra: Json;
        };
        Insert: {
          id?: string;
          run_id: string;
          model_name: string;
          horizon_days: number;
          mae: number;
          rmse: number;
          mape?: number | null;
          bias?: number | null;
          n_predictions?: number;
          computed_at?: string;
          extra?: Json;
        };
        Update: {
          id?: string;
          run_id?: string;
          model_name?: string;
          horizon_days?: number;
          mae?: number;
          rmse?: number;
          mape?: number | null;
          bias?: number | null;
          n_predictions?: number;
          computed_at?: string;
          extra?: Json;
        };
        Relationships: [];
      };
      forecast_backtest_predictions: {
        Row: {
          id: string;
          run_id: string;
          model_name: string;
          forecast_origin_date: string;
          target_date: string;
          horizon_days: number;
          predicted_weight: number;
          actual_weight: number;
          error: number;
          abs_error: number;
          squared_error: number;
          ape: number | null;
        };
        Insert: {
          id?: string;
          run_id: string;
          model_name: string;
          forecast_origin_date: string;
          target_date: string;
          horizon_days: number;
          predicted_weight: number;
          actual_weight: number;
          error: number;
          abs_error: number;
          squared_error: number;
          ape?: number | null;
        };
        Update: {
          id?: string;
          run_id?: string;
          model_name?: string;
          forecast_origin_date?: string;
          target_date?: string;
          horizon_days?: number;
          predicted_weight?: number;
          actual_weight?: number;
          error?: number;
          abs_error?: number;
          squared_error?: number;
          ape?: number | null;
        };
        Relationships: [];
      };
      daily_logs: {
        Row: {
          log_date: string;
          weight: number | null;
          calories: number | null;
          protein: number | null;
          fat: number | null;
          carbs: number | null;
          note: string | null;
          is_cheat_day: boolean;
          is_refeed_day: boolean;
          is_eating_out: boolean;
          /** @deprecated UIからの入力を廃止。既存データ互換のため型は残す。sleep_hours を使用すること。 */
          is_poor_sleep: boolean;
          // ── Phase 2.5 追加カラム ──
          sleep_hours: number | null;
          /** null=未記録, true=便通あり, false=便通なし */
          had_bowel_movement: boolean | null;
          /** 値: 'chest' | 'back' | 'shoulders' | 'glutes_hamstrings' | 'quads' */
          training_type: string | null;
          /** 値: 'off' | 'office' | 'remote' */
          work_mode: string | null;
          /** training_type から導出 (quads/glutes_hamstrings → true, それ以外 → false, 未入力 → null) */
          leg_flag: boolean | null;
        };
        Insert: {
          log_date: string;
          weight?: number | null;
          calories?: number | null;
          protein?: number | null;
          fat?: number | null;
          carbs?: number | null;
          note?: string | null;
          is_cheat_day?: boolean;
          is_refeed_day?: boolean;
          is_eating_out?: boolean;
          is_poor_sleep?: boolean;
          sleep_hours?: number | null;
          had_bowel_movement?: boolean | null;
          training_type?: string | null;
          work_mode?: string | null;
          leg_flag?: boolean | null;
        };
        Update: {
          log_date?: string;
          weight?: number | null;
          calories?: number | null;
          protein?: number | null;
          fat?: number | null;
          carbs?: number | null;
          note?: string | null;
          is_cheat_day?: boolean;
          is_refeed_day?: boolean;
          is_eating_out?: boolean;
          is_poor_sleep?: boolean;
          sleep_hours?: number | null;
          had_bowel_movement?: boolean | null;
          training_type?: string | null;
          work_mode?: string | null;
          leg_flag?: boolean | null;
        };
        Relationships: [];
      };
      food_master: {
        Row: {
          name: string;
          protein: number;
          fat: number;
          carbs: number;
          calories: number;
          category: string | null;
        };
        Insert: {
          name: string;
          protein: number;
          fat: number;
          carbs: number;
          calories: number;
          category?: string | null;
        };
        Update: {
          name?: string;
          protein?: number;
          fat?: number;
          carbs?: number;
          calories?: number;
          category?: string | null;
        };
        Relationships: [];
      };
      menu_master: {
        Row: {
          name: string;
          recipe: Json;
        };
        Insert: {
          name: string;
          recipe: Json;
        };
        Update: {
          name?: string;
          recipe?: Json;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          key: string;
          value_num: number | null;
          value_str: string | null;
        };
        Insert: {
          key: string;
          value_num?: number | null;
          value_str?: string | null;
        };
        Update: {
          key?: string;
          value_num?: number | null;
          value_str?: string | null;
        };
        Relationships: [];
      };
      predictions: {
        Row: {
          id: number;
          ds: string;
          yhat: number;
          model_version: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          ds: string;
          yhat: number;
          model_version: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          ds?: string;
          yhat?: number;
          model_version?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      analytics_cache: {
        Row: {
          metric_type: string;
          payload: Json;
          updated_at: string;
        };
        Insert: {
          metric_type: string;
          payload: Json;
          updated_at?: string;
        };
        Update: {
          metric_type?: string;
          payload?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      career_logs: {
        Row: {
          id: number;
          log_date: string;
          weight: number;
          season: string;
          target_date: string;
          note: string | null;
        };
        Insert: {
          id?: number;
          log_date: string;
          weight: number;
          season: string;
          target_date: string;
          note?: string | null;
        };
        Update: {
          id?: number;
          log_date?: string;
          weight?: number;
          season?: string;
          target_date?: string;
          note?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      save_daily_log_partial: {
        Args: {
          p_log_date: string;
          p_fields: Record<string, unknown>;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// Convenience type aliases
export type DailyLog = Database["public"]["Tables"]["daily_logs"]["Row"];
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
