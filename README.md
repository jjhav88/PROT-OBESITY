# Protocolo de Investigación — Obesidad, Inflamación de bajo grado y Neurocognición

Plataforma web para la gestión, evaluación clínica y análisis estadístico de los datos del proyecto de investigación.

> **Protocolo de Investigación**
> **Obesidad-Inflamación de bajo grado y Neurocognición**
> Escuela Superior de Medicina, Instituto Politécnico Nacional (IPN)

### Investigadores principales

- **Dr. Rodrigo Romero Nava**
- **Dra. Karla Aidee Aguayo Cerón**
- **MsC. Julio Jesús Garcia Coste**

---

## Descripción general

Esta aplicación centraliza el flujo de trabajo del protocolo: desde la carga y depuración de las bases de datos de participantes, la captura estructurada de la historia clínica y las mediciones antropométricas, la evaluación neuropsicológica infantil (BANPE), hasta el análisis estadístico avanzado orientado a la relación entre obesidad, marcadores de inflamación de bajo grado y desempeño neurocognitivo.

Está diseñada para uso por parte del equipo de investigación y personal clínico, con generación automática de reportes y visualizaciones interactivas.

## Estado de desarrollo

El proyecto se encuentra en **fase piloto funcional**. Los módulos principales están operativos y en uso; algunos estímulos gráficos (láminas) y subpruebas específicas del BANPE, así como refinamientos de análisis, continúan en integración.

| Módulo | Estado |
|---|---|
| Gestión de bases de datos y generación de IDs únicos | Funcional |
| Historia Clínica del paciente | Funcional |
| Antropometría y percentiles OMS | Funcional |
| Perfil lipídico y riesgo cardiovascular | Funcional |
| Reporte para padres/tutores (PDF + vista previa) | Funcional |
| BANPE — Puntuaciones, tablas normalizadas y gráfica de desempeño | Funcional |
| BANPE — Aplicar Prueba (protocolo completo de aplicación) | Funcional (integración de láminas/subpruebas en curso) |
| Análisis de Datos (descriptivo, inferencial, avanzado, fetal) | Funcional |

## Módulos y funcionalidades

### 1. Gestión de bases de datos e identificadores
- Carga de archivos Excel (`.xlsx`, `.xls`) con vista previa de los datos.
- Generación de identificadores únicos (UUID4) por observación.
- Descarga de la base actualizada y generación de etiquetas.
- Depuración de columnas de identificación del paciente.

### 2. Historia Clínica
Captura estructurada y persistente por paciente:
- Antecedentes personales y familiares.
- Esquema de vacunación.
- Desarrollo psicomotor.
- Diagnóstico general y nutricional.
- Exploración física.
- Datos del tutor y del médico.
- Exportación de la historia clínica en PDF y plantillas de captura.

### 3. Antropometría y percentiles OMS
- Registro de peso, talla, IMC, circunferencia de cintura, perímetro braquial y perímetro cefálico.
- Cálculo de percentiles con tablas de referencia de la OMS (rangos 0–5 años, 5–10 y 5–19 años según el indicador).
- Mensajes claros cuando no existe tabla de referencia para una edad/indicador.

### 4. Perfil lipídico
- Registro de valores de laboratorio y plantillas de captura.
- Cálculos derivados: VLDL, No-HDL, relación Colesterol Total/HDL y estimación de riesgo cardiovascular.

### 5. Reporte para padres/tutores
- Vista previa y generación de reporte en PDF.
- Incluye gráficas de crecimiento (IMC, talla y peso) según la edad del niño.
- Notas personalizables por paciente.

