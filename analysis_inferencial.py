"""
Análisis inferencial — comparación de grupos (supuestos + ANOVA / Welch / Kruskal-Wallis).
"""
from __future__ import annotations

import math
import re
from itertools import combinations
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException

try:
    from scipy import stats as scipy_stats
except ImportError:  # pragma: no cover
    scipy_stats = None

try:
    import scikit_posthocs as spost
except ImportError:  # pragma: no cover
    spost = None

ALPHA = 0.05
MIN_GROUP_N = 2
MIN_GROUPS = 2
NORMALITY_RESIDUAL_THRESHOLD = 50

DERIVED_VARIABLE_SPECS: List[Dict[str, Any]] = [
    {
        "id": "tg_hdl",
        "label": "Relación triglicéridos / HDL (calculada)",
        "derived": True,
        "num_requested": ["Trigliceridos"],
        "den_requested": ["HDL_Colesterol"],
    },
    {
        "id": "atherogenic",
        "label": "Índice aterogénico No-HDL/HDL (calculada)",
        "derived": True,
        "num_requested": ["No_HDL_Colesterol"],
        "den_requested": ["HDL_Colesterol"],
    },
]

LIPID_COLUMN_SPECS: List[Dict[str, Any]] = [
    {"requested": ["Trigliceridos"]},
    {"requested": ["Colesterol_Total"]},
    {"requested": ["LDL_Colesterol"]},
    {"requested": ["HDL_Colesterol"]},
    {"requested": ["Glucosa"]},
    {"requested": ["No_HDL_Colesterol"]},
]

LIPID_PANEL_SPECS: List[Dict[str, Any]] = LIPID_COLUMN_SPECS + DERIVED_VARIABLE_SPECS

ANTHROPOMETRIC_PROFILE_SPECS: List[Dict[str, Any]] = [
    {"requested": ["Peso_kg"]},
    {"requested": ["Estatura_cm", "Talla_cm"]},
    {"requested": ["IMC"], "exact_imc": True},
    {"requested": ["Circunferencia_Cintura", "Cinrcunferencia_Cintura"]},
    {"requested": ["Perimetro_Braquial"]},
    {"requested": ["Perimetro_Cefalico"]},
]


def _derived_spec_by_id(variable_id: str) -> Optional[Dict[str, Any]]:
    return next((s for s in DERIVED_VARIABLE_SPECS if s["id"] == variable_id), None)


def _match_columns_requested(requested: List[str], available: List[str]) -> List[str]:
    """Coincide columnas por nombre (misma lógica que análisis descriptivo)."""
    out: List[str] = []
    for col in available:
        nc = _norm_col(col)
        for req in requested:
            key = _norm_col(req)
            if not key:
                continue
            if (
                nc == key
                or nc.startswith(key + "_")
                or nc.endswith("_" + key)
                or ("_" + key + "_") in ("_" + nc + "_")
            ):
                if col not in out:
                    out.append(col)
                break
    return out


def _match_column(cols: List[str], name: str) -> Optional[str]:
    key = _norm_col(name)
    for col in cols:
        if _norm_col(col) == key:
            return col
    return None


def _resolve_spec_column(spec: Dict[str, Any], cols: List[str]) -> Optional[str]:
    if spec.get("exact_imc"):
        for col in cols:
            if _norm_col(col) == "imc":
                return col
        return None
    matched = _match_columns_requested(spec.get("requested", []), cols)
    return matched[0] if matched else None


def _build_resolved_profile_panel(
    specs: List[Dict[str, Any]],
    cols: List[str],
    numeric_options: List[Dict[str, Any]],
    title: str,
    description: str,
) -> Dict[str, Any]:
    opt_ids = {o["id"] for o in numeric_options}
    variables: List[Dict[str, Any]] = []
    for spec in specs:
        if spec.get("derived"):
            variables.append(
                {
                    "id": spec["id"],
                    "label": spec["label"],
                    "derived": True,
                    "available": spec["id"] in opt_ids,
                }
            )
            continue
        col = _resolve_spec_column(spec, cols)
        variables.append(
            {
                "id": col or "",
                "label": col or ", ".join(spec.get("requested", [])),
                "derived": False,
                "available": bool(col and col in opt_ids),
            }
        )
    return {
        "title": title,
        "description": description,
        "variable_ids": [v["id"] for v in variables if v.get("id")],
        "variables": variables,
    }


def _api():
    from analysis_api import _find_dataset, _read_dataframe, infer_variable_type

    return _find_dataset, _read_dataframe, infer_variable_type


def _norm_col(name: str) -> str:
    s = str(name).strip().lower()
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s


