"""
Documento consolidado de métodos estadísticos — Resultados preliminares.
Útil para la sección Materiales y métodos (análisis estadístico) de la disertación.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter


def _sections() -> List[Dict[str, Any]]:
    return [
        {
            "id": "software",
            "title": "Entorno computacional y software",
            "paragraphs": [
                "Los análisis se realizaron en una aplicación web local desarrollada en Python 3 "
                "(FastAPI) con interfaz de exploración en JavaScript. La base de datos del estudio "
                "se importó desde archivos Excel (.xlsx) y se validaron los tipos de variable "
                "(cuantitativas, categóricas dicotómicas y nominales) antes de cada módulo."
            ],
            "bullets": [
                "Procesamiento: pandas, NumPy, SciPy.",
                "Modelación multivariada y clasificación: scikit-learn (regresión LASSO, árboles CART, PCA).",
                "Contrastes adicionales: scikit-posthocs (comparaciones múltiples tras ANOVA/Kruskal-Wallis).",
                "Visualización interactiva: Plotly.js.",
                "Nivel de significación estadística: α = 0,05 (dos colas), salvo indicación contraria.",
            ],
        },
        {
            "id": "descriptivo",
            "title": "Análisis descriptivo",
            "paragraphs": [
                "Caracterización univariada y bivariada de la cohorte pediátrica y variables maternas/perinatales."
            ],
            "bullets": [
                "Variables cuantitativas: medidas de tendencia central (media, mediana), dispersión (desviación estándar, rango intercuartílico) e intervalos de referencia cuando procedió.",
                "Variables categóricas: frecuencias absolutas y relativas; gráficos de barras y diagramas circulares.",
                "Tablas cruzadas entre variables categóricas con estadístico χ² de Pearson; en tablas 2×2 con celdas esperadas < 5 se consideró la prueba exacta de Fisher.",
                "Comparación de una variable cuantitativa entre grupos: prueba t de Student o U de Mann-Whitney según normalidad y homogeneidad de varianzas (evaluadas con Shapiro-Wilk y Levene).",
                "Matriz de correlaciones entre variables cuantitativas (Pearson o Spearman según linealidad y normalidad).",
                "Análisis de correspondencias múltiples / perfil lipídico (PCP) y diagramas de flujo (alluvial) para explorar perfiles integrados.",
            ],
        },
        {
            "id": "inferencial",
            "title": "Análisis inferencial",
            "paragraphs": [
                "Contrastes de hipótesis para comparar grupos según la condición antropométrica del niño "
                "(normopeso, sobrepeso, obesidad, bajo peso) y asociaciones con factores maternos."
            ],
            "bullets": [
                "Comparación de medias en ≥ 3 grupos: evaluación de normalidad (Shapiro-Wilk) y homocedasticidad (Levene). "
                "Si se cumplieron supuestos: ANOVA de un factor; de lo contrario: ANOVA de Welch o Kruskal-Wallis. "
                "Post hoc: Tukey HSD, Games-Howell o Dunn con corrección de Benjamini-Hochberg, según el test principal.",
                "ANCOVA: comparación de medias ajustadas por covariables (edad, sexo, peso al nacer y otras disponibles); "
                "verificación de homogeneidad de pendientes (interacción grupo × covariable) y reporte de η² o ω².",
                "Asociación categórica: χ² de Pearson; Fisher exacto en tablas 2×2 con frecuencias esperadas bajas; "
                "tamaño del efecto: V de Cramér.",
                "Comparación de dos grupos independientes (medias): t de Student o U de Mann-Whitney.",
                "Regresión lineal múltiple (antecedentes maternos → perfil lipídico del niño): mínimos cuadrados ordinarios; "
                "diagnóstico de residuos; intervalos de confianza del 95 % para coeficientes por bootstrap (2000 réplicas) "
                "dado el tamaño muestral limitado.",
            ],
        },
        {
            "id": "avanzado",
            "title": "Análisis avanzado (multivariado exploratorio)",
            "paragraphs": [
                "Técnicas para identificar estructuras latentes y vías exploratorias de mediación."
            ],
            "bullets": [
                "Análisis de componentes principales (PCA): variables activas estandarizadas (z-score); "
                "extracción por componentes con autovalor ≥ 1; rotación opcional (varimax por defecto, quartimax, equamax, promax, oblimin); "
                "cargas factoriales, varianza explicada, biplot individuos-variables e interpretación perinatal vs metabólica.",
                "Mediación exploratoria (modelo de Baron y Kenny con bootstrap): exposición materna (seleccionable) → IMC del niño → triglicéridos; "
                "covariables edad y sexo; 5000 réplicas bootstrap para IC 95 % de efectos total, directo e indirecto; "
                "mínimo n = 25 (recomendado n ≥ 40) con casos completos.",
            ],
        },
        {
            "id": "fetal",
            "title": "Programación fetal y factores perinatales (Módulo 4)",
            "paragraphs": [
                "Evaluación acumulativa de adversidad perinatal, asociación con perfil lipídico y modelos predictivos "
                "de obesidad infantil. Dado el tamaño muestral (estudio piloto), los resultados se interpretan como exploratorios."
            ],
            "subsections": [
                {
                    "title": "4.1 Índice de adversidad perinatal (IAP)",
                    "bullets": [
                        "Índice sumativo de 0 a 6 puntos (1 punto por criterio): peso al nacer < 2500 g o > 4000 g; "
                        "parto pretérmino (< 37 semanas o equivalente en variable término); madre con diabetes, obesidad o síndrome metabólico; "
                        "ausencia de lactancia materna; complicaciones al nacer; exposición a sustancias tóxicas.",
                        "Conversión automática de peso al nacer a kg si la mediana de la variable es < 50.",
                    ],
                },
                {
                    "title": "4.2 Comparación del IAP por condición de peso",
                    "bullets": [
                        "Contraste entre niños con obesidad vs normopeso: U de Mann-Whitney (dos colas); "
                        "mínimo 8 observaciones por grupo.",
                    ],
                },
                {
                    "title": "4.3 Correlación IAP — perfil lipídico",
                    "bullets": [
                        "Correlación de Spearman entre IAP y triglicéridos, HDL y glucosa; α = 0,05; mínimo 20 pares válidos.",
                    ],
                },
                {
                    "title": "4.4 Regresión logística LASSO",
                    "bullets": [
                        "Variable dependiente: obesidad (1) vs normopeso (0); se excluyeron sobrepeso y bajo peso.",
                        "Predictores perinatales/maternos codificados (incl. escolaridad materna categorizada y tipo de parto).",
                        "Penalización L1 (α = 1, equivalente a C = 1); selección de variables con coeficiente ≠ 0.",
                        "Evaluación discriminativa: área bajo la curva ROC (AUC) por validación cruzada estratificada (hasta 10 pliegues).",
                        "Odds ratios (OR) con IC 95 % por bootstrap percentil (800 réplicas); forest plot de OR seleccionados.",
                    ],
                },
                {
                    "title": "4.5 Árbol de decisión CART",
                    "bullets": [
                        "Clasificación por árbol de decisión CART con poda por complejidad (ccp); "
                        "selección de ccp por precisión balanceada en validación cruzada.",
                        "Variable objetivo configurable: (a) tres categorías (normopeso, sobrepeso, obesidad) o "
                        "(b) binaria obesidad vs no obesidad (normopeso + sobrepeso); se excluyó bajo peso.",
                        "Restricciones por n pequeño: profundidad máxima 4, mínimo de casos por hoja ≥ max(3, 12 % de n), "
                        "class_weight = balanced.",
                        "Salidas: diagrama del árbol, reglas de decisión en lenguaje clínico, importancia de variables y matriz de confusión exploratoria.",
                    ],
                },
            ],
        },
        {
            "id": "consideraciones",
            "title": "Consideraciones metodológicas generales",
            "paragraphs": [
                "La muestra corresponde a un estudio piloto con n limitado; por ello se priorizaron pruebas no paramétricas "
                "cuando los supuestos no se cumplieron, validación cruzada en modelos predictivos y bootstrap para intervalos. "
                "Los hallazgos preliminares orientan hipótesis para la disertación y no sustituyen inferencia confirmatoria "
                "sin validación externa."
            ],
            "bullets": [
                "Casos con datos faltantes en las variables del modelo se excluyeron por análisis (listwise deletion).",
                "No se imputaron valores perdidos en los módulos inferenciales implementados.",
                "Los análisis se reprodujeron de forma estandarizada mediante la misma plataforma para garantizar trazabilidad.",
            ],
        },
    ]


def _build_markdown(sections: List[Dict[str, Any]]) -> str:
    lines = [
        "## Análisis estadístico — Resultados preliminares",
        "",
        "Texto generado automáticamente desde la plataforma de análisis. "
        "Revise y adapte la redacción al estilo de su protocolo antes de incluirlo en la disertación.",
        "",
    ]
    for sec in sections:
        lines.append(f"### {sec['title']}")
        lines.append("")
        for p in sec.get("paragraphs", []):
            lines.append(p)
            lines.append("")
        for sub in sec.get("subsections", []):
            lines.append(f"#### {sub['title']}")
            lines.append("")
            for b in sub.get("bullets", []):
                lines.append(f"- {b}")
            lines.append("")
        for b in sec.get("bullets", []):
            lines.append(f"- {b}")
        lines.append("")
    return "\n".join(lines).strip()


def get_metodos_document() -> Dict[str, Any]:
    sections = _sections()
    return {
        "title": "Métodos estadísticos utilizados",
        "subtitle": "Resultados preliminares — síntesis para Materiales y métodos",
        "intro": (
            "Este panel resume los procedimientos implementados en la plataforma de análisis preliminar. "
            "Puede copiar el texto y adaptarlo a la sección de análisis estadístico de su disertación."
        ),
        "sections": sections,
        "markdown": _build_markdown(sections),
        "review_notes": [
            "Módulo 4 (programación fetal): cinco subanálisis independientes (IAP, Mann-Whitney, Spearman, LASSO, CART) verificados e integrados en API y frontend.",
            "Regresión LASSO: penalización L1 fija (C=1); AUC y OR con IC 95 % por bootstrap; validación cruzada estratificada adaptada al tamaño de la clase minoritaria.",
            "Árbol CART: poda ccp por CV; diagrama y reglas en lenguaje clínico; interpretación cautelosa recomendada con n < 40.",
            "Coherencia IAP: misma definición de componentes en calcular, comparar y correlacionar.",
            "α = 0,05 en todos los módulos con prueba de hipótesis.",
        ],
    }


def register_metodos_routes(router: APIRouter) -> None:
    @router.get("/prelim/metodos")
    async def prelim_metodos():
        return {"success": True, **get_metodos_document()}
