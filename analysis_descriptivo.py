"""
Análisis descriptivo — cálculos estadísticos y rutas API.
"""
from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException

from analysis_api import (
    VARIABLE_TYPES,
    _find_dataset,
    _read_dataframe,
    infer_variable_type,
)

try:
    from scipy import stats as scipy_stats
except ImportError:  # pragma: no cover
    scipy_stats = None

WEIGHT_GROUP_ALIASES = [
    "condicion_peso",
    "clasificacion_peso",
    "estado_nutricional",
    "clasificacion_nutricional",
    "categoria_imc",
    "clasificacion_imc",
    "clasif_imc",
    "nutricion",
    "percentil_imc_clasificacion",
]

DEFAULT_ANTHRO = [
    "Estatura_cm",
    "Peso_kg",
    "IMC",
    "Percentil_IMC",
    "Cinrcunferencia_Cintura",
    "Circunferencia_Cintura",
    "Perimetro_Braquial",
    "Perimetro_Cefalico",
]

DEFAULT_LIPID = [
    "Colesterol_Total",
    "HDL_Colesterol",
    "LDL_Colesterol",
    "Trigliceridos",
    "VLDL_Colesterol",
    "Glucosa",
    "No_HDL_Colesterol",
]

PCP_DICHOTOMOUS = [
    "sm_m",
    "diabetes_m",
    "obes_m",
    "lactancia_materna",
    "complicaciones",
    "exp_sust_tox",
    "curso_normal",
]

PCP_DICHOTOMOUS_LABELS = {
    "sm_m": "Síndrome metabólico materno",
    "diabetes_m": "Diabetes materna",
    "obes_m": "Obesidad materna",
    "lactancia_materna": "Lactancia materna",
    "complicaciones": "Complicaciones",
    "exp_sust_tox": "Exp. sustancias tóxicas",
    "curso_normal": "Curso normal",
    "preclamsia_m": "Preeclampsia materna",
    "infecc_embarazo_m": "Infección en el embarazo",
    "HTA_m": "Hipertensión materna",
    "hipercolesterolemia_m": "Hipercolesterolemia materna",
    "hipertrigli_m": "Hipertrigliceridemia materna",
}

# Evento adverso presente = 1 (rojo); ausente = 0 (blanco)
ADVERSITY_INVERTED_COLS = frozenset({"curso_normal", "lactancia_materna"})

RADAR_METRIC_SPECS: List[Dict[str, Any]] = [
    {"id": "col_total", "patterns": ["colesterol_total"], "label": "Colesterol Total"},
    {"id": "hdl_inv", "patterns": ["hdl_colesterol", "hdl"], "label": "1/HDL", "inverse_hdl": True},
    {"id": "vldl", "patterns": ["vldl_colesterol", "vldl"], "label": "VLDL"},
    {"id": "no_hdl", "patterns": ["no_hdl", "no_hdl_colesterol"], "label": "No-HDL"},
    {"id": "glucosa", "patterns": ["glucosa"], "label": "Glucosa"},
    {"id": "tg", "patterns": ["trigliceridos"], "label": "Triglicéridos"},
    {"id": "ldl", "patterns": ["ldl_colesterol", "ldl"], "label": "LDL"},
]

RADAR_AXIS_DESCRIPTIONS: Dict[str, str] = {
    "col_total": "Colesterol total sérico (mg/dL).",
    "hdl_inv": (
        "Recíproco del colesterol HDL: 1÷HDL (HDL en mg/dL). "
        "Se usa porque un HDL bajo es desfavorable: al invertirlo, un perfil «más alejado del centro» "
        "en este eje va en la misma dirección de riesgo que los demás lípidos elevados."
    ),
    "vldl": "Colesterol VLDL (mg/dL).",
    "no_hdl": "Colesterol no-HDL (mg/dL).",
    "glucosa": "Glucosa en ayuno (mg/dL).",
    "tg": "Triglicéridos séricos (mg/dL).",
    "ldl": "Colesterol LDL (mg/dL).",
}

MIN_RADAR_GROUP_N = 3
RADAR_Z_NEAR_EPS = 0.15
RADAR_Z_CONTRAST_EPS = 0.2


def _radar_metric_prose(axis_id: str, label: str) -> str:
    phrases = {
        "col_total": "colesterol total",
        "hdl_inv": "valores de 1/HDL más altos (HDL más bajo)",
        "vldl": "VLDL",
        "no_hdl": "colesterol no-HDL",
        "glucosa": "glucosa",
        "tg": "triglicéridos",
        "ldl": "LDL",
    }
    return phrases.get(axis_id, label)


def _radar_axis_narrative_sentence(
    color_label: str,
    axis_label: str,
    axis_id: str,
    z: float,
    group_name: str,
) -> str:
    metric = _radar_metric_prose(axis_id, axis_label)
    z_txt = f"{z:.2f}"
    if z >= RADAR_Z_NEAR_EPS:
        lead = f"{color_label} más hacia afuera en {axis_label}"
        body = f"tienen, en promedio, {metric} por encima del promedio de todos los niños de la cohorte"
    elif z <= -RADAR_Z_NEAR_EPS:
        lead = f"{color_label} más hacia el centro en {axis_label}"
        body = f"tienen, en promedio, {metric} por debajo del promedio de todos los niños de la cohorte"
    else:
        lead = f"En {axis_label}, {color_label} queda cerca del centro"
        body = (
            f"los niños del grupo «{group_name}» muestran {metric} "
            "cercano al promedio de la cohorte (sin desviación relevante)"
        )
        return f"{lead} → {body} (z={z_txt})."
    return f"{lead} → los niños del grupo «{group_name}» {body} (z={z_txt})."


def _build_radar_result_narrative(
    series_out: List[Dict[str, Any]],
    axes: List[Dict[str, Any]],
) -> Dict[str, Any]:
    by_series: List[Dict[str, Any]] = []
    for s in series_out:
        color_label = "Rojo" if s.get("adverse") else "Azul"
        bullets: List[Dict[str, Any]] = []
        values = s.get("values") or []
        for i, ax in enumerate(axes):
            if i >= len(values) or values[i] is None:
                continue
            z = float(values[i])
            axis_label = str(ax.get("label", ""))
            axis_id = str(ax.get("id", ""))
            bullets.append(
                {
                    "axis": axis_label,
                    "z": z,
                    "sentence": _radar_axis_narrative_sentence(
                        color_label, axis_label, axis_id, z, str(s.get("name", ""))
                    ),
                }
            )
        by_series.append(
            {
                "name": s.get("name"),
                "adverse": bool(s.get("adverse")),
                "color_label": color_label,
                "n": s.get("n"),
                "bullets": bullets,
            }
        )
    by_series.sort(key=lambda item: bool(item.get("adverse")))
    contrasts: List[Dict[str, Any]] = []
    if len(series_out) == 2:
        a, b = series_out[0], series_out[1]
        va, vb = a.get("values") or [], b.get("values") or []
        for i, ax in enumerate(axes):
            if i >= len(va) or i >= len(vb) or va[i] is None or vb[i] is None:
                continue
            za, zb = float(va[i]), float(vb[i])
            if abs(za - zb) < RADAR_Z_CONTRAST_EPS:
                continue
            axis_label = str(ax.get("label", ""))
            axis_id = str(ax.get("id", ""))
            metric = _radar_metric_prose(axis_id, axis_label)
            ahead, behind = (a, b) if za > zb else (b, a)
            ahead_color = "Rojo" if ahead.get("adverse") else "Azul"
            behind_color = "Rojo" if behind.get("adverse") else "Azul"
            contrasts.append(
                {
                    "axis": axis_label,
                    "sentence": (
                        f"En {axis_label}, el polígono {ahead_color} queda más alejado del centro que el "
                        f"{behind_color}: el grupo «{ahead.get('name', '')}» presenta {metric} medio más alto "
                        f"que «{behind.get('name', '')}» en la escala z (Δz={abs(za - zb):.2f})."
                    ),
                }
            )
    return {
        "title": "Interpretación según este gráfico",
        "by_series": by_series,
        "contrasts": contrasts,
        "causal_note": (
            "Estas frases describen diferencias de medias z entre grupos; no deben leerse como magnitud "
            "de influencia causal de la variable materna/perinatal sobre cada marcador del niño."
        ),
    }


def _radar_dichot_preset(col_id: str, title: str, *, invert: bool = False) -> Dict[str, Any]:
    if invert:
        return {
            "id": col_id,
            "patterns": [col_id],
            "title": title,
            "series": [
                {"label": f"{title}: No", "positive": False, "adverse": True},
                {"label": f"{title}: Sí", "positive": True, "adverse": False},
            ],
        }
    return {
        "id": col_id,
        "patterns": [col_id],
        "title": title,
        "series": [
            {"label": f"{title}: Sí", "positive": True, "adverse": True},
            {"label": f"{title}: No", "positive": False, "adverse": False},
        ],
    }


# Comparaciones del radar: variables perinatales/maternas de la base de datos
PERINATAL_RADAR_COMPARE_SPECS: List[Dict[str, Any]] = [
    _radar_dichot_preset("curso_normal", "Curso normal", invert=True),
    {
        "id": "termino",
        "patterns": ["termino"],
        "title": "Término gestacional",
        "series": [
            {
                "label": "Pretérmino",
                "category_tokens": ["preter", "preterm", "pre-term"],
                "adverse": True,
            },
            {
                "label": "A término",
                "category_tokens": ["termino", "term", "post"],
                "category_exclude": ["preter", "preterm"],
                "adverse": False,
            },
        ],
    },
    {
        "id": "tipo_parto",
        "patterns": ["tipo_parto"],
        "title": "Tipo de parto",
        "series": [
            {"label": "Cesárea", "category_tokens": ["cesar", "cesarea", "cesárea"], "adverse": True},
            {"label": "Vaginal", "category_tokens": ["vagin", "eutoc"], "adverse": False},
        ],
    },
    _radar_dichot_preset("complicaciones", "Complicaciones"),
    _radar_dichot_preset("lactancia_materna", "Lactancia materna", invert=True),
    _radar_dichot_preset("diabetes_m", "Diabetes materna"),
    _radar_dichot_preset("preclamsia_m", "Preeclampsia materna"),
    _radar_dichot_preset("infecc_embarazo_m", "Infección en el embarazo"),
    _radar_dichot_preset("obes_m", "Obesidad materna"),
    _radar_dichot_preset("sm_m", "Síndrome metabólico materno"),
    _radar_dichot_preset("HTA_m", "Hipertensión materna"),
    _radar_dichot_preset("hipercolesterolemia_m", "Hipercolesterolemia materna"),
    _radar_dichot_preset("hipertrigli_m", "Hipertrigliceridemia materna"),
]

ADVERSITY_EVENT_LABELS = {
    "sm_m": "Síndrome metabólico materno (Sí)",
    "diabetes_m": "Diabetes materna (Sí)",
    "obes_m": "Obesidad materna (Sí)",
    "lactancia_materna": "Lactancia (No)",
    "complicaciones": "Complicaciones (Sí)",
    "exp_sust_tox": "Exp. sustancias (Sí)",
    "curso_normal": "Curso normal (No)",
}

PCP_OUTCOME_PATTERNS = [
    "trigliceridos",
    "no_hdl",
    "glucosa",
    "colesterol_total",
    "ldl",
    "hdl",
    "vldl",
]

PCP_OUTCOME_LABELS = {
    "trigliceridos": "Triglicéridos (mg/dL)",
    "glucosa": "Glucosa (mg/dL)",
    "colesterol_total": "Colesterol total (mg/dL)",
    "ldl": "LDL (mg/dL)",
    "hdl": "HDL (mg/dL)",
    "vldl": "VLDL (mg/dL)",
    "no_hdl": "Colesterol no-HDL (mg/dL)",
    "percentil_imc": "Percentil IMC",
    "imc": "IMC",
}

PCP_COMPARE_PANELS = [
    {"id": "tg", "patterns": ["trigliceridos"], "title": "Triglicéridos"},
    {"id": "no_hdl", "patterns": ["no_hdl", "no_hdl_colesterol"], "title": "No-HDL"},
    {
        "id": "imc",
        "patterns": ["percentil_imc"],
        "title": "Percentil IMC (categoría OMS)",
        "use_percentil_column": True,
    },
]

# Rangos categóricos OMS en columna Percentil_IMC → puntaje ordinal para el eje final del PCP
PERCENTIL_IMC_STEPS: List[Tuple[str, float, List[str]]] = [
    ("P<15", 0.0, ["p<15", "<p15"]),
    ("P15-P50", 1.0, ["p15-p50", "p15-50", "p15p50"]),
    ("P50-P75", 2.0, ["p50-p75", "p50-75", "p50p75"]),
    ("P75-P85", 3.0, ["p75-p85", "p75-85", "p75p85"]),
    ("P85-P95", 4.0, ["p85-p95", "p85-95", "p85p95"]),
    ("P>97", 5.0, ["p>97", ">p97", "p97", ">97"]),
]
PERCENTIL_IMC_SCORE_TO_LABEL = {score: label for label, score, _ in PERCENTIL_IMC_STEPS}

PCP_CLUSTER_LABELS = [
    "Perfil perinatal protector",
    "Perfil intermedio",
    "Perfil cardiometabólico adverso",
]

DEFAULT_PERINATAL = [
    "curso_normal",
    "semanas_gestacion",
    "termino",
    "sitio_parto",
    "tipo_parto",
    "peso_nacer",
    "talla_nacer",
    "complicaciones",
    "lactancia_materna",
    "exp_sust_tox",
    "escolaridad_m",
    "escolaridad_p",
    "diabetes_m",
    "preclamsia_m",
    "infecc_embarazo_m",
    "obes_m",
    "sm_m",
    "HTA_m",
    "hipercolesterolemia_m",
    "hipertrigli_m",
    "diabetes_p",
    "preclamsia_p",
    "infecc_embarazo_p",
    "obes_p",
    "sm_p",
    "HTA_p",
    "hipercolesterolemia_p",
    "hipertrigli_p",
]

DEFAULT_CORR = [
    "imc",
    "circunferencia_cintura",
    "trigliceridos",
    "hdl",
    "glucosa",
    "edad",
    "peso_nacer",
    "semanas_gestacion",
]