def _get_df(dataset_id: str) -> Tuple[pd.DataFrame, Dict[str, str], Dict[str, Any]]:
    _find_dataset, _read_dataframe, infer_variable_type = _api()
    info = _find_dataset(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    path = info.get("file_path", "")
    if not path or not __import__("os").path.exists(path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    df = _read_dataframe(path)
    types = dict(info.get("variable_types") or {})
    for col in df.columns:
        cs = str(col)
        if cs not in types:
            types[cs] = infer_variable_type(df[col])
    return df, types, info


def _is_numeric_type(t: str) -> bool:
    return t in ("numeric_discrete", "numeric_continuous")


def _series_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def _safe_round(v: Any, nd: int = 4) -> Any:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    try:
        return round(float(v), nd)
    except (TypeError, ValueError):
        return v


def _p_fmt(p: Optional[float]) -> str:
    if p is None:
        return "—"
    if p < 0.001:
        return "<0.001"
    return str(_safe_round(p, 4))


def _resolve_dependent_series(df: pd.DataFrame, variable_id: str, cols: List[str]) -> Tuple[Optional[pd.Series], str]:
    derived = _derived_spec_by_id(variable_id)
    if derived is not None:
        num = _match_columns_requested(derived.get("num_requested", []), cols)
        den = _match_columns_requested(derived.get("den_requested", []), cols)
        if not num or not den:
            return None, derived["label"]
        numerator = _series_numeric(df[num[0]])
        denominator = _series_numeric(df[den[0]])
        return numerator / denominator.where(denominator > 0), derived["label"]
    if variable_id in cols:
        return _series_numeric(df[variable_id]), variable_id
    return None, variable_id


def _build_numeric_options(df: pd.DataFrame, types: Dict[str, str]) -> List[Dict[str, Any]]:
    cols = [str(c) for c in df.columns]
    out: List[Dict[str, Any]] = []
    min_n = MIN_GROUP_N * MIN_GROUPS
    for col in cols:
        if not _is_numeric_type(types.get(col, "")):
            continue
        s = _series_numeric(df[col])
        if int(s.notna().sum()) < min_n:
            continue
        out.append({"id": col, "label": col, "derived": False, "column": col})
    for spec in DERIVED_VARIABLE_SPECS:
        series, label = _resolve_dependent_series(df, spec["id"], cols)
        if series is None or int(series.notna().sum()) < min_n:
            continue
        out.append(
            {
                "id": spec["id"],
                "label": label,
                "derived": True,
                "column": None,
            }
        )
    return out


def _build_categorical_options(df: pd.DataFrame, types: Dict[str, str]) -> List[Dict[str, Any]]:
    cols = [str(c) for c in df.columns]
    out: List[Dict[str, Any]] = []
    for col in cols:
        if _is_numeric_type(types.get(col, "")):
            continue
        uniq = df[col].dropna().astype(str).str.strip().unique()
        if len(uniq) < MIN_GROUPS:
            continue
        out.append({"column": col, "label": col, "levels": int(len(uniq))})
    preferred = next((c for c in out if _norm_col(c["column"]) == "condicion"), None)
    if preferred:
        out.remove(preferred)
        out.insert(0, preferred)
    return out


def _prepare_groups(
    df: pd.DataFrame, factor_col: str, y: pd.Series
) -> Tuple[List[str], List[np.ndarray], pd.DataFrame]:
    work = pd.DataFrame({"group": df[factor_col].astype(str).str.strip(), "y": y})
    work = work.replace({"": np.nan, "nan": np.nan, "None": np.nan})
    work = work.dropna(subset=["group", "y"])
    counts = work["group"].value_counts()
    labels = [str(g) for g in counts.index if int(counts[g]) >= MIN_GROUP_N]
    if len(labels) < MIN_GROUPS:
        raise HTTPException(
            status_code=400,
            detail="Se requieren al menos dos grupos con n≥2 en la variable factor",
        )
    groups = [work.loc[work["group"] == lab, "y"].astype(float).to_numpy() for lab in labels]
    return labels, groups, work


def _anova_residuals(groups: List[np.ndarray]) -> np.ndarray:
    parts: List[float] = []
    for g in groups:
        if len(g) < 1:
            continue
        parts.extend((g - float(np.mean(g))).tolist())
    return np.asarray(parts, dtype=float)


def _skew_kurtosis(arr: np.ndarray) -> Dict[str, Optional[float]]:
    if scipy_stats is None or len(arr) < 3:
        return {"skewness": None, "kurtosis": None}
    return {
        "skewness": _safe_round(float(scipy_stats.skew(arr, bias=False)), 4),
        "kurtosis": _safe_round(float(scipy_stats.kurtosis(arr, fisher=True, bias=False)), 4),
    }


def _qq_data(values: np.ndarray) -> Dict[str, Any]:
    """Q-Q contra normal: residuos estandarizados vs cuantiles teóricos N(0,1)."""
    arr = values[np.isfinite(values)].astype(float)
    n = len(arr)
    if n < 2:
        return {"sample": [], "theoretical": [], "reference_line": None}
    if scipy_stats is None:
        probs = np.linspace(0.05, 0.95, min(80, n))
        sample_q = np.quantile(arr, probs)
        return {
            "sample": [_safe_round(float(v), 4) for v in sample_q],
            "theoretical": [],
            "reference_line": None,
        }
    mean = float(np.mean(arr))
    std = float(np.std(arr, ddof=1))
    standardized = arr - mean if std <= 0 else (arr - mean) / std
    probs = (np.arange(1, n + 1) - 0.5) / n
    theoretical = scipy_stats.norm.ppf(probs)
    sample_sorted = np.sort(standardized)
    lo = float(min(theoretical.min(), sample_sorted.min()))
    hi = float(max(theoretical.max(), sample_sorted.max()))
    pad = max((hi - lo) * 0.04, 0.15)
    axis_lo = lo - pad
    axis_hi = hi + pad
    return {
        "sample": [_safe_round(float(v), 4) for v in sample_sorted],
        "theoretical": [_safe_round(float(v), 4) for v in theoretical],
        "reference_line": {
            "x": [axis_lo, axis_hi],
            "y": [axis_lo, axis_hi],
        },
        "axis_range": [_safe_round(axis_lo, 4), _safe_round(axis_hi, 4)],
        "standardized": True,
    }


def _normality_on_residuals(residuals: np.ndarray) -> Dict[str, Any]:
    n = len(residuals)
    sk = _skew_kurtosis(residuals)
    out: Dict[str, Any] = {
        **sk,
        "n_residuals": n,
        "note": "Normalidad evaluada sobre los residuos del modelo ANOVA de una vía (no sobre la variable cruda).",
        "histogram_values": [_safe_round(float(v), 4) for v in residuals],
        "qqplot": _qq_data(residuals),
    }
    if n < 3 or scipy_stats is None:
        out.update({"test": "—", "statistic": None, "p_value": None, "normal": False})
        return out
    if n < NORMALITY_RESIDUAL_THRESHOLD:
        stat, p = scipy_stats.shapiro(residuals)
        out["test"] = "Shapiro-Wilk"
    else:
        std = float(np.std(residuals, ddof=1))
        if std <= 0:
            out.update({"test": "Kolmogorov-Smirnov", "statistic": None, "p_value": None, "normal": False})
            return out
        stat, p = scipy_stats.kstest(residuals, "norm", args=(float(np.mean(residuals)), std))
        out["test"] = "Kolmogorov-Smirnov"
    out["statistic"] = _safe_round(float(stat), 4)
    out["p_value"] = _safe_round(float(p), 4)
    out["normal"] = bool(p >= ALPHA)
    return out


def _levene_test(groups: List[np.ndarray]) -> Dict[str, Any]:
    if scipy_stats is None:
        return {"test": "Levene", "statistic": None, "p_value": None, "homogeneous": False}
    stat, p = scipy_stats.levene(*groups, center="median")
    return {
        "test": "Levene (mediana)",
        "statistic": _safe_round(float(stat), 4),
        "p_value": _safe_round(float(p), 4),
        "homogeneous": bool(p >= ALPHA),
    }


def _recommend_method(normal: bool, homogeneous: bool) -> Dict[str, str]:
    if normal and homogeneous:
        return {
            "method": "anova",
            "label": "ANOVA de una vía",
            "reason": "Normalidad en residuos y homocedasticidad (Levene) con p≥0,05.",
        }
    if normal and not homogeneous:
        return {
            "method": "welch",
            "label": "ANOVA de Welch",
            "reason": "Normalidad en residuos, pero heterocedasticidad (Levene p<0,05).",
        }
    return {
        "method": "kruskal",
        "label": "Kruskal-Wallis",
        "reason": "No se cumple normalidad de los residuos; se usa prueba no paramétrica.",
    }


def _assumptions_payload(df: pd.DataFrame, factor_col: str, dependent_id: str) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    if factor_col not in df.columns:
        raise HTTPException(status_code=404, detail="Variable factor no encontrada")
    y_series, y_label = _resolve_dependent_series(df, dependent_id, cols)
    if y_series is None:
        raise HTTPException(status_code=404, detail="Variable dependiente no disponible")
    labels, groups, work = _prepare_groups(df, factor_col, y_series)
    residuals = _anova_residuals(groups)
    normality = _normality_on_residuals(residuals)
    levene = _levene_test(groups)
    recommendation = _recommend_method(bool(normality.get("normal")), bool(levene.get("homogeneous")))
    group_summaries = []
    for lab, g in zip(labels, groups):
        group_summaries.append(
            {
                "label": lab,
                "n": int(len(g)),
                "mean": _safe_round(float(np.mean(g)), 2),
                "sd": _safe_round(float(np.std(g, ddof=1)), 2) if len(g) > 1 else 0.0,
            }
        )
    return {
        "factor_column": factor_col,
        "dependent_id": dependent_id,
        "dependent_label": y_label,
        "groups": group_summaries,
        "normality": normality,
        "homogeneity": levene,
        "recommendation": recommendation,
    }


EFFECT_SIZE_RANGES: List[Dict[str, str]] = [
    {"label": "Efecto pequeño", "range": "≥ 0.01 y < 0.06"},
    {"label": "Efecto moderado", "range": "≥ 0.06 y < 0.14"},
    {"label": "Efecto grande", "range": "≥ 0.14"},
]


def _interpret_effect_size(value: Optional[float]) -> Tuple[str, str]:
    if value is None or (isinstance(value, float) and (math.isnan(value) or math.isinf(value))):
        return "—", "No calculable"
    if value < 0.01:
        return "despreciable", "Efecto despreciable (< 0.01)"
    if value < 0.06:
        return "pequeño", "Efecto pequeño (≥ 0.01 y < 0.06)"
    if value < 0.14:
        return "moderado", "Efecto moderado (≥ 0.06 y < 0.14)"
    return "grande", "Efecto grande (≥ 0.14)"


def _ss_oneway_components(groups: List[np.ndarray]) -> Tuple[float, float, float, int, int, float]:
    all_y = np.concatenate(groups)
    n_total = len(all_y)
    k = len(groups)
    grand = float(np.mean(all_y))
    ss_between = sum(len(g) * (float(np.mean(g)) - grand) ** 2 for g in groups)
    ss_within = sum(float(np.sum((g - np.mean(g)) ** 2)) for g in groups)
    ss_total = ss_between + ss_within
    df_between = k - 1
    df_within = n_total - k
    ms_within = ss_within / df_within if df_within > 0 else float("nan")
    return ss_between, ss_within, ss_total, df_between, df_within, ms_within


def _eta_squared(groups: List[np.ndarray]) -> Optional[float]:
    ss_between, _, ss_total, _, _, _ = _ss_oneway_components(groups)
    if ss_total <= 0:
        return None
    return float(ss_between / ss_total)


def _omega_squared(groups: List[np.ndarray]) -> Optional[float]:
    ss_between, _, ss_total, df_between, _, ms_within = _ss_oneway_components(groups)
    if math.isnan(ms_within) or (ss_total + ms_within) <= 0:
        return None
    return float((ss_between - df_between * ms_within) / (ss_total + ms_within))


def _epsilon_squared_kruskal(h_stat: float, k: int, n: int) -> Optional[float]:
    if n <= k:
        return None
    return float((h_stat - k + 1) / (n - k))


def _build_effect_size(method: str, groups: List[np.ndarray], global_tbl: Dict[str, Any]) -> Dict[str, Any]:
    from analysis_effect_ci import (
        build_ci_dict,
        ci_epsilon_squared,
        ci_eta_squared,
        ci_omega_squared,
    )

    method = method.lower().strip()
    ci_lo: Optional[float] = None
    ci_hi: Optional[float] = None
    if method == "anova":
        value = _eta_squared(groups)
        name = "Eta cuadrado"
        symbol = "η²"
        note = "Proporción de varianza explicada por el factor (ANOVA de una vía)."
        ci_lo, ci_hi = ci_eta_squared(groups)
    elif method == "welch":
        value = _omega_squared(groups)
        name = "Omega cuadrado"
        symbol = "ω²"
        note = (
            "Estimador menos sesgado que η²; recomendado con tamaños muestrales desiguales "
            "(ANOVA de Welch)."
        )
        ci_lo, ci_hi = ci_omega_squared(groups)
    else:
        h_stat = float(global_tbl.get("statistic") or 0)
        k = len(groups)
        n = int(sum(len(g) for g in groups))
        value = _epsilon_squared_kruskal(h_stat, k, n)
        name = "Épsilon cuadrado ordinal"
        symbol = "ε²"
        note = "Tamaño del efecto para Kruskal-Wallis basado en la estadística H."
        ci_lo, ci_hi = ci_epsilon_squared(h_stat, k, n)
    category, interpretation = _interpret_effect_size(value)
    rounded = _safe_round(value, 4) if value is not None else None
    ci = build_ci_dict(ci_lo, ci_hi)
    ci_display = ci.get("display") if ci else "—"
    return {
        "name": name,
        "symbol": symbol,
        "value": rounded,
        "value_display": "—" if rounded is None else str(rounded),
        "category": category,
        "interpretation": interpretation,
        "note": note,
        "interpretation_ranges": list(EFFECT_SIZE_RANGES),
        "ci": ci,
        "table": {
            "measure": f"{name} ({symbol})",
            "value": "—" if rounded is None else str(rounded),
            "ci": ci_display,
            "interpretation": interpretation if category != "—" else "—",
        },
    }


def _anova_table(groups: List[np.ndarray], labels: List[str]) -> Dict[str, Any]:
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido")
    all_y = np.concatenate(groups)
    n_total = len(all_y)
    k = len(groups)
    grand = float(np.mean(all_y))
    ss_between = sum(len(g) * (float(np.mean(g)) - grand) ** 2 for g in groups)
    ss_within = sum(float(np.sum((g - np.mean(g)) ** 2)) for g in groups)
    ss_total = ss_between + ss_within
    df_between = k - 1
    df_within = n_total - k
    ms_between = ss_between / df_between if df_between else np.nan
    ms_within = ss_within / df_within if df_within else np.nan
    f_stat = ms_between / ms_within if ms_within else np.nan
    p_val = float(1 - scipy_stats.f.cdf(f_stat, df_between, df_within))
    stat, p_oneway = scipy_stats.f_oneway(*groups)
    rows = [
        {
            "source": "Factor (entre grupos)",
            "df": df_between,
            "sum_sq": ss_between,
            "mean_sq": ms_between,
            "F": f_stat,
            "p": p_val,
        },
    ]
    rows.append(
        {
            "source": "Residuals",
            "df": df_within,
            "sum_sq": ss_within,
            "mean_sq": ms_within,
            "F": None,
            "p": None,
        }
    )
    rows.append({"source": "Total", "df": n_total - 1, "sum_sq": ss_total, "mean_sq": None, "F": None, "p": None})
    return {
        "rows": [
            {
                "source": r["source"],
                "df": _safe_round(r["df"], 2),
                "sum_sq": _safe_round(r["sum_sq"], 4),
                "mean_sq": _safe_round(r["mean_sq"], 4) if r["mean_sq"] is not None else None,
                "F": _safe_round(r["F"], 4) if r["F"] is not None else None,
                "p": _p_fmt(r["p"]) if r["p"] is not None else "—",
            }
            for r in rows
        ],
        "statistic": _safe_round(float(stat), 4),
        "p_value": _safe_round(float(p_oneway), 4),
        "global_p_label": _p_fmt(p_oneway),
    }


def _welch_anova_table(groups: List[np.ndarray]) -> Dict[str, Any]:
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido")
    k = len(groups)
    ns = np.array([len(g) for g in groups], dtype=float)
    means = np.array([float(np.mean(g)) for g in groups])
    vars_ = np.array([float(np.var(g, ddof=1)) if len(g) > 1 else np.nan for g in groups])
    weights = ns / vars_
    wsum = float(np.sum(weights))
    grand = float(np.sum(weights * means) / wsum)
    num = float(np.sum(weights * (means - grand) ** 2) / (k - 1))
    inv = float(np.sum((1 - weights / wsum) ** 2 / (ns - 1)))
    denom = 1.0 + (2.0 * (k - 2) / (k * k - 1)) * inv
    f_stat = num / denom
    df1 = k - 1
    df2 = 1.0 / (3.0 * inv / (k * k - 1)) if inv > 0 else 1e9
    p_val = float(1.0 - scipy_stats.f.cdf(f_stat, df1, df2))
    rows = [
        {
            "source": "Factor (Welch)",
            "df1": _safe_round(df1, 2),
            "df2": _safe_round(df2, 2),
            "F": _safe_round(f_stat, 4),
            "p": _p_fmt(p_val),
        }
    ]
    return {"rows": rows, "statistic": _safe_round(f_stat, 4), "p_value": _safe_round(p_val, 4), "global_p_label": _p_fmt(p_val)}


def _kruskal_table(groups: List[np.ndarray]) -> Dict[str, Any]:
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido")
    stat, p = scipy_stats.kruskal(*groups)
    rows = [
        {
            "source": "Factor",
            "df": len(groups) - 1,
            "chi_sq": _safe_round(float(stat), 4),
            "p": _p_fmt(float(p)),
        }
    ]
    return {
        "rows": rows,
        "statistic": _safe_round(float(stat), 4),
        "p_value": _safe_round(float(p), 4),
        "global_p_label": _p_fmt(float(p)),
    }


def _posthoc_tukey(groups: List[np.ndarray], labels: List[str]) -> Dict[str, Any]:
    if scipy_stats is None or not hasattr(scipy_stats, "tukey_hsd"):
        raise HTTPException(status_code=500, detail="Tukey HSD no disponible (SciPy)")
    res = scipy_stats.tukey_hsd(*groups)
    p_matrix = res.pvalue
    rows = []
    for i, j in combinations(range(len(labels)), 2):
        p = float(p_matrix[i, j])
        rows.append(
            {
                "g1": labels[i],
                "g2": labels[j],
                "diff": _safe_round(float(np.mean(groups[i]) - np.mean(groups[j])), 4),
                "p_adj": _safe_round(p, 4),
                "significant": bool(p < ALPHA),
            }
        )
    return {
        "test": "Tukey HSD",
        "correction": "FWER integrado en Tukey (no Bonferroni adicional)",
        "rows": rows,
    }


def _posthoc_games_howell(groups: List[np.ndarray], labels: List[str]) -> Dict[str, Any]:
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido")
    rows = []
    for i, j in combinations(range(len(labels)), 2):
        g1, g2 = groups[i], groups[j]
        n1, n2 = len(g1), len(g2)
        v1 = float(np.var(g1, ddof=1)) if n1 > 1 else 0.0
        v2 = float(np.var(g2, ddof=1)) if n2 > 1 else 0.0
        se = math.sqrt(v1 / n1 + v2 / n2) if n1 and n2 else float("inf")
        diff = float(np.mean(g1) - np.mean(g2))
        if se <= 0:
            p = 1.0
        else:
            t_abs = abs(diff) / se
            num = (v1 / n1 + v2 / n2) ** 2
            den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1)
            df = num / den if den > 0 else 1.0
            p = float(2 * (1 - scipy_stats.t.cdf(t_abs, df)))
        rows.append(
            {
                "g1": labels[i],
                "g2": labels[j],
                "diff": _safe_round(diff, 4),
                "p_adj": _safe_round(p, 4),
                "significant": bool(p < ALPHA),
            }
        )
    return {
        "test": "Games-Howell",
        "correction": "Ajuste incorporado en la prueba (par parejas, heterocedasticidad)",
        "rows": rows,
    }


def _posthoc_dunn(work: pd.DataFrame, labels: List[str]) -> Dict[str, Any]:
    if spost is not None:
        ph = spost.posthoc_dunn(work, val_col="y", group_col="group", p_adjust="bonferroni")
        rows = []
        for i, j in combinations(range(len(labels)), 2):
            g1, g2 = labels[i], labels[j]
            p = float(ph.loc[g1, g2]) if g1 in ph.index and g2 in ph.columns else float(ph.loc[g2, g1])
            rows.append(
                {
                    "g1": g1,
                    "g2": g2,
                    "diff": None,
                    "p_adj": _safe_round(p, 4),
                    "significant": bool(p < ALPHA),
                }
            )
        return {"test": "Dunn", "correction": "Bonferroni", "rows": rows}
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido para post-hoc")
    group_arrays = [
        work.loc[work["group"] == lab, "y"].astype(float).to_numpy() for lab in labels
    ]
    raw = []
    pairs = list(combinations(range(len(labels)), 2))
    for i, j in pairs:
        _, p = scipy_stats.mannwhitneyu(
            group_arrays[i], group_arrays[j], alternative="two-sided"
        )
        raw.append(float(p))
    m = len(raw)
    rows = []
    for k, (i, j) in enumerate(pairs):
        p_adj = min(1.0, raw[k] * m)
        rows.append(
            {
                "g1": labels[i],
                "g2": labels[j],
                "diff": None,
                "p_adj": _safe_round(p_adj, 4),
                "significant": bool(p_adj < ALPHA),
            }
        )
    return {
        "test": "Mann-Whitney (aprox. Dunn)",
        "correction": "Bonferroni",
        "rows": rows,
    }


def _boxplot_payload(labels: List[str], groups: List[np.ndarray]) -> Dict[str, Any]:
    return {
        "groups": [
            {"label": lab, "values": [_safe_round(float(v), 4) for v in g]}
            for lab, g in zip(labels, groups)
        ]
    }


def _run_test_payload(
    df: pd.DataFrame, factor_col: str, dependent_id: str, method: str
) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    y_series, y_label = _resolve_dependent_series(df, dependent_id, cols)
    if y_series is None:
        raise HTTPException(status_code=404, detail="Variable dependiente no disponible")
    labels, groups, work = _prepare_groups(df, factor_col, y_series)
    residuals = _anova_residuals(groups)
    normality = _normality_on_residuals(residuals)
    levene = _levene_test(groups)
    method = method.lower().strip()
    if method not in ("anova", "welch", "kruskal"):
        raise HTTPException(status_code=400, detail="Método no válido")

    if method == "anova":
        global_tbl = _anova_table(groups, labels)
        posthoc = _posthoc_tukey(groups, labels)
        method_label = "ANOVA de una vía"
    elif method == "welch":
        global_tbl = _welch_anova_table(groups)
        posthoc = _posthoc_games_howell(groups, labels)
        method_label = "ANOVA de Welch"
    else:
        global_tbl = _kruskal_table(groups)
        posthoc = _posthoc_dunn(work, labels)
        method_label = "Kruskal-Wallis"

    return {
        "factor_column": factor_col,
        "dependent_id": dependent_id,
        "dependent_label": y_label,
        "method": method,
        "method_label": method_label,
        "assumptions_summary": {
            "normality_test": normality.get("test"),
            "normality_p": normality.get("p_value"),
            "levene_p": levene.get("p_value"),
        },
        "global_table": global_tbl,
        "posthoc": posthoc,
        "boxplot": _boxplot_payload(labels, groups),
        "effect_size": _build_effect_size(method, groups, global_tbl),
    }


ANCOVA_COVARIATE_SPECS: List[Dict[str, Any]] = [
    {
        "id": "edad",
        "column": "Edad",
        "label": "Edad del niño (años)",
        "default": True,
        "rationale": "Confusor por crecimiento y maduración metabólica.",
    },
    {
        "id": "peso_nacer",
        "column": "peso_nacer",
        "label": "Peso al nacer",
        "default": True,
        "rationale": "Marcador de exposición intrauterina y programación fetal.",
    },
    {
        "id": "semanas_gestacion",
        "column": "semanas_gestacion",
        "label": "Semanas de gestación",
        "default": False,
        "rationale": "Edad gestacional; influye en metabolismo y composición corporal.",
    },
    {
        "id": "sexo",
        "column": "Sexo",
        "label": "Sexo del niño",
        "default": False,
        "kind": "binary",
        "rationale": "Diferencias sexuales en lípidos y antropometría.",
    },
    {
        "id": "talla_nacer",
        "column": "talla_nacer",
        "label": "Talla al nacer",
        "default": False,
        "rationale": "Complementa el peso al nacer (tamaño al nacer).",
    },
]


def _encode_binary_cov(series: pd.Series) -> pd.Series:
    raw = series.astype(str).str.strip().str.lower()
    raw = raw.replace({"": np.nan, "nan": np.nan, "none": np.nan})
    pos = {"si", "sí", "s", "yes", "y", "1", "true", "m", "masculino", "hombre"}
    neg = {"no", "n", "0", "false", "f", "femenino", "mujer"}
    out = pd.Series(np.nan, index=series.index, dtype=float)
    out[raw.isin(pos)] = 1.0
    out[raw.isin(neg)] = 0.0
    return out


def _ancova_covariate_series(df: pd.DataFrame, spec: Dict[str, Any], cols: List[str]) -> Optional[pd.Series]:
    col = _match_column(cols, spec.get("column", ""))
    if not col:
        return None
    if spec.get("kind") == "binary":
        return _encode_binary_cov(df[col])
    return pd.to_numeric(df[col], errors="coerce")


def _prepare_ancova_work(
    df: pd.DataFrame,
    factor_col: str,
    y: pd.Series,
    covariate_ids: List[str],
    cols: List[str],
) -> Tuple[pd.DataFrame, List[str], List[str]]:
    if not covariate_ids:
        raise HTTPException(status_code=400, detail="Seleccione al menos una covariable")
    work = pd.DataFrame({"group": df[factor_col].astype(str).str.strip(), "y": pd.to_numeric(y, errors="coerce")})
    work = work.replace({"": np.nan, "nan": np.nan, "None": np.nan})
    resolved_covs: List[str] = []
    for cid in covariate_ids:
        spec = next((s for s in ANCOVA_COVARIATE_SPECS if s["id"] == cid), None)
        if not spec:
            continue
        s = _ancova_covariate_series(df, spec, cols)
        if s is None:
            continue
        work[cid] = s
        resolved_covs.append(cid)
    if not resolved_covs:
        raise HTTPException(status_code=404, detail="Covariables no disponibles en la base")
    work = work.dropna()
    counts = work["group"].value_counts()
    labels = [str(g) for g in counts.index if int(counts[g]) >= MIN_GROUP_N]
    if len(labels) < MIN_GROUPS:
        raise HTTPException(status_code=400, detail="Se requieren al menos dos grupos con n≥2")
    work = work[work["group"].isin(labels)]
    min_n = max(20, MIN_GROUP_N * MIN_GROUPS * 2)
    if len(work) < min_n:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {min_n} observaciones completas (n={len(work)})",
        )
    return work, labels, resolved_covs


