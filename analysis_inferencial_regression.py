"""
Regresión lineal — antecedentes maternos y perfil lipídico del niño (programación fetal).
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
MIN_REGRESSION_N = 20
N_BOOT = 2000
BOOT_CONF = 0.95
DW_LOW = 1.5
DW_HIGH = 2.5
VIF_OK = 5.0
VIF_WARN = 10.0

MATERNAL_PREDICTOR_SPECS: List[Dict[str, Any]] = [
    {"id": "sm_m", "column": "sm_m", "label": "Síndrome metabólico materno"},
    {"id": "obes_m", "column": "obes_m", "label": "Obesidad materna"},
    {"id": "diabetes_m", "column": "diabetes_m", "label": "Diabetes materna"},
    {"id": "HTA_m", "column": "HTA_m", "label": "Hipertensión materna (HTA)"},
    {"id": "preclamsia_m", "column": "preclamsia_m", "label": "Preeclampsia materna"},
    {"id": "hipercolesterolemia_m", "column": "hipercolesterolemia_m", "label": "Hipercolesterolemia materna"},
    {"id": "hipertrigli_m", "column": "hipertrigli_m", "label": "Hipertrigliceridemia materna"},
]

LIPID_OUTCOME_SPECS: List[Dict[str, Any]] = [
    {"id": "trigliceridos", "patterns": ["trigliceridos"], "label": "Triglicéridos"},
    {"id": "colesterol_total", "patterns": ["colesterol_total"], "label": "Colesterol total"},
    {"id": "glucosa", "patterns": ["glucosa"], "label": "Glucosa"},
    {"id": "ldl", "patterns": ["ldl_colesterol", "ldl"], "label": "LDL colesterol"},
    {"id": "hdl", "patterns": ["hdl_colesterol", "hdl"], "label": "HDL colesterol"},
    {"id": "no_hdl", "patterns": ["no_hdl_colesterol", "no_hdl"], "label": "Colesterol no-HDL"},
]

ANTHRO_OUTCOME_SPECS: List[Dict[str, Any]] = [
    {"id": "imc", "patterns": ["imc"], "label": "IMC"},
    {"id": "peso_nacer", "patterns": ["peso_nacer", "peso_nacimiento"], "label": "Peso al nacer"},
    {"id": "talla_nacer", "patterns": ["talla_nacer", "talla_nacimiento"], "label": "Talla al nacer"},
    {"id": "perimetro_braquial", "patterns": ["perimetro_braquial_cm", "perimetro_braquial"], "label": "Perímetro braquial (cm)"},
    {"id": "perimetro_cefalico", "patterns": ["perimetro_cefalico_cm", "perimetro_cefalico"], "label": "Perímetro cefálico (cm)"},
    {
        "id": "circunferencia_cintura",
        "patterns": ["circunferencia_cintura_cm", "circunferencia_cintura"],
        "label": "Circunferencia de cintura (cm)",
    },
]

OUTCOME_PROFILES: Dict[str, Dict[str, Any]] = {
    "lipid_metabolic": {
        "id": "lipid_metabolic",
        "label": "Perfil lipídico / metabólico",
        "specs": LIPID_OUTCOME_SPECS,
    },
    "anthropometric": {
        "id": "anthropometric",
        "label": "Perfil antropométrico",
        "specs": ANTHRO_OUTCOME_SPECS,
    },
}

COVARIATE_SPECS: List[Dict[str, str]] = [
    {"id": "edad", "column": "Edad", "label": "Edad del niño (años)"},
    {"id": "sexo", "column": "Sexo", "label": "Sexo del niño"},
]

FETAL_PROGRAMMING_INSIGHT = (
    "Los antecedentes maternos de síndrome metabólico y dislipidemia pueden programar el metabolismo "
    "del feto vía placenta y ambiente intrauterino. Si el síndrome metabólico materno se asocia con "
    "triglicéridos más altos en el niño —incluso ajustando por edad y sexo—, ello apoya la hipótesis "
    "de programación fetal más allá del estado nutricional actual del menor."
)


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


def _match_column_patterns(cols: List[str], patterns: List[str]) -> Optional[str]:
    for pattern in patterns:
        col = _match_column(cols, pattern)
        if col:
            return col
    return None


def _resolve_outcome_spec(outcome_id: str) -> Optional[Dict[str, Any]]:
    for profile in OUTCOME_PROFILES.values():
        for spec in profile.get("specs", []):
            if spec["id"] == outcome_id:
                return {**spec, "profile_id": profile["id"], "profile_label": profile["label"]}
    return None


def _resolve_outcome_column(cols: List[str], ospec: Dict[str, Any]) -> Optional[str]:
    patterns = ospec.get("patterns") or ([ospec["column"]] if ospec.get("column") else [])
    return _match_column_patterns(cols, patterns)


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


def _build_ci_dict(lo: Optional[float], hi: Optional[float]) -> Optional[Dict[str, Any]]:
    if lo is None or hi is None:
        return None
    if math.isnan(lo) or math.isnan(hi):
        return None
    lo_f, hi_f = float(lo), float(hi)
    return {
        "lo": _safe_round(lo_f, 4),
        "hi": _safe_round(hi_f, 4),
        "display": f"[{_safe_round(lo_f, 4)}, {_safe_round(hi_f, 4)}]",
        "label": "IC 95% (bootstrap)",
    }


def _ols_residuals(y: np.ndarray, X: np.ndarray) -> Optional[np.ndarray]:
    n, k = X.shape
    if n < k + 1:
        return None
    try:
        beta, _, _, _ = np.linalg.lstsq(X, y, rcond=None)
        return y - X @ beta
    except np.linalg.LinAlgError:
        return None


def _durbin_watson(residuals: np.ndarray) -> Optional[float]:
    e = residuals[np.isfinite(residuals)]
    if len(e) < 3:
        return None
    diff = np.diff(e)
    denom = float(np.sum(e**2))
    if denom <= 0:
        return None
    return float(np.sum(diff**2) / denom)


def _residual_normality(residuals: np.ndarray) -> Dict[str, Any]:
    e = residuals[np.isfinite(residuals)]
    n = len(e)
    out: Dict[str, Any] = {
        "test": "—",
        "statistic": None,
        "p_value": None,
        "ok": False,
        "interpretation": "No calculable",
    }
    if n < 8 or scipy_stats is None:
        return out
    if n < 50:
        stat, p = scipy_stats.shapiro(e)
        out["test"] = "Shapiro-Wilk (residuos)"
    else:
        std = float(np.std(e, ddof=1))
        if std <= 0:
            return out
        stat, p = scipy_stats.kstest(e, "norm", args=(float(np.mean(e)), std))
        out["test"] = "Kolmogorov-Smirnov (residuos)"
    out["statistic"] = _safe_round(float(stat), 4)
    out["p_value"] = _safe_round(float(p), 4)
    out["ok"] = bool(p >= ALPHA)
    out["interpretation"] = (
        "Residuos compatibles con normalidad (p≥0,05)"
        if out["ok"]
        else "Residuos no normales (p<0,05)"
    )
    return out


def _simple_linearity(y: np.ndarray, x: np.ndarray) -> Dict[str, Any]:
    """Curvatura: término cuadrático no significativo (predictor continuo) o dicotómico por construcción."""
    x = x.astype(float)
    uniq = np.unique(x[np.isfinite(x)])
    if len(uniq) <= 2:
        return {
            "test": "Predictor dicotómico",
            "statistic": None,
            "p_value": None,
            "ok": True,
            "interpretation": "Con predictor binario (Sí/No) la relación es lineal por construcción.",
        }
    if scipy_stats is None or len(y) < MIN_REGRESSION_N:
        return {"test": "—", "ok": False, "interpretation": "No calculable"}
    x2 = x**2
    X = np.column_stack([np.ones(len(y)), x, x2])
    fit = _ols_fit(y, X)
    if not fit or len(fit["p"]) < 3:
        return {"test": "—", "ok": False, "interpretation": "No calculable"}
    p_quad = float(fit["p"][2])
    ok = bool(p_quad >= ALPHA)
    return {
        "test": "Prueba de curvatura (término x²)",
        "statistic": _safe_round(float(fit["t"][2]), 4),
        "p_value": _safe_round(p_quad, 4),
        "ok": ok,
        "interpretation": (
            "Sin evidencia de curvatura; relación aproximadamente lineal (p≥0,05)"
            if ok
            else "Posible no linealidad (curvatura significativa, p<0,05)"
        ),
    }


def _vif_rows(X_pred: np.ndarray, labels: List[str]) -> List[Dict[str, Any]]:
    """VIF por columna de predictores (sin intercepto)."""
    rows: List[Dict[str, Any]] = []
    k = X_pred.shape[1]
    if k < 2:
        for lab in labels:
            rows.append({"predictor": lab, "vif": 1.0, "ok": True, "flag": "ok"})
        return rows
    for j in range(k):
        y_j = X_pred[:, j]
        others = np.delete(X_pred, j, axis=1)
        X_aux = np.column_stack([np.ones(len(y_j)), others])
        fit = _ols_fit(y_j, X_aux)
        if not fit or fit["r2"] >= 1 - 1e-10:
            vif = float("inf")
        else:
            vif = float(1.0 / (1.0 - fit["r2"]))
        if vif <= VIF_OK:
            flag, ok = "ok", True
        elif vif <= VIF_WARN:
            flag, ok = "warning", False
        else:
            flag, ok = "alert", False
        rows.append(
            {
                "predictor": labels[j],
                "vif": _safe_round(vif, 2) if math.isfinite(vif) else "—",
                "ok": ok,
                "flag": flag,
            }
        )
    return rows


def _recommend_simple(norm: Dict[str, Any], lin: Dict[str, Any], dw: Dict[str, Any]) -> Dict[str, Any]:
    ok = bool(norm.get("ok")) and bool(lin.get("ok")) and bool(dw.get("ok"))
    if ok:
        return {
            "can_apply": True,
            "label": "Regresión lineal simple",
            "reason": "Se cumplen normalidad de residuos, linealidad e independencia (Durbin-Watson).",
            "alternatives": [],
        }
    alts: List[str] = []
    if not norm.get("ok"):
        alts.append("Correlación de Spearman entre antecedente materno y respuesta")
        alts.append("Regresión robusta (M-estimadores) o transformación de la respuesta")
    if not lin.get("ok"):
        alts.append("Modelo no lineal o comparación de medias por grupos (t / Mann-Whitney)")
        alts.append("Correlación de Spearman")
    if not dw.get("ok"):
        alts.append("Modelos con errores correlacionados o diseño que justifique dependencia")
        alts.append("Regresión robusta con errores estándar ajustados")
    if not alts:
        alts.append("Exploración no paramétrica de la asociación")
    return {
        "can_apply": False,
        "label": "Regresión lineal simple no recomendada",
        "reason": (
            "No se cumplen uno o más supuestos; la regresión OLS podría no ser confiable con estos datos."
        ),
        "alternatives": alts,
    }


def _recommend_multiple(
    norm: Dict[str, Any], dw: Dict[str, Any], vif_rows: List[Dict[str, Any]]
) -> Dict[str, Any]:
    vif_ok = all(r.get("ok") for r in vif_rows) if vif_rows else True
    ok = bool(norm.get("ok")) and bool(dw.get("ok")) and vif_ok
    if ok:
        return {
            "can_apply": True,
            "label": "Regresión lineal múltiple",
            "reason": (
                "Residuos normales, independencia (Durbin-Watson) y VIF aceptables "
                f"(umbral VIF<{VIF_OK})."
            ),
            "alternatives": [],
        }
    alts: List[str] = []
    if not vif_ok:
        alts.append("Eliminar predictores redundantes o combinar variables colineales")
        alts.append("Regresión ridge / LASSO (regularización)")
        alts.append("Análisis por regresión simple estratificada")
    if not norm.get("ok"):
        alts.append("Regresión robusta o transformación de la variable respuesta")
        alts.append("Correlaciones parciales no paramétricas")
    if not dw.get("ok"):
        alts.append("Errores estándar robustos o modelos para datos correlacionados")
    if not alts:
        alts.append("Revisar especificación del modelo con asesoría estadística")
    return {
        "can_apply": False,
        "label": "Regresión múltiple no recomendada",
        "reason": (
            "Multicolinealidad y/o otros supuestos no se cumplen; el modelo múltiple no sería confiable."
        ),
        "alternatives": alts,
    }


def _check_regression_assumptions(
    df: pd.DataFrame, cols: List[str], predictor_id: str, outcome_id: str
) -> Dict[str, Any]:
    pspec = next((s for s in MATERNAL_PREDICTOR_SPECS if s["id"] == predictor_id), None)
    ospec = _resolve_outcome_spec(outcome_id)
    if not pspec or not ospec:
        raise HTTPException(status_code=400, detail="Predictor o respuesta no válidos")
    pred_col = _match_column(cols, pspec["column"])
    out_col = _resolve_outcome_column(cols, ospec)
    if not pred_col or not out_col:
        raise HTTPException(status_code=404, detail="Variables no encontradas en la base")

    work, _, _ = _prepare_regression_data(df, cols, pred_col, out_col)
    y = work["y"].to_numpy(dtype=float)
    x = work["x"].to_numpy(dtype=float)
    edad = work["edad"].to_numpy(dtype=float)
    sexo = work["sexo"].to_numpy(dtype=float)
    n = len(y)

    X_simple = np.column_stack([np.ones(n), x])
    resid_s = _ols_residuals(y, X_simple)
    dw_s = _durbin_watson(resid_s) if resid_s is not None else None
    dw_s_ok = dw_s is not None and DW_LOW <= dw_s <= DW_HIGH
    norm_s = _residual_normality(resid_s) if resid_s is not None else _residual_normality(np.array([]))
    lin_s = _simple_linearity(y, x)

    dw_simple = {
        "statistic": _safe_round(dw_s, 4),
        "ok": dw_s_ok,
        "interpretation": (
            f"Independencia plausible (DW={_safe_round(dw_s, 3)}, rango {DW_LOW}–{DW_HIGH})"
            if dw_s_ok and dw_s is not None
            else (
                f"Posible autocorrelación (DW={_safe_round(dw_s, 3)}; esperado ≈2)"
                if dw_s is not None
                else "No calculable"
            )
        ),
        "reference_range": f"{DW_LOW} – {DW_HIGH}",
    }

    X_multi = np.column_stack([np.ones(n), x, edad, sexo])
    resid_m = _ols_residuals(y, X_multi)
    dw_m = _durbin_watson(resid_m) if resid_m is not None else None
    dw_m_ok = dw_m is not None and DW_LOW <= dw_m <= DW_HIGH
    norm_m = _residual_normality(resid_m) if resid_m is not None else _residual_normality(np.array([]))
    X_pred = np.column_stack([x, edad, sexo])
    vif_rows = _vif_rows(X_pred, [pspec["label"], "Edad", "Sexo (M=1)"])

    dw_multi = {
        "statistic": _safe_round(dw_m, 4),
        "ok": dw_m_ok,
        "interpretation": (
            f"Independencia plausible (DW={_safe_round(dw_m, 3)})"
            if dw_m_ok and dw_m is not None
            else (
                f"Posible autocorrelación (DW={_safe_round(dw_m, 3)})"
                if dw_m is not None
                else "No calculable"
            )
        ),
        "reference_range": f"{DW_LOW} – {DW_HIGH}",
    }

    rec_simple = _recommend_simple(norm_s, lin_s, dw_simple)
    rec_multi = _recommend_multiple(norm_m, dw_multi, vif_rows)

    return {
        "predictor_id": predictor_id,
        "predictor_label": pspec["label"],
        "outcome_id": outcome_id,
        "outcome_label": ospec["label"],
        "n": n,
        "simple": {
            "title": "Supuestos — regresión lineal simple",
            "normality": norm_s,
            "linearity": lin_s,
            "independence": dw_simple,
            "recommendation": rec_simple,
        },
        "multiple": {
            "title": "Supuestos — regresión lineal múltiple",
            "normality": norm_m,
            "independence": dw_multi,
            "multicollinearity": {
                "vif_threshold_ok": VIF_OK,
                "vif_threshold_warn": VIF_WARN,
                "rows": vif_rows,
                "ok": all(r.get("ok") for r in vif_rows),
                "interpretation": (
                    "Sin multicolinealidad problemática (VIF < "
                    + str(int(VIF_OK))
                    + " en todos los predictores)"
                    if all(r.get("ok") for r in vif_rows)
                    else "Multicolinealidad elevada en uno o más predictores (VIF elevado)"
                ),
            },
            "recommendation": rec_multi,
        },
        "can_run_regression": bool(rec_simple.get("can_apply")) and bool(rec_multi.get("can_apply")),
    }


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
        r2 = 1.0 - ss_res / ss_tot
        df_model = k - 1
        df_resid = n - k
        if df_resid <= 0 or df_model <= 0:
            return None
        mse = ss_res / df_resid
        xtx_inv = np.linalg.inv(X.T @ X)
        cov = mse * xtx_inv
        se = np.sqrt(np.maximum(np.diag(cov), 0))
        with np.errstate(divide="ignore", invalid="ignore"):
            t_stats = np.where(se > 0, beta / se, np.nan)
        p_vals = 2 * (1 - scipy_stats.t.cdf(np.abs(t_stats), df_resid))
        ms_model = (ss_tot - ss_res) / df_model
        f_stat = ms_model / mse if mse > 0 else np.nan
        f_p = float(1 - scipy_stats.f.cdf(f_stat, df_model, df_resid)) if mse > 0 else np.nan
        return {
            "beta": beta,
            "se": se,
            "t": t_stats,
            "p": p_vals,
            "r2": float(r2),
            "f_stat": float(f_stat),
            "f_p": float(f_p),
            "df_model": df_model,
            "df_resid": df_resid,
            "n": n,
        }
    except np.linalg.LinAlgError:
        return None


def _bootstrap_coef_ci(
    y: np.ndarray, X: np.ndarray, coef_idx: int, n_boot: int = N_BOOT, conf: float = BOOT_CONF
) -> Tuple[Optional[float], Optional[float]]:
    rng = np.random.default_rng(42)
    n = len(y)
    samples: List[float] = []
    for _ in range(n_boot):
        idx = rng.integers(0, n, n)
        fit = _ols_fit(y[idx], X[idx])
        if fit is None:
            continue
        val = float(fit["beta"][coef_idx])
        if not math.isnan(val) and not math.isinf(val):
            samples.append(val)
    if len(samples) < 80:
        return None, None
    alpha = (1 - conf) / 2
    return float(np.percentile(samples, alpha * 100)), float(np.percentile(samples, (1 - alpha) * 100))


def _model_test_table(fit: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not fit:
        return {"rows": [], "note": "Modelo no estimable con los datos disponibles."}
    return {
        "rows": [
            {"term": "R²", "value": _safe_round(fit["r2"], 4)},
            {"term": "F", "value": _safe_round(fit["f_stat"], 4)},
            {"term": "df (modelo)", "value": _safe_round(fit["df_model"], 2)},
            {"term": "df (residuo)", "value": _safe_round(fit["df_resid"], 2)},
            {"term": "p-value (modelo)", "value": _p_fmt(fit["f_p"])},
        ],
        "note": None,
    }


def _coef_rows(
    terms: List[str],
    fit: Optional[Dict[str, Any]],
    boot_idx: Optional[List[int]] = None,
    y: Optional[np.ndarray] = None,
    X: Optional[np.ndarray] = None,
) -> List[Dict[str, Any]]:
    if not fit:
        return []
    rows: List[Dict[str, Any]] = []
    for i, term in enumerate(terms):
        lo, hi = (None, None)
        if y is not None and X is not None and boot_idx and i in boot_idx:
            lo, hi = _bootstrap_coef_ci(y, X, i)
        ci = _build_ci_dict(lo, hi)
        rows.append(
            {
                "term": term,
                "coef": _safe_round(float(fit["beta"][i]), 4),
                "se": _safe_round(float(fit["se"][i]), 4),
                "ci": ci,
                "ci_display": ci.get("display") if ci else "—",
                "p_value": _safe_round(float(fit["p"][i]), 4),
                "p_display": _p_fmt(float(fit["p"][i])),
            }
        )
    return rows


def _prepare_regression_data(
    df: pd.DataFrame, cols: List[str], predictor_col: str, outcome_col: str
) -> Tuple[pd.DataFrame, str, str]:
    edad_col = _match_column(cols, "Edad")
    sexo_col = _match_column(cols, "Sexo")
    if not edad_col or not sexo_col:
        raise HTTPException(status_code=404, detail="Se requieren columnas Edad y Sexo del niño")
    work = pd.DataFrame(
        {
            "y": pd.to_numeric(df[outcome_col], errors="coerce"),
            "x": _encode_binary(df[predictor_col]),
            "edad": pd.to_numeric(df[edad_col], errors="coerce"),
            "sexo": _encode_sex(df[sexo_col]),
        }
    ).dropna()
    if len(work) < MIN_REGRESSION_N:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {MIN_REGRESSION_N} observaciones completas (n={len(work)})",
        )
    x_unique = work["x"].unique()
    if len(x_unique) < 2:
        raise HTTPException(
            status_code=400,
            detail="El predictor materno debe tener variación (Sí/No) para la regresión",
        )
    return work, edad_col, sexo_col


def _run_regression(
    df: pd.DataFrame, cols: List[str], predictor_id: str, outcome_id: str
) -> Dict[str, Any]:
    checks = _check_regression_assumptions(df, cols, predictor_id, outcome_id)
    if not checks.get("can_run_regression"):
        raise HTTPException(
            status_code=400,
            detail=(
                "No se puede aplicar la regresión: no se cumplen los supuestos del modelo simple "
                "y/o múltiple. Revise las sugerencias de pruebas alternativas."
            ),
        )
    pspec = next((s for s in MATERNAL_PREDICTOR_SPECS if s["id"] == predictor_id), None)
    ospec = _resolve_outcome_spec(outcome_id)
    if not pspec or not ospec:
        raise HTTPException(status_code=400, detail="Predictor o respuesta no válidos")
    pred_col = _match_column(cols, pspec["column"])
    out_col = _resolve_outcome_column(cols, ospec)
    if not pred_col or not out_col:
        raise HTTPException(status_code=404, detail="Variables no encontradas en la base")

    work, edad_col, sexo_col = _prepare_regression_data(df, cols, pred_col, out_col)
    y = work["y"].to_numpy(dtype=float)
    x = work["x"].to_numpy(dtype=float)
    edad = work["edad"].to_numpy(dtype=float)
    sexo = work["sexo"].to_numpy(dtype=float)
    n = len(y)

    X_simple = np.column_stack([np.ones(n), x])
    fit_simple = _ols_fit(y, X_simple)
    simple_terms = ["Intercepto", pspec["label"]]

    X_multi = np.column_stack([np.ones(n), x, edad, sexo])
    fit_multi = _ols_fit(y, X_multi)
    multi_terms = ["Intercepto", pspec["label"], "Edad", "Sexo (M=1)"]

    pred_idx_simple = [1]
    pred_idx_multi = [1]

    scatter = {
        "type": "scatter_regression",
        "x_label": pspec["label"] + " (0=No, 1=Sí)",
        "y_label": ospec["label"],
        "points": [
            {"x": _safe_round(float(xi), 2), "y": _safe_round(float(yi), 2)}
            for xi, yi in zip(x, y)
        ],
        "line": [],
    }
    if fit_simple:
        x_grid = np.array([0.0, 1.0])
        X_line = np.column_stack([np.ones(2), x_grid])
        y_line = X_line @ fit_simple["beta"]
        scatter["line"] = [
            {"x": 0, "y": _safe_round(float(y_line[0]), 2)},
            {"x": 1, "y": _safe_round(float(y_line[1]), 2)},
        ]

    sm_triglycerides = predictor_id == "sm_m" and outcome_id == "trigliceridos"
    highlight = False
    interp_parts: List[str] = []
    if fit_multi:
        beta_m = float(fit_multi["beta"][1])
        p_m = float(fit_multi["p"][1])
        if sm_triglycerides and beta_m > 0 and p_m < ALPHA:
            highlight = True
            interp_parts.append(
                "En este análisis, el síndrome metabólico materno se asocia con triglicéridos "
                f"más altos en el niño (β={_safe_round(beta_m, 2)}, p={_p_fmt(p_m)}), "
                "ajustando por edad y sexo — patrón compatible con programación fetal."
            )
        elif p_m < ALPHA:
            interp_parts.append(
                f"El antecedente materno muestra asociación lineal con {ospec['label'].lower()} "
                f"(β={_safe_round(beta_m, 2)}, p={_p_fmt(p_m)}) tras ajustar por edad y sexo."
            )
        else:
            interp_parts.append(
                f"No hay evidencia estadística de asociación del antecedente materno con "
                f"{ospec['label'].lower()} tras ajustar por edad y sexo (p={_p_fmt(p_m)})."
            )

    return {
        "predictor_id": predictor_id,
        "predictor_label": pspec["label"],
        "outcome_id": outcome_id,
        "outcome_label": ospec["label"],
        "n": n,
        "covariates": [edad_col, sexo_col],
        "method_note": (
            "Regresión lineal simple: Y ~ antecedente materno (0/1). "
            "Regresión múltiple: Y ~ antecedente materno + edad + sexo del niño (covariables de ajuste). "
            f"Un solo antecedente materno por análisis. IC al 95% por bootstrap ({N_BOOT} remuestreos)."
        ),
        "model_design": {
            "response": ospec["label"],
            "predictor": pspec["label"],
            "covariates": ["Edad del niño", "Sexo del niño (M=1, F=0)"],
            "simple_formula": f"{ospec['label']} ~ {pspec['label']} (codificado 0=No, 1=Sí)",
            "multiple_formula": (
                f"{ospec['label']} ~ {pspec['label']} + edad + sexo "
                "(el coeficiente del antecedente es el efecto ajustado)"
            ),
        },
        "fetal_programming_insight": FETAL_PROGRAMMING_INSIGHT,
        "interpretation": {
            "text": " ".join(interp_parts) if interp_parts else FETAL_PROGRAMMING_INSIGHT,
            "highlight_fetal": highlight,
        },
        "simple": {
            "title": "Regresión lineal simple",
            "coefficients": _coef_rows(simple_terms, fit_simple, pred_idx_simple, y, X_simple),
            "test_table": _model_test_table(fit_simple),
            "bootstrap_note": "IC bootstrap del coeficiente del antecedente materno.",
        },
        "multiple": {
            "title": "Regresión múltiple (ajustada por edad y sexo)",
            "coefficients": _coef_rows(multi_terms, fit_multi, pred_idx_multi, y, X_multi),
            "test_table": _model_test_table(fit_multi),
            "bootstrap_note": (
                "El coeficiente del antecedente materno refleja el cambio esperado en la respuesta "
                "por unidad del predictor (0→1), manteniendo constantes edad y sexo del niño."
            ),
        },
        "chart": scatter,
    }


def _build_schema(df: pd.DataFrame, cols: List[str]) -> Dict[str, Any]:
    predictors = []
    for spec in MATERNAL_PREDICTOR_SPECS:
        col = _match_column(cols, spec["column"])
        if not col:
            predictors.append({**spec, "available": False})
            continue
        enc = _encode_binary(df[col])
        avail = int(enc.notna().sum()) >= MIN_REGRESSION_N and enc.nunique(dropna=True) >= 2
        predictors.append({**spec, "column": col, "available": avail})

    outcome_profiles: Dict[str, Any] = {}
    all_outcomes: List[Dict[str, Any]] = []
    for pid, profile in OUTCOME_PROFILES.items():
        prof_outcomes: List[Dict[str, Any]] = []
        for spec in profile["specs"]:
            col = _resolve_outcome_column(cols, spec)
            entry = {
                "id": spec["id"],
                "label": spec["label"],
                "profile_id": pid,
                "profile_label": profile["label"],
            }
            if not col:
                entry["available"] = False
            else:
                s = pd.to_numeric(df[col], errors="coerce")
                entry["column"] = col
                entry["available"] = int(s.notna().sum()) >= MIN_REGRESSION_N
            prof_outcomes.append(entry)
            all_outcomes.append(entry)
        outcome_profiles[pid] = {
            "id": pid,
            "label": profile["label"],
            "outcomes": prof_outcomes,
        }

    covs = []
    for spec in COVARIATE_SPECS:
        col = _match_column(cols, spec["column"])
        covs.append({**spec, "column": col, "available": bool(col)})

    return {
        "predictors": predictors,
        "outcomes": all_outcomes,
        "outcome_profiles": outcome_profiles,
        "covariates": covs,
        "insight": FETAL_PROGRAMMING_INSIGHT,
        "model_design_note": (
            "La variable de respuesta (Y) es la del perfil del niño que elija. "
            "El predictor es un antecedente materno dicotómico (Sí=1, No=0); eso es válido en regresión lineal. "
            "El modelo múltiple no añade varios antecedentes maternos a la vez: ajusta el mismo predictor "
            "por edad y sexo del niño para controlar confusión."
        ),
        "ready": any(p.get("available") for p in predictors)
        and any(o.get("available") for o in all_outcomes)
        and all(c.get("available") for c in covs),
    }


def register_regression_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/inferencial/regression/schema")
    async def regression_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        return {"success": True, **_build_schema(df, cols)}

    @router.post("/datasets/{dataset_id}/inferencial/regression/assumptions")
    async def regression_assumptions(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        pid = body.get("predictor_id")
        oid = body.get("outcome_id")
        if not pid or not oid:
            raise HTTPException(status_code=400, detail="Indique predictor materno y variable de respuesta")
        return {
            "success": True,
            **_check_regression_assumptions(df, cols, str(pid), str(oid)),
        }

    @router.post("/datasets/{dataset_id}/inferencial/regression/run")
    async def regression_run(dataset_id: str, body: Dict[str, Any] = Body(...)):
        df, _, _ = _get_df(dataset_id)
        cols = [str(c) for c in df.columns]
        pid = body.get("predictor_id")
        oid = body.get("outcome_id")
        if not pid or not oid:
            raise HTTPException(status_code=400, detail="Indique predictor materno y variable de respuesta")
        return {
            "success": True,
            **_run_regression(df, cols, str(pid), str(oid)),
        }