CORRELATION_PRESET_SPECS = [
    {
        "id": "child_metabolic",
        "label": "Riesgo metabólico del niño",
        "patterns": [
            "imc",
            "circunferencia_cintura",
            "trigliceridos",
            "hdl",
            "glucosa",
            "no_hdl",
        ],
        "info": (
            "Relaciona adiposidad (IMC, cintura) con lípidos y glucosa. "
            "Permite ver si los factores de riesgo cardiovascular del niño se agrupan "
            "y si conviven en la misma muestra del estudio."
        ),
    },
    {
        "id": "lipid_profile",
        "label": "Perfil lipídico completo",
        "patterns": [
            "colesterol_total",
            "hdl",
            "ldl",
            "trigliceridos",
            "vldl",
            "no_hdl",
        ],
        "info": (
            "Explora la coherencia interna del perfil lipídico (p. ej. LDL vs no-HDL, "
            "triglicéridos vs VLDL). Útil para detectar perfiles dislipidémicos "
            "y variables redundantes antes de modelos multivariados."
        ),
    },
    {
        "id": "anthropometry",
        "label": "Antropometría y crecimiento",
        "patterns": [
            "estatura",
            "peso_kg",
            "imc",
            "percentil_imc",
            "perimetro_braquial",
            "perimetro_cefalico",
            "circunferencia",
        ],
        "info": (
            "Vincula talla, peso, IMC y perímetros. Ayuda a interpretar si el crecimiento "
            "y la adiposidad del niño se mueven de forma conjunta en la cohorte."
        ),
    },
    {
        "id": "perinatal_neonatal",
        "label": "Gestación y neonatal",
        "patterns": [
            "semanas_gestacion",
            "peso_nacer",
            "talla_nacer",
            "edad",
        ],
        "info": (
            "Conecta madurez gestacional, peso y talla al nacer con la edad actual. "
            "Relevante para valorar trayectorias pondero-estaturales desde el nacimiento."
        ),
    },
    {
        "id": "maternal_child_bridge",
        "label": "Puente metabólico materno–infantil",
        "patterns": [
            "imc",
            "glucosa",
            "trigliceridos",
            "colesterol",
            "semanas_gestacion",
            "peso_nacer",
        ],
        "info": (
            "Cruza indicadores metabólicos del niño con desenlaces perinatales. "
            "Orienta hipótesis sobre si el entorno intrauterino y el estado metabólico "
            "actual del niño guardan asociación en los datos."
        ),
    },
]


SCATTER_PAIR_SPECS = [
    {
        "id": "pair_1",
        "num": 1,
        "x_patterns": ["imc"],
        "y_patterns": ["trigliceridos"],
        "x_label": "IMC actual del niño",
        "y_label": "Triglicéridos",
        "justification": (
            "Relación clásica obesidad–dislipidemia. Se espera correlación positiva moderada a alta. "
            "Si es débil, otros factores (genéticos o perinatales) podrían modificar la asociación."
        ),
    },
    {
        "id": "pair_2",
        "num": 2,
        "x_patterns": ["peso_nacer"],
        "y_patterns": ["glucosa"],
        "x_label": "Peso al nacer (kg)",
        "y_label": "Glucosa en ayuno del niño",
        "justification": (
            "Hipótesis de programación fetal: bajo peso o macrosomía asociados a alteraciones de glucosa. "
            "Puede haber forma en U; Spearman captura la tendencia monótona global."
        ),
    },
    {
        "id": "pair_3",
        "num": 3,
        "x_patterns": ["semanas_gestacion"],
        "y_patterns": ["perimetro_cefalico"],
        "x_label": "Semanas de gestación",
        "y_label": "Perímetro cefálico del niño",
        "justification": (
            "El perímetro cefálico refleja crecimiento cerebral. La edad gestacional (p. ej. pretérmino) "
            "podría asociarse con menor perímetro en el seguimiento."
        ),
    },
    {
        "id": "pair_4",
        "num": 4,
        "x_patterns": ["circunferencia_cintura"],
        "y_patterns": ["no_hdl"],
        "x_label": "Circunferencia de cintura del niño",
        "y_label": "Colesterol no HDL",
        "justification": (
            "La adiposidad central es más aterogénica que el IMC solo. Se espera correlación positiva "
            "útil para justificar la medición de cintura."
        ),
    },
    {
        "id": "pair_5",
        "num": 5,
        "x_patterns": ["edad"],
        "y_patterns": ["colesterol_total"],
        "x_label": "Edad del niño",
        "y_label": "Colesterol total",
        "justification": (
            "El perfil lipídico puede cambiar con la edad (pubertad). Explora tendencia creciente o decreciente "
            "y si conviene ajustar por edad en modelos futuros."
        ),
    },
]


