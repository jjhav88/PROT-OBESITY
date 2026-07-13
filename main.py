from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, Response, RedirectResponse, JSONResponse
import pandas as pd
import uuid
import os
import tempfile
from typing import List, Dict, Any
import json
import random
import string
import unicodedata
from datetime import datetime, date
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Importar el módulo de Historia Clínica
from hc import hc_router
from analysis_api import analysis_router
from auth import (
    auth_router,
    ensure_seed_admin,
    get_session_user,
    is_public_path,
    is_analysis_path,
    is_admin_only_path,
    ROLE_ADMIN,
)
import audit
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, PageTemplate, Frame
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import black
from reportlab.lib import colors
from io import BytesIO

app = FastAPI(title="Excel ID Generator", description="Aplicación para generar IDs únicos en archivos Excel")


@app.middleware("http")
async def auth_guard(request: Request, call_next):
    """Protege toda la app y aplica los permisos por rol.

    - Sin sesión: solo login y estáticos; el resto redirige a /login (páginas) o 401 (APIs).
    - Rol 'investigador': sin acceso al módulo de Análisis de Datos.
    - Rutas de gestión de usuarios: solo administrador.
    """
    path = request.url.path
    wants_html = "text/html" in request.headers.get("accept", "")

    if is_public_path(path):
        return await call_next(request)

    user = get_session_user(request)
    if not user:
        if wants_html:
            return RedirectResponse(url="/login")
        return JSONResponse({"detail": "No autenticado"}, status_code=401)

    is_admin = user.get("role") == ROLE_ADMIN
    if not is_admin and (is_analysis_path(path) or is_admin_only_path(path)):
        if wants_html:
            return RedirectResponse(url="/")
        return JSONResponse({"detail": "No autorizado"}, status_code=403)

    response = await call_next(request)

    if request.method in ("POST", "PUT", "PATCH", "DELETE") and path not in ("/api/login", "/api/logout"):
        audit.log_event(
            "action",
            user.get("username"),
            detail=f"{request.method} {path}",
            status=response.status_code,
        )

    return response


# Incluir el router de Historia Clínica
app.include_router(hc_router)
app.include_router(analysis_router)
app.include_router(auth_router)

# Crear la cuenta de administrador si aún no existe
ensure_seed_admin()

# Servir archivos estáticos adicionales
@app.get("/hc.html")
async def get_hc_html():
    """Servir el archivo HTML del módulo Historia Clínica"""
    try:
        with open("hc.html", "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo hc.html no encontrado")

@app.get("/hc.css")
async def get_hc_css():
    """Servir el archivo CSS del módulo Historia Clínica"""
    try:
        with open("hc.css", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/css")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo hc.css no encontrado")

@app.get("/hc.js")
async def get_hc_js():
    """Servir el archivo JS del módulo Historia Clínica"""
    try:
        with open("hc.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo hc.js no encontrado")


@app.get("/banpe.css")
async def get_banpe_css():
    """Servir estilos del módulo BANPE"""
    try:
        with open("banpe.css", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/css")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo banpe.css no encontrado")


@app.get("/banpe.js")
async def get_banpe_js():
    """Servir script del módulo BANPE"""
    try:
        with open("banpe.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo banpe.js no encontrado")


@app.get("/banpe-apply.css")
async def get_banpe_apply_css():
    """Servir estilos del módulo BANPE — Aplicar Prueba"""
    try:
        with open("banpe-apply.css", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/css")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo banpe-apply.css no encontrado")


@app.get("/banpe-apply.js")
async def get_banpe_apply_js():
    """Servir script del módulo BANPE — Aplicar Prueba"""
    try:
        with open("banpe-apply.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo banpe-apply.js no encontrado")


@app.get("/banpe-norm-data.js")
async def get_banpe_norm_data_js():
    """Tablas índice → normalizada (edad) para BANPE"""
    try:
        with open("banpe-norm-data.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo banpe-norm-data.js no encontrado")


@app.get("/banpe-cod-tables-data.js")
async def get_banpe_cod_tables_data_js():
    """Tablas de criterios de puntuación codificada BANPE (columnas 1–5 por edad)"""
    try:
        with open("banpe-cod-tables-data.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo banpe-cod-tables-data.js no encontrado")


BANPE_DATA_DIR = os.path.abspath("banpe_data")

# Columnas Excel: puntuación normalizada por área (BANPE)
BANPE_PNORM_EXCEL_COLUMNS = [
    "PNorm_BANPE_Orientacion",
    "PNorm_BANPE_Atencion_Concentracion",
    "PNorm_BANPE_Memoria",
    "PNorm_BANPE_Lenguaje_Comprension",
    "PNorm_BANPE_Lenguaje_Expresion",
    "PNorm_BANPE_Lenguaje_Articulacion",
    "PNorm_BANPE_Coordinacion_Motora",
    "PNorm_BANPE_Habilidades_Academicas",
    "PNorm_BANPE_Inhibicion",
    "PNorm_BANPE_Memoria_Trabajo",
    "PNorm_BANPE_Flexibilidad_Mental",
    "PNorm_BANPE_Planeacion",
    "PNorm_BANPE_Abstraccion",
    "PNorm_BANPE_Teoria_Mente",
    "PNorm_BANPE_Procesamiento_Riesgo_Beneficio",
]


def _banpe_registration_file_path(database_id: str, patient_id: str) -> str:
    def _seg(s: str) -> str:
        return "".join(c if (c.isalnum() or c in "-_") else "_" for c in str(s))[:200]

    os.makedirs(BANPE_DATA_DIR, exist_ok=True)
    return os.path.join(BANPE_DATA_DIR, f"{_seg(database_id)}_{_seg(patient_id)}.json")


def _banpe_find_patient_row_index(df: pd.DataFrame, patient_id: str) -> int:
    if "ID_Unico" not in df.columns:
        raise HTTPException(status_code=400, detail="La base de datos no tiene columna ID_Unico")
    patient_row = df[df["ID_Unico"].astype(str) == str(patient_id)]
    if patient_row.empty:
        raise HTTPException(status_code=404, detail=f"Paciente con ID {patient_id} no encontrado")
    return int(patient_row.index[0])


@app.get("/api/banpe/check-registration/{database_id}/{patient_id}")
async def api_banpe_check_registration(database_id: str, patient_id: str):
    """Indica si ya existe evaluación BANPE guardada (archivo JSON en banpe_data)."""
    path = _banpe_registration_file_path(database_id, patient_id)
    return {
        "success": True,
        "has_banpe": os.path.isfile(path),
        "database_id": database_id,
        "patient_id": patient_id,
    }


@app.get("/api/banpe/patient-data/{database_id}/{patient_id}")
async def api_banpe_get_patient_data(database_id: str, patient_id: str):
    """Devuelve el registro BANPE guardado (JSON) para rellenar el formulario de edición."""
    path = _banpe_registration_file_path(database_id, patient_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="No hay evaluación BANPE guardada para este paciente")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"success": True, "database_id": database_id, "patient_id": patient_id, "registration": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error leyendo BANPE: {str(e)}")