### 6. BANPE — Batería de Evaluación Neuropsicológica para Preescolares
- Captura de puntuaciones naturales y codificadas con suma automática.
- Cálculo automático de la puntuación normalizada a partir de las tablas normalizadas.
- Clasificación del desempeño (Normal Alto, Normal, Alteración leve, Alteración severa).
- Gráfica de **Performance** con franjas de color por rango de clasificación.
- **Aplicar Prueba**: formulario completo del protocolo de aplicación, con Historia Clínica-BANPE, Evaluación de Signos Neurológicos y Protocolo de Aplicación (orientación, atención, memoria, lenguaje, coordinación, funciones ejecutivas, teoría de la mente, entre otras áreas), con autocálculo de puntajes y visor de anexos.

### 7. Análisis de Datos
Módulo estadístico interactivo con visualizaciones (Plotly):
- **Preliminares / Métodos**: descripción de los métodos y supuestos aplicados.
- **Descriptivo**: matrices de correlación (Pearson/Spearman según distribución), radar comparativo, distribuciones y regresión lineal con R².
- **Inferencial**: comparación de grupos (ANOVA / Kruskal-Wallis) con post-hoc (Tukey, Games-Howell, Dunn), pruebas de chi-cuadrado, regresión y ANCOVA.
- **Avanzado**: Análisis de Componentes Principales (PCA) y análisis de mediación.
- **Programación fetal**: correlaciones, comparaciones, índices, regresión LASSO y árboles de decisión.

## Arquitectura y tecnologías

- **Backend**: FastAPI (Python 3.13), Uvicorn.
- **Análisis de datos**: Pandas, NumPy, SciPy, scikit-learn, scikit-posthocs, statsmodels.
- **Generación de PDF**: ReportLab.
- **Frontend**: HTML5, CSS3 y JavaScript (vanilla), con Plotly.js para gráficas interactivas.
- **Persistencia**: archivos Excel/JSON en el sistema de archivos del servidor.

## Estructura del proyecto

```
randomID/
├── main.py                     # Aplicación FastAPI y rutas principales
├── hc.py / hc.js / hc.css      # Módulo de Historia Clínica
├── banpe*.js / banpe*.css      # Módulo BANPE y "Aplicar Prueba"
├── analysis_*.py               # Motores de análisis estadístico (backend)
├── analysis/                   # Frontend del módulo de análisis
├── index.html / analysis.html  # Interfaces principales
├── static/                     # CSS, JS, imágenes y anexos
├── uploads/                    # Bases de datos de participantes
├── banpe_data/                 # Datos del módulo BANPE
├── requirements.txt            # Dependencias de Python (versiones fijadas)
├── .python-version             # Versión de Python (3.13)
└── README.md                   # Este archivo
```

## Instalación y ejecución local

1. **Clonar el repositorio** y entrar a la carpeta de la app:
   ```bash
   cd randomID
   ```

2. **Crear y activar un entorno virtual** (recomendado):
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # Linux / macOS
   source venv/bin/activate
   ```

3. **Instalar dependencias**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Iniciar el servidor**:
   ```bash
   python main.py
   ```

5. Abrir el navegador en: `http://localhost:8765`

Para detener el servidor, presiona `Ctrl + C`. El puerto puede cambiarse con la variable de entorno `PORT`.

## Despliegue (Render)

- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `python main.py` (la app lee `PORT` y escucha en `0.0.0.0`)
- **Runtime**: Python 3.13 (definido en `.python-version`)

## Confidencialidad de datos

Esta plataforma procesa **información clínica sensible de participantes**. El acceso al repositorio y al despliegue debe restringirse al equipo autorizado. Se recomienda mantener el repositorio en modo **privado** y cumplir con las normativas de protección de datos y ética en investigación aplicables.

## Créditos

**Directores de investigación:** Dr. Rodrigo Romero Nava y Dra. Karla Aidee Aguayo Cerón.
**Desarrollo:** MsC. Julio Jesús Garcia Coste.

Escuela Superior de Medicina — Instituto Politécnico Nacional.

## Licencia

Todos los derechos reservados. El uso de este software y de los datos asociados está restringido al equipo de investigación del protocolo.