def _ancova_design_matrix(
    work: pd.DataFrame, labels: List[str], cov_ids: List[str], interactions: bool = False
) -> Tuple[np.ndarray, List[str]]:
    n = len(work)
    names = ["Intercept"]
    X = np.ones((n, 1), dtype=float)
    for lab in labels[1:]:
        col = (work["group"] == lab).astype(float).to_numpy()
        X = np.column_stack([X, col])
        names.append(f"Grupo:{lab}")
    for cid in cov_ids:
        X = np.column_stack([X, work[cid].astype(float).to_numpy()])
        names.append(cid)
    if interactions:
        for lab in labels[1:]:
            g = (work["group"] == lab).astype(float).to_numpy()
            for cid in cov_ids:
                X = np.column_stack([X, g * work[cid].astype(float).to_numpy()])
                names.append(f"{lab}×{cid}")
    return X, names


def _ancova_ols(y: np.ndarray, X: np.ndarray) -> Optional[Dict[str, Any]]:
    if scipy_stats is None:
        return None
    n, k = X.shape
    if n <= k + 1:
        return None
    try:
        beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
        y_hat = X @ beta
        resid = y - y_hat
        sse = float(np.sum(resid**2))
        df_error = n - k
        mse = sse / df_error if df_error > 0 else np.nan
        return {"beta": beta, "residuals": resid, "sse": sse, "df_error": df_error, "mse": mse, "n": n, "k": k}
    except np.linalg.LinAlgError:
        return None


