"""
feature_registry.py — 因子分析 特徴量定義の単一ソース

このファイルが analyze.py・フロントエンド・将来の SHAP 移行すべての正本となる。

■ 設計方針
  - 特徴量の「名前 / 表示ラベル / 型 / nullable / ソース列 / encoder 方針 / 有効フラグ」を
    FeatureDef に集約する。
  - analyze.py は active_feature_cols() / active_feature_labels() を呼んで使う。
    FEATURE_COLS / FEATURE_LABELS を直書きしない。
  - フロントエンドは _meta.feature_labels (payload に含まれる) をフォールバックとして使える。
    featureLabels.ts の FEATURE_LABEL_MAP が第一優先だが、未登録キーは payload 側を使用する。

■ active フラグの意味
  active=True  : 現在の XGBoost 学習で使用する
  active=False : 将来の feature-set 比較候補。定義だけ登録済み。

■ 新規特徴量の追加手順
  1. ここに FeatureDef を追加する（active=False で先行登録可）
  2. apply_feature_engineering() に列生成コードを追加する
  3. active=True に変更する
  4. featureLabels.ts の FEATURE_LABEL_MAP に同じラベルを追加する (任意)
     ※ featureLabels.ts に追加しなくても _meta.feature_labels が fallback になるため
       フロント表示は壊れない

■ SHAP 移行時の想定
  - analyze.py の run_importance() を SHAP に差し替える際、feature_registry の
    encoder_hint を参照して前処理を決定する。
  - FEATURE_REGISTRY の feature 定義は変えずに analyze.py 側だけ書き換えられる。
"""

from dataclasses import dataclass
from enum import Enum


# ── 列挙型 ─────────────────────────────────────────────────────────────────────

class FeatureDtype(str, Enum):
    """特徴量の型カテゴリ。encoder 選択・欠損処理方針の決定に使用する。"""
    NUMERIC  = "numeric"   # 連続値 (calories, weight, sleep_hours 等)
    BOOLEAN  = "boolean"   # True/False (is_cheat_day, leg_flag 等)
    CATEGORY = "category"  # 有限カテゴリ (training_type, work_mode 等)


class EncoderHint(str, Enum):
    """SHAP 移行時・特徴量エンジニアリング時の encoder 方針。

    現状は XGBoost (tree-based) のため encoding 不要だが、
    将来 linear / neural 系モデルを追加する場合に参照する。
    """
    PASSTHROUGH    = "passthrough"    # numeric: そのまま渡す
    ORDINAL        = "ordinal"        # boolean: 0/1 に変換
    ONE_HOT        = "one_hot"        # category: one-hot encoding
    TARGET_ENCODE  = "target_encode"  # category: target encoding (高カーディナリティ向け)


class TargetType(str, Enum):
    """目的変数の種類。

    現在は NEXT_DAY_CHANGE のみ実装。
    将来の比較実験で追加する候補を Enum に先行登録しておく。

    追加手順:
      1. ここに値を追加する
      2. apply_feature_engineering() に計算式を追加する
      3. analyze.py の run_importance / compute_meta に target_type 引数を渡す
    """
    NEXT_DAY_CHANGE = "next_day_change"
    # 将来候補 (実装前):
    # TWO_DAY_CHANGE  = "two_day_change"   # weight.shift(-2) - weight


# ── 特徴量定義型 ───────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class FeatureDef:
    """特徴量1件の完全な定義。

    フィールド:
      name          : 特徴量エンジニアリング後の列名 (XGBoost / SHAP に渡す名前)
      label         : 日本語表示ラベル (フロントエンドの fallback にもなる)
      dtype         : 型カテゴリ (FeatureDtype)
      nullable      : ソース列が NULL を許容するか
      source_col    : daily_logs 上の元列名 (feature coverage 算出に使用)
      encoder_hint  : SHAP 移行時・線形モデル追加時の encoder 方針 (EncoderHint)
      active        : 現在の学習で使用するか
                      False = 将来候補として定義済み、学習には含めない
    """
    name:         str
    label:        str
    dtype:        FeatureDtype
    nullable:     bool
    source_col:   str
    encoder_hint: EncoderHint = EncoderHint.PASSTHROUGH
    active:       bool        = True


# ── 特徴量レジストリ ────────────────────────────────────────────────────────────