@app.post("/api/banpe/save")
async def api_banpe_save(request: Request):
    """Guarda evaluación BANPE: JSON completo + columnas de puntuación normalizada en el Excel."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Cuerpo JSON inválido")

    database_id = body.get("database_id")
    patient_id = body.get("patient_id")
    registration = body.get("registration")
    pnorms = body.get("pnorms") or {}

    if not database_id or not patient_id or not isinstance(registration, dict):
        raise HTTPException(status_code=400, detail="Faltan database_id, patient_id o registration")

    # 1) Guardar JSON
    path = _banpe_registration_file_path(database_id, patient_id)
    os.makedirs(BANPE_DATA_DIR, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(registration, f, indent=2, ensure_ascii=False)

    # 2) Excel: puntuaciones normalizadas por área
    metadata = load_metadata()
    database_file = None
    for file_info in metadata:
        if file_info.get("id") == database_id:
            database_file = file_info
            break
    if not database_file:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")

    file_path = database_file.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")

    df = pd.read_excel(file_path)
    patient_index = _banpe_find_patient_row_index(df, patient_id)

    for col in BANPE_PNORM_EXCEL_COLUMNS:
        if col not in df.columns:
            df[col] = None

    for col in BANPE_PNORM_EXCEL_COLUMNS:
        val = pnorms.get(col)
        if val is None or val == "":
            df.at[patient_index, col] = None
        else:
            try:
                df.at[patient_index, col] = float(val)
            except (TypeError, ValueError):
                df.at[patient_index, col] = str(val)

    df.to_excel(file_path, index=False)
    database_file["last_updated"] = datetime.now().isoformat()
    save_metadata(metadata)

    return {"success": True, "message": "Evaluación BANPE guardada", "database_id": database_id, "patient_id": patient_id}


@app.get("/eni2.css")
async def get_eni2_css():
    """Servir estilos del módulo ENI-2"""
    try:
        with open("eni2.css", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="text/css")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo eni2.css no encontrado")


@app.get("/eni2.js")
async def get_eni2_js():
    """Servir script del módulo ENI-2"""
    try:
        with open("eni2.js", "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/javascript")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Archivo eni2.js no encontrado")

# Crear directorio para archivos temporales
UPLOAD_DIR = os.path.abspath("uploads")
METADATA_FILE = os.path.abspath("file_metadata.json")


if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

# Inicializar archivo de metadatos si no existe
if not os.path.exists(METADATA_FILE):
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump([], f, indent=2, ensure_ascii=False)

# Cargar metadatos existentes
def load_metadata():
    try:
        if os.path.exists(METADATA_FILE):
            with open(METADATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data
        else:
            return []
    except Exception as e:
        return []

def save_metadata(metadata):
    try:
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
    except Exception as e:
        pass

# Montar archivos estáticos
app.mount("/static", StaticFiles(directory="static"), name="static")

def generate_short_id(length=4):
    """Generar un ID corto y único de 4 caracteres"""
    characters = string.ascii_uppercase + string.digits  # A-Z y 0-9
    return ''.join(random.choice(characters) for _ in range(length))

def generate_unique_ids(count):
    """Generar una lista de IDs únicos cortos"""
    ids = set()
    while len(ids) < count:
        ids.add(generate_short_id())
    return list(ids)

def create_labels_pdf(patient_ids, filename, database_name="Base de Datos"):
    """Crear PDF con rotulados tipo tirita para todos los pacientes usando ReportLab"""
    pdf_path = os.path.join(UPLOAD_DIR, filename)
    
    # Configuración de la página A4
    page_width, page_height = A4
    margin = 10 * mm
    header_height = 35 * mm  # Espacio para el encabezado
    
    # Dimensiones de cada rotulado (tirita) - mantener el tamaño actual
    label_width = 45 * mm
    label_height = 10 * mm
    
    # Número de columnas y filas por página - 4 columnas x 20 filas = 80 por página
    cols_per_page = 4
    rows_per_page = 20  # 20 filas para 80 rotulados por página
    labels_per_page = cols_per_page * rows_per_page
    
    # Espaciado entre rotulados - ajustado para 4 columnas
    col_spacing = 1.5 * mm
    row_spacing = 0.8 * mm
    
    def draw_header(canvas, page_width, page_height, database_name):
        """Dibujar encabezado en la página"""
        # Configurar fuente para el encabezado
        canvas.setFont("Helvetica-Bold", 12)
        canvas.setFillColorRGB(0, 0, 0)
        
        # Título principal
        title = "Protocolo de Investigación"
        title_width = canvas.stringWidth(title, "Helvetica-Bold", 12)
        title_x = (page_width - title_width) / 2
        title_y = page_height - 15 * mm
        canvas.drawString(title_x, title_y, title)
        
        # Subtítulo
        subtitle = "Escuela Superior de Medicina"
        subtitle_width = canvas.stringWidth(subtitle, "Helvetica-Bold", 10)
        subtitle_x = (page_width - subtitle_width) / 2
        subtitle_y = page_height - 20 * mm
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(subtitle_x, subtitle_y, subtitle)
        
        # Nombre de la base de datos
        db_text = f"Plantilla de Rotulados para: {database_name}"
        db_width = canvas.stringWidth(db_text, "Helvetica", 9)
        db_x = (page_width - db_width) / 2
        db_y = page_height - 25 * mm
        canvas.setFont("Helvetica", 9)
        canvas.drawString(db_x, db_y, db_text)
        
        # Línea separadora
        canvas.setStrokeColorRGB(0, 0, 0)
        canvas.setLineWidth(0.5)
        canvas.line(10 * mm, page_height - 30 * mm, page_width - 10 * mm, page_height - 30 * mm)
    
    try:
        # Crear el canvas del PDF
        c = canvas.Canvas(pdf_path, pagesize=A4)
        
        # Dibujar encabezado en la primera página
        draw_header(c, page_width, page_height, database_name)
        
        # Procesar todos los IDs - llenar por columnas
        for i, patient_id in enumerate(patient_ids):
            # Calcular posición en la página (llenar por columnas)
            position_in_page = i % labels_per_page
            
            # Llenar por columnas: columna 1 completa, luego columna 2, etc.
            col = position_in_page // rows_per_page  # Columna actual
            row = position_in_page % rows_per_page    # Fila dentro de la columna
            
            # Calcular coordenadas (ajustadas para el encabezado)
            x = margin + col * (label_width + col_spacing)
            y = page_height - header_height - (row + 1) * (label_height + row_spacing)
            
            # Si necesitamos una nueva página (después de 80 rotulados)
            if i > 0 and i % labels_per_page == 0:
                c.showPage()
                # Dibujar encabezado en la nueva página
                draw_header(c, page_width, page_height, database_name)
            
            # Dibujar el rectángulo del rotulado con borde más grueso
            c.setStrokeColorRGB(0, 0, 0)  # Negro
            c.setLineWidth(0.5)
            c.rect(x, y, label_width, label_height)
            
            # Dibujar línea punteada para guía de corte
            c.setDash([1, 1])
            c.setLineWidth(0.3)
            c.rect(x - 1, y - 1, label_width + 2, label_height + 2)
            c.setDash([])  # Resetear a línea sólida
            
            # Centrar ambas líneas verticalmente en el rotulado
            center_y = y + label_height / 2  # Centro vertical del rotulado
            
            # Texto del protocolo (primera línea) - centrado verticalmente
            protocol_text = "Protocolo de Investigación ESM-IPN"
            c.setFont("Helvetica-Bold", 4)  # Fuente más pequeña para que quepa
            text_width = c.stringWidth(protocol_text, "Helvetica-Bold", 4)
            text_x = x + (label_width - text_width) / 2
            text_y = center_y + 1 * mm  # Ligeramente arriba del centro
            
            c.setFillColorRGB(0, 0, 0)  # Asegurar que el texto sea negro
            c.drawString(text_x, text_y, protocol_text)
            
            # Texto del ID del paciente (segunda línea) - centrado verticalmente
            patient_text = f"ID_Paciente: {patient_id}"
            c.setFont("Helvetica-Bold", 6)  # Fuente ajustada para el espacio
            text_width = c.stringWidth(patient_text, "Helvetica-Bold", 6)
            text_x = x + (label_width - text_width) / 2
            text_y = center_y - 1 * mm  # Ligeramente abajo del centro
            
            c.setFillColorRGB(0, 0, 0)  # Asegurar que el texto sea negro
            c.drawString(text_x, text_y, patient_text)
        
        # Guardar el PDF
        c.save()
        return pdf_path
        
    except Exception as e:
        # Fallback: crear un archivo de texto simple
        txt_path = pdf_path.replace('.pdf', '.txt')
        with open(txt_path, 'w', encoding='utf-8') as f:
            f.write("ROTULADOS PARA TUBOS DE ENSAYO\n")
            f.write("=" * 50 + "\n\n")
            for i, patient_id in enumerate(patient_ids, 1):
                f.write(f"{i:3d}. Protocolo de Investigación ESM-IPN\n")
                f.write(f"     ID_Paciente: {patient_id}\n")
                f.write("-" * 30 + "\n")
        return txt_path

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Servir la página principal"""
    with open("index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


def _serve_analysis_asset(filename: str, media_type: str):
    try:
        path = os.path.join("analysis", filename)
        with open(path, "r", encoding="utf-8") as f:
            return Response(content=f.read(), media_type=media_type)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Archivo {filename} no encontrado")


@app.get("/analysis.css")
async def get_analysis_css():
    return _serve_analysis_asset("analysis.css", "text/css")


@app.get("/analysis-main.js")
async def get_analysis_main_js():
    return _serve_analysis_asset("analysis-main.js", "application/javascript")


@app.get("/analysis-plotly.js")
async def get_analysis_plotly_js():
    return _serve_analysis_asset("analysis-plotly.js", "application/javascript")


@app.get("/analysis-prelim-tabs.js")
async def get_analysis_prelim_tabs_js():
    return _serve_analysis_asset("analysis-prelim-tabs.js", "application/javascript")


@app.get("/analysis-descriptivo.js")
async def get_analysis_descriptivo_js():
    return _serve_analysis_asset("analysis-descriptivo.js", "application/javascript")


@app.get("/analysis-inferencial.js")
async def get_analysis_inferencial_js():
    return _serve_analysis_asset("analysis-inferencial.js", "application/javascript")


@app.get("/analysis-inferencial.css")
async def get_analysis_inferencial_css():
    return _serve_analysis_asset("analysis-inferencial.css", "text/css")


@app.get("/analysis-inferencial-chisq.js")
async def get_analysis_inferencial_chisq_js():
    return _serve_analysis_asset("analysis-inferencial-chisq.js", "application/javascript")


@app.get("/analysis-inferencial-regression.js")
async def get_analysis_inferencial_regression_js():
    return _serve_analysis_asset("analysis-inferencial-regression.js", "application/javascript")


@app.get("/analysis-inferencial-ancova.js")
async def get_analysis_inferencial_ancova_js():
    return _serve_analysis_asset("analysis-inferencial-ancova.js", "application/javascript")


@app.get("/analysis-avanzado.css")
async def get_analysis_avanzado_css():
    return _serve_analysis_asset("analysis-avanzado.css", "text/css")


@app.get("/analysis-avanzado.js")
async def get_analysis_avanzado_js():
    return _serve_analysis_asset("analysis-avanzado.js", "application/javascript")


@app.get("/analysis-avanzado-pca.js")
async def get_analysis_avanzado_pca_js():
    return _serve_analysis_asset("analysis-avanzado-pca.js", "application/javascript")


@app.get("/analysis-avanzado-mediation.js")
async def get_analysis_avanzado_mediation_js():
    return _serve_analysis_asset("analysis-avanzado-mediation.js", "application/javascript")


@app.get("/analysis-fetal.css")
async def get_analysis_fetal_css():
    return _serve_analysis_asset("analysis-fetal.css", "text/css")


@app.get("/analysis-fetal.js")
async def get_analysis_fetal_js():
    return _serve_analysis_asset("analysis-fetal.js", "application/javascript")


@app.get("/analysis-fetal-iap.js")
async def get_analysis_fetal_iap_js():
    return _serve_analysis_asset("analysis-fetal-iap.js", "application/javascript")


@app.get("/analysis-fetal-compare.js")
async def get_analysis_fetal_compare_js():
    return _serve_analysis_asset("analysis-fetal-compare.js", "application/javascript")


@app.get("/analysis-fetal-correlate.js")
async def get_analysis_fetal_correlate_js():
    return _serve_analysis_asset("analysis-fetal-correlate.js", "application/javascript")


@app.get("/analysis-fetal-lasso.js")
async def get_analysis_fetal_lasso_js():
    return _serve_analysis_asset("analysis-fetal-lasso.js", "application/javascript")


@app.get("/analysis-fetal-tree.js")
async def get_analysis_fetal_tree_js():
    return _serve_analysis_asset("analysis-fetal-tree.js", "application/javascript")


@app.get("/analysis-prelim-metodos.css")
async def get_analysis_prelim_metodos_css():
    return _serve_analysis_asset("analysis-prelim-metodos.css", "text/css")


@app.get("/analysis-prelim-metodos.js")
async def get_analysis_prelim_metodos_js():
    return _serve_analysis_asset("analysis-prelim-metodos.js", "application/javascript")


@app.get("/analysis-preliminares.js")
async def get_analysis_preliminares_js():
    return _serve_analysis_asset("analysis-preliminares.js", "application/javascript")


@app.get("/analysis-generales.js")
async def get_analysis_generales_js():
    return _serve_analysis_asset("analysis-generales.js", "application/javascript")


@app.get("/analysis", response_class=HTMLResponse)
async def read_analysis():
    """Servir la vista de Análisis de Datos"""
    with open("analysis.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())


@app.get("/analysis/", response_class=HTMLResponse)
@app.get("/analisis", response_class=HTMLResponse)
@app.get("/analisis/", response_class=HTMLResponse)
@app.get("/analisis-de-datos", response_class=HTMLResponse)
async def read_analysis_alias():
    """Alias para la vista de Análisis de Datos"""
    return await read_analysis()

@app.get("/status")
async def get_status():
    """Verificar estado del sistema"""
    try:
        metadata = load_metadata()
        return {
            "success": True,
            "metadata_file_exists": os.path.exists(METADATA_FILE),
            "uploads_dir_exists": os.path.exists(UPLOAD_DIR),
            "files_count": len(metadata),
            "metadata_file_size": os.path.getsize(METADATA_FILE) if os.path.exists(METADATA_FILE) else 0,
            "metadata_file_path": METADATA_FILE,
            "uploads_dir_path": UPLOAD_DIR,
            "metadata_content": metadata
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Subir archivo Excel y mostrar vista previa"""
    try:
        # Verificar que sea un archivo Excel
        if not file.filename.endswith(('.xlsx', '.xls')):
            raise HTTPException(status_code=400, detail="Solo se permiten archivos Excel (.xlsx, .xls)")
        
        # Leer el archivo Excel
        contents = await file.read()
        df = pd.read_excel(contents)
        
        # Limpiar valores NaN para JSON
        df = df.fillna('')  # Reemplazar NaN con cadenas vacías
        
        # Convertir DataFrame a diccionario para JSON
        data = df.to_dict('records')
        
        return {
            "success": True,
            "filename": file.filename,
            "data": data,
            "columns": list(df.columns),
            "rows": len(df)
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al procesar el archivo: {str(e)}")

@app.post("/generate-ids")
async def generate_ids(file: UploadFile = File(...)):
    """Generar IDs únicos y devolver archivo actualizado"""
    try:
        # Leer el archivo Excel
        contents = await file.read()
        df = pd.read_excel(contents)
        
        # Limpiar valores NaN para JSON
        df = df.fillna('')  # Reemplazar NaN con cadenas vacías
        
        # Generar IDs únicos cortos
        random_ids = generate_unique_ids(len(df))
        df['ID_Unico'] = random_ids
        
        # Guardar archivo temporal
        temp_filename = f"updated_{file.filename}"
        temp_path = os.path.join(UPLOAD_DIR, temp_filename)
        
        # Exportar a Excel
        df.to_excel(temp_path, index=False)
        
        # Guardar metadatos
        metadata = load_metadata()
        
        file_id = str(uuid.uuid4())
        file_info = {
            "id": file_id,
            "original_filename": file.filename,
            "processed_filename": temp_filename,
            "rows": len(df),
            "columns": list(df.columns),
            "created_at": datetime.now().isoformat(),
            "file_path": temp_path
        }
        
        metadata.append(file_info)
        
        save_metadata(metadata)
        
        return {
            "success": True,
            "filename": temp_filename,
            "download_url": f"/download/{temp_filename}",
            "data": df.to_dict('records'),
            "rows": len(df),
            "file_id": file_id
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al generar IDs: {str(e)}")

@app.get("/download/{filename}")
async def download_file(filename: str):
    """Descargar archivo Excel actualizado"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@app.get("/files")
async def get_files():
    """Obtener lista de archivos procesados"""
    try:
        metadata = load_metadata()
        
        # Limpiar metadatos de archivos que ya no existen
        cleaned_metadata = []
        for file_info in metadata:
            file_path = file_info.get("file_path", "")
            if os.path.exists(file_path):
                cleaned_metadata.append(file_info)
        
        # Si se eliminaron archivos, actualizar el archivo de metadatos
        if len(cleaned_metadata) != len(metadata):
            save_metadata(cleaned_metadata)
        
        return {"success": True, "files": cleaned_metadata}
    except Exception as e:
        return {"success": False, "files": [], "error": str(e)}

@app.get("/files/{file_id}")
async def get_file_info(file_id: str):
    """Obtener información de un archivo específico"""
    metadata = load_metadata()
    file_info = next((f for f in metadata if f["id"] == file_id), None)
    if not file_info:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return {"success": True, "file": file_info}

@app.get("/files/{file_id}/complete")
async def get_complete_file_data(file_id: str):
    """Obtener todos los datos de un archivo procesado (sin límites)"""
    try:
        metadata = load_metadata()
        file_info = next((f for f in metadata if f["id"] == file_id), None)
        
        if not file_info:
            # Limpiar metadatos y buscar nuevamente
            cleaned_metadata = []
            for f in metadata:
                if os.path.exists(f.get("file_path", "")):
                    cleaned_metadata.append(f)
            
            if len(cleaned_metadata) != len(metadata):
                save_metadata(cleaned_metadata)
            
            # Buscar nuevamente después de la limpieza
            file_info = next((f for f in cleaned_metadata if f["id"] == file_id), None)
            if not file_info:
                raise HTTPException(status_code=404, detail="Archivo no encontrado en el historial")
        
        if not os.path.exists(file_info["file_path"]):
            raise HTTPException(status_code=404, detail="El archivo físico fue eliminado")
        
        df = pd.read_excel(file_info["file_path"])
        df = df.fillna('')
        
        # Validar que el DataFrame no esté vacío
        if df.empty:
            return {
                "success": True,
                "data": [],
                "columns": [],
                "rows": 0
            }
        
        return {
            "success": True,
            "data": df.to_dict('records'),
            "columns": list(df.columns),
            "rows": len(df)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el archivo: {str(e)}")

@app.get("/files/{file_id}/preview")
async def preview_file(file_id: str):
    """Vista previa de un archivo procesado"""
    try:
        metadata = load_metadata()
        file_info = next((f for f in metadata if f["id"] == file_id), None)
        
        if not file_info:
            # Limpiar metadatos y buscar nuevamente
            cleaned_metadata = []
            for f in metadata:
                if os.path.exists(f.get("file_path", "")):
                    cleaned_metadata.append(f)
            
            if len(cleaned_metadata) != len(metadata):
                save_metadata(cleaned_metadata)
            
            # Buscar nuevamente después de la limpieza
            file_info = next((f for f in cleaned_metadata if f["id"] == file_id), None)
            if not file_info:
                raise HTTPException(status_code=404, detail="Archivo no encontrado en el historial")
        
        if not os.path.exists(file_info["file_path"]):
            raise HTTPException(status_code=404, detail="El archivo físico fue eliminado")
        
        df = pd.read_excel(file_info["file_path"])
        df = df.fillna('')
        
        # Validar que el DataFrame no esté vacío
        if df.empty:
            return {
                "success": True,
                "data": [],
                "columns": [],
                "rows": 0
            }
        
        return {
            "success": True,
            "data": df.to_dict('records'),
            "columns": list(df.columns),
            "rows": len(df)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el archivo: {str(e)}")

@app.delete("/files/{file_id}")
async def delete_file(file_id: str):
    """Eliminar archivo del historial"""
    metadata = load_metadata()
    file_info = next((f for f in metadata if f["id"] == file_id), None)
    if not file_info:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    
    # Eliminar archivo físico
    if os.path.exists(file_info["file_path"]):
        os.remove(file_info["file_path"])
    
    # Eliminar de metadatos
    metadata = [f for f in metadata if f["id"] != file_id]
    save_metadata(metadata)
    
    return {"success": True, "message": "Archivo eliminado"}

@app.get("/files/{file_id}/generate-labels")
async def generate_labels_pdf(file_id: str):
    """Generar PDF automático con rotulados para todos los pacientes"""
    try:
        metadata = load_metadata()
        file_info = next((f for f in metadata if f["id"] == file_id), None)
        
        if not file_info:
            raise HTTPException(status_code=404, detail="Archivo no encontrado en el historial")
        
        if not os.path.exists(file_info["file_path"]):
            raise HTTPException(status_code=404, detail="El archivo físico fue eliminado")
        
        # Leer el archivo Excel
        df = pd.read_excel(file_info["file_path"])
        df = df.fillna('')
        
        # Verificar que existe la columna ID_Unico
        if 'ID_Unico' not in df.columns:
            raise HTTPException(status_code=400, detail="El archivo no contiene la columna ID_Unico")
        
        # Obtener todos los IDs únicos
        patient_ids = df['ID_Unico'].tolist()
        patient_ids = [str(id).strip() for id in patient_ids if str(id).strip() != '']
        
        if not patient_ids:
            raise HTTPException(status_code=400, detail="No se encontraron IDs válidos en el archivo")
        
        # Generar nombre del archivo PDF
        pdf_filename = f"rotulados_{file_info['original_filename'].replace('.xlsx', '').replace('.xls', '')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        # Crear PDF con rotulados
        database_name = file_info['original_filename'].replace('.xlsx', '').replace('.xls', '')
        pdf_path = create_labels_pdf(patient_ids, pdf_filename, database_name)
        
        return {
            "success": True,
            "filename": pdf_filename,
            "download_url": f"/download/{pdf_filename}",
            "patient_count": len(patient_ids),
            "message": f"PDF generado con {len(patient_ids)} rotulados listo para imprimir."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al generar PDF: {str(e)}")

@app.delete("/cleanup/{filename}")
async def cleanup_file(filename: str):
    """Limpiar archivo temporal"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    return {"success": True, "message": "Archivo eliminado"}

@app.get("/oms-tables/bmi-percentiles-5-19")
async def get_bmi_percentiles_5_19(age_months: int, sex: str):
    """Obtener percentiles de IMC para niños de 5-19 años según OMS"""
    try:
        
        # Validar rango de edad (61-228 meses = 5-19 años)
        if age_months < 61 or age_months > 228:
            return {"success": False, "error": "Edad fuera del rango para tablas 5-19 años (61-228 meses)"}
        
        # Determinar archivo según sexo
        if sex.upper() == 'F':
            file_path = "oms_tables/table-IMC-girls-5-19years-per.xlsx"
        elif sex.upper() == 'M':
            file_path = "oms_tables/table-IMC-boys-5-19years-per.xlsx"
        else:
            return {"success": False, "error": "Sexo debe ser M o F"}
        
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            return {"success": False, "error": f"Archivo de tablas OMS no encontrado: {file_path}"}
        
        
        # Cargar datos
        df = pd.read_excel(file_path)
        
        # Buscar la columna de edad (puede tener diferentes nombres)
        age_column = None
        possible_age_columns = ['Month', 'month', 'Age (months)', 'Age', 'age', 'Age_months', 'age_months', 'Months', 'months']
        
        for col in possible_age_columns:
            if col in df.columns:
                age_column = col
                break
        
        if age_column is None:
            return {"success": False, "error": f"No se encontró columna de edad en el archivo. Columnas: {df.columns.tolist()}"}
        
        
        # Buscar la fila correspondiente a la edad en meses
        age_row = df[df[age_column] == age_months]
        
        if age_row.empty:
            return {"success": False, "error": f"No se encontraron datos para {age_months} meses"}
        
        
        # Buscar columnas de percentiles (pueden tener diferentes nombres)
        percentile_columns = {}
        possible_percentile_names = {
            'P3': ['3rd', 'P3', 'p3', '3'],
            'P5': ['5th', 'P5', 'p5', '5'],
            'P10': ['10th', 'P10', 'p10', '10'],
            'P15': ['15th', 'P15', 'p15', '15'],
            'P25': ['25th', 'P25', 'p25', '25'],
            'P50': ['50th', 'P50', 'p50', '50', 'Median', 'median'],
            'P75': ['75th', 'P75', 'p75', '75'],
            'P85': ['85th', 'P85', 'p85', '85'],
            'P90': ['90th', 'P90', 'p90', '90'],
            'P95': ['95th', 'P95', 'p95', '95'],
            'P97': ['97th', 'P97', 'p97', '97']
        }
        
        for percentile, possible_names in possible_percentile_names.items():
            for name in possible_names:
                if name in df.columns:
                    percentile_columns[percentile] = name
                    break
        
        
        # Extraer percentiles
        percentiles = {}
        for percentile, column_name in percentile_columns.items():
            if column_name in df.columns:
                percentiles[percentile] = float(age_row[column_name].iloc[0])
        
        
        return {
            "success": True,
            "percentiles": percentiles,
            "age_months": age_months,
            "sex": sex,
            "age_range": "5-19 years"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
@app.get("/oms-tables/weight-percentiles-5-10")
async def get_weight_percentiles_5_10(age_months: int, sex: str):
    """Obtener percentiles de peso para niños de 5-10 años según OMS"""
    try:
        
        # Validar rango de edad (61-120 meses = 5-10 años)
        if age_months < 61 or age_months > 120:
            return {"success": False, "error": "Edad fuera del rango para tablas de peso 5-10 años (61-120 meses)"}
        
        # Determinar archivo según sexo
        if sex.upper() == 'F':
            file_path = "oms_tables/table-peso-girls-5-10years-percentiles.xlsx"
        elif sex.upper() == 'M':
            file_path = "oms_tables/table-peso-boys - 5-10years-percentiles.xlsx"
        else:
            return {"success": False, "error": "Sexo debe ser M o F"}
        
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            return {"success": False, "error": f"Archivo de tablas OMS no encontrado: {file_path}"}
        
        
        # Cargar datos
        df = pd.read_excel(file_path)
        
        # Buscar la columna de edad (puede tener diferentes nombres)
        age_column = None
        possible_age_columns = ['Month', 'month', 'Age (months)', 'Age', 'age', 'Age_months', 'age_months', 'Months', 'months']
        
        for col in possible_age_columns:
            if col in df.columns:
                age_column = col
                break
        
        if age_column is None:
            return {"success": False, "error": f"No se encontró columna de edad en el archivo. Columnas: {df.columns.tolist()}"}
        
        
        # Buscar la fila correspondiente a la edad en meses
        age_row = df[df[age_column] == age_months]
        
        if age_row.empty:
            return {"success": False, "error": f"No se encontraron datos para {age_months} meses"}
        
        
        # Buscar columnas de percentiles (pueden tener diferentes nombres)
        percentile_columns = {}
        possible_percentile_names = {
            'P3': ['3rd', 'P3', 'p3', '3'],
            'P5': ['5th', 'P5', 'p5', '5'],
            'P10': ['10th', 'P10', 'p10', '10'],
            'P15': ['15th', 'P15', 'p15', '15'],
            'P25': ['25th', 'P25', 'p25', '25'],
            'P50': ['50th', 'P50', 'p50', '50', 'Median', 'median'],
            'P75': ['75th', 'P75', 'p75', '75'],
            'P85': ['85th', 'P85', 'p85', '85'],
            'P90': ['90th', 'P90', 'p90', '90'],
            'P95': ['95th', 'P95', 'p95', '95'],
            'P97': ['97th', 'P97', 'p97', '97']
        }
        
        for percentile, possible_names in possible_percentile_names.items():
            for name in possible_names:
                if name in df.columns:
                    percentile_columns[percentile] = name
                    break
        
        
        # Extraer percentiles
        percentiles = {}
        for percentile, column_name in percentile_columns.items():
            if column_name in df.columns:
                percentiles[percentile] = float(age_row[column_name].iloc[0])
        
        
        return {
            "success": True,
            "percentiles": percentiles,
            "age_months": age_months,
            "sex": sex,
            "age_range": "5-10 years"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
@app.get("/oms-tables/height-percentiles-5-19")
async def get_height_percentiles_5_19(age_months: int, sex: str):
    """Obtener percentiles de talla para niños de 5-19 años según OMS"""
    try:
        
        # Validar rango de edad (61-228 meses = 5-19 años)
        if age_months < 61 or age_months > 228:
            return {"success": False, "error": "Edad fuera del rango para tablas 5-19 años (61-228 meses)"}
        
        # Determinar archivo según sexo
        if sex.upper() == 'F':
            file_path = "oms_tables/table-talla-girls-5-19years-percentiles.xlsx"
        elif sex.upper() == 'M':
            file_path = "oms_tables/table-talla-boys-5-19years-percentiles.xlsx"
        else:
            return {"success": False, "error": "Sexo debe ser M o F"}
        
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            return {"success": False, "error": f"Archivo de tablas OMS no encontrado: {file_path}"}
        
        
        # Cargar datos
        df = pd.read_excel(file_path)
        
        # Buscar la columna de edad (puede tener diferentes nombres)
        age_column = None
        possible_age_columns = ['Month', 'month', 'Age (months)', 'Age', 'age', 'Age_months', 'age_months', 'Months', 'months']
        
        for col in possible_age_columns:
            if col in df.columns:
                age_column = col
                break
        
        if age_column is None:
            return {"success": False, "error": f"No se encontró columna de edad en el archivo. Columnas: {df.columns.tolist()}"}
        
        
        # Buscar la fila correspondiente a la edad en meses
        age_row = df[df[age_column] == age_months]
        
        if age_row.empty:
            return {"success": False, "error": f"No se encontraron datos para {age_months} meses"}
        
        
        # Buscar columnas de percentiles (pueden tener diferentes nombres)
        percentile_columns = {}
        possible_percentile_names = {
            'P3': ['3rd', 'P3', 'p3', '3'],
            'P5': ['5th', 'P5', 'p5', '5'],
            'P10': ['10th', 'P10', 'p10', '10'],
            'P15': ['15th', 'P15', 'p15', '15'],
            'P25': ['25th', 'P25', 'p25', '25'],
            'P50': ['50th', 'P50', 'p50', '50', 'Median', 'median'],
            'P75': ['75th', 'P75', 'p75', '75'],
            'P85': ['85th', 'P85', 'p85', '85'],
            'P90': ['90th', 'P90', 'p90', '90'],
            'P95': ['95th', 'P95', 'p95', '95'],
            'P97': ['97th', 'P97', 'p97', '97']
        }
        
        for percentile, possible_names in possible_percentile_names.items():
            for name in possible_names:
                if name in df.columns:
                    percentile_columns[percentile] = name
                    break
        
        
        # Extraer percentiles
        percentiles = {}
        for percentile, column_name in percentile_columns.items():
            if column_name in df.columns:
                percentiles[percentile] = float(age_row[column_name].iloc[0])
        
        
        return {
            "success": True,
            "percentiles": percentiles,
            "age_months": age_months,
            "sex": sex,
            "age_range": "5-19 years"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/oms-tables/bmi-percentiles")
async def get_bmi_percentiles(age_months: int, sex: str):
    """Obtener percentiles de IMC según tablas oficiales OMS"""
    try:
        # Determinar archivo según sexo
        if sex.upper() == 'M':
            file_path = "oms_tables/IMC_table_boys_percentil_2_5_años.xlsx"
        elif sex.upper() == 'F':
            file_path = "oms_tables/IMC_table_girls_percentil_2_5_años.xlsx"
        else:
            raise HTTPException(status_code=400, detail="Sexo debe ser 'M' o 'F'")
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Tabla OMS no encontrada")
        
        # Leer datos
        df = pd.read_excel(file_path)
        
        # Buscar datos para la edad específica
        age_data = df[df['Month'] == age_months]
        
        if age_data.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {age_months} meses")
        
        # Extraer percentiles
        row = age_data.iloc[0]
        percentiles = {
            'P1': float(row['P1']),
            'P3': float(row['P3']),
            'P5': float(row['P5']),
            'P10': float(row['P10']),
            'P15': float(row['P15']),
            'P25': float(row['P25']),
            'P50': float(row['P50']),
            'P75': float(row['P75']),
            'P85': float(row['P85']),
            'P90': float(row['P90']),
            'P95': float(row['P95']),
            'P97': float(row['P97']),
            'P99': float(row['P99'])
        }
        
        return {
            "success": True,
            "percentiles": percentiles,
            "age_months": age_months,
            "sex": sex
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando tablas OMS: {str(e)}")

    """Obtener percentiles de IMC según tablas oficiales OMS"""
    try:
        
        # Validar rango de edad (61-228 meses = 5-19 años)
        if age_months < 61 or age_months > 228:
            return {"success": False, "error": "Edad fuera del rango para tablas 5-19 años (61-228 meses)"}
        
        # Determinar archivo según sexo
        if sex.upper() == 'F':
            file_path = "oms_tables/table-IMC-girls-5-19years-per.xlsx"
        elif sex.upper() == 'M':
            file_path = "oms_tables/table-IMC-boys-5-19years-per.xlsx"
        else:
            return {"success": False, "error": "Sexo debe ser M o F"}
        
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            return {"success": False, "error": f"Archivo de tablas OMS no encontrado: {file_path}"}
        
        
        # Cargar datos
        df = pd.read_excel(file_path)
        
        # Buscar la columna de edad (puede tener diferentes nombres)
        age_column = None
        possible_age_columns = ['Month', 'month', 'Age (months)', 'Age', 'age', 'Age_months', 'age_months', 'Months', 'months']
        
        for col in possible_age_columns:
            if col in df.columns:
                age_column = col
                break
        
        if age_column is None:
            return {"success": False, "error": f"No se encontró columna de edad en el archivo. Columnas: {df.columns.tolist()}"}
        
        
        # Buscar la fila correspondiente a la edad en meses
        age_row = df[df[age_column] == age_months]
        
        if age_row.empty:
            return {"success": False, "error": f"No se encontraron datos para {age_months} meses"}
        
        
        # Buscar columnas de percentiles (pueden tener diferentes nombres)
        percentile_columns = {}
        possible_percentile_names = {
            'P3': ['3rd', 'P3', 'p3', '3'],
            'P5': ['5th', 'P5', 'p5', '5'],
            'P10': ['10th', 'P10', 'p10', '10'],
            'P15': ['15th', 'P15', 'p15', '15'],
            'P25': ['25th', 'P25', 'p25', '25'],
            'P50': ['50th', 'P50', 'p50', '50', 'Median', 'median'],
            'P75': ['75th', 'P75', 'p75', '75'],
            'P85': ['85th', 'P85', 'p85', '85'],
            'P90': ['90th', 'P90', 'p90', '90'],
            'P95': ['95th', 'P95', 'p95', '95'],
            'P97': ['97th', 'P97', 'p97', '97']
        }
        
        for percentile, possible_names in possible_percentile_names.items():
            for name in possible_names:
                if name in df.columns:
                    percentile_columns[percentile] = name
                    break
        
        
        # Extraer percentiles
        percentiles = {}
        for percentile, column_name in percentile_columns.items():
            if column_name in df.columns:
                percentiles[percentile] = float(age_row[column_name].iloc[0])
        
        
        return {
            "success": True,
            "percentiles": percentiles,
            "age_months": age_months,
            "sex": sex,
            "age_range": "5-19 years"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
async def get_bmi_percentiles(age_months: int, sex: str):
    """Obtener percentiles de IMC según tablas oficiales OMS"""
    try:
        # Determinar archivo según sexo
        if sex.upper() == 'M':
            file_path = "oms_tables/IMC_table_boys_percentil_2_5_años.xlsx"
        elif sex.upper() == 'F':
            file_path = "oms_tables/IMC_table_girls_percentil_2_5_años.xlsx"
        else:
            raise HTTPException(status_code=400, detail="Sexo debe ser 'M' o 'F'")
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Tabla OMS no encontrada")
        
        # Leer datos
        df = pd.read_excel(file_path)
        
        # Buscar datos para la edad específica
        age_data = df[df['Month'] == age_months]
        
        if age_data.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {age_months} meses")
        
        # Extraer percentiles
        row = age_data.iloc[0]
        percentiles = {
            'P1': float(row['P1']),
            'P3': float(row['P3']),
            'P5': float(row['P5']),
            'P15': float(row['P15']),
            'P25': float(row['P25']),
            'P50': float(row['P50']),
            'P75': float(row['P75']),
            'P85': float(row['P85']),
            'P95': float(row['P95']),
            'P97': float(row['P97']),
            'P99': float(row['P99'])
        }
        
        return {
            "success": True,
            "age_months": age_months,
            "sex": sex,
            "percentiles": percentiles
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando tablas OMS: {str(e)}")

@app.get("/oms-tables/height-percentiles")
async def get_height_percentiles(age_months: int, sex: str):
    """Obtener percentiles de talla según tablas oficiales OMS"""
    try:
        # Determinar archivo según sexo
        if sex.upper() == 'M':
            file_path = "oms_tables/table_talla_boys_percentil_2_5_años.xlsx"
        elif sex.upper() == 'F':
            file_path = "oms_tables/table_talla_girls_percentil_2_5_años.xlsx"
        else:
            raise HTTPException(status_code=400, detail="Sexo debe ser 'M' o 'F'")
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Tabla OMS no encontrada")
        
        # Leer datos
        df = pd.read_excel(file_path)
        
        # Buscar datos para la edad específica
        age_data = df[df['Month'] == age_months]
        
        if age_data.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {age_months} meses")
        
        # Extraer percentiles
        row = age_data.iloc[0]
        percentiles = {
            'P1': float(row['P1']),
            'P3': float(row['P3']),
            'P5': float(row['P5']),
            'P15': float(row['P15']),
            'P25': float(row['P25']),
            'P50': float(row['P50']),
            'P75': float(row['P75']),
            'P85': float(row['P85']),
            'P95': float(row['P95']),
            'P97': float(row['P97']),
            'P99': float(row['P99'])
        }
        
        return {
            "success": True,
            "age_months": age_months,
            "sex": sex,
            "percentiles": percentiles
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando tablas OMS de talla: {str(e)}")

@app.get("/oms-tables/weight-percentiles")
async def get_weight_percentiles(age_months: int, sex: str):
    """Obtener percentiles de peso según tablas oficiales OMS"""
    try:
        # Determinar archivo según sexo
        if sex.upper() == 'M':
            file_path = "oms_tables/table_peso_boys_percentil_0_5_años.xlsx"
        elif sex.upper() == 'F':
            file_path = "oms_tables/table_peso_girls_percentil_0_5_años.xlsx"
        else:
            raise HTTPException(status_code=400, detail="Sexo debe ser 'M' o 'F'")
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Tabla OMS no encontrada")
        
        # Leer datos
        df = pd.read_excel(file_path)
        
        # Buscar datos para la edad específica
        age_data = df[df['Month'] == age_months]
        
        if age_data.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {age_months} meses")
        
        # Extraer percentiles
        row = age_data.iloc[0]
        percentiles = {
            'P1': float(row['P1']),
            'P3': float(row['P3']),
            'P5': float(row['P5']),
            'P15': float(row['P15']),
            'P25': float(row['P25']),
            'P50': float(row['P50']),
            'P75': float(row['P75']),
            'P85': float(row['P85']),
            'P95': float(row['P95']),
            'P97': float(row['P97']),
            'P99': float(row['P99'])
        }
        
        return {
            "success": True,
            "age_months": age_months,
            "sex": sex,
            "percentiles": percentiles
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando tablas OMS de peso: {str(e)}")

@app.get("/oms-tables/arm-percentiles")
async def get_arm_percentiles(age_months: int, sex: str):
    """Obtener percentiles de perímetro braquial según tablas oficiales OMS"""
    try:
        # Determinar archivo según sexo
        if sex.upper() == 'M':
            file_path = "oms_tables/table_perímetro_braquial_boys_percentil_3_5_años.xlsx"
        elif sex.upper() == 'F':
            file_path = "oms_tables/table_perimetro__braquial_girls_percentil_3_5_años.xlsx"
        else:
            raise HTTPException(status_code=400, detail="Sexo debe ser 'M' o 'F'")
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Tabla OMS no encontrada")
        
        # Leer datos
        df = pd.read_excel(file_path)
        
        # Buscar datos para la edad específica
        age_data = df[df['Month'] == age_months]
        
        if age_data.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {age_months} meses")
        
        # Extraer percentiles
        row = age_data.iloc[0]
        percentiles = {
            'P1': float(row['P1']),
            'P3': float(row['P3']),
            'P5': float(row['P5']),
            'P15': float(row['P15']),
            'P25': float(row['P25']),
            'P50': float(row['P50']),
            'P75': float(row['P75']),
            'P85': float(row['P85']),
            'P95': float(row['P95']),
            'P97': float(row['P97']),
            'P99': float(row['P99'])
        }
        
        return {
            "success": True,
            "age_months": age_months,
            "sex": sex,
            "percentiles": percentiles
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando tablas OMS de perímetro braquial: {str(e)}")

@app.get("/oms-tables/head-percentiles")
async def get_head_percentiles(age_months: int, sex: str):
    """Obtener percentiles de perímetro cefálico según tablas oficiales OMS"""
    try:
        # Determinar archivo según sexo
        if sex.upper() == 'M':
            file_path = "oms_tables/table_perimetro_cefalico_boys_percentil_0_5_años.xlsx"
        elif sex.upper() == 'F':
            file_path = "oms_tables/table_perimetro_cefalico_girls_percentil_0_5_años.xlsx"
        else:
            raise HTTPException(status_code=400, detail="Sexo debe ser 'M' o 'F'")
        
        # Verificar que el archivo existe
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Tabla OMS no encontrada")
        
        # Leer datos
        df = pd.read_excel(file_path)
        
        # Buscar datos para la edad específica
        age_data = df[df['Month'] == age_months]
        
        if age_data.empty:
            raise HTTPException(status_code=404, detail=f"No hay datos para {age_months} meses")
        
        # Extraer percentiles
        row = age_data.iloc[0]
        percentiles = {
            'P1': float(row['P1']),
            'P3': float(row['P3']),
            'P5': float(row['P5']),
            'P15': float(row['P15']),
            'P25': float(row['P25']),
            'P50': float(row['P50']),
            'P75': float(row['P75']),
            'P85': float(row['P85']),
            'P95': float(row['P95']),
            'P97': float(row['P97']),
            'P99': float(row['P99'])
        }
        
        return {
            "success": True,
            "age_months": age_months,
            "sex": sex,
            "percentiles": percentiles
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando tablas OMS de perímetro cefálico: {str(e)}")

@app.get("/check-patient-measurements/{database_id}/{patient_id}")
async def check_patient_measurements(database_id: str, patient_id: str):
    """Verificar si un paciente ya tiene medidas antropométricas guardadas"""
    try:
        # Cargar metadatos de archivos
        metadata = load_metadata()
        
        # Buscar el archivo de la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Verificar que existe la columna ID_Unico
        if 'ID_Unico' not in df.columns:
            return {"has_measurements": False, "message": "Base de datos sin IDs únicos"}
        
        # Buscar el paciente por ID_Unico
        patient_row = df[df['ID_Unico'] == patient_id]
        if patient_row.empty:
            # Si no encuentra el paciente, asumir que no tiene medidas
            return {
                "has_measurements": False, 
                "patient_id": patient_id,
                "database_id": database_id,
                "message": "Paciente no encontrado, permitir procesamiento"
            }
        
        # Verificar si tiene medidas antropométricas (cualquier campo de medidas no vacío)
        measurement_columns = [
            'Estatura_cm', 'Peso_kg', 'IMC_Calculado', 'Percentil_IMC',
            'Percentil_Talla', 'Percentil_Peso', 'Circunferencia_Cintura_cm',
            'Perimetro_Braquial_cm', 'Percentil_Perimetro_Braquial',
            'Perimetro_Cefalico_cm', 'Percentil_Perimetro_Cefalico'
        ]
        
        has_measurements = False
        for col in measurement_columns:
            if col in df.columns:
                value = patient_row.iloc[0][col]
                if pd.notna(value) and str(value).strip() != '':
                    has_measurements = True
                    break
        
        return {
            "has_measurements": has_measurements,
            "patient_id": patient_id,
            "database_id": database_id,
            "message": "Verificación completada"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verificando medidas: {str(e)}")

@app.get("/get-patient-lipid-profile/{database_id}/{patient_id}")
async def get_patient_lipid_profile(database_id: str, patient_id: str):
    """Obtener datos específicos del perfil lipídico de un paciente"""
    try:
        
        # Cargar metadatos de archivos
        metadata = load_metadata()
        
        # Buscar el archivo de la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Buscar columna de ID de paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        
        if not id_columns:
            raise HTTPException(status_code=400, detail="Base de datos sin IDs de paciente")
        
        patient_id_col = id_columns[0]
        
        # Buscar el paciente
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        
        # Obtener datos del perfil lipídico
        lipid_data = {}
        lipid_columns = {
            'Colesterol_Total_mg_dL': 'totalCholesterol',
            'HDL_Colesterol_mg_dL': 'hdlCholesterol', 
            'LDL_Colesterol_mg_dL': 'ldlCholesterol',
            'Trigliceridos_mg_dL': 'triglycerides',
            'VLDL_Colesterol_mg_dL': 'vldlCholesterol',
            'Glucosa_mg_dL': 'glucose',
            'No_HDL_Colesterol_mg_dL': 'nonHdlCholesterol'
        }
        
        for col_name, field_name in lipid_columns.items():
            if col_name in df.columns:
                value = patient_row.iloc[0][col_name]
                lipid_data[field_name] = float(value) if pd.notna(value) and str(value).strip() != '' else None
            else:
                lipid_data[field_name] = None

        # Texto de riesgo cardiovascular (clasificación según No-HDL, persistido al guardar)
        risk_val = None
        for risk_col in ('Riesgo_Cardiovascular', 'Riesgo_cardiovascular', 'RIESGO_CARDIOVASCULAR'):
            if risk_col in df.columns:
                raw_r = patient_row.iloc[0][risk_col]
                if pd.notna(raw_r) and str(raw_r).strip() != '':
                    risk_val = str(raw_r).strip()
                break
        if risk_val is None:
            for col in df.columns:
                cl = str(col).strip().lower().replace(' ', '_')
                if 'riesgo' in cl and 'cardio' in cl:
                    raw_r = patient_row.iloc[0][col]
                    if pd.notna(raw_r) and str(raw_r).strip() != '':
                        risk_val = str(raw_r).strip()
                        break
        lipid_data['cardiovascularRisk'] = risk_val
        
        # Obtener datos básicos del paciente
        patient_info = {}
        basic_columns = {
            'Fecha_Nacimiento': 'birthdate',
            'Sexo': 'sex'
        }
        
        for col_name, field_name in basic_columns.items():
            if col_name in df.columns:
                value = patient_row.iloc[0][col_name]
                if pd.notna(value) and str(value).strip() != '':
                    patient_info[field_name] = str(value)
                else:
                    patient_info[field_name] = None
            else:
                patient_info[field_name] = None
        
        
        result = {
            "success": True,
            "patient_id": patient_id,
            "database_id": database_id,
            "lipid_data": lipid_data,
            "patient_info": patient_info
        }
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo perfil lipídico: {str(e)}")

@app.get("/check-patient-lipid-profile/{database_id}/{patient_id}")
async def check_patient_lipid_profile(database_id: str, patient_id: str):
    """Verificar si un paciente ya tiene perfil lipídico guardado"""
    try:
        # Cargar metadatos de archivos
        metadata = load_metadata()
        
        # Buscar el archivo de la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Buscar columna de ID de paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        
        if not id_columns:
            return {"has_lipid_profile": False, "message": "Base de datos sin IDs de paciente"}
        
        patient_id_col = id_columns[0]
        
        # Buscar el paciente
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            # Si no encuentra el paciente, asumir que no tiene perfil lipídico
            return {
                "has_lipid_profile": False, 
                "patient_id": patient_id,
                "database_id": database_id,
                "message": "Paciente no encontrado, permitir procesamiento"
            }
        
        # Verificar si tiene perfil lipídico (cualquier campo de perfil lipídico no vacío)
        lipid_columns = [
            'Colesterol_Total_mg_dL', 'HDL_Colesterol_mg_dL', 'LDL_Colesterol_mg_dL',
            'Trigliceridos_mg_dL', 'VLDL_Colesterol_mg_dL', 'Glucosa_mg_dL',
            'No_HDL_Colesterol_mg_dL'
        ]
        
        has_lipid_profile = False
        for col in lipid_columns:
            if col in df.columns:
                value = patient_row.iloc[0][col]
                if pd.notna(value) and str(value).strip() != '':
                    has_lipid_profile = True
                    break
        
        return {
            "has_lipid_profile": has_lipid_profile,
            "patient_id": patient_id,
            "database_id": database_id,
            "message": "Verificación completada"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error verificando perfil lipídico: {str(e)}")


# --- Notas de interpretación del reporte para padres/tutores (antropometría y perfil lipídico) ---
# Mismo directorio que file_metadata.json para que coincida con el cwd del proceso al guardar/cargar.
PARENT_REPORT_NOTES_FILE = os.path.join(os.path.dirname(os.path.abspath(METADATA_FILE)), "parent_report_notes.json")
PARENT_REPORT_NOTE_MAX_CHARS = 20000


def load_parent_report_notes() -> Dict[str, Any]:
    try:
        if not os.path.exists(PARENT_REPORT_NOTES_FILE):
            return {}
        with open(PARENT_REPORT_NOTES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        return {}


def save_parent_report_notes(store: Dict[str, Any]) -> None:
    with open(PARENT_REPORT_NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)


def _database_id_exists_in_metadata(database_id: str) -> bool:
    metadata = load_metadata()
    sid = str(database_id).strip()
    return any(str(f.get("id", "")).strip() == sid for f in metadata)


def _clip_note(text: Any) -> str:
    s = "" if text is None else str(text)
    if len(s) > PARENT_REPORT_NOTE_MAX_CHARS:
        return s[:PARENT_REPORT_NOTE_MAX_CHARS]
    return s


@app.get("/api/parent-report-notes/{database_id}/{patient_id}")
async def api_get_parent_report_notes(database_id: str, patient_id: str):
    """Devuelve las notas guardadas (Observaciones / Medidas a seguir) del reporte para padres/tutores."""
    try:
        database_id = str(database_id).strip()
        patient_id = str(patient_id).strip()
        if not _database_id_exists_in_metadata(database_id):
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        store = load_parent_report_notes()
        db_bucket = store.get(database_id) or {}
        entry = db_bucket.get(patient_id) or {}
        if not entry and db_bucket:
            # Compatibilidad: claves numéricas vs texto (p. ej. ID_Unico leído como int en JSON antiguo)
            for k, v in db_bucket.items():
                if str(k).strip() == patient_id and isinstance(v, dict):
                    entry = v
                    break
        anth = entry.get("anthropometric") if isinstance(entry.get("anthropometric"), dict) else {}
        lip = entry.get("lipid") if isinstance(entry.get("lipid"), dict) else {}
        return {
            "success": True,
            "anthropometric": {
                "observations": str(anth.get("observations") or ""),
                "medidasSeguir": str(anth.get("medidasSeguir") or ""),
            },
            "lipid": {
                "observations": str(lip.get("observations") or ""),
                "medidasSeguir": str(lip.get("medidasSeguir") or ""),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/parent-report-notes")
async def api_post_parent_report_notes(request: Request):
    """Guarda o actualiza notas del reporte (por base de datos y paciente). Solo se actualizan las secciones enviadas."""
    try:
        body = await request.json()
        database_id = str(body.get("database_id") or "").strip()
        patient_id = str(body.get("patient_id") or "").strip()
        if not database_id or not patient_id:
            raise HTTPException(status_code=400, detail="database_id y patient_id son requeridos")
        if not _database_id_exists_in_metadata(database_id):
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")

        store = load_parent_report_notes()
        if database_id not in store:
            store[database_id] = {}
        if patient_id not in store[database_id]:
            store[database_id][patient_id] = {}

        pat_entry = store[database_id][patient_id]

        if "anthropometric" in body and isinstance(body["anthropometric"], dict):
            a = body["anthropometric"]
            pat_entry["anthropometric"] = {
                "observations": _clip_note(a.get("observations")),
                "medidasSeguir": _clip_note(a.get("medidasSeguir")),
            }
        if "lipid" in body and isinstance(body["lipid"], dict):
            lip = body["lipid"]
            pat_entry["lipid"] = {
                "observations": _clip_note(lip.get("observations")),
                "medidasSeguir": _clip_note(lip.get("medidasSeguir")),
            }

        pat_entry["updatedAt"] = datetime.now().isoformat()
        save_parent_report_notes(store)
        return {"success": True, "message": "Notas guardadas"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/download-anthropometric-template/{database_id}")
async def download_anthropometric_template(database_id: str):
    """Generar y descargar plantilla PDF de medidas antropométricas para todos los pacientes"""
    try:
        # Crear PDF con plantilla de medidas antropométricas para todos los pacientes
        pdf_path = create_anthropometric_template_pdf(database_id)
        
        return FileResponse(
            path=pdf_path,
            filename=f"plantilla_medidas_antropometricas_todos.pdf",
            media_type='application/pdf'
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {str(e)}")

def create_anthropometric_template_pdf(database_id):
    """Crear PDF con plantilla de medidas antropométricas para todos los pacientes usando ReportLab"""
    pdf_path = os.path.join(UPLOAD_DIR, "plantilla_medidas_antropometricas_todos.pdf")
    
    # Cargar metadatos de archivos
    metadata = load_metadata()
    
    # Buscar el archivo de la base de datos
    database_file = None
    for file_info in metadata:
        if file_info['id'] == database_id:
            database_file = file_info
            break
    
    if not database_file:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    
    # Cargar el archivo Excel
    file_path = database_file['file_path']
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
    
    df = pd.read_excel(file_path)
    
    # Verificar que existe la columna ID_Unico
    if 'ID_Unico' not in df.columns:
        raise HTTPException(status_code=400, detail="La base de datos no tiene columna ID_Unico")
    
    # Obtener todos los IDs únicos
    patient_ids = df['ID_Unico'].tolist()
    patient_ids = [str(id).strip() for id in patient_ids if str(id).strip() != '']
    
    if not patient_ids:
        raise HTTPException(status_code=400, detail="No se encontraron IDs válidos en el archivo")
    
    # Configuración de la página A4
    page_width, page_height = A4
    margin = 15 * mm
    
    # Dimensiones para cada formulario (uno arriba, otro abajo)
    form_width = page_width - 2 * margin
    form_height = (page_height - 6 * margin) / 2  # Dividir el espacio disponible entre 2 formularios
    
    try:
        # Crear el canvas del PDF
        c = canvas.Canvas(pdf_path, pagesize=A4)
        
        # Procesar pacientes en pares (2 por página)
        for i in range(0, len(patient_ids), 2):
            # Si no es la primera página, crear nueva página
            if i > 0:
                c.showPage()
            
            # Dibujar encabezado solo en la primera página
            if i == 0:
                draw_template_header(c, page_width, page_height)
            
            # Formulario 1 (arriba) - Paciente actual
            y1 = page_height - 3 * margin - form_height
            draw_anthropometric_form(c, margin, y1, form_width, form_height, i + 1, patient_ids[i])
            
            # Formulario 2 (abajo) - Siguiente paciente (si existe)
            if i + 1 < len(patient_ids):
                y2 = y1 - form_height - margin
                draw_anthropometric_form(c, margin, y2, form_width, form_height, i + 2, patient_ids[i + 1])
        
        # Guardar el PDF
        c.save()
        return pdf_path
        
    except Exception as e:
        raise e

def draw_template_header(canvas, page_width, page_height):
    """Dibujar encabezado de la plantilla"""
    # Configurar fuente para el encabezado
    canvas.setFont("Helvetica-Bold", 16)
    canvas.setFillColorRGB(0, 0, 0)
    
    # Título principal
    title = "Protocolo de Investigación"
    title_width = canvas.stringWidth(title, "Helvetica-Bold", 16)
    title_x = (page_width - title_width) / 2
    title_y = page_height - 20 * mm
    canvas.drawString(title_x, title_y, title)
    
    # Subtítulo
    subtitle = "Escuela Superior de Medicina"
    subtitle_width = canvas.stringWidth(subtitle, "Helvetica-Bold", 14)
    subtitle_x = (page_width - subtitle_width) / 2
    subtitle_y = page_height - 30 * mm
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(subtitle_x, subtitle_y, subtitle)
    
    # Nombre de la plantilla
    template_text = "Plantilla de \"Toma de Medidas Antropométricas\""
    template_width = canvas.stringWidth(template_text, "Helvetica", 12)
    template_x = (page_width - template_width) / 2
    template_y = page_height - 40 * mm
    canvas.setFont("Helvetica", 12)
    canvas.drawString(template_x, template_y, template_text)
    
    # Línea separadora
    canvas.setStrokeColorRGB(0, 0, 0)
    canvas.setLineWidth(1)
    canvas.line(20 * mm, page_height - 45 * mm, page_width - 20 * mm, page_height - 45 * mm)

def draw_anthropometric_form(canvas, x, y, width, height, form_number, patient_id):
    """Dibujar formulario de medidas antropométricas"""
    # Borde del formulario
    canvas.setStrokeColorRGB(0, 0, 0)
    canvas.setLineWidth(1)
    canvas.rect(x, y, width, height)
    
    # Título del formulario
    canvas.setFont("Helvetica-Bold", 11)
    canvas.setFillColorRGB(0, 0, 0)
    title = f"Formulario {form_number} - Medidas Antropométricas"
    canvas.drawString(x + 8, y + height - 20, title)
    
    # ID del paciente
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColorRGB(0, 0, 0)
    patient_text = f"ID_Paciente: {patient_id}"
    canvas.drawString(x + 8, y + height - 35, patient_text)
    
    # Datos básicos
    canvas.setFont("Helvetica", 9)
    canvas.drawString(x + 8, y + height - 55, "Fecha de Nacimiento: _________________")
    canvas.drawString(x + 8, y + height - 70, "Edad Calculada: _________________")
    canvas.drawString(x + 8, y + height - 85, "Sexo: _______M _______F")
    
    # Medidas antropométricas
    canvas.drawString(x + 8, y + height - 105, "Estatura (cm): _________________")
    canvas.drawString(x + 8, y + height - 120, "Peso (kg): _________________")
    canvas.drawString(x + 8, y + height - 135, "Circunferencia de Cintura (cm): _________________")
    canvas.drawString(x + 8, y + height - 150, "Perímetro Braquial (cm): _________________")
    canvas.drawString(x + 8, y + height - 165, "Perímetro Cefálico (cm): _________________")
    
    # Resultados calculados
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(x + 8, y + height - 190, "Resultados Calculados:")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(x + 8, y + height - 205, "IMC: _________________")
    canvas.drawString(x + 8, y + height - 220, "Percentil IMC: _________________")
    canvas.drawString(x + 8, y + height - 235, "Percentil Talla: _________________")
    canvas.drawString(x + 8, y + height - 250, "Percentil Peso: _________________")
    canvas.drawString(x + 8, y + height - 265, "Percentil Perímetro Braquial: _________________")
    canvas.drawString(x + 8, y + height - 280, "Percentil Perímetro Cefálico: _________________")
    
    # Signos vitales (columna derecha)
    vital_x = x + (width / 2) + 10
    base_y = y + height - 190
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(vital_x, base_y, "Signos Vitales:")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(vital_x, base_y - 15, "Oxigenación (%): _________________")
    canvas.drawString(vital_x, base_y - 30, "Frecuencia Cardiaca (lpm): _________________")
    canvas.drawString(vital_x, base_y - 45, "Frecuencia Respiratoria (respiraciones en 15 s): _________________")
    canvas.drawString(vital_x, base_y - 60, "Temperatura (°C): _________________")
    
    # Espacio para observaciones (solo espacio en blanco, sin texto)
    # Solo dejar espacio en blanco sin líneas

def _coerce_excel_cell_for_patient_json(value):
    """Convierte celdas de pandas/Excel a tipos JSON-serializables (evita Timestamp → None)."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, pd.Timestamp):
        if (value.hour, value.minute, value.second, value.microsecond) == (0, 0, 0, 0):
            return value.strftime('%Y-%m-%d')
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, datetime):
        if (value.hour, value.minute, value.second, value.microsecond) == (0, 0, 0, 0):
            return value.strftime('%Y-%m-%d')
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    try:
        import numpy as np
        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            f = float(value)
            if np.isnan(f):
                return None
            return f
    except ImportError:
        pass
    try:
        json.dumps(value)
        return value
    except (TypeError, ValueError):
        return str(value)


def _normalize_excel_col_name(name: Any) -> str:
    s = unicodedata.normalize('NFKD', str(name or ''))
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return ''.join(ch for ch in s.lower() if ch.isalnum())


def _find_excel_col_by_alias(df: pd.DataFrame, aliases: List[str]) -> str:
    normalized = {_normalize_excel_col_name(col): col for col in df.columns}
    for alias in aliases:
        found = normalized.get(_normalize_excel_col_name(alias))
        if found:
            return found
    return ""


ANTHRO_EXCEL_COLUMN_ALIASES: Dict[str, List[str]] = {
    "Circunferencia_Cintura_cm": [
        "Circunferencia_Cintura_cm",
        "Circunferencia_Cintura",
        "Circunferencia_Cintura_",
        "Circunferencia cintura",
        "Circunferencia de cintura",
    ],
    "Perimetro_Braquial_cm": [
        "Perimetro_Braquial_cm",
        "Perimetro_Braquial",
        "Perimetro_Braquial_",
        "Perímetro_Braquial_cm",
        "Perímetro_Braquial",
        "Perimetro braquial",
        "Perímetro braquial",
    ],
    "Perimetro_Cefalico_cm": [
        "Perimetro_Cefalico_cm",
        "Perimetro_Cefalico",
        "Perimetro_Cefalico_",
        "Perímetro_Cefálico_cm",
        "Perímetro_Cefálico",
        "Perimetro cefalico",
        "Perímetro cefálico",
    ],
}


def _set_anthro_excel_value(df: pd.DataFrame, row_index: int, column_name: str, value: Any) -> None:
    aliases = ANTHRO_EXCEL_COLUMN_ALIASES.get(column_name, [column_name])
    target_col = _find_excel_col_by_alias(df, aliases)
    if not target_col:
        target_col = column_name
        if target_col not in df.columns:
            df[target_col] = None
    df.at[row_index, target_col] = value
    # Mantener la columna canónica para que el frontend lea consistentemente.
    if target_col != column_name:
        if column_name not in df.columns:
            df[column_name] = None
        df.at[row_index, column_name] = value


@app.get("/get-patient-measurements/{database_id}/{patient_id}")
async def get_patient_measurements(database_id: str, patient_id: str):
    """Obtener medidas antropométricas de un paciente específico"""
    try:
        # Cargar metadatos de archivos
        metadata = load_metadata()
        
        # Buscar el archivo de la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Verificar que existe la columna ID_Unico
        if 'ID_Unico' not in df.columns:
            raise HTTPException(status_code=400, detail="La base de datos no tiene columna ID_Unico")
        
        # Buscar el paciente por ID_Unico
        patient_row = df[df['ID_Unico'] == patient_id]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail=f"Paciente con ID {patient_id} no encontrado")
        
        # Obtener los datos del paciente
        patient_data = patient_row.iloc[0].to_dict()
        
        # Limpiar valores NaN y None; fechas pandas → string ISO (json.dumps falla con Timestamp)
        cleaned_data = {}
        for key, value in patient_data.items():
            coerced = _coerce_excel_cell_for_patient_json(value)
            if isinstance(coerced, float) and (str(coerced).lower() == 'nan' or str(coerced) in ('inf', '-inf')):
                coerced = None
            cleaned_data[key] = coerced
        
        return {
            "success": True,
            "patient_id": patient_id,
            "data": cleaned_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo medidas: {str(e)}")

@app.post("/update-anthropometric-data")
async def update_anthropometric_data(request: Request):
    """Actualizar medidas antropométricas de un paciente"""
    try:
        form_data = await request.form()
        
        # Obtener datos del formulario
        patient_id = form_data.get('patient_id')
        database_id = form_data.get('database_id')
        birthdate = form_data.get('birthdate')
        age_display = form_data.get('ageDisplay')
        sex = form_data.get('sex')
        height = form_data.get('height')
        weight = form_data.get('weight')
        waist = form_data.get('waist')
        arm = form_data.get('arm')
        head = form_data.get('head')
        oxygenation = form_data.get('oxygenation')
        heart_rate = form_data.get('heartRate')
        respiratory_rate_input = form_data.get('respiratoryRate')
        temperature = form_data.get('temperature')
        ref_raw = form_data.get('anthropometricReferenceDate') or form_data.get('anthropometric_reference_date') or ''
        ref_raw = str(ref_raw).strip()
        reference_date = ref_raw[:10] if len(ref_raw) >= 10 else ref_raw
        
        # Obtener valores calculados del frontend
        bmi_frontend = form_data.get('bmi')
        bmi_percentile_frontend = form_data.get('bmiPercentile')
        height_percentile_frontend = form_data.get('heightPercentile')
        weight_percentile_frontend = form_data.get('weightPercentile')
        arm_percentile_frontend = form_data.get('armPercentile')
        head_percentile_frontend = form_data.get('headPercentile')
        
        # Validar datos requeridos
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="ID de paciente y base de datos requeridos")
        
        # Cargar metadatos de archivos
        metadata = load_metadata()
        
        # Buscar el archivo de la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Verificar que existe la columna ID_Unico
        if 'ID_Unico' not in df.columns:
            raise HTTPException(status_code=400, detail="La base de datos no tiene columna ID_Unico")
        
        # Buscar el paciente por ID_Unico
        patient_row = df[df['ID_Unico'] == patient_id]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail=f"Paciente con ID {patient_id} no encontrado")
        
        patient_index = patient_row.index[0]
        if not reference_date and 'Fecha_Referencia_Medidas' in df.columns:
            try:
                prev = df.at[patient_index, 'Fecha_Referencia_Medidas']
                if prev is not None and not (isinstance(prev, float) and pd.isna(prev)):
                    ps = str(prev).strip()
                    if ps and ps.lower() not in ('nat', 'none'):
                        part = ps.split('T')[0].split()[0]
                        if len(part) >= 10:
                            reference_date = part[:10]
            except Exception:
                pass
        
        # Usar valores calculados del frontend directamente (igual que save-anthropometric-data)
        bmi = bmi_frontend
        bmi_percentile = bmi_percentile_frontend
        height_percentile = height_percentile_frontend
        weight_percentile = weight_percentile_frontend
        arm_percentile = arm_percentile_frontend
        head_percentile = head_percentile_frontend
        
        # Preparar datos para actualizar (igual que save-anthropometric-data)
        anthropometric_data = {
            'Fecha_Nacimiento': birthdate if birthdate else '',
            'Edad_Calculada': age_display if age_display else '',
            'Sexo_Medidas': sex if sex else '',
            'Estatura_cm': float(height) if height and height != '' else None,
            'Peso_kg': float(weight) if weight and weight != '' else None,
            'IMC_Calculado': float(bmi) if bmi and bmi != '' else None,
            'Percentil_IMC': bmi_percentile if bmi_percentile else '',
            'Percentil_Talla': height_percentile if height_percentile else '',
            'Percentil_Peso': weight_percentile if weight_percentile else '',
            'Circunferencia_Cintura_cm': float(waist) if waist and waist != '' else None,
            'Perimetro_Braquial_cm': float(arm) if arm and arm != '' else None,
            'Percentil_Perimetro_Braquial': arm_percentile if arm_percentile else '',
            'Perimetro_Cefalico_cm': float(head) if head and head != '' else None,
            'Percentil_Perimetro_Cefalico': head_percentile if head_percentile else '',
            'Oxigenacion_pct': float(oxygenation) if oxygenation and oxygenation != '' else None,
            'Frecuencia_Cardiaca_lpm': float(heart_rate) if heart_rate and heart_rate != '' else None,
            'Frecuencia_Respiratoria_15s': float(respiratory_rate_input) if respiratory_rate_input and respiratory_rate_input != '' else None,
            'Frecuencia_Respiratoria_min': float(respiratory_rate_input) * 4 if respiratory_rate_input and respiratory_rate_input != '' else None,
            'Temperatura_C': float(temperature) if temperature and temperature != '' else None,
            'Fecha_Actualizacion': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'Fecha_Referencia_Medidas': reference_date if reference_date else ''
        }
        
        # Actualizar los datos del paciente específico
        for col_name, value in anthropometric_data.items():
            _set_anthro_excel_value(df, patient_index, col_name, value)
        
        # Guardar el archivo actualizado
        df.to_excel(file_path, index=False)
        
        # Actualizar metadatos
        database_file['last_updated'] = datetime.now().isoformat()
        
        save_metadata(metadata)
        
        return {
            "success": True, 
            "message": "Medidas antropométricas actualizadas correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error actualizando medidas: {str(e)}")

def classify_percentile(value, percentiles):
    """Clasificar un valor según los percentiles OMS"""
    if value < percentiles['P15']:
        return '< P15'
    elif value < percentiles['P25']:
        return 'P15-P25'
    elif value < percentiles['P50']:
        return 'P25-P50'
    elif value < percentiles['P75']:
        return 'P50-P75'
    elif value < percentiles['P85']:
        return 'P75-P85'
    elif value < percentiles['P95']:
        return 'P85-P95'
    elif value < percentiles['P97']:
        return 'P95-P97'
    else:
        return '> P97'

@app.post("/save-anthropometric-data")
async def save_anthropometric_data(request: Request):
    """Guardar medidas antropométricas en la base de datos"""
    try:
        form_data = await request.form()
        
        # Obtener datos del formulario
        patient_id = form_data.get('patient_id')
        database_id = form_data.get('database_id')
        birthdate = form_data.get('birthdate')
        age_display = form_data.get('ageDisplay')
        sex = form_data.get('sex')
        height = form_data.get('height')
        weight = form_data.get('weight')
        bmi = form_data.get('bmi')
        bmi_percentile = form_data.get('bmiPercentile')
        height_percentile = form_data.get('heightPercentile')
        weight_percentile = form_data.get('weightPercentile')
        waist = form_data.get('waist')
        arm = form_data.get('arm')
        arm_percentile = form_data.get('armPercentile')
        head = form_data.get('head')
        head_percentile = form_data.get('headPercentile')
        waist_hip_ratio = form_data.get('waistHipRatio')
        oxygenation = form_data.get('oxygenation')
        heart_rate = form_data.get('heartRate')
        respiratory_rate_input = form_data.get('respiratoryRate')
        temperature = form_data.get('temperature')
        ref_raw = form_data.get('anthropometricReferenceDate') or form_data.get('anthropometric_reference_date') or ''
        ref_raw = str(ref_raw).strip()
        reference_date = ref_raw[:10] if len(ref_raw) >= 10 else ref_raw
        
        # Validar datos requeridos
        if not patient_id or not database_id:
            raise HTTPException(status_code=400, detail="ID de paciente y base de datos requeridos")
        
        # Cargar metadatos de archivos
        metadata = load_metadata()
        
        # Buscar el archivo de la base de datos
        database_file = None
        for file_info in metadata:
            if file_info['id'] == database_id:
                database_file = file_info
                break
        
        if not database_file:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        
        # Cargar el archivo Excel
        file_path = database_file['file_path']
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        df = pd.read_excel(file_path)
        
        # Verificar que existe la columna ID_Unico
        if 'ID_Unico' not in df.columns:
            raise HTTPException(status_code=400, detail="La base de datos no tiene columna ID_Unico")
        
        # Buscar el paciente por ID_Unico
        patient_row = df[df['ID_Unico'] == patient_id]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail=f"Paciente con ID {patient_id} no encontrado")
        
        # Preparar datos para agregar
        anthropometric_data = {
            'Fecha_Nacimiento': birthdate if birthdate else '',
            'Edad_Calculada': age_display if age_display else '',
            'Sexo_Medidas': sex if sex else '',
            'Estatura_cm': float(height) if height and height != '' else None,
            'Peso_kg': float(weight) if weight and weight != '' else None,
            'IMC_Calculado': float(bmi) if bmi and bmi != '' else None,
            'Percentil_IMC': bmi_percentile if bmi_percentile else '',
            'Percentil_Talla': height_percentile if height_percentile else '',
            'Percentil_Peso': weight_percentile if weight_percentile else '',
            'Circunferencia_Cintura_cm': float(waist) if waist and waist != '' else None,
            'Perimetro_Braquial_cm': float(arm) if arm and arm != '' else None,
            'Percentil_Perimetro_Braquial': arm_percentile if arm_percentile else '',
            'Perimetro_Cefalico_cm': float(head) if head and head != '' else None,
            'Percentil_Perimetro_Cefalico': head_percentile if head_percentile else '',
            'Relacion_Cintura_Cadera': float(waist_hip_ratio) if waist_hip_ratio and waist_hip_ratio != '' else None,
            'Oxigenacion_pct': float(oxygenation) if oxygenation and oxygenation != '' else None,
            'Frecuencia_Cardiaca_lpm': float(heart_rate) if heart_rate and heart_rate != '' else None,
            'Frecuencia_Respiratoria_15s': float(respiratory_rate_input) if respiratory_rate_input and respiratory_rate_input != '' else None,
            'Frecuencia_Respiratoria_min': float(respiratory_rate_input) * 4 if respiratory_rate_input and respiratory_rate_input != '' else None,
            'Temperatura_C': float(temperature) if temperature and temperature != '' else None,
            'Fecha_Medicion': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'Fecha_Referencia_Medidas': reference_date if reference_date else ''
        }
        
        # Actualizar los datos del paciente específico
        patient_index = patient_row.index[0]
        for col_name, value in anthropometric_data.items():
            _set_anthro_excel_value(df, patient_index, col_name, value)
        
        # Guardar el archivo actualizado
        df.to_excel(file_path, index=False)
        
        # Actualizar metadatos
        database_file['last_updated'] = datetime.now().isoformat()
        database_file['anthropometric_measurements'] = database_file.get('anthropometric_measurements', 0) + 1
        
        save_metadata(metadata)
        
        return {
            "success": True, 
            "message": "Medidas antropométricas guardadas correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando medidas: {str(e)}")

# Endpoints para Perfil Lipídico
@app.get("/api/lipid-profile/databases")
async def get_lipid_databases():
    """Obtener lista de bases de datos para perfil lipídico"""
    try:
        metadata = load_metadata()
        databases = []
        
        for db_info in metadata:
            if db_info.get('status') == 'processed':
                databases.append({
                    "id": db_info.get('id', ''),
                    "filename": db_info.get('filename', 'Sin nombre'),
                    "processed_date": db_info.get('processed_date', ''),
                    "rows_count": db_info.get('rows_count', 0),
                    "lipid_profiles": db_info.get('lipid_profiles', 0)
                })
        
        return {"success": True, "databases": databases}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo bases de datos: {str(e)}")

@app.get("/api/lipid-profile/patients/{database_id}")
async def get_lipid_patients(database_id: str):
    """Obtener lista de pacientes de una base de datos para perfil lipídico"""
    try:
        metadata = load_metadata()
        
        # Buscar la base de datos por ID
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        file_path = db_info.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        # Leer el archivo Excel
        df = pd.read_excel(file_path)
        
        # Buscar columna de ID de paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        patients = []
        
        for _, row in df.iterrows():
            patient_id = str(row[patient_id_col])
            patients.append({
                "id": patient_id,
                "has_lipid_profile": any(col for col in df.columns if 'colesterol' in col.lower() or 'triglicerido' in col.lower())
            })
        
        return {"success": True, "patients": patients}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo pacientes: {str(e)}")

@app.post("/api/lipid-profile/save")
async def save_lipid_profile_data(data: dict):
    """Guardar datos del perfil lipídico de un paciente"""
    try:
        
        database_id = data.get('database_id')
        patient_id = data.get('patient_id')
        lipid_data = data.get('lipid_data', {})
        
        
        if not database_id or not patient_id:
            raise HTTPException(status_code=400, detail="Faltan parámetros requeridos")
        
        metadata = load_metadata()
        
        # Buscar la base de datos por ID
        db_info = None
        for db in metadata:
            if db.get('id') == database_id:
                db_info = db
                break
        
        if not db_info:
            raise HTTPException(status_code=404, detail="Base de datos no encontrada")
        file_path = db_info.get('file_path')
        
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
        
        # Leer el archivo Excel
        df = pd.read_excel(file_path)
        
        # Buscar columna de ID de paciente
        id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
        if not id_columns:
            id_columns = [col for col in df.columns if 'id' in col.lower()]
        
        if not id_columns:
            raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
        
        patient_id_col = id_columns[0]
        
        # Buscar el paciente
        patient_row = df[df[patient_id_col].astype(str) == str(patient_id)]
        if patient_row.empty:
            raise HTTPException(status_code=404, detail="Paciente no encontrado")
        
        # Preparar datos del perfil lipídico (solo las columnas específicas solicitadas)
        lipid_profile_data = {
            'Colesterol_Total_mg_dL': lipid_data.get('totalCholesterol'),
            'HDL_Colesterol_mg_dL': lipid_data.get('hdlCholesterol'),
            'LDL_Colesterol_mg_dL': lipid_data.get('ldlCholesterol'),
            'Trigliceridos_mg_dL': lipid_data.get('triglycerides'),
            'VLDL_Colesterol_mg_dL': lipid_data.get('vldlCholesterol'),
            'Glucosa_mg_dL': lipid_data.get('glucose'),
            'No_HDL_Colesterol_mg_dL': lipid_data.get('nonHdlCholesterol'),
            'Riesgo_Cardiovascular': lipid_data.get('cardiovascularRisk'),
        }
        
        
        # Asegurar que las columnas del perfil lipídico existan en el DataFrame
        for col_name in lipid_profile_data.keys():
            if col_name not in df.columns:
                df[col_name] = None  # Añadir columna vacía si no existe
        
        # Actualizar datos del paciente
        patient_index = patient_row.index[0]
        
        for col_name, value in lipid_profile_data.items():
            df.at[patient_index, col_name] = value
        
        # Guardar el archivo actualizado
        df.to_excel(file_path, index=False)
        
        # Actualizar metadatos
        db_info['last_updated'] = datetime.now().isoformat()
        db_info['lipid_profiles'] = db_info.get('lipid_profiles', 0) + 1
        
        save_metadata(metadata)
        
        return {
            "success": True, 
            "message": "Perfil lipídico guardado correctamente",
            "patient_id": patient_id,
            "database_id": database_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando perfil lipídico: {str(e)}")

def draw_form_frame(canvas, doc, x, y, width, height):
    """Dibujar un marco rectangular alrededor del formulario"""
    canvas.setStrokeColor(colors.black)
    canvas.setLineWidth(2)
    canvas.rect(x, y, width, height)

@app.get("/api/lipid-profile/download-template/{database_id}")
async def download_lipid_template(database_id: str):
    """Descargar plantilla PDF para perfil lipídico"""
    try:
        pdf_path = create_lipid_template_pdf(database_id)
        
        # Preparar respuesta
        with open(pdf_path, 'rb') as pdf_file:
            pdf_data = pdf_file.read()
        
        # Generar nombre de archivo
        filename = "plantilla de Perfil Lipidico TODO.pdf"
        
        return Response(
            content=pdf_data,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {str(e)}")

def create_lipid_template_pdf(database_id):
    """Crear PDF con plantilla de perfil lipídico para todos los pacientes usando ReportLab"""
    pdf_path = os.path.join(UPLOAD_DIR, "plantilla de Perfil Lipidico TODO.pdf")
    
    # Cargar metadatos de archivos
    metadata = load_metadata()
    
    # Buscar el archivo de la base de datos
    database_file = None
    for file_info in metadata:
        if file_info['id'] == database_id:
            database_file = file_info
            break
    
    if not database_file:
        raise HTTPException(status_code=404, detail="Base de datos no encontrada")
    
    # Cargar el archivo Excel
    file_path = database_file['file_path']
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Archivo de base de datos no encontrado")
    
    df = pd.read_excel(file_path)
    
    # Buscar columna de ID de paciente
    id_columns = [col for col in df.columns if 'id' in col.lower() and 'paciente' in col.lower()]
    if not id_columns:
        id_columns = [col for col in df.columns if 'id' in col.lower()]
    
    if not id_columns:
        raise HTTPException(status_code=400, detail="No se encontró columna de ID de paciente")
    
    patient_id_col = id_columns[0]
    
    # Obtener todos los IDs únicos
    patient_ids = df[patient_id_col].tolist()
    patient_ids = [str(id).strip() for id in patient_ids if str(id).strip() != '']
    
    if not patient_ids:
        raise HTTPException(status_code=400, detail="No se encontraron IDs válidos en el archivo")
    
    # Configuración de la página A4
    page_width, page_height = A4
    margin = 15 * mm
    
    # Dimensiones para cada formulario (uno arriba, otro abajo)
    form_width = page_width - 2 * margin
    form_height = (page_height - 6 * margin) / 2  # Dividir el espacio disponible entre 2 formularios
    
    try:
        # Crear el canvas del PDF
        c = canvas.Canvas(pdf_path, pagesize=A4)
        
        # Procesar pacientes en pares (2 por página)
        for i in range(0, len(patient_ids), 2):
            # Si no es la primera página, crear nueva página
            if i > 0:
                c.showPage()
            
            # Dibujar encabezado solo en la primera página
            if i == 0:
                draw_lipid_template_header(c, page_width, page_height)
            
            # Formulario 1 (arriba) - Paciente actual
            y1 = page_height - 3 * margin - form_height
            draw_lipid_form(c, margin, y1, form_width, form_height, i + 1, patient_ids[i])
            
            # Formulario 2 (abajo) - Siguiente paciente (si existe)
            if i + 1 < len(patient_ids):
                y2 = y1 - form_height - margin
                draw_lipid_form(c, margin, y2, form_width, form_height, i + 2, patient_ids[i + 1])
        
        # Guardar el PDF
        c.save()
        return pdf_path
        
    except Exception as e:
        raise e

def draw_lipid_template_header(canvas, page_width, page_height):
    """Dibujar encabezado de la plantilla de perfil lipídico"""
    # Configurar fuente para el encabezado
    canvas.setFont("Helvetica-Bold", 16)
    canvas.setFillColorRGB(0, 0, 0)
    
    # Título principal
    title = "Protocolo de Investigación"
    title_width = canvas.stringWidth(title, "Helvetica-Bold", 16)
    title_x = (page_width - title_width) / 2
    title_y = page_height - 20 * mm
    canvas.drawString(title_x, title_y, title)
    
    # Subtítulo
    subtitle = "Escuela Superior de Medicina"
    subtitle_width = canvas.stringWidth(subtitle, "Helvetica-Bold", 14)
    subtitle_x = (page_width - subtitle_width) / 2
    subtitle_y = page_height - 30 * mm
    canvas.setFont("Helvetica-Bold", 14)
    canvas.drawString(subtitle_x, subtitle_y, subtitle)
    
    # Nombre de la plantilla
    template_text = "Plantilla de \"Perfil Lipídico\""
    template_width = canvas.stringWidth(template_text, "Helvetica", 12)
    template_x = (page_width - template_width) / 2
    template_y = page_height - 40 * mm
    canvas.setFont("Helvetica", 12)
    canvas.drawString(template_x, template_y, template_text)
    
    # Línea separadora
    canvas.setStrokeColorRGB(0, 0, 0)
    canvas.setLineWidth(1)
    canvas.line(20 * mm, page_height - 45 * mm, page_width - 20 * mm, page_height - 45 * mm)

def draw_lipid_form(canvas, x, y, width, height, form_number, patient_id):
    """Dibujar formulario de perfil lipídico"""
    # Borde del formulario
    canvas.setStrokeColorRGB(0, 0, 0)
    canvas.setLineWidth(1)
    canvas.rect(x, y, width, height)
    
    # Título del formulario
    canvas.setFont("Helvetica-Bold", 11)
    canvas.setFillColorRGB(0, 0, 0)
    title = f"Formulario {form_number} - Perfil Lipídico"
    canvas.drawString(x + 8, y + height - 20, title)
    
    # ID del paciente
    canvas.setFont("Helvetica-Bold", 10)
    canvas.setFillColorRGB(0, 0, 0)
    patient_text = f"ID_Paciente: {patient_id}"
    canvas.drawString(x + 8, y + height - 35, patient_text)
    
    # Datos básicos
    canvas.setFont("Helvetica", 9)
    canvas.drawString(x + 8, y + height - 55, "Fecha de Nacimiento: _________________")
    canvas.drawString(x + 8, y + height - 70, "Edad: ____________________")
    canvas.drawString(x + 8, y + height - 85, "Sexo: _____M ________F")
    
    # Valores del perfil lipídico
    canvas.drawString(x + 8, y + height - 105, "Colesterol Total (mg/dL): ______________")
    canvas.drawString(x + 8, y + height - 120, "HDL Colesterol (mg/dL): ______________")
    canvas.drawString(x + 8, y + height - 135, "LDL Colesterol (mg/dL): _______________")
    canvas.drawString(x + 8, y + height - 150, "Triglicéridos (mg/dL): _________________")
    canvas.drawString(x + 8, y + height - 165, "Glucosa (mg/dL): _________________")
    
    # Valores calculados
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(x + 8, y + height - 190, "Valores Calculados:")
    canvas.setFont("Helvetica", 8)
    canvas.drawString(x + 8, y + height - 205, "VLDL Colesterol: _________________")
    canvas.drawString(x + 8, y + height - 220, "No-HDL Colesterol: _________________")
    canvas.drawString(x + 8, y + height - 235, "Relación Colesterol Total/HDL: _________________")
    canvas.drawString(x + 8, y + height - 250, "Riesgo Cardiovascular: _________________")

if __name__ == "__main__":
    import os
    import uvicorn

    # Puerto por defecto 8765: en Windows, Hyper-V/WSL suele reservar 7911–8010 (incluye 8000).
    port = int(os.environ.get("PORT", "8765"))
    uvicorn.run(app, host="0.0.0.0", port=port)