def _ancova_partial_f_test(
    y: np.ndarray, work: pd.DataFrame, labels: List[str], cov_ids: List[str]
) -> Dict[str, Any]:
    X_cov = _ancova_design_matrix(work, labels, cov_ids, interactions=False)
    # Sin términos de grupo: intercepto + covariables
    n = len(y)
    X_red = np.column_stack([np.ones(n), work[cov_ids].astype(float).to_numpy()])
    X_full, _ = _ancova_design_matrix(work, labels, cov_ids, interactions=False)
    fit_red = _ancova_ols(y, X_red)
    fit_full = _ancova_ols(y, X_full)
    if not fit_red or not fit_full:
        return {"F": None, "p_value": None, "df1": None, "df2": None, "partial_eta_sq": None}
    df_factor = len(labels) - 1
    ss_factor = fit_red["sse"] - fit_full["sse"]
    ms_factor = ss_factor / df_factor if df_factor > 0 else np.nan
    f_stat = ms_factor / fit_full["mse"] if fit_full["mse"] and fit_full["mse"] > 0 else np.nan
    df2 = fit_full["df_error"]
    p_val = float(1 - scipy_stats.f.cdf(f_stat, df_factor, df2)) if scipy_stats and not math.isnan(f_stat) else None
    ss_total = fit_red["sse"]
    partial_eta = ss_factor / (ss_factor + fit_full["sse"]) if (ss_factor + fit_full["sse"]) > 0 else None
    return {
        "F": _safe_round(f_stat, 4),
        "p_value": _safe_round(p_val, 4) if p_val is not None else None,
        "df1": df_factor,
        "df2": df2,
        "partial_eta_sq": _safe_round(partial_eta, 4),
        "global_p_label": _p_fmt(p_val) if p_val is not None else "—",
    }


