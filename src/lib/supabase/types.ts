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
  private: {
    Tables: {
      google_health_connections: {
        Row: {
          access_token_expires_at: string | null
          created_at: string
          encrypted_access_token: Json | null
          encrypted_refresh_token: Json | null
          encryption_key_version: number
          granted_scopes: string[]
          id: string
          last_checked_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_sync_at: string | null
          status: Database["private"]["Enums"]["google_health_connection_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_expires_at?: string | null
          created_at?: string
          encrypted_access_token?: Json | null
          encrypted_refresh_token?: Json | null
          encryption_key_version?: number
          granted_scopes?: string[]
          id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_sync_at?: string | null
          status?: Database["private"]["Enums"]["google_health_connection_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_expires_at?: string | null
          created_at?: string
          encrypted_access_token?: Json | null
          encrypted_refresh_token?: Json | null
          encryption_key_version?: number
          granted_scopes?: string[]
          id?: string
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_sync_at?: string | null
          status?: Database["private"]["Enums"]["google_health_connection_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_health_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      google_health_connection_status:
        | "not_connected"
        | "connected"
        | "scope_missing"
        | "reauthorization_required"
        | "error"
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
          is_posing_day: boolean
          is_refeed_day: boolean
          is_tanning_day: boolean
          is_travel_day: boolean
          last_meal_end_time: string | null
          leg_flag: boolean | null
          log_date: string
          note: string | null
          protein: number | null
          sleep_hours: number | null
          step_count: number | null
          training_type: string | null
          updated_at: string
          user_id: string | null
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
          is_posing_day?: boolean
          is_refeed_day?: boolean
          is_tanning_day?: boolean
          is_travel_day?: boolean
          last_meal_end_time?: string | null
          leg_flag?: boolean | null
          log_date: string
          note?: string | null
          protein?: number | null
          sleep_hours?: number | null
          step_count?: number | null
          training_type?: string | null
          updated_at?: string
          user_id?: string | null
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
          is_posing_day?: boolean
          is_refeed_day?: boolean
          is_tanning_day?: boolean
          is_travel_day?: boolean
          last_meal_end_time?: string | null
          leg_flag?: boolean | null
          log_date?: string
          note?: string | null
          protein?: number | null
          sleep_hours?: number | null
          step_count?: number | null
          training_type?: string | null
          updated_at?: string
          user_id?: string | null
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
        }
        Relationships: []
      }
      forecast_backtest_metrics: {
        Row: {
          bias: number | null
          computed_at: string
          eval_policy: string
          extra: Json
          horizon_days: number
          id: string
          mae: number | null
          mape: number | null
          model_name: string
          n_excluded: number
          n_predictions: number
          n_total: number
          rmse: number | null
          run_id: string
        }
        Insert: {
          bias?: number | null
          computed_at?: string
          eval_policy?: string
          extra?: Json
          horizon_days: number
          id?: string
          mae?: number | null
          mape?: number | null
          model_name: string
          n_excluded?: number
          n_predictions?: number
          n_total?: number
          rmse?: number | null
          run_id: string
        }
        Update: {
          bias?: number | null
          computed_at?: string
          eval_policy?: string
          extra?: Json
          horizon_days?: number
          id?: string
          mae?: number | null
          mape?: number | null
          model_name?: string
          n_excluded?: number
          n_predictions?: number
          n_total?: number
          rmse?: number | null
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
      google_health_daily_metrics: {
        Row: {
          created_at: string
          deep_sleep_minutes: number | null
          google_health_steps_source: string | null
          hrv_ms: number | null
          id: string
          metric_date: string
          rhr_bpm: number | null
          sleep_bed_at: string | null
          sleep_minutes: number | null
          sleep_wake_at: string | null
          step_count: number | null
          synced_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deep_sleep_minutes?: number | null
          google_health_steps_source?: string | null
          hrv_ms?: number | null
          id?: string
          metric_date: string
          rhr_bpm?: number | null
          sleep_bed_at?: string | null
          sleep_minutes?: number | null
          sleep_wake_at?: string | null
          step_count?: number | null
          synced_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deep_sleep_minutes?: number | null
          google_health_steps_source?: string | null
          hrv_ms?: number | null
          id?: string
          metric_date?: string
          rhr_bpm?: number | null
          sleep_bed_at?: string | null
          sleep_minutes?: number | null
          sleep_wake_at?: string | null
          step_count?: number | null
          synced_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_google_health_daily_metrics_daily_logs"
            columns: ["user_id", "metric_date"]
            isOneToOne: true
            referencedRelation: "daily_logs"
            referencedColumns: ["user_id", "log_date"]
          },
        ]
      }
      menu_master: {
        Row: {
          created_at: string | null
          id: string
          name: string
          recipe: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          recipe: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          recipe?: Json
          user_id?: string | null
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
          user_id: string | null
          value_num: number | null
          value_str: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          user_id?: string | null
          value_num?: number | null
          value_str?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          user_id?: string | null
          value_num?: number | null
          value_str?: string | null
        }
        Relationships: []
      }
      sleep_sessions: {
        Row: {
          bed_at: string
          created_at: string
          id: string
          note: string | null
          source: string
          updated_at: string
          user_id: string | null
          wake_at: string
          wake_date: string
        }
        Insert: {
          bed_at: string
          created_at?: string
          id?: string
          note?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
          wake_at: string
          wake_date: string
        }
        Update: {
          bed_at?: string
          created_at?: string
          id?: string
          note?: string | null
          source?: string
          updated_at?: string
          user_id?: string | null
          wake_at?: string
          wake_date?: string
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
  private: {
    Enums: {
      google_health_connection_status: [
        "not_connected",
        "connected",
        "scope_missing",
        "reauthorization_required",
        "error",
      ],
    },
  },
  public: {
    Enums: {},
  },
} as const

// ── Convenience type aliases ──────────────────────────────────────────────────
type OptionalUserId<Row extends { user_id: string | null }> =
  Omit<Row, "user_id"> & { user_id?: string | null };

export type DailyLog = OptionalUserId<Database["public"]["Tables"]["daily_logs"]["Row"]>;

/**
 * Dashboard 専用の daily_logs projection 型。
 * fetchDashboardDailyLogs() が取得する 21 列に対応する（#436 で step_count 追加、#577 で is_tanning_day / is_posing_day 追加）。
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

export type GoogleHealthDailyMetricRow = Database["public"]["Tables"]["google_health_daily_metrics"]["Row"];
export type GoogleHealthConnectionRow = Database["private"]["Tables"]["google_health_connections"]["Row"];
export type GoogleHealthConnectionStatus = Database["private"]["Enums"]["google_health_connection_status"];
export type SleepSession = OptionalUserId<Database["public"]["Tables"]["sleep_sessions"]["Row"]>;

export type FoodMaster  = OptionalUserId<Database["public"]["Tables"]["food_master"]["Row"]>;
export type MenuMaster  = OptionalUserId<Database["public"]["Tables"]["menu_master"]["Row"]>;
export type Setting     = OptionalUserId<Database["public"]["Tables"]["settings"]["Row"]>;
export type Prediction  = Database["public"]["Tables"]["predictions"]["Row"];
export type AnalyticsCache = Database["public"]["Tables"]["analytics_cache"]["Row"];
export type CareerLog   = Database["public"]["Tables"]["career_logs"]["Row"];

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
 *                   短期変化確認用。front 側で再平均しないこと。
 * - avg_tdee_14d   : 後方 14 日の tdee_estimated 平均 (min_periods=7)
 *                   傾向判断用の基準線。front 側で再平均しないこと。
 * - avg_calories_7d: 後方 7 日の摂取カロリー平均 (min_periods=1)
 *                   front 側で再平均しないこと。この値をそのまま表示する。
 *
 * avg_tdee_7d / avg_tdee_14d / avg_calories_7d は新規追加フィールドのため、
 * 古いバッチ結果では undefined になる場合がある。必ず ?? null で fallback すること。
 */
export interface EnrichedLogPayloadRow {
  log_date: string;
  weight_sma7: number | null;
  /** 推定 TDEE (kcal/日)。canonical source: enrich.py */
  tdee_estimated: number | null;
  /** 後方 7 日の推定 TDEE 平均 (kcal/日)。enrich.py で事前計算済み。短期変化確認用。 */
  avg_tdee_7d?: number | null;
  /** 後方 14 日の推定 TDEE 平均 (kcal/日)。enrich.py で事前計算済み。傾向判断用の基準線。 */
  avg_tdee_14d?: number | null;
  /** 後方 7 日の摂取カロリー平均 (kcal/日)。enrich.py で事前計算済み。 */
  avg_calories_7d?: number | null;
}

// ── Backtest table aliases ────────────────────────────────────────────────────
export type ForecastBacktestRun =
  Database["public"]["Tables"]["forecast_backtest_runs"]["Row"];
export type ForecastBacktestMetric =
  Database["public"]["Tables"]["forecast_backtest_metrics"]["Row"];
export type ForecastBacktestPrediction =
  Database["public"]["Tables"]["forecast_backtest_predictions"]["Row"];
