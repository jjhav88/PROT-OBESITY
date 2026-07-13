"""
Módulo 4.2 — Comparar IAP entre categorías de Condicion (Mann-Whitney).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException

try:
    from scipy import stats as scipy_stats
except ImportError:  # pragma: no cover
    scipy_stats = None

from analysis_fetal_common import (
    IAP_MAX_POINTS,
    _get_df,
    _match_column,
    _resolve_condicion,
    _safe_round,
    compute_iap_dataframe,
)

ALPHA = 0.05
MIN_GROUP_N = 8

CONDICION_CATEGORIES: Tuple[str, ...] = ("Obesidad", "Sobrepeso", "Normopeso", "Bajo peso")

DEFAULT_PAIR_PRIORITY: Tuple[Tuple[str, str], ...] = (
    ("Obesidad", "Sobrepeso"),
    ("Obesidad", "Normopeso"),
    ("Sobrepeso", "Normopeso"),
    ("Obesidad", "Bajo peso"),
    ("Sobrepeso", "Bajo peso"),
    ("Normopeso", "Bajo peso"),
)

INTERPRETATION_GUIDE: Dict[str, Any] = {
    "title": "Si no hay diferencia significativa entre grupos",
    "bullets": [
        "El IAP resume exposición perinatal previa; Condicion es el estado nutricional actual. Son constructos distintos: adversidad temprana no implica automáticamente obesidad o sobrepeso hoy.",
        "Con IAP en escala 0–6 y muchos empates, Mann-Whitney tiene poca potencia en muestras pequeñas aunque exista adversidad en la cohorte.",
        "Puede haber insultos perinatales en ambos grupos (IAP > 0) sin que la carga acumulada difiera entre obesidad y sobrepeso (u otros pares).",
        "La ausencia de p < 0,05 no descarta programación fetal: dieta actual, actividad, edad o genética pueden modular Condicion más que el IAP en este tamaño muestral.",
    ],
}


def _rank_biserial(u_stat: float, n1: int, n2: int) -> Optional[float]:
    if n1 <= 0 or n2 <= 0:
        return None
    return float(1 - (2 * u_stat) / (n1 * n2))


def _mann_whitney(g1: np.ndarray, g2: np.ndarray) -> Dict[str, Any]:
    if scipy_stats is None:
        return {
            "U": None,
            "p_value": None,
            "statistic_label": "U de Mann-Whitney",
            "error": "SciPy no está instalado en el servidor (pip install scipy). Sin SciPy no se puede calcular p.",
        }
    g1 = np.asarray(g1, dtype=float)
    g2 = np.asarray(g2, dtype=float)
    if len(g1) < 2 or len(g2) < 2:
        return {"U": None, "p_value": None, "statistic_label": "U de Mann-Whitney"}
    try:
        u, p = scipy_stats.mannwhitneyu(g1, g2, alternative="two-sided")
        u_f = float(u)
        return {
            "U": _safe_round(u_f, 2),
            "p_value": _safe_round(float(p), 4),
            "statistic_label": "U de Mann-Whitney",
            "rank_biserial_r": _safe_round(_rank_biserial(u_f, len(g1), len(g2)), 4),
        }
    except ValueError:
        return {"U": None, "p_value": None, "statistic_label": "U de Mann-Whitney"}


def _kruskal_over_groups(group_arrays: List[Tuple[str, np.ndarray]]) -> Optional[Dict[str, Any]]:
    eligible = [(lab, arr) for lab, arr in group_arrays if len(arr) >= MIN_GROUP_N]
    if scipy_stats is None or len(eligible) < 2:
        return None
    try:
        h, p = scipy_stats.kruskal(*[arr for _, arr in eligible])
        return {
            "test": "Kruskal-Wallis",
            "H": _safe_round(float(h), 4),
            "p_value": _safe_round(float(p), 4),
            "groups_included": [lab for lab, _ in eligible],
            "significant": bool(float(p) < ALPHA),
        }
    except ValueError:
        return None


def _build_merged_frame(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any], Dict[str, Any]]:
    work, iap_meta = compute_iap_dataframe(df)
    cols = [str(c) for c in df.columns]
    cond_col = _match_column(cols, "Condicion") or _match_column(cols, "condicion")
    cond = _resolve_condicion(df, cols)

    merged = pd.DataFrame(
        {"iap": work["iap_total"], "condicion": cond},
        index=df.index,
    )
    n_rows = int(len(merged))
    n_missing_iap = int(merged["iap"].isna().sum())
    n_missing_cond = int(merged["condicion"].isna().sum())
    with_both = merged.dropna(subset=["iap", "condicion"])
    n_with_both = int(len(with_both))

    known = with_both[with_both["condicion"].isin(CONDICION_CATEGORIES)]
    n_excluded_cond = int(len(with_both) - len(known))

    raw_counts = cond.value_counts(dropna=False).to_dict()
    audit = {
        "condicion_column": cond_col,
        "factor_variable": "Condicion",
        "outcome_variable": "iap_total (IAP 0–6)",
        "n_rows": n_rows,
        "n_missing_iap": n_missing_iap,
        "n_missing_condicion": n_missing_cond,
        "n_with_iap_and_condicion": n_with_both,
        "n_excluded_unknown_condicion": n_excluded_cond,
        "condicion_counts_all_rows": {str(k): int(v) for k, v in raw_counts.items()},
    }
    return known, audit, iap_meta


def _group_stats(series: pd.Series) -> Dict[str, Any]:
    arr = series.astype(float).to_numpy()
    return {
        "n": int(len(arr)),
        "median": _safe_round(float(np.median(arr)), 2) if len(arr) else None,
        "mean": _safe_round(float(np.mean(arr)), 2) if len(arr) else None,
        "min": int(np.min(arr)) if len(arr) else None,
        "max": int(np.max(arr)) if len(arr) else None,
        "values": arr.tolist(),
    }


def _summarize_condicion_groups(known: pd.DataFrame) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for label in CONDICION_CATEGORIES:
        sub = known.loc[known["condicion"] == label, "iap"]
        if len(sub) == 0:
            rows.append(
                {
                    "label": label,
                    "n": 0,
                    "median": None,
                    "mean": None,
                    "min": None,
                    "max": None,
                    "ready_for_test": False,
                }
            )
            continue
        st = _group_stats(sub)
        rows.append(
            {
                "label": label,
                "ready_for_test": st["n"] >= MIN_GROUP_N,
                **{k: st[k] for k in ("n", "median", "mean", "min", "max")},
            }
        )
    return rows


def _default_pair(counts: Dict[str, int]) -> Tuple[Optional[str], Optional[str]]:
    for a, b in DEFAULT_PAIR_PRIORITY:
        if counts.get(a, 0) >= MIN_GROUP_N and counts.get(b, 0) >= MIN_GROUP_N:
            return a, b
    best: Optional[Tuple[str, str]] = None
    best_min_n = -1
    labels = [lab for lab in CONDICION_CATEGORIES if counts.get(lab, 0) >= MIN_GROUP_N]
    for i, a in enumerate(labels):
        for b in labels[i + 1 :]:
            m = min(counts[a], counts[b])
            if m > best_min_n:
                best_min_n = m
                best = (a, b)
    return best if best else (None, None)


def _build_compare_schema(df: pd.DataFrame) -> Dict[str, Any]:
    known, audit, iap_meta = _build_merged_frame(df)
    condicion_groups = _summarize_condicion_groups(known)
    counts = {g["label"]: g["n"] for g in condicion_groups}
    ga, gb = _default_pair(counts)

    pairwise_ready: List[Dict[str, Any]] = []
    for i, a in enumerate(CONDICION_CATEGORIES):
        for b in CONDICION_CATEGORIES[i + 1 :]:
            na, nb = counts.get(a, 0), counts.get(b, 0)
            if na >= MIN_GROUP_N and nb >= MIN_GROUP_N:
                pairwise_ready.append({"group_a": a, "group_b": b, "n_a": na, "n_b": nb})

    return {
        "title": "Comparar IAP por Condicion",
        "description": (
            "Contraste del IAP entre dos categorías de la variable Condicion "
            "(obesidad, sobrepeso, normopeso, bajo peso) con U de Mann-Whitney. "
            "Puede elegir el par de grupos; por defecto se prioriza Obesidad vs Sobrepeso si hay suficientes datos."
        ),
        "condicion_categories": list(CONDICION_CATEGORIES),
        "condicion_groups": condicion_groups,
        "pairwise_ready": pairwise_ready,
        "default_group_a": ga,
        "default_group_b": gb,
        "min_group_n": MIN_GROUP_N,
        "alpha": ALPHA,
        "iap_scale": f"0–{IAP_MAX_POINTS}",
        "ready": bool(ga and gb),
        "data_audit": audit,
        "iap_meta": {"n_scored": iap_meta["n_scored"], "mean_iap": iap_meta.get("mean_iap")},
        "interpretation_guide": INTERPRETATION_GUIDE,
        "insight_preview": (
            "Revise el resumen por Condicion antes de ejecutar: confirma que cada grupo tiene el n esperado "
            "y que el IAP proviene de los mismos niños que la variable Condicion."
        ),
    }


def _run_compare(df: pd.DataFrame, group_a: Optional[str], group_b: Optional[str]) -> Dict[str, Any]:
    known, audit, iap_meta = _build_merged_frame(df)
    condicion_groups = _summarize_condicion_groups(known)
    counts = {g["label"]: g["n"] for g in condicion_groups}

    ga = (group_a or "").strip() or None
    gb = (group_b or "").strip() or None
    if not ga or not gb:
        ga, gb = _default_pair(counts)
    if not ga or not gb:
        raise HTTPException(
            status_code=400,
            detail=f"No hay dos grupos de Condicion con al menos {MIN_GROUP_N} niños cada uno.",
        )
    if ga == gb:
        raise HTTPException(status_code=400, detail="Elija dos grupos distintos de Condicion.")
    if ga not in CONDICION_CATEGORIES or gb not in CONDICION_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Grupos válidos: {', '.join(CONDICION_CATEGORIES)}.",
        )

    g1_s = known.loc[known["condicion"] == ga, "iap"]
    g2_s = known.loc[known["condicion"] == gb, "iap"]
    if len(g1_s) < MIN_GROUP_N or len(g2_s) < MIN_GROUP_N:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Se requieren al menos {MIN_GROUP_N} niños por grupo "
                f"({ga} n={len(g1_s)}, {gb} n={len(g2_s)})."
            ),
        )

    g1 = g1_s.astype(float).to_numpy()
    g2 = g2_s.astype(float).to_numpy()
    mw = _mann_whitney(g1, g2)
    if mw.get("error"):
        raise HTTPException(status_code=503, detail=mw["error"])
    p = mw.get("p_value")
    sig = bool(p is not None and float(p) < ALPHA)
    diff_med = float(np.median(g1) - np.median(g2))

    overview = []
    for g in condicion_groups:
        if g["n"] <= 0:
            continue
        sub = known.loc[known["condicion"] == g["label"], "iap"]
        st = _group_stats(sub)
        overview.append({"label": g["label"], **st})

    kw = _kruskal_over_groups(
        [(g["label"], known.loc[known["condicion"] == g["label"], "iap"].astype(float).to_numpy()) for g in condicion_groups if g["n"] > 0]
    )

    insight = {
        "title": f"IAP: {ga} vs {gb} (Condicion)",
        "paragraphs": [
            (
                f"Mann-Whitney entre {ga} (n={len(g1)}, mediana IAP={_safe_round(float(np.median(g1)), 2)}) "
                f"y {gb} (n={len(g2)}, mediana IAP={_safe_round(float(np.median(g2)), 2)}). "
                f"U={mw.get('U')}, p={mw.get('p_value')} (α={ALPHA})."
            ),
            (
                f"Datos: IAP calculado en la misma fila que Condicion "
                f"({audit.get('condicion_column') or 'Condicion'}); "
                f"{audit['n_with_iap_and_condicion']} niños con ambos valores, "
                f"{audit['n_excluded_unknown_condicion']} excluidos por categoría no reconocida."
            ),
        ],
    }
    if sig and diff_med > 0:
        insight["paragraphs"].append(
            f"IAP significativamente mayor en {ga} que en {gb}: más carga de adversidad perinatal en ese grupo."
        )
    elif sig and diff_med < 0:
        insight["paragraphs"].append(
            f"IAP significativamente mayor en {gb} que en {ga}."
        )
    else:
        insight["paragraphs"].append(
            "Sin diferencia estadísticamente significativa en la distribución del IAP entre estos dos grupos "
            "(véase el panel de interpretación)."
        )

    return {
        "test": "Mann-Whitney U",
        "factor_variable": "Condicion",
        "group_a": ga,
        "group_b": gb,
        "groups": [
            {"label": ga, **_group_stats(g1_s)},
            {"label": gb, **_group_stats(g2_s)},
        ],
        "overview_groups": overview,
        "kruskal_wallis": kw,
        "comparison": {
            **mw,
            "significant": sig,
            "median_diff": _safe_round(diff_med, 2),
            "alpha": ALPHA,
        },
        "condicion_groups": condicion_groups,
        "iap_meta": {"n_scored": iap_meta["n_scored"], "mean_iap": iap_meta.get("mean_iap")},
        "data_audit": audit,
        "interpretation_guide": INTERPRETATION_GUIDE,
        "insight": insight,
    }


def register_compare_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/fetal/compare/schema")
    async def compare_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_build_compare_schema(df)}

    @router.post("/datasets/{dataset_id}/fetal/compare/run")
    async def compare_run(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, _, _ = _get_df(dataset_id)
        return {
            "success": True,
            **_run_compare(
                df,
                group_a=body.get("group_a"),
                group_b=body.get("group_b"),
            ),
        }
