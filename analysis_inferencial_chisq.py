"""
Análisis inferencial — Chi-cuadrado / Fisher y comparación de medias (t / Mann-Whitney).
Subsecciones 2.2 (asociación categórica) y 2.3 (variables continuas perinatales vs condición).
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException

try:
    from scipy import stats as scipy_stats
except ImportError:  # pragma: no cover
    scipy_stats = None

ALPHA = 0.05
MIN_CELL_N = 5
MIN_TABLE_N = 20

ASSOCIATION_PREDICTOR_SPECS: List[Dict[str, Any]] = [
    {
        "id": "peso_nacer_cat",
        "label": "Peso al nacer categorizado",
        "source_column": "peso_nacer",
        "kind": "birth_weight_cat",
        "description": "< 2500 g · 2500–4000 g · > 4000 g",
    },
    {
        "id": "semanas_gestacion_cat",
        "label": "Semanas de gestación (categorizado)",
        "source_column": "semanas_gestacion",
        "fallback_column": "termino",
        "kind": "gestation_cat",
        "description": "Pretérmino · Término · Postérmino",
    },
    {
        "id": "lactancia_materna",
        "label": "Lactancia materna",
        "source_column": "lactancia_materna",
        "kind": "categorical",
    },
    {
        "id": "complicaciones",
        "label": "Complicaciones",
        "source_column": "complicaciones",
        "kind": "categorical",
    },
    {
        "id": "curso_normal",
        "label": "Curso normal",
        "source_column": "curso_normal",
        "kind": "categorical",
    },
    {
        "id": "infecc_embarazo_m",
        "label": "Infecciones en el embarazo",
        "source_column": "infecc_embarazo_m",
        "kind": "categorical",
    },
]

CONTINUOUS_PREDICTOR_SPECS: List[Dict[str, Any]] = [
    {
        "id": "peso_nacer",
        "label": "Peso al nacer (continuo, g)",
        "source_column": "peso_nacer",
    },
    {
        "id": "semanas_gestacion",
        "label": "Semanas de gestación (continuo)",
        "source_column": "semanas_gestacion",
    },
]

OUTCOME_SPECS: List[Dict[str, Any]] = [
    {
        "id": "obesidad_vs_no",
        "label": "Obesidad vs no obesidad",
        "description": "Obesidad frente a normopeso, sobrepeso y bajo peso.",
        "continuous_ok": True,
    },
    {
        "id": "normo_vs_sobre_obes",
        "label": "Normopeso vs sobrepeso + obesidad",
        "description": "Normopeso frente a sobrepeso u obesidad.",
        "continuous_ok": True,
    },
    {
        "id": "condicion_all",
        "label": "Condicion (todas las categorías)",
        "description": "Categorías de Condicion en la base; si hay más de dos, elija el par a comparar.",
        "continuous_ok": True,
    },
]

COHEN_D_RANGES: List[Dict[str, str]] = [
    {"label": "Efecto pequeño", "range": "|d| ≥ 0,20 y < 0,50"},
    {"label": "Efecto moderado", "range": "|d| ≥ 0,50 y < 0,80"},
    {"label": "Efecto grande", "range": "|d| ≥ 0,80"},
]

R_BISERIAL_RANGES: List[Dict[str, str]] = [
    {"label": "Efecto pequeño", "range": "|r| ≥ 0,10 y < 0,30"},
    {"label": "Efecto moderado", "range": "|r| ≥ 0,30 y < 0,50"},
    {"label": "Efecto grande", "range": "|r| ≥ 0,50"},
]

CRAMERS_V_RANGES: List[Dict[str, str]] = [
    {"label": "Asociación débil", "range": "≥ 0,10 y < 0,30"},
    {"label": "Asociación moderada", "range": "≥ 0,30 y < 0,50"},
    {"label": "Asociación fuerte", "range": "≥ 0,50"},
]


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


def _match_column(cols: List[str], name: str) -> Optional[str]:
    key = _norm_col(name)
    for col in cols:
        if _norm_col(col) == key:
            return col
    return None


def _to_birth_weight_category(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    try:
        x = float(str(val).replace(",", "."))
    except (TypeError, ValueError):
        return None
    if x < 2500:
        return "< 2500 g"
    if x <= 4000:
        return "2500–4000 g"
    return "> 4000 g"


def _to_birth_weight_category_kg(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    try:
        kg = float(str(val).replace(",", "."))
    except (TypeError, ValueError):
        return None
    if kg < 2.5:
        return "< 2500 g"
    if kg <= 4.0:
        return "2500–4000 g"
    return "> 4000 g"


def _to_gestation_category(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    try:
        weeks = float(str(val).replace(",", "."))
    except (TypeError, ValueError):
        return None
    if weeks < 37:
        return "Pretérmino"
    if weeks <= 42:
        return "Término"
    return "Postérmino"


def _to_termino_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s or s in ("nan", "none", "(vacío)"):
        return None
    if "post" in s:
        return "Postérmino"
    if "pre" in s:
        return "Pretérmino"
    if "term" in s:
        return "Término"
    return str(val).strip()


def _to_binary_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if s in ("1", "si", "sí", "yes", "true", "s"):
        return "Sí"
    if s in ("0", "no", "false", "n"):
        return "No"
    try:
        f = float(s.replace(",", "."))
        if f >= 0.5:
            return "Sí"
        if f == 0:
            return "No"
    except ValueError:
        pass
    return str(val).strip()


def _to_weight_class(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if "obes" in s:
        return "Obesidad"
    if "sobre" in s:
        return "Sobrepeso"
    if "normo" in s:
        return "Normopeso"
    if "bajo" in s:
        return "Bajo peso"
    return str(val).strip()


def _build_predictor_series(df: pd.DataFrame, spec: Dict[str, Any], cols: List[str]) -> Tuple[Optional[pd.Series], str]:
    kind = spec.get("kind", "categorical")
    src = _match_column(cols, spec.get("source_column", ""))
    if not src:
        return None, spec.get("label", spec["id"])

    if kind == "birth_weight_cat":
        raw = df[src]
        sample = pd.to_numeric(raw, errors="coerce").dropna()
        use_kg = len(sample) > 0 and float(sample.median()) < 50
        if use_kg:
            series = raw.apply(_to_birth_weight_category_kg)
        else:
            series = raw.apply(_to_birth_weight_category)
        return series, spec["label"]

    if kind == "gestation_cat":
        fb = spec.get("fallback_column")
        fb_col = _match_column(cols, fb) if fb else None
        if fb_col and df[fb_col].notna().sum() >= 5:
            return df[fb_col].apply(_to_termino_label), spec["label"] + f" ({fb_col})"
        if src in df.columns:
            return df[src].apply(_to_gestation_category), spec["label"]
        return None, spec["label"]

    if kind == "categorical":
        vtype_guess = df[src].dropna().astype(str).str.strip().unique()
        if len(vtype_guess) <= 3:
            return df[src].apply(_to_binary_label), spec["label"]
        return df[src].astype(str).str.strip().replace({"": np.nan, "nan": np.nan}), spec["label"]

    return None, spec["label"]


def _resolve_condicion_column(cols: List[str]) -> Optional[str]:
    return _match_column(cols, "Condicion") or _match_column(cols, "condicion")


def _recode_outcome(series: pd.Series, outcome_id: str) -> pd.Series:
    if outcome_id == "condicion_all":
        mapped = series.apply(_to_weight_class)
        raw = series.astype(str).str.strip()
        raw = raw.replace({"": np.nan, "nan": np.nan, "None": np.nan})
        return mapped.where(mapped.notna(), raw)

    classes = series.apply(_to_weight_class)
    if outcome_id == "obesidad_vs_no":
        return classes.map(
            lambda x: "Obesidad" if x == "Obesidad" else ("No obesidad" if x in ("Normopeso", "Sobrepeso", "Bajo peso") else np.nan)
        )
    if outcome_id == "normo_vs_sobre_obes":
        return classes.map(
            lambda x: "Normopeso"
            if x == "Normopeso"
            else ("Sobrepeso u obesidad" if x in ("Sobrepeso", "Obesidad") else np.nan)
        )
    return classes


def _outcome_label(outcome_id: str) -> str:
    return next((o["label"] for o in OUTCOME_SPECS if o["id"] == outcome_id), outcome_id)


def _continuous_group_labels(
    work: pd.DataFrame,
    outcome_id: str,
    group_a: Optional[str] = None,
    group_b: Optional[str] = None,
) -> List[str]:
    labels_all = sorted(work["y"].astype(str).unique(), key=str)
    n = len(labels_all)
    if n < 2:
        raise HTTPException(
            status_code=400,
            detail="La variable respuesta debe generar al menos 2 grupos con datos",
        )
    if n == 2:
        return labels_all
    if outcome_id != "condicion_all":
        raise HTTPException(
            status_code=400,
            detail="La variable respuesta debe generar exactamente 2 grupos",
        )
    ga = (group_a or "").strip()
    gb = (group_b or "").strip()
    if not ga or not gb:
        raise HTTPException(
            status_code=400,
            detail="Seleccione dos categorías de Condicion para comparar",
        )
    if ga == gb:
        raise HTTPException(status_code=400, detail="Los dos grupos deben ser distintos")
    if ga not in labels_all or gb not in labels_all:
        raise HTTPException(status_code=400, detail="Categorías de Condicion no válidas")
    return sorted([ga, gb], key=str)


def _continuous_outcome_display(outcome_id: str, labels: List[str]) -> str:
    base = _outcome_label(outcome_id)
    if outcome_id == "condicion_all" and len(labels) == 2:
        return f"{base}: {labels[0]} vs {labels[1]}"
    return base


def _association_conclusion(p_value: float, method: str) -> Dict[str, Any]:
    significant = bool(p_value < ALPHA)
    if method == "fisher":
        if significant:
            text = (
                "p < 0,05: hay evidencia de asociación entre las variables "
                "(prueba exacta de Fisher)."
            )
        else:
            text = (
                "p ≥ 0,05: con estos datos no hay evidencia estadística de asociación. "
                "No implica demostrar independencia, solo que no se rechaza H₀ al 5 %."
            )
    elif significant:
        text = (
            "p < 0,05: se rechaza la hipótesis de independencia; hay evidencia estadística "
            "de asociación entre el factor perinatal y la condición de peso."
        )
    else:
        text = (
            "p ≥ 0,05: no hay evidencia estadística de asociación (no se rechaza H₀ al 5 %). "
            "Eso no prueba que las variables sean independientes en la población, solo que "
            "con esta muestra no se detectó asociación."
        )
    return {"significant": significant, "text": text}


def _r_style_test_table(
    method: str, stat: Optional[float], df_val: Optional[float], p_value: float
) -> Dict[str, Any]:
    if method == "fisher":
        return {
            "rows": [
                {"term": "X-squared", "value": "—"},
                {"term": "df", "value": "—"},
                {"term": "p-value", "value": _p_fmt(p_value)},
            ],
            "note": "Fisher exacto no reporta χ² ni gl; use el p-value.",
        }
    return {
        "rows": [
            {"term": "X-squared", "value": _safe_round(stat, 4)},
            {"term": "df", "value": _safe_round(df_val, 2)},
            {"term": "p-value", "value": _p_fmt(p_value)},
        ],
        "note": None,
    }


def _continuous_test_table(
    method: str, stat: float, p_value: float, n1: int, n2: int
) -> Dict[str, Any]:
    if method == "ttest":
        df_val = n1 + n2 - 2
        return {
            "rows": [
                {"term": "t", "value": _safe_round(stat, 4)},
                {"term": "df", "value": _safe_round(df_val, 2)},
                {"term": "p-value", "value": _p_fmt(p_value)},
            ],
            "note": None,
        }
    return {
        "rows": [
            {"term": "U", "value": _safe_round(stat, 4)},
            {"term": "p-value", "value": _p_fmt(p_value)},
        ],
        "note": "Mann-Whitney no reporta grados de libertad.",
    }


def _continuous_conclusion(p_value: float, method: str) -> Dict[str, Any]:
    significant = bool(p_value < ALPHA)
    if method == "ttest":
        if significant:
            text = (
                "p < 0,05: hay evidencia estadística de diferencia entre las medias "
                "de los dos grupos (prueba t de Student)."
            )
        else:
            text = (
                "p ≥ 0,05: no hay evidencia estadística de diferencia entre medias "
                "(no se rechaza H₀ al 5 %)."
            )
    elif significant:
        text = (
            "p < 0,05: hay evidencia estadística de diferencia entre las distribuciones "
            "de los dos grupos (U de Mann-Whitney)."
        )
    else:
        text = (
            "p ≥ 0,05: no hay evidencia estadística de diferencia entre grupos "
            "(no se rechaza H₀ al 5 %)."
        )
    return {"significant": significant, "text": text}


def _contingency_table(x: pd.Series, y: pd.Series) -> pd.DataFrame:
    work = pd.DataFrame({"pred": x, "out": y}).dropna()
    if work.empty:
        return pd.DataFrame()
    tab = pd.crosstab(work["pred"], work["out"])
    tab.index = tab.index.astype(str)
    tab.columns = tab.columns.astype(str)
    return tab


def _expected_frequencies(observed: np.ndarray) -> np.ndarray:
    row_sum = observed.sum(axis=1, keepdims=True)
    col_sum = observed.sum(axis=0, keepdims=True)
    total = observed.sum()
    if total <= 0:
        return np.zeros_like(observed, dtype=float)
    return row_sum @ col_sum / total


def _assess_chi_square_assumptions(observed: np.ndarray) -> Dict[str, Any]:
    exp = _expected_frequencies(observed)
    n = int(observed.sum())
    r, c = observed.shape
    cells_lt5 = int(np.sum(exp < MIN_CELL_N))
    total_cells = r * c
    pct_lt5 = (cells_lt5 / total_cells * 100) if total_cells else 0
    min_expected = float(np.min(exp)) if exp.size else 0.0
    is_2x2 = r == 2 and c == 2

    if not is_2x2 and (cells_lt5 > 0 or pct_lt5 > 20):
        method = "pearson"
        label = "Chi-cuadrado de Pearson"
        reason = (
            "Tabla mayor que 2×2: use χ² de Pearson (Fisher/Yates solo en 2×2)."
        )
    elif is_2x2 and (n < MIN_TABLE_N or min_expected < MIN_CELL_N):
        method = "fisher"
        label = "Prueba exacta de Fisher"
        reason = "Tabla 2×2 con frecuencia esperada < 5 o n < 20."
    elif is_2x2 and cells_lt5 > 0:
        method = "yates"
        label = "Chi-cuadrado con corrección de Yates"
        reason = "Tabla 2×2 con al menos una frecuencia esperada < 5."
    elif not is_2x2 and (pct_lt5 > 20 or min_expected < 1):
        method = "pearson"
        label = "Chi-cuadrado de Pearson (precaución)"
        reason = (
            "Más del 20 % de celdas con esperado < 5 o algún esperado < 1; "
            "interprete con cautela o combine categorías."
        )
    else:
        method = "pearson"
        label = "Chi-cuadrado de Pearson"
        reason = "Frecuencias esperadas adecuadas para χ² de Pearson."

    return {
        "n": n,
        "dimensions": f"{r}×{c}",
        "is_2x2": is_2x2,
        "cells_expected_lt5": cells_lt5,
        "pct_expected_lt5": _safe_round(pct_lt5, 1),
        "min_expected": _safe_round(min_expected, 2),
        "recommendation": {"method": method, "label": label, "reason": reason},
        "expected_matrix": exp.tolist(),
    }


def _recommend_continuous(normal: bool, homogeneous: bool) -> Dict[str, str]:
    if normal and homogeneous:
        return {
            "method": "ttest",
            "label": "Prueba t de Student (varianzas iguales)",
            "reason": "Normalidad en ambos grupos y homogeneidad de varianzas (Levene p≥0,05).",
        }
    return {
        "method": "mannwhitney",
        "label": "U de Mann-Whitney",
        "reason": "No se cumple normalidad y/o homogeneidad de varianzas; use prueba no paramétrica.",
    }


def _normality_on_group(values: np.ndarray) -> Dict[str, Any]:
    arr = values[np.isfinite(values)]
    n = len(arr)
    out: Dict[str, Any] = {"n": n, "test": "—", "statistic": None, "p_value": None, "normal": False}
    if n < 3 or scipy_stats is None:
        return out
    if n < 50:
        stat, p = scipy_stats.shapiro(arr)
        out["test"] = "Shapiro-Wilk"
    else:
        std = float(np.std(arr, ddof=1))
        if std <= 0:
            return out
        stat, p = scipy_stats.kstest(arr, "norm", args=(float(np.mean(arr)), std))
        out["test"] = "Kolmogorov-Smirnov"
    out["statistic"] = _safe_round(float(stat), 4)
    out["p_value"] = _safe_round(float(p), 4)
    out["normal"] = bool(p >= ALPHA)
    return out


def _cohens_d(g1: np.ndarray, g2: np.ndarray) -> Optional[float]:
    g1 = g1[np.isfinite(g1)]
    g2 = g2[np.isfinite(g2)]
    if len(g1) < 2 or len(g2) < 2:
        return None
    n1, n2 = len(g1), len(g2)
    s1, s2 = float(np.var(g1, ddof=1)), float(np.var(g2, ddof=1))
    pooled = math.sqrt(((n1 - 1) * s1 + (n2 - 1) * s2) / (n1 + n2 - 2))
    if pooled <= 0:
        return None
    return float((np.mean(g1) - np.mean(g2)) / pooled)


def _rank_biserial(u_stat: float, n1: int, n2: int) -> Optional[float]:
    if n1 <= 0 or n2 <= 0:
        return None
    return float(1 - (2 * u_stat) / (n1 * n2))


def _interpret_cohens_d(d: Optional[float]) -> Tuple[str, str]:
    if d is None:
        return "—", "No calculable"
    ad = abs(d)
    if ad < 0.2:
        return "despreciable", "Efecto despreciable (|d| < 0,20)"
    if ad < 0.5:
        return "pequeño", "Efecto pequeño (|d| ≥ 0,20 y < 0,50)"
    if ad < 0.8:
        return "moderado", "Efecto moderado (|d| ≥ 0,50 y < 0,80)"
    return "grande", "Efecto grande (|d| ≥ 0,80)"


def _interpret_r(r: Optional[float]) -> Tuple[str, str]:
    if r is None:
        return "—", "No calculable"
    ar = abs(r)
    if ar < 0.1:
        return "despreciable", "Efecto despreciable (|r| < 0,10)"
    if ar < 0.3:
        return "pequeño", "Efecto pequeño (|r| ≥ 0,10 y < 0,30)"
    if ar < 0.5:
        return "moderado", "Efecto moderado (|r| ≥ 0,30 y < 0,50)"
    return "grande", "Efecto grande (|r| ≥ 0,50)"


def _cramers_v(chi2: float, n: int, r: int, c: int) -> Optional[float]:
    if n <= 0 or min(r, c) < 2:
        return None
    k = min(r - 1, c - 1)
    if k <= 0:
        return None
    return float(math.sqrt(chi2 / (n * k)))


def _interpret_cramers_v(v: Optional[float]) -> Tuple[str, str]:
    if v is None:
        return "—", "No calculable"
    if v < 0.1:
        return "débil", "Asociación despreciable (< 0,10)"
    if v < 0.3:
        return "débil", "Asociación débil (≥ 0,10 y < 0,30)"
    if v < 0.5:
        return "moderada", "Asociación moderada (≥ 0,30 y < 0,50)"
    return "fuerte", "Asociación fuerte (≥ 0,50)"


def _matrix_to_rows(tab: pd.DataFrame) -> Dict[str, Any]:
    return {
        "row_labels": [str(i) for i in tab.index],
        "col_labels": [str(c) for c in tab.columns],
        "values": [[int(tab.iloc[i, j]) for j in range(tab.shape[1])] for i in range(tab.shape[0])],
    }


def _build_association_schema(df: pd.DataFrame, cols: List[str]) -> Dict[str, Any]:
    cond_col = _resolve_condicion_column(cols)
    predictors = []
    for spec in ASSOCIATION_PREDICTOR_SPECS:
        series, label = _build_predictor_series(df, spec, cols)
        avail = series is not None and int(series.notna().sum()) >= MIN_CELL_N
        predictors.append(
            {
                "id": spec["id"],
                "label": label,
                "description": spec.get("description", ""),
                "available": avail,
            }
        )
    outcomes = []
    if cond_col:
        for spec in OUTCOME_SPECS:
            rec = _recode_outcome(df[cond_col], spec["id"])
            avail = int(rec.notna().sum()) >= MIN_CELL_N and rec.nunique(dropna=True) >= 2
            outcomes.append({**spec, "available": avail, "column": cond_col})
    return {
        "predictors": predictors,
        "outcomes": outcomes,
        "condicion_column": cond_col,
        "insight": (
            "Evalúe si bajo peso o macrosomía al nacer, pretérmino, falta de lactancia, "
            "complicaciones o infecciones se asocian con la condición de peso del niño."
        ),
    }


def _build_continuous_schema(df: pd.DataFrame, cols: List[str]) -> Dict[str, Any]:
    cond_col = _resolve_condicion_column(cols)
    predictors = []
    for spec in CONTINUOUS_PREDICTOR_SPECS:
        src = _match_column(cols, spec["source_column"])
        if not src:
            predictors.append({**spec, "available": False})
            continue
        s = pd.to_numeric(df[src], errors="coerce")
        predictors.append({**spec, "column": src, "available": int(s.notna().sum()) >= MIN_CELL_N * 2})
    outcomes = []
    if cond_col:
        for spec in OUTCOME_SPECS:
            if not spec.get("continuous_ok", True):
                outcomes.append({**spec, "available": False, "column": cond_col})
                continue
            rec = _recode_outcome(df[cond_col], spec["id"])
            cats = sorted(rec.dropna().astype(str).unique(), key=str)
            n_cats = len(cats)
            if spec["id"] == "condicion_all":
                avail = int(rec.notna().sum()) >= MIN_CELL_N * 2 and n_cats >= 2
                outcomes.append(
                    {
                        **spec,
                        "available": avail,
                        "column": cond_col,
                        "categories": [str(c) for c in cats],
                        "needs_group_pair": n_cats > 2,
                    }
                )
            else:
                avail = int(rec.notna().sum()) >= MIN_CELL_N * 2 and n_cats == 2
                outcomes.append(
                    {
                        **spec,
                        "available": avail,
                        "column": cond_col,
                        "categories": [str(c) for c in cats],
                        "needs_group_pair": False,
                    }
                )
    return {
        "predictors": predictors,
        "outcomes": outcomes,
        "condicion_column": cond_col,
        "insight": (
            "Compare peso al nacer y semanas de gestación entre dos grupos de condición de peso. "
            "Con «Condicion (todas las categorías)» puede elegir el par a contrastar si hay más de dos."
        ),
    }


def _association_assumptions(df: pd.DataFrame, predictor_id: str, outcome_id: str) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    spec = next((s for s in ASSOCIATION_PREDICTOR_SPECS if s["id"] == predictor_id), None)
    if not spec:
        raise HTTPException(status_code=400, detail="Predictor no válido")
    cond_col = _resolve_condicion_column(cols)
    if not cond_col:
        raise HTTPException(status_code=404, detail="Columna Condicion no encontrada")
    x, x_label = _build_predictor_series(df, spec, cols)
    if x is None:
        raise HTTPException(status_code=404, detail="Predictor no disponible en la base")
    y = _recode_outcome(df[cond_col], outcome_id)
    tab = _contingency_table(x, y)
    if tab.empty or tab.shape[0] < 2 or tab.shape[1] < 2:
        raise HTTPException(status_code=400, detail="Tabla de contingencia insuficiente (mínimo 2×2)")
    obs = tab.to_numpy(dtype=float)
    assess = _assess_chi_square_assumptions(obs)
    row_props = []
    for idx in tab.index:
        row_props.append({"category": str(idx), "n": int(tab.loc[idx].sum())})
    return {
        "predictor_id": predictor_id,
        "predictor_label": x_label,
        "outcome_id": outcome_id,
        "outcome_label": _outcome_label(outcome_id),
        "observed": _matrix_to_rows(tab),
        "assumptions": assess,
        "recommendation": assess["recommendation"],
        "row_summary": row_props,
    }


def _run_association_test(
    df: pd.DataFrame, predictor_id: str, outcome_id: str, method: str
) -> Dict[str, Any]:
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido")
    cols = [str(c) for c in df.columns]
    spec = next((s for s in ASSOCIATION_PREDICTOR_SPECS if s["id"] == predictor_id), None)
    if not spec:
        raise HTTPException(status_code=400, detail="Predictor no válido")
    cond_col = _resolve_condicion_column(cols)
    if not cond_col:
        raise HTTPException(status_code=404, detail="Columna Condicion no encontrada")
    x, x_label = _build_predictor_series(df, spec, cols)
    y = _recode_outcome(df[cond_col], outcome_id)
    tab = _contingency_table(x, y)
    if tab.empty:
        raise HTTPException(status_code=400, detail="Sin datos para la tabla")
    obs = tab.to_numpy(dtype=float)
    exp = _expected_frequencies(obs)
    method = method.lower().strip()
    r, c = obs.shape
    n = int(obs.sum())

    if method == "fisher":
        if r != 2 or c != 2:
            raise HTTPException(status_code=400, detail="Fisher solo aplica a tablas 2×2")
        odds, p = scipy_stats.fisher_exact(obs)
        stat = None
        df_val = None
        method_label = "Prueba exacta de Fisher"
    elif method == "yates":
        if r != 2 or c != 2:
            raise HTTPException(status_code=400, detail="Yates solo aplica a tablas 2×2")
        chi2, p, df_val, _ = scipy_stats.chi2_contingency(obs, correction=True)
        stat = chi2
        method_label = "Chi-cuadrado con corrección de Yates"
    else:
        chi2, p, df_val, _ = scipy_stats.chi2_contingency(obs, correction=False)
        stat = chi2
        method_label = "Chi-cuadrado de Pearson"

    p_float = float(p)

    from analysis_effect_ci import build_ci_dict, ci_cramers_v, ci_odds_ratio_2x2

    if stat is not None:
        v = _cramers_v(float(stat), n, r, c)
        cat, interp = _interpret_cramers_v(v)
        v_lo, v_hi = ci_cramers_v(float(stat), n, r, c)
        ci = build_ci_dict(v_lo, v_hi)
        ci_display = ci.get("display") if ci else "—"
        effect = {
            "name": "V de Cramér",
            "symbol": "V",
            "value": _safe_round(v, 4),
            "value_display": _safe_round(v, 4),
            "interpretation": interp,
            "category": cat,
            "interpretation_ranges": CRAMERS_V_RANGES,
            "note": "Magnitud de asociación entre variables categóricas.",
            "ci": ci,
            "table": {
                "measure": "V de Cramér (V)",
                "value": "—" if v is None else str(_safe_round(v, 4)),
                "ci": ci_display,
                "interpretation": interp,
            },
        }
    else:
        or_lo, or_hi = ci_odds_ratio_2x2(obs)
        ci = build_ci_dict(or_lo, or_hi)
        ci_display = ci.get("display") if ci else "—"
        or_val = _safe_round(float(odds), 4)
        effect = {
            "name": "Odds ratio (Fisher)",
            "symbol": "OR",
            "value": or_val,
            "value_display": or_val,
            "interpretation": "—",
            "category": "—",
            "interpretation_ranges": [],
            "note": "Razón de momios para tabla 2×2 (prueba exacta).",
            "ci": ci,
            "table": {
                "measure": "Odds ratio (OR)",
                "value": "—" if or_val is None else str(or_val),
                "ci": ci_display,
                "interpretation": "—",
            },
        }

    exp_tab = pd.DataFrame(exp, index=tab.index, columns=tab.columns)
    chart = {
        "type": "grouped_bar",
        "x_labels": [str(i) for i in tab.index],
        "series": [
            {"name": str(col), "values": [int(tab.iloc[i, j]) for i in range(r)]}
            for j, col in enumerate(tab.columns)
        ],
    }
    return {
        "predictor_label": x_label,
        "outcome_label": _outcome_label(outcome_id),
        "method": method,
        "method_label": method_label,
        "statistic": _safe_round(stat, 4) if stat is not None else None,
        "df": _safe_round(df_val, 2) if df_val is not None else None,
        "p_value": _safe_round(p_float, 4),
        "global_p_label": _p_fmt(p_float),
        "test_table_r": _r_style_test_table(method, stat, df_val, p_float),
        "conclusion": _association_conclusion(p_float, method),
        "observed": _matrix_to_rows(tab),
        "expected": _matrix_to_rows(exp_tab),
        "effect_size": effect,
        "chart": chart,
    }


def _continuous_assumptions(
    df: pd.DataFrame,
    predictor_id: str,
    outcome_id: str,
    group_a: Optional[str] = None,
    group_b: Optional[str] = None,
) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    pspec = next((s for s in CONTINUOUS_PREDICTOR_SPECS if s["id"] == predictor_id), None)
    if not pspec:
        raise HTTPException(status_code=400, detail="Predictor no válido")
    src = _match_column(cols, pspec.get("source_column", ""))
    cond_col = _resolve_condicion_column(cols)
    if not src or not cond_col:
        raise HTTPException(status_code=404, detail="Variables no encontradas")
    x = pd.to_numeric(df[src], errors="coerce")
    y = _recode_outcome(df[cond_col], outcome_id)
    work = pd.DataFrame({"x": x, "y": y}).dropna()
    work["y"] = work["y"].astype(str)
    labels = _continuous_group_labels(work, outcome_id, group_a, group_b)
    work = work[work["y"].isin(labels)]
    groups = [work.loc[work["y"] == lab, "x"].to_numpy(dtype=float) for lab in labels]
    if any(len(g) < 2 for g in groups):
        raise HTTPException(
            status_code=400,
            detail="Cada grupo debe tener al menos 2 observaciones válidas",
        )
    g1, g2 = groups[0], groups[1]
    norm1 = _normality_on_group(g1)
    norm2 = _normality_on_group(g2)
    normal = bool(norm1.get("normal")) and bool(norm2.get("normal"))
    if scipy_stats is None:
        levene = {"p_value": None, "homogeneous": False}
    else:
        stat_l, p_l = scipy_stats.levene(g1, g2, center="median")
        levene = {
            "test": "Levene (mediana)",
            "statistic": _safe_round(float(stat_l), 4),
            "p_value": _safe_round(float(p_l), 4),
            "homogeneous": bool(p_l >= ALPHA),
        }
    recommendation = _recommend_continuous(normal, bool(levene.get("homogeneous")))
    summaries = []
    for lab, g in zip(labels, groups):
        summaries.append(
            {
                "label": str(lab),
                "n": int(len(g)),
                "mean": _safe_round(float(np.mean(g)), 2),
                "sd": _safe_round(float(np.std(g, ddof=1)), 2) if len(g) > 1 else 0.0,
                "median": _safe_round(float(np.median(g)), 2),
            }
        )
    return {
        "predictor_id": predictor_id,
        "predictor_label": pspec["label"],
        "outcome_id": outcome_id,
        "outcome_label": _continuous_outcome_display(outcome_id, labels),
        "group_labels": labels,
        "groups": summaries,
        "normality_g1": norm1,
        "normality_g2": norm2,
        "homogeneity": levene,
        "recommendation": recommendation,
    }


def _run_continuous_test(
    df: pd.DataFrame,
    predictor_id: str,
    outcome_id: str,
    method: str,
    group_a: Optional[str] = None,
    group_b: Optional[str] = None,
) -> Dict[str, Any]:
    if scipy_stats is None:
        raise HTTPException(status_code=500, detail="SciPy requerido")
    cols = [str(c) for c in df.columns]
    pspec = next((s for s in CONTINUOUS_PREDICTOR_SPECS if s["id"] == predictor_id), None)
    if not pspec:
        raise HTTPException(status_code=400, detail="Predictor no válido")
    src = _match_column(cols, pspec.get("source_column", ""))
    cond_col = _resolve_condicion_column(cols)
    if not src or not cond_col:
        raise HTTPException(status_code=404, detail="Variables no encontradas")
    x = pd.to_numeric(df[src], errors="coerce")
    y = _recode_outcome(df[cond_col], outcome_id)
    work = pd.DataFrame({"x": x, "y": y}).dropna()
    work["y"] = work["y"].astype(str)
    labels = _continuous_group_labels(work, outcome_id, group_a, group_b)
    work = work[work["y"].isin(labels)]
    groups = [work.loc[work["y"] == lab, "x"].to_numpy(dtype=float) for lab in labels]
    if any(len(g) < 2 for g in groups):
        raise HTTPException(
            status_code=400,
            detail="Cada grupo debe tener al menos 2 observaciones válidas",
        )
    g1, g2 = groups[0], groups[1]
    method = method.lower().strip()
    outcome_display = _continuous_outcome_display(outcome_id, labels)

    from analysis_effect_ci import build_ci_dict, ci_cohens_d, ci_rank_biserial

    if method == "ttest":
        stat, p = scipy_stats.ttest_ind(g1, g2, equal_var=True, nan_policy="omit")
        method_label = "Prueba t de Student"
        d = _cohens_d(g1, g2)
        cat, interp = _interpret_cohens_d(d)
        d_lo, d_hi = ci_cohens_d(g1, g2)
        ci = build_ci_dict(d_lo, d_hi)
        ci_display = ci.get("display") if ci else "—"
        d_disp = _safe_round(d, 4)
        effect = {
            "name": "d de Cohen",
            "symbol": "d",
            "value": d_disp,
            "value_display": d_disp,
            "interpretation": interp,
            "category": cat,
            "interpretation_ranges": COHEN_D_RANGES,
            "note": "Tamaño del efecto para comparación de dos medias independientes.",
            "ci": ci,
            "table": {
                "measure": "d de Cohen (d)",
                "value": "—" if d_disp is None else str(d_disp),
                "ci": ci_display,
                "interpretation": interp,
            },
        }
    else:
        u_stat, p = scipy_stats.mannwhitneyu(g1, g2, alternative="two-sided")
        stat = u_stat
        method_label = "U de Mann-Whitney"
        r = _rank_biserial(float(u_stat), len(g1), len(g2))
        cat, interp = _interpret_r(r)
        r_lo, r_hi = ci_rank_biserial(float(u_stat), len(g1), len(g2))
        ci = build_ci_dict(r_lo, r_hi)
        ci_display = ci.get("display") if ci else "—"
        r_disp = _safe_round(r, 4)
        effect = {
            "name": "r biserial de rango",
            "symbol": "r",
            "value": r_disp,
            "value_display": r_disp,
            "interpretation": interp,
            "category": cat,
            "interpretation_ranges": R_BISERIAL_RANGES,
            "note": "Magnitud del efecto para Mann-Whitney (dos grupos independientes).",
            "ci": ci,
            "table": {
                "measure": "r biserial de rango (r)",
                "value": "—" if r_disp is None else str(r_disp),
                "ci": ci_display,
                "interpretation": interp,
            },
        }

    chart = {
        "type": "boxplot",
        "groups": [
            {"label": str(lab), "values": [_safe_round(float(v), 4) for v in g]}
            for lab, g in zip(labels, groups)
        ],
    }
    p_float = float(p)
    return {
        "predictor_label": pspec["label"],
        "outcome_label": outcome_display,
        "method": method,
        "method_label": method_label,
        "statistic": _safe_round(float(stat), 4),
        "p_value": _safe_round(p_float, 4),
        "global_p_label": _p_fmt(p_float),
        "test_table_r": _continuous_test_table(method, float(stat), p_float, len(g1), len(g2)),
        "conclusion": _continuous_conclusion(p_float, method),
        "group_labels": [str(l) for l in labels],
        "effect_size": effect,
        "chart": chart,
        "comparison_table": {
            "rows": [
                {
                    "group": str(lab),
                    "n": int(len(g)),
                    "mean": _safe_round(float(np.mean(g)), 2),
                    "sd": _safe_round(float(np.std(g, ddof=1)), 2) if len(g) > 1 else 0.0,
                    "median": _safe_round(float(np.median(g)), 2),
                }
                for lab, g in zip(labels, groups)
            ]
        },
    }


def register_chisq_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/inferencial/chisq/schema")
    async def chisq_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        assoc = _build_association_schema(df, cols)
        cont = _build_continuous_schema(df, cols)
        return {
            "success": True,
            "association": assoc,
            "continuous": cont,
            "ready": bool(assoc.get("outcomes")) and (
                any(p.get("available") for p in assoc.get("predictors", []))
                or any(p.get("available") for p in cont.get("predictors", []))
            ),
        }

    @router.post("/datasets/{dataset_id}/inferencial/chisq/association/assumptions")
    async def chisq_assoc_assumptions(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        pid = body.get("predictor_id")
        oid = body.get("outcome_id")
        if not pid or not oid:
            raise HTTPException(status_code=400, detail="Indique predictor y variable respuesta")
        return {"success": True, **_association_assumptions(df, str(pid), str(oid))}

    @router.post("/datasets/{dataset_id}/inferencial/chisq/association/run-test")
    async def chisq_assoc_run(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        pid = body.get("predictor_id")
        oid = body.get("outcome_id")
        method = body.get("method")
        if not pid or not oid or not method:
            raise HTTPException(status_code=400, detail="Indique predictor, respuesta y método")
        return {
            "success": True,
            **_run_association_test(df, str(pid), str(oid), str(method)),
        }

    @router.post("/datasets/{dataset_id}/inferencial/chisq/continuous/assumptions")
    async def chisq_cont_assumptions(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        pid = body.get("predictor_id")
        oid = body.get("outcome_id")
        if not pid or not oid:
            raise HTTPException(status_code=400, detail="Indique predictor y variable respuesta")
        ga = body.get("group_a")
        gb = body.get("group_b")
        return {
            "success": True,
            **_continuous_assumptions(
                df, str(pid), str(oid), str(ga) if ga else None, str(gb) if gb else None
            ),
        }

    @router.post("/datasets/{dataset_id}/inferencial/chisq/continuous/run-test")
    async def chisq_cont_run(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        pid = body.get("predictor_id")
        oid = body.get("outcome_id")
        method = body.get("method")
        if not pid or not oid or not method:
            raise HTTPException(status_code=400, detail="Indique predictor, respuesta y método")
        ga = body.get("group_a")
        gb = body.get("group_b")
        return {
            "success": True,
            **_run_continuous_test(
                df,
                str(pid),
                str(oid),
                str(method),
                str(ga) if ga else None,
                str(gb) if gb else None,
            ),
        }
