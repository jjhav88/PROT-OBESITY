"""
Análisis avanzado — PCA con rotación, biplot y varianza explicada.
"""
from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import APIRouter, Body, HTTPException

MIN_PCA_N = 30
LOADING_THRESHOLD = 0.40

PCA_ACTIVE_SPECS: List[Dict[str, Any]] = [
    {"id": "imc", "label": "IMC", "requested": ["IMC"], "domain": "antropometrico"},
    {"id": "peso", "label": "Peso", "requested": ["Peso_kg", "Peso"], "domain": "antropometrico"},
    {"id": "talla", "label": "Talla", "requested": ["Estatura_cm", "Talla_cm", "Talla"], "domain": "antropometrico"},
    {
        "id": "cintura",
        "label": "Circunferencia de cintura",
        "requested": ["Circunferencia_Cintura", "Cinrcunferencia_Cintura"],
        "domain": "antropometrico",
    },
    {"id": "braquial", "label": "Perímetro braquial", "requested": ["Perimetro_Braquial"], "domain": "antropometrico"},
    {"id": "cefalico", "label": "Perímetro cefálico", "requested": ["Perimetro_Cefalico"], "domain": "antropometrico"},
    {"id": "trigliceridos", "label": "Triglicéridos", "requested": ["Trigliceridos"], "domain": "metabolico"},
    {"id": "hdl", "label": "HDL", "requested": ["HDL_Colesterol", "HDL"], "domain": "metabolico"},
    {"id": "ldl", "label": "LDL", "requested": ["LDL_Colesterol", "LDL"], "domain": "metabolico"},
    {"id": "glucosa", "label": "Glucosa", "requested": ["Glucosa"], "domain": "metabolico"},
    {"id": "no_hdl", "label": "No-HDL", "requested": ["No_HDL_Colesterol", "No_HDL"], "domain": "metabolico", "derived": True},
    {"id": "vldl", "label": "VLDL", "requested": ["VLDL_Colesterol", "VLDL"], "domain": "metabolico", "derive_tg": True},
    {"id": "edad", "label": "Edad", "requested": ["Edad"], "domain": "demografico"},
    {"id": "peso_nacer", "label": "Peso al nacer", "requested": ["peso_nacer"], "domain": "perinatal"},
    {"id": "semanas_gestacion", "label": "Semanas de gestación", "requested": ["semanas_gestacion"], "domain": "perinatal"},
]

DOMAIN_LABELS = {
    "perinatal": "perinatal",
    "metabolico": "metabólico/lipídico",
    "antropometrico": "antropométrico actual",
    "demografico": "demográfico",
}

ROTATION_METHODS: List[Dict[str, Any]] = [
    {
        "id": "none",
        "label": "Sin rotación",
        "family": "orthogonal",
        "default": False,
        "when": "Cuando desea los componentes originales (máxima varianza sucesiva) sin simplificar cargas.",
    },
    {
        "id": "varimax",
        "label": "Varimax",
        "family": "orthogonal",
        "default": True,
        "when": "Recomendado para interpretar factores: cada componente queda definido por pocas variables con cargas altas.",
    },
    {
        "id": "quartimax",
        "label": "Quartimax",
        "family": "orthogonal",
        "default": False,
        "when": "Prioriza simplificar las variables (menos variables con cargas altas en cada componente).",
    },
    {
        "id": "equamax",
        "label": "Equamax",
        "family": "orthogonal",
        "default": False,
        "when": "Compromiso entre varimax y quartimax; útil si busca equilibrio entre simplificar factores y variables.",
    },
    {
        "id": "promax",
        "label": "Promax",
        "family": "oblique",
        "default": False,
        "when": "Rotación oblicua: permite correlación entre componentes. Use si sospecha que perinatal y metabólico no son ortogonales.",
    },
    {
        "id": "oblimin",
        "label": "Oblimin",
        "family": "oblique",
        "default": False,
        "when": "Alternativa oblicua a promax; adecuada cuando los dominios (perinatal vs metabólico) pueden compartir varianza.",
    },
]


def _api():
    from analysis_api import _find_dataset, _read_dataframe, infer_variable_type

    return _find_dataset, _read_dataframe, infer_variable_type


def _norm_col(name: str) -> str:
    s = str(name).strip().lower()
    s = re.sub(r"[\s\-]+", "_", s)
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s


def _match_columns_requested(requested: List[str], available: List[str]) -> List[str]:
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


def _match_column(cols: List[str], name: str) -> Optional[str]:
    key = _norm_col(name)
    for col in cols:
        if _norm_col(col) == key:
            return col
    return None


