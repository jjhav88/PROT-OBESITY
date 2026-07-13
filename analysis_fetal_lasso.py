"""
Módulo 4.4 — Regresión logística LASSO para predecir obesidad infantil.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException

from analysis_fetal_common import (
    _get_df,
    _match_column,
    _resolve_condicion,
    _safe_round,
)

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import roc_auc_score, roc_curve
    from sklearn.model_selection import StratifiedKFold, cross_val_predict
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    _SKLEARN_OK = True
except ImportError:  # pragma: no cover
    LogisticRegression = None  # type: ignore
    roc_auc_score = None  # type: ignore
    roc_curve = None  # type: ignore
    cross_val_predict = None  # type: ignore
    StandardScaler = None  # type: ignore
    Pipeline = None  # type: ignore
    StratifiedKFold = None  # type: ignore
    _SKLEARN_OK = False

CV_FOLDS = 10
LASSO_ALPHA = 1.0  # penalización L1 (α=1 en notación elastic net)
MIN_COMPLETE_N = 25
MIN_CLASS_N = 5
COEF_THRESHOLD = 1e-6
N_BOOT_OR = 800
BOOT_MIN_SUCCESS = 120

LASSO_PREDICTOR_SPECS: List[Dict[str, Any]] = [
    {"id": "peso_nacer", "column": "peso_nacer", "label": "Peso al nacer", "kind": "continuous"},
    {"id": "semanas_gestacion", "column": "semanas_gestacion", "label": "Semanas de gestación", "kind": "continuous"},
    {"id": "lactancia_materna", "column": "lactancia_materna", "label": "Lactancia materna", "kind": "binary"},
    {"id": "curso_normal", "column": "curso_normal", "label": "Curso normal del embarazo", "kind": "binary"},
    {"id": "complicaciones", "column": "complicaciones", "label": "Complicaciones al nacer", "kind": "binary"},
    {"id": "exp_sust_tox", "column": "exp_sust_tox", "label": "Exposición a sustancias tóxicas", "kind": "binary"},
    {"id": "diabetes_m", "column": "diabetes_m", "label": "Diabetes materna", "kind": "binary"},
    {"id": "obes_m", "column": "obes_m", "label": "Obesidad materna", "kind": "binary"},
    {"id": "sm_m", "column": "sm_m", "label": "Síndrome metabólico materno", "kind": "binary"},
    {"id": "HTA_m", "column": "HTA_m", "label": "Hipertensión materna", "kind": "binary"},
    {"id": "hipercolesterolemia_m", "column": "hipercolesterolemia_m", "label": "Hipercolesterolemia materna", "kind": "binary"},
    {"id": "escolaridad_m", "column": "escolaridad_m", "label": "Escolaridad materna", "kind": "escolaridad"},
    {"id": "tipo_parto", "column": "tipo_parto", "label": "Tipo de parto (cesárea vs natural)", "kind": "parto"},
]

# Conjuntos temáticos: al elegir un preset se incluyen solo esos predictores (ids de LASSO_PREDICTOR_SPECS).
LASSO_PREDICTOR_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "all",
        "label": "Todas las variables disponibles",
        "description": "Modelo completo; útil como referencia, pero con pocas observaciones puede dar AUC bajo.",
        "predictor_ids": None,
    },
    {
        "id": "iap_aligned",
        "label": "Alineado con IAP (adversidad perinatal)",
        "description": "Peso, pretérmino, lactancia, complicaciones, tóxicos y salud metabólica materna (como el índice IAP).",
        "predictor_ids": [
            "peso_nacer",
            "semanas_gestacion",
            "lactancia_materna",
            "complicaciones",
            "exp_sust_tox",
            "diabetes_m",
            "obes_m",
            "sm_m",
        ],
    },
    {
        "id": "neonatal",
        "label": "Neonatales y curso del embarazo",
        "description": "Tamaño y edad gestacional, lactancia, curso normal, complicaciones y tipo de parto.",
        "predictor_ids": [
            "peso_nacer",
            "semanas_gestacion",
            "lactancia_materna",
            "curso_normal",
            "complicaciones",
            "tipo_parto",
        ],
    },
    {
        "id": "maternal_metabolic",
        "label": "Salud metabólica y vascular materna",
        "description": "Diabetes, obesidad, síndrome metabólico, HTA e hipercolesterolemia (ambiente intrauterino).",
        "predictor_ids": ["diabetes_m", "obes_m", "sm_m", "HTA_m", "hipercolesterolemia_m"],
    },
    {
        "id": "maternal_context",
        "label": "Contexto materno (sin duplicar metabólicas)",
        "description": "Escolaridad y tipo de parto; perfil social y obstétrico.",
        "predictor_ids": ["escolaridad_m", "tipo_parto"],
    },
    {
        "id": "toxic_stress",
        "label": "Estrés / exposición y complicaciones",
        "description": "Tóxicos, complicaciones al nacer e hipertensión materna.",
        "predictor_ids": ["exp_sust_tox", "complicaciones", "HTA_m"],
    },
    {
        "id": "minimal",
        "label": "Núcleo reducido (menos variables)",
        "description": "Tres predictores poco redundantes: peso al nacer, lactancia y síndrome metabólico materno.",
        "predictor_ids": ["peso_nacer", "lactancia_materna", "sm_m"],
    },
    {
        "id": "custom",
        "label": "Personalizado (lista inferior)",
        "description": "Marque las variables en el selector múltiple y ejecute el modelo.",
        "predictor_ids": None,
    },
]

DEFAULT_PRESET_ID = "minimal"
MIN_FEATURES = 1


def _all_predictor_ids() -> List[str]:
    return [s["id"] for s in LASSO_PREDICTOR_SPECS]


def _resolve_predictor_ids(
    preset_id: Optional[str],
    predictor_ids: Optional[List[str]],
) -> Tuple[List[str], str, str]:
    """Devuelve (ids, preset_id efectivo, etiqueta del conjunto)."""
    pid = (preset_id or DEFAULT_PRESET_ID).strip()
    if pid == "custom":
        ids = [str(x).strip() for x in (predictor_ids or []) if str(x).strip()]
        valid = set(_all_predictor_ids())
        ids = [i for i in ids if i in valid]
        if not ids:
            raise HTTPException(
                status_code=400,
                detail="Seleccione al menos un predictor en la lista o elija otro conjunto predefinido.",
            )
        return ids, "custom", "Personalizado"
    for preset in LASSO_PREDICTOR_PRESETS:
        if preset["id"] != pid:
            continue
        raw = preset.get("predictor_ids")
        if raw is None:
            return _all_predictor_ids(), preset["id"], preset["label"]
        return list(raw), preset["id"], preset["label"]
    raise HTTPException(
        status_code=400,
        detail=f"Preset desconocido: {pid}. Use uno de: {', '.join(p['id'] for p in LASSO_PREDICTOR_PRESETS)}.",
    )


def _min_complete_n(n_features: int) -> int:
    if n_features <= 4:
        return 12
    if n_features <= 7:
        return 18
    return MIN_COMPLETE_N


def _encode_binary(series: pd.Series) -> pd.Series:
    raw = series.astype(str).str.strip().str.lower()
    raw = raw.replace({"": np.nan, "nan": np.nan, "none": np.nan})
    pos = {"si", "sí", "s", "yes", "y", "1", "true", "verdadero"}
    neg = {"no", "n", "0", "false", "falso"}
    out = pd.Series(np.nan, index=series.index, dtype=float)
    out[raw.isin(pos)] = 1.0
    out[raw.isin(neg)] = 0.0
    return out


def _to_escolaridad_simple(val: Any) -> Optional[str]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s or s in ("nan", "none", "(vacío)"):
        return None
    if "posgrado" in s or "licenciatura" in s or "superior" in s:
        return "Superior"
    if "preparatoria" in s or "media" in s or "bachiller" in s:
        return "Media"
    return "Básica"


def _to_parto_binary(val: Any) -> Optional[float]:
    if val is None or (isinstance(val, float) and math.isnan(val)) or pd.isna(val):
        return None
    s = str(val).strip().lower()
    if not s:
        return None
    if "ces" in s:
        return 1.0
    if "nat" in s or "vag" in s:
        return 0.0
    return None


def _build_outcome(df: pd.DataFrame, cols: List[str]) -> Tuple[pd.Series, Dict[str, int]]:
    cond = _resolve_condicion(df, cols)
    y = pd.Series(np.nan, index=df.index, dtype=float)
    y[cond == "Obesidad"] = 1.0
    y[cond == "Normopeso"] = 0.0
    used = cond.isin(["Obesidad", "Normopeso"])
    counts = {
        "n_obesidad": int((cond == "Obesidad").sum()),
        "n_normopeso": int((cond == "Normopeso").sum()),
        "n_sobrepeso_excluded": int((cond == "Sobrepeso").sum()),
        "n_bajo_peso_excluded": int((cond == "Bajo peso").sum()),
        "n_in_model": int(used.sum()),
        "n_excluded": int((~used).sum()),
    }
    return y, counts


def _build_design_matrix(
    df: pd.DataFrame,
    predictor_ids: Optional[List[str]] = None,
) -> Tuple[pd.DataFrame, List[Dict[str, Any]], List[Dict[str, Any]]]:
    cols = [str(c) for c in df.columns]
    X = pd.DataFrame(index=df.index)
    predictors_meta: List[Dict[str, Any]] = []
    allowed = set(predictor_ids) if predictor_ids else None
    specs = LASSO_PREDICTOR_SPECS
    if allowed is not None:
        specs = [s for s in specs if s["id"] in allowed]

    for spec in specs:
        col = _match_column(cols, spec["column"])
        kind = spec["kind"]
        pid = spec["id"]
        available = bool(col)
        meta_row = {
            **spec,
            "column_resolved": col,
            "available": available,
            "feature_columns": [],
        }

        if not col:
            predictors_meta.append(meta_row)
            continue

        if kind == "continuous":
            s = pd.to_numeric(df[col], errors="coerce")
            if pid == "peso_nacer":
                sample = s.dropna()
                if len(sample) > 0 and float(sample.median()) < 50:
                    pass
                else:
                    s = s / 1000.0
            fname = pid
            X[fname] = s
            meta_row["feature_columns"] = [fname]
        elif kind == "binary":
            fname = pid
            X[fname] = _encode_binary(df[col])
            meta_row["feature_columns"] = [fname]
        elif kind == "escolaridad":
            mapped = df[col].map(_to_escolaridad_simple)
            dummies = pd.get_dummies(mapped, prefix="esc_m", dtype=float)
            for cat in ["Media", "Superior"]:
                cname = f"esc_m_{cat}"
                X[cname] = dummies.get(cname, pd.Series(0.0, index=df.index))
            meta_row["feature_columns"] = [c for c in X.columns if c.startswith("esc_m_")]
            meta_row["reference"] = "Básica"
        elif kind == "parto":
            fname = "tipo_parto_cesarea"
            X[fname] = df[col].map(_to_parto_binary)
            meta_row["feature_columns"] = [fname]
            meta_row["reference"] = "Natural"

        predictors_meta.append(meta_row)

    feature_cols = list(X.columns)
    labels = {c: c for c in feature_cols}
    for pm in predictors_meta:
        if pm["kind"] == "escolaridad":
            for fc in pm.get("feature_columns", []):
                labels[fc] = "Escolaridad materna: " + fc.replace("esc_m_", "")
        elif pm["kind"] == "parto" and pm.get("feature_columns"):
            labels[pm["feature_columns"][0]] = "Parto por cesárea (vs natural)"
        else:
            for fc in pm.get("feature_columns", []):
                labels[fc] = pm["label"]

    return X, predictors_meta, [{"name": c, "label": labels.get(c, c)} for c in feature_cols]


def _ci_dict(lo: Optional[float], hi: Optional[float]) -> Optional[Dict[str, Any]]:
    if lo is None or hi is None:
        return None
    return {
        "lo": _safe_round(lo, 3),
        "hi": _safe_round(hi, 3),
        "display": f"[{_safe_round(lo, 3)}, {_safe_round(hi, 3)}]",
        "label": "IC 95% (bootstrap)",
    }


def _classify_or_role(or_val: float, lo: Optional[float], hi: Optional[float]) -> Dict[str, str]:
    """Clasifica asociación como riesgo, protector o inconclusa según OR e IC."""
    if lo is not None and hi is not None:
        if lo > 1.0:
            return {
                "role": "riesgo",
                "role_label": "Factor de riesgo",
                "summary": "OR>1 y el IC 95% no cruza 1: mayor probabilidad de obesidad.",
            }
        if hi < 1.0:
            return {
                "role": "protector",
                "role_label": "Factor protector",
                "summary": "OR<1 y el IC 95% no cruza 1: menor probabilidad de obesidad.",
            }
        return {
            "role": "inconcluso",
            "role_label": "Asociación no concluyente",
            "summary": "El IC 95% incluye 1: la asociación no es estadísticamente clara con esta muestra.",
        }
    if or_val > 1.05:
        return {
            "role": "riesgo",
            "role_label": "Posible factor de riesgo",
            "summary": "OR>1 (sin IC): asociación hacia mayor riesgo; confirme con más datos.",
        }
    if or_val < 0.95:
        return {
            "role": "protector",
            "role_label": "Posible factor protector",
            "summary": "OR<1 (sin IC): asociación hacia menor riesgo; confirme con más datos.",
        }
    return {
        "role": "neutro",
        "role_label": "Cercano a 1",
        "summary": "OR≈1: poco cambio en las probabilidades.",
    }


def _auc_interpretation(auc: float) -> Dict[str, str]:
    if auc >= 0.8:
        level = "buena"
        text = "El modelo separa bastante bien obesidad de normopeso en esta muestra."
    elif auc >= 0.7:
        level = "aceptable"
        text = "Discriminación moderada; útil de forma exploratoria, pero conviene validar en más niños."
    elif auc >= 0.6:
        level = "modesta"
        text = "Capacidad predictiva limitada; use los OR como pistas etiológicas, no como predicción clínica fuerte."
    else:
        level = "baja"
        text = "Poca capacidad de clasificación; los predictores seleccionados aún orientan hipótesis perinatales."
    return {"level": level, "text": text}


def _make_lasso_fit_pipeline(C_value: float) -> Pipeline:
    """Mismo LASSO (C fijo) sin CV interno — para bootstrap."""
    return Pipeline(
        [
            ("scaler", StandardScaler()),
            (
                "model",
                LogisticRegression(
                    C=C_value,
                    penalty="l1",
                    solver="saga",
                    max_iter=20000,
                    random_state=42,
                ),
            ),
        ]
    )


def _bootstrap_or_ci(
    X_arr: np.ndarray,
    y_arr: np.ndarray,
    feat_cols: List[str],
    C_value: float,
) -> Dict[str, Dict[str, Any]]:
    rng = np.random.default_rng(42)
    n = len(y_arr)
    boot_coefs: Dict[str, List[float]] = {f: [] for f in feat_cols}
    success = 0

    for _ in range(N_BOOT_OR):
        idx = rng.integers(0, n, size=n)
        y_b = y_arr[idx]
        if len(np.unique(y_b)) < 2:
            continue
        try:
            p = _make_lasso_fit_pipeline(C_value)
            p.fit(X_arr[idx], y_b)
            coefs = p.named_steps["model"].coef_[0]
            for i, fname in enumerate(feat_cols):
                boot_coefs[fname].append(float(coefs[i]))
            success += 1
        except (ValueError, np.linalg.LinAlgError):
            continue

    out: Dict[str, Dict[str, Any]] = {}
    for fname in feat_cols:
        vals = boot_coefs[fname]
        if success < BOOT_MIN_SUCCESS or len(vals) < BOOT_MIN_SUCCESS:
            out[fname] = {"n_boot_success": success, "ci_or": None, "ci_beta": None}
            continue
        lo_b, hi_b = float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))
        out[fname] = {
            "n_boot_success": success,
            "ci_beta": _ci_dict(lo_b, hi_b),
            "ci_or": _ci_dict(math.exp(lo_b), math.exp(hi_b)),
        }
    return out


def _compute_roc_metrics(pipe: Pipeline, X_arr: np.ndarray, y_arr: np.ndarray, cv) -> Dict[str, Any]:
    y_prob_cv = cross_val_predict(pipe, X_arr, y_arr, cv=cv, method="predict_proba")[:, 1]
    auc_cv = float(roc_auc_score(y_arr, y_prob_cv))
    fpr, tpr, _ = roc_curve(y_arr, y_prob_cv)
    roc_points = [
        {"fpr": _safe_round(float(a), 4), "tpr": _safe_round(float(b), 4)}
        for a, b in zip(fpr, tpr)
    ]

    y_prob_fit = pipe.predict_proba(X_arr)[:, 1]
    auc_fit = float(roc_auc_score(y_arr, y_prob_fit))
    fpr_fit, tpr_fit, _ = roc_curve(y_arr, y_prob_fit)
    roc_fit = [
        {"fpr": _safe_round(float(a), 4), "tpr": _safe_round(float(b), 4)}
        for a, b in zip(fpr_fit, tpr_fit)
    ]

    interp = _auc_interpretation(auc_cv)
    return {
        "auc_cv": _safe_round(auc_cv, 3),
        "auc_in_sample": _safe_round(auc_fit, 3),
        "roc_cv": roc_points,
        "roc_in_sample": roc_fit,
        "interpretation": interp,
        "note": (
            "AUC por validación cruzada (más fiable): probabilidad estimada en pliegues no usados para entrenar. "
            "AUC en muestra completa suele ser más optimista."
        ),
    }


def _build_results_interpretation(
    *,
    roc: Dict[str, Any],
    selected: List[Dict[str, Any]],
    n_features: int,
    n_riesgo: int,
    n_prot: int,
    n_incon: int,
    n_model: int,
    n_pos: int,
    n_neg: int,
    preset_label: str = "",
) -> Dict[str, Any]:
    """Panel al final de resultados: qué hace LASSO y lectura de este ajuste."""
    auc = roc.get("auc_cv")
    auc_level = (roc.get("interpretation") or {}).get("level", "")

    paragraphs = [
        (
            "En este análisis, LASSO estima la probabilidad de obesidad infantil (frente a normopeso) "
            f"a partir de {n_features} predictores perinatales/maternos en {n_model} niños "
            f"(Obesidad={n_pos}, Normopeso={n_neg}). La penalización L1 deja solo las variables más útiles "
            f"en conjunto: aquí quedaron {len(selected)} con efecto distinto de cero."
        ),
    ]

    if auc is not None:
        if auc_level and str(auc_level).lower() in ("baja", "modesta"):
            paragraphs.append(
                f"El AUC por validación cruzada es {auc} ({auc_level}): el perfil perinatal elegido "
                "no separa bien obesidad de normopeso en esta muestra; use los OR como hipótesis, no como predicción clínica."
            )
        elif auc is not None and float(auc) >= 0.7:
            paragraphs.append(
                f"El AUC por validación cruzada es {auc}: hay discriminación exploratoria aceptable entre grupos "
                "con las variables que entraron al modelo."
            )
        else:
            paragraphs.append(
                f"El AUC por validación cruzada es {auc}: discriminación modesta; conviene ampliar muestra o contrastar con IAP y lípidos."
            )

    if selected:
        riesgos = [r["label"] for r in selected if r.get("role") == "riesgo"]
        protectores = [r["label"] for r in selected if r.get("role") == "protector"]
        if riesgos:
            paragraphs.append(
                "Factores de riesgo (OR>1, IC 95% sin incluir 1): "
                + ", ".join(riesgos)
                + ". Se asocian con mayor probabilidad de obesidad en este modelo."
            )
        if protectores:
            paragraphs.append(
                "Factores protectores (OR<1, IC 95% sin incluir 1): "
                + ", ".join(protectores)
                + ". Se asocian con menor probabilidad de obesidad."
            )
        if n_incon > 0:
            paragraphs.append(
                f"{n_incon} predictor(es) quedaron en el modelo pero su IC 95% cruza OR=1: "
                "evidencia insuficiente con el tamaño muestral actual."
            )
    else:
        paragraphs.append(
            "Ningún predictor superó la penalización con coeficiente relevante: no hay variables perinatales "
            "claramente asociadas a obesidad vs normopeso en este ajuste."
        )

    paragraphs.append(
        "Integración con programación fetal: compare estos hallazgos con el IAP (carga global de adversidad) "
        "y el perfil lipídico. LASSO indica qué antecedentes aportan de forma independiente al modelo; "
        "el IAP resume la acumulación de insultos."
    )

    return {
        "title": "Interpretación de los resultados",
        "what_is_lasso": (
            "LASSO (Least Absolute Shrinkage and Selection Operator) es una regresión logística con penalización L1. "
            "Ajusta obesidad (sí/no) frente a normopeso usando antecedentes al nacer; reduce coeficientes pequeños a cero "
            "y conserva los predictores más informativos. Entrega: curva ROC y AUC (validación cruzada), odds ratios con IC 95% "
            "(bootstrap) y forest plot. No sustituye el juicio clínico: es un modelo exploratorio para la cohorte."
        ),
        "summary_bullets": [
            x
            for x in [
                f"Conjunto usado: {preset_label}." if preset_label else "",
                f"Predictores evaluados: {n_features}; seleccionados por LASSO: {len(selected)}.",
                f"Clasificación por IC 95%: {n_riesgo} riesgo, {n_prot} protector, {n_incon} no concluyente.",
                "OR>1 → mayor odds de obesidad; OR<1 → menor odds; OR=1 (línea del forest) → sin efecto.",
                "AUC por CV es la métrica principal; el AUC en toda la muestra suele ser más optimista.",
            ]
            if x
        ],
        "paragraphs": paragraphs,
    }


def _interpretation_guide() -> List[Dict[str, str]]:
    return [
        {
            "title": "¿Qué predice este modelo?",
            "text": (
                "Estima la probabilidad de que un niño tenga obesidad (frente a normopeso) según factores "
                "perinatales y maternos al nacer. No incluye sobrepeso ni bajo peso. Es un modelo exploratorio "
                "de programación fetal, no un diagnóstico clínico individual."
            ),
        },
        {
            "title": "¿Qué es el área bajo la curva ROC (AUC)?",
            "text": (
                "Resume qué tan bien el modelo separa obesidad de normopeso. Va de 0,5 (como adivinar al azar) "
                "a 1 (separación perfecta). AUC≥0,7 sugiere utilidad exploratoria; AUC≥0,8 es buena discriminación. "
                "Con pocas observaciones el AUC puede variar mucho; por eso reportamos el de validación cruzada."
            ),
        },
        {
            "title": "¿Qué es el odds ratio (OR)?",
            "text": (
                "Compara las «oportunidades» (odds) de obesidad cuando el predictor cambia. OR=1: sin cambio. "
                "OR=2: las odds de obesidad se duplican (no significa que la probabilidad se duplique). "
                "OR=0,5: las odds se reducen a la mitad. En variables binarias (Sí/No) es más fácil de leer; "
                "en peso o semanas de gestación el OR es por cada desviación estándar (unidad comparable)."
            ),
        },
        {
            "title": "¿Qué es el forest plot?",
            "text": (
                "Gráfico estándar en metaanálisis y regresión: cada variable aparece en una fila, "
                "el cuadrado marca el OR y la línea horizontal el IC 95%. La referencia en OR=1 ayuda a ver "
                "de un vistazo factores de riesgo (a la derecha) o protectores (a la izquierda)."
            ),
        },
        {
            "title": "Factores de riesgo vs protectores",
            "text": (
                "Factor de riesgo: OR>1 y el IC 95% no incluye 1 → mayor probabilidad de obesidad. "
                "Factor protector: OR<1 y el IC 95% no incluye 1 → menor probabilidad. "
                "Si el IC 95% cruza 1, la evidencia es débil con el tamaño de muestra actual (común en estudios piloto)."
            ),
        },
        {
            "title": "¿Qué concluir en programación fetal?",
            "text": (
                "1) Qué predictores perinatales «sobreviven» la penalización LASSO (más relevantes en conjunto). "
                "2) Su dirección (riesgo o protección) y magnitud (OR e IC). "
                "3) Si el AUC es aceptable, el perfil perinatal ayuda a distinguir obesidad de normopeso; "
                "si es bajo, priorice hipótesis etiológicas más que predicción. "
                "Siempre integre con IAP, mediación y el contexto clínico de la cohorte."
            ),
        },
    ]


def _run_lasso(
    df: pd.DataFrame,
    preset_id: Optional[str] = None,
    predictor_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if not _SKLEARN_OK:
        raise HTTPException(
            status_code=503,
            detail="scikit-learn no está instalado. Ejecute: pip install scikit-learn",
        )

    cols = [str(c) for c in df.columns]
    resolved_ids, effective_preset, preset_label = _resolve_predictor_ids(preset_id, predictor_ids)
    y, outcome_counts = _build_outcome(df, cols)
    X, predictors_meta, feature_labels = _build_design_matrix(df, predictor_ids=resolved_ids)

    feat_cols_preview = list(X.columns)
    if len(feat_cols_preview) < MIN_FEATURES:
        raise HTTPException(
            status_code=400,
            detail="Ninguno de los predictores elegidos está disponible en la base de datos.",
        )

    min_n = _min_complete_n(len(feat_cols_preview))
    data = pd.concat([y.rename("y"), X], axis=1).dropna()
    if len(data) < min_n:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Se requieren al menos {min_n} casos completos con el conjunto «{preset_label}» "
                f"(obesidad sí/no y predictores sin faltantes). n={len(data)}."
            ),
        )

    y_arr = data["y"].astype(int).to_numpy()
    n_pos = int((y_arr == 1).sum())
    n_neg = int((y_arr == 0).sum())
    if n_pos < MIN_CLASS_N or n_neg < MIN_CLASS_N:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {MIN_CLASS_N} niños por clase (Obesidad n={n_pos}, Normopeso n={n_neg})",
        )

    feat_cols = [c for c in X.columns if c in data.columns]
    X_arr = data[feat_cols].astype(float).to_numpy()

    C_value = 1.0 / LASSO_ALPHA
    n_splits = min(CV_FOLDS, n_pos, n_neg)
    if n_splits < 3:
        raise HTTPException(
            status_code=400,
            detail="Muy pocos casos por clase para validación cruzada (mínimo 3 pliegues estratificados).",
        )
    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    pipe = _make_lasso_fit_pipeline(C_value)
    pipe.fit(X_arr, y_arr)

    model = pipe.named_steps["model"]
    coefs = model.coef_[0]
    intercept = float(model.intercept_[0])

    roc = _compute_roc_metrics(pipe, X_arr, y_arr, cv)
    boot_ci = _bootstrap_or_ci(X_arr, y_arr, feat_cols, C_value)

    label_by_feat = {f["name"]: f["label"] for f in feature_labels}
    selected: List[Dict[str, Any]] = []
    for i, fname in enumerate(feat_cols):
        beta = float(coefs[i])
        if abs(beta) <= COEF_THRESHOLD:
            continue
        or_val = math.exp(beta)
        ci_or = boot_ci.get(fname, {}).get("ci_or")
        lo = ci_or["lo"] if ci_or else None
        hi = ci_or["hi"] if ci_or else None
        role_info = _classify_or_role(or_val, lo, hi)
        selected.append(
            {
                "feature": fname,
                "label": label_by_feat.get(fname, fname),
                "coefficient": _safe_round(beta, 4),
                "odds_ratio": _safe_round(or_val, 3),
                "ci_or": ci_or,
                "ci_beta": boot_ci.get(fname, {}).get("ci_beta"),
                "direction": "mayor riesgo" if beta > 0 else "menor riesgo",
                **role_info,
            }
        )
    selected.sort(key=lambda r: abs(r["coefficient"] or 0), reverse=True)

    n_riesgo = sum(1 for r in selected if r.get("role") == "riesgo")
    n_prot = sum(1 for r in selected if r.get("role") == "protector")
    n_incon = sum(1 for r in selected if r.get("role") == "inconcluso")

    used_labels = [pm["label"] for pm in predictors_meta if pm.get("available")]

    paragraphs = [
        f"Conjunto de predictores: «{preset_label}» ({len(used_labels)} variables: {', '.join(used_labels)}).",
        f"Se ajustó un modelo LASSO con {n_splits} pliegues de validación cruzada sobre n={len(data)} niños "
        f"(Obesidad={n_pos}, Normopeso={n_neg}). Se excluyeron {outcome_counts.get('n_excluded', 0)} con sobrepeso o bajo peso.",
        f"Capacidad discriminativa (AUC por CV): {roc['auc_cv']} ({roc['interpretation']['level']}). "
        f"{roc['interpretation']['text']}",
        f"El LASSO dejó {len(selected)} predictores con coeficiente distinto de cero (de {len(feat_cols)} evaluados). "
        f"Con IC 95%: {n_riesgo} factor(es) de riesgo, {n_prot} protector(es), {n_incon} no concluyente(s).",
    ]
    if selected:
        top = selected[0]
        ci_txt = top["ci_or"]["display"] if top.get("ci_or") else "IC no calculado"
        paragraphs.append(
            f"El predictor con mayor peso en el modelo es «{top['label']}» (OR={top['odds_ratio']}, IC 95% {ci_txt}; "
            f"{top.get('role_label', '')})."
        )
        riesgos = [r["label"] for r in selected if r.get("role") == "riesgo"]
        protectores = [r["label"] for r in selected if r.get("role") == "protector"]
        if riesgos:
            paragraphs.append(
                "Factores de riesgo (OR>1, IC no cruza 1): " + ", ".join(riesgos) + ". "
                "Sugieren que la exposición perinatal/materna se asocia con mayor probabilidad de obesidad infantil."
            )
        if protectores:
            paragraphs.append(
                "Factores protectores (OR<1, IC no cruza 1): " + ", ".join(protectores) + ". "
                "Sugieren menor probabilidad de obesidad cuando el factor está presente (p. ej. lactancia o curso normal)."
            )
        sm = next((r for r in selected if r["feature"] == "sm_m"), None)
        if sm:
            paragraphs.append(
                f"El síndrome metabólico materno permanece en el modelo (OR={sm['odds_ratio']}): "
                "coherente con programación fetal vía ambiente intrauterino."
            )
    else:
        paragraphs.append(
            "Ningún predictor quedó seleccionado con esta penalización; aumente la muestra o revise variables."
        )

    paragraphs.append(
        "Conclusión práctica: combine estos hallazgos con el IAP y el perfil lipídico. "
        "Los OR orientan hipótesis etiológicas; el AUC indica si el conjunto de variables perinatales "
        "distingue bien obesidad de normopeso en esta cohorte."
    )

    return {
        "variable_selection": {
            "preset_id": effective_preset,
            "preset_label": preset_label,
            "predictor_ids": resolved_ids,
            "predictor_labels": used_labels,
            "n_features_in_model": len(feat_cols),
            "min_complete_required": min_n,
        },
        "method": {
            "name": "Regresión logística LASSO",
            "penalty": "L1 (α=1)",
            "C": C_value,
            "cv_folds": n_splits,
            "cv_folds_requested": CV_FOLDS,
            "or_ci_method": f"Bootstrap percentil ({N_BOOT_OR} réplicas)",
            "note": (
                "Penalización LASSO fija (C=1/α). La validación cruzada se usa para estimar el AUC "
                "y los intervalos de confianza, no para elegir λ."
            ),
        },
        "outcome": {
            "label": "Obesidad (1) vs normopeso (0)",
            "excludes": ["Sobrepeso", "Bajo peso"],
            **outcome_counts,
            "n_model": len(data),
            "n_obesidad_model": n_pos,
            "n_normopeso_model": n_neg,
        },
        "discrimination": roc,
        "predictors": predictors_meta,
        "n_features": len(feat_cols),
        "n_selected": len(selected),
        "n_risk_factors": n_riesgo,
        "n_protective_factors": n_prot,
        "n_inconclusive_factors": n_incon,
        "intercept": _safe_round(intercept, 4),
        "selected_predictors": selected,
        "all_coefficients": [
            {
                "feature": feat_cols[i],
                "label": label_by_feat.get(feat_cols[i], feat_cols[i]),
                "coefficient": _safe_round(float(coefs[i]), 4),
                "odds_ratio": _safe_round(math.exp(float(coefs[i])), 3),
                "ci_or": boot_ci.get(feat_cols[i], {}).get("ci_or"),
                "selected": abs(float(coefs[i])) > COEF_THRESHOLD,
            }
            for i in range(len(feat_cols))
        ],
        "forest_plot": [
            {
                "label": r["label"],
                "odds_ratio": r["odds_ratio"],
                "ci_lo": r["ci_or"]["lo"] if r.get("ci_or") else None,
                "ci_hi": r["ci_or"]["hi"] if r.get("ci_or") else None,
                "ci_display": r["ci_or"]["display"] if r.get("ci_or") else None,
                "role": r.get("role"),
                "role_label": r.get("role_label"),
            }
            for r in selected
        ],
        "or_chart": [
            {
                "label": r["label"],
                "odds_ratio": r["odds_ratio"],
                "ci_lo": r["ci_or"]["lo"] if r.get("ci_or") else None,
                "ci_hi": r["ci_or"]["hi"] if r.get("ci_or") else None,
                "role": r.get("role"),
            }
            for r in selected
        ],
        "results_interpretation": _build_results_interpretation(
            roc=roc,
            selected=selected,
            n_features=len(feat_cols),
            n_riesgo=n_riesgo,
            n_prot=n_prot,
            n_incon=n_incon,
            n_model=len(data),
            n_pos=n_pos,
            n_neg=n_neg,
            preset_label=preset_label,
        ),
        "insight": {
            "title": "Resumen numérico",
            "paragraphs": paragraphs,
        },
    }


def _preset_schema_rows(df: pd.DataFrame, cols: List[str]) -> List[Dict[str, Any]]:
    y, _ = _build_outcome(df, cols)
    rows: List[Dict[str, Any]] = []
    for preset in LASSO_PREDICTOR_PRESETS:
        if preset["id"] == "custom":
            rows.append({**preset, "n_complete": None, "available_predictors": []})
            continue
        try:
            pids, _, _ = _resolve_predictor_ids(preset["id"], None)
        except HTTPException:
            continue
        X, meta, _ = _build_design_matrix(df, predictor_ids=pids)
        complete = pd.concat([y.rename("y"), X], axis=1).dropna()
        avail = [m["label"] for m in meta if m.get("available")]
        n_feat = len([c for c in X.columns])
        rows.append(
            {
                **preset,
                "predictor_ids": pids,
                "available_predictors": avail,
                "n_features": n_feat,
                "n_complete": int(len(complete)),
                "min_complete_required": _min_complete_n(n_feat),
                "ready": len(complete) >= _min_complete_n(n_feat),
            }
        )
    return rows


def _build_lasso_schema(df: pd.DataFrame) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    _, outcome_counts = _build_outcome(df, cols)
    y, _ = _build_outcome(df, cols)

    choosable = []
    for spec in LASSO_PREDICTOR_SPECS:
        col = _match_column(cols, spec["column"])
        choosable.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "kind": spec["kind"],
                "available": bool(col),
            }
        )

    preset_rows = _preset_schema_rows(df, cols)
    default_preset = DEFAULT_PRESET_ID
    default_row = next((p for p in preset_rows if p["id"] == default_preset), None)
    if default_row and not default_row.get("ready"):
        fallback = next((p for p in preset_rows if p.get("ready") and p["id"] != "custom"), None)
        if fallback:
            default_preset = fallback["id"]

    _, predictors_meta, _ = _build_design_matrix(df)
    X_all, _, _ = _build_design_matrix(df)
    complete_all = pd.concat([y.rename("y"), X_all], axis=1).dropna()
    n_pos = int((complete_all["y"] == 1).sum()) if len(complete_all) else 0
    n_neg = int((complete_all["y"] == 0).sum()) if len(complete_all) else 0
    any_ready = any(p.get("ready") for p in preset_rows)

    return {
        "title": "Regresión logística LASSO — obesidad infantil",
        "description": (
            "Predice obesidad (sí/no) frente a normopeso. Elija un conjunto de predictores por tema "
            "(radios) o personalice la lista; si el AUC con todas las variables es bajo, pruebe un núcleo más pequeño."
        ),
        "interpretation_guide": _interpretation_guide(),
        "predictor_presets": preset_rows,
        "default_preset_id": default_preset,
        "choosable_predictors": choosable,
        "predictor_specs": LASSO_PREDICTOR_SPECS,
        "predictors": predictors_meta,
        "outcome": outcome_counts,
        "n_complete": int(len(complete_all)),
        "n_obesidad_complete": n_pos,
        "n_normopeso_complete": n_neg,
        "ready": any_ready and _SKLEARN_OK,
        "sklearn_available": _SKLEARN_OK,
        "min_complete_n": MIN_COMPLETE_N,
        "min_class_n": MIN_CLASS_N,
    }


def register_lasso_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/fetal/lasso/schema")
    async def lasso_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_build_lasso_schema(df)}

    @router.post("/datasets/{dataset_id}/fetal/lasso/run")
    async def lasso_run(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, _, _ = _get_df(dataset_id)
        return {
            "success": True,
            **_run_lasso(
                df,
                preset_id=body.get("preset_id"),
                predictor_ids=body.get("predictor_ids"),
            ),
        }