def _ancova_slopes_test(
    y: np.ndarray, work: pd.DataFrame, labels: List[str], cov_ids: List[str]
) -> Dict[str, Any]:
    X_main, _ = _ancova_design_matrix(work, labels, cov_ids, interactions=False)
    X_int, _ = _ancova_design_matrix(work, labels, cov_ids, interactions=True)
    fit_main = _ancova_ols(y, X_main)
    fit_int = _ancova_ols(y, X_int)
    if not fit_main or not fit_int:
        return {"ok": False, "interpretation": "No calculable", "p_value": None, "test": "—"}
    df_diff = X_int.shape[1] - X_main.shape[1]
    if df_diff <= 0:
        return {"ok": True, "interpretation": "Sin interacciones adicionales que evaluar.", "p_value": None, "test": "—"}
    ss_diff = fit_main["sse"] - fit_int["sse"]
    ms_diff = ss_diff / df_diff
    f_slopes = ms_diff / fit_int["mse"] if fit_int["mse"] and fit_int["mse"] > 0 else np.nan
    p_val = float(1 - scipy_stats.f.cdf(f_slopes, df_diff, fit_int["df_error"])) if scipy_stats else None
    ok = bool(p_val is not None and p_val >= ALPHA)
    return {
        "test": "Homogeneidad de pendientes (interacción grupo×covariable)",
        "statistic": _safe_round(f_slopes, 4),
        "p_value": _safe_round(p_val, 4) if p_val is not None else None,
        "ok": ok,
        "interpretation": (
            "Pendientes de covariables similares entre grupos (p≥0,05); ANCOVA apropiada"
            if ok
            else "Pendientes heterogéneas (p<0,05); la ANCOVA asume pendientes paralelas"
        ),
    }


