"""
API del módulo Análisis de Datos (bases Excel, tipos de variable, persistencia).
"""
from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import pandas as pd
from fastapi import APIRouter, Body, File, HTTPException, UploadFile

analysis_router = APIRouter(prefix="/api/analysis", tags=["analysis"])

ANALYSIS_UPLOAD_DIR = os.path.abspath(os.path.join("uploads", "analysis"))
ANALYSIS_METADATA_FILE = os.path.abspath("analysis_metadata.json")
ANALYSIS_ACTIVE_FILE = os.path.abspath("analysis_active.json")

VARIABLE_TYPES = (
    "numeric_discrete",
    "numeric_continuous",
    "categorical_nominal",
    "categorical_dichotomous",
)

VARIABLE_TYPE_LABELS = {
    "numeric_discrete": "Variable numérica discreta",
    "numeric_continuous": "Variable numérica continua",
    "categorical_nominal": "Variable categórica nominal",
    "categorical_dichotomous": "Variable categórica dicotómica",
}

PREVIEW_ROWS = 10
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def _ensure_dirs() -> None:
    os.makedirs(ANALYSIS_UPLOAD_DIR, exist_ok=True)
    if not os.path.exists(ANALYSIS_METADATA_FILE):
        with open(ANALYSIS_METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2, ensure_ascii=False)


