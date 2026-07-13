"""
Módulo 4.3 — Correlacionar IAP con perfil lipídico (Spearman + matriz).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

try:
    from scipy import stats as scipy_stats
except ImportError:  # pragma: no cover
    scipy_stats = None

from analysis_fetal_common import (
    LIPID_CORRELATE_SPECS,
    _get_df,
    _match_column,
    _safe_round,
    compute_iap_dataframe,
)

ALPHA = 0.05
MIN_PAIRS = 20
MIN_MATRIX_N = 10
MAX_SCATTER = 200
IAP_LABEL = "IAP"


def _spearman_pair(x: np.ndarray, y: np.ndarray) -> Dict[str, Any]:
    if scipy_stats is None or len(x) < 3:
        return {"rho": None, "p_value": None}
    try:
        rho, p = scipy_stats.spearmanr(x, y)
        return {"rho": _safe_round(float(rho), 4), "p_value": _safe_round(float(p), 4)}
    except Exception:
        return {"rho": None, "p_value": None}


def _resolve_lipid_columns(cols: List[str]) -> List[Dict[str, Any]]:
    resolved: List[Dict[str, Any]] = []
    for spec in LIPID_CORRELATE_SPECS:
        col = _match_column(cols, spec["column"])
        if not col and spec.get("alt_columns"):
            for alt in spec["alt_columns"]:
                col = _match_column(cols, alt)
                if col:
                    break
        if col:
            resolved.append(
                {
                    "id": spec["id"],
                    "label": spec["label"],
                    "column": col,
                }
            )
    return resolved


def _build_analysis_frame(df: pd.DataFrame, work: pd.DataFrame, lipid_cols: List[Dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame({"iap": work["iap_total"]}, index=df.index)
    for item in lipid_cols:
        frame[item["column"]] = pd.to_numeric(df[item["column"]], errors="coerce")
    return frame


def _build_correlation_matrix(frame: pd.DataFrame, lipid_cols: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Matriz Spearman: IAP + variables lipídicas disponibles (casos completos)."""
    col_keys = ["iap"] + [item["column"] for item in lipid_cols]
    labels = [IAP_LABEL] + [item["label"] for item in lipid_cols]
    num = frame[col_keys].apply(pd.to_numeric, errors="coerce")
    complete = num.dropna(how="any")
    n = int(len(complete))
    k = len(col_keys)

    if k < 2:
        return {"error": "Se requiere al menos IAP y una variable lipídica numérica."}
    if n < MIN_MATRIX_N:
        return {
            "error": f"Muestra insuficiente para la matriz (n={n}; mínimo {MIN_MATRIX_N} casos completos).",
            "n": n,
        }

    if scipy_stats is None:
        raise HTTPException(
            status_code=503,
            detail="SciPy no está instalado (pip install scipy). Necesario para correlaciones y p.",
        )

    corr = complete.corr(method="spearman")
    p_matrix: List[List[Optional[float]]] = [[None for _ in range(k)] for _ in range(k)]
    for i in range(k):
        p_matrix[i][i] = None
        for j in range(i + 1, k):
            pair = complete.iloc[:, [i, j]].dropna()
            if len(pair) < 3:
                continue
            try:
                _, p = scipy_stats.spearmanr(pair.iloc[:, 0], pair.iloc[:, 1])
                p_val = _safe_round(float(p), 4)
            except Exception:
                p_val = None
            p_matrix[i][j] = p_val
            p_matrix[j][i] = p_val

    z = [[_safe_round(corr.iloc[i, j]) for j in range(k)] for i in range(k)]
    sig = [
        [
            bool(i != j and p_matrix[i][j] is not None and p_matrix[i][j] < ALPHA)
            for j in range(k)
        ]
        for i in range(k)
    ]

    return {
        "method": "spearman",
        "method_label": "Correlación de Spearman",
        "method_reason": (
            "IAP es una puntuación ordinal (0–6); las variables lipídicas son continuas. "
            "Spearman evalúa la asociación monótona entre pares con los mismos niños (casos completos)."
        ),
        "labels": labels,
        "column_keys": col_keys,
        "matrix": z,
        "p_matrix": p_matrix,
        "significant": sig,
        "n": n,
        "alpha": ALPHA,
    }