FEATURE_REGISTRY: list[FeatureDef] = [
    # ── 現在アクティブな特徴量 (analyze.py FEATURE_COLS と等価) ───────────────
    FeatureDef(
        name="cal_lag1",
        label="摂取 kcal（当日）",
        dtype=FeatureDtype.NUMERIC,
        nullable=False,
        source_col="calories",
        encoder_hint=EncoderHint.PASSTHROUGH,
        active=True,
    ),
    FeatureDef(
        name="rolling_cal_7",
        label="摂取 kcal（週平均）",
        dtype=FeatureDtype.NUMERIC,
        nullable=False,
        source_col="calories",
        encoder_hint=EncoderHint.PASSTHROUGH,
        active=True,
    ),
    FeatureDef(
        name="p_lag1",
        label="タンパク質（g）",
        dtype=FeatureDtype.NUMERIC,
        nullable=False,
        source_col="protein",
        encoder_hint=EncoderHint.PASSTHROUGH,
        active=True,
    ),
    FeatureDef(
        name="f_lag1",
        label="脂質（g）",
        dtype=FeatureDtype.NUMERIC,
        nullable=False,
        source_col="fat",
        encoder_hint=EncoderHint.PASSTHROUGH,
        active=True,
    ),
    FeatureDef(
        name="c_lag1",
        label="炭水化物（g）",
        dtype=FeatureDtype.NUMERIC,
        nullable=False,
        source_col="carbs",
        encoder_hint=EncoderHint.PASSTHROUGH,
        active=True,
    ),

    # ── 将来の特徴量候補 (active=False; データ蓄積後に着手) ──────────────────
    FeatureDef(
        name="sleep_hours",
        label="睡眠時間（h）",
        dtype=FeatureDtype.NUMERIC,
        nullable=True,
        source_col="sleep_hours",
        encoder_hint=EncoderHint.PASSTHROUGH,
        active=False,
    ),
    FeatureDef(
        name="had_bowel_movement",
        label="便通あり",
        dtype=FeatureDtype.BOOLEAN,
        nullable=True,
        source_col="had_bowel_movement",
        encoder_hint=EncoderHint.ORDINAL,
        active=False,
    ),
    FeatureDef(
        name="is_cheat_day",
        label="チートデイ",
        dtype=FeatureDtype.BOOLEAN,
        nullable=False,
        source_col="is_cheat_day",
        encoder_hint=EncoderHint.ORDINAL,
        active=False,
    ),
    FeatureDef(
        name="is_refeed_day",
        label="リフィードデイ",
        dtype=FeatureDtype.BOOLEAN,
        nullable=False,
        source_col="is_refeed_day",
        encoder_hint=EncoderHint.ORDINAL,
        active=False,
    ),
    FeatureDef(
        name="is_eating_out",
        label="外食日",
        dtype=FeatureDtype.BOOLEAN,
        nullable=False,
        source_col="is_eating_out",
        encoder_hint=EncoderHint.ORDINAL,
        active=False,
    ),
    FeatureDef(
        name="is_poor_sleep",
        label="睡眠不足",
        dtype=FeatureDtype.BOOLEAN,
        nullable=False,
        source_col="is_poor_sleep",
        encoder_hint=EncoderHint.ORDINAL,
        active=False,
    ),
    FeatureDef(
        name="leg_flag",
        label="脚トレ日",
        dtype=FeatureDtype.BOOLEAN,
        nullable=True,
        source_col="leg_flag",
        encoder_hint=EncoderHint.ORDINAL,
        active=False,
    ),
    FeatureDef(
        name="training_type",
        label="トレーニング種別",
        dtype=FeatureDtype.CATEGORY,
        nullable=True,
        source_col="training_type",
        encoder_hint=EncoderHint.ONE_HOT,
        active=False,
    ),
    FeatureDef(
        name="work_mode",
        label="勤務形態",
        dtype=FeatureDtype.CATEGORY,
        nullable=True,
        source_col="work_mode",
        encoder_hint=EncoderHint.ONE_HOT,
        active=False,
    ),
]


# ── ユーティリティ ──────────────────────────────────────────────────────────────

def active_features() -> list[FeatureDef]:
    """現在学習に使用するアクティブな特徴量リストを返す。"""
    return [f for f in FEATURE_REGISTRY if f.active]


def active_feature_cols() -> list[str]:
    """現在学習に使用する特徴量列名リストを返す。analyze.py の FEATURE_COLS に相当。"""
    return [f.name for f in FEATURE_REGISTRY if f.active]


def active_feature_labels() -> dict[str, str]:
    """現在学習に使用する特徴量の {name: label} 辞書を返す。

    analyze.py の run_importance() が label を解決するために使う。
    payload の _meta.feature_labels に格納することでフロントが fallback として使える。
    """
    return {f.name: f.label for f in FEATURE_REGISTRY if f.active}


def all_feature_labels() -> dict[str, str]:
    """全特徴量 (active/inactive 問わず) の {name: label} 辞書を返す。

    featureLabels.ts の FEATURE_LABEL_MAP との同期確認や
    将来の SHAP 結果表示に使用する。
    """
    return {f.name: f.label for f in FEATURE_REGISTRY}