def _load_metadata() -> List[Dict[str, Any]]:
    _ensure_dirs()
    if not os.path.exists(ANALYSIS_METADATA_FILE):
        return []
    with open(ANALYSIS_METADATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else []


def _save_metadata(metadata: List[Dict[str, Any]]) -> None:
    _ensure_dirs()
    with open(ANALYSIS_METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)


def _load_active_id() -> Optional[str]:
    if not os.path.exists(ANALYSIS_ACTIVE_FILE):
        return None
    try:
        with open(ANALYSIS_ACTIVE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("active_dataset_id")
    except Exception:
        return None


def _save_active_id(dataset_id: Optional[str]) -> None:
    with open(ANALYSIS_ACTIVE_FILE, "w", encoding="utf-8") as f:
        json.dump({"active_dataset_id": dataset_id}, f, indent=2, ensure_ascii=False)


def _types_sidecar_path(dataset_id: str) -> str:
    return os.path.join(ANALYSIS_UPLOAD_DIR, f"{dataset_id}_variable_types.json")


def _save_variable_types_sidecar(dataset_id: str, variable_types: Dict[str, str]) -> None:
    with open(_types_sidecar_path(dataset_id), "w", encoding="utf-8") as f:
        json.dump(variable_types, f, indent=2, ensure_ascii=False)


def _load_variable_types_sidecar(dataset_id: str) -> Optional[Dict[str, str]]:
    path = _types_sidecar_path(dataset_id)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _find_dataset(dataset_id: str) -> Optional[Dict[str, Any]]:
    for item in _load_metadata():
        if item.get("id") == dataset_id:
            return item
    return None


def _is_integerish(series: pd.Series) -> bool:
    for v in series.dropna().head(500):
        try:
            fv = float(v)
            if abs(fv - round(fv)) > 1e-9:
                return False
        except (TypeError, ValueError):
            return False
    return True


def infer_variable_type(series: pd.Series) -> str:
    """Clasificación heurística del tipo de variable."""
    s = series.dropna()
    if len(s) == 0:
        return "categorical_nominal"

    as_num = pd.to_numeric(s, errors="coerce")
    valid_ratio = float(as_num.notna().sum()) / max(len(s), 1)

    if valid_ratio >= 0.85:
        nums = as_num.dropna()
        n_unique = int(nums.nunique())
        if n_unique <= 2:
            return "categorical_dichotomous"
        if n_unique <= 12 and _is_integerish(nums):
            return "numeric_discrete"
        return "numeric_continuous"

    as_str = s.astype(str).str.strip()
    n_unique = int(as_str.nunique())
    if n_unique == 2:
        return "categorical_dichotomous"
    return "categorical_nominal"


def infer_all_variable_types(df: pd.DataFrame) -> Dict[str, str]:
    return {str(col): infer_variable_type(df[col]) for col in df.columns}


def _read_dataframe(file_path: str) -> pd.DataFrame:
    df = pd.read_excel(file_path)
    return df.fillna("")


def _dataset_payload(
    info: Dict[str, Any],
    *,
    include_preview: bool = True,
) -> Dict[str, Any]:
    file_path = info.get("file_path", "")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="El archivo de la base de datos no existe en disco")

    df = _read_dataframe(file_path)
    columns = [str(c) for c in df.columns]
    variable_types = info.get("variable_types") or {}
    for col in columns:
        if col not in variable_types:
            variable_types[col] = infer_variable_type(df[col])

    variables = []
    for col in columns:
        vtype = variable_types.get(col, "categorical_nominal")
        if vtype not in VARIABLE_TYPES:
            vtype = infer_variable_type(df[col])
        variables.append(
            {
                "name": col,
                "type": vtype,
                "type_label": VARIABLE_TYPE_LABELS.get(vtype, vtype),
                "unique_count": int(df[col].nunique(dropna=True)),
                "missing_count": int(df[col].isna().sum() + (df[col] == "").sum()),
            }
        )

    payload: Dict[str, Any] = {
        "id": info["id"],
        "original_filename": info.get("original_filename", ""),
        "stored_filename": info.get("stored_filename", ""),
        "rows": len(df),
        "columns": columns,
        "column_count": len(columns),
        "created_at": info.get("created_at"),
        "updated_at": info.get("updated_at"),
        "variable_types": variable_types,
        "variables": variables,
    }

    if include_preview:
        preview_df = df.head(PREVIEW_ROWS)
        payload["preview"] = {
            "rows": len(preview_df),
            "total_rows": len(df),
            "columns": columns,
            "data": preview_df.to_dict("records"),
        }

    return payload


@analysis_router.get("/datasets")
async def list_datasets():
    metadata = _load_metadata()
    cleaned: List[Dict[str, Any]] = []
    for info in metadata:
        if os.path.exists(info.get("file_path", "")):
            cleaned.append(
                {
                    "id": info["id"],
                    "original_filename": info.get("original_filename"),
                    "rows": info.get("rows"),
                    "column_count": len(info.get("columns", [])),
                    "created_at": info.get("created_at"),
                    "updated_at": info.get("updated_at"),
                }
            )
    if len(cleaned) != len(metadata):
        kept_ids = {c["id"] for c in cleaned}
        _save_metadata([m for m in metadata if m.get("id") in kept_ids])

    active_id = _load_active_id()
    return {"success": True, "datasets": cleaned, "active_dataset_id": active_id}


@analysis_router.get("/active")
async def get_active_dataset():
    active_id = _load_active_id()
    if not active_id:
        return {"success": True, "active": None}
    info = _find_dataset(active_id)
    if not info or not os.path.exists(info.get("file_path", "")):
        _save_active_id(None)
        return {"success": True, "active": None}
    return {"success": True, "active": _dataset_payload(info, include_preview=True)}


@analysis_router.post("/active/{dataset_id}")
async def set_active_dataset(dataset_id: str):
    info = _find_dataset(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    if not os.path.exists(info.get("file_path", "")):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    _save_active_id(dataset_id)
    return {"success": True, "active_dataset_id": dataset_id}


@analysis_router.get("/datasets/{dataset_id}")
async def get_dataset(dataset_id: str):
    info = _find_dataset(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    return {"success": True, "dataset": _dataset_payload(info, include_preview=True)}


@analysis_router.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="El archivo supera el tamaño máximo (50 MB)")

    _ensure_dirs()
    dataset_id = str(uuid.uuid4())
    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in file.filename)
    stored_filename = f"{dataset_id}_{safe_name}"
    file_path = os.path.join(ANALYSIS_UPLOAD_DIR, stored_filename)

    with open(file_path, "wb") as out:
        out.write(contents)

    try:
        df = _read_dataframe(file_path)
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"No se pudo leer el Excel: {exc}") from exc

    variable_types = infer_all_variable_types(df)
    now = datetime.now().isoformat()

    info = {
        "id": dataset_id,
        "original_filename": file.filename,
        "stored_filename": stored_filename,
        "file_path": file_path,
        "rows": len(df),
        "columns": [str(c) for c in df.columns],
        "variable_types": variable_types,
        "created_at": now,
        "updated_at": now,
    }

    metadata = _load_metadata()
    metadata.append(info)
    _save_metadata(metadata)
    _save_variable_types_sidecar(dataset_id, variable_types)
    _save_active_id(dataset_id)

    return {
        "success": True,
        "message": "Base de datos cargada para análisis",
        "active_dataset_id": dataset_id,
        "dataset": _dataset_payload(info, include_preview=True),
    }