def _ancova_assumptions_payload(
    df: pd.DataFrame, factor_col: str, dependent_id: str, covariate_ids: List[str]
) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    y_series, y_label = _resolve_dependent_series(df, dependent_id, cols)
    if y_series is None:
        raise HTTPException(status_code=404, detail="Variable dependiente no disponible")
    work, labels, cov_ids = _prepare_ancova_work(df, factor_col, y_series, covariate_ids, cols)
    y = work["y"].astype(float).to_numpy()
    X, _ = _ancova_design_matrix(work, labels, cov_ids, interactions=False)
    fit = _ancova_ols(y, X)
    if not fit:
        raise HTTPException(status_code=400, detail="Modelo ANCOVA no estimable")
    residuals = fit["residuals"]
    normality = _normality_on_residuals(residuals)
    normality["note"] = "Normalidad sobre residuos del modelo ANCOVA (factor + covariables)."
    groups_resid = [
        residuals[work["group"].astype(str).values == lab] for lab in labels
    ]
    levene = _levene_test(groups_resid)
    slopes = _ancova_slopes_test(y, work, labels, cov_ids)
    can_apply = (
        bool(normality.get("normal"))
        and bool(levene.get("homogeneous"))
        and bool(slopes.get("ok"))
    )
    alts: List[str] = []
    if not normality.get("normal"):
        alts.extend(["Kruskal-Wallis sobre la variable dependiente", "Transformación de la respuesta"])
    if not levene.get("homogeneous"):
        alts.extend(["ANOVA de Welch sin covariables", "Pruebas robustas"])
    if not slopes.get("ok"):
        alts.extend(
            [
                "Análisis estratificado por grupo (regresión por grupo)",
                "Modelo con interacción grupo×covariable (no ANCOVA clásica)",
                "Comparar grupos sin ajustar por esa covariable",
            ]
        )
    if not alts:
        alts.append("Revisar especificación del modelo")
    recommendation = {
        "can_apply": can_apply,
        "label": "ANCOVA" if can_apply else "ANCOVA no recomendada",
        "reason": (
            "Se cumplen normalidad de residuos, homogeneidad de varianzas y homogeneidad de pendientes."
            if can_apply
            else "Uno o más supuestos de la ANCOVA no se cumplen; los contrastes ajustados podrían ser poco confiables."
        ),
        "alternatives": [] if can_apply else alts,
    }
    cov_labels = [
        next((s["label"] for s in ANCOVA_COVARIATE_SPECS if s["id"] == c), c) for c in cov_ids
    ]
    return {
        "factor_column": factor_col,
        "dependent_id": dependent_id,
        "dependent_label": y_label,
        "covariate_ids": cov_ids,
        "covariate_labels": cov_labels,
        "n": int(len(work)),
        "groups": [
            {
                "label": lab,
                "n": int((work["group"] == lab).sum()),
                "mean": _safe_round(float(work.loc[work["group"] == lab, "y"].mean()), 2),
            }
            for lab in labels
        ],
        "normality": normality,
        "homogeneity": levene,
        "homogeneity_slopes": slopes,
        "recommendation": recommendation,
    }