def _condicion_on_index(df: pd.DataFrame, index: pd.Index) -> Tuple[Optional[str], pd.Series]:
    """Etiquetas de Condicion alineadas al índice de filas usadas en la PCA."""
    from analysis_fetal_common import _resolve_condicion

    cols = [str(c) for c in df.columns]
    col = _match_column(cols, "Condicion") or _match_column(cols, "condicion")
    if not col:
        return None, pd.Series(["Sin dato"] * len(index), index=index, dtype=str)
    labels = _resolve_condicion(df, cols).reindex(index)
    labels = labels.where(labels.notna(), "Sin dato").astype(str)
    return col, labels


def _safe_round(x: Any, nd: int = 4) -> Optional[float]:
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    try:
        return round(float(x), nd)
    except (TypeError, ValueError):
        return None


def _derive_no_hdl(df: pd.DataFrame, cols: List[str]) -> Optional[pd.Series]:
    total_m = _match_columns_requested(["Colesterol_Total"], cols)
    hdl_m = _match_columns_requested(["HDL_Colesterol", "HDL"], cols)
    if not total_m or not hdl_m:
        return None
    total = pd.to_numeric(df[total_m[0]], errors="coerce")
    hdl = pd.to_numeric(df[hdl_m[0]], errors="coerce")
    return total - hdl


def _derive_vldl(df: pd.DataFrame, cols: List[str]) -> Optional[pd.Series]:
    tg_m = _match_columns_requested(["Trigliceridos"], cols)
    if not tg_m:
        return None
    tg = pd.to_numeric(df[tg_m[0]], errors="coerce")
    return tg / 5.0


def _resolve_pca_series(df: pd.DataFrame, spec: Dict[str, Any], cols: List[str]) -> Optional[pd.Series]:
    matched = _match_columns_requested(spec.get("requested", []), cols)
    if matched:
        return pd.to_numeric(df[matched[0]], errors="coerce")
    if spec.get("derived"):
        return _derive_no_hdl(df, cols)
    if spec.get("derive_tg"):
        return _derive_vldl(df, cols)
    return None


def _build_pca_dataframe(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    cols = [str(c) for c in df.columns]
    meta: List[Dict[str, Any]] = []
    data: Dict[str, pd.Series] = {}
    for spec in PCA_ACTIVE_SPECS:
        s = _resolve_pca_series(df, spec, cols)
        col_name = _match_columns_requested(spec.get("requested", []), cols)
        source = col_name[0] if col_name else None
        derived = bool(spec.get("derived") or spec.get("derive_tg"))
        if s is None and spec.get("derived"):
            s = _derive_no_hdl(df, cols)
            derived = True
            source = "calculada (CT − HDL)"
        if s is None and spec.get("derive_tg"):
            s = _derive_vldl(df, cols)
            derived = True
            source = "calculada (TG/5)"
        available = s is not None and int(s.notna().sum()) >= MIN_PCA_N
        meta.append(
            {
                "id": spec["id"],
                "label": spec["label"],
                "domain": spec.get("domain", "otro"),
                "domain_label": DOMAIN_LABELS.get(spec.get("domain", ""), spec.get("domain", "")),
                "available": available,
                "derived": derived,
                "source_column": source,
                "n_valid": int(s.notna().sum()) if s is not None else 0,
            }
        )
        if available and s is not None:
            data[spec["id"]] = s
    if len(data) < 3:
        raise HTTPException(
            status_code=400,
            detail="Se requieren al menos 3 variables activas con datos suficientes para PCA",
        )
    work = pd.DataFrame(data).dropna()
    if len(work) < MIN_PCA_N:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {MIN_PCA_N} filas completas (n={len(work)})",
        )
    used_meta = [m for m in meta if m["id"] in work.columns]
    return work, used_meta


