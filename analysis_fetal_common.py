"""
Módulo 4 — utilidades compartidas e índice de adversidad perinatal (IAP).
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

IAP_MAX_POINTS = 6

IAP_DEFINITION: Dict[str, Any] = {
    "name": "IAP — Índice de adversidad perinatal",
    "short_label": "Puntuación compuesta (entero de 0 a 6)",
    "literature_note": (
        "No corresponde a un índice único estandarizado en la literatura clínica (como el APGAR o "
        "una sola medida de tamaño al nacer). Es un indicador compuesto definido de forma "
        "operacional para esta cohorte, alineado con el marco de programación fetal: resume la "
        "acumulación de insultos perinatales y maternos tempranos que podrían influir en el "
        "metabolismo del niño."
    ),
    "formula": (
        "Por cada niño, IAP = suma de seis componentes binarios (0 = no presente, 1 = presente). "
        f"El valor total está acotado entre 0 y {IAP_MAX_POINTS}."
    ),
    "interpretation": (
        "Un IAP más alto indica mayor carga acumulada de factores adversos en el periodo perinatal "
        "(no es una variable de laboratorio, sino un resumen de antecedentes). Un IAP de 0 significa "
        "que ninguno de los seis componentes se cumple en los datos; un IAP de 6 que los seis están presentes."
    ),
}

IAP_COMPONENT_SPECS: List[Dict[str, Any]] = [
    {
        "id": "peso_extremo",
        "label": "Peso al nacer extremo (<2500 g o >4000 g)",
        "column": "peso_nacer",
    },
    {
        "id": "pretermino",
        "label": "Parto pretérmino (<37 semanas)",
        "columns": ["semanas_gestacion"],
        "fallback": "termino",
    },
    {
        "id": "materna_metabolica",
        "label": "Madre con diabetes, obesidad o síndrome metabólico",
        "columns": ["diabetes_m", "obes_m", "sm_m"],
    },
    {
        "id": "sin_lactancia",
        "label": "Ausencia de lactancia materna",
        "column": "lactancia_materna",
        "inverted": True,
    },
    {
        "id": "complicaciones",
        "label": "Complicaciones al nacer",
        "column": "complicaciones",
    },
    {
        "id": "toxicos",
        "label": "Exposición a sustancias tóxicas",
        "column": "exp_sust_tox",
    },
]

LIPID_CORRELATE_SPECS = [
    {"id": "trigliceridos", "column": "Trigliceridos", "label": "Triglicéridos"},
    {"id": "hdl", "column": "HDL_Colesterol", "label": "HDL", "alt_columns": ["HDL"]},
    {"id": "glucosa", "column": "Glucosa", "label": "Glucosa"},
]


def _api():
    from analysis_api import _find_dataset, _read_dataframe, infer_variable_type

    return _find_dataset, _read_dataframe, infer_variable_type


def _norm_col(name: str) -> str:
    s = str(name).strip().lower()
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s


def _match_column(cols: List[str], name: str) -> Optional[str]:
    key = _norm_col(name)
    for col in cols:
        if _norm_col(col) == key:
            return col
    return None


def _get_df(dataset_id: str):
    _find_dataset, _read_dataframe, infer_variable_type = _api()
    info = _find_dataset(dataset_id)
    if not info:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    path = info.get("file_path", "")
    if not path or not __import__("os").path.exists(path):
        from fastapi import HTTPException

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


def _is_yes(val: Any) -> Optional[bool]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if s in ("si", "sí", "s", "yes", "y", "1", "true", "verdadero"):
        return True
    if s in ("no", "n", "0", "false", "falso"):
        return False
    try:
        f = float(s.replace(",", "."))
        if f >= 0.5:
            return True
        if f == 0:
            return False
    except ValueError:
        pass
    return None


def _point_from_yes(val: Any, inverted: bool = False) -> float:
    b = _is_yes(val)
    if b is None:
        return float("nan")
    adverse = (not b) if inverted else b
    return 1.0 if adverse else 0.0


def _peso_extremo_point(series: pd.Series) -> pd.Series:
    raw = pd.to_numeric(series, errors="coerce")
    sample = raw.dropna()
    use_kg = len(sample) > 0 and float(sample.median()) < 50
    if use_kg:
        low, high = 2.5, 4.0
    else:
        low, high = 2500.0, 4000.0
    out = pd.Series(np.nan, index=series.index, dtype=float)
    out[(raw < low) | (raw > high)] = 1.0
    out[(raw >= low) & (raw <= high)] = 0.0
    return out


def _pretermino_point(df: pd.DataFrame, cols: List[str]) -> pd.Series:
    sem_col = _match_column(cols, "semanas_gestacion")
    if sem_col:
        weeks = pd.to_numeric(df[sem_col], errors="coerce")
        out = pd.Series(np.nan, index=df.index, dtype=float)
        out[weeks < 37] = 1.0
        out[weeks >= 37] = 0.0
        return out
    term_col = _match_column(cols, "termino")
    if term_col:
        raw = df[term_col].astype(str).str.strip().str.lower()
        out = pd.Series(np.nan, index=df.index, dtype=float)
        out[raw.str.contains("preter|preterm|pre-term", regex=True, na=False)] = 1.0
        out[raw.str.contains("termino|term", regex=True, na=False) & ~raw.str.contains("preter", na=False)] = 0.0
        return out
    return pd.Series(np.nan, index=df.index, dtype=float)


def _maternal_metabolic_point(df: pd.DataFrame, cols: List[str]) -> pd.Series:
    parts = []
    for name in ["diabetes_m", "obes_m", "sm_m"]:
        col = _match_column(cols, name)
        if not col:
            continue
        parts.append(df[col].map(lambda v: _point_from_yes(v, inverted=False)))
    if not parts:
        return pd.Series(np.nan, index=df.index, dtype=float)
    stacked = pd.concat(parts, axis=1)
    any_yes = (stacked == 1.0).any(axis=1)
    has_data = stacked.notna().any(axis=1)
    out = pd.Series(np.nan, index=df.index, dtype=float)
    out[has_data & any_yes] = 1.0
    out[has_data & ~any_yes] = 0.0
    return out


def _resolve_condicion(df: pd.DataFrame, cols: List[str]) -> pd.Series:
    col = _match_column(cols, "Condicion") or _match_column(cols, "condicion")
    if not col:
        return pd.Series(dtype=str)

    def _classify(val: Any) -> Optional[str]:
        if val is None or pd.isna(val):
            return None
        s = str(val).strip().lower()
        if "obes" in s:
            return "Obesidad"
        if "normo" in s:
            return "Normopeso"
        if "sobre" in s:
            return "Sobrepeso"
        if "bajo" in s:
            return "Bajo peso"
        return str(val).strip()

    return df[col].map(_classify)


def compute_iap_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Devuelve DataFrame con columnas iap_* y iap_total + metadatos."""
    cols = [str(c) for c in df.columns]
    work = pd.DataFrame(index=df.index)
    components_meta: List[Dict[str, Any]] = []

    for spec in IAP_COMPONENT_SPECS:
        cid = spec["id"]
        col_out = f"iap_{cid}"
        series: Optional[pd.Series] = None
        source_note = ""

        if cid == "peso_extremo":
            col = _match_column(cols, spec["column"])
            if col:
                series = _peso_extremo_point(df[col])
                source_note = col
        elif cid == "pretermino":
            series = _pretermino_point(df, cols)
            source_note = "semanas_gestacion o termino"
        elif cid == "materna_metabolica":
            series = _maternal_metabolic_point(df, cols)
            source_note = "diabetes_m / obes_m / sm_m"
        elif cid == "sin_lactancia":
            col = _match_column(cols, spec["column"])
            if col:
                series = df[col].map(lambda v: _point_from_yes(v, inverted=bool(spec.get("inverted"))))
                source_note = col
        else:
            col = _match_column(cols, spec.get("column", ""))
            if col:
                series = df[col].map(lambda v: _point_from_yes(v, inverted=False))
                source_note = col

        if series is None:
            work[col_out] = np.nan
            components_meta.append(
                {
                    **spec,
                    "available": False,
                    "column_resolved": None,
                    "n_scored": 0,
                    "pct_positive": None,
                }
            )
        else:
            work[col_out] = series
            valid = series.dropna()
            n_pos = int((valid == 1).sum())
            components_meta.append(
                {
                    **spec,
                    "available": True,
                    "column_resolved": source_note,
                    "n_scored": int(len(valid)),
                    "n_positive": n_pos,
                    "pct_positive": _safe_round(100 * n_pos / len(valid), 1) if len(valid) else None,
                }
            )

    comp_cols = [c for c in work.columns if c.startswith("iap_")]
    work["iap_total"] = work[comp_cols].sum(axis=1, min_count=1)
    work.loc[work[comp_cols].isna().all(axis=1), "iap_total"] = np.nan

    scored = work.dropna(subset=["iap_total"])
    dist: Dict[str, int] = {str(i): 0 for i in range(IAP_MAX_POINTS + 1)}
    for v in scored["iap_total"].astype(int):
        dist[str(v)] = dist.get(str(v), 0) + 1

    return work, {
        "components": components_meta,
        "n_scored": int(len(scored)),
        "distribution": [{"iap": int(k), "n": n} for k, n in sorted(dist.items(), key=lambda x: int(x[0]))],
        "mean_iap": _safe_round(float(scored["iap_total"].mean()), 2) if len(scored) else None,
        "median_iap": _safe_round(float(scored["iap_total"].median()), 2) if len(scored) else None,
        "max_points": IAP_MAX_POINTS,
    }
