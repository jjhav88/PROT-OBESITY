"""
Módulo 4.5 — Árbol de decisión CART (clasificación) para perfil de riesgo.
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
from analysis_fetal_lasso import (
    LASSO_PREDICTOR_SPECS,
    _encode_binary,
    _to_escolaridad_simple,
    _to_parto_binary,
)

try:
    from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.tree import DecisionTreeClassifier, export_text

    _SKLEARN_OK = True
except ImportError:  # pragma: no cover
    DecisionTreeClassifier = None  # type: ignore
    export_text = None  # type: ignore
    cross_val_score = None  # type: ignore
    StratifiedKFold = None  # type: ignore
    confusion_matrix = None  # type: ignore
    accuracy_score = None  # type: ignore
    balanced_accuracy_score = None  # type: ignore
    _SKLEARN_OK = False

MIN_COMPLETE_N = 20
MIN_CLASS_N = 4
CV_FOLDS = 10
MAX_TREE_DEPTH_CAP = 4

TREE_EXTRA_SPECS: List[Dict[str, Any]] = [
    {"id": "preclamsia_m", "column": "preclamsia_m", "label": "Preeclampsia materna", "kind": "binary"},
    {"id": "hipertrigli_m", "column": "hipertrigli_m", "label": "Hipertrigliceridemia materna", "kind": "binary"},
    {"id": "talla_nacer", "column": "talla_nacer", "label": "Talla al nacer", "kind": "continuous"},
    {"id": "termino", "column": "termino", "label": "Pretérmino (vs término)", "kind": "termino"},
]

TREE_PREDICTOR_SPECS: List[Dict[str, Any]] = LASSO_PREDICTOR_SPECS + TREE_EXTRA_SPECS

OUTCOME_MODES = [
    {
        "id": "ternary",
        "label": "Tres categorías (normopeso / sobrepeso / obesidad)",
        "description": "Clasificación multiclase; excluye bajo peso.",
    },
    {
        "id": "binary_obesity",
        "label": "Obesidad vs no obesidad",
        "description": "Obesidad frente a normopeso + sobrepeso (excluye bajo peso).",
    },
]

CLASS_COLORS = {
    "Obesidad": "#dc2626",
    "Sobrepeso": "#f59e0b",
    "Normopeso": "#2563eb",
    "No obesidad": "#2563eb",
}


def _build_tree_design_matrix(df: pd.DataFrame) -> Tuple[pd.DataFrame, List[Dict[str, Any]], Dict[str, str]]:
    """Matriz de predictores perinatales/maternos (misma codificación que LASSO + extras)."""
    cols = [str(c) for c in df.columns]
    X = pd.DataFrame(index=df.index)
    predictors_meta: List[Dict[str, Any]] = []
    labels: Dict[str, str] = {}

    for spec in TREE_PREDICTOR_SPECS:
        col = _match_column(cols, spec["column"])
        kind = spec["kind"]
        pid = spec["id"]
        meta_row = {**spec, "column_resolved": col, "available": bool(col), "feature_columns": []}

        if not col:
            predictors_meta.append(meta_row)
            continue

        if kind == "continuous":
            s = pd.to_numeric(df[col], errors="coerce")
            if pid == "peso_nacer":
                sample = s.dropna()
                if len(sample) > 0 and float(sample.median()) >= 50:
                    s = s / 1000.0
            fname = pid
            X[fname] = s
            meta_row["feature_columns"] = [fname]
            labels[fname] = spec["label"]
        elif kind == "binary":
            fname = pid
            X[fname] = _encode_binary(df[col])
            meta_row["feature_columns"] = [fname]
            labels[fname] = spec["label"]
        elif kind == "escolaridad":
            mapped = df[col].map(_to_escolaridad_simple)
            dummies = pd.get_dummies(mapped, prefix="esc_m", dtype=float)
            for cat in ["Media", "Superior"]:
                cname = f"esc_m_{cat}"
                X[cname] = dummies.get(cname, pd.Series(0.0, index=df.index))
                labels[cname] = f"Escolaridad materna: {cat} (vs Básica)"
            meta_row["feature_columns"] = [c for c in X.columns if c.startswith("esc_m_")]
        elif kind == "parto":
            fname = "tipo_parto_cesarea"
            X[fname] = df[col].map(_to_parto_binary)
            meta_row["feature_columns"] = [fname]
            labels[fname] = "Parto por cesárea (vs natural)"
        elif kind == "termino":
            fname = "pretermino"
            sem = _match_column(cols, "semanas_gestacion")
            if sem:
                weeks = pd.to_numeric(df[sem], errors="coerce")
                X[fname] = (weeks < 37).astype(float)
                X.loc[weeks.isna(), fname] = np.nan
            else:
                raw = df[col].astype(str).str.strip().str.lower()
                out = pd.Series(np.nan, index=df.index, dtype=float)
                out[raw.str.contains("preter|preterm", regex=True, na=False)] = 1.0
                out[raw.str.contains("termino|term", regex=True, na=False) & ~raw.str.contains("preter", na=False)] = 0.0
                X[fname] = out
            meta_row["feature_columns"] = [fname]
            labels[fname] = spec["label"]
        predictors_meta.append(meta_row)

    return X, predictors_meta, labels


def _build_outcome_series(df: pd.DataFrame, cols: List[str], mode: str) -> Tuple[pd.Series, Dict[str, Any]]:
    cond = _resolve_condicion(df, cols)
    meta: Dict[str, Any] = {"mode": mode, "excluded_bajo_peso": int((cond == "Bajo peso").sum())}

    if mode == "ternary":
        y = cond.where(cond.isin(["Normopeso", "Sobrepeso", "Obesidad"]))
        meta["classes"] = ["Normopeso", "Sobrepeso", "Obesidad"]
        meta["label"] = "Condición de peso (3 categorías)"
    elif mode == "binary_obesity":
        y = pd.Series(np.nan, index=df.index, dtype=object)
        y[cond == "Obesidad"] = "Obesidad"
        y[cond.isin(["Normopeso", "Sobrepeso"])] = "No obesidad"
        meta["classes"] = ["No obesidad", "Obesidad"]
        meta["label"] = "Obesidad vs no obesidad"
    else:
        raise HTTPException(status_code=400, detail="Modo de resultado no válido")

    counts = {}
    for c in meta["classes"]:
        counts[c] = int((y == c).sum())
    meta["counts"] = counts
    meta["n_usable"] = int(y.notna().sum())
    return y, meta


def _threshold_label(feat: str, thresh: float, labels: Dict[str, str], left: bool) -> str:
    name = labels.get(feat, feat)
    if feat in (
        "sm_m",
        "obes_m",
        "diabetes_m",
        "HTA_m",
        "hipercolesterolemia_m",
        "hipertrigli_m",
        "preclamsia_m",
        "lactancia_materna",
        "curso_normal",
        "complicaciones",
        "exp_sust_tox",
        "tipo_parto_cesarea",
        "pretermino",
    ) or feat.startswith("esc_m_"):
        if left:
            return f"{name} = No" if thresh <= 0.5 else f"{name} ≤ {thresh:.0f}"
        return f"{name} = Sí" if thresh <= 0.5 else f"{name} > {thresh:.0f}"
    if feat == "peso_nacer":
        return f"{name} ≤ {_safe_round(thresh, 2)} kg" if left else f"{name} > {_safe_round(thresh, 2)} kg"
    if feat == "semanas_gestacion":
        return f"{name} ≤ {_safe_round(thresh, 1)} sem" if left else f"{name} > {_safe_round(thresh, 1)} sem"
    if feat == "talla_nacer":
        return f"{name} ≤ {_safe_round(thresh, 1)}" if left else f"{name} > {_safe_round(thresh, 1)}"
    return f"{name} ≤ {_safe_round(thresh, 3)}" if left else f"{name} > {_safe_round(thresh, 3)}"


def _tree_node_to_dict(
    tree,
    node_id: int,
    feature_names: List[str],
    class_names: List[str],
    labels: Dict[str, str],
) -> Dict[str, Any]:
    left = tree.children_left[node_id]
    right = tree.children_right[node_id]
    n = int(tree.n_node_samples[node_id])
    values = tree.value[node_id][0]
    total = float(values.sum()) or 1.0
    probs = {class_names[i]: _safe_round(float(values[i] / total), 3) for i in range(len(class_names))}
    pred_idx = int(np.argmax(values))
    predicted = class_names[pred_idx]
    gini = _safe_round(float(tree.impurity[node_id]), 4)

    if left == right:  # leaf
        return {
            "type": "leaf",
            "node_id": int(node_id),
            "n_samples": n,
            "predicted_class": predicted,
            "class_probs": probs,
            "gini": gini,
            "color": CLASS_COLORS.get(predicted, "#64748b"),
        }

    feat_idx = int(tree.feature[node_id])
    feat = feature_names[feat_idx]
    thresh = float(tree.threshold[node_id])
    return {
        "type": "split",
        "node_id": int(node_id),
        "feature": feat,
        "feature_label": labels.get(feat, feat),
        "threshold": _safe_round(thresh, 4),
        "n_samples": n,
        "gini": gini,
        "class_probs": probs,
        "question": f"¿{labels.get(feat, feat)}?",
        "left": {
            "branch_label": _threshold_label(feat, thresh, labels, True),
            "child": _tree_node_to_dict(tree, left, feature_names, class_names, labels),
        },
        "right": {
            "branch_label": _threshold_label(feat, thresh, labels, False),
            "child": _tree_node_to_dict(tree, right, feature_names, class_names, labels),
        },
    }


def _extract_leaf_rules(
    node: Dict[str, Any],
    path: List[str],
    rules: List[Dict[str, Any]],
    target_obesity: bool,
) -> None:
    if node.get("type") == "leaf":
        pred = node.get("predicted_class", "")
        prob = node.get("class_probs", {})
        p_ob = prob.get("Obesidad", 0) or 0
        highlight = (target_obesity and pred == "Obesidad" and p_ob >= 0.5) or (
            not target_obesity and pred in ("Obesidad", "Sobrepeso")
        )
        rules.append(
            {
                "conditions": path[:],
                "predicted_class": pred,
                "class_probs": prob,
                "n_samples": node.get("n_samples"),
                "rule_text": "SI " + " Y ".join(path) + f" → {pred} (n={node.get('n_samples')})",
                "clinical_highlight": highlight,
            }
        )
        return
    if node.get("type") == "split":
        left = node.get("left", {})
        right = node.get("right", {})
        _extract_leaf_rules(left.get("child", {}), path + [left.get("branch_label", "?")], rules, target_obesity)
        _extract_leaf_rules(right.get("child", {}), path + [right.get("branch_label", "?")], rules, target_obesity)


def _select_ccp_alpha(X: np.ndarray, y: np.ndarray, n_splits: int) -> Tuple[float, List[Dict[str, Any]]]:
    base = DecisionTreeClassifier(
        random_state=42,
        class_weight="balanced",
        min_samples_leaf=max(3, int(len(y) * 0.12)),
        max_depth=MAX_TREE_DEPTH_CAP,
    )
    path = base.cost_complexity_pruning_path(X, y)
    alphas = [a for a in path.ccp_alphas if a >= 0]
    if not alphas:
        return 0.0, []

    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    rows: List[Dict[str, Any]] = []
    best_alpha = 0.0
    best_score = -1.0

    for alpha in alphas[: min(25, len(alphas))]:
        clf = DecisionTreeClassifier(
            random_state=42,
            class_weight="balanced",
            ccp_alpha=float(alpha),
            min_samples_leaf=max(3, int(len(y) * 0.12)),
            max_depth=MAX_TREE_DEPTH_CAP,
        )
        try:
            scores = cross_val_score(clf, X, y, cv=cv, scoring="balanced_accuracy")
            mean_sc = float(np.mean(scores))
        except ValueError:
            mean_sc = float("nan")
        n_leaves = int(
            DecisionTreeClassifier(
                random_state=42,
                class_weight="balanced",
                ccp_alpha=float(alpha),
                min_samples_leaf=max(3, int(len(y) * 0.12)),
            )
            .fit(X, y)
            .get_n_leaves()
        )
        rows.append(
            {
                "ccp_alpha": _safe_round(float(alpha), 6),
                "cv_balanced_accuracy": _safe_round(mean_sc, 4) if not math.isnan(mean_sc) else None,
                "n_leaves": n_leaves,
            }
        )
        if not math.isnan(mean_sc) and mean_sc >= best_score and n_leaves >= 2:
            best_score = mean_sc
            best_alpha = float(alpha)

    return best_alpha, rows


def _run_tree(df: pd.DataFrame, outcome_mode: str) -> Dict[str, Any]:
    if not _SKLEARN_OK:
        raise HTTPException(
            status_code=503,
            detail="scikit-learn no está instalado. Ejecute: pip install scikit-learn",
        )

    cols = [str(c) for c in df.columns]
    y_series, outcome_meta = _build_outcome_series(df, cols, outcome_mode)
    X, predictors_meta, feat_labels = _build_tree_design_matrix(df)

    data = pd.concat([y_series.rename("y"), X], axis=1).dropna()
    if len(data) < MIN_COMPLETE_N:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {MIN_COMPLETE_N} casos completos. n={len(data)}",
        )

    y_labels = data["y"].astype(str).to_numpy()
    classes = list(outcome_meta["classes"])
    y = np.array([classes.index(v) if v in classes else -1 for v in y_labels])
    if (y < 0).any():
        raise HTTPException(status_code=400, detail="Etiquetas de resultado no válidas")

    counts = {classes[i]: int((y == i).sum()) for i in range(len(classes))}
    min_class = min(counts.values())
    if min_class < MIN_CLASS_N:
        raise HTTPException(
            status_code=400,
            detail=f"Se requieren al menos {MIN_CLASS_N} casos por categoría. Distribución: {counts}",
        )

    feat_cols = [c for c in X.columns if c in data.columns]
    X_arr = data[feat_cols].astype(float).to_numpy()

    n_splits = min(CV_FOLDS, min_class, len(data) // 3)
    n_splits = max(3, n_splits)
    best_ccp, ccp_table = _select_ccp_alpha(X_arr, y, n_splits)

    clf = DecisionTreeClassifier(
        random_state=42,
        class_weight="balanced",
        ccp_alpha=best_ccp,
        min_samples_leaf=max(3, int(len(y) * 0.12)),
        max_depth=MAX_TREE_DEPTH_CAP,
    )
    clf.fit(X_arr, y)

    y_pred = clf.predict(X_arr)
    acc = _safe_round(float(accuracy_score(y, y_pred)), 4)
    bacc = _safe_round(float(balanced_accuracy_score(y, y_pred)), 4)
    cm = confusion_matrix(y, y_pred, labels=list(range(len(classes))))
    cm_rows = [
        {
            "actual": classes[i],
            "predicted_counts": {classes[j]: int(cm[i, j]) for j in range(len(classes))},
        }
        for i in range(len(classes))
    ]

    cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
    cv_scores = cross_val_score(
        DecisionTreeClassifier(
            random_state=42,
            class_weight="balanced",
            ccp_alpha=best_ccp,
            min_samples_leaf=max(3, int(len(y) * 0.12)),
            max_depth=MAX_TREE_DEPTH_CAP,
        ),
        X_arr,
        y,
        cv=cv,
        scoring="balanced_accuracy",
    )
    cv_bacc = _safe_round(float(np.mean(cv_scores)), 4)

    tree_struct = _tree_node_to_dict(clf.tree_, 0, feat_cols, classes, feat_labels)
    rules: List[Dict[str, Any]] = []
    _extract_leaf_rules(
        tree_struct,
        [],
        rules,
        target_obesity=(outcome_mode == "binary_obesity" or outcome_mode == "ternary"),
    )
    rules.sort(key=lambda r: (-int(r.get("clinical_highlight", False)), -(r.get("class_probs", {}).get("Obesidad", 0) or 0)))

    text_rules = ""
    if export_text is not None:
        text_rules = export_text(
            clf,
            feature_names=feat_cols,
            class_names=classes,
            spacing=2,
            max_depth=6,
        )

    importances = sorted(
        [
            {
                "feature": feat_cols[i],
                "label": feat_labels.get(feat_cols[i], feat_cols[i]),
                "importance": _safe_round(float(clf.feature_importances_[i]), 4),
            }
            for i in range(len(feat_cols))
            if clf.feature_importances_[i] > 0.001
        ],
        key=lambda x: x["importance"],
        reverse=True,
    )

    paragraphs = [
        f"Árbol CART con poda (ccp={_safe_round(best_ccp, 6)}) sobre n={len(data)}. "
        f"Variable objetivo: {outcome_meta['label']}.",
        f"Precisión balanceada en CV: {cv_bacc} (más fiable con muestras pequeñas). "
        f"En la muestra completa: accuracy={acc}, balanced accuracy={bacc}.",
        f"El árbol final tiene {clf.get_n_leaves()} hojas y profundidad {clf.get_depth()}. "
        "Las reglas son exploratorias: útiles para comunicar perfiles, no para diagnóstico individual.",
    ]
    highlighted = [r for r in rules if r.get("clinical_highlight")]
    if highlighted:
        paragraphs.append(
            "Regla destacada: " + highlighted[0]["rule_text"].replace("SI ", "").replace(" →", " →")
        )
    sm_rules = [r for r in rules if any("metabólico" in c.lower() or "sm_m" in c for c in r.get("conditions", []))]
    peso_rules = [r for r in rules if any("peso" in c.lower() for c in r.get("conditions", []))]
    if sm_rules and peso_rules:
        paragraphs.append(
            "Combinaciones tipo «síndrome metabólico materno + peso al nacer bajo» aparecen en hojas "
            "con mayor proporción de obesidad: patrón coherente con programación fetal."
        )

    return {
        "method": {
            "name": "Árbol de clasificación CART",
            "pruning": "Cost-complexity (ccp_alpha)",
            "ccp_alpha_selected": _safe_round(best_ccp, 6),
            "cv_folds": n_splits,
            "max_depth_cap": MAX_TREE_DEPTH_CAP,
            "min_samples_leaf": max(3, int(len(y) * 0.12)),
        },
        "outcome": outcome_meta,
        "n_model": len(data),
        "class_counts": counts,
        "metrics": {
            "accuracy_in_sample": acc,
            "balanced_accuracy_in_sample": bacc,
            "balanced_accuracy_cv": cv_bacc,
            "n_leaves": int(clf.get_n_leaves()),
            "depth": int(clf.get_depth()),
        },
        "ccp_pruning_table": ccp_table,
        "confusion_matrix": cm_rows,
        "feature_importance": importances,
        "tree": tree_struct,
        "rules": rules[:12],
        "rules_text": text_rules,
        "predictors": predictors_meta,
        "interpretation_guide": _interpretation_guide(),
        "insight": {
            "title": "Perfil de riesgo — árbol de decisión",
            "paragraphs": paragraphs,
        },
    }


def _interpretation_guide() -> List[Dict[str, str]]:
    return [
        {
            "title": "¿Para qué sirve este árbol?",
            "text": (
                "Resume reglas simples del tipo «si A y B, entonces probablemente obesidad (o sobrepeso)». "
                "Es ideal para comunicar hallazgos a equipo clínico. Con pocos niños (n pequeño) el árbol "
                "puede sobreajustar: priorice las reglas con más casos (n) en la hoja y la validación cruzada."
            ),
        },
        {
            "title": "¿Qué es la poda (ccp)?",
            "text": (
                "El árbol crece y luego se poda para no memorizar cada caso. El parámetro ccp_alpha controla "
                "cuánto recortar; elegimos el valor con mejor precisión balanceada en validación cruzada."
            ),
        },
        {
            "title": "Cómo leer el diagrama",
            "text": (
                "Cada recuadro es una pregunta (predictor). Las ramas indican Sí/No o umbrales (p. ej. peso ≤ 2,8 kg). "
                "Las hojas (abajo) muestran la categoría predicha y la proporción por color. "
                "Rojo/naranja: obesidad o sobrepeso; azul: normopeso o no obesidad."
            ),
        },
        {
            "title": "Tres categorías vs obesidad sí/no",
            "text": (
                "Tres categorías separa normopeso, sobrepeso y obesidad. "
                "Obesidad vs no obesidad agrupa normopeso+sobrepeso frente a obesidad (excluye bajo peso en ambos)."
            ),
        },
    ]


def _build_tree_schema(df: pd.DataFrame) -> Dict[str, Any]:
    cols = [str(c) for c in df.columns]
    X, predictors_meta, _ = _build_tree_design_matrix(df)
    modes_ready = {}
    for mode in OUTCOME_MODES:
        y, meta = _build_outcome_series(df, cols, mode["id"])
        complete = pd.concat([y.rename("y"), X], axis=1).dropna()
        min_c = min(meta["counts"].values()) if meta["counts"] else 0
        modes_ready[mode["id"]] = {
            **mode,
            "n_complete": int(len(complete)),
            "class_counts": meta["counts"],
            "ready": len(complete) >= MIN_COMPLETE_N and min_c >= MIN_CLASS_N,
        }

    return {
        "title": "Árbol de decisión CART — perfil de riesgo",
        "description": (
            "Clasificación por factores perinatales/maternos con poda automática. "
            "Elija resultado en tres categorías o binario (obesidad vs no obesidad)."
        ),
        "outcome_modes": list(modes_ready.values()),
        "predictors": predictors_meta,
        "ready": any(m["ready"] for m in modes_ready.values()) and _SKLEARN_OK,
        "sklearn_available": _SKLEARN_OK,
        "interpretation_guide": _interpretation_guide(),
    }


def register_tree_routes(router: APIRouter) -> None:
    @router.get("/datasets/{dataset_id}/fetal/tree/schema")
    async def tree_schema(dataset_id: str):
        df, _, _ = _get_df(dataset_id)
        return {"success": True, **_build_tree_schema(df)}

    @router.post("/datasets/{dataset_id}/fetal/tree/run")
    async def tree_run(
        dataset_id: str,
        body: Optional[Dict[str, Any]] = Body(default=None),
    ):
        df, _, _ = _get_df(dataset_id)
        mode = "ternary"
        if body and body.get("outcome_mode"):
            mode = str(body["outcome_mode"])
        return {"success": True, **_run_tree(df, mode)}
