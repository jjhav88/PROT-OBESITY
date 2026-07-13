"""
Análisis avanzado — mediación exploratoria (bootstrap).
Exposición materna seleccionable → IMC (mediador) → triglicéridos del niño.
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
MIN_MEDIATION_N = 25
MIN_MEDIATION_N_RECOMMENDED = 40
N_BOOT = 5000
BOOT_CONF = 0.95
BOOT_SEED = 42

MATERNAL_EXPOSURE_SPECS: List[Dict[str, Any]] = [
    {"id": "obes_m", "column": "obes_m", "label": "Obesidad materna", "priority": 1},
    {"id": "diabetes_m", "column": "diabetes_m", "label": "Diabetes materna", "priority": 2},
    {"id": "preclamsia_m", "column": "preclamsia_m", "label": "Preeclampsia materna", "priority": 3},
    {"id": "HTA_m", "column": "HTA_m", "label": "Hipertensión materna (HTA)", "priority": 4},
    {"id": "hipertrigli_m", "column": "hipertrigli_m", "label": "Hipertrigliceridemia materna", "priority": 5},
    {"id": "hipercolesterolemia_m", "column": "hipercolesterolemia_m", "label": "Hipercolesterolemia materna", "priority": 6},
    {"id": "sm_m", "column": "sm_m", "label": "Síndrome metabólico materno", "priority": 7},
]

MEDIATOR_SPEC = {"id": "imc", "column": "IMC", "label": "IMC actual del niño"}
OUTCOME_SPEC = {"id": "trigliceridos", "column": "Trigliceridos", "label": "Triglicéridos del niño"}

EXPOSURE_DEFAULT_PRIORITY = ["obes_m", "diabetes_m", "preclamsia_m", "HTA_m", "hipertrigli_m", "hipercolesterolemia_m", "sm_m"]

MEDIATION_INSIGHT_INTRO = (
    "Mediación exploratoria: separa si el antecedente materno elegido se asocia con triglicéridos "
    "del niño por vía directa (programación fetal) o también a través del IMC actual "
    "(transmisión posnatal de obesidad)."
)


def _exposure_spec(exposure_id: str) -> Dict[str, Any]:
    spec = next((s for s in MATERNAL_EXPOSURE_SPECS if s["id"] == exposure_id), None)
    if not spec:
        raise HTTPException(status_code=400, detail=f"Exposición no válida: {exposure_id}")
    return spec


def _hypothesis_text(exposure_label: str) -> str:
    return (
        f"El efecto de {exposure_label} sobre los triglicéridos del niño "
        f"está mediado parcialmente por el IMC actual."
    )


def _mediation_base_columns(df: pd.DataFrame) -> Dict[str, Optional[str]]:
    cols = [str(c) for c in df.columns]
    return {
        "m": _match_column(cols, MEDIATOR_SPEC["column"]),
        "y": _match_column(cols, OUTCOME_SPEC["column"]),
        "edad": _match_column(cols, "Edad"),
        "sexo": _match_column(cols, "Sexo"),
    }


def _exposure_complete_case_stats(df: pd.DataFrame, exposure_col: str) -> Dict[str, Any]:
    """Casos con exposición + IMC + triglicéridos (+ edad/sexo si existen)."""
    base = _mediation_base_columns(df)
    m_col, y_col = base["m"], base["y"]
    if not m_col or not y_col:
        return {"n_complete": 0, "n_yes": 0, "n_no": 0, "has_variation": False, "n_valid": 0}

    work = pd.DataFrame(
        {
            "x": _encode_binary(df[exposure_col]),
            "m": pd.to_numeric(df[m_col], errors="coerce"),
            "y": pd.to_numeric(df[y_col], errors="coerce"),
        }
    )
    if base["edad"]:
        work["edad"] = pd.to_numeric(df[base["edad"]], errors="coerce")
    if base["sexo"]:
        work["sexo"] = _encode_sex(df[base["sexo"]])
    work = work.dropna()
    n_complete = int(len(work))
    n_yes = int((work["x"] == 1).sum()) if n_complete else 0
    n_no = int((work["x"] == 0).sum()) if n_complete else 0
    has_variation = work["x"].nunique() >= 2 if n_complete else False
    enc_raw = _encode_binary(df[exposure_col]).dropna()
    return {
        "n_complete": n_complete,
        "n_valid": int(len(enc_raw)),
        "n_yes": n_yes,
        "n_no": n_no,
        "has_variation": has_variation,
    }


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


def _encode_binary(series: pd.Series) -> pd.Series:
    raw = series.astype(str).str.strip().str.lower()
    raw = raw.replace({"": np.nan, "nan": np.nan, "none": np.nan})
    pos = {"si", "sí", "s", "yes", "y", "1", "true", "verdadero"}
    neg = {"no", "n", "0", "false", "falso"}
    out = pd.Series(np.nan, index=series.index, dtype=float)
    out[raw.isin(pos)] = 1.0
    out[raw.isin(neg)] = 0.0
    return out


def _encode_sex(series: pd.Series) -> pd.Series:
    raw = series.astype(str).str.strip().str.upper()
    out = pd.Series(np.nan, index=series.index, dtype=float)
    out[raw.isin(["M", "MASCULINO", "HOMBRE", "1"])] = 1.0
    out[raw.isin(["F", "FEMENINO", "MUJER", "0"])] = 0.0
    return out


def _ols_fit(y: np.ndarray, X: np.ndarray) -> Optional[Dict[str, Any]]:
    if scipy_stats is None:
        return None
    n, k = X.shape
    if n < k + 2:
        return None
    try:
        beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
        y_hat = X @ beta
        resid = y - y_hat
        ss_res = float(np.sum(resid**2))
        ss_tot = float(np.sum((y - np.mean(y)) ** 2))
        if ss_tot <= 0:
            return None
        df_resid = n - k
        if df_resid <= 0:
            return None
        mse = ss_res / df_resid
        cov = mse * np.linalg.inv(X.T @ X)
        se = np.sqrt(np.maximum(np.diag(cov), 0))
        with np.errstate(divide="ignore", invalid="ignore"):
            t_stats = np.where(se > 0, beta / se, np.nan)
        p_vals = 2 * (1 - scipy_stats.t.cdf(np.abs(t_stats), df_resid))
        return {"beta": beta, "se": se, "t": t_stats, "p": p_vals, "n": n}
    except np.linalg.LinAlgError:
        return None


def _build_ci(lo: Optional[float], hi: Optional[float]) -> Dict[str, Any]:
    if lo is None or hi is None or math.isnan(lo) or math.isnan(hi):
        return {"display": "—", "lo": None, "hi": None, "significant": None}
    sig = bool(lo > 0 or hi < 0)
    return {
        "lo": _safe_round(lo, 4),
        "hi": _safe_round(hi, 4),
        "display": f"[{_safe_round(lo, 4)}, {_safe_round(hi, 4)}]",
        "significant": sig,
    }


def _bootstrap_p_two_sided(samples: List[float]) -> Optional[float]:
    if len(samples) < 80:
        return None
    arr = np.array(samples, dtype=float)
    if np.all(arr == 0):
        return 1.0
    prop = min(float(np.mean(arr <= 0)), float(np.mean(arr >= 0)))
    return _safe_round(min(1.0, 2 * prop), 4)


def _prepare_mediation_data(
    df: pd.DataFrame, exposure_id: str, adjust_edad_sexo: bool = True
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, Dict[str, Any]]:
    spec = _exposure_spec(exposure_id)
    cols = [str(c) for c in df.columns]
    x_col = _match_column(cols, spec["column"])
    m_col = _match_column(cols, MEDIATOR_SPEC["column"])
    y_col = _match_column(cols, OUTCOME_SPEC["column"])
    edad_col = _match_column(cols, "Edad")
    sexo_col = _match_column(cols, "Sexo")
    missing = []
    if not x_col:
        missing.append(spec["label"])
    if not m_col:
        missing.append(MEDIATOR_SPEC["label"])
    if not y_col:
        missing.append(OUTCOME_SPEC["label"])
    if missing:
        raise HTTPException(status_code=404, detail="Variables no encontradas: " + ", ".join(missing))

    x_enc = _encode_binary(df[x_col])
    if int(x_enc.notna().sum()) > 0 and x_enc.dropna().nunique() < 2:
        raise HTTPException(
            status_code=400,
            detail=f"{spec['label']} no tiene variación (todos Sí o todos No); elija otra exposición",
        )

    work = pd.DataFrame(
        {
            "x": x_enc,
            "m": pd.to_numeric(df[m_col], errors="coerce"),
            "y": pd.to_numeric(df[y_col], errors="coerce"),
        }
    )
    if adjust_edad_sexo and edad_col and sexo_col:
        work["edad"] = pd.to_numeric(df[edad_col], errors="coerce")
        work["sexo"] = _encode_sex(df[sexo_col])
    else:
        work["edad"] = 0.0
        work["sexo"] = 0.0
        adjust_edad_sexo = False

    work = work.dropna()
    n = len(work)
    if n < MIN_MEDIATION_N:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {MIN_MEDIATION_N} observaciones completas (n={n})",
        )
    if work["x"].nunique() < 2:
        raise HTTPException(
            status_code=400,
            detail=f"{spec['label']} sin variación en casos completos; elija otra exposición",
        )

    meta = {
        "n": int(n),
        "exposure_id": exposure_id,
        "exposure_label": spec["label"],
        "exposure_column": x_col,
        "n_exposure_yes": int((work["x"] == 1).sum()),
        "n_exposure_no": int((work["x"] == 0).sum()),
        "adjust_edad_sexo": adjust_edad_sexo,
        "columns": {"x": x_col, "m": m_col, "y": y_col},
    }
    return (
        work["y"].to_numpy(dtype=float),
        work["x"].to_numpy(dtype=float),
        work["m"].to_numpy(dtype=float),
        work["edad"].to_numpy(dtype=float),
        work["sexo"].to_numpy(dtype=float),
        meta,
    )


def _estimate_mediation_point(
    y: np.ndarray, x: np.ndarray, m: np.ndarray, edad: np.ndarray, sexo: np.ndarray
) -> Optional[Dict[str, float]]:
    n = len(y)
    X_a = np.column_stack([np.ones(n), x, edad, sexo])
    X_total = X_a
    X_full = np.column_stack([np.ones(n), x, m, edad, sexo])

    fit_a = _ols_fit(m, X_a)
    fit_total = _ols_fit(y, X_total)
    fit_full = _ols_fit(y, X_full)
    if not fit_a or not fit_total or not fit_full:
        return None

    a = float(fit_a["beta"][1])
    c = float(fit_total["beta"][1])
    c_prime = float(fit_full["beta"][1])
    b = float(fit_full["beta"][2])
    indirect = a * b
    prop = indirect / c if abs(c) > 1e-12 else None
    return {
        "a": a,
        "b": b,
        "c": c,
        "c_prime": c_prime,
        "indirect": indirect,
        "prop_mediated": prop,
        "p_a": float(fit_a["p"][1]),
        "p_b": float(fit_full["p"][2]),
        "p_c": float(fit_total["p"][1]),
        "p_c_prime": float(fit_full["p"][1]),
    }


def _bootstrap_mediation(
    y: np.ndarray, x: np.ndarray, m: np.ndarray, edad: np.ndarray, sexo: np.ndarray, n_boot: int = N_BOOT
) -> Dict[str, Any]:
    rng = np.random.default_rng(BOOT_SEED)
    n = len(y)
    boot_total: List[float] = []
    boot_direct: List[float] = []
    boot_indirect: List[float] = []
    boot_a: List[float] = []
    boot_b: List[float] = []

    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        est = _estimate_mediation_point(y[idx], x[idx], m[idx], edad[idx], sexo[idx])
        if est is None:
            continue
        boot_total.append(est["c"])
        boot_direct.append(est["c_prime"])
        boot_indirect.append(est["indirect"])
        boot_a.append(est["a"])
        boot_b.append(est["b"])

    alpha = (1 - BOOT_CONF) / 2
    pct_lo = alpha * 100
    pct_hi = (1 - alpha) * 100

    def ci(samples: List[float]) -> Tuple[Optional[float], Optional[float]]:
        if len(samples) < 80:
            return None, None
        arr = np.array(samples, dtype=float)
        return float(np.percentile(arr, pct_lo)), float(np.percentile(arr, pct_hi))

    return {
        "n_success": len(boot_indirect),
        "total_ci": ci(boot_total),
        "direct_ci": ci(boot_direct),
        "indirect_ci": ci(boot_indirect),
        "a_ci": ci(boot_a),
        "b_ci": ci(boot_b),
        "boot_total": boot_total,
        "boot_direct": boot_direct,
        "boot_indirect": boot_indirect,
    }


def _sobel_indirect(a: float, b: float, se_a: float, se_b: float) -> Dict[str, Any]:
    if scipy_stats is None or se_a <= 0 or se_b <= 0:
        return {"z": None, "p_value": None}
    ab = a * b
    se_ab = math.sqrt((b**2) * (se_a**2) + (a**2) * (se_b**2))
    if se_ab <= 0:
        return {"z": None, "p_value": None}
    z = ab / se_ab
    p = float(2 * (1 - scipy_stats.norm.cdf(abs(z))))
    return {"z": _safe_round(z, 4), "p_value": _safe_round(p, 4)}


def _build_insight(
    est: Dict[str, float], boot: Dict[str, Any], n: int, exposure_label: str
) -> Dict[str, Any]:
    ind_ci = boot.get("indirect_ci") or (None, None)
    dir_ci = boot.get("direct_ci") or (None, None)
    ind_sig = ind_ci[0] is not None and ind_ci[1] is not None and (ind_ci[0] > 0 or ind_ci[1] < 0)
    dir_sig = dir_ci[0] is not None and dir_ci[1] is not None and (dir_ci[0] > 0 or dir_ci[1] < 0)
    prop = est.get("prop_mediated")
    paragraphs: List[str] = []
    exp = exposure_label

    if ind_sig and dir_sig:
        paragraphs.append(
            f"Hay evidencia de mediación parcial: efecto indirecto ({exp} → IMC → triglicéridos) "
            f"y efecto directo ({exp} → triglicéridos sin pasar por IMC). Compatible con programación fetal "
            "más transmisión posnatal de obesidad."
        )
    elif ind_sig and not dir_sig:
        paragraphs.append(
            "El efecto indirecto vía IMC es relevante; el efecto directo no es claro con estos datos. "
            f"Sugiere que la asociación {exp}–triglicéridos operaría principalmente por el estado nutricional actual."
        )
    elif dir_sig and not ind_sig:
        paragraphs.append(
            "Predomina un efecto directo (programación fetal / vía no explicada por IMC actual); "
            "el canal IMC no está bien sustentado en esta muestra."
        )
    else:
        paragraphs.append(
            "Ni el efecto directo ni el indirecto son concluyentes con n pequeño; interprete como exploración de mecanismo."
        )

    if prop is not None and not math.isnan(prop):
        pct = abs(prop) * 100
        paragraphs.append(
            f"Proporción mediada estimada ≈ {_safe_round(pct, 1)}% del efecto total "
            f"(solo referencia; inestable con muestras pequeñas)."
        )

    paragraphs.append(
        f"Con n={n} y {N_BOOT} réplicas bootstrap, los intervalos son orientativos. "
        "Confirme con un estadístico antes de inferencia causal fuerte."
    )

    return {
        "title": "Programación fetal vs transmisión posnatal (IMC)",
        "paragraphs": paragraphs,
        "indirect_significant": ind_sig,
        "direct_significant": dir_sig,
    }


def _build_exposure_options(df: pd.DataFrame) -> List[Dict[str, Any]]:
    cols = [str(c) for c in df.columns]
    options: List[Dict[str, Any]] = []
    for spec in MATERNAL_EXPOSURE_SPECS:
        col = _match_column(cols, spec["column"])
        if not col:
            options.append(
                {
                    **spec,
                    "column": None,
                    "available": False,
                    "has_variation": False,
                    "n_valid": 0,
                    "n_yes": 0,
                    "n_no": 0,
                    "note": "No está en la base",
                }
            )
            continue
        stats = _exposure_complete_case_stats(df, col)
        n_use = stats["n_complete"]
        viable = n_use >= MIN_MEDIATION_N and stats["has_variation"]
        note = None
        if not stats["has_variation"]:
            note = "Sin variación (todos Sí o todos No)"
        elif n_use < MIN_MEDIATION_N:
            note = f"Pocos casos completos (n={n_use})"
        elif n_use < MIN_MEDIATION_N_RECOMMENDED:
            note = f"Exploratorio (n={n_use}; ideal ≥{MIN_MEDIATION_N_RECOMMENDED})"
        options.append(
            {
                **spec,
                "column": col,
                "available": viable,
                "has_variation": stats["has_variation"],
                "n_valid": stats["n_valid"],
                "n_complete": n_use,
                "n_yes": stats["n_yes"],
                "n_no": stats["n_no"],
                "note": note,
                "exploratory": bool(viable and n_use < MIN_MEDIATION_N_RECOMMENDED),
            }
        )
    return options


def _default_exposure_id(options: List[Dict[str, Any]]) -> Optional[str]:
    viable = {o["id"]: o for o in options if o.get("available")}
    for eid in EXPOSURE_DEFAULT_PRIORITY:
        if eid in viable:
            return eid
    return next(iter(viable.keys()), None)


def _build_mediation_schema(df: pd.DataFrame) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    m_col = _match_column(cols, MEDIATOR_SPEC["column"])
    y_col = _match_column(cols, OUTCOME_SPEC["column"])
    edad_col = _match_column(cols, "Edad")
    sexo_col = _match_column(cols, "Sexo")

    def count_ok(col: Optional[str], encoder=None) -> int:
        if not col:
            return 0
        s = df[col]
        if encoder:
            s = encoder(s)
        else:
            s = pd.to_numeric(s, errors="coerce")
        return int(s.notna().sum())

    n_m = count_ok(m_col)
    n_y = count_ok(y_col)
    exposures = _build_exposure_options(df)
    default_id = _default_exposure_id(exposures)
    default_label = next((e["label"] for e in exposures if e["id"] == default_id), None)

    return {
        "exposures": exposures,
        "default_exposure_id": default_id,
        "mediator": {**MEDIATOR_SPEC, "column": m_col, "n_valid": n_m},
        "outcome": {**OUTCOME_SPEC, "column": y_col, "n_valid": n_y},
        "hypothesis": _hypothesis_text(default_label) if default_label else (
            "Seleccione una exposición materna con variación (Sí/No) en la base."
        ),
        "path_labels": {
            "m": MEDIATOR_SPEC["label"],
            "y": OUTCOME_SPEC["label"],
        },
        "method_note": (
            f"Mediación por regresión secuencial (enfoque tipo mediation/lavaan) "
            f"con {N_BOOT} réplicas bootstrap para IC 95% de efectos total, directo e indirecto. "
            "Ajuste por edad y sexo del niño. La exposición debe ser dicotómica con Sí y No."
        ),
        "min_n": MIN_MEDIATION_N,
        "min_n_recommended": MIN_MEDIATION_N_RECOMMENDED,
        "n_boot": N_BOOT,
        "ready": bool(default_id) and bool(m_col) and bool(y_col),
        "insight_preview": MEDIATION_INSIGHT_INTRO,
    }


def _run_mediation(df: pd.DataFrame, exposure_id: str, adjust_edad_sexo: bool = True) -> Dict[str, Any]:
    spec = _exposure_spec(exposure_id)
    exp_label = spec["label"]
    exp_short = spec["id"]
    y, x, m, edad, sexo, meta = _prepare_mediation_data(df, exposure_id, adjust_edad_sexo)
    point = _estimate_mediation_point(y, x, m, edad, sexo)
    if not point:
        raise HTTPException(status_code=400, detail="Modelo de mediación no estimable")

    n = meta["n"]
    X_a = np.column_stack([np.ones(n), x, edad, sexo])
    X_full = np.column_stack([np.ones(n), x, m, edad, sexo])
    fit_a = _ols_fit(m, X_a)
    fit_full = _ols_fit(y, X_full)
    sobel = _sobel_indirect(
        point["a"],
        point["b"],
        float(fit_a["se"][1]) if fit_a else 0,
        float(fit_full["se"][2]) if fit_full else 0,
    )

    boot = _bootstrap_mediation(y, x, m, edad, sexo)
    t_lo, t_hi = boot["total_ci"]
    d_lo, d_hi = boot["direct_ci"]
    i_lo, i_hi = boot["indirect_ci"]

    effects = [
        {
            "effect": "Efecto total (c)",
            "symbol": "c",
            "estimate": _safe_round(point["c"], 4),
            "ci": _build_ci(t_lo, t_hi),
            "p_bootstrap": _bootstrap_p_two_sided(boot.get("boot_total", [])),
            "description": f"{exp_label} → triglicéridos (sin mediador en el modelo)",
        },
        {
            "effect": "Efecto directo (c′)",
            "symbol": "c′",
            "estimate": _safe_round(point["c_prime"], 4),
            "ci": _build_ci(d_lo, d_hi),
            "p_bootstrap": _bootstrap_p_two_sided(boot.get("boot_direct", [])),
            "description": f"{exp_label} → triglicéridos controlando IMC (programación fetal / vía no mediada)",
        },
        {
            "effect": "Efecto indirecto (a×b)",
            "symbol": "ab",
            "estimate": _safe_round(point["indirect"], 4),
            "ci": _build_ci(i_lo, i_hi),
            "p_bootstrap": _bootstrap_p_two_sided(boot.get("boot_indirect", [])),
            "description": f"{exp_label} → IMC → triglicéridos (transmisión posnatal)",
        },
    ]

    prop = point.get("prop_mediated")
    paths = {
        "a": {
            "label": f"a: {exp_short} → IMC",
            "estimate": _safe_round(point["a"], 4),
            "p": _p_fmt(point.get("p_a")),
            "ci": _build_ci(*boot.get("a_ci", (None, None))),
        },
        "b": {
            "label": "b: IMC → triglicéridos (ajustado)",
            "estimate": _safe_round(point["b"], 4),
            "p": _p_fmt(point.get("p_b")),
            "ci": _build_ci(*boot.get("b_ci", (None, None))),
        },
        "c_prime": {
            "label": f"c′: {exp_short} → triglicéridos | IMC",
            "estimate": _safe_round(point["c_prime"], 4),
            "p": _p_fmt(point.get("p_c_prime")),
            "ci": _build_ci(d_lo, d_hi),
        },
    }

    return {
        "n": meta["n"],
        "exposure_id": exposure_id,
        "exposure_label": exp_label,
        "exposure_short": exp_short,
        "n_exposure_yes": meta["n_exposure_yes"],
        "n_exposure_no": meta["n_exposure_no"],
        "adjust_edad_sexo": meta["adjust_edad_sexo"],
        "hypothesis": _hypothesis_text(exp_label),
        "path_labels": {
            "x": exp_label,
            "m": MEDIATOR_SPEC["label"],
            "y": OUTCOME_SPEC["label"],
        },
        "effects": effects,
        "paths": paths,
        "proportion_mediated": _safe_round(prop * 100, 2) if prop is not None else None,
        "proportion_mediated_note": (
            "Porcentaje del efecto total explicado por la vía IMC (puede ser >100% o negativo si efectos en direcciones opuestas)."
            if prop is not None
            else "No calculable (efecto total cercano a cero)."
        ),
        "sobel": sobel,
        "bootstrap": {
            "replications": N_BOOT,
            "successful": boot.get("n_success"),
            "confidence": int(BOOT_CONF * 100),
        },
        "models": {
            "path_a": f"IMC ~ {exp_short} + edad + sexo",
            "path_bc": f"Triglicéridos ~ {exp_short} + IMC + edad + sexo",
            "total": f"Triglicéridos ~ {exp_short} + edad + sexo",
        },
        "insight": _build_insight(point, boot, meta["n"], exp_label),
        "caveat": (
            "Análisis exploratorio: no establece causalidad. Con muestras pequeñas los efectos indirectos "
            "suelen ser inestables; use los resultados para generar hipótesis, no conclusiones definitivas."
        ),
        "small_sample_warning": bool(meta["n"] < MIN_MEDIATION_N_RECOMMENDED),
    }


def register_mediation_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/avanzado/mediation/schema")
    async def mediation_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_build_mediation_schema(df)}

    @router.post("/datasets/{dataset_id}/avanzado/mediation/run")
    async def mediation_run(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, _, _ = _get_df(dataset_id)
        adjust = body.get("adjust_edad_sexo", True)
        if isinstance(adjust, str):
            adjust = adjust.lower() in ("1", "true", "yes", "si", "sí")
        schema = _build_mediation_schema(df)
        exposure_id = body.get("exposure_id") or body.get("predictor_id") or schema.get("default_exposure_id")
        if not exposure_id:
            raise HTTPException(
                status_code=400,
                detail="No hay exposición materna con variación Sí/No; revise obesidad, diabetes u otros antecedentes",
            )
        opt = next((e for e in schema.get("exposures", []) if e["id"] == exposure_id), None)
        if not opt or not opt.get("available"):
            raise HTTPException(
                status_code=400,
                detail=opt.get("note") if opt else f"Exposición no disponible: {exposure_id}",
            )
        return {"success": True, **_run_mediation(df, str(exposure_id), bool(adjust))}