def _ancova_adjusted_means(
    work: pd.DataFrame, labels: List[str], cov_ids: List[str], beta: np.ndarray
) -> List[Dict[str, Any]]:
    cov_means = {cid: float(work[cid].mean()) for cid in cov_ids}
    rows: List[Dict[str, Any]] = []
    for lab in labels:
        row = np.array([1.0])
        for other in labels[1:]:
            row = np.append(row, 1.0 if other == lab else 0.0)
        for cid in cov_ids:
            row = np.append(row, cov_means[cid])
        adj = float(row @ beta)
        rows.append({"label": lab, "adjusted_mean": _safe_round(adj, 2)})
    return rows


def _ancova_contrast_vector(names: List[str], labels: List[str], g1: str, g2: str) -> np.ndarray:
    vec = np.zeros(len(names), dtype=float)
    if g1 != labels[0]:
        key = f"Grupo:{g1}"
        if key in names:
            vec[names.index(key)] -= 1.0
    if g2 != labels[0]:
        key = f"Grupo:{g2}"
        if key in names:
            vec[names.index(key)] += 1.0
    return vec


def _ancova_posthoc_emm(
    work: pd.DataFrame, labels: List[str], cov_ids: List[str], beta: np.ndarray, mse: float, df_error: int
) -> Dict[str, Any]:
    emms = _ancova_adjusted_means(work, labels, cov_ids, beta)
    mean_map = {r["label"]: float(r["adjusted_mean"]) for r in emms}
    X_full, names = _ancova_design_matrix(work, labels, cov_ids, interactions=False)
    try:
        cov_beta = np.linalg.inv(X_full.T @ X_full) * mse
    except np.linalg.LinAlgError:
        cov_beta = np.eye(len(names)) * mse
    rows = []
    pairs = list(combinations(range(len(labels)), 2))
    raw_p: List[float] = []
    for i, j in pairs:
        g1, g2 = labels[i], labels[j]
        diff = mean_map[g1] - mean_map[g2]
        vec = _ancova_contrast_vector(names, labels, g1, g2)
        se = math.sqrt(max(float(vec @ cov_beta @ vec.T), 0))
        if se <= 0 or scipy_stats is None:
            p = 1.0
        else:
            t_abs = abs(diff) / se
            p = float(2 * (1 - scipy_stats.t.cdf(t_abs, df_error)))
        raw_p.append(p)
    m = len(raw_p)
    for k, (i, j) in enumerate(pairs):
        p_adj = min(1.0, raw_p[k] * m)
        rows.append(
            {
                "g1": labels[i],
                "g2": labels[j],
                "diff": _safe_round(mean_map[labels[i]] - mean_map[labels[j]], 4),
                "p_adj": _safe_round(p_adj, 4),
                "significant": bool(p_adj < ALPHA),
            }
        )
    return {
        "test": "Comparaciones pareadas (medias ajustadas)",
        "correction": "Bonferroni",
        "rows": rows,
    }


def _run_ancova(
    df: pd.DataFrame, factor_col: str, dependent_id: str, covariate_ids: List[str]
) -> Dict[str, Any]:
    checks = _ancova_assumptions_payload(df, factor_col, dependent_id, covariate_ids)
    if not checks.get("recommendation", {}).get("can_apply"):
        raise HTTPException(
            status_code=400,
            detail="No se puede aplicar ANCOVA: revise los supuestos y las alternativas sugeridas.",
        )
    cols = [str(c) for c in df.columns]
    y_series, y_label = _resolve_dependent_series(df, dependent_id, cols)
    if y_series is None:
        raise HTTPException(status_code=404, detail="Variable dependiente no disponible")
    work, labels, cov_ids = _prepare_ancova_work(df, factor_col, y_series, covariate_ids, cols)
    y = work["y"].astype(float).to_numpy()
    X, _ = _ancova_design_matrix(work, labels, cov_ids, interactions=False)
    fit = _ancova_ols(y, X)
    if not fit:
        raise HTTPException(status_code=400, detail="Modelo ANCOVA no estimable")
    factor_test = _ancova_partial_f_test(y, work, labels, cov_ids)
    beta = fit["beta"]
    emms = _ancova_adjusted_means(work, labels, cov_ids, beta)
    posthoc = _ancova_posthoc_emm(work, labels, cov_ids, beta, float(fit["mse"]), int(fit["df_error"]))
    groups = [work.loc[work["group"] == lab, "y"].astype(float).to_numpy() for lab in labels]
    partial_eta = factor_test.get("partial_eta_sq")
    return {
        "factor_column": factor_col,
        "dependent_id": dependent_id,
        "dependent_label": y_label,
        "covariate_labels": checks.get("covariate_labels", []),
        "method": "ancova",
        "method_label": "ANCOVA (covariables de ajuste)",
        "n": int(len(work)),
        "global_table": {
            "rows": [
                {
                    "source": "Factor (ajustado)",
                    "df": factor_test.get("df1"),
                    "sum_sq": None,
                    "mean_sq": None,
                    "F": factor_test.get("F"),
                    "p": factor_test.get("global_p_label"),
                },
                {
                    "source": "Error",
                    "df": factor_test.get("df2"),
                    "sum_sq": _safe_round(fit["sse"], 4),
                    "mean_sq": _safe_round(fit["mse"], 4),
                    "F": None,
                    "p": "—",
                },
            ],
            "statistic": factor_test.get("F"),
            "p_value": factor_test.get("p_value"),
            "global_p_label": factor_test.get("global_p_label"),
        },
        "adjusted_means": emms,
        "posthoc": posthoc,
        "boxplot": _boxplot_payload(labels, groups),
        "effect_size": {
            "name": "Eta cuadrado parcial",
            "symbol": "η²p",
            "value": partial_eta,
            "value_display": partial_eta if partial_eta is not None else "—",
            "interpretation": _interpret_effect_size(partial_eta)[1] if partial_eta is not None else "—",
            "category": _interpret_effect_size(partial_eta)[0] if partial_eta is not None else "—",
            "interpretation_ranges": list(EFFECT_SIZE_RANGES),
            "note": "Magnitud del efecto del factor tras ajustar por covariables.",
            "table": {
                "measure": "Eta cuadrado parcial (η²p)",
                "value": str(partial_eta) if partial_eta is not None else "—",
                "ci": "—",
                "interpretation": _interpret_effect_size(partial_eta)[1] if partial_eta is not None else "—",
            },
        },
    }