def _build_scatter_pairs(cols: List[str], numeric: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for spec in SCATTER_PAIR_SPECS:
        x_matched = _match_columns(spec["x_patterns"], cols)
        y_matched = _match_columns(spec["y_patterns"], cols)
        x_col = next((c for c in x_matched if c in numeric), None)
        y_col = next((c for c in y_matched if c in numeric), None)
        out.append(
            {
                "id": spec["id"],
                "num": spec["num"],
                "x_col": x_col,
                "y_col": y_col,
                "x_label": spec["x_label"],
                "y_label": spec["y_label"],
                "justification": spec["justification"],
                "available": bool(x_col and y_col),
            }
        )
    return out


def _loess_curve(x: np.ndarray, y: np.ndarray, n_grid: int = 80, frac: float = 0.65) -> Dict[str, List[float]]:
    """Suavizador LOESS (regresión local ponderada)."""
    x_arr = np.asarray(x, dtype=float)
    y_arr = np.asarray(y, dtype=float)
    mask = np.isfinite(x_arr) & np.isfinite(y_arr)
    x_arr = x_arr[mask]
    y_arr = y_arr[mask]
    n = len(x_arr)
    if n < 4:
        return {"x": [], "y": []}
    order = np.argsort(x_arr)
    x_arr = x_arr[order]
    y_arr = y_arr[order]
    r = max(2, int(np.ceil(frac * n)))
    x_out = np.linspace(float(x_arr.min()), float(x_arr.max()), n_grid)
    y_out = np.empty(n_grid)
    for i, x0 in enumerate(x_out):
        dist = np.abs(x_arr - x0)
        h = float(np.sort(dist)[min(r, n - 1)])
        if h <= 0:
            h = 1e-12
        w = np.clip(1 - (dist / h) ** 3, 0, None) ** 3
        if w.sum() < 1e-12:
            y_out[i] = float(np.mean(y_arr))
            continue
        b1, b0 = np.polyfit(x_arr, y_arr, deg=1, w=w)
        y_out[i] = b1 * x0 + b0
    return {"x": [_safe_round(v, 4) for v in x_out], "y": [_safe_round(v, 4) for v in y_out]}


def _linear_fit(x: np.ndarray, y: np.ndarray) -> Dict[str, Any]:
    """Regresión lineal simple (y = slope*x + intercept). Devuelve la recta y R²."""
    x_arr = np.asarray(x, dtype=float)
    y_arr = np.asarray(y, dtype=float)
    mask = np.isfinite(x_arr) & np.isfinite(y_arr)
    x_arr = x_arr[mask]
    y_arr = y_arr[mask]
    n = len(x_arr)
    if n < 3:
        return {"x": [], "y": [], "slope": None, "intercept": None, "r_squared": None}
    slope, intercept = float(np.polyfit(x_arr, y_arr, 1)[0]), float(np.polyfit(x_arr, y_arr, 1)[1])
    x_line = np.array([float(x_arr.min()), float(x_arr.max())])
    y_line = slope * x_line + intercept
    ss_res = float(np.sum((y_arr - (slope * x_arr + intercept)) ** 2))
    ss_tot = float(np.sum((y_arr - y_arr.mean()) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else None
    return {
        "x": [_safe_round(v, 4) for v in x_line],
        "y": [_safe_round(v, 4) for v in y_line],
        "slope": _safe_round(slope, 4),
        "intercept": _safe_round(intercept, 4),
        "r_squared": _safe_round(r_squared, 4) if r_squared is not None else None,
    }


def _scatter_correlation_payload(
    df: pd.DataFrame, x_col: str, y_col: str, color_col: str
) -> Dict[str, Any]:
    if x_col not in df.columns or y_col not in df.columns:
        raise HTTPException(status_code=404, detail="Variables no encontradas en el dataset")
    if color_col not in df.columns:
        raise HTTPException(status_code=404, detail="Variable de coloración (condición) no encontrada")
    sub = df[[x_col, y_col, color_col]].copy()
    sub[x_col] = _series_numeric(sub[x_col])
    sub[y_col] = _series_numeric(sub[y_col])
    sub[color_col] = sub[color_col].astype(str).replace({"": "(vacío)", "nan": "(vacío)", "None": "(vacío)"})
    sub = sub.dropna(subset=[x_col, y_col])
    n = len(sub)
    if n < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Muestra insuficiente para correlación (n={n}; se requieren al menos 3 pares)",
        )
    pair_stats = _compute_pair_correlation(sub[x_col], sub[y_col])
    points = [
        {
            "x": _safe_round(float(row[x_col]), 4),
            "y": _safe_round(float(row[y_col]), 4),
            "group": str(row[color_col]),
        }
        for _, row in sub.iterrows()
    ]
    loess = _loess_curve(sub[x_col].values, sub[y_col].values)
    linear = _linear_fit(sub[x_col].values, sub[y_col].values)
    groups = sorted({p["group"] for p in points})
    return {
        "x_col": x_col,
        "y_col": y_col,
        "color_col": color_col,
        "x_label": x_col,
        "y_label": y_col,
        "spearman": pair_stats["spearman"],
        "pearson": pair_stats["pearson"],
        "correlation": {
            "method": pair_stats.get("method"),
            "r": pair_stats.get("r"),
            "p_value": pair_stats.get("p_value"),
            "n": pair_stats.get("n"),
        },
        "points": points,
        "loess": loess,
        "linear_fit": linear,
        "groups": groups,
    }


def _build_correlation_presets(cols: List[str], numeric: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for spec in CORRELATION_PRESET_SPECS:
        matched = [c for c in _match_columns(spec["patterns"], cols) if c in numeric]
        if len(matched) >= 2:
            out.append(
                {
                    "id": spec["id"],
                    "label": spec["label"],
                    "info": spec["info"],
                    "columns": matched,
                }
            )
    return out


def _norm_col(name: str) -> str:
    s = str(name).strip().lower()
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s


def _column_pattern_match(nc: str, key: str) -> bool:
    """Evita falsos positivos (p. ej. columna ID dentro de «trigliceridos»)."""
    if not key or not nc:
        return False
    if nc == key:
        return True
    if nc.startswith(key + "_") or nc.endswith("_" + key):
        return True
    if ("_" + key + "_") in ("_" + nc + "_"):
        return True
    if len(key) >= 5 and key in nc:
        return True
    return False


def _match_columns_ordered(patterns: List[str], available: List[str]) -> List[str]:
    """Como _match_columns pero respeta el orden de patterns."""
    out: List[str] = []
    used = set()
    for pattern in patterns:
        key = _norm_col(pattern)
        if not key:
            continue
        for col in available:
            if col in used:
                continue
            nc = _norm_col(col)
            if _column_pattern_match(nc, key):
                out.append(col)
                used.add(col)
                break
    return out


def _match_columns(requested: List[str], available: List[str]) -> List[str]:
    """Coincide por nombre exacto o si el patrón aparece en el nombre de columna (p. ej. estatura → Estatura_cm)."""
    out: List[str] = []
    for col in available:
        nc = _norm_col(col)
        for r in requested:
            key = _norm_col(r)
            if not key:
                continue
            if nc == key or nc.startswith(key + "_") or nc.endswith("_" + key) or ("_" + key + "_") in ("_" + nc + "_"):
                if col not in out:
                    out.append(col)
                break
    return out


def _get_df(dataset_id: str) -> Tuple[pd.DataFrame, Dict[str, str], Dict[str, Any]]:
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


def _detect_weight_column(df: pd.DataFrame, types: Dict[str, str]) -> Optional[str]:
    cols = [str(c) for c in df.columns]
    for alias in WEIGHT_GROUP_ALIASES:
        matched = _match_columns([alias], cols)
        if matched:
            return matched[0]
    for col in cols:
        if not _is_numeric_type(types.get(col, "")):
            sample = df[col].astype(str).str.lower().unique()[:20]
            joined = " ".join(sample)
            if any(k in joined for k in ("normopeso", "sobrepeso", "obesidad", "obeso", "eutrof")):
                return col
    return None


def _safe_round(v: Any, nd: int = 4) -> Any:
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    try:
        return round(float(v), nd)
    except (TypeError, ValueError):
        return v


def _numeric_summary(series: pd.Series) -> Dict[str, Any]:
    s = _series_numeric(series).dropna()
    n = int(len(s))
    if n == 0:
        return {"n": 0}
    q1, med, q3 = s.quantile([0.25, 0.5, 0.75])
    iqr = float(q3 - q1)
    return {
        "n": n,
        "mean": _safe_round(s.mean()),
        "median": _safe_round(med),
        "std": _safe_round(s.std(ddof=1)) if n > 1 else 0,
        "variance": _safe_round(s.var(ddof=1)) if n > 1 else 0,
        "min": _safe_round(s.min()),
        "max": _safe_round(s.max()),
        "q1": _safe_round(q1),
        "q3": _safe_round(q3),
        "iqr": _safe_round(iqr),
    }


def _histogram_payload(series: pd.Series, bins: int = 12) -> Dict[str, Any]:
    s = _series_numeric(series).dropna()
    if len(s) < 2:
        return {"bin_labels": [], "counts": [], "density_curve": {"x": [], "y": []}}
    counts, edges = np.histogram(s, bins=min(bins, max(5, int(np.sqrt(len(s))))))
    centers = ((edges[:-1] + edges[1:]) / 2).tolist()
    labels = [f"{edges[i]:.2g}–{edges[i+1]:.2g}" for i in range(len(edges) - 1)]
    mu, sigma = float(s.mean()), float(s.std(ddof=1)) or 1e-9
    xs = np.linspace(float(s.min()), float(s.max()), 80)
    ys = (
        (1 / (sigma * np.sqrt(2 * np.pi)))
        * np.exp(-0.5 * ((xs - mu) / sigma) ** 2)
        * len(s)
        * (edges[1] - edges[0])
    )
    return {
        "bin_labels": labels,
        "bin_centers": [_safe_round(x) for x in centers],
        "counts": [int(c) for c in counts],
        "density_curve": {"x": [_safe_round(x) for x in xs], "y": [_safe_round(y, 6) for y in ys]},
    }


def _boxplot_groups(
    df: pd.DataFrame,
    value_col: str,
    group_col: Optional[str] = None,
    include_points: bool = True,
) -> List[Dict[str, Any]]:
    groups: List[Dict[str, Any]] = []
    if group_col and group_col in df.columns:
        for gval, sub in df.groupby(group_col, dropna=False):
            label = str(gval) if pd.notna(gval) and str(gval) != "" else "(vacío)"
            groups.append(_box_one(_series_numeric(sub[value_col]), label, include_points))
    else:
        groups.append(_box_one(_series_numeric(df[value_col]), "Total", include_points))
    return groups


def _box_one(s: pd.Series, label: str, include_points: bool) -> Dict[str, Any]:
    s = s.dropna()
    if len(s) == 0:
        return {"label": label, "n": 0}
    q1, med, q3 = s.quantile([0.25, 0.5, 0.75])
    iqr = float(q3 - q1)
    low = float(max(s.min(), q1 - 1.5 * iqr))
    high = float(min(s.max(), q3 + 1.5 * iqr))
    pts = []
    if include_points:
        for i, (idx, val) in enumerate(s.items()):
            pts.append({"x": label, "y": _safe_round(val), "idx": int(i)})
    return {
        "label": label,
        "n": int(len(s)),
        "q1": _safe_round(q1),
        "median": _safe_round(med),
        "q3": _safe_round(q3),
        "low": _safe_round(low),
        "high": _safe_round(high),
        "values": [_safe_round(x) for x in s.tolist()],
        "points": pts,
    }


def _freq_table(series: pd.Series, column: Optional[str] = None) -> List[Dict[str, Any]]:
    col = column or (str(series.name) if series.name is not None else None)
    labels = [_categorical_label(v, col) for v in series]
    s = pd.Series(labels)
    total = len(s)
    vc = s.value_counts(dropna=False)
    items = list(vc.items())
    if col and _is_percentil_imc_column(col):
        order = {label: score for label, score, _ in PERCENTIL_IMC_STEPS}
        items.sort(key=lambda item: (order.get(item[0], 999.0), item[0]))
    rows = []
    for cat, cnt in items:
        pct = (cnt / total * 100) if total else 0
        rows.append({"category": str(cat), "count": int(cnt), "percent": _safe_round(pct, 2)})
    return rows


def _crosstab_rows(df: pd.DataFrame, col: str, group_by: str) -> Dict[str, Any]:
    if col not in df.columns or group_by not in df.columns:
        raise HTTPException(status_code=400, detail="Columna no encontrada")
    sub = df[[col, group_by]].copy()
    sub[col] = [_categorical_label(v, col) for v in sub[col]]
    sub[group_by] = [_categorical_label(v, group_by) for v in sub[group_by]]
    ct = pd.crosstab(sub[group_by], sub[col], margins=False)
    ct_pct = pd.crosstab(sub[group_by], sub[col], normalize="index") * 100
    groups = []
    for g in ct.index:
        cells = []
        for c in ct.columns:
            cells.append(
                {
                    "category": str(c),
                    "count": int(ct.loc[g, c]),
                    "row_percent": _safe_round(ct_pct.loc[g, c], 2),
                }
            )
        groups.append({"group": str(g), "cells": cells})
    return {"groups": groups, "column_variable": col, "group_variable": group_by}


def _is_normal(series: pd.Series) -> bool:
    return bool(_assess_normality(series).get("normal"))


def _assess_normality(series: pd.Series) -> Dict[str, Any]:
    """Evalúa normalidad univariada (criterio conservador para elegir Pearson vs Spearman)."""
    s = _series_numeric(series).dropna()
    n = int(len(s))
    if n < 3:
        return {"normal": False, "p_value": None, "n": n, "test": "insufficient_n"}
    if n < 8:
        return {
            "normal": False,
            "p_value": None,
            "n": n,
            "test": "small_sample",
            "note": "n<8: prueba de normalidad poco fiable; se asume no normal",
        }
    if scipy_stats is None:
        return {
            "normal": n >= 30,
            "p_value": None,
            "n": n,
            "test": "large_n_fallback" if n >= 30 else "no_scipy",
        }
    try:
        sample = s if n <= 5000 else s.sample(5000, random_state=42)
        _, p = scipy_stats.shapiro(sample)
        p_val = float(p)
        return {
            "normal": p_val >= 0.05,
            "p_value": _safe_round(p_val, 4),
            "n": n,
            "test": "shapiro",
        }
    except Exception:
        return {"normal": False, "p_value": None, "n": n, "test": "shapiro_failed"}


def _method_for_pair(x: pd.Series, y: pd.Series) -> str:
    """Pearson si ambas variables del par son normales; si no, Spearman."""
    ax = _assess_normality(x)
    ay = _assess_normality(y)
    if ax.get("normal") and ay.get("normal"):
        return "pearson"
    return "spearman"


def _compute_pair_correlation(x: pd.Series, y: pd.Series) -> Dict[str, Any]:
    """Mismo criterio para matriz y dispersión; casos completos solo del par."""
    pair = pd.DataFrame({"x": _series_numeric(x), "y": _series_numeric(y)}).dropna()
    n = int(len(pair))
    if n < 3:
        empty = {"rho": None, "p_value": None, "n": n}
        return {
            "n": n,
            "method": None,
            "r": None,
            "p_value": None,
            "spearman": dict(empty),
            "pearson": {"r": None, "p_value": None, "n": n},
        }
    method = _method_for_pair(pair["x"], pair["y"])
    rho_s = p_s = r_p = p_p = None
    if scipy_stats is not None:
        try:
            rs = scipy_stats.spearmanr(pair["x"], pair["y"])
            rho_s = float(rs.correlation if hasattr(rs, "correlation") else rs[0])
            p_s = float(rs.pvalue if hasattr(rs, "pvalue") else rs[1])
        except Exception:
            rho_s = float(pair["x"].corr(pair["y"], method="spearman"))
        try:
            rp = scipy_stats.pearsonr(pair["x"], pair["y"])
            r_p = float(rp.correlation if hasattr(rp, "correlation") else rp[0])
            p_p = float(rp.pvalue if hasattr(rp, "pvalue") else rp[1])
        except Exception:
            r_p = float(pair["x"].corr(pair["y"], method="pearson"))
    else:
        rho_s = float(pair["x"].corr(pair["y"], method="spearman"))
        r_p = float(pair["x"].corr(pair["y"], method="pearson"))
    primary_r = r_p if method == "pearson" else rho_s
    primary_p = p_p if method == "pearson" else p_s
    return {
        "n": n,
        "method": method,
        "r": _safe_round(primary_r, 4) if primary_r is not None else None,
        "p_value": _safe_round(primary_p, 4) if primary_p is not None else None,
        "spearman": {
            "rho": _safe_round(rho_s, 4) if rho_s is not None else None,
            "p_value": _safe_round(p_s, 4) if p_s is not None else None,
            "n": n,
        },
        "pearson": {
            "r": _safe_round(r_p, 4) if r_p is not None else None,
            "p_value": _safe_round(p_p, 4) if p_p is not None else None,
            "n": n,
        },
    }


def _choose_correlation_method(normality: List[Dict[str, Any]]) -> Tuple[str, str]:
    """Pearson solo si todas las variables son normales; si no, Spearman (robusto y defendible)."""
    all_normal = bool(normality) and all(item.get("normal") for item in normality)
    if all_normal:
        return (
            "pearson",
            "Pearson: todas las variables cumplen normalidad (Shapiro-Wilk, α=0,05).",
        )
    failed = [item["variable"] for item in normality if not item.get("normal")]
    if not failed:
        return (
            "spearman",
            "Spearman: coeficiente de correlación de rangos (no exige normalidad).",
        )
    shown = ", ".join(failed[:6])
    extra = f" (+{len(failed) - 6} más)" if len(failed) > 6 else ""
    return (
        "spearman",
        "Spearman: al menos una variable no cumple normalidad o la muestra es pequeña "
        f"(Shapiro-Wilk, α=0,05). Variables: {shown}{extra}.",
    )


def _correlation_method_label(method: Optional[str]) -> str:
    if method == "pearson":
        return "Pearson (r)"
    if method == "spearman":
        return "Spearman (ρ)"
    if method == "per_pair":
        return "Mixto: Pearson o Spearman por par"
    return method or "Spearman (ρ)"


def _correlation_method_recommendation(
    *,
    n_listwise: int,
    normality: List[Dict[str, Any]],
    method: str,
    pearson_pair_count: int,
    spearman_pair_count: int,
) -> str:
    """Orientación breve para interpretar qué método es más defendible en la muestra."""
    non_normal = [item["variable"] for item in normality if not item.get("normal")]
    small_n = n_listwise < 30
    parts: List[str] = []

    if method == "pearson":
        parts.append(
            "La app aplicó Pearson en todos los pares porque Shapiro-Wilk no rechazó la normalidad "
            "(α=0,05) en cada variable."
        )
        if small_n:
            parts.append(
                f"Con n={n_listwise} la prueba de normalidad tiene poca potencia: puede no detectar "
                "asimetría u outliers (frecuentes en lípidos o triglicéridos). Revise los histogramas "
                "del expander 1.1; si hay colas largas, Spearman suele ser más prudente como método principal."
            )
        else:
            parts.append(
                "Si los diagramas de dispersión muestran relación aproximadamente lineal, Pearson es apropiado."
            )
    elif method == "spearman":
        shown = ", ".join(non_normal[:5])
        extra = f" (+{len(non_normal) - 5} más)" if len(non_normal) > 5 else ""
        parts.append(
            "Spearman es apropiado aquí: al menos una variable no cumple normalidad o la muestra es muy pequeña "
            f"para fiarse del Shapiro-Wilk. Variables no normales: {shown}{extra}."
        )
    else:
        parts.append(
            f"Matriz mixta: {pearson_pair_count} par(es) con Pearson y {spearman_pair_count} con Spearman. "
            "En cada celda del heatmap, la letra P o S indica el método usado."
        )
        if small_n:
            parts.append(
                f"Con n={n_listwise}, para informes exploratorios muchos equipos reportan Spearman de forma uniforme "
                "por robustez; la app prioriza Pearson solo cuando ambas variables del par pasan normalidad."
            )

    parts.append(
        "En los diagramas de dispersión se muestran ambos coeficientes (matriz, Spearman y Pearson) para comparar."
    )
    return " ".join(parts)


def _correlation_matrix(df: pd.DataFrame, columns: List[str]) -> Dict[str, Any]:
    cols = [c for c in columns if c in df.columns]
    if len(cols) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 variables numéricas")
    num_df = df[cols].apply(_series_numeric)
    num_df = num_df.dropna(how="all")
    n_listwise = int(len(num_df.dropna(how="any")))
    if n_listwise < 3:
        pair_ns: List[int] = []
        for i, ci in enumerate(cols):
            for cj in cols[i + 1 :]:
                pair_ns.append(int(len(num_df[[ci, cj]].dropna())))
        if not pair_ns or max(pair_ns) < 3:
            raise HTTPException(
                status_code=400,
                detail="Muestra insuficiente para correlación (se requieren al menos 3 observaciones en algún par)",
            )

    normality: List[Dict[str, Any]] = []
    for c in cols:
        assessment = _assess_normality(num_df[c])
        assessment["variable"] = c
        normality.append(assessment)

    k = len(cols)
    z = [[None for _ in range(k)] for _ in range(k)]
    p_matrix = [[None for _ in range(k)] for _ in range(k)]
    n_matrix = [[None for _ in range(k)] for _ in range(k)]
    method_matrix = [[None for _ in range(k)] for _ in range(k)]
    methods_used = set()
    pearson_pair_count = 0
    spearman_pair_count = 0

    for i, ci in enumerate(cols):
        z[i][i] = 1.0
        n_matrix[i][i] = int(num_df[ci].notna().sum())
        for j in range(i + 1, k):
            cj = cols[j]
            stats = _compute_pair_correlation(num_df[ci], num_df[cj])
            z[i][j] = z[j][i] = stats.get("r")
            p_matrix[i][j] = p_matrix[j][i] = stats.get("p_value")
            n_matrix[i][j] = n_matrix[j][i] = stats.get("n")
            pair_method = stats.get("method")
            method_matrix[i][j] = method_matrix[j][i] = pair_method
            if pair_method:
                methods_used.add(pair_method)
                if pair_method == "pearson":
                    pearson_pair_count += 1
                else:
                    spearman_pair_count += 1

    pair_n_values = [n_matrix[i][j] for i in range(k) for j in range(i + 1, k) if n_matrix[i][j] is not None]
    n_min = min(pair_n_values) if pair_n_values else 0
    n_max = max(pair_n_values) if pair_n_values else 0

    if methods_used == {"pearson"}:
        method = "pearson"
        method_reason = "Todos los pares usan Pearson (ambas variables normales, Shapiro-Wilk α=0,05)."
    elif methods_used == {"spearman"}:
        method = "spearman"
        method_reason = "Todos los pares usan Spearman (normalidad no cumplida en alguna variable del par)."
    else:
        method = "per_pair"
        method_reason = (
            "Criterio por par: Pearson si ambas variables son normales; si no, Spearman. "
            "El coeficiente entre dos variables no cambia al añadir otras columnas. "
            "Cada celda usa su propio n (casos con dato en ambas variables)."
        )

    sig = [
        [bool(i != j and p_matrix[i][j] is not None and p_matrix[i][j] < 0.05) for j in range(k)]
        for i in range(k)
    ]
    normal_count = sum(1 for item in normality if item.get("normal"))
    recommendation = _correlation_method_recommendation(
        n_listwise=n_listwise,
        normality=normality,
        method=method,
        pearson_pair_count=pearson_pair_count,
        spearman_pair_count=spearman_pair_count,
    )
    return {
        "method": method,
        "method_label": _correlation_method_label(method),
        "method_reason": method_reason,
        "recommendation": recommendation,
        "normality": normality,
        "normal_count": normal_count,
        "variable_count": len(cols),
        "labels": cols,
        "matrix": z,
        "p_matrix": p_matrix,
        "n_matrix": n_matrix,
        "method_matrix": method_matrix,
        "pearson_pair_count": pearson_pair_count,
        "spearman_pair_count": spearman_pair_count,
        "significant": sig,
        "n": n_listwise,
        "n_listwise": n_listwise,
        "n_pair_min": n_min,
        "n_pair_max": n_max,
        "pairwise": True,
    }


_BINARY_POSITIVE = frozenset(
    {"sí", "si", "yes", "1", "true", "s", "positivo", "presente", "exclusiva", "exclusivo"}
)
_BINARY_NEGATIVE = frozenset({"no", "0", "false", "ausente", "negativo"})


def _is_percentil_imc_column(col: str) -> bool:
    norm = _norm_col(col)
    return "percentil" in norm and "imc" in norm


def _percentil_imc_token(raw: Any) -> str:
    s = str(raw or "").strip().lower()
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", "", s)
    return s


def _percentil_imc_score(raw: Any) -> Optional[float]:
    token = _percentil_imc_token(raw)
    if not token or token in ("nan", "none", "(vacio)", ""):
        return None
    for _label, score, patterns in PERCENTIL_IMC_STEPS:
        for p in patterns:
            if token == p or p in token or token in p:
                return score
    if "97" in token and (">" in token or token.startswith("p97")):
        return 5.0
    if "85" in token and "95" in token:
        return 4.0
    if "75" in token and "85" in token:
        return 3.0
    if "50" in token and "75" in token:
        return 2.0
    if "15" in token and "50" in token:
        return 1.0
    if "15" in token and ("<" in token or token.startswith("p<")):
        return 0.0
    return None


def _percentil_imc_label(score: float) -> str:
    return PERCENTIL_IMC_SCORE_TO_LABEL.get(float(score), str(score))


def _categorical_label(raw: Any, column: Optional[str] = None) -> str:
    """Etiqueta unificada para tablas/gráficos categóricos (evita duplicados por espacios o guiones)."""
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return "(vacío)"
    if column and _is_percentil_imc_column(column):
        score = _percentil_imc_score(raw)
        if score is not None:
            return _percentil_imc_label(score)
    s = str(raw).strip()
    if not s or s.lower() in ("nan", "none"):
        return "(vacío)"
    s = s.replace("–", "-").replace("—", "-")
    s = re.sub(r"\s+", " ", s)
    return s


def _resolve_pcp_outcome_column(
    spec: Dict[str, Any],
    cols: List[str],
    numeric: List[str],
) -> Optional[str]:
    if spec.get("use_percentil_column"):
        # No usar _match_columns_ordered: el patrón "percentil_imc" haría match erróneo con "IMC"
        # (porque "imc" está contenido en "percentil_imc").
        pct_cols = [c for c in cols if _is_percentil_imc_column(c)]
        return pct_cols[0] if pct_cols else None
    ordered = _match_columns_ordered(spec.get("patterns", []), numeric)
    return ordered[0] if ordered else None


def _pcp_outcome_label(col: str) -> str:
    norm = _norm_col(col)
    best_key = ""
    best_label = ""
    for key, label in PCP_OUTCOME_LABELS.items():
        if key == norm or key in norm:
            if len(key) > len(best_key):
                best_key = key
                best_label = label
    if best_label:
        return best_label
    return str(col)


def _pcp_clinical_high_threshold(col: str, kind: str) -> Optional[Dict[str, Any]]:
    """Umbral inferior del estado «alto» (OMS / NHLBI / ATP III) para línea de referencia en el PCP."""
    norm = _norm_col(col)
    if _is_percentil_imc_column(col) or kind == "ordinal":
        return {
            "value": 4.0,
            "label": "Sobrepeso P≥85 (OMS)",
            "reference": "Inicio banda P85-P95 en eje ordinal",
            "direction": "above_risk",
        }
    if "triglicer" in norm:
        return {
            "value": 100.0,
            "label": "Alto ≥100 mg/dL",
            "reference": "NHLBI pediátrico 2-9 años",
            "direction": "above_risk",
        }
    if "no_hdl" in norm:
        return {"value": 145.0, "label": "Alto ≥145 mg/dL", "reference": "NHLBI", "direction": "above_risk"}
    if "hdl" in norm and "ldl" not in norm and "vldl" not in norm:
        return {
            "value": 40.0,
            "label": "Bajo <40 (riesgo)",
            "reference": "ATP III / NHLBI",
            "direction": "below_risk",
        }
    if "colesterol_total" in norm and "hdl" not in norm:
        return {"value": 200.0, "label": "Alto ≥200 mg/dL", "reference": "NHLBI", "direction": "above_risk"}
    if norm == "ldl_colesterol" or norm == "ldl":
        return {"value": 130.0, "label": "Alto ≥130 mg/dL", "reference": "NHLBI", "direction": "above_risk"}
    if "glucosa" in norm:
        return {"value": 126.0, "label": "Alto ≥126 mg/dL", "reference": "Confirmación clínica", "direction": "above_risk"}
    if "vldl" in norm:
        return {"value": 40.0, "label": "Elevada ≥40", "reference": "Derivada TG/5", "direction": "above_risk"}
    return None


def _pcp_outcome_range(col: str, vals: List[float]) -> Tuple[float, float]:
    y_min = float(min(vals))
    y_max = float(max(vals))
    pad = max((y_max - y_min) * 0.06, 1.0)
    norm = _norm_col(col)
    if "triglicer" in norm:
        hi = max(300.0, math.ceil((y_max + pad) / 50.0) * 50.0)
        return 0.0, hi
    if "glucosa" in norm:
        lo = max(0.0, math.floor((y_min - pad) / 10.0) * 10.0)
        hi = math.ceil((y_max + pad) / 10.0) * 10.0
        return lo, hi
    lo = math.floor((y_min - pad) / 10.0) * 10.0
    hi = math.ceil((y_max + pad) / 10.0) * 10.0
    if hi <= lo:
        hi = lo + 10.0
    return float(lo), float(hi)


def _is_sort_value_clinically_adverse(sort_col: str, sort_val: float) -> Tuple[bool, Optional[str]]:
    """¿El valor del marcador seleccionado (fila) está fuera del rango clínico normal?"""
    if sort_val is None or (isinstance(sort_val, float) and math.isnan(sort_val)):
        return False, None
    kind = "ordinal" if _is_percentil_imc_column(sort_col) else "continuous"
    thr = _pcp_clinical_high_threshold(sort_col, kind)
    if not thr:
        return False, None
    v = float(sort_val)
    tv = float(thr["value"])
    if thr.get("direction") == "below_risk":
        flag = v < tv
    else:
        flag = v >= tv
    return flag, (thr.get("label") if flag else None)


def _is_adverse_event_present(col: str, binary_val: Optional[float]) -> Optional[int]:
    if binary_val is None:
        return None
    norm = _norm_col(col)
    if norm in ADVERSITY_INVERTED_COLS:
        return 1 if binary_val < 0.5 else 0
    return 1 if binary_val >= 0.5 else 0


def _heatmap_raw_display(val: Any) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return "(vacío)"
    s = str(val).strip()
    return s if s else "(vacío)"


def _heatmap_sort_series(df: pd.DataFrame, col: str) -> pd.Series:
    if _is_percentil_imc_column(col):
        return df[col].map(_percentil_imc_score)
    return _series_numeric(df[col])


def _heatmap_sort_display(val: Any, col: str) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return ""
    if _is_percentil_imc_column(col):
        try:
            return _percentil_imc_label(float(val))
        except (TypeError, ValueError):
            return str(val)
    try:
        v = float(val)
        if abs(v - round(v)) < 1e-6:
            return str(int(round(v)))
        return str(_safe_round(v, 1))
    except (TypeError, ValueError):
        return str(val)


def _resolve_id_column(df: pd.DataFrame) -> Optional[str]:
    for col in df.columns:
        if _norm_col(col) == "id":
            return str(col)
    return None


def _format_id_value(val: Any) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return ""
    if isinstance(val, float) and abs(val - round(val)) < 1e-6:
        return str(int(round(val)))
    return str(val).strip()


def _heatmap_sort_options(cols: List[str], numeric: List[str]) -> List[str]:
    out: List[str] = []
    used: set = set()
    patterns: List[str] = []
    seen: set = set()
    for p in ["trigliceridos"] + DEFAULT_LIPID + ["imc", "percentil_imc"]:
        k = _norm_col(p)
        if k and k not in seen:
            patterns.append(p)
            seen.add(k)
    for pattern in patterns:
        key = _norm_col(pattern)
        for col in cols:
            if col in used:
                continue
            nc = _norm_col(col)
            if not _column_pattern_match(nc, key):
                continue
            if col in numeric or _is_percentil_imc_column(col):
                out.append(col)
                used.add(col)
            break
    return out


def _perinatal_adversity_heatmap_payload(df: pd.DataFrame, sort_col: str) -> Dict[str, Any]:
    cols_all = [str(c) for c in df.columns]
    event_cols = _match_columns_ordered(PCP_DICHOTOMOUS, cols_all)
    if len(event_cols) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 variables de eventos perinatales")
    if sort_col not in df.columns:
        raise HTTPException(status_code=404, detail=f"Variable de orden '{sort_col}' no encontrada")
    sort_series = _heatmap_sort_series(df, sort_col)
    id_col = _resolve_id_column(df)
    column_labels = [PCP_DICHOTOMOUS_LABELS.get(_norm_col(c), c) for c in event_cols]
    records: List[Dict[str, Any]] = []
    for pos, (_, row) in enumerate(df.iterrows()):
        sort_val = sort_series.iat[pos] if pos < len(sort_series) else None
        if sort_val is None or (isinstance(sort_val, float) and math.isnan(sort_val)):
            continue
        events: List[int] = []
        event_raw: List[str] = []
        skip = False
        for c in event_cols:
            raw = row[c]
            b = _to_binary_value(raw)
            adv = _is_adverse_event_present(c, b)
            if adv is None:
                skip = True
                break
            events.append(int(adv))
            event_raw.append(_heatmap_raw_display(raw))
        if skip:
            continue
        child_id = _format_id_value(row[id_col]) if id_col else ""
        if not child_id:
            child_id = f"#{len(records) + 1}"
        sort_display = _heatmap_sort_display(sort_val, sort_col)
        sort_abnormal, sort_abnormal_label = _is_sort_value_clinically_adverse(sort_col, float(sort_val))
        records.append(
            {
                "child_id": child_id,
                "sort_value": float(sort_val),
                "sort_display": sort_display,
                "sort_abnormal": bool(sort_abnormal),
                "sort_abnormal_label": sort_abnormal_label,
                "events": events,
                "event_raw": event_raw,
                "n_adverse": int(sum(events)),
            }
        )
    if len(records) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Muestra insuficiente con datos completos (n={len(records)}; se requieren al menos 3)",
        )
    records.sort(key=lambda r: r["sort_value"])
    matrix = [r["events"] for r in records]
    display_matrix: List[List[int]] = []
    for r in records:
        row_disp: List[int] = []
        abnormal = r.get("sort_abnormal")
        for ev in r["events"]:
            if ev == 1 and abnormal:
                row_disp.append(2)
            elif ev == 1:
                row_disp.append(1)
            else:
                row_disp.append(0)
        display_matrix.append(row_disp)
    row_labels = [r["child_id"] + " · " + r["sort_display"] for r in records]
    raw_matrix = [r["event_raw"] for r in records]
    sort_thr = _pcp_clinical_high_threshold(
        sort_col, "ordinal" if _is_percentil_imc_column(sort_col) else "continuous"
    )
    n_combined = sum(1 for row in display_matrix for v in row if v == 2)
    return {
        "matrix": matrix,
        "display_matrix": display_matrix,
        "row_labels": row_labels,
        "column_labels": column_labels,
        "raw_matrix": raw_matrix,
        "row_meta": [
            {
                "sort_abnormal": r.get("sort_abnormal"),
                "sort_abnormal_label": r.get("sort_abnormal_label"),
            }
            for r in records
        ],
        "event_columns": event_cols,
        "sort_column": sort_col,
        "sort_label": _pcp_outcome_label(sort_col) if not _is_percentil_imc_column(sort_col) else "Categoría percentil IMC (OMS)",
        "sort_threshold": sort_thr,
        "sort_ascending": True,
        "n": len(records),
        "max_adverse": len(event_cols),
        "n_combined_adverse": n_combined,
        "legend": {
            "0": "Sin factor materno adverso en esa columna",
            "1": "Factor materno presente (Sí) — evento perinatal",
            "2": "Factor materno (Sí) y marcador del niño fuera de rango clínico",
        },
    }


def _resolve_imc_radar_column(cols: List[str]) -> Optional[str]:
    for col in cols:
        if _norm_col(col) == "imc":
            return col
    return None


def _resolve_hdl_radar_column(cols: List[str]) -> Optional[str]:
    for col in cols:
        nc = _norm_col(col)
        if "hdl" in nc and "ldl" not in nc and "no_hdl" not in nc and "vldl" not in nc:
            return col
    ordered = _match_columns_ordered(["hdl_colesterol", "hdl"], cols)
    return ordered[0] if ordered else None


def _resolve_radar_metrics(cols: List[str]) -> List[Dict[str, Any]]:
    metrics: List[Dict[str, Any]] = []
    for spec in RADAR_METRIC_SPECS:
        col: Optional[str] = None
        if spec["id"] == "imc":
            col = _resolve_imc_radar_column(cols)
        elif spec.get("inverse_hdl"):
            col = _resolve_hdl_radar_column(cols)
        else:
            matched = _match_columns_ordered(spec.get("patterns", []), cols)
            col = matched[0] if matched else None
        if col:
            metrics.append(
                {
                    "id": spec["id"],
                    "column": col,
                    "label": spec["label"],
                    "inverse_hdl": bool(spec.get("inverse_hdl")),
                }
            )
    return metrics


def _build_radar_feature_frame(df: pd.DataFrame, metrics: List[Dict[str, Any]]) -> pd.DataFrame:
    out: Dict[str, pd.Series] = {}
    for m in metrics:
        col = m["column"]
        if m.get("inverse_hdl"):
            hdl = _series_numeric(df[col])
            out[m["id"]] = 1.0 / hdl.where(hdl > 0)
        else:
            out[m["id"]] = _series_numeric(df[col])
    return pd.DataFrame(out)


def _pooled_zscore_frame(frame: pd.DataFrame) -> pd.DataFrame:
    z = pd.DataFrame(index=frame.index)
    for col in frame.columns:
        s = frame[col]
        valid = s.dropna()
        if len(valid) < 2:
            z[col] = np.nan
            continue
        mu = float(valid.mean())
        sd = float(valid.std(ddof=1))
        if sd < 1e-9:
            z[col] = 0.0
        else:
            z[col] = (s - mu) / sd
    return z


def _binary_group_mask(binary: pd.Series, positive: bool) -> pd.Series:
    if positive:
        return (binary >= 0.5) & binary.notna()
    return (binary < 0.5) & binary.notna()


def _category_group_mask(
    raw: pd.Series,
    tokens: List[str],
    exclude: Optional[List[str]] = None,
) -> pd.Series:
    exclude = exclude or []
    flags: List[bool] = []
    for val in raw:
        if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
            flags.append(False)
            continue
        s = _norm_col(str(val))
        if any(ex in s for ex in exclude):
            flags.append(False)
            continue
        flags.append(any(tok in s for tok in tokens))
    return pd.Series(flags, index=raw.index)


def _build_radar_compare_presets(cols: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for preset in PERINATAL_RADAR_COMPARE_SPECS:
        matched = _match_columns_ordered(preset.get("patterns", []), cols)
        if not matched:
            continue
        out.append(
            {
                "id": preset["id"],
                "column": matched[0],
                "title": preset.get("title", matched[0]),
                "series": [{"label": s["label"]} for s in preset.get("series", [])],
                "available": True,
            }
        )
    return out


def _radar_compare_payload(df: pd.DataFrame, comparison_id: str) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    preset = next((p for p in PERINATAL_RADAR_COMPARE_SPECS if p["id"] == comparison_id), None)
    if not preset:
        raise HTTPException(status_code=400, detail=f"Comparación '{comparison_id}' no reconocida")
    group_cols = _match_columns_ordered(preset.get("patterns", []), cols)
    if not group_cols:
        raise HTTPException(status_code=404, detail="Variable de agrupación no encontrada en la base")
    group_col = group_cols[0]
    metrics = _resolve_radar_metrics(cols)
    if len(metrics) < 3:
        raise HTTPException(
            status_code=400,
            detail="Faltan variables para el radar (se requieren al menos 3 de: Colesterol Total, HDL, VLDL, No-HDL, Glucosa, Triglicéridos, LDL)",
        )
    features = _build_radar_feature_frame(df, metrics)
    complete = features.dropna(how="any")
    if len(complete) < MIN_RADAR_GROUP_N * 2:
        raise HTTPException(
            status_code=400,
            detail=f"Datos insuficientes con valores completos en todas las variables (n={len(complete)})",
        )
    z = _pooled_zscore_frame(complete)
    group_raw = df.loc[complete.index, group_col]
    binary = group_raw.map(_to_binary_value)
    axes = [
        {
            "id": m["id"],
            "label": m["label"],
            "column": m["column"],
            "description": RADAR_AXIS_DESCRIPTIONS.get(m["id"], m["label"]),
            "inverse_hdl": bool(m.get("inverse_hdl")),
        }
        for m in metrics
    ]
    axis_ids = [m["id"] for m in metrics]
    series_out: List[Dict[str, Any]] = []
    for sdef in preset.get("series", []):
        if sdef.get("category_tokens"):
            mask = _category_group_mask(
                group_raw,
                list(sdef.get("category_tokens") or []),
                list(sdef.get("category_exclude") or []),
            )
        else:
            mask = _binary_group_mask(binary, bool(sdef.get("positive")))
        sub = z.loc[mask.fillna(False)]
        n = int(len(sub))
        if n < MIN_RADAR_GROUP_N:
            raise HTTPException(
                status_code=400,
                detail=f"Grupo «{sdef.get('label', '')}» con muestra insuficiente (n={n}; mínimo {MIN_RADAR_GROUP_N})",
            )
        means = sub.mean(axis=0, skipna=True)
        series_out.append(
            {
                "name": str(sdef.get("label", "")),
                "adverse": bool(sdef.get("adverse")),
                "n": n,
                "values": [_safe_round(float(means[a]), 3) if a in means and pd.notna(means[a]) else None for a in axis_ids],
            }
        )
    return {
        "comparison_id": comparison_id,
        "comparison_title": preset.get("title", comparison_id),
        "group_column": group_col,
        "axes": axes,
        "series": series_out,
        "n_complete": int(len(complete)),
        "standardization": "z en cohorte (media 0, DE 1)",
        "interpretation": {
            "intro": (
                "Cada polígono resume el perfil metabólico-antropométrico medio de un grupo "
                f"(comparación: {preset.get('title', comparison_id)}), usando solo niños con datos "
                "completos en los cinco marcadores."
            ),
            "radial": (
                "La distancia al centro (radio) es la media del grupo en puntaje z estandarizado "
                "sobre toda la cohorte analizada: 0 ≈ promedio global; valores positivos, por encima "
                "del promedio; negativos, por debajo. No es el valor clínico en mg/dL ni en kg/m²."
            ),
            "angular": (
                "Cada spoke del radar es un marcador del niño. Al pasar el cursor, la letra griega θ "
                "(theta) indica el nombre de ese eje; r es la media z en esa variable para el grupo del polígono."
            ),
            "hdl_inv": RADAR_AXIS_DESCRIPTIONS["hdl_inv"],
            "series_reference": "Polígono azul: grupo de referencia (condición no adversa o favorable).",
            "series_adverse": "Polígono rojo: grupo con evento o condición perinatal/materna adversa.",
            "tooltip_note": (
                "En el tooltip: «z» = media estandarizada del grupo en esa variable; "
                "no confundir con el valor bruto del laboratorio."
            ),
        },
        "result_narrative": _build_radar_result_narrative(series_out, axes),
    }


MIN_DENSITY_GROUP_N = 3
DENSITY_GRID_POINTS = 128


def _stratify_preset_for_column(col: str) -> Dict[str, Any]:
    nid = _norm_col(col)
    for preset in PERINATAL_RADAR_COMPARE_SPECS:
        if preset.get("id") == nid:
            return preset
    title = PCP_DICHOTOMOUS_LABELS.get(nid, col)
    return _radar_dichot_preset(nid, title)


def _build_density_stratify_options(cols: List[str]) -> List[Dict[str, Any]]:
    return _build_radar_compare_presets(cols)


def _density_group_masks(df: pd.DataFrame, stratify_col: str, preset: Dict[str, Any]) -> List[Dict[str, Any]]:
    group_raw = df[stratify_col]
    binary = group_raw.map(_to_binary_value)
    out: List[Dict[str, Any]] = []
    for sdef in preset.get("series", []):
        if sdef.get("category_tokens"):
            mask = _category_group_mask(
                group_raw,
                list(sdef.get("category_tokens") or []),
                list(sdef.get("category_exclude") or []),
            )
        else:
            mask = _binary_group_mask(binary, bool(sdef.get("positive")))
        out.append(
            {
                "label": str(sdef.get("label", "")),
                "adverse": bool(sdef.get("adverse")),
                "mask": mask,
            }
        )
    return out


def _child_variable_label(col: str) -> str:
    if _is_percentil_imc_column(col):
        return "Categoría percentil IMC (OMS)"
    return _pcp_outcome_label(col)


def _resolve_density_value_column(requested: str, cols: List[str]) -> Optional[str]:
    if _norm_col(requested) == "imc":
        return _resolve_imc_radar_column(cols)
    if requested in cols:
        return requested
    matched = _match_columns_ordered([requested], cols)
    return matched[0] if matched else None


def _kde_density_curve(values: np.ndarray, n_grid: int = DENSITY_GRID_POINTS) -> Tuple[List[float], List[float]]:
    arr = np.asarray(values, dtype=float)
    arr = arr[np.isfinite(arr)]
    if len(arr) < MIN_DENSITY_GROUP_N:
        return [], []
    lo = float(np.min(arr))
    hi = float(np.max(arr))
    pad = max((hi - lo) * 0.12, 1e-6)
    xs = np.linspace(lo - pad, hi + pad, n_grid)
    if scipy_stats is not None and len(arr) >= MIN_DENSITY_GROUP_N:
        try:
            kde = scipy_stats.gaussian_kde(arr)
            dens = np.asarray(kde(xs), dtype=float)
        except Exception:
            dens = np.zeros_like(xs)
    else:
        counts, edges = np.histogram(arr, bins=min(24, max(8, len(arr) // 2)), density=True)
        mids = (edges[:-1] + edges[1:]) / 2.0
        dens = np.interp(xs, mids, counts, left=0.0, right=0.0)
    dens = np.maximum(dens, 0.0)
    peak = float(np.max(dens)) if len(dens) else 0.0
    if peak > 1e-12:
        dens = dens / peak
    return [_safe_round(float(x), 3) for x in xs], [_safe_round(float(d), 4) for d in dens]


def _conditional_density_payload(df: pd.DataFrame, stratify_col: str, value_col: str) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    if stratify_col not in df.columns:
        raise HTTPException(status_code=404, detail=f"Variable de estratificación '{stratify_col}' no encontrada")
    if value_col not in df.columns:
        raise HTTPException(status_code=404, detail=f"Variable del niño '{value_col}' no encontrada")
    preset = _stratify_preset_for_column(stratify_col)
    group_defs = _density_group_masks(df, stratify_col, preset)
    if len(group_defs) < 2:
        raise HTTPException(status_code=400, detail="Se requieren dos grupos para la densidad condicional")
    values = _series_numeric(df[value_col])
    groups_out: List[Dict[str, Any]] = []
    for gdef in group_defs:
        mask = gdef["mask"].fillna(False)
        sub = values.loc[mask]
        sub = sub[np.isfinite(sub)]
        n = int(len(sub))
        if n < MIN_DENSITY_GROUP_N:
            raise HTTPException(
                status_code=400,
                detail=f"Grupo «{gdef['label']}» con muestra insuficiente (n={n}; mínimo {MIN_DENSITY_GROUP_N})",
            )
        xs, dens = _kde_density_curve(sub.to_numpy())
        if not xs:
            raise HTTPException(
                status_code=400,
                detail=f"No se pudo estimar la densidad para «{gdef['label']}»",
            )
        groups_out.append(
            {
                "name": gdef["label"],
                "adverse": bool(gdef.get("adverse")),
                "n": n,
                "x": xs,
                "density": dens,
                "median": _safe_round(float(sub.median()), 2),
                "mean": _safe_round(float(sub.mean()), 2),
            }
        )
    strat_title = preset.get("title") or PCP_DICHOTOMOUS_LABELS.get(_norm_col(stratify_col), stratify_col)
    val_label = _child_variable_label(value_col)
    return {
        "stratify_column": stratify_col,
        "stratify_label": strat_title,
        "value_column": value_col,
        "value_label": val_label,
        "groups": groups_out,
        "density_scale": "relativa (máximo = 1 por grupo)",
    }


SCATTER_MATRIX_VAR_SPECS: List[Dict[str, Any]] = [
    {"id": "imc", "patterns": ["imc"], "label": "IMC"},
    {"id": "tg", "patterns": ["trigliceridos"], "label": "Triglicéridos"},
    {"id": "hdl", "patterns": ["hdl_colesterol", "hdl"], "label": "HDL"},
    {"id": "glucosa", "patterns": ["glucosa"], "label": "Glucosa"},
    {"id": "edad", "patterns": ["edad"], "label": "Edad"},
]

MIN_SCATTER_MATRIX_VARS = 3
MIN_SCATTER_MATRIX_GROUP_N = 3
MIN_SCATTER_MATRIX_LOESS_N = 8


def _resolve_scatter_matrix_variables(cols: List[str]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for spec in SCATTER_MATRIX_VAR_SPECS:
        col: Optional[str] = None
        if spec["id"] == "imc":
            col = _resolve_imc_radar_column(cols)
        elif spec["id"] == "hdl":
            col = _resolve_hdl_radar_column(cols)
        else:
            matched = _match_columns_ordered(spec.get("patterns", []), cols)
            col = matched[0] if matched else None
        if col:
            out.append({"id": spec["id"], "column": col, "label": spec["label"]})
    return out


def _numeric_axis_range(series: pd.Series, pad_frac: float = 0.06) -> Dict[str, float]:
    v = _series_numeric(series).dropna()
    v = v[np.isfinite(v.to_numpy())]
    if len(v) == 0:
        return {"min": 0.0, "max": 1.0}
    lo = float(v.min())
    hi = float(v.max())
    if lo == hi:
        pad = max(abs(lo) * 0.12, 1.0)
    else:
        pad = (hi - lo) * pad_frac
    return {"min": _safe_round(lo - pad, 4), "max": _safe_round(hi + pad, 4)}


def _clip_loess_to_ranges(
    loess: Dict[str, List[float]], x_rng: Dict[str, float], y_rng: Dict[str, float]
) -> Dict[str, List[float]]:
    xs_out: List[float] = []
    ys_out: List[float] = []
    for x, y in zip(loess.get("x") or [], loess.get("y") or []):
        if not (math.isfinite(x) and math.isfinite(y)):
            continue
        xs_out.append(_safe_round(float(x), 4))
        ys_out.append(
            _safe_round(float(max(y_rng["min"], min(y_rng["max"], y))), 4)
        )
    return {"x": xs_out, "y": ys_out}


def _scatter_matrix_triangle_indices(preset: Dict[str, Any]) -> Tuple[int, int]:
    """Índices (triángulo superior, triángulo inferior) en preset['series']."""
    series = preset.get("series") or []
    if len(series) < 2:
        return 0, 1
    if preset.get("id") in ADVERSITY_INVERTED_COLS:
        return 1, 0
    return 0, 1


def _conditional_scatter_matrix_payload(df: pd.DataFrame, stratify_col: str) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    if stratify_col not in df.columns:
        raise HTTPException(status_code=404, detail=f"Variable de estratificación '{stratify_col}' no encontrada")
    variables = _resolve_scatter_matrix_variables(cols)
    if len(variables) < MIN_SCATTER_MATRIX_VARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Se requieren al menos {MIN_SCATTER_MATRIX_VARS} variables continuas del niño "
                f"(IMC, triglicéridos, HDL, glucosa, edad); disponibles: {len(variables)}"
            ),
        )
    preset = _stratify_preset_for_column(stratify_col)
    group_defs = _density_group_masks(df, stratify_col, preset)
    if len(group_defs) < 2:
        raise HTTPException(status_code=400, detail="Se requieren dos grupos para la matriz de dispersión")
    upper_idx, lower_idx = _scatter_matrix_triangle_indices(preset)
    if upper_idx >= len(group_defs) or lower_idx >= len(group_defs):
        raise HTTPException(status_code=400, detail="Configuración de grupos inválida para la matriz")
    upper_def = group_defs[upper_idx]
    lower_def = group_defs[lower_idx]
    frame = pd.DataFrame({v["id"]: _series_numeric(df[v["column"]]) for v in variables})
    upper_mask = upper_def["mask"].fillna(False)
    lower_mask = lower_def["mask"].fillna(False)
    n_upper = int((upper_mask & frame.notna().all(axis=1)).sum())
    n_lower = int((lower_mask & frame.notna().all(axis=1)).sum())
    if n_upper < MIN_SCATTER_MATRIX_GROUP_N or n_lower < MIN_SCATTER_MATRIX_GROUP_N:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Muestra insuficiente por grupo (superior n={n_upper}, inferior n={n_lower}; "
                f"mínimo {MIN_SCATTER_MATRIX_GROUP_N})"
            ),
        )
    axis_ranges = {v["id"]: _numeric_axis_range(frame[v["id"]]) for v in variables}
    n_vars = len(variables)
    cells: List[Dict[str, Any]] = []
    for i in range(n_vars):
        for j in range(n_vars):
            vid_y = variables[i]["id"]
            vid_x = variables[j]["id"]
            if i == j:
                u_vals = frame.loc[upper_mask, vid_y].dropna()
                l_vals = frame.loc[lower_mask, vid_y].dropna()
                cells.append(
                    {
                        "row": i,
                        "col": j,
                        "kind": "diagonal",
                        "upper_values": [_safe_round(float(v), 4) for v in u_vals],
                        "lower_values": [_safe_round(float(v), 4) for v in l_vals],
                    }
                )
                continue
            mask = upper_mask if i < j else lower_mask
            sub = frame.loc[mask, [vid_x, vid_y]].dropna()
            points = [
                {"x": _safe_round(float(row[vid_x]), 4), "y": _safe_round(float(row[vid_y]), 4)}
                for _, row in sub.iterrows()
            ]
            loess = (
                _loess_curve(sub[vid_x].to_numpy(), sub[vid_y].to_numpy())
                if len(sub) >= MIN_SCATTER_MATRIX_LOESS_N
                else {"x": [], "y": []}
            )
            if loess.get("x"):
                loess = _clip_loess_to_ranges(loess, axis_ranges[vid_x], axis_ranges[vid_y])
            cells.append(
                {
                    "row": i,
                    "col": j,
                    "kind": "scatter",
                    "triangle": "upper" if i < j else "lower",
                    "points": points,
                    "loess": loess,
                    "n": int(len(sub)),
                }
            )
    strat_title = preset.get("title") or PCP_DICHOTOMOUS_LABELS.get(_norm_col(stratify_col), stratify_col)
    return {
        "stratify_column": stratify_col,
        "stratify_label": strat_title,
        "variables": variables,
        "upper": {
            "label": upper_def["label"],
            "adverse": bool(upper_def.get("adverse")),
            "n": n_upper,
        },
        "lower": {
            "label": lower_def["label"],
            "adverse": bool(lower_def.get("adverse")),
            "n": n_lower,
        },
        "cells": cells,
        "axis_ranges": axis_ranges,
        "n_complete": int(frame.dropna(how="any").shape[0]),
        "layout_hint": "Triángulo superior: grupo superior; triángulo inferior: grupo inferior; diagonal: distribución marginal",
    }


def _to_binary_value(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s or s in ("nan", "none", "(vacío)"):
        return None
    if s in _BINARY_POSITIVE or s.startswith("sí") or s.startswith("si "):
        return 1.0
    if s in _BINARY_NEGATIVE:
        return 0.0
    if "lactancia" in s and ("exclus" in s or "si" in s or "sí" in s):
        return 1.0
    try:
        n = float(s.replace(",", "."))
        if n in (0.0, 1.0):
            return n
    except (TypeError, ValueError):
        pass
    return None


def _point_biserial_corr(x_bin: np.ndarray, y_cont: np.ndarray) -> float:
    mask = ~(np.isnan(x_bin) | np.isnan(y_cont))
    x = x_bin[mask].astype(float)
    y = y_cont[mask].astype(float)
    if len(x) < 5 or np.std(x) < 1e-9 or np.std(y) < 1e-9:
        return 0.0
    r = float(np.corrcoef(x, y)[0, 1])
    return r if not math.isnan(r) else 0.0


def _pcp_order_axes_by_association(
    use_cols: List[str],
    lines: List[Dict[str, Any]],
) -> Tuple[List[str], List[Dict[str, Any]]]:
    outcome_vals = np.array([ln["values"][-1] for ln in lines], dtype=float)
    scored: List[Tuple[str, float]] = []
    associations: List[Dict[str, Any]] = []
    for i, col in enumerate(use_cols):
        x = np.array([ln["values"][i] for ln in lines], dtype=float)
        r = _point_biserial_corr(x, outcome_vals)
        scored.append((col, abs(r)))
        norm = _norm_col(col)
        associations.append(
            {
                "column": col,
                "label": PCP_DICHOTOMOUS_LABELS.get(norm, col),
                "biserial_r": _safe_round(r, 4),
                "abs_r": _safe_round(abs(r), 4),
            }
        )
    scored.sort(key=lambda t: t[1], reverse=True)
    ordered = [c for c, _ in scored]
    associations.sort(key=lambda a: a["abs_r"], reverse=True)
    return ordered, associations


def _pcp_kmeans_clusters(lines: List[Dict[str, Any]], k: int = 3) -> Tuple[List[int], List[str]]:
    if len(lines) < k:
        return [0] * len(lines), PCP_CLUSTER_LABELS[:1]
    all_outcomes = [ln["values"][-1] for ln in lines]
    lo = float(min(all_outcomes))
    hi = float(max(all_outcomes))
    span = hi - lo if hi > lo else 1.0
    feats = []
    for ln in lines:
        row = list(ln["values"])
        norm_out = (row[-1] - lo) / span
        feats.append(row[:-1] + [norm_out])
    x = np.array(feats, dtype=float)
    n = x.shape[0]
    rng = np.random.default_rng(42)
    centroids = x[rng.choice(n, size=k, replace=False)].copy()
    labels = np.zeros(n, dtype=int)
    for _ in range(40):
        dists = np.linalg.norm(x[:, None, :] - centroids[None, :, :], axis=2)
        labels = np.argmin(dists, axis=1)
        new_centroids = np.array(
            [x[labels == j].mean(axis=0) if np.any(labels == j) else centroids[j] for j in range(k)]
        )
        if np.allclose(new_centroids, centroids):
            break
        centroids = new_centroids
    mean_out = [float(x[labels == j, -1].mean()) if np.any(labels == j) else 0.0 for j in range(k)]
    order = np.argsort(mean_out)
    remap = {int(old): int(new) for new, old in enumerate(order)}
    labels = np.array([remap[int(l)] for l in labels], dtype=int)
    cluster_names = [PCP_CLUSTER_LABELS[i] if i < len(PCP_CLUSTER_LABELS) else f"Cluster {i+1}" for i in range(k)]
    return [int(l) for l in labels], cluster_names


def _pcp_reindex_lines(lines: List[Dict[str, Any]], old_cols: List[str], new_cols: List[str]) -> List[Dict[str, Any]]:
    idx_map = [old_cols.index(c) for c in new_cols]
    out = []
    for ln in lines:
        vals = [ln["values"][i] for i in idx_map] + [ln["values"][-1]]
        out.append({**ln, "values": vals})
    return out


def _pcp_payload(
    df: pd.DataFrame,
    dichotomous_cols: List[str],
    outcome_col: str,
    color_col: str,
    reorder_axes: bool = True,
    compute_clusters: bool = True,
) -> Dict[str, Any]:
    if outcome_col not in df.columns:
        raise HTTPException(status_code=404, detail=f"Variable de resultado '{outcome_col}' no encontrada")
    if color_col not in df.columns:
        raise HTTPException(status_code=404, detail="Variable de condición de peso no encontrada")
    cols_all = [str(c) for c in df.columns]
    use_cols = _match_columns_ordered(PCP_DICHOTOMOUS, cols_all)
    if len(use_cols) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 variables dicotómicas disponibles")
    sub = df[use_cols + [outcome_col, color_col]].copy()
    outcome_is_percentil = _is_percentil_imc_column(outcome_col)
    outcome_raw_col = "_pcp_outcome_raw"
    if outcome_is_percentil:
        sub[outcome_raw_col] = sub[outcome_col].astype(str).str.strip()
        sub[outcome_col] = sub[outcome_raw_col].map(_percentil_imc_score)
    else:
        sub[outcome_col] = _series_numeric(sub[outcome_col])
    sub[color_col] = sub[color_col].astype(str).replace({"": "(vacío)", "nan": "(vacío)", "None": "(vacío)"})
    sub = sub.dropna(subset=[outcome_col])
    lines: List[Dict[str, Any]] = []
    for _, row in sub.iterrows():
        vals: List[float] = []
        skip = False
        for c in use_cols:
            b = _to_binary_value(row[c])
            if b is None:
                skip = True
                break
            vals.append(b)
        if skip:
            continue
        outcome_score = float(row[outcome_col])
        vals.append(outcome_score)
        line_rec: Dict[str, Any] = {"values": vals, "group": str(row[color_col])}
        if outcome_is_percentil:
            line_rec["outcome_display"] = str(row.get(outcome_raw_col, ""))
        lines.append(line_rec)
    if len(lines) < 3:
        raise HTTPException(
            status_code=400,
            detail=f"Muestra insuficiente con datos completos (n={len(lines)}; se requieren al menos 3)",
        )
    axis_associations: List[Dict[str, Any]] = []
    axis_order_method = "orden fijo del protocolo"
    if reorder_axes and len(use_cols) > 1:
        cols_before = list(use_cols)
        use_cols, axis_associations = _pcp_order_axes_by_association(use_cols, lines)
        lines = _pcp_reindex_lines(lines, cols_before, use_cols)
        axis_order_method = "correlación biserial con el marcador (mayor → menor)"
    line_clusters: List[int] = []
    cluster_labels: List[str] = []
    if compute_clusters and len(lines) >= 3:
        line_clusters, cluster_labels = _pcp_kmeans_clusters(lines, k=3)
    groups = sorted({ln["group"] for ln in lines})
    group_index = {g: i for i, g in enumerate(groups)}
    dimensions: List[Dict[str, Any]] = []
    for i, col in enumerate(use_cols):
        norm = _norm_col(col)
        label = PCP_DICHOTOMOUS_LABELS.get(norm, col)
        dimensions.append(
            {
                "label": label,
                "axis_key": norm,
                "column": col,
                "values": [ln["values"][i] for ln in lines],
                "kind": "binary",
                "range": [0, 1],
                "tickvals": [0, 1],
                "ticktext": ["0", "1"],
            }
        )
    outcome_vals = [ln["values"][-1] for ln in lines]
    if outcome_is_percentil:
        used_scores = sorted({float(v) for v in outcome_vals})
        tickvals = used_scores
        ticktext = [_percentil_imc_label(s) for s in used_scores]
        y_lo, y_hi = used_scores[0], used_scores[-1]
        outcome_kind = "ordinal"
        outcome_label = "Categoría de percentil IMC (OMS)"
    else:
        y_lo, y_hi = _pcp_outcome_range(outcome_col, outcome_vals)
        tickvals = []
        ticktext = []
        outcome_kind = "continuous"
        outcome_label = _pcp_outcome_label(outcome_col)
    outcome_dim: Dict[str, Any] = {
        "label": outcome_label,
        "axis_key": _norm_col(outcome_col),
        "column": outcome_col,
        "values": outcome_vals,
        "kind": outcome_kind,
        "range": [_safe_round(y_lo, 2), _safe_round(y_hi, 2)],
        "tickvals": tickvals,
        "ticktext": ticktext,
    }
    thr = _pcp_clinical_high_threshold(outcome_col, outcome_kind)
    if thr is not None:
        outcome_dim["clinical_high_threshold"] = thr
    dimensions.append(outcome_dim)
    lines_meta = []
    for idx, ln in enumerate(lines):
        disp = ln.get("outcome_display")
        meta = {
            "line_index": idx,
            "group": ln["group"],
            "outcome": disp if disp else _safe_round(ln["values"][-1], 2),
        }
        if line_clusters:
            meta["cluster"] = line_clusters[idx]
            meta["cluster_label"] = cluster_labels[line_clusters[idx]] if line_clusters[idx] < len(cluster_labels) else ""
        lines_meta.append(meta)
    return {
        "dichotomous_columns": use_cols,
        "outcome_column": outcome_col,
        "outcome_label": outcome_label,
        "outcome_kind": outcome_kind,
        "color_column": color_col,
        "color_groups": groups,
        "line_color": [group_index[ln["group"]] for ln in lines],
        "line_cluster": line_clusters,
        "cluster_labels": cluster_labels,
        "lines_meta": lines_meta,
        "axis_associations": axis_associations,
        "axis_order_method": axis_order_method,
        "dimensions": dimensions,
        "n": len(lines),
    }


ALLUVIAL_DEFAULT_STAGE_PATTERNS = [
    "sm_m",
    "lactancia_materna",
    "tipo_parto",
    "condicion",
]

ALLUVIAL_MAX_STAGES = 8
ALLUVIAL_MAX_CATEGORIES = 15

ALLUVIAL_BINARY_ORDER = ["Sí", "No"]
ALLUVIAL_PARTO_ORDER = ["Natural", "Cesárea"]
ALLUVIAL_WEIGHT_ORDER = ["Normopeso", "Sobrepeso", "Obesidad", "Bajo peso"]
ALLUVIAL_TERMINO_ORDER = ["Pretérmino", "Término", "Postérmino"]
ALLUVIAL_BIRTH_WEIGHT_ORDER = ["Bajo peso al nacer", "Peso normal", "Macrosomía"]
ALLUVIAL_ESCOLARIDAD_ORDER = ["Básica", "Media", "Superior"]

ALLUVIAL_FOCUS_PRESETS = [
    {
        "id": "A",
        "label": "A. Programación fetal temprana",
        "title": "Enfoque en programación fetal temprana",
        "insight": (
            "Evalúa si embarazos no normales, pretérmino o con complicaciones "
            "se asocian con mayor obesidad en el niño."
        ),
        "stage_patterns": [
            {"pattern": "curso_normal", "axis": "curso_normal (Sí/No)"},
            {"pattern": "termino", "axis": "término (Pretérmino / Término / Postérmino)"},
            {"pattern": "complicaciones", "axis": "complicaciones (Sí/No)"},
            {"pattern": "condicion", "axis": "Condición de peso del niño", "weight": True},
        ],
    },
    {
        "id": "B",
        "label": "B. Factores maternos metabólicos",
        "title": "Enfoque en factores maternos metabólicos",
        "insight": (
            "Acumulación de comorbilidades maternas (diabetes, obesidad, SM) "
            "hacia obesidad infantil; bandas anchas en varios «Sí» serían muy visuales."
        ),
        "stage_patterns": [
            {"pattern": "diabetes_m", "axis": "diabetes_m (Sí/No)"},
            {"pattern": "obes_m", "axis": "obes_m (Sí/No)"},
            {"pattern": "sm_m", "axis": "Síndrome metabólico materno (Sí/No)"},
            {"pattern": "condicion", "axis": "Condición de peso del niño", "weight": True},
        ],
    },
    {
        "id": "C",
        "label": "C. Posnatales y exposición a tóxicos",
        "title": "Enfoque en factores posnatales y exposición a tóxicos",
        "insight": (
            "Explora si la falta de lactancia y la exposición a sustancias tóxicas "
            "se asocian con obesidad en el seguimiento."
        ),
        "stage_patterns": [
            {"pattern": "lactancia_materna", "axis": "lactancia_materna (Sí/No)"},
            {"pattern": "exp_sust_tox", "axis": "exp_sust_tox (Sí/No)"},
            {"pattern": "actividad_fisica", "axis": "actividad_fisica del niño (Sí/No)"},
            {"pattern": "condicion", "axis": "Condición de peso del niño", "weight": True},
        ],
    },
    {
        "id": "D",
        "label": "D. Antecedentes familiares (padres)",
        "title": "Enfoque en antecedentes familiares paternos",
        "insight": (
            "Herencia y antecedentes paternos (obesidad, diabetes, dislipidemia) "
            "más allá de la madre."
        ),
        "stage_patterns": [
            {"pattern": "obes_p", "axis": "obes_p (obesidad paterna)"},
            {"pattern": "diabetes_p", "axis": "diabetes_p"},
            {"pattern": "hipercolesterolemia_p", "axis": "hipercolesterolemia_p"},
            {"pattern": "condicion", "axis": "Condición de peso del niño", "weight": True},
        ],
    },
    {
        "id": "E",
        "label": "E. Mixta: escolaridad, SM y peso al nacer",
        "title": "Enfoque mixto madre + nacimiento + escolaridad materna",
        "insight": (
            "Desigualdad social (escolaridad baja) asociada a síndrome metabólico materno, "
            "peso al nacer alterado y obesidad infantil."
        ),
        "stage_patterns": [
            {"pattern": "escolaridad_m", "axis": "escolaridad_m (básica / media / superior)"},
            {"pattern": "sm_m", "axis": "Síndrome metabólico materno (Sí/No)"},
            {"pattern": "peso_nacer", "axis": "peso_nacer categorizado (bajo / normal / macrosómico)"},
            {"pattern": "condicion", "axis": "Condición de peso del niño", "weight": True},
        ],
    },
]


def _to_parto_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s or s in ("nan", "none", "(vacío)"):
        return None
    if "ces" in s:
        return "Cesárea"
    if "nat" in s:
        return "Natural"
    return None


def _to_termino_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
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
    return _to_categorical_label(val)


def _to_birth_weight_category(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
        return None
    try:
        kg = float(str(val).replace(",", "."))
    except (TypeError, ValueError):
        return None
    if kg < 2.5:
        return "Bajo peso al nacer"
    if kg >= 4.0:
        return "Macrosomía"
    return "Peso normal"


def _to_escolaridad_simple_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s or s in ("nan", "none", "(vacío)"):
        return None
    if "posgrado" in s or "licenciatura" in s or "superior" in s:
        return "Superior"
    if "preparatoria" in s or "media" in s or "bachiller" in s:
        return "Media"
    if "secundaria" in s or "primaria" in s or "basica" in s or "básica" in s:
        return "Básica"
    return "Básica"


def _to_weight_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s or s in ("nan", "none", "(vacío)"):
        return None
    if "normo" in s:
        return "Normopeso"
    if "sobre" in s:
        return "Sobrepeso"
    if "obes" in s:
        return "Obesidad"
    if "bajo" in s:
        return "Bajo peso"
    return None


def _alluvial_stage_label(title: str, category: str) -> str:
    return f"{title} · {category}"


def _infer_alluvial_kind(col: str, series: pd.Series, vtype: str) -> str:
    norm = _norm_col(col)
    if any(k in norm for k in ("condicion", "peso", "imc_cat", "clasif")):
        return "weight"
    if "parto" in norm and "tipo" in norm:
        return "parto"
    if "parto" in norm and "sitio" not in norm:
        sample = series.dropna().astype(str).str.lower().head(40)
        if sample.str.contains("ces").any() or sample.str.contains("nat").any():
            return "parto"
    if vtype == "categorical_dichotomous":
        return "binary"
    uniq = series.dropna().astype(str).str.strip().unique()
    if len(uniq) <= 2:
        return "binary"
    return "categorical"


def _to_categorical_label(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    if pd.isna(val):
        return None
    s = str(val).strip()
    if not s or s.lower() in ("nan", "none", "(vacío)"):
        return None
    return s


def _alluvial_label_for_value(kind: str, val: Any) -> Optional[str]:
    if kind == "binary":
        b = _to_binary_value(val)
        if b is None:
            return None
        return "Sí" if b >= 0.5 else "No"
    if kind == "parto":
        return _to_parto_label(val)
    if kind == "weight":
        return _to_weight_label(val)
    if kind == "termino":
        return _to_termino_label(val)
    if kind == "birth_weight":
        return _to_birth_weight_category(val)
    if kind == "escolaridad":
        return _to_escolaridad_simple_label(val)
    return _to_categorical_label(val)


def _resolve_alluvial_kind(col: str, series: pd.Series, vtype: str) -> str:
    norm = _norm_col(col)
    if "termino" in norm and "peso" not in norm:
        return "termino"
    if norm in ("peso_nacer", "pesoalnacer") or norm == "peso_nacer":
        if _is_numeric_type(vtype) or pd.to_numeric(series, errors="coerce").notna().any():
            return "birth_weight"
    if "escolaridad" in norm and norm.endswith("_m"):
        return "escolaridad"
    return _infer_alluvial_kind(col, series, vtype)


def _alluvial_distinct_categories(series: pd.Series, kind: str) -> List[str]:
    cats: set = set()
    for val in series:
        label = _alluvial_label_for_value(kind, val)
        if label is not None:
            cats.add(label)
    return list(cats)


def _alluvial_min_categories(kind: str, vtype: str) -> int:
    """Dicotómicas con un solo valor observado (p. ej. sm_m = No en todos) siguen siendo elegibles."""
    if kind == "binary" or vtype == "categorical_dichotomous":
        return 1
    return 2


def _alluvial_eligible_columns(df: pd.DataFrame, types: Dict[str, str]) -> List[str]:
    eligible: List[str] = []
    for col in [str(c) for c in df.columns]:
        vtype = types.get(col, infer_variable_type(df[col]))
        kind = _resolve_alluvial_kind(col, df[col], vtype)
        if kind == "birth_weight":
            cats = _alluvial_distinct_categories(df[col], kind)
            if 2 <= len(cats) <= ALLUVIAL_MAX_CATEGORIES:
                eligible.append(col)
            continue
        if _is_numeric_type(vtype):
            continue
        cats = _alluvial_distinct_categories(df[col], kind)
        min_cats = _alluvial_min_categories(kind, vtype)
        if min_cats <= len(cats) <= ALLUVIAL_MAX_CATEGORIES:
            eligible.append(col)
    return sorted(eligible, key=lambda c: c.lower())


def _resolve_alluvial_focus_stage(
    stage: Dict[str, Any],
    cols: List[str],
    weight_col: Optional[str],
) -> Tuple[Optional[str], str]:
    axis = stage.get("axis") or stage.get("pattern", "")
    if stage.get("weight"):
        if weight_col and weight_col in cols:
            return weight_col, axis
        matched = _match_columns(["condicion"], cols)
        if matched:
            return matched[0], axis
        return None, axis
    pattern = stage.get("pattern", "")
    matched = _match_columns([pattern], cols)
    if matched:
        return matched[0], axis
    return None, axis


def _build_alluvial_focus_presets(
    cols: List[str],
    weight_col: Optional[str],
    df: pd.DataFrame,
    types: Dict[str, str],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for preset in ALLUVIAL_FOCUS_PRESETS:
        resolved_cols: List[str] = []
        axes: List[str] = []
        missing: List[str] = []
        for stage in preset["stage_patterns"]:
            col, axis = _resolve_alluvial_focus_stage(stage, cols, weight_col)
            axes.append(axis)
            if col:
                resolved_cols.append(col)
            else:
                missing.append(axis)
        available = len(resolved_cols) >= 2 and len(missing) == 0
        out.append(
            {
                "id": preset["id"],
                "label": preset["label"],
                "title": preset["title"],
                "insight": preset["insight"],
                "axes": axes,
                "stages": resolved_cols,
                "available": available,
                "missing": missing,
            }
        )
    return out


def _alluvial_default_stages(cols: List[str], weight_col: Optional[str]) -> List[str]:
    patterns = list(ALLUVIAL_DEFAULT_STAGE_PATTERNS)
    if weight_col and _norm_col(weight_col) not in {_norm_col(p) for p in patterns}:
        patterns[-1] = weight_col
    out = _match_columns_ordered(patterns, cols)
    seen = set()
    deduped: List[str] = []
    for c in out:
        if c not in seen:
            seen.add(c)
            deduped.append(c)
    return deduped


def _alluvial_category_order(kind: str, categories: List[str]) -> List[str]:
    if kind == "binary":
        base = ALLUVIAL_BINARY_ORDER
    elif kind == "parto":
        base = ALLUVIAL_PARTO_ORDER
    elif kind == "weight":
        base = ALLUVIAL_WEIGHT_ORDER
    elif kind == "termino":
        base = ALLUVIAL_TERMINO_ORDER
    elif kind == "birth_weight":
        base = ALLUVIAL_BIRTH_WEIGHT_ORDER
    elif kind == "escolaridad":
        base = ALLUVIAL_ESCOLARIDAD_ORDER
    else:
        base = []
    ordered = [c for c in base if c in categories]
    for c in sorted(categories):
        if c not in ordered:
            ordered.append(c)
    return ordered


def _alluvial_payload(
    df: pd.DataFrame,
    stage_columns: List[str],
    types: Dict[str, str],
) -> Dict[str, Any]:
    if len(stage_columns) < 2:
        raise HTTPException(
            status_code=400,
            detail="Seleccione al menos 2 variables para el flujo (orden = ejes de izquierda a derecha)",
        )
    if len(stage_columns) > ALLUVIAL_MAX_STAGES:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {ALLUVIAL_MAX_STAGES} variables en el diagrama",
        )
    seen_cols: set = set()
    for col in stage_columns:
        if col not in df.columns:
            raise HTTPException(status_code=404, detail=f"Variable '{col}' no encontrada")
        if col in seen_cols:
            raise HTTPException(status_code=400, detail="No repita la misma variable en el flujo")
        seen_cols.add(col)

    specs: List[Dict[str, Any]] = []
    for col in stage_columns:
        vtype = types.get(col, infer_variable_type(df[col]))
        kind = _resolve_alluvial_kind(col, df[col], vtype)
        cats = _alluvial_distinct_categories(df[col], kind)
        min_cats = _alluvial_min_categories(kind, vtype)
        if len(cats) < min_cats:
            raise HTTPException(
                status_code=400,
                detail=f"La variable '{col}' no tiene suficientes categorías válidas para el flujo",
            )
        if len(cats) > ALLUVIAL_MAX_CATEGORIES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"La variable '{col}' tiene demasiadas categorías ({len(cats)}); "
                    f"máximo {ALLUVIAL_MAX_CATEGORIES}"
                ),
            )
        specs.append(
            {
                "key": _norm_col(col),
                "title": col,
                "column": col,
                "kind": kind,
            }
        )

    path_counts = Counter()
    for _, row in df.iterrows():
        labels: List[str] = []
        skip = False
        for spec in specs:
            label = _alluvial_label_for_value(spec["kind"], row[spec["column"]])
            if label is None:
                skip = True
                break
            labels.append(label)
        if skip:
            continue
        path_counts[tuple(labels)] += 1

    if not path_counts:
        raise HTTPException(
            status_code=400,
            detail="No hay observaciones con datos completos en las variables seleccionadas",
        )

    stage_categories: List[List[str]] = [[] for _ in specs]
    for path, _n in path_counts.items():
        for i, cat in enumerate(path):
            if cat not in stage_categories[i]:
                stage_categories[i].append(cat)

    nodes: List[Dict[str, Any]] = []
    node_index: Dict[Tuple[int, str], int] = {}

    def _node_id(stage_idx: int, category: str) -> int:
        key = (stage_idx, category)
        if key not in node_index:
            spec = specs[stage_idx]
            node_index[key] = len(nodes)
            nodes.append(
                {
                    "id": len(nodes) - 1,
                    "stage": stage_idx,
                    "stage_key": spec["key"],
                    "stage_title": spec["title"],
                    "stage_kind": spec["kind"],
                    "category": category,
                    "label": _alluvial_stage_label(spec["title"], category),
                }
            )
        return node_index[key]

    link_counts = Counter()
    for path, count in path_counts.items():
        for stage_idx in range(len(path) - 1):
            src = _node_id(stage_idx, path[stage_idx])
            tgt = _node_id(stage_idx + 1, path[stage_idx + 1])
            link_counts[(src, tgt)] += count

    links = [
        {"source": s, "target": t, "value": int(v)}
        for (s, t), v in sorted(link_counts.items(), key=lambda x: (-x[1], x[0]))
    ]
    stages_out = []
    for i, spec in enumerate(specs):
        cats = _alluvial_category_order(spec["kind"], stage_categories[i])
        stages_out.append(
            {
                "key": spec["key"],
                "title": spec["title"],
                "column": spec["column"],
                "kind": spec["kind"],
                "categories": cats,
            }
        )

    return {
        "stage_columns": stage_columns,
        "stages": stages_out,
        "nodes": nodes,
        "links": links,
        "n": int(sum(path_counts.values())),
        "path_count": len(path_counts),
    }


def _grouped_numeric_table(df: pd.DataFrame, columns: List[str], group_col: str) -> List[Dict[str, Any]]:
    rows = []
    for col in columns:
        if col not in df.columns:
            continue
        row = {"variable": col, "groups": []}
        for gval, sub in df.groupby(group_col, dropna=False):
            label = str(gval) if pd.notna(gval) and str(gval) != "" else "(vacío)"
            stats = _numeric_summary(sub[col])
            stats["group"] = label
            row["groups"].append(stats)
        rows.append(row)
    return rows


def register_descriptivo_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/descriptivo/schema")
    async def descriptivo_schema(dataset_id: str):
        df, types, info = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        numeric = [c for c in cols if _is_numeric_type(types.get(c, ""))]
        categorical = [c for c in cols if not _is_numeric_type(types.get(c, ""))]
        weight_col = _detect_weight_column(df, types)
        anthro = [c for c in _match_columns(DEFAULT_ANTHRO, cols) if c in numeric]
        lipid = [c for c in _match_columns(DEFAULT_LIPID, cols) if c in numeric]
        alluvial_focus = _build_alluvial_focus_presets(cols, weight_col, df, types)
        alluvial_default = next(
            (p["stages"] for p in alluvial_focus if p.get("available")),
            _alluvial_default_stages(cols, weight_col),
        )
        return {
            "success": True,
            "rows": len(df),
            "columns": cols,
            "numeric_columns": numeric,
            "categorical_columns": categorical,
            "variable_types": types,
            "suggested_weight_column": weight_col,
            "presets": {
                "anthropometric": anthro,
                "lipid": lipid,
                "perinatal": _match_columns(DEFAULT_PERINATAL, cols),
                "correlation": _match_columns(DEFAULT_CORR, cols),
                "correlation_presets": _build_correlation_presets(cols, numeric),
                "scatter_pairs": _build_scatter_pairs(cols, numeric),
                "pcp": {
                    "dichotomous": _match_columns_ordered(PCP_DICHOTOMOUS, cols),
                    "outcomes": _match_columns(PCP_OUTCOME_PATTERNS, [c for c in cols if c in numeric]),
                },
                "alluvial": {
                    "columns": _alluvial_eligible_columns(df, types),
                    "focus_presets": alluvial_focus,
                    "default_stages": alluvial_default,
                    "max_stages": ALLUVIAL_MAX_STAGES,
                    "ready": len(_alluvial_eligible_columns(df, types)) >= 2,
                },
                "adversity_heatmap": {
                    "sort_columns": _heatmap_sort_options(cols, numeric),
                    "event_columns": _match_columns_ordered(PCP_DICHOTOMOUS, cols),
                },
                "radar_compare": {
                    "presets": _build_radar_compare_presets(cols),
                    "metrics": [m["label"] for m in _resolve_radar_metrics(cols)],
                    "ready": len(_resolve_radar_metrics(cols)) >= 3 and len(_build_radar_compare_presets(cols)) > 0,
                },
                "conditional_density": {
                    "stratify": _build_density_stratify_options(cols),
                    "child_variables": _heatmap_sort_options(cols, numeric),
                    "default_stratify": next(
                        (p["id"] for p in _build_density_stratify_options(cols) if p.get("id") == "diabetes_m"),
                        (_build_density_stratify_options(cols)[0]["id"] if _build_density_stratify_options(cols) else None),
                    ),
                    "default_variable": next(
                        (c for c in _heatmap_sort_options(cols, numeric) if "triglicer" in _norm_col(c)),
                        (_heatmap_sort_options(cols, numeric)[0] if _heatmap_sort_options(cols, numeric) else None),
                    ),
                },
                "scatter_matrix": {
                    "stratify": _build_density_stratify_options(cols),
                    "variables": [v["label"] for v in _resolve_scatter_matrix_variables(cols)],
                    "default_stratify": next(
                        (p["id"] for p in _build_density_stratify_options(cols) if p.get("id") == "lactancia_materna"),
                        (_build_density_stratify_options(cols)[0]["id"] if _build_density_stratify_options(cols) else None),
                    ),
                    "ready": len(_resolve_scatter_matrix_variables(cols)) >= MIN_SCATTER_MATRIX_VARS
                    and len(_build_density_stratify_options(cols)) > 0,
                },
            },
        }

    @router.post("/datasets/{dataset_id}/descriptivo/univariate")
    async def descriptivo_univariate(dataset_id: str, body: Dict[str, Any] = Body(...)):
        col = body.get("column")
        if not col:
            raise HTTPException(status_code=400, detail="Se requiere column")
        df, types, _ = _get_df(dataset_id)
        if col not in df.columns:
            raise HTTPException(status_code=404, detail=f"Variable '{col}' no encontrada")
        vtype = types.get(col, infer_variable_type(df[col]))
        if _is_numeric_type(vtype):
            return {
                "success": True,
                "kind": "numeric",
                "column": col,
                "summary": _numeric_summary(df[col]),
                "histogram": _histogram_payload(df[col]),
                "boxplot": _boxplot_groups(df, col, body.get("group_by"), include_points=True),
            }
        return {
            "success": True,
            "kind": "categorical",
            "column": col,
            "frequencies": _freq_table(df[col], column=col),
        }

    @router.post("/datasets/{dataset_id}/descriptivo/crosstab")
    async def descriptivo_crosstab(dataset_id: str, body: Dict[str, Any] = Body(...)):
        col = body.get("column")
        group_by = body.get("group_by")
        if not col or not group_by:
            raise HTTPException(status_code=400, detail="Se requieren column y group_by")
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_crosstab_rows(df, col, group_by)}

    @router.post("/datasets/{dataset_id}/descriptivo/grouped")
    async def descriptivo_grouped(dataset_id: str, body: Dict[str, Any] = Body(...)):
        columns = body.get("columns") or []
        group_by = body.get("group_by")
        if not group_by:
            df, types, _ = _get_df(dataset_id)
            group_by = _detect_weight_column(df, types)
        if not group_by:
            raise HTTPException(status_code=400, detail="Indique variable de agrupación (p. ej. condición de peso)")
        df, types, _ = _get_df(dataset_id)
        if group_by not in df.columns:
            raise HTTPException(status_code=404, detail="Variable de agrupación no encontrada")
        cols = columns if columns else [str(c) for c in df.columns]
        numeric_cols = [c for c in cols if c in df.columns and _is_numeric_type(types.get(c, infer_variable_type(df[c])))]
        cat_cols = [c for c in cols if c in df.columns and c not in numeric_cols]
        return {
            "success": True,
            "group_by": group_by,
            "numeric_tables": _grouped_numeric_table(df, numeric_cols, group_by),
            "categorical_tables": [
                {"variable": c, "frequencies_by_group": _crosstab_rows(df, c, group_by)} for c in cat_cols
            ],
            "boxplots": [
                {"variable": c, "groups": _boxplot_groups(df, c, group_by, True)} for c in numeric_cols
            ],
        }

    @router.post("/datasets/{dataset_id}/descriptivo/correlation")
    async def descriptivo_correlation(dataset_id: str, body: Dict[str, Any] = Body(...)):
        columns = body.get("columns") or []
        group_by = body.get("group_by")
        df, types, _ = _get_df(dataset_id)
        if not columns:
            columns = _match_columns(DEFAULT_CORR, [str(c) for c in df.columns])
        numeric = [
            c
            for c in columns
            if c in df.columns and _is_numeric_type(types.get(c, infer_variable_type(df[c])))
        ]
        if len(numeric) < 2:
            raise HTTPException(status_code=400, detail="Se requieren al menos 2 variables numéricas")
        if group_by:
            if group_by not in df.columns:
                raise HTTPException(status_code=404, detail=f"Variable de agrupación '{group_by}' no encontrada")
            matrices: List[Dict[str, Any]] = []
            for gval, sub in df.groupby(group_by, dropna=False):
                label = str(gval) if pd.notna(gval) and str(gval) != "" else "(vacío)"
                try:
                    block = _correlation_matrix(sub, numeric)
                    block["group"] = label
                    matrices.append(block)
                except HTTPException as exc:
                    matrices.append(
                        {
                            "group": label,
                            "error": exc.detail if isinstance(exc.detail, str) else str(exc.detail),
                            "n": int(len(sub)),
                        }
                    )
            return {
                "success": True,
                "by_group": True,
                "group_by": group_by,
                "matrices": matrices,
            }
        return {"success": True, "by_group": False, **_correlation_matrix(df, numeric)}

    @router.post("/datasets/{dataset_id}/descriptivo/scatter-correlation")
    async def descriptivo_scatter_correlation(dataset_id: str, body: Dict[str, Any] = Body(...)):
        pair_id = body.get("pair_id")
        x_col = body.get("x")
        y_col = body.get("y")
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        numeric = [c for c in cols if _is_numeric_type(types.get(c, ""))]
        color_col = body.get("color_by") or _detect_weight_column(df, types)
        if not color_col:
            raise HTTPException(status_code=400, detail="No se detectó variable de condición de peso")
        if pair_id:
            pairs = _build_scatter_pairs(cols, numeric)
            spec = next((p for p in pairs if p["id"] == pair_id), None)
            if not spec:
                raise HTTPException(status_code=404, detail="Par de correlación no encontrado")
            if not spec.get("available"):
                raise HTTPException(
                    status_code=400,
                    detail="Variables del par no disponibles en este dataset",
                )
            x_col = spec["x_col"]
            y_col = spec["y_col"]
        if not x_col or not y_col:
            raise HTTPException(status_code=400, detail="Se requieren variables X e Y o pair_id")
        payload = _scatter_correlation_payload(df, x_col, y_col, color_col)
        if pair_id:
            spec_src = next((s for s in SCATTER_PAIR_SPECS if s["id"] == pair_id), None)
            if spec_src:
                payload["x_label"] = spec_src["x_label"]
                payload["y_label"] = spec_src["y_label"]
                payload["justification"] = spec_src["justification"]
                payload["pair_id"] = pair_id
                payload["pair_num"] = spec_src["num"]
        return {"success": True, **payload}

    @router.post("/datasets/{dataset_id}/descriptivo/pcp")
    async def descriptivo_pcp(dataset_id: str, body: Dict[str, Any] = Body(...)):
        outcome = body.get("outcome")
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        numeric = [c for c in cols if _is_numeric_type(types.get(c, ""))]
        color_col = body.get("color_by") or _detect_weight_column(df, types)
        if not color_col:
            raise HTTPException(status_code=400, detail="No se detectó variable de condición de peso")
        dichotomous = _match_columns_ordered(PCP_DICHOTOMOUS, cols)
        if not outcome:
            matched = _match_columns(PCP_OUTCOME_PATTERNS, cols)
            outcome = next((c for c in matched if c in numeric), None)
        if not outcome or outcome not in df.columns:
            raise HTTPException(status_code=400, detail="Indique la variable metabólica del niño")
        if outcome not in numeric:
            raise HTTPException(status_code=400, detail="La variable de resultado debe ser numérica")
        return {
            "success": True,
            **_pcp_payload(
                df,
                dichotomous,
                outcome,
                color_col,
                reorder_axes=bool(body.get("reorder_axes", True)),
                compute_clusters=bool(body.get("compute_clusters", True)),
            ),
        }

    @router.post("/datasets/{dataset_id}/descriptivo/pcp-compare")
    async def descriptivo_pcp_compare(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        numeric = [c for c in cols if _is_numeric_type(types.get(c, ""))]
        color_col = body.get("color_by") or _detect_weight_column(df, types)
        if not color_col:
            raise HTTPException(status_code=400, detail="No se detectó variable de condición de peso")
        dichotomous = _match_columns_ordered(PCP_DICHOTOMOUS, cols)
        panels: List[Dict[str, Any]] = []
        for spec in PCP_COMPARE_PANELS:
            outcome = _resolve_pcp_outcome_column(spec, cols, numeric)
            if not outcome:
                panels.append(
                    {
                        "id": spec["id"],
                        "title": spec["title"],
                        "available": False,
                        "missing": spec.get("patterns", []),
                    }
                )
                continue
            try:
                payload = _pcp_payload(
                    df,
                    dichotomous,
                    outcome,
                    color_col,
                    reorder_axes=bool(body.get("reorder_axes", True)),
                    compute_clusters=bool(body.get("compute_clusters", True)),
                )
                panels.append(
                    {
                        "id": spec["id"],
                        "title": spec["title"],
                        "outcome_column": outcome,
                        "available": True,
                        **payload,
                    }
                )
            except HTTPException:
                panels.append(
                    {
                        "id": spec["id"],
                        "title": spec["title"],
                        "outcome_column": outcome,
                        "available": False,
                        "error": "Datos insuficientes para este marcador",
                    }
                )
        return {"success": True, "panels": panels}

    @router.post("/datasets/{dataset_id}/descriptivo/perinatal-adversity-heatmap")
    async def descriptivo_perinatal_adversity_heatmap(
        dataset_id: str, body: Dict[str, Any] = Body(default={})
    ):
        sort_col = body.get("sort_by") or body.get("sort_column")
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        numeric = [c for c in cols if _is_numeric_type(types.get(c, ""))]
        if not sort_col:
            options = _heatmap_sort_options(cols, numeric)
            sort_col = next(
                (c for c in options if "triglicer" in _norm_col(c)),
                options[0] if options else None,
            )
        if not sort_col:
            raise HTTPException(status_code=400, detail="Indique la variable para ordenar filas")
        return {"success": True, **_perinatal_adversity_heatmap_payload(df, sort_col)}

    @router.post("/datasets/{dataset_id}/descriptivo/radar-compare")
    async def descriptivo_radar_compare(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        comparison_id = body.get("comparison") or body.get("comparison_id")
        if not comparison_id:
            presets = _build_radar_compare_presets(cols)
            comparison_id = presets[0]["id"] if presets else None
        if not comparison_id:
            raise HTTPException(status_code=400, detail="Indique la variable de comparación")
        return {"success": True, **_radar_compare_payload(df, str(comparison_id))}

    @router.post("/datasets/{dataset_id}/descriptivo/conditional-density")
    async def descriptivo_conditional_density(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        numeric = [c for c in cols if _is_numeric_type(types.get(c, ""))]
        stratify_key = body.get("stratify_by") or body.get("stratify_column")
        value_key = body.get("variable") or body.get("value_column")
        strat_opts = _build_density_stratify_options(cols)
        child_opts = _heatmap_sort_options(cols, numeric)
        if not stratify_key:
            stratify_key = next(
                (o["id"] for o in strat_opts if o.get("id") == "diabetes_m"),
                strat_opts[0]["id"] if strat_opts else None,
            )
        if not value_key:
            value_key = next(
                (c for c in child_opts if "triglicer" in _norm_col(c)),
                child_opts[0] if child_opts else None,
            )
        if not stratify_key or not value_key:
            raise HTTPException(status_code=400, detail="Indique variable de estratificación y del niño")
        strat_entry = next((o for o in strat_opts if o.get("id") == stratify_key or o.get("column") == stratify_key), None)
        strat_col = (
            strat_entry["column"]
            if strat_entry
            else (_match_columns_ordered([str(stratify_key)], cols)[0] if _match_columns_ordered([str(stratify_key)], cols) else None)
        )
        if not strat_col:
            raise HTTPException(status_code=404, detail="Variable de estratificación no encontrada")
        value_col = _resolve_density_value_column(str(value_key), cols)
        if not value_col:
            raise HTTPException(status_code=404, detail="Variable del niño no encontrada")
        return {
            "success": True,
            **_conditional_density_payload(df, strat_col, value_col),
        }

    @router.post("/datasets/{dataset_id}/descriptivo/scatter-matrix")
    async def descriptivo_scatter_matrix(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        stratify_key = body.get("stratify_by") or body.get("stratify_column")
        strat_opts = _build_density_stratify_options(cols)
        if not stratify_key:
            stratify_key = next(
                (o["id"] for o in strat_opts if o.get("id") == "lactancia_materna"),
                strat_opts[0]["id"] if strat_opts else None,
            )
        if not stratify_key:
            raise HTTPException(status_code=400, detail="Indique la variable perinatal de estratificación")
        strat_entry = next(
            (o for o in strat_opts if o.get("id") == stratify_key or o.get("column") == stratify_key),
            None,
        )
        strat_col = (
            strat_entry["column"]
            if strat_entry
            else (
                _match_columns_ordered([str(stratify_key)], cols)[0]
                if _match_columns_ordered([str(stratify_key)], cols)
                else None
            )
        )
        if not strat_col:
            raise HTTPException(status_code=404, detail="Variable de estratificación no encontrada")
        return {"success": True, **_conditional_scatter_matrix_payload(df, strat_col)}

    @router.post("/datasets/{dataset_id}/descriptivo/alluvial")
    async def descriptivo_alluvial(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, types, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        weight_col = _detect_weight_column(df, types)
        stages = body.get("stages")
        if not stages:
            stages = _alluvial_default_stages(cols, weight_col)
        if not isinstance(stages, list):
            raise HTTPException(status_code=400, detail="stages debe ser una lista de columnas")
        stages = [str(s) for s in stages if s]
        return {"success": True, **_alluvial_payload(df, stages, types)}

    @router.post("/datasets/{dataset_id}/descriptivo/stacked-bar")
    async def descriptivo_stacked_bar(dataset_id: str, body: Dict[str, Any] = Body(...)):
        col = body.get("column")
        group_by = body.get("group_by")
        if not col or not group_by:
            raise HTTPException(status_code=400, detail="Se requieren column y group_by")
        df, _, _ = _get_df(dataset_id)
        ct = _crosstab_rows(df, col, group_by)
        return {"success": True, **ct}
