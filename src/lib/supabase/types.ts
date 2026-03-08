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
      daily_logs: {
        Row: {
          log_date: string;
          weight: number | null;
          calories: number | null;
          protein: number | null;
          fat: number | null;
          carbs: number | null;
          note: string | null;
        };
        Insert: {
          log_date: string;
          weight?: number | null;
          calories?: number | null;
          protein?: number | null;
          fat?: number | null;
          carbs?: number | null;
          note?: string | null;
        };
        Update: {
          log_date?: string;
          weight?: number | null;
          calories?: number | null;
          protein?: number | null;
          fat?: number | null;
          carbs?: number | null;
          note?: string | null;
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
    Functions: Record<string, never>;
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