def _standardize(X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    mean = np.nanmean(X, axis=0)
    std = np.nanstd(X, axis=0, ddof=1)
    std[std == 0] = 1.0
    Z = (X - mean) / std
    return Z, mean, std


def _pca_unrotated(Z: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Correlación PCA: loadings p×k, eigenvectors p×k, eigenvalues k."""
    R = np.corrcoef(Z, rowvar=False)
    R = np.nan_to_num(R, nan=0.0)
    evals, evecs = np.linalg.eigh(R)
    order = np.argsort(evals)[::-1]
    evals = evals[order]
    evecs = evecs[:, order]
    loadings = evecs * np.sqrt(np.maximum(evals, 0))
    return loadings, evecs, evals


def _varimax(loadings: np.ndarray, gamma: float = 1.0, max_iter: int = 100, tol: float = 1e-6) -> Tuple[np.ndarray, np.ndarray]:
    p, k = loadings.shape
    R = np.eye(k)
    for _ in range(max_iter):
        R_old = R.copy()
        L = loadings @ R
        col_comm = np.sum(L**2, axis=0)
        target = L**3 - (gamma / p) * (L @ np.diag(col_comm))
        u, _, vh = np.linalg.svd(L.T @ target)
        R = R @ (u @ vh)
        if np.max(np.abs(R - R_old)) < tol:
            break
    return loadings @ R, R


def _promax(loadings: np.ndarray, kappa: float = 4.0) -> Tuple[np.ndarray, np.ndarray]:
    p, k = loadings.shape
    target = np.sign(loadings) * (np.abs(loadings) ** kappa)
    try:
        W = np.linalg.pinv(loadings.T @ loadings) @ loadings.T @ target
        rotated = loadings @ W
        norm = np.sqrt(np.sum(rotated**2, axis=0))
        norm[norm == 0] = 1.0
        rotated = rotated / norm
        return rotated, W
    except np.linalg.LinAlgError:
        return loadings, np.eye(k)


def _oblimin(loadings: np.ndarray, delta: float = 0.0, max_iter: int = 80, tol: float = 1e-5) -> Tuple[np.ndarray, np.ndarray]:
    p, k = loadings.shape
    R = np.eye(k)
    for _ in range(max_iter):
        R_old = R.copy()
        L = loadings @ R
        X = L.T @ L
        inv_diag = np.diag(1.0 / np.sqrt(np.diag(X) + 1e-12))
        T = inv_diag @ X @ inv_diag
        grad = L.T @ (L * (X - delta * T))
        u, _, vh = np.linalg.svd(grad)
        R = R @ (u @ vh)
        if np.max(np.abs(R - R_old)) < tol:
            break
    return loadings @ R, R


def _apply_rotation(loadings: np.ndarray, method: str) -> Tuple[np.ndarray, np.ndarray]:
    p, k = loadings.shape
    method = (method or "varimax").lower()
    if method == "none":
        return loadings, np.eye(k)
    if method == "quartimax":
        return _varimax(loadings, gamma=0.0)
    if method == "equamax":
        return _varimax(loadings, gamma=p / k if k else 1.0)
    if method == "varimax":
        return _varimax(loadings, gamma=1.0)
    rotated, R = _varimax(loadings, gamma=1.0)
    if method == "promax":
        return _promax(rotated)
    if method == "oblimin":
        return _oblimin(rotated)
    raise HTTPException(status_code=400, detail=f"Método de rotación no válido: {method}")


def _kaiser_components(evals: np.ndarray) -> int:
    return max(1, int(np.sum(evals > 1.0)))


def _component_insight(
    pc_index: int,
    var_labels: List[str],
    loadings_row: np.ndarray,
    domains: List[str],
) -> Dict[str, Any]:
    pairs = [(var_labels[i], float(loadings_row[i]), domains[i]) for i in range(len(var_labels))]
    pairs.sort(key=lambda x: abs(x[1]), reverse=True)
    top = [p for p in pairs if abs(p[1]) >= LOADING_THRESHOLD][:6]
    if not top:
        top = pairs[:4]
    dom_set = list(dict.fromkeys(p[2] for p in top))
    dom_labels = [DOMAIN_LABELS.get(d, d) for d in dom_set]
    return {
        "pc": pc_index + 1,
        "top_variables": [
            {"id": t[0], "label": next((m["label"] for m in PCA_ACTIVE_SPECS if m["id"] == t[0]), t[0]), "loading": _safe_round(t[1], 3)}
            for t in top
        ],
        "domains": dom_labels,
        "interpretation_hint": (
            f"Componente {pc_index + 1} definido principalmente por "
            + ", ".join(
                next((m["label"] for m in PCA_ACTIVE_SPECS if m["id"] == t[0]), t[0]) for t in top[:3]
            )
            + ("." if top else " (cargas dispersas).")
        ),
    }


def _build_global_insight(
    components: List[Dict[str, Any]],
    var_meta: List[Dict[str, Any]],
) -> Dict[str, Any]:
    perinatal_ids = {m["id"] for m in var_meta if m.get("domain") == "perinatal"}
    metabolic_ids = {m["id"] for m in var_meta if m.get("domain") == "metabolico"}
    anthro_ids = {m["id"] for m in var_meta if m.get("domain") == "antropometrico"}

    def dominant_domains(comp: Dict[str, Any]) -> set:
        return set(
            m.get("domain")
            for m in var_meta
            for tv in comp.get("top_variables", [])
            if m["id"] == tv["id"]
        )

    perinatal_pcs = []
    metabolic_pcs = []
    mixed_pcs = []
    for comp in components[:4]:
        dom = dominant_domains(comp)
        has_p = bool(dom & perinatal_ids)
        has_m = bool(dom & metabolic_ids)
        if has_p and not has_m:
            perinatal_pcs.append(comp["pc"])
        elif has_m and not has_p:
            metabolic_pcs.append(comp["pc"])
        elif has_p and has_m:
            mixed_pcs.append(comp["pc"])

    lines: List[str] = []
    if perinatal_pcs and metabolic_pcs and not mixed_pcs:
        lines.append(
            "Las variables perinatales (peso al nacer, semanas de gestación) cargan en componentes "
            f"distintos de las metabólicas/lipídicas (CP {', '.join(map(str, perinatal_pcs))} vs "
            f"CP {', '.join(map(str, metabolic_pcs))}), compatible con un eje de programación fetal "
            "separado de un eje de riesgo metabólico actual."
        )
    elif mixed_pcs:
        lines.append(
            "Perinatales y metabólicas comparten componente(s) "
            f"(CP {', '.join(map(str, mixed_pcs))}): la programación fetal podría estar mezclada con "
            "el perfil lipídico/antropométrico actual o mediada por variables intermedias."
        )
    elif perinatal_pcs:
        lines.append(
            "Las variables perinatales definen principalmente "
            f"CP {', '.join(map(str, perinatal_pcs))}; revise si las lipídicas cargan en otros ejes."
        )
    elif metabolic_pcs:
        lines.append(
            "El perfil metabólico domina "
            f"CP {', '.join(map(str, metabolic_pcs))}; las perinatales no aparecen con cargas altas."
        )
    else:
        lines.append(
            "Revise la tabla de cargas: busque agrupación de antropometría actual, lípidos y marcadores perinatales."
        )

    if anthro_ids:
        anthro_comp = [
            c["pc"]
            for c in components[:3]
            if any(tv["id"] in anthro_ids for tv in c.get("top_variables", []))
        ]
        if anthro_comp:
            lines.append(
                f"Antropometría actual (IMC, peso, talla, perímetros) contribuye a CP {', '.join(map(str, anthro_comp))}."
            )

    return {
        "title": "Programación fetal vs riesgo metabólico",
        "paragraphs": lines,
        "separate_axes": bool(perinatal_pcs and metabolic_pcs and not mixed_pcs),
        "mixed_axes": bool(mixed_pcs),
    }


def _run_pca(df: pd.DataFrame, rotation: str, n_components: Optional[int] = None) -> Dict[str, Any]:
    work, var_meta = _build_pca_dataframe(df)
    var_ids = [m["id"] for m in var_meta]
    domains = [m.get("domain", "otro") for m in var_meta]
    X = work.values.astype(float)
    Z, _, _ = _standardize(X)
    loadings_u, evecs, evals = _pca_unrotated(Z)
    k_full = loadings_u.shape[1]
    k_use = n_components if n_components and 1 <= n_components <= k_full else _kaiser_components(evals)
    k_use = max(2, min(k_use, k_full))

    loadings_k = loadings_u[:, :k_use]
    evecs_k = evecs[:, :k_use]
    scores_base = Z @ evecs_k
    loadings_rot, rot_matrix = _apply_rotation(loadings_k, rotation)
    if rotation == "none":
        scores_rot = scores_base
    else:
        scores_rot = scores_base @ rot_matrix

    var_ratio = evals / np.sum(evals) if np.sum(evals) > 0 else evals
    cum_var = np.cumsum(var_ratio)

    comp_insights = []
    for j in range(k_use):
        comp_insights.append(_component_insight(j, var_ids, loadings_rot[:, j], domains))
    global_insight = _build_global_insight(comp_insights, var_meta)

    n = len(work)
    max_biplot = 250
    idx = np.linspace(0, n - 1, min(n, max_biplot), dtype=int) if n > max_biplot else np.arange(n)

    cond_col, cond_labels = _condicion_on_index(df, work.index)
    biplot_scores = [
        {
            "pc1": _safe_round(scores_rot[i, 0], 4),
            "pc2": _safe_round(scores_rot[i, 1], 4),
            "condicion": str(cond_labels.loc[work.index[i]]),
        }
        for i in idx
    ]
    cond_groups = sorted({s["condicion"] for s in biplot_scores if s.get("condicion")})
    scale = 1.0
    if loadings_rot[:, :2].size:
        max_l = float(np.max(np.abs(loadings_rot[:, :2])))
        max_s = float(np.max(np.abs(scores_rot[idx, :2]))) if len(idx) else 1.0
        if max_l > 0 and max_s > 0:
            scale = 0.85 * max_s / max_l
    biplot_loadings = [
        {
            "id": var_ids[i],
            "label": var_meta[i]["label"],
            "pc1": _safe_round(loadings_rot[i, 0] * scale, 4),
            "pc2": _safe_round(loadings_rot[i, 1] * scale, 4),
            "loading_pc1": _safe_round(loadings_rot[i, 0], 3),
            "loading_pc2": _safe_round(loadings_rot[i, 1], 3),
        }
        for i in range(len(var_ids))
    ]

    loading_rows = []
    for i, vid in enumerate(var_ids):
        row: Dict[str, Any] = {"variable_id": vid, "label": var_meta[i]["label"], "domain": var_meta[i]["domain_label"]}
        for j in range(k_use):
            row[f"pc{j + 1}"] = _safe_round(loadings_rot[i, j], 3)
        loading_rows.append(row)

    rot_meta = next((r for r in ROTATION_METHODS if r["id"] == rotation), None)
    return {
        "n": int(n),
        "n_variables": len(var_ids),
        "variables": var_meta,
        "rotation": rotation,
        "rotation_label": rot_meta["label"] if rot_meta else rotation,
        "rotation_family": rot_meta.get("family") if rot_meta else "",
        "n_components": k_use,
        "eigenvalues": [_safe_round(e, 4) for e in evals[:k_full]],
        "variance_explained": [_safe_round(v * 100, 2) for v in var_ratio[:k_full]],
        "variance_cumulative": [_safe_round(v * 100, 2) for v in cum_var[:k_full]],
        "loadings": loading_rows,
        "component_insights": comp_insights,
        "insight": global_insight,
        "biplot": {
            "scores": biplot_scores,
            "loadings": biplot_loadings,
            "scale_note": "Flechas escaladas para lectura conjunta con puntos.",
            "stratify_column": cond_col,
            "stratify_label": "Condición",
            "condicion_groups": cond_groups,
        },
        "standardized": True,
        "method_note": "PCA sobre matriz estandarizada (z-score); correlación entre variables activas.",
    }


def _build_pca_schema(df: pd.DataFrame) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    variables = []
    for spec in PCA_ACTIVE_SPECS:
        s = _resolve_pca_series(df, spec, cols)
        col_name = _match_columns_requested(spec.get("requested", []), cols)
        derived = bool(spec.get("derived") or spec.get("derive_tg"))
        source = col_name[0] if col_name else None
        if s is None and spec.get("derived"):
            s = _derive_no_hdl(df, cols)
            derived = True
            source = "calculada (CT − HDL)"
        if s is None and spec.get("derive_tg"):
            s = _derive_vldl(df, cols)
            derived = True
            source = "calculada (TG/5)"
        n_valid = int(s.notna().sum()) if s is not None else 0
        variables.append(
            {
                **spec,
                "domain_label": DOMAIN_LABELS.get(spec.get("domain", ""), ""),
                "available": n_valid >= MIN_PCA_N,
                "derived": derived,
                "source_column": source,
                "n_valid": n_valid,
            }
        )
    n_avail = sum(1 for v in variables if v["available"])
    return {
        "variables": variables,
        "rotation_methods": ROTATION_METHODS,
        "rotation_info_title": "¿Cuándo usar cada rotación?",
        "ready": n_avail >= 3,
        "min_n": MIN_PCA_N,
        "insight_preview": (
            "Identifique si peso al nacer y semanas de gestación forman un eje (programación fetal) "
            "separado del eje lipídico/antropométrico actual."
        ),
    }


def register_pca_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/avanzado/pca/schema")
    async def pca_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_build_pca_schema(df)}

    @router.post("/datasets/{dataset_id}/avanzado/pca/run")
    async def pca_run(dataset_id: str, body: Dict[str, Any] = Body(default={})):
        df, _, _ = _get_df(dataset_id)
        rotation = str(body.get("rotation") or "varimax").lower()
        valid_ids = {r["id"] for r in ROTATION_METHODS}
        if rotation not in valid_ids:
            raise HTTPException(status_code=400, detail="Método de rotación no válido")
        n_comp = body.get("n_components")
        n_components = int(n_comp) if n_comp is not None else None
        return {"success": True, **_run_pca(df, rotation, n_components)}
