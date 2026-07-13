"""
Módulo 4.1 — Construcción del índice de adversidad perinatal (IAP).
"""
from __future__ import annotations

from typing import Any, Dict, List

import pandas as pd
from fastapi import APIRouter

from analysis_fetal_common import (
    IAP_COMPONENT_SPECS,
    IAP_DEFINITION,
    IAP_MAX_POINTS,
    _get_df,
    compute_iap_dataframe,
)


def _build_iap_schema(df: pd.DataFrame) -> Dict[str, Any]:
    _, meta = compute_iap_dataframe(df)
    return {
        "title": IAP_DEFINITION["name"],
        "description": IAP_DEFINITION["formula"],
        "index_definition": IAP_DEFINITION,
        "components": meta["components"],
        "max_points": IAP_MAX_POINTS,
        "component_specs": IAP_COMPONENT_SPECS,
        "ready": meta["n_scored"] > 0,
        "insight_preview": (
            "En el resto del módulo se usa el IAP para comparar grupos (obesidad vs normopeso), "
            "correlacionarlo con lípidos y modelar obesidad infantil (LASSO y árbol CART)."
        ),
    }


def _run_iap_build(df: pd.DataFrame) -> Dict[str, Any]:
    work, meta = compute_iap_dataframe(df)
    scored = work.dropna(subset=["iap_total"])

    bars = meta["distribution"]
    comp_rows = [
        {
            "id": c["id"],
            "label": c["label"],
            "available": c.get("available"),
            "pct_positive": c.get("pct_positive"),
            "n_positive": c.get("n_positive"),
            "n_scored": c.get("n_scored"),
        }
        for c in meta["components"]
    ]

    mean_iap = meta.get("mean_iap")
    median_iap = meta.get("median_iap")
    insight = {
        "title": "Distribución del IAP en la cohorte",
        "paragraphs": [
            (
                f"Se obtuvo una puntuación IAP para {meta['n_scored']} niños. "
                f"Cada niño tiene un valor entero entre 0 y {IAP_MAX_POINTS} "
                f"(media {mean_iap}, mediana {median_iap})."
            ),
            (
                "El gráfico de barras muestra cuántos niños tienen cada puntuación (0, 1, 2, …). "
                "La tabla de componentes indica qué antecedentes aportan el punto en la cohorte."
            ),
        ],
    }
    if mean_iap is not None and float(mean_iap) >= 2:
        insight["paragraphs"].append(
            "Con una media ≥ 2, la cohorte presenta en promedio una carga moderada-alta de adversidad perinatal acumulada."
        )
    else:
        insight["paragraphs"].append(
            "Con media baja, predominan perfiles con pocos insultos perinatales simultáneos en los datos."
        )

    return {
        **meta,
        "index_definition": IAP_DEFINITION,
        "index_summary": (
            f"El IAP es la puntuación total (0–{IAP_MAX_POINTS}) que cuenta cuántos de los seis "
            "componentes de adversidad perinatal están presentes en cada niño: un punto por componente cumplido."
        ),
        "component_table": comp_rows,
        "bar_chart": bars,
        "insight": insight,
        "sample_preview": [
            {"iap_total": int(r["iap_total"])}
            for _, r in scored.head(8).iterrows()
        ],
    }


def register_iap_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/fetal/iap/schema")
    async def iap_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_build_iap_schema(df)}

    @router.post("/datasets/{dataset_id}/fetal/iap/run")
    async def iap_run(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_run_iap_build(df)}