def _build_ancova_schema(df: pd.DataFrame, types: Dict[str, str], cols: List[str]) -> Dict[str, Any]:
    _, _, infer_variable_type = _api()
    for col in df.columns:
        cs = str(col)
        if cs not in types:
            types[cs] = infer_variable_type(df[col])
    numeric = _build_numeric_options(df, types)
    categorical = _build_categorical_options(df, types)
    covariates = []
    for spec in ANCOVA_COVARIATE_SPECS:
        col = _match_column(cols, spec["column"])
        if not col:
            covariates.append({**spec, "available": False})
            continue
        s = _ancova_covariate_series(df, spec, cols)
        avail = int(s.notna().sum()) >= 20 if s is not None else False
        covariates.append({**spec, "column": col, "available": avail})
    return {
        "numeric_variables": numeric,
        "categorical_variables": categorical,
        "covariates": covariates,
        "insight": (
            "La ANCOVA compara grupos del factor ajustando por covariables continuas "
            "(p. ej. edad y peso al nacer) para aislar el efecto de la condición de peso."
        ),
    }


def register_inferencial_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/inferencial/schema")
    async def inferencial_schema(dataset_id: str):
        df, types, _ = _get_df(dataset_id)
        numeric = _build_numeric_options(df, types)
        categorical = _build_categorical_options(df, types)
        return {
            "success": True,
            "numeric_variables": numeric,
            "categorical_variables": categorical,
            "lipid_profile": _build_resolved_profile_panel(
                LIPID_PANEL_SPECS,
                [str(c) for c in df.columns],
                numeric,
                "Perfil lipídico sugerido",
                (
                    "Triglicéridos, colesterol total, LDL, HDL, glucosa, no-HDL, "
                    "relación TG/HDL e índice aterogénico (No-HDL/HDL). "
                    "Las dos últimas se calculan automáticamente si faltan en la base."
                ),
            ),
            "anthropometric_profile": _build_resolved_profile_panel(
                ANTHROPOMETRIC_PROFILE_SPECS,
                [str(c) for c in df.columns],
                numeric,
                "Perfil antropométrico sugerido",
                (
                    "Peso, talla, IMC, circunferencia de cintura, perímetro braquial "
                    "y perímetro cefálico."
                ),
            ),
            "ready": len(numeric) > 0 and len(categorical) > 0,
        }

    @router.post("/datasets/{dataset_id}/inferencial/assumptions")
    async def inferencial_assumptions(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        factor = body.get("factor_column") or body.get("factor")
        dependent = body.get("dependent_id") or body.get("dependent")
        if not factor or not dependent:
            raise HTTPException(status_code=400, detail="Indique variable factor y dependiente")
        return {"success": True, **_assumptions_payload(df, str(factor), str(dependent))}

    @router.post("/datasets/{dataset_id}/inferencial/run-test")
    async def inferencial_run_test(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        factor = body.get("factor_column") or body.get("factor")
        dependent = body.get("dependent_id") or body.get("dependent")
        method = body.get("method")
        if not factor or not dependent or not method:
            raise HTTPException(status_code=400, detail="Indique factor, dependiente y método")
        return {
            "success": True,
            **_run_test_payload(df, str(factor), str(dependent), str(method)),
        }

    @router.get("/datasets/{dataset_id}/inferencial/ancova/schema")
    async def ancova_schema(dataset_id: str):
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        anc = _build_ancova_schema(df, types, cols)
        numeric = anc["numeric_variables"]
        categorical = anc["categorical_variables"]
        cov_ok = any(c.get("available") for c in anc["covariates"])
        return {
            "success": True,
            "numeric_variables": numeric,
            "categorical_variables": categorical,
            "covariates": anc["covariates"],
            "lipid_profile": _build_resolved_profile_panel(
                LIPID_PANEL_SPECS,
                cols,
                numeric,
                "Perfil lipídico sugerido",
                (
                    "Triglicéridos, colesterol total, LDL, HDL, glucosa, no-HDL, "
                    "relación TG/HDL e índice aterogénico (No-HDL/HDL). "
                    "Las dos últimas se calculan automáticamente si faltan en la base."
                ),
            ),
            "anthropometric_profile": _build_resolved_profile_panel(
                ANTHROPOMETRIC_PROFILE_SPECS,
                cols,
                numeric,
                "Perfil antropométrico sugerido",
                (
                    "Peso, talla, IMC, circunferencia de cintura, perímetro braquial "
                    "y perímetro cefálico."
                ),
            ),
            "insight": anc["insight"],
            "ready": cov_ok and len(numeric) > 0 and len(categorical) > 0,
        }

    @router.post("/datasets/{dataset_id}/inferencial/ancova/assumptions")
    async def ancova_assumptions(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        factor = body.get("factor_column") or body.get("factor")
        dependent = body.get("dependent_id") or body.get("dependent")
        covs = body.get("covariate_ids") or []
        if not factor or not dependent:
            raise HTTPException(status_code=400, detail="Indique factor, dependiente y covariables")
        if not isinstance(covs, list) or not covs:
            raise HTTPException(status_code=400, detail="Seleccione al menos una covariable")
        return {
            "success": True,
            **_ancova_assumptions_payload(df, str(factor), str(dependent), [str(c) for c in covs]),
        }

    @router.post("/datasets/{dataset_id}/inferencial/ancova/run")
    async def ancova_run(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        factor = body.get("factor_column") or body.get("factor")
        dependent = body.get("dependent_id") or body.get("dependent")
        covs = body.get("covariate_ids") or []
        if not factor or not dependent:
            raise HTTPException(status_code=400, detail="Indique factor, dependiente y covariables")
        if not isinstance(covs, list) or not covs:
            raise HTTPException(status_code=400, detail="Seleccione al menos una covariable")
        return {
            "success": True,
            **_run_ancova(df, str(factor), str(dependent), [str(c) for c in covs]),
        }