@analysis_router.patch("/datasets/{dataset_id}/variable-types")
async def update_variable_types(dataset_id: str, body: Dict[str, Any] = Body(...)):
    info = _find_dataset(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")

    incoming = body.get("variable_types")
    if not isinstance(incoming, dict):
        raise HTTPException(status_code=400, detail="Se requiere objeto variable_types")

    file_path = info.get("file_path", "")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")

    df = _read_dataframe(file_path)
    columns = [str(c) for c in df.columns]
    merged = dict(info.get("variable_types") or {})

    for col, vtype in incoming.items():
        col_s = str(col)
        if col_s not in columns:
            continue
        if vtype not in VARIABLE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo no válido para '{col_s}': {vtype}",
            )
        merged[col_s] = vtype

    info["variable_types"] = merged
    info["updated_at"] = datetime.now().isoformat()

    metadata = _load_metadata()
    for i, item in enumerate(metadata):
        if item.get("id") == dataset_id:
            metadata[i] = info
            break
    _save_metadata(metadata)
    _save_variable_types_sidecar(dataset_id, merged)

    return {
        "success": True,
        "message": "Tipos de variable guardados",
        "dataset": _dataset_payload(info, include_preview=True),
    }


@analysis_router.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    metadata = _load_metadata()
    info = _find_dataset(dataset_id)
    if not info:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")

    file_path = info.get("file_path", "")
    if os.path.exists(file_path):
        os.remove(file_path)

    sidecar = _types_sidecar_path(dataset_id)
    if os.path.exists(sidecar):
        os.remove(sidecar)

    metadata = [m for m in metadata if m.get("id") != dataset_id]
    _save_metadata(metadata)

    if _load_active_id() == dataset_id:
        _save_active_id(metadata[-1]["id"] if metadata else None)

    return {"success": True, "message": "Base de datos eliminada del módulo de análisis"}


@analysis_router.get("/variable-type-labels")
async def variable_type_labels():
    return {"success": True, "labels": VARIABLE_TYPE_LABELS, "types": list(VARIABLE_TYPES)}


def _register_analysis_modules() -> None:
    from analysis_descriptivo import register_descriptivo_routes
    from analysis_inferencial import register_inferencial_routes
    from analysis_inferencial_chisq import register_chisq_routes
    from analysis_inferencial_regression import register_regression_routes
    from analysis_avanzado_pca import register_pca_routes
    from analysis_avanzado_mediation import register_mediation_routes
    from analysis_fetal_iap import register_iap_routes
    from analysis_fetal_compare import register_compare_routes
    from analysis_fetal_correlate import register_correlate_routes
    from analysis_fetal_lasso import register_lasso_routes
    from analysis_fetal_tree import register_tree_routes
    from analysis_prelim_metodos import register_metodos_routes

    register_descriptivo_routes(analysis_router)
    register_inferencial_routes(analysis_router)
    register_chisq_routes(analysis_router)
    register_regression_routes(analysis_router)
    register_pca_routes(analysis_router)
    register_mediation_routes(analysis_router)
    register_iap_routes(analysis_router)
    register_compare_routes(analysis_router)
    register_correlate_routes(analysis_router)
    register_lasso_routes(analysis_router)
    register_tree_routes(analysis_router)
    register_metodos_routes(analysis_router)


_register_analysis_modules()