def _run_correlate(df: pd.DataFrame) -> Dict[str, Any]:
    work, iap_meta = compute_iap_dataframe(df)
    cols = [str(c) for c in df.columns]
    lipid_cols = _resolve_lipid_columns(cols)
    frame = _build_analysis_frame(df, work, lipid_cols)

    correlation_matrix = _build_correlation_matrix(frame, lipid_cols)

    rows: List[Dict[str, Any]] = []
    scatters: List[Dict[str, Any]] = []

    for spec in LIPID_CORRELATE_SPECS:
        col = _match_column(cols, spec["column"])
        if not col and spec.get("alt_columns"):
            for alt in spec["alt_columns"]:
                col = _match_column(cols, alt)
                if col:
                    break
        if not col:
            rows.append({**spec, "available": False, "rho": None, "p_value": None, "n": 0})
            continue
        paired = frame[["iap", col]].dropna()
        n = len(paired)
        if n < MIN_PAIRS:
            rows.append({**spec, "available": False, "rho": None, "p_value": None, "n": n})
            continue
        sp = _spearman_pair(paired["iap"].to_numpy(), paired[col].to_numpy())
        sig = bool(sp["p_value"] is not None and sp["p_value"] < ALPHA)
        rows.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "column": col,
                "available": True,
                "n": n,
                "rho": sp["rho"],
                "p_value": sp["p_value"],
                "significant": sig,
                "direction": (
                    "positiva"
                    if sp["rho"] and sp["rho"] > 0
                    else ("negativa" if sp["rho"] and sp["rho"] < 0 else "—")
                ),
            }
        )
        idx = np.linspace(0, n - 1, min(n, MAX_SCATTER), dtype=int)
        scatters.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "rho": sp["rho"],
                "p_value": sp["p_value"],
                "points": [
                    {"iap": float(paired["iap"].iloc[i]), "y": float(paired[col].iloc[i])}
                    for i in idx
                ],
            }
        )

    matrix_ok = not correlation_matrix.get("error")
    if not matrix_ok and not any(r.get("available") for r in rows):
        raise HTTPException(
            status_code=400,
            detail=correlation_matrix.get("error") or "No hay datos suficientes para correlaciones.",
        )

    tg = next((r for r in rows if r["id"] == "trigliceridos" and r.get("available")), None)
    hdl = next((r for r in rows if r["id"] == "hdl" and r.get("available")), None)
    glu = next((r for r in rows if r["id"] == "glucosa" and r.get("available")), None)

    paragraphs = [
        (
            f"Matriz de Spearman entre IAP y variables lipídicas/metabólicas "
            f"({correlation_matrix.get('n', iap_meta['n_scored'])} niños con datos completos en la matriz)."
        ),
    ]
    if tg and tg.get("significant") and tg.get("rho", 0) > 0:
        paragraphs.append(
            f"Triglicéridos aumentan con IAP (ρ={tg['rho']}, p={tg['p_value']}): peor perfil lipídico con más adversidad."
        )
    if hdl and hdl.get("significant") and hdl.get("rho", 0) < 0:
        paragraphs.append(f"HDL disminuye con IAP (ρ={hdl['rho']}): patrón cardiometabólico adverso.")
    if glu and glu.get("significant") and glu.get("rho", 0) > 0:
        paragraphs.append(f"Glucosa correlaciona positivamente con IAP (ρ={glu['rho']}).")
    if len(paragraphs) == 1:
        paragraphs.append(
            "Revise la matriz: celdas con * indican p < 0,05. Las correlaciones son exploratorias en esta muestra."
        )

    return {
        "test": "Correlación de Spearman",
        "alpha": ALPHA,
        "min_pairs": MIN_PAIRS,
        "correlation_matrix": correlation_matrix,
        "correlations": rows,
        "scatter_plots": scatters if any(r.get("available") for r in rows) else [],
        "iap_meta": {"n_scored": iap_meta["n_scored"], "mean_iap": iap_meta.get("mean_iap")},
        "insight": {"title": "IAP y perfil lipídico", "paragraphs": paragraphs},
    }


def register_correlate_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/fetal/correlate/schema")
    async def correlate_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        lipid_cols = _resolve_lipid_columns(cols)
        vars_out = [
            {"id": item["id"], "label": item["label"], "column": item["column"], "available": True}
            for item in lipid_cols
        ]
        for spec in LIPID_CORRELATE_SPECS:
            if not any(v["id"] == spec["id"] for v in vars_out):
                vars_out.append(
                    {
                        "id": spec["id"],
                        "label": spec["label"],
                        "column": None,
                        "available": False,
                    }
                )
        work, meta = compute_iap_dataframe(df)
        frame = _build_analysis_frame(df, work, lipid_cols)
        matrix_preview = _build_correlation_matrix(frame, lipid_cols)

        return {
            "success": True,
            "title": "Correlacionar IAP con lípidos",
            "description": (
                "Matriz de correlación de Spearman entre IAP (0–6) y triglicéridos, HDL y glucosa. "
                "Incluye p por par y dispersión exploratoria IAP–variable."
            ),
            "outcomes": vars_out,
            "matrix_variables": [IAP_LABEL] + [v["label"] for v in vars_out if v.get("available")],
            "min_pairs": MIN_PAIRS,
            "min_matrix_n": MIN_MATRIX_N,
            "matrix_ready": not matrix_preview.get("error"),
            "ready": meta["n_scored"] >= MIN_MATRIX_N and len(lipid_cols) >= 1,
            "insight_preview": (
                "En la matriz, ρ positivo IAP–triglicéridos o glucosa y negativo IAP–HDL apoyarían "
                "peor perfil con mayor adversidad perinatal."
            ),
        }

    @router.post("/datasets/{dataset_id}/fetal/correlate/run")
    async def correlate_run(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_run_correlate(df)}
